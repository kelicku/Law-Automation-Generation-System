import { ArrowRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { GenerateButton } from "@/components/incident/generate-button";
import { ReviewControl } from "@/components/incident/review-control";
import { SourceList, type SourceView } from "@/components/incident/source-list";
import { PageHeader, Section } from "@/components/shell/page-header";
import { CategoryTag, Pill, StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { requireTenantViewer } from "@/lib/auth/session";
import type { ArticleStatus, Category, ReviewStatus } from "@/lib/domain/types";
import { getIncidentDetail } from "@/lib/server/queries";
import { cn, fmtDate, fmtNum } from "@/lib/utils";

export const metadata = { title: "事件詳細" };

const EVENT_LABEL: Record<string, string> = { detected: "事件として検出", source_added: "出典を追加", update: "更新", material_change: "重要な変更" };

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireTenantViewer();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const d = await getIncidentDetail(viewer, id);
  if (!d) notFound();
  const i = d.incident;
  const canEdit = viewer.role !== "viewer";
  const classification = i.classification as { method?: string; confidence?: number; rationale?: string };

  return (
    <div className="mx-auto max-w-[1200px]">
      <Link href="/app/radar" className="text-xs text-slate hover:text-ink">← Incident Radar</Link>
      <PageHeader
        className="mt-3"
        eyebrow={`Incident · ${i.is_fictional ? "架空のデモ事件" : "公開情報"}`}
        title={i.title}
        description={<span className="flex flex-wrap items-center gap-3"><span>{i.organization_name}</span><CategoryTag category={i.category as Category} /></span>}
        actions={
          d.article ? (
            <Button asChild variant="outline"><Link href={`/app/articles/${d.article.id}`}>記事を開く <ArrowRight /></Link></Button>
          ) : canEdit ? null : null
        }
      />

      {i.has_material_update && (
        <div className="mb-6 flex items-start gap-3 border-l-2 border-st-revision bg-st-revision/5 px-4 py-3 text-[13px] text-st-revision">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>この事件には重要な続報があります。下の変更履歴で内容を確認できます。{d.article && <Link className="ml-2 font-medium underline" href={`/app/articles/${d.article.id}/diff`}>記事の差分を確認</Link>}</p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
        {[
          ["発生日", fmtDate(i.occurred_on)],
          ["公表日", fmtDate(i.disclosed_on)],
          ["最終更新", fmtDate(i.last_updated_at, { time: true })],
          ["影響人数", i.affected_count === null ? "未公表 / 調査中" : `${fmtNum(i.affected_count)}（${i.affected_count_status === "confirmed" ? "確定" : "推計"}）`],
        ].map(([k, v]) => (
          <div key={k} className="bg-[#FBFAF7] px-4 py-3">
            <dt className="text-2xs text-slate">{k}</dt>
            <dd className="mt-1 font-num text-sm text-ink tnum">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-10">
          <Section eyebrow="Summary" title="概要（初報の冒頭）">
            <p className="text-[13px] leading-loose text-ink-2">{i.summary || "—"}</p>
            <p className="mt-3 text-2xs text-slate">
              分類: {classification.method ?? "—"}{classification.confidence !== undefined && ` · 確信度 ${Math.round(classification.confidence * 100)}%`}
              {classification.rationale && ` · ${classification.rationale}`}
            </p>
          </Section>
          <div id="sources">
            <Section eyebrow="Sources" title={`出典（${d.sources.length}件）`}>
              <SourceList
                sources={d.sources.map((s) => ({
                  ...s,
                  published_at: s.published_at ? new Date(s.published_at).toISOString() : null,
                  fetched_at: new Date(s.fetched_at).toISOString(),
                })) as unknown as SourceView[]}
              />
            </Section>
          </div>
        </div>

        <aside className="space-y-8">
          <Section eyebrow="Your firm" title="自所での対応">
            <p className="mb-2 text-xs text-ink-3">確認状態（事務所ごとに非公開で管理）</p>
            <ReviewControl incidentId={i.id} status={(d.review?.status as ReviewStatus) ?? "unreviewed"} />
            {d.review?.reviewer && <p className="mt-2 text-2xs text-slate">{d.review.reviewer}・{fmtDate(d.review.reviewed_at, { time: true })}</p>}
            <div className="mt-6 border-t border-line pt-4">
              {d.article ? (
                <div className="space-y-2">
                  <StatusBadge status={d.article.status as ArticleStatus} />
                  <p className="text-[13px] text-ink">{d.article.title}</p>
                  <Link href={`/app/articles/${d.article.id}`} className="text-xs text-navy hover:underline">エディタで開く →</Link>
                </div>
              ) : canEdit ? (
                <>
                  <p className="mb-3 text-xs leading-relaxed text-ink-3">出典に記載された事実だけで記事の下書きを作成します。事実文には出典の逐語引用が付きます。</p>
                  <GenerateButton incidentId={i.id} />
                </>
              ) : (
                <p className="text-xs text-slate">閲覧権限のため記事は作成できません</p>
              )}
            </div>
          </Section>

          <Section eyebrow="History" title="変更履歴">
            <ol className="relative space-y-3 border-l border-line pl-4" data-testid="incident-events">
              {d.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className={cn("absolute -left-[20px] top-1.5 size-2 rounded-full border-2 border-ivory", e.is_material ? "bg-st-revision" : "bg-navy-3")} aria-hidden />
                  <p className={cn("text-xs font-medium", e.is_material ? "text-st-revision" : "text-ink")}>
                    {EVENT_LABEL[e.event_type] ?? e.event_type}{e.is_material && <Pill tone="warn" className="ml-1.5">要再承認</Pill>}
                  </p>
                  {e.event_type === "material_change" ? (
                    <p className="mt-0.5 text-xs text-ink-2"><span className="text-slate line-through">{e.old_value}</span> → <b>{e.new_value}</b></p>
                  ) : (
                    <p className="mt-0.5 truncate text-xs text-ink-3">{e.new_value}</p>
                  )}
                  <p className="font-num text-[10px] text-slate tnum">{fmtDate(e.detected_at, { time: true })}{e.publisher && ` · ${e.publisher}`}</p>
                </li>
              ))}
            </ol>
          </Section>
        </aside>
      </div>
    </div>
  );
}
