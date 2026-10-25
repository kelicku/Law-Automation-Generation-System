import { ArrowRight, FileSearch, GitCompareArrows, ShieldCheck, Workflow } from "lucide-react";
import Link from "next/link";
import { DemoStartButton } from "@/components/landing/demo-login";
import { LandingDashboard } from "@/components/landing/landing-dashboard";
import { SavingsSimulator } from "@/components/ops/savings";
import { Button } from "@/components/ui/button";
import { hasGrantCookie } from "@/lib/auth/demo-access";
import { env } from "@/lib/env";
import { getLandingMetrics } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    no: "01",
    icon: FileSearch,
    title: "Evidence Trace",
    lead: "AIの記述を、一文ずつ出典まで遡れる。",
    body: "事実文ごとに出典の逐語引用を保持し、その引用が出典本文に実在するかを機械的に照合します。根拠のない文は公開前チェックで止まります。",
  },
  {
    no: "02",
    icon: GitCompareArrows,
    title: "Smart Diff",
    lead: "続報で変わった事実だけを、左右比較で。",
    body: "影響人数の確定などの重要な変更を検出すると、更新案を作成して再承認待ちに。公開中のページは承認済みの版のまま維持されます。",
  },
  {
    no: "03",
    icon: ShieldCheck,
    title: "Approval & Publication",
    lead: "公開できるのは、弁護士が承認した版だけ。",
    body: "承認者・日時・対象バージョンを記録。未承認の公開はサーバーとデータベースの両方で拒否し、公開停止・再公開にも対応します。",
  },
  {
    no: "04",
    icon: Workflow,
    title: "Operations",
    lead: "運営の手間とコストを、数字で見える化。",
    body: "事務所ごとのAI利用量・上限、契約期限の通知、処理失敗、実際に実行したバックアップの記録を一つの画面で管理します。",
  },
];

const FLOW = ["収集", "正規化・重複判定", "AI分類", "記事生成", "出典確認", "弁護士承認", "公開"];

export default async function LandingPage() {
  const m = await getLandingMetrics();
  const needsCode = !!env.demoAccessCode && !(await hasGrantCookie());
  return (
    <div className="bg-ivory">
      <div className="grid-paper relative overflow-hidden bg-navy text-white">
        <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-gold/10 blur-3xl" aria-hidden />
        <header className="relative mx-auto flex max-w-7xl items-center gap-4 px-4 py-5 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-[3px] border border-gold/50 font-serif text-sm text-gold">AI</span>
            <span className="font-num text-[13px] font-semibold tracking-wide">AI Incident Intelligence</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-6 text-[13px] text-white/60 md:flex" aria-label="ページ内リンク">
            <a href="#features" className="hover:text-white">機能</a>
            <a href="#flow" className="hover:text-white">業務の流れ</a>
            <a href="#savings" className="hover:text-white">運用削減の試算</a>
          </nav>
          <Button asChild variant="onDark" size="sm" className="ml-auto md:ml-0"><Link href="/login">ログイン</Link></Button>
        </header>

        <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:pb-24 lg:pt-16">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div>
              <p className="font-num text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/80">For Law Firms · Incident Intelligence</p>
              <h1 className="h-serif mt-5 text-[40px] font-semibold leading-[1.25] sm:text-5xl lg:text-[54px]">
                事件情報の発見から、<br />公開の判断まで。
              </h1>
              <p className="mt-6 max-w-lg text-[15px] leading-loose text-white/70">
                散在する公開情報をAIが整理し、法律事務所の情報発信を、より確かに、より効率的に。
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <DemoStartButton needsCode={needsCode} variant="gold" size="lg" data-testid="landing-demo" />
                <Button asChild variant="onDark" size="lg"><a href="#features">機能を見る</a></Button>
              </div>
              <p className="mt-4 text-xs text-white/60">約5分のガイド付きデモ。登録不要・架空データのみ使用。</p>
            </div>
            <LandingDashboard m={{ ...m, last_collect: m.last_collect ? new Date(m.last_collect).toISOString() : null }} needsCode={needsCode} />
          </div>
        </section>
      </div>

      <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div>
            <p className="eyebrow">Why this platform</p>
            <h2 className="h-serif mt-3 text-3xl font-semibold leading-snug">記事を作るAIではなく、<br />公開を判断するための基盤。</h2>
            <p className="mt-4 text-sm leading-loose text-ink-3">出典追跡、変更差分、承認管理、運用コストの可視化までを一貫して体験できます。</p>
          </div>
          <ol className="divide-y divide-line border-y border-line">
            {FEATURES.map((f) => (
              <li key={f.no} className="grid grid-cols-1 gap-4 py-7 sm:grid-cols-[72px_220px_minmax(0,1fr)]">
                <span className="font-num text-3xl font-light text-gold-deep tnum">{f.no}</span>
                <div>
                  <f.icon className="size-5 text-navy" aria-hidden />
                  <p className="mt-2 font-num text-sm font-semibold tracking-wide">{f.title}</p>
                </div>
                <div>
                  <p className="h-serif text-lg text-ink">{f.lead}</p>
                  <p className="mt-2 text-[13px] leading-loose text-ink-3">{f.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="flow" className="border-y border-line bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <p className="eyebrow">Workflow</p>
          <h2 className="h-serif mt-3 text-2xl font-semibold">一連の業務として、実際に操作できます</h2>
          <ol className="mt-10 grid grid-cols-2 gap-y-8 sm:grid-cols-4 lg:grid-cols-7">
            {FLOW.map((s, i) => (
              <li key={s} className="relative pr-4">
                <div className="flex items-center">
                  <span className="flex size-8 items-center justify-center rounded-full border border-navy font-num text-xs font-semibold text-navy">{i + 1}</span>
                  {i < FLOW.length - 1 && <span className="ml-2 hidden h-px flex-1 bg-line-strong lg:block" aria-hidden />}
                </div>
                <p className="mt-3 text-[13px] font-medium">{s}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="savings" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mb-10 max-w-2xl">
          <p className="eyebrow">Operational Savings Preview</p>
          <h2 className="h-serif mt-3 text-2xl font-semibold">運営負担の削減を試算する</h2>
          <p className="mt-3 text-sm leading-loose text-ink-3">記事数と作業時間を入力すると、手作業とAI支援運用の差を試算します。</p>
        </div>
        <SavingsSimulator />
      </section>

      <section className="bg-navy text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="h-serif text-2xl">5分で、主要機能をひと通り。</p>
            <p className="mt-2 text-sm text-white/60">事件の確認から公開サイトの確認まで、画面の案内に沿って操作できます。</p>
          </div>
          <DemoStartButton needsCode={needsCode} variant="gold" size="lg" />
        </div>
      </section>

      <footer className="mx-auto max-w-7xl px-4 py-10 text-[11px] leading-relaxed text-slate sm:px-6">
        <p>本サイトはデモンストレーションです。掲載されている企業・事件・法律事務所・人物・数値はすべて架空であり、実在のものとは関係ありません。</p>
        <p className="mt-1">AI処理は、APIキーが設定されていない環境では「AIシミュレーション」として表示される決定的な処理で実行されます。SEO設定は検索順位を保証するものではありません。</p>
        <p className="mt-4 flex items-center gap-1 text-ink-3">© AI Incident Intelligence Demo <ArrowRight className="size-3" aria-hidden /> <Link href="/login" className="underline">管理画面</Link></p>
      </footer>
    </div>
  );
}
