'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { useDistrict } from '@/lib/useDistrict';
import type { UserSession, StockItem, StockRequest } from '@/lib/types';
import BackLink, { BackBar } from '@/components/BackLink';
import { confirmSubmit, useFormGuard, useSubmitLock } from '@/lib/useFormGuard';

const STATUS: Record<string, string> = { pending: '待批', approved: '已批', rejected: '已拒絕', returned: '已歸還', cancelled: '已取消' };

/** 一次過借多款物資：後台用同一個 batchRef 寫多行，呢度合返一組顯示，可一次過批 */
type Group = { key: string; batchRef: string; rows: StockRequest[] };
function groupByBatch(reqs: StockRequest[]): Group[] {
  const out: Group[] = [];
  const index = new Map<string, number>();
  reqs.forEach(r => {
    const batchRef = String(r.batchRef || '').trim();
    if (!batchRef) { out.push({ key: r.id, batchRef: '', rows: [r] }); return; }
    const at = index.get(batchRef);
    if (at === undefined) { index.set(batchRef, out.length); out.push({ key: batchRef, batchRef, rows: [r] }); }
    else out[at].rows.push(r);
  });
  return out;
}

export default function StockRegsPage() {
  const router = useRouter();
  const { withDistrict, districtCode } = useDistrict();
  const session = useRequireCard('stockReg');
  const [reqs, setReqs] = useState<StockRequest[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [draft, setDraft] = useState<StockItem>({ itemId: '', name: '', category: '', totalQty: '', availableQty: '', unit: '', note: '', active: 'TRUE' });
  const runOnce = useSubmitLock();
  const itemDraftGuard = useFormGuard(
    `portal:draft:${districtCode || 'district'}:stock-item`,
    {
      itemId: draft.itemId || '', name: draft.name || '', category: draft.category || '',
      totalQty: draft.totalQty || '', availableQty: draft.availableQty || '', unit: draft.unit || '',
      note: draft.note || '',
    },
    saved => setDraft({
      itemId: String(saved.itemId || ''), name: String(saved.name || ''), category: String(saved.category || ''),
      totalQty: String(saved.totalQty || ''), availableQty: String(saved.availableQty || ''),
      unit: String(saved.unit || ''), note: String(saved.note || ''), active: 'TRUE',
    }),
    { active: !!session },
  );

  async function runAction(work: () => Promise<void>) {
    if (busy) return;
    await runOnce(work);
  }

  async function load(s: UserSession) {
    setLoading(true); setError('');
    const [r, i] = await Promise.all([api.getStockRequests(s.token), api.listItems()]);
    if (r.ok && r.data) setReqs(r.data); else setError(r.error || '無法載入申請');
    if (i.ok && i.data) setItems(i.data);
    setLoading(false);
  }
  useEffect(() => { if (session) { load(session); } }, [session]);

  async function setStatus(r: StockRequest, status: string) {
    if (!session) return;
    const action = STATUS[status] || status;
    const inventoryNote = status === 'approved'
      ? '\n\n批准後會即時扣減可借庫存。'
      : status === 'returned' ? '\n\n歸還後會回補可借庫存。' : '';
    if (!confirmSubmit(`確定將「${r.itemName || r.itemId} × ${r.qty}」標為「${action}」？${inventoryNote}`)) return;
    await runAction(async () => {
      setBusy(true); setError(''); setMsg('');
      try {
        const res = await api.setStockRequestStatus(session.token, r.id, status);
        if (res.ok) { setMsg(`已標為「${action}」✓`); await load(session); }
        else setError(res.error || '更新失敗');
      } finally { setBusy(false); }
    });
  }
  /** 整張申請（多款物資）一次過批：庫存逐款加減，申請人只收一封通知 */
  async function setBatchStatus(g: Group, status: string) {
    if (!session) return;
    const action = STATUS[status] || status;
    const itemsSummary = g.rows.map(r => `${r.itemName || r.itemId} × ${r.qty}`).join('、');
    const inventoryNote = status === 'approved'
      ? '\n\n批准後會逐款扣減可借庫存。'
      : status === 'returned' ? '\n\n歸還後會逐款回補可借庫存。' : '';
    if (!confirmSubmit(`確定將此批 ${g.rows.length} 款物資標為「${action}」？\n\n${itemsSummary}${inventoryNote}`)) return;
    await runAction(async () => {
      setBusy(true); setError(''); setMsg('');
      try {
        const res = await api.setStockBatchStatus(session.token, g.batchRef, status);
        if (res.ok) { setMsg(`整批 ${g.rows.length} 款已標為「${action}」✓`); await load(session); }
        else setError(res.error || '更新失敗');
      } finally { setBusy(false); }
    });
  }
  async function saveItem() {
    if (!session) return;
    setError(''); setMsg('');
    if (!draft.itemId.trim() || !draft.name.trim()) { setError('物資代碼與名稱必填'); return; }
    const total = Number(draft.totalQty) || 0;
    const available = Number(draft.availableQty || draft.totalQty) || 0;
    if (total < 0 || available < 0 || available > total) { setError('總數量不可小於 0，而可借數量必須介乎 0 至總數量。'); return; }
    if (!confirmSubmit(`儲存物資？\n\n代碼：${draft.itemId.trim()}\n名稱：${draft.name.trim()}\n總數量：${total}${draft.unit || ''}\n可借：${available}${draft.unit || ''}`)) return;
    await runAction(async () => {
      setBusy(true);
      try {
        const r = await api.saveItem(session.token, { ...draft, totalQty: String(total), availableQty: String(available) });
        if (r.ok) {
          itemDraftGuard.clearDraft();
          setMsg('物資已儲存 ✓'); setDraft({ itemId: '', name: '', category: '', totalQty: '', availableQty: '', unit: '', note: '', active: 'TRUE' }); await load(session);
        } else setError(r.error || '儲存失敗');
      } finally { setBusy(false); }
    });
  }
  async function delItem(i: StockItem) {
    if (!session || !confirmSubmit(`確定刪除物資「${i.name}」？\n\n此操作不會自動取消已存在的借用申請。`)) return;
    await runAction(async () => {
      setBusy(true);
      try {
        const r = await api.deleteItem(session.token, i.itemId);
        if (r.ok) { setMsg('物資已刪除 ✓'); await load(session); } else setError(r.error || '刪除失敗');
      } finally { setBusy(false); }
    });
  }

  const groups = useMemo(() => groupByBatch(reqs), [reqs]);

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">📦 物資借用審批</h1>
      <p className="page-sub">
        member-portal 填表寫入 StockRequests；呢邊批核。批准先扣庫存，拒絕／取消／歸還自動回補。
        成員一次過揀幾款物資會合成「一張申請」，可以一次過批（申請人只收一封通知）。
      </p>
      {error && <div className="err">{error}</div>}
      {msg && <div className="success">✓ {msg}</div>}
      {itemDraftGuard.pending && (
        <section className="info-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <b>♻️ 發現未儲存的物資草稿</b>
          <p className="page-sub">可回復上次填寫的物資資料，或放棄該草稿。草稿只存此瀏覽器，未曾寫入後台。</p>
          <div className="user-actions"><button className="mini-btn" onClick={itemDraftGuard.restore}>回復草稿</button><button className="mini-btn danger" onClick={itemDraftGuard.discard}>放棄草稿</button></div>
        </section>
      )}

      <section className="info-card">
        <div className="section-head"><div><h3>申請審批 <small>({reqs.length})</small></h3></div></div>
        {loading ? <div className="small-loading">載入中…</div> : reqs.length === 0 ? (
          <p className="empty">暫無申請。</p>
        ) : groups.map(g => (
          <div key={g.key} className={g.batchRef ? 'stock-batch' : undefined}>
            {g.batchRef && (
              <div className="stock-batch-head">
                <div>
                  <b>🧾 一張申請 · {g.rows.length} 款物資</b>
                  <span className="rcode">批次 {g.batchRef}</span>
                  <span>{g.rows[0].name}{g.rows[0].phone ? ` · ${g.rows[0].phone}` : ''}{g.rows[0].troop ? ` · ${g.rows[0].troop}` : ''}</span>
                </div>
                <div className="user-actions">
                  {g.rows.every(r => r.status === 'pending') && <button className="mini-btn" disabled={busy} onClick={() => setBatchStatus(g, 'approved')}>✅ 一次過批准</button>}
                  {g.rows.every(r => r.status === 'approved') && (
                    <button className="mini-btn" disabled={busy} onClick={() => setBatchStatus(g, 'returned')}>📥 整批歸還</button>
                  )}
                  {g.rows.every(r => r.status === 'pending') && <button className="mini-btn danger" disabled={busy} onClick={() => setBatchStatus(g, 'rejected')}>✕ 整批拒絕</button>}
                </div>
              </div>
            )}
            {g.rows.map(r => (
          <article key={r.id} className="user-row" style={{ flexWrap: 'wrap' }}>
            <div className="user-identity">
              <b>{r.itemName || r.itemId} × {r.qty}</b>
              <span>{r.name}{r.phone ? ` · ${r.phone}` : ''}{r.email ? ` · ${r.email}` : ''}{r.troop ? ` · ${r.troop}` : ''}</span>
              <span>{r.borrowDate}{r.returnDate ? ` → ${r.returnDate}` : ''} · {r.purpose}</span>
              <span className="rcode">{r.refCode}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className={`state ${r.status === 'approved' ? 'on' : r.status === 'pending' ? '' : 'off'}`}>{STATUS[r.status || 'pending'] || r.status}</span>
              <div className="user-actions" style={{ display: 'inline-flex', gap: 6 }}>
                {r.status === 'pending' && <button className="mini-btn" disabled={busy} onClick={() => setStatus(r, 'approved')}>✅ 批准</button>}
                {r.status === 'approved' && (
                  <button className="mini-btn" disabled={busy} onClick={() => setStatus(r, 'returned')}>📥 歸還</button>
                )}
                {r.status === 'pending' && <button className="mini-btn danger" disabled={busy} onClick={() => setStatus(r, 'rejected')}>✕ 拒絕</button>}
                {r.status === 'pending' && <button className="mini-btn" disabled={busy} onClick={() => setStatus(r, 'cancelled')}>↩ 取消</button>}
              </div>
            </div>
            {r.reviewedAt && <span style={{ fontSize: 11, color: '#888' }}>審批：{r.reviewer} @ {r.reviewedAt}</span>}
          </article>
            ))}
          </div>
        ))}
      </section>

      <section className="info-card">
        <div className="section-head"><div><h3>物資清單</h3></div></div>
        <div className="account-form" style={{ flexWrap: 'wrap', display: 'flex', gap: 8 }}>
          <input placeholder="代碼 *" value={draft.itemId} onChange={e => setDraft({ ...draft, itemId: e.target.value })} style={{ width: 130 }} />
          <input placeholder="名稱 *" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} style={{ width: 180 }} />
          <input placeholder="分類" value={draft.category || ''} onChange={e => setDraft({ ...draft, category: e.target.value })} style={{ width: 110 }} />
          <input placeholder="數量" value={draft.totalQty || ''} onChange={e => setDraft({ ...draft, totalQty: e.target.value })} style={{ width: 80 }} />
          <input placeholder="單位" value={draft.unit || ''} onChange={e => setDraft({ ...draft, unit: e.target.value })} style={{ width: 60 }} />
          <button className="btn-sm" onClick={saveItem}>＋ 新增物資</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {items.map(i => (
            <div key={i.itemId} className="user-row" style={{ flexWrap: 'wrap' }}>
              <div className="user-identity"><b>{i.name}</b><span className="rcode">{i.itemId}</span><span>{i.category}</span></div>
              <div><span className="role-chip">庫存 {i.availableQty || 0}{i.unit || ''}</span></div>
              <button className="mini-btn danger" onClick={() => delItem(i)}>刪除</button>
            </div>
          ))}
          {!items.length && <p className="empty">尚未有物資。</p>}
        </div>
      </section>
      <BackBar />
    </>
  );
}
