'use client';
/**
 * 🔢 實體密碼（v4.33.0）
 * 房門、影印機、儲物櫃嗰類「人要喺現場先用到」嘅密碼 —— 偷咗都冇用，所以唔當機密收埋，
 * 但仍然只限已登入區職員睇到。權限跟 Perms 表 `passcodes` 一行：
 * 預設 DDC 或以上 ✏️ 可增刪改，其餘已登入職員 👁 可看。
 *
 * ⚠️ 系統帳戶／網上服務／電子鎖 API 密碼一律唔可以放呢度（後台亦會擋）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import BackLink, { BackBar } from '@/components/BackLink';
import type { AccessLevel, Passcode } from '@/lib/types';

type Draft = { id: string; name: string; code: string; location: string; note: string; order: string };

function emptyDraft(location = ''): Draft {
  return { id: '', name: '', code: '', location, note: '', order: '' };
}

export default function PasscodesPage() {
  const session = useRequireCard('passcodes');
  const [items, setItems] = useState<Passcode[]>([]);
  const [access, setAccess] = useState<AccessLevel>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState('');

  const canEdit = access === 'edit';

  const load = useCallback(async (token: string) => {
    setLoading(true); setError('');
    try {
      const r = await api.getPasscodes(token);
      if (r.ok && r.data) { setItems(r.data.items || []); setAccess(r.data.access || 'view'); }
      else setError(r.error || '載入失敗');
    } catch { setError('連線失敗：請確認該區後台已部署。'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (session) load(session.token); }, [session, load]);

  const locations = useMemo(
    () => Array.from(new Set(items.map(i => (i.location || '').trim()).filter(Boolean))).sort(),
    [items],
  );

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = items.filter(i => !needle
      || `${i.name} ${i.code} ${i.location || ''} ${i.note || ''}`.toLowerCase().includes(needle));
    const map = new Map<string, Passcode[]>();
    hit.forEach(i => {
      const key = (i.location || '').trim() || '其他';
      if (!map.has(key)) map.set(key, []);
      (map.get(key) as Passcode[]).push(i);
    });
    return Array.from(map.entries());
  }, [items, q]);

  function flash(text: string) { setMsg(text); setError(''); setTimeout(() => setMsg(''), 3000); }

  function startEdit(item: Passcode) {
    setDraft({
      id: item.id, name: item.name || '', code: item.code || '',
      location: item.location || '', note: item.note || '',
      order: item.order === undefined || item.order === 0 ? '' : String(item.order),
    });
    setMsg(''); setError('');
  }

  async function save() {
    if (!session || !draft) return;
    if (!draft.name.trim()) { setError('名稱必填（例如 1802 房門）'); return; }
    if (!draft.code.trim()) { setError('密碼必填'); return; }
    setBusy('save'); setError('');
    const r = await api.savePasscode(session.token, {
      id: draft.id || undefined,
      name: draft.name.trim(), code: draft.code.trim(),
      location: draft.location.trim(), note: draft.note.trim(),
      order: draft.order.trim() ? Number(draft.order) : 0,
    });
    setBusy('');
    if (r.ok) { setDraft(null); flash(r.data?.created ? '已加入 ✓' : '已更新 ✓'); await load(session.token); }
    else setError(r.error || '儲存失敗');
  }

  async function remove(item: Passcode) {
    if (!session) return;
    if (!confirm(`確定刪除「${item.name}」？`)) return;
    setBusy(item.id); setError('');
    const r = await api.deletePasscode(session.token, item.id);
    setBusy('');
    if (r.ok) { flash('已刪除 ✓'); await load(session.token); } else setError(r.error || '刪除失敗');
  }

  async function copy(item: Passcode) {
    try { await navigator.clipboard.writeText(item.code); flash(`已複製「${item.name}」嘅密碼`); }
    catch { setError('瀏覽器唔俾自動複製，請自己抄低。'); }
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🔢 實體密碼</h1>
      <p className="page-sub">
        房門、影印機、儲物櫃嗰啲要去到現場先用到嘅密碼。
        {canEdit ? '你可以增刪改。' : '只有副區總監（DDC）或以上可以修改。'}
      </p>

      <div className="pc-warn">
        <b>⚠️ 只放實體密碼</b>
        <span>
          電郵、YMIS、Google、Teamup、電子鎖後台等<b>網上帳戶密碼唔可以放呢度</b>（後台會擋）。
          呢張卡所有已登入區職員都睇到。
        </span>
      </div>

      {msg && <div className="success">✓ {msg}</div>}
      {error && <div className="err">{error}</div>}

      <div className="lk-toolbar">
        <input
          className="lk-search" value={q} onChange={e => setQ(e.target.value)}
          placeholder="🔍 搵密碼（名稱／位置／備註）" aria-label="搜尋實體密碼"
        />
        {canEdit && !draft && (
          <button className="btn-sm" onClick={() => { setDraft(emptyDraft()); setMsg(''); setError(''); }}>＋ 加密碼</button>
        )}
      </div>

      {canEdit && draft && (
        <div className="info-card" style={{ borderColor: '#c4b5fd' }}>
          <div className="section-head">
            <div><h3>{draft.id ? '✏️ 修改密碼' : '＋ 加新密碼'}</h3><p>名稱同密碼必填；位置留空就會放入「其他」。</p></div>
            <button className="mini-btn" onClick={() => setDraft(null)}>收起</button>
          </div>
          <div className="lk-form">
            <label className="lk-field">
              <span>名稱 *</span>
              <input value={draft.name} maxLength={120} placeholder="例如：1802 房門"
                onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="lk-field">
              <span>密碼 *</span>
              <input value={draft.code} maxLength={60} placeholder="例如：1802#"
                onChange={e => setDraft({ ...draft, code: e.target.value })} />
            </label>
            <label className="lk-field">
              <span>位置（選填）</span>
              <input value={draft.location} maxLength={120} list="pc-locations" placeholder="例如：地域總部 18 樓"
                onChange={e => setDraft({ ...draft, location: e.target.value })} />
              <datalist id="pc-locations">
                {locations.map(l => <option key={l} value={l} />)}
              </datalist>
            </label>
            <label className="lk-field">
              <span>排序（選填，細數字排前）</span>
              <input value={draft.order} inputMode="numeric" placeholder="0"
                onChange={e => setDraft({ ...draft, order: e.target.value.replace(/[^\d-]/g, '') })} />
            </label>
            <label className="lk-field wide">
              <span>備註（選填）</span>
              <input value={draft.note} maxLength={300} placeholder="例如：入完要撳 # 字；2026 年 1 月換過"
                onChange={e => setDraft({ ...draft, note: e.target.value })} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn-sm" disabled={busy === 'save'} onClick={save}>
              {busy === 'save' ? '儲存中…' : (draft.id ? '儲存修改' : '加入')}
            </button>
            <button className="mini-btn danger" onClick={() => setDraft(null)}>取消</button>
          </div>
        </div>
      )}

      {loading && <div className="center"><div className="spinner" /><div>載入中…</div></div>}

      {!loading && items.length === 0 && (
        <div className="info-card">
          <p className="muted">
            仲未有紀錄。{canEdit ? '撳「＋ 加密碼」加第一個，例如 1802 房門、影印機。' : '等 DDC 或以上加入。'}
          </p>
        </div>
      )}

      {!loading && items.length > 0 && groups.length === 0 && (
        <div className="info-card"><p className="muted">搵唔到「{q}」。</p></div>
      )}

      {groups.map(([loc, rows]) => (
        <div className="info-card" key={loc}>
          <div className="section-head">
            <div><h3>📍 {loc}</h3></div>
            <small>{rows.length} 個</small>
          </div>
          <ul className="pc-list">
            {rows.map(item => (
              <li className="pc-row" key={item.id}>
                <div className="pc-main">
                  <b className="pc-name">{item.name}</b>
                  {item.note && <span className="pc-note">{item.note}</span>}
                  {item.updatedAt && (
                    <span className="pc-meta">更新：{String(item.updatedAt).slice(0, 10)}</span>
                  )}
                </div>
                <code className="pc-code">{item.code}</code>
                <div className="pc-actions">
                  <button className="mini-btn ghost" onClick={() => copy(item)}>📋 複製</button>
                  {canEdit && <button className="mini-btn" disabled={busy === item.id} onClick={() => startEdit(item)}>✏️</button>}
                  {canEdit && <button className="mini-btn danger" disabled={busy === item.id} onClick={() => remove(item)}>🗑</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <BackBar />
    </>
  );
}
