import { readFileSync } from "node:fs";
import postgres from "postgres";
const url = readFileSync(".env.neon.local", "utf8").match(/NEON_OWNER_URL=(.*)/)[1].trim();
const sql = postgres(url, { max: 1, onnotice: () => {} });
const [me] = await sql`select current_user, rolsuper, rolcreaterole, rolbypassrls from pg_roles where rolname = current_user`;
console.log("owner attrs:", JSON.stringify(me));
for (const attrs of ["login nobypassrls", "login bypassrls", "nologin"]) {
  const name = "probe_" + attrs.split(" ")[1]?.slice(0, 6) + Date.now() % 1000;
  try { await sql.unsafe(`create role ${name} ${attrs} ${attrs.startsWith('login') ? "password 'Pr0be-Aa9!kQ2#mZ7-" + Date.now() + "'" : ''}`); console.log("OK  create role", attrs); await sql.unsafe(`drop role ${name}`); }
  catch (e) { console.log("FAIL create role", attrs, "->", e.message); }
}
try { await sql.unsafe("create role probe_set nologin"); await sql.unsafe("grant probe_set to current_user"); await sql.unsafe("create role probe_app login password 'Pr0be-Aa9!kQ2#mZ7-551'"); await sql.unsafe("grant probe_set to probe_app with inherit false, set true"); console.log("OK  grant with inherit false"); } catch (e) { console.log("FAIL grant inherit false ->", e.message); }
await sql.unsafe("drop role if exists probe_app"); await sql.unsafe("drop role if exists probe_set");
await sql.end();
