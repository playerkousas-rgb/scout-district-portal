'use client';
import PlaceholderPage from '@/components/PlaceholderPage';
export default function BudgetPage() {
  return (
    <PlaceholderPage
      icon="📑" title="區年度預算"
      description="年度預算（連結原 Excel；結構：去年實際 / 估算 / 本年預算 / 備註）。"
      features={[
        '支出 / 收入分類（訓練班、活動、社區服務、典禮…）',
        '去年實際 vs 本年預算對比',
        '財政年度 4/1–3/31 對齊',
        '連結原有預算 Google Sheet（DC 照舊用 Excel）',
      ]}
    />
  );
}
