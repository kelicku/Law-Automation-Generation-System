-- 0004_source_snapshot.sql
-- Published pages carry an immutable snapshot of the sources they cite, so the public site
-- (role aiip_public, which cannot read the shared sources table) can render citations.
alter table published_pages add column source_snapshot jsonb not null default '[]'::jsonb;
grant select (source_snapshot) on published_pages to aiip_public;
