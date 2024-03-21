"""
Migration 0010 - Precomputing collection total size
"""

from btrixcloud.colls import CollectionOps
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0010"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Recompute collection data to include totalSize.
        """
        # pylint: disable=duplicate-code
        coll_ops = CollectionOps(self.mdb, None, None, None)

        async for coll in coll_ops.collections.find({}):
            coll_id = coll["_id"]
            try:
                await coll_ops.update_collection_counts_and_tags(coll_id)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(f"Unable to update collection {coll_id}: {err}", flush=True)
