"""
Migration 0008 - Precomputing crawl file stats
"""

from btrixcloud.crawls import recompute_crawl_file_count_and_size
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0008"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Add data on crawl file count and size to database that was previously
        dynamically generated in the API endpoints.
        """
        # pylint: disable=duplicate-code
        crawls = self.mdb["crawls"]

        async for crawl in crawls.find({}):
            crawl_id = crawl["_id"]
            try:
                await recompute_crawl_file_count_and_size(crawls, crawl_id)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(f"Unable to update crawl {crawl_id}: {err}", flush=True)
