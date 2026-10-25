/** Removes secrets and personal identifiers from strings before they are logged or stored. */
const PATTERNS: [RegExp, string][] = [
  [/sk-ant-[A-Za-z0-9_-]{10,}/g, "[REDACTED_API_KEY]"],
  [/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED_API_KEY]"],
  [/(api[_-]?key|authorization|x-api-key|password|secret|token)(["'\s:=]+)([^\s"',]+)/gi, "$1$2[REDACTED]"],
  [/postgres(ql)?:\/\/[^\s@]+@/gi, "postgres://[REDACTED]@"],
  [/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]"],
];

export function redact(input: unknown): string {
  let s = input instanceof Error ? `${input.name}: ${input.message}` : typeof input === "string" ? input : JSON.stringify(input);
  for (const [re, to] of PATTERNS) s = s.replace(re, to);
  return s.slice(0, 2000);
}

export function logError(scope: string, err: unknown) {
  console.error(`[${scope}] ${redact(err)}`);
}
