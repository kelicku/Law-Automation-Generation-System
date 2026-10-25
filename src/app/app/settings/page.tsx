import { SettingsForm, type SettingsValue } from "@/components/ops/settings-form";
import { PageHeader, Section } from "@/components/shell/page-header";
import { dbCtx, requireTenantViewer } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "事務所設定" };

export default async function SettingsPage() {
  const viewer = await requireTenantViewer();
  const { s, sub, members } = await withUser(dbCtx(viewer), async (tx) => {
    const [s] = await tx`select * from tenant_settings where tenant_id = ${viewer.tenant.id}`;
    const [sub] = await tx`select plan, status, started_on, ends_on, monthly_fee_jpy, ai_monthly_call_limit from subscriptions where tenant_id = ${viewer.tenant.id}`;
    const members = await tx`select u.display_name, u.email, m.role, m.title from tenant_memberships m join users u on u.id = m.user_id where m.tenant_id = ${viewer.tenant.id}`;
    return { s, sub, members };
  });
  const canEdit = viewer.role === "owner" || viewer.role === "lawyer";
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader eyebrow="Settings" title="事務所設定" description="公開サイトに表示する事務所情報、弁護士、相談フォーム、費用表示を管理します。設定は事務所ごとに分離され、他の事務所からは参照できません。" />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="border-y border-line bg-white px-5 py-6 sm:px-6">
          <SettingsForm canEdit={canEdit} initial={{
            firm_display_name: s.firm_display_name, tagline: s.tagline, lawyers: s.lawyers, consultation_form_url: s.consultation_form_url,
            fee_notice: s.fee_notice, address: s.address, phone: s.phone, office_hours: s.office_hours, simulate_ai_failure: s.simulate_ai_failure,
          } as SettingsValue} />
        </div>
        <aside className="space-y-8">
          <Section eyebrow="Contract" title="契約情報">
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between"><dt className="text-slate">プラン</dt><dd className="font-medium capitalize">{sub.plan}</dd></div>
              <div className="flex justify-between"><dt className="text-slate">契約期間</dt><dd className="font-num tnum">{fmtDate(sub.started_on)} – {fmtDate(sub.ends_on)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate">月額</dt><dd className="font-num tnum">¥{Number(sub.monthly_fee_jpy).toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt className="text-slate">AI処理上限</dt><dd className="font-num tnum">{sub.ai_monthly_call_limit}回/月</dd></div>
              <div className="flex justify-between"><dt className="text-slate">状態</dt><dd className={sub.status === "expiring" ? "text-st-revision" : ""}>{sub.status === "expiring" ? "更新期限が近づいています" : "有効"}</dd></div>
            </dl>
          </Section>
          <Section eyebrow="Members" title="メンバー">
            <ul className="space-y-2 text-xs">
              {members.map((m) => <li key={m.email}><p className="font-medium">{m.display_name} <span className="font-normal text-slate">{m.title}</span></p><p className="text-slate">{m.email}</p></li>)}
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}
