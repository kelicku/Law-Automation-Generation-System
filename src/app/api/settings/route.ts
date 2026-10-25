import { z } from "zod";
import { dbCtx, requireApiViewer } from "@/lib/auth/session";
import { json, withUser } from "@/lib/db";
import { handler, ok, readJson } from "@/lib/server/api";
import { audit } from "@/lib/server/audit";
import { ApiError } from "@/lib/server/errors";

const Lawyer = z.object({ name: z.string().min(1).max(40), title: z.string().max(40), bar: z.string().max(80), profile: z.string().max(400) });
const Body = z.object({
  firm_display_name: z.string().min(2).max(80),
  tagline: z.string().max(120),
  lawyers: z.array(Lawyer).min(1).max(10),
  consultation_form_url: z.string().max(300).regex(/^https:\/\/[^\s<>"']+$/, "HTTPSのURLを入力してください"),
  fee_notice: z.string().max(400),
  address: z.string().max(120),
  phone: z.string().max(40),
  office_hours: z.string().max(80),
  simulate_ai_failure: z.boolean(),
});

export const PATCH = handler(async (req: Request) => {
  const viewer = await requireApiViewer({ tenant: true });
  if (viewer.role !== "owner" && viewer.role !== "lawyer") throw new ApiError(403, "FORBIDDEN", "事務所設定を変更できるのは弁護士のみです。");
  const b = Body.parse(await readJson(req));
  await withUser(dbCtx(viewer), async (tx) => {
    const r = await tx`
      update tenant_settings set firm_display_name = ${b.firm_display_name}, tagline = ${b.tagline}, lawyers = ${json(tx, b.lawyers)},
        consultation_form_url = ${b.consultation_form_url}, fee_notice = ${b.fee_notice}, address = ${b.address}, phone = ${b.phone},
        office_hours = ${b.office_hours}, simulate_ai_failure = ${b.simulate_ai_failure}, updated_at = now()
      where tenant_id = ${viewer.tenant!.id} returning tenant_id`;
    if (!r.length) throw new ApiError(403, "FORBIDDEN", "この操作を行う権限がありません。");
    await audit(tx, { tenantId: viewer.tenant!.id, actorId: viewer.userId, action: "settings.update", metadata: { simulate_ai_failure: b.simulate_ai_failure } });
  });
  return ok({ ok: true });
});
