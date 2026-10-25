/**
 * One-click demo registration: creates a private FICTIONAL law firm for one visitor.
 * The firm gets one owner account (no email/password needed — entry is via the resume cookie),
 * a low AI budget, and two sample articles so the screens are not empty.
 */
import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { hashPassword } from "@/lib/auth/password";
import { buildSimulatedArticle, type SimSource } from "@/lib/ai/simulation";
import type { ArticleContent } from "@/lib/domain/article";
import { contentHash } from "@/lib/domain/hash";
import type { Category } from "@/lib/domain/types";

export const SANDBOX_AI_LIMIT = 40;
export const SANDBOX_DAYS = 30;

const NAMES = ["明石", "朝霧", "白樺", "若竹", "紺碧", "千草", "琥珀", "東雲橋", "銀杏", "水無月"];
const PALETTES = [
  ["#1F3550", "#B49660"], ["#2A3F3A", "#B8A06A"], ["#3A2F45", "#B9976A"], ["#24384A", "#A98C5E"], ["#3B3A36", "#B59A66"],
];

export class SandboxLimitError extends Error {}

export interface SandboxResult {
  userId: string;
  tenantId: string;
  firmName: string;
}

export async function provisionSandbox(sql: postgres.Sql, opts: { resumeHash: string; maxSandboxes: number }): Promise<SandboxResult> {
  const id = randomBytes(4).toString("hex");
  const name = NAMES[parseInt(id.slice(0, 2), 16) % NAMES.length];
  const [primary, accent] = PALETTES[parseInt(id.slice(2, 4), 16) % PALETTES.length];
  const passwordHash = await hashPassword(randomBytes(24).toString("base64url")); // never shown; entry is click-only

  return sql.begin(async (tx) => {
    // housekeeping: remove sandboxes that expired more than a day ago (cascades to their data)
    const expired = await tx`delete from sandbox_accounts where expires_at < now() - interval '1 day' returning user_id, tenant_id`;
    for (const e of expired) {
      await tx`delete from tenants where id = ${e.tenant_id}`;
      await tx`delete from users where id = ${e.user_id}`;
    }
    const [{ n }] = await tx`select count(*)::int as n from sandbox_accounts where expires_at > now()`;
    if (n >= opts.maxSandboxes) throw new SandboxLimitError("体験用事務所の作成数が上限に達しています。");

    const shortName = `${name}法律事務所`;
    const firmName = `${shortName}（架空・体験用）`;
    const slug = `demo-${id}`;
    const [tenant] = await tx`
      insert into tenants (slug, name, short_name, logo_mark, brand_primary, brand_accent)
      values (${slug}, ${firmName}, ${shortName}, ${name.slice(0, 1)}, ${primary}, ${accent}) returning id`;
    await tx`
      insert into tenant_settings (tenant_id, firm_display_name, tagline, lawyers, consultation_form_url, fee_notice, address, phone, office_hours)
      values (${tenant.id}, ${firmName}, '公表情報をもとに、影響を受けた方へ確かな情報を。',
        ${tx.json([{ name: "体験 ユーザー", title: "代表弁護士", bar: "架空弁護士会 所属（デモ用）", profile: "体験用に作成された架空の弁護士です。" }])},
        ${`https://forms.example.com/${slug}/consultation`},
        '初回相談30分 5,500円（税込）。受任時の弁護士費用は事案に応じて事前にお見積りし、書面でご説明します。',
        '東京都（架空）', '03-0000-0000（架空）', '平日 9:30〜18:00')`;
    await tx`
      insert into subscriptions (tenant_id, plan, status, started_on, ends_on, monthly_fee_jpy, ai_monthly_call_limit)
      values (${tenant.id}, 'starter', 'active', (now() at time zone 'Asia/Tokyo')::date, (now() at time zone 'Asia/Tokyo')::date + 90, 0, ${SANDBOX_AI_LIMIT})`;
    const [user] = await tx`
      insert into users (email, display_name, password_hash, platform_role)
      values (${`guest-${id}@sandbox.example`}, '体験 ユーザー', ${passwordHash}, 'none') returning id`;
    await tx`insert into tenant_memberships (tenant_id, user_id, role, title) values (${tenant.id}, ${user.id}, 'owner', '代表弁護士')`;
    await tx`
      insert into sandbox_accounts (user_id, tenant_id, resume_hash, expires_at)
      values (${user.id}, ${tenant.id}, ${opts.resumeHash}, now() + make_interval(days => ${SANDBOX_DAYS}))`;

    await sampleArticles(tx, tenant.id, user.id, { firmName, firmShort: shortName }, slug);
    await tx`insert into notifications (tenant_id, audience, kind, severity, title, body, link)
             values (${tenant.id}, 'tenant', 'published', 'info', 'あなた専用のデモ事務所を作成しました',
                     '他の閲覧者の操作の影響を受けずに、すべての機能をお試しいただけます。', '/app')`;
    await tx`insert into audit_logs (tenant_id, actor_id, action, metadata) values (${tenant.id}, ${user.id}, 'auth.sandbox_created', ${tx.json({ slug })})`;
    return { userId: user.id as string, tenantId: tenant.id as string, firmName: shortName };
  }) as Promise<SandboxResult>;
}

async function sourcesFor(tx: postgres.TransactionSql, incidentId: string, initialOnly: boolean): Promise<SimSource[]> {
  const rows = await tx`
    select s.id, s.publisher, s.title, s.url, s.source_type, s.published_at, s.content_text
    from incident_sources x join sources s on s.id = x.source_id
    where x.incident_id = ${incidentId} and (${!initialOnly} or x.relation <> 'update') order by s.published_at`;
  return rows.map((r) => ({ ...r, published_at: r.published_at ? new Date(r.published_at).toISOString() : null })) as unknown as SimSource[];
}

/** A published article (to show the public site) and a draft containing advertising issues (to show the checks). */
async function sampleArticles(tx: postgres.TransactionSql, tenantId: string, userId: string, firm: { firmName: string; firmShort: string }, slug: string) {
  const incidents = await tx`
    select id, title, organization_name, category, to_char(disclosed_on, 'YYYY-MM-DD') as disclosed_on from incidents
    where organization_name like 'さくら学習塾%' or organization_name like '青葉ライフ%'`;
  for (const inc of incidents) {
    const published = String(inc.organization_name).startsWith("さくら");
    const sources = await sourcesFor(tx, inc.id, published);
    if (!sources.length) continue;
    let content: ArticleContent = buildSimulatedArticle(
      { title: inc.title, organization_name: inc.organization_name, category: inc.category as Category, disclosed_on: inc.disclosed_on }, sources, firm);
    if (!published) {
      content = {
        ...content,
        blocks: content.blocks.map((b) => b.type === "paragraph" && b.sentences.some((s) => s.kind === "notice")
          ? { ...b, sentences: [{ id: "ad1", text: "当事務所の専門弁護士にご依頼いただければ、必ず返金されます。", kind: "notice" as const, refs: [] }, ...b.sentences] }
          : b),
      };
    }
    const hash = contentHash(content);
    const articleSlug = `${published ? "sample-published" : "sample-draft"}-${slug.slice(5)}`;
    const [draft] = await tx`
      insert into article_drafts (tenant_id, incident_id, slug, status, working, working_hash, working_updated_by, created_by)
      values (${tenantId}, ${inc.id}, ${articleSlug}, 'draft', ${tx.json(content as unknown as postgres.JSONValue)}, ${hash}, ${userId}, ${userId}) returning id`;
    const [v] = await tx`
      insert into article_versions (tenant_id, article_id, version_no, kind, content, content_hash, note, created_by)
      values (${tenantId}, ${draft.id}, 1, 'ai_generated', ${tx.json(content as unknown as postgres.JSONValue)}, ${hash}, 'サンプル記事（AIシミュレーション）', ${userId}) returning id`;
    await tx`update article_drafts set current_version_id = ${v.id} where id = ${draft.id}`;
    if (!published) continue;
    const [ap] = await tx`
      insert into approvals (tenant_id, article_id, version_id, decision, approver_id, comment)
      values (${tenantId}, ${draft.id}, ${v.id}, 'approved', ${userId}, 'サンプルとして承認') returning id`;
    await tx`
      insert into published_pages (tenant_id, article_id, version_id, approval_id, slug, status, content, source_snapshot, incident_id, published_by)
      values (${tenantId}, ${draft.id}, ${v.id}, ${ap.id}, ${articleSlug}, 'live', ${tx.json(content as unknown as postgres.JSONValue)},
        ${tx.json(sources.map((s) => ({ id: s.id, publisher: s.publisher, title: s.title, url: s.url, published_at: s.published_at })))}, ${inc.id}, ${userId})`;
    await tx`update article_drafts set status = 'published', review_version_id = ${v.id}, published_version_id = ${v.id} where id = ${draft.id}`;
    for (const [from, to, action] of [["draft", "in_review", "submit"], ["in_review", "approved", "approve"], ["approved", "published", "publish"]]) {
      await tx`insert into article_transitions (tenant_id, article_id, from_status, to_status, action, actor_id, version_id, comment)
               values (${tenantId}, ${draft.id}, ${from}, ${to}, ${action}, ${userId}, ${v.id}, 'サンプル')`;
    }
  }
}
