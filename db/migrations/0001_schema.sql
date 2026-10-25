-- 0001_schema.sql
-- Core schema for AI Incident Intelligence.
-- Shared incident data (incidents / sources / incident_sources / incident_events)
-- is separated from tenant-private data (article_* / approvals / published_pages ...).

create extension if not exists pgcrypto;
create schema if not exists app;

-- ───────────────────────────── Tenancy & identity ─────────────────────────────

create table tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name          text not null,
  short_name    text not null,
  logo_mark     text not null,                     -- monogram used as demo logo
  brand_primary text not null check (brand_primary ~ '^#[0-9A-Fa-f]{6}$'),
  brand_accent  text not null check (brand_accent ~ '^#[0-9A-Fa-f]{6}$'),
  is_demo       boolean not null default true,
  created_at    timestamptz not null default now()
);

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique check (email = lower(email)),
  display_name  text not null,
  password_hash text not null,
  platform_role text not null default 'none' check (platform_role in ('none', 'operator')),
  is_demo       boolean not null default true,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create table tenant_memberships (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role       text not null check (role in ('owner', 'lawyer', 'editor', 'viewer')),
  title      text,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index tenant_memberships_user_idx on tenant_memberships(user_id);

create table sessions (
  id               text primary key,                -- sha256(token), raw token only in cookie
  user_id          uuid not null references users(id) on delete cascade,
  active_tenant_id uuid references tenants(id) on delete set null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  user_agent       text
);
create index sessions_user_idx on sessions(user_id);
create index sessions_expires_idx on sessions(expires_at);

create table tenant_settings (
  tenant_id             uuid primary key references tenants(id) on delete cascade,
  firm_display_name     text not null,
  tagline               text not null default '',
  lawyers               jsonb not null default '[]'::jsonb,
  consultation_form_url text not null check (consultation_form_url ~ '^https://'),
  fee_notice            text not null default '',
  address               text not null default '',
  phone                 text not null default '',
  office_hours          text not null default '',
  simulate_ai_failure   boolean not null default false,
  updated_at            timestamptz not null default now()
);

create table subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null unique references tenants(id) on delete cascade,
  plan                   text not null check (plan in ('starter', 'standard', 'professional')),
  status                 text not null default 'active' check (status in ('active', 'expiring', 'expired', 'cancelled')),
  started_on             date not null,
  ends_on                date not null,
  monthly_fee_jpy        integer not null check (monthly_fee_jpy >= 0),
  ai_monthly_call_limit  integer not null check (ai_monthly_call_limit >= 0),
  updated_at             timestamptz not null default now(),
  check (ends_on > started_on)
);

-- ───────────────────────────── Shared incident data ─────────────────────────────

create table sources (
  id              uuid primary key default gen_random_uuid(),
  connector       text not null check (connector in ('fixture', 'rss')),
  url             text not null unique,
  publisher       text not null,
  source_type     text not null check (source_type in ('official', 'press_release', 'news', 'regulator')),
  title           text not null,
  published_at    timestamptz,
  fetched_at      timestamptz not null default now(),
  content_text    text not null,                    -- sanitized plain text, treated as untrusted
  content_hash    text not null,
  injection_flags jsonb not null default '[]'::jsonb,
  is_fictional    boolean not null default true,
  created_at      timestamptz not null default now()
);
create index sources_content_hash_idx on sources(content_hash);

create table incidents (
  id                    uuid primary key default gen_random_uuid(),
  fingerprint           text not null unique,
  title                 text not null,
  organization_name     text not null,
  category              text not null check (category in ('personal_data', 'cyber_attack', 'consumer_harm', 'other')),
  summary               text not null,
  occurred_on           date,
  disclosed_on          date,
  last_updated_at       timestamptz not null default now(),
  affected_count        integer check (affected_count is null or affected_count >= 0),
  affected_count_status text not null default 'unknown' check (affected_count_status in ('unknown', 'estimated', 'confirmed')),
  severity              text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  has_material_update   boolean not null default false,
  classification        jsonb not null default '{}'::jsonb,
  is_fictional          boolean not null default true,
  created_at            timestamptz not null default now()
);
create index incidents_category_idx on incidents(category);
create index incidents_last_updated_idx on incidents(last_updated_at desc);
create index incidents_disclosed_idx on incidents(disclosed_on desc);

