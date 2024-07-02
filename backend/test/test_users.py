import requests
import time
from uuid import uuid4

from .conftest import (
    API_PREFIX,
    CRAWLER_USERNAME,
    CRAWLER_USERNAME_LOWERCASE,
    CRAWLER_PW,
    ADMIN_PW,
    ADMIN_USERNAME,
    FINISHED_STATES,
)

INVALID_PASSWORD_EMAIL = "invalidpassword@example.com"
VALID_USER_EMAIL = "validpassword@example.com"
VALID_USER_PW = "validpassw0rd!"
VALID_USER_PW_RESET = "new!password"
VALID_USER_PW_RESET_AGAIN = "new!password1"

my_id = None
valid_user_headers = None

new_user_invite_token = None
existing_user_invite_token = None
wrong_token = None


def test_create_super_user(admin_auth_headers):
    assert admin_auth_headers
    auth = admin_auth_headers["Authorization"]
    token = auth.replace("Bearer ", "")
    assert token != "None"
    assert len(token) > 4


def test_create_non_super_user(viewer_auth_headers):
    assert viewer_auth_headers
    auth = viewer_auth_headers["Authorization"]
    token = auth.replace("Bearer ", "")
    assert token != "None"
    assert len(token) > 4


def test_me_with_orgs(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/users/me",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data["email"] == CRAWLER_USERNAME
    assert data["id"]
    # assert data["is_active"]
    assert data["is_superuser"] is False
    assert data["is_verified"] is True
    assert data["name"] == "new-crawler"

    orgs = data["orgs"]
    assert len(orgs) == 1

    global my_id
    my_id = data["id"]

    default_org = orgs[0]
    assert default_org["id"] == default_org_id
    assert default_org["name"]
    assert default_org["default"]
    assert default_org["role"] == 20


def test_me_id(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/users/{my_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 404


def test_login_case_insensitive_email():
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": CRAWLER_USERNAME_LOWERCASE,
            "password": CRAWLER_PW,
            "grant_type": "password",
        },
    )
    data = r.json()
    assert r.status_code == 200
    assert data["access_token"]


def test_add_user_to_org_invalid_password(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/add-user",
        json={
            "email": INVALID_PASSWORD_EMAIL,
            "password": "pw",
            "name": "invalid pw user",
            "description": "test invalid password",
            "role": 20,
        },
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_password"


def test_register_user_invalid_password(admin_auth_headers, default_org_id):
    email = INVALID_PASSWORD_EMAIL
    # Send invite
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": email, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    global wrong_token
    wrong_token = data["token"]

    # Create user with invite
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        headers=admin_auth_headers,
        json={
            "name": "invalid",
            "email": email,
            "password": "passwd",
            "inviteToken": wrong_token,
        },
    )
    assert r.status_code == 400
    detail = r.json()["detail"]
    # assert detail["code"] == "invalid_password"
    assert detail == "invalid_password"


def test_new_user_send_invite(admin_auth_headers, default_org_id):
    # Send invite
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": VALID_USER_EMAIL, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    global new_user_invite_token
    new_user_invite_token = data["token"]


def test_pending_invite_new_user(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/invites", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    invites = data["items"]
    assert len(invites) == 2

    assert data["total"] == 2
    for invite in invites:
        assert invite["email"] in (VALID_USER_EMAIL, INVALID_PASSWORD_EMAIL)
        assert invite["oid"] == default_org_id
        assert invite["created"]
        assert invite["role"]
        assert invite["firstOrgOwner"] == None


def test_new_user_token():
    # Must include email to validate token
    r = requests.get(
        f"{API_PREFIX}/users/invite/{new_user_invite_token}",
    )
    assert r.status_code == 422

    # Confirm token is valid (no auth needed)
    r = requests.get(
        f"{API_PREFIX}/users/invite/{new_user_invite_token}?email={VALID_USER_EMAIL}",
    )
    assert r.status_code == 200


def test_register_user_no_invite():
    # Create with no invite
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        json={
            "name": "valid",
            "email": VALID_USER_EMAIL,
            "password": VALID_USER_PW,
        },
    )
    assert r.json()["detail"] == "invite_token_required"
    assert r.status_code == 400


def test_register_user_wrong_invite():
    # Create with wrong invite
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        json={
            "name": "valid",
            "email": VALID_USER_EMAIL,
            "password": VALID_USER_PW,
            "inviteToken": wrong_token,
        },
    )
    assert r.json()["detail"] == "invalid_invite"
    assert r.status_code == 400

    # Create with wrong invite
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        json={
            "name": "valid",
            "email": VALID_USER_EMAIL,
            "password": VALID_USER_PW,
            "inviteToken": str(uuid4()),
        },
    )
    assert r.json()["detail"] == "invalid_invite"
    assert r.status_code == 400

    # Create with wrong invite
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        json={
            "name": "valid",
            "email": VALID_USER_EMAIL,
            "password": VALID_USER_PW,
            "inviteToken": "abcdefg",
        },
    )
    assert r.status_code == 422


