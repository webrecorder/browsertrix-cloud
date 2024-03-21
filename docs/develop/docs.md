# Writing Documentation

Our documentation is built with [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) and configured via `mkdocs.yml` in the project root.

The docs can be found in the `./docs` subdirectory.

To build the docs locally, install Material for MkDocs with pip:

```shell
pip install mkdocs-material
```

In the project root directory run `mkdocs serve` to run a local version of the documentation site.

The docs hosted on [docs.browsertrix.cloud](https://docs.browsertrix.cloud) are created from the main branch of [https://github.com/webrecorder/browsertrix-cloud](https://github.com/webrecorder/browsertrix-cloud)

## Adding New Pages

1. Create a Markdown file in the directory of choice
2. Add the newly created Markdown file to the `nav` value under the subsection as defined by the file's location in `mkdocs.yml`.

## Adding Icons

We typically use the [Bootstrap icon set](https://icons.getbootstrap.com/) with our projects. This set is quite expansive, and we don't add the entire set into our docs folder as most icons go unused. If you wish to use an icon when writing documentation to refer to an icon present in part of the app, you may have to download the SVG file and add it to the repo.

Icons are placed in the `docs/overrides/.icons/iconsetname/icon-name.svg` directory, and can be added in markdown files as `:iconsetname-icon-name:` accordingly. After adding icons to the folder, MKDocs must be restarted. For more information, see the [Material for MKDocs page on Changing the logo and icons](https://squidfunk.github.io/mkdocs-material/setup/changing-the-logo-and-icons/#customization).

## Docs Style Guide

### American English

Webrecorder is a global team but we use American English when writing documentation and in-app copy. Some basic rules to follow are:

1. Swap the `s` for a `z` in words like _categorize_ and _pluralize_.
2. Remove the `u` from words like _color_ and _honor_.
3. Swap `tre` for `ter` in words like _center_.
4. Numbers should be formatted with commas for separation of values, using periods to denote decimals (e.g: _3,153.89_, not _3 153,89_).

### Oxford Commas

In a list of three or more items, the list item proceeding the word "and" should have a comma placed after it clarifying that the final item in the list is not a part of the previous item.

##### Example

| Use                           | Don't use                    |
| ----------------------------- | ---------------------------- |
| One, two, three, and four.    | One, two, three and four.    |
| Charles, Ada, and Alan.       | Charles, Ada and Alan.       |


### Capitalization of Concepts and Tools

Webrecorder has a number of common nouns that we use in our products. Examples include: archived items, crawl workflows, browser profiles, collections, and organizations. Because these are concepts and not specific instances of each concept, do not capitalize them unless they are at the start of a sentence.

##### Example

When starting a sentence:
> Archived items consist of one or more...

In the middle of a sentence:

> ...they are omitted from the archived items list page...

Webrecorder's software packages are all proper nouns and should always be capitalized.  Examples include: Browsertrix, ReplayWeb.page, ArchiveWeb.Page, and PYWB. Specific pages such as the Archived Items page should also be capitalized as they are not referencing the concept of archived items and are instead referencing the page in question that happens to share the same name.

### Be Concise, Avoid "You Statements"

Generally, people don't want to have to read documentation. When writing, try to explain concepts simply and with clear objective language. Do not use "we" to refer to communication between the author and the reader, use "we" to refer to Webrecorder. "You can" or "you may" can be used, but preferably when giving supplemental advice and generally not when providing instructions that should be followed to achieve a successful outcome. Otherwise, avoid spending time referring to the reader, instead tell them what they should know.

##### Example

> If you want to do x, you can click on y.

Can often be shortened to:

> To do x, click on y.

### Acronyms

Avoid using acronyms when reuse is not frequent enough to warrant space savings. When acronyms must be used, spell the full phrase first and include the acronym in parentheses `()` the first time it is used in each document. This can be omitted for extremely common acronyms such as "URL" or "HTTP".

##### Example

> When running in a Virtual Machine (VM), use the....

### Headings

All headings should be set in [title case](https://en.wikipedia.org/wiki/Title_case).

##### Example

> Indiana Jones and the Raiders of the Lost Ark

### Referencing Features and Their Options

Controls with multiple options should have their options referenced as `in-line code blocks`.

Setting names referenced outside of a heading should be Title Cased and set in _italics_.

Actions with text (buttons in the app) should also be Title Cased and set in _italics_.

##### Example

> Sets the day of the week for which crawls scheduled with a `Weekly` _Frequency_ will run.

### Manual Word Wrapping

Do not manually wrap words by adding newlines when writing documentation.

### Code Block Syntax Highlighting

Tag the language to be used for syntax highlighting.

##### Example

```markdown
 ```markdown
 example markdown code block text
 ```
```

For in-line code blocks, syntax highlighting should be added for all code-related usage by adding `#!language` to the start of all in-line code blocks. This is not required for paths or simply highlighting important text using in-line code blocks.

##### Example

```markdown
 `#!python range()`
```

Renders to: `#!python range()`

### Paid features

`Paid Feature`{ .badge-green }

Some features of Browsertrix only pertain to those paying for the software on a hosted plan. Denote these with the following:

```markdown
`Paid Feature`{ .badge-green }
```

### Admonitions

We use [Admonitions](https://squidfunk.github.io/mkdocs-material/reference/admonitions/) in their collapsed state to offer additional context or tips that aren't relevant to all users reading the section. We use standard un-collapsible ones when we need to call attention to a specific point.

There are a lot of different options provided by Material for MkDocs — So many in fact that we try to pair down their usage into the following categories.

???+ Note
    The default call-out, used to highlight something if there isn't a more relevant one — should generally be expanded by default but can be collapsible by the user if the note is long.

!!! Tip "Tip: May have a title stating the tip or best practice"
    Used to highlight a point that is useful for everyone to understand about the documented subject — should be expanded and kept brief.

???+ Info "Info: Must have a title describing the context under which this information is useful"
    Used to deliver context-based content such as things that are dependant on operating system or environment — should be collapsed by default.

???+ Example "Example: Must have a title describing the content"
    Used to deliver additional information about a feature that could be useful in a _specific circumstance_ or that might not otherwise be considered — should be collapsed by default.

???+ Question "Question: Must have a title phrased in the form of a question"
    Used to answer frequently asked questions about the documented subject — should be collapsed by default.

!!! Warning "Warning: Must have a title stating the warning"
    Used to deliver important information — should always be expanded.

!!! Danger "Danger: Must have a title stating the warning"
    Used to deliver information about serious unrecoverable actions such as deleting large amounts of data or resetting things — should always be expanded.
