"""
Migration 0023 -- Available extra/gifted minutes
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0023"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Add extraExecSecondsAvailable and giftedExecSecondsAvailable to org.
        Initialize at 0 to avoid them being None.

        Also add monthlyExecSeconds and copy previous crawlExecSeconds values
        to it.
        """
        # pylint: disable=duplicate-code
        mdb_orgs = self.mdb["organizations"]

        query = {
            "extraExecSecondsAvailable": None,
            "giftedExecSecondsAvailable": None,
        }
        async for org in mdb_orgs.find(query):
            oid = org["_id"]
            try:
                await mdb_orgs.find_one_and_update(
                    {"_id": oid},
                    {
                        "$set": {
                            "extraExecSecondsAvailable": 0,
                            "giftedExecSecondsAvailable": 0,
                        }
                    },
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error adding exec seconds available fields to org {oid}: {err}",
                    flush=True,
                )

        async for org in mdb_orgs.find({"monthlyExecSeconds": None}):
            oid = org["_id"]
            try:
                await mdb_orgs.update_one(
                    {"_id": oid},
                    [{"$set": {"monthlyExecSeconds": "$crawlExecSeconds"}}],
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error copying crawlExecSeconds to monthlyExecSeconds for org {oid}: {err}",
                    flush=True,
                )