def test_register_user_valid_password():
    # Create user with invite
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        json={
            "name": "valid",
            "email": VALID_USER_EMAIL,
            "password": VALID_USER_PW,
            "inviteToken": new_user_invite_token,
        },
    )
    assert r.status_code == 201
    assert r.json()["is_verified"] == True


def test_register_dupe():
    # Create user with invite
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        json={
            "name": "valid",
            "email": VALID_USER_EMAIL,
            "password": VALID_USER_PW,
            "inviteToken": new_user_invite_token,
        },
    )
    assert r.status_code == 400


def test_delete_invite(admin_auth_headers, default_org_id):
    email = INVALID_PASSWORD_EMAIL
    # Delete unused invite
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invites/delete",
        headers=admin_auth_headers,
        json={"email": email},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["removed"] == True
    assert data["count"] == 1

    # now 404
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invites/delete",
        headers=admin_auth_headers,
        json={"email": email},
    )
    assert r.status_code == 404


def test_pending_invites_clear_new_user(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/invites", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    invites = data["items"]
    assert len(invites) == 0


def test_existing_user_send_invite(admin_auth_headers, non_default_org_id):
    # Send invite
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": VALID_USER_EMAIL, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "existing_user"

    global existing_user_invite_token
    existing_user_invite_token = data["token"]


def test_pending_invite_existing_user(admin_auth_headers, non_default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    invites = data["items"]
    assert len(invites) == 1

    assert data["total"] == 1
    invite = invites[0]
    assert invite["email"] == VALID_USER_EMAIL
    assert invite["oid"] == non_default_org_id
    assert invite["created"]
    assert invite["role"]
    assert invite["firstOrgOwner"] == None


def test_pending_invites_crawler(crawler_auth_headers, default_org_id):
    # Verify that only admins can see pending invites
    r = requests.get(f"{API_PREFIX}/users/invites", headers=crawler_auth_headers)
    assert r.status_code == 403


def test_login_existing_user_for_invite():
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": VALID_USER_EMAIL,
            "password": VALID_USER_PW,
            "grant_type": "password",
        },
    )
    data = r.json()
    assert r.status_code == 200
    login_token = data["access_token"]

    auth_headers = {"Authorization": "bearer " + login_token}

    # Get existing user invite to confirm it is valid
    r = requests.get(
        f"{API_PREFIX}/users/me/invite/{existing_user_invite_token}",
        headers=auth_headers,
    )
    assert r.status_code == 200

    # Accept existing user invite
    r = requests.post(
        f"{API_PREFIX}/orgs/invite-accept/{existing_user_invite_token}",
        headers=auth_headers,
    )


def test_pending_invites_clear(admin_auth_headers, non_default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    invites = data["items"]
    assert len(invites) == 0


def test_user_part_of_two_orgs(default_org_id, non_default_org_id):
    # User part of two orgs
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": VALID_USER_EMAIL,
            "password": VALID_USER_PW,
            "grant_type": "password",
        },
    )
    data = r.json()
    assert r.status_code == 200
    login_token = data["access_token"]

    auth_headers = {"Authorization": "bearer " + login_token}

    # Get user info
    r = requests.get(
        f"{API_PREFIX}/users/me",
        headers=auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    # confirm user is part of the two orgs
    assert len(data["orgs"]) == 2
    org_ids = [org["id"] for org in data["orgs"]]
    assert default_org_id in org_ids
    assert non_default_org_id in org_ids


def test_user_change_role(admin_auth_headers, default_org_id):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/user-role",
        headers=admin_auth_headers,
        json={"email": VALID_USER_EMAIL, "role": 40},
    )

    assert r.status_code == 200
    assert r.json()["updated"] == True


def test_reset_invalid_password(admin_auth_headers):
    r = requests.put(
        f"{API_PREFIX}/users/me/password-change",
        headers=admin_auth_headers,
        json={"email": ADMIN_USERNAME, "password": "PASSW0RD!", "newPassword": "12345"},
    )
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail == "invalid_password"


def test_reset_patch_id_endpoint_invalid(admin_auth_headers, default_org_id):
    r = requests.patch(
        f"{API_PREFIX}/users/{my_id}",
        headers=admin_auth_headers,
        json={"email": ADMIN_USERNAME, "password": "newpassword"},
    )
    assert r.status_code == 404


