"use client";
import { AlertOctagon, CheckCircle2, Info, RefreshCw, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AiModeBadge, Pill } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ClientApiError, journey } from "@/lib/client/api";
import { waitForJob } from "@/lib/client/jobs";
import type { ArticleContent } from "@/lib/domain/article";
import { COVERAGE_METHOD } from "@/lib/domain/evidence";
import type { PrecheckResult } from "@/lib/domain/precheck";
import { cn, fmtDate } from "@/lib/utils";
import type { EditorBundle, EditorContext } from "./types";
import { StateMachine, WorkflowActions } from "./workflow";

export function RightPane({
  bundle, ctx, content, precheck, setPrecheck, editable, onChange, beforeAction, hasUnsaved,
}: {
  bundle: EditorBundle;
  ctx: EditorContext;
  content: ArticleContent;
  precheck: PrecheckResult;
  setPrecheck: (p: PrecheckResult) => void;
  editable: boolean;
  onChange: (c: ArticleContent, o?: { flashIds?: string[] }) => void;
  beforeAction: () => Promise<void>;
  hasUnsaved: boolean;
}) {
  return (
    <Tabs defaultValue="check" className="px-4 py-5 sm:px-5">
      <TabsList>
        <TabsTrigger value="ai">AIアシスタント</TabsTrigger>
        <TabsTrigger value="check" data-testid="tab-check">
          チェック{precheck.blocking > 0 && <span className="ml-1 rounded-full bg-st-revision px-1.5 font-num text-[10px] text-white">{precheck.blocking}</span>}
        </TabsTrigger>
        <TabsTrigger value="seo">SEO</TabsTrigger>
        <TabsTrigger value="approval" data-testid="tab-approval">承認</TabsTrigger>
      </TabsList>
      <TabsContent value="ai" className="pt-5"><AiPanel bundle={bundle} ctx={ctx} content={content} editable={editable} onChange={onChange} beforeAction={beforeAction} /></TabsContent>
      <TabsContent value="check" className="pt-5"><CheckPanel articleId={bundle.article.id} precheck={precheck} setPrecheck={setPrecheck} beforeAction={beforeAction} /></TabsContent>
      <TabsContent value="seo" className="pt-5"><SeoPanel content={content} editable={editable} onChange={onChange} ctx={ctx} slug={bundle.article.slug} /></TabsContent>
      <TabsContent value="approval" className="pt-5"><ApprovalPanel bundle={bundle} ctx={ctx} beforeAction={beforeAction} precheck={precheck} hasUnsaved={hasUnsaved} /></TabsContent>
    </Tabs>
  );
}

