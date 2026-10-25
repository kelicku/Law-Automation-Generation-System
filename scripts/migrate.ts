/* Applies db/migrations/*.sql in order. Creates the application roles first
   (passwords are taken from DATABASE_APP_URL / DATABASE_WORKER_URL). */
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function credentials(url: string) {
  const u = new URL(url);
  return { user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
}

async function ensureRole(sql: postgres.Sql, name: string, password: string | null, attrs: string) {
  if (!/^[a-z_]+$/.test(name)) throw new Error("invalid role name");
  const [row] = await sql`select 1 as x from pg_roles where rolname = ${name}`;
  // Create only. Some managed Postgres services (e.g. Neon) let the owner create roles but not
  // alter them later; set MIGRATE_ALTER_ROLES=true to re-apply attributes/passwords where allowed.
  if (row && process.env.MIGRATE_ALTER_ROLES !== "true") return;
  const pw = password ? ` password '${password.replace(/'/g, "''")}'` : "";
  await sql.unsafe(`${row ? "alter" : "create"} role ${name} ${attrs}${pw}`);
}

async function main() {
  const sql = postgres(need("DATABASE_OWNER_URL"), { max: 1, onnotice: () => {} });
  const app = credentials(need("DATABASE_APP_URL"));
  const worker = credentials(need("DATABASE_WORKER_URL"));
  if (app.user !== "aiip_app" || worker.user !== "aiip_worker") throw new Error("unexpected role names in URLs");

  await ensureRole(sql, "aiip_app", app.password, "login nobypassrls nosuperuser nocreatedb nocreaterole");
  await ensureRole(sql, "aiip_worker", worker.password, "login bypassrls nosuperuser nocreatedb nocreaterole");
  await ensureRole(sql, "aiip_public", null, "nologin nobypassrls");
  // INHERIT FALSE: aiip_public policies must not apply to aiip_app unless it explicitly SETs ROLE.
  const [granted] = await sql`
    select m.inherit_option, m.set_option from pg_auth_members m
    join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member
    where r.rolname = 'aiip_public' and u.rolname = 'aiip_app'`;
  if (!granted || granted.inherit_option || !granted.set_option) {
    if (granted) await sql.unsafe("revoke aiip_public from aiip_app");
    await sql.unsafe("grant aiip_public to aiip_app with inherit false, set true");
  }

  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name as string));
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const body = readFileSync(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
  }
  console.log("migrations up to date");
  await sql.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
