import { msg } from "@lit/localize";

import { pluralize } from "./localization";

// Add to this as necessary!
const plurals = {
  crawls: {
    zero: msg("crawls", {
      desc: 'plural form of "crawl" for zero crawls',
      id: "crawls.plural.zero",
    }),
    one: msg("crawl", {
      desc: 'singular form for "crawl"',
      id: "crawls.plural.one",
    }),
    two: msg("crawls", {
      desc: 'plural form of "crawl" for two crawls',
      id: "crawls.plural.two",
    }),
    few: msg("crawls", {
      desc: 'plural form of "crawl" for few crawls',
      id: "crawls.plural.few",
    }),
    many: msg("crawls", {
      desc: 'plural form of "crawl" for many crawls',
      id: "crawls.plural.many",
    }),
    other: msg("crawls", {
      desc: 'plural form of "crawl" for multiple/other crawls',
      id: "crawls.plural.other",
    }),
  },
  pages: {
    zero: msg("pages", {
      desc: 'plural form of "page" for zero pages',
      id: "pages.plural.zero",
    }),
    one: msg("page", {
      desc: 'singular form for "page"',
      id: "pages.plural.one",
    }),
    two: msg("pages", {
      desc: 'plural form of "page" for two pages',
      id: "pages.plural.two",
    }),
    few: msg("pages", {
      desc: 'plural form of "page" for few pages',
      id: "pages.plural.few",
    }),
    many: msg("pages", {
      desc: 'plural form of "page" for many pages',
      id: "pages.plural.many",
    }),
    other: msg("pages", {
      desc: 'plural form of "page" for multiple/other pages',
      id: "pages.plural.other",
    }),
  },
  comments: {
    zero: msg("comments", {
      desc: 'plural form of "comment" for zero comments',
      id: "comments.plural.zero",
    }),
    one: msg("comment", {
      desc: 'singular form for "comment"',
      id: "comments.plural.one",
    }),
    two: msg("comments", {
      desc: 'plural form of "comment" for two comments',
      id: "comments.plural.two",
    }),
    few: msg("comments", {
      desc: 'plural form of "comment" for few comments',
      id: "comments.plural.few",
    }),
    many: msg("comments", {
      desc: 'plural form of "comment" for many comments',
      id: "comments.plural.many",
    }),
    other: msg("comments", {
      desc: 'plural form of "comment" for multiple/other comments',
      id: "comments.plural.other",
    }),
  },
  URLs: {
    zero: msg("URLs", {
      desc: 'plural form of "URLs" for zero URLs',
      id: "URLs.plural.zero",
    }),
    one: msg("URL", {
      desc: 'singular form for "URL"',
      id: "URLs.plural.one",
    }),
    two: msg("URLs", {
      desc: 'plural form of "URLs" for two URLs',
      id: "URLs.plural.two",
    }),
    few: msg("URLs", {
      desc: 'plural form of "URLs" for few URLs',
      id: "URLs.plural.few",
    }),
    many: msg("URLs", {
      desc: 'plural form of "URLs" for many URLs',
      id: "URLs.plural.many",
    }),
    other: msg("URLs", {
      desc: 'plural form of "URLs" for multiple/other URLs',
      id: "URLs.plural.other",
    }),
  },
};

export const pluralOf = (word: keyof typeof plurals, count: number) => {
  return pluralize(count, plurals[word]);
};
