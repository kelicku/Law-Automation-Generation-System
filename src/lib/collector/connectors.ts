import "server-only";
import { DEMO_INCIDENTS, DEMO_SOURCES, demoSourceUrl } from "@/lib/demo/sources";

/** A raw item produced by a connector before normalisation. */
export interface RawItem {
  connector: "fixture" | "rss";
  url: string;
  publisher: string;
  sourceType: "official" | "press_release" | "news" | "regulator";
  title: string;
  publishedAt: string | null;
  body: string;
  isHtml: boolean;
  isFictional: boolean;
  /** demo-only extraction hints (see classify simulation) */
  hint?: { incidentKey: string };
}

export interface FetchOutcome {
  name: string;
  url: string;
  ok: boolean;
  items: RawItem[];
  error?: string;
  durationMs: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * DEMO connector. Releases the fixture documents of the next batch; documents of
 * earlier batches are listed again (as a real feed would) and are filtered out by
 * the de-duplication step. Clearly labelled as demo data in the UI.
 */
export async function fetchFixtureFeed(releaseBatch: number): Promise<FetchOutcome[]> {
  const outcomes: FetchOutcome[] = [];
  for (const src of DEMO_SOURCES.filter((s) => s.batch <= releaseBatch)) {
    const t0 = Date.now();
    await sleep(60 + (src.slug.length % 5) * 40);
    if (src.failure) {
      outcomes.push({ name: src.publisher, url: demoSourceUrl(src.slug), ok: false, items: [], error: src.failure.message, durationMs: Date.now() - t0 + 8000 });
      continue;
    }
    outcomes.push({
      name: src.publisher,
      url: demoSourceUrl(src.slug),
      ok: true,
      durationMs: Date.now() - t0,
      items: [{
        connector: "fixture",
        url: demoSourceUrl(src.slug),
        publisher: src.publisher,
        sourceType: src.sourceType,
        title: src.title,
        publishedAt: src.publishedAt,
        body: src.html,
        isHtml: true,
        isFictional: true,
        hint: { incidentKey: src.incidentKey },
      }],
    });
  }
  return outcomes;
}

export function fixtureIncident(key: string) {
  return DEMO_INCIDENTS.find((i) => i.key === key) ?? null;
}

/** LIVE connector: RSS 2.0 / RSS 1.0 (RDF) / Atom. Enabled with COLLECTOR_LIVE_RSS=true and COLLECTOR_RSS_URLS. */
export async function fetchRss(feedUrl: string): Promise<FetchOutcome> {
  const t0 = Date.now();
  try {
    const u = new URL(feedUrl);
    if (u.protocol !== "https:") throw new Error("HTTPSのフィードのみ対応しています");
    const res = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "AIIP-Collector/0.1 (+demo)" }, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).slice(0, 1_000_000);
    const items: RawItem[] = [];
    const channel = /<title>([\s\S]*?)<\/title>/.exec(text)?.[1]?.trim() ?? u.hostname;
    for (const m of text.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)) {
      const x = m[0];
      const pick = (tag: string) => /<(?:\w+:)?TAG\b[^>]*>([\s\S]*?)<\/(?:\w+:)?TAG>/.source.replace(/TAG/g, tag);
      const get = (tag: string) => new RegExp(pick(tag)).exec(x)?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() ?? "";
      const link = get("link") || /<link[^>]+href="([^"]+)"/.exec(x)?.[1] || "";
      if (!/^https?:\/\//.test(link)) continue;
      items.push({
        connector: "rss",
        url: link,
        publisher: channel.replace(/<!\[CDATA\[|\]\]>/g, "").slice(0, 120),
        sourceType: "news",
        title: get("title").slice(0, 200) || "(無題)",
        publishedAt: get("pubDate") || get("date") || get("updated") || null,
        body: `${get("title")}\n${get("description") || get("summary") || get("content")}`,
        isHtml: true,
        isFictional: false,
      });
      if (items.length >= 10) break;
    }
    return { name: channel, url: feedUrl, ok: true, items, durationMs: Date.now() - t0 };
  } catch (e) {
    return { name: feedUrl, url: feedUrl, ok: false, items: [], error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - t0 };
  }
}

export function liveFeedUrls(): string[] {
  return (process.env.COLLECTOR_RSS_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
}
