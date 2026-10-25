"use client";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Compass, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { JourneyEvent } from "@/lib/client/api";
import { cn } from "@/lib/utils";

export interface JourneyTargets {
  incidentId: string | null;
  articleId: string | null;
  siteHref: string;
}

interface StepDef {
  key: JourneyEvent;
  title: string;
  hint: string;
  href: (t: JourneyTargets) => string | null;
}

const STEPS: StepDef[] = [
  { key: "incident_viewed", title: "事件情報を確認する", hint: "Radarに収集された「東雲モビリティ（架空）」の事件詳細を開きます。", href: (t) => (t.incidentId ? `/app/incidents/${t.incidentId}` : "/app/radar") },
  { key: "sources_viewed", title: "出典を確認する", hint: "事件詳細の「出典」から、取得した公表文の本文を開いて確認します。", href: (t) => (t.incidentId ? `/app/incidents/${t.incidentId}#sources` : null) },
  { key: "article_generated", title: "AIで記事を生成する", hint: "「AIで記事を生成」を押します。出典にない事実は補完されません。", href: (t) => (t.incidentId ? `/app/incidents/${t.incidentId}` : null) },
  { key: "article_edited", title: "記事を編集する", hint: "エディタ中央で本文を1か所編集します。数秒で自動保存されます。", href: (t) => (t.articleId ? `/app/articles/${t.articleId}` : null) },
  { key: "precheck_run", title: "公開前チェックを実行する", hint: "右ペインの「公開前チェック」で広告表現・出典・SEOを確認します。", href: (t) => (t.articleId ? `/app/articles/${t.articleId}` : null) },
  { key: "article_approved", title: "記事を承認する", hint: "「承認申請」→「承認」の順に操作します。承認者・日時・版が記録されます。", href: (t) => (t.articleId ? `/app/articles/${t.articleId}` : null) },
  { key: "site_viewed", title: "公開サイトを確認する", hint: "公開後、Publication Simulator で法律事務所サイトの表示を確認します。", href: (t) => (t.articleId ? `/app/articles/${t.articleId}/preview` : t.siteHref) },
];

const KEY = "aiip.journey.v1";

interface State {
  open: boolean;
  active: boolean;
  done: JourneyEvent[];
  articleId: string | null;
}

const Ctx = createContext<{ start: () => void; active: boolean } | null>(null);

export function useJourney() {
  return useContext(Ctx);
}

function load(): State {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* storage unavailable: run without persistence */
  }
  return { open: false, active: false, done: [], articleId: null };
}

export function JourneyProvider({ targets, autoStart, children }: { targets: JourneyTargets; autoStart: boolean; children: React.ReactNode }) {
  const [state, setState] = useState<State>({ open: false, active: false, done: [], articleId: null });
  const [ready, setReady] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const s = load();
    // a child (JourneyAutoStart) may already have started the journey before this effect runs
    setState((prev) => (prev.active ? prev : autoStart && !s.active ? { open: false, active: true, done: [], articleId: null } : s));
    setReady(true);
  }, [autoStart]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, ready]);

  const complete = useCallback((ev: JourneyEvent, articleId?: string | null) => {
    setState((s) => (!s.active || s.done.includes(ev) ? (articleId && !s.articleId ? { ...s, articleId } : s) : { ...s, done: [...s.done, ev], articleId: articleId ?? s.articleId }));
  }, []);

  useEffect(() => {
    const onEv = (e: Event) => {
      const detail = (e as CustomEvent<JourneyEvent>).detail;
      const m = /\/app\/articles\/([0-9a-f-]{36})/.exec(window.location.pathname);
      complete(detail, m?.[1] ?? null);
    };
    window.addEventListener("aiip:journey", onEv);
    return () => window.removeEventListener("aiip:journey", onEv);
  }, [complete]);

  // route-based completion
  useEffect(() => {
    if (targets.incidentId && pathname === `/app/incidents/${targets.incidentId}`) complete("incident_viewed");
    const m = /^\/app\/articles\/([0-9a-f-]{36})\/preview/.exec(pathname);
    if (m && state.done.includes("article_approved")) complete("site_viewed", m[1]);
  }, [pathname, targets.incidentId, complete, state.done]);

  const t: JourneyTargets = { ...targets, articleId: state.articleId ?? targets.articleId };
  const current = STEPS.find((s) => !state.done.includes(s.key));
  const finished = !current;
  const value = useMemo(() => ({ start: () => setState({ open: false, active: true, done: [], articleId: null }), active: state.active }), [state.active]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>
        {ready && state.active && (
          <motion.aside
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25 }}
            aria-label="デモガイド"
            className="fixed bottom-4 right-4 z-40 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[4px] border border-navy-3 bg-navy text-white shadow-frame"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <Compass className="size-4 text-gold" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="eyebrow !text-gold/80">One-Click Demo Journey</p>
                <p className="text-sm font-medium">
                  {finished ? "すべての手順を体験しました" : `手順 ${state.done.length + 1} / ${STEPS.length}`}
                  {!finished && !state.open && current && <span className="ml-2 font-normal text-white/80">{current.title}</span>}
                </p>
                {!finished && !state.open && current && (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-white/55">
                    {current.hint}
                    {current.href(t) && <Link href={current.href(t)!} className="ml-1.5 font-medium text-gold hover:underline">この画面へ移動 →</Link>}
                  </p>
                )}
              </div>
              <button className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => setState((s) => ({ ...s, open: !s.open }))} aria-label={state.open ? "ガイドを折りたたむ" : "ガイドを開く"} aria-expanded={state.open}>
                <ChevronDown className={cn("size-4 transition-transform", !state.open && "rotate-180")} />
              </button>
              <button className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => setState((s) => ({ ...s, active: false }))} aria-label="ガイドを終了">
                <X className="size-4" />
              </button>
            </div>
            <div className="h-0.5 bg-white/10">
              <motion.div className="h-full bg-gold" animate={{ width: `${(state.done.length / STEPS.length) * 100}%` }} transition={{ duration: 0.5 }} />
            </div>
            {state.open && (
              <ol className="max-h-[50vh] overflow-y-auto px-2 py-2">
                {STEPS.map((s, i) => {
                  const done = state.done.includes(s.key);
                  const isCurrent = current?.key === s.key;
                  const href = s.href(t);
                  return (
                    <li key={s.key} className={cn("rounded-[3px] px-2 py-2", isCurrent && "bg-white/[0.06]")}>
                      <div className="flex items-start gap-3">
                        <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-2xs font-num", done ? "border-gold bg-gold text-navy" : isCurrent ? "border-gold text-gold" : "border-white/20 text-white/60")}>
                          {done ? <Check className="size-3" /> : i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-[13px]", done ? "text-white/50 line-through decoration-white/30" : "text-white")}>{s.title}</p>
                          {isCurrent && (
                            <>
                              <p className="mt-1 text-xs leading-relaxed text-white/60">{s.hint}</p>
                              {href && (
                                <Link href={href} className="mt-2 inline-flex text-xs font-medium text-gold hover:underline">この画面へ移動 →</Link>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {finished && state.open && (
              <p className="border-t border-white/10 px-4 py-3 text-xs leading-relaxed text-white/70">
                出典追跡・承認記録・公開版の分離まで一連の流れを確認できました。Smart Diff（続報の差分）や Operations Center もご覧ください。
              </p>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
