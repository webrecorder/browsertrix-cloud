# Browser Profiles

Browser Profiles are saved instances of a web browsing session that can be reused to crawl websites as they were configured, with any cookies, saved login sessions, or browser settings. Using a pre-configured profile also means that content that can only be viewed by logged in users can be archived, without archiving the actual login credentials.

!!! tip "Best practice: Create and use web archiving-specific accounts for crawling with browser profiles"

    For the following reasons, we recommend creating dedicated accounts for archiving anything that is locked behind login credentials but otherwise public, especially on social media platforms.

    - While user names and passwords are not, the access tokens for logged in websites used in the browser profile creation process _are stored_ by the server.

    - Some websites may rate limit or lock accounts for reasons they deem to be suspicious, such as logging in from a new location or any crawling-related activity.

    - While login information (username, password) is not archived, *other* data such as cookies, location, etc.. may be included in the resulting crawl (after all, personalized content is often the goal of sites that require credentials to view content).

    - Due to nature of social media specifically, existing accounts may have personally identifiable information, even when accessing otherwise public content.

    Of course, there are exceptions — such as when the goal is to archive personalized or private content accessible only from designated accounts. In these instances we recommend changing the account's password after crawling is complete.

## Creating New Browser Profiles

New browser profiles can be created on the Browser Profiles page by pressing the _New Browser Profile_ button and providing a starting URL. 

Press the _Finish Browsing_ button to save the browser profile with a _Name_ and _Description_ of what is logged in or otherwise notable about this browser session.

### Logging into Websites

To crawl content as a logged in user, log into the website you wish to archive as you would on any other browser. Once the account has been logged in, that's it!

### Accepting Popups

Some websites are required to get informed consent from users to track them, others require their users to verify their age before viewing adult content. Websites often choose to use cookies — small pieces of configuration data stored in the browser — to store this information alongside other cookies such as a login session. Interacting with popups that store the user's choices in a cookie will in turn store those cookies within the browser profile. Like everything else those cookie values will be used when crawling with the browser profile.

### Changing Browser Settings

Browser profiles don't just affect websites! Any of Brave's settings (available at the URL `brave://settings/`) set in the profile creator will be used while crawling.

??? example "Example: Blocking page resources with Brave's Shields"
    Whereas the crawler's scoping settings can be used to define which pages should be crawled, Brave's [Shields](https://brave.com/shields/) feature can block resources on pages from being loaded. By default, Shields will block [EasyList's cookie list](https://easylist.to/) but it can be set to block a number of other included lists under Brave `Settings > Shields > Filter Lists`.

    _Custom Filters_ can also be useful for blocking sites with resources that aren't blocked by one of the existing lists. We use this at Webrecorder to block our web analytics script while crawling our own website by adding `stats.browsertrix.com` to the filter list. In this example, `browsertrix.com` will still load, but Brave will block any communication to `stats.browsertrix.com` and our analytics won't register a page view as a result. While lots of common analytics tools may already be blocked in an existing blocklist, this one likely isn't because we run it ourselves!

    The [Ublock Origin filter syntax](https://github.com/gorhill/uBlock/wiki/Static-filter-syntax) can be used for more specificity over what in-page resources should be blocked.

    All browser setting related blocking features can be used in addition with the [_Block Ads by Domain_](workflow-setup.md#block-ads-by-domain) crawler setting.

## Editing Existing Browser Profiles

Sometimes websites will log users out or expire cookies or login sessions after a period of time. In these cases, when crawling the browser profile can still be loaded but may not behave as it did when it was initially set up.

To update the profile, go to the profile's details page and press the _Edit Browser Profile_ button to load and interact with the sites that need to be re-configured. When finished, press the _Save Browser Profile_ button to return to the profile's details page.

### Editing Browser Profile Metadata

To edit a browser profile's name and description, select _Edit Name and Description_ from the actions menu on the profile's details page.
