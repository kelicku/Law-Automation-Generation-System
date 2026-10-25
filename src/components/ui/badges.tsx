import { CATEGORY_LABEL, STATUS_LABEL, type ArticleStatus, type Category } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const CAT_COLOR: Record<Category, string> = {
  personal_data: "bg-cat-personal", cyber_attack: "bg-cat-cyber", consumer_harm: "bg-cat-consumer", other: "bg-cat-other",
};
export const CAT_HEX: Record<Category, string> = { personal_data: "#3D5A80", cyber_attack: "#8E3B46", consumer_harm: "#4F7A64", other: "#64748B" };

export function CategoryTag({ category, className }: { category: Category; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-2", className)}>
      <span className={cn("size-2 rounded-[1px]", CAT_COLOR[category])} aria-hidden />
      {CATEGORY_LABEL[category]}
    </span>
  );
}

const ST: Record<ArticleStatus, string> = {
  draft: "text-st-draft border-st-draft/30 bg-white",
  in_review: "text-st-review border-st-review/30 bg-st-review/5",
  approved: "text-st-approved border-st-approved/30 bg-st-approved/5",
  published: "text-white border-navy bg-navy",
  revision_required: "text-st-revision border-st-revision/40 bg-st-revision/5",
  suspended: "text-st-suspended border-st-suspended/30 bg-st-suspended/5",
  archived: "text-st-archived border-st-archived/30 bg-white",
};

export function StatusBadge({ status, className, showEn = true }: { status: ArticleStatus; className?: string; showEn?: boolean }) {
  return (
    <span data-status={status} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-[2px] border px-1.5 py-0.5 text-2xs font-medium", ST[status], className)}>
      {status === "published" && <span className="size-1.5 rounded-full bg-gold" aria-hidden />}
      {STATUS_LABEL[status].ja}
      {showEn && <span className="font-num font-normal">{STATUS_LABEL[status].en}</span>}
    </span>
  );
}

export function Pill({ tone = "neutral", children, className }: { tone?: "neutral" | "gold" | "warn" | "danger" | "ok" | "info" | "dark"; children: React.ReactNode; className?: string }) {
  const t = {
    neutral: "border-line-strong text-ink-2 bg-white",
    gold: "border-gold/50 text-gold-deep bg-gold-soft/40",
    warn: "border-st-revision/40 text-st-revision bg-st-revision/5",
    danger: "border-st-suspended/40 text-st-suspended bg-st-suspended/5",
    ok: "border-st-approved/40 text-st-approved bg-st-approved/5",
    info: "border-st-review/30 text-st-review bg-st-review/5",
    dark: "border-white/15 text-white/80 bg-white/5",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] border px-1.5 py-0.5 text-2xs font-medium", t, className)}>{children}</span>;
}

/** Visible label distinguishing simulated AI from a real provider call. */
export function AiModeBadge({ provider, model, className }: { provider: "anthropic" | "simulation" | string; model?: string; className?: string }) {
  return provider === "anthropic" ? (
    <Pill tone="ok" className={className}>実AI · {model}</Pill>
  ) : (
    <Pill tone="gold" className={className}>AIシミュレーション</Pill>
  );
}
