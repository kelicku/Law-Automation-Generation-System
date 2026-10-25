import "server-only";
import { z } from "zod";
import { aiMode, monthlyUsage } from "@/lib/ai/run";
import { dbCtx, type Viewer } from "@/lib/auth/session";
import { withUser, workerSql, type Tx } from "@/lib/db";
import { CATEGORIES, type ArticleStatus, type Category, type ReviewStatus } from "@/lib/domain/types";

export interface DashboardData {
  tenantName: string;
  kpi: {
    todayDetected: number;
    unreviewed: number;
    pendingApproval: number;
    revisionRequired: number;
    materialUpdates: number;
    livePages: number;
  };
  ai: {
    provider: "anthropic" | "simulation";
    model: string;
    used: number;
    limit: number;
    lastRun: { status: string; started_at: Date; finished_at: Date | null; stats: Record<string, number> } | null;
    recent: { id: string; task: string; status: string; duration_ms: number | null; created_at: Date; provider: string }[];
  };
  detections: { day: string; count: number }[];
  timeline: { id: string; title: string; organization_name: string; category: Category; disclosed_on: string; has_material_update: boolean; article_status: ArticleStatus | null; article_id: string | null }[];
  activity: { at: Date; actor: string | null; action: string; target: string | null; link: string | null }[];
  isDemo: boolean;
}

const JST_TODAY = `date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'`;

const ACTION_LABEL: Record<string, string> = {
  "article.generate": "AIで記事を生成",
  "article.save_version": "下書きを保存",
  "article.submit": "承認を申請",
  "article.approve": "記事を承認",
  "article.request_revision": "記事を差し戻し",
  "article.publish": "記事を公開",
  "article.suspend": "公開を停止",
  "article.republish": "記事を再公開",
  "article.reopen": "編集を再開",
  "article.archive": "記事をアーカイブ",
  "article.restore": "記事を復元",
  "article.link_evidence": "出典を紐付け",
  "collect.run": "情報収集を実行",
  "settings.update": "事務所設定を更新",
  "auth.login": "ログイン",
  "auth.switch": "表示する事務所を切替",
  "incident.review": "事件の確認状態を更新",
};

export function actionLabel(a: string) {
  return ACTION_LABEL[a] ?? a;
}

export async function getDashboard(viewer: Viewer): Promise<DashboardData> {
  const tenant = viewer.tenant!;
  const usage = await monthlyUsage(tenant.id);
  return withUser(dbCtx(viewer), async (tx) => {
    const [k] = await tx.unsafe(`
      select
        (select count(*)::int from incidents where created_at >= ${JST_TODAY}) as today_detected,
        (select count(*)::int from incidents i where not exists (
           select 1 from tenant_incident_reviews r where r.incident_id = i.id and r.tenant_id = $1 and r.status in ('confirmed', 'dismissed'))) as unreviewed,
        (select count(*)::int from article_drafts where tenant_id = $1 and status = 'in_review') as pending_approval,
        (select count(*)::int from article_drafts where tenant_id = $1 and status = 'revision_required') as revision_required,
        (select count(*)::int from article_drafts where tenant_id = $1 and pending_update is not null) as material_updates,
        (select count(*)::int from published_pages where tenant_id = $1 and status = 'live') as live_pages
    `, [tenant.id]);
    const [lastRun] = await tx`select status, started_at, finished_at, stats from collection_runs order by started_at desc limit 1`;
    const recent = await tx`select id, task, status, duration_ms, created_at, provider from ai_execution_logs where tenant_id = ${tenant.id} order by created_at desc limit 6`;
    const detections = await tx.unsafe(`
      select to_char(d, 'YYYY-MM-DD') as day,
        (select count(*)::int from incidents i where (i.created_at at time zone 'Asia/Tokyo')::date = d::date) +
        (select count(*)::int from incident_sources s join incidents i on i.id = s.incident_id
           where s.relation <> 'initial' and (s.added_at at time zone 'Asia/Tokyo')::date = d::date) as count
      from generate_series((now() at time zone 'Asia/Tokyo')::date - 13, (now() at time zone 'Asia/Tokyo')::date, interval '1 day') d
      order by d`);
    const timeline = await tx`
      select i.id, i.title, i.organization_name, i.category, to_char(i.disclosed_on, 'YYYY-MM-DD') as disclosed_on, i.has_material_update,
             a.status as article_status, a.id as article_id
      from incidents i left join article_drafts a on a.incident_id = i.id and a.tenant_id = ${tenant.id}
      where i.disclosed_on is not null order by i.disclosed_on`;
    const activity = await tx`
      select l.created_at as at, u.display_name as actor, l.action, l.target_type, l.target_id,
             (select a.working->>'title' from article_drafts a where l.target_type = 'article' and a.id::text = l.target_id) as article_title
      from audit_logs l left join users u on u.id = l.actor_id
      where l.tenant_id = ${tenant.id} and l.action not in ('auth.login', 'auth.switch')
      order by l.created_at desc limit 10`;
    return {
      tenantName: tenant.name,
      kpi: {
        todayDetected: k.today_detected, unreviewed: k.unreviewed, pendingApproval: k.pending_approval,
        revisionRequired: k.revision_required, materialUpdates: k.material_updates, livePages: k.live_pages,
      },
      ai: { ...aiMode(), used: usage.used, limit: usage.limit, lastRun: (lastRun as never) ?? null, recent: recent as never },
      detections: detections as never,
      timeline: timeline as never,
      activity: activity.map((r) => ({
        at: r.at, actor: r.actor, action: actionLabel(r.action),
        target: r.article_title ?? null,
        link: r.target_type === "article" && r.target_id ? `/app/articles/${r.target_id}` : null,
      })),
      isDemo: viewer.isDemo,
    };
  });
}

