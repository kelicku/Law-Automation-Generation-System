"use client";
import { motion } from "motion/react";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { api, ClientApiError, journey } from "@/lib/client/api";
import { STATUS_LABEL, type ArticleStatus, type MemberRole } from "@/lib/domain/types";
import { availableActions, TRANSITIONS, type WorkflowAction } from "@/lib/domain/workflow";
import { cn } from "@/lib/utils";

/** Visual layout of the state machine: main path on one row, side states below. */
const MAIN: ArticleStatus[] = ["draft", "in_review", "approved", "published"];
const SIDE: ArticleStatus[] = ["revision_required", "suspended", "archived"];

export function useWorkflowAction(articleId: string, beforeAction?: () => Promise<void>) {
  const router = useRouter();
  const [busy, setBusy] = useState<WorkflowAction | null>(null);
  const run = async (action: WorkflowAction, comment = "") => {
    setBusy(action);
    try {
      await beforeAction?.();
      const r = await api<{ status: ArticleStatus }>(`/api/articles/${articleId}/transition`, { body: { action, comment } });
      toast.success(`${TRANSITIONS.find((t) => t.action === action)?.label}：${STATUS_LABEL[r.status].ja}になりました`);
      if (action === "approve") journey("article_approved");
      router.refresh();
      return true;
    } catch (e) {
      const err = e instanceof ClientApiError ? e : null;
      const items = (err?.details as { precheck?: { label: string; level: string; detail: string }[] } | undefined)?.precheck?.filter((i) => i.level === "blocking");
      toast.error(err?.message ?? "操作に失敗しました", { description: items?.map((i) => `${i.label}: ${i.detail}`).join("\n") });
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { run, busy };
}

export function StateMachine({ status }: { status: ArticleStatus }) {
  const node = (s: ArticleStatus) => (
    <div
      key={s}
      className={cn(
        "relative flex min-w-0 flex-1 flex-col items-center px-1 py-2 text-center",
        s === status ? "text-ink" : "text-slate",
      )}
      data-current={s === status || undefined}
    >
      <span className={cn("relative flex size-3.5 items-center justify-center rounded-full border-2 bg-white", s === status ? "border-gold" : "border-line-strong")}>
        {s === status && <motion.span layoutId="wf-dot" className="size-1.5 rounded-full bg-gold" transition={{ type: "spring", stiffness: 300, damping: 26 }} />}
      </span>
      <span className="mt-1 text-[10.5px] font-medium leading-tight">{STATUS_LABEL[s].ja}</span>
      <span className="font-num text-[9px] leading-tight opacity-70">{STATUS_LABEL[s].en}</span>
    </div>
  );
  return (
    <div aria-label={`現在の状態: ${STATUS_LABEL[status].ja}`} role="img">
      <div className="relative flex">
        <span className="absolute left-[12%] right-[12%] top-[15px] h-px bg-line-strong" aria-hidden />
        {MAIN.map(node)}
      </div>
      <div className="mt-1 flex border-t border-dashed border-line">{SIDE.map(node)}</div>
    </div>
  );
}

export function WorkflowActions({ articleId, status, role, beforeAction, compact }: { articleId: string; status: ArticleStatus; role: MemberRole; beforeAction?: () => Promise<void>; compact?: boolean }) {
  const { run, busy } = useWorkflowAction(articleId, beforeAction);
  const [comment, setComment] = useState("");
  const actions = availableActions(status, role);
  const all = TRANSITIONS.filter((t) => t.from.includes(status));
  const needsComment = actions.some((a) => a.action === "request_revision");
  const primary: WorkflowAction[] = ["submit", "approve", "publish", "republish"];

  return (
    <div className="space-y-3">
      {needsComment && !compact && (
        <Textarea rows={2} placeholder="コメント（差し戻し時は必須）" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="承認・差し戻しのコメント" data-testid="workflow-comment" />
      )}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.action}
            size="sm"
            variant={a.action === "suspend" || a.action === "archive" ? "danger" : primary.includes(a.action) ? (a.action === "publish" ? "gold" : "primary") : "outline"}
            loading={busy === a.action}
            disabled={!!busy}
            onClick={async () => {
              if ((a.action === "suspend" || a.action === "archive") && !window.confirm(`「${a.label}」を実行しますか？`)) return;
              if (await run(a.action, comment)) setComment("");
            }}
            title={a.description}
            data-testid={`action-${a.action}`}
          >
            {a.label}
          </Button>
        ))}
      </div>
      {all.filter((t) => !actions.includes(t)).length > 0 && (
        <p className="flex items-start gap-1.5 text-2xs leading-relaxed text-slate">
          <Lock className="mt-0.5 size-3 shrink-0" />
          {all.filter((t) => !actions.includes(t)).map((t) => t.label).join("・")} は弁護士（承認権限）のみ実行できます
        </p>
      )}
    </div>
  );
}

export function WorkflowNotice({ articleId, status, role, editable, beforeAction }: { articleId: string; status: ArticleStatus; role: MemberRole; editable: boolean; beforeAction: () => Promise<void> }) {
  const { run, busy } = useWorkflowAction(articleId, beforeAction);
  if (editable) return null;
  const canReopen = availableActions(status, role).some((a) => a.action === "reopen");
  const msg: Partial<Record<ArticleStatus, string>> = {
    in_review: "承認待ちのため編集はロックされています。申請時点の版が審査対象です。",
    approved: "承認済みのため編集はロックされています。編集すると再承認が必要になります。",
    published: "公開中の記事です。編集を再開しても、公開ページは承認済みの版のまま維持されます。",
    suspended: "公開停止中の記事です。",
    archived: "アーカイブ済みの記事です。",
  };
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 border border-line bg-ivory-2/70 px-4 py-3 text-xs text-ink-2" data-testid="locked-notice">
      <Lock className="size-4 text-slate" />
      <span className="flex-1">{msg[status] ?? "この記事は編集できません。"}</span>
      {canReopen && <Button size="sm" variant="outline" loading={busy === "reopen"} onClick={() => run("reopen")} data-testid="action-reopen-inline">編集を再開</Button>}
    </div>
  );
}
