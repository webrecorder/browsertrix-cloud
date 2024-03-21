from .conftest import API_PREFIX, HOST_PREFIX
import requests
import time
from datetime import datetime

qa_run_id = None


def test_run_qa(crawler_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/start",
        headers=crawler_auth_headers,
    )

    assert r.status_code == 200

    data = r.json()
    assert data["started"]
    global qa_run_id
    qa_run_id = data["started"]


def test_run_qa_already_running(crawler_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/start",
        headers=crawler_auth_headers,
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "qa_already_running"


def test_active_qa(crawler_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/activeQA",
        headers=crawler_auth_headers,
    )

    data = r.json()
    qa = data["qa"]

    assert qa
    assert qa["state"]
    assert qa["started"]
    assert not qa["finished"]


def test_qa_list(crawler_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa",
        headers=crawler_auth_headers,
    )

    data = r.json()

    assert len(data) == 1

    qa = data[0]
    assert qa
    assert qa["state"]
    assert qa["started"]
    assert not qa["finished"]


def test_wait_for_complete(crawler_crawl_id, crawler_auth_headers, default_org_id):
    count = 0
    completed = False
    while count < 24:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/activeQA",
            headers=crawler_auth_headers,
        )

        data = r.json()
        if not data["qa"]:
            completed = True
            break

        time.sleep(5)
        count += 1

    assert completed


def test_qa_completed(crawler_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa",
        headers=crawler_auth_headers,
    )

    data = r.json()

    assert len(data) == 1

    qa = data[0]
    assert qa
    assert qa["state"] == "complete"
    assert qa["started"]
    assert qa["finished"]
    assert qa["stats"]["found"] == 1
    assert qa["stats"]["done"] == 1
    assert qa["crawlExecSeconds"] > 0


def test_qa_org_stats(crawler_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}",
        headers=crawler_auth_headers,
    )
    crawl_stats = r.json()
    assert crawl_stats["qaCrawlExecSeconds"] > 0

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}",
        headers=crawler_auth_headers,
    )
    org_stats = r.json()

    yymm = datetime.utcnow().strftime("%Y-%m")
    assert org_stats["qaCrawlExecSeconds"][yymm] > 0
    assert org_stats["qaUsage"][yymm] > 0


def test_qa_page_data(crawler_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/{qa_run_id}/pages",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert len(data["items"]) == 1
    page = data["items"][0]
    assert page["title"] == "Webrecorder"
    assert page["url"] == "https://webrecorder.net/"
    assert page["qa"]["textMatch"] == 1.0
    assert page["qa"]["screenshotMatch"] == 1.0
    assert page["qa"]["resourceCounts"] == {
        "crawlGood": 15,
        "crawlBad": 0,
        "replayGood": 15,
        "replayBad": 1,
    }


def test_qa_replay(crawler_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/{qa_run_id}/replay.json",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert len(data["resources"]) == 1
    assert data["resources"][0]["path"]


def test_run_qa_not_running(crawler_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/stop",
        headers=crawler_auth_headers,
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "qa_not_running"


def test_delete_qa_run(crawler_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/delete",
        json={"qa_run_ids": [qa_run_id]},
        headers=crawler_auth_headers,
    )

    assert r.status_code == 200
    assert r.json()["deleted"] == True

    # deleted from finished qa list
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa",
        headers=crawler_auth_headers,
    )

    assert len(r.json()) == 0

    # deleted from pages
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/{qa_run_id}/pages",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["items"]) == 0
