"""Webhook management"""

import asyncio
from datetime import datetime
from typing import List, Union, Optional, TYPE_CHECKING, cast
from uuid import UUID, uuid4

import aiohttp
import backoff
from fastapi import APIRouter, Depends, HTTPException

from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .models import (
    WebhookEventType,
    WebhookNotification,
    CrawlStartedBody,
    CrawlFinishedBody,
    CrawlDeletedBody,
    UploadFinishedBody,
    UploadDeletedBody,
    CollectionItemAddedBody,
    CollectionItemRemovedBody,
    CollectionDeletedBody,
    PaginatedResponse,
    Organization,
)

if TYPE_CHECKING:
    from .orgs import OrgOps
    from .crawls import CrawlOps
else:
    OrgOps = CrawlOps = object


# ============================================================================
class EventWebhookOps:
    """Event webhook notification management"""

    # pylint: disable=invalid-name, too-many-arguments, too-many-locals

    org_ops: OrgOps
    crawl_ops: CrawlOps

    def __init__(self, mdb, org_ops):
        self.webhooks = mdb["webhooks"]
        self.colls = mdb["collections"]
        self.crawls = mdb["crawls"]

        self.org_ops = org_ops
        self.crawl_ops = cast(CrawlOps, None)

        self.origin = None

        self.router = APIRouter(
            prefix="/webhooks",
            tags=["webhooks"],
            responses={404: {"description": "Not found"}},
        )

    def set_crawl_ops(self, ops):
        """set crawl ops"""
        self.crawl_ops = ops

    async def list_notifications(
        self,
        org: Organization,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        success: Optional[bool] = None,
        event: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_direction: Optional[int] = -1,
    ):
        """List all webhook notifications"""
        # pylint: disable=duplicate-code
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        query: dict[str, object] = {"oid": org.id}

        if success in (True, False):
            query["success"] = success

        if event:
            query["event"] = event

        aggregate = [{"$match": query}]

        if sort_by:
            SORT_FIELDS = ("success", "event", "attempts", "created", "lastAttempted")
            if sort_by not in SORT_FIELDS:
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            aggregate.extend([{"$sort": {sort_by: sort_direction}}])

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
        cursor = self.webhooks.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        notifications = [WebhookNotification.from_dict(res) for res in items]

        return notifications, total

    async def get_notification(self, org: Organization, notificationid: UUID):
        """Get webhook notification by id and org"""
        query = {"_id": notificationid, "oid": org.id}

        res = await self.webhooks.find_one(query)
        if not res:
            raise HTTPException(status_code=404, detail="notification_not_found")

        return WebhookNotification.from_dict(res)

    @backoff.on_exception(
        backoff.expo,
        (aiohttp.ClientError, aiohttp.client_exceptions.ClientConnectorError),
        max_tries=5,
        max_time=60,
    )
    async def send_notification(
        self, org: Organization, notification: WebhookNotification
    ):
        """Send notification"""
        if not org.webhookUrls:
            print(
                "Webhook URLs not configured - skipping sending notification",
                flush=True,
            )
            return

        webhook_url = getattr(org.webhookUrls, notification.event)
        if not webhook_url:
            print(
                f"Webhook URL for event {notification.event} not configured, skipping",
                flush=True,
            )
            return

        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    "POST",
                    webhook_url,
                    json=notification.body.dict(),
                    raise_for_status=True,
                ):
                    await self.webhooks.find_one_and_update(
                        {"_id": notification.id},
                        {
                            "$set": {
                                "success": True,
                                "lastAttempted": datetime.utcnow(),
                            },
                            "$inc": {"attempts": 1},
                        },
                    )

        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(f"Webhook notification failed: {err}", flush=True)
            await self.webhooks.find_one_and_update(
                {"_id": notification.id},
                {"$set": {"lastAttempted": datetime.utcnow()}, "$inc": {"attempts": 1}},
            )

    async def _create_item_finished_notification(
        self,
        crawl_id: str,
        org: Organization,
        event: str,
        body: Union[CrawlFinishedBody, UploadFinishedBody],
    ):
        """Create webhook notification for finished crawl/upload."""
        crawl = await self.crawl_ops.get_crawl_out(crawl_id, org)
        if not crawl:
            print(f"Crawl {crawl_id} not found, skipping event webhook", flush=True)
            return

        body.resources = crawl.resources or []

        notification = WebhookNotification(
            id=uuid4(),
            event=event,
            oid=org.id,
            body=body,
            created=datetime.utcnow(),
        )

        await self.webhooks.insert_one(notification.to_dict())

        await self.send_notification(org, notification)

        if crawl.collectionIds:
            for coll_id in crawl.collectionIds:
                await self.create_added_to_collection_notification(
                    crawl_ids=[crawl_id], coll_id=coll_id, org=org
                )

    async def _create_deleted_notification(
        self,
        org: Organization,
        event: str,
        body: Union[CrawlDeletedBody, UploadDeletedBody, CollectionDeletedBody],
    ):
        """Create webhook notification for deleted crawl/upload/collection."""
        notification = WebhookNotification(
            id=uuid4(),
            event=event,
            oid=org.id,
            body=body,
            created=datetime.utcnow(),
        )

        await self.webhooks.insert_one(notification.to_dict())

        await self.send_notification(org, notification)

    async def create_crawl_finished_notification(
        self, crawl_id: str, oid: UUID, state: str
    ) -> None:
        """Create webhook notification for finished crawl."""
        org = await self.org_ops.get_org_by_id(oid)

        if not org.webhookUrls or not org.webhookUrls.crawlFinished:
            return

        await self._create_item_finished_notification(
            crawl_id,
            org,
            event=WebhookEventType.CRAWL_FINISHED,
            body=CrawlFinishedBody(
                itemId=crawl_id,
                orgId=str(org.id),
                state=state,
                resources=[],
            ),
        )

    async def create_crawl_deleted_notification(
        self, crawl_id: str, org: Organization
    ) -> None:
        """Create webhook notification for deleted crawl."""
        if not org.webhookUrls or not org.webhookUrls.crawlDeleted:
            return

        await self._create_deleted_notification(
            org,
            event=WebhookEventType.CRAWL_DELETED,
            body=CrawlDeletedBody(
                itemId=crawl_id,
                orgId=str(org.id),
            ),
        )

    async def create_upload_finished_notification(
        self, crawl_id: str, oid: UUID
    ) -> None:
        """Create webhook notification for finished upload."""
        org = await self.org_ops.get_org_by_id(oid)

        if not org.webhookUrls or not org.webhookUrls.uploadFinished:
            return

        await self._create_item_finished_notification(
            crawl_id,
            org,
            event=WebhookEventType.UPLOAD_FINISHED,
            body=UploadFinishedBody(
                itemId=crawl_id, orgId=str(org.id), state="complete", resources=[]
            ),
        )

    async def create_upload_deleted_notification(
        self, crawl_id: str, org: Organization
    ) -> None:
        """Create webhook notification for deleted upload."""
        if not org.webhookUrls or not org.webhookUrls.uploadDeleted:
            return

        await self._create_deleted_notification(
            org,
            event=WebhookEventType.UPLOAD_DELETED,
            body=UploadDeletedBody(itemId=crawl_id, orgId=str(org.id)),
        )

    async def create_crawl_started_notification(
        self, crawl_id: str, oid: UUID, scheduled: bool = False
    ) -> None:
        """Create webhook notification for started crawl."""
        org = await self.org_ops.get_org_by_id(oid)

        if not org.webhookUrls or not org.webhookUrls.crawlStarted:
            return

        # Check if already created this event
        existing_notification = await self.webhooks.find_one(
            {
                "event": WebhookEventType.CRAWL_STARTED,
                "body.itemId": crawl_id,
            }
        )
        if existing_notification:
            return

        notification = WebhookNotification(
            id=uuid4(),
            event=WebhookEventType.CRAWL_STARTED,
            oid=oid,
            body=CrawlStartedBody(
                itemId=crawl_id,
                orgId=str(oid),
                scheduled=scheduled,
            ),
            created=datetime.utcnow(),
        )

        await self.webhooks.insert_one(notification.to_dict())

        await self.send_notification(org, notification)

    async def _create_collection_items_modified_notification(
        self,
        coll_id: UUID,
        org: Organization,
        event: str,
        body: Union[CollectionItemAddedBody, CollectionItemRemovedBody],
    ):
        """Create webhook notification for item added/removed to collection."""
        coll_download_url = f"/api/orgs/{org.id}/collections/{coll_id}/download"
        if org.origin:
            coll_download_url = (
                f"{org.origin}/api/orgs/{org.id}/collections/{coll_id}/download"
            )

        body.downloadUrl = coll_download_url

        notification = WebhookNotification(
            id=uuid4(),
            event=event,
            oid=org.id,
            body=body,
            created=datetime.utcnow(),
        )

        await self.webhooks.insert_one(notification.to_dict())

        await self.send_notification(org, notification)

    async def create_added_to_collection_notification(
        self,
        crawl_ids: List[str],
        coll_id: UUID,
        org: Organization,
    ) -> None:
        """Create webhook notification for item added to collection"""
        if not org.webhookUrls or not org.webhookUrls.addedToCollection:
            return

        await self._create_collection_items_modified_notification(
            coll_id,
            org,
            event=WebhookEventType.ADDED_TO_COLLECTION,
            body=CollectionItemAddedBody(
                itemIds=crawl_ids,
                downloadUrl="",
                collectionId=str(coll_id),
                orgId=str(org.id),
            ),
        )

    async def create_removed_from_collection_notification(
        self,
        crawl_ids: List[str],
        coll_id: UUID,
        org: Organization,
    ) -> None:
        """Create webhook notification for item removed from collection"""
        if not org.webhookUrls or not org.webhookUrls.removedFromCollection:
            return

        await self._create_collection_items_modified_notification(
            coll_id,
            org,
            event=WebhookEventType.REMOVED_FROM_COLLECTION,
            body=CollectionItemRemovedBody(
                itemIds=crawl_ids,
                downloadUrl="",
                collectionId=str(coll_id),
                orgId=str(org.id),
            ),
        )

    async def create_collection_deleted_notification(
        self,
        coll_id: UUID,
        org: Organization,
    ) -> None:
        """Create webhook notification for item removed from collection"""
        if not org.webhookUrls or not org.webhookUrls.collectionDeleted:
            return

        await self._create_deleted_notification(
            org,
            event=WebhookEventType.REMOVED_FROM_COLLECTION,
            body=CollectionDeletedBody(
                collectionId=str(coll_id),
                orgId=str(org.id),
            ),
        )


