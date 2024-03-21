"""
Migration 0017 - Calculate and store org storage usage by type
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0017"


# pylint: disable=too-many-locals, duplicate-code
class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Calculate and store org storage usage
        """
        mdb_orgs = self.mdb["organizations"]
        mdb_crawls = self.mdb["crawls"]
        mdb_profiles = self.mdb["profiles"]

        async for org in mdb_orgs.find({}):
            oid = org.get("_id")

            bytes_stored_crawls = 0
            bytes_stored_uploads = 0
            bytes_stored_profiles = 0

            async for crawl in mdb_crawls.find(
                {"oid": oid, "type": {"$in": [None, "crawl"]}}
            ):
                for crawl_file in crawl.get("files", []):
                    bytes_stored_crawls += crawl_file.get("size", 0)

            async for upload in mdb_crawls.find({"oid": oid, "type": "upload"}):
                for upload_file in upload.get("files", []):
                    bytes_stored_uploads += upload_file.get("size", 0)

            async for profile in mdb_profiles.find({"oid": oid}):
                profile_file = profile.get("resource")
                if profile_file:
                    bytes_stored_profiles += profile_file.get("size", 0)

            org_total_bytes = (
                bytes_stored_crawls + bytes_stored_uploads + bytes_stored_profiles
            )

            try:
                await mdb_orgs.find_one_and_update(
                    {"_id": oid},
                    {
                        "$set": {
                            "bytesStored": org_total_bytes,
                            "bytesStoredCrawls": bytes_stored_crawls,
                            "bytesStoredUploads": bytes_stored_uploads,
                            "bytesStoredProfiles": bytes_stored_profiles,
                        }
                    },
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Unable to set bytes stored by type for org {oid}: {err}",
                    flush=True,
                )
