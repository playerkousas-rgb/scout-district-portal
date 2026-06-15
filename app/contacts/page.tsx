'use client';
import PlaceholderPage from '@/components/PlaceholderPage';
export default function ContactsPage() {
  return (
    <PlaceholderPage
      icon="📇" title="旅團聯絡簿"
      description="本區旅團聯絡資料（連結原 Excel，或匯入後一鍵群發）。"
      features={[
        '每旅聯絡資料（旅號 / 主辦機構 / 旅長領袖 / 電話 / 電郵）',
        '按支部、地區分組',
        '連結原有 Google Sheet（先遷就習慣）',
        '日後可選：一鍵群發通知',
      ]}
    />
  );
}
