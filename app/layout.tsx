import './globals.css';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import Script from 'next/script';
import DistrictShell from '@/components/DistrictShell';

export const metadata: Metadata = {
  title: '童軍區管理平台',
  description: '統一前端 · 各區獨立後台 · 多區管理系統',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <Suspense fallback={<div className="center"><div className="spinner" /></div>}>
          <DistrictShell>{children}</DistrictShell>
        </Suspense>
        {/* Scout Admin 統一回報：資料直接送 Scout Admin 的 Apps Script，
            不經區後台、毋須 API key；「區系統」已是 Scout Admin 的正式來源。 */}
        <Script
          src="https://scout-admin-blue.vercel.app/widget.js"
          data-app="區系統"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
