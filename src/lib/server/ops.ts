import "server-only";
import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { dbCtx, type Viewer } from "@/lib/auth/session";
import { json, withUser, workerSql } from "@/lib/db";
import { audit } from "./audit";

/**
 * Contract expiry sweep. Creates (idempotently, via dedupe_key) tenant + operator notifications
 * for subscriptions ending within 30 days. Called when the dashboard / operations center loads
 * and from the "通知チェックを実行" button.
 */
export async function runContractSweep(): Promise<number> {
  const sql = workerSql();
  const due = await sql`
    select s.tenant_id, s.ends_on, t.short_name, (s.ends_on - (now() at time zone 'Asia/Tokyo')::date) as days
    from subscriptions s join tenants t on t.id = s.tenant_id
    where s.ends_on <= (now() at time zone 'Asia/Tokyo')::date + 30 and s.status in ('active', 'expiring')`;
  let created = 0;
  for (const d of due) {
    const days = Number(d.days);
    const endsOn = new Date(d.ends_on).toISOString().slice(0, 10);
    const bucket = days <= 7 ? "7" : "30";
    const severity = days <= 7 ? "critical" : "warning";
    const r1 = await sql`
      insert into notifications (tenant_id, audience, kind, severity, title, body, link, dedupe_key)
      values (${d.tenant_id}, 'tenant', 'contract_expiring', ${severity}, ${`ご契約の更新期限が近づいています（残り${days}日）`},
              ${`契約期間は ${endsOn} までです。継続をご希望の場合は運営担当までご連絡ください。`}, '/app/settings', ${`contract:${d.tenant_id}:${endsOn}:${bucket}`})
      on conflict (dedupe_key) do nothing returning id`;
    const r2 = await sql`
      insert into notifications (tenant_id, audience, kind, severity, title, body, link, dedupe_key)
      values (${d.tenant_id}, 'operator', 'contract_expiring', ${severity}, ${`${d.short_name} の契約期限まで残り${days}日`},
              ${`契約終了日: ${endsOn}`}, '/app/operations', ${`contract_op:${d.tenant_id}:${endsOn}:${bucket}`})
      on conflict (dedupe_key) do nothing returning id`;
    await sql`update subscriptions set status = 'expiring', updated_at = now() where tenant_id = ${d.tenant_id} and status = 'active'`;
    created += r1.length + r2.length;
  }
  return created;
}

export async function operationsOverview(viewer: Viewer) {
  return withUser(dbCtx(viewer), async (tx) => {
    const tenants = await tx`
      select t.id, t.slug, t.short_name, t.brand_primary, s.plan, s.status as contract_status, to_char(s.ends_on, 'YYYY-MM-DD') as ends_on,
             (s.ends_on - (now() at time zone 'Asia/Tokyo')::date) as days_left, s.monthly_fee_jpy, s.ai_monthly_call_limit,
             (select count(*)::int from ai_execution_logs l where l.tenant_id = t.id and l.created_at >= date_trunc('month', now())
                and l.status in ('running', 'succeeded', 'failed', 'invalid_output')) as ai_calls,
             (select coalesce(sum(input_tokens + output_tokens), 0)::int from ai_execution_logs l where l.tenant_id = t.id and l.created_at >= date_trunc('month', now())) as ai_tokens,
             (select coalesce(sum(cost_usd), 0)::float from ai_execution_logs l where l.tenant_id = t.id and l.created_at >= date_trunc('month', now())) as ai_cost,
             (select count(*)::int from ai_execution_logs l where l.tenant_id = t.id and l.task in ('article_generate', 'update_proposal')
                and l.status = 'succeeded' and l.created_at >= date_trunc('month', now())) as generations,
             (select count(*)::int from ai_execution_logs l where l.tenant_id = t.id and l.status in ('failed', 'invalid_output', 'rejected_limit')
                and l.created_at >= date_trunc('month', now())) as failures,
             (select count(*)::int from published_pages p where p.tenant_id = t.id and p.status = 'live') as live_pages,
             (select count(*)::int from article_drafts a where a.tenant_id = t.id) as articles
      from tenants t join subscriptions s on s.tenant_id = t.id order by t.created_at`;
    const usageByDay = await tx`
      select to_char(d, 'MM/DD') as day,
        (select count(*)::int from ai_execution_logs l where (l.created_at at time zone 'Asia/Tokyo')::date = d::date) as calls
      from generate_series((now() at time zone 'Asia/Tokyo')::date - 13, (now() at time zone 'Asia/Tokyo')::date, interval '1 day') d order by d`;
    const [failures] = await tx`
      select (select count(*)::int from collection_runs where status in ('failed', 'partial') and started_at >= date_trunc('month', now())) as collection,
             (select count(*)::int from ai_execution_logs where status in ('failed', 'invalid_output') and created_at >= date_trunc('month', now())) as ai`;
    const backups = await tx`select id, started_at, finished_at, status, file_name, size_bytes, checksum, table_counts, error from backup_runs order by started_at desc limit 5`;
    const notifications = await tx`select id, tenant_id, kind, severity, title, body, created_at, read_at from notifications where audience = 'operator' order by created_at desc limit 20`;
    return { tenants, usageByDay, failures, backups, notifications };
  });
}