# pylint: disable=too-many-arguments, too-many-locals, invalid-name, fixme
def init_event_webhooks_api(mdb, org_ops, app):
    """init event webhooks system"""
    # pylint: disable=invalid-name

    ops = EventWebhookOps(mdb, org_ops)

    router = ops.router

    org_owner_dep = org_ops.org_owner_dep

    @router.get("", response_model=PaginatedResponse)
    async def list_notifications(
        org: Organization = Depends(org_owner_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        success: Optional[bool] = None,
        event: Optional[str] = None,
        sortBy: Optional[str] = None,
        sortDirection: Optional[int] = -1,
    ):
        notifications, total = await ops.list_notifications(
            org,
            page_size=pageSize,
            page=page,
            success=success,
            event=event,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(notifications, total, page, pageSize)

    @router.get("/{notificationid}", response_model=WebhookNotification)
    async def get_notification(
        notificationid: UUID,
        org: Organization = Depends(org_owner_dep),
    ):
        return await ops.get_notification(org, notificationid)

    @router.post("/{notificationid}/retry")
    async def retry_notification(
        notificationid: UUID,
        org: Organization = Depends(org_owner_dep),
    ):
        notification = await ops.get_notification(org, notificationid)
        asyncio.create_task(ops.send_notification(org, notification))
        return {"success": True}

    init_openapi_webhooks(app)

    org_ops.router.include_router(router)

    return ops


def init_openapi_webhooks(app):
    """add webhooks declarations for openapi"""

    # pylint: disable=unused-argument
    @app.webhooks.post(WebhookEventType.CRAWL_STARTED)
    def crawl_started(body: CrawlStartedBody):
        """Sent when a crawl is started"""

    @app.webhooks.post(WebhookEventType.CRAWL_FINISHED)
    def crawl_finished(body: CrawlFinishedBody):
        """Sent when a crawl has finished"""

    @app.webhooks.post(WebhookEventType.CRAWL_DELETED)
    def crawl_deleted(body: CrawlDeletedBody):
        """Sent when a crawl is deleted"""

    @app.webhooks.post(WebhookEventType.UPLOAD_FINISHED)
    def upload_finished(body: UploadFinishedBody):
        """Sent when an upload has finished"""

    @app.webhooks.post(WebhookEventType.UPLOAD_DELETED)
    def upload_deleted(body: UploadDeletedBody):
        """Sent when an upload is deleted"""

    @app.webhooks.post(WebhookEventType.ADDED_TO_COLLECTION)
    def added_to_collection(body: CollectionItemAddedBody):
        """Sent when an archived item (crawl or upload)
        is added to a collection"""

    @app.webhooks.post(WebhookEventType.REMOVED_FROM_COLLECTION)
    def remove_from_collection(body: CollectionItemRemovedBody):
        """Sent when an archived item (crawl or upload)
        is removed from a collection"""

    @app.webhooks.post(WebhookEventType.COLLECTION_DELETED)
    def collection_deleted(body: CollectionDeletedBody):
        """Sent when a collection is deleted"""
