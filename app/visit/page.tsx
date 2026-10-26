'use client';
/** 舊網址相容（v4.32.0）：旅團探訪已併入「旅團」卡 /troop，舊書籤自動轉去對應分頁。 */
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDistrict } from '@/lib/useDistrict';

export default function VisitRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { withDistrict } = useDistrict();

  useEffect(() => {
    const query = new URLSearchParams(searchParams.toString());
    const tab = query.get('tab');
    if (tab === 'units') query.set('tab', 'directory');
    else if (tab !== 'report' && tab !== 'requests') query.set('tab', 'visit');
    router.replace(withDistrict(`/troop?${query.toString()}`));
  }, [router, searchParams, withDistrict]);

  return <div className="center"><div className="spinner" /></div>;
}
