import { createHash } from "node:crypto";

/** Stable JSON serialisation (sorted keys) so equal content always hashes equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function contentHash(value: unknown): string {
  return sha256(stableStringify(value));
}
