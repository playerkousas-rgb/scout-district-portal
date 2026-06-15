'use client';
import PlaceholderPage from '@/components/PlaceholderPage';
export default function AwardsPage() {
  return (
    <PlaceholderPage
      icon="🎖" title="獎勵提名"
      description="讀取本區獲獎 Excel，自動推算每人最快可推薦的下一級獎勵。"
      features={[
        '讀本區獲獎名單（DC 仍可在原 Excel 維護）',
        '三大階梯：功績榮譽 / 長期服務 / 卓越服務（含笛子嘉許）',
        '自動定位每人目前最高級別',
        '依「暗盤年限」推算下一級最快可提名年份',
        '一鍵產生「明年建議提名名單」',
      ]}
    />
  );
}
