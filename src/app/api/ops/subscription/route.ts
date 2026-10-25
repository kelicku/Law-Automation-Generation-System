import { z } from "zod";
import { requireApiViewer } from "@/lib/auth/session";
import { handler, ok, readJson } from "@/lib/server/api";
import { runContractSweep, updateSubscription } from "@/lib/server/ops";

const Body = z.object({
  tenantId: z.string().uuid(),
  aiLimit: z.number().int().min(0).max(100_000).optional(),
  endsInDays: z.number().int().min(-30).max(1500).optional(),
});

export const POST = handler(async (req: Request) => {
  const viewer = await requireApiViewer({ operator: true });
  const { tenantId, ...patch } = Body.parse(await readJson(req));
  await updateSubscription(viewer, tenantId, patch);
  const created = patch.endsInDays !== undefined ? await runContractSweep() : 0;
  return ok({ ok: true, notificationsCreated: created });
});
