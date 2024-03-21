import requests
import os
import time
from urllib.parse import urljoin

from .conftest import API_PREFIX
from .utils import read_in_chunks

upload_id = None
upload_id_2 = None
upload_dl_path = None

_coll_id = None


curr_dir = os.path.dirname(os.path.realpath(__file__))


def test_upload_stream(admin_auth_headers, default_org_id, uploads_collection_id):
    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream?filename=test.wacz&name=My%20Upload&description=Testing%0AData&collections={uploads_collection_id}&tags=one%2Ctwo",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 200
    assert r.json()["added"]

    global upload_id
    upload_id = r.json()["id"]


def test_list_stream_upload(admin_auth_headers, default_org_id, uploads_collection_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads",
        headers=admin_auth_headers,
    )
    results = r.json()

    assert len(results["items"]) > 0

    found = None

    for res in results["items"]:
        if res["id"] == upload_id:
            found = res

    assert found
    assert found["name"] == "My Upload"
    assert found["description"] == "Testing\nData"
    assert found["collectionIds"] == [uploads_collection_id]
    assert sorted(found["tags"]) == ["one", "two"]
    assert "files" not in found
    assert "resources" not in found


def test_get_stream_upload(admin_auth_headers, default_org_id, uploads_collection_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    result = r.json()
    assert uploads_collection_id in result["collectionIds"]
    assert "files" not in result
    upload_dl_path = result["resources"][0]["path"]
    assert "test-" in result["resources"][0]["name"]
    assert result["resources"][0]["name"].endswith(".wacz")

    dl_path = urljoin(API_PREFIX, upload_dl_path)
    wacz_resp = requests.get(dl_path)
    actual = wacz_resp.content

    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        expected = fh.read()

    assert len(actual) == len(expected)
    assert actual == expected

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200


def test_upload_form(admin_auth_headers, default_org_id, uploads_collection_id):
    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        data = fh.read()

    files = [
        ("uploads", ("test.wacz", data, "application/octet-stream")),
        ("uploads", ("test-2.wacz", data, "application/octet-stream")),
        ("uploads", ("test.wacz", data, "application/octet-stream")),
    ]

    r = requests.put(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/formdata?name=test2.wacz&collections={uploads_collection_id}&tags=three%2Cfour",
        headers=admin_auth_headers,
        files=files,
    )

    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    assert data["storageQuotaReached"] is False

    global upload_id_2
    upload_id_2 = r.json()["id"]


def test_list_uploads(admin_auth_headers, default_org_id, uploads_collection_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads",
        headers=admin_auth_headers,
    )
    results = r.json()

    assert len(results["items"]) > 1

    found = None

    for res in results["items"]:
        if res["id"] == upload_id_2:
            found = res

    assert found
    assert found["name"] == "test2.wacz"
    assert found["collectionIds"] == [uploads_collection_id]
    assert sorted(found["tags"]) == ["four", "three"]

    assert "files" not in res
    assert "resources" not in res


def test_collection_uploads(admin_auth_headers, default_org_id, uploads_collection_id):
    # Test uploads filtered by collection
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads?collectionId={uploads_collection_id}",
        headers=admin_auth_headers,
    )

    results = r.json()

    assert len(results["items"]) == 2
    assert results["items"][0]["id"] in (upload_id, upload_id_2)
    assert results["items"][1]["id"] in (upload_id, upload_id_2)

    # Test all crawls filtered by collection
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?collectionId={uploads_collection_id}",
        headers=admin_auth_headers,
    )

    results = r.json()

    assert len(results["items"]) == 2
    assert results["items"][0]["id"] in (upload_id, upload_id_2)
    assert results["items"][1]["id"] in (upload_id, upload_id_2)


