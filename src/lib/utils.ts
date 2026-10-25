import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const JST = "Asia/Tokyo";

export function fmtDate(d: Date | string | null | undefined, opts: { time?: boolean; year?: boolean } = {}): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00+09:00` : d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST,
    year: opts.year === false ? undefined : "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(opts.time ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function fmtRelative(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "たった今";
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}日前`;
  return fmtDate(date);
}

export function fmtNum(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toLocaleString("ja-JP");
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
