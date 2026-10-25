"use client";
import { BellRing, DatabaseBackup } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { api, ClientApiError } from "@/lib/client/api";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      toast.success(await fn());
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "操作に失敗しました");
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

export function TenantControls({ tenantId, limit, used }: { tenantId: string; limit: number; used: number }) {
  const { busy, run } = useAction();
  const [value, setValue] = useState(String(limit));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input aria-label="月間AI上限" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-20 font-num text-xs" data-testid={`limit-input-${tenantId}`} />
      <Button size="sm" variant="outline" loading={busy === "limit"} onClick={() => run("limit", async () => {
        await api("/api/ops/subscription", { body: { tenantId, aiLimit: Number(value) } });
        return `AI上限を ${value}回 に変更しました`;
      })} data-testid={`limit-save-${tenantId}`}>上限を保存</Button>
      <Button size="sm" variant="ghost" loading={busy === "cap"} onClick={() => run("cap", async () => {
        await api("/api/ops/subscription", { body: { tenantId, aiLimit: used } });
        setValue(String(used));
        return "上限を現在の利用量に設定しました（新規AI処理は停止されます）";
      })} data-testid={`limit-cap-${tenantId}`}>上限到達を再現</Button>
      <Button size="sm" variant="ghost" loading={busy === "contract"} onClick={() => run("contract", async () => {
        const r = await api<{ notificationsCreated: number }>("/api/ops/subscription", { body: { tenantId, endsInDays: 14 } });
        return `契約期限を14日後に設定しました（通知 ${r.notificationsCreated}件）`;
      })} data-testid={`contract-14-${tenantId}`}>期限を14日後に</Button>
    </div>
  );
}

export function OpsButtons() {
  const { busy, run } = useAction();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" loading={busy === "sweep"} onClick={() => run("sweep", async () => {
        const r = await api<{ created: number }>("/api/ops/sweep");
        return r.created ? `契約期限の通知を ${r.created}件 作成しました` : "新たに通知が必要な契約はありません";
      })} data-testid="run-sweep"><BellRing />通知チェックを実行</Button>
      <Button loading={busy === "backup"} onClick={() => run("backup", async () => {
        const r = await api<{ fileName: string; size: number }>("/api/ops/backup");
        return `バックアップ完了：${r.fileName}`;
      })} data-testid="run-backup"><DatabaseBackup />バックアップを実行</Button>
    </div>
  );
}
