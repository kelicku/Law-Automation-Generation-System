"use client";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, ClientApiError, journey } from "@/lib/client/api";
import { waitForJob } from "@/lib/client/jobs";
import { cn } from "@/lib/utils";

const PHASES = ["出典本文を読み込み（信頼できない入力として隔離）", "AIが構造化JSONで記事を生成", "スキーマ検証・出典IDの照合", "下書きとバージョンを保存"];

export function GenerateButton({ incidentId, label = "AIで記事を生成", disabled }: { incidentId: string; label?: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = setInterval(() => setPhase((p) => Math.min(p + 1, PHASES.length - 2)), 450);
    const e = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => {
      clearInterval(t);
      clearInterval(e);
    };
  }, [busy]);

  const run = async () => {
    setBusy(true);
    setPhase(0);
    setElapsed(0);
    setError(null);
    try {
      let r = await api<{ articleId?: string; provider?: string; jobId?: string }>("/api/articles/generate", { body: { incidentId }, idempotent: true });
      if (r.jobId) r = (await waitForJob<{ articleId: string; provider: string }>(r.jobId)).result;
      setPhase(PHASES.length - 1);
      journey("article_generated");
      toast.success(r.provider === "simulation" ? "記事を生成しました（AIシミュレーション）" : "記事を生成しました");
      router.push(`/app/articles/${r.articleId}?generated=1`);
    } catch (e) {
      const err = e instanceof ClientApiError ? e : null;
      setError({ message: err?.message ?? "生成に失敗しました", retryable: !["AI_LIMIT", "FORBIDDEN"].includes(err?.code ?? "") });
      setBusy(false);
    }
  };

  return (
    <div>
      <Button onClick={run} loading={busy} disabled={disabled} variant="primary" data-testid="generate-article">
        {!busy && <Sparkles />} {label}
      </Button>
      <AnimatePresence>
        {busy && (
          <motion.ol initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 space-y-1.5 text-xs" aria-live="polite">
            {PHASES.map((p, i) => (
              <li key={p} className={cn("flex items-center gap-2", i > phase ? "text-slate" : "text-ink-2")}>
                {i < phase ? <Check className="size-3.5 text-st-approved" /> : i === phase ? <Loader2 className="size-3.5 animate-spin text-gold-deep" /> : <span className="size-3.5" />}
                {p}
              </li>
            ))}
            {elapsed >= 3 && <li className="pl-5 font-num text-2xs text-slate tnum">経過 {elapsed}秒（実AIでは30秒〜1分ほどかかります）</li>}
          </motion.ol>
        )}
      </AnimatePresence>
      {error && (
        <div role="alert" className="mt-3 max-w-md border-l-2 border-st-suspended bg-st-suspended/5 px-3 py-2 text-xs text-st-suspended" data-testid="ai-error">
          {error.message}
          {error.retryable && <button className="ml-2 font-medium underline" onClick={run}>再試行</button>}
        </div>
      )}
    </div>
  );
}
