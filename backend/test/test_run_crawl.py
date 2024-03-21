import requests
import hashlib
import time
import io
import zipfile
import re
import csv
import codecs

from .conftest import API_PREFIX, HOST_PREFIX
from .test_collections import UPDATED_NAME as COLLECTION_NAME

wacz_path = None
wacz_size = None
wacz_hash = None

wacz_content = None

page_id = None


def test_list_orgs(admin_auth_headers, default_org_id):
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    data = r.json()

    orgs = data["items"]
    assert len(orgs) > 0
    assert data["total"] > 0

    org_ids = []
    for org in orgs:
        org_ids.append(org["id"])
    assert default_org_id in org_ids


def test_create_new_config(admin_auth_headers, default_org_id):
    crawl_data = {
        "runNow": False,
        "name": "Test Crawl",
        "config": {"seeds": [{"url": "https://webrecorder.net/"}]},
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["run_now_job"] == None
    assert data["storageQuotaReached"] is False


def test_wait_for_complete(admin_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["state"] == "complete"

    assert len(data["resources"]) == 1
    assert data["resources"][0]["path"]

    # ensure filename matches specified pattern
    # set in default_crawl_filename_template
    assert re.search("/[\\d]+-testing-[\\w-]+\\.wacz", data["resources"][0]["path"])

    assert data["tags"] == ["wr-test-1", "wr-test-2"]

    global wacz_path
    global wacz_size
    global wacz_hash
    wacz_path = data["resources"][0]["path"]
    wacz_size = data["resources"][0]["size"]
    wacz_hash = data["resources"][0]["hash"]


def test_crawl_info(admin_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["fileSize"] == wacz_size
    assert data["fileCount"] == 1
    assert data["userName"]


def test_crawls_include_seed_info(admin_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["firstSeed"] == "https://webrecorder.net/"
    assert data["seedCount"] == 1

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls",
        headers=admin_auth_headers,
    )
    data = r.json()
    crawls = data["items"]
    assert crawls
    for crawl in crawls:
        assert crawl["firstSeed"]
        assert crawl["seedCount"] > 0

    r = requests.get(
        f"{API_PREFIX}/orgs/all/crawls?runningOnly=0",
        headers=admin_auth_headers,
    )
    data = r.json()
    crawls = data["items"]
    assert crawls
    for crawl in crawls:
        assert crawl["firstSeed"]
        assert crawl["seedCount"] > 0


def test_crawl_seeds_endpoint(admin_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/seeds",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data["total"] == 1
    assert data["items"][0]["url"] == "https://webrecorder.net/"
    assert data["items"][0]["depth"] == 1


def test_crawls_exclude_errors(admin_auth_headers, default_org_id, admin_crawl_id):
    # Get endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("errors") == []

    # replay.json endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("errors") == []

    # List endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    for crawl in crawls:
        assert data.get("errors") == []


def test_crawls_exclude_full_seeds(admin_auth_headers, default_org_id, admin_crawl_id):
    # Get endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    config = data.get("config")
    assert config is None or config.get("seeds") is None

    # replay.json endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    config = r.json().get("config")
    assert config is None or config.get("seeds") is None

    # List endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    for crawl in crawls:
        config = crawl.get("config")
        assert config is None or config.get("seeds") is None


def test_download_wacz():
    r = requests.get(HOST_PREFIX + wacz_path)
    assert r.status_code == 200
    assert len(r.content) == wacz_size

    h = hashlib.sha256()
    h.update(r.content)
    assert h.hexdigest() == wacz_hash, (h.hexdigest(), wacz_hash)

    global wacz_content
    wacz_content = r.content


def test_verify_wacz():
    b = io.BytesIO(wacz_content)
    z = zipfile.ZipFile(b)

    assert "pages/pages.jsonl" in z.namelist()

    # 1 seed page
    pages = z.open("pages/pages.jsonl").read().decode("utf-8")
    assert '"https://webrecorder.net/"' in pages

    # 1 seed page + header line
    assert len(pages.strip().split("\n")) == 2

    # 1 other page
    pages = z.open("pages/extraPages.jsonl").read().decode("utf-8")
    assert '"https://webrecorder.net/blog"' in pages

    # 3 other page + header line
    assert len(pages.strip().split("\n")) == 4


def test_update_crawl(
    admin_auth_headers,
    default_org_id,
    admin_crawl_id,
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["tags"]) == ["wr-test-1", "wr-test-2"]
    assert len(data["collectionIds"]) == 1

    # Make new collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=admin_auth_headers,
        json={"name": "Crawl Update Test Collection"},
    )
    new_coll_id = r.json()["id"]

    # Submit patch request
    UPDATED_TAGS = ["wr-test-1-updated", "wr-test-2-updated"]
    UPDATED_DESC = "Lorem ipsum test note."
    UPDATED_NAME = "Updated crawl name"
    UPDATED_COLLECTION_IDS = [new_coll_id]
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
        json={
            "tags": UPDATED_TAGS,
            "description": UPDATED_DESC,
            "name": UPDATED_NAME,
            "collectionIds": UPDATED_COLLECTION_IDS,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["updated"]

    # Verify update was successful
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["tags"]) == sorted(UPDATED_TAGS)
    assert data["description"] == UPDATED_DESC
    assert data["name"] == UPDATED_NAME
    assert data["collectionIds"] == UPDATED_COLLECTION_IDS
    assert data.get("reviewStatus") is None

    # Update reviewStatus and verify
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
        json={
            "reviewStatus": "good",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["updated"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["reviewStatus"] == "good"

    # Try to update to invalid reviewStatus
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
        json={
            "reviewStatus": "invalid",
        },
    )
    assert r.status_code == 422

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["reviewStatus"] == "good"

    # Verify deleting works as well
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
        json={"tags": [], "description": None},
    )
    assert r.status_code == 200

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["tags"] == []
    assert not data["description"]


def test_crawl_stats_all_orgs_not_superadmin(crawler_auth_headers):
    r = requests.get(
        f"{API_PREFIX}/orgs/all/crawls/stats", headers=crawler_auth_headers
    )
    assert r.status_code == 403


def test_crawl_stats_all_orgs(admin_auth_headers):
    with requests.get(
        f"{API_PREFIX}/orgs/all/crawls/stats", headers=admin_auth_headers, stream=True
    ) as r:
        assert r.status_code == 200

        # Wait for stream content
        if not r.content:
            while True:
                if r.content:
                    break
                time.sleep(5)

        buffer = r.iter_lines()
        for row in csv.DictReader(
            codecs.iterdecode(buffer, "utf-8"), skipinitialspace=True
        ):
            assert row["id"]
            assert row["oid"]
            assert row["org"]
            assert row["cid"]
            assert row["name"] or row["name"] == ""
            assert row["state"]
            assert row["userid"]
            assert row["user"]
            assert row["started"]
            assert row["finished"] or row["finished"] is None
            assert row["duration"] or row["duration"] == 0
            assert row["pages"] or row["pages"] == 0
            assert row["filesize"] or row["filesize"] == 0
            assert row["avg_page_time"] or row["avg_page_time"] == 0


def test_crawl_stats(crawler_auth_headers, default_org_id):
    with requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/stats",
        headers=crawler_auth_headers,
        stream=True,
    ) as r:
        assert r.status_code == 200

        # Wait for stream content
        if not r.content:
            while True:
                if r.content:
                    break
                time.sleep(5)

        buffer = r.iter_lines()
        for row in csv.DictReader(
            codecs.iterdecode(buffer, "utf-8"), skipinitialspace=True
        ):
            assert row["id"]
            assert row["oid"] == default_org_id
            assert row["org"]
            assert row["cid"]
            assert row["name"] or row["name"] == ""
            assert row["state"]
            assert row["userid"]
            assert row["user"]
            assert row["started"]
            assert row["finished"] or row["finished"] is None
            assert row["duration"] or row["duration"] == 0
            assert row["pages"] or row["pages"] == 0
            assert row["filesize"] or row["filesize"] == 0
            assert row["avg_page_time"] or row["avg_page_time"] == 0


def test_crawl_pages(crawler_auth_headers, default_org_id, crawler_crawl_id):
    # Test GET list endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 0

    pages = data["items"]
    assert pages

    for page in pages:
        assert page["id"]
        assert page["oid"]
        assert page["crawl_id"]
        assert page["url"]
        assert page["ts"]
        assert page.get("title") or page.get("title") is None
        assert page["loadState"]
        assert page["status"]

    # Test GET page endpoint
    global page_id
    page_id = pages[0]["id"]
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    page = r.json()

    assert page["id"] == page_id
    assert page["oid"]
    assert page["crawl_id"]
    assert page["url"]
    assert page["ts"]
    assert page.get("title") or page.get("title") is None
    assert page["loadState"]

    assert page["notes"] == []
    assert page.get("userid") is None
    assert page.get("modified") is None
    assert page.get("approved") is None

    # Update page with approval
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
        json={
            "approved": True,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    page = r.json()

    assert page["id"] == page_id
    assert page["oid"]
    assert page["crawl_id"]
    assert page["url"]
    assert page["ts"]
    assert page.get("title") or page.get("title") is None
    assert page["loadState"]

    assert page["notes"] == []
    assert page["userid"]
    assert page["modified"]
    assert page["approved"]


def test_re_add_crawl_pages(crawler_auth_headers, default_org_id, crawler_crawl_id):
    # Re-add pages and verify they were correctly added
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/reAdd",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["started"]

    time.sleep(10)

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 0

    pages = data["items"]
    assert pages

    for page in pages:
        assert page["id"]
        assert page["oid"]
        assert page["crawl_id"]
        assert page["url"]
        assert page["ts"]
        assert page.get("title") or page.get("title") is None
        assert page["loadState"]
        assert page["status"]

    # Ensure only superuser can re-add pages for all crawls in an org
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/all/pages/reAdd",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 403


def test_crawl_page_notes(crawler_auth_headers, default_org_id, crawler_crawl_id):
    note_text = "testing"
    updated_note_text = "updated"
    untouched_text = "untouched"

    # Add note
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}/notes",
        headers=crawler_auth_headers,
        json={"text": note_text},
    )
    assert r.status_code == 200
    assert r.json()["added"]

    # Check that note was added
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["notes"]) == 1

    first_note = data["notes"][0]

    first_note_id = first_note["id"]
    assert first_note_id

    assert first_note["created"]
    assert first_note["userid"]
    assert first_note["userName"]
    assert first_note["text"] == note_text

    # Add second note to test selective updates/deletes
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}/notes",
        headers=crawler_auth_headers,
        json={"text": untouched_text},
    )
    assert r.status_code == 200
    assert r.json()["added"]

    # Edit first note
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}/notes",
        headers=crawler_auth_headers,
        json={"text": updated_note_text, "id": first_note_id},
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Verify notes look as expected
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    notes = data["notes"]

    assert len(notes) == 2

    updated_note = [note for note in notes if note["id"] == first_note_id][0]
    assert updated_note["text"] == updated_note_text

    second_note_id = [note["id"] for note in notes if note["text"] == untouched_text][0]
    assert second_note_id

    # Delete both notes
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}/notes/delete",
        headers=crawler_auth_headers,
        json={"delete_list": [first_note_id, second_note_id]},
    )
    assert r.status_code == 200
    assert r.json()["deleted"]

    # Verify notes were deleted
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    notes = data.get("notes")
    assert notes == []


def test_delete_crawls_crawler(
    crawler_auth_headers, default_org_id, admin_crawl_id, crawler_crawl_id
):
    # Test that crawler user can't delete another user's crawls
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=crawler_auth_headers,
        json={"crawl_ids": [admin_crawl_id]},
    )
    assert r.status_code == 403
    data = r.json()
    assert data["detail"] == "not_allowed"

    # Check that pages exist for crawl
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] > 0

    # Test that crawler user can delete own crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=crawler_auth_headers,
        json={"crawl_ids": [crawler_crawl_id]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"] == 1
    assert data["storageQuotaReached"] is False

    time.sleep(5)

    # Test that crawl is not found after deleting
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 404

    # Test that associated pages are also deleted
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0


def test_delete_crawls_org_owner(
    admin_auth_headers,
    crawler_auth_headers,
    default_org_id,
    admin_crawl_id,
    crawler_crawl_id,
    wr_specs_crawl_id,
):
    # Test that org owner can delete own crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [admin_crawl_id]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"]
    assert data["storageQuotaReached"] is False

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 404

    # Test that org owner can delete another org user's crawls
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [wr_specs_crawl_id]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"] == 1

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{wr_specs_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 404
