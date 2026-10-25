import Link from "next/link";
import { PageHeader, Section } from "@/components/shell/page-header";
import { StatusBadge } from "@/components/ui/badges";
import { requireTenantViewer } from "@/lib/auth/session";
import { ROLE_LABEL, STATUS_LABEL, type ArticleStatus } from "@/lib/domain/types";
import { TRANSITIONS } from "@/lib/domain/workflow";
import { approvalHistory, listArticles } from "@/lib/server/queries";
import { cn, fmtDate } from "@/lib/utils";

export const metadata = { title: "承認ワークフロー" };

const LANES: ArticleStatus[] = ["draft", "in_review", "approved", "published", "revision_required", "suspended", "archived"];
const ACTION: Record<string, string> = Object.fromEntries([...TRANSITIONS.map((t) => [t.action, t.label]), ["material_update", "重要な続報を検出"]]);

export default async function ApprovalsPage() {
  const viewer = await requireTenantViewer();
  const [articles, history] = await Promise.all([listArticles(viewer), approvalHistory(viewer)]);
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Approval Workflow"
        title="承認ワークフロー"
        description="7つの状態と、その間の遷移条件を定義しています。承認・公開・停止は弁護士のみが実行でき、サーバー側とデータベース（RLS・トリガー）の両方で検証されます。"
      />
      <div className="scroll-x border-y border-line bg-white">
        <div className="grid min-w-[1100px] grid-cols-7 divide-x divide-line" data-testid="workflow-board">
          {LANES.map((s, i) => {
            const items = articles.filter((a) => a.status === s);
            return (
              <div key={s} className={cn("min-h-[220px]", i >= 4 && "bg-ivory/50")}>
                <div className="border-b border-line px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={s} showEn={false} />
                    <span className="font-num text-sm font-semibold tnum">{items.length}</span>
                  </div>
                  <p className="mt-1 font-num text-[10px] uppercase tracking-widest text-slate">{STATUS_LABEL[s].en}</p>
                </div>
                <ul className="space-y-2 p-2">
                  {items.map((a) => (
                    <li key={a.id}>
                      <Link href={`/app/articles/${a.id}`} className="block border-l-2 border-navy-3/40 bg-white px-2.5 py-2 text-xs shadow-hair hover:shadow-lift">
                        <p className="line-clamp-2 leading-snug text-ink">{a.title}</p>
                        <p className="mt-1 text-[10.5px] text-slate">{a.organization_name}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Section eyebrow="Rules" title="状態遷移の条件">
          <div className="scroll-x">
            <table className="w-full min-w-[640px] text-xs" data-testid="transition-rules">
              <thead className="border-b border-line text-left text-2xs text-slate">
                <tr><th className="py-2 pr-3 font-medium">操作</th><th className="py-2 pr-3 font-medium">遷移</th><th className="py-2 pr-3 font-medium">実行できる役割</th><th className="py-2 font-medium">条件</th></tr>
              </thead>
              <tbody>
                {TRANSITIONS.map((t) => (
                  <tr key={t.action} className="border-b border-line align-top last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{t.label}</td>
                    <td className="py-2.5 pr-3 text-ink-3">{t.from.map((f) => STATUS_LABEL[f].ja).join(" / ")} → <b className="text-ink">{STATUS_LABEL[t.to].ja}</b></td>
                    <td className="py-2.5 pr-3 text-ink-3">{t.roles.map((r) => ROLE_LABEL[r]).join("・")}</td>
                    <td className="py-2.5 leading-relaxed text-ink-3">{t.description}</td>
                  </tr>
                ))}
                <tr className="align-top"><td className="py-2.5 pr-3 font-medium">続報検出</td><td className="py-2.5 pr-3 text-ink-3">公開中 / 承認済み / 承認待ち → <b className="text-ink">要修正・再承認</b></td><td className="py-2.5 pr-3 text-ink-3">システム</td><td className="py-2.5 text-ink-3">重要な変更を検出すると更新案を作成。公開ページは承認済みの版を維持します。</td></tr>
              </tbody>
            </table>
          </div>
        </Section>
        <Section eyebrow="Audit trail" title="承認・状態変更の履歴">
          <ol className="divide-y divide-line" data-testid="workflow-history">
            {history.map((h) => (
              <li key={h.id} className="py-2.5 text-xs">
                <p><span className="font-medium">{h.actor ?? "システム"}</span>：{ACTION[h.action] ?? h.action}{h.version_no && <span className="font-num text-slate"> · v{h.version_no}</span>}</p>
                <Link href={`/app/articles/${h.article_id}`} className="block truncate text-ink-3 hover:underline">{h.title}</Link>
                <p className="font-num text-[10.5px] text-slate tnum">{fmtDate(h.created_at, { time: true })} · {STATUS_LABEL[h.from_status as ArticleStatus]?.ja} → {STATUS_LABEL[h.to_status as ArticleStatus]?.ja}</p>
                {h.comment && <p className="mt-0.5 text-ink-3">「{h.comment}」</p>}
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}
