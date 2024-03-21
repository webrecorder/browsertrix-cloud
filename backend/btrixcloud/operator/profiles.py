""" Operator handler for ProfileJobs """

from btrixcloud.utils import (
    from_k8s_date,
    dt_now,
)

from btrixcloud.models import StorageRef

from .models import MCSyncData
from .baseoperator import BaseOperator


# ============================================================================
class ProfileOperator(BaseOperator):
    """ProfileOperator"""

    def init_routes(self, app):
        """init routes for this operator"""

        @app.post("/op/profilebrowsers/sync")
        async def mc_sync_profile_browsers(data: MCSyncData):
            return await self.sync_profile_browsers(data)

    async def sync_profile_browsers(self, data: MCSyncData):
        """sync profile browsers"""
        spec = data.parent.get("spec", {})

        expire_time = from_k8s_date(spec.get("expireTime"))
        browserid = spec.get("id")

        if dt_now() >= expire_time:
            self.run_task(self.k8s.delete_profile_browser(browserid))
            return {"status": {}, "children": []}

        params = {}
        params.update(self.k8s.shared_params)
        params["id"] = browserid
        params["userid"] = spec.get("userid", "")

        oid = spec.get("oid")
        storage = StorageRef(spec.get("storageName"))

        storage_path = storage.get_storage_extra_path(oid)
        storage_secret = storage.get_storage_secret_name(oid)

        params["storage_path"] = storage_path
        params["storage_secret"] = storage_secret
        params["profile_filename"] = spec.get("profileFilename", "")
        params["crawler_image"] = spec["crawlerImage"]

        params["url"] = spec.get("startUrl", "about:blank")
        params["vnc_password"] = spec.get("vncPassword")

        children = self.load_from_yaml("profilebrowser.yaml", params)

        return {"status": {}, "children": children}
