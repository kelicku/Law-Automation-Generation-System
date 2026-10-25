-- 0006_ai_jobs.sql
-- Long-running AI work (article generation, information collection) executed by a background
-- function on serverless hosts. The web request only queues the job; the browser polls progress.
create table ai_jobs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('article_generate', 'collect')),
  tenant_id   uuid references tenants(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  viewer      jsonb not null,                 -- snapshot of the requesting viewer (no secrets)
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  events      jsonb not null default '[]'::jsonb,
  result      jsonb,
  error_code  text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ai_jobs_user_idx on ai_jobs(user_id, created_at desc);

-- system role only (the app reads jobs through an authenticated route that checks ownership)
alter table ai_jobs enable row level security;
grant select, insert, update, delete, truncate on ai_jobs to aiip_worker;
