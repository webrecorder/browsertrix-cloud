""" Crawl API """

# pylint: disable=too-many-lines

import json
import os
import re
import contextlib
import urllib.parse
from datetime import datetime
from uuid import UUID

from typing import Optional, List, Dict, Union, Any, Sequence

from fastapi import Depends, HTTPException
from fastapi.responses import StreamingResponse
from redis import asyncio as exceptions
import pymongo

from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .utils import dt_now, parse_jsonl_error_messages, stream_dict_list_as_csv
from .basecrawls import BaseCrawlOps
from .crawlmanager import CrawlManager
from .models import (
    UpdateCrawl,
    DeleteCrawlList,
    CrawlConfig,
    UpdateCrawlConfig,
    CrawlScale,
    CrawlStats,
    CrawlFile,
    Crawl,
    CrawlOut,
    CrawlOutWithResources,
    QARun,
    QARunOut,
    QARunWithResources,
    QARunAggregateStatsOut,
    DeleteQARunList,
    Organization,
    User,
    PaginatedResponse,
    RUNNING_AND_STARTING_STATES,
    SUCCESSFUL_STATES,
    NON_RUNNING_STATES,
    ALL_CRAWL_STATES,
    TYPE_ALL_CRAWL_STATES,
)


MAX_MATCH_SIZE = 500000
DEFAULT_RANGE_LIMIT = 50


