"use client";
import { useId, useState } from "react";
import { estimateSavings, type SavingsInput } from "@/lib/domain/savings";
import { cn, fmtNum } from "@/lib/utils";

const FIELDS: { key: keyof SavingsInput; label: string; unit: string; min: number; max: number; step: number }[] = [
  { key: "articlesPerMonth", label: "月間の記事数", unit: "本", min: 0, max: 200, step: 1 },
  { key: "manualMinutesPerArticle", label: "1記事あたりの手作業時間", unit: "分", min: 0, max: 960, step: 10 },
  { key: "reviewMinutesPerArticle", label: "AI支援後の確認時間", unit: "分", min: 0, max: 480, step: 5 },
  { key: "hourlyCostJpy", label: "担当者の時間単価（任意）", unit: "円/時", min: 0, max: 30000, step: 500 },
];

/** Operational Savings Preview — an estimate from user input only, never presented as measured. */
export function SavingsSimulator({ dark }: { dark?: boolean }) {
  const [input, setInput] = useState<SavingsInput>({ articlesPerMonth: 12, manualMinutesPerArticle: 240, reviewMinutesPerArticle: 45, hourlyCostJpy: 6000 });
  const r = estimateSavings(input);
  const id = useId();
  const max = Math.max(r.manualHours, 1);
  return (
    <div className={cn("grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]", dark ? "text-white" : "text-ink")}>
      <div className="space-y-5">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <div className="flex items-baseline justify-between">
              <label htmlFor={`${id}-${f.key}`} className={cn("text-xs", dark ? "text-white/70" : "text-ink-2")}>{f.label}</label>
              <span className="flex items-baseline gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label={`${f.label}（数値）`}
                  className={cn("w-20 border-b bg-transparent text-right font-num text-lg font-semibold tnum focus:outline-none", dark ? "border-white/20 focus:border-gold" : "border-line-strong focus:border-navy")}
                  value={input[f.key]}
                  min={f.min}
                  max={f.max * 5}
                  onChange={(e) => setInput({ ...input, [f.key]: Number(e.target.value) })}
                  data-testid={`savings-${f.key}`}
                />
                <span className={cn("text-2xs", dark ? "text-white/50" : "text-slate")}>{f.unit}</span>
              </span>
            </div>
            <input
              id={`${id}-${f.key}`}
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={Math.min(input[f.key], f.max)}
              onChange={(e) => setInput({ ...input, [f.key]: Number(e.target.value) })}
              className={cn("mt-2 w-full", dark ? "accent-[#C2A675]" : "accent-[#101C30]")}
            />
          </div>
        ))}
      </div>
      <div className={cn("border-l pl-6 sm:pl-8", dark ? "border-white/10" : "border-line")}>
        <p className={cn("eyebrow", dark && "!text-gold/80")}>Estimated monthly savings</p>
        <p className="mt-2 font-num text-5xl font-semibold tracking-tight tnum" data-testid="savings-hours">
          {fmtNum(r.savedHours)}<span className={cn("ml-1 text-base font-normal", dark ? "text-white/50" : "text-slate")}>時間 / 月</span>
        </p>
        <p className={cn("mt-1 text-sm", dark ? "text-white/70" : "text-ink-2")}>
          削減率 <b className="font-num">{r.savedRatio}%</b> ・ 年間 <b className="font-num">{fmtNum(r.annualSavedHours)}</b> 時間
          {input.hourlyCostJpy > 0 && <> ・ 月 <b className="font-num">{fmtNum(r.savedCostJpy)}</b> 円相当</>}
        </p>
        <div className="mt-6 space-y-3" aria-hidden>
          {[{ label: "手作業", v: r.manualHours, c: dark ? "bg-white/30" : "bg-ink-3" }, { label: "AI支援後", v: r.assistedHours, c: "bg-gold" }].map((b) => (
            <div key={b.label}>
              <div className={cn("mb-1 flex justify-between text-2xs", dark ? "text-white/60" : "text-slate")}><span>{b.label}</span><span className="font-num tnum">{fmtNum(b.v)} h</span></div>
              <div className={cn("h-2", dark ? "bg-white/10" : "bg-ivory-3")}>
                <div className={cn("h-full transition-[width] duration-500", b.c)} style={{ width: `${(b.v / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className={cn("mt-6 border-t pt-3 text-2xs leading-relaxed", dark ? "border-white/10 text-white/60" : "border-line text-slate")}>
          ※ 入力値に基づく試算であり、実測値ではありません。計算式：削減時間 ＝ 記事数 ×（手作業時間 − AI支援後の確認時間）。弁護士による確認時間は必ず確保してください。
        </p>
      </div>
    </div>
  );
}
