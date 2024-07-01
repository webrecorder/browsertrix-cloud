"""
Migration 0030 - Move user invites from user.invites to invites collection
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0030"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Iterate over all users that have invites to other orgs
        Add the invites to the invites collection instead
        """
        users_db = self.mdb["users"]
        invites_db = self.mdb["invites"]

        cursor = users_db.find({"invites": {"$ne": {}}})
        async for user_data in cursor:
            for user_invite in user_data["invites"].values():
                user_invite["email"] = user_data["email"]
                user_invite["userid"] = user_data["id"]
                await invites_db.insert_one(user_invite)

            await users_db.find_one_and_update(
                {"_id": user_data["_id"]}, {"$unset": {"invites": 1}}
            )
