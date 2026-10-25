/**
 * Demo seed / reset. Runs with the worker role (system job). All data is fictional.
 * Used by `npm run db:seed` and by the in-app "デモをリセット" action.
 */
import type postgres from "postgres";
import { hashPassword } from "@/lib/auth/password";
import { buildSimulatedArticle, type SimSource } from "@/lib/ai/simulation";
import type { ArticleContent } from "@/lib/domain/article";
import { fingerprint } from "@/lib/domain/dedupe";
import { contentHash, sha256 } from "@/lib/domain/hash";
import { sanitizeSourceText } from "@/lib/domain/sanitize";
import { DEMO_INCIDENTS, DEMO_SOURCES, demoSourceUrl } from "./sources";
import { DEMO_TENANTS, DEMO_USERS } from "./tenants";


const DATA_TABLES = [
  "ai_jobs", "sandbox_accounts", "audit_logs", "notifications", "ai_execution_logs", "published_pages", "approvals", "article_transitions",
  "article_versions", "article_drafts", "tenant_incident_reviews", "incident_events", "collection_runs",
  "incident_sources", "incidents", "sources", "collector_state", "backup_runs", "sessions", "subscriptions",
  "tenant_settings", "tenant_memberships", "users", "tenants",
];

const at = (iso: string, plusHours = 0) => new Date(Date.parse(iso) + plusHours * 3_600_000);

export interface SeedResult {
  tenants: Record<string, string>;
  users: Record<string, string>;
  incidents: Record<string, string>;
}