export async function updateSubscription(viewer: Viewer, tenantId: string, patch: { aiLimit?: number; endsInDays?: number }) {
  return withUser(dbCtx(viewer), async (tx) => {
    if (patch.aiLimit !== undefined) {
      await tx`update subscriptions set ai_monthly_call_limit = ${patch.aiLimit}, updated_at = now() where tenant_id = ${tenantId}`;
    }
    if (patch.endsInDays !== undefined) {
      await tx`update subscriptions set ends_on = (now() at time zone 'Asia/Tokyo')::date + ${patch.endsInDays}::int,
               status = case when ${patch.endsInDays}::int <= 30 then 'expiring' else 'active' end, updated_at = now() where tenant_id = ${tenantId}`;
    }
    const [row] = await tx`select tenant_id from subscriptions where tenant_id = ${tenantId}`;
    if (!row) throw new Error("subscription not visible");
    await audit(tx, { tenantId: null, actorId: viewer.userId, action: "subscription.update", targetType: "tenant", targetId: tenantId, metadata: patch });
  });
}

const BACKUP_TABLES = [
  "tenants", "tenant_settings", "subscriptions", "tenant_memberships", "incidents", "sources", "incident_sources", "incident_events",
  "tenant_incident_reviews", "article_drafts", "article_versions", "article_transitions", "approvals", "published_pages",
  "ai_execution_logs", "notifications", "audit_logs", "collection_runs",
];

/**
 * Logical backup: exports every business table to a gzipped JSON file under ./backups and
 * records the run. Status is only "succeeded" after the file was written and re-read (size check).
 * Production: use managed PITR backups (e.g. Supabase) in addition to this.
 */
export async function runBackup(viewer: Viewer) {
  const sql = workerSql();
  const [run] = await sql`insert into backup_runs (status, triggered_by) values ('running', ${viewer.userId}) returning id, started_at`;
  try {
    const dump: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const t of BACKUP_TABLES) {
      const rows = await sql.unsafe(`select * from ${t}`);
      dump[t] = rows as unknown[];
      counts[t] = rows.length;
    }
    const body = gzipSync(Buffer.from(JSON.stringify({ created_at: new Date().toISOString(), tables: dump })));
    // serverless hosts only allow writing to /tmp (BACKUP_DIR); files there are ephemeral
    const dir = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
    await mkdir(dir, { recursive: true });
    const fileName = `aiip-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json.gz`;
    await writeFile(path.join(dir, fileName), body, { mode: 0o600 });
    const st = await stat(path.join(dir, fileName));
    if (st.size !== body.length) throw new Error("backup size mismatch");
    const checksum = createHash("sha256").update(body).digest("hex");
    await sql`update backup_runs set status = 'succeeded', finished_at = now(), file_name = ${fileName}, size_bytes = ${st.size}, checksum = ${checksum},
              table_counts = ${json(sql as never, counts)} where id = ${run.id}`;
    await sql`insert into notifications (audience, kind, severity, title, body, link) values ('operator', 'backup', 'info', 'バックアップが完了しました', ${`${fileName}（${(st.size / 1024).toFixed(1)} KB）`}, '/app/operations')`;
    return { ok: true, fileName, size: st.size };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sql`update backup_runs set status = 'failed', finished_at = now(), error = ${message.slice(0, 300)} where id = ${run.id}`;
    await sql`insert into notifications (audience, kind, severity, title, body, link) values ('operator', 'backup', 'critical', 'バックアップに失敗しました', ${message.slice(0, 200)}, '/app/operations')`;
    return { ok: false, error: message };
  }
}
