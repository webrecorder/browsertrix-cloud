import { cached } from "@/utils/weakCache";

type Optional<T> = T | undefined | null;

export const crawlCounts = cached(
  (bad: Optional<number>, good: Optional<number>) => {
    if (bad == null || good == null) return null;
    return `${good}/${good + bad}`;
  },
);