create table incident_sources (
  incident_id uuid not null references incidents(id) on delete cascade,
  source_id   uuid not null references sources(id) on delete cascade,
  relation    text not null check (relation in ('initial', 'update', 'related')),
  added_at    timestamptz not null default now(),
  primary key (incident_id, source_id)
);
create index incident_sources_source_idx on incident_sources(source_id);

create table collection_runs (
  id             uuid primary key default gen_random_uuid(),
  job_key        text not null unique,
  triggered_by   uuid references users(id) on delete set null,
  tenant_id      uuid references tenants(id) on delete set null,
  status         text not null check (status in ('running', 'succeeded', 'partial', 'failed')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  stats          jsonb not null default '{}'::jsonb,
  steps          jsonb not null default '[]'::jsonb,
  source_results jsonb not null default '[]'::jsonb
);
-- only one collection may run at a time
create unique index collection_runs_single_running on collection_runs ((true)) where status = 'running';
create index collection_runs_started_idx on collection_runs(started_at desc);

create table incident_events (
  id                uuid primary key default gen_random_uuid(),
  incident_id       uuid not null references incidents(id) on delete cascade,
  event_type        text not null check (event_type in ('detected', 'source_added', 'update', 'material_change')),
  field             text,
  old_value         text,
  new_value         text,
  is_material       boolean not null default false,
  source_id         uuid references sources(id) on delete set null,
  collection_run_id uuid references collection_runs(id) on delete set null,
  detected_at       timestamptz not null default now()
);
create index incident_events_incident_idx on incident_events(incident_id, detected_at desc);

create table collector_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ───────────────────────────── Tenant-private data ─────────────────────────────

create table tenant_incident_reviews (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  incident_id uuid not null references incidents(id) on delete cascade,
  status      text not null default 'unreviewed' check (status in ('unreviewed', 'reviewing', 'confirmed', 'dismissed')),
  note        text not null default '',
  reviewed_by uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  primary key (tenant_id, incident_id)
);

create table article_drafts (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id) on delete cascade,
  incident_id          uuid not null references incidents(id) on delete restrict,
  slug                 text not null check (slug ~ '^[a-z0-9-]{3,80}$'),
  status               text not null default 'draft' check (status in
                         ('draft', 'in_review', 'approved', 'published', 'revision_required', 'suspended', 'archived')),
  working              jsonb not null,               -- the editable latest content
  working_hash         text not null,
  working_updated_at   timestamptz not null default now(),
  working_updated_by   uuid references users(id) on delete set null,
  current_version_id   uuid,                         -- last saved snapshot
  review_version_id    uuid,                         -- version submitted for review
  published_version_id uuid,                         -- version currently on the public site
  pending_update       jsonb,                        -- material change that triggered re-approval
  created_by           uuid references users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, incident_id),
  unique (tenant_id, id)
);
create index article_drafts_tenant_status_idx on article_drafts(tenant_id, status);

create table article_versions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  article_id   uuid not null,
  version_no   integer not null check (version_no > 0),
  kind         text not null check (kind in ('ai_generated', 'manual_save', 'submitted', 'update_proposal', 'restored')),
  content      jsonb not null,
  content_hash text not null,
  ai_log_id    uuid,
  note         text not null default '',
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (article_id, version_no),
  unique (tenant_id, id),
  foreign key (tenant_id, article_id) references article_drafts(tenant_id, id) on delete cascade
);

alter table article_drafts
  add constraint article_drafts_current_version_fk  foreign key (tenant_id, current_version_id)   references article_versions(tenant_id, id) deferrable initially deferred,
  add constraint article_drafts_review_version_fk   foreign key (tenant_id, review_version_id)    references article_versions(tenant_id, id) deferrable initially deferred,
  add constraint article_drafts_published_version_fk foreign key (tenant_id, published_version_id) references article_versions(tenant_id, id) deferrable initially deferred;

