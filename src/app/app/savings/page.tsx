import { SavingsSimulator } from "@/components/ops/savings";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "運用削減の試算" };

export default function SavingsPage() {
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        eyebrow="Operational Savings Preview"
        title="手作業とAI支援運用の比較"
        description="月間の記事数と作業時間を入力すると、想定される削減時間を試算します。表示される数値は入力値に基づく試算であり、実測値ではありません。"
      />
      <div className="border-y border-line bg-white px-5 py-8 sm:px-8"><SavingsSimulator /></div>
    </div>
  );
}
