import json
import os
import requests
import tempfile
import time

from .conftest import API_PREFIX
from btrixcloud.models import (
    Organization,
    Profile,
    CrawlConfig,
    ConfigRevision,
    BaseCrawl,
    Collection,
    Page,
)


curr_dir = os.path.dirname(os.path.realpath(__file__))

ORG_EXPORT_FIXTURE = os.path.join(curr_dir, "data", "org-export.json")
ORG_FIXTURE_UUID = "4c880741-c1b7-47ae-b825-3fb15d52a760"
CRAWL_FIXTURE_ID = "manual-20240701173130-64000a3d-c39"


def test_export_org(admin_auth_headers, default_org_id):
    tf = tempfile.NamedTemporaryFile(delete=False)
    with open(tf.name, "wb") as json_export:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/export/json",
            headers=admin_auth_headers,
            stream=True,
        )
        assert r.status_code == 200
        for chunk in r.iter_lines():
            json_export.write(chunk)

    org_json = json.load(tf)
    org_data = org_json["data"]
    assert org_data

    assert isinstance(org_data["dbVersion"], str)

    assert isinstance(org_data["org"], dict)
    org_dict = org_data["org"]
    org = Organization.from_dict(org_dict)
    assert org

    user_details = org_dict["userDetails"]
    assert user_details
    for user in user_details:
        assert user["id"]
        assert user["role"]
        assert user["name"]
        assert user["email"]

    profiles = org_data["profiles"]
    assert profiles
    assert isinstance(profiles, list)
    for profile_dict in profiles:
        profile = Profile.from_dict(profile_dict)
        assert profile

    workflows = org_data["workflows"]
    assert workflows
    assert isinstance(workflows, list)
    for workflow_dict in workflows:
        workflow = CrawlConfig.from_dict(workflow_dict)
        assert workflow

    revisions = org_data["workflowRevisions"]
    assert revisions
    assert isinstance(revisions, list)
    for rev_dict in revisions:
        revision = ConfigRevision.from_dict(rev_dict)
        assert revision

    items = org_data["items"]
    assert items
    assert isinstance(items, list)
    for item_dict in items:
        item = BaseCrawl.from_dict(item_dict)
        assert item

    pages = org_data["pages"]
    assert pages
    assert isinstance(pages, list)
    for page_dict in pages:
        page = Page.from_dict(page_dict)
        assert page

    collections = org_data["collections"]
    assert collections
    assert isinstance(collections, list)
    for coll_dict in collections:
        coll = Collection.from_dict(coll_dict)
        assert coll

    tf.close()


def test_export_org_insufficient_credentials(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/export/json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 403


def test_import_org(admin_auth_headers):
    # Import org through fixture
    with open(ORG_EXPORT_FIXTURE, "rb") as f:
        r = requests.post(
            f"{API_PREFIX}/orgs/import/json?ignoreVersion=true",
            headers=admin_auth_headers,
            data=f,
        )
        assert r.status_code == 200

    time.sleep(10)

    # Check org
    r = requests.get(
        f"{API_PREFIX}/orgs/{ORG_FIXTURE_UUID}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "dev"

    # Ensure org users were added
    expected_users = {
        "orgadmin@example.com": {
            "name": "Org Admin",
            "role": 40,
        },
        "orgcrawler@example.com": {
            "name": "Crawler",
            "role": 20,
        },
        "orgcrawler2@example.com": {"name": "Crawler 2", "role": 20},
    }

    for _, value in data["users"].items():
        # Value is dict with email, name, role keys
        user_email = value["email"]
        expected_user = expected_users[user_email]
        assert expected_user
        assert expected_user["name"] == value["name"]
        assert expected_user["role"] == value["role"]

    # Check profiles
    r = requests.get(
        f"{API_PREFIX}/orgs/{ORG_FIXTURE_UUID}/profiles",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2

    # Check workflows
    r = requests.get(
        f"{API_PREFIX}/orgs/{ORG_FIXTURE_UUID}/crawlconfigs",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2

    # Check items
    r = requests.get(
        f"{API_PREFIX}/orgs/{ORG_FIXTURE_UUID}/all-crawls",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 4

    r = requests.get(
        f"{API_PREFIX}/orgs/{ORG_FIXTURE_UUID}/crawls",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3

    r = requests.get(
        f"{API_PREFIX}/orgs/{ORG_FIXTURE_UUID}/uploads",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1

    # Check pages
    r = requests.get(
        f"{API_PREFIX}/orgs/{ORG_FIXTURE_UUID}/crawls/{CRAWL_FIXTURE_ID}/pages",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 47

    # Check collections
    r = requests.get(
        f"{API_PREFIX}/orgs/{ORG_FIXTURE_UUID}/collections",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2


def test_import_org_insufficient_credentials(crawler_auth_headers):
    with open(ORG_EXPORT_FIXTURE, "rb") as f:
        r = requests.post(
            f"{API_PREFIX}/orgs/import/json?ignoreVersion=true",
            headers=crawler_auth_headers,
            data=f,
        )
        assert r.status_code == 403
