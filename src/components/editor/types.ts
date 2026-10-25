import type { ArticleContent } from "@/lib/domain/article";
import type { PrecheckResult } from "@/lib/domain/precheck";
import type { ArticleStatus, Category, MemberRole } from "@/lib/domain/types";

export interface EditorSource {
  id: string;
  publisher: string;
  title: string;
  url: string;
  source_type: string;
  published_at: string | null;
  fetched_at: string;
  relation: string;
  content_text: string;
  injection_flags: { pattern: string; excerpt: string }[];
  is_fictional: boolean;
}

export interface EditorBundle {
  article: {
    id: string;
    slug: string;
    status: ArticleStatus;
    working: ArticleContent;
    working_hash: string;
    working_updated_at: string;
    review_version_id: string | null;
    published_version_id: string | null;
    current_version_id: string | null;
    pending_update: { label: string; before: string; after: string; detected_at: string } | null;
  };
  incident: {
    id: string;
    title: string;
    organization_name: string;
    category: Category;
    occurred_on: string | null;
    disclosed_on: string | null;
    affected_count: number | null;
    affected_count_status: string;
    has_material_update: boolean;
  };
  sources: EditorSource[];
  versions: { id: string; version_no: number; kind: string; note: string; created_at: string; content_hash: string; author: string | null }[];
  transitions: { id: string; from_status: string; to_status: string; action: string; comment: string; created_at: string; actor: string | null; version_id: string | null }[];
  approvals: { id: string; decision: string; comment: string; created_at: string; version_no: number; approver: string }[];
  page: { status: "live" | "suspended"; published_at: string; version_no: number; slug: string } | null;
  precheck: PrecheckResult;
  settings: { feeNotice: string; consultationFormUrl: string };
}

export interface EditorContext {
  role: MemberRole;
  tenantSlug: string;
  tenantName: string;
  aiProvider: "anthropic" | "simulation";
}

export const VERSION_KIND: Record<string, string> = {
  ai_generated: "AI生成",
  manual_save: "下書き保存",
  submitted: "承認申請",
  update_proposal: "続報更新案",
  restored: "復元",
};
