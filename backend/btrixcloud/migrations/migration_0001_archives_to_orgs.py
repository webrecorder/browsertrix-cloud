"""
Migration 0001 - Archives to Orgs
"""

import os

from pymongo.errors import OperationFailure

from btrixcloud.migrations import BaseMigration
from btrixcloud.k8sapi import K8sAPI


MIGRATION_VERSION = "0001"


class Migration(BaseMigration):
    """Migration class."""

    COLLECTIONS_AID_TO_OID = [
        "collections",
        "crawl_configs",
        "crawls",
        "invites",
        "profiles",
    ]

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up."""
        # Rename archives collection to organizations
        org_collection = self.mdb["archives"]
        try:
            await org_collection.rename("organizations", dropTarget=True)
        except OperationFailure as err:
            print(f"Error renaming archives to organizations: {err}")

        # Rename aid fields to oid
        for collection in self.COLLECTIONS_AID_TO_OID:
            current_coll = self.mdb[collection]
            await current_coll.update_many({}, {"$rename": {"aid": "oid"}})

        # Update k8s configmaps
        k8s_api_instance = K8sAPI()
        crawler_namespace = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"
        config_map = await k8s_api_instance.core_api.list_namespaced_config_map(
            namespace=crawler_namespace
        )
        for item in config_map.items:
            item_name = item.metadata.name
            try:
                org_id = item.data["ARCHIVE_ID"]
            except KeyError:
                continue

            item.data["ORG_ID"] = org_id
            try:
                item.data.pop("ARCHIVE_ID")
            except KeyError:
                pass

            item.metadata.labels["btrix.org"] = org_id
            try:
                item.metadata.labels.pop("btrix.archive")
            except KeyError:
                pass

            await k8s_api_instance.core_api.patch_namespaced_config_map(
                name=item_name, namespace=crawler_namespace, body=item
            )
