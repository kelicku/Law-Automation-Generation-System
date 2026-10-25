import { config } from "dotenv";
import postgres from "postgres";
import { seedDemo } from "@/lib/demo/seed";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const url = process.env.DATABASE_WORKER_URL;
  if (!url) throw new Error("DATABASE_WORKER_URL is not set");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const r = await seedDemo(sql);
  console.log(`seeded ${Object.keys(r.tenants).length} tenants, ${Object.keys(r.users).length} users, ${Object.keys(r.incidents).length} incidents`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
