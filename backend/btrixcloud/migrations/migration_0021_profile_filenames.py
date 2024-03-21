"""
Migration 0021 - Profile filenames
"""

from btrixcloud.crawlmanager import CrawlManager
from btrixcloud.migrations import BaseMigration
from btrixcloud.models import CrawlConfig, Profile, UpdateCrawlConfig


MIGRATION_VERSION = "0021"


# pylint: disable=duplicate-code, broad-exception-caught
class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Add `profiles/` prefix to all profile filenames without it and
        update configmaps.
        """
        mdb_profiles = self.mdb["profiles"]
        mdb_crawl_configs = self.mdb["crawl_configs"]

        async for profile_res in mdb_profiles.find({}):
            profile = Profile.from_dict(profile_res)
            if not profile.resource:
                continue

            filename = profile.resource.filename
            if not filename.startswith("profiles/"):
                try:
                    await mdb_profiles.find_one_and_update(
                        {"_id": profile.id},
                        {"$set": {"resource.filename": f"profiles/{filename}"}},
                    )
                except Exception as err:
                    print(
                        f"Error updating filename for profile {profile.name}: {err}",
                        flush=True,
                    )

        # Update profile filenames in configmaps
        crawl_manager = CrawlManager()
        match_query = {"profileid": {"$nin": ["", None]}}
        async for config_dict in mdb_crawl_configs.find(match_query):
            config = CrawlConfig.from_dict(config_dict)

            profile_res = await mdb_profiles.find_one({"_id": config.profileid})
            if not profile_res:
                continue

            profile = Profile.from_dict(profile_res)
            if not profile.resource:
                continue

            updated_filename = profile.resource.filename
            print(
                f"Updating Crawl Config {config.id}: profile_filename: {updated_filename}"
            )
            try:
                await crawl_manager.update_crawl_config(
                    config, UpdateCrawlConfig(), profile_filename=updated_filename
                )
            # pylint: disable=broad-except
            except Exception as exc:
                print(
                    "Skip crawl config migration due to error, likely missing config",
                    exc,
                )
