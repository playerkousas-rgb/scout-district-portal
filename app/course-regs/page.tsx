'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { loadSession } from '@/lib/session';
import { useDistrict } from '@/lib/useDistrict';
import type { CourseLink, CourseReg, UserSession } from '@/lib/types';

const STATUS_LABEL: Record<string, string> = {
  pending: '待批', approved: '已批', rejected: '已拒絕', cancelled: '已取消',
};

export default function CourseRegsPage() {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const [session, setSession] = useState<UserSession | null>(null);
  const [links, setLinks] = useState<CourseLink[]>([]);
  const [courseId, setCourseId] = useState('');
  const [regs, setRegs] = useState<CourseReg[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function loadCourses(s: UserSession) {
    const r = await api.getCourseLinks(s.token);
    if (r.ok && r.data) setLinks(r.data);
    else setError(r.error || '無法載入訓練班');
  }
  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace(withDistrict('/')); return; }
    setSession(s); loadCourses(s); setLoading(false);
  }, [router, withDistrict]);

  async function loadRegs(cid: string) {
    if (!session || !cid) return;
    setError(''); setMsg(''); setLoading(true);
    const r = await api.listCourseRegs(session.token, cid);
    if (r.ok && r.data) setRegs(r.data);
    else { setRegs([]); setError(r.error || '無法載入報名（請確認該班已設定收表 Script 並已部署公開）'); }
    setLoading(false);
  }

  function pickCourse(cid: string) {
    setCourseId(cid);
    if (cid) loadRegs(cid);
    else setRegs([]);
  }

  async function setStatus(reg: CourseReg, status: string) {
    if (!session || !courseId) return;
    setBusy(true); setError(''); setMsg('');
    const r = await api.setCourseRegStatus(session.token, courseId, reg.id, status);
    setBusy(false);
    if (r.ok) { setMsg(`已將 ${reg.nameZh || reg.refCode} 標為「${STATUS_LABEL[status]}」✓`); await loadRegs(courseId); }
    else setError(r.error || '更新失敗');
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <span className="backlink" onClick={() => router.push(withDistrict('/'))}>← 返回主控台</span>
      <h1 className="page-title">📝 訓練班報名審批</h1>
      <p className="page-sub">揀課程 → 檢視報名名單 + 入數紙 → 批核 status。</p>
      {error && <div className="err">{error}</div>}
      {msg && <div className="success">✓ {msg}</div>}

      <div className="info-card" style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 700 }}>揀訓練班：</label>
        <select className="search-input" style={{ marginLeft: 8 }} value={courseId} onChange={e => pickCourse(e.target.value)}>
          <option value="">— 揀一個訓練班 —</option>
          {links.filter(l => String(l.active).toUpperCase() !== 'FALSE').map(l => (
            <option key={l.courseId} value={l.courseId}>{l.title}（{l.courseId}）</option>
          ))}
        </select>
        <span className="hint" style={{ marginLeft: 12, fontSize: 12 }}>名單實時轉發去該班專屬 Script 讀取。</span>
      </div>

      {loading ? (
        <div className="center"><div className="spinner" /><div>載入中…</div></div>
      ) : courseId ? (
        regs.length === 0 ? (
          <div className="info-card"><p className="empty">暫無報名，或該班收表 Script 未設定／未公開。</p></div>
        ) : (
          <section className="info-card">
            <div className="section-head"><div><h3>報名名單 <small>({regs.length})</small></h3></div></div>
            {regs.map(reg => (
              <article key={reg.id} className="user-row" style={{ flexWrap: 'wrap' }}>
                <div className="user-identity">
                  <b>{reg.nameZh || '未填名'}{reg.nameEn ? ` / ${reg.nameEn}` : ''}</b>
                  <span>{reg.email}{reg.phone ? ` · ${reg.phone}` : ''}</span>
                  <span>{reg.refCode || ''}</span>
                </div>
                <div style={{ fontSize: 12 }}>
                  {reg.section ? <span className="role-chip">{reg.section}</span> : null}
                  {reg.scoutDistrict ? <span className="role-chip">{reg.scoutDistrict}</span> : null}
                  {reg.troop ? <span className="role-chip">{reg.troop}</span> : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {reg.receiptUrl ? (
                    <a href={reg.receiptUrl} target="_blank" rel="noreferrer" className="mini-btn">🧾 入數紙</a>
                  ) : <span className="state off">無入數紙</span>}
                  <span className={`state ${String(reg.status).toLowerCase() === 'approved' ? 'on' : String(reg.status).toLowerCase() === 'pending' ? '' : 'off'}`}>
                    {STATUS_LABEL[String(reg.status || 'pending').toLowerCase()] || reg.status}
                  </span>
                  <div className="user-actions" style={{ display: 'inline-flex', gap: 6 }}>
                    <button className="mini-btn" disabled={busy} onClick={() => setStatus(reg, 'approved')}>✅ 批准</button>
                    <button className="mini-btn danger" disabled={busy} onClick={() => setStatus(reg, 'rejected')}>✕ 拒絕</button>
                    <button className="mini-btn" disabled={busy} onClick={() => setStatus(reg, 'cancelled')}>↩ 取消</button>
                  </div>
                </div>
                {reg.reviewedAt && <span style={{ fontSize: 11, color: '#888' }}>審批：{reg.reviewer || '—'} @ {reg.reviewedAt}</span>}
              </article>
            ))}
          </section>
        )
      ) : (
        <div className="info-card"><p className="empty">請先揀一個訓練班。</p></div>
      )}
    </>
  );
}
