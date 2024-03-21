import { configureLocalization } from "@lit/localize";

import { sourceLocale, targetLocales } from "@/__generated__/locale-codes";

export const { getLocale, setLocale } = configureLocalization({
  sourceLocale,
  targetLocales,
  loadLocale: async (locale: string) =>
    import(`/src/__generated__/locales/${locale}.ts`),
});

export const setLocaleFromUrl = async () => {
  const url = new URL(window.location.href);
  const locale = url.searchParams.get("locale") || sourceLocale;
  await setLocale(locale);
};

/**
 * Get time zone short name from locales
 * @param locales List of locale codes. Omit for browser default
 **/
export const getLocaleTimeZone = (locales?: string[]) => {
  const date = new Date();

  return date
    .toLocaleTimeString(locales || [], {
      timeZoneName: "short",
      hour: "2-digit",
    })
    .replace(date.toLocaleTimeString([], { hour: "2-digit" }), "")
    .trim();
};
