import type { Metadata } from "next";
import { JourneyProvider } from "@/components/journey/journey";
import { Shell } from "@/components/shell/shell";
import { MotionProvider } from "@/components/ui/motion-provider";
import { aiMode } from "@/lib/ai/run";
import { findResumeTarget } from "@/lib/auth/demo-access";
import { dbCtx, requireViewer } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { DEMO_USERS } from "@/lib/demo/tenants";
import { env } from "@/lib/env";
import { listNotifications, unreadCount } from "@/lib/server/queries";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const [notifications, unread, own, targets] = await Promise.all([
    listNotifications(viewer, 20),
    unreadCount(viewer),
    findResumeTarget(),
    withUser(dbCtx(viewer), async (tx) => {
      const [inc] = await tx`select id from incidents where organization_name like '東雲モビリティ%' limit 1`;
      const [art] = inc && viewer.tenant ? await tx`select id from article_drafts where incident_id = ${inc.id}` : [];
      return { incidentId: (inc?.id as string) ?? null, articleId: (art?.id as string) ?? null, siteHref: viewer.tenant ? `/sites/${viewer.tenant.slug}` : "/" };
    }),
  ]);
  const personas = env.demoMode ? DEMO_USERS.map((u) => ({ key: u.key, name: u.name, persona: u.persona, email: u.email })) : [];
  return (
    <MotionProvider>
    <JourneyProvider targets={targets} autoStart={false}>
      <Shell
        viewer={{ name: viewer.name, email: viewer.email, platformRole: viewer.platformRole, role: viewer.role, tenant: viewer.tenant }}
        notifications={notifications.map((n) => ({ ...n, created_at: new Date(n.created_at).toISOString(), read_at: n.read_at ? new Date(n.read_at).toISOString() : null })) as never}
        unread={unread}
        personas={personas}
        demoMode={env.demoMode}
        aiProvider={aiMode().provider}
        ownFirm={own?.firmName ?? null}
      >
        {children}
      </Shell>
    </JourneyProvider>
    </MotionProvider>
  );
}
