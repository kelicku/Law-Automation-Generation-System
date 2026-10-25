import { ArrowLeft, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { findResumeTarget, hasGrantCookie } from "@/lib/auth/demo-access";
import { getViewer } from "@/lib/auth/session";
import { DEMO_TENANTS, DEMO_USERS } from "@/lib/demo/tenants";
import { env } from "@/lib/env";
import heroImage from "../../../public/images/login/hero.jpg";
import wideImage from "../../../public/images/login/wide.jpg";
import { DemoAccess, type DemoPersona } from "./demo-access";
import { LoginForm } from "./login-form";

export const metadata = { title: "ログイン", robots: { index: false } };
export const dynamic = "force-dynamic";

const PRINCIPLES = [
  ["01", "出典を確かめる"],
  ["02", "弁護士が承認する"],
  ["03", "承認した版だけを公開"],
] as const;

const CAPABILITY: Record<string, string> = {
  "seiran-lawyer": "承認・公開ができます",
  "seiran-editor": "記事の作成・編集のみ",
  "hiiragi-lawyer": "承認・公開ができます",
  operator: "全事務所の運用状況を管理",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const v = await getViewer();
  if (v) redirect(v.tenant ? "/app" : "/app/operations");
  const { invite } = await searchParams;
  const granted = await hasGrantCookie();
  const resume = await findResumeTarget();
  const showCredentials = env.demoMode && !env.demoAccessCode;

  const personas: DemoPersona[] = DEMO_USERS.map((u) => {
    const m = u.memberships[0];
    const t = m ? DEMO_TENANTS.find((x) => x.slug === m.tenant) : null;
    return {
      key: u.key,
      name: u.name,
      firm: t ? t.shortName : "プラットフォーム運営",
      role: m ? m.title : "運営管理者",
      capability: CAPABILITY[u.key] ?? "",
      mark: t ? t.logoMark : "運",
      color: t ? t.brandPrimary : "#3A4558",
      ...(showCredentials ? { email: u.email, password: u.password } : {}),
    };
  });

  return (
    <div className="grid min-h-screen grid-cols-1 bg-ivory lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      {/* ── visual panel (desktop) ── */}
      <aside className="relative hidden overflow-hidden bg-navy lg:block" aria-hidden>
        <Image src={heroImage} alt="" fill priority placeholder="blur" sizes="(min-width: 1024px) 54vw, 0px" className="object-cover object-[50%_40%] saturate-[0.9]" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/55 to-navy/10" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_20%,transparent_40%,rgba(16,28,48,0.55))]" />
        <div className="pointer-events-none absolute inset-6 border border-white/[0.08]" />

        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <Link href="/" className="pointer-events-auto flex items-center gap-3 text-white" tabIndex={-1}>
            <span className="flex size-9 items-center justify-center rounded-[3px] border border-gold/60 font-serif text-sm text-gold">AI</span>
            <span className="font-num text-[13px] font-semibold tracking-wide">AI Incident Intelligence</span>
          </Link>

          <div className="max-w-lg text-white">
            <p className="font-num text-[11px] font-semibold uppercase tracking-[0.26em] text-gold">For law firms</p>
            <p className="h-serif mt-5 text-[40px] font-semibold leading-[1.3] xl:text-[46px]">
              事件情報の発見から、
              <br />
              公開の判断まで。
            </p>
            <p className="mt-5 max-w-md text-[15px] leading-loose text-white/75">
              出典の追跡、続報の差分、弁護士による承認記録。法律事務所の情報発信に必要な確かさを、運用の手間をかけずに。
            </p>
            <ol className="mt-10 grid grid-cols-3 border-t border-white/15">
              {PRINCIPLES.map(([no, label]) => (
                <li key={no} className="border-l border-white/15 pl-4 pt-4 first:border-l-0 first:pl-0">
                  <span className="font-num text-xs text-gold tnum">{no}</span>
                  <span className="mt-1 block text-[13px] leading-snug text-white/85">{label}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </aside>

      {/* ── form panel ── */}
      <main className="flex min-w-0 flex-col">
        {/* image band (mobile / tablet) */}
        <div className="relative h-44 overflow-hidden bg-navy sm:h-56 lg:hidden" aria-hidden>
          <Image src={wideImage} alt="" fill loading="lazy" placeholder="blur" sizes="(min-width: 1024px) 1px, 100vw" className="object-cover object-[70%_50%] saturate-[0.9]" />
          <div className="absolute inset-0 bg-gradient-to-r from-navy/90 via-navy/50 to-navy/10" />
          <div className="relative flex h-full flex-col justify-end p-5 sm:p-8">
            <span className="flex items-center gap-2.5 text-white">
              <span className="flex size-8 items-center justify-center rounded-[3px] border border-gold/60 font-serif text-[13px] text-gold">AI</span>
              <span className="font-num text-[13px] font-semibold tracking-wide">AI Incident Intelligence</span>
            </span>
            <span className="h-serif mt-3 text-xl text-white sm:text-2xl">事件情報の発見から、公開の判断まで。</span>
          </div>
        </div>

        <div className="flex flex-1 flex-col px-5 py-8 sm:px-10 lg:px-14 lg:py-10 xl:px-20">
          <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-xs text-slate transition-colors hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> トップページへ
          </Link>

          <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
            {env.demoMode ? (
              <>
                <h1 className="h-serif text-[30px] font-semibold leading-tight text-ink">{resume ? "おかえりなさい" : "ボタンひとつで始める"}</h1>
                <p className="mt-2 text-sm leading-relaxed text-ink-3">
                  {resume ? "前回のデモ事務所から、そのまま続きを操作できます。" : "メールアドレスやパスワードの入力は不要です。"}
                </p>
                <div className="mt-8">
                  <DemoAccess personas={personas} needsCode={!!env.demoAccessCode && !granted} resumeFirm={resume?.firmName ?? null} invite={invite === "ok" ? "ok" : invite === "invalid" ? "invalid" : null} />
                </div>
                <div className="my-9 flex items-center gap-4 text-xs text-slate" role="separator">
                  <span className="h-px flex-1 bg-line" />
                  事務所のアカウントをお持ちの方
                  <span className="h-px flex-1 bg-line" />
                </div>
                <LoginForm />
              </>
            ) : (
              <>
                <h1 className="h-serif text-[30px] font-semibold leading-tight text-ink">ログイン</h1>
                <p className="mt-2 text-sm leading-relaxed text-ink-3">事務所から発行されたアカウントでログインしてください。</p>
                <div className="mt-8">
                  <LoginForm />
                </div>
              </>
            )}
          </div>

          <footer className="mx-auto flex w-full max-w-[400px] items-start gap-2 text-[11px] leading-relaxed text-slate">
            <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
            <p>通信はHTTPSで暗号化され、セッションはブラウザのスクリプトから読み取れないCookieで管理されます。デモ環境の企業・事件・事務所・人物はすべて架空です。</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
