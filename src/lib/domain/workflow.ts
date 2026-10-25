import type { ArticleStatus, MemberRole } from "./types";

/**
 * Approval workflow — single source of truth for which transitions exist,
 * who may perform them and what must hold. Enforced on the server (and again by RLS
 * and the published_pages trigger in the database).
 */
export type WorkflowAction =
  | "submit"
  | "approve"
  | "request_revision"
  | "publish"
  | "suspend"
  | "republish"
  | "reopen"
  | "archive"
  | "restore";

export interface TransitionRule {
  action: WorkflowAction;
  from: ArticleStatus[];
  to: ArticleStatus;
  roles: MemberRole[];
  label: string;
  description: string;
}

const EDITORS: MemberRole[] = ["owner", "lawyer", "editor"];
const APPROVERS: MemberRole[] = ["owner", "lawyer"];

export const TRANSITIONS: TransitionRule[] = [
  {
    action: "submit",
    from: ["draft", "revision_required"],
    to: "in_review",
    roles: EDITORS,
    label: "承認申請",
    description: "公開前チェックに阻害項目がないこと。申請時点の内容をバージョンとして固定します。",
  },
  {
    action: "approve",
    from: ["in_review"],
    to: "approved",
    roles: APPROVERS,
    label: "承認",
    description: "弁護士のみ。申請されたバージョンが現在の内容と一致していること。承認者・日時・バージョンを記録します。",
  },
  {
    action: "request_revision",
    from: ["in_review", "approved"],
    to: "revision_required",
    roles: APPROVERS,
    label: "差し戻し",
    description: "弁護士のみ。差し戻し理由（コメント）が必須です。",
  },
  {
    action: "publish",
    from: ["approved"],
    to: "published",
    roles: APPROVERS,
    label: "公開",
    description: "承認済みバージョンのみ公開できます。公開版は編集中の最新版とは別に保持されます。",
  },
  {
    action: "suspend",
    from: ["published"],
    to: "suspended",
    roles: APPROVERS,
    label: "公開停止",
    description: "公開サイトから直ちに非表示にします。内容と承認記録は保持されます。",
  },
  {
    action: "republish",
    from: ["suspended"],
    to: "published",
    roles: APPROVERS,
    label: "再公開",
    description: "停止前の承認済みバージョンを再度公開します。内容に変更がある場合は再承認が必要です。",
  },
  {
    action: "reopen",
    from: ["in_review", "approved", "published", "suspended"],
    to: "draft",
    roles: EDITORS,
    label: "編集を再開",
    description: "最新版の編集を再開します。公開中のページは承認済みの旧版のまま維持されます。",
  },
  {
    action: "archive",
    from: ["draft", "revision_required", "suspended", "approved", "in_review"],
    to: "archived",
    roles: APPROVERS,
    label: "アーカイブ",
    description: "公開中の記事はアーカイブできません（先に公開停止が必要）。",
  },
  {
    action: "restore",
    from: ["archived"],
    to: "draft",
    roles: APPROVERS,
    label: "下書きに戻す",
    description: "アーカイブ済みの記事を下書きとして復元します。",
  },
];

export function findRule(action: WorkflowAction): TransitionRule {
  const rule = TRANSITIONS.find((t) => t.action === action);
  if (!rule) throw new Error(`unknown action ${action}`);
  return rule;
}

export type TransitionCheck =
  | { ok: true; rule: TransitionRule }
  | { ok: false; code: "INVALID_TRANSITION" | "FORBIDDEN" | "PRECONDITION_FAILED"; message: string };

export interface TransitionContext {
  status: ArticleStatus;
  role: MemberRole | null;
  /** content hash of the working copy */
  workingHash: string;
  /** content hash of the version under review / approved */
  reviewHash: string | null;
  /** content hash of the version referenced by the latest approved approval */
  approvedHash: string | null;
  /** content hash of the version currently referenced by published_pages */
  publishedHash: string | null;
  blockingIssues: number;
  comment?: string;
}

export function checkTransition(action: WorkflowAction, ctx: TransitionContext): TransitionCheck {
  const rule = findRule(action);
  if (!rule.from.includes(ctx.status)) {
    return { ok: false, code: "INVALID_TRANSITION", message: `「${rule.label}」は現在の状態では実行できません。` };
  }
  if (!ctx.role || !rule.roles.includes(ctx.role)) {
    return { ok: false, code: "FORBIDDEN", message: `「${rule.label}」を行う権限がありません。` };
  }
  switch (action) {
    case "submit":
      if (ctx.blockingIssues > 0) {
        return { ok: false, code: "PRECONDITION_FAILED", message: `公開前チェックで${ctx.blockingIssues}件の阻害項目があります。` };
      }
      break;
    case "approve":
      if (!ctx.reviewHash || ctx.reviewHash !== ctx.workingHash) {
        return { ok: false, code: "PRECONDITION_FAILED", message: "申請後に内容が変更されています。再度承認申請してください。" };
      }
      if (ctx.blockingIssues > 0) {
        return { ok: false, code: "PRECONDITION_FAILED", message: "公開前チェックに阻害項目があるため承認できません。" };
      }
      break;
    case "request_revision":
      if (!ctx.comment || ctx.comment.trim().length < 2) {
        return { ok: false, code: "PRECONDITION_FAILED", message: "差し戻し理由を入力してください。" };
      }
      break;
    case "publish":
      if (!ctx.approvedHash || ctx.approvedHash !== ctx.workingHash) {
        return { ok: false, code: "PRECONDITION_FAILED", message: "承認済みの内容と一致しないため公開できません。" };
      }
      break;
    case "republish":
      if (!ctx.publishedHash || !ctx.approvedHash || ctx.publishedHash !== ctx.approvedHash) {
        return { ok: false, code: "PRECONDITION_FAILED", message: "承認済みの公開版が見つからないため再公開できません。" };
      }
      break;
    default:
      break;
  }
  return { ok: true, rule };
}

export function availableActions(status: ArticleStatus, role: MemberRole | null): TransitionRule[] {
  return TRANSITIONS.filter((t) => t.from.includes(status) && role !== null && t.roles.includes(role));
}
