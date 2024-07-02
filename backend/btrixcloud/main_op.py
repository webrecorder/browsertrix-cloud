""" entrypoint module for operator """

import os
import sys

from fastapi import FastAPI

from .crawlmanager import CrawlManager
from .db import init_db
from .emailsender import EmailSender
from .operator import init_operator_api
from .utils import register_exit_handler

from .invites import InviteOps
from .users import init_user_manager
from .orgs import OrgOps
from .colls import CollectionOps
from .crawlconfigs import CrawlConfigOps
from .crawls import CrawlOps
from .profiles import ProfileOps
from .storages import init_storages_api
from .webhooks import EventWebhookOps
from .background_jobs import BackgroundJobOps
from .pages import PageOps

app_root = FastAPI()


# ============================================================================
# pylint: disable=too-many-function-args, duplicate-code
def main():
    """main init"""
    email = EmailSender()
    crawl_manager = None

    dbclient, mdb = init_db()

    invite_ops = InviteOps(mdb, email)

    user_manager = init_user_manager(mdb, email, invite_ops)

    org_ops = OrgOps(mdb, invite_ops, user_manager)

    event_webhook_ops = EventWebhookOps(mdb, org_ops)

    # pylint: disable=import-outside-toplevel
    if not os.environ.get("KUBERNETES_SERVICE_HOST"):
        print(
            "Sorry, the Browsertrix Backend must be run inside a Kubernetes environment.\
             Kubernetes not detected (KUBERNETES_SERVICE_HOST is not set), Exiting"
        )
        sys.exit(1)

    crawl_manager = CrawlManager()

    storage_ops = init_storages_api(org_ops, crawl_manager)

    background_job_ops = BackgroundJobOps(
        mdb, email, user_manager, org_ops, crawl_manager, storage_ops
    )

    profile_ops = ProfileOps(
        mdb, org_ops, crawl_manager, storage_ops, background_job_ops
    )

    crawl_config_ops = CrawlConfigOps(
        dbclient,
        mdb,
        user_manager,
        org_ops,
        crawl_manager,
        profile_ops,
    )

    user_manager.set_ops(org_ops, crawl_config_ops, None)

    coll_ops = CollectionOps(mdb, crawl_manager, org_ops, event_webhook_ops)

    crawl_ops = CrawlOps(
        crawl_manager,
        mdb,
        user_manager,
        org_ops,
        crawl_config_ops,
        coll_ops,
        storage_ops,
        event_webhook_ops,
        background_job_ops,
    )

    page_ops = PageOps(mdb, crawl_ops, org_ops, storage_ops)

    crawl_ops.set_page_ops(page_ops)

    background_job_ops.set_ops(crawl_ops, profile_ops)

    return init_operator_api(
        app_root,
        crawl_config_ops,
        crawl_ops,
        org_ops,
        coll_ops,
        storage_ops,
        event_webhook_ops,
        background_job_ops,
        page_ops,
    )


# ============================================================================
@app_root.on_event("startup")
async def startup():
    """init on startup"""
    register_exit_handler()
    settings = main()
    await settings.async_init()
