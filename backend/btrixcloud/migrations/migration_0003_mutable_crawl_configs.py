"""
Migration 0003 - Mutable crawl configs and crawl revision history
"""

from datetime import datetime

from btrixcloud.models import Crawl, CrawlConfig
from btrixcloud.migrations import BaseMigration, MigrationError


MIGRATION_VERSION = "0003"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Set new crawl_configs fields and add config details to crawls.
        """
        # pylint: disable=too-many-locals, too-many-branches
        crawls = self.mdb["crawls"]
        crawl_configs = self.mdb["crawl_configs"]

        # Return early if there are no configs
        if not await crawl_configs.count_documents({}):
            return

        utc_now_datetime = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        await crawl_configs.update_many(
            {"createdBy": None}, [{"$set": {"createdBy": "$userid"}}]
        )
        await crawl_configs.update_many(
            {"modifiedBy": None}, [{"$set": {"modifiedBy": "$userid"}}]
        )
        await crawl_configs.update_many({}, {"$unset": {"userid": 1}})
        await crawl_configs.update_many(
            {"created": None}, {"$set": {"created": utc_now_datetime}}
        )
        await crawl_configs.update_many({}, [{"$set": {"modified": "$created"}}])
        await crawl_configs.update_many({}, {"$set": {"rev": 0}})

        await crawls.update_many({}, {"$set": {"cid_rev": 0}})

        async for crawl_result in crawls.find({}):
            config_result = await crawl_configs.find_one({"_id": crawl_result["cid"]})
            if not config_result:
                continue

            await crawls.find_one_and_update(
                {"_id": crawl_result["_id"]},
                {
                    "$set": {
                        "config": config_result["config"],
                        "profileid": config_result.get("profileid"),
                        "schedule": config_result.get("schedule"),
                        "crawlTimeout": config_result.get("crawlTimeout"),
                        "jobType": config_result.get("jobType"),
                    }
                },
            )

        # Test that migration went as expected
        sample_config_result = await crawl_configs.find_one({})
        sample_config = CrawlConfig.from_dict(sample_config_result)
        if not sample_config.createdBy or (
            sample_config.createdBy != sample_config.modifiedBy
        ):
            raise MigrationError(
                "Crawl config createdBy and modifiedBy set incorrectly by migration"
            )
        if sample_config.modified != sample_config.created:
            raise MigrationError(
                "Crawl config modified set incorrectly by migration - should be equal to created"
            )
        if sample_config.rev != 0:
            raise MigrationError("Crawl config rev set incorrectly by migration")

        no_created_results = await crawl_configs.find_one({"created": None})
        if no_created_results:
            raise MigrationError("Crawl config created not set by migration")

        sample_crawl_result = await crawls.find_one({})
        sample_crawl = Crawl.from_dict(sample_crawl_result)
        if sample_crawl.cid_rev != 0:
            raise MigrationError("Crawl cid_rev set incorrectly by migration")

        matching_config_result = await crawl_configs.find_one({"_id": sample_crawl.cid})
        matching_config = CrawlConfig.from_dict(matching_config_result)
        if sample_crawl.profileid != matching_config.profileid:
            raise MigrationError(
                f"Crawl profileid {sample_crawl.profileid} doesn't match config"
            )
        if sample_crawl.schedule != matching_config.schedule:
            raise MigrationError(
                f"Crawl schedule {sample_crawl.schedule} doesn't match config"
            )
        if sample_crawl.crawlTimeout != matching_config.crawlTimeout:
            raise MigrationError(
                f"Crawl timeout {sample_crawl.crawlTimeout} doesn't match config"
            )

        if not sample_crawl.config.seeds:
            raise MigrationError("Crawl config missing after migration")
