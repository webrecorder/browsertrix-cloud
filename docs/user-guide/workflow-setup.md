# Crawl Workflow Setup

## Crawl Type

The first step in creating a new [crawl workflow](crawl-workflows.md) is to choose what type of crawl you want to run. Crawl types are fixed and cannot be converted or changed later.

`URL List`{ .badge-blue }
:   The crawler visits every URL specified in a list, and optionally every URL linked on those pages.

`Seeded Crawl`{ .badge-orange }
:   The crawler automatically discovers and archives pages starting from a single seed URL.

## Scope

### List of URLs

`URL List`{ .badge-blue } `Seeded Crawl`{ .badge-orange }

This list informs the crawler what pages it should capture as part of a URL List crawl.

It is also available under the _Additional URLs_ section for Seeded Crawls where it can accept arbitrary URLs that will be crawled regardless of other scoping rules.

### Include Any Linked Page

`URL List`{ .badge-blue }

When enabled, the crawler will visit all the links it finds within each page defined in the _List of URLs_ field.

??? example "Crawling tags & search queries with URL List crawls"
    This setting can be useful for crawling the content of specific tags or search queries. Specify the tag or search query URL(s) in the _List of URLs_ field, e.g: `https://example.com/search?q=tag`, and enable _Include Any Linked Page_ to crawl all the content present on that search query page.

### Fail Crawl on Failed URL

`URL List`{ .badge-blue }

When enabled, the crawler will fail the entire crawl if any of the provided URLs are invalid or unsuccessfully crawled. The resulting archived item will have a status of "Failed".

### Crawl Start URL

`Seeded Crawl`{ .badge-orange }

This is the first page that the crawler will visit. It's important to set _Crawl Start URL_ that accurately represents the scope of the pages you wish to crawl as the _Start URL Scope_ selection will depend on this field's contents.

You must specify the protocol (likely `http://` or `https://`) as a part of the URL entered into this field.

### Start URL Scope

`Seeded Crawl`{ .badge-orange }

`Hashtag Links Only`
:   This scope will ignore links that lead to other addresses such as `example.com/path` and will instead instruct the crawler to visit hashtag links such as `example.com/#linkedsection`.

    This scope can be useful for crawling certain web apps that may not use unique URLs for their pages.

`Pages in the Same Directory`
:   This scope will only crawl pages in the same directory as the _Crawl Start URL_. If `example.com/path` is set as the _Crawl Start URL_, `example.com/path/path2` will be crawled but `example.com/path3` will not.

`Pages on This Domain`
:   This scope will crawl all pages on the domain entered as the _Crawl Start URL_ however it will ignore subdomains such as `subdomain.example.com`.

`Pages on This Domain and Subdomains`
:   This scope will crawl all pages on the domain and any subdomains found. If `example.com` is set as the _Crawl Start URL_, both pages on `example.com` and `subdomain.example.com` will be crawled.

`Custom Page Prefix`
:   This scope will crawl all pages that begin with the _Crawl Start URL_ as well as pages from any URL that begin with the URLs listed in `Extra URL Prefixes in Scope`

### Max Depth

`Seeded Crawl`{ .badge-orange }

Only shown with a _Start URL Scope_ of `Pages on This Domain` and above, the _Max Depth_ setting instructs the crawler to stop visiting new links past a specified depth.

### Extra URL Prefixes in Scope

`Seeded Crawl`{ .badge-orange }

Only shown with a _Start URL Scope_ of `Custom Page Prefix`, this field accepts additional URLs or domains that will be crawled if URLs that lead to them are found.

This can be useful for crawling websites that span multiple domains such as `example.org` and `example.net`

### Include Any Linked Page ("one hop out")

`Seeded Crawl`{ .badge-orange }

When enabled, the crawler will visit all the links it finds within each page, regardless of the _Start URL Scope_ setting.

This can be useful for capturing links on a page that lead outside the website that is being crawled but should still be included in the archive for context.

### Check For Sitemap

`Seeded Crawl`{ .badge-orange }

When enabled, the crawler will check for a sitemap at /sitemap.xml and use it to discover pages to crawl if found. It will not crawl pages found in the sitemap that do not meet the crawl's scope settings or limits.

This can be useful for discovering and capturing pages on a website that aren't linked to from the seed and which might not otherwise be captured.

### Exclusions

