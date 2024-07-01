"""
FastAPI user handling (via fastapi-users)
"""

import os
from uuid import UUID, uuid4
import asyncio

from typing import Optional, List, TYPE_CHECKING, cast, Callable

from pydantic import EmailStr

from fastapi import (
    Request,
    HTTPException,
    Depends,
    APIRouter,
    Body,
)

from pymongo.errors import DuplicateKeyError
from pymongo.collation import Collation

from .models import (
    UserCreate,
    UserCreateIn,
    UserUpdateEmailName,
    UserUpdatePassword,
    User,
    UserOrgInfoOut,
    UserOut,
    UserRole,
    InviteOut,
    Organization,
    PaginatedResponse,
    FailedLogin,
)
from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .utils import is_bool

from .auth import (
    init_jwt_auth,
    RESET_AUD,
    RESET_ALLOW_AUD,
    VERIFY_AUD,
    VERIFY_ALLOW_AUD,
    RESET_VERIFY_TOKEN_LIFETIME_MINUTES,
    verify_and_update_password,
    get_password_hash,
    generate_password,
    generate_jwt,
    decode_jwt,
)

if TYPE_CHECKING:
    from .invites import InviteOps
    from .emailsender import EmailSender
    from .orgs import OrgOps
    from .basecrawls import BaseCrawlOps
    from .crawlconfigs import CrawlConfigOps
else:
    InviteOps = EmailSender = OrgOps = BaseCrawlOps = CrawlConfigOps = object


