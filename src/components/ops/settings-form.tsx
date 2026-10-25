"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/misc";
import { api, ClientApiError } from "@/lib/client/api";

export interface SettingsValue {
  firm_display_name: string;
  tagline: string;
  lawyers: { name: string; title: string; bar: string; profile: string }[];
  consultation_form_url: string;
  fee_notice: string;
  address: string;
  phone: string;
  office_hours: string;
  simulate_ai_failure: boolean;
}

export function SettingsForm({ initial, canEdit }: { initial: SettingsValue; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof SettingsValue>(k: K, val: SettingsValue[K]) => setV({ ...v, [k]: val });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api("/api/settings", { method: "PATCH", body: v });
      toast.success("事務所設定を保存しました");
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError && Array.isArray(err.details)) {
        setErrors(Object.fromEntries((err.details as { path: string; message: string }[]).map((d) => [d.path, d.message])));
      }
      toast.error(err instanceof ClientApiError ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };
  const field = (k: keyof SettingsValue, label: string, multiline = false) => (
    <div>
      <Label htmlFor={k}>{label}</Label>
      {multiline ? (
        <Textarea id={k} rows={3} value={String(v[k])} disabled={!canEdit} onChange={(e) => set(k, e.target.value as never)} />
      ) : (
        <Input id={k} value={String(v[k])} disabled={!canEdit} onChange={(e) => set(k, e.target.value as never)} data-testid={`setting-${k}`} />
      )}
      {errors[k] && <p className="mt-1 text-xs text-st-suspended" role="alert">{errors[k]}</p>}
    </div>
  );
  return (
    <form onSubmit={save} className="space-y-8">
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2" disabled={!canEdit}>
        <legend className="mb-3 text-xs font-semibold text-ink-2">公開サイトの表示</legend>
        {field("firm_display_name", "事務所名")}
        {field("tagline", "キャッチコピー")}
        {field("address", "所在地")}
        {field("phone", "電話番号")}
        {field("office_hours", "受付時間")}
        {field("consultation_form_url", "外部相談フォームURL（HTTPS）")}
        <div className="sm:col-span-2">{field("fee_notice", "費用表示", true)}</div>
      </fieldset>
      <fieldset disabled={!canEdit}>
        <legend className="mb-3 text-xs font-semibold text-ink-2">弁護士情報</legend>
        <ul className="space-y-3">
          {v.lawyers.map((l, i) => (
            <li key={i} className="grid grid-cols-1 gap-2 border-l-2 border-line pl-3 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
              <Input aria-label="氏名" value={l.name} onChange={(e) => set("lawyers", v.lawyers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input aria-label="肩書" value={l.title} onChange={(e) => set("lawyers", v.lawyers.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <Input aria-label="所属" value={l.bar} onChange={(e) => set("lawyers", v.lawyers.map((x, j) => (j === i ? { ...x, bar: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="icon" aria-label="弁護士を削除" disabled={v.lawyers.length <= 1} onClick={() => set("lawyers", v.lawyers.filter((_, j) => j !== i))}><Trash2 /></Button>
              <Textarea aria-label="紹介文" rows={2} className="sm:col-span-4" value={l.profile} onChange={(e) => set("lawyers", v.lawyers.map((x, j) => (j === i ? { ...x, profile: e.target.value } : x)))} />
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => set("lawyers", [...v.lawyers, { name: "新しい弁護士", title: "弁護士", bar: "架空弁護士会 所属（デモ用）", profile: "" }])}><Plus />弁護士を追加</Button>
      </fieldset>
      <fieldset disabled={!canEdit} className="border-t border-line pt-6">
        <legend className="sr-only">デモ用の障害シミュレーション</legend>
        <div className="flex items-start gap-3">
          <Switch id="sim-fail" checked={v.simulate_ai_failure} onCheckedChange={(c) => set("simulate_ai_failure", c)} disabled={!canEdit} data-testid="toggle-ai-failure" />
          <div>
            <label htmlFor="sim-fail" className="text-[13px] font-medium">AI API障害をシミュレーションする（デモ用）</label>
            <p className="mt-0.5 text-xs text-ink-3">有効にすると、この事務所のAI処理が「上流APIが応答しない」エラーになります。エラー表示と再試行の動作を確認できます。</p>
          </div>
        </div>
      </fieldset>
      {canEdit ? <Button type="submit" loading={busy} data-testid="save-settings">設定を保存</Button> : <p className="text-xs text-slate">事務所設定を変更できるのは弁護士のみです。</p>}
    </form>
  );
}
