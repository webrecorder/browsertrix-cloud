# Archived Items

Archived Items consist of one or more WACZ files created by a crawl workflow, or uploaded to Browsertrix. They can be individually replayed, or combined with other archived items in a [collection](collections.md). The Archived Items page lists all items in the organization.

## Uploading Web Archives

WACZ files can be given metadata and uploaded to Browsertrix by pressing the _Upload WACZ_ button on the archived items list page. Only one WACZ file can be uploaded at a time.

## Status

The status of an archived item depends on its type. Uploads will always have the status <span class="status-success">:bootstrap-upload: Uploaded</span>, crawls have four possible states:

| Status | Description |
| ---- | ---- |
| <span class="status-success">:bootstrap-check-circle: Complete</span>     | The crawl completed according to the workflow's settings. Workflows with [limits](workflow-setup.md#limits) set may stop running before they capture every queued page, but the resulting archived item will still be marked as "Complete". |
| <span class="status-warning">:bootstrap-dash-circle: Stopped</span>       | The crawl workflow was _stopped_ gracefully by a user and data is saved. |
| <span class="status-danger">:bootstrap-x-octagon: Canceled</span>        | The crawl workflow was _canceled_ by a user, no data is saved. |
| <span class="status-danger">:bootstrap-exclamation-triangle: Failed</span> | A serious error occurred while crawling, no data is saved.|

Because <span class="status-danger">:bootstrap-x-octagon: Canceled</span> and <span class="status-danger">:bootstrap-exclamation-triangle: Failed</span> crawls do not contain data, they are omitted from the archived items list page and cannot be added to a collection.

## Archived Item Details

The archived item details page is composed of five sections, though the Crawl Settings tab is only available for crawls and not uploads.

### Overview

The Overview tab displays the item's metadata and statistics associated with its creation process.

Metadata can be edited by pressing the pencil icon at the top right of the metadata section to edit the item's description, tags, and collections it is associated with.

### Replay

The Replay tab displays the web content contained within the archived item.

For more details on navigating web archives within ReplayWeb.page, see the [ReplayWeb.page user documentation.](https://replayweb.page/docs/exploring)

### Files

The Files tab lists the individually downloadable WACZ files that make up the archived item as well as their file sizes.

### Error Logs

The Error Logs tab displays a list of errors encountered during crawling. Clicking an errors in the list will reveal additional information.

All log entries with that were recorded in the creation of the Archived Item can be downloaded in JSONL format by pressing the _Download Logs_ button.

### Crawl Settings

The Crawl Settings tab displays the crawl workflow configuration options that were used to generate the resulting archived item.
