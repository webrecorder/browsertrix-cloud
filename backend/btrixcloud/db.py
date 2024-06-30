"""
Browsertrix API Mongo DB initialization
"""

import importlib.util
import os
import urllib
import asyncio
from uuid import UUID

from typing import Optional, Union, TypeVar, Type

import motor.motor_asyncio
from pydantic import BaseModel
from pymongo.errors import InvalidName

from .migrations import BaseMigration


CURR_DB_VERSION = "0030"


# ============================================================================
def resolve_db_url():
    """get the mongo db url, either from MONGO_DB_URL or
    from separate username, password and host settings"""
    db_url = os.environ.get("MONGO_DB_URL")
    if db_url:
        return db_url

    mongo_user = urllib.parse.quote_plus(os.environ["MONGO_INITDB_ROOT_USERNAME"])
    mongo_pass = urllib.parse.quote_plus(os.environ["MONGO_INITDB_ROOT_PASSWORD"])
    mongo_host = os.environ["MONGO_HOST"]

    return f"mongodb://{mongo_user}:{mongo_pass}@{mongo_host}:27017"


# ============================================================================
def init_db():
    """initialize the mongodb connector"""

    db_url = resolve_db_url()

    client = motor.motor_asyncio.AsyncIOMotorClient(
        db_url,
        uuidRepresentation="standard",
        connectTimeoutMS=120000,
        serverSelectionTimeoutMS=120000,
    )

    mdb = client["browsertrixcloud"]

    return client, mdb


# ============================================================================
async def ping_db(mdb):
    """run in loop until db is up, set db_inited['inited'] property to true"""
    print("Waiting DB", flush=True)
    while True:
        try:
            result = await mdb.command("ping")
            assert result.get("ok")
            print("DB reached")
            break
        # pylint: disable=broad-exception-caught
        except Exception:
            print("Retrying, waiting for DB to be ready")
            await asyncio.sleep(3)


# ============================================================================
async def update_and_prepare_db(
    # pylint: disable=R0913
    mdb,
    user_manager,
    org_ops,
    crawl_ops,
    crawl_config_ops,
    coll_ops,
    invite_ops,
    storage_ops,
    page_ops,
    db_inited,
):
    """Prepare database for application.

    - Run database migrations
    - Recreate indexes
    - Create/update superuser
    - Create/update default org

    """
    await ping_db(mdb)
    print("Database setup started", flush=True)
    if await run_db_migrations(mdb, user_manager, page_ops):
        await drop_indexes(mdb)
    await create_indexes(
        org_ops,
        crawl_ops,
        crawl_config_ops,
        coll_ops,
        invite_ops,
        user_manager,
        page_ops,
    )
    await user_manager.create_super_user()
    await org_ops.create_default_org()
    await org_ops.check_all_org_default_storages(storage_ops)
    db_inited["inited"] = True
    print("Database updated and ready", flush=True)


# ============================================================================
async def run_db_migrations(mdb, user_manager, page_ops):
    """Run database migrations."""

    # if first run, just set version and exit
    if not await user_manager.get_superuser():
        base_migration = BaseMigration(mdb, CURR_DB_VERSION)
        await base_migration.set_db_version()
        print(
            "New DB, no migration needed, set version to: " + CURR_DB_VERSION,
            flush=True,
        )
        return False

    migrations_run = False
    migrations_path = "/app/btrixcloud/migrations"
    module_files = [
        f
        for f in sorted(os.listdir(migrations_path))
        if not os.path.isdir(os.path.join(migrations_path, f))
        and not f.startswith("__")
    ]
    for module_file in module_files:
        module_path = os.path.join(migrations_path, module_file)
        try:
            migration_name = os.path.basename(module_file).rstrip(".py")
            spec = importlib.util.spec_from_file_location(
                f".migrations.{migration_name}", module_path
            )
            assert spec
            assert spec.loader
            migration_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(migration_module)
            migration = migration_module.Migration(mdb, page_ops=page_ops)
            if await migration.run():
                migrations_run = True
        except ImportError as err:
            print(
                f"Error importing Migration class from module {module_file}: {err}",
                flush=True,
            )
    return migrations_run


# ============================================================================
async def await_db_and_migrations(mdb, db_inited):
    """await that db is available and any migrations in progress finish"""
    await ping_db(mdb)
    print("Database setup started", flush=True)

    base_migration = BaseMigration(mdb, CURR_DB_VERSION)
    while await base_migration.migrate_up_needed(ignore_rerun=True):
        version = await base_migration.get_db_version()
        print(
            f"Waiting for migrations to finish, DB at {version}, latest {CURR_DB_VERSION}",
            flush=True,
        )

        await asyncio.sleep(5)

    db_inited["inited"] = True
    print("Database updated and ready", flush=True)


# ============================================================================
async def drop_indexes(mdb):
    """Drop all database indexes."""
    print("Dropping database indexes", flush=True)
    collection_names = await mdb.list_collection_names()
    for collection in collection_names:
        try:
            current_coll = mdb[collection]
            await current_coll.drop_indexes()
            print(f"Indexes for collection {collection} dropped")
        except InvalidName:
            continue


# ============================================================================
# pylint: disable=too-many-arguments
async def create_indexes(
    org_ops, crawl_ops, crawl_config_ops, coll_ops, invite_ops, user_manager, page_ops
):
    """Create database indexes."""
    print("Creating database indexes", flush=True)
    await org_ops.init_index()
    await crawl_ops.init_index()
    await crawl_config_ops.init_index()
    await coll_ops.init_index()
    await invite_ops.init_index()
    await user_manager.init_index()
    await page_ops.init_index()


# ============================================================================
T = TypeVar("T")


# ============================================================================
class BaseMongoModel(BaseModel):
    """Base pydantic model that is also a mongo doc"""

    id: Optional[Union[UUID, str]]

    @property
    def id_str(self):
        """Return id as str"""
        return str(self.id)

    @classmethod
    def from_dict(cls: Type[T], data: dict) -> T:
        """convert dict from mongo to a class"""
        if not data:
            return cls()
        data["id"] = data.pop("_id")
        return cls(**data)

    def serialize(self, **opts):
        """convert class to dict"""
        return self.dict(
            exclude_unset=True, exclude_defaults=True, exclude_none=True, **opts
        )

    def to_dict(self, **opts):
        """convert to dict for mongo"""
        res = self.dict(**opts)
        res["_id"] = res.pop("id", "")
        return res
