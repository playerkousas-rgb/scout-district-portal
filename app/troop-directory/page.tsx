'use client';
/** 舊網址相容（v4.32.0）：旅團資料已併入「旅團」卡 /troop 的旅團資料分頁，舊書籤自動轉去。 */
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDistrict } from '@/lib/useDistrict';

export default function TroopDirectoryRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { withDistrict } = useDistrict();

  useEffect(() => {
    const query = new URLSearchParams(searchParams.toString());
    query.set('tab', 'directory');
    router.replace(withDistrict(`/troop?${query.toString()}`));
  }, [router, searchParams, withDistrict]);

  return <div className="center"><div className="spinner" /></div>;
}
