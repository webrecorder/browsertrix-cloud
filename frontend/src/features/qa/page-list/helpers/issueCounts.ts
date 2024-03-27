import {
  severityFromMatch,
  severityFromResourceCounts,
  type Severity,
} from "./severity";

import type { ArchivedItemQAPage } from "@/types/qa";
import { cached } from "@/utils/weakCache";

export const issueCounts = cached((page: ArchivedItemQAPage) => {
  const severities = [
    severityFromMatch(page.qa.screenshotMatch),
    severityFromMatch(page.qa.textMatch),
    severityFromResourceCounts(
      page.qa.resourceCounts?.crawlBad,
      page.qa.resourceCounts?.crawlGood,
    ),
    severityFromResourceCounts(
      page.qa.resourceCounts?.replayBad,
      page.qa.resourceCounts?.replayGood,
    ),
  ];
  let severe = 0,
    moderate = 0;
  for (const severity of severities) {
    if (severity === "severe") {
      severe++;
    } else if (severity === "moderate") {
      moderate++;
    }
  }
  return {
    severe,
    moderate,
    noData: severities.every((value) => value === null),
  };
});

export const maxSeverity = cached((page: ArchivedItemQAPage): Severity => {
  const { severe, moderate, noData } = issueCounts(page);
  if (noData) return null;
  if (severe) {
    return "severe";
  } else if (moderate) {
    return "moderate";
  }
  return "good";
});
