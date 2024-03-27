import { type ArchivedItemPage } from "./crawler";

export type QARun = {
  id: string;
  userName: string;
  started: string; // date
  finished: string; // date
  state: string;
  crawlExecSeconds: number;
  stats: {
    found: number;
    done: number;
    size: number;
  };
};

export type ArchivedItemQAPage = ArchivedItemPage & {
  qa: {
    screenshotMatch: number;
    textMatch: number;
    resourceCounts: {
      crawlGood: number;
      crawlBad: number;
      replayGood: number;
      replayBad: number;
    };
  };
};
