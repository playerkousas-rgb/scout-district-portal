'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { useDistrict } from '@/lib/useDistrict';
import { canApproveHq } from '@/lib/accountRoles';
import type { UserSession, Venue, VenueBooking } from '@/lib/types';
import BackLink, { BackBar } from '@/components/BackLink';

const STATUS: Record<string, string> = { pending: '待批', approved: '已批', rejected: '已拒絕', cancelled: '已取消' };

const EMPTY_VENUE: Venue = { venueId: '', name: '', location: '', capacity: '', note: '', scienerLockId: '', active: 'TRUE' };
const EMPTY_BORROW = { venueId: '', name: '', phone: '', email: '', troop: '', purpose: '', startDate: '', endDate: '' };

export default function VenueRegsPage() {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const session = useRequireCard('venueReg');
  const hq = canApproveHq(session);
  const [bookings, setBookings] = useState<VenueBooking[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [vDraft, setVDraft] = useState<Venue>({ ...EMPTY_VENUE });
  const [locks, setLocks] = useState<{ lockId: number | string; name: string; mac: string; hasGateway: boolean }[]>([]);
  const [lockHint, setLockHint] = useState('');
  const [showBorrow, setShowBorrow] = useState(false);
  const [borrow, setBorrow] = useState({ ...EMPTY_BORROW });
  const [editId, setEditId] = useState('');
  const [edit, setEdit] = useState({ ...EMPTY_BORROW });

  async function load(s: UserSession) {
    setLoading(true); setError('');
    const [b, v] = await Promise.all([api.getVenueBookings(s.token), api.listVenues()]);
    if (b.ok && b.data) setBookings(b.data); else setError(b.error || '無法載入申請');
    if (v.ok && v.data) {
      const list = v.data;
      setVenues(list);
      setBorrow(d => d.venueId ? d : { ...d, venueId: list[0]?.venueId || '' });
    }
    setLoading(false);
  }
  useEffect(() => { if (session) { load(session); } }, [session]);

  async function oneClickApprove(b: VenueBooking) {
    if (!session) return;
    if (!confirm('一鍵批准會嘗試寫電子鎖密碼並電郵申請人。鎖未接通會改用電話頭4位／隨機密碼，其餘流程照跑。確定？')) return;
    setBusy(true); setError(''); setMsg('');
    const r = await api.approveVenueBooking(session.token, b.id);
    setBusy(false);
    if (r.ok) {
      setMsg(
        '已一鍵批准 ✓' +
        (r.data?.password ? ` 入場密碼 ${r.data.password}` : '') +
        (r.data?.warn ? `（提示：${r.data.warn}）` : '')
      );
      await load(session);
    } else setError(r.error || '一鍵批准失敗');
  }

  async function confirmOnly(b: VenueBooking) {
    if (!session) return;
    setBusy(true); setError(''); setMsg('');
    const r = await api.confirmVenueBooking(session.token, b.id);
    setBusy(false);
    if (r.ok) {
      setMsg(
        '已確認 ✓ Teamup 已轉去「確認借用」' +
        (r.data?.teamupEventId ? `（事件 ${r.data.teamupEventId}）` : '') +
        (r.data?.warn ? `（提示：${r.data.warn}）` : '')
      );
      await load(session);
    } else setError(r.error || '確認失敗');
  }

  async function reject(b: VenueBooking) {
    if (!session) return;
    if (!confirm(`拒絕「${b.venueName || b.venueId} · ${b.name}」？申請人會收到電郵。`)) return;
    setBusy(true); setError(''); setMsg('');
    const r = await api.rejectVenueBooking(session.token, b.id);
    setBusy(false);
    if (r.ok) { setMsg('已拒絕 ✓'); await load(session); }
    else setError(r.error || '拒絕失敗');
  }

  async function cancel(b: VenueBooking) {
    if (!session) return;
    setBusy(true); setError(''); setMsg('');
    const r = await api.setVenueBookingStatus(session.token, b.id, 'cancelled');
    setBusy(false);
    if (r.ok) { setMsg('已取消 ✓'); await load(session); }
    else setError(r.error || '取消失敗');
  }

  function startEdit(b: VenueBooking) {
    setEditId(b.id);
    setEdit({
      venueId: b.venueId || '',
      name: b.name || '',
      phone: b.phone || '',
      email: b.email || '',
      troop: b.troop || '',
      purpose: b.purpose || '',
      startDate: String(b.startDate || '').slice(0, 16),
      endDate: String(b.endDate || '').slice(0, 16),
    });
  }

  async function saveEdit() {
    if (!session || !editId) return;
    if (!edit.name.trim() || !edit.phone.trim() || !edit.startDate || !edit.endDate) {
      setError('編輯：姓名、電話、起訖時間必填'); return;
    }
    setBusy(true); setError(''); setMsg('');
    const r = await api.updateVenueBooking(session.token, editId, {
      venueId: edit.venueId, name: edit.name.trim(), phone: edit.phone.trim(),
      email: edit.email.trim(), troop: edit.troop.trim(), purpose: edit.purpose.trim(),
      startDate: edit.startDate, endDate: edit.endDate,
    });
    setBusy(false);
    if (r.ok) { setMsg('申請已更新 ✓'); setEditId(''); await load(session); }
    else setError(r.error || '更新失敗');
  }

  async function createBorrow() {
    if (!session) return;
    if (!borrow.venueId || !borrow.name.trim() || !borrow.phone.trim() || !borrow.startDate || !borrow.endDate) {
      setError('借用：場地、姓名、電話、起訖時間必填'); return;
    }
    setBusy(true); setError(''); setMsg('');
    const r = await api.submitVenueRequest({
      venueId: borrow.venueId, name: borrow.name.trim(), phone: borrow.phone.trim(),
      email: borrow.email.trim(), troop: borrow.troop.trim(), purpose: borrow.purpose.trim() || '區職員代借',
      startDate: borrow.startDate, endDate: borrow.endDate, agreeRules: 'TRUE',
    });
    setBusy(false);
    if (r.ok) {
      const ref = r.data?.refCode || (r as { refCode?: string }).refCode || '';
      const warn = r.data?.warn || (r as { warn?: string }).warn || '';
      setMsg(`已建立借用申請${ref ? ' ' + ref : ''} ✓${warn ? '（' + warn + '）' : ''}`);
      setBorrow({ ...EMPTY_BORROW, venueId: venues[0]?.venueId || '' });
      setShowBorrow(false);
      await load(session);
    } else setError(r.error || '建立失敗');
  }

  async function saveVenue() {
    if (!session) return;
    setError(''); setMsg('');
    if (!vDraft.venueId.trim() || !vDraft.name.trim()) { setError('場地代碼與名稱必填'); return; }
    const r = await api.saveVenue(session.token, vDraft);
    if (r.ok) { setMsg('場地已儲存 ✓'); setVDraft({ ...EMPTY_VENUE }); await load(session); }
    else setError(r.error || '儲存失敗');
  }
  async function loadLocks() {
    if (!session) return;
    setBusy(true); setError(''); setLockHint('');
    const r = await api.getLockList(session.token);
    setBusy(false);
    if (!r.ok || !r.data) { setError(r.error || '讀取鎖列表失敗（請確認 Config 已填 SCIENER 帳密）'); return; }
    setLocks(r.data.locks || []);
    setLockHint(
      `API：${r.data.apiBase}` +
      (r.data.configuredLockId ? ` · Config 已填 Lock ID ${r.data.configuredLockId}` : ' · Config 尚未填 SCIENER_LOCK_ID')
    );
    setMsg(`讀到 ${r.data.locks?.length || 0} 把鎖。點「填入」寫入場地／記住去 Config 加一列 key=SCIENER_LOCK_ID`);
  }
  function useLockId(id: string | number) {
    setVDraft(d => ({ ...d, scienerLockId: String(id) }));
    setMsg(`已填入場地 Lock ID：${id}。儲存場地後生效。整區共用亦可喺 Config 加 key=SCIENER_LOCK_ID、value=${id}`);
  }
  async function delVenue(v: Venue) {
    if (!session || !confirm(`確定刪除場地「${v.name}」？`)) return;
    const r = await api.deleteVenue(session.token, v.venueId);
    if (r.ok) { setMsg('場地已刪除 ✓'); await load(session); } else setError(r.error || '刪除失敗');
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  const pendingN = bookings.filter(b => String(b.status || 'pending').toLowerCase() === 'pending').length;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🏛 場地借用審批</h1>
      <p className="page-sub">
        申請人於 member-portal 填表 → VenueBookings + Teamup「申請中」。
        {hq
          ? ' DDC 或以上可用「一鍵批准」（試寫鎖＋電郵，鎖未通會自動改密碼）、職員代借、編輯、拒絕。'
          : ' 你可以確認（唔設鎖）、編輯、拒絕；一鍵寫鎖批准需 DDC 或以上。'}
      </p>
      {error && <div className="err">{error}</div>}
      {msg && <div className="success">✓ {msg}</div>}

      <section className="info-card" style={{ borderLeft: '4px solid #dc2626' }}>
        <div className="section-head">
          <div>
            <h3>申請審批 <small>({bookings.length} · 待批 {pendingN})</small></h3>
            <p>一鍵批准＝狀態 + Teamup + 嘗試 Sciener 密碼 + 電郵。鎖未接通唔會卡住整單。</p>
          </div>
          <button className="btn-sm" onClick={() => setShowBorrow(v => !v)}>{showBorrow ? '收起借用表' : '＋ 借用'}</button>
        </div>

        {showBorrow && (
          <div className="account-form" style={{ marginBottom: 16, padding: 12, background: '#f8fafc', borderRadius: 10 }}>
            <select value={borrow.venueId} onChange={e => setBorrow({ ...borrow, venueId: e.target.value })}>
              <option value="">選擇場地 *</option>
              {venues.map(v => <option key={v.venueId} value={v.venueId}>{v.name}</option>)}
            </select>
            <input placeholder="姓名 *" value={borrow.name} onChange={e => setBorrow({ ...borrow, name: e.target.value })} />
            <input placeholder="電話 *" value={borrow.phone} onChange={e => setBorrow({ ...borrow, phone: e.target.value })} />
            <input placeholder="電郵" value={borrow.email} onChange={e => setBorrow({ ...borrow, email: e.target.value })} />
            <input placeholder="旅團" value={borrow.troop} onChange={e => setBorrow({ ...borrow, troop: e.target.value })} />
            <input placeholder="用途" value={borrow.purpose} onChange={e => setBorrow({ ...borrow, purpose: e.target.value })} />
            <input type="datetime-local" value={borrow.startDate} onChange={e => setBorrow({ ...borrow, startDate: e.target.value })} />
            <input type="datetime-local" value={borrow.endDate} onChange={e => setBorrow({ ...borrow, endDate: e.target.value })} />
            <button className="btn-sm" disabled={busy} onClick={createBorrow}>建立借用申請</button>
          </div>
        )}

        {loading ? <div className="small-loading">載入中…</div> : bookings.length === 0 ? (
          <p className="empty">暫無申請。可用右上「＋ 借用」由職員代建。</p>
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
              <div className="user-actions" style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                {String(b.status || 'pending') === 'pending' && hq && (
                  <button className="mini-btn" disabled={busy} onClick={() => oneClickApprove(b)}>⚡ 一鍵批准</button>
                )}
                {String(b.status || 'pending') === 'pending' && !hq && (
                  <button className="mini-btn" disabled={busy} onClick={() => confirmOnly(b)}>✅ 確認（唔設鎖）</button>
                )}
                {String(b.status || 'pending') === 'pending' && (
                  <button className="mini-btn" disabled={busy} onClick={() => startEdit(b)}>✎ 編輯</button>
                )}
                <button className="mini-btn danger" disabled={busy} onClick={() => reject(b)}>✕ 拒絕</button>
                <button className="mini-btn" disabled={busy} onClick={() => cancel(b)}>↩ 取消</button>
              </div>
            </div>
            {editId === b.id && (
              <div className="account-form" style={{ width: '100%', marginTop: 8, padding: 10, background: '#fffbeb', borderRadius: 10 }}>
                <select value={edit.venueId} onChange={e => setEdit({ ...edit, venueId: e.target.value })}>
                  {venues.map(v => <option key={v.venueId} value={v.venueId}>{v.name}</option>)}
                </select>
                <input placeholder="姓名 *" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
                <input placeholder="電話 *" value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} />
                <input placeholder="電郵" value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} />
                <input placeholder="旅團" value={edit.troop} onChange={e => setEdit({ ...edit, troop: e.target.value })} />
                <input placeholder="用途" value={edit.purpose} onChange={e => setEdit({ ...edit, purpose: e.target.value })} />
                <input type="datetime-local" value={edit.startDate} onChange={e => setEdit({ ...edit, startDate: e.target.value })} />
                <input type="datetime-local" value={edit.endDate} onChange={e => setEdit({ ...edit, endDate: e.target.value })} />
                <button className="btn-sm" disabled={busy} onClick={saveEdit}>儲存修改</button>
                <button className="mini-btn" onClick={() => setEditId('')}>取消編輯</button>
              </div>
            )}
            {b.reviewedAt && <span style={{ fontSize: 11, color: '#888' }}>審批：{b.reviewer} @ {b.reviewedAt}</span>}
          </article>
        ))}
      </section>

      <section className="info-card">
        <div className="section-head">
          <div><h3>場地清單</h3><p>Lock ID 可填喺個別場地，或 Config 一列 SCIENER_LOCK_ID。</p></div>
          <button className="mini-btn" disabled={busy} onClick={loadLocks}>讀取鎖列表</button>
        </div>
        {lockHint && <p className="page-sub" style={{ marginTop: 0 }}>{lockHint}</p>}
        {!!locks.length && (
          <div style={{ marginBottom: 12 }}>
            {locks.map(l => (
              <div key={String(l.lockId)} className="user-row" style={{ flexWrap: 'wrap' }}>
                <div className="user-identity">
                  <b>{l.name || '未命名鎖'}</b>
                  <span className="rcode">Lock ID {l.lockId}</span>
                  <span>{l.mac}{l.hasGateway ? ' · 已接 Gateway' : ' · 未見 Gateway'}</span>
                </div>
                <button className="mini-btn" onClick={() => useLockId(l.lockId)}>填入場地</button>
              </div>
            ))}
          </div>
        )}
        <div className="account-form" style={{ flexWrap: 'wrap', display: 'flex', gap: 8 }}>
          <input placeholder="代碼 *" value={vDraft.venueId} onChange={e => setVDraft({ ...vDraft, venueId: e.target.value })} style={{ width: 130 }} />
          <input placeholder="名稱 *" value={vDraft.name} onChange={e => setVDraft({ ...vDraft, name: e.target.value })} style={{ width: 180 }} />
          <input placeholder="位置" value={vDraft.location || ''} onChange={e => setVDraft({ ...vDraft, location: e.target.value })} style={{ width: 180 }} />
          <input placeholder="容量" value={vDraft.capacity || ''} onChange={e => setVDraft({ ...vDraft, capacity: e.target.value })} style={{ width: 80 }} />
          <input placeholder="Sciener Lock ID" value={vDraft.scienerLockId || ''} onChange={e => setVDraft({ ...vDraft, scienerLockId: e.target.value })} style={{ width: 150 }} />
          <button className="btn-sm" onClick={saveVenue}>＋ 新增場地</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {venues.map(v => (
            <div key={v.venueId} className="user-row" style={{ flexWrap: 'wrap' }}>
              <div className="user-identity">
                <b>{v.name}</b>
                <span className="rcode">{v.venueId}</span>
                <span>{v.location}{v.capacity ? ` · 容 ${v.capacity}` : ''}{v.scienerLockId ? ` · 鎖 ${v.scienerLockId}` : ''}</span>
              </div>
              <button className="mini-btn danger" onClick={() => delVenue(v)}>刪除</button>
            </div>
          ))}
          {!venues.length && <p className="empty">尚未有場地。</p>}
        </div>
      </section>
      <BackBar />
    </>
  );
}
