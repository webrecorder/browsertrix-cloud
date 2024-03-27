import { type ArchivedItemPage } from "@/types/crawler";
import { cached } from "@/utils/weakCache";

export type ReviewStatus = "approved" | "rejected" | "commentOnly" | null;

export const approvalFromPage = cached(
  (page: ArchivedItemPage): ReviewStatus =>
    page.approved == null
      ? page.notes?.length
        ? "commentOnly"
        : null
      : page.approved
        ? "approved"
        : "rejected",
);