# ============================================================================
# pylint: disable=raise-missing-from, too-many-public-methods, too-many-instance-attributes
class UserManager:
    """Browsertrix UserManager"""

    invites: InviteOps
    email: EmailSender

    org_ops: OrgOps
    base_crawl_ops: BaseCrawlOps
    crawl_config_ops: CrawlConfigOps

    def __init__(self, mdb, email, invites):
        self.users = mdb.get_collection("users")
        self.failed_logins = mdb.get_collection("logins")
        self.email = email
        self.invites = invites

        self.org_ops = cast(OrgOps, None)
        self.crawl_config_ops = cast(CrawlConfigOps, None)
        self.base_crawl_ops = cast(BaseCrawlOps, None)

        self.email_collation = Collation("en", strength=2)

        self.registration_enabled = is_bool(os.environ.get("REGISTRATION_ENABLED"))
        self.register_to_org_id = os.environ.get("REGISTER_TO_ORG_ID")

    # pylint: disable=attribute-defined-outside-init
    def set_ops(self, org_ops, crawl_config_ops, base_crawl_ops):
        """set org ops"""
        self.org_ops = org_ops
        self.crawl_config_ops = crawl_config_ops
        self.base_crawl_ops = base_crawl_ops

    async def init_index(self):
        """init lookup index"""
        await self.users.create_index("id", unique=True)
        await self.users.create_index("email", unique=True)

        await self.users.create_index(
            "email",
            name="case_insensitive_email_index",
            collation=self.email_collation,
        )

        # Expire failed logins object after one hour
        await self.failed_logins.create_index("attempted", expireAfterSeconds=3600)

    async def register(
        self, user: UserCreateIn, request: Optional[Request] = None
    ) -> User:
        """override user creation to check if invite token is present"""
        user.name = user.name or user.email

        # if open registration not enabled, can only register with an invite
        if not self.registration_enabled and not user.inviteToken:
            raise HTTPException(status_code=400, detail="invite_token_required")

        if user.inviteToken:
            # will raise if invite is invalid
            await self.invites.get_valid_invite(user.inviteToken, user.email)

        # Don't create a new org for registered users.
        user.newOrg = False

        return await self._create(user, request)

    async def get_user_info_with_orgs(self, user: User) -> UserOut:
        """return User info"""
        user_orgs, _ = await self.org_ops.get_orgs_for_user(
            user,
            # Set high so that we get all orgs even after reducing default page size
            page_size=1_000,
            calculate_total=False,
        )

        if user_orgs:
            orgs = [
                UserOrgInfoOut(
                    id=org.id,
                    name=org.name,
                    slug=org.slug,
                    default=org.default,
                    role=(
                        UserRole.SUPERADMIN
                        if user.is_superuser
                        else org.users.get(str(user.id))
                    ),
                )
                for org in user_orgs
            ]
        else:
            orgs = []

        return UserOut(
            id=user.id,
            email=user.email,
            name=user.name,
            orgs=orgs,
            is_superuser=user.is_superuser,
            is_verified=user.is_verified,
        )

    async def validate_password(self, password: str) -> None:
        """
        Validate a password. raise HTTPException with status 422
        if password is invalid
        """
        pw_length = len(password)
        if not 8 <= pw_length <= 64:
            raise HTTPException(status_code=400, detail="invalid_password")

    async def check_password(self, user: User, password: str) -> bool:
        """check if password is valid, also update hashed_password if needed"""
        verified, updated_password_hash = verify_and_update_password(
            password, user.hashed_password
        )

        if not verified:
            return False

        # Update password hash to a more robust one if needed
        if updated_password_hash:
            user.hashed_password = updated_password_hash
            await self.users.find_one_and_update(
                {"id": user.id}, {"$set": {"hashed_password": user.hashed_password}}
            )

        return True

    async def authenticate(self, email: EmailStr, password: str) -> Optional[User]:
        """authenticate user via login form"""
        user = await self.get_by_email(email)
        if not user:
            # Run the hasher to mitigate timing attack
            # Inspired from Django: https://code.djangoproject.com/ticket/20760
            get_password_hash(password)
            return None

        if await self.check_password(user, password):
            return user

        return None

    async def get_user_names_by_ids(self, user_ids: List[str]) -> dict[str, str]:
        """return list of user names for given ids"""
        user_uuid_ids = [UUID(id_) for id_ in user_ids]
        cursor = self.users.find(
            {"id": {"$in": user_uuid_ids}}, projection=["id", "name", "email"]
        )
        return await cursor.to_list(length=1000)

    async def get_user_emails_by_ids(self):
        """return dict of user emails keyed by id"""
        email_id_map = {}
        async for user in self.users.find({}):
            email_id_map[user["id"]] = user["email"]
        return email_id_map

    async def get_superuser(self) -> Optional[User]:
        """return current superuser, if any"""
        user_data = await self.users.find_one({"is_superuser": True})
        if not user_data:
            return None

        return User(**user_data)

    async def create_super_user(self) -> None:
        """Initialize a super user from env vars"""
        email = os.environ.get("SUPERUSER_EMAIL")
        password = os.environ.get("SUPERUSER_PASSWORD")
        name = os.environ.get("SUPERUSER_NAME", "admin")
        if not email:
            print("No superuser defined", flush=True)
            return

        if not password:
            password = generate_password()

        superuser = await self.get_superuser()
        if superuser:
            if str(superuser.email) != email:
                await self.update_email_name(superuser, EmailStr(email), name)
                print("Superuser email updated")

            if not await self.check_password(superuser, password):
                await self._update_password(superuser, password)
                print("Superuser password updated")

            return

        try:
            res = await self._create(
                UserCreate(
                    name=name,
                    email=email,
                    password=password,
                    is_superuser=True,
                    newOrg=False,
                    is_verified=True,
                )
            )
            print(f"Super user {email} created", flush=True)
            print(res, flush=True)
        except HTTPException as exc:
            print(exc)
            print(f"User {email} already exists", flush=True)

    async def create_non_super_user(
        self,
        email: str,
        password: str,
        name: str = "New user",
    ) -> User:
        """create a regular user with given credentials"""
        if not email:
            raise HTTPException(status_code=400, detail="missing_user_email")

        if not password:
            password = generate_password()

        try:
            user_create = UserCreate(
                name=name,
                email=email,
                password=password,
                is_superuser=False,
                newOrg=False,
                is_verified=True,
            )

            return await self._create(user_create)
        except HTTPException as exc:
            print(f"User {email} already exists", flush=True)
            raise exc

    async def request_verify(
        self, user: User, request: Optional[Request] = None
    ) -> None:
        """start verifying user, if not already verified"""
        if user.is_verified:
            raise HTTPException(status_code=400, detail="verify_user_already_verified")

        token_data = {
            "user_id": str(user.id),
            "email": user.email,
            "aud": VERIFY_AUD,
        }
        token = generate_jwt(
            token_data,
            RESET_VERIFY_TOKEN_LIFETIME_MINUTES,
        )

        self.email.send_user_validation(
            user.email, token, dict(request.headers) if request else None
        )

    async def _create(
        self, create: UserCreateIn, request: Optional[Request] = None
    ) -> User:
        """create new user in db"""
        # pylint: disable=too-many-branches
        await self.validate_password(create.password)

        hashed_password = get_password_hash(create.password)

        if isinstance(create, UserCreate):
            is_superuser = create.is_superuser
            is_verified = create.is_verified
        else:
            is_superuser = False
            is_verified = create.inviteToken is not None

        id_ = uuid4()

        user = User(
            id=id_,
            email=create.email,
            name=create.name,
            hashed_password=hashed_password,
            is_superuser=is_superuser,
            is_verified=is_verified,
        )

        user_already_exists = False

        try:
            await self.users.insert_one(user.dict())
        except DuplicateKeyError:
            maybe_user = await self.get_by_email(create.email)
            # shouldn't happen since user should exist if we have duplicate key, but just in case!
            if not maybe_user:
                raise HTTPException(status_code=400, detail="user_missing")
            user = maybe_user
            user_already_exists = True

        add_to_org = False

        if create.inviteToken:
            new_user_invite = None
            try:
                new_user_invite = await self.org_ops.handle_new_user_invite(
                    create.inviteToken, user
                )
            except HTTPException as exc:
                print(exc)

            # if no org specified, add to the auto-add org
            if new_user_invite and not new_user_invite.oid:
                add_to_org = True

        else:
            add_to_org = True
            if not is_verified and not user_already_exists:
                asyncio.create_task(self.request_verify(user, request))

        # org to auto-add user to, if any
        auto_add_org: Optional[Organization] = None

        # if user already exists, and not adding to a new org, error
        if user_already_exists and not add_to_org:
            raise HTTPException(status_code=400, detail="user_already_exists")

        # if add to default, then get default org
        if add_to_org:
            if self.register_to_org_id:
                auto_add_org = await self.org_ops.get_org_by_id(
                    UUID(self.register_to_org_id)
                )
            else:
                auto_add_org = await self.org_ops.get_default_org()

        # if creating new org, create here
        elif create.newOrg is True:
            print(f"Creating new organization for {user.id}")

            org_name = create.newOrgName or f"{user.name or user.email}'s Organization"

            auto_add_org = await self.org_ops.create_new_org_for_user(
                org_name=org_name,
                user=user,
            )

        # if org set, add user to org
        if auto_add_org:
            await self.org_ops.add_user_to_org(auto_add_org, user.id, UserRole.CRAWLER)

        return user

    async def get_by_id(self, _id: UUID) -> Optional[User]:
        """get user by unique id"""
        user = await self.users.find_one({"id": _id})

        if not user:
            return None

        return User(**user)

    async def get_by_email(self, email: str) -> Optional[User]:
        """get user by email"""
        user = await self.users.find_one(
            {"email": email}, collation=self.email_collation
        )
        if not user:
            return None

        return User(**user)

    async def verify(self, token: str) -> None:
        """validate verification request token"""
        exc = HTTPException(
            status_code=400,
            detail="verify_user_bad_token",
        )

        try:
            data = decode_jwt(token, audience=VERIFY_ALLOW_AUD)
        except:
            raise exc

        try:
            user_id = data["user_id"]
            email = data["email"]
        except KeyError:
            raise exc

        user = await self.get_by_email(email)
        if not user:
            raise exc

        try:
            user_uuid = UUID(user_id)
        except ValueError:
            raise exc

        if user_uuid != user.id:
            raise exc

        if user.is_verified:
            raise HTTPException(
                status_code=400,
                detail="verify_user_already_verified",
            )

        user.is_verified = True
        await self.update_verified(user)

    async def forgot_password(
        self, user: User, request: Optional[Request] = None
    ) -> None:
        """start forgot password reset request"""
        token_data = {
            "user_id": str(user.id),
            "aud": RESET_AUD,
        }
        token = generate_jwt(
            token_data,
            RESET_VERIFY_TOKEN_LIFETIME_MINUTES,
        )

        print(f"User {user.id} has forgot their password. Reset token: {token}")
        self.email.send_user_forgot_password(
            user.email, token, request and request.headers
        )

    async def reset_password(self, token: str, password: str) -> None:
        """reset password to new password given reset token"""
        try:
            data = decode_jwt(token, audience=RESET_ALLOW_AUD)
        except:
            raise HTTPException(
                status_code=400,
                detail="reset_password_bad_token",
            )

        user_id = data["user_id"]

        try:
            user_uuid = UUID(user_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="reset_password_bad_token",
            )

        user = await self.get_by_id(user_uuid)
        if user:
            await self._update_password(user, password)

    async def change_password(
        self, user_update: UserUpdatePassword, user: User
    ) -> None:
        """Change password after checking existing password"""
        if not await self.check_password(user, user_update.password):
            raise HTTPException(status_code=400, detail="invalid_current_password")

        await self._update_password(user, user_update.newPassword)

    async def change_email_name(
        self, user_update: UserUpdateEmailName, user: User
    ) -> None:
        """Change email and/or name, if specified, throw if neither is specified"""
        if not user_update.email and not user_update.name:
            raise HTTPException(status_code=400, detail="no_updates_specified")

        await self.update_email_name(user, user_update.email, user_update.name)

        if user_update.name:
            await self.base_crawl_ops.update_usernames(user.id, user_update.name)
            await self.crawl_config_ops.update_usernames(user.id, user_update.name)

    async def update_verified(self, user: User) -> None:
        """Update verified status for user"""
        await self.users.find_one_and_update(
            {"id": user.id}, {"$set": {"is_verified": user.is_verified}}
        )

    async def update_email_name(
        self, user: User, email: Optional[EmailStr], name: Optional[str]
    ) -> None:
        """Update email for user"""
        query: dict[str, str] = {}
        if email:
            query["email"] = str(email)
        if name:
            query["name"] = name

        try:
            await self.users.find_one_and_update({"id": user.id}, {"$set": query})
        except DuplicateKeyError:
            raise HTTPException(status_code=400, detail="user_already_exists")

    async def _update_password(self, user: User, new_password: str) -> None:
        """Update hashed_password for user, overwriting previous password hash

        Internal method, use change_password() for password verification first

        Method also ensures user is not locked after password change
        """
        await self.validate_password(new_password)
        hashed_password = get_password_hash(new_password)
        if hashed_password == user.hashed_password:
            return
        user.hashed_password = hashed_password
        await self.users.find_one_and_update(
            {"id": user.id},
            {"$set": {"hashed_password": hashed_password}},
        )
        await self.reset_failed_logins(user.email)

    async def reset_failed_logins(self, email: str) -> None:
        """Reset consecutive failed login attempts by deleting FailedLogin object"""
        await self.failed_logins.delete_one(
            {"email": email}, collation=self.email_collation
        )

    async def inc_failed_logins(self, email: str) -> None:
        """Inc consecutive failed login attempts for user by 1

        If a FailedLogin object doesn't already exist, create it
        """
        failed_login = FailedLogin(id=uuid4(), email=email)

        await self.failed_logins.find_one_and_update(
            {"email": email},
            {
                "$setOnInsert": failed_login.to_dict(exclude={"count", "attempted"}),
                "$set": {"attempted": failed_login.dict(include={"attempted"})},
                "$inc": {"count": 1},
            },
            upsert=True,
            collation=self.email_collation,
        )

    async def get_failed_logins_count(self, email: str) -> int:
        """Get failed login attempts for user, falling back to 0"""
        failed_login = await self.failed_logins.find_one(
            {"email": email}, collation=self.email_collation
        )
        if not failed_login:
            return 0
        return failed_login.get("count", 0)


