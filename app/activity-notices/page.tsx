'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { useDistrict } from '@/lib/useDistrict';
import type { ActivityNotice, UserSession } from '@/lib/types';
import BackLink, { BackBar } from '@/components/BackLink';

const SECTIONS = ['小童軍', '幼童軍', '童軍', '深資童軍', '樂行童軍'];
const NATURES = ['工作坊', '訓練班', '會議', '聚會', '比賽', '其他'];
const OPS_ROLES = ['DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING'];

const EMPTY = { troop: '', activityName: '', section: '', nature: '', year: '', startDateTime: '', endDateTime: '', location: '', membersCount: '', leadersCount: '', parentsCount: '', leaderName: '', leaderPhone: '', leaderEmail: '', note: '' };

export default function ActivityNoticesPage() {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const session = useRequireCard('activity');
  const [notices, setNotices] = useState<ActivityNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // 過濾
  const [fYear, setFYear] = useState('');
  const [fSection, setFSection] = useState('');
  const [fNature, setFNature] = useState('');
  const [sort, setSort] = useState<'year' | 'date' | 'section'>('year');
  // 新增（admin）
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<typeof EMPTY>(EMPTY);

  async function load() {
    setLoading(true); setError('');
    const r = await api.listActivityNotices();
    if (r.ok && r.data) setNotices(r.data);
    else setError(r.error || '無法載入知會');
    setLoading(false);
  }
  useEffect(() => { if (session) { load(); } }, [session]);

  const years = useMemo(() => Array.from(new Set(notices.map(n => n.year).filter(Boolean))) as string[], [notices]);
  const isOps = !!session && OPS_ROLES.includes(session.role);

  const filtered = useMemo(() => {
    let list = notices.filter(n =>
      (!fYear || String(n.year) === fYear) &&
      (!fSection || n.section === fSection) &&
      (!fNature || n.nature === fNature)
    );
    if (sort === 'year') list = list.slice().sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0) || String(b.submittedAt).localeCompare(String(a.submittedAt)));
    else if (sort === 'date') list = list.slice().sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
    else if (sort === 'section') list = list.slice().sort((a, b) => String(a.section).localeCompare(String(b.section)));
    return list;
  }, [notices, fYear, fSection, fNature, sort]);

  async function remove(n: ActivityNotice) {
    if (!session || !confirm(`確定刪除知會「${n.activityName}」？`)) return;
    setBusy(true); const r = await api.deleteActivityNotice(session.token, n.id); setBusy(false);
    if (r.ok) { setMsg('已刪除 ✓'); await load(); } else setError(r.error || '刪除失敗');
  }
  async function add() {
    if (!session) return;
    setError(''); setMsg('');
    if (!draft.troop.trim() || !draft.activityName.trim() || !draft.leaderName.trim() || !draft.leaderPhone.trim()) { setError('旅團、活動名稱、領袖姓名及電話必填'); return; }
    const r = await api.submitActivityNotice({ ...draft, year: draft.year || String(new Date().getFullYear()) });
    if (r.ok) { setMsg('知會已記錄 ✓'); setDraft(EMPTY); setShowAdd(false); await load(); }
    else setError(r.error || '記錄失敗');
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🗓 活動知會</h1>
      <p className="page-sub">旅團活動知會記錄，可按年份／支部／活動性質篩選排序。</p>
      {error && <div className="err">{error}</div>}
      {msg && <div className="success">✓ {msg}</div>}

      <div className="info-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontWeight: 700 }}>篩選：</label>
        <select className="search-input" value={fYear} onChange={e => setFYear(e.target.value)} style={{ width: 110 }}>
          <option value="">全部年份</option>
          {years.sort().reverse().map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="search-input" value={fSection} onChange={e => setFSection(e.target.value)} style={{ width: 130 }}>
          <option value="">全部支部</option>
          {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="search-input" value={fNature} onChange={e => setFNature(e.target.value)} style={{ width: 120 }}>
          <option value="">全部性質</option>
          {NATURES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label style={{ fontWeight: 700 }}>排序：</label>
        <select className="search-input" value={sort} onChange={e => setSort(e.target.value as any)} style={{ width: 110 }}>
          <option value="year">年份</option>
          <option value="date">日期</option>
          <option value="section">支部</option>
        </select>
        {isOps && <button className="mini-btn" style={{ marginLeft: 'auto' }} onClick={() => setShowAdd(v => !v)}>＋ 手動新增</button>}
      </div>

      {showAdd && isOps && (
        <div className="info-card" style={{ borderColor: '#fbbf24' }}>
          <div className="section-head"><div><h3>＋ 新增活動知會</h3></div></div>
          <div className="account-form" style={{ flexWrap: 'wrap', display: 'flex', gap: 8 }}>
            <input placeholder="旅團 *" value={draft.troop} onChange={e => setDraft({ ...draft, troop: e.target.value })} style={{ width: 120 }} />
            <input placeholder="活動名稱 *" value={draft.activityName} onChange={e => setDraft({ ...draft, activityName: e.target.value })} style={{ width: 200 }} />
            <select className="search-input" value={draft.section} onChange={e => setDraft({ ...draft, section: e.target.value })} style={{ width: 130 }}><option value="">支部</option>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <select className="search-input" value={draft.nature} onChange={e => setDraft({ ...draft, nature: e.target.value })} style={{ width: 120 }}><option value="">性質</option>{NATURES.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <input placeholder="年份" value={draft.year} onChange={e => setDraft({ ...draft, year: e.target.value })} style={{ width: 80 }} />
            <input placeholder="開始日期時間" value={draft.startDateTime} onChange={e => setDraft({ ...draft, startDateTime: e.target.value })} style={{ width: 170 }} />
            <input placeholder="結束日期時間" value={draft.endDateTime} onChange={e => setDraft({ ...draft, endDateTime: e.target.value })} style={{ width: 170 }} />
            <input placeholder="地點" value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} style={{ width: 150 }} />
            <input placeholder="領袖姓名 *" value={draft.leaderName} onChange={e => setDraft({ ...draft, leaderName: e.target.value })} style={{ width: 140 }} />
            <input placeholder="領袖電話 *" value={draft.leaderPhone} onChange={e => setDraft({ ...draft, leaderPhone: e.target.value })} style={{ width: 130 }} />
            <input placeholder="領袖電郵" value={draft.leaderEmail} onChange={e => setDraft({ ...draft, leaderEmail: e.target.value })} style={{ width: 160 }} />
            <button className="btn-sm" onClick={add}>儲存</button>
          </div>
          <p className="hint" style={{ fontSize: 12, marginTop: 8 }}>註：公開提交由 member-portal 處理；此處為後台手動補錄。</p>
        </div>
      )}

      {loading ? (
        <div className="center"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="info-card"><p className="empty">沒有符合條件的知會。</p></div>
      ) : (
        <section className="info-card">
          {filtered.map(n => (
            <article key={n.id} className="user-row" style={{ flexWrap: 'wrap' }}>
              <div className="user-identity">
                <b>{n.activityName}</b>
                <span>{n.troop}{n.location ? ` · ${n.location}` : ''}{n.startDateTime ? ` · ${n.startDateTime}` : ''}</span>
                <span className="rcode">{n.refCode}</span>
              </div>
              <div style={{ fontSize: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {n.year && <span className="role-chip">{n.year}</span>}
                {n.section && <span className="role-chip">{n.section}</span>}
                {n.nature && <span className="role-chip">{n.nature}</span>}
                {n.membersCount && <span className="role-chip">人 {n.membersCount}</span>}
                {n.leaderName && <span className="role-chip">{n.leaderName}{n.leaderPhone ? ` ${n.leaderPhone}` : ''}</span>}
              </div>
              {isOps && <button className="mini-btn danger" disabled={busy} onClick={() => remove(n)}>刪除</button>}
            </article>
          ))}
        </section>
      )}
      <BackBar />
    </>
  );
}