create table article_transitions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  article_id  uuid not null,
  from_status text not null,
  to_status   text not null,
  action      text not null,
  actor_id    uuid references users(id) on delete set null,
  version_id  uuid,
  comment     text not null default '',
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, article_id) references article_drafts(tenant_id, id) on delete cascade
);
create index article_transitions_article_idx on article_transitions(article_id, created_at desc);

create table approvals (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  article_id  uuid not null,
  version_id  uuid not null,
  decision    text not null check (decision in ('approved', 'rejected')),
  approver_id uuid not null references users(id) on delete restrict,
  comment     text not null default '',
  checks      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, article_id) references article_drafts(tenant_id, id) on delete cascade,
  foreign key (tenant_id, version_id) references article_versions(tenant_id, id) on delete restrict
);
create index approvals_article_idx on approvals(article_id, created_at desc);

create table published_pages (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  article_id   uuid not null unique,
  version_id   uuid not null,
  approval_id  uuid not null,
  slug         text not null,
  status       text not null check (status in ('live', 'suspended')),
  content      jsonb not null,
  incident_id  uuid not null references incidents(id) on delete restrict,
  published_at timestamptz not null default now(),
  published_by uuid references users(id) on delete set null,
  suspended_at timestamptz,
  suspended_by uuid references users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (tenant_id, slug),
  foreign key (tenant_id, article_id)  references article_drafts(tenant_id, id) on delete cascade,
  foreign key (tenant_id, version_id)  references article_versions(tenant_id, id) on delete restrict,
  foreign key (tenant_id, approval_id) references approvals(tenant_id, id) on delete restrict
);
create index published_pages_tenant_status_idx on published_pages(tenant_id, status);

-- Defence in depth: a page can only point at an *approved* approval of the *same* version.
create or replace function app.enforce_published_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  select exists (
    select 1 from approvals a
    where a.id = new.approval_id and a.tenant_id = new.tenant_id
      and a.article_id = new.article_id and a.version_id = new.version_id
      and a.decision = 'approved'
  ) into ok;
  if not ok then
    raise exception 'published page requires an approved approval for the same version'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger published_pages_approval_check
  before insert or update of version_id, approval_id on published_pages
  for each row execute function app.enforce_published_approval();

-- ───────────────────────────── AI, ops, audit ─────────────────────────────

create table ai_execution_logs (
  id             uuid primary key default gen_random_uuid(),
  job_key        text not null unique,               -- idempotency / duplicate-execution guard
  tenant_id      uuid references tenants(id) on delete cascade,
  task           text not null,
  prompt_id      text not null,
  prompt_version text not null,
  provider       text not null check (provider in ('anthropic', 'simulation')),
  model          text not null,
  status         text not null check (status in ('running', 'succeeded', 'failed', 'invalid_output', 'rejected_limit')),
  input_summary  jsonb not null default '{}'::jsonb,
  output         jsonb,
  error_code     text,
  error_message  text,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  cost_usd       numeric(12, 6) not null default 0,
  duration_ms    integer,
  article_id     uuid,
  incident_id    uuid references incidents(id) on delete set null,
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);
create index ai_logs_tenant_created_idx on ai_execution_logs(tenant_id, created_at desc);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references tenants(id) on delete cascade,
  audience   text not null check (audience in ('tenant', 'operator')),
  kind       text not null check (kind in ('contract_expiring', 'ai_limit', 'material_update', 'approval_requested', 'collection_failed', 'backup', 'published')),
  severity   text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title      text not null,
  body       text not null default '',
  link       text,
  dedupe_key text unique,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_tenant_idx on notifications(tenant_id, created_at desc);

create table audit_logs (
  id          bigserial primary key,
  tenant_id   uuid references tenants(id) on delete set null,
  actor_id    uuid references users(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_tenant_idx on audit_logs(tenant_id, created_at desc);

create table backup_runs (
  id           uuid primary key default gen_random_uuid(),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null check (status in ('running', 'succeeded', 'failed')),
  file_name    text,
  size_bytes   bigint,
  checksum     text,
  table_counts jsonb not null default '{}'::jsonb,
  error        text,
  triggered_by uuid references users(id) on delete set null
);
