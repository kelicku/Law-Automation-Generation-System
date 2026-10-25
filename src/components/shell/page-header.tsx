import { cn } from "@/lib/utils";

export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow: string; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="h-serif mt-1.5 text-[26px] font-semibold leading-tight text-ink sm:text-[28px]">{title}</h1>
        {description && <div className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-3">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, eyebrow, actions, children, className }: { title: string; eyebrow?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-3 flex items-end justify-between gap-3 border-b border-line pb-2">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 className="h-serif text-[15px] font-semibold text-ink">{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
