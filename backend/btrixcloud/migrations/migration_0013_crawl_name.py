"""
Migration 0013 - Copy config name to crawls
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0013"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Copy crawl config names to associated crawls.
        """
        # pylint: disable=duplicate-code
        crawls = self.mdb["crawls"]
        crawl_configs = self.mdb["crawl_configs"]

        async for config in crawl_configs.find({"inactive": {"$ne": True}}):
            config_id = config["_id"]
            try:
                if not config.get("name"):
                    continue
                await crawls.update_many(
                    {"cid": config_id}, {"$set": {"name": config.get("name")}}
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Unable to set name for crawls from with config {config_id}: {err}",
                    flush=True,
                )