function AiPanel({ bundle, ctx, content, editable, onChange, beforeAction }: { bundle: EditorBundle; ctx: EditorContext; content: ArticleContent; editable: boolean; onChange: (c: ArticleContent, o?: { flashIds?: string[] }) => void; beforeAction: () => Promise<void> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [titles, setTitles] = useState<string[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const call = async <T,>(task: string): Promise<T | null> => {
    setBusy(task);
    setLastError(null);
    try {
      await beforeAction();
      const r = await api<{ output: T }>(`/api/articles/${bundle.article.id}/assist`, { body: { task }, idempotent: true });
      return r.output;
    } catch (e) {
      const msg = e instanceof ClientApiError ? e.message : "AI処理に失敗しました";
      setLastError(msg);
      toast.error(msg);
      return null;
    } finally {
      setBusy(null);
    }
  };
  const regenerate = async () => {
    if (!window.confirm("出典から記事全体を再生成します。現在の内容は変更履歴に残ります。よろしいですか？")) return;
    setBusy("regen");
    setLastError(null);
    try {
      await beforeAction();
      const r = await api<{ jobId?: string }>(`/api/articles/generate`, { body: { incidentId: bundle.incident.id }, idempotent: true });
      if (r.jobId) await waitForJob(r.jobId);
      toast.success("記事を再生成しました");
      router.refresh();
    } catch (e) {
      const msg = e instanceof ClientApiError ? e.message : "再生成に失敗しました";
      setLastError(msg);
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 text-[13px]">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-3">出典にない事実は補完しない設定で実行します。</p>
        <AiModeBadge provider={ctx.aiProvider} />
      </div>
      {lastError && <p role="alert" className="border-l-2 border-st-suspended bg-st-suspended/5 px-3 py-2 text-xs text-st-suspended" data-testid="ai-error">{lastError}</p>}
      <AssistRow title="SEOタイトル生成" desc="40字以内の候補を3案作成" busy={busy === "seo_title"} disabled={!editable} onRun={async () => { const o = await call<{ candidates: string[] }>("seo_title"); if (o) setTitles(o.candidates); }} testId="assist-seo">
        {titles.length > 0 && (
          <ul className="mt-2 space-y-1">
            {titles.map((t) => (
              <li key={t}>
                <button className="w-full border border-line bg-white px-2.5 py-1.5 text-left text-xs hover:border-navy/40" onClick={() => { onChange({ ...content, seo: { ...content.seo, title: t } }); toast.success("SEOタイトルに反映しました"); }}>
                  {t}<span className="ml-1 font-num text-[10px] text-slate">{[...t].length}字</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </AssistRow>
      <AssistRow title="メタディスクリプション生成" desc="80〜120字の要約" busy={busy === "meta_description"} disabled={!editable} onRun={async () => { const o = await call<{ description: string }>("meta_description"); if (o) { onChange({ ...content, seo: { ...content.seo, description: o.description } }); toast.success("メタディスクリプションに反映しました"); } }} testId="assist-meta" />
      <AssistRow title="SNS投稿文生成" desc="X・Facebook向けの紹介文" busy={busy === "sns_post"} disabled={!editable} onRun={async () => { const o = await call<{ x: string; facebook: string }>("sns_post"); if (o) { onChange({ ...content, sns: o }); toast.success("SNS投稿文を作成しました"); } }} testId="assist-sns">
        <div className="mt-2 space-y-2">
          <div>
            <Label htmlFor="sns-x">X（{[...content.sns.x].length}/140）</Label>
            <Textarea id="sns-x" rows={3} value={content.sns.x} disabled={!editable} onChange={(e) => onChange({ ...content, sns: { ...content.sns, x: e.target.value.slice(0, 280) } })} className="text-xs" />
          </div>
          <div>
            <Label htmlFor="sns-fb">Facebook</Label>
            <Textarea id="sns-fb" rows={3} value={content.sns.facebook} disabled={!editable} onChange={(e) => onChange({ ...content, sns: { ...content.sns, facebook: e.target.value.slice(0, 600) } })} className="text-xs" />
          </div>
        </div>
      </AssistRow>
      <div className="border-t border-line pt-4">
        <p className="font-medium">記事全体の再生成</p>
        <p className="mt-1 text-xs text-ink-3">段落単位の再生成は、本文の段落にカーソルを合わせて「再生成」から実行できます。</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={regenerate} loading={busy === "regen"} disabled={!editable}><RefreshCw /> 出典から再生成</Button>
      </div>
    </div>
  );
}

function AssistRow({ title, desc, busy, disabled, onRun, children, testId }: { title: string; desc: string; busy: boolean; disabled: boolean; onRun: () => void; children?: React.ReactNode; testId: string }) {
  return (
    <div className="border-t border-line pt-4 first:border-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-xs text-ink-3">{desc}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onRun} loading={busy} disabled={disabled} data-testid={testId}>{!busy && <Sparkles />}生成</Button>
      </div>
      {children}
    </div>
  );
}

function CheckPanel({ articleId, precheck, setPrecheck, beforeAction }: { articleId: string; precheck: PrecheckResult; setPrecheck: (p: PrecheckResult) => void; beforeAction: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      await beforeAction();
      const r = await api<{ precheck: PrecheckResult; checkedAt: string }>(`/api/articles/${articleId}/precheck`);
      setPrecheck(r.precheck);
      setCheckedAt(r.checkedAt);
      journey("precheck_run");
      if (r.precheck.blocking) toast.warning(`阻害項目が${r.precheck.blocking}件あります`);
      else toast.success("公開前チェックに阻害項目はありません");
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "チェックに失敗しました");
    } finally {
      setBusy(false);
    }
  };
  const ev = precheck.evidence;
  return (
    <div className="space-y-5 text-[13px]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">公開前チェック</p>
          <p className="text-2xs text-slate">{checkedAt ? `実行 ${fmtDate(checkedAt, { time: true, year: false })}` : "保存のたびに自動更新"}・承認時にサーバーで再検証</p>
        </div>
        <Button size="sm" onClick={run} loading={busy} data-testid="run-precheck"><ShieldCheck />実行</Button>
      </div>
      <ul className="divide-y divide-line border-y border-line" data-testid="precheck-items">
        {precheck.items.map((i) => (
          <li key={i.id} className="flex gap-2.5 py-2.5" data-level={i.level}>
            {i.level === "pass" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-st-approved" /> : i.level === "warning" ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-st-revision" /> : <AlertOctagon className="mt-0.5 size-4 shrink-0 text-st-suspended" />}
            <div>
              <p className="text-xs font-medium text-ink">{i.label}{i.level === "blocking" && <Pill tone="danger" className="ml-1.5">要対応</Pill>}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{i.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <div>
        <p className="mb-2 text-xs font-medium">広告表現チェック</p>
        {precheck.ads.length === 0 ? (
          <p className="text-xs text-ink-3">指摘はありません。</p>
        ) : (
          <ul className="space-y-2" data-testid="ad-findings">
            {precheck.ads.map((f, i) => (
              <li key={i} className={cn("border-l-2 px-3 py-2 text-xs", f.severity === "error" ? "border-st-suspended bg-st-suspended/5" : "border-st-revision bg-st-revision/5")}>
                <p className="font-medium text-ink">{f.label}：<mark className="bg-transparent font-semibold text-st-suspended">「{f.match}」</mark></p>
                <p className="mt-1 leading-relaxed text-ink-3">{f.reason}</p>
                <p className="mt-1 text-ink-2">→ {f.suggestion}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-2xs leading-relaxed text-slate">弁護士の業務広告に関する規律で問題となりうる表現を機械的に抽出する補助機能です。最終判断は弁護士が行ってください。</p>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium">根拠カバー率</p>
          <p className="font-num text-2xl font-semibold tnum" data-testid="coverage">{ev.coverage}<span className="text-sm text-slate">%</span></p>
        </div>
        <div className="mt-1 h-1.5 bg-ivory-3"><div className={cn("h-full", ev.coverage === 100 ? "bg-st-approved" : "bg-st-revision")} style={{ width: `${ev.coverage}%` }} /></div>
        <p className="mt-1.5 font-num text-[11px] text-slate tnum">事実文 {ev.totals.facts} · 照合済 {ev.totals.verified} · 不一致 {ev.totals.mismatch} · 出典なし {ev.totals.unsourced} · 解説/案内 {ev.totals.nonFact}</p>
        <p className="mt-2 flex gap-1.5 text-2xs leading-relaxed text-slate"><Info className="mt-0.5 size-3 shrink-0" />{COVERAGE_METHOD}</p>
      </div>
    </div>
  );
}

function SeoPanel({ content, editable, onChange, ctx, slug }: { content: ArticleContent; editable: boolean; onChange: (c: ArticleContent) => void; ctx: EditorContext; slug: string }) {
  const t = content.seo.title;
  const d = content.seo.description;
  return (
    <div className="space-y-4 text-[13px]">
      <div>
        <Label htmlFor="seo-title">SEOタイトル（{[...t].length}/40字目安）</Label>
        <Input id="seo-title" value={t} disabled={!editable} maxLength={70} onChange={(e) => onChange({ ...content, seo: { ...content.seo, title: e.target.value } })} data-testid="seo-title" />
      </div>
      <div>
        <Label htmlFor="seo-desc">メタディスクリプション（{[...d].length}字・目安50〜130字）</Label>
        <Textarea id="seo-desc" rows={4} value={d} disabled={!editable} maxLength={200} onChange={(e) => onChange({ ...content, seo: { ...content.seo, description: e.target.value } })} data-testid="seo-description" />
      </div>
      <div>
        <Label htmlFor="seo-kw">キーワード（カンマ区切り）</Label>
        <Input id="seo-kw" value={content.seo.keywords.join(", ")} disabled={!editable} onChange={(e) => onChange({ ...content, seo: { ...content.seo, keywords: e.target.value.split(/[,、]/).map((s) => s.trim()).filter(Boolean).slice(0, 10) } })} />
      </div>
      <div>
        <p className="eyebrow mb-2">Search preview</p>
        <div className="border border-line bg-white p-3">
          <p className="truncate text-[11px] text-ink-3">{ctx.tenantName} › {slug}</p>
          <p className="mt-0.5 line-clamp-1 text-[15px] text-[#1a0dab]">{t || content.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-3">{d}</p>
        </div>
        <p className="mt-2 text-2xs leading-relaxed text-slate">SEO設定は検索エンジンに情報を正しく伝えるためのものであり、検索順位を保証するものではありません。</p>
      </div>
    </div>
  );
}

function ApprovalPanel({ bundle, ctx, beforeAction, precheck, hasUnsaved }: { bundle: EditorBundle; ctx: EditorContext; beforeAction: () => Promise<void>; precheck: PrecheckResult; hasUnsaved: boolean }) {
  const a = bundle.article;
  return (
    <div className="space-y-5 text-[13px]">
      <StateMachine status={a.status} />
      {precheck.blocking > 0 && ["draft", "revision_required"].includes(a.status) && (
        <p className="border-l-2 border-st-revision bg-st-revision/5 px-3 py-2 text-xs text-st-revision">公開前チェックの阻害項目（{precheck.blocking}件）を解消すると承認申請できます。</p>
      )}
      {hasUnsaved && <p className="text-2xs text-slate">未保存の変更は操作前に自動保存されます。</p>}
      <WorkflowActions articleId={a.id} status={a.status} role={ctx.role} beforeAction={beforeAction} />
      <div>
        <p className="mb-2 text-xs font-medium">承認記録</p>
        {bundle.approvals.length === 0 ? <p className="text-xs text-slate">まだ承認記録はありません</p> : (
          <ul className="divide-y divide-line border-y border-line" data-testid="approval-records">
            {bundle.approvals.map((ap) => (
              <li key={ap.id} className="py-2 text-xs">
                <p><span className={cn("font-medium", ap.decision === "approved" ? "text-st-approved" : "text-st-revision")}>{ap.decision === "approved" ? "承認" : "差し戻し"}</span> · v{ap.version_no} · {ap.approver}</p>
                <p className="font-num text-[11px] text-slate tnum">{fmtDate(ap.created_at, { time: true })}</p>
                {ap.comment && <p className="mt-0.5 text-ink-3">「{ap.comment}」</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
