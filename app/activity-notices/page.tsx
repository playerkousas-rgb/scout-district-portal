'use client';
/** 舊網址相容（v4.32.0）：活動知會已併入「旅團」卡 /troop 的活動知會大分頁，舊書籤自動轉去。 */
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDistrict } from '@/lib/useDistrict';

export default function ActivityNoticesRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { withDistrict } = useDistrict();

  useEffect(() => {
    const query = new URLSearchParams(searchParams.toString());
    query.set('tab', 'activity');
    router.replace(withDistrict(`/troop?${query.toString()}`));
  }, [router, searchParams, withDistrict]);

  return <div className="center"><div className="spinner" /></div>;
}
