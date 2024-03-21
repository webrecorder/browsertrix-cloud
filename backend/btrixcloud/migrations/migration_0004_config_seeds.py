"""
Migration 0004 - Ensuring all config.seeds are Seeds not HttpUrls
"""

from pydantic import HttpUrl

from btrixcloud.models import Crawl, CrawlConfig, ScopeType, Seed
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0004"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Convert any crawlconfig.config.seed HttpUrl values to Seeds with url value.
        """
        # pylint: disable=too-many-branches

        # Migrate workflows
        crawl_configs = self.mdb["crawl_configs"]

        async for config_dict in crawl_configs.find({}):
            seeds_to_migrate = []
            seed_dicts = []

            seed_list = config_dict["config"]["seeds"]
            for seed in seed_list:
                if isinstance(seed, HttpUrl):
                    new_seed = Seed(url=str(seed.url), scopeType=ScopeType.PAGE)
                    seeds_to_migrate.append(new_seed)
                elif isinstance(seed, str):
                    new_seed = Seed(url=str(seed), scopeType=ScopeType.PAGE)
                    seeds_to_migrate.append(new_seed)
                elif isinstance(seed, Seed):
                    seeds_to_migrate.append(seed)

            for seed in seeds_to_migrate:
                seed_dict = {
                    "url": str(seed.url),
                    "scopeType": seed.scopeType,
                    "include": seed.include,
                    "exclude": seed.exclude,
                    "sitemap": seed.sitemap,
                    "allowHash": seed.allowHash,
                    "depth": seed.depth,
                    "extraHops": seed.extraHops,
                }
                seed_dicts.append(seed_dict)

            if seed_dicts:
                await crawl_configs.find_one_and_update(
                    {"_id": config_dict["_id"]},
                    {"$set": {"config.seeds": seed_dicts}},
                )

        # Migrate seeds copied into crawls
        crawls = self.mdb["crawls"]

        async for crawl_dict in crawls.find({}):
            seeds_to_migrate = []
            seed_dicts = []

            seed_list = crawl_dict["config"]["seeds"]
            for seed in seed_list:
                if isinstance(seed, HttpUrl):
                    new_seed = Seed(url=str(seed.url), scopeType=ScopeType.PAGE)
                    seeds_to_migrate.append(new_seed)
                elif isinstance(seed, str):
                    new_seed = Seed(url=str(seed), scopeType=ScopeType.PAGE)
                    seeds_to_migrate.append(new_seed)
                elif isinstance(seed, Seed):
                    seeds_to_migrate.append(seed)

            for seed in seeds_to_migrate:
                seed_dict = {
                    "url": str(seed.url),
                    "scopeType": seed.scopeType,
                    "include": seed.include,
                    "exclude": seed.exclude,
                    "sitemap": seed.sitemap,
                    "allowHash": seed.allowHash,
                    "depth": seed.depth,
                    "extraHops": seed.extraHops,
                }
                seed_dicts.append(seed_dict)

            if seed_dicts:
                await crawls.find_one_and_update(
                    {"_id": crawl_dict["_id"]},
                    {"$set": {"config.seeds": seed_dicts}},
                )

        # Test migration
        async for config_dict in crawl_configs.find({}):
            config = CrawlConfig.from_dict(config_dict)
            seeds = config.config.seeds or []
            for seed in seeds:
                assert isinstance(seed, Seed)
                assert seed.url

        async for crawl_dict in crawls.find({}):
            crawl = Crawl.from_dict(crawl_dict)
            seeds = crawl.config.seeds or []
            for seed in seeds:
                assert isinstance(seed, Seed)
                assert seed.url