# ============================================================================
def init_user_manager(mdb, emailsender, invites):
    """
    Load users table and init /users routes
    """

    return UserManager(mdb, emailsender, invites)


# ============================================================================
# pylint: disable=too-many-locals, raise-missing-from
def init_users_api(app, user_manager: UserManager):
    """init fastapi_users"""

    auth_jwt_router, current_active_user, shared_secret_or_active_user = init_jwt_auth(
        user_manager
    )

    app.include_router(
        auth_jwt_router,
        prefix="/auth/jwt",
        tags=["auth"],
    )

    app.include_router(
        init_auth_router(user_manager),
        prefix="/auth",
        tags=["auth"],
    )

    app.include_router(
        init_users_router(current_active_user, user_manager),
        prefix="/users",
        tags=["users"],
    )

    return current_active_user, shared_secret_or_active_user


# ============================================================================
def init_auth_router(user_manager: UserManager) -> APIRouter:
    """/auth router"""

    auth_router = APIRouter()

    @auth_router.post("/register", status_code=201, response_model=UserOut)
    async def register(request: Request, create: UserCreateIn):
        user = await user_manager.register(create, request=request)
        return await user_manager.get_user_info_with_orgs(user)

    @auth_router.post(
        "/forgot-password",
        status_code=202,
    )
    async def forgot_password(
        request: Request,
        email: EmailStr = Body(..., embed=True),
    ):
        user = await user_manager.get_by_email(email)
        if not user:
            return None

        await user_manager.forgot_password(user, request)
        return {"success": True}

    @auth_router.post(
        "/reset-password",
    )
    async def reset_password(
        # request: Request,
        token: str = Body(...),
        password: str = Body(...),
    ):
        await user_manager.reset_password(token, password)
        return {"success": True}

    @auth_router.post("/request-verify-token", status_code=202)
    async def request_verify_token(
        request: Request,
        email: EmailStr = Body(..., embed=True),
    ):
        user = await user_manager.get_by_email(email)
        if user:
            await user_manager.request_verify(user, request)

        return {"success": True}

    @auth_router.post("/verify")
    async def verify(
        token: str = Body(..., embed=True),
    ):
        await user_manager.verify(token)
        return {"success": True}

    return auth_router


