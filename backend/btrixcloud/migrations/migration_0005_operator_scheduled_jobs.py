"""
Migration 0005 - Updating scheduled cron jobs after Operator changes
"""

from btrixcloud.models import CrawlConfig, UpdateCrawlConfig
from btrixcloud.crawlmanager import CrawlManager
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0005"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Find existing workflows with schedule and create new crawl_cron_jobs
        from template for each, then delete existing scheduled jobs from
        crawler namespace.

        Additionally update the configmap for crawl configs with scale > 1
        or crawlTimeout > 0.
        """
        # pylint: disable=too-many-locals, duplicate-code
        crawl_configs = self.mdb["crawl_configs"]
        crawl_manager = CrawlManager()

        # Update configmap for crawl configs that have non-zero timeout or scale > 1
        match_query = {
            "$or": [
                {"crawlTimeout": {"$gt": 0}},
                {"scale": {"$gt": 1}},
                {"schedule": {"$nin": ["", None]}},
            ]
        }
        async for config_dict in crawl_configs.find(match_query):
            config = CrawlConfig.from_dict(config_dict)
            print(
                f"Updating Crawl Config {config.id}: schedule: {config.schedule}, "
                + f"timeout: {config.crawlTimeout}, scale: {config.scale}"
            )
            try:
                await crawl_manager.update_crawl_config(
                    config,
                    UpdateCrawlConfig(
                        scale=config.scale,
                        crawlTimeout=config.crawlTimeout,
                        schedule=config.schedule,
                    ),
                )
            # pylint: disable=broad-except
            except Exception as exc:
                print(
                    "Skip crawl config migration due to error, likely missing config",
                    exc,
                )

        # Delete existing scheduled jobs from crawler namespace
        print("Deleting cronjobs from crawler namespace")
        await crawl_manager.batch_api.delete_collection_namespaced_cron_job(
            namespace=crawl_manager.namespace
        )
        result = await crawl_manager.batch_api.list_namespaced_cron_job(
            namespace=crawl_manager.namespace
        )
        assert len(result.items) == 0