/** Aggregates for the public landing page (no session). Counts only — no tenant content. */
export async function getLandingMetrics() {
  const sql = workerSql();
  const [r] = await sql.unsafe(`
    select
      (select count(*)::int from incidents) as incidents,
      (select count(*)::int from incidents where created_at >= ${JST_TODAY}) as today_detected,
      (select count(*)::int from article_drafts where status = 'in_review') as pending_approval,
      (select count(*)::int from article_drafts where pending_update is not null) as material_updates,
      (select count(*)::int from published_pages where status = 'live') as live_pages,
      (select count(*)::int from sources) as sources,
      (select count(*)::int from ai_execution_logs where created_at >= date_trunc('month', now())) as ai_runs,
      (select max(started_at) from collection_runs) as last_collect`);
  const latest = await sql`select category, to_char(disclosed_on, 'MM/DD') as d, organization_name from incidents order by disclosed_on desc nulls last limit 5`;
  const timeline = await sql`
    select i.id, i.title, i.organization_name, i.category, to_char(i.disclosed_on, 'YYYY-MM-DD') as disclosed_on, i.has_material_update
    from incidents i where i.disclosed_on is not null order by i.disclosed_on`;
  return { ...r, latest, timeline } as unknown as {
    timeline: { id: string; title: string; organization_name: string; category: Category; disclosed_on: string; has_material_update: boolean }[];
    incidents: number; today_detected: number; pending_approval: number; material_updates: number; live_pages: number; sources: number; ai_runs: number;
    last_collect: Date | null; latest: { category: Category; d: string; organization_name: string }[];
  };
}

// ───────────────────────────── radar ─────────────────────────────

export const RadarQuery = z.object({
  q: z.string().max(100).optional().default(""),
  category: z.enum([...CATEGORIES, "all"]).optional().default("all"),
  review: z.enum(["all", "unreviewed", "reviewing", "confirmed", "dismissed"]).optional().default("all"),
  material: z.enum(["all", "yes"]).optional().default("all"),
  sort: z.enum(["last_updated_at", "disclosed_on", "occurred_on", "sources", "title"]).optional().default("last_updated_at"),
  dir: z.enum(["asc", "desc"]).optional().default("desc"),
});
export type RadarQuery = z.infer<typeof RadarQuery>;

export interface RadarRow {
  id: string;
  title: string;
  organization_name: string;
  category: Category;
  occurred_on: string | null;
  disclosed_on: string | null;
  last_updated_at: Date;
  created_at: Date;
  source_count: number;
  publishers: string[];
  review_status: ReviewStatus;
  has_material_update: boolean;
  affected_count: number | null;
  affected_count_status: string;
  severity: string;
  is_fictional: boolean;
  article_id: string | null;
  article_status: ArticleStatus | null;
}

