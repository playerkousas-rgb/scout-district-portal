'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useDistrict } from '@/lib/useDistrict';
import type { UserSession } from '@/lib/types';

type Item = {
  id: string; type: string; refCode: string; title: string;
  name: string; startDate: string; endDate: string; purpose: string;
};

function asText(v: unknown) { return v == null ? '' : String(v); }

export default function PendingTicker({ session }: { session: UserSession }) {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const [items, setItems] = useState<Item[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const inbox = await api.getPendingInbox(session.token);
      if (!live) return;
      if (inbox.ok && inbox.data) {
        setItems([...(inbox.data.venue || []), ...(inbox.data.stock || [])]);
        setReady(true);
        return;
      }
      // 舊 GS 未有 inbox：用現有審批 API 兜底，唔使等升級先見到走馬燈
      const [vb, sr] = await Promise.all([
        api.getVenueBookings(session.token),
        api.getStockRequests(session.token),
      ]);
      if (!live) return;
      const venue: Item[] = (vb.ok && vb.data ? vb.data : [])
        .filter(r => String(r.status || 'pending').toLowerCase() === 'pending')
        .map(r => ({
          id: asText(r.id), type: 'venue', refCode: asText(r.refCode),
          title: asText(r.venueName || r.venueId || '區總部'),
          name: asText(r.name), startDate: asText(r.startDate),
          endDate: asText(r.endDate), purpose: asText(r.purpose),
        }));
      const stock: Item[] = (sr.ok && sr.data ? sr.data : [])
        .filter(r => String(r.status || 'pending').toLowerCase() === 'pending')
        .map(r => ({
          id: asText(r.id), type: 'stock', refCode: asText(r.refCode),
          title: `${asText(r.itemName || r.itemId || '物資')}${r.qty ? ` ×${r.qty}` : ''}`,
          name: asText(r.name), startDate: asText(r.borrowDate),
          endDate: asText(r.returnDate), purpose: asText(r.purpose),
        }));
      setItems([...venue, ...stock]);
      setReady(true);
    })().catch(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, [session.token]);

  const line = useMemo(() => {
    if (!items.length) return '';
    return items.map(it => {
      const kind = it.type === 'stock' ? '📦 借物資' : '🏛 借場';
      const when = it.startDate ? ` ${it.startDate}${it.endDate ? ' → ' + it.endDate : ''}` : '';
      return `${kind}待批 ${it.refCode || ''} ${it.title} · ${it.name}${when}`;
    }).join('　　★　　');
  }, [items]);

  if (!ready || !items.length) return null;

  const venueN = items.filter(i => i.type === 'venue').length;
  const stockN = items.filter(i => i.type === 'stock').length;
  const first = items[0];
  const href = first.type === 'stock' ? '/stock-regs' : '/venue-regs';

  function go() { router.push(withDistrict(href)); }

  return (
    <div
      className="hero-ticker"
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
    >
      <div className="hero-ticker-badge">⚠ 待你批核 {items.length} 項</div>
      <div className="hero-ticker-track">
        <div className="hero-ticker-move">
          <span>{line}</span>
          <span aria-hidden>{line}</span>
        </div>
      </div>
      <div className="hero-ticker-meta">
        {venueN ? `借場 ${venueN}` : ''}{venueN && stockN ? ' · ' : ''}{stockN ? `物資 ${stockN}` : ''}
        <b>　點擊處理 →</b>
      </div>
    </div>
  );
}
