'use client';
/**
 * 🚨 意外／應變
 * ─────────────────────────────────────────────────────────────────────
 * 分頁 1 即時應變：活動出事時，領袖打開即知道點做（情境卡 + 電話通報清單 + 天氣對照表 + 熱線）
 * 分頁 2 完整指引：香港童軍總會官方通告／表格全部連結
 * 分頁 3 意外報告：手機直接填總會行政署「意外報告」(ACC-RPT 2019/07)；
 *        草稿只存本機（localStorage），按「確定提交」先送後台；可依官方兩頁版面列印。
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { useDistrict } from '@/lib/useDistrict';
import type { IncidentReport, IncidentTimelineRow, UserSession } from '@/lib/types';
import {
  HOTLINES, OFFICIAL_DOCS, PHONE_REPORT_ITEMS, PRE_TRIP_CHECKLIST, SCENARIOS, WEATHER_NOTE, WEATHER_TABLE,
} from '@/lib/incidentGuide';
import { downloadIncidentHtml, openIncidentPrint, parseRows } from '@/lib/incidentPrint';

type Tab = 'now' | 'docs' | 'report';
const TABS: { id: Tab; label: string }[] = [
  { id: 'now', label: '🚨 即時應變' },
  { id: 'docs', label: '📚 完整指引' },
  { id: 'report', label: '📝 意外報告' },
];
const OPS_ROLES = ['DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING', 'STAFF'];

const EMPTY_ROWS = (n: number): IncidentTimelineRow[] => Array.from({ length: n }, () => ({ when: '', text: '' }));
const EMPTY_REPORT: IncidentReport = {
  accidentDate: '', accidentTime: '', activityName: '', place: '', organiser: '', injuryPart: '', injuryType: '',
  injuredNameZh: '', injuredNameEn: '', scoutId: '', hkid: '', age: '', sex: '', phone: '', email: '', address: '', unit: '', position: '',
  guardianName: '', guardianRelation: '', guardianPhone: '', guardianEmail: '',
  ambulanceCalled: '', ambCallerName: '', ambCallerPhone: '', ambCallerUnit: '', ambCallerPosition: '', ambCallTime: '', ambArriveTime: '',
  hospital: '', hospitalStay: '', hospitalDays: '', escortName: '', escortPhone: '', escortUnit: '', escortPosition: '',
  policeReported: '', policeStation: '', policeCaseNo: '',
  hasWitness: '', witnessName: '', witnessPhone: '', witnessSex: '', witnessAddress: '', witnessUnit: '', witnessPosition: '',
  witness2Name: '', witness2Phone: '', witness2Sex: '', witness2Address: '', witness2Unit: '', witness2Position: '',
  details: '', followUps: '',
  reporterName: '', reporterPosition: '', reporterUnit: '', reporterDate: '', reporterPhone: '', reporterEmail: '',
  supervisorReceivedDate: '', supervisorUnit: '', supervisorDate: '', supervisorName: '', supervisorRemark: '',
  serious: 'FALSE',
};

type Draft = { report: IncidentReport; details: IncidentTimelineRow[]; followUps: IncidentTimelineRow[]; savedAt: string };
const draftKey = (code: string) => `portal_incident_draft_${code || 'default'}`;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtDT(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function IncidentPage() {
  const router = useRouter();
  const { withDistrict, districtCode, district } = useDistrict();
  const session = useRequireCard('incident');
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(initialTab && TABS.some(x => x.id === initialTab) ? initialTab : 'now');

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <span className="backlink" onClick={() => router.push(withDistrict('/'))}>← 返回主控台</span>
      <h1 className="page-title">🚨 意外／應變</h1>
      <p className="page-sub">依香港童軍總會通告整理：出事即刻知道點做 → 查官方指引 → 手機直接填「意外報告」並依總會格式列印。</p>

      <div className="inc-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`inc-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'now' && <NowTab />}
      {tab === 'docs' && <DocsTab />}
      {tab === 'report' && <ReportTab session={session} districtCode={districtCode || ''} districtName={district?.name || ''} />}
    </>
  );
}

/* ───────────────────────── 分頁 1：即時應變 ───────────────────────── */
function NowTab() {
  const [open, setOpen] = useState<string>('injury');
  return (
    <>
      <div className="inc-alert">
        <b>先救人 → 999 → 通知家長 → 即時致電所屬總監 → 7 個工作天內交意外報告。</b>
        <span>嚴重傷亡：3 個工作天內通知總會行政署。現場任何人不得向傳媒發言。</span>
      </div>

      <div className="inc-scen-grid">
        {SCENARIOS.map(s => (
          <button key={s.id} className={`inc-scen ${open === s.id ? 'on' : ''}`} onClick={() => setOpen(open === s.id ? '' : s.id)}>
            <span className="ico">{s.icon}</span>
            <b>{s.title}</b>
            <small>{s.summary}</small>
          </button>
        ))}
      </div>

      {SCENARIOS.filter(s => s.id === open).map(s => (
        <section key={s.id} className="info-card inc-detail">
          <div className="section-head">
            <div><h3>{s.icon} {s.title}</h3><p>出處：{s.source}</p></div>
          </div>
          <ol className="inc-steps">
            {s.steps.map((st, i) => (
              <li key={i} className={st.hot ? 'hot' : ''}>
                <span>{st.t}</span>
                {st.d && <small>{st.d}</small>}
              </li>
            ))}
          </ol>
          {s.reportItems && (
            <div className="inc-callbox">
              <b>📞 致電總監時要講齊（活動指引通告 02/2021）</b>
              <ul>{s.reportItems.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {s.deadlines && (
            <div className="inc-deadlines">
              {s.deadlines.map((d, i) => <span key={i}>⏱ {d}</span>)}
            </div>
          )}
        </section>
      ))}

      <section className="info-card">
        <div className="section-head"><div><h3>🌦 天氣警告對照表（青少年活動；活動開始前 3 小時起計）</h3><p>活動指引通告 04/2018 表一</p></div></div>
        <div className="mtx-scroll">
          <table className="perm-table inc-weather">
            <thead><tr><th style={{ textAlign: 'left' }}>警告</th><th>戶內活動</th><th>戶外活動</th><th>海上活動</th></tr></thead>
            <tbody>
              {WEATHER_TABLE.map(w => (
                <tr key={w.warning}>
                  <td style={{ textAlign: 'left', fontWeight: 700 }}>{w.warning}</td>
                  <td className={cellClass(w.indoor)}>{w.indoor}</td>
                  <td className={cellClass(w.outdoor)}>{w.outdoor}</td>
                  <td className={cellClass(w.sea)}>{w.sea}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fps-help">{WEATHER_NOTE}</p>
      </section>

      <div className="inc-two">
        <section className="info-card">
          <div className="section-head"><div><h3>☎️ 緊急熱線</h3></div></div>
          <ul className="inc-hotlines">
            {HOTLINES.map(h => (
              <li key={h.tel}><a href={`tel:${h.tel.replace(/\s/g, '')}`}>{h.tel}</a><div><b>{h.name}</b>{h.note && <small>{h.note}</small>}</div></li>
            ))}
            <li><span className="inc-tel-custom">區總監</span><div><b>請把所屬總監電話存入手機</b><small>出發前確認可致電；本系統不儲存個人電話</small></div></li>
          </ul>
        </section>
        <section className="info-card">
          <div className="section-head"><div><h3>✅ 出發前檢查</h3><p>05/2018 戶外安全 · 4/2014 幼童軍戶外 · 03/2021 先鋒工程</p></div></div>
          <ul className="inc-check">{PRE_TRIP_CHECKLIST.map((c, i) => <li key={i}><label><input type="checkbox" /> <span>{c}</span></label></li>)}</ul>
        </section>
      </div>
    </>
  );
}
function cellClass(v: string) {
  if (/取消|中止|延期/.test(v)) return 'w-cancel';
  if (/暫避|留意|減少|保暖|補水|改戶內/.test(v)) return 'w-warn';
  if (/如常/.test(v)) return 'w-ok';
  return '';
}

/* ───────────────────────── 分頁 2：完整指引 ───────────────────────── */
function DocsTab() {
  const groups = useMemo(() => {
    const order: string[] = [];
    const map: Record<string, typeof OFFICIAL_DOCS> = {};
    OFFICIAL_DOCS.forEach(d => { if (!map[d.group]) { map[d.group] = []; order.push(d.group); } map[d.group].push(d); });
    return order.map(g => ({ group: g, docs: map[g] }));
  }, []);
  return (
    <>
      <p className="fps-notice">ℹ️ 以下全部為香港童軍總會官方 PDF（scout.org.hk）。總會如有更新，以總會網站最新版為準；本頁「即時應變」摘要只作現場快速參考。</p>
      {groups.map(g => (
        <section key={g.group} className="info-card">
          <div className="section-head"><div><h3>{g.group}</h3></div></div>
          <ul className="inc-docs">
            {g.docs.map(d => (
              <li key={d.url}>
                <a href={d.url} target="_blank" rel="noopener noreferrer">
                  <b>{d.title}</b><span className="rcode">{d.ref}</span>
                </a>
                {d.note && <small>{d.note}</small>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/* ───────────────────────── 分頁 3：意外報告 ───────────────────────── */
function ReportTab({ session, districtCode, districtName }: { session: UserSession; districtCode: string; districtName: string }) {
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [openId, setOpenId] = useState('');
  const [busy, setBusy] = useState(false);
  const isOps = OPS_ROLES.includes(session.role) || session.isAdmin;

  // 草稿：只存本機
  const [r, setR] = useState<IncidentReport>(EMPTY_REPORT);
  const [details, setDetails] = useState<IncidentTimelineRow[]>(EMPTY_ROWS(3));
  const [follow, setFollow] = useState<IncidentTimelineRow[]>(EMPTY_ROWS(2));
  const [draftSavedAt, setDraftSavedAt] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const res = await api.listIncidentReports(session.token);
    if (res.ok && res.data) setReports(res.data);
    else setError(res.error || '無法載入意外報告（請確認後台已升級至 v4.3.0 並重跑 setupSheets）');
    setLoading(false);
  }, [session.token]);
  useEffect(() => { load(); }, [load]);

  // 讀本機草稿
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(districtCode));
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      if (d?.report) { setR({ ...EMPTY_REPORT, ...d.report }); setDetails(d.details?.length ? d.details : EMPTY_ROWS(3)); setFollow(d.followUps?.length ? d.followUps : EMPTY_ROWS(2)); setDraftSavedAt(d.savedAt || ''); }
    } catch { /* ignore */ }
  }, [districtCode]);

  function set<K extends keyof IncidentReport>(k: K, v: IncidentReport[K]) { setR(x => ({ ...x, [k]: v })); setDirty(true); }
  function saveDraft(silent = false) {
    const savedAt = new Date().toISOString();
    const d: Draft = { report: r, details, followUps: follow, savedAt };
    try { localStorage.setItem(draftKey(districtCode), JSON.stringify(d)); setDraftSavedAt(savedAt); setDirty(false); if (!silent) setMsg('草稿已儲存喺此裝置（未送後台）'); }
    catch { setError('此裝置無法儲存草稿（儲存空間已滿或私隱模式）'); }
  }
  function clearDraft() {
    if (!confirm('清除本機草稿？（已提交嘅報告唔受影響）')) return;
    localStorage.removeItem(draftKey(districtCode));
    setR(EMPTY_REPORT); setDetails(EMPTY_ROWS(3)); setFollow(EMPTY_ROWS(2)); setDraftSavedAt(''); setDirty(false); setStep(0);
  }
  function startNew() {
    setMode('form'); setMsg(''); setError('');
    if (!r.accidentDate) set('accidentDate', todayStr());
    if (!r.accidentTime) set('accidentTime', nowTime());
    if (!r.reporterDate) set('reporterDate', todayStr());
    if (!r.reporterName) set('reporterName', session.displayName || '');
  }
  const draftReport = (): IncidentReport => ({
    ...r,
    details: JSON.stringify(details.filter(x => x.when || x.text)),
    followUps: JSON.stringify(follow.filter(x => x.when || x.text)),
  });

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!r.accidentDate) m.push('意外發生日期');
    if (!r.activityName?.trim()) m.push('活動名稱');
    if (!r.injuredNameZh?.trim() && !r.injuredNameEn?.trim()) m.push('傷者姓名');
    if (!r.reporterName?.trim()) m.push('活動負責人姓名');
    return m;
  }, [r]);

  async function submit() {
    if (missing.length) { setError('請先填妥：' + missing.join('、')); setConfirming(false); return; }
    setBusy(true); setError(''); setMsg('');
    const res = await api.submitIncidentReport(session.token, draftReport());
    setBusy(false); setConfirming(false);
    if (res.ok) {
      const ref = res.data?.refCode || '';
      localStorage.removeItem(draftKey(districtCode));
      setR(EMPTY_REPORT); setDetails(EMPTY_ROWS(3)); setFollow(EMPTY_ROWS(2)); setDraftSavedAt(''); setDirty(false); setStep(0);
      setMsg(`已提交 ✓ 編號 ${ref}。請列印正本簽署，7 個工作天內經單位主管轉交總會行政署。`);
      setMode('list'); await load(); setOpenId(res.data?.id || '');
    } else setError(res.error || '提交失敗，草稿仍保留喺此裝置');
  }
  async function remove(x: IncidentReport) {
    if (!x.id || !confirm(`確定刪除意外報告 ${x.refCode}？（不可復原）`)) return;
    setBusy(true); const res = await api.deleteIncidentReport(session.token, x.id); setBusy(false);
    if (res.ok) { setMsg('已刪除 ✓'); await load(); } else setError(res.error || '刪除失敗');
  }
  async function markReviewed(x: IncidentReport) {
    if (!x.id) return;
    const name = prompt('單位主管姓名（會寫入「童軍單位主管專用」欄）', x.supervisorName || session.displayName || '');
    if (name === null) return;
    setBusy(true);
    const res = await api.updateIncidentReport(session.token, x.id, {
      status: 'reviewed', supervisorName: name, supervisorDate: todayStr(),
      supervisorReceivedDate: x.supervisorReceivedDate || todayStr(), supervisorUnit: x.supervisorUnit || districtName,
    });
    setBusy(false);
    if (res.ok) { setMsg('已記錄單位主管省閱 ✓'); await load(); } else setError(res.error || '更新失敗');
  }
  function printReport(x: IncidentReport) {
    if (!openIncidentPrint(x, { districtName })) { downloadIncidentHtml(x, { districtName }); setMsg('瀏覽器攔截咗彈出視窗，已改為下載 HTML，開啟後再列印。'); }
  }

  const steps = ['基本資料', '傷者資料', '救護／送院／報案', '目擊者', '意外詳情', '跟進及負責人'];

  return (
    <>
      {error && <div className="err">{error}</div>}
      {msg && <div className="success">✓ {msg}</div>}

      {mode === 'list' && (
        <>
          <div className="toolbar">
            <button className="btn-sm" onClick={startNew}>＋ 填寫意外報告{draftSavedAt ? '（續填草稿）' : ''}</button>
            {draftSavedAt && <span className="inc-draft-pill">📱 本機草稿 {fmtDT(draftSavedAt)}</span>}
            <a className="admin-btn" href="https://www.scout.org.hk/article_attach/631/ACC-RPT201907c.pdf" target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto' }}>官方表格 PDF ↗</a>
          </div>
          <section className="info-card">
            <div className="section-head"><div><h3>已提交報告 <small>({reports.length})</small></h3><p>資料保密，只供內部使用；未獲總會及保險公司同意，不得發放予其他人（包括傷者）。</p></div></div>
            {loading ? <div className="small-loading">載入中…</div> : reports.length === 0 ? <p className="empty">暫無意外報告。</p> : (
              <div className="inc-list">
                {reports.map(x => (
                  <Fragment key={x.id}>
                    <div className={`inc-row ${openId === x.id ? 'on' : ''}`} onClick={() => setOpenId(openId === x.id ? '' : x.id || '')}>
                      <div className="inc-row-main">
                        <b>{x.activityName}</b>
                        <span>{x.accidentDate} {x.accidentTime} · {x.place}</span>
                        <span>傷者：{x.injuredNameZh || x.injuredNameEn}{x.injuryPart ? ` · ${x.injuryPart}／${x.injuryType}` : ''}</span>
                      </div>
                      <div className="inc-row-side">
                        {x.serious === 'TRUE' && <span className="status-pill" style={{ background: '#c62828' }}>嚴重</span>}
                        <span className="status-pill" style={{ background: x.status === 'reviewed' ? '#2e7d32' : '#1565c0' }}>{x.status === 'reviewed' ? '主管已省閱' : '已提交'}</span>
                        <small className="rcode">{x.refCode}</small>
                      </div>
                    </div>
                    {openId === x.id && (
                      <div className="inc-row-detail">
                        <dl>
                          <dt>舉辦單位</dt><dd>{x.organiser || '—'}</dd>
                          <dt>傷者單位／職位</dt><dd>{x.unit || '—'}{x.position ? ` · ${x.position}` : ''}</dd>
                          <dt>救護車</dt><dd>{x.ambulanceCalled || '—'}{x.ambulanceCalled === '有' ? `（${x.ambCallTime} 召／${x.ambArriveTime} 到）` : ''}</dd>
                          <dt>醫院／診所</dt><dd>{x.hospital || '—'}{x.hospitalStay ? ` · ${x.hospitalStay}${x.hospitalStay === '留院' ? `（${x.hospitalDays} 天）` : ''}` : ''}</dd>
                          <dt>報案</dt><dd>{x.policeReported || '—'}{x.policeReported === '是' ? ` · ${x.policeStation} ${x.policeCaseNo}` : ''}</dd>
                          <dt>負責人</dt><dd>{x.reporterName} · {x.reporterPosition} · {x.reporterPhone}</dd>
                          <dt>提交</dt><dd>{fmtDT(x.submittedAt)} · {x.submittedBy}</dd>
                        </dl>
                        {parseRows(x.details).length > 0 && (
                          <div className="inc-mini-tl"><b>意外詳情</b>{parseRows(x.details).map((d, i) => <div key={i}><span>{d.when}</span>{d.text}</div>)}</div>
                        )}
                        {parseRows(x.followUps).length > 0 && (
                          <div className="inc-mini-tl"><b>跟進工作</b>{parseRows(x.followUps).map((d, i) => <div key={i}><span>{d.when}</span>{d.text}</div>)}</div>
                        )}
                        <div className="inc-row-actions">
                          <button className="btn-sm" onClick={() => printReport(x)}>🖨 列印／PDF（總會格式）</button>
                          {isOps && x.status !== 'reviewed' && <button className="mini-btn" disabled={busy} onClick={() => markReviewed(x)}>✔ 單位主管已省閱</button>}
                          {isOps && <button className="mini-btn danger" disabled={busy} onClick={() => remove(x)}>刪除</button>}
                        </div>
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {mode === 'form' && (
        <>
          <div className="inc-form-bar">
            <button className="mini-btn" onClick={() => { if (dirty) saveDraft(true); setMode('list'); }}>← 返回列表</button>
            <span className="inc-draft-pill">{dirty ? '✏️ 有未儲存修改' : draftSavedAt ? `📱 草稿已存本機 ${fmtDT(draftSavedAt)}` : '📱 草稿只會存喺此裝置'}</span>
            <button className="mini-btn" onClick={() => saveDraft()}>💾 儲存草稿</button>
            <button className="mini-btn danger" onClick={clearDraft}>清除草稿</button>
          </div>
          <p className="fps-notice">ℹ️ 呢份表 = 總會行政署「意外報告」(2019/07)。填寫期間只會存喺你部機；<b>按最底「確定提交」先會送去區後台</b>。提交後可依官方兩頁格式列印簽署。</p>

          <div className="inc-steps-nav">
            {steps.map((s, i) => <button key={s} className={`inc-step ${step === i ? 'on' : ''}`} onClick={() => setStep(i)}>{i + 1}. {s}</button>)}
          </div>

          {step === 0 && (
            <section className="info-card inc-form">
              <h3>基本資料</h3>
              <div className="inc-grid">
                <label>意外發生日期 *<input type="date" value={r.accidentDate} onChange={e => set('accidentDate', e.target.value)} /></label>
                <label>時間<input type="time" value={r.accidentTime} onChange={e => set('accidentTime', e.target.value)} /></label>
                <label className="full">活動名稱 *<input value={r.activityName} onChange={e => set('activityName', e.target.value)} placeholder="例：第 X 旅 週年露營" /></label>
                <label className="full">意外地點<input value={r.place} onChange={e => set('place', e.target.value)} /></label>
                <label className="full">舉辦單位（中文）<input value={r.organiser} onChange={e => set('organiser', e.target.value)} placeholder={districtName ? `例：${districtName} / 第 X 旅` : '例：XX 區 / 第 X 旅'} /></label>
                <label>受傷部位（如：右腳等）<input value={r.injuryPart} onChange={e => set('injuryPart', e.target.value)} /></label>
                <label>傷勢（如：骨折等）<input value={r.injuryType} onChange={e => set('injuryType', e.target.value)} placeholder="可填多於一項" /></label>
                <label className="full inc-checkline"><input type="checkbox" checked={r.serious === 'TRUE'} onChange={e => set('serious', e.target.checked ? 'TRUE' : 'FALSE')} /> 涉及嚴重傷亡（須於 3 個工作天內通知總會行政署；提交時會加註「嚴重」）</label>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="info-card inc-form">
              <h3>傷者個人資料</h3>
              <div className="inc-grid">
                <label>姓名（中文）*<input value={r.injuredNameZh} onChange={e => set('injuredNameZh', e.target.value)} /></label>
                <label>姓名（英文）<input value={r.injuredNameEn} onChange={e => set('injuredNameEn', e.target.value)} /></label>
                <label className="full">童軍成員編號／委任證或委任書編號<input value={r.scoutId} onChange={e => set('scoutId', e.target.value)} /></label>
                <label>身份証／護照號碼（非童軍人士適用）<input value={r.hkid} onChange={e => set('hkid', e.target.value)} /></label>
                <label>年齡<input inputMode="numeric" value={r.age} onChange={e => set('age', e.target.value)} /></label>
                <Radio label="性別" value={r.sex} options={['男', '女']} onChange={v => set('sex', v)} />
                <label>聯絡電話<input inputMode="tel" value={r.phone} onChange={e => set('phone', e.target.value)} /></label>
                <label>電子郵件<input inputMode="email" value={r.email} onChange={e => set('email', e.target.value)} /></label>
                <label className="full">住址（中文）<input value={r.address} onChange={e => set('address', e.target.value)} /></label>
                <label>所屬單位／童軍旅<input value={r.unit} onChange={e => set('unit', e.target.value)} /></label>
                <label>職位<input value={r.position} onChange={e => set('position', e.target.value)} placeholder="例：童軍 / 旅長" /></label>
              </div>
              <h4>如傷者未滿 18 歲，請填寫以下資料</h4>
              <div className="inc-grid">
                <label>家長／監護人姓名（中文）<input value={r.guardianName} onChange={e => set('guardianName', e.target.value)} /></label>
                <label>與傷者關係<input value={r.guardianRelation} onChange={e => set('guardianRelation', e.target.value)} /></label>
                <label>聯絡電話<input inputMode="tel" value={r.guardianPhone} onChange={e => set('guardianPhone', e.target.value)} /></label>
                <label>電子郵件<input inputMode="email" value={r.guardianEmail} onChange={e => set('guardianEmail', e.target.value)} /></label>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="info-card inc-form">
              <h3>救護車</h3>
              <Radio label="上述意外有否召救護車？" value={r.ambulanceCalled} options={['沒有', '有']} onChange={v => set('ambulanceCalled', v)} />
              {r.ambulanceCalled === '有' && (
                <div className="inc-grid">
                  <label>召救護車者姓名<input value={r.ambCallerName} onChange={e => set('ambCallerName', e.target.value)} /></label>
                  <label>聯絡電話<input inputMode="tel" value={r.ambCallerPhone} onChange={e => set('ambCallerPhone', e.target.value)} /></label>
                  <label>所屬單位／童軍旅<input value={r.ambCallerUnit} onChange={e => set('ambCallerUnit', e.target.value)} /></label>
                  <label>職位<input value={r.ambCallerPosition} onChange={e => set('ambCallerPosition', e.target.value)} /></label>
                  <label>召救護車時間<input type="time" value={r.ambCallTime} onChange={e => set('ambCallTime', e.target.value)} /></label>
                  <label>救護車到達時間<input type="time" value={r.ambArriveTime} onChange={e => set('ambArriveTime', e.target.value)} /></label>
                </div>
              )}
              <h3 style={{ marginTop: 16 }}>醫院／診所</h3>
              <div className="inc-grid">
                <label className="full">送抵醫院／診所名稱<input value={r.hospital} onChange={e => set('hospital', e.target.value)} /></label>
                <Radio label="住院情況" value={r.hospitalStay} options={['當日出院', '留院']} onChange={v => set('hospitalStay', v)} />
                {r.hospitalStay === '留院' && <label>留院天數<input inputMode="numeric" value={r.hospitalDays} onChange={e => set('hospitalDays', e.target.value)} /></label>}
                <label>陪同往醫院／診所者姓名<input value={r.escortName} onChange={e => set('escortName', e.target.value)} /></label>
                <label>聯絡電話<input inputMode="tel" value={r.escortPhone} onChange={e => set('escortPhone', e.target.value)} /></label>
                <label>所屬單位／童軍旅<input value={r.escortUnit} onChange={e => set('escortUnit', e.target.value)} /></label>
                <label>職位<input value={r.escortPosition} onChange={e => set('escortPosition', e.target.value)} /></label>
              </div>
              <h3 style={{ marginTop: 16 }}>報案</h3>
              <Radio label="上述意外是否已報案？" value={r.policeReported} options={['否', '是']} onChange={v => set('policeReported', v)} />
              {r.policeReported === '是' && (
                <div className="inc-grid">
                  <label>負責辦理之警署<input value={r.policeStation} onChange={e => set('policeStation', e.target.value)} /></label>
                  <label>報案編號<input value={r.policeCaseNo} onChange={e => set('policeCaseNo', e.target.value)} /></label>
                </div>
              )}
            </section>
          )}

          {step === 3 && (
            <section className="info-card inc-form">
              <h3>目擊者</h3>
              <Radio label="上述意外有否目擊者？" value={r.hasWitness} options={['沒有', '有']} onChange={v => set('hasWitness', v)} />
              {r.hasWitness === '有' && (
                <>
                  <h4>目擊者 1</h4>
                  <div className="inc-grid">
                    <label>姓名（中文）<input value={r.witnessName} onChange={e => set('witnessName', e.target.value)} /></label>
                    <label>聯絡電話<input inputMode="tel" value={r.witnessPhone} onChange={e => set('witnessPhone', e.target.value)} /></label>
                    <Radio label="性別" value={r.witnessSex} options={['男', '女']} onChange={v => set('witnessSex', v)} />
                    <label className="full">地址（中文）<input value={r.witnessAddress} onChange={e => set('witnessAddress', e.target.value)} /></label>
                    <label>所屬單位／童軍旅<input value={r.witnessUnit} onChange={e => set('witnessUnit', e.target.value)} /></label>
                    <label>職位<input value={r.witnessPosition} onChange={e => set('witnessPosition', e.target.value)} /></label>
                  </div>
                  <h4>目擊者 2（如有其他目擊者，請另紙填寫）</h4>
                  <div className="inc-grid">
                    <label>姓名（中文）<input value={r.witness2Name} onChange={e => set('witness2Name', e.target.value)} /></label>
                    <label>聯絡電話<input inputMode="tel" value={r.witness2Phone} onChange={e => set('witness2Phone', e.target.value)} /></label>
                    <Radio label="性別" value={r.witness2Sex} options={['男', '女']} onChange={v => set('witness2Sex', v)} />
                    <label className="full">地址（中文）<input value={r.witness2Address} onChange={e => set('witness2Address', e.target.value)} /></label>
                    <label>所屬單位／童軍旅<input value={r.witness2Unit} onChange={e => set('witness2Unit', e.target.value)} /></label>
                    <label>職位<input value={r.witness2Position} onChange={e => set('witness2Position', e.target.value)} /></label>
                  </div>
                </>
              )}
            </section>
          )}

          {step === 4 && (
            <section className="info-card inc-form">
              <h3>意外詳情（第二頁）</h3>
              <p className="fps-help">按時序逐行填：日期／時間 + 意外經過。列印時每行對應官方表格一行（超過會自動加行）。</p>
              <Timeline rows={details} onChange={rows => { setDetails(rows); setDirty(true); }} placeholder="意外經過" />
            </section>
          )}

          {step === 5 && (
            <section className="info-card inc-form">
              <h3>事發後之跟進工作</h3>
              <Timeline rows={follow} onChange={rows => { setFollow(rows); setDirty(true); }} placeholder="跟進工作（例：已通知家長／已電話通報區總監）" />
              <h3 style={{ marginTop: 18 }}>活動負責人／導師／本會有關單位職員</h3>
              <div className="inc-grid">
                <label>姓名（中文）*<input value={r.reporterName} onChange={e => set('reporterName', e.target.value)} /></label>
                <label>職位<input value={r.reporterPosition} onChange={e => set('reporterPosition', e.target.value)} /></label>
                <label>所屬單位／童軍旅<input value={r.reporterUnit} onChange={e => set('reporterUnit', e.target.value)} /></label>
                <label>日期<input type="date" value={r.reporterDate} onChange={e => set('reporterDate', e.target.value)} /></label>
                <label>聯絡電話<input inputMode="tel" value={r.reporterPhone} onChange={e => set('reporterPhone', e.target.value)} /></label>
                <label>電子郵件<input inputMode="email" value={r.reporterEmail} onChange={e => set('reporterEmail', e.target.value)} /></label>
              </div>
              <p className="fps-help">簽署欄留空，列印後由負責人親筆簽署。「童軍單位主管專用」一欄由單位主管收到正本後填寫（或在列表按「單位主管已省閱」記錄）。</p>

              <div className="inc-submit">
                {missing.length > 0 && <div className="err">仍未填：{missing.join('、')}</div>}
                <div className="inc-submit-actions">
                  <button className="btn-sm fps-secondary-btn" onClick={() => printReport(draftReport())}>🖨 預覽列印（草稿）</button>
                  <button className="btn-sm fps-secondary-btn" onClick={() => saveDraft()}>💾 儲存草稿（本機）</button>
                  <button className="btn-sm" disabled={busy || missing.length > 0} onClick={() => setConfirming(true)}>✅ 確定提交到後台</button>
                </div>
              </div>
            </section>
          )}

          <div className="inc-form-nav">
            <button className="mini-btn" disabled={step === 0} onClick={() => setStep(s => s - 1)}>← 上一步</button>
            <span>{step + 1} / {steps.length}</span>
            <button className="mini-btn" disabled={step === steps.length - 1} onClick={() => setStep(s => s + 1)}>下一步 →</button>
          </div>

          {confirming && (
            <div className="inc-modal" role="dialog" aria-modal="true">
              <div className="inc-modal-box">
                <h3>確定提交意外報告？</h3>
                <p>提交後會寫入區後台（IncidentReports）並電郵通知職員；本機草稿會清除。</p>
                <ul>
                  <li>活動：<b>{r.activityName}</b>　{r.accidentDate} {r.accidentTime}</li>
                  <li>傷者：<b>{r.injuredNameZh || r.injuredNameEn}</b>　{r.injuryPart}／{r.injuryType}</li>
                  <li>負責人：{r.reporterName}　{r.reporterPhone}</li>
                  {r.serious === 'TRUE' && <li style={{ color: '#c62828', fontWeight: 700 }}>★ 嚴重傷亡：3 個工作天內通知總會行政署</li>}
                </ul>
                <div className="inc-submit-actions">
                  <button className="btn-sm fps-secondary-btn" disabled={busy} onClick={() => setConfirming(false)}>返回修改</button>
                  <button className="btn-sm" disabled={busy} onClick={submit}>{busy ? '提交中…' : '確定提交'}</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Radio({ label, value, options, onChange }: { label: string; value?: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="inc-radio">
      <span>{label}</span>
      <div>
        {options.map(o => (
          <button key={o} type="button" className={`inc-opt ${value === o ? 'on' : ''}`} onClick={() => onChange(value === o ? '' : o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}

function Timeline({ rows, onChange, placeholder }: { rows: IncidentTimelineRow[]; onChange: (r: IncidentTimelineRow[]) => void; placeholder: string }) {
  function upd(i: number, k: keyof IncidentTimelineRow, v: string) { onChange(rows.map((r, j) => j === i ? { ...r, [k]: v } : r)); }
  return (
    <div className="inc-tl">
      {rows.map((row, i) => (
        <div key={i} className="inc-tl-row">
          <input value={row.when} onChange={e => upd(i, 'when', e.target.value)} placeholder="日期／時間" />
          <textarea value={row.text} onChange={e => upd(i, 'text', e.target.value)} placeholder={placeholder} rows={2} />
          <button type="button" className="mini-btn danger" onClick={() => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ when: '', text: '' }])} aria-label="刪除此行">✕</button>
        </div>
      ))}
      <button type="button" className="mini-btn" onClick={() => onChange([...rows, { when: '', text: '' }])}>＋ 加一行</button>
    </div>
  );
}
