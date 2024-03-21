/**
 * Internationalized number formatter
 * Usage:
 * ```ts
 * const formatter = numberFormatter()
 * formatter.format(10000); // 10,000
 * formatter.format(10, { ordinal: true }); // 10th
 * ```
 **/
export function numberFormatter(
  locales?: string | string[],
  opts?: Intl.NumberFormatOptions,
) {
  const numFormat = new Intl.NumberFormat(locales, opts);
  const pluralRules = new Intl.PluralRules("en", { type: "ordinal" });

  const suffixes = new Map([
    ["one", "st"],
    ["two", "nd"],
    ["few", "rd"],
    ["other", "th"],
  ]);

  const format = (n: number, opts: { ordinal?: boolean } = {}) => {
    if (opts.ordinal) {
      const rule = pluralRules.select(n);
      const suffix = suffixes.get(rule);
      return `${numFormat.format(n)}${suffix}`;
    }

    return numFormat.format(n);
  };

  return { format };
}
