import './globals.css';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import DistrictShell from '@/components/DistrictShell';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: '童軍區管理平台',
  description: '統一前端 · 各區獨立後台 · 多區管理系統',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '區管理系統',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <Suspense fallback={<div className="center"><div className="spinner" /></div>}>
          <DistrictShell>{children}</DistrictShell>
        </Suspense>
        <Analytics />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(function(){});});}`,
          }}
        />
      </body>
    </html>
  );
}