export async function listIncidents(viewer: Viewer, query: RadarQuery): Promise<RadarRow[]> {
  const tenantId = viewer.tenant!.id;
  const sortCol = { last_updated_at: "i.last_updated_at", disclosed_on: "i.disclosed_on", occurred_on: "i.occurred_on", sources: "source_count", title: "i.title" }[query.sort];
  const dir = query.dir === "asc" ? "asc" : "desc";
  return withUser(dbCtx(viewer), async (tx) => {
    const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await tx`
      select i.id, i.title, i.organization_name, i.category, to_char(i.occurred_on, 'YYYY-MM-DD') as occurred_on, to_char(i.disclosed_on, 'YYYY-MM-DD') as disclosed_on,
             i.last_updated_at, i.created_at, i.has_material_update, i.affected_count, i.affected_count_status, i.severity, i.is_fictional,
             (select count(*)::int from incident_sources s where s.incident_id = i.id) as source_count,
             (select array_agg(distinct s.publisher) from incident_sources x join sources s on s.id = x.source_id where x.incident_id = i.id) as publishers,
             coalesce(r.status, 'unreviewed') as review_status,
             a.id as article_id, a.status as article_status
      from incidents i
      left join tenant_incident_reviews r on r.incident_id = i.id and r.tenant_id = ${tenantId}
      left join article_drafts a on a.incident_id = i.id and a.tenant_id = ${tenantId}
      where (${query.q} = '' or i.title ilike ${like} or i.organization_name ilike ${like} or i.summary ilike ${like})
        and (${query.category} = 'all' or i.category = ${query.category})
        and (${query.review} = 'all' or coalesce(r.status, 'unreviewed') = ${query.review})
        and (${query.material} = 'all' or i.has_material_update)
      order by ${tx.unsafe(sortCol)} ${tx.unsafe(dir)} nulls last, i.id`;
    return rows as unknown as RadarRow[];
  });
}

export async function getIncidentDetail(viewer: Viewer, id: string) {
  return withUser(dbCtx(viewer), async (tx) => {
    const [incident] = await tx`select * from incidents where id = ${id}`;
    if (!incident) return null;
    const sources = await tx`
      select s.*, x.relation, x.added_at from incident_sources x join sources s on s.id = x.source_id where x.incident_id = ${id} order by s.published_at`;
    const events = await tx`
      select e.*, s.publisher from incident_events e left join sources s on s.id = e.source_id where e.incident_id = ${id} order by e.detected_at desc`;
    const [review] = await tx`
      select r.*, u.display_name as reviewer from tenant_incident_reviews r left join users u on u.id = r.reviewed_by
      where r.incident_id = ${id} and r.tenant_id = ${viewer.tenant!.id}`;
    const [article] = await tx`select id, status, slug, working->>'title' as title from article_drafts where incident_id = ${id} and tenant_id = ${viewer.tenant!.id}`;
    return { incident, sources, events, review: review ?? null, article: article ?? null };
  });
}

export async function lastCollectionRuns(viewer: Viewer) {
  return withUser(dbCtx(viewer), (tx) => tx`select id, status, started_at, finished_at, stats, source_results from collection_runs order by started_at desc limit 5`);
}

// ───────────────────────────── articles list ─────────────────────────────

export async function listArticles(viewer: Viewer) {
  return withUser(dbCtx(viewer), (tx) => tx`
    select a.id, a.slug, a.status, a.working->>'title' as title, a.updated_at, a.pending_update is not null as has_update,
           i.organization_name, i.category,
           p.status as page_status, pv.version_no as published_version,
           (select max(version_no) from article_versions v where v.article_id = a.id) as latest_version,
           (select u.display_name from users u where u.id = a.created_by) as author
    from article_drafts a join incidents i on i.id = a.incident_id
    left join published_pages p on p.article_id = a.id
    left join article_versions pv on pv.id = p.version_id
    order by a.updated_at desc`);
}

export async function approvalHistory(viewer: Viewer) {
  return withUser(dbCtx(viewer), (tx) => tx`
    select t.id, t.created_at, t.from_status, t.to_status, t.action, t.comment, u.display_name as actor, v.version_no,
           a.id as article_id, a.working->>'title' as title
    from article_transitions t join article_drafts a on a.id = t.article_id
    left join users u on u.id = t.actor_id left join article_versions v on v.id = t.version_id
    order by t.created_at desc limit 60`);
}

// ───────────────────────────── notifications ─────────────────────────────

export async function listNotifications(viewer: Viewer, limit = 20) {
  return withUser(dbCtx(viewer), (tx) => tx`
    select id, kind, severity, title, body, link, read_at, created_at, audience from notifications order by created_at desc limit ${limit}`);
}

export async function unreadCount(viewer: Viewer): Promise<number> {
  return withUser(dbCtx(viewer), async (tx) => {
    const [r] = await tx`select count(*)::int as n from notifications where read_at is null`;
    return r.n as number;
  });
}

// ───────────────────────────── inspector ─────────────────────────────

export async function inspectorLogs(viewer: Viewer, limit = 80) {
  return withUser(dbCtx(viewer), (tx: Tx) => tx`
    select l.id, l.job_key, l.task, l.prompt_id, l.prompt_version, l.provider, l.model, l.status, l.input_summary, l.output,
           l.error_code, l.error_message, l.input_tokens, l.output_tokens, l.cost_usd, l.duration_ms, l.created_at, l.article_id,
           t.short_name as tenant, u.display_name as actor
    from ai_execution_logs l left join tenants t on t.id = l.tenant_id left join users u on u.id = l.created_by
    order by l.created_at desc limit ${limit}`);
}
