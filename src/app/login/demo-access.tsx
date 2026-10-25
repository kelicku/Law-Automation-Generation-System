"use client";
import { ArrowRight, Check, ChevronDown, History, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

export interface DemoPersona {
  key: string;
  name: string;
  firm: string;
  role: string;
  capability: string;
  mark: string;
  color: string;
  email?: string;
  password?: string;
}

/**
 * Click-only demo entry:
 *  1. resume your own demo firm  /  create one (one-click registration)
 *  2. or use a shared fictional account
 * The access code field only appears when the visitor has neither an invitation cookie nor a code.
 */
export function DemoAccess({
  personas, needsCode, resumeFirm, invite,
}: {
  personas: DemoPersona[];
  needsCode: boolean;
  resumeFirm: string | null;
  invite: "ok" | "invalid" | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showShared, setShowShared] = useState(false);
  const locked = needsCode && code.trim().length === 0;

  const go = async (key: string, url: string, body: Record<string, unknown>) => {
    if (locked) {
      setError("招待リンクを開くか、デモアクセスコードを入力してください。");
      return;
    }
    setBusy(key);
    setError(null);
    try {
      const r = await api<{ redirect: string }>(url, { body: { ...body, code: code.trim() || undefined } });
      try {
        if (r.redirect.includes("journey=1")) window.localStorage.removeItem("aiip.journey.v1");
      } catch {
        /* storage unavailable */
      }
      router.push(r.redirect);
      router.refresh();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "開始できませんでした");
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="quick-heading">
      <h2 id="quick-heading" className="sr-only">すぐに始める</h2>

      {invite === "ok" && (
        <p className="mb-4 flex items-center gap-2 border-l-2 border-st-approved bg-st-approved/[0.06] px-3 py-2 text-[13px] text-st-approved" data-testid="invite-ok">
          <Check className="size-4 shrink-0" aria-hidden />招待を確認しました。ボタンを押すだけで始められます。
        </p>
      )}
      {invite === "invalid" && (
        <p role="alert" className="mb-4 border-l-2 border-st-revision bg-st-revision/[0.06] px-3 py-2 text-[13px] text-st-revision">
          招待リンクが無効です。お知らせしたアクセスコードを入力してください。
        </p>
      )}

      {needsCode && (
        <div className="mb-4">
          <label htmlFor="demo-code" className="mb-1.5 block text-[13px] font-medium text-ink-2">デモアクセスコード</label>
          <input
            id="demo-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="招待メールに記載のコード"
            autoComplete="off"
            spellCheck={false}
            className="h-11 w-full rounded-[3px] border border-dashed border-line-strong bg-ivory/60 px-3.5 font-mono text-[14px] tracking-wider text-ink placeholder:font-sans placeholder:tracking-normal placeholder:text-slate/80 focus:border-solid focus:border-navy focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-gold/25"
            data-testid="demo-code"
          />
          <p className="mt-1.5 text-xs text-slate">一度入力すると、このブラウザでは次回から不要です。</p>
        </div>
      )}

      <div className="space-y-2.5">
        {resumeFirm && (
          <PrimaryAction
            testId="quick-resume"
            icon={<History className="size-[18px]" aria-hidden />}
            title="前回の続きから再開"
            sub={`${resumeFirm}（あなた専用のデモ事務所）`}
            busy={busy === "resume"}
            disabled={!!busy}
            onClick={() => go("resume", "/api/auth/quickstart", { mode: "resume" })}
          />
        )}
        <PrimaryAction
          testId="quick-new"
          tone={resumeFirm ? "secondary" : "primary"}
          icon={<Plus className="size-[18px]" aria-hidden />}
          title={resumeFirm ? "新しいデモ事務所で始める" : "自分専用のデモ事務所で始める"}
          sub="入力は不要です。架空の事務所とアカウントを自動で作成します"
          busy={busy === "new"}
          disabled={!!busy}
          onClick={() => go("new", "/api/auth/quickstart", { mode: "new" })}
        />
      </div>

      {error && <p role="alert" className="mt-3 text-[13px] text-st-suspended" data-testid="quick-error">{error}</p>}

      <div className="mt-5">
        <button
          type="button"
          onClick={() => setShowShared((v) => !v)}
          aria-expanded={showShared}
          className="flex w-full items-center justify-between py-1.5 text-[13px] text-ink-2 hover:text-ink"
          data-testid="toggle-shared"
        >
          <span>共有のデモアカウントで入る <span className="text-xs text-slate">（2つの事務所の比較・承認権限の違いを確認）</span></span>
          <ChevronDown className={cn("size-4 transition-transform", showShared && "rotate-180")} aria-hidden />
        </button>
        {showShared && (
          <ul className="mt-2 overflow-hidden rounded-[3px] border border-line bg-white">
            {personas.map((p) => (
              <li key={p.key} className="border-t border-line first:border-t-0">
                <button
                  type="button"
                  onClick={() => go(p.key, "/api/auth/demo", { persona: p.key })}
                  disabled={!!busy}
                  aria-label={`${p.name}（${p.firm}・${p.role}）としてログイン`}
                  className="group relative flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-ivory/70 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-gold/40"
                  data-testid={`demo-login-${p.key}`}
                >
                  <span className="absolute inset-y-0 left-0 w-[3px] scale-y-0 transition-transform group-hover:scale-y-100" style={{ background: p.color }} aria-hidden />
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[3px] font-serif text-[15px] text-white" style={{ background: p.color }} aria-hidden>{p.mark}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-[14px] font-medium text-ink">{p.name}</span>
                      <span className="truncate text-xs text-ink-3">{p.role}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate">{p.firm} · {p.capability}</span>
                    {p.email && <span className="mt-0.5 block truncate font-mono text-[11px] text-slate">{p.email} / {p.password}</span>}
                  </span>
                  {busy === p.key ? <Loader2 className="size-4 shrink-0 animate-spin text-navy" aria-hidden /> : <ArrowRight className="size-4 shrink-0 text-slate transition-all group-hover:translate-x-0.5 group-hover:text-navy" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function PrimaryAction({
  title, sub, icon, onClick, busy, disabled, tone = "primary", testId,
}: {
  title: string;
  sub: string;
  icon: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  tone?: "primary" | "secondary";
  testId: string;
}) {
  const primary = tone === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        "group relative flex w-full items-center gap-4 overflow-hidden rounded-[3px] px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-gold/50 disabled:opacity-70",
        primary
          ? "bg-navy text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_2px_rgba(16,28,48,0.25)] hover:bg-navy-2"
          : "border border-line-strong bg-white text-ink hover:border-navy/40 hover:bg-ivory/60",
      )}
    >
      {primary && <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" aria-hidden />}
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", primary ? "bg-white/10 text-gold" : "bg-ivory-2 text-navy")}>
        {busy ? <Loader2 className="size-[18px] animate-spin" aria-hidden /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className={cn("mt-0.5 block text-xs", primary ? "text-white/70" : "text-slate")}>{sub}</span>
      </span>
      <ArrowRight className={cn("size-4 shrink-0 transition-transform group-hover:translate-x-0.5", primary ? "text-gold" : "text-slate")} aria-hidden />
    </button>
  );
}
