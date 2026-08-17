'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { useDistrict } from '@/lib/useDistrict';
import type { UserSession, Venue, VenueBooking } from '@/lib/types';

const STATUS: Record<string, string> = { pending: '待批', approved: '已批', rejected: '已拒絕', cancelled: '已取消' };

export default function VenueRegsPage() {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const session = useRequireCard('venueReg');
  const [bookings, setBookings] = useState<VenueBooking[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [vDraft, setVDraft] = useState<Venue>({ venueId: '', name: '', location: '', capacity: '', note: '', active: 'TRUE' });

  async function load(s: UserSession) {
    setLoading(true); setError('');
    const [b, v] = await Promise.all([api.getVenueBookings(s.token), api.listVenues()]);
    if (b.ok && b.data) setBookings(b.data); else setError(b.error || '無法載入申請');
    if (v.ok && v.data) setVenues(v.data);
    setLoading(false);
  }
  useEffect(() => { if (session) { load(session); } }, [session]);

  async function setStatus(b: VenueBooking, status: string) {
    if (!session) return;
    setBusy(true); setError(''); setMsg('');
    const r = await api.setVenueBookingStatus(session.token, b.id, status);
    setBusy(false);
    if (r.ok) { setMsg(`已標為「${STATUS[status]}」✓`); await load(session); }
    else setError(r.error || '更新失敗');
  }
  async function saveVenue() {
    if (!session) return;
    setError(''); setMsg('');
    if (!vDraft.venueId.trim() || !vDraft.name.trim()) { setError('場地代碼與名稱必填'); return; }
    const r = await api.saveVenue(session.token, vDraft);
    if (r.ok) { setMsg('場地已儲存 ✓'); setVDraft({ venueId: '', name: '', location: '', capacity: '', note: '', active: 'TRUE' }); await load(session); }
    else setError(r.error || '儲存失敗');
  }
  async function delVenue(v: Venue) {
    if (!session || !confirm(`確定刪除場地「${v.name}」？`)) return;
    const r = await api.deleteVenue(session.token, v.venueId);
    if (r.ok) { setMsg('場地已刪除 ✓'); await load(session); } else setError(r.error || '刪除失敗');
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <span className="backlink" onClick={() => router.push(withDistrict('/'))}>← 返回主控台</span>
      <h1 className="page-title">🏛 場地借用審批</h1>
      <p className="page-sub">
        批核借場申請（申請人於 member-portal 填表）；<b>批准後自動：設定 TTLock 限時密碼 → Teamup 轉色 → 電郵申請人</b>。
      </p>
      {error && <div className="err">{error}</div>}
      {msg && <div className="success">✓ {msg}</div>}

      <section className="info-card">
        <div className="section-head"><div><h3>申請審批 <small>({bookings.length})</small></h3></div></div>
        {loading ? <div className="small-loading">載入中…</div> : bookings.length === 0 ? (
          <p className="empty">暫無申請。</p>
        ) : bookings.map(b => (
          <article key={b.id} className="user-row" style={{ flexWrap: 'wrap' }}>
            <div className="user-identity">
              <b>{b.venueName || b.venueId}</b>
              <span>{b.name}{b.phone ? ` · ${b.phone}` : ''}{b.troop ? ` · ${b.troop}` : ''}</span>
              <span>{b.startDate}{b.endDate ? ` → ${b.endDate}` : ''} · {b.purpose}</span>
              <span className="rcode">{b.refCode}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {b.status === 'approved' && b.passcode && (
                <span className="state on" style={{ letterSpacing: 1 }}>🔑 密碼 {b.passcode}</span>
              )}
              <span className={`state ${b.status === 'approved' ? 'on' : b.status === 'pending' ? '' : 'off'}`}>{STATUS[b.status || 'pending'] || b.status}</span>
              <div className="user-actions" style={{ display: 'inline-flex', gap: 6 }}>
                <button className="mini-btn" disabled={busy} onClick={() => setStatus(b, 'approved')}>✅ 批准</button>
                <button className="mini-btn danger" disabled={busy} onClick={() => setStatus(b, 'rejected')}>✕ 拒絕</button>
                <button className="mini-btn" disabled={busy} onClick={() => setStatus(b, 'cancelled')}>↩ 取消</button>
              </div>
            </div>
            {b.reviewedAt && <span style={{ fontSize: 11, color: '#888' }}>審批：{b.reviewer} @ {b.reviewedAt}</span>}
          </article>
        ))}
      </section>

      <section className="info-card">
        <div className="section-head"><div><h3>場地清單</h3></div></div>
        <div className="account-form" style={{ flexWrap: 'wrap', display: 'flex', gap: 8 }}>
          <input placeholder="代碼 *" value={vDraft.venueId} onChange={e => setVDraft({ ...vDraft, venueId: e.target.value })} style={{ width: 130 }} />
          <input placeholder="名稱 *" value={vDraft.name} onChange={e => setVDraft({ ...vDraft, name: e.target.value })} style={{ width: 180 }} />
          <input placeholder="位置" value={vDraft.location || ''} onChange={e => setVDraft({ ...vDraft, location: e.target.value })} style={{ width: 180 }} />
          <input placeholder="容量" value={vDraft.capacity || ''} onChange={e => setVDraft({ ...vDraft, capacity: e.target.value })} style={{ width: 80 }} />
          <button className="btn-sm" onClick={saveVenue}>＋ 新增場地</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {venues.map(v => (
            <div key={v.venueId} className="user-row" style={{ flexWrap: 'wrap' }}>
              <div className="user-identity"><b>{v.name}</b><span className="rcode">{v.venueId}</span><span>{v.location}{v.capacity ? ` · 容 ${v.capacity}` : ''}</span></div>
              <button className="mini-btn danger" onClick={() => delVenue(v)}>刪除</button>
            </div>
          ))}
          {!venues.length && <p className="empty">尚未有場地。</p>}
        </div>
      </section>
    </>
  );
}
