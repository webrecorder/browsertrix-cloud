""" btrixjob operator (working for metacontroller) """

import asyncio
import traceback
from typing import Optional

from datetime import datetime
import json
import uuid

import yaml
import humanize

from pydantic import BaseModel
from redis import asyncio as aioredis

from .utils import (
    from_k8s_date,
    to_k8s_date,
    dt_now,
    get_redis_crawl_stats,
)
from .k8sapi import K8sAPI

from .db import init_db
from .orgs import inc_org_stats, get_max_parallel_crawls
from .colls import add_successful_crawl_to_collections
from .crawlconfigs import stats_recompute_last
from .crawls import (
    CrawlFile,
    CrawlCompleteIn,
    add_crawl_file,
    update_crawl_state_if_changed,
    add_crawl_errors,
    NON_RUNNING_STATES,
    SUCCESSFUL_STATES,
)


STS = "StatefulSet.apps/v1"
CMAP = "ConfigMap.v1"
PVC = "PersistentVolumeClaim.v1"
POD = "Pod.v1"
CJS = "CrawlJob.btrix.cloud/v1"

DEFAULT_TTL = 30


# ============================================================================
class DeleteCrawlException(Exception):
    """throw to force deletion of crawl objects"""


# ============================================================================
class MCBaseRequest(BaseModel):
    """base metacontroller model, used for customize hook"""

    parent: dict
    controller: dict


# ============================================================================
class MCSyncData(MCBaseRequest):
    """sync / finalize metacontroller model"""

    children: dict
    related: dict
    finalizing: bool = False


# ============================================================================
class CrawlSpec(BaseModel):
    """spec from k8s CrawlJob object"""

    id: str
    cid: uuid.UUID
    oid: uuid.UUID
    scale: int
    storage_path: str
    storage_name: str
    started: str
    stopping: bool = False
    expire_time: Optional[datetime] = None


# ============================================================================
class CrawlStatus(BaseModel):
    """status from k8s CrawlJob object"""

    state: str = "starting"
    pagesFound: int = 0
    pagesDone: int = 0
    size: str = ""
    scale: int = 1
    filesAdded: int = 0
    filesAddedSize: int = 0
    finished: Optional[str] = None
    stopping: bool = False
    # forceRestart: Optional[str]