export async function seedDemo(sql: postgres.Sql): Promise<SeedResult> {
  const pwHashes = new Map<string, string>();
  for (const u of DEMO_USERS) pwHashes.set(u.key, await hashPassword(u.password));

  return sql.begin(async (tx) => {
    await tx.unsafe(`truncate ${DATA_TABLES.join(", ")} cascade`);
    const now = new Date();

    // ── tenants / users ──
    const tenants: Record<string, string> = {};
    for (const t of DEMO_TENANTS) {
      const [row] = await tx`
        insert into tenants (slug, name, short_name, logo_mark, brand_primary, brand_accent)
        values (${t.slug}, ${t.name}, ${t.shortName}, ${t.logoMark}, ${t.brandPrimary}, ${t.brandAccent}) returning id`;
      tenants[t.slug] = row.id;
      await tx`
        insert into tenant_settings (tenant_id, firm_display_name, tagline, lawyers, consultation_form_url, fee_notice, address, phone, office_hours)
        values (${row.id}, ${t.name}, ${t.tagline}, ${tx.json(t.lawyers as unknown as postgres.JSONValue)}, ${t.formUrl}, ${t.feeNotice}, ${t.address}, ${t.phone}, ${t.officeHours})`;
      await tx`
        insert into subscriptions (tenant_id, plan, status, started_on, ends_on, monthly_fee_jpy, ai_monthly_call_limit)
        values (${row.id}, ${t.plan}, 'active', (now() at time zone 'Asia/Tokyo')::date - 155, (now() at time zone 'Asia/Tokyo')::date + ${t.endsInDays}::int,
                ${t.monthlyFee}, ${t.aiLimit})`;
    }
    const users: Record<string, string> = {};
    for (const u of DEMO_USERS) {
      const [row] = await tx`
        insert into users (email, display_name, password_hash, platform_role)
        values (${u.email}, ${u.name}, ${pwHashes.get(u.key)!}, ${u.platformRole}) returning id`;
      users[u.key] = row.id;
      for (const m of u.memberships) {
        await tx`insert into tenant_memberships (tenant_id, user_id, role, title) values (${tenants[m.tenant]}, ${row.id}, ${m.role}, ${m.title})`;
      }
    }

    // ── shared incident data (batch 0) ──
    const incidents: Record<string, string> = {};
    const sourceRows = new Map<string, SimSource & { incidentKey: string; slug: string }>();
    for (const inc of DEMO_INCIDENTS.filter((i) => i.batch === 0)) {
      const detected = at(`${inc.disclosedOn}T09:00:00+09:00`, 24);
      const [row] = await tx`
        insert into incidents (fingerprint, title, organization_name, category, summary, occurred_on, disclosed_on, last_updated_at,
          affected_count, affected_count_status, severity, classification, created_at)
        values (${fingerprint({ organization: inc.organization, title: inc.title, disclosedOn: inc.disclosedOn })}, ${inc.title}, ${inc.organization},
          ${inc.category}, ${""}, ${inc.occurredOn}, ${inc.disclosedOn}, ${detected}, ${inc.affected.count}, ${inc.affected.status}, ${inc.severity},
          ${tx.json({ method: "seed", provider: "simulation", confidence: 0.9 })}, ${detected})
        returning id`;
      incidents[inc.key] = row.id;
      await tx`insert into incident_events (incident_id, event_type, detected_at, new_value) values (${row.id}, 'detected', ${detected}, ${inc.title})`;
    }
    for (const src of DEMO_SOURCES.filter((s) => s.batch === 0 && !s.failure)) {
      const { text, flags } = sanitizeSourceText(src.html, true);
      const fetched = at(src.publishedAt, 2);
      const url = demoSourceUrl(src.slug);
      const [row] = await tx`
        insert into sources (connector, url, publisher, source_type, title, published_at, fetched_at, content_text, content_hash, injection_flags)
        values ('fixture', ${url}, ${src.publisher}, ${src.sourceType}, ${src.title}, ${src.publishedAt}, ${fetched}, ${text}, ${sha256(text)}, ${tx.json(flags as unknown as postgres.JSONValue)})
        returning id`;
      const incidentId = incidents[src.incidentKey];
      await tx`insert into incident_sources (incident_id, source_id, relation, added_at) values (${incidentId}, ${row.id}, ${src.relation}, ${fetched})`;
      await tx`insert into incident_events (incident_id, event_type, source_id, detected_at, new_value) values (${incidentId}, 'source_added', ${row.id}, ${fetched}, ${src.title})`;
      sourceRows.set(src.slug, {
        id: row.id, publisher: src.publisher, title: src.title, url, source_type: src.sourceType,
        published_at: src.publishedAt, content_text: text, incidentKey: src.incidentKey, slug: src.slug,
      });
    }
    // incident summaries = first sentence of the first official source
    for (const inc of DEMO_INCIDENTS.filter((i) => i.batch === 0)) {
      const first = [...sourceRows.values()].find((s) => s.incidentKey === inc.key && s.source_type === "official");
      const summary = first ? first.content_text.split("\n")[0].slice(0, 200) : inc.title;
      await tx`update incidents set summary = ${summary} where id = ${incidents[inc.key]}`;
    }
    // さくら: update already received → material change on record
    await tx`
      insert into incident_events (incident_id, event_type, field, old_value, new_value, is_material, source_id, detected_at)
      values (${incidents.sakura}, 'material_change', 'affected_count', '約1,800件（推計）', '2,136件（確定）・氏名を含む', true,
        ${sourceRows.get("sakura-juku-mail-2")!.id}, ${at("2026-10-10T20:00:00+09:00")})`;
    await tx`update incidents set has_material_update = true, last_updated_at = ${at("2026-10-10T20:00:00+09:00")} where id = ${incidents.sakura}`;
    await tx`insert into collector_state (key, value) values ('fixture_cursor', ${tx.json({ batch: 0 })})`;

    const srcFor = (key: string, slugs?: string[]) =>
      [...sourceRows.values()].filter((s) => s.incidentKey === key && (!slugs || slugs.includes(s.slug)));
    const incFor = (key: string) => {
      const d = DEMO_INCIDENTS.find((i) => i.key === key)!;
      return { title: d.title, organization_name: d.organization, category: d.category, disclosed_on: d.disclosedOn };
    };
    const tenantMeta = (slug: string) => {
      const t = DEMO_TENANTS.find((x) => x.slug === slug)!;
      return { firmName: t.name, firmShort: t.shortName };
    };

    // ── articles ──
    interface SeedArticle {
      tenant: string;
      incident: string;
      slug: string;
      author: string;
      approver?: string;
      flow: "draft" | "in_review" | "published" | "published_with_update";
      sources?: string[];
      updateSources?: string[];
      mutate?: (c: ArticleContent) => ArticleContent;
      createdAt: string;
    }
    const plan: SeedArticle[] = [
      { tenant: "seiran-law", incident: "minato", slug: "minato-seiki-data-breach", author: "seiran-lawyer", approver: "seiran-lawyer", flow: "published", createdAt: "2026-10-07T10:00:00+09:00" },
      {
        tenant: "seiran-law", incident: "aoba", slug: "aoba-life-subscription", author: "seiran-editor", flow: "draft", createdAt: "2026-10-16T11:00:00+09:00",
        mutate: (c) => {
          // the editor's draft contains expressions the ad check must catch
          const blocks = c.blocks.map((b) => b.type === "paragraph" && b.sentences.some((s) => s.kind === "notice")
            ? { ...b, sentences: [
                { id: "ad1", text: "当事務所の専門弁護士にご依頼いただければ、必ず返金されます。", kind: "notice" as const, refs: [] },
                { id: "ad2", text: "今すぐ相談しないと手遅れになるおそれがあります。", kind: "notice" as const, refs: [] },
                ...b.sentences,
              ] }
            : b);
          return { ...c, blocks };
        },
      },
      { tenant: "seiran-law", incident: "hokuto", slug: "hokuto-cloud-ransomware", author: "seiran-editor", flow: "in_review", createdAt: "2026-10-19T15:00:00+09:00" },
      {
        tenant: "seiran-law", incident: "sakura", slug: "sakura-juku-email-misdelivery", author: "seiran-lawyer", approver: "seiran-lawyer",
        flow: "published_with_update", sources: ["sakura-juku-mail-1"], updateSources: ["sakura-juku-mail-1", "sakura-juku-mail-2"], createdAt: "2026-10-01T10:00:00+09:00",
      },
      { tenant: "hiiragi-law", incident: "koyo", slug: "koyo-financial-phishing", author: "hiiragi-lawyer", approver: "hiiragi-lawyer", flow: "published", createdAt: "2026-10-10T10:00:00+09:00" },
      { tenant: "hiiragi-law", incident: "minato", slug: "minato-seiki-leak-guide", author: "hiiragi-lawyer", flow: "draft", createdAt: "2026-10-08T14:00:00+09:00" },
      { tenant: "hiiragi-law", incident: "hokuto", slug: "hokuto-cloud-outage", author: "hiiragi-lawyer", flow: "draft", createdAt: "2026-10-19T18:00:00+09:00" },
    ];

    for (const a of plan) {
      const tenantId = tenants[a.tenant];
      const author = users[a.author];
      const created = new Date(a.createdAt);
      let content = buildSimulatedArticle(incFor(a.incident), srcFor(a.incident, a.sources), tenantMeta(a.tenant));
      if (a.mutate) content = a.mutate(content);
      const hash = contentHash(content);
      const [draft] = await tx`
        insert into article_drafts (tenant_id, incident_id, slug, status, working, working_hash, working_updated_at, working_updated_by, created_by, created_at, updated_at)
        values (${tenantId}, ${incidents[a.incident]}, ${a.slug}, 'draft', ${tx.json(content as unknown as postgres.JSONValue)}, ${hash}, ${created}, ${author}, ${author}, ${created}, ${created})
        returning id`;
      const [log] = await tx`
        insert into ai_execution_logs (job_key, tenant_id, task, prompt_id, prompt_version, provider, model, status, input_summary, output,
          input_tokens, output_tokens, cost_usd, duration_ms, article_id, incident_id, created_by, created_at, finished_at)
        values (${`seed:generate:${draft.id}`}, ${tenantId}, 'article_generate', 'article_generate', '2026-10-25.1', 'simulation', 'simulation-extractive-v1', 'succeeded',
          ${tx.json({ sources: srcFor(a.incident, a.sources).map((s) => ({ id: s.id, publisher: s.publisher, chars: s.content_text.length })) })},
          ${tx.json({ title: content.title, blocks: content.blocks.length })}, 2140, 1890, 0, 1180, ${draft.id}, ${incidents[a.incident]}, ${author}, ${created}, ${new Date(created.getTime() + 1180)})
        returning id`;
      const [v1] = await tx`
        insert into article_versions (tenant_id, article_id, version_no, kind, content, content_hash, ai_log_id, note, created_by, created_at)
        values (${tenantId}, ${draft.id}, 1, 'ai_generated', ${tx.json(content as unknown as postgres.JSONValue)}, ${hash}, ${log.id}, 'AI初回生成（シミュレーション）', ${author}, ${created})
        returning id`;
      await tx`update article_drafts set current_version_id = ${v1.id} where id = ${draft.id}`;
      await tx`insert into audit_logs (tenant_id, actor_id, action, target_type, target_id, created_at) values (${tenantId}, ${author}, 'article.generate', 'article', ${draft.id}, ${created})`;

      if (a.flow === "draft") continue;

      const submittedAt = new Date(created.getTime() + 3 * 3_600_000);
      await tx`update article_drafts set status = 'in_review', review_version_id = ${v1.id}, updated_at = ${submittedAt} where id = ${draft.id}`;
      await tx`insert into article_transitions (tenant_id, article_id, from_status, to_status, action, actor_id, version_id, created_at)
               values (${tenantId}, ${draft.id}, 'draft', 'in_review', 'submit', ${author}, ${v1.id}, ${submittedAt})`;
      if (a.flow === "in_review") {
        await tx`insert into notifications (tenant_id, audience, kind, severity, title, body, link, created_at)
                 values (${tenantId}, 'tenant', 'approval_requested', 'info', '承認申請が届いています', ${`「${content.title}」の承認申請（v1）`}, ${`/app/articles/${draft.id}`}, ${submittedAt})`;
        continue;
      }

      const approvedAt = new Date(submittedAt.getTime() + 2 * 3_600_000);
      const approver = users[a.approver!];
      const [ap] = await tx`
        insert into approvals (tenant_id, article_id, version_id, decision, approver_id, comment, checks, created_at)
        values (${tenantId}, ${draft.id}, ${v1.id}, 'approved', ${approver}, '公表情報との整合を確認しました。', ${tx.json({ blocking: 0 })}, ${approvedAt}) returning id`;
      await tx`insert into article_transitions (tenant_id, article_id, from_status, to_status, action, actor_id, version_id, created_at)
               values (${tenantId}, ${draft.id}, 'in_review', 'approved', 'approve', ${approver}, ${v1.id}, ${approvedAt})`;
      const publishedAt = new Date(approvedAt.getTime() + 30 * 60_000);
      await tx`
        insert into published_pages (tenant_id, article_id, version_id, approval_id, slug, status, content, source_snapshot, incident_id, published_at, published_by, updated_at)
        values (${tenantId}, ${draft.id}, ${v1.id}, ${ap.id}, ${a.slug}, 'live', ${tx.json(content as unknown as postgres.JSONValue)},
          ${tx.json(srcFor(a.incident).map((s) => ({ id: s.id, publisher: s.publisher, title: s.title, url: s.url, published_at: s.published_at })))},
          ${incidents[a.incident]}, ${publishedAt}, ${approver}, ${publishedAt})`;
      await tx`update article_drafts set status = 'published', published_version_id = ${v1.id}, updated_at = ${publishedAt} where id = ${draft.id}`;
      await tx`insert into article_transitions (tenant_id, article_id, from_status, to_status, action, actor_id, version_id, created_at)
               values (${tenantId}, ${draft.id}, 'approved', 'published', 'publish', ${approver}, ${v1.id}, ${publishedAt})`;
      await tx`insert into audit_logs (tenant_id, actor_id, action, target_type, target_id, metadata, created_at)
               values (${tenantId}, ${approver}, 'article.publish', 'article', ${draft.id}, ${tx.json({ version: 1 })}, ${publishedAt})`;

      if (a.flow === "published_with_update") {
        const updatedAt = at("2026-10-10T20:05:00+09:00");
        const proposal = buildSimulatedArticle(incFor(a.incident), srcFor(a.incident, a.updateSources), tenantMeta(a.tenant), "u");
        const pHash = contentHash(proposal);
        const [ulog] = await tx`
          insert into ai_execution_logs (job_key, tenant_id, task, prompt_id, prompt_version, provider, model, status, input_summary, output,
            input_tokens, output_tokens, cost_usd, duration_ms, article_id, incident_id, created_at, finished_at)
          values (${`seed:update:${draft.id}`}, ${tenantId}, 'update_proposal', 'update_proposal', '2026-10-25.1', 'simulation', 'simulation-extractive-v1', 'succeeded',
            ${tx.json({ trigger: "material_change", field: "affected_count" })}, ${tx.json({ title: proposal.title })}, 2610, 2050, 0, 1320, ${draft.id}, ${incidents[a.incident]}, ${updatedAt}, ${updatedAt})
          returning id`;
        const [v2] = await tx`
          insert into article_versions (tenant_id, article_id, version_no, kind, content, content_hash, ai_log_id, note, created_at)
          values (${tenantId}, ${draft.id}, 2, 'update_proposal', ${tx.json(proposal as unknown as postgres.JSONValue)}, ${pHash}, ${ulog.id}, '続報（調査結果の公表）に基づく更新案', ${updatedAt})
          returning id`;
        const pending = { field: "affected_count", label: "影響件数", before: "約1,800件（推計）", after: "2,136件（確定）・氏名を含む", detected_at: updatedAt.toISOString() };
        await tx`update article_drafts set status = 'revision_required', working = ${tx.json(proposal as unknown as postgres.JSONValue)}, working_hash = ${pHash},
                 working_updated_at = ${updatedAt}, working_updated_by = null, current_version_id = ${v2.id}, pending_update = ${tx.json(pending)}, updated_at = ${updatedAt}
                 where id = ${draft.id}`;
        await tx`insert into article_transitions (tenant_id, article_id, from_status, to_status, action, actor_id, version_id, comment, created_at)
                 values (${tenantId}, ${draft.id}, 'published', 'revision_required', 'material_update', null, ${v2.id}, '重要な続報を検出したため再承認待ちに変更（公開版 v1 は維持）', ${updatedAt})`;
        await tx`insert into notifications (tenant_id, audience, kind, severity, title, body, link, created_at)
                 values (${tenantId}, 'tenant', 'material_update', 'warning', '公開中の記事に重要な続報があります', '影響件数が確定しました（約1,800件 → 2,136件）。更新案を確認し再承認してください。', ${`/app/articles/${draft.id}/diff`}, ${updatedAt})`;
      }
    }

    // a few tenant-private review states
    for (const [tenant, key, status] of [
      ["seiran-law", "minato", "confirmed"], ["seiran-law", "aoba", "reviewing"], ["seiran-law", "hokuto", "confirmed"],
      ["seiran-law", "sakura", "confirmed"], ["hiiragi-law", "koyo", "confirmed"], ["hiiragi-law", "minato", "reviewing"],
    ] as const) {
      await tx`insert into tenant_incident_reviews (tenant_id, incident_id, status, reviewed_at) values (${tenants[tenant]}, ${incidents[key]}, ${status}, ${now})`;
    }

    // historical AI usage so the operations center has a realistic month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const tasks = ["classify", "seo_title", "meta_description", "sns_post", "paragraph_regenerate"];
    for (const [slug, count] of [["seiran-law", 46], ["hiiragi-law", 31]] as const) {
      for (let i = 0; i < count; i++) {
        const ts = new Date(monthStart.getTime() + ((now.getTime() - monthStart.getTime()) * (i + 0.5)) / count);
        const task = tasks[i % tasks.length];
        const failed = i % 23 === 7;
        await tx`
          insert into ai_execution_logs (job_key, tenant_id, task, prompt_id, prompt_version, provider, model, status, input_summary,
            error_code, error_message, input_tokens, output_tokens, cost_usd, duration_ms, created_at, finished_at)
          values (${`seed:hist:${slug}:${i}`}, ${tenants[slug]}, ${task}, ${task}, '2026-10-25.1', 'simulation', 'simulation-extractive-v1',
            ${failed ? "failed" : "succeeded"}, ${tx.json({ note: "デモ用の履歴データ" })}, ${failed ? "AI_PROVIDER_ERROR" : null},
            ${failed ? "上流APIがタイムアウトしました（デモ用の履歴）" : null}, ${600 + (i % 7) * 90}, ${180 + (i % 5) * 60}, 0, ${700 + (i % 9) * 110}, ${ts}, ${ts})`;
      }
    }

    return { tenants, users, incidents };
  });
}

export const DEMO_CREDENTIALS = DEMO_USERS.map(({ key, email, password, persona, name }) => ({ key, email, password, persona, name }));
