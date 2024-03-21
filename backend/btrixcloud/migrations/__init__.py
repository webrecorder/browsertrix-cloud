"""
BaseMigration class to subclass in each migration module
"""

import os
from pymongo.errors import OperationFailure


class MigrationError(Exception):
    """Custom migration exception class"""


class BaseMigration:
    """Base Migration class."""

    def __init__(self, mdb, migration_version="0001"):
        self.mdb = mdb
        self.migration_version = migration_version
        self.rerun_from_migration = os.environ.get("RERUN_FROM_MIGRATION")

    async def get_db_version(self):
        """Get current db version from database."""
        db_version = None
        version_collection = self.mdb["version"]
        version_record = await version_collection.find_one()
        if not version_record:
            return db_version
        try:
            db_version = version_record["version"]
        except KeyError:
            pass
        return db_version

    async def set_db_version(self):
        """Set db version to migration_version."""
        version_collection = self.mdb["version"]
        await version_collection.find_one_and_update(
            {}, {"$set": {"version": self.migration_version}}, upsert=True
        )

    async def migrate_up_needed(self, ignore_rerun=False):
        """Verify migration up is needed and return boolean indicator."""
        db_version = await self.get_db_version()
        print(f"Current database version before migration: {db_version}")
        print(f"Migration available to apply: {self.migration_version}")
        # Databases from prior to migrations will not have a version set.
        if not db_version:
            return True
        if db_version < self.migration_version:
            return True

        if (
            not ignore_rerun
            and self.rerun_from_migration
            and self.rerun_from_migration <= self.migration_version
        ):
            print(f"Rerunning migrations from: {self.migration_version}")
            return True
        return False

    async def migrate_up(self):
        """Perform migration up."""
        raise NotImplementedError(
            "Not implemented in base class - implement in subclass"
        )

    async def run(self):
        """Run migrations."""
        if await self.migrate_up_needed():
            print("Performing migration up", flush=True)
            try:
                await self.migrate_up()
                await self.set_db_version()
            except OperationFailure as err:
                print(f"Error running migration {self.migration_version}: {err}")
                return False

        else:
            print("No migration to apply - skipping", flush=True)
            return False

        print(f"Database successfully migrated to {self.migration_version}", flush=True)
        return True
