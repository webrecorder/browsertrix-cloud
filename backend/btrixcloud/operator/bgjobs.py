""" Operator handler for BackgroundJobs """

from uuid import UUID
import traceback

from btrixcloud.utils import (
    from_k8s_date,
    dt_now,
)

from .models import MCDecoratorSyncData
from .baseoperator import BaseOperator


# ============================================================================
class BgJobOperator(BaseOperator):
    """BgJobOperator"""

    def init_routes(self, app):
        """init routes for this operator"""

        # nop, but needed for metacontroller
        @app.post("/op/backgroundjob/sync")
        async def mc_sync_background_jobs():
            return {"attachments": []}

        @app.post("/op/backgroundjob/finalize")
        async def mc_finalize_background_jobs(data: MCDecoratorSyncData):
            return await self.finalize_background_job(data)

    async def finalize_background_job(self, data: MCDecoratorSyncData) -> dict:
        """handle finished background job"""

        metadata = data.object["metadata"]
        labels: dict[str, str] = metadata.get("labels", {})
        oid: str = labels.get("btrix.org") or ""
        job_type: str = labels.get("job_type") or ""
        job_id: str = metadata.get("name")

        status = data.object["status"]
        success = status.get("succeeded") == 1
        completion_time = status.get("completionTime")

        finalized = True

        finished = from_k8s_date(completion_time) if completion_time else dt_now()

        try:
            await self.background_job_ops.job_finished(
                job_id, job_type, UUID(oid), success=success, finished=finished
            )
            # print(
            #    f"{job_type} background job completed: success: {success}, {job_id}",
            #    flush=True,
            # )

        # pylint: disable=broad-except
        except Exception:
            print("Update Background Job Error", flush=True)
            traceback.print_exc()

        return {"attachments": [], "finalized": finalized}
