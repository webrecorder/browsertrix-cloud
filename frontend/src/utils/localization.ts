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

export const pluralize = (
  number: number,
  strings: { [k in Intl.LDMLPluralRule]: string },
  options?: Intl.PluralRulesOptions,
) => strings[new Intl.PluralRules(getLocale(), options).select(number)];

export const formatNumber = (
  number: number,
  options?: Intl.NumberFormatOptions,
) => new Intl.NumberFormat(getLocale(), options).format(number);

export const formatISODateString = (
  date: string, // ISO string
  options?: Intl.DateTimeFormatOptions,
) =>
  new Date(date.endsWith("Z") ? date : `${date}Z`).toLocaleDateString(
    getLocale(),
    {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      ...options,
    },
  );

export const formatBytes = (
  number: number,
  options?: Intl.NumberFormatOptions,
) =>
  new Intl.NumberFormat(getLocale(), {
    unit: "byte",
    unitDisplay: "narrow",
    ...options,
    style: "unit",
  }).format(number);
