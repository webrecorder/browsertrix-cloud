import pytest
import requests
import time
import datetime


HOST_PREFIX = "http://127.0.0.1:30870"
API_PREFIX = HOST_PREFIX + "/api"

ADMIN_USERNAME = "admin@example.com"
ADMIN_PW = "PASSW0RD!"

CRAWLER_USERNAME = "crawlernightly@example.com"
CRAWLER_PW = "crawlerPASSWORD!"


@pytest.fixture(scope="session")
def admin_auth_headers():
    while True:
        r = requests.post(
            f"{API_PREFIX}/auth/jwt/login",
            data={
                "username": ADMIN_USERNAME,
                "password": ADMIN_PW,
                "grant_type": "password",
            },
        )
        data = r.json()
        try:
            return {"Authorization": f"Bearer {data['access_token']}"}
        except:
            print("Waiting for admin_auth_headers")
            time.sleep(5)


@pytest.fixture(scope="session")
def default_org_id(admin_auth_headers):
    while True:
        r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
        data = r.json()
        try:
            for org in data["items"]:
                if org["default"] is True:
                    return org["id"]
        except:
            print("Waiting for default org id")
            time.sleep(5)


@pytest.fixture(scope="session")
def crawler_auth_headers(admin_auth_headers, default_org_id):
    requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/add-user",
        json={
            "email": CRAWLER_USERNAME,
            "password": CRAWLER_PW,
            "name": "new-crawler",
            "role": 20,
        },
        headers=admin_auth_headers,
    )
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": CRAWLER_USERNAME,
            "password": CRAWLER_PW,
            "grant_type": "password",
        },
    )
    data = r.json()
    access_token = data.get("access_token")
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture(scope="session")
def crawl_id_wr(admin_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Webrecorder admin test crawl",
        "tags": ["wr", "nightly testing"],
        "config": {
            "seeds": [{"url": "https://webrecorder.net/"}],
            "limit": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def crawl_id_wr_specs(admin_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Webrecorder Specs admin test crawl",
        "tags": ["wr-specs", "nightly testing"],
        "config": {
            "seeds": [{"url": "https://specs.webrecorder.net/"}],
            "limit": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def crawl_config_info(admin_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Crawl config test",
        "config": {"seeds": [{"url": "https://specs.webrecorder.net/"}], "limit": 1},
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    crawl_config_id = data["id"]
    crawl_id = data["run_now_job"]
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            break
        time.sleep(5)

    # Run second crawl from crawlconfig and return info when it finishes
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawl_config_id}/run",
        headers=admin_auth_headers,
    )
    data = r.json()
    second_crawl_id = data["started"]
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{second_crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            return (crawl_config_id, crawl_id, second_crawl_id)
        time.sleep(5)


@pytest.fixture(scope="session")
def large_crawl_id(admin_auth_headers, default_org_id):
    # Start crawl
    crawl_data = {
        "runNow": True,
        "name": "Large Test Crawl",
        "tags": ["wacz-logs"],
        "config": {
            "seeds": [{"url": "https://webrecorder.net/"}],
            "scopeType": "domain",
            "limit": 100,
            "extraHops": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    crawl_id = data["run_now_job"]

    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "running":
            # Give crawl time to start properly
            time.sleep(30)
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def large_crawl_finished(admin_auth_headers, default_org_id, large_crawl_id):
    # Wait for crawl to complete
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{large_crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            # Give some time for WACZ files to be stored
            time.sleep(30)
            break
        time.sleep(5)


@pytest.fixture(scope="session")
def timeout_crawl(admin_auth_headers, default_org_id):
    # Start crawl
    crawl_data = {
        "runNow": True,
        "name": "Crawl with crawl timeout",
        "crawlTimeout": 15,
        "config": {
            "seeds": [{"url": "https://webrecorder.net/"}],
            "scopeType": "domain",
            "limit": 100,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()
    return data["run_now_job"]


@pytest.fixture(scope="session")
def max_crawl_size_crawl_id(admin_auth_headers, default_org_id):
    # Start crawl
    crawl_data = {
        "runNow": True,
        "name": "Crawl with 5 MB max crawl size limit",
        # Note crawl will exceed this size, as crawl begins to gracefully
        # shut down when operator notices this value has been exceeded.
        "maxCrawlSize": 5242880,
        "config": {
            "seeds": [{"url": "https://webrecorder.net/"}],
            "scopeType": "domain",
            "limit": 100,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()
    return data["run_now_job"]


@pytest.fixture(scope="session")
def error_crawl_id(admin_auth_headers, default_org_id):
    crawl_data = {
        "runNow": True,
        "name": "Invalid URL crawl",
        "config": {
            "seeds": [
                {"url": "https://invalid-x.webrecorder.net/"},
            ],
            "limit": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    crawl_id = data["run_now_job"]

    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def org_with_quotas(admin_auth_headers):
    name = "Quota Org " + datetime.datetime.utcnow().isoformat()
    r = requests.post(
        f"{API_PREFIX}/orgs/create", headers=admin_auth_headers, json={"name": name}
    )
    data = r.json()

    return data["id"]
