import requests

from .conftest import API_PREFIX


def test_delete_org_non_superadmin(crawler_auth_headers, default_org_id):
    # Assert that non-superadmin can't delete org
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}", headers=crawler_auth_headers
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "Not Allowed"


def test_delete_org_superadmin(admin_auth_headers, default_org_id):
    # Track items in org to ensure they're deleted later (we may want to expand
    # this, but currently only have the ability to check items across all orgs)
    item_ids = []

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] > 0
    for item in data["items"]:
        item_ids.append(item["id"])

    # Delete org and its data
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers
    )
    assert r.status_code == 200
    assert r.json()["deleted"]

    # Ensure items got deleted
    for item_id in item_ids:
        r = requests.get(
            f"{API_PREFIX}/orgs/all/all-crawls/{item_id}/replay.json",
            headers=admin_auth_headers,
        )
        assert r.status_code == 404
