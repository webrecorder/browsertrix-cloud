import requests

from .conftest import (
    API_PREFIX,
)

USER_EMAIL = "validpassword@example.com"
USER_PW = "validpassw0rd!"

USER_EMAIL_2 = "valid@example.com"
USER_PW_2 = "validpassw0rd!2"

new_org_id = None


def test_register_new_user():
    # Create user with invite
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        json={
            "name": "Reg User",
            "email": USER_EMAIL,
            "password": USER_PW,
        },
    )
    assert r.status_code == 201


def test_register_new_user_dupe():
    # Create user
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        json={
            "name": "Reg User",
            "email": USER_EMAIL,
            "password": USER_PW,
        },
    )
    assert r.status_code == 400
    assert r.json() == {"detail": "user_already_is_org_member"}


def test_add_user_new_org(admin_auth_headers):
    name = "New Org"
    r = requests.post(
        f"{API_PREFIX}/orgs/create", headers=admin_auth_headers, json={"name": name}
    )
    assert r.status_code == 200

    global new_org_id
    new_org_id = r.json()["id"]

    r = requests.post(
        f"{API_PREFIX}/orgs/{new_org_id}/add-user",
        json={
            "email": USER_EMAIL_2,
            "password": USER_PW_2,
            "name": "another-user",
            "role": 40,
        },
        headers=admin_auth_headers,
    )
    assert r.status_code == 200


def test_user_part_of_one_orgs(default_org_id):
    # User part of one org
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": USER_EMAIL_2,
            "password": USER_PW_2,
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
    assert len(data["orgs"]) == 1
    assert new_org_id == data["orgs"][0]["id"]
    assert "new-org" == data["orgs"][0]["slug"]


def test_register_user_different_org():
    # Register existing user wrong password
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        json={
            "name": "another-user",
            "email": USER_EMAIL_2,
            "password": USER_PW,
        },
    )
    assert r.status_code == 400
    assert r.json() == {"detail": "invalid_current_password"}

    # Register existing user in default org
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        json={
            "name": "another-user",
            "email": USER_EMAIL_2,
            "password": USER_PW_2,
        },
    )
    assert r.status_code == 201

    # Register existing user in default org, dupe
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        json={
            "name": "another-user",
            "email": USER_EMAIL_2,
            "password": USER_PW_2,
        },
    )
    assert r.status_code == 400
    assert r.json() == {"detail": "user_already_is_org_member"}


def test_user_part_of_two_orgs(default_org_id):
    # User part of two orgs
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": USER_EMAIL_2,
            "password": USER_PW_2,
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
    assert new_org_id in org_ids
