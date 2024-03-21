import { parseCron } from "@cheap-glitch/mi-cron";
import { msg, str } from "@lit/localize";

import * as numberUtils from "./number";

export const getNextDate = parseCron.nextDate;

export type ScheduleInterval = "daily" | "weekly" | "monthly";

/**
 * Parse interval from cron expression
 **/
export function getScheduleInterval(schedule: string): ScheduleInterval {
  const [_minute, _hour, dayOfMonth, _month, dayOfWeek] = schedule.split(" ");
  if (dayOfMonth === "*") {
    if (dayOfWeek === "*") {
      return "daily";
    }
    return "weekly";
  }
  return "monthly";
}

/**
 * Get human-friendly date from cron expression
 * Example: "Monday, December 12, 2022 at 12:00 AM PST"
 **/
export function humanizeNextDate(
  schedule: string,
  options: { length?: "short" } = {},
): string {
  const nextDate = parseCron.nextDate(schedule);

  if (!nextDate) return "";

  if (options.length === "short") {
    return nextDate.toLocaleString(undefined, {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  }

  return nextDate.toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    timeZoneName: "short",
  });
}

/**
 * Get human-friendly schedule from cron expression
 * Example: "Every day at 9:30 AM CDT"
 **/
export function humanizeSchedule(
  schedule: string,
  options: { length?: "short" } = {},
  numberFormatter = numberUtils.numberFormatter,
): string {
  const interval = getScheduleInterval(schedule);
  const parsed = parseCron(schedule);
  if (!parsed) {
    // Invalid date
    return "";
  }
  const { days } = parsed;
  const nextDate = parseCron.nextDate(schedule)!;
  const formattedWeekDay = nextDate.toLocaleString(undefined, {
    weekday: "long",
  });

  let intervalMsg = "";

  if (options.length === "short") {
    switch (interval) {
      case "daily": {
        const formattedTime = nextDate.toLocaleString(undefined, {
          minute: "numeric",
          hour: "numeric",
        });
        intervalMsg = msg(str`${formattedTime} daily`);
        break;
      }
      case "weekly":
        intervalMsg = msg(str`Every ${formattedWeekDay}`);
        break;
      case "monthly": {
        const { format } = numberFormatter();
        intervalMsg = msg(
          str`Monthly on the ${format(days[0], { ordinal: true })}`,
        );

        break;
      }

      default:
        break;
    }
  } else {
    const formattedTime = nextDate.toLocaleString(undefined, {
      minute: "numeric",
      hour: "numeric",
      timeZoneName: "short",
    });

    switch (interval) {
      case "daily":
        intervalMsg = msg(str`Every day at ${formattedTime}`);
        break;
      case "weekly":
        intervalMsg = msg(
          str`Every ${formattedWeekDay}
            at ${formattedTime}`,
        );
        break;
      case "monthly":
        intervalMsg = msg(
          str`On day ${nextDate.getDate()} of the month at ${formattedTime}`,
        );
        break;
      default:
        break;
    }
  }

  return intervalMsg;
}

/**
 * Get schedule as UTC cron job expression
 * https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#cron-schedule-syntax
 **/
export function getUTCSchedule({
  interval,
  minute,
  hour,
  period,
  dayOfWeek,
  dayOfMonth,
}: {
  interval: ScheduleInterval;
  minute: number | string;
  hour: number | string;
  period: "AM" | "PM";
  dayOfWeek?: number;
  dayOfMonth?: number;
}): string {
  const localDate = new Date();

  // Convert 12-hr to 24-hr time
  let periodOffset = 0;

  if (hour === 12) {
    if (period === "AM") {
      periodOffset = -12;
    }
  } else if (period === "PM") {
    periodOffset = 12;
  }

  localDate.setHours(+hour + periodOffset);
  localDate.setMinutes(+minute);

  if (interval === "monthly" && dayOfMonth) {
    localDate.setDate(dayOfMonth);
  } else if (interval == "weekly" && dayOfWeek) {
    localDate.setDate(localDate.getDate() + dayOfWeek - localDate.getDay());
  }

  const date = interval === "monthly" ? localDate.getUTCDate() : "*";
  const day = interval === "weekly" ? localDate.getUTCDay() : "*";
  const month = "*";

  const schedule = `${localDate.getUTCMinutes()} ${localDate.getUTCHours()} ${date} ${month} ${day}`;

  return schedule;
}
