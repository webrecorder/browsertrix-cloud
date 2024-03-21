"""
Migration 0022 -- Partial Complete
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0022"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Convert partial_complete -> complete, stopped_by_user or stopped_quota_reached
        """
        # pylint: disable=duplicate-code
        crawls = self.mdb["crawls"]
        crawl_configs = self.mdb["crawl_configs"]

        await crawls.update_many(
            {"state": "partial_complete", "stopping": True},
            {"$set": {"state": "stopped_by_user"}},
        )
        await crawls.update_many(
            {"state": "partial_complete", "stopping": {"$ne": True}},
            {"$set": {"state": "complete"}},
        )

        async for config in crawl_configs.find({"lastCrawlState": "partial_complete"}):
            crawl = await crawls.find_one({"_id": config.get("lastCrawlId")})
            if not crawl:
                continue

            await crawl_configs.find_one_and_update(
                {"_id": config.get("_id")},
                {"$set": {"lastCrawlState": crawl.get("state")}},
            )
