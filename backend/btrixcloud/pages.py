"""crawl pages"""

import asyncio
import traceback
from datetime import datetime
from typing import TYPE_CHECKING, Optional, Tuple, List, Dict, Any, Union
from uuid import UUID, uuid4

from fastapi import Depends, HTTPException
import pymongo

from .models import (
    Page,
    PageOut,
    PageOutWithSingleQA,
    PageReviewUpdate,
    PageQACompare,
    Organization,
    PaginatedResponse,
    User,
    PageNote,
    PageNoteIn,
    PageNoteEdit,
    PageNoteDelete,
)
from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .utils import from_k8s_date

if TYPE_CHECKING:
    from .crawls import CrawlOps
    from .orgs import OrgOps
    from .storages import StorageOps
else:
    CrawlOps = StorageOps = OrgOps = object


# ============================================================================
# pylint: disable=too-many-instance-attributes, too-many-arguments
class PageOps:
    """crawl pages"""

    crawl_ops: CrawlOps
    org_ops: OrgOps
    storage_ops: StorageOps

    def __init__(self, mdb, crawl_ops, org_ops, storage_ops):
        self.pages = mdb["pages"]
        self.crawls = mdb["crawls"]
        self.crawl_ops = crawl_ops
        self.org_ops = org_ops
        self.storage_ops = storage_ops

    async def init_index(self):
        """init index for pages db collection"""
        await self.pages.create_index([("crawl_id", pymongo.HASHED)])

    async def add_crawl_pages_to_db_from_wacz(self, crawl_id: str, batch_size=100):
        """Add pages to database from WACZ files"""
        pages_buffer: List[Page] = []
        try:
            crawl = await self.crawl_ops.get_crawl_out(crawl_id)
            stream = await self.storage_ops.sync_stream_wacz_pages(
                crawl.resources or []
            )
            for page_dict in stream:
                if not page_dict.get("url"):
                    continue

                if len(pages_buffer) > batch_size:
                    await self._add_pages_to_db(pages_buffer)

                pages_buffer.append(
                    self._get_page_from_dict(page_dict, crawl_id, crawl.oid)
                )

            # Add any remaining pages in buffer to db
            if pages_buffer:
                await self._add_pages_to_db(pages_buffer)

            print(f"Added pages for crawl {crawl_id} to db", flush=True)
        # pylint: disable=broad-exception-caught, raise-missing-from
        except Exception as err:
            traceback.print_exc()
            print(f"Error adding pages for crawl {crawl_id} to db: {err}", flush=True)

    def _get_page_from_dict(self, page_dict: Dict[str, Any], crawl_id: str, oid: UUID):
        """Return Page object from dict"""
        page_id = page_dict.get("id")
        if not page_id:
            print(f'Page {page_dict.get("url")} has no id - assigning UUID', flush=True)

        status = page_dict.get("status")
        if not status and page_dict.get("loadState"):
            status = 200

        return Page(
            id=page_id,
            oid=oid,
            crawl_id=crawl_id,
            url=page_dict.get("url"),
            title=page_dict.get("title"),
            loadState=page_dict.get("loadState"),
            status=status,
            ts=(
                from_k8s_date(page_dict.get("ts"))
                if page_dict.get("ts")
                else datetime.now()
            ),
        )

    async def _add_pages_to_db(self, pages: List[Page]):
        """Add batch of pages to db in one insert"""
        result = await self.pages.insert_many(
            [
                page.to_dict(
                    exclude_unset=True, exclude_none=True, exclude_defaults=True
                )
                for page in pages
            ]
        )
        if not result.inserted_ids:
            # pylint: disable=broad-exception-raised
            raise Exception("No pages inserted")

    async def add_page_to_db(
        self,
        page_dict: Dict[str, Any],
        crawl_id: str,
        qa_run_id: Optional[str],
        oid: UUID,
    ):
        """Add page to database"""
        page = self._get_page_from_dict(page_dict, crawl_id, oid)

        try:
            await self.pages.insert_one(
                page.to_dict(
                    exclude_unset=True, exclude_none=True, exclude_defaults=True
                )
            )
        except pymongo.errors.DuplicateKeyError:
            pass

        # pylint: disable=broad-except
        except Exception as err:
            print(
                f"Error adding page {page.id} from crawl {crawl_id} to db: {err}",
                flush=True,
            )
            return

        # qa data
        if qa_run_id and page:
            compare_dict = page_dict.get("comparison")
            if compare_dict is None:
                print("QA Run, but compare data missing!")
                return

            compare = PageQACompare(**compare_dict)
            print("Adding QA Run Data for Page", page_dict.get("url"), compare)

            await self.add_qa_run_for_page(page.id, oid, qa_run_id, compare)

    async def delete_crawl_pages(self, crawl_id: str, oid: Optional[UUID] = None):
        """Delete crawl pages from db"""
        query: Dict[str, Union[str, UUID]] = {"crawl_id": crawl_id}
        if oid:
            query["oid"] = oid
        try:
            await self.pages.delete_many(query)
        # pylint: disable=broad-except
        except Exception as err:
            print(
                f"Error deleting pages from crawl {crawl_id}: {err}",
                flush=True,
            )

    async def get_page_raw(
        self,
        page_id: UUID,
        oid: UUID,
        crawl_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Return page dict by id"""
        query: Dict[str, Union[str, UUID]] = {"_id": page_id, "oid": oid}
        if crawl_id:
            query["crawl_id"] = crawl_id

        page = await self.pages.find_one(query)
        if not page:
            raise HTTPException(status_code=404, detail="page_not_found")
        return page

    async def get_page(
        self,
        page_id: UUID,
        oid: UUID,
        crawl_id: Optional[str] = None,
    ) -> Page:
        """Return Page object by id"""
        page_raw = await self.get_page_raw(page_id, oid, crawl_id)
        return Page.from_dict(page_raw)

    async def add_qa_run_for_page(
        self, page_id: UUID, oid: UUID, qa_run_id: str, compare: PageQACompare
    ) -> bool:
        """Update page heuristics and mime/type from QA run"""

        # modified = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        result = await self.pages.find_one_and_update(
            {"_id": page_id, "oid": oid},
            {"$set": {f"qa.{qa_run_id}": compare.dict()}},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail="page_not_found")

        return True

    async def delete_qa_run_from_pages(self, crawl_id: str, qa_run_id: str):
        """delete pages"""
        result = await self.pages.update_many(
            {"crawl_id": crawl_id}, {"$unset": {f"qa.{qa_run_id}": ""}}
        )
        return result

    async def update_page_approval(
        self,
        page_id: UUID,
        oid: UUID,
        approved: Optional[bool] = None,
        crawl_id: Optional[str] = None,
        user: Optional[User] = None,
    ) -> Dict[str, bool]:
        """Update page manual review"""
        query: Dict[str, Union[Optional[bool], str, datetime, UUID]] = {
            "approved": approved
        }
        query["modified"] = datetime.utcnow().replace(microsecond=0, tzinfo=None)
        if user:
            query["userid"] = user.id

        result = await self.pages.find_one_and_update(
            {"_id": page_id, "oid": oid, "crawl_id": crawl_id},
            {"$set": query},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail="page_not_found")

        return {"updated": True}

    async def add_page_note(
        self,
        page_id: UUID,
        oid: UUID,
        text: str,
        user: User,
        crawl_id: str,
    ) -> Dict[str, bool]:
        """Add note to page"""
        note = PageNote(id=uuid4(), text=text, userid=user.id, userName=user.name)

        modified = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        result = await self.pages.find_one_and_update(
            {"_id": page_id, "oid": oid, "crawl_id": crawl_id},
            {
                "$push": {"notes": note.dict()},
                "$set": {"modified": modified},
            },
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail="page_not_found")

        return {"added": True}

    async def update_page_note(
        self,
        page_id: UUID,
        oid: UUID,
        note_in: PageNoteEdit,
        user: User,
        crawl_id: str,
    ) -> Dict[str, bool]:
        """Update specific page note"""
        page = await self.get_page_raw(page_id, oid)
        page_notes = page.get("notes", [])

        try:
            matching_index = [
                index
                for index, note in enumerate(page_notes)
                if note["id"] == note_in.id
            ][0]

        except IndexError:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=404, detail="page_note_not_found")

        new_note = PageNote(
            id=note_in.id, text=note_in.text, userid=user.id, userName=user.name
        )
        page_notes[matching_index] = new_note.dict()

        modified = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        result = await self.pages.find_one_and_update(
            {"_id": page_id, "oid": oid, "crawl_id": crawl_id},
            {"$set": {"notes": page_notes, "modified": modified}},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail="page_not_found")

        return {"updated": True}

    async def delete_page_notes(
        self,
        page_id: UUID,
        oid: UUID,
        delete: PageNoteDelete,
        crawl_id: str,
    ) -> Dict[str, bool]:
        """Delete specific page notes"""
        page = await self.get_page_raw(page_id, oid)
        page_notes = page.get("notes", [])

        remaining_notes = []
        for note in page_notes:
            if not note.get("id") in delete.delete_list:
                remaining_notes.append(note)

        modified = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        result = await self.pages.find_one_and_update(
            {"_id": page_id, "oid": oid, "crawl_id": crawl_id},
            {"$set": {"notes": remaining_notes, "modified": modified}},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail="page_not_found")

        return {"deleted": True}

    async def list_pages(
        self,
        crawl_id: str,
        org: Optional[Organization] = None,
        qa_run_id: Optional[str] = None,
        qa_filter_by: Optional[str] = None,
        qa_gte: Optional[float] = None,
        qa_gt: Optional[float] = None,
        qa_lte: Optional[float] = None,
        qa_lt: Optional[float] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: Optional[str] = None,
        sort_direction: Optional[int] = -1,
    ) -> Tuple[Union[List[PageOut], List[PageOutWithSingleQA]], int]:
        """List all pages in crawl"""
        # pylint: disable=duplicate-code, too-many-locals, too-many-branches
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        query: dict[str, object] = {
            "crawl_id": crawl_id,
        }
        if org:
            query["oid"] = org.id

        if qa_run_id:
            query[f"qa.{qa_run_id}"] = {"$exists": True}

            range_filter = {}

            if qa_gte:
                range_filter["$gte"] = qa_gte
            if qa_lte:
                range_filter["$lte"] = qa_lte
            if qa_gt:
                range_filter["$gt"] = qa_gt
            if qa_lt:
                range_filter["$lt"] = qa_lt

            if qa_filter_by:
                if not range_filter:
                    raise HTTPException(status_code=400, detail="range_missing")

                query[f"qa.{qa_run_id}.{qa_filter_by}"] = range_filter

        aggregate = [{"$match": query}]

        if sort_by:
            # Sorting options to add:
            # - automated heuristics like screenshot_comparison (dict keyed by QA run id)
            # - Ensure notes sorting works okay with notes in list
            sort_fields = ("url", "title", "notes", "approved")
            qa_sort_fields = ("screenshotMatch", "textMatch")
            if sort_by not in sort_fields and sort_by not in qa_sort_fields:
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            if sort_by in qa_sort_fields:
                if not qa_run_id:
                    raise HTTPException(
                        status_code=400, detail="qa_run_id_missing_for_qa_sort"
                    )

                sort_by = f"qa.{qa_run_id}.{sort_by}"

            aggregate.extend([{"$sort": {sort_by: sort_direction}}])

        if qa_run_id:
            aggregate.extend([{"$set": {"qa": f"$qa.{qa_run_id}"}}])
            # aggregate.extend([{"$project": {"qa": f"$qa.{qa_run_id}"}}])

        aggregate.extend(
            [
                {
                    "$facet": {
                        "items": [
                            {"$skip": skip},
                            {"$limit": page_size},
                        ],
                        "total": [{"$count": "count"}],
                    }
                },
            ]
        )

        # Get total
        cursor = self.pages.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        if qa_run_id:
            return [PageOutWithSingleQA.from_dict(data) for data in items], total

        return [PageOut.from_dict(data) for data in items], total

    async def re_add_crawl_pages(self, crawl_id: str, oid: UUID):
        """Delete existing pages for crawl and re-add from WACZs."""
        await self.delete_crawl_pages(crawl_id, oid)
        print(f"Deleted pages for crawl {crawl_id}", flush=True)
        await self.add_crawl_pages_to_db_from_wacz(crawl_id)

    async def re_add_all_crawl_pages(self, oid: UUID):
        """Re-add pages for all crawls in org"""
        crawl_ids = await self.crawls.distinct(
            "_id", {"type": "crawl", "finished": {"$ne": None}}
        )
        for crawl_id in crawl_ids:
            await self.re_add_crawl_pages(crawl_id, oid)


# ============================================================================
# pylint: disable=too-many-arguments, too-many-locals, invalid-name, fixme
def init_pages_api(app, mdb, crawl_ops, org_ops, storage_ops, user_dep):
    """init pages API"""
    # pylint: disable=invalid-name

    ops = PageOps(mdb, crawl_ops, org_ops, storage_ops)

    org_crawl_dep = org_ops.org_crawl_dep

    @app.post("/orgs/{oid}/crawls/all/pages/reAdd", tags=["pages"])
    async def re_add_all_crawl_pages(
        org: Organization = Depends(org_crawl_dep), user: User = Depends(user_dep)
    ):
        """Re-add pages for all crawls in org (superuser only)"""
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        asyncio.create_task(ops.re_add_all_crawl_pages(org.id))
        return {"started": True}

    @app.post("/orgs/{oid}/crawls/{crawl_id}/pages/reAdd", tags=["pages"])
    async def re_add_crawl_pages(
        crawl_id: str, org: Organization = Depends(org_crawl_dep)
    ):
        """Re-add pages for crawl"""
        asyncio.create_task(ops.re_add_crawl_pages(crawl_id, org.id))
        return {"started": True}

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/pages/{page_id}",
        tags=["pages"],
        response_model=Page,
    )
    async def get_page(
        crawl_id: str,
        page_id: UUID,
        org: Organization = Depends(org_crawl_dep),
    ):
        """GET single page"""
        return await ops.get_page(page_id, org.id, crawl_id)

    @app.patch(
        "/orgs/{oid}/crawls/{crawl_id}/pages/{page_id}",
        tags=["pages"],
    )
    async def update_page_approval(
        crawl_id: str,
        page_id: UUID,
        update: PageReviewUpdate,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        """Update review for specific page"""
        return await ops.update_page_approval(
            page_id, org.id, update.approved, crawl_id, user
        )

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/pages/{page_id}/notes",
        tags=["pages"],
    )
    async def add_page_note(
        crawl_id: str,
        page_id: UUID,
        note: PageNoteIn,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        """Add note to page"""
        return await ops.add_page_note(page_id, org.id, note.text, user, crawl_id)

    @app.patch(
        "/orgs/{oid}/crawls/{crawl_id}/pages/{page_id}/notes",
        tags=["pages"],
    )
    async def edit_page_note(
        crawl_id: str,
        page_id: UUID,
        note: PageNoteEdit,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        """Edit page note"""
        return await ops.update_page_note(page_id, org.id, note, user, crawl_id)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/pages/{page_id}/notes/delete",
        tags=["pages"],
    )
    async def delete_page_notes(
        crawl_id: str,
        page_id: UUID,
        delete: PageNoteDelete,
        org: Organization = Depends(org_crawl_dep),
    ):
        """Edit page note"""
        return await ops.delete_page_notes(page_id, org.id, delete, crawl_id)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/pages",
        tags=["pages"],
        response_model=PaginatedResponse,
    )
    async def get_pages_list(
        crawl_id: str,
        org: Organization = Depends(org_crawl_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: Optional[str] = None,
        sortDirection: Optional[int] = -1,
    ):
        """Retrieve paginated list of pages"""
        pages, total = await ops.list_pages(
            crawl_id=crawl_id,
            org=org,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(pages, total, page, pageSize)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/qa/{qa_run_id}/pages",
        tags=["pages", "qa"],
        response_model=PaginatedResponse,
    )
    async def get_pages_list_with_qa(
        crawl_id: str,
        qa_run_id: str,
        filterQABy: Optional[str] = None,
        gte: Optional[float] = None,
        gt: Optional[float] = None,
        lte: Optional[float] = None,
        lt: Optional[float] = None,
        org: Organization = Depends(org_crawl_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: Optional[str] = None,
        sortDirection: Optional[int] = -1,
    ):
        """Retrieve paginated list of pages"""
        pages, total = await ops.list_pages(
            crawl_id=crawl_id,
            org=org,
            qa_run_id=qa_run_id,
            qa_filter_by=filterQABy,
            qa_gte=gte,
            qa_gt=gt,
            qa_lte=lte,
            qa_lt=lt,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(pages, total, page, pageSize)

    return ops
