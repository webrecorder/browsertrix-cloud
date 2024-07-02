import os
import requests
import uuid

import pytest

from .conftest import API_PREFIX
from .utils import read_in_chunks

curr_dir = os.path.dirname(os.path.realpath(__file__))

new_oid = None

new_subs_oid = None
new_subs_oid_2 = None

new_user_invite_token = None
existing_user_invite_token = None

VALID_PASSWORD = "ValidPassW0rd!"

invite_email = "test-user@example.com"


def test_ensure_only_one_default_org(admin_auth_headers):
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    data = r.json()
    assert data["total"] == 1

    orgs = data["items"]
    default_orgs = [org for org in orgs if org["default"]]
    assert len(default_orgs) == 1

    default_org_name = default_orgs[0]["name"]
    orgs_with_same_name = [org for org in orgs if org["name"] == default_org_name]
    assert len(orgs_with_same_name) == 1


def test_get_org_admin(admin_auth_headers, default_org_id):
    """org owners should receive details on users."""
    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == default_org_id
    assert data["name"]

    users = data["users"]
    assert users
    for _, value in users.items():
        assert value["name"]
        assert value["email"]
        assert value["role"]


def test_get_org_crawler(crawler_auth_headers, default_org_id):
    """non-owners should *not* receive details on users."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}", headers=crawler_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == default_org_id
    assert data["name"]
    assert data.get("users") is None


def test_rename_org(admin_auth_headers, default_org_id):
    UPDATED_NAME = "updated org name"
    UPDATED_SLUG = "updated-org-name"
    rename_data = {"name": UPDATED_NAME, "slug": UPDATED_SLUG}
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/rename",
        headers=admin_auth_headers,
        json=rename_data,
    )

    assert r.status_code == 200
    data = r.json()
    assert data["updated"]

    # Verify that name and slug are now updated.
    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == UPDATED_NAME
    assert data["slug"] == UPDATED_SLUG


def test_rename_org_invalid_slug(admin_auth_headers, default_org_id):
    UPDATED_NAME = "updated org name"
    UPDATED_SLUG = "not a valid slug"
    rename_data = {"name": UPDATED_NAME, "slug": UPDATED_SLUG}
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/rename",
        headers=admin_auth_headers,
        json=rename_data,
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_slug"


def test_create_org(admin_auth_headers):
    NEW_ORG_NAME = "New Org"
    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={"name": NEW_ORG_NAME, "slug": "new-org"},
    )

    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    assert data["id"]

    global new_oid
    new_oid = data["id"]

    # Verify that org exists.
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    org_names = []
    for org in data["items"]:
        org_names.append(org["name"])
    assert NEW_ORG_NAME in org_names


# disable until storage customization is enabled
def _test_change_org_storage(admin_auth_headers):
    # change to invalid storage
    r = requests.post(
        f"{API_PREFIX}/orgs/{new_oid}/storage",
        headers=admin_auth_headers,
        json={"storage": {"name": "invalid-storage", "custom": False}},
    )

    assert r.status_code == 400

    # change to invalid storage
    r = requests.post(
        f"{API_PREFIX}/orgs/{new_oid}/storage",
        headers=admin_auth_headers,
        json={"storage": {"name": "alt-storage", "custom": True}},
    )

    assert r.status_code == 400

    # change to valid storage
    r = requests.post(
        f"{API_PREFIX}/orgs/{new_oid}/storage",
        headers=admin_auth_headers,
        json={"storage": {"name": "alt-storage", "custom": False}},
    )

    assert r.status_code == 200
    assert r.json()["updated"]


def test_remove_user_from_org(admin_auth_headers, default_org_id):
    # Add new user to org
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/add-user",
        json={
            "email": "toremove@example.com",
            "password": "PASSW0RD!",
            "name": "toremove",
            "role": 10,
        },
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]

    # Remove user
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/remove",
        json={"email": "toremove@example.com"},
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["removed"]


def test_remove_non_existent_user(admin_auth_headers, default_org_id):
    # Remove user
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/remove",
        json={"email": "toremove@example.com"},
        headers=admin_auth_headers,
    )
    assert r.status_code == 404
    data = r.json()
    assert data["detail"] == "no_such_org_user"


def test_get_pending_org_invites(
    admin_auth_headers, default_org_id, non_default_org_id
):
    # Invite user to non-default org
    NON_DEFAULT_INVITE_EMAIL = "non-default-invite@example.com"
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": NON_DEFAULT_INVITE_EMAIL, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    # Invite user to default org
    DEFAULT_INVITE_EMAIL = "default-invite@example.com"
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": DEFAULT_INVITE_EMAIL, "role": 10},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    # Check that only invite to non-default org is returned
    r = requests.get(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    invites = data["items"]
    assert len(invites) == 1
    assert data["total"] == 1
    invite = invites[0]
    assert invite["email"] == NON_DEFAULT_INVITE_EMAIL
    assert invite["oid"] == non_default_org_id
    assert invite["created"]
    assert invite["role"]

    # Delete Invites
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites/delete",
        headers=admin_auth_headers,
        json={"email": NON_DEFAULT_INVITE_EMAIL},
    )
    assert r.status_code == 200

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invites/delete",
        headers=admin_auth_headers,
        json={"email": DEFAULT_INVITE_EMAIL},
    )
    assert r.status_code == 200


@pytest.mark.parametrize(
    "invite_email, expected_stored_email",
    [
        # Standard email
        ("invite-to-accept-org@example.com", "invite-to-accept-org@example.com"),
        # Email address with comments
        ("user+comment-org@example.com", "user+comment-org@example.com"),
        # URL encoded email address with comments
        (
            "user%2Bcomment-encoded-org%40example.com",
            "user+comment-encoded-org@example.com",
        ),
        # User email with diacritic characters
        ("diacritic-tést-org@example.com", "diacritic-tést-org@example.com"),
        # User email with encoded diacritic characters
        (
            "diacritic-t%C3%A9st-encoded-org%40example.com",
            "diacritic-tést-encoded-org@example.com",
        ),
    ],
)
def test_send_and_accept_org_invite(
    admin_auth_headers, non_default_org_id, invite_email, expected_stored_email
):
    # Send invite
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": invite_email, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"
    token = data["token"]

    # Register user
    # Note: This will accept invitation without needing to call the
    # accept invite endpoint explicitly due to post-registration hook.
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        headers=admin_auth_headers,
        json={
            "name": "accepted",
            "email": expected_stored_email,
            "password": "testingpassword",
            "inviteToken": token,
        },
    )
    assert r.status_code == 201

    # Verify user belongs to org
    r = requests.get(
        f"{API_PREFIX}/orgs/{non_default_org_id}", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    users = data["users"]
    users_with_invited_email = [
        user for user in users.values() if user["email"] == expected_stored_email
    ]
    assert len(users_with_invited_email) == 1


def test_delete_invite_by_email(admin_auth_headers, non_default_org_id):
    # Invite user to non-default org
    INVITE_EMAIL = "new-non-default-org-invite-by-email@example.com"
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": INVITE_EMAIL, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    # Delete invite by email
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites/delete",
        headers=admin_auth_headers,
        json={"email": INVITE_EMAIL},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["removed"]
    assert data["count"] == 1

    # Verify invite no longer exists
    r = requests.get(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    invites_matching_email = [
        invite for invite in data["items"] if invite["email"] == INVITE_EMAIL
    ]
    assert len(invites_matching_email) == 0

    # Try to delete non-existent email and test we get 404
    bad_token = str(uuid.uuid4())
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites/delete",
        headers=admin_auth_headers,
        json={"email": "not-a-valid-invite@example.com"},
    )
    assert r.status_code == 404
    data = r.json()
    assert data["detail"] == "invite_not_found"


def test_update_event_webhook_urls_org_admin(admin_auth_headers, default_org_id):
    # Verify no URLs are configured
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    if data.get("webhooks"):
        webhooks = data.get("webhooks")
        assert webhooks.get("crawlStarted") is None
        assert webhooks.get("crawlFinished") is None
        assert webhooks.get("crawlDeleted") is None
        assert webhooks.get("uploadFinished") is None
        assert webhooks.get("uploadDeleted") is None
        assert webhooks.get("addedToCollection") is None
        assert webhooks.get("removedFromCollection") is None
        assert webhooks.get("collectionDeleted") is None

    # Set URLs and verify
    CRAWL_STARTED_URL = "https://example.com/crawl/started"
    CRAWL_FINISHED_URL = "https://example.com/crawl/finished"
    CRAWL_DELETED_URL = "https://example.com/crawl/deleted"
    UPLOAD_FINISHED_URL = "https://example.com/upload/finished"
    UPLOAD_DELETED_URL = "https://example.com/upload/deleted"
    COLL_ADDED_URL = "https://example.com/coll/added"
    COLL_REMOVED_URL = "http://example.com/coll/removed"
    COLL_DELETED_URL = "http://example.com/coll/deleted"

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/event-webhook-urls",
        headers=admin_auth_headers,
        json={
            "crawlStarted": CRAWL_STARTED_URL,
            "crawlFinished": CRAWL_FINISHED_URL,
            "crawlDeleted": CRAWL_DELETED_URL,
            "uploadFinished": UPLOAD_FINISHED_URL,
            "uploadDeleted": UPLOAD_DELETED_URL,
            "addedToCollection": COLL_ADDED_URL,
            "removedFromCollection": COLL_REMOVED_URL,
            "collectionDeleted": COLL_DELETED_URL,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    urls = data["webhookUrls"]
    assert urls["crawlStarted"] == CRAWL_STARTED_URL
    assert urls["crawlFinished"] == CRAWL_FINISHED_URL
    assert urls["crawlDeleted"] == CRAWL_DELETED_URL

    assert urls["uploadFinished"] == UPLOAD_FINISHED_URL
    assert urls["uploadDeleted"] == UPLOAD_DELETED_URL

    assert urls["addedToCollection"] == COLL_ADDED_URL
    assert urls["removedFromCollection"] == COLL_REMOVED_URL
    assert urls["collectionDeleted"] == COLL_DELETED_URL


def test_update_event_webhook_urls_org_crawler(crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/event-webhook-urls",
        headers=crawler_auth_headers,
        json={
            "crawlStarted": "https://example.com/crawlstarted",
            "crawlFinished": "https://example.com/crawlfinished",
            "uploadFinished": "https://example.com/uploadfinished",
            "addedToCollection": "https://example.com/added",
            "removedFromCollection": "https://example.com/removed",
        },
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "User does not have permission to perform this action"


def test_org_metrics(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/metrics",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["storageUsedBytes"] > 0
    assert data["storageUsedCrawls"] > 0
    assert data["storageUsedUploads"] >= 0
    assert data["storageUsedProfiles"] >= 0
    assert (
        data["storageUsedBytes"]
        == data["storageUsedCrawls"]
        + data["storageUsedUploads"]
        + data["storageUsedProfiles"]
    )
    assert data["storageQuotaBytes"] >= 0
    assert data["archivedItemCount"] > 0
    assert data["crawlCount"] > 0
    assert data["uploadCount"] >= 0
    assert data["archivedItemCount"] == data["crawlCount"] + data["uploadCount"]
    assert data["pageCount"] > 0
    assert data["profileCount"] >= 0
    assert data["workflowsRunningCount"] >= 0
    assert data["workflowsQueuedCount"] >= 0
    assert data["collectionsCount"] > 0
    assert data["publicCollectionsCount"] >= 0


def test_get_org_slugs(admin_auth_headers):
    # Fetch org count and slugs from /orgs
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    org_count = data["total"]
    org_slugs = [item["slug"] for item in data["items"]]

    # Fetch slugs from /orgs/slugs and verify data looks right
    r = requests.get(f"{API_PREFIX}/orgs/slugs", headers=admin_auth_headers)
    assert r.status_code == 200
    slugs = r.json()["slugs"]

    assert len(slugs) == org_count
    for slug in slugs:
        assert slug in org_slugs


def test_get_org_slugs_non_superadmin(crawler_auth_headers):
    r = requests.get(f"{API_PREFIX}/orgs/slugs", headers=crawler_auth_headers)
    assert r.status_code == 403
    assert r.json()["detail"] == "Not Allowed"


def test_get_org_slug_lookup(admin_auth_headers):
    # Build an expected return from /orgs list to compare against
    expected_return = {}
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    assert r.status_code == 200
    for org in r.json()["items"]:
        expected_return[org["id"]] = org["slug"]

    # Fetch data from /orgs/slug-lookup and verify data is correct
    r = requests.get(f"{API_PREFIX}/orgs/slug-lookup", headers=admin_auth_headers)
    assert r.status_code == 200
    assert r.json() == expected_return


def test_get_org_slug_lookup_non_superadmin(crawler_auth_headers):
    r = requests.get(f"{API_PREFIX}/orgs/slug-lookup", headers=crawler_auth_headers)
    assert r.status_code == 403
    assert r.json()["detail"] == "Not Allowed"


def test_update_read_only(admin_auth_headers, default_org_id):
    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)
    data = r.json()
    assert data["readOnly"] in (False, None)
    assert data["readOnlyReason"] in (None, "")

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/read-only",
        headers=admin_auth_headers,
        json={"readOnly": True, "readOnlyReason": "Payment suspended"},
    )
    assert r.json()["updated"]

    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)
    data = r.json()
    assert data["readOnly"] is True
    assert data["readOnlyReason"] == "Payment suspended"

    # Try to start crawl from new workflow, should fail
    crawl_data = {
        "runNow": True,
        "name": "Read Only Test Crawl",
        "description": "Should not run now",
        "tags": [],
        "config": {
            "seeds": [{"url": "https://webrecorder.net/", "depth": 1}],
            "exclude": "community",
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    assert data["added"]
    assert data["run_now_job"] is None

    cid = data["id"]
    assert cid

    # Try to start crawl from existing workflow, should fail
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/run",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "org_set_to_read_only"

    # Try to upload a WACZ, should fail
    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream?filename=test.wacz&name=My%20New%20Upload&description=Should%20Fail&collections=&tags=",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 403
    assert r.json()["detail"] == "org_set_to_read_only"

    # Reset back to False, future tests should be unaffected
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/read-only",
        headers=admin_auth_headers,
        json={"readOnly": False},
    )
    assert r.json()["updated"]

    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)
    data = r.json()
    assert data["readOnly"] is False
    # Test that reason is unset when readOnly is set to false, even implicitly
    assert data["readOnlyReason"] == ""


def test_create_org_and_invite_new_user(admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={
            "firstAdminInviteEmail": invite_email,
            "quotas": {
                "maxPagesPerCrawl": 100,
                "maxConcurrentCrawls": 1,
                "storageQuota": 1000000,
                "maxExecMinutesPerMonth": 1000,
            },
            "subData": {"extra": "data", "sub": {"id": 123}},
        },
    )

    assert r.status_code == 200
    data = r.json()
    assert data["added"]

    org_id = data["id"]

    assert data["invited"] == "new_user"

    global new_user_invite_token
    new_user_invite_token = data["token"]

    global new_subs_oid
    new_subs_oid = org_id


def test_validate_new_org_with_quotas_and_name_is_uid(admin_auth_headers):
    r = requests.get(f"{API_PREFIX}/orgs/{new_subs_oid}", headers=admin_auth_headers)
    assert r.status_code == 200

    data = r.json()
    assert data["slug"] == data["id"]
    assert data["name"] == data["name"]

    assert data["quotas"] == {
        "maxPagesPerCrawl": 100,
        "maxConcurrentCrawls": 1,
        "storageQuota": 1000000,
        "maxExecMinutesPerMonth": 1000,
        "extraExecMinutes": 0,
        "giftedExecMinutes": 0,
    }
    assert "subData" not in data


def test_register_with_invite():
    # Create user with invite
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        json={
            "name": "Test User",
            "email": invite_email,
            "password": VALID_PASSWORD,
            "inviteToken": new_user_invite_token,
        },
    )
    assert r.status_code == 201


def test_validate_new_org_with_quotas_and_update_name(admin_auth_headers):
    r = requests.get(f"{API_PREFIX}/orgs/{new_subs_oid}", headers=admin_auth_headers)
    assert r.status_code == 200

    data = r.json()
    assert data["slug"] == "test-users-archive"
    assert data["name"] == "Test User's Archive"

    assert data["quotas"] == {
        "maxPagesPerCrawl": 100,
        "maxConcurrentCrawls": 1,
        "storageQuota": 1000000,
        "maxExecMinutesPerMonth": 1000,
        "extraExecMinutes": 0,
        "giftedExecMinutes": 0,
    }
    assert "subData" not in data


def test_create_org_and_invite_existing_user(admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={
            "firstAdminInviteEmail": invite_email,
            "quotas": {
                "maxPagesPerCrawl": 100,
                "maxConcurrentCrawls": 1,
                "storageQuota": 1000000,
                "maxExecMinutesPerMonth": 1000,
            },
            "subData": {"extra": "data", "sub": {"id": 123}},
        },
    )

    assert r.status_code == 200
    data = r.json()
    assert data["added"]

    org_id = data["id"]

    global new_subs_oid_2
    new_subs_oid_2 = org_id

    assert data["invited"] == "existing_user"

    global existing_user_invite_token
    existing_user_invite_token = data["token"]


def test_login_existing_user_for_invite():
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": invite_email,
            "password": VALID_PASSWORD,
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
    data = r.json()
    assert data["firstOrgOwner"] == True
    assert data["orgName"] == data["oid"]
    assert data["orgName"] == data["orgSlug"]

    # Accept existing user invite
    r = requests.post(
        f"{API_PREFIX}/orgs/invite-accept/{existing_user_invite_token}",
        headers=auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    org = data["org"]

    assert org["id"] == new_subs_oid_2
    assert org["name"] == "Test User's Archive 2"
    assert org["slug"] == "test-users-archive-2"

    assert org["quotas"] == {
        "maxPagesPerCrawl": 100,
        "maxConcurrentCrawls": 1,
        "storageQuota": 1000000,
        "maxExecMinutesPerMonth": 1000,
        "extraExecMinutes": 0,
        "giftedExecMinutes": 0,
    }
    assert "subData" not in org
