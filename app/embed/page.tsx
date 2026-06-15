'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { loadSession } from '@/lib/session';
import { useDistrict } from '@/lib/useDistrict';
import type { UserSession, CardDef } from '@/lib/types';

function EmbedInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { withDistrict } = useDistrict();
  const cardId = params.get('card') || '';
  const [session, setSession] = useState<UserSession | null>(null);
  const [card, setCard] = useState<CardDef | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace(withDistrict('/')); return; }
    setSession(s);
    (async () => {
      try {
        const r = await api.getCards(s.token);
        if (r.ok && r.data) {
          const c = r.data.find(x => x.cardId === cardId) || null;
          if (!c) setError('找不到此卡片或你沒有權限。'); else setCard(c);
        } else setError(r.error || '無法載入');
      } catch { setError('連線失敗。'); } finally { setLoading(false); }
    })();
  }, [router, cardId, withDistrict]);

  const target = card && session
    ? `${card.url}${card.url.includes('?') ? '&' : '?'}role=${encodeURIComponent(session.role)}&from=portal&embed=1`
    : '';

  return (
    <div className="embed-shell">
      <div className="embed-bar">
        <span className="backlink" onClick={() => router.push(withDistrict('/'))} style={{ margin: 0 }}>← 返回主控台</span>
        {card && <span className="embed-title">{card.icon} {card.title}</span>}
        {card && <a className="embed-newtab" href={card.url} target="_blank" rel="noopener noreferrer">↗ 在新分頁開啟</a>}
      </div>
      {loading && <div className="center" style={{ flex: 1 }}><div className="spinner" /></div>}
      {error && <div className="center" style={{ flex: 1 }}><div className="err" style={{ maxWidth: 480 }}>{error}</div></div>}
      {!loading && !error && card && <iframe className="embed-frame" src={target} title={card.title} allow="clipboard-write" />}
    </div>
  );
}

export default function EmbedPage() {
  return <Suspense fallback={<div className="center"><div className="spinner" /></div>}><EmbedInner /></Suspense>;
}
