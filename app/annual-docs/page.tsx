'use client';
import PlaceholderPage from '@/components/PlaceholderPage';
export default function AnnualDocsPage() {
  return (
    <PlaceholderPage
      icon="📂" title="週年會議文件"
      description="週年會議文件庫與籌備清單，6 月前死線倒數。"
      features={[
        '文件庫：議程 / 紀錄 / 財務報告 / 人數統計 / 司儀稿',
        '週年會議籌備清單 + 6 月前死線倒數',
        '委員出席登記',
        '實務手冊範本套用',
      ]}
    />
  );
}
