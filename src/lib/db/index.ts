import "server-only";
import postgres from "postgres";
import { env } from "@/lib/env";

/**
 * Two connection pools:
 *  - appSql    : role aiip_app (NOBYPASSRLS). All user-facing queries go through withUser()/withPublic().
 *  - workerSql : role aiip_worker (BYPASSRLS). Only for system jobs in src/lib/server/system/*.
 */
type Pools = { app: postgres.Sql; worker: postgres.Sql };
const g = globalThis as unknown as { __aiipPools?: Pools };

function pools(): Pools {
  if (!g.__aiipPools) {
    // Serverless hosts run many short-lived instances: keep pools small (DB_POOL_MAX) and, behind a
    // transaction-mode pooler (e.g. Neon "-pooler" hosts), avoid server-side prepared statements.
    const max = Number(process.env.DB_POOL_MAX ?? 8);
    const opts = (url: string) => ({
      max,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: !new URL(url).hostname.includes("-pooler"),
      onnotice: () => {},
      connection: { application_name: "aiip-web" },
    });
    g.__aiipPools = {
      app: postgres(env.appDbUrl, opts(env.appDbUrl)),
      worker: postgres(env.workerDbUrl, { ...opts(env.workerDbUrl), max: Math.max(1, Math.ceil(max / 2)) }),
    };
  }
  return g.__aiipPools;
}

export type Tx = postgres.TransactionSql;

export interface DbContext {
  userId: string;
  tenantId: string | null;
}

/** Runs fn inside a transaction where RLS sees the given user and active tenant. */
export async function withUser<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return pools().app.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${ctx.userId}, true), set_config('app.tenant_id', ${ctx.tenantId ?? ""}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

/** Public website reads: role aiip_public can only see live pages and public firm profile columns. */
export async function withPublic<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return pools().app.begin(async (tx) => {
    await tx`set local role aiip_public`;
    return fn(tx);
  }) as Promise<T>;
}

/** System jobs only. Bypasses RLS — callers must perform their own authorisation first. */
export function workerSql(): postgres.Sql {
  return pools().worker;
}

export function json(tx: Tx | postgres.Sql, value: unknown) {
  return tx.json(value as postgres.JSONValue);
}
