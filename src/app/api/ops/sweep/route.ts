import { requireApiViewer } from "@/lib/auth/session";
import { handler, ok } from "@/lib/server/api";
import { runContractSweep } from "@/lib/server/ops";

export const POST = handler(async () => {
  await requireApiViewer({ operator: true });
  return ok({ created: await runContractSweep() });
});
