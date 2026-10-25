-- 0005_sandbox_accounts.sql
-- One-click demo registration: each visitor can get a private, fictional law firm.
-- resume_hash = sha256 of a random token kept in an HttpOnly cookie ("続きから再開").
create table sandbox_accounts (
  user_id     uuid primary key references users(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  resume_hash text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  last_used_at timestamptz not null default now()
);
create index sandbox_accounts_created_idx on sandbox_accounts(created_at);

-- system role only: no policies for aiip_app → no access through the web app role
alter table sandbox_accounts enable row level security;
grant select, insert, update, delete, truncate on sandbox_accounts to aiip_worker;