# ============================================================================
# pylint: disable=too-many-arguments, too-many-instance-attributes, too-many-public-methods
class CrawlOps(BaseCrawlOps):
    """Crawl Ops"""

    crawl_manager: CrawlManager

    def __init__(self, crawl_manager: CrawlManager, *args):
        super().__init__(*args)
        self.crawl_manager = crawl_manager
        self.crawl_configs.set_crawl_ops(self)
        self.colls.set_crawl_ops(self)
        self.event_webhook_ops.set_crawl_ops(self)

        self.min_qa_crawler_image = os.environ.get("MIN_QA_CRAWLER_IMAGE")

    async def init_index(self):
        """init index for crawls db collection"""
        await self.crawls.create_index([("type", pymongo.HASHED)])

        await self.crawls.create_index(
            [("type", pymongo.HASHED), ("finished", pymongo.DESCENDING)]
        )
        await self.crawls.create_index(
            [("type", pymongo.HASHED), ("oid", pymongo.DESCENDING)]
        )
        await self.crawls.create_index(
            [("type", pymongo.HASHED), ("cid", pymongo.DESCENDING)]
        )
        await self.crawls.create_index(
            [("type", pymongo.HASHED), ("state", pymongo.DESCENDING)]
        )
        await self.crawls.create_index(
            [("type", pymongo.HASHED), ("fileSize", pymongo.DESCENDING)]
        )

        await self.crawls.create_index([("finished", pymongo.DESCENDING)])
        await self.crawls.create_index([("oid", pymongo.HASHED)])
        await self.crawls.create_index([("cid", pymongo.HASHED)])
        await self.crawls.create_index([("state", pymongo.HASHED)])
        await self.crawls.create_index([("fileSize", pymongo.DESCENDING)])

    async def get_crawl(
        self,
        crawlid: str,
        org: Optional[Organization] = None,
    ) -> Crawl:
        """Get crawl data for internal use"""
        res = await self.get_crawl_raw(crawlid, org, "crawl")
        return Crawl.from_dict(res)

    @contextlib.asynccontextmanager
    async def get_redis(self, crawl_id):
        """get redis url for crawl id"""
        redis_url = self.crawl_manager.get_redis_url(crawl_id)

        redis = await self.crawl_manager.get_redis_client(redis_url)

        try:
            yield redis
        finally:
            await redis.close()

    async def list_crawls(
        self,
        org: Optional[Organization] = None,
        cid: Optional[UUID] = None,
        userid: Optional[UUID] = None,
        crawl_id: str = "",
        running_only=False,
        state: Optional[List[str]] = None,
        first_seed: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        collection_id: Optional[UUID] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: Optional[str] = None,
        sort_direction: int = -1,
        resources: bool = False,
    ):
        """List all finished crawls from the db"""
        # pylint: disable=too-many-locals,too-many-branches,too-many-statements
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        oid = org.id if org else None

        query: dict[str, object] = {"type": {"$in": ["crawl", None]}}
        if oid:
            query["oid"] = oid

        if cid:
            query["cid"] = cid

        if userid:
            query["userid"] = userid

        if running_only:
            query["state"] = {"$in": RUNNING_AND_STARTING_STATES}

        # Override running_only if state list is explicitly passed
        if state:
            validated_states = [value for value in state if value in ALL_CRAWL_STATES]
            query["state"] = {"$in": validated_states}

        if crawl_id:
            query["_id"] = crawl_id

        # pylint: disable=duplicate-code
        aggregate = [
            {"$match": query},
            {"$set": {"firstSeedObject": {"$arrayElemAt": ["$config.seeds", 0]}}},
            {"$set": {"firstSeed": "$firstSeedObject.url"}},
            {"$unset": ["firstSeedObject", "errors", "config"]},
            {"$set": {"activeQAStats": "$qa.stats"}},
            {
                "$set": {
                    "qaFinishedArray": {
                        "$map": {
                            "input": {"$objectToArray": "$qaFinished"},
                            "in": "$$this.v",
                        }
                    }
                }
            },
            # Add active QA run to array if exists prior to sorting, taking care not to
            # pass null to $concatArrays so that our result isn't null
            {
                "$set": {
                    "qaActiveArray": {"$cond": [{"$ne": ["$qa", None]}, ["$qa"], []]}
                }
            },
            {
                "$set": {
                    "qaArray": {"$concatArrays": ["$qaFinishedArray", "$qaActiveArray"]}
                }
            },
            {
                "$set": {
                    "sortedQARuns": {
                        "$sortArray": {
                            "input": "$qaArray",
                            "sortBy": {"started": -1},
                        }
                    }
                }
            },
            {"$set": {"lastQARun": {"$arrayElemAt": ["$sortedQARuns", 0]}}},
            {"$set": {"lastQAState": "$lastQARun.state"}},
            {"$set": {"lastQAStarted": "$lastQARun.started"}},
            {
                "$set": {
                    "qaRunCount": {
                        "$size": {
                            "$cond": [
                                {"$isArray": "$qaArray"},
                                "$qaArray",
                                [],
                            ]
                        }
                    }
                }
            },
            {
                "$unset": [
                    "lastQARun",
                    "qaActiveArray",
                    "qaFinishedArray",
                    "qaArray",
                    "sortedQARuns",
                ]
            },
        ]

        if not resources:
            aggregate.extend([{"$unset": ["files"]}])

        if name:
            aggregate.extend([{"$match": {"name": name}}])

        if description:
            aggregate.extend([{"$match": {"description": description}}])

        if first_seed:
            aggregate.extend([{"$match": {"firstSeed": first_seed}}])

        if collection_id:
            aggregate.extend([{"$match": {"collectionIds": {"$in": [collection_id]}}}])

        if sort_by:
            if sort_by not in (
                "started",
                "finished",
                "fileSize",
                "firstSeed",
                "reviewStatus",
                "qaRunCount",
                "lastQAState",
                "lastQAStarted",
            ):
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
        cursor = self.crawls.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        cls = CrawlOut
        if resources:
            cls = CrawlOutWithResources

        crawls = []
        for result in items:
            crawl = cls.from_dict(result)
            files = result.get("files") if resources else None
            crawl = await self._resolve_crawl_refs(
                crawl, org, files=files, add_first_seed=False
            )
            crawls.append(crawl)

        return crawls, total

    async def delete_crawls(
        self,
        org: Organization,
        delete_list: DeleteCrawlList,
        type_="crawl",
        user: Optional[User] = None,
    ):
        """Delete a list of crawls by id for given org"""

        count, cids_to_update, quota_reached = await super().delete_crawls(
            org, delete_list, type_, user
        )

        if count < 1:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        for cid, cid_dict in cids_to_update.items():
            cid_size = cid_dict["size"]
            cid_inc = cid_dict["inc"]
            await self.crawl_configs.stats_recompute_last(cid, -cid_size, -cid_inc)

        return {"deleted": True, "storageQuotaReached": quota_reached}

    # pylint: disable=too-many-arguments
    async def add_new_crawl(
        self,
        crawl_id: str,
        crawlconfig: CrawlConfig,
        userid: UUID,
        started: str,
        manual: bool,
        username: str = "",
    ):
        """initialize new crawl"""
        if not username:
            user = await self.user_manager.get_by_id(userid)
            if user:
                username = user.name

        image = self.crawl_configs.get_channel_crawler_image(crawlconfig.crawlerChannel)
        socks_proxy_server = self.crawl_configs.get_crawler_socks_proxy_server(crawlconfig.crawlerSocksProxyServer)

        crawl = Crawl(
            id=crawl_id,
            state="starting",
            userid=userid,
            userName=username,
            oid=crawlconfig.oid,
            cid=crawlconfig.id,
            cid_rev=crawlconfig.rev,
            scale=crawlconfig.scale,
            jobType=crawlconfig.jobType,
            config=crawlconfig.config,
            profileid=crawlconfig.profileid,
            schedule=crawlconfig.schedule,
            crawlTimeout=crawlconfig.crawlTimeout,
            maxCrawlSize=crawlconfig.maxCrawlSize,
            manual=manual,
            started=started,
            tags=crawlconfig.tags,
            name=crawlconfig.name,
            crawlerChannel=crawlconfig.crawlerChannel,
            crawlerSocksProxyServer=crawlconfig.crawlerSocksProxyServer,
            socksProxyServer=socks_proxy_server.dict() if socks_proxy_server else None,
            image=image,
        )

        try:
            await self.crawls.insert_one(crawl.to_dict())
            return dt_now

        except pymongo.errors.DuplicateKeyError:
            return None

    async def update_crawl_scale(
        self, crawl_id: str, org: Organization, crawl_scale: CrawlScale, user: User
    ):
        """Update crawl scale in the db"""
        crawl = await self.get_crawl(crawl_id, org)
        update = UpdateCrawlConfig(scale=crawl_scale.scale)
        await self.crawl_configs.update_crawl_config(crawl.cid, org, user, update)

        result = await self.crawls.find_one_and_update(
            {"_id": crawl_id, "type": "crawl", "oid": org.id},
            {"$set": {"scale": crawl_scale.scale}},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail=f"Crawl '{crawl_id}' not found")

        return True

    async def _crawl_queue_len(self, redis, key):
        try:
            return await redis.zcard(key)
        except exceptions.ResponseError:
            # fallback to old crawler queue
            return await redis.llen(key)

    async def _crawl_queue_range(self, redis, key, offset, count):
        try:
            return await redis.zrangebyscore(key, 0, "inf", offset, count)
        except exceptions.ResponseError:
            # fallback to old crawler queue
            return reversed(await redis.lrange(key, -offset - count, -offset - 1))

    async def get_crawl_queue(self, crawl_id, offset, count, regex):
        """get crawl queue"""

        total = 0
        results = []

        try:
            async with self.get_redis(crawl_id) as redis:
                total = await self._crawl_queue_len(redis, f"{crawl_id}:q")
                results = await self._crawl_queue_range(
                    redis, f"{crawl_id}:q", offset, count
                )
                results = [json.loads(result)["url"] for result in results]

        except exceptions.ConnectionError:
            # can't connect to redis, likely not initialized yet
            pass

        matched = []
        if regex:
            try:
                regex = re.compile(regex)
            except re.error as exc:
                raise HTTPException(status_code=400, detail="invalid_regex") from exc

            matched = [result for result in results if regex.search(result)]

        return {"total": total, "results": results, "matched": matched}

    async def match_crawl_queue(self, crawl_id, regex, offset=0):
        """get list of urls that match regex, starting at offset and at most
        around 'limit'. (limit rounded to next step boundary, so
        limit <= next_offset < limit + step"""
        total = 0
        matched = []
        step = DEFAULT_RANGE_LIMIT

        async with self.get_redis(crawl_id) as redis:
            try:
                total = await self._crawl_queue_len(redis, f"{crawl_id}:q")
            except exceptions.ConnectionError:
                # can't connect to redis, likely not initialized yet
                pass

            try:
                regex = re.compile(regex)
            except re.error as exc:
                raise HTTPException(status_code=400, detail="invalid_regex") from exc

            next_offset = -1
            size = 0

            for count in range(offset, total, step):
                results = await self._crawl_queue_range(
                    redis, f"{crawl_id}:q", count, step
                )
                for result in results:
                    url = json.loads(result)["url"]
                    if regex.search(url):
                        size += len(url)
                        matched.append(url)

                # if size of match response exceeds size limit, set nextOffset
                # and break
                if size > MAX_MATCH_SIZE:
                    next_offset = count + step
                    break

        return {"total": total, "matched": matched, "nextOffset": next_offset}

    async def add_or_remove_exclusion(self, crawl_id, regex, org, user, add):
        """add new exclusion to config or remove exclusion from config
        for given crawl_id, update config on crawl"""

        crawl = await self.get_crawl(crawl_id, org)

        cid = crawl.cid

        scale = crawl.scale or 1

        async with self.get_redis(crawl_id) as redis:
            query = {
                "regex": regex,
                "type": "addExclusion" if add else "removeExclusion",
            }
            query_str = json.dumps(query)

            for i in range(0, scale):
                await redis.rpush(f"crawl-{crawl_id}-{i}:msg", query_str)

        new_config = await self.crawl_configs.add_or_remove_exclusion(
            regex, cid, org, user, add
        )

        await self.crawls.find_one_and_update(
            {"_id": crawl_id, "type": "crawl", "oid": org.id},
            {"$set": {"config": new_config.dict()}},
        )

        return {"success": True}

    async def update_crawl_state_if_allowed(
        self,
        crawl_id: str,
        is_qa: bool,
        state: TYPE_ALL_CRAWL_STATES,
        allowed_from: Sequence[TYPE_ALL_CRAWL_STATES],
        finished: Optional[datetime] = None,
        stats: Optional[CrawlStats] = None,
    ):
        """update crawl state and other properties in db if state has changed"""
        prefix = "" if not is_qa else "qa."

        update: Dict[str, Any] = {f"{prefix}state": state}
        if finished:
            update[f"{prefix}finished"] = finished
        if stats:
            update[f"{prefix}stats"] = stats.dict()

        query: Dict[str, Any] = {"_id": crawl_id, "type": "crawl"}
        if allowed_from:
            query[f"{prefix}state"] = {"$in": allowed_from}

        return await self.crawls.find_one_and_update(query, {"$set": update})

    async def update_running_crawl_stats(
        self, crawl_id: str, is_qa: bool, stats: CrawlStats
    ):
        """update running crawl stats"""
        prefix = "" if not is_qa else "qa."
        query = {"_id": crawl_id, "type": "crawl", f"{prefix}state": "running"}
        return await self.crawls.find_one_and_update(
            query, {"$set": {f"{prefix}stats": stats.dict()}}
        )

    async def inc_crawl_exec_time(
        self,
        crawl_id: str,
        is_qa: bool,
        exec_time,
        last_updated_time,
    ):
        """increment exec time"""
        # update both crawl-shared qa exec seconds and per-qa run exec seconds
        if is_qa:
            inc_update = {
                "qaCrawlExecSeconds": exec_time,
                "qa.crawlExecSeconds": exec_time,
            }
        else:
            inc_update = {"crawlExecSeconds": exec_time}

        return await self.crawls.find_one_and_update(
            {
                "_id": crawl_id,
                "type": "crawl",
                "_lut": {"$ne": last_updated_time},
            },
            {
                "$inc": inc_update,
                "$set": {"_lut": last_updated_time},
            },
        )

    async def get_crawl_exec_last_update_time(self, crawl_id):
        """get crawl last updated time"""
        res = await self.crawls.find_one(
            {"_id": crawl_id, "type": "crawl"}, projection=["_lut"]
        )
        return res and res.get("_lut")

    async def get_crawl_state(self, crawl_id: str, is_qa: bool):
        """return current crawl state of a crawl"""
        prefix = "" if not is_qa else "qa."

        res = await self.crawls.find_one(
            {"_id": crawl_id},
            projection={"state": f"${prefix}state", "finished": f"${prefix}finished"},
        )
        if not res:
            return None, None
        return res.get("state"), res.get("finished")

    async def add_crawl_error(
        self,
        crawl_id: str,
        is_qa: bool,
        error: str,
    ):
        """add crawl error from redis to mongodb errors field"""
        prefix = "" if not is_qa else "qa."

        await self.crawls.find_one_and_update(
            {"_id": crawl_id}, {"$push": {f"{prefix}errors": error}}
        )

    async def add_crawl_file(
        self, crawl_id: str, is_qa: bool, crawl_file: CrawlFile, size: int
    ):
        """add new crawl file to crawl"""
        prefix = "" if not is_qa else "qa."

        await self.crawls.find_one_and_update(
            {"_id": crawl_id},
            {
                "$push": {f"{prefix}files": crawl_file.dict()},
                "$inc": {f"{prefix}fileCount": 1, f"{prefix}fileSize": size},
            },
        )

    async def get_crawl_seeds(
        self,
        crawl_id: str,
        org: Organization,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        """Get paginated list of seeds from crawl"""
        skip = (page - 1) * page_size
        upper_bound = skip + page_size

        crawl = await self.get_crawl(crawl_id, org)
        if not crawl.config or not crawl.config.seeds:
            return [], 0
        try:
            return crawl.config.seeds[skip:upper_bound], len(crawl.config.seeds)
        # pylint: disable=broad-exception-caught
        except Exception:
            return [], 0

    async def get_crawl_stats(
        self, org: Optional[Organization] = None
    ) -> List[Dict[str, Union[str, int]]]:
        """Return crawl statistics"""
        # pylint: disable=too-many-locals
        org_slugs = await self.orgs.get_org_slugs_by_ids()
        user_emails = await self.user_manager.get_user_emails_by_ids()

        crawls_data: List[Dict[str, Union[str, int]]] = []

        query: Dict[str, Union[str, UUID]] = {"type": "crawl"}
        if org:
            query["oid"] = org.id

        async for crawl_raw in self.crawls.find(query):
            crawl = Crawl.from_dict(crawl_raw)
            data: Dict[str, Union[str, int]] = {}
            data["id"] = crawl.id

            data["oid"] = str(crawl.oid)
            data["org"] = org_slugs[crawl.oid]

            data["cid"] = crawl.id
            data["name"] = f'"{crawl.name}"' if crawl.name else ""
            data["state"] = crawl.state

            data["userid"] = str(crawl.userid)
            data["user"] = user_emails.get(crawl.userid)

            data["started"] = str(crawl.started)
            data["finished"] = str(crawl.finished)

            data["duration"] = 0
            duration_seconds = 0
            if crawl.started and crawl.finished:
                duration = crawl.finished - crawl.started
                duration_seconds = int(duration.total_seconds())
                if duration_seconds:
                    data["duration"] = duration_seconds

            if crawl.stats:
                data["pages"] = crawl.stats.done

            data["filesize"] = crawl.fileSize

            data["avg_page_time"] = 0
            if crawl.stats and crawl.stats.done != 0 and duration_seconds:
                data["avg_page_time"] = int(duration_seconds / crawl.stats.done)

            crawls_data.append(data)

        return crawls_data

    async def shutdown_crawl(
        self, crawl_id: str, org: Organization, graceful: bool
    ) -> Dict[str, bool]:
        """stop or cancel specified crawl"""
        crawl = await self.get_base_crawl(crawl_id, org)
        if crawl and crawl.type != "crawl":
            raise HTTPException(status_code=400, detail="not_a_crawl")

        result = None
        try:
            result = await self.crawl_manager.shutdown_crawl(
                crawl_id, graceful=graceful
            )

            if result.get("success"):
                if graceful:
                    await self.crawls.find_one_and_update(
                        {"_id": crawl_id, "type": "crawl", "oid": org.id},
                        {"$set": {"stopping": True}},
                    )
                return result

        except Exception as exc:
            # pylint: disable=raise-missing-from
            # if reached here, probably crawl doesn't exist anymore
            raise HTTPException(
                status_code=404, detail=f"crawl_not_found, (details: {exc})"
            )

        # if job no longer running, canceling is considered success,
        # but graceful stoppage is not possible, so would be a failure
        if result.get("error") == "Not Found":
            if not graceful:
                await self.update_crawl_state(crawl_id, "canceled")
                crawl = await self.get_crawl(crawl_id, org)
                if not await self.crawl_configs.stats_recompute_last(crawl.cid, 0, -1):
                    raise HTTPException(
                        status_code=404,
                        detail=f"crawl_config_not_found: {crawl.cid}",
                    )

                return {"success": True}

        # return whatever detail may be included in the response
        raise HTTPException(status_code=400, detail=result)

    async def start_crawl_qa_run(self, crawl_id: str, org: Organization, user: User):
        """Start crawl QA run"""

        crawl = await self.get_crawl(crawl_id, org)

        # can only QA finished crawls
        if not crawl.finished:
            raise HTTPException(status_code=400, detail="crawl_not_finished")

        # can only QA successfully finished crawls
        if crawl.state not in SUCCESSFUL_STATES:
            raise HTTPException(status_code=400, detail="crawl_did_not_succeed")

        # if set, can only QA if crawl image is >= min_qa_crawler_image
        if (
            self.min_qa_crawler_image
            and crawl.image
            and crawl.image < self.min_qa_crawler_image
        ):
            raise HTTPException(status_code=400, detail="qa_not_supported_for_crawl")

        # can only run one QA at a time
        if crawl.qa:
            raise HTTPException(status_code=400, detail="qa_already_running")

        # not a valid crawl
        if not crawl.cid or crawl.type != "crawl":
            raise HTTPException(status_code=400, detail="invalid_crawl_for_qa")

        crawlconfig = await self.crawl_configs.prepare_for_run_crawl(crawl.cid, org)

        try:
            qa_run_id = await self.crawl_manager.create_qa_crawl_job(
                crawlconfig,
                org.storage,
                userid=str(user.id),
                qa_source=crawl_id,
            )

            image = self.crawl_configs.get_channel_crawler_image(
                crawlconfig.crawlerChannel
            )

            qa_run = QARun(
                id=qa_run_id,
                started=datetime.now(),
                userid=user.id,
                userName=user.name,
                state="starting",
                image=image,
            )

            await self.crawls.find_one_and_update(
                {"_id": crawl_id},
                {
                    "$set": {
                        "qa": qa_run.dict(),
                    }
                },
            )

            return qa_run_id

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=500, detail=f"Error starting crawl: {exc}")

    async def stop_crawl_qa_run(
        self, crawl_id: str, org: Organization, graceful: bool = True
    ):
        """Stop crawl QA run, QA run removed when actually finished"""
        crawl = await self.get_crawl(crawl_id, org)

        if not crawl.qa:
            raise HTTPException(status_code=400, detail="qa_not_running")

        try:
            result = await self.crawl_manager.shutdown_crawl(
                crawl.qa.id, graceful=graceful
            )

            if result.get("error") == "Not Found":
                # treat as success, qa crawl no longer exists, so mark as no qa
                result = {"success": True}

            return result

        except Exception as exc:
            # pylint: disable=raise-missing-from
            # if reached here, probably crawl doesn't exist anymore
            raise HTTPException(
                status_code=404, detail=f"crawl_not_found, (details: {exc})"
            )

    async def delete_crawl_qa_runs(
        self, crawl_id: str, delete_list: DeleteQARunList, org: Organization
    ):
        """delete specified finished QA run"""
        count = 0
        for qa_run_id in delete_list.qa_run_ids:
            await self.page_ops.delete_qa_run_from_pages(crawl_id, qa_run_id)
            await self.delete_crawl_qa_run_files(crawl_id, qa_run_id, org)

            res = await self.crawls.find_one_and_update(
                {"_id": crawl_id, "type": "crawl"},
                {"$unset": {f"qaFinished.{qa_run_id}": ""}},
            )

            if res:
                count += 1

        return {"deleted": count}

    async def delete_crawl_qa_run_files(
        self, crawl_id: str, qa_run_id: str, org: Organization
    ):
        """delete crawl qa wacz files"""
        qa_run = await self.get_qa_run(crawl_id, qa_run_id, org)
        for file_ in qa_run.files:
            if not await self.storage_ops.delete_crawl_file_object(org, file_):
                raise HTTPException(status_code=400, detail="file_deletion_error")
            # Not replicating QA run WACZs yet
            # await self.background_job_ops.create_delete_replica_jobs(
            #     org, file_, qa_run_id, "qa"
            # )

    async def qa_run_finished(self, crawl_id: str):
        """clear active qa, add qa run to finished list, if successful"""
        crawl = await self.get_crawl(crawl_id)

        if not crawl.qa:
            return False

        query: Dict[str, Any] = {"qa": None}

        if crawl.qa.finished and crawl.qa.state in NON_RUNNING_STATES:
            query[f"qaFinished.{crawl.qa.id}"] = crawl.qa.dict()

        if await self.crawls.find_one_and_update(
            {"_id": crawl_id, "type": "crawl"}, {"$set": query}
        ):
            return True

        return False

    async def get_qa_runs(
        self,
        crawl_id: str,
        skip_failed: bool = False,
        org: Optional[Organization] = None,
    ) -> List[QARunOut]:
        """Return list of QA runs"""
        crawl_data = await self.get_crawl_raw(
            crawl_id, org, "crawl", project={"qaFinished": True, "qa": True}
        )
        qa_finished = crawl_data.get("qaFinished") or {}
        if skip_failed:
            all_qa = [
                QARunOut(**qa_run_data)
                for qa_run_data in qa_finished.values()
                if qa_run_data.get("state") in SUCCESSFUL_STATES
            ]
        else:
            all_qa = [QARunOut(**qa_run_data) for qa_run_data in qa_finished.values()]
        all_qa.sort(key=lambda x: x.finished or dt_now(), reverse=True)
        qa = crawl_data.get("qa")
        # ensure current QA run didn't just fail, just in case
        if qa and (not skip_failed or qa.get("state") in SUCCESSFUL_STATES):
            all_qa.insert(0, QARunOut(**qa))
        return all_qa

    async def get_active_qa(
        self, crawl_id: str, org: Optional[Organization] = None
    ) -> Optional[QARunOut]:
        """return just the active QA, if any"""
        crawl_data = await self.get_crawl_raw(
            crawl_id, org, "crawl", project={"qa": True}
        )
        qa = crawl_data.get("qa")
        return QARunOut(**qa) if qa else None

    async def get_qa_run(
        self, crawl_id: str, qa_run_id: str, org: Optional[Organization] = None
    ):
        """Get QARun by id"""
        crawl = await self.get_crawl(crawl_id, org)
        qa_finished = crawl.qaFinished or {}
        qa_run = qa_finished.get(qa_run_id)

        if not qa_run:
            raise HTTPException(status_code=404, detail="crawl_qa_not_found")

        return qa_run

    async def get_qa_run_for_replay(
        self, crawl_id: str, qa_run_id: str, org: Optional[Organization] = None
    ) -> QARunWithResources:
        """Fetch QA runs with resources for replay.json"""
        crawl = await self.get_crawl(crawl_id, org)
        qa_run = await self.get_qa_run(crawl_id, qa_run_id, org)

        if not org:
            org = await self.orgs.get_org_by_id(crawl.oid)
            if not org:
                raise HTTPException(status_code=400, detail="missing_org")

        resources = await self._resolve_signed_urls(
            qa_run.files, org, crawl.id, qa_run_id
        )

        qa_run.files = []

        qa_run_dict = qa_run.dict()
        qa_run_dict["resources"] = resources

        return QARunWithResources(**qa_run_dict)

    async def get_qa_run_aggregate_stats(
        self,
        crawl_id: str,
        qa_run_id: str,
        thresholds: Dict[str, List[float]],
    ) -> QARunAggregateStatsOut:
        """Get aggregate stats for QA run"""
        screenshot_results = await self.page_ops.get_qa_run_aggregate_counts(
            crawl_id, qa_run_id, thresholds, key="screenshotMatch"
        )
        text_results = await self.page_ops.get_qa_run_aggregate_counts(
            crawl_id, qa_run_id, thresholds, key="textMatch"
        )
        return QARunAggregateStatsOut(
            screenshotMatch=screenshot_results,
            textMatch=text_results,
        )


