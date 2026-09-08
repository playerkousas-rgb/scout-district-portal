'use client';
import PlaceholderPage from '@/components/PlaceholderPage';
export default function VisitPage() {
  return (
    <PlaceholderPage
      icon="🏕" title="旅團探訪"
      description="年度旅團探訪安排與記錄（規劃中）。"
      features={[
        '本年度探訪名單：邊個旅未探訪、邊個已完成',
        '排期：日期、探訪者、集合地點',
        '探訪記錄：人數、觀察、跟進事項',
        '一鍵產生年度探訪總結',
      ]}
    />
  );
}
