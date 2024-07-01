""" Invite system management """

from datetime import datetime
from typing import Optional, Any
import os
import urllib.parse
import time
import hashlib
from uuid import UUID, uuid4

from pymongo.errors import AutoReconnect
import pymongo
from fastapi import HTTPException

from .pagination import DEFAULT_PAGE_SIZE
from .models import (
    UserRole,
    InvitePending,
    InviteRequest,
    InviteOut,
    User,
    Organization,
)
from .users import UserManager
from .emailsender import EmailSender
from .utils import is_bool


# ============================================================================
class InviteOps:
    """invite users (optionally to an org), send emails and delete invites"""

    invites: Any
    orgs: Any

    email: EmailSender
    allow_dupe_invites: bool

    def __init__(self, mdb, email: EmailSender):
        self.invites = mdb["invites"]
        self.orgs = mdb["organizations"]
        self.email = email
        self.allow_dupe_invites = is_bool(os.environ.get("ALLOW_DUPE_INVITES", "0"))

    async def init_index(self) -> None:
        """Create TTL index so that invites auto-expire"""
        while True:
            try:
                # Default to 7 days
                expire_after_seconds = int(
                    os.environ.get("INVITE_EXPIRE_SECONDS", "604800")
                )
                await self.invites.create_index(
                    "created", expireAfterSeconds=expire_after_seconds
                )
                break

            # pylint: disable=duplicate-code
            except AutoReconnect:
                print(
                    "Database connection unavailable to create index. Will try again in 5 scconds",
                    flush=True,
                )
                time.sleep(5)

            await self.invites.create_index([("oid", pymongo.HASHED)])
            await self.invites.create_index([("tokenHash", pymongo.HASHED)])

    async def add_new_user_invite(
        self,
        new_user_invite: InvitePending,
        invite_token: UUID,
        org_name: str,
        headers: Optional[dict],
    ) -> None:
        """Add invite for new user"""

        res = await self.invites.find_one(
            {"email": new_user_invite.email, "oid": new_user_invite.oid}
        )
        if res and not self.allow_dupe_invites:
            raise HTTPException(
                status_code=403, detail="This user has already been invited"
            )

        # Invitations to a specific org via API must include role, so if it's
        # absent assume this is a general invitation from superadmin.
        if not new_user_invite.role:
            new_user_invite.role = UserRole.OWNER

        if res:
            await self.invites.delete_one({"_id": res["_id"]})

        await self.invites.insert_one(new_user_invite.to_dict())

        self.email.send_user_invite(
            new_user_invite, invite_token, org_name, True, headers
        )

    # pylint: disable=too-many-arguments
    async def add_existing_user_invite(
        self,
        existing_user_invite: InvitePending,
        invite_token: UUID,
        invitee_user: User,
        user: User,
        org: Organization,
        org_name: str,
        headers: Optional[dict],
    ) -> None:
        """Add existing user invite"""

        if invitee_user.email == user.email:
            raise HTTPException(status_code=400, detail="Can't invite ourselves!")

        if org.users.get(str(invitee_user.id)):
            raise HTTPException(
                status_code=400, detail="User already a member of this organization."
            )

        res = await self.invites.find_one(
            {"userid": invitee_user.id, "oid": existing_user_invite.oid}
        )

        if res and not self.allow_dupe_invites:
            raise HTTPException(status_code=403, detail="user_already_invited_to_org")

        existing_user_invite.userid = invitee_user.id

        await self.invites.insert_one(existing_user_invite.to_dict())

        self.email.send_user_invite(
            existing_user_invite, invite_token, org_name, False, headers
        )

    async def get_valid_invite(
        self, invite_token: UUID, email: Optional[str], userid: Optional[UUID] = None
    ) -> InvitePending:
        """Retrieve a valid invite data from db, or throw if invalid"""
        token_hash = self.get_hash(invite_token)
        invite_data = await self.invites.find_one({"tokenHash": token_hash})
        if not invite_data:
            raise HTTPException(status_code=400, detail="invalid_invite")

        invite = InvitePending.from_dict(invite_data)

        if userid and invite.userid and userid != invite.userid:
            raise HTTPException(status_code=400, detail="invalid_invite")

        if email and invite.email and email != invite.email:
            raise HTTPException(status_code=400, detail="invalid_invite")

        return invite

    async def remove_invite(self, invite_token: UUID) -> None:
        """remove invite from invite list"""
        await self.invites.delete_one({"_id": invite_token})

    async def remove_invite_by_email(
        self, email: str, oid: Optional[UUID] = None
    ) -> Any:
        """remove invite from invite list by email"""
        query: dict[str, object] = {"email": email}
        if oid:
            query["oid"] = oid
        # Use delete_many rather than delete_one to clean up any duplicate
        # invites as well.
        return await self.invites.delete_many(query)

    # pylint: disable=too-many-arguments
    async def invite_user(
        self,
        invite: InviteRequest,
        user: User,
        user_manager: UserManager,
        org: Organization,
        headers: Optional[dict] = None,
    ) -> tuple[bool, UUID]:
        """Invite user to org (if not specified, to default org).

        :returns: is_new_user (bool)
        """
        org_name: str

        if org:
            oid = org.id
            org_name = org.name if str(org.name) != str(org.id) else ""
        else:
            default_org = await self.orgs.find_one({"default": True})
            oid = default_org["_id"]
            org_name = default_org["name"]

        invite_token = uuid4()

        invite_pending = InvitePending(
            id=uuid4(),
            oid=oid,
            created=datetime.utcnow(),
            role=invite.role if hasattr(invite, "role") else None,
            # URL decode email address just in case
            email=urllib.parse.unquote(invite.email),
            inviterEmail=user.email,
            fromSuperuser=user.is_superuser,
            tokenHash=self.get_hash(invite_token),
        )

        # user being invited
        invitee_user = await user_manager.get_by_email(invite.email)

        if invitee_user:
            await self.add_existing_user_invite(
                invite_pending,
                invite_token,
                invitee_user,
                user,
                org,
                org_name,
                headers,
            )
            return False, invite_token

        await self.add_new_user_invite(
            invite_pending,
            invite_token,
            org_name,
            headers,
        )
        return True, invite_token

    def get_hash(self, token: UUID):
        """get hash for token"""
        return hashlib.sha256(str(token).encode("utf-8")).hexdigest()

    async def get_pending_invites(
        self,
        users: UserManager,
        org: Optional[Organization] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ) -> tuple[list[InviteOut], int]:
        """return list of pending invites."""
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        match_query = {}
        if org:
            match_query["oid"] = org.id

        total = await self.invites.count_documents(match_query)

        cursor = self.invites.find(match_query, skip=skip, limit=page_size)
        results = await cursor.to_list(length=page_size)
        invites = [InvitePending.from_dict(res) for res in results]
        invite_outs = [await self.get_invite_out(invite, users) for invite in invites]

        return invite_outs, total

    async def get_invite_out(
        self, invite: InvitePending, users: UserManager, include_first_org_admin=False
    ) -> InviteOut:
        """format an InvitePending to return via api, resolve name of inviter"""
        inviter = await users.get_by_email(invite.inviterEmail)
        if not inviter:
            raise HTTPException(status_code=400, detail="invalid_invite")

        invite_out = InviteOut(
            created=invite.created,
            inviterEmail=invite.inviterEmail,
            inviterName=inviter.name,
            oid=invite.oid,
            role=invite.role,
            email=invite.email,
            userid=invite.userid,
        )

        if not invite.oid:
            return invite_out

        org = await users.org_ops.get_org_for_user_by_id(invite.oid, inviter)
        invite_out.orgName = org.name
        invite_out.orgSlug = org.slug

        if include_first_org_admin:
            invite_out.firstOrgAdmin = True
            for role in org.users.values():
                if role == UserRole.OWNER:
                    invite_out.firstOrgAdmin = False
                    break

        return invite_out


def init_invites(mdb, email: EmailSender) -> InviteOps:
    """init InviteOps"""
    return InviteOps(mdb, email)
