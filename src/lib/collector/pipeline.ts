import "server-only";
import { AiError } from "@/lib/ai/errors";
import { aiMode, executeAiTask } from "@/lib/ai/run";
import { ClassifyStrict, ClassifyWire, validateArticle, ArticleWire, articleFromWire, type ClassifyResult } from "@/lib/ai/schemas";
import { buildSimulatedArticle } from "@/lib/ai/simulation";
import type { Viewer } from "@/lib/auth/session";
import { json, workerSql } from "@/lib/db";
import { env } from "@/lib/env";
import { classifyByRules, extractAffectedCount } from "@/lib/domain/classify";
import { findDuplicate, fingerprint } from "@/lib/domain/dedupe";
import { detectMaterialChanges, type MaterialChange } from "@/lib/domain/diff";
import { contentHash, sha256 } from "@/lib/domain/hash";
import { fenceUntrusted, sanitizeSourceText } from "@/lib/domain/sanitize";
import { CATEGORY_LABEL, type Category } from "@/lib/domain/types";
import { logError } from "@/lib/security/redact";
import { ApiError } from "@/lib/server/errors";
import { fetchFixtureFeed, fetchRss, fixtureIncident, liveFeedUrls, type FetchOutcome, type RawItem } from "./connectors";
import type { CollectEvent, CollectStats } from "./events";

type Emit = (e: CollectEvent) => void;

interface Normalized extends RawItem {
  text: string;
  hash: string;
  flags: { pattern: string; excerpt: string }[];
}

interface Classified extends Normalized {
  c: ClassifyResult;
  method: string;
}

const MAX_FIXTURE_BATCH = 1;

function toDate(s: string | null): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);
}

function simulateClassify(item: Normalized): ClassifyResult {
  const rules = classifyByRules(item.text);
  const hint = item.hint ? fixtureIncident(item.hint.incidentKey) : null;
  const affected = extractAffectedCount(item.text);
  if (hint) {
    return {
      is_incident: true,
      organization: hint.organization,
      incident_title: hint.title,
      category: hint.category,
      confidence: Math.max(rules.confidence, 0.8),
      rationale: `キーワード一致: ${rules.matched.slice(0, 5).join("、") || "なし"}（シミュレーション: デモ用の抽出結果を使用）`,
      affected_count: affected?.count ?? null,
      affected_count_status: affected?.status ?? "unknown",
      occurred_on: hint.occurredOn,
      disclosed_on: toDate(item.publishedAt) ?? hint.disclosedOn,
    };
  }
  return {
    is_incident: rules.category !== "other",
    organization: item.publisher,
    incident_title: item.title.slice(0, 100),
    category: rules.category,
    confidence: rules.confidence,
    rationale: `ルール分類（キーワード: ${rules.matched.slice(0, 5).join("、") || "なし"}）`,
    affected_count: affected?.count ?? null,
    affected_count_status: affected?.status ?? "unknown",
    occurred_on: null,
    disclosed_on: toDate(item.publishedAt),
  };
}