def test_reset_password_invalid_current(admin_auth_headers):
    r = requests.put(
        f"{API_PREFIX}/users/me/password-change",
        headers=admin_auth_headers,
        json={
            "email": ADMIN_USERNAME,
            "password": "invalid",
            "newPassword": "newpassword",
        },
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_current_password"


def test_reset_valid_password(admin_auth_headers, default_org_id):
    count = 0
    while True:
        r = requests.post(
            f"{API_PREFIX}/auth/jwt/login",
            data={
                "username": VALID_USER_EMAIL,
                "password": VALID_USER_PW,
                "grant_type": "password",
            },
        )
        data = r.json()
        try:
            global valid_user_headers
            valid_user_headers = {"Authorization": f"Bearer {data['access_token']}"}
            break
        except:
            print("Waiting for valid user auth headers")
            time.sleep(5)
            if count > 5:
                break

            count += 1

    r = requests.put(
        f"{API_PREFIX}/users/me/password-change",
        headers=valid_user_headers,
        json={
            "email": VALID_USER_EMAIL,
            "password": VALID_USER_PW,
            "newPassword": VALID_USER_PW_RESET,
        },
    )
    assert r.status_code == 200
    # assert r.json()["email"] == VALID_USER_EMAIL
    assert r.json()["updated"] == True


def test_lock_out_user_after_failed_logins():
    # Almost lock out user by making 5 consecutive failed login attempts
    for _ in range(5):
        requests.post(
            f"{API_PREFIX}/auth/jwt/login",
            data={
                "username": VALID_USER_EMAIL,
                "password": "incorrect",
                "grant_type": "password",
            },
        )
        time.sleep(1)

    # Ensure we get a 429 response on the 5th failed attempt
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": VALID_USER_EMAIL,
            "password": "incorrect",
            "grant_type": "password",
        },
    )
    assert r.status_code == 429
    assert r.json()["detail"] == "too_many_login_attempts"

    # Try again with correct password and ensure we still can't log in
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": VALID_USER_EMAIL,
            "password": VALID_USER_PW_RESET,
            "grant_type": "password",
        },
    )
    assert r.status_code in (400, 429)

    # Reset password
    r = requests.put(
        f"{API_PREFIX}/users/me/password-change",
        headers=valid_user_headers,
        json={
            "email": VALID_USER_EMAIL,
            "password": VALID_USER_PW_RESET,
            "newPassword": VALID_USER_PW_RESET_AGAIN,
        },
    )
    assert r.status_code == 200

    time.sleep(5)

    # Try once more again with invalid password and ensure we no longer get a
    # 429 response since password reset unlocked user
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": VALID_USER_EMAIL,
            "password": "incorrect",
            "grant_type": "password",
        },
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "login_bad_credentials"

    # Try again with correct reset password and this time it should work
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": VALID_USER_EMAIL,
            "password": VALID_USER_PW_RESET_AGAIN,
            "grant_type": "password",
        },
    )
    assert r.status_code == 200


def test_lock_out_unregistered_user_after_failed_logins():
    unregistered_email = "notregistered@example.com"
    # Almost lock out email by making 5 consecutive failed login attempts
    for _ in range(5):
        requests.post(
            f"{API_PREFIX}/auth/jwt/login",
            data={
                "username": unregistered_email,
                "password": "incorrect",
                "grant_type": "password",
            },
        )
        time.sleep(1)

    # Ensure we get a 429 response on the 5th failed attempt
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": unregistered_email,
            "password": "incorrect",
            "grant_type": "password",
        },
    )
    assert r.status_code == 429
    assert r.json()["detail"] == "too_many_login_attempts"


def test_patch_me_endpoint(admin_auth_headers, default_org_id, admin_userid):
    # Start a new crawl
    crawl_data = {
        "runNow": True,
        "name": "name change test crawl",
        "config": {
            "seeds": [{"url": "https://specs.webrecorder.net/", "depth": 1}],
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()
    crawl_id = data["run_now_job"]

    # Wait for it to complete
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            break
        time.sleep(5)

    # Change user name and email
    new_name = "New Admin"
    r = requests.patch(
        f"{API_PREFIX}/users/me",
        headers=admin_auth_headers,
        json={"email": "admin2@example.com", "name": new_name},
    )
    assert r.status_code == 200

    # Verify that name was updated in workflows and crawls
    for workflow_field in ["createdBy", "modifiedBy", "lastStartedBy"]:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?{workflow_field}={admin_userid}",
            headers=admin_auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] > 0
        for workflow in data["items"]:
            if workflow[workflow_field] == admin_userid:
                assert workflow[f"{workflow_field}Name"] == new_name

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?userid={admin_userid}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] > 0
    for item in data["items"]:
        if item["userid"] == admin_userid:
            assert item["userName"] == new_name


def test_patch_me_invalid_email_in_use(admin_auth_headers, default_org_id):
    r = requests.patch(
        f"{API_PREFIX}/users/me",
        headers=admin_auth_headers,
        json={"email": VALID_USER_EMAIL},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "user_already_exists"
