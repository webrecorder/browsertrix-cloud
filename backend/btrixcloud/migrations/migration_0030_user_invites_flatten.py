"""
Migration 0030 - Move user invites from user.invites to invites collection
"""

from btrixcloud.migrations import BaseMigration
from btrixcloud.models import InvitePending
from btrixcloud.invites import get_hash

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

        # flatten user invites
        async for user in users_db.find({"invites": {"$nin": [None, {}]}}):
            for user_invite in user["invites"].values():
                user_invite["email"] = user["email"]
                print("Migrating existing user invite", user_invite)
                invite = InvitePending(
                    userid=user["id"],
                    tokenHash=get_hash(user_invite["id"]),
                    **user_invite
                )
                await invites_db.insert_one(invite.to_dict())

            await users_db.find_one_and_update(
                {"_id": user["_id"]}, {"$unset": {"invites": 1}}
            )

        # add tokenHash to existing invites without it
        # note that tokenHash is of the existing _id
        # for new invites, the tokenHash will be of a separate uuid that is not stored
        async for invite_data in invites_db.find({"tokenHash": {"$eq": None}}):
            print("Migrating new user invite", invite_data)
            await invites_db.find_one_and_update(
                {"_id": invite_data["_id"]},
                {"$set": {"tokenHash": get_hash(invite_data["_id"])}},
            )
