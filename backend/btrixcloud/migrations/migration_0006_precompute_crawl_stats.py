"""
Migration 0006 - Precomputing workflow crawl stats
"""

from btrixcloud.crawlconfigs import stats_recompute_all
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0006"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Add data on workflow crawl statistics that was previously dynamically
        computed when needed to the database.
        """
        # pylint: disable=duplicate-code
        crawl_configs = self.mdb["crawl_configs"]
        crawls = self.mdb["crawls"]

        async for config in crawl_configs.find({"inactive": {"$ne": True}}):
            config_id = config["_id"]
            try:
                await stats_recompute_all(crawl_configs, crawls, config_id)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(f"Unable to update workflow {config_id}: {err}", flush=True)