# ============================================================================
# pylint: disable=too-many-statements
class BtrixOperator(K8sAPI):
    """BtrixOperator Handler"""

    # pylint: disable=too-many-instance-attributes,too-many-locals

    def __init__(self):
        super().__init__()
        self.config_file = "/config/config.yaml"

        _, mdb = init_db()
        self.collections = mdb["collections"]
        self.crawls = mdb["crawls"]
        self.crawl_configs = mdb["crawl_configs"]
        self.orgs = mdb["organizations"]

        self.done_key = "crawls-done"

        with open(self.config_file, encoding="utf-8") as fh_config:
            self.shared_params = yaml.safe_load(fh_config)

    async def sync_profile_browsers(self, data: MCSyncData):
        """sync profile browsers"""
        spec = data.parent.get("spec", {})

        expire_time = from_k8s_date(spec.get("expireTime"))
        browserid = spec.get("id")

        if dt_now() >= expire_time:
            asyncio.create_task(self.delete_profile_browser(browserid))
            return {"status": {}, "children": []}

        params = {}
        params.update(self.shared_params)
        params["id"] = browserid
        params["userid"] = spec.get("userid", "")

        params["storage_name"] = spec.get("storageName", "")
        params["storage_path"] = spec.get("storagePath", "")
        params["profile_filename"] = spec.get("profileFilename", "")
        params["url"] = spec.get("startUrl", "about:blank")
        params["vnc_password"] = spec.get("vncPassword")

        children = self.load_from_yaml("profilebrowser.yaml", params)

        return {"status": {}, "children": children}

    async def sync_crawls(self, data: MCSyncData):
        """sync crawls"""

        status = CrawlStatus(**data.parent.get("status", {}))

        spec = data.parent.get("spec", {})
        crawl_id = spec["id"]
        cid = spec["cid"]
        oid = spec["oid"]

        scale = spec.get("scale", 1)
        status.scale = scale

        redis_url = self.get_redis_url(crawl_id)

        # if finalizing, crawl is being deleted
        if data.finalizing:
            # if not yet finished, assume it was canceled, mark as such
            print(f"Finalizing crawl {crawl_id}, finished {status.finished}")
            if not status.finished:
                finalize = await self.cancel_crawl(
                    redis_url, crawl_id, cid, status, "canceled"
                )
            else:
                finalize = True

            return await self.finalize_crawl(crawl_id, status, data.related, finalize)

        if status.finished:
            return await self.handle_finished_delete_if_needed(crawl_id, status, spec)

        try:
            configmap = data.related[CMAP][f"crawl-config-{cid}"]["data"]
        # pylint: disable=bare-except, broad-except
        except:
            # fail crawl if config somehow missing, shouldn't generally happen
            await self.cancel_crawl(redis_url, crawl_id, cid, status, "failed")

            return self._done_response(status)

        crawl = CrawlSpec(
            id=crawl_id,
            cid=cid,
            oid=oid,
            storage_name=configmap["STORAGE_NAME"],
            storage_path=configmap["STORE_PATH"],
            scale=scale,
            started=data.parent["metadata"]["creationTimestamp"],
            stopping=spec.get("stopping", False),
            expire_time=from_k8s_date(spec.get("expireTime")),
        )

        if status.state in ("starting", "waiting_org_limit"):
            if not await self.can_start_new(crawl, data, status):
                return self._done_response(status)

            await self.set_state("starting", status, crawl.id)

        crawl_sts = f"crawl-{crawl_id}"
        redis_sts = f"redis-{crawl_id}"

        has_crawl_children = crawl_sts in data.children[STS]
        if has_crawl_children:
            pods = data.related[POD]
            status = await self.sync_crawl_state(redis_url, crawl, status, pods)
            if status.finished:
                return await self.handle_finished_delete_if_needed(
                    crawl_id, status, spec
                )

        params = {}
        params.update(self.shared_params)
        params["id"] = crawl_id
        params["cid"] = cid
        params["userid"] = spec.get("userid", "")

        params["storage_name"] = configmap["STORAGE_NAME"]
        params["store_path"] = configmap["STORE_PATH"]
        params["store_filename"] = configmap["STORE_FILENAME"]
        params["profile_filename"] = configmap["PROFILE_FILENAME"]
        params["scale"] = spec.get("scale", 1)
        params["force_restart"] = spec.get("forceRestart")

        params["redis_url"] = redis_url

        children = self.load_from_yaml("crawler.yaml", params)
        children.extend(self.load_from_yaml("redis.yaml", params))

        # to minimize merging, just patch in volumeClaimTemplates from actual children
        # as they may get additional settings that cause more frequent updates
        if has_crawl_children:
            children[0]["spec"]["volumeClaimTemplates"] = data.children[STS][crawl_sts][
                "spec"
            ]["volumeClaimTemplates"]

        has_redis_children = redis_sts in data.children[STS]
        if has_redis_children:
            children[2]["spec"]["volumeClaimTemplates"] = data.children[STS][redis_sts][
                "spec"
            ]["volumeClaimTemplates"]

        return {"status": status.dict(exclude_none=True), "children": children}

    async def set_state(self, state, status, crawl_id, **kwargs):
        """set status state and update db, if changed"""
        if status.state != state:
            print(f"Setting state: {status.state} -> {state}, {crawl_id}")
            status.state = state
            return await update_crawl_state_if_changed(
                self.crawls, crawl_id, state=state, **kwargs
            )

    def load_from_yaml(self, filename, params):
        """load and parse k8s template from yaml file"""
        return list(
            yaml.safe_load_all(self.templates.env.get_template(filename).render(params))
        )

    def get_related(self, data: MCBaseRequest):
        """return configmap related to crawl"""
        spec = data.parent.get("spec", {})
        cid = spec["cid"]
        crawl_id = spec["id"]
        oid = spec.get("oid")
        return {
            "relatedResources": [
                {
                    "apiVersion": "v1",
                    "resource": "configmaps",
                    "labelSelector": {"matchLabels": {"btrix.crawlconfig": cid}},
                },
                {
                    "apiVersion": "v1",
                    "resource": "persistentvolumeclaims",
                    "labelSelector": {"matchLabels": {"crawl": crawl_id}},
                },
                {
                    "apiVersion": "v1",
                    "resource": "pods",
                    "labelSelector": {
                        "matchLabels": {"crawl": crawl_id, "role": "crawler"}
                    },
                },
                {
                    "apiVersion": "btrix.cloud/v1",
                    "resource": "crawljobs",
                    "labelSelector": {"matchLabels": {"oid": oid}},
                },
            ]
        }

    async def can_start_new(self, crawl: CrawlSpec, data: MCSyncData, status):
        """return true if crawl can start, otherwise set crawl to 'queued' state
        until more crawls for org finish"""
        max_crawls = await get_max_parallel_crawls(self.orgs, crawl.oid)
        if not max_crawls:
            return True

        if len(data.related[CJS]) <= max_crawls:
            return True

        name = data.parent.get("metadata").get("name")

        # def metadata_key(val):
        #    return val.get("metadata").get("creationTimestamp")

        # all_crawljobs = sorted(data.related[CJS].values(), key=metadata_key)
        # print(list(data.related[CJS].keys()))

        i = 0
        for crawl_sorted in data.related[CJS].values():
            if crawl_sorted.get("status", {}).get("state") in NON_RUNNING_STATES:
                continue

            # print(i, crawl_sorted.get("metadata").get("name"))
            if crawl_sorted.get("metadata").get("name") == name:
                # print("found: ", name, "index", i)
                if i < max_crawls:
                    return True

                break
            i += 1

        await self.set_state("waiting_org_limit", status, crawl.id)
        return False

    async def handle_finished_delete_if_needed(self, crawl_id, status, spec):
        """return status for finished job (no children)
        also check if deletion is necessary
        """

        ttl = spec.get("ttlSecondsAfterFinished", DEFAULT_TTL)
        finished = from_k8s_date(status.finished)
        if (dt_now() - finished).total_seconds() > ttl > 0:
            print("Job expired, deleting: " + crawl_id)

            asyncio.create_task(self.delete_crawl_job(crawl_id))

        return self._done_response(status)

    async def delete_pvc(self, crawl_id):
        """delete all pvcs for crawl"""
        # until delete policy is supported in StatefulSet
        # now, delete pvcs explicitly
        # (don't want to make them children as already owned by sts)
        try:
            await self.core_api.delete_collection_namespaced_persistent_volume_claim(
                namespace=self.namespace, label_selector=f"crawl={crawl_id}"
            )
        # pylint: disable=bare-except, broad-except
        except Exception as exc:
            print("PVC Delete failed", exc, flush=True)

    # pylint: disable=too-many-arguments
    async def cancel_crawl(self, redis_url, crawl_id, cid, status, state):
        """immediately cancel crawl with specified state
        return true if db mark_finished update succeeds"""
        try:
            redis = await self._get_redis(redis_url)
            await self.mark_finished(redis, crawl_id, uuid.UUID(cid), status, state)
            return True
        # pylint: disable=bare-except
        except:
            return False

    def _done_response(self, status, finalized=False):
        """done response for removing crawl"""
        return {
            "status": status.dict(exclude_none=True),
            "children": [],
            "finalized": finalized,
        }

    async def finalize_crawl(self, crawl_id, status, related, finalized=True):
        """ensure crawl id ready for deletion
        return with finalized state"""

        pvcs = list(related[PVC].keys())
        if pvcs:
            print(f"Deleting PVCs for {crawl_id}", pvcs)
            asyncio.create_task(self.delete_pvc(crawl_id))
            finalized = False

        return self._done_response(status, finalized)

    async def _get_redis(self, redis_url):
        """init redis, ensure connectivity"""
        redis = None
        try:
            redis = await aioredis.from_url(
                redis_url, encoding="utf-8", decode_responses=True
            )
            # test connection
            await redis.ping()
            return redis

        # pylint: disable=bare-except
        except:
            return None

    async def sync_crawl_state(self, redis_url, crawl, status, pods):
        """sync crawl state for running crawl"""
        redis = await self._get_redis(redis_url)
        if not redis:
            return status

        # if not prev_start_time:
        #    await redis.set("start_time", str(self.started))

        try:
            file_done = await redis.lpop(self.done_key)

            while file_done:
                msg = json.loads(file_done)
                # add completed file
                if msg.get("filename"):
                    await self.add_file_to_crawl(msg, crawl, redis)
                    await redis.incr("filesAdded")

                # get next file done
                file_done = await redis.lpop(self.done_key)

            # ensure filesAdded and filesAddedSize always set
            status.filesAdded = int(await redis.get("filesAdded") or 0)
            status.filesAddedSize = int(await redis.get("filesAddedSize") or 0)

            # update stats and get status
            return await self.update_crawl_state(redis, crawl, status, pods)

        # pylint: disable=broad-except
        except Exception as exc:
            traceback.print_exc()
            print(f"Crawl get failed: {exc}, will try again")
            return status

    async def check_if_pods_running(self, pods):
        """check if at least one crawler pod has started"""
        try:
            for pod in pods.values():
                if pod["status"]["phase"] == "Running":
                    return True
        # pylint: disable=bare-except
        except:
            # assume no valid pod found
            pass

        return False

    async def add_file_to_crawl(self, cc_data, crawl, redis):
        """Handle finished CrawlFile to db"""

        filecomplete = CrawlCompleteIn(**cc_data)

        inx = None
        filename = None
        if crawl.storage_path:
            inx = filecomplete.filename.index(crawl.storage_path)
            filename = filecomplete.filename[inx:] if inx > 0 else filecomplete.filename

        def_storage_name = crawl.storage_name if inx else None

        crawl_file = CrawlFile(
            def_storage_name=def_storage_name,
            filename=filename or filecomplete.filename,
            size=filecomplete.size,
            hash=filecomplete.hash,
        )

        await redis.incr("filesAddedSize", filecomplete.size)

        await add_crawl_file(self.crawls, crawl.id, crawl_file)

        return True

    # pylint: disable=too-many-branches
    async def update_crawl_state(self, redis, crawl, status, pods):
        """update crawl state and check if crawl is now done"""
        results = await redis.hvals(f"{crawl.id}:status")
        stats = await get_redis_crawl_stats(redis, crawl.id)

        # check crawl expiry
        if crawl.expire_time and datetime.utcnow() > crawl.expire_time:
            crawl.stopping = True
            print(
                "Job duration expired at {crawl.expire_time}, "
                + "gracefully stopping crawl"
            )

        if crawl.stopping:
            print("Graceful Stop")
            await redis.set(f"{crawl.id}:stopping", "1")
            # backwards compatibility with older crawler
            await redis.set("crawl-stop", "1")

        # check if at least one pod started running
        # otherwise, mark as 'waiting' and return
        if not await self.check_if_pods_running(pods):
            if status.state not in ("waiting_capacity", "canceled"):
                await self.set_state("waiting_capacity", status, crawl.id)

            return status

        # set state to running (if not already)
        await self.set_state("running", status, crawl.id)

        # update status
        status.pagesDone = stats["done"]
        status.pagesFound = stats["found"]
        if stats["size"] is not None:
            status.size = humanize.naturalsize(stats["size"])

        # check if done / failed
        done = 0
        failed = 0
        for res in results:
            if res == "done":
                done += 1
            elif res == "failed":
                failed += 1

        # check if all crawlers are done
        if done >= crawl.scale:
            # check if one-page crawls actually succeeded
            # if only one page found, and no files, assume failed
            if status.pagesFound == 1 and not status.filesAdded:
                return await self.mark_finished(
                    redis, crawl.id, crawl.cid, status, state="failed"
                )

            completed = status.pagesDone and status.pagesDone >= status.pagesFound

            state = "complete" if completed else "partial_complete"

            status = await self.mark_finished(
                redis, crawl.id, crawl.cid, status, state, crawl, stats
            )

        # check if all crawlers failed
        if failed >= crawl.scale:
            # if stopping, and no pages finished, mark as canceled
            if crawl.stopping and not status.pagesDone:
                state = "canceled"
            else:
                state = "failed"

            status = await self.mark_finished(
                redis, crawl.id, crawl.cid, status, state=state
            )

        return status

    # pylint: disable=too-many-arguments
    async def mark_finished(
        self, redis, crawl_id, cid, status, state, crawl=None, stats=None
    ):
        """mark crawl as finished, set finished timestamp and final state"""

        finished = dt_now()

        kwargs = {"finished": finished}
        if stats:
            kwargs["stats"] = stats

        # if set_state returns false, already set to same status, return
        if not await self.set_state(state, status, crawl_id, **kwargs):
            print("already finished, ignoring mark_finished")
            return status

        status.finished = to_k8s_date(finished)

        if crawl:
            await self.inc_crawl_complete_stats(crawl, finished)

        asyncio.create_task(
            self.do_crawl_finished_tasks(
                redis, crawl_id, cid, status.filesAddedSize, state
            )
        )

        return status

    # pylint: disable=too-many-arguments
    async def do_crawl_finished_tasks(
        self, redis, crawl_id, cid, files_added_size, state
    ):
        """Run tasks after crawl completes in asyncio.task coroutine."""
        await stats_recompute_last(
            self.crawl_configs, self.crawls, cid, files_added_size, 1
        )

        if redis:
            await self.add_crawl_errors_to_db(redis, crawl_id)

        if state in SUCCESSFUL_STATES:
            await add_successful_crawl_to_collections(
                self.crawls, self.crawl_configs, self.collections, crawl_id, cid
            )

    async def inc_crawl_complete_stats(self, crawl, finished):
        """Increment Crawl Stats"""

        started = from_k8s_date(crawl.started)

        duration = int((finished - started).total_seconds())

        print(f"Duration: {duration}", flush=True)

        await inc_org_stats(self.orgs, crawl.oid, duration)

    async def add_crawl_errors_to_db(self, redis, crawl_id, inc=100):
        """Pull crawl errors from redis and write to mongo db"""
        index = 0
        try:
            # ensure this only runs once
            if not await redis.setnx("errors-exported", "1"):
                return

            while True:
                skip = index * inc
                upper_bound = skip + inc - 1
                errors = await redis.lrange(f"{crawl_id}:e", skip, upper_bound)
                if not errors:
                    break

                await add_crawl_errors(self.crawls, crawl_id, errors)

                if len(errors) < inc:
                    # If we have fewer than inc errors, we can assume this is the
                    # last page of data to add.
                    break
                index += 1
        # likely redis has already been deleted, so nothing to do
        # pylint: disable=bare-except
        except:
            return


# ============================================================================
def init_operator_webhook(app):
    """regsiters webhook handlers for metacontroller"""

    oper = BtrixOperator()

    @app.post("/op/crawls/sync")
    async def mc_sync_crawls(data: MCSyncData):
        return await oper.sync_crawls(data)

    # reuse sync path, but distinct endpoint for better logging
    @app.post("/op/crawls/finalize")
    async def mc_sync_finalize(data: MCSyncData):
        return await oper.sync_crawls(data)

    @app.post("/op/crawls/customize")
    async def mc_related(data: MCBaseRequest):
        return oper.get_related(data)

    @app.post("/op/profilebrowsers/sync")
    async def mc_sync_profile_browsers(data: MCSyncData):
        return await oper.sync_profile_browsers(data)

    @app.get("/healthz", include_in_schema=False)
    async def healthz():
        return {}
