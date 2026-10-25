import { z } from "zod";
import { ArticleContent, Sentence } from "@/lib/domain/article";
import { CATEGORIES } from "@/lib/domain/types";

/**
 * Two layers of schemas:
 *  - *Wire schemas are sent to the model as the structured-output format (kept simple so the
 *    provider can constrain decoding).
 *  - The strict domain schemas (ArticleContent etc.) re-validate everything that comes back.
 *    Missing fields, wrong types or references to unknown sources are treated as errors.
 */
const WireRef = z.object({ sourceId: z.string(), quote: z.string() });
const WireSentence = z.object({ id: z.string(), text: z.string(), kind: z.enum(["fact", "analysis", "notice"]), refs: z.array(WireRef) });
const WireBlock = z.object({
  id: z.string(),
  type: z.enum(["heading", "paragraph"]),
  text: z.string().nullable(),
  sentences: z.array(WireSentence).nullable(),
});

export const ArticleWire = z.object({
  title: z.string(),
  summary: z.string(),
  blocks: z.array(WireBlock),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  seo: z.object({ title: z.string(), description: z.string(), keywords: z.array(z.string()) }),
  sns: z.object({ x: z.string(), facebook: z.string() }),
});

export function articleFromWire(wire: z.infer<typeof ArticleWire>) {
  return {
    ...wire,
    blocks: wire.blocks.map((b) =>
      b.type === "heading" ? { id: b.id, type: "heading" as const, text: b.text ?? "" } : { id: b.id, type: "paragraph" as const, sentences: b.sentences ?? [] },
    ),
  };
}

/** Strict validation + every ref must point to one of the provided sources. */
export function validateArticle(raw: unknown, allowedSourceIds: Set<string>): ArticleContent {
  const parsed = ArticleContent.parse(raw);
  for (const b of parsed.blocks) {
    if (b.type !== "paragraph") continue;
    for (const s of b.sentences) {
      for (const r of s.refs) {
        if (!allowedSourceIds.has(r.sourceId)) throw new Error(`unknown sourceId in refs: ${r.sourceId}`);
      }
      if (s.kind !== "fact" && s.refs.length > 0) throw new Error(`non-fact sentence ${s.id} must not carry refs`);
    }
  }
  return parsed;
}

export const ClassifyWire = z.object({
  is_incident: z.boolean(),
  organization: z.string(),
  incident_title: z.string(),
  category: z.enum(CATEGORIES),
  confidence: z.number(),
  rationale: z.string(),
  affected_count: z.number().nullable(),
  affected_count_status: z.enum(["unknown", "estimated", "confirmed"]),
  occurred_on: z.string().nullable(),
  disclosed_on: z.string().nullable(),
});
export const ClassifyStrict = ClassifyWire.extend({
  organization: z.string().min(1).max(120),
  incident_title: z.string().min(4).max(120),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(500),
  affected_count: z.number().int().nonnegative().nullable(),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  disclosed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export type ClassifyResult = z.infer<typeof ClassifyStrict>;

export const SeoTitleWire = z.object({ candidates: z.array(z.string()) });
export const SeoTitleStrict = z.object({ candidates: z.array(z.string().min(5).max(40)).min(1).max(5) });

export const MetaWire = z.object({ description: z.string() });
export const MetaStrict = z.object({ description: z.string().min(40).max(140) });

export const SnsWire = z.object({ x: z.string(), facebook: z.string() });
export const SnsStrict = z.object({ x: z.string().min(10).max(140), facebook: z.string().min(10).max(400) });

export const ParagraphWire = z.object({ sentences: z.array(WireSentence) });
export const ParagraphStrict = z.object({ sentences: z.array(Sentence).min(1).max(12) });
