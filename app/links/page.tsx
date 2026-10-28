'use client';
/**
 * 🔗 常用連結（v4.33.0）
 * 區會成日要撳嘅外部網址（例如 HKIR 停車場登記）集中一張卡。
 * 權限跟 Perms 表 `links` 一行：預設 ADC 或以上 ✏️ 可增刪改，其餘已登入職員 👁 可看。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import BackLink, { BackBar } from '@/components/BackLink';
import type { AccessLevel, DistrictLink } from '@/lib/types';

type Draft = { id: string; title: string; url: string; category: string; note: string; order: string };

function emptyDraft(category = ''): Draft {
  return { id: '', title: '', url: '', category, note: '', order: '' };
}

/** 顯示用：淨係畀人睇清楚去邊個網站，唔好成條長 URL 迫爆行 */
function prettyUrl(url: string): string {
  const clean = url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return clean.length > 52 ? `${clean.slice(0, 50)}…` : clean;
}

export default function LinksPage() {
  const session = useRequireCard('links');
  const [items, setItems] = useState<DistrictLink[]>([]);
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
      const r = await api.getLinks(token);
      if (r.ok && r.data) { setItems(r.data.items || []); setAccess(r.data.access || 'view'); }
      else setError(r.error || '載入失敗');
    } catch { setError('連線失敗：請確認該區後台已部署。'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (session) load(session.token); }, [session, load]);

  const categories = useMemo(
    () => Array.from(new Set(items.map(i => (i.category || '').trim()).filter(Boolean))).sort(),
    [items],
  );

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = items.filter(i => !needle
      || `${i.title} ${i.url} ${i.note || ''} ${i.category || ''}`.toLowerCase().includes(needle));
    const map = new Map<string, DistrictLink[]>();
    hit.forEach(i => {
      const key = (i.category || '').trim() || '一般';
      if (!map.has(key)) map.set(key, []);
      (map.get(key) as DistrictLink[]).push(i);
    });
    return Array.from(map.entries());
  }, [items, q]);

  function flash(text: string) { setMsg(text); setError(''); setTimeout(() => setMsg(''), 3000); }

  function startEdit(item: DistrictLink) {
    setDraft({
      id: item.id, title: item.title || '', url: item.url || '',
      category: item.category || '', note: item.note || '',
      order: item.order === undefined || item.order === 0 ? '' : String(item.order),
    });
    setMsg('');
  }

  async function save() {
    if (!session || !draft) return;
    if (!draft.title.trim()) { setError('名稱必填'); return; }
    if (!/^https?:\/\/\S+$/i.test(draft.url.trim())) { setError('網址要以 http:// 或 https:// 開頭'); return; }
    setBusy('save'); setError('');
    const r = await api.saveLink(session.token, {
      id: draft.id || undefined,
      title: draft.title.trim(), url: draft.url.trim(),
      category: draft.category.trim(), note: draft.note.trim(),
      order: draft.order.trim() ? Number(draft.order) : 0,
    });
    setBusy('');
    if (r.ok) { setDraft(null); flash(r.data?.created ? '已加入 ✓' : '已更新 ✓'); await load(session.token); }
    else setError(r.error || '儲存失敗');
  }

  async function remove(item: DistrictLink) {
    if (!session) return;
    if (!confirm(`確定刪除「${item.title}」？`)) return;
    setBusy(item.id); setError('');
    const r = await api.deleteLink(session.token, item.id);
    setBusy('');
    if (r.ok) { flash('已刪除 ✓'); await load(session.token); } else setError(r.error || '刪除失敗');
  }

  async function copy(item: DistrictLink) {
    try {
      await navigator.clipboard.writeText(item.url);
      flash(`已複製「${item.title}」嘅網址`);
    } catch { setError('瀏覽器唔俾自動複製，請長按連結自己複製。'); }
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🔗 常用連結</h1>
      <p className="page-sub">
        區會成日要用嘅外部網址一覽，撳一下就開。
        {canEdit ? '你可以增刪改呢度嘅連結。' : '只有助理區總監（ADC）或以上可以修改；有連結要加就搵佢哋。'}
      </p>

      {msg && <div className="success">✓ {msg}</div>}
      {error && <div className="err">{error}</div>}

      <div className="lk-toolbar">
        <input
          className="lk-search" value={q} onChange={e => setQ(e.target.value)}
          placeholder="🔍 搵連結（名稱／網址／備註）" aria-label="搜尋連結"
        />
        {canEdit && !draft && (
          <button className="btn-sm" onClick={() => { setDraft(emptyDraft()); setMsg(''); setError(''); }}>＋ 加連結</button>
        )}
      </div>

      {canEdit && draft && (
        <div className="info-card" style={{ borderColor: '#93c5fd' }}>
          <div className="section-head">
            <div><h3>{draft.id ? '✏️ 修改連結' : '＋ 加新連結'}</h3><p>名稱同網址必填；分類留空就會放入「一般」。</p></div>
            <button className="mini-btn" onClick={() => setDraft(null)}>收起</button>
          </div>
          <div className="lk-form">
            <label className="lk-field wide">
              <span>名稱 *</span>
              <input value={draft.title} maxLength={80} placeholder="例如：HKIR 停車場登記"
                onChange={e => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="lk-field wide">
              <span>網址 *</span>
              <input value={draft.url} maxLength={500} placeholder="http://bit.ly/HKIRCarPark" inputMode="url"
                onChange={e => setDraft({ ...draft, url: e.target.value })} />
            </label>
            <label className="lk-field">
              <span>分類（選填）</span>
              <input value={draft.category} maxLength={40} list="lk-categories" placeholder="地域 / 總會 / 區會表格"
                onChange={e => setDraft({ ...draft, category: e.target.value })} />
              <datalist id="lk-categories">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </label>
            <label className="lk-field">
              <span>排序（選填，細數字排前）</span>
              <input value={draft.order} inputMode="numeric" placeholder="0"
                onChange={e => setDraft({ ...draft, order: e.target.value.replace(/[^\d-]/g, '') })} />
            </label>
            <label className="lk-field wide">
              <span>備註（選填）</span>
              <input value={draft.note} maxLength={200} placeholder="例如：要用區會 Google 帳戶登入"
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
            仲未有連結。{canEdit ? '撳「＋ 加連結」加第一條，例如 HKIR 停車場登記。' : '等 ADC 或以上加入。'}
          </p>
        </div>
      )}

      {!loading && items.length > 0 && groups.length === 0 && (
        <div className="info-card"><p className="muted">搵唔到「{q}」。</p></div>
      )}

      {groups.map(([cat, rows]) => (
        <div className="info-card" key={cat}>
          <div className="section-head">
            <div><h3>{cat}</h3></div>
            <small>{rows.length} 條</small>
          </div>
          <ul className="lk-list">
            {rows.map(item => (
              <li className="lk-row" key={item.id}>
                <div className="lk-main">
                  <a className="lk-title" href={item.url} target="_blank" rel="noopener noreferrer">
                    {item.title} ↗
                  </a>
                  <span className="lk-url">{prettyUrl(item.url)}</span>
                  {item.note && <span className="lk-note">{item.note}</span>}
                </div>
                <div className="lk-actions">
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
