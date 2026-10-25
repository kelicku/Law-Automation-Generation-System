import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { AiModeBadge, Pill } from "@/components/ui/badges";
import { estimateCost } from "@/lib/ai/anthropic";
import { PROMPTS, type AiTask } from "@/lib/ai/prompts";
import { aiMode } from "@/lib/ai/run";
import { requireViewer } from "@/lib/auth/session";
import { inspectorLogs } from "@/lib/server/queries";
import { cn, fmtDate } from "@/lib/utils";

export const metadata = { title: "AI Processing Inspector" };

const STATUS: Record<string, { label: string; cls: string }> = {
  succeeded: { label: "成功", cls: "text-st-approved" },
  failed: { label: "失敗", cls: "text-st-suspended" },
  invalid_output: { label: "出力不正", cls: "text-st-suspended" },
  rejected_limit: { label: "上限で拒否", cls: "text-st-revision" },
  running: { label: "実行中", cls: "text-st-review" },
};

export default async function InspectorPage({ searchParams }: { searchParams: Promise<{ log?: string }> }) {
  const viewer = await requireViewer();
  const { log } = await searchParams;
  const logs = await inspectorLogs(viewer, 100);
  const sel = logs.find((l) => l.id === log) ?? logs[0];
  const ok = logs.filter((l) => l.status === "succeeded");
  const avg = ok.length ? ok.reduce((n, l) => n + (l.duration_ms ?? 0), 0) / ok.length : 0;
  const tokens = logs.reduce((n, l) => n + l.input_tokens + l.output_tokens, 0);
  const cost = logs.reduce((n, l) => n + Number(l.cost_usd), 0);
  const mode = aiMode();
  const prompt = sel ? PROMPTS[sel.task as AiTask] : null;
  const selInput = (sel?.input_summary ?? {}) as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="AI Processing Inspector"
        title="AIが何を受け取り、何を返したか"
        description="AI処理ごとの入力（要約）、使用モデル、プロンプトのバージョン、処理時間、トークン数、概算コスト、エラーを記録しています。APIキーや秘密情報は記録せず、エラーメッセージは保存前に機密情報を除去しています。"
        actions={<AiModeBadge provider={mode.provider} model={mode.model} />}
      />
      <div className="mb-6 grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
        {[
          ["表示中の処理", `${logs.length}件`],
          ["成功率", logs.length ? `${Math.round((ok.length / logs.length) * 100)}%` : "—"],
          ["平均処理時間（成功）", `${(avg / 1000).toFixed(2)}秒`],
          ["トークン / 実費", `${tokens.toLocaleString()} / $${cost.toFixed(4)}`],
        ].map(([k, v]) => (
          <div key={k} className="bg-[#FBFAF7] px-4 py-3"><p className="text-2xs text-slate">{k}</p><p className="mt-1 font-num text-lg font-semibold tnum">{v}</p></div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-0 border border-line bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ol className="max-h-[75vh] divide-y divide-line overflow-y-auto border-b border-line lg:border-b-0 lg:border-r" data-testid="ai-logs">
          {logs.map((l) => (
            <li key={l.id}>
              <Link href={`/app/inspector?log=${l.id}`} scroll={false} className={cn("flex items-center gap-3 px-4 py-2.5 hover:bg-ivory/60", sel?.id === l.id && "bg-gold-soft/30")} data-status={l.status}>
                <span className={cn("w-16 shrink-0 text-xs font-medium", STATUS[l.status]?.cls)}>{STATUS[l.status]?.label ?? l.status}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{PROMPTS[l.task as AiTask]?.label ?? l.task}</span>
                  <span className="block truncate text-2xs text-slate">{l.tenant ?? "—"} · {l.actor ?? "システム"} · {l.provider === "simulation" ? "シミュレーション" : l.model}</span>
                </span>
                <span className="shrink-0 text-right font-num text-[11px] text-slate tnum">{fmtDate(l.created_at, { time: true, year: false })}<br />{l.duration_ms ? `${(l.duration_ms / 1000).toFixed(2)}s` : "—"}</span>
              </Link>
            </li>
          ))}
        </ol>
        {sel ? (
          <div className="min-w-0 space-y-5 px-5 py-5 text-[13px]" data-testid="ai-log-detail">
            <div className="flex flex-wrap items-center gap-2">
              <p className="h-serif text-lg font-semibold">{prompt?.label ?? sel.task}</p>
              <span className={cn("text-xs font-medium", STATUS[sel.status]?.cls)}>{STATUS[sel.status]?.label}</span>
              <AiModeBadge provider={sel.provider} model={sel.model} className="ml-auto" />
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
              {[
                ["使用モデル", sel.model],
                ["プロンプト", `${sel.prompt_id} @ ${sel.prompt_version}`],
                ["処理時間", sel.duration_ms ? `${sel.duration_ms.toLocaleString()} ms` : "—"],
                ["入力トークン", `${sel.input_tokens.toLocaleString()}${selInput.token_counts === "estimated" ? "（推定）" : ""}`],
                ["出力トークン", `${sel.output_tokens.toLocaleString()}${selInput.token_counts === "estimated" ? "（推定）" : ""}`],
                ["概算コスト", sel.provider === "simulation" ? `$0（課金なし）／実API換算 約$${(Number(selInput.estimated_cost_if_live_usd ?? estimateCost(mode.model, sel.input_tokens, sel.output_tokens))).toFixed(4)}` : `$${Number(sel.cost_usd).toFixed(5)}`],
                ["ジョブキー", sel.job_key],
                ["実行日時", fmtDate(sel.created_at, { time: true })],
                ["実行者", sel.actor ?? "システム（自動処理）"],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0"><dt className="text-2xs text-slate">{k}</dt><dd className="break-all font-num">{v}</dd></div>
              ))}
            </dl>
            {sel.error_code && (
              <div className="border-l-2 border-st-suspended bg-st-suspended/5 px-3 py-2 text-xs text-st-suspended" data-testid="ai-log-error">
                <p className="font-medium">{sel.error_code}</p><p className="mt-0.5">{sel.error_message}</p>
              </div>
            )}
            <div>
              <p className="mb-1.5 text-xs font-medium">入力（要約・機密情報なし）</p>
              <pre className="max-h-48 overflow-auto bg-ivory-2 p-3 font-mono text-[11px] leading-relaxed">{JSON.stringify(sel.input_summary, null, 2)}</pre>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium">出力（スキーマ検証済み）</p>
              <pre className="max-h-64 overflow-auto bg-navy p-3 font-mono text-[11px] leading-relaxed text-white/80">{sel.output ? JSON.stringify(sel.output, null, 2).slice(0, 6000) : "（出力なし）"}</pre>
            </div>
            {prompt && (
              <details className="border-t border-line pt-3">
                <summary className="cursor-pointer text-xs font-medium">システムプロンプト（{prompt.version}）</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap bg-ivory-2 p-3 text-[11px] leading-relaxed">{prompt.system}</pre>
              </details>
            )}
            <p className="flex items-start gap-1.5 text-2xs text-slate"><ShieldCheck className="mt-0.5 size-3 shrink-0" />外部情報源の本文は &lt;untrusted_source&gt; で隔離してAIに渡し、本文中の命令には従わないよう指示しています。出力はZodスキーマで再検証し、不正な形式は破棄します。</p>
          </div>
        ) : <p className="p-8 text-sm text-slate">記録はまだありません</p>}
      </div>
      <p className="mt-3 text-2xs text-slate"><Pill>シミュレーション</Pill> の行は、APIキー未設定時の決定的な処理です。トークン数は文字数からの推定値です。</p>
    </div>
  );
}
