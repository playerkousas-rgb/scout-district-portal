'use client';
/**
 * 📜 區通告（v4.13.0；職員專用，PDF only）— 開班文件 → 傳統通告 → 列印 PDF 上載區網。
 * 訓練班 Sheet → 訓練班目錄 → 呢度「從訓練班帶入」預填 → 列印 PDF → 上載區網／交總會。
 * 通告編號人手輸入（跨類別共用區編號順序）；高層可查閱全部狀態。
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { useDistrict } from '@/lib/useDistrict';
import type { Circular, CircularAttachment, CircularSession, CircularStatus, CourseLink, CourseProfile, UserSession } from '@/lib/types';
import { DEFAULT_FPS_ACCOUNT, normalizeFpsId } from '@/lib/fps';
import CircularView, { CIRCULAR_CATEGORIES, CIRCULAR_SECTIONS, CIRCULAR_STATUS_LABEL } from '@/components/CircularView';
import BackLink, { BackBar } from '@/components/BackLink';

type Draft = {
  id: string; circularNo: string; category: string; title: string; sections: string[];
  sessions: CircularSession[]; leader: string; eligibility: string; fee: string; originalFee: string;
  subsidyNote: string; feeNote: string; quota: string; deadline: string; courseId: string; signupUrl: string; signupNote: string;
  uniform: string; remarks: string; contactName: string; contactEmail: string; contactPhone: string;
  enquiryNote: string; attachments: CircularAttachment[]; issueDate: string; issuer: string; signedBy: string;
};

function today() { return new Date().toISOString().slice(0, 10); }
function emptyDraft(suggestedNo = ''): Draft {
  return {
    id: '', circularNo: suggestedNo, category: '訓練班', title: '', sections: [], sessions: [{ date: '', time: '', venue: '' }],
    leader: '', eligibility: '', fee: '', originalFee: '', subsidyNote: '', feeNote: '', quota: '', deadline: '',
    courseId: '', signupUrl: '', signupNote: '', uniform: '', remarks: '', contactName: '', contactEmail: '', contactPhone: '',
    enquiryNote: '', attachments: [], issueDate: today(), issuer: '', signedBy: '',
  };
}
function toDraft(c: Circular): Draft {
  return {
    id: c.id, circularNo: c.circularNo || '', category: c.category || '其他', title: c.title || '',
    sections: String(c.sections || '').split(/[、,，]/).map(s => s.trim()).filter(Boolean),
    sessions: (Array.isArray(c.sessions) && c.sessions.length ? c.sessions : [{ date: '', time: '', venue: '' }])
      .map(r => ({ date: r.date || '', time: r.time || '', venue: r.venue || '' })),
    leader: c.leader || '', eligibility: c.eligibility || '', fee: c.fee || '', originalFee: c.originalFee || '',
    subsidyNote: c.subsidyNote || '', feeNote: c.feeNote || '', quota: c.quota || '', deadline: c.deadline || '',
    courseId: c.courseId || '', signupUrl: c.signupUrl || '', signupNote: c.signupNote || '', uniform: c.uniform || '', remarks: c.remarks || '',
    contactName: c.contactName || '', contactEmail: c.contactEmail || '', contactPhone: c.contactPhone || '',
    enquiryNote: c.enquiryNote || '',
    attachments: (Array.isArray(c.attachments) ? c.attachments : []).map(a => ({ label: a.label || '', url: a.url || '' })),
    issueDate: c.issueDate || today(), issuer: c.issuer || '', signedBy: c.signedBy || '',
  };
}
function toPayload(d: Draft, status: CircularStatus): Partial<Circular> {
  return {
    id: d.id || undefined, circularNo: d.circularNo.trim(), category: d.category, title: d.title.trim(),
    sections: d.sections.join('、'),
    sessions: d.sessions.filter(r => r.date.trim() || r.time.trim() || r.venue.trim()),
    leader: d.leader.trim(), eligibility: d.eligibility, fee: d.fee.trim(), originalFee: d.originalFee.trim(),
    subsidyNote: d.subsidyNote, feeNote: d.feeNote, quota: d.quota.trim(), deadline: d.deadline.trim(),
    courseId: d.courseId.trim(), signupUrl: d.signupUrl.trim(), signupNote: d.signupNote, uniform: d.uniform, remarks: d.remarks,
    contactName: d.contactName.trim(), contactEmail: d.contactEmail.trim(), contactPhone: d.contactPhone.trim(),
    enquiryNote: d.enquiryNote,
    attachments: d.attachments.filter(a => a.label.trim() || a.url.trim()),
    issueDate: d.issueDate.trim(), issuer: d.issuer.trim(), signedBy: d.signedBy.trim(), status,
  };
}

export default function CircularsPage() {
  const session = useRequireCard('circulars');
  const { districtCode } = useDistrict();
  const [items, setItems] = useState<Circular[]>([]);
  const [suggestedNo, setSuggestedNo] = useState('');
  const [courses, setCourses] = useState<CourseLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [needUpgrade, setNeedUpgrade] = useState(false);
  // 過濾
  const [fStatus, setFStatus] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fQ, setFQ] = useState('');
  // 編輯＋預覽
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [previewId, setPreviewId] = useState('');
  const [noticeDraft, setNoticeDraft] = useState<Record<string, string>>({});
  const [account, setAccount] = useState({ name: DEFAULT_FPS_ACCOUNT.name, id: DEFAULT_FPS_ACCOUNT.id, memberPortalUrl: '', districtName: '' });

  async function load(s: UserSession) {
    setLoading(true); setError('');
    const [board, cards] = await Promise.all([api.getCirculars(s.token), api.getCards(s.token)]);
    if (board.ok && board.data) {
      setItems(board.data.items || []); setSuggestedNo(board.data.suggestedNo || ''); setNeedUpgrade(false);
    } else {
      const e = board.error || '無法載入通告';
      setNeedUpgrade(/未知的 action|Circulars/.test(e));
      setError(e);
    }
    if (cards.ok && cards.data) {
      const me = cards.data.find(c => c.cardId === 'circulars');
      setCanEdit(!!s.mockAdmin || me?.access === 'edit');
    }
    // 訓練班下拉（冇 training 權限都唔緊要，照出通告管理）
    try {
      const r = await api.getCourseLinks(s.token);
      if (r.ok && r.data) setCourses(r.data);
    } catch { /* ignore */ }
    setLoading(false);
  }
  useEffect(() => { if (session) { load(session); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getConfig();
        if (cancelled) return;
        setAccount({
          name: String(r.data?.fpsAccountName || '').trim() || DEFAULT_FPS_ACCOUNT.name,
          id: normalizeFpsId(r.data?.fpsAccountNumber) || DEFAULT_FPS_ACCOUNT.id,
          memberPortalUrl: String(r.data?.memberPortalUrl || '').trim(),
          districtName: String(r.data?.districtName || '').trim(),
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [session]);

  const filtered = useMemo(() => {
    const q = fQ.trim().toLowerCase();
    return items.filter(n =>
      (!fStatus || n.status === fStatus) &&
      (!fCategory || n.category === fCategory) &&
      (!q || String(n.title).toLowerCase().includes(q) || String(n.circularNo).toLowerCase().includes(q))
    );
  }, [items, fStatus, fCategory, fQ]);

  const preview = useMemo(() => items.find(n => n.id === previewId) || null, [items, previewId]);
  const linkedCourse = useMemo(() => courses.find(x => x.courseId === draft.courseId) || null, [courses, draft.courseId]);

  function defaultSignupUrl() {
    const base = account.memberPortalUrl.replace(/\/+$/, '');
    return base ? `${base}/training` : '';
  }
  function printCircular(n: Circular) {
    setPreviewId(n.id);
    setMsg(`預覽第 ${n.circularNo} 號通告：撳瀏覽器列印即可存成 PDF ✓`);
    setTimeout(() => { if (typeof window !== 'undefined') window.print(); }, 350);
  }

  function startNew() {
    setDraft(emptyDraft(suggestedNo)); setShowForm(true); setMsg(''); setError('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function startEdit(n: Circular) {
    setDraft(toDraft(n)); setShowForm(true); setMsg(''); setError('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function set<K extends keyof Draft>(k: K, v: Draft[K]) { setDraft(d => ({ ...d, [k]: v })); }
  function toggleSection(s: string) {
    setDraft(d => ({ ...d, sections: d.sections.includes(s) ? d.sections.filter(x => x !== s) : [...d.sections, s] }));
  }

  /** 從訓練班 Sheet 即時 pull 預填（profile＋Print_通告內文；只填空欄，有料唔會被覆蓋） */
  async function autofillFromCourse() {
    if (!session) return;
    if (!linkedCourse) { setError('請先喺「掛接訓練班」揀一個班'); return; }
    setError(''); setMsg(''); setBusy('pull');
    const r = await api.pullCourseProfile(session.token, { courseId: linkedCourse.courseId });
    setBusy('');
    if (!r.ok || !r.data) { setError(r.error || '讀取訓練班 Sheet 失敗'); return; }
    const prof: CourseProfile = r.data;
    const circ = prof.circular || null;
    const flagged = (prof.sessions || []).filter(x => x.showOnCircular);
    const useSessions = (flagged.length ? flagged : (prof.sessions || []))
      .map(x => ({ date: x.displayDate || x.date || '', time: x.displayTime || x.time || '', venue: x.displayVenue || x.venue || '' }))
      .filter(x => x.date || x.time || x.venue);
    const leader = prof.leader;
    const leaderLine = leader ? `${leader.name || ''}${leader.title || ''}${leader.qualification ? `（${leader.qualification}）` : ''}` : '';
    setDraft(d => {
      const curEmpty = d.sessions.every(x => !x.date.trim() && !x.time.trim() && !x.venue.trim());
      const fileNo = (circ?.fileNo || '').trim();
      return {
        ...d,
        sessions: curEmpty && useSessions.length ? useSessions : d.sessions,
        leader: d.leader || leaderLine,
        eligibility: d.eligibility || circ?.eligibility || linkedCourse.eligibility || '',
        fee: d.fee || prof.fee || (linkedCourse.fee ? String(linkedCourse.fee) : ''),
        feeNote: d.feeNote || circ?.feeText || '',
        subsidyNote: d.subsidyNote || linkedCourse.subsidyNote || '',
        deadline: d.deadline || prof.deadline || linkedCourse.deadline || '',
        quota: d.quota || prof.quota || (linkedCourse.quota ? String(linkedCourse.quota) : ''),
        uniform: d.uniform || circ?.uniform || '',
        remarks: d.remarks || (circ?.remarks || []).join('\n'),
        contactName: d.contactName || leaderLine || linkedCourse.contact || '',
        contactEmail: d.contactEmail || leader?.email || '',
        contactPhone: d.contactPhone || leader?.phone || '',
        enquiryNote: d.enquiryNote || circ?.enquiry || '',
        signupUrl: d.signupUrl || defaultSignupUrl(),
        signupNote: d.signupNote || circ?.signupText || '',
        circularNo: d.circularNo || (/^\d{1,6}$/.test(fileNo) ? fileNo : d.circularNo),
        issueDate: d.issueDate || circ?.issueDateISO || d.issueDate,
        issuer: d.issuer || (circ?.signer ? `區總監 ${circ.signer}` : ''),
        signedBy: d.signedBy || circ?.deputy || '',
      };
    });
    setMsg(`已從「${prof.courseName || linkedCourse.title}」帶入節數／收費／名額／截止／通告內文 ✓（有料嘅欄冇郁）`);
  }

  async function save(status: CircularStatus) {
    if (!session) return;
    setError(''); setMsg('');
    if (!draft.circularNo.trim()) { setError('通告編號必填（人手輸入，跨類別共用）'); return; }
    if (!draft.title.trim()) { setError('標題必填'); return; }
    setBusy('save');
    const r = await api.saveCircular(session.token, toPayload(draft, status));
    setBusy('');
    if (r.ok && r.data) {
      setMsg(status === 'published' ? `已發佈 ✓（第 ${draft.circularNo} 號；請列印 PDF 上載區網）` : '已儲存為草稿 ✓');
      setDraft(emptyDraft('')); setShowForm(false); await load(session);
    } else setError(r.error || '儲存失敗');
  }

  async function setStatus(n: Circular, status: CircularStatus) {
    if (!session) return;
    const label = CIRCULAR_STATUS_LABEL[status] || status;
    if (status === 'published' && !confirm(`確定發佈第 ${n.circularNo} 號通告「${n.title}」？\n發佈後請列印 PDF 上載區網，再回填連結。`)) return;
    setBusy(n.id); setError(''); setMsg('');
    const r = await api.setCircularStatus(session.token, n.id, status);
    setBusy('');
    if (r.ok) { setMsg(`第 ${n.circularNo} 號已轉為「${label}」✓`); await load(session); }
    else setError(r.error || '操作失敗');
  }

  async function remove(n: Circular) {
    if (!session) return;
    const warned = n.status !== 'draft'
      ? `⚠️ 第 ${n.circularNo} 號已經係「${CIRCULAR_STATUS_LABEL[n.status || ''] || n.status}」—— 刪咗就冇得復原！\n\n確定刪除「${n.title}」？（建議改用「封存」代替刪除）`
      : `確定刪除草稿「${n.title}」？`;
    if (!confirm(warned)) return;
    setBusy(n.id); setError(''); setMsg('');
    const r = await api.deleteCircular(session.token, n.id);
    setBusy('');
    if (r.ok) { setMsg('已刪除 ✓'); if (previewId === n.id) setPreviewId(''); await load(session); }
    else setError(r.error || '刪除失敗');
  }

  /** 把區網 PDF 連結回填到訓練班 noticeUrl（成員系統該班即跳轉睇真通告） */
  async function saveNoticeUrl(n: Circular) {
    if (!session || !n.courseId) return;
    const course = courses.find(x => x.courseId === n.courseId);
    if (!course) { setError('搵唔到已掛接嘅訓練班（可能你冇 training 卡權限睇唔到名單）'); return; }
    const v = (noticeDraft[n.id] ?? course.noticeUrl ?? '').trim();
    if (!v) { setError('請先喺輸入框貼上區網 PDF 連結'); return; }
    setBusy(n.id); setError(''); setMsg('');
    const r = await api.saveCourseLink(session.token, { ...course, noticeUrl: v });
    setBusy('');
    if (r.ok) { setMsg(`已回填「${course.title}」嘅區網通告連結 ✓ 成員系統該班即跳轉睇真通告`); await load(session); }
    else setError(r.error || '寫入失敗（需要訓練班管理權限；可改去訓練班頁人手貼上）');
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">📜 區通告</h1>
      <p className="page-sub">
        開班文件 → 傳統通告：從訓練班帶入資料預填，補好內文後列印 PDF 上載區網／交總會（圖書館自動收錄）。
        通告編號人手輸入（跨類別共用）；高層可查閱全部狀態。
      </p>
      {error && <div className="err">{error}</div>}
      {msg && <div className="success">✓ {msg}</div>}

      {needUpgrade && (
        <div className="info-card" style={{ borderColor: '#fbbf24', background: '#fffbeb' }}>
          <h3>⚠️ 後台未更新</h3>
          <p style={{ fontSize: 13, lineHeight: 1.8 }}>
            區 Google Sheet 嘅 Apps Script 仲係舊版。請將本 repo <code>gs/Code.gs</code>（v4.13.0）全部覆蓋貼上 →
            執行 <code>setupSheets()</code>（補建唔清空）→ 重新部署 Web App。
            驗證：<code>?action=getHealthCheck</code> 見到 <code>version: &quot;4.13.0&quot;</code>。
          </p>
        </div>
      )}

      <div className="info-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontWeight: 700 }}>狀態：</label>
        <select className="search-input" value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ width: 130 }}>
          <option value="">全部</option>
          {(['draft', 'published', 'closed', 'archived'] as CircularStatus[]).map(s => (
            <option key={s} value={s}>{CIRCULAR_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <label style={{ fontWeight: 700 }}>類別：</label>
        <select className="search-input" value={fCategory} onChange={e => setFCategory(e.target.value)} style={{ width: 120 }}>
          <option value="">全部</option>
          {CIRCULAR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="search-input" placeholder="搜尋編號／標題…" value={fQ} onChange={e => setFQ(e.target.value)} style={{ width: 200 }} />
        <span className="muted" style={{ fontSize: 12 }}>{filtered.length} 張</span>
        {canEdit && (
          <button className="mini-btn" style={{ marginLeft: 'auto' }} onClick={() => (showForm ? setShowForm(false) : startNew())}>
            {showForm ? '收起表單' : '＋ 開新通告'}
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <div className="info-card" style={{ borderColor: '#fbbf24' }}>
          <div className="section-head">
            <div>
              <h3>{draft.id ? `✏️ 修改第 ${draft.circularNo} 號通告` : '＋ 開新通告（開班文件）'}</h3>
              <p>編號同標題必填；其餘有先填，冇填嘅欄列印時會自動收起。</p>
            </div>
            {draft.id && <button className="mini-btn" onClick={() => { setDraft(emptyDraft('')); setShowForm(false); }}>取消</button>}
          </div>

          <div className="news-form">
            <label className="news-field">
              <span>通告編號 *（人手輸入，唔重複{suggestedNo && !draft.id ? `；建議用 ${suggestedNo}` : ''}）</span>
              <input value={draft.circularNo} placeholder={suggestedNo || '例如 2607'} onChange={e => set('circularNo', e.target.value)} />
            </label>
            <label className="news-field">
              <span>類別</span>
              <select value={draft.category} onChange={e => set('category', e.target.value)}>
                {CIRCULAR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="news-field wide">
              <span>標題 *</span>
              <input value={draft.title} placeholder="例如：社區參與章、公民章暨積極公民獎章系列訓練班" onChange={e => set('title', e.target.value)} />
            </label>
            <div className="news-field wide">
              <span>支部（可多選）</span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {CIRCULAR_SECTIONS.map(s => (
                  <label key={s} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={draft.sections.includes(s)} onChange={() => toggleSection(s)} /> {s}
                  </label>
                ))}
              </div>
            </div>
            <label className="news-field">
              <span>發出日期</span>
              <input type="date" value={draft.issueDate} onChange={e => set('issueDate', e.target.value)} />
            </label>
            <label className="news-field">
              <span>班領導人</span>
              <input value={draft.leader} placeholder="例如：楊德銘先生" onChange={e => set('leader', e.target.value)} />
            </label>
          </div>

          <h4 style={{ margin: '14px 0 6px' }}>📅 節數表（日期／時間／地點）</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {draft.sessions.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input placeholder="日期（2026-07-20）" value={r.date} onChange={e => set('sessions', draft.sessions.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} style={{ width: 150 }} />
                <input placeholder="時間（下午七時至十時）" value={r.time} onChange={e => set('sessions', draft.sessions.map((x, j) => j === i ? { ...x, time: e.target.value } : x))} style={{ width: 200 }} />
                <input placeholder="地點" value={r.venue} onChange={e => set('sessions', draft.sessions.map((x, j) => j === i ? { ...x, venue: e.target.value } : x))} style={{ flex: 1, minWidth: 180 }} />
                <button className="mini-btn danger" onClick={() => set('sessions', draft.sessions.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <div><button className="mini-btn" onClick={() => set('sessions', [...draft.sessions, { date: '', time: '', venue: '' }])}>＋ 加一節</button></div>
          </div>

          <div className="news-form" style={{ marginTop: 12 }}>
            <label className="news-field wide">
              <span>參加資格</span>
              <textarea value={draft.eligibility} rows={3} placeholder="每項一行，例如：1．已宣誓及持有有效紀錄冊之童軍支部成員…" onChange={e => set('eligibility', e.target.value)} />
            </label>
            <label className="news-field">
              <span>費用（HK$；免費／詳見內文都得）</span>
              <input value={draft.fee} placeholder="例如 100" onChange={e => set('fee', e.target.value)} />
            </label>
            <label className="news-field">
              <span>原價（有資助先填）</span>
              <input value={draft.originalFee} placeholder="例如 200" onChange={e => set('originalFee', e.target.value)} />
            </label>
            <label className="news-field wide">
              <span>資助說明</span>
              <textarea value={draft.subsidyNote} rows={2} placeholder="例如：本活動原價港幣 200 元，因獲資助計劃資助，費用減半。" onChange={e => set('subsidyNote', e.target.value)} />
            </label>
            <label className="news-field">
              <span>費用說明全文（有就代替組合句）</span>
              <textarea value={draft.feeNote} rows={2} placeholder="由訓練班 Sheet 通告帶入，例如：活動費用港幣 25 元正（包括行政、茶點等）。" onChange={e => set('feeNote', e.target.value)} />
            </label>
            <label className="news-field">
              <span>名額</span>
              <input value={draft.quota} placeholder="例如 30" onChange={e => set('quota', e.target.value)} />
            </label>
            <label className="news-field">
              <span>截止日期</span>
              <input type="date" value={draft.deadline} onChange={e => set('deadline', e.target.value)} />
            </label>
            <label className="news-field wide">
              <span>服裝</span>
              <input value={draft.uniform} placeholder="例如：整齊童軍制服" onChange={e => set('uniform', e.target.value)} />
            </label>
            <label className="news-field wide">
              <span>備註</span>
              <textarea value={draft.remarks} rows={3} placeholder="每項一行" onChange={e => set('remarks', e.target.value)} />
            </label>
          </div>

          <h4 style={{ margin: '14px 0 6px' }}>📝 報名（掛接訓練班＋成員系統報名連結）</h4>
          <div className="account-form" style={{ flexWrap: 'wrap', display: 'flex', gap: 8 }}>
            <select className="search-input" value={draft.courseId} onChange={e => set('courseId', e.target.value)} style={{ minWidth: 240, flex: 1 }}>
              <option value="">— 純通告，唔掛接訓練班 —</option>
              {courses.map(c => <option key={c.courseId} value={c.courseId}>{c.title}（{c.courseId}）</option>)}
            </select>
            <button className="mini-btn" disabled={!linkedCourse} onClick={autofillFromCourse} title="把該班嘅收費／名額／截止等帶入呢張通告">⬇ 從訓練班帶入資料</button>
          </div>
          <div className="account-form" style={{ flexWrap: 'wrap', display: 'flex', gap: 8, marginTop: 8 }}>
            <input placeholder="報名連結（成員系統訓練班頁；列印為報名辦法文字）" value={draft.signupUrl} onChange={e => set('signupUrl', e.target.value)} style={{ flex: 1, minWidth: 280 }} />
            <input placeholder="報名辦法全文（選填；由訓練班 Sheet 通告帶入，列印喺連結上面）" value={draft.signupNote} onChange={e => set('signupNote', e.target.value)} style={{ flex: 1, minWidth: 280 }} />
            {defaultSignupUrl() && !draft.signupUrl && (
              <button className="mini-btn" onClick={() => set('signupUrl', defaultSignupUrl())} title="填入成員系統訓練班頁網址">填入成員系統連結</button>
            )}
          </div>
          {courses.length === 0 && <p className="hint" style={{ fontSize: 12 }}>訓練班名單為空（可能你冇 training 卡權限，或未開班）。可先出純通告，之後再掛接。</p>}

          <h4 style={{ margin: '14px 0 6px' }}>📞 查詢</h4>
          <div className="account-form" style={{ flexWrap: 'wrap', display: 'flex', gap: 8 }}>
            <input placeholder="聯絡人" value={draft.contactName} onChange={e => set('contactName', e.target.value)} style={{ width: 160 }} />
            <input placeholder="電話" value={draft.contactPhone} onChange={e => set('contactPhone', e.target.value)} style={{ width: 140 }} />
            <input placeholder="電郵" value={draft.contactEmail} onChange={e => set('contactEmail', e.target.value)} style={{ width: 220 }} />
          </div>
          <div className="account-form" style={{ marginTop: 8 }}>
            <input placeholder="查詢補充（例如：如在 7 月 15 日尚未接獲通知者…）" value={draft.enquiryNote} onChange={e => set('enquiryNote', e.target.value)} style={{ flex: 1, minWidth: 280 }} />
          </div>

          <h4 style={{ margin: '14px 0 6px' }}>🔗 附件（選填）</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {draft.attachments.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input placeholder="附件名稱" value={a.label} onChange={e => set('attachments', draft.attachments.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} style={{ width: 180 }} />
                <input placeholder="https://…" value={a.url} onChange={e => set('attachments', draft.attachments.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} style={{ flex: 1, minWidth: 220 }} />
                <button className="mini-btn danger" onClick={() => set('attachments', draft.attachments.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <div><button className="mini-btn" onClick={() => set('attachments', [...draft.attachments, { label: '', url: '' }])}>＋ 加附件</button></div>
          </div>

          <h4 style={{ margin: '14px 0 6px' }}>✍️ 署名</h4>
          <div className="account-form" style={{ flexWrap: 'wrap', display: 'flex', gap: 8 }}>
            <input placeholder="署名（例如：區總監 袁可秀）" value={draft.issuer} onChange={e => set('issuer', e.target.value)} style={{ width: 220 }} />
            <input placeholder="代行（例如：楊德銘；冇就留空）" value={draft.signedBy} onChange={e => set('signedBy', e.target.value)} style={{ width: 220 }} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn-sm" onClick={() => save('draft')} disabled={busy === 'save'}>{busy === 'save' ? '儲存中…' : '💾 儲存為草稿'}</button>
            <button className="btn-sm" onClick={() => save('published')} disabled={busy === 'save'}>📢 儲存並發佈</button>
            <button className="mini-btn danger" onClick={() => { setDraft(emptyDraft('')); setShowForm(false); }}>取消</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="center"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="info-card"><p className="empty">冇通告。{canEdit ? '按「＋ 開新通告」開始，第一張建議編號：' + (suggestedNo || '—') : ''}</p></div>
      ) : (
        <section className="info-card">
          <div className="section-head"><div><h3>全部通告（{filtered.length}）</h3><p>發出日期新嘅排先；高層可查閱全部狀態。</p></div></div>
          {filtered.map(n => (
            <article key={n.id} className="user-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div className="user-identity" style={{ flex: 1, minWidth: 240 }}>
                <b>第 {n.circularNo} 號 · {n.title}</b>
                <span>
                  {n.category}
                  {n.sections ? ` · ${n.sections}` : ''}
                  {n.issueDate ? ` · ${n.issueDate}` : ''}
                  {n.deadline ? ` · 截止 ${n.deadline}` : ''}
                  {n.course ? ` · 🎓 ${n.course.title}` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12, alignItems: 'center' }}>
                <span className={`news-chip lv-${n.status === 'published' ? 'info' : n.status === 'closed' ? 'warning' : 'important'}`}>{CIRCULAR_STATUS_LABEL[n.status || 'draft']}</span>
                {n.isOpen && <span className="state on">接受報名中</span>}
                {n.status === 'published' && !n.isOpen && <span className="state off">已過截止</span>}
              </div>
              <div className="user-actions">
                <button className="mini-btn" onClick={() => setPreviewId(previewId === n.id ? '' : n.id)}>{previewId === n.id ? '收起預覽' : '👀 預覽'}</button>
                <button className="mini-btn" onClick={() => printCircular(n)}>🖨 列印 PDF</button>
                {canEdit && (
                  <>
                    <button className="mini-btn" onClick={() => startEdit(n)}>編輯</button>
                    {n.status === 'draft' && <button className="mini-btn" disabled={busy === n.id} onClick={() => setStatus(n, 'published')}>📢 發佈</button>}
                    {n.status === 'published' && <button className="mini-btn" disabled={busy === n.id} onClick={() => setStatus(n, 'closed')}>⛔ 截止</button>}
                    {(n.status === 'published' || n.status === 'closed') && <button className="mini-btn" disabled={busy === n.id} onClick={() => setStatus(n, 'archived')}>🗄 封存</button>}
                    {n.status !== 'draft' && <button className="mini-btn" disabled={busy === n.id} onClick={() => setStatus(n, 'draft')}>📝 轉回草稿</button>}
                    <button className="mini-btn danger" disabled={busy === n.id} onClick={() => remove(n)}>刪除</button>
                  </>
                )}
              </div>
              {canEdit && n.courseId && (
                <div style={{ flexBasis: '100%', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                  <input
                    className="search-input"
                    placeholder="區網 PDF 連結（上載區網後貼上，回填訓練班 noticeUrl）"
                    value={noticeDraft[n.id] ?? n.course?.noticeUrl ?? ''}
                    onChange={e => setNoticeDraft(m => ({ ...m, [n.id]: e.target.value }))}
                    style={{ flex: 1, minWidth: 240 }}
                  />
                  <button className="mini-btn" disabled={busy === n.id} onClick={() => saveNoticeUrl(n)}>↗ 回填訓練班</button>
                  {(noticeDraft[n.id] ?? n.course?.noticeUrl) && (
                    <a className="mini-btn" href={(noticeDraft[n.id] ?? n.course?.noticeUrl) || ''} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>開 PDF ↗</a>
                  )}
                </div>
              )}
              {previewId === n.id && (
                <div style={{ flexBasis: '100%', marginTop: 8 }}>
                  <CircularView
                    circular={n}
                    districtName={account.districtName}
                    districtCode={districtCode || ''}
                    fpsAccount={{ name: account.name, id: account.id }}
                    memberPortalUrl={account.memberPortalUrl}
                  />
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      <div className="info-card">
        <h3>ℹ️ 發佈後流程</h3>
        <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.9, fontSize: 13.5 }}>
          <li>🖨 <b>列印 PDF</b>：撳「🖨 列印 PDF」預覽，用瀏覽器列印存成 PDF（傳統通告格式：節數表／費用＋FPS QR／報名辦法／署名）。</li>
          <li>🌐 <b>上載區網／交總會</b>：將 PDF 交畀網站管理員上載區網，或轉交總會／地域網站；通告圖書館會自動收錄。</li>
          <li>↗ <b>回填連結</b>：將區網 PDF 連結貼入上面輸入框撳「↗ 回填訓練班」—— 成員系統該班即跳轉睇真通告。</li>
          <li>📱 <b>成員報名</b>：通告「報名辦法」印成員系統訓練班頁網址；成員喺成員系統用內置報名表報名（唔再用 Google Form）。</li>
        </ol>
      </div>

      <BackBar />
    </>
  );
}
