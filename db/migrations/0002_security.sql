-- 0002_security.sql
-- Row Level Security. Roles (created by scripts/migrate.ts before this file runs):
--   aiip_app    : the web application. NOBYPASSRLS. Every request sets app.user_id / app.tenant_id
--                 with set_config(..., true) inside a transaction.
--   aiip_public : NOLOGIN. Assumed via SET LOCAL ROLE for the public law-firm sites. Reads live pages only.
--   aiip_worker : BYPASSRLS. Used only by server-side system jobs (collector, auth lookup, backup, demo reset).
--
-- Supabase migration note: app.current_user_id() is the single place to swap for auth.uid().

create or replace function app.current_user_id() returns uuid
language sql stable as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function app.current_tenant_id() returns uuid
language sql stable as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

create or replace function app.member_role(t uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role from tenant_memberships m
  where m.tenant_id = t and m.user_id = app.current_user_id()
$$;

-- true only when the row belongs to the tenant selected for this request AND the user is a member of it
create or replace function app.in_active_tenant(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select t is not null and t = app.current_tenant_id() and exists (
    select 1 from tenant_memberships m where m.tenant_id = t and m.user_id = app.current_user_id()
  )
$$;

create or replace function app.can_approve(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.in_active_tenant(t) and coalesce(app.member_role(t) in ('owner', 'lawyer'), false)
$$;

create or replace function app.can_edit(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.in_active_tenant(t) and coalesce(app.member_role(t) in ('owner', 'lawyer', 'editor'), false)
$$;

create or replace function app.is_operator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users u where u.id = app.current_user_id() and u.platform_role = 'operator')
$$;

create or replace function app.is_authenticated() returns boolean
language sql stable as $$ select app.current_user_id() is not null $$;

revoke all on function app.member_role(uuid), app.in_active_tenant(uuid), app.can_approve(uuid),
  app.can_edit(uuid), app.is_operator() from public;

-- ───────────── grants ─────────────
grant usage on schema public, app to aiip_app, aiip_public, aiip_worker;
grant execute on all functions in schema app to aiip_app, aiip_public, aiip_worker;

grant select, insert, update, delete on all tables in schema public to aiip_worker;
grant usage, select on all sequences in schema public to aiip_worker, aiip_app;

-- application role: least privilege
grant select on tenants, tenant_memberships, tenant_settings, subscriptions to aiip_app;
grant update (firm_display_name, tagline, lawyers, consultation_form_url, fee_notice, address, phone, office_hours, simulate_ai_failure, updated_at)
  on tenant_settings to aiip_app;
grant update (ends_on, ai_monthly_call_limit, status, updated_at) on subscriptions to aiip_app;
grant select (id, email, display_name, platform_role, is_demo, created_at, last_login_at) on users to aiip_app;  -- no password_hash
grant select on sources, incidents, incident_sources, incident_events, collection_runs to aiip_app;
grant select, insert, update on tenant_incident_reviews to aiip_app;
grant select, insert, update on article_drafts, article_versions to aiip_app;
grant select, insert on article_transitions, approvals to aiip_app;
grant select, insert, update on published_pages to aiip_app;
grant select, insert, update on ai_execution_logs to aiip_app;
grant select, insert, update on notifications to aiip_app;
grant select, insert on audit_logs to aiip_app;              -- append-only for the app
grant select on backup_runs to aiip_app;

-- public site role: only what a public page needs
grant select (id, slug, name, short_name, logo_mark, brand_primary, brand_accent) on tenants to aiip_public;
grant select (tenant_id, firm_display_name, tagline, lawyers, consultation_form_url, fee_notice, address, phone, office_hours)
  on tenant_settings to aiip_public;
grant select (id, tenant_id, article_id, slug, status, content, incident_id, published_at, updated_at) on published_pages to aiip_public;
grant select (id, title, organization_name, category, disclosed_on, last_updated_at, is_fictional) on incidents to aiip_public;

-- ───────────── enable RLS everywhere ─────────────
alter table tenants                 enable row level security;
alter table users                   enable row level security;
alter table tenant_memberships      enable row level security;
alter table sessions                enable row level security;
alter table tenant_settings         enable row level security;
alter table subscriptions           enable row level security;
alter table sources                 enable row level security;
alter table incidents               enable row level security;
alter table incident_sources        enable row level security;
alter table incident_events         enable row level security;
alter table collection_runs         enable row level security;
alter table collector_state         enable row level security;
alter table tenant_incident_reviews enable row level security;
alter table article_drafts          enable row level security;
alter table article_versions        enable row level security;
alter table article_transitions     enable row level security;
alter table approvals               enable row level security;
alter table published_pages         enable row level security;
alter table ai_execution_logs       enable row level security;
alter table notifications           enable row level security;
alter table audit_logs              enable row level security;
alter table backup_runs             enable row level security;

-- ───────────── identity ─────────────
create policy tenants_member_read on tenants for select to aiip_app
  using (app.member_role(id) is not null or app.is_operator());
create policy tenants_public_read on tenants for select to aiip_public using (true);

create policy users_read on users for select to aiip_app
  using (id = app.current_user_id() or app.is_operator() or exists (
    select 1 from tenant_memberships m where m.user_id = users.id and app.member_role(m.tenant_id) is not null));

create policy memberships_read on tenant_memberships for select to aiip_app
  using (user_id = app.current_user_id() or app.in_active_tenant(tenant_id) or app.is_operator());

-- sessions / collector_state: no policy for aiip_app => no access (worker only)

create policy tenant_settings_read on tenant_settings for select to aiip_app
  using (app.in_active_tenant(tenant_id) or app.is_operator());
create policy tenant_settings_update on tenant_settings for update to aiip_app
  using (app.can_approve(tenant_id)) with check (app.can_approve(tenant_id));
create policy tenant_settings_public on tenant_settings for select to aiip_public using (true);

create policy subscriptions_read on subscriptions for select to aiip_app
  using (app.in_active_tenant(tenant_id) or app.is_operator());
create policy subscriptions_operator_update on subscriptions for update to aiip_app
  using (app.is_operator()) with check (app.is_operator());

-- ───────────── shared incident data: readable by any authenticated user, written by worker only ─────────────
create policy sources_read          on sources          for select to aiip_app using (app.is_authenticated());
create policy incidents_read        on incidents        for select to aiip_app using (app.is_authenticated());
create policy incident_sources_read on incident_sources for select to aiip_app using (app.is_authenticated());
create policy incident_events_read  on incident_events  for select to aiip_app using (app.is_authenticated());
create policy collection_runs_read  on collection_runs  for select to aiip_app using (app.is_authenticated());
create policy incidents_public_read on incidents for select to aiip_public
  using (exists (select 1 from published_pages p where p.incident_id = incidents.id and p.status = 'live'));

-- ───────────── tenant-private data ─────────────
create policy reviews_rw on tenant_incident_reviews for all to aiip_app
  using (app.in_active_tenant(tenant_id)) with check (app.can_edit(tenant_id));

create policy drafts_read   on article_drafts for select to aiip_app using (app.in_active_tenant(tenant_id) or app.is_operator());
create policy drafts_insert on article_drafts for insert to aiip_app with check (app.can_edit(tenant_id));
create policy drafts_update on article_drafts for update to aiip_app using (app.can_edit(tenant_id)) with check (app.can_edit(tenant_id));

create policy versions_read   on article_versions for select to aiip_app using (app.in_active_tenant(tenant_id));
create policy versions_insert on article_versions for insert to aiip_app with check (app.can_edit(tenant_id));
create policy versions_update on article_versions for update to aiip_app using (app.can_edit(tenant_id)) with check (app.can_edit(tenant_id));

create policy transitions_read   on article_transitions for select to aiip_app using (app.in_active_tenant(tenant_id));
create policy transitions_insert on article_transitions for insert to aiip_app with check (app.can_edit(tenant_id) and actor_id = app.current_user_id());

-- only owner / lawyer of the active tenant may record approvals, and only in their own name
create policy approvals_read   on approvals for select to aiip_app using (app.in_active_tenant(tenant_id));
create policy approvals_insert on approvals for insert to aiip_app
  with check (app.can_approve(tenant_id) and approver_id = app.current_user_id());

create policy pages_read   on published_pages for select to aiip_app using (app.in_active_tenant(tenant_id) or app.is_operator());
create policy pages_insert on published_pages for insert to aiip_app with check (app.can_approve(tenant_id));
create policy pages_update on published_pages for update to aiip_app using (app.can_approve(tenant_id)) with check (app.can_approve(tenant_id));
create policy pages_public on published_pages for select to aiip_public using (status = 'live');

create policy ai_logs_read   on ai_execution_logs for select to aiip_app
  using (app.in_active_tenant(tenant_id) or (tenant_id is null and app.is_authenticated()) or app.is_operator());
create policy ai_logs_insert on ai_execution_logs for insert to aiip_app with check (app.can_edit(tenant_id));
create policy ai_logs_update on ai_execution_logs for update to aiip_app using (app.can_edit(tenant_id)) with check (app.can_edit(tenant_id));

create policy notifications_read on notifications for select to aiip_app
  using ((audience = 'tenant' and app.in_active_tenant(tenant_id)) or (audience = 'operator' and app.is_operator()));
create policy notifications_insert on notifications for insert to aiip_app
  with check ((audience = 'tenant' and app.in_active_tenant(tenant_id)) or app.is_operator());
create policy notifications_update on notifications for update to aiip_app
  using ((audience = 'tenant' and app.in_active_tenant(tenant_id)) or (audience = 'operator' and app.is_operator()));

create policy audit_read   on audit_logs for select to aiip_app using (app.in_active_tenant(tenant_id) or app.is_operator());
create policy audit_insert on audit_logs for insert to aiip_app
  with check (actor_id = app.current_user_id() and (tenant_id is null or app.in_active_tenant(tenant_id) or app.is_operator()));

create policy backups_read on backup_runs for select to aiip_app using (app.is_operator());
