'use client';
import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { useDistrict } from '@/lib/useDistrict';
import type { CourseLink, CourseProfile, UserSession } from '@/lib/types';
import CourseFpsBlock, { type CourseFpsResult } from '@/components/CourseFpsBlock';
import { DEFAULT_FPS_ACCOUNT, normalizeFpsId } from '@/lib/fps';
import BackLink, { BackBar } from '@/components/BackLink';

const EMPTY: CourseLink = {
  courseId: '', title: '', badgeName: '', section: '', courseNo: '', sessionsText: '',
  eligibility: '', fee: '', originalFee: '', subsidyNote: '', deadline: '', quota: '',
  filled: '', venue: '', noticeUrl: '', contact: '', scriptExecUrl: '', scriptApiKey: '',
  driveFolderId: '', active: 'TRUE', createdAt: '',
  fpsQrPayload: '', fpsAmount: '', fpsReference: '', fpsAccountName: '', fpsAccountNumber: '', fpsUpdatedAt: '',
};

export default function TrainingPage() {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const session = useRequireCard('training');
  const [links, setLinks] = useState<CourseLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [draft, setDraft] = useState<CourseLink>(EMPTY);
  const [editingId, setEditingId] = useState('');
  const [fpsCourseId, setFpsCourseId] = useState('');   // 正在生成 QR 嘅班
  const [fpsSaving, setFpsSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [account, setAccount] = useState({ name: DEFAULT_FPS_ACCOUNT.name, id: DEFAULT_FPS_ACCOUNT.id, loaded: false });

  async function load(s: UserSession) {
    setLoading(true); setError('');
    const r = await api.getCourseLinks(s.token);
    if (r.ok && r.data) setLinks(r.data);
    else setError(r.error || '無法載入訓練班');
    setLoading(false);
  }
  useEffect(() => { if (session) { load(session); } }, [session]);

  // 區會轉數快戶口（Config FPS_ACCOUNT_NAME / FPS_ACCOUNT_NUMBER；未填用內建預設）
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getConfig();
        if (cancelled) return;
        const name = String(r.data?.fpsAccountName ?? '').trim();
        const id = normalizeFpsId(r.data?.fpsAccountNumber);
        setAccount({ name: name || DEFAULT_FPS_ACCOUNT.name, id: id || DEFAULT_FPS_ACCOUNT.id, loaded: true });
      } catch {
        if (!cancelled) setAccount(a => ({ ...a, loaded: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  /** 只更新該班 FPS 欄位（其餘欄位原樣送回，避免洗走 Script／Key） */
  async function saveCourseFps(course: CourseLink, r: CourseFpsResult) {
    if (!session) return;
    setFpsSaving(true); setError(''); setMsg('');
    const res = await api.saveCourseLink(session.token, { ...course, ...r });
    if (res.ok) { setMsg(r.fpsQrPayload ? `已儲存「${course.title}」收費 QR ✓ 成員系統已可顯示` : `已移除「${course.title}」收費 QR ✓`); await load(session); }
    else setError(res.error || '儲存 QR 失敗');
    setFpsSaving(false);
  }

  function startEdit(l: CourseLink) {
    setEditingId(l.courseId);
    setDraft({ ...EMPTY, ...l });
    setMsg('');
  }
  function reset() { setEditingId(''); setDraft(EMPTY); setMsg(''); }
  function set(k: keyof CourseLink, v: string) { setDraft(d => ({ ...d, [k]: v })); }

  /** 📥 由訓練班 Sheet 讀取：經該班收表 Script profile API 自動帶入課程資料 */
  async function pullFromSheet() {
    if (!session) return;
    setError(''); setMsg('');
    const req = {
      ...(editingId ? { courseId: editingId } : {}),
      scriptExecUrl: (draft.scriptExecUrl || '').trim(),
      scriptApiKey: (draft.scriptApiKey || '').trim(),
    };
    if (!req.scriptExecUrl && !editingId) { setError('請先貼上「收表 Script /exec 網址」'); return; }
    setPulling(true);
    const r = await api.pullCourseProfile(session.token, req);
    setPulling(false);
    if (!r.ok || !r.data) { setError(r.error || '讀取失敗'); return; }
    const p: CourseProfile = r.data;
    const shown = (p.sessions || []).filter(s => s.showOnCircular);
    const sess = shown.length ? shown : (p.sessions || []);
    const sessionsText = sess.map(s => [s.displayDate || s.date, s.displayTime || s.time, s.displayVenue || s.venue].filter(Boolean).join(' ').trim()).filter(Boolean).join('；');
    const venues = Array.from(new Set(sess.map(s => (s.displayVenue || s.venue || '').trim()).filter(Boolean))).join('、');
    const leader = p.leader || (p.staff || [])[0];
    const contact = leader ? [((leader.name || '') + (leader.title || '')).trim() + (leader.role ? `（${leader.role}）` : ''), leader.phone || '', leader.email || ''].filter(x => x.trim()).join(' ') : '';
    setDraft(d => ({
      ...d,
      title: p.courseName || d.title,
      badgeName: p.badge || d.badgeName,
      section: p.section || d.section,
      fee: p.fee !== undefined && String(p.fee) !== '' ? String(p.fee) : d.fee,
      quota: p.quota !== undefined && String(p.quota) !== '' ? String(p.quota) : d.quota,
      deadline: p.deadline || d.deadline,
      venue: venues || d.venue,
      sessionsText: sessionsText || d.sessionsText,
      contact: contact || d.contact,
    }));
    setMsg(`已由訓練班 Sheet 帶入「${p.courseName || ''}」資料 ✓（請檢查後儲存）`);
  }

  async function save() {
    if (!session) return;
    setError(''); setMsg('');
    if (!draft.courseId.trim() || !draft.title.trim()) { setError('課程代碼與名稱必填'); return; }
    const r = await api.saveCourseLink(session.token, draft);
    if (r.ok) { setMsg('已儲存 ✓'); reset(); await load(session); }
    else setError(r.error || '儲存失敗');
  }
  async function remove(l: CourseLink) {
    if (!session) return;
    if (!confirm(`確定刪除課程「${l.title}」？`)) return;
    setError(''); setMsg('');
    const r = await api.deleteCourseLink(session.token, l.courseId);
    if (r.ok) { setMsg('已刪除 ✓'); reset(); await load(session); }
    else setError(r.error || '刪除失敗');
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🎓 訓練班管理</h1>
      <p className="page-sub">開班登記：ADC 下載模版交班領導人（CL）開工作簿填資料＋做通告 → 區總監批 → 你喺呢度一鍵讀取開班（唔使重打）。每班 1 張專屬 Sheet + 1 份 Script + 1 個 Drive 資料夾。</p>
      {error && <div className="err">{error}</div>}
      {msg && <div className="success">✓ {msg}</div>}

      {/* 開班前：下載收表 Script 模版 + 教學 */}
      <section className="info-card" style={{ borderLeft: '4px solid #7c3aed' }}>
        <div className="section-head">
          <div><h3>🚀 開班前：下載收表 Script 模版 + 教學</h3></div>
        </div>
        <p style={{ margin: '4px 0 12px', fontSize: 13.5 }}>
          每個訓練班要 1 本<b>獨立</b>嘅工作簿（同區會開班文件同一格式：Input01–04＋12 張 Print＋表格回應＋參數）。
          <b>ADC 下載模版交畀班領導人（CL，未必係區幹部）</b>→ CL 開 Sheet 貼 Script → CL 填訓練班資料＋做通告 →
          區總監審批 → CL 將通告 PDF 交網頁管理員上載 ＋ 將 /exec＋Key＋資料夾 ID 交返 ADC →
          ADC 返嚟呢度開班登記（資料<b>自動讀取，唔使重打</b>）→ 去「📜 區通告」記錄通告＋回填連結。
          儲存（啟用）後，<b>該班會即時掛上成員系統</b>俾成員用內置報名表報名。
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
          <a className="btn-sm" href="/downloads/Code.gs.course.js.txt" download="Code.gs.course.js" style={{ textDecoration: 'none', display: 'inline-block' }}>
            📥 下載收表 Script 模版（Code.gs.course.js）
          </a>
          <a className="mini-btn" href="/downloads/Code.gs.course.js.txt" target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'inline-block' }}>👀 預覽模版內容</a>
        </div>
        <ol style={{ margin: 0, paddingLeft: 22, fontSize: 13.5, lineHeight: 1.9 }}>
          <li><b>📥 下載＋交 CL</b>：ADC 撳上面下載模版，交畀班領導人（CL）。CL 未必係區幹部，入唔到呢個系統唔緊要，工作簿嗰邊搞掂。</li>
          <li><b>📄 CL 開空白 Sheet</b>：CL（或 ADC 代勞）喺 Google Drive 開一張全新嘅 Google Sheet（該班專用）。</li>
          <li><b>🧩 貼上模版</b>：擴充功能 → Apps Script → 將模版<b>整份覆蓋貼上</b> → 儲存。</li>
          <li><b>⚙️ RUN SETUP</b>：執行 <code>setupCourseSheet()</code>（首次授權：Review permissions → Advanced → Allow）。
            會自動建立齊同開班文件一樣嘅分頁、產生該班 <b>API Key</b>（只顯示一次，即刻複製）、並喺 Drive 建立「入數紙」資料夾（彈窗會顯示<b>網址 + ID</b>）。⚠️ 只限全新空白表，重跑會清空！</li>
          <li><b>🚀 部署</b>：部署 → 新增部署 → 網頁應用程式（執行身分：我自己；存取：任何人）→ 複製 <code>/exec</code> 網址 → 將 <b>/exec＋API Key＋資料夾 ID</b> 交返 ADC。</li>
          <li><b>✍️ CL 填一次</b>：CL 照工作簿「使用說明」填 Input01→Input02→Input03（大半自動帶入，✓上通告剔要出通告嘅節次）→ 檢查 <b>Print_通告</b>（標題／節數／名額／截止／報名辦法／查詢已自動帶入，補參加資格／費用／服裝／備註）→ 交<b>區總監審批</b> → 列印 PDF 交網頁管理員上載區網。</li>
          <li><b>📝 返嚟開班登記</b>：喺下面表單貼上：
            <ul style={{ margin: '4px 0', paddingLeft: 22 }}>
              <li><b>收表 Script /exec 網址</b> → 「收表 Script /exec 網址」欄</li>
              <li><b>該班 API Key</b> → 「該班 API Key」欄</li>
              <li><b>入數紙 Drive 資料夾 ID</b> → 「入數紙 Drive 資料夾 ID」欄</li>
            </ul>
            然後撳「📥 由訓練班 Sheet 讀取」—— 名稱／名額／收費／日期場地／截止／聯絡等會由 Input01／Input02 自動帶入，唔使再人手重打。
          </li>
          <li><b>📢 掛班上成員系統</b>：確認「啟用」✔ → 撳「＋ 開班登記」儲存。
            儲存後，<b>成員系統會即時顯示呢個班，成員即可用內置報名表報名</b>；截止日一過會自動收埋。
            之後去「📜 區通告」開通告記錄（掛接呢個班 → 「⬇ 從訓練班帶入資料」連通告內文都預填埋，補編號就得）。
            通告 PDF 上載區網後，將連結貼入「通告連結 noticeUrl」並儲存，成員即可跳轉睇真通告。</li>
        </ol>
      </section>


      {/* 開班 / 編輯表單 */}
      <section className="info-card">
        <div className="section-head">
          <div><h3>{editingId ? `編輯：${draft.title}` : '＋ 開新訓練班'}</h3></div>
          {editingId && <button className="mini-btn" onClick={reset}>取消編輯</button>}
        </div>
        <div className="account-form" style={{ flexWrap: 'wrap', display: 'flex', gap: 8 }}>
          <input placeholder="課程代碼 courseId *" value={draft.courseId} onChange={e => set('courseId', e.target.value)} disabled={!!editingId} style={{ width: 150 }} />
          <input placeholder="課程名稱 *" value={draft.title} onChange={e => set('title', e.target.value)} style={{ width: 220 }} />
          <input placeholder="徽章名稱 badgeName" value={draft.badgeName || ''} onChange={e => set('badgeName', e.target.value)} style={{ width: 150 }} />
          <input placeholder="支部 section（童軍/幼童軍…）" value={draft.section || ''} onChange={e => set('section', e.target.value)} style={{ width: 170 }} />
          <input placeholder="課程編號 courseNo" value={draft.courseNo || ''} onChange={e => set('courseNo', e.target.value)} style={{ width: 130 }} />
          <input placeholder="費用 fee" value={draft.fee || ''} onChange={e => set('fee', e.target.value)} style={{ width: 100 }} />
          <input placeholder="原價 originalFee" value={draft.originalFee || ''} onChange={e => set('originalFee', e.target.value)} style={{ width: 100 }} />
          <input placeholder="截止 deadline" value={draft.deadline || ''} onChange={e => set('deadline', e.target.value)} style={{ width: 150 }} />
          <input placeholder="名額 quota" value={draft.quota || ''} onChange={e => set('quota', e.target.value)} style={{ width: 100 }} />
          <input placeholder="場地 venue" value={draft.venue || ''} onChange={e => set('venue', e.target.value)} style={{ width: 150 }} />
          <input placeholder="通告連結 noticeUrl" value={draft.noticeUrl || ''} onChange={e => set('noticeUrl', e.target.value)} style={{ width: 300 }} />
          <input placeholder="聯絡 contact" value={draft.contact || ''} onChange={e => set('contact', e.target.value)} style={{ width: 200 }} />
          <input placeholder="節數 sessionsText（自動帶入，可改）" value={draft.sessionsText || ''} onChange={e => set('sessionsText', e.target.value)} style={{ width: 340 }} />
          <input placeholder="參加資格 eligibility" value={draft.eligibility || ''} onChange={e => set('eligibility', e.target.value)} style={{ width: 220 }} />
          <input placeholder="資助說明 subsidyNote" value={draft.subsidyNote || ''} onChange={e => set('subsidyNote', e.target.value)} style={{ width: 220 }} />
        </div>
        <div className="account-form" style={{ flexWrap: 'wrap', display: 'flex', gap: 8, marginTop: 8 }}>
          <input placeholder="收表 Script /exec 網址 *" value={draft.scriptExecUrl || ''} onChange={e => set('scriptExecUrl', e.target.value)} style={{ width: 360 }} />
          <input placeholder="該班 API Key（開班時顯示一次）" value={draft.scriptApiKey || ''} onChange={e => set('scriptApiKey', e.target.value)} style={{ width: 220 }} />
          <input placeholder="入數紙 Drive 資料夾 ID" value={draft.driveFolderId || ''} onChange={e => set('driveFolderId', e.target.value)} style={{ width: 220 }} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={String(draft.active).toUpperCase() !== 'FALSE'} onChange={e => set('active', e.target.checked ? 'TRUE' : 'FALSE')} />
            啟用
          </label>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-sm" onClick={save}>{editingId ? '💾 儲存變更' : '＋ 開班登記'}</button>
          <button className="mini-btn" onClick={pullFromSheet} disabled={pulling || (!draft.scriptExecUrl?.trim() && !editingId)}>
            {pulling ? '讀取中…' : '📥 由訓練班 Sheet 讀取'}
          </button>
        </div>
      </section>

      {/* 課程列表 */}
      <section className="info-card">
        <div className="section-head"><div><h3>現有訓練班 <small>({links.length})</small></h3></div></div>
        {loading ? <div className="small-loading">載入中…</div> : links.length === 0 ? (
          <p className="empty">尚未有訓練班。用上方表單開班登記。</p>
        ) : (
          <table className="mtx-scroll" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 13 }}>
                <th>課程</th><th>支部</th><th>費用</th><th>收費 QR</th><th>截止</th><th>Script</th><th>Drive</th><th>狀態</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {links.map(l => (
                <Fragment key={l.courseId}>
                  <tr style={{ borderBottom: fpsCourseId === l.courseId ? 'none' : '1px solid #eee', fontSize: 13 }}>
                    <td><b>{l.title}</b><br /><small className="rcode">{l.courseId}</small>{l.courseNo && <small className="rcode" style={{ marginLeft: 4 }}>{l.courseNo}</small>}</td>
                    <td>{l.section || '—'}</td>
                    <td>{l.fee || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {l.fpsQrPayload
                        ? <span className="state on" title={`HK$ ${l.fpsAmount} · ${l.fpsReference || ''}`}>✅ HK$ {l.fpsAmount}</span>
                        : <span className="state off">未生成</span>}
                    </td>
                    <td>{l.deadline || '—'}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.scriptExecUrl ? '✅ 已設定' : '⚠️ 未設定'}
                    </td>
                    <td>{l.driveFolderId ? '✅' : '⚠️'}</td>
                    <td>{String(l.active).toUpperCase() !== 'FALSE' ? <span className="state on">啟用</span> : <span className="state off">停用</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="mini-btn" onClick={() => setFpsCourseId(fpsCourseId === l.courseId ? '' : l.courseId)}>
                        {fpsCourseId === l.courseId ? '收起 QR' : '💳 收費 QR'}
                      </button>{' '}
                      <button className="mini-btn" onClick={() => startEdit(l)}>編輯</button>{' '}
                      <button className="mini-btn danger" onClick={() => remove(l)}>刪除</button>
                    </td>
                  </tr>
                  {fpsCourseId === l.courseId && (
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      <td colSpan={9} style={{ padding: '4px 0 14px' }}>
                        <CourseFpsBlock course={l} account={account} saving={fpsSaving} onSave={r => saveCourseFps(l, r)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <BackBar />
    </>
  );
}