`URL List`{ .badge-blue } `Seeded Crawl`{ .badge-orange }

The exclusions table will instruct the crawler to ignore links it finds on pages where all or part of the link matches an exclusion found in the table. The table is only available in URL List crawls when _Include Any Linked Page_ is enabled.

This can be useful for avoiding crawler traps — sites that may automatically generate pages such as calendars or filter options — or other pages that should not be crawled according to their URL.

`Matches text`
:   Will perform simple matching of entered text and exclude all URLs where matching text is found.

    e.g: If `about` is entered, `example.com/aboutme/` will not be crawled.

`Regex`
:   Regular expressions (Regex) can also be used to perform more complex matching.

    e.g: If `#!regex \babout\/?\b` is entered, `example.com/about/` will not be crawled however `example.com/aboutme/` will be crawled.

## Limits

### Max Pages

Adds a hard limit on the number of pages that will be crawled. The crawl will be gracefully stopped after this limit is reached.

### Crawl Time Limit

The crawl will be gracefully stopped after this set period of elapsed time.

### Crawl Size Limit

The crawl will be gracefully stopped after reaching this set size in GB.

### Crawler Instances

Increasing the amount of crawler instances will speed up crawls by using additional browser windows to capture more pages in parallel. This will also increase the amount of traffic sent to the website and may result in a higher chance of getting rate limited.

### Page Load Timeout

Limits amount of elapsed time to wait for a page to load. Behaviors will run after this timeout only if the page is partially or fully loaded.

### Behavior Timeout

Limits amount of elapsed time behaviors have to complete.

### Auto Scroll Behavior

When enabled, the browser will automatically scroll to the end of the page.

### Delay Before Next Page

Waits on the page for a set period of elapsed time after any behaviors have finished running. This can be helpful to avoid rate limiting however it will slow down your crawl.

## Browser Settings

### Browser Profile

Sets the [_Browser Profile_](browser-profiles.md) to be used for this crawl.

### Crawler Release Channel

Sets the release channel of [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) to be used for this crawl. Crawls started by this workflow will use the latest crawler version from the selected release channel. Generally "Default" will be the most stable, however others may have newer features (or bugs)!  

This setting will only be shown if multiple different release channels are available for use.

### Block Ads by Domain

Will prevent any content from the domains listed in [Steven Black's Unified Hosts file](https://github.com/StevenBlack/hosts) (ads & malware) from being captured by the crawler.

### User Agent

Sets the browser's user agent in outgoing requests to the specified value. If left blank, the crawler will use the browser's default user agent.

### Language

Sets the browser's language setting. Useful for crawling websites that detect the browser's language setting and serve content accordingly.

## Scheduling

### Crawl Schedule Type

`Run Immediately on Save`
:   When selected, the crawl will run immediately as configured. It will not run again unless manually instructed.

`Run on a Recurring Basis`
:   When selected, additional configuration options for instructing the system when to run the crawl will be shown. If a crawl is already running when the schedule is set to activate it, the scheduled crawl will not run.

`No Schedule`
:   When selected, the configuration options that have been set will be saved but the system will not do anything with them unless manually instructed.

### Frequency

Set how often a scheduled crawl will run.

### Day

Sets the day of the week for which crawls scheduled with a `Weekly` _Frequency_ will run.

### Date

Sets the date of the month for which crawls scheduled with a `Monthly` _Frequency_ will run.

### Start Time

Sets the time that the scheduled crawl will start according to your current timezone.

### Also Run a Crawl Immediately On Save

When enabled, a crawl will run immediately on save as if the `Run Immediately on Save` _Crawl Schedule Type_ was selected, in addition to scheduling a crawl to run according to the above settings.

## Metadata

### Name

Allows a custom name to be set for the workflow. If no name is set, the workflow's name will be set to the _Crawl Start URL_. For URL List crawls, the workflow's name will be set to the first URL present in the _List of URLs_ field, with an added `(+x)` where `x` represents the total number of URLs in the list.

### Description

Leave optional notes about the workflow's configuration.

### Tags

Apply tags to the workflow. Tags applied to the workflow will propagate to every crawl created with it at the time of crawl creation.

### Collection Auto-Add

Search for and specify [collections](collections.md) that this crawl workflow should automatically add content to as soon as crawling finishes. Canceled and Failed crawls will not be automatically added to collections.
