/* Seeds the fictional demo data only when the database has no tenants yet.
   Used by the production start command so redeploys never wipe visitor activity. */
import { config } from "dotenv";
import postgres from "postgres";
import { seedDemo } from "@/lib/demo/seed";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const url = process.env.DATABASE_WORKER_URL;
  if (!url) throw new Error("DATABASE_WORKER_URL is not set");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const [{ n }] = await sql`select count(*)::int as n from tenants`;
  if (n === 0) {
    await seedDemo(sql);
    console.log("seeded fictional demo data");
  } else {
    console.log(`demo data present (${n} tenants) — skipping seed`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
