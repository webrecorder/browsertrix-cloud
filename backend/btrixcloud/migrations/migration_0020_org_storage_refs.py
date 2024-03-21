"""
Migration 0020 - New Storage Ref System
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0020"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Convert storages to new storage ref system
        - If default storage, convert to string
        - If custom storage, add storage, convert to new name
        """
        # pylint: disable=duplicate-code, broad-exception-caught, too-many-locals
        mdb_orgs = self.mdb["organizations"]
        default_name = "default"
        async for org in mdb_orgs.find({"storage.custom": None}):
            oid = org["_id"]
            storage = org["storage"]

            if storage.get("type") == "default":
                if storage.get("name"):
                    default_name = storage.get("name")
                update_dict = {"storage": {"name": default_name, "custom": False}}

            elif storage.get("type") == "s3":
                update_dict = {
                    "storage": {"name": storage.get("name"), "custom": True},
                    "customStorages": {"custom": storage},
                }

            try:
                await mdb_orgs.find_one_and_update({"_id": oid}, {"$set": update_dict})
            except Exception as err:
                print(f"Error updating storage for {oid}: {err}", flush=True)

        # CrawlFile Migrations
        mdb_crawls = self.mdb["crawls"]
        async for crawl in mdb_crawls.find({}):
            crawl_id = crawl["_id"]
            crawl_files = []
            for file_ in crawl["files"]:
                if file_.get("storage"):
                    crawl_files.append(file_)
                    continue

                storage_name = file_.pop("def_storage_name", None)
                if not storage_name:
                    storage_name = default_name
                file_["storage"] = {"name": storage_name, "custom": False}
                crawl_files.append(file_)
            try:
                await mdb_crawls.find_one_and_update(
                    {"_id": crawl_id}, {"$set": {"files": crawl_files}}
                )
            except Exception as err:
                print(
                    f"Error updating crawl file storage for crawl {crawl_id}: {err}",
                    flush=True,
                )

        # ProfileFile Migrations
        mdb_profiles = self.mdb["profiles"]
        async for profile in mdb_profiles.find({}):
            profile_id = profile["_id"]
            file_ = profile.get("resource")
            if not file_:
                continue

            if file_.get("storage"):
                continue

            storage_name = file_.pop("def_storage_name", None)
            if not storage_name:
                storage_name = default_name
            file_["storage"] = {"name": storage_name, "custom": False}
            try:
                await mdb_profiles.find_one_and_update(
                    {"_id": profile_id}, {"$set": {"resource": file_}}
                )
            except Exception as err:
                print(
                    f"Error updating profile storage for profile {profile['name']}: {err}",
                    flush=True,
                )
