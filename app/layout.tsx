import './globals.css';
import type { Metadata } from 'next';
import { Suspense } from 'react';
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
      </body>
    </html>
  );
}
