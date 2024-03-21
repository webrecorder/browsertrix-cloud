# Org Overview

The overview page delivers key statistics about the organization's resource usage. It also lets users create crawl workflows, uploaded archived items, collections, and browser profiles through the _Create New ..._ button.

## Storage

For organizations with a set storage quota, the storage panel displays a visual breakdown of how much space the organization has left and how much has been taken up by all types of archived items and browser profiles. To view additional information about each item, hover over its section in the graph.

For organizations with no storage limits the storage panel displays the total size and count of all types of archived items and browser profiles.

For all organizations the storage panel displays the total number of archived items.

## Crawling

The crawling panel lists the number of currently running and waiting crawls, as well as the total number of pages captured.

### Execution Time

`Paid Feature`{.badge-green}

For organizations with a set execution minute limit, the crawling panel displays a graph of how much execution time has been used and how much is currently remaining. Monthly execution time limits reset on the first of each month at 12:00 AM GMT.

??? Question "How is execution time calculated?"
    Execution time is the total runtime of all [_Crawler Instances_](workflow-setup.md/#crawler-instances) during a crawl. For instance, if _Crawler Instances_ scale is set to 2× and each crawler instance uses 2 minutes of active crawling time, execution time for the crawl will be 4 minutes. Like elapsed time, this is tracked as the crawl runs so changing the _Crawler Instances_ scale while a crawl is running may change the amount of execution time used in a given time period.

## Collections

The collections panel displays the number of total collections and collections marked as sharable.
