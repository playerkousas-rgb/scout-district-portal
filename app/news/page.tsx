'use client';
/**
 * 📢 消息發佈 — 完整紀錄（v4.9.0）
 *
 * v4.9.0 起主要管理入口搬咗去主控台最頂（ADC 層級 3 或以上）；呢一頁保留做
 * 「完整紀錄」：全部消息＋已刪除留底（軟刪除 — Sheet 繼續紀錄曾經出現過嘅消息）。
 * 成員系統 member-portal 首頁頂部「置頂消息」同樣讀呢一份資料。
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { loadSession } from '@/lib/session';
import { levelOf, LEVEL_ADC } from '@/lib/levels';
import { useDistrict } from '@/lib/useDistrict';
import type { Announcement, NewsLevel, UserSession } from '@/lib/types';
import BackLink, { BackBar } from '@/components/BackLink';

const LEVELS: { value: NewsLevel; label: string; hint: string }[] = [
  { value: 'info', label: '🔵 一般消息', hint: '藍色' },
  { value: 'warning', label: '🟡 請留意', hint: '黃色' },
  { value: 'important', label: '🔴 緊急', hint: '紅色' },
];

type Draft = {
  id: string; title: string; body: string; date: string; level: NewsLevel;
  pinned: boolean; notify: boolean; link: string; linkLabel: string; expiresAt: string; active: boolean;
};

function today() { return new Date().toISOString().slice(0, 10); }
function emptyDraft(): Draft {
  return {
    id: '', title: '', body: '', date: today(), level: 'info',
    pinned: true, notify: false, link: '', linkLabel: '', expiresAt: '', active: true,
  };
}

export default function NewsPage() {
  // v4.9.0：改用層級門檻（ADC 或以上），唔再靠 news 卡片（卡片已移除）
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const [session, setSession] = useState<UserSession | null | 'denied'>(null);
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [showForm, setShowForm] = useState(false);
  const [needUpgrade, setNeedUpgrade] = useState(false);
  const canEdit = session !== 'denied' && !!session && levelOf(session) <= LEVEL_ADC;

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace(withDistrict('/')); return; }
    if (levelOf(s) > LEVEL_ADC) { setSession('denied'); return; }
    setSession(s);
  }, [router, withDistrict]);

  const denied = session === 'denied';

  async function load() {
    if (!session || session === 'denied') return;
    setLoading(true); setError('');
    const r = await api.getAnnouncements(session.token);
    if (r.ok && r.data) { setList(r.data); setNeedUpgrade(false); }
    else {
      const e = r.error || '無法載入消息';
      setNeedUpgrade(/未知的 action|News/.test(e));
      setError(e);
    }
    setLoading(false);
  }
  useEffect(() => { if (session && session !== 'denied') load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);

  const pinnedCount = useMemo(() => list.filter(n => n.pinned && n.live).length, [list]);
  const deletedList = useMemo(() => list.filter(n => n.deleted), [list]);
  const activeList = useMemo(() => list.filter(n => !n.deleted), [list]);

  function startNew() { setDraft(emptyDraft()); setShowForm(true); setMsg(''); setError(''); }
  function startEdit(n: Announcement) {
    setDraft({
      id: n.id, title: n.title || '', body: n.body || '', date: n.date || today(),
      level: (n.level as NewsLevel) || 'info', pinned: !!n.pinned, notify: !!n.notify,
      link: n.link || '', linkLabel: n.linkLabel || '', expiresAt: n.expiresAt || '',
      active: n.active !== false,
    });
    setShowForm(true); setMsg(''); setError('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save() {
    if (!session || session === 'denied') return;
    setError(''); setMsg('');
    if (!draft.title.trim()) { setError('標題必填'); return; }
    if (!draft.body.trim()) { setError('內容必填'); return; }
    setBusy('save');
    const r = await api.saveAnnouncement(session.token, { ...draft, title: draft.title.trim(), body: draft.body.trim() });
    setBusy('');
    if (r.ok) {
      setMsg(r.data?.created ? '已發佈 ✓ 成員系統下次載入即刻見到' : '已更新 ✓');
      setDraft(emptyDraft()); setShowForm(false); await load();
    } else setError(r.error || '儲存失敗');
  }

  async function togglePinned(n: Announcement) {
    if (!session || session === 'denied') return;
    setBusy(n.id); setError(''); setMsg('');
    const r = await api.setAnnouncementPinned(session.token, n.id, !n.pinned);
    setBusy('');
    if (r.ok) { setMsg(n.pinned ? '已取消置頂 ✓' : '已置頂 ✓'); await load(); }
    else setError(r.error || '操作失敗');
  }
  async function toggleActive(n: Announcement) {
    if (!session || session === 'denied') return;
    setBusy(n.id); setError(''); setMsg('');
    const r = await api.setAnnouncementActive(session.token, n.id, n.active === false);
    setBusy('');
    if (r.ok) { setMsg(n.active === false ? '已重新上架 ✓' : '已下架 ✓ 成員系統下次載入即刻消失'); await load(); }
    else setError(r.error || '操作失敗');
  }
  async function remove(n: Announcement) {
    if (!session || session === 'denied' || !confirm(`確定刪除消息「${n.title}」？\n成員系統下次載入即刻消失；Sheet 會留底曾經出現過。`)) return;
    setBusy(n.id); setError(''); setMsg('');
    const r = await api.deleteAnnouncement(session.token, n.id);
    setBusy('');
    if (r.ok) { setMsg('已刪除 ✓（Sheet 留底，下面「已刪除留底」可以還原）'); await load(); }
    else setError(r.error || '刪除失敗');
  }

  async function restore(n: Announcement) {
    if (!session || session === 'denied') return;
    setBusy(n.id); setError(''); setMsg('');
    const r = await api.restoreAnnouncement(session.token, n.id);
    setBusy('');
    if (r.ok) { setMsg('已還原（現為「已下架」，上架後成員就見到）'); await load(); }
    else setError(r.error || '還原失敗');
  }

  if (denied) {
    return (
      <>
        <BackLink />
        <h1 className="page-title">📢 消息發佈</h1>
        <div className="info-card">
          <p className="empty">🔒 只有 ADC（助理區總監）或以上可以管理消息。請返主控台用頂部「📢 消息」區。</p>
        </div>
        <BackBar />
      </>
    );
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">📢 消息發佈 — 完整紀錄</h1>
      <p className="page-sub">
        日常發佈／編輯／刪除已經搬咗去<b>主控台最頂</b>（一入去就改到，仲快）。
        呢頁保留睇晒全部消息同已刪除留底。消息會喺成員系統（member-portal）首頁頂部置頂顯示 ——
        呢邊一刪／一下架，嗰邊下次載入即刻消失。
      </p>

      {error && <div className="err">{error}</div>}
      {msg && <div className="success">✓ {msg}</div>}

      {needUpgrade && (
        <div className="info-card" style={{ borderColor: '#fbbf24', background: '#fffbeb' }}>
          <h3>⚠️ 後台未更新</h3>
          <p style={{ fontSize: 13, lineHeight: 1.8 }}>
            區 Google Sheet 嘅 Apps Script 仲係舊版。請將本 repo <code>gs/Code.gs</code>（v4.9.0）全部覆蓋貼上 →
            執行 <code>setupSheets()</code>（補建唔清空）→ 重新部署 Web App。
            驗證：<code>?action=getHealthCheck</code> 見到 <code>version: &quot;4.9.0&quot;</code>。
          </p>
        </div>
      )}

      <div className="info-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontWeight: 700 }}>目前置頂：</span>
        <span className="role-chip">{pinnedCount} 則</span>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          置頂＝成員系統首頁頂部一直顯示；下架／過咗自動落架日就唔會顯示。
        </span>
        {canEdit && (
          <button className="mini-btn" style={{ marginLeft: 'auto' }} onClick={() => (showForm ? setShowForm(false) : startNew())}>
            {showForm ? '收起表單' : '＋ 發佈消息'}
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <div className="info-card" style={{ borderColor: '#fbbf24' }}>
          <div className="section-head">
            <div>
              <h3>{draft.id ? '✏️ 修改消息' : '＋ 發佈新消息'}</h3>
              <p>標題同內容必填；其餘留空都得。</p>
            </div>
            {draft.id && <button className="mini-btn" onClick={() => { setDraft(emptyDraft()); setShowForm(false); }}>取消</button>}
          </div>

          <div className="news-form">
            <label className="news-field wide">
              <span>標題 *</span>
              <input value={draft.title} maxLength={80} placeholder="例如：11 月區會議改期"
                onChange={e => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="news-field wide">
              <span>內容 *</span>
              <textarea value={draft.body} rows={4} maxLength={800} placeholder="寫俾成員睇嘅內容，簡短清楚就得。"
                onChange={e => setDraft({ ...draft, body: e.target.value })} />
            </label>
            <label className="news-field">
              <span>日期（將來日期＝到日先出現）</span>
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
            <label className="news-field">
              <span>連結文字（選填）</span>
              <input value={draft.linkLabel} placeholder="查看詳情" onChange={e => setDraft({ ...draft, linkLabel: e.target.value })} />
            </label>
            <div className="news-field checks">
              <label><input type="checkbox" checked={draft.pinned} onChange={e => setDraft({ ...draft, pinned: e.target.checked })} /> 置頂喺成員系統首頁</label>
              <label><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> 立即發佈（取消＝先存草稿／下架）</label>
              <label><input type="checkbox" checked={draft.notify} onChange={e => setDraft({ ...draft, notify: e.target.checked })} /> 允許成員端彈系統通知（成員端支援先生效）</label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn-sm" onClick={save} disabled={busy === 'save'}>{busy === 'save' ? '儲存中…' : (draft.id ? '儲存修改' : '發佈')}</button>
            <button className="mini-btn danger" onClick={() => { setDraft(emptyDraft()); setShowForm(false); }}>清空</button>
          </div>

          <div className="news-preview">
            <small>成員系統首頁會咁樣顯示：</small>
            <article className={`news-pin lv-${draft.level}`}>
              <div className="news-pin-top">
                <b>{draft.title || '（標題）'}</b>
                {draft.date && <small>{draft.date}</small>}
              </div>
              <p>{draft.body || '（內容）'}</p>
              {draft.link && <a href={draft.link} target="_blank" rel="noopener noreferrer">{draft.linkLabel || '查看詳情'} ↗</a>}
            </article>
          </div>
        </div>
      )}

      {loading ? (
        <div className="center"><div className="spinner" /></div>
      ) : activeList.length === 0 ? (
        <div className="info-card"><p className="empty">仲未有消息。{canEdit ? '按「＋ 發佈消息」開始，或者去主控台頂直接發。' : ''}</p></div>
      ) : (
        <section className="info-card">
          <div className="section-head"><div><h3>全部消息（{activeList.length}）</h3><p>置頂喺最前；已下架／已過期／未到日期嘅只會喺呢邊見到。</p></div></div>
          {activeList.map(n => (
            <article key={n.id} className="user-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div className="user-identity" style={{ flex: 1, minWidth: 240 }}>
                <b>{n.pinned ? '📌 ' : ''}{n.title}</b>
                <span style={{ whiteSpace: 'pre-wrap' }}>{n.body}</span>
                <span>
                  {n.date || '—'}
                  {n.expiresAt ? ` · 落架 ${n.expiresAt}` : ''}
                  {n.publishedBy ? ` · ${n.publishedBy}` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
                <span className={`news-chip lv-${n.level || 'info'}`}>{LEVELS.find(l => l.value === (n.level || 'info'))?.label}</span>
                {n.pinned && <span className="news-chip pin">置頂</span>}
                {n.live && <span className="state on">成員可見</span>}
                {n.active === false && <span className="state off">已下架</span>}
                {n.expired && <span className="state off">已過期</span>}
                {n.scheduled && <span className="state off">排期中</span>}
                {n.notify && <span className="news-chip">🔔 可通知</span>}
              </div>
              {canEdit && (
                <div className="user-actions">
                  <button className="mini-btn" disabled={busy === n.id} onClick={() => startEdit(n)}>編輯</button>
                  <button className="mini-btn" disabled={busy === n.id} onClick={() => togglePinned(n)}>{n.pinned ? '取消置頂' : '置頂'}</button>
                  <button className="mini-btn" disabled={busy === n.id} onClick={() => toggleActive(n)}>{n.active === false ? '重新上架' : '下架'}</button>
                  <button className="mini-btn danger" disabled={busy === n.id} onClick={() => remove(n)}>刪除</button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {canEdit && deletedList.length > 0 && (
        <section className="info-card">
          <div className="section-head"><div><h3>🗄 已刪除留底（{deletedList.length}）</h3><p>刪除唔會整走資料 — Sheet 繼續紀錄曾經出現過嘅消息；還原後係「已下架」狀態。</p></div></div>
          {deletedList.map(n => (
            <article key={n.id} className="user-row" style={{ opacity: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="user-identity" style={{ flex: 1, minWidth: 240 }}>
                <b>{n.title}</b>
                <span>
                  {n.date || '—'}
                  {n.deletedAt ? ` · 刪於 ${n.deletedAt.slice(0, 10)}` : ''}
                  {n.deletedBy ? ` · ${n.deletedBy}` : ''}
                </span>
              </div>
              <div className="user-actions">
                <button className="mini-btn" disabled={busy === n.id} onClick={() => restore(n)}>還原</button>
              </div>
            </article>
          ))}
        </section>
      )}

      <div className="info-card">
        <h3>ℹ️ 成員系統嗰邊點運作</h3>
        <ul>
          <li>成員每次打開 member-portal 首頁 → 拉一次公開 action <code>listAnnouncements</code>（免登入、唔經 cache）。</li>
          <li>有置頂消息就喺頁頂顯示，冇就自動隱藏；<b>唔使成員做任何嘢</b>。</li>
          <li>呢邊「下架」或「刪除」→ 成員端下次載入即刻唔見。</li>
          <li>「自動落架日」到期後自動消失，唔使記得返嚟刪。</li>
          <li>對接欄位同成員端要改嘅位：<code>docs/member-gs-handshake.md</code>「消息發佈」一節。</li>
        </ul>
      </div>

      <BackBar />
    </>
  );
}