# ============================================================================
def init_users_router(
    current_active_user: Callable, user_manager: UserManager
) -> APIRouter:
    """/users routes"""
    users_router = APIRouter()

    @users_router.get("/me", tags=["users"], response_model=UserOut)
    async def current_user_with_org_info(user: User = Depends(current_active_user)):
        """/users/me with orgs user belongs to."""
        return await user_manager.get_user_info_with_orgs(user)

    @users_router.put("/me/password-change", tags=["users"])
    async def update_my_password(
        user_update: UserUpdatePassword,
        user: User = Depends(current_active_user),
    ):
        """update password, requires current password"""
        await user_manager.change_password(user_update, user)
        return {"updated": True}

    @users_router.patch("/me", tags=["users"])
    async def update_my_email_and_name(
        user_update: UserUpdateEmailName,
        user: User = Depends(current_active_user),
    ):
        """update password, requires current password"""
        await user_manager.change_email_name(user_update, user)
        return {"updated": True}

    @users_router.get("/me/invite/{token}", tags=["invites"], response_model=InviteOut)
    async def get_existing_user_invite_info(
        token: UUID, user: User = Depends(current_active_user)
    ):
        invite = await user_manager.invites.get_valid_invite(
            token, email=None, userid=user.id
        )

        return await user_manager.invites.get_invite_out(invite, user_manager)

    @users_router.get("/invite/{token}", tags=["invites"], response_model=InviteOut)
    async def get_invite_info(token: UUID, email: str):
        invite = await user_manager.invites.get_valid_invite(token, email)

        return await user_manager.invites.get_invite_out(invite, user_manager)

    # pylint: disable=invalid-name
    @users_router.get("/invites", tags=["invites"], response_model=PaginatedResponse)
    async def get_pending_invites(
        user: User = Depends(current_active_user),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="not_allowed")

        pending_invites, total = await user_manager.invites.get_pending_invites(
            user_manager, page_size=pageSize, page=page
        )
        return paginated_format(pending_invites, total, page, pageSize)

    return users_router
