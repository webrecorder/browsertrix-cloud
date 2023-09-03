"""
Crawl Config API handling
"""
# pylint: disable=too-many-lines

from typing import List, Union, Optional

import uuid
import asyncio
import re
import os
from datetime import datetime
import urllib.parse
from pprint import pprint

import pymongo
from pydantic import UUID4
from fastapi import APIRouter, Depends, HTTPException, Query

from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .models import (
    CrawlConfigIn,
    ConfigRevision,
    CrawlConfig,
    CrawlConfigOut,
    CrawlConfigIdNameOut,
    UpdateCrawlConfig,
    Organization,
    User,
    PaginatedResponse,
)


ALLOWED_SORT_KEYS = (
    "created",
    "modified",
    "firstSeed",
    "lastCrawlTime",
    "lastCrawlStartTime",
    "lastRun",
    "name",
)


# ============================================================================
class CrawlConfigOps:
    """Crawl Config Operations"""

    # pylint: disable=too-many-arguments, too-many-instance-attributes, too-many-public-methods

    def __init__(
        self,
        dbclient,
        mdb,
        user_manager,
        org_ops,
        crawl_manager,
        profiles,
    ):
        self.dbclient = dbclient
        self.mdb = mdb
        self.crawls = mdb["crawls"]
        self.crawl_configs = mdb["crawl_configs"]
        self.config_revs = mdb["configs_revs"]
        self.user_manager = user_manager
        self.org_ops = org_ops
        self.crawl_manager = crawl_manager
        self.profiles = profiles
        self.profiles.set_crawlconfigs(self)
        self.crawl_ops = None
        self.default_filename_template = os.environ["DEFAULT_CRAWL_FILENAME_TEMPLATE"]

        self.router = APIRouter(
            prefix="/crawlconfigs",
            tags=["crawlconfigs"],
            responses={404: {"description": "Not found"}},
        )

        self.coll_ops = None
        self._file_rx = re.compile("\\W+")

    def set_crawl_ops(self, ops):
        """set crawl ops reference"""
        self.crawl_ops = ops

    async def init_index(self):
        """init index for crawlconfigs db collection"""
        await self.crawl_configs.create_index(
            [("oid", pymongo.HASHED), ("inactive", pymongo.ASCENDING)]
        )

        # OID ascending instead of hashed here because hashed indices
        # don't allow arrays
        await self.crawl_configs.create_index(
            [
                ("oid", pymongo.ASCENDING),
                ("inactive", pymongo.ASCENDING),
                ("tags", pymongo.ASCENDING),
            ]
        )

        await self.crawl_configs.create_index(
            [
                ("oid", pymongo.HASHED),
                ("inactive", pymongo.ASCENDING),
                ("lastRun", pymongo.DESCENDING),
                ("modified", pymongo.DESCENDING),
            ]
        )

        await self.crawl_configs.create_index(
            [
                ("oid", pymongo.HASHED),
                ("inactive", pymongo.ASCENDING),
                ("name", pymongo.ASCENDING),
                ("firstSeed", pymongo.ASCENDING),
            ]
        )

        await self.config_revs.create_index(
            [
                ("oid", pymongo.HASHED),
                ("inactive", pymongo.ASCENDING),
                ("cid", pymongo.ASCENDING),
            ]
        )

        await self.config_revs.create_index(
            [
                ("oid", pymongo.HASHED),
                ("inactive", pymongo.ASCENDING),
                ("cid", pymongo.ASCENDING),
                ("rev", pymongo.ASCENDING),
            ]
        )

        await self.config_revs.create_index(
            [
                ("oid", pymongo.HASHED),
                ("inactive", pymongo.ASCENDING),
                ("lastCrawlTime", pymongo.DESCENDING),
                ("modified", pymongo.DESCENDING),
            ]
        )

        await self.config_revs.create_index(
            [
                ("oid", pymongo.HASHED),
                ("inactive", pymongo.ASCENDING),
                ("lastCrawlStartTime", pymongo.DESCENDING),
                ("modified", pymongo.DESCENDING),
            ]
        )

        await self.config_revs.create_index(
            [
                ("oid", pymongo.HASHED),
                ("inactive", pymongo.ASCENDING),
                ("modified", pymongo.DESCENDING),
            ]
        )

        await self.config_revs.create_index(
            [
                ("oid", pymongo.HASHED),
                ("inactive", pymongo.ASCENDING),
                ("created", pymongo.DESCENDING),
            ]
        )

    def set_coll_ops(self, coll_ops):
        """set collection ops"""
        self.coll_ops = coll_ops

    def sanitize(self, string=""):
        """sanitize string for use in wacz filename"""
        return self._file_rx.sub("-", string.lower())

    async def _lookup_profile(self, profileid, org):
        if profileid is None:
            return None, None

        if profileid == "":
            return None, ""

        profileid = uuid.UUID(profileid)
        profile_filename = await self.profiles.get_profile_storage_path(profileid, org)
        if not profile_filename:
            raise HTTPException(status_code=400, detail="invalid_profile_id")

        return profileid, profile_filename

    async def add_crawl_config(
        self,
        config: CrawlConfigIn,
        org: Organization,
        user: User,
    ):
        """Add new crawl config"""

        data = config.dict()
        data["oid"] = org.id
        data["createdBy"] = user.id
        data["modifiedBy"] = user.id
        data["_id"] = uuid.uuid4()
        data["created"] = datetime.utcnow().replace(microsecond=0, tzinfo=None)
        data["modified"] = data["created"]

        # Ensure page limit is below org maxPagesPerCall if set
        max_pages = await self.org_ops.get_max_pages_per_crawl(org)
        if max_pages > 0:
            data["config"]["limit"] = max_pages

        data["profileid"], profile_filename = await self._lookup_profile(
            config.profileid, org
        )

        if config.autoAddCollections:
            data["autoAddCollections"] = config.autoAddCollections

        result = await self.crawl_configs.insert_one(data)

        crawlconfig = CrawlConfig.from_dict(data)

        out_filename = (
            data.get("crawlFilenameTemplate") or self.default_filename_template
        )

        crawl_id = await self.crawl_manager.add_crawl_config(
            crawlconfig=crawlconfig,
            storage=org.storage,
            run_now=config.runNow,
            out_filename=out_filename,
            profile_filename=profile_filename,
        )

        if crawl_id and config.runNow:
            await self.add_new_crawl(crawl_id, crawlconfig, user)

        return result.inserted_id, crawl_id

    async def add_new_crawl(self, crawl_id: str, crawlconfig: CrawlConfig, user: User):
        """increments crawl count for this config and adds new crawl"""
        inc = inc_crawl_count(self.crawl_configs, crawlconfig.id)
        add = self.crawl_ops.add_new_crawl(crawl_id, crawlconfig, user)
        await asyncio.gather(inc, add)

    def check_attr_changed(
        self, crawlconfig: CrawlConfig, update: UpdateCrawlConfig, attr_name: str
    ):
        """check if attribute is set and has changed. if not changed, clear it on the update"""
        if getattr(update, attr_name) is not None:
            if getattr(update, attr_name) != getattr(crawlconfig, attr_name):
                return True

        return False

    async def update_crawl_config(
        self, cid: uuid.UUID, org: Organization, user: User, update: UpdateCrawlConfig
    ):
        """Update name, scale, schedule, and/or tags for an existing crawl config"""

        orig_crawl_config = await self.get_crawl_config(cid, org)
        if not orig_crawl_config:
            raise HTTPException(status_code=400, detail="config_not_found")

        # indicates if any k8s crawl config settings changed
        changed = False
        changed = changed or (
            self.check_attr_changed(orig_crawl_config, update, "config")
        )
        changed = changed or (
            self.check_attr_changed(orig_crawl_config, update, "crawlTimeout")
        )
        changed = changed or (
            self.check_attr_changed(orig_crawl_config, update, "maxCrawlSize")
        )
        changed = changed or (
            self.check_attr_changed(orig_crawl_config, update, "crawlFilenameTemplate")
        )
        changed = changed or (
            self.check_attr_changed(orig_crawl_config, update, "schedule")
        )
        changed = changed or self.check_attr_changed(orig_crawl_config, update, "scale")

        changed = changed or (
            update.profileid is not None
            and update.profileid != orig_crawl_config.profileid
            and ((not update.profileid) != (not orig_crawl_config.profileid))
        )

        metadata_changed = self.check_attr_changed(orig_crawl_config, update, "name")
        metadata_changed = metadata_changed or self.check_attr_changed(
            orig_crawl_config, update, "description"
        )
        metadata_changed = metadata_changed or (
            update.tags is not None
            and ",".join(orig_crawl_config.tags) != ",".join(update.tags)
        )
        metadata_changed = metadata_changed or (
            update.autoAddCollections is not None
            and sorted(orig_crawl_config.autoAddCollections)
            != sorted(update.autoAddCollections)
        )

        if not changed and not metadata_changed:
            return {
                "updated": True,
                "settings_changed": changed,
                "metadata_changed": metadata_changed,
            }

        if changed:
            orig_dict = orig_crawl_config.dict(exclude_unset=True, exclude_none=True)
            orig_dict["cid"] = orig_dict.pop("id", cid)
            orig_dict["id"] = uuid.uuid4()

            last_rev = ConfigRevision(**orig_dict)
            last_rev = await self.config_revs.insert_one(last_rev.to_dict())

        # set update query
        query = update.dict(exclude_unset=True)
        query["modifiedBy"] = user.id
        query["modified"] = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        query["profileid"], profile_filename = await self._lookup_profile(
            update.profileid, org
        )

        if update.config is not None:
            query["config"] = update.config.dict()

        # update in db
        result = await self.crawl_configs.find_one_and_update(
            {"_id": cid, "inactive": {"$ne": True}},
            {"$set": query, "$inc": {"rev": 1}},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(
                status_code=404, detail=f"Crawl Config '{cid}' not found"
            )

        # update in crawl manager if config, schedule, scale, maxCrawlSize or crawlTimeout changed
        if changed:
            crawlconfig = CrawlConfig.from_dict(result)
            try:
                await self.crawl_manager.update_crawl_config(
                    crawlconfig, update, profile_filename
                )
            except Exception as exc:
                print(exc, flush=True)
                # pylint: disable=raise-missing-from
                raise HTTPException(
                    status_code=404, detail=f"Crawl Config '{cid}' not found"
                )

        return {
            "updated": True,
            "settings_changed": changed,
            "metadata_changed": metadata_changed,
        }

    async def get_crawl_configs(
        self,
        org: Organization,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        created_by: uuid.UUID = None,
        modified_by: uuid.UUID = None,
        first_seed: str = None,
        name: str = None,
        description: str = None,
        tags: Optional[List[str]] = None,
        schedule: Optional[bool] = None,
        sort_by: str = "lastRun",
        sort_direction: int = -1,
    ):
        """Get all crawl configs for an organization is a member of"""
        # pylint: disable=too-many-locals,too-many-branches
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        match_query = {"oid": org.id, "inactive": {"$ne": True}}

        if tags:
            match_query["tags"] = {"$all": tags}

        if created_by:
            match_query["createdBy"] = created_by

        if modified_by:
            match_query["modifiedBy"] = modified_by

        if name:
            match_query["name"] = name

        if description:
            match_query["description"] = description

        if schedule is not None:
            if schedule:
                match_query["schedule"] = {"$nin": ["", None]}
            else:
                match_query["schedule"] = {"$in": ["", None]}

        # pylint: disable=duplicate-code
        aggregate = [
            {"$match": match_query},
            {"$set": {"firstSeedObject": {"$arrayElemAt": ["$config.seeds", 0]}}},
            # Set firstSeed
            {"$set": {"firstSeed": "$firstSeedObject.url"}},
            {"$unset": ["firstSeedObject"]},
        ]

        if first_seed:
            aggregate.extend([{"$match": {"firstSeed": first_seed}}])

        if sort_by:
            if sort_by not in ALLOWED_SORT_KEYS:
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            sort_query = {sort_by: sort_direction}

            # add secondary sort keys:
            # firstSeed for name
            if sort_by == "name":
                sort_query["firstSeed"] = sort_direction

            # modified for last* fields in case crawl hasn't been run yet
            elif sort_by in ("lastRun", "lastCrawlTime", "lastCrawlStartTime"):
                sort_query["modified"] = sort_direction

            aggregate.extend([{"$sort": sort_query}])

        aggregate.extend(
            [
                {
                    "$lookup": {
                        "from": "users",
                        "localField": "createdBy",
                        "foreignField": "id",
                        "as": "userName",
                    },
                },
                {"$set": {"createdByName": {"$arrayElemAt": ["$userName.name", 0]}}},
                {
                    "$lookup": {
                        "from": "users",
                        "localField": "lastStartedBy",
                        "foreignField": "id",
                        "as": "startedName",
                    },
                },
                {
                    "$set": {
                        "lastStartedByName": {"$arrayElemAt": ["$startedName.name", 0]}
                    }
                },
                {
                    "$lookup": {
                        "from": "users",
                        "localField": "modifiedBy",
                        "foreignField": "id",
                        "as": "modifiedUserName",
                    },
                },
                {
                    "$set": {
                        "modifiedByName": {
                            "$arrayElemAt": ["$modifiedUserName.name", 0]
                        }
                    }
                },
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

        cursor = self.crawl_configs.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        if os.environ.get("INDEX_DEV_LOGGING", "false") == "true":
            explain_output = await self.mdb.command(
                "aggregate",
                "crawl_configs",
                pipeline=aggregate,
                explain=True,
            )
            pprint(explain_output)

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        configs = []
        for res in items:
            config = CrawlConfigOut.from_dict(res)
            # pylint: disable=invalid-name
            if not config.inactive:
                self._add_curr_crawl_stats(config, await self.get_running_crawl(config))
            configs.append(config)

        return configs, total

    async def get_crawl_config_ids_for_profile(
        self, profileid: uuid.UUID, org: Optional[Organization] = None
    ):
        """Return all crawl configs that are associated with a given profileid"""
        query = {"profileid": profileid, "inactive": {"$ne": True}}
        if org:
            query["oid"] = org.id

        cursor = self.crawl_configs.find(query, projection=["_id", "name"])
        results = await cursor.to_list(length=1000)
        results = [CrawlConfigIdNameOut.from_dict(res) for res in results]
        return results

    async def get_running_crawl(self, crawlconfig: CrawlConfig):
        """Return the id of currently running crawl for this config, if any"""
        # crawls = await self.crawl_manager.list_running_crawls(cid=crawlconfig.id)
        crawls, _ = await self.crawl_ops.list_crawls(
            cid=crawlconfig.id, running_only=True
        )

        if len(crawls) == 1:
            return crawls[0]

        return None

    async def stats_recompute_remove_crawl(self, cid: uuid.UUID, size: int):
        """Update last crawl, crawl count and total size by removing size of last crawl"""
        result = await stats_recompute_last(
            self.crawl_configs, self.crawls, cid, -size, -1
        )
        if not result:
            raise HTTPException(
                status_code=404, detail=f"Crawl Config '{cid}' not found to update"
            )

    def _add_curr_crawl_stats(self, crawlconfig, crawl):
        """Add stats from current running crawl, if any"""
        if not crawl:
            return

        crawlconfig.lastCrawlState = crawl.state
        crawlconfig.lastCrawlSize = crawl.stats.get("size", 0) if crawl.stats else 0
        crawlconfig.lastCrawlStopping = crawl.stopping

    async def get_crawl_config_out(self, cid: uuid.UUID, org: Organization):
        """Return CrawlConfigOut, including state of currently running crawl, if active
        also include inactive crawl configs"""

        crawlconfig = await self.get_crawl_config(
            cid, org, active_only=False, config_cls=CrawlConfigOut
        )
        if not crawlconfig:
            raise HTTPException(
                status_code=404, detail=f"Crawl Config '{cid}' not found"
            )

        if not crawlconfig.inactive:
            self._add_curr_crawl_stats(
                crawlconfig, await self.get_running_crawl(crawlconfig)
            )

        user = await self.user_manager.get(crawlconfig.createdBy)
        # pylint: disable=invalid-name
        if user:
            crawlconfig.createdByName = user.name

        modified_user = await self.user_manager.get(crawlconfig.modifiedBy)
        # pylint: disable=invalid-name
        if modified_user:
            crawlconfig.modifiedByName = modified_user.name

        if crawlconfig.lastStartedBy:
            last_started_user = await self.user_manager.get(crawlconfig.lastStartedBy)
            # pylint: disable=invalid-name
            if last_started_user:
                crawlconfig.lastStartedByName = last_started_user.name

        if crawlconfig.profileid:
            crawlconfig.profileName = await self.profiles.get_profile_name(
                crawlconfig.profileid, org
            )

        return crawlconfig

    async def get_crawl_config(
        self,
        cid: uuid.UUID,
        org: Optional[Organization],
        active_only: bool = True,
        config_cls=CrawlConfig,
    ):
        """Get crawl config by id"""
        oid = org.id if org else None
        return await get_crawl_config(
            self.crawl_configs, cid, oid, active_only, config_cls
        )

    async def get_crawl_config_revs(
        self, cid: uuid.UUID, page_size: int = DEFAULT_PAGE_SIZE, page: int = 1
    ):
        """return all config revisions for crawlconfig"""
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        match_query = {"cid": cid}

        total = await self.config_revs.count_documents(match_query)

        cursor = self.config_revs.find({"cid": cid}, skip=skip, limit=page_size)
        results = await cursor.to_list(length=1000)
        revisions = [ConfigRevision.from_dict(res) for res in results]

        return revisions, total

    async def make_inactive_or_delete(
        self,
        crawlconfig: CrawlConfig,
    ):
        """Make config inactive if crawls exist, otherwise move to inactive list"""

        query = {"inactive": True}

        is_running = await self.get_running_crawl(crawlconfig) is not None

        if is_running:
            raise HTTPException(status_code=400, detail="crawl_running_cant_deactivate")

        # set to either "deleted" or "deactivated"
        status = None

        # if no crawls have been run, actually delete
        if not crawlconfig.crawlAttemptCount:
            result = await self.crawl_configs.delete_one(
                {"_id": crawlconfig.id, "oid": crawlconfig.oid}
            )

            if result.deleted_count != 1:
                raise HTTPException(status_code=404, detail="failed_to_delete")

            status = "deleted"

        else:
            if not await self.crawl_configs.find_one_and_update(
                {"_id": crawlconfig.id, "inactive": {"$ne": True}},
                {"$set": query},
            ):
                raise HTTPException(status_code=404, detail="failed_to_deactivate")

            status = "deactivated"

        # delete from crawl manager, but not from db
        await self.crawl_manager.delete_crawl_config_by_id(crawlconfig.id)

        return status

    async def do_make_inactive(self, crawlconfig: CrawlConfig):
        """perform make_inactive in a transaction"""

        async with await self.dbclient.start_session() as sesh:
            async with sesh.start_transaction():
                status = await self.make_inactive_or_delete(crawlconfig)

        return {"success": True, "status": status}

    async def add_or_remove_exclusion(self, regex, cid, org, user, add=True):
        """added or remove regex to crawl config"""
        # get crawl config
        crawl_config = await self.get_crawl_config(cid, org, active_only=False)

        # update exclusion
        exclude = crawl_config.config.exclude or []
        if isinstance(exclude, str):
            exclude = [exclude]

        if add:
            if regex in exclude:
                raise HTTPException(status_code=400, detail="exclusion_already_exists")

            exclude.append(regex)
        else:
            if regex not in exclude:
                raise HTTPException(status_code=400, detail="exclusion_not_found")

            exclude.remove(regex)

        crawl_config.config.exclude = exclude

        update_config = UpdateCrawlConfig(config=crawl_config.config)

        await self.update_crawl_config(cid, org, user, update_config)

        return crawl_config.config

    async def get_crawl_config_tags(self, org):
        """get distinct tags from all crawl configs for this org"""
        return await self.crawl_configs.distinct("tags", {"oid": org.id})

    async def get_crawl_config_search_values(self, org):
        """List unique names, first seeds, and descriptions from all workflows in org"""
        names = await self.crawl_configs.distinct("name", {"oid": org.id})
        descriptions = await self.crawl_configs.distinct("description", {"oid": org.id})
        workflow_ids = await self.crawl_configs.distinct("_id", {"oid": org.id})

        # Remove empty strings
        names = [name for name in names if name]
        descriptions = [description for description in descriptions if description]

        first_seeds = set()
        configs = [config async for config in self.crawl_configs.find({"oid": org.id})]
        for config in configs:
            first_seed = config["config"]["seeds"][0]["url"]
            first_seeds.add(first_seed)

        return {
            "names": names,
            "descriptions": descriptions,
            "firstSeeds": list(first_seeds),
            "workflowIds": workflow_ids,
        }

    async def run_now(self, cid: str, org: Organization, user: User):
        """run specified crawlconfig now"""
        crawlconfig = await self.get_crawl_config(uuid.UUID(cid), org)

        if not crawlconfig:
            raise HTTPException(
                status_code=404, detail=f"Crawl Config '{cid}' not found"
            )

        if await self.get_running_crawl(crawlconfig):
            raise HTTPException(status_code=400, detail="crawl_already_running")

        crawl_id = None

        # ensure crawlconfig exists
        try:
            await self.crawl_manager.get_configmap(crawlconfig.id)
        except:
            # pylint: disable=broad-exception-raised,raise-missing-from
            raise HTTPException(
                status_code=404,
                detail=f"crawl-config-{cid} missing, can not start crawl",
            )

        try:
            crawl_id = await self.crawl_manager.create_crawl_job(
                crawlconfig, userid=str(user.id)
            )
            await self.add_new_crawl(crawl_id, crawlconfig, user)
            return crawl_id

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=500, detail=f"Error starting crawl: {exc}")


# ============================================================================
async def get_crawl_config(
    crawl_configs,
    cid: uuid.UUID,
    oid: Optional[uuid.UUID] = None,
    active_only: bool = True,
    config_cls=CrawlConfig,
):
    """Get crawl config by id"""
    query = {"_id": cid}
    if oid:
        query["oid"] = oid
    if active_only:
        query["inactive"] = {"$ne": True}

    res = await crawl_configs.find_one(query)
    return config_cls.from_dict(res)


# ============================================================================
async def inc_crawl_count(crawl_configs, cid: uuid.UUID):
    """inc crawl count for config"""
    await crawl_configs.find_one_and_update(
        {"_id": cid, "inactive": {"$ne": True}},
        {"$inc": {"crawlAttemptCount": 1}},
    )


# ============================================================================
async def set_config_current_crawl_info(
    crawl_configs, cid: uuid.UUID, crawl_id: str, crawl_start: datetime
):
    """Set current crawl info in config when crawl begins"""
    result = await crawl_configs.find_one_and_update(
        {"_id": cid, "inactive": {"$ne": True}},
        {
            "$set": {
                "lastCrawlId": crawl_id,
                "lastCrawlStartTime": crawl_start,
                "lastCrawlTime": None,
                "lastRun": crawl_start,
                "isCrawlRunning": True,
            }
        },
        return_document=pymongo.ReturnDocument.AFTER,
    )
    if result:
        return True
    return False


# ============================================================================
# pylint: disable=too-many-locals
async def stats_recompute_all(crawl_configs, crawls, cid: uuid.UUID):
    """Re-calculate and update crawl statistics for config.

    Should only be called when a crawl completes from operator or on migration
    when no crawls are running.
    """
    update_query = {
        "crawlCount": 0,
        "crawlSuccessfulCount": 0,
        "totalSize": 0,
        "lastCrawlId": None,
        "lastCrawlStartTime": None,
        "lastStartedBy": None,
        "lastCrawlTime": None,
        "lastCrawlState": None,
        "lastCrawlSize": None,
        "lastCrawlStopping": False,
        "isCrawlRunning": False,
    }

    match_query = {"cid": cid, "finished": {"$ne": None}}
    cursor = crawls.find(match_query).sort("finished", pymongo.DESCENDING)
    results = await cursor.to_list(length=10_000)
    if results:
        update_query["crawlCount"] = len(results)

        update_query["crawlSuccessfulCount"] = len(
            [res for res in results if res["state"] not in ("canceled", "failed")]
        )

        last_crawl = results[0]

        last_crawl_finished = last_crawl.get("finished")

        update_query["lastCrawlId"] = str(last_crawl.get("_id"))
        update_query["lastCrawlStartTime"] = last_crawl.get("started")
        update_query["lastStartedBy"] = last_crawl.get("userid")
        update_query["lastCrawlTime"] = last_crawl_finished
        update_query["lastCrawlState"] = last_crawl.get("state")
        update_query["lastCrawlSize"] = sum(
            file_.get("size", 0) for file_ in last_crawl.get("files", [])
        )

        if last_crawl_finished:
            update_query["lastRun"] = last_crawl_finished

        total_size = 0
        for res in results:
            files = res.get("files", [])
            for file in files:
                total_size += file.get("size", 0)
        update_query["totalSize"] = total_size

    result = await crawl_configs.find_one_and_update(
        {"_id": cid, "inactive": {"$ne": True}},
        {"$set": update_query},
        return_document=pymongo.ReturnDocument.AFTER,
    )

    return result


# ============================================================================
async def stats_recompute_last(
    crawl_configs, crawls, cid: uuid.UUID, size: int, inc_crawls=1
):
    """recompute stats by incrementing size counter and number of crawls"""
    update_query = {
        "lastCrawlId": None,
        "lastCrawlStartTime": None,
        "lastStartedBy": None,
        "lastCrawlTime": None,
        "lastCrawlState": None,
        "lastCrawlSize": None,
        "lastCrawlStopping": False,
        "isCrawlRunning": False,
    }

    match_query = {"cid": cid, "finished": {"$ne": None}, "inactive": {"$ne": True}}
    last_crawl = await crawls.find_one(
        match_query, sort=[("finished", pymongo.DESCENDING)]
    )

    if last_crawl:
        last_crawl_finished = last_crawl.get("finished")

        update_query["lastCrawlId"] = str(last_crawl.get("_id"))
        update_query["lastCrawlStartTime"] = last_crawl.get("started")
        update_query["lastStartedBy"] = last_crawl.get("userid")
        update_query["lastCrawlTime"] = last_crawl_finished
        update_query["lastCrawlState"] = last_crawl.get("state")
        update_query["lastCrawlSize"] = sum(
            file_.get("size", 0) for file_ in last_crawl.get("files", [])
        )

        if last_crawl_finished:
            update_query["lastRun"] = last_crawl_finished

    result = await crawl_configs.find_one_and_update(
        {"_id": cid, "inactive": {"$ne": True}},
        {
            "$set": update_query,
            "$inc": {
                "totalSize": size,
                "crawlCount": inc_crawls,
                "crawlSuccessfulCount": inc_crawls,
            },
        },
    )

    return result


# ============================================================================
# pylint: disable=redefined-builtin,invalid-name,too-many-locals,too-many-arguments
def init_crawl_config_api(
    dbclient,
    mdb,
    user_dep,
    user_manager,
    org_ops,
    crawl_manager,
    profiles,
):
    """Init /crawlconfigs api routes"""
    # pylint: disable=invalid-name

    ops = CrawlConfigOps(dbclient, mdb, user_manager, org_ops, crawl_manager, profiles)

    router = ops.router

    org_crawl_dep = org_ops.org_crawl_dep
    org_viewer_dep = org_ops.org_viewer_dep

    @router.get("", response_model=PaginatedResponse)
    async def get_crawl_configs(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        # createdBy, kept as userid for API compatibility
        userid: Optional[UUID4] = None,
        modifiedBy: Optional[UUID4] = None,
        firstSeed: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        tag: Union[List[str], None] = Query(default=None),
        schedule: Optional[bool] = None,
        sortBy: str = None,
        sortDirection: int = -1,
    ):
        # pylint: disable=duplicate-code
        if firstSeed:
            firstSeed = urllib.parse.unquote(firstSeed)

        if name:
            name = urllib.parse.unquote(name)

        if description:
            description = urllib.parse.unquote(description)

        crawl_configs, total = await ops.get_crawl_configs(
            org,
            created_by=userid,
            modified_by=modifiedBy,
            first_seed=firstSeed,
            name=name,
            description=description,
            tags=tag,
            schedule=schedule,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(crawl_configs, total, page, pageSize)

    @router.get("/tags")
    async def get_crawl_config_tags(org: Organization = Depends(org_viewer_dep)):
        return await ops.get_crawl_config_tags(org)

    @router.get("/search-values")
    async def get_crawl_config_search_values(
        org: Organization = Depends(org_viewer_dep),
    ):
        return await ops.get_crawl_config_search_values(org)

    @router.get("/{cid}", response_model=CrawlConfigOut)
    async def get_crawl_config_out(
        cid: str, org: Organization = Depends(org_viewer_dep)
    ):
        return await ops.get_crawl_config_out(uuid.UUID(cid), org)

    @router.get(
        "/{cid}/revs",
        dependencies=[Depends(org_viewer_dep)],
    )
    async def get_crawl_config_revisions(
        cid: str, pageSize: int = DEFAULT_PAGE_SIZE, page: int = 1
    ):
        revisions, total = await ops.get_crawl_config_revs(
            uuid.UUID(cid), page_size=pageSize, page=page
        )
        return paginated_format(revisions, total, page, pageSize)

    @router.post("/")
    async def add_crawl_config(
        config: CrawlConfigIn,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        cid, new_job_name = await ops.add_crawl_config(config, org, user)
        return {"added": True, "id": str(cid), "run_now_job": new_job_name}

    @router.patch("/{cid}", dependencies=[Depends(org_crawl_dep)])
    async def update_crawl_config(
        update: UpdateCrawlConfig,
        cid: str,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.update_crawl_config(uuid.UUID(cid), org, user, update)

    @router.post("/{cid}/run")
    async def run_now(
        cid: str,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        crawl_id = await ops.run_now(cid, org, user)
        return {"started": crawl_id}

    @router.delete("/{cid}")
    async def make_inactive(cid: str, org: Organization = Depends(org_crawl_dep)):
        crawlconfig = await ops.get_crawl_config(uuid.UUID(cid), org)

        if not crawlconfig:
            raise HTTPException(
                status_code=404, detail=f"Crawl Config '{cid}' not found"
            )

        return await ops.do_make_inactive(crawlconfig)

    org_ops.router.include_router(router)

    return ops
