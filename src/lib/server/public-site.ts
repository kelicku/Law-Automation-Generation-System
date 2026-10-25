import "server-only";
import { cache } from "react";
import { withPublic } from "@/lib/db";
import type { ArticleContent } from "@/lib/domain/article";
import type { Category } from "@/lib/domain/types";
import type { DemoLawyer } from "@/lib/demo/tenants";

/** Public website data. Runs as role aiip_public: only live pages and public firm profile columns are visible. */
export interface PublicFirm {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  logo_mark: string;
  brand_primary: string;
  brand_accent: string;
  tagline: string;
  lawyers: DemoLawyer[];
  consultation_form_url: string;
  fee_notice: string;
  address: string;
  phone: string;
  office_hours: string;
}

export interface PublicPage {
  slug: string;
  source_snapshot: { id: string; publisher: string; title: string; url: string; published_at: string | null }[];
  content: ArticleContent;
  published_at: Date;
  updated_at: Date;
  incident_title: string;
  organization_name: string;
  category: Category;
  disclosed_on: string | null;
  is_fictional: boolean;
}

export const getPublicFirm = cache(async (slug: string): Promise<PublicFirm | null> => {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  return withPublic(async (tx) => {
    const [f] = await tx`
      select t.id, t.slug, t.name, t.short_name, t.logo_mark, t.brand_primary, t.brand_accent,
             s.tagline, s.lawyers, s.consultation_form_url, s.fee_notice, s.address, s.phone, s.office_hours
      from tenants t join tenant_settings s on s.tenant_id = t.id where t.slug = ${slug}`;
    return (f as unknown as PublicFirm) ?? null;
  });
});

export async function listPublicPages(firmId: string): Promise<PublicPage[]> {
  return withPublic(async (tx) => {
    const rows = await tx`
      select p.slug, p.content, p.source_snapshot, p.published_at, p.updated_at, i.title as incident_title, i.organization_name, i.category,
             to_char(i.disclosed_on, 'YYYY-MM-DD') as disclosed_on, i.is_fictional
      from published_pages p join incidents i on i.id = p.incident_id
      where p.tenant_id = ${firmId} and p.status = 'live' order by p.published_at desc`;
    return rows as unknown as PublicPage[];
  });
}

export const getPublicPage = cache(async (firmId: string, slug: string): Promise<PublicPage | null> => {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  return withPublic(async (tx) => {
    const [row] = await tx`
      select p.slug, p.content, p.source_snapshot, p.published_at, p.updated_at, i.title as incident_title, i.organization_name, i.category,
             to_char(i.disclosed_on, 'YYYY-MM-DD') as disclosed_on, i.is_fictional
      from published_pages p join incidents i on i.id = p.incident_id
      where p.tenant_id = ${firmId} and p.slug = ${slug} and p.status = 'live'`;
    return (row as unknown as PublicPage) ?? null;
  });
});
