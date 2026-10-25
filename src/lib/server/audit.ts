import "server-only";
import { json, type Tx } from "@/lib/db";

export async function audit(
  tx: Tx,
  entry: { tenantId: string | null; actorId: string; action: string; targetType?: string; targetId?: string; metadata?: Record<string, unknown> },
) {
  await tx`
    insert into audit_logs (tenant_id, actor_id, action, target_type, target_id, metadata)
    values (${entry.tenantId}, ${entry.actorId}, ${entry.action}, ${entry.targetType ?? null}, ${entry.targetId ?? null}, ${json(tx, entry.metadata ?? {})})`;
}
