"use client";
import * as DM from "@radix-ui/react-dropdown-menu";
import * as Pop from "@radix-ui/react-popover";
import {
  Activity, BadgeCheck, Bell, Building2, ChevronsUpDown, Compass, Cpu, FileText, Gauge, Globe, LayoutDashboard, LogOut, Menu, Radar,
  RotateCcw, Settings, Sparkles, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useJourney } from "@/components/journey/journey";
import { Pill } from "@/components/ui/badges";
import { api, ClientApiError } from "@/lib/client/api";
import { ROLE_LABEL, type MemberRole } from "@/lib/domain/types";
import { cn, fmtRelative } from "@/lib/utils";

export interface ShellViewer {
  name: string;
  email: string;
  platformRole: "none" | "operator";
  role: MemberRole | null;
  tenant: { id: string; slug: string; name: string; shortName: string; logoMark: string; brandPrimary: string; brandAccent: string } | null;
}

export interface ShellNotification {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Persona {
  key: string;
  name: string;
  persona: string;
  email: string;
}

const NAV = [
  { group: "Overview", items: [{ href: "/app", label: "ダッシュボード", icon: LayoutDashboard, exact: true }] },
  {
    group: "Workflow",
    items: [
      { href: "/app/radar", label: "Incident Radar", icon: Radar },
      { href: "/app/articles", label: "記事・エディタ", icon: FileText },
      { href: "/app/approvals", label: "承認ワークフロー", icon: BadgeCheck },
      { href: "/app/site", label: "公開サイト", icon: Globe },
    ],
  },
  {
    group: "Insight",
    items: [
      { href: "/app/inspector", label: "AI Inspector", icon: Cpu },
      { href: "/app/savings", label: "運用削減の試算", icon: Gauge },
    ],
  },
  {
    group: "Admin",
    items: [
      { href: "/app/operations", label: "Operations Center", icon: Activity, operator: true },
      { href: "/app/settings", label: "事務所設定", icon: Settings, tenant: true },
    ],
  },
];

export function Shell({
  viewer, notifications, unread, personas, demoMode, aiProvider, ownFirm, children,
}: {
  viewer: ShellViewer;
  notifications: ShellNotification[];
  unread: number;
  personas: Persona[];
  demoMode: boolean;
  aiProvider: "anthropic" | "simulation";
  /** the visitor's own demo firm (one-click registration), if any */
  ownFirm: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isOperator = viewer.platformRole === "operator";

  const nav = (
    <nav aria-label="メインナビゲーション" className="flex flex-col gap-6">
      {NAV.map((g) => {
        const items = g.items.filter((i) => (!("operator" in i) || !i.operator || isOperator) && (!("tenant" in i) || !i.tenant || viewer.tenant));
        const visible = isOperator && !viewer.tenant ? items.filter((i) => ["/app/operations", "/app/inspector", "/app/savings"].includes(i.href)) : items;
        if (!visible.length) return null;
        return (
          <div key={g.group}>
            <p className="mb-2 px-3 font-num text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">{g.group}</p>
            <ul className="flex flex-col gap-0.5">
              {visible.map((item) => {
                const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-[3px] px-3 py-2 text-[13px] transition-colors",
                        active ? "bg-white/[0.07] text-white" : "text-white/60 hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold" aria-hidden />}
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-[232px]">
      {/* rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col bg-navy px-3 py-5 lg:flex">
        <Brand />
        <div className="mt-8 flex-1 overflow-y-auto">{nav}</div>
        <RailFooter aiProvider={aiProvider} />
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="メニュー">
          <button className="absolute inset-0 bg-navy/50" onClick={() => setMobileOpen(false)} aria-label="メニューを閉じる" />
          <div className="absolute inset-y-0 left-0 flex w-[264px] flex-col bg-navy px-3 py-5">
            <div className="flex items-center justify-between pr-1">
              <Brand />
              <button onClick={() => setMobileOpen(false)} className="rounded p-1 text-white/70" aria-label="メニューを閉じる"><X className="size-5" /></button>
            </div>
            <div className="mt-8 flex-1 overflow-y-auto">{nav}</div>
            <RailFooter aiProvider={aiProvider} />
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-line bg-ivory/90 backdrop-blur">
        {demoMode && (
          <div className="flex items-center justify-center gap-2 bg-navy-2 px-4 py-1 text-center text-[11px] text-white/75">
            <span className="size-1.5 rounded-full bg-gold" aria-hidden />
            デモ環境：表示される企業・事件・法律事務所・人物はすべて架空です
            <span className="hidden sm:inline">／ AI: {aiProvider === "anthropic" ? "実API" : "シミュレーション（APIキー未設定）"}</span>
          </div>
        )}
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <button className="rounded p-1.5 text-ink-2 hover:bg-ivory-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="メニューを開く">
            <Menu className="size-5" />
          </button>
          <TenantSwitcher viewer={viewer} personas={personas} demoMode={demoMode} ownFirm={ownFirm} />
          <div className="flex-1" />
          <JourneyButton show={!!viewer.tenant} />
          <NotificationBell key={`${unread}-${notifications[0]?.id ?? ""}`} notifications={notifications} unread={unread} />
          <UserMenu viewer={viewer} demoMode={demoMode} />
        </div>
      </header>
      <main id="main" className="px-4 pb-24 pt-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/app" className="flex items-center gap-2.5 px-2">
      <span className="flex size-8 items-center justify-center rounded-[3px] border border-gold/50 font-serif text-sm text-gold">AI</span>
      <span className="leading-tight">
        <span className="block font-num text-[13px] font-semibold tracking-wide text-white">Incident</span>
        <span className="block font-num text-[10px] uppercase tracking-[0.22em] text-white/60">Intelligence</span>
      </span>
    </Link>
  );
}

function RailFooter({ aiProvider }: { aiProvider: "anthropic" | "simulation" }) {
  return (
    <div className="mt-4 border-t border-white/10 px-3 pt-4 text-[11px] leading-relaxed text-white/60">
      <div className="flex items-center gap-2 text-white/70">
        <Sparkles className="size-3.5 text-gold" aria-hidden />
        {aiProvider === "anthropic" ? "AI: Anthropic API 接続中" : "AI: シミュレーション"}
      </div>
      <p className="mt-1">{aiProvider === "anthropic" ? "生成結果はスキーマ検証後に保存" : "APIキー設定で実AIに切替"}</p>
    </div>
  );
}

function TenantSwitcher({ viewer, personas, demoMode, ownFirm }: { viewer: ShellViewer; personas: Persona[]; demoMode: boolean; ownFirm: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const t = viewer.tenant;
  const switchTo = (key: string) =>
    start(async () => {
      try {
        const r = key === "__own"
          ? await api<{ redirect: string }>("/api/auth/quickstart", { body: { mode: "resume" } })
          : await api<{ redirect: string }>("/api/auth/demo", { body: { persona: key } });
        toast.success("表示するアカウントを切り替えました");
        router.push(r.redirect);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ClientApiError ? e.message : "切り替えに失敗しました");
      }
    });

  const label = (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[3px] font-serif text-sm text-white" style={{ background: t?.brandPrimary ?? "#101C30" }}>
        {t?.logoMark ?? "運"}
      </span>
      <span className="min-w-0 text-left leading-tight">
        <span className="block truncate text-[13px] font-medium text-ink">{t?.name ?? "プラットフォーム運営"}</span>
        <span className="block truncate text-2xs text-slate">{viewer.name} · {viewer.role ? ROLE_LABEL[viewer.role] : "運営者"}</span>
      </span>
    </span>
  );

  if (!demoMode) return label;
  return (
    <DM.Root>
      <DM.Trigger className="flex max-w-[60vw] items-center gap-2 rounded-[3px] px-1.5 py-1 hover:bg-ivory-2 sm:max-w-sm" aria-label="事務所・アカウントを切り替え" data-testid="tenant-switcher" disabled={pending}>
        {label}
        <ChevronsUpDown className="size-3.5 shrink-0 text-slate" aria-hidden />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="start" sideOffset={6} className="z-50 w-[min(360px,calc(100vw-2rem))] rounded-[4px] border border-line bg-white p-1.5 shadow-lift">
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="eyebrow">Tenant Switcher</p>
            <p className="mt-1 text-2xs leading-relaxed text-slate">
              デモ用の切替です。選択したアカウントで再ログインし、サーバー側の認可（RLS）がそのまま適用されます。本番では各事務所が個別にログインします。
            </p>
          </div>
          {ownFirm && (
            <>
              <DM.Item
                onSelect={() => switchTo("__own")}
                className={cn("flex cursor-pointer flex-col rounded-[3px] px-2.5 py-2 outline-none data-[highlighted]:bg-ivory-2", viewer.tenant?.shortName === ownFirm && "bg-ivory")}
                data-testid="persona-own"
              >
                <span className="flex items-center gap-2 text-[13px] text-ink">
                  <span className="size-1.5 rounded-full bg-navy" />{ownFirm}
                  {viewer.tenant?.shortName === ownFirm ? <Pill tone="gold" className="ml-auto">現在</Pill> : <Pill className="ml-auto">あなた専用</Pill>}
                </span>
                <span className="mt-0.5 pl-3.5 text-2xs text-slate">ワンクリックで作成したあなたのデモ事務所</span>
              </DM.Item>
              <DM.Separator className="my-1 h-px bg-line" />
            </>
          )}
          {personas.map((p) => (
            <DM.Item
              key={p.key}
              onSelect={() => switchTo(p.key)}
              className={cn("flex cursor-pointer flex-col rounded-[3px] px-2.5 py-2 outline-none data-[highlighted]:bg-ivory-2", p.email === viewer.email && "bg-ivory")}
              data-testid={`persona-${p.key}`}
            >
              <span className="flex items-center gap-2 text-[13px] text-ink">
                {p.key === "operator" ? <Building2 className="size-3.5 text-slate" /> : <span className="size-1.5 rounded-full bg-gold" />}
                {p.name}
                {p.email === viewer.email && <Pill tone="gold" className="ml-auto">現在</Pill>}
              </span>
              <span className="mt-0.5 pl-5 text-2xs text-slate">{p.persona}</span>
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function JourneyButton({ show }: { show: boolean }) {
  const j = useJourney();
  if (!show || !j) return null;
  return (
    <button onClick={j.start} className="hidden items-center gap-1.5 rounded-[3px] border border-gold/50 px-2.5 py-1.5 text-xs font-medium text-gold-deep hover:bg-gold-soft/40 sm:inline-flex" data-testid="journey-start">
      <Compass className="size-3.5" aria-hidden />
      {j.active ? "ガイドをやり直す" : "デモを体験する"}
    </button>
  );
}

function NotificationBell({ notifications, unread }: { notifications: ShellNotification[]; unread: number }) {
  const router = useRouter();
  const [count, setCount] = useState(unread);
  const markAll = async () => {
    try {
      await api("/api/notifications/read", { body: { all: true } });
      setCount(0);
      router.refresh();
    } catch {
      toast.error("既読にできませんでした");
    }
  };
  return (
    <Pop.Root>
      <Pop.Trigger className="relative rounded-[3px] p-2 text-ink-2 hover:bg-ivory-2" aria-label={`通知 ${count}件未読`} data-testid="notifications">
        <Bell className="size-[18px]" />
        {count > 0 && <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-st-suspended px-1 font-num text-[10px] font-semibold text-white">{count}</span>}
      </Pop.Trigger>
      <Pop.Portal>
        <Pop.Content align="end" sideOffset={6} className="z-50 w-[min(380px,calc(100vw-2rem))] rounded-[4px] border border-line bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-[13px] font-medium">通知</p>
            <button className="text-2xs text-slate hover:text-ink" onClick={markAll}>すべて既読にする</button>
          </div>
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto" data-testid="notification-list">
            {notifications.length === 0 && <li className="px-4 py-6 text-center text-xs text-slate">通知はありません</li>}
            {notifications.map((n) => (
              <li key={n.id} className={cn("px-4 py-3", !n.read_at && "bg-ivory/60")}>
                <div className="flex items-start gap-2.5">
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.severity === "critical" ? "bg-st-suspended" : n.severity === "warning" ? "bg-st-revision" : "bg-st-review")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{n.body}</p>}
                    <div className="mt-1 flex items-center gap-3 text-2xs text-slate">
                      <span>{fmtRelative(n.created_at)}</span>
                      {n.link && <Link href={n.link} className="font-medium text-navy hover:underline">開く →</Link>}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Pop.Content>
      </Pop.Portal>
    </Pop.Root>
  );
}

function UserMenu({ viewer, demoMode }: { viewer: ShellViewer; demoMode: boolean }) {
  const router = useRouter();
  const logout = async () => {
    await api("/api/auth/logout").catch(() => null);
    router.push("/login");
    router.refresh();
  };
  const reset = async () => {
    if (!window.confirm("デモ全体を初期状態に戻します。すべての閲覧者のデモ事務所と操作結果が消去されます。よろしいですか？")) return;
    const id = toast.loading("デモデータを初期化しています…");
    try {
      await api("/api/demo/reset");
      try {
        window.localStorage.removeItem("aiip.journey.v1");
      } catch {
        /* ignore */
      }
      toast.success("初期化しました", { id });
      router.push("/");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "初期化に失敗しました", { id });
    }
  };
  const fresh = async () => {
    if (!window.confirm("新しいデモ事務所を作成して、最初から始めます。よろしいですか？")) return;
    const id = toast.loading("新しいデモ事務所を作成しています…");
    try {
      const r = await api<{ redirect: string }>("/api/auth/quickstart", { body: { mode: "new" } });
      try {
        window.localStorage.removeItem("aiip.journey.v1");
      } catch {
        /* ignore */
      }
      toast.success("新しいデモ事務所を作成しました", { id });
      router.push(r.redirect);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "作成できませんでした", { id });
    }
  };
  return (
    <DM.Root>
      <DM.Trigger className="flex size-8 items-center justify-center rounded-full bg-navy font-num text-xs font-semibold text-white" aria-label="ユーザーメニュー" data-testid="user-menu">
        {viewer.name.slice(0, 1)}
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={6} className="z-50 w-60 rounded-[4px] border border-line bg-white p-1.5 shadow-lift">
          <div className="px-2.5 py-2">
            <p className="text-[13px] font-medium">{viewer.name}</p>
            <p className="truncate text-2xs text-slate">{viewer.email}</p>
          </div>
          <DM.Separator className="my-1 h-px bg-line" />
          {demoMode && viewer.platformRole !== "operator" && (
            <DM.Item onSelect={fresh} className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-ivory-2" data-testid="demo-fresh">
              <RotateCcw className="size-3.5" /> 新しいデモ事務所で始め直す
            </DM.Item>
          )}
          {demoMode && viewer.platformRole === "operator" && (
            <DM.Item onSelect={reset} className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-ivory-2" data-testid="demo-reset">
              <RotateCcw className="size-3.5" /> デモ全体を初期化（運営者）
            </DM.Item>
          )}
          <DM.Item onSelect={logout} className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-ivory-2" data-testid="logout">
            <LogOut className="size-3.5" /> ログアウト
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
