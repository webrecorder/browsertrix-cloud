import { shuffle } from "lodash";

// import type { ArchivedItemQAPage } from "@/types/qa";

let counter = 0;

// FIXME update data
const getRandomData = (): unknown => {
  const resourceCount = Math.ceil(Math.random() * 1000);
  const isReviewed = Math.random() > 0.5;
  const notes =
    isReviewed && Math.random() > 0.5
      ? {
          notes: [
            {
              id: "",
              created: "",
              modified: "",
              userName: "",
              text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore...",
            },
          ],
        }
      : undefined;
  const reviewStatus =
    isReviewed && Math.random() > 0.2
      ? { approved: Math.random() > 0.5 }
      : undefined;

  const screenshot =
    Math.random() > 0.2
      ? {
          screenshotMatch: {
            test: Math.min(Math.floor(Math.pow(Math.random(), 0.2) * 110), 100),
          },
        }
      : undefined;

  const text =
    Math.random() > 0.2
      ? {
          textMatch: {
            test: Math.min(Math.floor(Math.pow(Math.random(), 0.2) * 110), 100),
          },
        }
      : undefined;

  const crawlBad =
    Math.random() > 0.5 ? Math.floor(resourceCount * Math.random()) : 0;
  const replayBad =
    Math.random() > 0.5 ? Math.floor(resourceCount * Math.random()) : 0;
  const crawlCount =
    Math.random() > 0.2
      ? {
          crawlBad,
          crawlGood: resourceCount - crawlBad,
        }
      : undefined;

  const replayCount =
    Math.random() > 0.2
      ? {
          replayBad,
          replayGood: resourceCount - replayBad,
        }
      : undefined;

  return {
    oid: "",
    crawl_id: "",
    id: `${Math.random()}`,
    title: `Randomly generated page ${counter++}`,
    url: "https://example.com/path/path/path/path/path/path/path/path/path",
    ...screenshot,
    ...text,
    resourceCounts: {
      test: {
        ...crawlCount,
        ...replayCount,
      },
    },
    ...notes,
    ...reviewStatus,
  };
};

const randomArray = Array.from(
  { length: 1000 },
  // { length: 50 },
  getRandomData,
);

export const testData = shuffle([
  ...randomArray,
  // {
  //   title: "Example page with resource errors",
  //   url: "https://example.com/path/path/path/path/path/path/path/path/path",
  //   screenshotMatch: 1,
  //   textMatch: 5,
  //   crawlResources: [6, 7],
  //   replayResources: [4, 7],
  // },
  // {
  //   title: "Example page with 4 error stats",
  //   url: "https://example.com/path/path/path/path/path/path/path/path/path",
  //   screenshotMatch: 1,
  //   textMatch: 5,
  //   crawlResources: [6, 7],
  //   replayResources: [4, 7],
  // },
  // {
  //   title: "Example page with 2 error stats",
  //   url: "https://example.com/path/path/path/path/path/path/path/path/path",
  //   screenshotMatch: 1,
  //   textMatch: 5,
  //   crawlResources: [6, 7],
  //   replayResources: [7, 7],
  // },
  // {
  //   title:
  //     "Example page, possible issues, 2 warnings, etc etc, extremely long title",
  //   url: "https://example.com/path/path/path/path/path/path/path/path/path",
  //   screenshotMatch: 90,
  //   textMatch: 90,
  //   crawlResources: [12, 12],
  //   replayResources: [12, 12],
  // },
  // {
  //   title: "Example page, possible issues",
  //   url: "https://example.com/path/path/path/path/path/path/path/path/path",
  //   screenshotMatch: 97,
  //   textMatch: 100,
  //   crawlResources: [12, 12],
  //   replayResources: [12, 12],
  // },
  // {
  //   title: "Example page, likely good",
  //   url: "https://example.com/path/path/path/path/path/path/path/path/path",
  //   screenshotMatch: 100,
  //   textMatch: 100,
  //   crawlResources: [12, 12],
  //   replayResources: [12, 12],
  // },
  // {
  //   title: "Example page, likely good",
  //   url: "https://example.com/path/path/path/path/path/path/path/path/path",
  //   screenshotMatch: 100,
  //   textMatch: 100,
  //   crawlResources: [12, 12],
  //   replayResources: [12, 12],
  // },
]);
