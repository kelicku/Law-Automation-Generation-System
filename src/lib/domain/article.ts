import { z } from "zod";

/**
 * Article content is stored as structured blocks, never as HTML.
 * Every factual sentence carries references (source id + verbatim quote) so that
 * Evidence Trace can mechanically check the quote against the stored source text.
 */
export const SourceRef = z.object({
  sourceId: z.string().uuid(),
  quote: z.string().min(4).max(400),
});
export type SourceRef = z.infer<typeof SourceRef>;

export const SentenceKind = z.enum(["fact", "analysis", "notice"]);
export type SentenceKind = z.infer<typeof SentenceKind>;

export const Sentence = z.object({
  id: z.string().min(1).max(40),
  text: z.string().min(1).max(600),
  kind: SentenceKind,
  refs: z.array(SourceRef).max(5),
});
export type Sentence = z.infer<typeof Sentence>;

export const Block = z.discriminatedUnion("type", [
  z.object({ id: z.string().min(1).max(40), type: z.literal("heading"), text: z.string().min(1).max(80) }),
  z.object({ id: z.string().min(1).max(40), type: z.literal("paragraph"), sentences: z.array(Sentence).min(1).max(30) }),
]);
export type Block = z.infer<typeof Block>;

export const ArticleLink = z.object({
  label: z.string().min(1).max(120),
  // absolute http(s) URL, or an internal path to a (fictional) demo source document
  url: z.string().max(500).refine((u) => /^https?:\/\/[^\s<>"]+$/.test(u) || /^\/demo-sources\/[a-z0-9-]+$/.test(u), "http(s) URL only"),
});

export const ArticleContent = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(400),
  blocks: z.array(Block).min(1).max(60),
  links: z.array(ArticleLink).max(20),
  seo: z.object({
    title: z.string().max(70),
    description: z.string().max(200),
    keywords: z.array(z.string().max(30)).max(10),
  }),
  sns: z.object({ x: z.string().max(280), facebook: z.string().max(600) }),
});
export type ArticleContent = z.infer<typeof ArticleContent>;

export function contentText(c: ArticleContent): string {
  const parts = [c.title, c.summary];
  for (const b of c.blocks) {
    if (b.type === "heading") parts.push(b.text);
    else parts.push(b.sentences.map((s) => s.text).join(""));
  }
  return parts.join("\n");
}

export function allSentences(c: ArticleContent): Sentence[] {
  return c.blocks.flatMap((b) => (b.type === "paragraph" ? b.sentences : []));
}

/** Split Japanese prose into sentences (keeps the terminal punctuation). */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[。！？!?])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Re-segments an edited paragraph while keeping references of sentences whose
 * text did not change. Edited / new sentences lose their refs and become unverified facts,
 * so an edit can never silently keep a citation that no longer matches.
 */
export function reconcileParagraph(previous: Sentence[], editedText: string, newId: () => string): Sentence[] {
  const byText = new Map<string, Sentence[]>();
  for (const s of previous) {
    const list = byText.get(s.text) ?? [];
    list.push(s);
    byText.set(s.text, list);
  }
  return splitSentences(editedText).map((text) => {
    const hit = byText.get(text)?.shift();
    if (hit) return hit;
    return { id: newId(), text, kind: "fact" as const, refs: [] };
  });
}