# ============================================================================
async def recompute_crawl_file_count_and_size(crawls, crawl_id):
    """Fully recompute file count and size for given crawl"""
    file_count = 0
    size = 0

    crawl_raw = await crawls.find_one({"_id": crawl_id})
    crawl = Crawl.from_dict(crawl_raw)
    for file_ in crawl.files:
        file_count += 1
        size += file_.size

    await crawls.find_one_and_update(
        {"_id": crawl_id},
        {"$set": {"fileCount": file_count, "fileSize": size}},
    )


# ============================================================================
# pylint: disable=too-many-arguments, too-many-locals, too-many-statements
def init_crawls_api(crawl_manager: CrawlManager, app, user_dep, *args):
    """API for crawl management, including crawl done callback"""
    # pylint: disable=invalid-name, duplicate-code

    ops = CrawlOps(crawl_manager, *args)

    org_viewer_dep = ops.orgs.org_viewer_dep
    org_crawl_dep = ops.orgs.org_crawl_dep

    @app.get("/orgs/all/crawls", tags=["crawls"])
    async def list_crawls_admin(
        user: User = Depends(user_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        userid: Optional[UUID] = None,
        cid: Optional[UUID] = None,
        state: Optional[str] = None,
        firstSeed: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        collectionId: Optional[UUID] = None,
        sortBy: Optional[str] = None,
        sortDirection: int = -1,
        runningOnly: Optional[bool] = True,
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        states = []
        if state:
            states = state.split(",")

        if firstSeed:
            firstSeed = urllib.parse.unquote(firstSeed)

        if name:
            name = urllib.parse.unquote(name)

        if description:
            description = urllib.parse.unquote(description)

        crawls, total = await ops.list_crawls(
            None,
            userid=userid,
            cid=cid,
            running_only=runningOnly,
            state=states,
            first_seed=firstSeed,
            name=name,
            description=description,
            collection_id=collectionId,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(crawls, total, page, pageSize)

    @app.get("/orgs/{oid}/crawls", tags=["crawls"], response_model=PaginatedResponse)
    async def list_crawls(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        userid: Optional[UUID] = None,
        cid: Optional[UUID] = None,
        state: Optional[str] = None,
        firstSeed: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        collectionId: Optional[UUID] = None,
        sortBy: Optional[str] = None,
        sortDirection: int = -1,
    ):
        # pylint: disable=duplicate-code
        states = []
        if state:
            states = state.split(",")

        if firstSeed:
            firstSeed = urllib.parse.unquote(firstSeed)

        if name:
            name = urllib.parse.unquote(name)

        if description:
            description = urllib.parse.unquote(description)

        crawls, total = await ops.list_crawls(
            org,
            userid=userid,
            cid=cid,
            running_only=False,
            state=states,
            first_seed=firstSeed,
            name=name,
            description=description,
            collection_id=collectionId,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(crawls, total, page, pageSize)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/cancel",
        tags=["crawls"],
    )
    async def crawl_cancel_immediately(
        crawl_id, org: Organization = Depends(org_crawl_dep)
    ):
        return await ops.shutdown_crawl(crawl_id, org, graceful=False)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/stop",
        tags=["crawls"],
    )
    async def crawl_graceful_stop(crawl_id, org: Organization = Depends(org_crawl_dep)):
        return await ops.shutdown_crawl(crawl_id, org, graceful=True)

    @app.post("/orgs/{oid}/crawls/delete", tags=["crawls"])
    async def delete_crawls(
        delete_list: DeleteCrawlList,
        user: User = Depends(user_dep),
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.delete_crawls(org, delete_list, "crawl", user)

    @app.get("/orgs/all/crawls/stats", tags=["crawls"])
    async def get_all_orgs_crawl_stats(
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        crawl_stats = await ops.get_crawl_stats()
        return stream_dict_list_as_csv(crawl_stats, "crawling-stats.csv")

    @app.get("/orgs/{oid}/crawls/stats", tags=["crawls"])
    async def get_org_crawl_stats(
        org: Organization = Depends(org_crawl_dep),
    ):
        crawl_stats = await ops.get_crawl_stats(org)
        return stream_dict_list_as_csv(crawl_stats, f"crawling-stats-{org.id}.csv")

    @app.get(
        "/orgs/all/crawls/{crawl_id}/replay.json",
        tags=["crawls"],
        response_model=CrawlOutWithResources,
    )
    async def get_crawl_admin(crawl_id, user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.get_crawl_out(crawl_id, None, "crawl")

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/replay.json",
        tags=["crawls"],
        response_model=CrawlOutWithResources,
    )
    async def get_crawl_out(crawl_id, org: Organization = Depends(org_viewer_dep)):
        return await ops.get_crawl_out(crawl_id, org, "crawl")

    # QA APIs
    # ---------------------
    @app.get(
        "/orgs/all/crawls/{crawl_id}/qa/{qa_run_id}/replay.json",
        tags=["qa"],
        response_model=QARunWithResources,
    )
    async def get_qa_run_admin(crawl_id, qa_run_id, user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.get_qa_run_for_replay(crawl_id, qa_run_id)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/qa/{qa_run_id}/replay.json",
        tags=["qa"],
        response_model=QARunWithResources,
    )
    async def get_qa_run(
        crawl_id, qa_run_id, org: Organization = Depends(org_viewer_dep)
    ):
        return await ops.get_qa_run_for_replay(crawl_id, qa_run_id, org)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/qa/{qa_run_id}/stats",
        tags=["qa"],
        response_model=QARunAggregateStatsOut,
    )
    async def get_qa_run_aggregate_stats(
        crawl_id,
        qa_run_id,
        screenshotThresholds: str,
        textThresholds: str,
        # pylint: disable=unused-argument
        org: Organization = Depends(org_viewer_dep),
    ):
        thresholds: Dict[str, List[float]] = {}
        try:
            thresholds["screenshotMatch"] = [
                float(threshold) for threshold in screenshotThresholds.split(",")
            ]
            thresholds["textMatch"] = [
                float(threshold) for threshold in textThresholds.split(",")
            ]
        # pylint: disable=broad-exception-caught,raise-missing-from
        except Exception:
            raise HTTPException(status_code=400, detail="invalid_thresholds")

        return await ops.get_qa_run_aggregate_stats(
            crawl_id,
            qa_run_id,
            thresholds,
        )

    @app.post("/orgs/{oid}/crawls/{crawl_id}/qa/start", tags=["qa"])
    async def start_crawl_qa_run(
        crawl_id: str,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        qa_run_id = await ops.start_crawl_qa_run(crawl_id, org, user)
        return {"started": qa_run_id}

    @app.post("/orgs/{oid}/crawls/{crawl_id}/qa/stop", tags=["qa"])
    async def stop_crawl_qa_run(
        crawl_id: str, org: Organization = Depends(org_crawl_dep)
    ):
        # pylint: disable=unused-argument
        return await ops.stop_crawl_qa_run(crawl_id, org)

    @app.post("/orgs/{oid}/crawls/{crawl_id}/qa/cancel", tags=["qa"])
    async def cancel_crawl_qa_run(
        crawl_id: str, org: Organization = Depends(org_crawl_dep)
    ):
        # pylint: disable=unused-argument
        return await ops.stop_crawl_qa_run(crawl_id, org, graceful=False)

    @app.post("/orgs/{oid}/crawls/{crawl_id}/qa/delete", tags=["qa"])
    async def delete_crawl_qa_runs(
        crawl_id: str,
        qa_run_ids: DeleteQARunList,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.delete_crawl_qa_runs(crawl_id, qa_run_ids, org)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/qa",
        tags=["qa"],
        response_model=List[QARunOut],
    )
    async def get_qa_runs(
        crawl_id, org: Organization = Depends(org_viewer_dep), skipFailed: bool = False
    ):
        return await ops.get_qa_runs(crawl_id, skip_failed=skipFailed, org=org)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/qa/activeQA",
        tags=["qa"],
        response_model=Dict[str, Optional[QARunOut]],
    )
    async def get_active_qa(crawl_id, org: Organization = Depends(org_viewer_dep)):
        return {"qa": await ops.get_active_qa(crawl_id, org)}

    # ----

    @app.get(
        "/orgs/all/crawls/{crawl_id}",
        tags=["crawls"],
        response_model=CrawlOut,
    )
    async def list_single_crawl_admin(crawl_id, user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        crawls, _ = await ops.list_crawls(crawl_id=crawl_id)
        if len(crawls) < 1:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        return crawls[0]

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}",
        tags=["crawls"],
        response_model=CrawlOut,
    )
    async def list_single_crawl(crawl_id, org: Organization = Depends(org_viewer_dep)):
        crawls, _ = await ops.list_crawls(org, crawl_id=crawl_id)
        if len(crawls) < 1:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        return crawls[0]

    @app.patch("/orgs/{oid}/crawls/{crawl_id}", tags=["crawls"])
    async def update_crawl_api(
        update: UpdateCrawl, crawl_id: str, org: Organization = Depends(org_crawl_dep)
    ):
        return await ops.update_crawl(crawl_id, org, update, "crawl")

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/scale",
        tags=["crawls"],
    )
    async def scale_crawl(
        scale: CrawlScale,
        crawl_id,
        user: User = Depends(user_dep),
        org: Organization = Depends(org_crawl_dep),
    ):
        await ops.update_crawl_scale(crawl_id, org, scale, user)

        result = await ops.crawl_manager.scale_crawl(crawl_id, scale.scale)
        if not result or not result.get("success"):
            raise HTTPException(
                status_code=400, detail=result.get("error") or "unknown"
            )

        return {"scaled": scale.scale}

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/access",
        tags=["crawls"],
    )
    async def access_check(crawl_id, org: Organization = Depends(org_crawl_dep)):
        if await ops.get_crawl_raw(crawl_id, org):
            return {}

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/queue",
        tags=["crawls"],
    )
    async def get_crawl_queue(
        crawl_id,
        offset: int,
        count: int,
        regex: Optional[str] = "",
        org: Organization = Depends(org_crawl_dep),
    ):
        await ops.get_crawl_raw(crawl_id, org)

        return await ops.get_crawl_queue(crawl_id, offset, count, regex)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/queueMatchAll",
        tags=["crawls"],
    )
    async def match_crawl_queue(
        crawl_id,
        regex: str,
        offset: int = 0,
        org: Organization = Depends(org_crawl_dep),
    ):
        await ops.get_crawl_raw(crawl_id, org)

        return await ops.match_crawl_queue(crawl_id, regex, offset)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/exclusions",
        tags=["crawls"],
    )
    async def add_exclusion(
        crawl_id,
        regex: str,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.add_or_remove_exclusion(crawl_id, regex, org, user, add=True)

    @app.delete(
        "/orgs/{oid}/crawls/{crawl_id}/exclusions",
        tags=["crawls"],
    )
    async def remove_exclusion(
        crawl_id,
        regex: str,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.add_or_remove_exclusion(crawl_id, regex, org, user, add=False)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/seeds",
        tags=["crawls"],
        response_model=PaginatedResponse,
    )
    async def get_crawl_config_seeds(
        crawl_id: str,
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        seeds, total = await ops.get_crawl_seeds(crawl_id, org, pageSize, page)
        return paginated_format(seeds, total, page, pageSize)

    @app.get("/orgs/{oid}/crawls/{crawl_id}/logs", tags=["crawls"])
    async def stream_crawl_logs(
        crawl_id,
        org: Organization = Depends(org_viewer_dep),
        logLevel: Optional[str] = None,
        context: Optional[str] = None,
    ):
        crawl = await ops.get_crawl_out(crawl_id, org)

        log_levels = []
        contexts = []
        if logLevel:
            log_levels = logLevel.split(",")
        if context:
            contexts = context.split(",")

        # If crawl is finished, stream logs from WACZ files using presigned urls
        if crawl.finished:
            resp = await ops.storage_ops.sync_stream_wacz_logs(
                crawl.resources or [], log_levels, contexts
            )
            return StreamingResponse(
                resp,
                media_type="text/jsonl",
                headers={
                    "Content-Disposition": f'attachment; filename="{crawl_id}.log"'
                },
            )

        raise HTTPException(status_code=400, detail="crawl_not_finished")

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/errors",
        tags=["crawls"],
    )
    async def get_crawl_errors(
        crawl_id: str,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        org: Organization = Depends(org_viewer_dep),
    ):
        crawl = await ops.get_crawl(crawl_id, org)

        skip = (page - 1) * pageSize
        upper_bound = skip + pageSize

        errors = crawl.errors[skip:upper_bound] if crawl.errors else []
        parsed_errors = parse_jsonl_error_messages(errors)
        return paginated_format(parsed_errors, len(crawl.errors or []), page, pageSize)

    return ops
