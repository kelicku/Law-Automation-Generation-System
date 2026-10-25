"use client";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, CircleSlash, Copy, Loader2, Radar, ShieldAlert, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AiModeBadge, Pill } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { STEP_LABEL, type CollectEvent, type CollectStats, type CollectStep } from "@/lib/collector/events";
import { waitForJob } from "@/lib/client/jobs";
import { cn } from "@/lib/utils";

type StepState = "idle" | "running" | "done" | "failed";
const STEPS = Object.keys(STEP_LABEL) as CollectStep[];

interface SourceResult { name: string; url: string; ok: boolean; items: number; error?: string; durationMs: number }
interface ItemResult { title: string; outcome: string; detail: string; category?: string; flagged?: boolean }

const OUTCOME: Record<string, { label: string; tone: "gold" | "warn" | "neutral" | "info" | "danger" }> = {
  new_incident: { label: "新規事件", tone: "gold" },
  update: { label: "重要な続報", tone: "warn" },
  related: { label: "関連報道", tone: "info" },
  duplicate: { label: "重複除外", tone: "neutral" },
  skipped: { label: "対象外", tone: "neutral" },
};

export function CollectPanel({ canRun }: { canRun: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<Record<CollectStep, { state: StepState; detail?: string }>>(() => Object.fromEntries(STEPS.map((s) => [s, { state: "idle" }])) as never);
  const [sources, setSources] = useState<SourceResult[]>([]);
  const [items, setItems] = useState<ItemResult[]>([]);
  const [stats, setStats] = useState<CollectStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const run = async () => {
    setRunning(true);
    setOpen(true);
    setError(null);
    setStats(null);
    setSources([]);
    setItems([]);
    setSteps(Object.fromEntries(STEPS.map((s) => [s, { state: "idle" }])) as never);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/collect", { method: "POST", headers: { "content-type": "application/json" }, signal: abort.current.signal });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
      }
      let finished = false;
      const track = (e: CollectEvent) => {
        if (e.type === "done" || e.type === "error") finished = true;
        handle(e);
      };
      if ((res.headers.get("content-type") ?? "").includes("application/json")) {
        // serverless: the pipeline runs as a background job; replay its events as they arrive
        const { jobId } = (await res.json()) as { jobId: string };
        await waitForJob(jobId, { onEvents: (evs) => (evs as CollectEvent[]).forEach(track), intervalMs: 900 }).catch((e) => {
          if (!finished) throw e;
        });
        if (!finished) throw new Error("収集処理の結果を受け取れませんでした。再試行してください。");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) track(JSON.parse(line) as CollectEvent);
      }
      if (!finished) throw new Error("通信が途中で終了しました。再試行してください。");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "情報収集に失敗しました";
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
      router.refresh();
    }
  };

  const handle = (e: CollectEvent) => {
    switch (e.type) {
      case "start":
        setProvider(e.aiProvider);
        break;
      case "step":
        setSteps((s) => ({ ...s, [e.step]: { state: e.status, detail: e.detail } }));
        break;
      case "source":
        setSources((s) => [...s, e]);
        break;
      case "item":
        setItems((s) => [...s, e]);
        break;
      case "done":
        setStats(e.stats);
        toast.success(`収集が完了しました：新規 ${e.stats.newIncidents}件・続報 ${e.stats.updates}件`);
        break;
      case "error":
        setError(e.message);
        setSteps((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.state === "running" ? { ...v, state: "failed" } : v])) as never);
        break;
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={run} loading={running} disabled={!canRun} data-testid="collect">
          {!running && <Radar />} {running ? "収集中…" : "情報を収集する"}
        </Button>
        {!running && open && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}><X /> 閉じる</Button>
        )}
      </div>
      <AnimatePresence>
        {open && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-5 overflow-hidden border border-navy/10 bg-navy text-white"
            aria-live="polite"
            data-testid="collect-panel"
          >
            <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-3">
              <p className="eyebrow !text-gold/80">Collection Pipeline</p>
              {provider && <AiModeBadge provider={provider} />}
              <Pill tone="dark">デモ用収集：架空の公表文・報道を取得</Pill>
              {stats && <Pill tone="gold" className="ml-auto">完了</Pill>}
            </div>
            {/* pipeline */}
            <ol className="grid grid-cols-1 gap-px bg-white/10 sm:grid-cols-5">
              {STEPS.map((s, i) => {
                const st = steps[s];
                return (
                  <li key={s} className="relative bg-navy px-4 py-4" data-testid={`step-${s}`} data-state={st.state}>
                    {st.state === "running" && <span className="absolute inset-x-0 top-0 h-0.5 overflow-hidden"><span className="block h-full w-1/2 animate-scan bg-gold" /></span>}
                    {st.state === "done" && <motion.span layoutId={undefined} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} className="absolute inset-x-0 top-0 h-0.5 origin-left bg-st-approved" />}
                    <div className="flex items-center gap-2">
                      <span className={cn("flex size-6 items-center justify-center rounded-full border font-num text-[11px]",
                        st.state === "done" ? "border-st-approved bg-st-approved text-white" : st.state === "running" ? "border-gold text-gold" : st.state === "failed" ? "border-st-suspended bg-st-suspended text-white" : "border-white/20 text-white/60")}>
                        {st.state === "done" ? <Check className="size-3.5" /> : st.state === "running" ? <Loader2 className="size-3.5 animate-spin" /> : st.state === "failed" ? <X className="size-3.5" /> : i + 1}
                      </span>
                      <span className="text-sm font-medium">{STEP_LABEL[s].ja}</span>
                      <span className="font-num text-[10px] uppercase tracking-widest text-white/60">{STEP_LABEL[s].en}</span>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-white/55">{st.detail ?? STEP_LABEL[s].detail}</p>
                  </li>
                );
              })}
            </ol>
            <div className="grid grid-cols-1 gap-px bg-white/10 lg:grid-cols-2">
              <div className="bg-navy px-5 py-4">
                <p className="mb-2 text-xs text-white/60">情報源ごとの取得結果</p>
                <ul className="space-y-1.5" data-testid="source-results">
                  {sources.length === 0 && <li className="text-xs text-white/60">待機中…</li>}
                  {sources.map((s, i) => (
                    <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-2 text-xs">
                      {s.ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-st-approved" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[#E3A04B]" />}
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate", s.ok ? "text-white/80" : "text-[#E3A04B]")}>{s.name}</span>
                        {!s.ok && <span className="block text-[11px] text-white/50" data-testid="source-error">{s.error}</span>}
                      </span>
                      <span className="font-num text-[10px] text-white/60 tnum">{(s.durationMs / 1000).toFixed(1)}s</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
              <div className="bg-navy px-5 py-4">
                <p className="mb-2 text-xs text-white/60">判定結果</p>
                <ul className="max-h-64 space-y-2 overflow-y-auto pr-1" data-testid="item-results">
                  {items.length === 0 && <li className="text-xs text-white/60">待機中…</li>}
                  {items.map((it, i) => (
                    <motion.li key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-xs">
                      <div className="flex items-center gap-2">
                        <Pill tone={OUTCOME[it.outcome]?.tone === "neutral" ? "dark" : OUTCOME[it.outcome]?.tone ?? "dark"}>
                          {it.outcome === "duplicate" ? <Copy className="size-3" /> : it.outcome === "new_incident" ? <Sparkles className="size-3" /> : it.outcome === "skipped" ? <CircleSlash className="size-3" /> : null}
                          {OUTCOME[it.outcome]?.label}
                        </Pill>
                        <span className="min-w-0 flex-1 truncate text-white/85">{it.title}</span>
                        {it.flagged && <ShieldAlert className="size-3.5 shrink-0 text-[#E3A04B]" aria-label="命令文を検出" />}
                      </div>
                      <p className="mt-0.5 pl-1 text-[11px] text-white/60">{it.detail}</p>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </div>
            {(stats || error) && (
              <div className="border-t border-white/10 px-5 py-3 text-xs">
                {error ? (
                  <p className="text-[#E3A04B]" role="alert">{error} <button className="ml-2 underline" onClick={run}>再試行</button></p>
                ) : stats && (
                  <p className="text-white/70" data-testid="collect-summary">
                    取得 {stats.fetched}件 · 新規出典 {stats.newSources}件 · 重複除外 {stats.duplicates}件 · <b className="text-gold">新規事件 {stats.newIncidents}件</b> · 続報/関連 {stats.updates}件 · 重要な変更 {stats.materialChanges}件 · 更新案 {stats.proposals}件 · 取得失敗 {stats.failedSources}件
                    {stats.injectionFlags > 0 && <> · <span className="text-[#E3A04B]">不審な命令文 {stats.injectionFlags}件（実行せず無害化）</span></>}
                  </p>
                )}
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
