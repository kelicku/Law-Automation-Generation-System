import { z } from "zod";

export const CATEGORIES = ["personal_data", "cyber_attack", "consumer_harm", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  personal_data: "個人情報漏えい",
  cyber_attack: "サイバー攻撃",
  consumer_harm: "消費者被害",
  other: "その他",
};

export const ARTICLE_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "published",
  "revision_required",
  "suspended",
  "archived",
] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const STATUS_LABEL: Record<ArticleStatus, { en: string; ja: string }> = {
  draft: { en: "Draft", ja: "下書き" },
  in_review: { en: "In Review", ja: "承認待ち" },
  approved: { en: "Approved", ja: "承認済み" },
  published: { en: "Published", ja: "公開中" },
  revision_required: { en: "Revision Required", ja: "要修正・再承認" },
  suspended: { en: "Suspended", ja: "公開停止" },
  archived: { en: "Archived", ja: "アーカイブ" },
};

export type MemberRole = "owner" | "lawyer" | "editor" | "viewer";
export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "代表弁護士",
  lawyer: "弁護士（承認者）",
  editor: "編集担当",
  viewer: "閲覧のみ",
};

export const ReviewStatus = z.enum(["unreviewed", "reviewing", "confirmed", "dismissed"]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;
export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  unreviewed: "未確認",
  reviewing: "確認中",
  confirmed: "確認済み",
  dismissed: "対象外",
};
