'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { loadSession } from '@/lib/session';
import { useDistrict } from '@/lib/useDistrict';
import type { Notice, UserSession } from '@/lib/types';

const OPS_ROLES = ['DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING'];
const EMPTY = { title: '', category: '', url: '', body: '', active: true };

export default function NoticesPage() {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const [session, setSession] = useState<UserSession | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(EMPTY);

  async function load() {
    setLoading(true); setError('');
    const r = await api.listNotices({ onlyActive: 'false' });
    if (r.ok && r.data) setNotices(r.data); else setError(r.error || '無法載入通告');
    setLoading(false);
  }
  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace(withDistrict('/')); return; }
    setSession(s); load();
  }, [router, withDistrict]);

  const isOps = !!session && OPS_ROLES.includes(session.role);

  async function save() {
    if (!session) return;
    setError(''); setMsg('');
    if (!draft.title.trim()) { setError('通告標題必填'); return; }
    const r = await api.saveNotice(session.token, { ...draft, active: draft.active });
    if (r.ok) { setMsg('通告已儲存 ✓'); setDraft(EMPTY); setShowAdd(false); await load(); }
    else setError(r.error || '儲存失敗');
  }
  async function toggle(n: Notice) {
    if (!session) return;
    setBusy(true); const r = await api.saveNotice(session.token, { id: n.id, title: n.title, category: n.category, url: n.url, body: n.body, active: !n.active }); setBusy(false);
    if (r.ok) await load(); else setError(r.error || '更新失敗');
  }
  async function remove(n: Notice) {
    if (!session || !confirm(`確定刪除通告「${n.title}」？`)) return;
    setBusy(true); const r = await api.deleteNotice(session.token, n.id); setBusy(false);
    if (r.ok) { setMsg('通告已刪除 ✓'); await load(); } else setError(r.error || '刪除失敗');
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <span className="backlink" onClick={() => router.push(withDistrict('/'))}>← 返回主控台</span>
      <h1 className="page-title">📢 通告庫</h1>
      <p className="page-sub">發佈及管理區通告；可外連或內文。</p>
      {error && <div className="err">{error}</div>}
      {msg && <div className="success">✓ {msg}</div>}

      {isOps && (
        <div className="info-card">
          {showAdd ? (
            <>
              <div className="section-head"><div><h3>＋ 新增通告</h3></div><button className="mini-btn" onClick={() => setShowAdd(false)}>取消</button></div>
              <div className="account-form" style={{ flexWrap: 'wrap', display: 'flex', gap: 8 }}>
                <input placeholder="標題 *" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} style={{ width: 240 }} />
                <input placeholder="分類" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} style={{ width: 120 }} />
                <input placeholder="外連網址（可留空）" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} style={{ width: 260 }} />
                <input placeholder="內文（可留空）" value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} style={{ width: 320 }} />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> 啟用
                </label>
                <button className="btn-sm" onClick={save}>儲存</button>
              </div>
            </>
          ) : (
            <div className="section-head"><div><h3>通告庫 <small>({notices.length})</small></h3></div><button className="mini-btn" onClick={() => setShowAdd(true)}>＋ 新增通告</button></div>
          )}
        </div>
      )}

      {loading ? (
        <div className="center"><div className="spinner" /></div>
      ) : notices.length === 0 ? (
        <div className="info-card"><p className="empty">暫無通告。</p></div>
      ) : notices.map(n => (
        <article key={n.id} className="user-row" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="user-identity">
            <b>{n.title}</b>
            <span>{n.category}{n.postedAt ? ` · ${new Date(n.postedAt).toLocaleDateString('zh-HK')}` : ''}</span>
            {n.body && <span>{n.body}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {n.url && <a href={n.url} target="_blank" rel="noreferrer" className="mini-btn">🔗 開啟</a>}
            <span className={`state ${n.active ? 'on' : 'off'}`}>{n.active ? '啟用' : '停用'}</span>
            {isOps && (
              <div className="user-actions" style={{ display: 'inline-flex', gap: 6 }}>
                <button className="mini-btn" disabled={busy} onClick={() => toggle(n)}>{n.active ? '停用' : '啟用'}</button>
                <button className="mini-btn danger" disabled={busy} onClick={() => remove(n)}>刪除</button>
              </div>
            )}
          </div>
        </article>
      ))}
    </>
  );
}
