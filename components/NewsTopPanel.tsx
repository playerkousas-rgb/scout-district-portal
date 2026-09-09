'use client';
/**
 * 📢 消息 — 主控台最頂（v4.9.0）
 *
 * 消息發佈唔再係卡片：一入主控台就喺最頂見到、直接編輯／刪除（ADC 層級 3 或以上）。
 * 資料來源同成員系統完全一樣（listAnnouncements / getAnnouncements）；
 * 刪除係「軟刪除」— Sheet 留底曾經出現過嘅消息（deleted=TRUE），成員端即刻唔再顯示。
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { levelOf, LEVEL_ADC } from '@/lib/levels';
import { useDistrict } from '@/lib/useDistrict';
import type { Announcement, NewsLevel, UserSession } from '@/lib/types';

const LEVELS: { value: NewsLevel; label: string }[] = [
  { value: 'info', label: '🔵 一般' },
  { value: 'warning', label: '🟡 留意' },
  { value: 'important', label: '🔴 緊急' },
];

type Draft = {
  id: string; title: string; body: string; date: string; level: NewsLevel;
  pinned: boolean; notify: boolean; link: string; linkLabel: string; expiresAt: string; active: boolean;
};

function today() { return new Date().toISOString().slice(0, 10); }
function emptyDraft(): Draft {
  return { id: '', title: '', body: '', date: today(), level: 'info', pinned: true, notify: false, link: '', linkLabel: '', expiresAt: '', active: true };
}

export default function NewsTopPanel({ session }: { session: UserSession }) {
  const { withDistrict } = useDistrict();
  const canManage = levelOf(session) <= LEVEL_ADC;
  const [list, setList] = useState<Announcement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const r = await api.getAnnouncements(session.token);
      if (r.ok && r.data) { setList(r.data); setLoaded(true); }
    } catch { /* ignore：主控台唔好因為消息掛咗而嘈 */ }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session.token]);

  const live = useMemo(() => list.filter(n => n.live && !n.deleted), [list]);
  const deleted = useMemo(() => list.filter(n => n.deleted), [list]);
  const shown = expanded ? live : live.slice(0, 3);

  function flash(t: string) { setMsg(t); setError(''); setTimeout(() => setMsg(''), 3000); }
  function fail(t: string) { setError(t); setMsg(''); }

  function startNew() { setDraft(emptyDraft()); setMsg(''); setError(''); setExpanded(true); }
  function startEdit(n: Announcement) {
    setDraft({
      id: n.id, title: n.title || '', body: n.body || '', date: n.date || today(),
      level: (n.level as NewsLevel) || 'info', pinned: !!n.pinned, notify: !!n.notify,
      link: n.link || '', linkLabel: n.linkLabel || '', expiresAt: n.expiresAt || '',
      active: n.active !== false,
    });
    setMsg(''); setError('');
  }

  async function save() {
    if (!session || !draft) return;
    if (!draft.title.trim()) { fail('標題必填'); return; }
    if (!draft.body.trim()) { fail('內容必填'); return; }
    setBusy('save');
    const r = await api.saveAnnouncement(session.token, { ...draft, title: draft.title.trim(), body: draft.body.trim() });
    setBusy('');
    if (r.ok) { setDraft(null); flash(r.data?.created ? '已發佈 ✓ 成員系統下次載入即刻見到' : '已更新 ✓'); await load(); }
    else fail(r.error || '儲存失敗');
  }

  async function togglePinned(n: Announcement) {
    if (!session) return;
    setBusy(n.id);
    const r = await api.setAnnouncementPinned(session.token, n.id, !n.pinned);
    setBusy('');
    if (r.ok) { flash(n.pinned ? '已取消置頂 ✓' : '已置頂 ✓'); await load(); } else fail(r.error || '操作失敗');
  }
  async function toggleActive(n: Announcement) {
    if (!session) return;
    setBusy(n.id);
    const r = await api.setAnnouncementActive(session.token, n.id, n.active === false);
    setBusy('');
    if (r.ok) { flash(n.active === false ? '已重新上架 ✓' : '已下架 ✓（成員即刻唔見，紀錄仍在）'); await load(); } else fail(r.error || '操作失敗');
  }
  async function remove(n: Announcement) {
    if (!session || !confirm(`確定刪除「${n.title}」？\n成員系統即刻唔再顯示；Sheet 會留底曾經出現過。`)) return;
    setBusy(n.id);
    const r = await api.deleteAnnouncement(session.token, n.id);
    setBusy('');
    if (r.ok) { flash('已刪除 ✓（Sheet 已留底，喺「已刪除留底」可以還原）'); await load(); } else fail(r.error || '刪除失敗');
  }
  async function restore(n: Announcement) {
    if (!session) return;
    setBusy(n.id);
    const r = await api.restoreAnnouncement(session.token, n.id);
    setBusy('');
    if (r.ok) { flash('已還原（現為「已下架」，上架後成員就見到）'); await load(); } else fail(r.error || '還原失敗');
  }

  // 未載入完成又冇消息 → 唔好佔位
  if (loaded && list.length === 0 && !canManage) return null;

  return (
    <section className="news-top" aria-label="消息">
      <div className="news-banner-head">
        <b>📢 消息</b>
        <span className="muted" style={{ fontSize: 12 }}>
          成員系統首頁同步顯示 {live.filter(n => n.pinned).length} 則置頂
        </span>
        {canManage && !draft && (
          <button type="button" className="mini-btn" onClick={startNew}>＋ 發佈</button>
        )}
        {live.length > 3 && (
          <button type="button" className="linkish" onClick={() => setExpanded(v => !v)}>
            {expanded ? '收起' : `仲有 ${live.length - 3} 則…`}
          </button>
        )}
        {canManage && <Link className="linkish" href={withDistrict('/news')}>完整紀錄 →</Link>}
      </div>

      {msg && <div className="success" style={{ margin: '6px 0' }}>✓ {msg}</div>}
      {error && <div className="err" style={{ margin: '6px 0' }}>{error}</div>}

      {/* 直接喺頂部編：新增／編輯表單 */}
      {canManage && draft && (
        <div className="news-top-editor">
          <div className="section-head">
            <div><h3>{draft.id ? '✏️ 修改消息' : '＋ 發佈新消息'}</h3><p>標題同內容必填；發出後成員系統首頁置頂顯示。</p></div>
            <button className="mini-btn" onClick={() => setDraft(null)}>收起</button>
          </div>
          <div className="news-form">
            <label className="news-field wide">
              <span>標題 *</span>
              <input value={draft.title} maxLength={80} placeholder="例如：11 月區會議改期" onChange={e => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="news-field wide">
              <span>內容 *</span>
              <textarea value={draft.body} rows={3} maxLength={800} placeholder="寫俾成員睇嘅內容，簡短清楚就得。" onChange={e => setDraft({ ...draft, body: e.target.value })} />
            </label>
            <label className="news-field">
              <span>日期</span>
              <input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} />
            </label>
            <label className="news-field">
              <span>類別</span>
              <select value={draft.level} onChange={e => setDraft({ ...draft, level: e.target.value as NewsLevel })}>
                {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
            <label className="news-field">
              <span>自動落架日（留空＝一直顯示）</span>
              <input type="date" value={draft.expiresAt} onChange={e => setDraft({ ...draft, expiresAt: e.target.value })} />
            </label>
            <label className="news-field">
              <span>詳情連結（選填）</span>
              <input value={draft.link} placeholder="https://…" onChange={e => setDraft({ ...draft, link: e.target.value })} />
            </label>
            <div className="news-field checks">
              <label><input type="checkbox" checked={draft.pinned} onChange={e => setDraft({ ...draft, pinned: e.target.checked })} /> 置頂</label>
              <label><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> 立即發佈</label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn-sm" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? '儲存中…' : (draft.id ? '儲存修改' : '發佈')}</button>
            <button className="mini-btn danger" onClick={() => setDraft(null)}>取消</button>
          </div>
        </div>
      )}

      {loaded && live.length === 0 && (
        <p className="news-none muted">{canManage ? '暫時冇消息 — 撳「＋ 發佈」即刻寫一則。' : '暫時冇消息。'}</p>
      )}

      {shown.map(n => (
        <article key={n.id} className={`news-pin lv-${n.level || 'info'}`}>
          <div className="news-pin-top">
            <b>{n.pinned ? '📌 ' : ''}{n.title}</b>
            <small>{n.date || ''}{n.scheduled ? ' · 排期中' : ''}{n.expired ? ' · 已過期' : ''}{n.active === false ? ' · 已下架' : ''}</small>
          </div>
          <p>{n.body}</p>
          {n.link && <a href={n.link} target="_blank" rel="noopener noreferrer">{n.linkLabel || '查看詳情'} ↗</a>}
          {canManage && (
            <div className="news-top-actions">
              <button className="mini-btn" disabled={busy === n.id} onClick={() => startEdit(n)}>✏️ 編輯</button>
              <button className="mini-btn" disabled={busy === n.id} onClick={() => togglePinned(n)}>{n.pinned ? '取消置頂' : '📌 置頂'}</button>
              <button className="mini-btn" disabled={busy === n.id} onClick={() => toggleActive(n)}>{n.active === false ? '重新上架' : '下架'}</button>
              <button className="mini-btn danger" disabled={busy === n.id} onClick={() => remove(n)}>🗑 刪除</button>
            </div>
          )}
        </article>
      ))}

      {canManage && deleted.length > 0 && (
        <details className="news-deleted">
          <summary>🗄 已刪除留底（{deleted.length}）— Sheet 紀錄曾經出現過嘅消息</summary>
          {deleted.map(n => (
            <div key={n.id} className="news-deleted-row">
              <span><b>{n.title}</b> <small>{n.deletedAt ? `刪於 ${n.deletedAt.slice(0, 10)}` : ''}</small></span>
              <button className="mini-btn" disabled={busy === n.id} onClick={() => restore(n)}>還原</button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
