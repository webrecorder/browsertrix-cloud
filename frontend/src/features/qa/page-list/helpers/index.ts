import type { ArchivedItemPage } from "@/types/crawler";

export const pageIsReviewed = (page: ArchivedItemPage) =>
  page.approved != null || !!page.notes?.length;

export * from "./crawlCounts";
export * from "./iconFor";
export * from "./issueCounts";
export * from "./severity";
export type * from "./severity";
