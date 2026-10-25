import { z } from "zod";
import { dbCtx, requireApiViewer } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { ReviewStatus } from "@/lib/domain/types";
import { handler, ok, readJson } from "@/lib/server/api";
import { audit } from "@/lib/server/audit";
import { ApiError } from "@/lib/server/errors";

const Body = z.object({ status: ReviewStatus, note: z.string().max(1000).optional().default("") });

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await requireApiViewer({ tenant: true });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) throw new ApiError(404, "NOT_FOUND", "事件が見つかりません。");
  const body = Body.parse(await readJson(req));
  await withUser(dbCtx(viewer), async (tx) => {
    const [inc] = await tx`select id from incidents where id = ${id}`;
    if (!inc) throw new ApiError(404, "NOT_FOUND", "事件が見つかりません。");
    await tx`insert into tenant_incident_reviews (tenant_id, incident_id, status, note, reviewed_by, reviewed_at)
             values (${viewer.tenant!.id}, ${id}, ${body.status}, ${body.note}, ${viewer.userId}, now())
             on conflict (tenant_id, incident_id) do update set status = excluded.status, note = excluded.note, reviewed_by = excluded.reviewed_by, reviewed_at = now()`;
    await audit(tx, { tenantId: viewer.tenant!.id, actorId: viewer.userId, action: "incident.review", targetType: "incident", targetId: id, metadata: { status: body.status } });
  });
  return ok({ ok: true });
});
