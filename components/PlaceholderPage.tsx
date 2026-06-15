'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadSession } from '@/lib/session';
import { useDistrict } from '@/lib/useDistrict';
import type { UserSession } from '@/lib/types';

export default function PlaceholderPage({
  icon, title, description, features,
}: { icon: string; title: string; description: string; features: string[] }) {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const [session, setSession] = useState<UserSession | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace(withDistrict('/')); return; }
    setSession(s);
  }, [router, withDistrict]);

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <span className="backlink" onClick={() => router.push(withDistrict('/'))}>← 返回主控台</span>
      <h1 className="page-title">{icon} {title}</h1>
      <p className="page-sub">{description}</p>
      <div className="placeholder-box">
        <div className="big">{icon}</div>
        <p style={{ fontWeight: 700, color: '#5b2a86', marginBottom: 14 }}>此模組規劃中（佔位）</p>
        <div style={{ textAlign: 'left', maxWidth: 520, margin: '0 auto' }}>
          <p style={{ fontSize: 13, marginBottom: 8 }}>預計功能：</p>
          <ul style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20 }}>
            {features.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      </div>
    </>
  );
}
