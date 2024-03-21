"""
Migration 0016 - Updating scheduled cron jobs after Operator changes v2
"""

import os
from btrixcloud.models import CrawlConfig, UpdateCrawlConfig
from btrixcloud.crawlmanager import CrawlManager
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0016"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Find existing workflows with schedule and create new crawl_cron_jobs
        from template, back in crawlers workspace and using noop image
        """
        # pylint: disable=too-many-locals, duplicate-code
        crawl_configs = self.mdb["crawl_configs"]
        crawl_manager = CrawlManager()

        # Update configmap for crawl configs that have non-zero timeout or scale > 1
        match_query = {"schedule": {"$nin": ["", None]}}
        async for config_dict in crawl_configs.find(match_query):
            config = CrawlConfig.from_dict(config_dict)
            print(
                f"Updating CronJob for Crawl Config {config.id}: schedule: {config.schedule}"
            )
            try:
                await crawl_manager.update_crawl_config(
                    config,
                    UpdateCrawlConfig(
                        schedule=config.schedule,
                    ),
                )
            # pylint: disable=broad-except
            except Exception as exc:
                print(
                    "Skip crawl config migration due to error, likely missing config",
                    exc,
                )

        # Delete existing scheduled jobs from default namespace
        print("Deleting cronjobs from default namespace")

        default_namespace = os.environ.get("DEFAULT_NAMESPACE", "default")

        await crawl_manager.batch_api.delete_collection_namespaced_cron_job(
            namespace=default_namespace, label_selector="btrix.crawlconfig"
        )
        result = await crawl_manager.batch_api.list_namespaced_cron_job(
            namespace=default_namespace, label_selector="btrix.crawlconfig"
        )
        assert len(result.items) == 0
