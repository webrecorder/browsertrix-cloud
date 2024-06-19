""" CrawlOperator """

import traceback
import os
from pprint import pprint
from typing import Optional, Any, Sequence
from datetime import datetime

import json

import humanize

from kubernetes.utils import parse_quantity
from redis import asyncio as exceptions

from btrixcloud.models import (
    TYPE_NON_RUNNING_STATES,
    TYPE_RUNNING_STATES,
    TYPE_ALL_CRAWL_STATES,
    NON_RUNNING_STATES,
    RUNNING_STATES,
    RUNNING_AND_STARTING_ONLY,
    RUNNING_AND_STARTING_STATES,
    SUCCESSFUL_STATES,
    FAILED_STATES,
    CrawlStats,
    CrawlFile,
    CrawlCompleteIn,
    StorageRef,
)

from btrixcloud.utils import (
    from_k8s_date,
    to_k8s_date,
    dt_now,
)

from .baseoperator import BaseOperator, Redis
from .models import (
    CrawlSpec,
    CrawlStatus,
    StopReason,
    MCBaseRequest,
    MCSyncData,
    PodInfo,
    POD,
    CMAP,
    PVC,
    CJS,
    BTRIX_API,
)


METRICS_API = "metrics.k8s.io/v1beta1"
METRICS = f"PodMetrics.{METRICS_API}"

DEFAULT_TTL = 30

REDIS_TTL = 60

# time in seconds before a crawl is deemed 'waiting' instead of 'starting'
STARTING_TIME_SECS = 150

# how often to update execution time seconds
EXEC_TIME_UPDATE_SECS = 60


# scale up if exceeded this threshold of mem usage (eg. 90%)
MEM_SCALE_UP_THRESHOLD = 0.90

# scale up by this much
MEM_SCALE_UP = 1.2

# soft OOM if exceeded this threshold of mem usage (eg. 100%)
MEM_SOFT_OOM_THRESHOLD = 1.0

# set memory limit to this much of request for extra padding
MEM_LIMIT_PADDING = 1.2


