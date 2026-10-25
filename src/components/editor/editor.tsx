"use client";
import { AlertTriangle, CheckCircle2, Eye, FileSearch, GitCompareArrows, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { api, ClientApiError, journey } from "@/lib/client/api";
import type { ArticleContent } from "@/lib/domain/article";
import type { PrecheckResult } from "@/lib/domain/precheck";
import { cn, fmtDate } from "@/lib/utils";
import { CenterPane } from "./center";
import { LeftPane } from "./left";
import { RightPane } from "./right";
import type { EditorBundle, EditorContext } from "./types";

type SaveState = { kind: "saved"; at: string } | { kind: "dirty" } | { kind: "saving" } | { kind: "error"; message: string } | { kind: "conflict" };

const EDITABLE = ["draft", "revision_required"];

export function ArticleEditor({ bundle, ctx }: { bundle: EditorBundle; ctx: EditorContext }) {
  const router = useRouter();
  const params = useSearchParams();
  const a = bundle.article;
  const editable = EDITABLE.includes(a.status) && ctx.role !== "viewer";
  const [content, setContent] = useState<ArticleContent>(a.working);
  const [precheck, setPrecheck] = useState<PrecheckResult>(bundle.precheck);
  const [save, setSave] = useState<SaveState>({ kind: "saved", at: a.working_updated_at });
  const [flash, setFlash] = useState<Set<string>>(() => new Set(params.get("generated") ? a.working.blocks.map((b) => b.id) : []));
  const hashRef = useRef(a.working_hash);
  const latest = useRef(content);
  const inflight = useRef(false);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userEdited = useRef(false);
  const history = useRef<ArticleContent[]>([]);

  // server data changed (refresh after transition / regeneration) → resync
  useEffect(() => {
    setContent(a.working);
    latest.current = a.working;
    hashRef.current = a.working_hash;
    setPrecheck(bundle.precheck);
    setSave({ kind: "saved", at: a.working_updated_at });
  }, [a.working_hash, a.working, a.working_updated_at, bundle.precheck]);

  useEffect(() => {
    if (!flash.size) return;
    const t = setTimeout(() => setFlash(new Set()), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const flush = useCallback(async () => {
    if (inflight.current) {
      pending.current = true;
      return;
    }
    inflight.current = true;
    setSave({ kind: "saving" });
    try {
      const r = await api<{ hash: string; savedAt: string; precheck: PrecheckResult }>(`/api/articles/${a.id}`, {
        method: "PATCH",
        body: { content: latest.current, baseHash: hashRef.current },
      });
      hashRef.current = r.hash;
      setPrecheck(r.precheck);
      setSave({ kind: "saved", at: r.savedAt });
      if (userEdited.current) journey("article_edited");
    } catch (e) {
      if (e instanceof ClientApiError && e.code === "EDIT_CONFLICT") setSave({ kind: "conflict" });
      else setSave({ kind: "error", message: e instanceof ClientApiError ? e.message : "保存に失敗しました" });
      pending.current = false;
    } finally {
      inflight.current = false;
      if (pending.current) {
        pending.current = false;
        void flush();
      }
    }
  }, [a.id]);

  const update = useCallback((next: ArticleContent, opts: { flashIds?: string[] } = {}) => {
    history.current = [...history.current.slice(-30), latest.current];
    latest.current = next;
    userEdited.current = true;
    setContent(next);
    if (opts.flashIds?.length) setFlash(new Set(opts.flashIds));
    setSave({ kind: "dirty" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1200);
  }, [flush]);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    latest.current = prev;
    setContent(prev);
    setSave({ kind: "dirty" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  }, [flush]);

  // warn before leaving with unsaved changes
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (save.kind === "dirty" || save.kind === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save.kind]);

  const saveVersion = async () => {
    if (timer.current) clearTimeout(timer.current);
    await flush();
    try {
      const v = await api<{ versionNo: number }>(`/api/articles/${a.id}/versions`, { body: { note: "下書き保存" } });
      toast.success(`下書きを v${v.versionNo} として保存しました`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "保存できませんでした");
    }
  };

  const before = async () => {
    if (timer.current) clearTimeout(timer.current);
    if (save.kind === "dirty") await flush();
  };

  const publishedVersion = bundle.page?.version_no;
  const latestVersion = bundle.versions[0]?.version_no;

  return (
    <div className="-mx-4 -mt-6 sm:-mx-6 lg:-mx-8">
      {/* editor header */}
      <div className="border-b border-line bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/app/articles" className="text-xs text-slate hover:text-ink">← 記事一覧</Link>
          <StatusBadge status={a.status} />
          <span className="font-num text-xs text-slate tnum">
            編集中 v{latestVersion ?? 1}{publishedVersion ? ` · 公開版 v${publishedVersion}${bundle.page?.status === "suspended" ? "（停止中）" : ""}` : " · 未公開"}
          </span>
          <SaveIndicator state={save} onRetry={() => void flush()} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link href={`/app/articles/${a.id}/evidence`} data-testid="open-evidence"><FileSearch /> 出典確認</Link></Button>
            {(bundle.page || a.pending_update) && (
              <Button asChild variant="ghost" size="sm"><Link href={`/app/articles/${a.id}/diff`}><GitCompareArrows /> 差分</Link></Button>
            )}
            <Button asChild variant="ghost" size="sm"><Link href={`/app/articles/${a.id}/preview`} data-testid="open-preview"><Eye /> プレビュー</Link></Button>
            {editable && <Button variant="outline" size="sm" onClick={saveVersion} data-testid="save-version"><Save /> 下書き保存</Button>}
          </div>
        </div>
      </div>

      {a.pending_update && (
        <div className="flex flex-wrap items-center gap-3 border-b border-st-revision/20 bg-st-revision/5 px-4 py-2.5 text-xs text-st-revision sm:px-6 lg:px-8">
          <AlertTriangle className="size-4" />
          <span>重要な続報：{a.pending_update.label} {a.pending_update.before} → <b>{a.pending_update.after}</b>。公開中のページは承認済みの版のまま維持されています。</span>
          <Link href={`/app/articles/${a.id}/diff`} className="font-medium underline">差分を確認</Link>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[290px_minmax(0,1fr)_350px]">
        <div className="order-2 border-t border-line xl:order-1 xl:border-r xl:border-t-0">
          <LeftPane bundle={bundle} editable={editable} />
        </div>
        <div className="order-1 min-w-0 xl:order-2">
          <CenterPane
            content={content}
            onChange={update}
            onUndo={undo}
            canUndo={history.current.length > 0}
            editable={editable}
            precheck={precheck}
            flash={flash}
            sources={bundle.sources}
            articleId={a.id}
            status={a.status}
            role={ctx.role}
            beforeAction={before}
          />
        </div>
        <div className="order-3 border-t border-line xl:border-l xl:border-t-0">
          <RightPane
            bundle={bundle}
            ctx={ctx}
            content={content}
            precheck={precheck}
            setPrecheck={setPrecheck}
            editable={editable}
            onChange={update}
            beforeAction={before}
            hasUnsaved={save.kind !== "saved"}
          />
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", state.kind === "error" || state.kind === "conflict" ? "text-st-suspended" : "text-slate")} aria-live="polite" data-testid="save-state" data-state={state.kind}>
      {state.kind === "saved" && <><CheckCircle2 className="size-3.5 text-st-approved" /> 自動保存済み {fmtDate(state.at, { time: true, year: false })}</>}
      {state.kind === "dirty" && <>未保存の変更</>}
      {state.kind === "saving" && <><Loader2 className="size-3.5 animate-spin" /> 保存中…</>}
      {state.kind === "error" && <>{state.message} <button className="underline" onClick={onRetry}>再試行</button></>}
      {state.kind === "conflict" && <>他の画面で更新されています。<button className="underline" onClick={() => window.location.reload()}>再読み込み</button></>}
    </span>
  );
}
