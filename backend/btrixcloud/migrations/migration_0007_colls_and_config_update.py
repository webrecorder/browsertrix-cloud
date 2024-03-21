"""
Migration 0007 - Workflows changes

- Rename colls to autoAddCollections 
- Re-calculate workflow crawl stats to populate crawlSuccessfulCount
"""

from btrixcloud.crawlconfigs import stats_recompute_all
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0007"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up."""
        # pylint: disable=duplicate-code
        crawl_configs = self.mdb["crawl_configs"]
        crawls = self.mdb["crawls"]

        # Update workflows crawl stats to populate crawlSuccessfulCount
        async for config in crawl_configs.find({"inactive": {"$ne": True}}):
            config_id = config["_id"]
            try:
                await stats_recompute_all(crawl_configs, crawls, config_id)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(f"Unable to update workflow {config_id}: {err}", flush=True)

        # Make sure crawls have collections array
        await crawls.update_many({"collections": None}, {"$set": {"collections": []}})

        # Rename colls to autoAddCollections
        await crawl_configs.update_many({}, {"$unset": {"autoAddCollections": 1}})
        await crawl_configs.update_many(
            {}, {"$rename": {"colls": "autoAddCollections"}}
        )
        await crawl_configs.update_many({}, {"$unset": {"colls": 1}})