# pylint: disable=too-many-public-methods, too-many-locals, too-many-branches, too-many-statements
# pylint: disable=invalid-name, too-many-lines, too-many-return-statements
# ============================================================================
class CrawlOperator(BaseOperator):
    """CrawlOperator Handler"""

    def __init__(self, *args):
        super().__init__(*args)

        self.done_key = "crawls-done"
        self.pages_key = "pages"
        self.errors_key = "e"

        self.fast_retry_secs = int(os.environ.get("FAST_RETRY_SECS") or 0)

        self.log_failed_crawl_lines = int(os.environ.get("LOG_FAILED_CRAWL_LINES") or 0)

    def init_routes(self, app):
        """init routes for this operator"""

        @app.post("/op/crawls/sync")
        async def mc_sync_crawls(data: MCSyncData):
            return await self.sync_crawls(data)

        # reuse sync path, but distinct endpoint for better logging
        @app.post("/op/crawls/finalize")
        async def mc_sync_finalize(data: MCSyncData):
            return await self.sync_crawls(data)

        @app.post("/op/crawls/customize")
        async def mc_related(data: MCBaseRequest):
            return self.get_related(data)

    async def sync_crawls(self, data: MCSyncData):
        """sync crawls"""

        status = CrawlStatus(**data.parent.get("status", {}))

        spec = data.parent.get("spec", {})
        crawl_id = spec["id"]
        cid = spec["cid"]
        oid = spec["oid"]

        redis_url = self.k8s.get_redis_url(crawl_id)

        params = {}
        params.update(self.k8s.shared_params)
        params["id"] = crawl_id
        params["cid"] = cid
        params["userid"] = spec.get("userid", "")

        pods = data.children[POD]

        crawl = CrawlSpec(
            id=crawl_id,
            cid=cid,
            oid=oid,
            storage=StorageRef(spec["storageName"]),
            crawler_channel=spec.get("crawlerChannel"),
            crawler_socks_proxy_server=spec.get("crawlerSocksProxyServer"),
            scale=spec.get("scale", 1),
            started=data.parent["metadata"]["creationTimestamp"],
            stopping=spec.get("stopping", False),
            timeout=spec.get("timeout") or 0,
            max_crawl_size=int(spec.get("maxCrawlSize") or 0),
            scheduled=spec.get("manual") != "1",
            qa_source_crawl_id=spec.get("qaSourceCrawlId"),
        )

        if crawl.qa_source_crawl_id:
            crawl.scale = int(params.get("qa_scale", 1))

        # if finalizing, crawl is being deleted
        if data.finalizing:
            if not status.finished:
                # if can't cancel, already finished
                await self.cancel_crawl(crawl, status, data.children[POD])
                # instead of fetching the state (that was already set)
                # return exception to ignore this request, keep previous
                # finished state
                # raise HTTPException(status_code=400, detail="out_of_sync_status")

            return await self.finalize_response(
                crawl,
                status,
                spec,
                data.children,
                params,
            )

        # just in case, finished but not deleted, can only get here if
        # do_crawl_finished_tasks() doesn't reach the end or taking too long
        if status.finished:
            print(
                f"warn crawl {crawl_id} finished but not deleted, post-finish taking too long?"
            )
            self.run_task(self.k8s.delete_crawl_job(crawl.id))
            return await self.finalize_response(
                crawl,
                status,
                spec,
                data.children,
                params,
            )

        try:
            configmap = data.related[CMAP][f"crawl-config-{cid}"]["data"]
        # pylint: disable=bare-except, broad-except
        except:
            # fail crawl if config somehow missing, shouldn't generally happen
            await self.fail_crawl(crawl, status, pods)

            return self._empty_response(status)

        # shouldn't get here, crawl should already be finalizing when canceled
        # just in case, handle canceled-but-not-finalizing here
        if status.state == "canceled":
            await self.k8s.delete_crawl_job(crawl.id)
            return {"status": status.dict(exclude_none=True), "children": []}

        # first, check storage quota, and fail immediately if quota reached
        if status.state in ("starting", "skipped_quota_reached"):
            # only check on very first run, before any pods/pvcs created
            # for now, allow if crawl has already started (pods/pvcs created)
            if (
                not pods
                and not data.children[PVC]
                and await self.org_ops.storage_quota_reached(crawl.oid)
            ):
                await self.mark_finished(crawl, status, "skipped_quota_reached")
                return self._empty_response(status)

        if status.state in ("starting", "waiting_org_limit"):
            if not await self.can_start_new(crawl, data, status):
                return self._empty_response(status)

            await self.set_state(
                "starting", status, crawl, allowed_from=["waiting_org_limit"]
            )

        if len(pods):
            for pod_name, pod in pods.items():
                self.sync_resources(status, pod_name, pod, data.children)

            status = await self.sync_crawl_state(
                redis_url,
                crawl,
                status,
                pods,
                data.related.get(METRICS, {}),
            )

            # auto-scaling not possible without pod metrics
            if self.k8s.has_pod_metrics:
                # auto sizing handled here
                await self.handle_auto_size(status.podStatus)

            if status.finished:
                return await self.finalize_response(
                    crawl,
                    status,
                    spec,
                    data.children,
                    params,
                )

            await self.increment_pod_exec_time(
                pods, crawl, status, EXEC_TIME_UPDATE_SECS
            )

        else:
            status.scale = crawl.scale
            now = dt_now()
            await self.crawl_ops.inc_crawl_exec_time(
                crawl.db_crawl_id, crawl.is_qa, 0, now
            )
            status.lastUpdatedTime = to_k8s_date(now)

        children = self._load_redis(params, status, data.children)

        storage_path = crawl.storage.get_storage_extra_path(oid)
        storage_secret = crawl.storage.get_storage_secret_name(oid)

        if not crawl.is_qa:
            params["profile_filename"] = configmap["PROFILE_FILENAME"]
        else:
            storage_path += "qa/"

        params["storage_path"] = storage_path
        params["storage_secret"] = storage_secret

        # only resolve if not already set
        # not automatically updating image for existing crawls
        if not status.crawlerImage:
            status.crawlerImage = self.crawl_config_ops.get_channel_crawler_image(
                crawl.crawler_channel
            )

        params["crawler_image"] = status.crawlerImage

        if crawl.crawler_socks_proxy_server:
            status.crawlerSocksProxyServer = crawl.crawler_socks_proxy_server
            socks_server = self.crawl_config_ops.get_crawler_socks_proxy_server(status.crawlerSocksProxyServer)
            assert socks_server is not None
            params["socks_server_id"] = socks_server.id
            params["socks_server_hostname"] = socks_server.hostname
            params["socks_server_username"] = socks_server.username
            params["socks_server_port"] = socks_server.port if socks_server.port else 22
            params["crawler_socks_proxy_host"] = "localhost"
            params["crawler_socks_proxy_port"] = "21579" # TODO: should be configurable via helm?

        params["storage_filename"] = configmap["STORE_FILENAME"]
        params["restart_time"] = spec.get("restartTime")

        params["warc_prefix"] = spec.get("warcPrefix")

        params["redis_url"] = redis_url

        if spec.get("restartTime") != status.restartTime:
            # pylint: disable=invalid-name
            status.restartTime = spec.get("restartTime")
            status.resync_after = self.fast_retry_secs
            params["force_restart"] = True
        else:
            params["force_restart"] = False

        if crawl.qa_source_crawl_id:
            params["qa_source_crawl_id"] = crawl.qa_source_crawl_id
            children.extend(await self._load_qa_configmap(params, data.children))

        for i in range(0, status.scale):
            children.extend(self._load_crawler(params, i, status, data.children))

        return {
            "status": status.dict(exclude_none=True),
            "children": children,
            "resyncAfterSeconds": status.resync_after,
        }

    def _load_redis(self, params, status, children):
        name = f"redis-{params['id']}"
        has_pod = name in children[POD]

        pod_info = status.podStatus[name]
        params["name"] = name
        params["cpu"] = pod_info.newCpu or params.get("redis_cpu")
        params["memory"] = pod_info.newMemory or params.get("redis_memory")
        restart = pod_info.should_restart_pod() and has_pod
        if restart:
            print(f"Restart {name}")

        params["init_redis"] = status.initRedis and not restart

        return self.load_from_yaml("redis.yaml", params)

    async def _load_qa_configmap(self, params, children):
        qa_source_crawl_id = params["qa_source_crawl_id"]
        name = f"qa-replay-{qa_source_crawl_id}"

        configmap = children[CMAP].get(name)
        if configmap and not self._qa_configmap_update_needed(name, configmap):
            metadata = configmap["metadata"]
            configmap["metadata"] = {
                "name": metadata["name"],
                "namespace": metadata["namespace"],
                "labels": metadata["labels"],
            }
            return [configmap]

        crawl_replay = await self.crawl_ops.get_internal_crawl_out(qa_source_crawl_id)

        params["name"] = name
        params["qa_source_replay_json"] = crawl_replay.json(include={"resources"})
        return self.load_from_yaml("qa_configmap.yaml", params)

    def _load_crawler(self, params, i, status, children):
        name = f"crawl-{params['id']}-{i}"
        has_pod = name in children[POD]

        if params.get("qa_source_crawl_id"):
            cpu_field = "qa_cpu"
            mem_field = "qa_memory"
            worker_field = "qa_workers"
            pri_class = f"qa-crawl-pri-{i}"
        else:
            cpu_field = "crawler_cpu"
            mem_field = "crawler_memory"
            worker_field = "crawler_workers"
            pri_class = f"crawl-pri-{i}"

        pod_info = status.podStatus[name]
        params["name"] = name
        params["priorityClassName"] = pri_class
        params["cpu"] = pod_info.newCpu or params.get(cpu_field)
        params["memory"] = pod_info.newMemory or params.get(mem_field)
        params["memory_limit"] = float(params["memory"]) * MEM_LIMIT_PADDING
        params["workers"] = params.get(worker_field) or 1
        params["do_restart"] = (
            pod_info.should_restart_pod() or params.get("force_restart")
        ) and has_pod
        if params.get("do_restart"):
            print(f"Restart {name}")

        return self.load_from_yaml("crawler.yaml", params)

    def _qa_configmap_update_needed(self, name, configmap):
        try:
            now = dt_now()
            resources = json.loads(configmap["data"]["qa-config.json"])["resources"]
            for resource in resources:
                expire_at = datetime.fromisoformat(resource["expireAt"])
                if expire_at <= now:
                    print(f"Refreshing QA configmap for QA run: {name}")
                    return True

        # pylint: disable=broad-exception-caught
        except Exception as e:
            print(e)

        return False

    # pylint: disable=too-many-arguments
    async def _resolve_scale(
        self,
        crawl_id: str,
        desired_scale: int,
        redis: Redis,
        status: CrawlStatus,
        pods: dict[str, dict],
    ):
        """Resolve scale
        If desired_scale >= actual scale, just set (also limit by number of pages
        found).
        If desired scale < actual scale, attempt to shut down each crawl instance
        via redis setting. If contiguous instances shutdown (successful exit), lower
        scale and clean up previous scale state.
        """

        # actual scale (minus redis pod)
        actual_scale = len(pods)
        if pods.get(f"redis-{crawl_id}"):
            actual_scale -= 1

        # ensure at least enough pages for the scale
        if status.pagesFound and status.pagesFound < desired_scale:
            desired_scale = status.pagesFound

        # if desired_scale same or scaled up, return desired_scale
        if desired_scale >= actual_scale:
            return desired_scale

        new_scale = actual_scale
        for i in range(actual_scale - 1, desired_scale - 1, -1):
            name = f"crawl-{crawl_id}-{i}"
            pod = pods.get(name)
            if pod:
                print(f"Attempting scaling down of pod {i}")
                await redis.hset(f"{crawl_id}:stopone", name, "1")

            # check if this pod can be scaled down
            if new_scale == i + 1:
                # if status key doesn't exist, this pod never actually ran, so just scale down
                if not await redis.hexists(f"{crawl_id}:status", name):
                    new_scale = i
                    print(f"Scaled down pod index {i + 1} -> {i}, no previous pod")

                elif pod and pod["status"].get("phase") == "Succeeded":
                    new_scale = i
                    print(f"Scaled down pod index {i + 1} -> {i}, pod completed")

        if new_scale < actual_scale:
            for i in range(new_scale, actual_scale):
                name = f"crawl-{crawl_id}-{i}"
                await redis.hdel(f"{crawl_id}:stopone", name)
                await redis.hdel(f"{crawl_id}:status", name)

        return new_scale

    def sync_resources(self, status, name, pod, children):
        """set crawljob status from current resources"""
        resources = status.podStatus[name].allocated

        src = pod["spec"]["containers"][0]["resources"]["requests"]
        resources.memory = int(parse_quantity(src.get("memory")))
        resources.cpu = float(parse_quantity(src.get("cpu")))

        pvc = children[PVC].get(name)
        if pvc:
            src = pvc["spec"]["resources"]["requests"]
            resources.storage = int(parse_quantity(src.get("storage")))

    async def set_state(
        self,
        state: TYPE_ALL_CRAWL_STATES,
        status: CrawlStatus,
        crawl: CrawlSpec,
        allowed_from: Sequence[TYPE_ALL_CRAWL_STATES],
        finished: Optional[datetime] = None,
        stats: Optional[CrawlStats] = None,
    ):
        """set status state and update db, if changed
        if allowed_from passed in, can only transition from allowed_from state,
        otherwise get current state from db and return
        the following state transitions are supported:

        from starting to org concurrent crawl limit and back:
         - starting -> waiting_org_capacity -> starting

        from starting to running:
         - starting -> running

        from running to complete or complete[:stopReason]:
         - running -> complete[:stopReason]
         - running -> complete

        from starting or running to waiting for capacity (pods pending) and back:
         - starting -> waiting_capacity
         - running -> waiting_capacity
         - waiting_capacity -> running

        from any state to canceled or failed:
         - not complete[:stopReason] -> canceled
         - not complete[:stopReason] -> failed
        """
        if not allowed_from or status.state in allowed_from:
            res = await self.crawl_ops.update_crawl_state_if_allowed(
                crawl.db_crawl_id,
                crawl.is_qa,
                state=state,
                allowed_from=allowed_from,
                finished=finished,
                stats=stats,
            )
            if res:
                print(f"Setting state: {status.state} -> {state}, {crawl.id}")
                status.state = state
                return True

            # get actual crawl state
            actual_state, finished = await self.crawl_ops.get_crawl_state(
                crawl.db_crawl_id, crawl.is_qa
            )
            if actual_state:
                status.state = actual_state
            if finished:
                status.finished = to_k8s_date(finished)

            if actual_state != state:
                print(f"state mismatch, actual state {actual_state}, requested {state}")
                if not actual_state and state == "canceled":
                    return True

        if status.state != state:
            print(
                f"Not setting state: {status.state} -> {state}, {crawl.id} not allowed"
            )
        return False

    def get_related(self, data: MCBaseRequest):
        """return objects related to crawl pods"""
        spec = data.parent.get("spec", {})
        cid = spec["cid"]
        crawl_id = spec["id"]
        oid = spec.get("oid")
        related_resources = [
            {
                "apiVersion": "v1",
                "resource": "configmaps",
                "labelSelector": {"matchLabels": {"btrix.crawlconfig": cid}},
            },
            {
                "apiVersion": BTRIX_API,
                "resource": "crawljobs",
                "labelSelector": {"matchLabels": {"btrix.org": oid}},
            },
        ]

        if self.k8s.has_pod_metrics:
            related_resources.append(
                {
                    "apiVersion": METRICS_API,
                    "resource": "pods",
                    "labelSelector": {"matchLabels": {"crawl": crawl_id}},
                }
            )

        return {"relatedResources": related_resources}

    async def can_start_new(self, crawl: CrawlSpec, data: MCSyncData, status):
        """return true if crawl can start, otherwise set crawl to 'queued' state
        until more crawls for org finish"""
        max_crawls = await self.org_ops.get_max_concurrent_crawls(crawl.oid)
        if not max_crawls:
            return True

        if len(data.related[CJS]) <= max_crawls:
            return True

        name = data.parent.get("metadata", {}).get("name")

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

        await self.set_state(
            "waiting_org_limit", status, crawl, allowed_from=["starting"]
        )
        return False

    async def cancel_crawl(
        self,
        crawl: CrawlSpec,
        status: CrawlStatus,
        pods: dict,
    ) -> bool:
        """Mark crawl as canceled"""
        if not await self.mark_finished(crawl, status, "canceled"):
            return False

        await self.mark_for_cancelation(crawl.id)

        if not status.canceled:
            for name, pod in pods.items():
                pstatus = pod["status"]
                role = pod["metadata"]["labels"]["role"]

                if role != "crawler":
                    continue

                if "containerStatuses" not in pstatus:
                    continue

                cstatus = pstatus["containerStatuses"][0]

                self.handle_terminated_pod(
                    name, role, status, cstatus["state"].get("terminated")
                )

            status.canceled = True

        return status.canceled

    async def fail_crawl(
        self,
        crawl: CrawlSpec,
        status: CrawlStatus,
        pods: dict,
        stats: Optional[CrawlStats] = None,
    ) -> bool:
        """Mark crawl as failed, log crawl state and print crawl logs, if possible"""
        prev_state = status.state

        if not await self.mark_finished(crawl, status, "failed", stats=stats):
            return False

        if not self.log_failed_crawl_lines or prev_state == "failed":
            return True

        pod_names = list(pods.keys())

        for name in pod_names:
            print(f"============== POD STATUS: {name} ==============")
            pprint(pods[name]["status"])

        self.run_task(self.k8s.print_pod_logs(pod_names, self.log_failed_crawl_lines))

        return True

    def _empty_response(self, status):
        """done response for removing crawl"""
        return {
            "status": status.dict(exclude_none=True),
            "children": [],
        }

    async def finalize_response(
        self,
        crawl: CrawlSpec,
        status: CrawlStatus,
        spec: dict,
        children: dict,
        params: dict,
    ):
        """ensure crawl id ready for deletion"""

        redis_pod = f"redis-{crawl.id}"
        new_children = []

        finalized = False

        pods = children[POD]

        if redis_pod in pods:
            # if has other pods, keep redis pod until they are removed
            if len(pods) > 1:
                new_children = self._load_redis(params, status, children)
                await self.increment_pod_exec_time(pods, crawl, status)

        # keep pvs until pods are removed
        if new_children:
            new_children.extend(list(children[PVC].values()))

        if not children[POD] and not children[PVC]:
            # keep parent until ttl expired, if any
            if status.finished:
                ttl = spec.get("ttlSecondsAfterFinished", DEFAULT_TTL)
                finished = from_k8s_date(status.finished)
                if (dt_now() - finished).total_seconds() > ttl >= 0:
                    print("CrawlJob expired, deleting: " + crawl.id)
                    finalized = True
            else:
                finalized = True

        if finalized and crawl.is_qa:
            await self.crawl_ops.qa_run_finished(crawl.db_crawl_id)

        return {
            "status": status.dict(exclude_none=True),
            "children": new_children,
            "finalized": finalized,
        }

    async def _get_redis(self, redis_url: str) -> Optional[Redis]:
        """init redis, ensure connectivity"""
        redis = None
        try:
            redis = await self.k8s.get_redis_client(redis_url)
            # test connection
            await redis.ping()
            return redis

        # pylint: disable=bare-except
        except:
            if redis:
                await redis.close()

            return None

    async def sync_crawl_state(
        self,
        redis_url: str,
        crawl: CrawlSpec,
        status: CrawlStatus,
        pods: dict[str, dict],
        metrics: Optional[dict],
    ):
        """sync crawl state for running crawl"""
        # check if at least one crawler pod started running
        crawler_running, redis_running, done = self.sync_pod_status(pods, status)
        redis = None

        try:
            if redis_running:
                redis = await self._get_redis(redis_url)

            await self.add_used_stats(crawl.id, status.podStatus, redis, metrics)

            # skip if no newly exited pods
            if status.anyCrawlPodNewExit:
                await self.log_crashes(crawl.id, status.podStatus, redis)

            if not crawler_running or not redis:
                # if either crawler is not running or redis is inaccessible
                if self.should_mark_waiting(status.state, crawl.started):
                    # mark as waiting (if already running)
                    await self.set_state(
                        "waiting_capacity",
                        status,
                        crawl,
                        allowed_from=RUNNING_AND_STARTING_ONLY,
                    )

                if not crawler_running and redis:
                    # if crawler running, but no redis, stop redis instance until crawler
                    # is running
                    if status.lastActiveTime and (
                        (
                            dt_now() - from_k8s_date(status.lastActiveTime)
                        ).total_seconds()
                        > REDIS_TTL
                    ):
                        print(
                            f"Pausing redis, no running crawler pods for >{REDIS_TTL} secs"
                        )
                        status.initRedis = False
                elif crawler_running and not redis:
                    # if crawler is running, but no redis, init redis
                    status.initRedis = True
                    status.lastActiveTime = to_k8s_date(dt_now())

                # if no crawler / no redis, resync after N seconds
                status.resync_after = self.fast_retry_secs
                return status

            # set state to running (if not already)
            if status.state not in RUNNING_STATES:
                # if true (state is set), also run webhook
                if await self.set_state(
                    "running",
                    status,
                    crawl,
                    allowed_from=["starting", "waiting_capacity"],
                ):
                    self.run_task(
                        self.event_webhook_ops.create_crawl_started_notification(
                            crawl.id, crawl.oid, scheduled=crawl.scheduled
                        )
                    )

            file_done = await redis.lpop(self.done_key)
            while file_done:
                msg = json.loads(file_done)
                # add completed file
                if msg.get("filename"):
                    await self.add_file_to_crawl(msg, crawl, redis)
                    await redis.incr("filesAdded")

                # get next file done
                file_done = await redis.lpop(self.done_key)

            page_crawled = await redis.lpop(f"{crawl.id}:{self.pages_key}")
            qa_run_id = crawl.id if crawl.is_qa else None

            while page_crawled:
                page_dict = json.loads(page_crawled)
                await self.page_ops.add_page_to_db(
                    page_dict, crawl.db_crawl_id, qa_run_id, crawl.oid
                )
                page_crawled = await redis.lpop(f"{crawl.id}:{self.pages_key}")

            crawl_error = await redis.lpop(f"{crawl.id}:{self.errors_key}")
            while crawl_error:
                await self.crawl_ops.add_crawl_error(
                    crawl.db_crawl_id, crawl.is_qa, crawl_error
                )
                crawl_error = await redis.lpop(f"{crawl.id}:{self.errors_key}")

            # ensure filesAdded and filesAddedSize always set
            status.filesAdded = int(await redis.get("filesAdded") or 0)
            status.filesAddedSize = int(await redis.get("filesAddedSize") or 0)

            # update stats and get status
            return await self.update_crawl_state(redis, crawl, status, pods, done)

        # pylint: disable=broad-except
        except Exception as exc:
            traceback.print_exc()
            print(f"Crawl get failed: {exc}, will try again")
            return status

        finally:
            if redis:
                await redis.close()

    def sync_pod_status(self, pods: dict[str, dict], status: CrawlStatus):
        """check status of pods"""
        crawler_running = False
        redis_running = False
        done = True

        try:
            for name, pod in pods.items():
                running = False

                pstatus = pod["status"]
                phase = pstatus["phase"]
                role = pod["metadata"]["labels"]["role"]

                if phase in ("Running", "Succeeded"):
                    running = True

                # we want to get the status of this pods "main" container
                # sometimes a pod has multiple containers, like crawler + socks proxy client
                # so we assume it's the one where container name == pod role name
                if "containerStatuses" in pstatus:
                    cstatus = None
                    if len(pstatus["containerStatuses"]) == 1:
                        cstatus = pstatus["containerStatuses"][0]
                    else:
                        for possible_cstatus in pstatus["containerStatuses"]:
                            if possible_cstatus["name"] == role:
                                cstatus = possible_cstatus
                                break

                    if cstatus is None:
                        print("Warning: Unable to determine 'main' container for pod. \
                               Falling back to first container to determine pod status")
                        cstatus = pstatus["containerStatuses"][0]

                    # consider 'ContainerCreating' as running
                    waiting = cstatus["state"].get("waiting")
                    if (
                        phase == "Pending"
                        and waiting
                        and waiting.get("reason") == "ContainerCreating"
                    ):
                        running = True

                    self.handle_terminated_pod(
                        name, role, status, cstatus["state"].get("terminated")
                    )

                if role == "crawler":
                    crawler_running = crawler_running or running
                    done = done and phase == "Succeeded"
                elif role == "redis":
                    redis_running = redis_running or running

        # pylint: disable=broad-except
        except Exception as exc:
            done = False
            print(exc)

        return crawler_running, redis_running, done

    def handle_terminated_pod(self, name, role, status: CrawlStatus, terminated):
        """handle terminated pod state"""
        if not terminated:
            return

        exit_time = terminated.get("finishedAt")
        if not exit_time:
            print("warn: terminated pod missing finishedAt", flush=True)
            return

        pod_status = status.podStatus[name]

        pod_status.isNewExit = pod_status.exitTime != exit_time
        if pod_status.isNewExit and role == "crawler":
            pod_status.exitTime = exit_time
            status.anyCrawlPodNewExit = True

        # detect reason
        exit_code = terminated.get("exitCode")

        if exit_code == 0:
            pod_status.reason = "done"
        elif terminated.get("reason") == "OOMKilled" or exit_code == 137:
            pod_status.reason = "oom"
        else:
            pod_status.reason = "interrupt: " + str(exit_code)

        pod_status.exitCode = exit_code

    async def increment_pod_exec_time(
        self,
        pods: dict[str, dict],
        crawl: CrawlSpec,
        status: CrawlStatus,
        min_duration=0,
    ) -> None:
        """inc exec time tracking"""
        now = dt_now()

        update_start_time = await self.crawl_ops.get_crawl_exec_last_update_time(
            crawl.db_crawl_id
        )

        if not update_start_time:
            await self.crawl_ops.inc_crawl_exec_time(
                crawl.db_crawl_id, crawl.is_qa, 0, now
            )
            status.lastUpdatedTime = to_k8s_date(now)
            return

        reason = None
        update_duration = (now - update_start_time).total_seconds()

        if status.anyCrawlPodNewExit:
            reason = "new pod exit"

        elif status.canceled:
            reason = "crawl canceled"

        elif now.month != update_start_time.month:
            reason = "month change"

        elif update_duration >= min_duration:
            reason = "duration reached" if min_duration else "finalizing"

        if not reason:
            return

        exec_time = 0
        max_duration = 0
        print(
            f"Exec Time Update: {reason}: {now} - {update_start_time} = {update_duration}"
        )

        for name, pod in pods.items():
            pstatus = pod["status"]
            role = pod["metadata"]["labels"]["role"]

            if role != "crawler":
                continue

            if "containerStatuses" not in pstatus:
                continue

            cstate = pstatus["containerStatuses"][0]["state"]

            end_time = None
            start_time = None
            pod_state = ""

            if "running" in cstate:
                pod_state = "running"
                state = cstate["running"]
                start_time = from_k8s_date(state.get("startedAt"))
                if update_start_time and update_start_time > start_time:
                    start_time = update_start_time

                end_time = now
            elif "terminated" in cstate:
                pod_state = "terminated"
                state = cstate["terminated"]
                start_time = from_k8s_date(state.get("startedAt"))
                end_time = from_k8s_date(state.get("finishedAt"))
                if update_start_time and update_start_time > start_time:
                    start_time = update_start_time

                # already counted
                if update_start_time and end_time < update_start_time:
                    print(
                        f"  - {name}: {pod_state}: skipping already counted, "
                        + f"{end_time} < {start_time}"
                    )
                    continue

            if end_time and start_time:
                duration = int((end_time - start_time).total_seconds())
                print(
                    f"  - {name}: {pod_state}: {end_time} - {start_time} = {duration}"
                )
                exec_time += duration
                max_duration = max(duration, max_duration)

        if exec_time:
            await self.org_ops.inc_org_time_stats(
                crawl.oid, exec_time, True, crawl.is_qa
            )
            status.crawlExecTime += exec_time
            status.elapsedCrawlTime += max_duration

        print(
            f"  Exec Time Total: {status.crawlExecTime}, Incremented By: {exec_time}",
            flush=True,
        )

        await self.crawl_ops.inc_crawl_exec_time(
            crawl.db_crawl_id, crawl.is_qa, exec_time, now
        )
        status.lastUpdatedTime = to_k8s_date(now)

    def should_mark_waiting(self, state, started):
        """Should the crawl be marked as waiting for capacity?"""
        if state in RUNNING_STATES:
            return True

        if state == "starting":
            started = from_k8s_date(started)
            return (dt_now() - started).total_seconds() > STARTING_TIME_SECS

        return False

    async def add_used_stats(
        self, crawl_id, pod_status: dict[str, PodInfo], redis, metrics
    ):
        """load current usage stats"""
        if redis:
            stats = await redis.info("persistence")
            storage = int(stats.get("aof_current_size", 0)) + int(
                stats.get("current_cow_size", 0)
            )
            pod_info = pod_status[f"redis-{crawl_id}"]
            pod_info.used.storage = storage

            # if no pod metrics, get memory estimate from redis itself
            if not self.k8s.has_pod_metrics:
                stats = await redis.info("memory")
                pod_info.used.memory = int(stats.get("used_memory_rss", 0))

                # stats = await redis.info("cpu")
                # pod_info.used.cpu = float(stats.get("used_cpu_sys", 0))

        for name, metric in metrics.items():
            usage = metric["containers"][0]["usage"]
            pod_info = pod_status[name]
            pod_info.used.memory = int(parse_quantity(usage["memory"]))
            pod_info.used.cpu = float(parse_quantity(usage["cpu"]))

    async def handle_auto_size(self, pod_status: dict[str, PodInfo]) -> None:
        """auto scale pods here, experimental"""
        for name, pod in pod_status.items():
            mem_usage = pod.get_percent_memory()
            new_memory = int(float(pod.allocated.memory) * MEM_SCALE_UP)
            send_sig = False

            # if pod is using >MEM_SCALE_UP_THRESHOLD of its memory, increase mem
            if mem_usage > MEM_SCALE_UP_THRESHOLD:
                if new_memory > self.k8s.max_crawler_memory_size:
                    print(
                        f"Mem {mem_usage}: Not resizing pod {name}: "
                        + f"mem {new_memory} > max allowed {self.k8s.max_crawler_memory_size}"
                    )
                    return

                pod.newMemory = new_memory
                print(
                    f"Mem {mem_usage}: Resizing pod {name} -> mem {pod.newMemory} - Scale Up"
                )

                # if crawler pod is using its OOM threshold, attempt a soft OOM
                # via a second SIGTERM
                if (
                    mem_usage >= MEM_SOFT_OOM_THRESHOLD
                    and name.startswith("crawl")
                    and pod.signalAtMem != pod.newMemory
                ):
                    send_sig = True

            # if any pod crashed due to OOM, increase mem
            elif pod.isNewExit and pod.reason == "oom":
                pod.newMemory = new_memory
                print(
                    f"Mem {mem_usage}: Resizing pod {name} -> mem {pod.newMemory} - OOM Detected"
                )
                send_sig = True

            # avoid resending SIGTERM multiple times after it already succeeded
            if send_sig and await self.k8s.send_signal_to_pod(name, "SIGTERM"):
                pod.signalAtMem = pod.newMemory

    async def log_crashes(self, crawl_id, pod_status: dict[str, PodInfo], redis):
        """report/log any pod crashes here"""
        for name, pod in pod_status.items():
            # log only unexpected exits as crashes
            # - 0 is success / intended shutdown
            # - 11 is default interrupt / intended restart
            # - 13 is force interrupt / intended restart
            if not pod.isNewExit or pod.exitCode in (0, 11, 13):
                continue

            log = self.get_log_line(
                "Crawler Instance Crashed", {"reason": pod.reason, "pod": name}
            )
            if not redis:
                print(log)
            else:
                await redis.lpush(f"{crawl_id}:e", log)

    def get_log_line(self, message, details):
        """get crawler error line for logging"""
        err = {
            "timestamp": dt_now().isoformat(),
            "logLevel": "error",
            "context": "k8s",
            "message": message,
            "details": details,
        }
        return json.dumps(err)

    async def add_file_to_crawl(self, cc_data, crawl, redis):
        """Handle finished CrawlFile to db"""

        filecomplete = CrawlCompleteIn(**cc_data)

        org = await self.org_ops.get_org_by_id(crawl.oid)

        filename = self.storage_ops.get_org_relative_path(
            org, crawl.storage, filecomplete.filename
        )

        crawl_file = CrawlFile(
            filename=filename,
            size=filecomplete.size,
            hash=filecomplete.hash,
            crc32=filecomplete.crc32,
            storage=crawl.storage,
        )

        await redis.incr("filesAddedSize", filecomplete.size)

        await self.crawl_ops.add_crawl_file(
            crawl.db_crawl_id, crawl.is_qa, crawl_file, filecomplete.size
        )

        # no replicas for QA for now
        if crawl.is_qa:
            return True

        try:
            await self.background_job_ops.create_replica_jobs(
                crawl.oid, crawl_file, crawl.id, "crawl"
            )
        # pylint: disable=broad-except
        except Exception as exc:
            print("Replicate Exception", exc, flush=True)

        return True

    async def is_crawl_stopping(
        self, crawl: CrawlSpec, status: CrawlStatus
    ) -> Optional[StopReason]:
        """check if crawl is stopping and set reason"""
        # if user requested stop, then enter stopping phase
        if crawl.stopping:
            print("Graceful Stop: User requested stop")
            return "stopped_by_user"

        # check timeout if timeout time exceeds elapsed time
        if crawl.timeout:
            elapsed = status.elapsedCrawlTime
            if status.lastUpdatedTime:
                elapsed += (
                    dt_now() - from_k8s_date(status.lastUpdatedTime)
                ).total_seconds()

            if elapsed > crawl.timeout:
                print(
                    f"Graceful Stop: Crawl running time exceeded {crawl.timeout} second timeout"
                )
                return "time-limit"

        # crawl size limit
        if crawl.max_crawl_size and status.size > crawl.max_crawl_size:
            print(f"Graceful Stop: Maximum crawl size {crawl.max_crawl_size} hit")
            return "size-limit"

        # check exec time quotas and stop if reached limit
        if await self.org_ops.exec_mins_quota_reached(crawl.oid):
            return "stopped_quota_reached"

        return None

    async def get_redis_crawl_stats(
        self, redis: Redis, crawl_id: str
    ) -> tuple[CrawlStats, dict[str, Any]]:
        """get page stats"""
        try:
            # crawler >0.9.0, done key is a value
            pages_done = int(await redis.get(f"{crawl_id}:d") or 0)
        except exceptions.ResponseError:
            # crawler <=0.9.0, done key is a list
            pages_done = await redis.llen(f"{crawl_id}:d")

        pages_found = await redis.scard(f"{crawl_id}:s")
        # account for extra seeds and subtract from seen list
        extra_seeds = await redis.llen(f"{crawl_id}:extraSeeds")
        if extra_seeds:
            pages_found -= extra_seeds

        sizes = await redis.hgetall(f"{crawl_id}:size")
        archive_size = sum(int(x) for x in sizes.values())

        stats = CrawlStats(found=pages_found, done=pages_done, size=archive_size)
        return stats, sizes

    async def update_crawl_state(
        self,
        redis: Redis,
        crawl: CrawlSpec,
        status: CrawlStatus,
        pods: dict[str, dict],
        done: bool,
    ) -> CrawlStatus:
        """update crawl state and check if crawl is now done"""
        results = await redis.hgetall(f"{crawl.id}:status")
        stats, sizes = await self.get_redis_crawl_stats(redis, crawl.id)

        # need to add size of previously completed WACZ files as well!
        stats.size += status.filesAddedSize

        # update status
        status.pagesDone = stats.done
        status.pagesFound = stats.found
        status.size = stats.size
        status.sizeHuman = humanize.naturalsize(status.size)

        await self.crawl_ops.update_running_crawl_stats(
            crawl.db_crawl_id, crawl.is_qa, stats
        )

        for key, value in sizes.items():
            value = int(value)
            if value > 0 and status.podStatus:
                pod_info = status.podStatus[key]
                pod_info.used.storage = value

        if not status.stopReason:
            status.stopReason = await self.is_crawl_stopping(crawl, status)
            status.stopping = status.stopReason is not None

        # mark crawl as stopping
        if status.stopping:
            await redis.set(f"{crawl.id}:stopping", "1")
            # backwards compatibility with older crawler
            await redis.set("crawl-stop", "1")

        # resolve scale
        if crawl.scale != status.scale:
            status.scale = await self._resolve_scale(
                crawl.id, crawl.scale, redis, status, pods
            )

        # check if done / failed
        status_count: dict[str, int] = {}
        for i in range(crawl.scale):
            res = results.get(f"crawl-{crawl.id}-{i}")
            if res:
                status_count[res] = status_count.get(res, 0) + 1

        # check if all crawlers are done
        if done and status_count.get("done", 0) >= crawl.scale:
            # check if one-page crawls actually succeeded
            # if only one page found, and no files, assume failed
            if status.pagesFound == 1 and not status.filesAdded:
                await self.fail_crawl(crawl, status, pods, stats)
                return status

            state: TYPE_NON_RUNNING_STATES
            if status.stopReason == "stopped_by_user":
                state = "stopped_by_user"
            elif status.stopReason == "stopped_quota_reached":
                state = "stopped_quota_reached"
            else:
                state = "complete"

            await self.mark_finished(crawl, status, state, stats)

        # check if all crawlers failed
        elif status_count.get("failed", 0) >= crawl.scale:
            # if stopping, and no pages finished, mark as canceled
            if status.stopping and not status.pagesDone:
                await self.mark_finished(crawl, status, "canceled", stats)
            else:
                await self.fail_crawl(crawl, status, pods, stats)

        # check for other statuses
        else:
            new_status: Optional[TYPE_RUNNING_STATES] = None
            if status_count.get("running"):
                if status.state in ("generate-wacz", "uploading-wacz", "pending-wacz"):
                    new_status = "running"

            elif status_count.get("generate-wacz"):
                new_status = "generate-wacz"
            elif status_count.get("uploading-wacz"):
                new_status = "uploading-wacz"
            elif status_count.get("pending-wait"):
                new_status = "pending-wait"
            if new_status:
                await self.set_state(
                    new_status, status, crawl, allowed_from=RUNNING_STATES
                )

        return status

    # pylint: disable=too-many-arguments
    async def mark_finished(
        self,
        crawl: CrawlSpec,
        status: CrawlStatus,
        state: TYPE_NON_RUNNING_STATES,
        stats: Optional[CrawlStats] = None,
    ) -> bool:
        """mark crawl as finished, set finished timestamp and final state"""

        finished = dt_now()

        allowed_from = RUNNING_AND_STARTING_STATES

        # if set_state returns false, already set to same status, return
        if not await self.set_state(
            state,
            status,
            crawl,
            allowed_from=allowed_from,
            finished=finished,
            stats=stats,
        ):
            print("already finished, ignoring mark_finished")
            if not status.finished:
                status.finished = to_k8s_date(finished)

            return False

        status.finished = to_k8s_date(finished)

        if state in SUCCESSFUL_STATES:
            await self.inc_crawl_complete_stats(crawl, finished)

        # Regular Crawl Finished
        if not crawl.is_qa:
            self.run_task(self.do_crawl_finished_tasks(crawl, status, state))

        # QA Run Finished
        else:
            self.run_task(self.do_qa_run_finished_tasks(crawl, state))

        return True

    # pylint: disable=too-many-arguments
    async def do_crawl_finished_tasks(
        self,
        crawl: CrawlSpec,
        status: CrawlStatus,
        state: TYPE_NON_RUNNING_STATES,
    ) -> None:
        """Run tasks after crawl completes in asyncio.task coroutine."""
        await self.crawl_config_ops.stats_recompute_last(
            crawl.cid, status.filesAddedSize, 1
        )

        if state in SUCCESSFUL_STATES and crawl.oid:
            await self.org_ops.inc_org_bytes_stored(
                crawl.oid, status.filesAddedSize, "crawl"
            )
            await self.coll_ops.add_successful_crawl_to_collections(crawl.id, crawl.cid)

        if state in FAILED_STATES:
            await self.crawl_ops.delete_crawl_files(crawl.id, crawl.oid)
            await self.page_ops.delete_crawl_pages(crawl.id, crawl.oid)

        await self.event_webhook_ops.create_crawl_finished_notification(
            crawl.id, crawl.oid, state
        )

        # finally, delete job
        await self.k8s.delete_crawl_job(crawl.id)

    # pylint: disable=too-many-arguments
    async def do_qa_run_finished_tasks(
        self,
        crawl: CrawlSpec,
        state: TYPE_NON_RUNNING_STATES,
    ) -> None:
        """Run tasks after qa run completes in asyncio.task coroutine."""

        if state in FAILED_STATES:
            await self.page_ops.delete_qa_run_from_pages(crawl.db_crawl_id, crawl.id)

        # finally, delete job
        await self.k8s.delete_crawl_job(crawl.id)

    async def inc_crawl_complete_stats(self, crawl: CrawlSpec, finished: datetime):
        """Increment Crawl Stats"""

        started = from_k8s_date(crawl.started)

        duration = int((finished - started).total_seconds())

        print(f"Duration: {duration}", flush=True)

        await self.org_ops.inc_org_time_stats(crawl.oid, duration, False, crawl.is_qa)

    async def mark_for_cancelation(self, crawl_id):
        """mark crawl as canceled in redis"""
        try:
            redis_url = self.k8s.get_redis_url(crawl_id)
            redis = await self._get_redis(redis_url)
            if not redis:
                return False

            await redis.set(f"{crawl_id}:canceled", "1")
            return True
        finally:
            if redis:
                await redis.close()
