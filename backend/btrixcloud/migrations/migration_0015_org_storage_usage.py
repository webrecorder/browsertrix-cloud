"""
Migration 0015 - Calculate and store org storage usage
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0015"


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

            bytes_stored = 0

            async for crawl in mdb_crawls.find({"oid": oid}):
                for crawl_file in crawl.get("files", []):
                    bytes_stored += crawl_file.get("size", 0)

            async for profile in mdb_profiles.find({"oid": oid}):
                profile_file = profile.get("resource")
                if profile_file:
                    bytes_stored += profile_file.get("size", 0)

            try:
                await mdb_orgs.find_one_and_update(
                    {"_id": oid}, {"$set": {"bytesStored": bytes_stored}}
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Unable to set bytes stored for org {oid}: {err}",
                    flush=True,
                )