export async function runCollection(viewer: Viewer, emit: Emit): Promise<void> {
  const sql = workerSql();
  const tenant = viewer.tenant!;
  const stats: CollectStats = { fetched: 0, failedSources: 0, newSources: 0, duplicates: 0, newIncidents: 0, updates: 0, materialChanges: 0, injectionFlags: 0, proposals: 0 };
  const steps: { step: string; status: string; at: string; detail?: string }[] = [];
  const sourceResults: unknown[] = [];

  await sql`update collection_runs set status = 'failed', finished_at = now() where status = 'running' and started_at < now() - interval '5 minutes'`;
  let runId: string;
  try {
    const [run] = await sql`
      insert into collection_runs (job_key, triggered_by, tenant_id, status)
      values (${`collect:${Date.now()}:${viewer.userId}`}, ${viewer.userId}, ${tenant.id}, 'running') returning id`;
    runId = run.id;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ApiError(409, "COLLECTION_RUNNING", "別の情報収集が実行中です。完了までお待ちください。");
    throw e;
  }

  const live = env.liveRss && liveFeedUrls().length > 0;
  emit({ type: "start", runId, mode: live ? "demo+live" : "demo", aiProvider: aiMode().provider });
  const mark = (step: CollectEvent & { type: "step" }) => {
    steps.push({ step: step.step, status: step.status, at: new Date().toISOString(), detail: step.detail });
    emit(step);
  };

  try {
    // ── 1. fetch ──
    mark({ type: "step", step: "fetch", status: "running" });
    const [cursorRow] = await sql`select value from collector_state where key = 'fixture_cursor'`;
    const cursor = Number((cursorRow?.value as { batch?: number })?.batch ?? 0);
    const release = Math.min(cursor + 1, MAX_FIXTURE_BATCH);
    const outcomes: FetchOutcome[] = await fetchFixtureFeed(release);
    if (live) outcomes.push(...(await Promise.all(liveFeedUrls().map(fetchRss))));
    for (const o of outcomes) {
      emit({ type: "source", name: o.name, url: o.url, ok: o.ok, items: o.items.length, error: o.error, durationMs: o.durationMs });
      sourceResults.push({ name: o.name, url: o.url, ok: o.ok, items: o.items.length, error: o.error ?? null, durationMs: o.durationMs });
      if (!o.ok) stats.failedSources++;
    }
    const raw = outcomes.flatMap((o) => o.items);
    stats.fetched = raw.length;
    mark({ type: "step", step: "fetch", status: "done", count: raw.length, detail: `${outcomes.length}件の情報源から${raw.length}件取得（失敗 ${stats.failedSources}件）` });

    // ── 2. normalize ──
    mark({ type: "step", step: "normalize", status: "running" });
    const normalized: Normalized[] = raw.map((r) => {
      const s = sanitizeSourceText(r.body, r.isHtml);
      return { ...r, text: s.text, hash: sha256(s.text), flags: s.flags };
    }).filter((n) => n.text.length > 20);
    mark({ type: "step", step: "normalize", status: "done", count: normalized.length, detail: `${normalized.length}件をプレーンテキスト化` });

    // ── 3. dedupe (by URL and content hash) ──
    mark({ type: "step", step: "dedupe", status: "running" });
    const known = await sql`select url, content_hash from sources where url = any(${normalized.map((n) => n.url)}) or content_hash = any(${normalized.map((n) => n.hash)})`;
    const knownUrls = new Set(known.map((k) => k.url as string));
    const knownHashes = new Set(known.map((k) => k.content_hash as string));
    const fresh: Normalized[] = [];
    for (const n of normalized) {
      if (knownUrls.has(n.url) || knownHashes.has(n.hash)) {
        stats.duplicates++;
        emit({ type: "item", title: n.title, outcome: "duplicate", detail: knownUrls.has(n.url) ? "取得済みのURL" : "本文が既存の出典と同一" });
      } else fresh.push(n);
    }
    stats.newSources = fresh.length;
    mark({ type: "step", step: "dedupe", status: "done", count: fresh.length, detail: `新規 ${fresh.length}件 / 重複として除外 ${stats.duplicates}件` });

    // ── 4. classify (AI, with rule fallback) ──
    mark({ type: "step", step: "classify", status: "running" });
    const classified: Classified[] = [];
    for (const n of fresh) {
      stats.injectionFlags += n.flags.length;
      let c: ClassifyResult;
      let method = aiMode().provider === "anthropic" ? `AI（${aiMode().model}）` : "AI（シミュレーション）";
      try {
        const res = await executeAiTask({
          tenantId: tenant.id,
          userId: viewer.userId,
          task: "classify",
          jobKey: `classify:${runId}:${n.hash.slice(0, 16)}`,
          inputSummary: { url: n.url, publisher: n.publisher, chars: n.text.length, injection_flags: n.flags.map((f) => f.pattern) },
          inputChars: n.text.length,
          buildUserPrompt: () => `情報源: ${n.publisher}\nタイトル: ${n.title}\n公表日時: ${n.publishedAt ?? "不明"}\n\n${fenceUntrusted("src", n.text)}`,
          wire: ClassifyWire,
          simulate: () => simulateClassify(n),
          validate: (r) => ClassifyStrict.parse(r),
        });
        c = res.output;
      } catch (e) {
        c = simulateClassify(n);
        method = e instanceof AiError && e.code === "AI_LIMIT" ? "ルール分類（AI利用上限のため）" : "ルール分類（AI処理失敗のため）";
      }
      classified.push({ ...n, c, method });
    }
    mark({ type: "step", step: "classify", status: "done", count: classified.length, detail: `${classified.length}件を分類${stats.injectionFlags ? `・不審な命令文 ${stats.injectionFlags}件を検出（無害化して保存）` : ""}` });

    // ── 5. save ──
    mark({ type: "step", step: "save", status: "running" });
    const material: { incidentId: string; changes: MaterialChange[]; sourceId: string }[] = [];
    await sql.begin(async (tx) => {
      const existing = await tx`select id, organization_name, title, disclosed_on, affected_count, affected_count_status, category, severity from incidents`;
      const targets = existing.map((e) => ({
        id: e.id as string,
        organization: e.organization_name as string,
        title: e.title as string,
        disclosedOn: e.disclosed_on ? new Date(e.disclosed_on).toISOString().slice(0, 10) : null,
      }));
      for (const item of classified) {
        if (!item.c.is_incident) {
          emit({ type: "item", title: item.title, outcome: "skipped", detail: "事件情報ではないと判定" });
          continue;
        }
        const [src] = await tx`
          insert into sources (connector, url, publisher, source_type, title, published_at, content_text, content_hash, injection_flags, is_fictional)
          values (${item.connector}, ${item.url}, ${item.publisher}, ${item.sourceType}, ${item.title}, ${item.publishedAt ? new Date(item.publishedAt) : null},
                  ${item.text}, ${item.hash}, ${json(tx, item.flags)}, ${item.isFictional})
          on conflict (url) do nothing returning id`;
        if (!src) continue;
        const dup = findDuplicate({ organization: item.c.organization, title: item.c.incident_title, disclosedOn: item.c.disclosed_on }, targets);
        if (dup) {
          const before = existing.find((e) => e.id === dup.target.id)!;
          const hasNewCount = item.c.affected_count !== null && (item.c.affected_count !== before.affected_count || item.c.affected_count_status !== before.affected_count_status);
          const after = {
            affected_count: hasNewCount ? item.c.affected_count : before.affected_count,
            affected_count_status: hasNewCount ? item.c.affected_count_status : before.affected_count_status,
            category: before.category,
            severity: before.severity,
          };
          const changes = detectMaterialChanges(before as never, after);
          const relation = changes.length > 0 || item.sourceType === "official" ? "update" : "related";
          await tx`insert into incident_sources (incident_id, source_id, relation) values (${dup.target.id}, ${src.id}, ${relation}) on conflict do nothing`;
          await tx`insert into incident_events (incident_id, event_type, source_id, collection_run_id, new_value) values (${dup.target.id}, 'source_added', ${src.id}, ${runId}, ${item.title})`;
          if (changes.length) {
            for (const ch of changes) {
              await tx`insert into incident_events (incident_id, event_type, field, old_value, new_value, is_material, source_id, collection_run_id)
                       values (${dup.target.id}, 'material_change', ${ch.field}, ${ch.before}, ${ch.after}, true, ${src.id}, ${runId})`;
            }
            await tx`update incidents set affected_count = ${after.affected_count}, affected_count_status = ${after.affected_count_status},
                     has_material_update = true, last_updated_at = now() where id = ${dup.target.id}`;
            material.push({ incidentId: dup.target.id, changes, sourceId: src.id });
            stats.materialChanges++;
          } else {
            await tx`update incidents set last_updated_at = now() where id = ${dup.target.id}`;
          }
          stats.updates++;
          emit({
            type: "item", title: item.title, outcome: changes.length ? "update" : "related", flagged: item.flags.length > 0,
            detail: changes.length ? `既存事件の続報: ${changes.map((c) => `${c.label} ${c.before} → ${c.after}`).join(" / ")}` : `既存事件に関連付け（${dup.reason}）`,
          });
        } else {
          const fp = fingerprint({ organization: item.c.organization, title: item.c.incident_title, disclosedOn: item.c.disclosed_on });
          const [inc] = await tx`
            insert into incidents (fingerprint, title, organization_name, category, summary, occurred_on, disclosed_on, affected_count, affected_count_status,
              severity, classification, is_fictional)
            values (${fp}, ${item.c.incident_title}, ${item.c.organization}, ${item.c.category}, ${item.text.split("\n")[0].slice(0, 200)},
              ${item.c.occurred_on}, ${item.c.disclosed_on}, ${item.c.affected_count}, ${item.c.affected_count_status}, 'medium',
              ${json(tx, { method: item.method, confidence: item.c.confidence, rationale: item.c.rationale })}, ${item.isFictional})
            on conflict (fingerprint) do nothing returning id`;
          if (!inc) continue;
          await tx`insert into incident_sources (incident_id, source_id, relation) values (${inc.id}, ${src.id}, 'initial')`;
          await tx`insert into incident_events (incident_id, event_type, collection_run_id, new_value) values (${inc.id}, 'detected', ${runId}, ${item.c.incident_title})`;
          targets.push({ id: inc.id, organization: item.c.organization, title: item.c.incident_title, disclosedOn: item.c.disclosed_on });
          existing.push({ id: inc.id, organization_name: item.c.organization, title: item.c.incident_title, disclosed_on: item.c.disclosed_on, affected_count: item.c.affected_count, affected_count_status: item.c.affected_count_status, category: item.c.category, severity: "medium" } as never);
          stats.newIncidents++;
          emit({
            type: "item", title: item.c.incident_title, outcome: "new_incident", category: CATEGORY_LABEL[item.c.category as Category], flagged: item.flags.length > 0,
            detail: `${item.method} / 確信度 ${(item.c.confidence * 100).toFixed(0)}%${item.flags.length ? " / 命令文を検出し無害化" : ""}`,
          });
        }
      }
      await tx`insert into collector_state (key, value, updated_at) values ('fixture_cursor', ${json(tx, { batch: release })}, now())
               on conflict (key) do update set value = excluded.value, updated_at = now()`;
    });

    for (const m of material) stats.proposals += await handleMaterialUpdate(m.incidentId, m.changes, runId);
    mark({ type: "step", step: "save", status: "done", detail: `新規事件 ${stats.newIncidents}件 / 続報・関連 ${stats.updates}件 / 更新案 ${stats.proposals}件` });

    const status = stats.failedSources > 0 ? "partial" : "succeeded";
    await sql`update collection_runs set status = ${status}, finished_at = now(), stats = ${json(sql as never, stats)}, steps = ${json(sql as never, steps)},
              source_results = ${json(sql as never, sourceResults)} where id = ${runId}`;
    if (stats.failedSources > 0) {
      await sql`insert into notifications (tenant_id, audience, kind, severity, title, body, link)
                values (null, 'operator', 'collection_failed', 'warning', '取得に失敗した情報源があります', ${`${stats.failedSources}件の情報源から取得できませんでした（実行ID ${runId.slice(0, 8)}）`}, '/app/radar')`;
    }
    emit({ type: "done", runId, status, stats });
  } catch (e) {
    logError("collector", e);
    await sql`update collection_runs set status = 'failed', finished_at = now(), stats = ${json(sql as never, stats)}, steps = ${json(sql as never, steps)}, source_results = ${json(sql as never, sourceResults)} where id = ${runId}`;
    emit({ type: "error", code: "COLLECTION_FAILED", message: "情報収集中にエラーが発生しました。再試行してください。" });
  }
}

