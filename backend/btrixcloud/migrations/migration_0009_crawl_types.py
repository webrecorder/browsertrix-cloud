"""
Migration 0009 - Crawl types
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0009"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Add type "crawl" to all existing crawls that don't already have a type
        """
        crawls = self.mdb["crawls"]
        try:
            await crawls.update_many(
                {"type": {"$eq": None}}, {"$set": {"type": "crawl"}}
            )
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(f"Error adding type 'crawl' to existing crawls: {err}", flush=True)
