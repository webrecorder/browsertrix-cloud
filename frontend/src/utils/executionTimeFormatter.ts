import { html, nothing } from "lit";

import { getLocale } from "./localization";

/**
 * Returns either `nothing`, or hours-minutes-seconds wrapped in parens.
 * Biases towards minutes:
 * - When the time is exactly on an hour boundary, just shows hours
 *   - e.g. `3h`
 * - When the time isn't on an hour boundary but is on a minute boundary, just shows hours (if applicable) and minutes
 *   - e.g. `3h 2m` or `32m`
 * - When the time is less than a minute, shows minutes and seconds
 *   - e.g. `0m 43s`
 */
export function humanizeSeconds(
  seconds: number,
  locale?: string,
  displaySeconds = false,
  unitDisplay: "narrow" | "short" | "long" = "narrow",
) {
  if (seconds < 0) {
    throw new Error("humanizeSeconds in unimplemented for negative times");
  }
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  // If displaying seconds, round minutes down, otherwise round up
  const minutes = displaySeconds
    ? Math.floor(seconds / 60)
    : Math.ceil(seconds / 60);
  seconds -= minutes * 60;

  const hourFormatter = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "hour",
    unitDisplay: unitDisplay,
  });

  const minuteFormatter = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: unitDisplay,
  });

  const secondFormatter = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "second",
    unitDisplay: unitDisplay,
  });

  return [
    hours !== 0 && hourFormatter.format(hours),
    (minutes !== 0 || seconds !== 0 || (!displaySeconds && hours === 0)) &&
      minuteFormatter.format(minutes),
    displaySeconds &&
      (seconds !== 0 || (hours === 0 && minutes === 0)) &&
      secondFormatter.format(seconds),
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Formats execution seconds, either just as minutes (when `style` is `"short"`), or as minutes and hours-minutes-seconds (when `style` is undefined or `"full"`)
 * @example humanizeExecutionSeconds(1_234_567_890)
 * // <span title="20,576,132 minutes">21M minutes</span> (342,935h 31m 30s)
 *
 * @example humanizeExecutionSeconds(1_234_567_890, "short")
 * // <span title="20,576,132 minutes (342,935h 31m 30s)">21M minutes</span>
 */
export const humanizeExecutionSeconds = (
  seconds: number,
  options?: {
    /**
     * When this is "long", the time in hours is also displayed
     * @default "long"
     */
    style?: "short" | "long";
    /**
     * @default false
     */
    displaySeconds?: boolean;
    /**
     * @default "up"
     */
    round?: "up" | "down";
  },
) => {
  const {
    style = "long",
    displaySeconds = false,
    round = "up",
  } = options || {};
  const locale = getLocale();
  const minutes =
    round === "down" ? Math.floor(seconds / 60) : Math.ceil(seconds / 60);

  const compactMinuteFormatter = new Intl.NumberFormat(locale, {
    notation: "compact",
    style: "unit",
    unit: "minute",
    unitDisplay: style,
  });

  const longMinuteFormatter = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: "long",
    maximumFractionDigits: 0,
  });

  const details = humanizeSeconds(seconds, locale, displaySeconds);

  // if the time is less than an hour and lines up exactly on the minute, don't render the details.
  const detailsRelevant = displaySeconds
    ? seconds % 60 !== 0
    : Math.floor(seconds / 60) === 0 && seconds % 60 !== 0;
  const formattedDetails =
    detailsRelevant || seconds > 3600 ? `\u00a0(${details})` : nothing;

  switch (style) {
    case "long":
      return html`<span title="${longMinuteFormatter.format(minutes)}">
          ${compactMinuteFormatter.format(minutes)}</span
        >${formattedDetails}`;
    case "short":
      return html`<span
        title="${longMinuteFormatter.format(minutes)}${formattedDetails}"
        >${compactMinuteFormatter.format(minutes)}</span
      >`;
  }
};