/**
 * A material change was detected for an incident. For each tenant article:
 *  - in the approval flow / published → generate an update proposal into the working copy and require re-approval.
 *    The live published page is NOT touched (published_pages keeps the approved version).
 *  - still a draft → keep the author's text, flag the pending update.
 */
async function handleMaterialUpdate(incidentId: string, changes: MaterialChange[], runId: string): Promise<number> {
  const sql = workerSql();
  const articles = await sql`
    select a.id, a.tenant_id, a.status, a.working, t.name as firm_name, t.short_name
    from article_drafts a join tenants t on t.id = a.tenant_id where a.incident_id = ${incidentId} and a.status <> 'archived'`;
  if (!articles.length) return 0;
  const [incident] = await sql`select title, organization_name, category, disclosed_on from incidents where id = ${incidentId}`;
  const sources = await sql`
    select s.id, s.publisher, s.title, s.url, s.source_type, s.published_at, s.content_text
    from incident_sources i join sources s on s.id = i.source_id where i.incident_id = ${incidentId} order by s.published_at`;
  const simSources = sources.map((s) => ({ ...s, published_at: s.published_at ? new Date(s.published_at).toISOString() : null })) as never[];
  const pending = { ...changes[0], detected_at: new Date().toISOString(), all: changes };
  const summary = changes.map((c) => `${c.label}: ${c.before} → ${c.after}`).join(" / ");
  let proposals = 0;

  for (const a of articles) {
    const needsProposal = ["published", "approved", "in_review", "suspended"].includes(a.status);
    if (!needsProposal) {
      await sql`update article_drafts set pending_update = ${json(sql as never, pending)}, updated_at = now() where id = ${a.id}`;
      await sql`insert into notifications (tenant_id, audience, kind, severity, title, body, link)
                values (${a.tenant_id}, 'tenant', 'material_update', 'warning', '下書き中の記事に関連する続報があります', ${summary}, ${`/app/articles/${a.id}/diff`})`;
      continue;
    }
    const inc = {
      title: incident.title, organization_name: incident.organization_name, category: incident.category as Category,
      disclosed_on: incident.disclosed_on ? new Date(incident.disclosed_on).toISOString().slice(0, 10) : null,
    };
    let proposal = null;
    let logId: string | null = null;
    try {
      const res = await executeAiTask({
        tenantId: a.tenant_id,
        userId: null,
        task: "update_proposal",
        jobKey: `update_proposal:${a.id}:${runId}`,
        inputSummary: { trigger: "material_change", changes, sources: simSources.length },
        inputChars: sources.reduce((n, s) => n + String(s.content_text).length, 0),
        buildUserPrompt: () => [
          `検出された重要な変更: ${summary}`,
          `既存記事(JSON):\n${JSON.stringify(a.working)}`,
          `情報源 id: ${sources.map((s) => s.id).join(", ")}`,
          ...sources.map((s) => fenceUntrusted(s.id, s.content_text)),
        ].join("\n\n"),
        wire: ArticleWire,
        fromWire: articleFromWire,
        simulate: () => buildSimulatedArticle(inc, simSources, { firmName: a.firm_name, firmShort: a.short_name }, "u"),
        validate: (raw) => validateArticle(raw, new Set(sources.map((s) => s.id as string))),
        articleId: a.id,
        incidentId,
      });
      proposal = res.output;
      logId = res.logId;
    } catch (e) {
      logError("update_proposal", e);
    }
    await sql.begin(async (tx) => {
      let versionId: string | null = null;
      if (proposal) {
        const [n] = await tx`select coalesce(max(version_no), 0) + 1 as n from article_versions where article_id = ${a.id}`;
        const [v] = await tx`
          insert into article_versions (tenant_id, article_id, version_no, kind, content, content_hash, ai_log_id, note)
          values (${a.tenant_id}, ${a.id}, ${n.n}, 'update_proposal', ${json(tx, proposal)}, ${contentHash(proposal)}, ${logId}, ${`続報に基づく更新案（${summary}）`})
          returning id`;
        versionId = v.id;
        await tx`update article_drafts set working = ${json(tx, proposal)}, working_hash = ${contentHash(proposal)}, working_updated_at = now(), working_updated_by = null,
                 current_version_id = ${v.id} where id = ${a.id}`;
        proposals++;
      }
      await tx`update article_drafts set status = 'revision_required', pending_update = ${json(tx, pending)}, updated_at = now() where id = ${a.id}`;
      await tx`insert into article_transitions (tenant_id, article_id, from_status, to_status, action, actor_id, version_id, comment)
               values (${a.tenant_id}, ${a.id}, ${a.status}, 'revision_required', 'material_update', null, ${versionId},
                       ${`重要な続報を検出したため再承認待ちに変更（公開中のページは承認済みの版を維持）`})`;
      await tx`insert into notifications (tenant_id, audience, kind, severity, title, body, link)
               values (${a.tenant_id}, 'tenant', 'material_update', 'warning', '公開中の記事に重要な続報があります',
                       ${`${summary}。${proposal ? "AIが更新案を作成しました。差分を確認し再承認してください。" : "更新案の自動作成に失敗しました。手動で更新してください。"}`},
                       ${`/app/articles/${a.id}/diff`})`;
    });
  }
  return proposals;
}
