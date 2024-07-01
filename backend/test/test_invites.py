import requests
import time

import pytest

from .conftest import API_PREFIX


def test_pending_invites(admin_auth_headers, default_org_id):
    r = requests.get(f"{API_PREFIX}/users/invites", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["items"] == []

    # Add a pending invite and check it's returned
    INVITE_EMAIL = "invite-pending@example.com"

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": INVITE_EMAIL, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    r = requests.get(f"{API_PREFIX}/users/invites", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    invites = data["items"]
    assert len(invites) == 1
    assert data["total"] == 1
    invite = invites[0]
    assert invite["email"] == INVITE_EMAIL
    assert invite["oid"] == default_org_id
    assert invite["created"]
    assert invite["role"]


def test_pending_invites_crawler(crawler_auth_headers, default_org_id):
    # Verify that only superusers can see pending invites
    r = requests.get(f"{API_PREFIX}/users/invites", headers=crawler_auth_headers)
    assert r.status_code == 403