def test_get_upload_replay_json(
    admin_auth_headers, default_org_id, uploads_collection_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data
    assert data["id"] == upload_id
    assert data["name"] == "My Upload"
    assert data["collectionIds"] == [uploads_collection_id]
    assert sorted(data["tags"]) == ["one", "two"]
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert data["errors"] == []
    assert "files" not in data


def test_get_upload_replay_json_admin(
    admin_auth_headers, default_org_id, uploads_collection_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/all/uploads/{upload_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data
    assert data["id"] == upload_id
    assert data["name"] == "My Upload"
    assert data["collectionIds"] == [uploads_collection_id]
    assert sorted(data["tags"]) == ["one", "two"]
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert data["errors"] == []
    assert "files" not in data


def test_replace_upload(admin_auth_headers, default_org_id, uploads_collection_id):
    actual_id = do_upload_replace(
        admin_auth_headers, default_org_id, upload_id, uploads_collection_id
    )

    assert upload_id == actual_id


def do_upload_replace(
    admin_auth_headers, default_org_id, upload_id, uploads_collection_id
):
    with open(os.path.join(curr_dir, "data", "example-2.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream?filename=test.wacz&name=My%20Upload%20Updated&replaceId={upload_id}&collections={uploads_collection_id}",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 200
    assert r.json()["added"]
    actual_id = r.json()["id"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{actual_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    result = r.json()

    # only one file, previous file removed
    assert len(result["resources"]) == 1

    dl_path = urljoin(API_PREFIX, result["resources"][0]["path"])
    wacz_resp = requests.get(dl_path)
    actual = wacz_resp.content

    with open(os.path.join(curr_dir, "data", "example-2.wacz"), "rb") as fh:
        expected = fh.read()

    assert len(actual) == len(expected)
    assert actual == expected

    return actual_id


def test_update_upload_metadata(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "My Upload Updated"
    assert not data["tags"]
    assert not data["description"]
    assert len(data["collectionIds"]) == 1

    # Make new collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=admin_auth_headers,
        json={"name": "Patch Update Test Collection"},
    )
    new_coll_id = r.json()["id"]

    # Submit patch request to update name, tags, and description
    UPDATED_NAME = "New Upload Name"
    UPDATED_TAGS = ["wr-test-1-updated", "wr-test-2-updated"]
    UPDATED_DESC = "Lorem ipsum test note."
    UPDATED_COLLECTION_IDS = [new_coll_id]
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}",
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
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["tags"]) == sorted(UPDATED_TAGS)
    assert data["description"] == UPDATED_DESC
    assert data["name"] == UPDATED_NAME
    assert data["collectionIds"] == UPDATED_COLLECTION_IDS


def test_delete_stream_upload(admin_auth_headers, crawler_auth_headers, default_org_id):
    # Verify non-admin user who didn't upload crawl can't delete it
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/delete",
        headers=crawler_auth_headers,
        json={"crawl_ids": [upload_id]},
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "not_allowed"

    # Verify user who created upload can delete it
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [upload_id]},
    )
    data = r.json()
    assert data["deleted"]
    assert data["storageQuotaReached"] is False


def test_ensure_deleted(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads",
        headers=admin_auth_headers,
    )
    results = r.json()

    for res in results["items"]:
        if res["id"] == upload_id:
            assert False


def test_replace_upload_non_existent(
    admin_auth_headers, default_org_id, uploads_collection_id
):
    global upload_id

    # same replacement, but now to a non-existent upload
    actual_id = do_upload_replace(
        admin_auth_headers, default_org_id, upload_id, uploads_collection_id
    )

    # new upload_id created
    assert actual_id != upload_id

    upload_id = actual_id


def test_verify_from_upload_resource_count(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id_2}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    result = r.json()

    assert "files" not in result
    assert len(result["resources"]) == 3

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id_2}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200


def test_list_all_crawls(admin_auth_headers, default_org_id):
    """Test that /all-crawls lists crawls and uploads before deleting uploads"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    items = data["items"]

    assert len(items) == data["total"]

    crawls = [item for item in items if item["type"] == "crawl"]
    assert len(crawls) > 0

    uploads = [item for item in items if item["type"] == "upload"]
    assert len(uploads) > 0

    for item in items:
        assert item["type"] in ("crawl", "upload")

        if item["type"] == "crawl":
            assert item["firstSeed"]
            assert item["seedCount"]
            assert item.get("name") or item.get("name") == ""

        assert item["id"]
        assert item["userid"]
        assert item["oid"] == default_org_id
        assert item["started"]
        assert item["finished"]
        assert item["state"]


def test_get_all_crawls_by_name(admin_auth_headers, default_org_id):
    """Test filtering /all-crawls by name"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?name=test2.wacz",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1
    items = data["items"]
    assert items[0]["id"] == upload_id_2
    assert items[0]["name"] == "test2.wacz"

    crawl_name = "Crawler User Test Crawl"
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?name={crawl_name}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3
    for item in data["items"]:
        assert item["name"] == crawl_name


def test_get_all_crawls_by_first_seed(
    admin_auth_headers, default_org_id, crawler_crawl_id
):
    """Test filtering /all-crawls by first seed"""
    first_seed = "https://webrecorder.net/"
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?firstSeed={first_seed}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3
    for item in data["items"]:
        assert item["firstSeed"] == first_seed


def test_get_all_crawls_by_type(admin_auth_headers, default_org_id, admin_crawl_id):
    """Test filtering /all-crawls by crawl type"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?crawlType=crawl",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3
    for item in data["items"]:
        assert item["type"] == "crawl"

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?crawlType=upload",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3
    for item in data["items"]:
        assert item["type"] == "upload"

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?crawlType=invalid",
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_crawl_type"


def test_get_all_crawls_by_user(admin_auth_headers, default_org_id, crawler_userid):
    """Test filtering /all-crawls by userid"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?userid={crawler_userid}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 4
    for item in data["items"]:
        assert item["userid"] == crawler_userid


def test_get_all_crawls_by_cid(
    admin_auth_headers, default_org_id, all_crawls_config_id
):
    """Test filtering /all-crawls by cid"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?cid={all_crawls_config_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1
    assert data["items"][0]["cid"] == all_crawls_config_id


def test_get_all_crawls_by_state(admin_auth_headers, default_org_id, admin_crawl_id):
    """Test filtering /all-crawls by cid"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?state=complete,stopped_by_user",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 5
    items = data["items"]
    for item in items:
        assert item["state"] in (
            "complete",
            "stopped_by_user",
        )


def test_get_all_crawls_by_collection_id(
    admin_auth_headers, default_org_id, admin_config_id, all_crawls_crawl_id
):
    """Test filtering /all-crawls by collection id"""
    # Create collection and add upload to it
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=admin_auth_headers,
        json={
            "crawlIds": [all_crawls_crawl_id],
            "name": "all-crawls collection",
        },
    )
    assert r.status_code == 200
    global _coll_id
    _coll_id = r.json()["id"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?collectionId={_coll_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["id"] == all_crawls_crawl_id


def test_sort_all_crawls(admin_auth_headers, default_org_id, admin_crawl_id):
    # Sort by started, descending (default)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=started",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["total"] == 7
    items = data["items"]
    assert len(items) == 7

    last_created = None
    for crawl in items:
        if last_created:
            assert crawl["started"] <= last_created
        last_created = crawl["started"]

    # Sort by started, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=started&sortDirection=1",
        headers=admin_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_created = None
    for crawl in items:
        if last_created:
            assert crawl["started"] >= last_created
        last_created = crawl["started"]

    # Sort by finished
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=finished",
        headers=admin_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_finished = None
    for crawl in items:
        if not crawl["finished"]:
            continue
        if last_finished:
            assert crawl["finished"] <= last_finished
        last_finished = crawl["finished"]

    # Sort by finished, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=finished&sortDirection=1",
        headers=admin_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_finished = None
    for crawl in items:
        if not crawl["finished"]:
            continue
        if last_finished:
            assert crawl["finished"] >= last_finished
        last_finished = crawl["finished"]

    # Sort by fileSize
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=fileSize",
        headers=admin_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_size = None
    for crawl in items:
        if last_size:
            assert crawl["fileSize"] <= last_size
        last_size = crawl["fileSize"]

    # Sort by fileSize, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=fileSize&sortDirection=1",
        headers=admin_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_size = None
    for crawl in items:
        if last_size:
            assert crawl["fileSize"] >= last_size
        last_size = crawl["fileSize"]

    # Invalid sort value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=invalid",
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_by"

    # Invalid sort_direction value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=started&sortDirection=0",
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_direction"


def test_all_crawls_search_values(admin_auth_headers, default_org_id):
    """Test that all-crawls search values return expected results"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/search-values",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["names"]) == 5
    expected_names = [
        "Crawler User Test Crawl",
        "My Upload Updated",
        "test2.wacz",
        "All Crawls Test Crawl",
    ]
    for expected_name in expected_names:
        assert expected_name in data["names"]

    assert sorted(data["descriptions"]) == ["Lorem ipsum"]
    assert sorted(data["firstSeeds"]) == ["https://webrecorder.net/"]

    # Test filtering by crawls
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/search-values?crawlType=crawl",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["names"]) == 2
    expected_names = [
        "Crawler User Test Crawl",
        "All Crawls Test Crawl",
    ]
    for expected_name in expected_names:
        assert expected_name in data["names"]

    assert sorted(data["descriptions"]) == ["Lorem ipsum"]
    assert sorted(data["firstSeeds"]) == ["https://webrecorder.net/"]

    # Test filtering by uploads
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/search-values?crawlType=upload",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["names"]) == 3
    expected_names = [
        "My Upload Updated",
        "test2.wacz",
    ]
    for expected_name in expected_names:
        assert expected_name in data["names"]

    assert sorted(data["descriptions"]) == []
    assert sorted(data["firstSeeds"]) == []

    # Test invalid filter
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/search-values?crawlType=invalid",
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_crawl_type"


def test_get_upload_from_all_crawls(admin_auth_headers, default_org_id):
    """Test that /all-crawls lists crawls and uploads before deleting uploads"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id_2}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["name"] == "test2.wacz"

    assert "files" not in data
    assert data["resources"]


def test_get_upload_replay_json_from_all_crawls(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id_2}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data
    assert data["id"] == upload_id_2
    assert data["name"] == "test2.wacz"
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert data["errors"] == []
    assert "files" not in data


def test_get_upload_replay_json_admin_from_all_crawls(
    admin_auth_headers, default_org_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/all/all-crawls/{upload_id_2}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data
    assert data["id"] == upload_id_2
    assert data["name"] == "test2.wacz"
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert data["errors"] == []
    assert "files" not in data


def test_update_upload_metadata_all_crawls(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "My Upload Updated"
    assert not data["tags"]
    assert not data["description"]
    assert len(data["collectionIds"]) == 1

    # Make new collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=admin_auth_headers,
        json={"name": "Patch Update Test Collection 2"},
    )
    new_coll_id = r.json()["id"]

    # Submit patch request to update name, tags, and description
    UPDATED_NAME = "New Upload Name 2"
    UPDATED_TAGS = ["wr-test-1-updated-again", "wr-test-2-updated-again"]
    UPDATED_DESC = "Lorem ipsum test note 2."
    UPDATED_COLLECTION_IDS = [new_coll_id]
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id}",
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
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["tags"]) == sorted(UPDATED_TAGS)
    assert data["description"] == UPDATED_DESC
    assert data["name"] == UPDATED_NAME
    assert data["collectionIds"] == UPDATED_COLLECTION_IDS

    # Submit patch request to set collections to empty list
    UPDATED_COLLECTION_IDS = []
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id}",
        headers=admin_auth_headers,
        json={
            "collectionIds": UPDATED_COLLECTION_IDS,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["updated"]

    # Verify update was successful
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["tags"]) == sorted(UPDATED_TAGS)
    assert data["description"] == UPDATED_DESC
    assert data["name"] == UPDATED_NAME
    assert data["collectionIds"] == []


def test_delete_form_upload_and_crawls_from_all_crawls(
    admin_auth_headers,
    crawler_auth_headers,
    default_org_id,
    all_crawls_delete_crawl_ids,
    all_crawls_delete_config_id,
):
    crawls_to_delete = all_crawls_delete_crawl_ids
    crawls_to_delete.append(upload_id_2)

    # Get org metrics
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/metrics",
        headers=admin_auth_headers,
    )
    data = r.json()

    org_bytes = data["storageUsedBytes"]
    org_crawl_bytes = data["storageUsedCrawls"]
    org_upload_bytes = data["storageUsedUploads"]

    # Get workflow and crawl sizes
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{all_crawls_delete_config_id}",
        headers=admin_auth_headers,
    )
    workflow_size = r.json()["totalSize"]

    crawl_id_1 = all_crawls_delete_crawl_ids[0]
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id_1}/replay.json",
        headers=admin_auth_headers,
    )
    crawl_1_size = r.json()["fileSize"]

    crawl_id_2 = all_crawls_delete_crawl_ids[1]
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id_2}/replay.json",
        headers=admin_auth_headers,
    )
    crawl_2_size = r.json()["fileSize"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id_2}/replay.json",
        headers=admin_auth_headers,
    )
    upload_size = r.json()["fileSize"]

    combined_crawl_size = crawl_1_size + crawl_2_size
    total_size = combined_crawl_size + upload_size

    # Verify that non-admin user can't delete another's items
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/delete",
        headers=crawler_auth_headers,
        json={"crawl_ids": crawls_to_delete},
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "not_allowed"

    # Delete mixed type archived items
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": crawls_to_delete},
    )
    data = r.json()
    assert data["deleted"]
    assert data["storageQuotaReached"] is False

    # Check that org and workflow size figures are as expected
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/metrics",
        headers=admin_auth_headers,
    )
    data = r.json()

    assert data["storageUsedBytes"] == org_bytes - total_size
    assert data["storageUsedCrawls"] == org_crawl_bytes - combined_crawl_size
    assert data["storageUsedUploads"] == org_upload_bytes - upload_size

    time.sleep(10)

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{all_crawls_delete_config_id}",
        headers=admin_auth_headers,
    )
    assert r.json()["totalSize"] == workflow_size - combined_crawl_size
