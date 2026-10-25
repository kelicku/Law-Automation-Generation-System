/**
 * Text coming from external sources is untrusted. We convert it to plain text,
 * bound its size and flag (but never obey) instruction-like passages that try to
 * steer an AI model ("prompt injection").
 */

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith("#") && /^#\d+$/.test(e)) return String.fromCodePoint(parseInt(e.slice(1), 10));
      return ENTITY[e.toLowerCase()] ?? m;
    });
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[ \t\u3000]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim();
}

export const MAX_SOURCE_CHARS = 20_000;

export interface InjectionFlag {
  pattern: string;
  excerpt: string;
}

const INJECTION_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "ignore_previous", re: /(以前|これまで|上記|前)の(指示|命令|プロンプト)を(無視|忘れ)/ },
  { id: "ignore_previous_en", re: /ignore (all |any )?(previous|prior|above) (instructions|prompts?)/i },
  { id: "system_prompt", re: /(システム|system)\s*(への)?(指示|プロンプト|prompt|message)/i },
  { id: "role_override", re: /(あなたは|you are now)\s*.{0,20}(として振る舞|act as|になりきって)/i },
  { id: "exfiltrate", re: /(api\s*キー|api key|環境変数|secret|パスワード)を(出力|表示|送信|教え)/i },
  { id: "forced_output", re: /(必ず|絶対に).{0,30}(と断定|と書け|と記載せよ|と出力せよ)/ },
];

export function detectInjection(text: string): InjectionFlag[] {
  const flags: InjectionFlag[] = [];
  for (const { id, re } of INJECTION_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const start = Math.max(0, m.index - 20);
      flags.push({ pattern: id, excerpt: text.slice(start, m.index + m[0].length + 30) });
    }
  }
  return flags;
}

export function sanitizeSourceText(raw: string, isHtml: boolean): { text: string; flags: InjectionFlag[]; truncated: boolean } {
  const plain = normalizeWhitespace(isHtml ? htmlToText(raw) : raw);
  const truncated = plain.length > MAX_SOURCE_CHARS;
  const text = truncated ? plain.slice(0, MAX_SOURCE_CHARS) : plain;
  return { text, flags: detectInjection(text), truncated };
}

/** Wraps untrusted text for an AI prompt so it cannot close the wrapper or impersonate tags. */
export function fenceUntrusted(id: string, text: string): string {
  const safe = text.replace(/<\/?\s*(untrusted_source|system|instructions?)[^>]*>/gi, "[tag removed]");
  return `<untrusted_source id="${id}">\n${safe}\n</untrusted_source>`;
}

export function isSafeHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
