import requests
import time

from .conftest import API_PREFIX, CRAWLER_USERNAME, ADMIN_PW, ADMIN_USERNAME

VALID_USER_EMAIL = "validpassword@example.com"
VALID_USER_PW = "validpassw0rd!"


my_id = None


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
    assert data["is_active"]
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


def test_add_user_to_org_invalid_password(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/add-user",
        json={
            "email": "invalidpassword@example.com",
            "password": "pw",
            "name": "invalid pw user",
            "description": "test invalid password",
            "role": 20,
        },
        headers=admin_auth_headers,
    )
    assert r.status_code == 422
    assert r.json()["detail"] == "invalid_password"


def test_register_user_invalid_password(admin_auth_headers, default_org_id):
    email = "invalidpassword@example.com"
    # Send invite
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": email, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    # Look up token
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/invites",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    invites_matching_email = [
        invite for invite in data["items"] if invite["email"] == email
    ]
    token = invites_matching_email[0]["id"]

    # Create user with invite
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        headers=admin_auth_headers,
        json={
            "name": "invalid",
            "email": email,
            "password": "passwd",
            "inviteToken": token,
            "newOrg": False,
        },
    )
    assert r.status_code == 400
    detail = r.json()["detail"]
    # assert detail["code"] == "REGISTER_INVALID_PASSWORD"
    assert detail == "invalid_password_length"


def test_register_user_valid_password(admin_auth_headers, default_org_id):
    # Send invite
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": VALID_USER_EMAIL, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    # Look up token
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/invites",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    invites_matching_email = [
        invite for invite in data["items"] if invite["email"] == VALID_USER_EMAIL
    ]
    token = invites_matching_email[0]["id"]

    # Create user with invite
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        headers=admin_auth_headers,
        json={
            "name": "valid",
            "email": VALID_USER_EMAIL,
            "password": VALID_USER_PW,
            "inviteToken": token,
            "newOrg": False,
        },
    )
    assert r.status_code == 201


def test_reset_invalid_password(admin_auth_headers):
    r = requests.put(
        f"{API_PREFIX}/users/me/password-change",
        headers=admin_auth_headers,
        json={"email": ADMIN_USERNAME, "password": "PASSW0RD!", "newPassword": "12345"},
    )
    assert r.status_code == 400
    detail = r.json()["detail"]
    # assert detail["code"] == "UPDATE_USER_INVALID_PASSWORD"
    assert detail == "invalid_password_length"


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
    valid_user_headers = {}
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
            "newPassword": "new!password",
        },
    )
    assert r.status_code == 200
    # assert r.json()["email"] == VALID_USER_EMAIL
    assert r.json()["updated"] == True


def test_patch_me_endpoint(admin_auth_headers, default_org_id):
    r = requests.patch(
        f"{API_PREFIX}/users/me",
        headers=admin_auth_headers,
        json={"email": "admin2@example.com", "name": "New Admin"},
    )
    assert r.status_code == 200
