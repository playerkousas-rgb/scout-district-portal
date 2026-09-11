'use client';
/**
 * ⭐ 新版流程指揮台（v4.17.0）— 訓練班系統先行（course repo 為起點）
 *
 * CL 喺訓練班 App 開班＋填晒 Input01/02/03＋通告 → 交「GS＋SCRIPT 網址」→ 呢邊接手：
 *   🔎 批核：一版睇晒（資料・節次・職員・預算 8 大類・通告要點）→ 改核心資料
 *      （職員表／時間表唔准改；每處改動記錄「原值 → 新值」標亮＋寫返 GS＋修訂紀錄）
 *      → ✔ 批准寫「區會批准」格 ＋ ✉ email 通知 CL（改動清單標亮，CL 可以 reply）
 *   📢 通告：批完由呢邊出（管理層話事，唔再煩 CL）→ 列印／存 PDF 交網頁管理員
 *      → 貼通告 URL 掛載（自動讀料＋啟用）→ ✉ 通知 CL 已上網
 *   💰 收款核對：報名截止後，對完區帳戶逐筆 tick（寫 AS–AU；CL 個 APP 即時見 💰✔）→ ✉ 摘要
 *   🎓 完成：CL 評核出證書後，呢邊睇完成報告統計＋列印
 *   🔗 連結：GS／Script／Key／Drive＋「俾 CL 嘅開班指引」（CourseFactory 網址＋開班碼）
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type {
  CourseChange, CourseLink, CourseOpsInfo, CoursePrintData, CourseRevision, CourseSetup,
  CourseSheetRaw, CoursePaymentRow, UserSession,
} from '@/lib/types';
import {
  budgetTotals, diffSetups, emptySetup, normDate, normalizeSetup, parseRawToPaymentRows,
  parseRawToPrints, parseRawToSetup,
} from '@/lib/course-setup';
import CourseSetupForm from './CourseSetupForm';
import CoursePrints from './CoursePrints';

interface Props {
  session: UserSession;
  links: CourseLink[];
  reloadLinks: () => Promise<void>;
  districtName: string;
  fpsAccount: { name: string; id: string };
  memberPortalUrl: string;
  courseTemplateSet: boolean;
}

type SubTab = 'review' | 'notice' | 'payment' | 'done' | 'connect';

const STATUS_LABEL: Record<string, string> = { approved: '已接納', rejected: '已拒絕', cancelled: '已取消', pending: '待批' };

/** 貼上文字抽網址／Key（CL 交嚟嘅嘢一格過貼晒都得） */
export function parseCoursePaste(text: string): { execUrl: string; apiKey: string; gsUrl: string } {
  const t = String(text || '');
  const exec = t.match(/https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/u);
  const gs = t.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+/u);
  let apiKey = '';
  const km = t.match(/\bck_[A-Za-z0-9]+/u) || t.match(/[?&]key=([\w-]+)/u);
  if (km) apiKey = km[1] || km[0];
  return { execUrl: exec ? exec[0] : '', apiKey, gsUrl: gs ? gs[0] : '' };
}

export default function CourseOpsTab({ session, links, reloadLinks, districtName, fpsAccount, memberPortalUrl }: Props) {
  const [courseId, setCourseId] = useState('');
  const [sub, setSub] = useState<SubTab>('review');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [raw, setRaw] = useState<CourseSheetRaw | null>(null);
  const [setup, setSetup] = useState<CourseSetup>(emptySetup());
  const [baseline, setBaseline] = useState<CourseSetup | null>(null);
  const [courseEmail, setCourseEmail] = useState('');
  const [baseCourseEmail, setBaseCourseEmail] = useState('');
  const [summaryOk, setSummaryOk] = useState(false);
  const [approveNote, setApproveNote] = useState('');
  const [emailChecked, setEmailChecked] = useState(true);

  const [payFilter, setPayFilter] = useState<'all' | 'unchecked' | 'checked' | 'approved'>('all');
  const [printsOpen, setPrintsOpen] = useState(false);
  const [opsInfo, setOpsInfo] = useState<CourseOpsInfo | null>(null);

  // ➕ 連結新班
  const [addOpen, setAddOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  const link = links.find(l => l.courseId === courseId);
  const revisions: CourseRevision[] = useMemo(() => {
    try { return JSON.parse(String(link?.revisions || '') || '[]') || []; } catch { return []; }
  }, [link?.revisions]);

  useEffect(() => { if (session) void (async () => { const r = await api.getCourseOpsInfo(session.token); if (r.ok && r.data) setOpsInfo(r.data); })(); }, [session]);

  function pick(id: string) {
    setCourseId(id); setSub('review'); setRaw(null); setBaseline(null); setSetup(emptySetup());
    setCourseEmail(''); setBaseCourseEmail(''); setSummaryOk(false); setApproveNote('');
    setError(''); setMsg(''); setPrintsOpen(false);
    if (id) void load(id);
  }

  /** 讀班：有 setupJson（直入草稿）就用，冇就 parse 班 Sheet raw；順手拉 getCourseSummary（courseEmail／批准現狀） */
  async function load(id: string) {
    setBusy('load'); setError(''); setMsg('');
    const [g, sRes] = await Promise.all([
      api.getCourseSetup(session.token, id),
      api.pullCourseSheetRaw(session.token, { courseId: id }),
    ]);
    let s: CourseSetup | null = g.ok && g.data?.setup ? normalizeSetup(g.data.setup) : null;
    if (sRes.ok && sRes.data) {
      setRaw(sRes.data);
      if (!s) s = parseRawToSetup(sRes.data, id);
      setSetup(s); setBaseline(JSON.parse(JSON.stringify(s)) as CourseSetup);
    } else if (!s) {
      setBusy(''); setError(sRes.error || '讀唔到班 Sheet——請檢查連結分頁嘅 Script 網址／Key'); return;
    } else { setSetup(s); setBaseline(JSON.parse(JSON.stringify(s)) as CourseSetup); }
    // courseEmail／批准狀態（coursev5 getCourseSummary；舊後端冇就靜靜地略過）
    const sm = await api.pullCourseSummary(session.token, { courseId: id });
    if (sm.ok && sm.data) {
      const d = sm.data as Record<string, unknown>;
      const ce = String(d.courseEmail ?? '').trim();
      setCourseEmail(ce); setBaseCourseEmail(ce);
      setSummaryOk(true);
    }
    setBusy('');
    if (!sRes.ok) setMsg('已載入儲存過嘅設定（班 Sheet 讀唔到：' + (sRes.error || '') + '）');
  }

  const dirty = useMemo(() => (baseline ? diffSetups(baseline, setup) : { changes: [] as CourseChange[], cells: [] }), [baseline, setup]);
  const emailDirty = courseEmail.trim() !== baseCourseEmail.trim();
  const allChanges: CourseChange[] = useMemo(() => {
    const c = [...dirty.changes];
    if (emailDirty) c.push({ label: '訓練班電郵', from: baseCourseEmail, to: courseEmail.trim() });
    return c;
  }, [dirty.changes, emailDirty, baseCourseEmail, courseEmail]);

  const paymentRows: CoursePaymentRow[] = useMemo(() => (raw ? parseRawToPaymentRows(raw) : []), [raw]);
  const payStats = useMemo(() => {
    const total = paymentRows.length;
    const checked = paymentRows.filter(r => r.payChecked).length;
    const approved = paymentRows.filter(r => r.status === 'approved').length;
    return { total, checked, approved, unchecked: total - checked };
  }, [paymentRows]);
  const leaderEmail = useMemo(() => {
    const l = (setup.staff || []).find(x => String(x.role || '').includes('班領導人') && String(x.email || '').includes('@'));
    return l ? String(l.email).trim() : '';
  }, [setup.staff]);
  const prints: CoursePrintData | null = useMemo(() => {
    if (!raw) return null;
    try { return parseRawToPrints(raw, setup); } catch { return null; }
  }, [raw, setup]);

  /** 💾 儲存修改（唔掂批准格） */
  async function saveEdits() {
    if (!courseId || !baseline) return;
    if (!allChanges.length) { setMsg('冇修改——唔使儲存'); return; }
    setBusy('save'); setError(''); setMsg('');
    const r = await api.saveCourseApproval(session.token, {
      courseId, by: session.displayName, cells: dirty.cells,
      approval: '', courseEmail: emailDirty ? courseEmail.trim() : '',
      changes: allChanges, revisionNote: '修改（未批）',
      link: buildLinkSummary(),
    });
    setBusy('');
    if (!r.ok || !r.data) { setError(r.error || '儲存失敗'); return; }
    setBaseline(JSON.parse(JSON.stringify(setup)) as CourseSetup);
    setBaseCourseEmail(courseEmail.trim());
    await reloadLinks();
    setMsg(renderSaveMsg(r.data, '已儲存修改 ✓（未批——改動已寫入班 Sheet＋修訂紀錄）'));
  }

  /** ✔ 批准並（選填）通知 CL */
  async function approve() {
    if (!courseId || !baseline || !link) return;
    if (link.approval === 'APPROVED' && !allChanges.length) { setMsg('呢班已經批咗，亦冇新修改'); return; }
    if (!confirm(`確定批准「${link.title}」？\n\n${allChanges.length ? `會一併寫入 ${allChanges.length} 項修改（班 Sheet 會見到原值 → 新值）。` : '冇新修改。'}\n${emailChecked && leaderEmail ? `\n並寄 email 通知班領導人（${leaderEmail}）。` : ''}`)) return;
    setBusy('approve'); setError(''); setMsg('');
    const r = await api.saveCourseApproval(session.token, {
      courseId, by: session.displayName, cells: dirty.cells, approval: 'APPROVED',
      courseEmail: emailDirty ? courseEmail.trim() : '',
      changes: allChanges, revisionNote: approveNote.trim(),
      link: buildLinkSummary(),
    });
    if (!r.ok || !r.data) { setBusy(''); setError(r.error || '批准寫入失敗'); return; }
    setBaseline(JSON.parse(JSON.stringify(setup)) as CourseSetup);
    setBaseCourseEmail(courseEmail.trim());
    await reloadLinks();
    let m = renderSaveMsg(r.data, '✅ 已批准（區會批准 ✔ 已寫入班 Sheet）');
    if (emailChecked && leaderEmail) {
      const e = await api.sendCourseEmail(session.token, {
        courseId, kind: 'approved', to: leaderEmail, cc: courseEmail.trim(),
        title: link.title, changes: allChanges, note: approveNote.trim(), by: session.displayName,
      });
      m += e.ok && e.data
        ? `\n✉ 已寄通知俾 ${e.data.to}（寄件人：${e.data.fromUsed}）${e.data.warning ? `；⚠ ${e.data.warning}` : ''}`
        : `\n⚠️ 通知 email 寄唔出：${e.error || '未知錯誤'}`;
    }
    setApproveNote('');
    setMsg(m);
  }

  function renderSaveMsg(d: { path: string; approvalDone: boolean; cellsApplied: number; warnings: string[] }, base: string): string {
    let m = `${base}（${d.cellsApplied} 格${d.approvalDone ? '＋批准格 ✔' : ''}${d.path === 'exec' ? '，經班 Script 寫入' : ''}）`;
    if (d.warnings?.length) m += `\n⚠ ${d.warnings.join('；')}`;
    return m;
  }

  /** 開班登記摘要同步（fee／quota／deadline 等跟返最新設定） */
  function buildLinkSummary(): Partial<CourseLink> {
    if (!baseline) return {};
    const d = diffSetups(baseline, setup);
    if (!d.changes.length) return {};
    const s = setup;
    const shown = s.sessions.filter(x => x.show && (x.displayDate || x.date));
    const sess = shown.length ? shown : s.sessions.filter(x => x.date || x.displayDate);
    const leader = s.staff.find(x => String(x.role || '').includes('班領導人') && x.name) || s.staff.find(x => x.name);
    return {
      title: s.courseName, badgeName: s.badge, section: s.section,
      fee: s.fee, quota: s.quota, deadline: s.deadline, eligibility: s.eligibility,
      venue: Array.from(new Set(sess.map(x => (x.displayVenue || x.venue || '').trim()).filter(Boolean))).join('、'),
      sessionsText: sess.map(x => [(x.displayDate || x.date), (x.displayTime || x.time), (x.displayVenue || x.venue)].filter(Boolean).join(' ')).filter(Boolean).join('；'),
      contact: leader ? [`${(leader.name || '')}${(leader.title || '')}`.trim(), leader.phone, leader.email].filter(x => String(x).trim()).join(' ') : '',
      leader: leader ? `${(leader.name || '')}${(leader.title || '')}`.trim() : undefined,
      uniform: s.uniform, remarks: s.remarks.filter(x => x.trim()).join('\n'), feeNote: s.feeNote,
    };
  }

  // ── 📢 掛載 ──
  const [noticeUrl, setNoticeUrl] = useState('');
  async function mount() {
    if (!courseId || !link) return;
    const url = noticeUrl.trim();
    if (!url) { setError('請先貼上區網通告連結（PDF 或帖文頁）'); return; }
    if (!confirm(`確定掛載「${link.title}」？\n\n會由通告讀料填齊開班登記＋啟用——成員系統即刻見到，報名開始流入。`)) return;
    setBusy('mount'); setError(''); setMsg('');
    const r = await api.parseNotice(url);
    if (!r.ok || !r.data) { setBusy(''); setError('讀唔到通告：' + (r.error || '未知錯誤')); return; }
    const f = r.data.fields;
    const merged: CourseLink = {
      ...link,
      title: f.title || link.title, courseNo: f.fileNo || link.courseNo,
      fee: f.fee || link.fee, originalFee: f.originalFee || link.originalFee, subsidyNote: f.subsidyNote || link.subsidyNote,
      feeNote: f.feeText || link.feeNote, quota: f.quota || link.quota, deadline: f.deadline || link.deadline,
      sessionsText: f.sessionsText || link.sessionsText, venue: f.venue || link.venue,
      contact: f.contact || link.contact, eligibility: f.eligibility || link.eligibility,
      leader: f.leader || link.leader, uniform: f.uniform || link.uniform,
      remarks: f.remarks || link.remarks, signupText: f.signupText || link.signupText,
      badgeName: (f.badges && f.badges.length) ? f.badges.join('、') : link.badgeName,
      section: f.section || link.section, noticeUrl: url, active: 'TRUE',
    };
    const sv = await api.saveCourseLink(session.token, merged);
    if (!sv.ok) { setBusy(''); setError('掛載失敗：' + (sv.error || '儲存失敗')); return; }
    await reloadLinks();
    setNoticeUrl('');
    let m = `🚀 已掛載「${merged.title}」✓（成員系統即刻見到，報名開始流入）`;
    if (emailChecked && leaderEmail) {
      const e = await api.sendCourseEmail(session.token, {
        courseId, kind: 'mounted', to: leaderEmail, cc: courseEmail.trim(),
        title: merged.title, noticeUrl: url, replyTo: courseEmail.trim(), by: session.displayName,
      });
      m += e.ok && e.data ? `\n✉ 已寄通知俾 ${e.data.to}（寄件人：${e.data.fromUsed}）${e.data.warning ? `；⚠ ${e.data.warning}` : ''}` : `\n⚠️ 通知 email 寄唔出：${e.error || ''}`;
    }
    setBusy(''); setMsg(m);
  }

  // ── 💰 收款核對 ──
  async function tickPay(row: CoursePaymentRow, verified: boolean) {
    if (!courseId) return;
    setBusy('pay-' + row.id); setError('');
    const r = await api.setCoursePaymentCheck(session.token, {
      courseId, by: session.displayName, checks: [{ id: row.id, verified }],
    });
    setBusy('');
    if (!r.ok || !r.data) { setError(r.error || '寫入失敗'); return; }
    const bad = (r.data.results || []).find(x => !x.ok);
    if (bad) { setError(`「${row.name}」寫唔到：${bad.error || '未知'}`); return; }
    // 本地即時反映＋重讀班 Sheet 對齊
    setMsg(`${verified ? '✔' : '↩'} 「${row.name || row.id}」${verified ? '已核對收款' : '已還原'}（${session.displayName}）`);
    void (async () => {
      const rr = await api.pullCourseSheetRaw(session.token, { courseId });
      if (rr.ok && rr.data) setRaw(rr.data);
    })();
  }

  async function notifyPayment() {
    if (!courseId || !link) return;
    const pending = paymentRows.filter(r => !r.payChecked).map(r => `${r.name || '（未名）'}(${r.troopNo || r.troop || '?'})`);
    if (!leaderEmail) { setError('班領導人冇電郵（職員表）——填咗先寄到'); return; }
    setBusy('notifyPay');
    const r = await api.sendCourseEmail(session.token, {
      courseId, kind: 'payment', to: leaderEmail, cc: courseEmail.trim(), title: link.title,
      replyTo: courseEmail.trim(),
      paymentStats: { checked: payStats.checked, total: payStats.total, unchecked: payStats.unchecked, pending: pending.slice(0, 20) },
      by: session.displayName,
    });
    setBusy('');
    setMsg(r.ok && r.data ? `✉ 已寄核對摘要俾 ${r.data.to}（寄件人：${r.data.fromUsed}）${r.data.warning ? `；⚠ ${r.data.warning}` : ''}` : `寄唔出：${r.error || ''}`);
  }

  // ── 🔗 連結 ──
  const [gsUrl, setGsUrl] = useState(''); const [execUrl, setExecUrl] = useState('');
  const [apiKey, setApiKey] = useState(''); const [driveFolderId, setDriveFolderId] = useState('');
  const [showKey, setShowKey] = useState(false);
  function fillConnect() {
    if (!link) return;
    setGsUrl(String(link.gsUrl || '')); setExecUrl(String(link.scriptExecUrl || ''));
    setApiKey(String(link.scriptApiKey || '')); setDriveFolderId(String(link.driveFolderId || ''));
  }
  useEffect(fillConnect, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function saveConnect() {
    if (!courseId || !link) return;
    setBusy('connect'); setError('');
    const r = await api.saveCourseLink(session.token, {
      ...link, gsUrl: gsUrl.trim(), scriptExecUrl: execUrl.trim(), scriptApiKey: apiKey.trim(), driveFolderId: driveFolderId.trim(),
    });
    setBusy('');
    if (!r.ok) { setError(r.error || '儲存失敗'); return; }
    await reloadLinks(); setMsg('連結資料已儲存 ✓');
  }
  function clLink(): string {
    const e = execUrl.trim(); if (!e) return '';
    const u = new URL(e);
    if (apiKey.trim()) u.searchParams.set('key', apiKey.trim());
    u.searchParams.set('name', link?.title || '');
    return u.toString();
  }
  function clGuide(): string {
    const d = opsInfo;
    return [
      `【${d?.districtName || districtName}】訓練班開班指引（新版——全部由訓練班系統開始）`,
      '',
      '1️⃣ 開班：開訓練班 App →「🆕 新開班」→ 填課程名・屆別・支部・專章・收生・收費・你個名 →「🏛 連區會起表」。',
      `   開班網址：${d?.factoryUrl || '（未設定——Config COURSE_FACTORY_URL）'}`,
      `   開班碼：${d?.factoryCode || '（未設定——Config COURSE_FACTORY_CODE）'}`,
      '2️⃣ 班信箱：區會會為呢個班開 XXX@skwscout.org.hk 班電郵（通告查詢行印呢個地址）。',
      '   班職員想睇班信箱：CL 喺班信箱 Gmail → 設定 → 帳戶 →「授予存取權限」加職員（對方喺自己 Gmail 右上角切換入去，可以代班回信）；',
      '   全體職員通知就開個 Google Group 轉寄。唔使再轉寄去 CL 個人電郵。',
      '3️⃣ 填文件：喺 App「📝 開班文件」填晒預算／班資料／時間表，再喺「📢 通告」補參加資格等（檔案編號＋班電郵由區會告知）。',
      '4️⃣ 交網址：App 會出「📋 網址」視窗（GS＋SCRIPT 兩條）——一併 Send 俾區管理層，等我哋批核。',
      '5️⃣ 等批：區會批好會 tick「區會批准」＋寄 email 話你知（有改嘅位會喺 email 標亮）。未收 ✔ 之前唔使做嘢。',
      '   （通知郵件嘅「回覆」會去班信箱——職員 delegate 入去就見到成個對話。）',
      '6️⃣ 上網：批完由區會出通告上網＋掛載成員系統——你又唔使出通告，收到 email 就代表報名開始。',
      '7️⃣ 之後：收生／點名／收支／評核／證書照喺 App 度做；收款核對由區會財務負責（💰✔ 會喺 App 見到）。',
      '',
      '❓ 密碼：每班首次 1234，入去即刻改。技術問題去班信箱或 reply 通知郵件就得。',
    ].join('\n');
  }

  // ── ➕ 連結新班 ──
  async function previewPaste() {
    const p = parseCoursePaste(pasteText);
    if (!p.execUrl) { setError('貼上文字搵唔到 Script /exec 網址'); return; }
    setBusy('preview'); setError(''); setPreview(null);
    const r = await api.pullCourseSummary(session.token, { scriptExecUrl: p.execUrl, scriptApiKey: p.apiKey });
    setBusy('');
    if (r.ok && r.data) setPreview(r.data as Record<string, unknown>);
    else setMsg('讀唔到批核摘要（' + (r.error || '') + '）——照可以儲存，之後喺批核分頁再讀');
  }
  async function saveNew() {
    const p = parseCoursePaste(pasteText);
    const sm = preview as Record<string, unknown> | null;
    const title = (sm && String(sm.courseName || '').trim()) || manualTitle.trim();
    if (!title) { setError('讀唔到課程名——請填「課程名稱」先儲存'); return; }
    setBusy('saveNew');
    const leader = (sm?.leader || {}) as Record<string, unknown>;
    const contact = [`${String(leader.name || '')}${String(leader.title || '')}`.trim(), String(leader.phone || ''), String(leader.email || '')].filter(Boolean).join(' ');
    const r = await api.saveCourseLink(session.token, {
      courseId: '', title, badgeName: String(sm?.badge || ''), section: String(sm?.section || ''),
      fee: String(sm?.fee ?? ''), quota: String(sm?.quota ?? ''), deadline: normDate(String(sm?.deadline || '')),
      contact, leader: `${String(leader.name || '')}${String(leader.title || '')}`.trim(),
      scriptExecUrl: p.execUrl, scriptApiKey: p.apiKey, gsUrl: p.gsUrl,
      approval: 'PENDING', active: 'TRUE',
    } as CourseLink);
    setBusy('');
    if (!r.ok || !r.data) { setError(r.error || '儲存失敗'); return; }
    await reloadLinks();
    setAddOpen(false); setPasteText(''); setManualTitle(''); setPreview(null);
    setMsg(`已連結「${title}」✓（批核中）——揀返呢班開始批核`);
    pick(r.data.courseId);
  }

  const chip = (okb: boolean, yes: string, no: string) => (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: okb ? '#dcfce7' : '#f1f5f9', color: okb ? '#166534' : '#64748b' }}>{okb ? yes : no}</span>
  );

  if (!courseId) {
    return (
      <div>
        <section className="info-card">
          <h3>⭐ 新版流程——全部由訓練班系統開始</h3>
          <p style={{ fontSize: 13.5, margin: '6px 0 10px' }}>
            CL 喺<b>訓練班 App</b> 開班＋填晒開班文件 → 交「GS＋SCRIPT 網址」→ 呢邊<b>批核（決定權喺區會）</b>：
            改核心資料（改動標亮俾 CL 知）→ ✔ 批准 → <b>通告由呢邊出</b>＋上網掛載 → 報名流入 →
            截止後<b>收款核對</b> → 完成報告。CL 全程純被通知（email 由區會 alias 出，可以直接 reply）。
          </p>
          {error && <div className="err">{error}</div>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label><b>揀訓練班</b>
              <select value="" onChange={e => pick(e.target.value)} style={{ marginLeft: 6, padding: '6px 8px', borderRadius: 6, minWidth: 300 }}>
                <option value="">— 揀班 —</option>
                {links.map(l => (
                  <option key={l.courseId} value={l.courseId}>
                    {l.title}{l.approval === 'APPROVED' ? '（✔已批）' : l.approval === 'PENDING' ? '（批核中）' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-sm" onClick={() => setAddOpen(a => !a)}>➕ 連結新版訓練班（貼 CL 交嚟嘅網址）</button>
          </div>
          {addOpen && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginTop: 10, background: '#f8fafc' }}>
              <b style={{ fontSize: 13.5 }}>貼上 CL 交嚟嘅嘢（Script /exec、API Key、GS 網址——一齊貼都得，會自動分）</b>
              <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={4} style={{ width: '100%', marginTop: 6, padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} placeholder={`例：\nhttps://script.google.com/macros/s/AKfycb.../exec\nck_abc123...\nhttps://docs.google.com/spreadsheets/d/1abc.../edit`} />
              {(() => { const p = parseCoursePaste(pasteText); return (
                <p style={{ fontSize: 12.5, margin: '6px 0' }}>
                  認到：{p.execUrl ? '✅ Script' : '❌ Script'}・{p.apiKey ? '✅ Key' : '❌ Key'}・{p.gsUrl ? '✅ GS 網址' : '❌ GS 網址'}
                </p>
              ); })()}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn-sm" disabled={!!busy} onClick={previewPaste}>{busy === 'preview' ? '讀取中…' : '🔍 讀取預覽'}</button>
                <label style={{ fontSize: 13 }}>課程名稱（讀唔到先填）<input value={manualTitle} onChange={e => setManualTitle(e.target.value)} style={{ marginLeft: 6, padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 6, width: 220 }} /></label>
                <button className="btn-sm" disabled={!!busy} onClick={saveNew}>{busy === 'saveNew' ? '儲存中…' : '💾 儲存為新班（批核中）'}</button>
              </div>
              {preview && (
                <div style={{ marginTop: 8, fontSize: 13, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                  <b>{String(preview.courseName || '')}</b>（{String(preview.section || '')}・{String(preview.badge || '')}）
                  <br />名額 {String(preview.quota || '')}・收費 ${String(preview.fee || '')}・截止 {String(preview.deadline || '')}
                  <br />班領導人：{String((preview.leader as Record<string, unknown>)?.name || '（未填）')}
                  {String((preview.leader as Record<string, unknown>)?.email || '') && <>・電郵 {String((preview.leader as Record<string, unknown>)?.email)}</>}
                  <br />報名數 {String(preview.regCount ?? '0')}・批准狀態：{preview.approved ? '✔ 已批' : '未批'}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    );
  }

  const approved = link?.approval === 'APPROVED';
  const mounted = !!link?.noticeUrl;
  const bt = budgetTotals(setup);
  const budgetRows: Array<{ label: string; v: number }> = [
    { label: '1. 膳食', v: bt.meals }, { label: '2. 租金（場租＋露營＋住宿）', v: bt.rent }, { label: '3. 交通', v: bt.transport },
    { label: '4. 講義及快勞', v: bt.handouts }, { label: '5. 節目', v: bt.program }, { label: '6. 行政', v: bt.admin },
    { label: '7. 紀念品', v: bt.souvenir }, { label: '8. 其他', v: bt.misc },
  ];
  const respCount = raw && Array.isArray(raw.resp) ? raw.resp.slice(1).filter((r: unknown[]) => Array.isArray(r) && String(r[0] ?? '').trim() !== '').length : 0;
  const shownPay = paymentRows.filter(r => payFilter === 'all' ? true : payFilter === 'unchecked' ? !r.payChecked : payFilter === 'checked' ? r.payChecked : r.status === 'approved');

  return (
    <div>
      <section className="info-card no-print">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label><b>訓練班</b>
            <select value={courseId} onChange={e => pick(e.target.value)} style={{ marginLeft: 6, padding: '6px 8px', borderRadius: 6, minWidth: 260 }}>
              {links.map(l => (
                <option key={l.courseId} value={l.courseId}>
                  {l.title}{l.approval === 'APPROVED' ? '（✔已批）' : l.approval === 'PENDING' ? '（批核中）' : ''}
                </option>
              ))}
            </select>
          </label>
          {chip(approved, '✔ 已批准', '🔎 批核中')}
          {chip(mounted, '📢 已掛載', '未掛載')}
          {raw && <span className="muted" style={{ fontSize: 12.5 }}>報名 {respCount}{payStats.total ? `・已核對收款 ${payStats.checked}/${payStats.total}` : ''}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['review', 'notice', 'payment', 'done', 'connect'] as SubTab[]).map(t => (
              <button key={t} className={sub === t ? 'btn-sm' : 'mini-btn'} onClick={() => setSub(t)}>
                {{ review: '🔎 批核', notice: '📢 通告＋掛載', payment: '💰 收款核對', done: '🎓 完成', connect: '🔗 連結' }[t]}
              </button>
            ))}
          </span>
        </div>
        {link?.gsUrl && <p style={{ fontSize: 12.5, margin: '6px 0 0' }}>班 Sheet：<a href={link.gsUrl} target="_blank" rel="noreferrer">{link.gsUrl}</a>（改動亦會寫入呢張表，CL 開 GS 都見到）</p>}
      </section>

      {error && <div className="err" style={{ whiteSpace: 'pre-wrap' }}>{error}</div>}
      {msg && <div className="success" style={{ whiteSpace: 'pre-wrap' }}>✓ {msg}</div>}

      {/* ── 🔎 批核 ── */}
      {sub === 'review' && (
        baseline ? (
          <>
            <section className="info-card">
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13.5 }}>
                <span><b>{setup.courseName || link?.title}</b></span>
                <span>{setup.edition && `第 ${setup.edition} 屆`}</span><span>{setup.section}</span><span>{setup.badge}</span>
                <span>名額 <b>{setup.quota || '—'}</b></span><span>收費 <b>${setup.fee || '—'}</b></span>
                <span>截止 <b>{setup.deadline ? normDate(setup.deadline) : '—'}</b></span><span>公佈 <b>{setup.publishDate ? normDate(setup.publishDate) : '—'}</b></span>
                <span>{approved ? '✅ 已批准' + (link?.approvedBy ? `（${link.approvedBy}${link.approvedAt ? ' ' + String(link.approvedAt).slice(0, 10) : ''}）` : '') : '🔎 未批'}</span>
              </div>
            </section>

            <section className="info-card">
              <h3>🗓 節次（通告會出嗰啲剔咗 ✓）</h3>
              <div style={{ overflowX: 'auto' }}><table className="data-table">
                <thead><tr>{['#', '日期', '時間', '場地', '上通告', '通告顯示'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{setup.sessions.filter(x => x.date || x.displayDate).map((x, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td><td>{x.date || '—'}</td><td>{x.time || '—'}</td><td>{x.venue || '—'}</td>
                    <td>{x.show ? '✓' : ''}</td>
                    <td>{[x.displayDate, x.displayTime, x.displayVenue].filter(Boolean).join(' ') || '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              <h3 style={{ marginTop: 12 }}>🧑‍🏫 職員（只讀——要改叫 CL 喺 App 改）</h3>
              <div style={{ overflowX: 'auto' }}><table className="data-table">
                <thead><tr>{['職位', '姓名', '稱謂', '電話', '電郵'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{setup.staff.filter(x => x.name.trim()).map((x, i) => (
                  <tr key={i}><td>{x.role}</td><td>{x.name}</td><td>{x.title}</td><td>{x.phone}</td><td>{x.email}</td></tr>
                ))}</tbody>
              </table></div>
              <h3 style={{ marginTop: 12 }}>💰 預算 8 大類（總支出 <b>${bt.total.toLocaleString()}</b>）</h3>
              <table className="data-table">
                <tbody>{budgetRows.map(r => (
                  <tr key={r.label}><td>{r.label}</td><td style={{ textAlign: 'right' }}>${r.v.toLocaleString()}</td></tr>
                ))}</tbody>
              </table>
            </section>

            <section className="info-card">
              <h3>✏️ 批核修改（核心資料＋預算＋通告內文；職員表／時間表唔准改）</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontWeight: 700 }}>訓練班電郵（區會派俾呢個班；通告查詢行自動用）
                  <input value={courseEmail} onChange={e => setCourseEmail(e.target.value)} placeholder="例：blt2601@skwscout.org.hk" style={{ marginLeft: 6, padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 6, width: 250 }} />
                </label>
                {!summaryOk && <span className="muted" style={{ fontSize: 12.5 }}>（呢班 Script 冇 coursev5 摘要——現值讀唔到，直接填就得）</span>}
              </div>
              <CourseSetupForm setup={setup} onChange={setSetup} hide={{ staff: true, timetable: true }} />
            </section>

            <section className="info-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <h3>🟡 待寫入改動（{allChanges.length} 項）——儲存／批准時先寫入班 Sheet，CL 會見到「原值 → 新值」</h3>
              {allChanges.length ? (
                <table className="data-table">
                  <thead><tr><th>欄位</th><th>原值（CL 填）</th><th>改為</th></tr></thead>
                  <tbody>{allChanges.map((c, i) => (
                    <tr key={i} style={{ background: '#fffbeb' }}>
                      <td style={{ fontWeight: 700 }}>{c.label}</td>
                      <td style={{ color: '#b45309' }}>{c.from || '（空）'}</td>
                      <td style={{ color: '#1d4ed8', fontWeight: 700 }}>{c.to || '（空）'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : <p className="muted" style={{ fontSize: 13 }}>冇修改。</p>}
              <label style={{ display: 'block', margin: '8px 0' }}>批准備註（選填；會寫入修訂紀錄＋email 俾 CL）
                        <input value={approveNote} onChange={e => setApproveNote(e.target.value)} style={{ marginLeft: 6, padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 6, width: 320 }} />
              </label>
              <label style={{ fontSize: 13 }}><input type="checkbox" checked={emailChecked} onChange={e => setEmailChecked(e.target.checked)} /> 批准／掛載時 ✉ email 通知 CL（寄去班領導人{leaderEmail ? `：${leaderEmail}` : '——職員表未填電郵'}）</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="mini-btn" disabled={!!busy || !allChanges.length} onClick={() => { if (baseline) setSetup(JSON.parse(JSON.stringify(baseline))); setCourseEmail(baseCourseEmail); }}>↩ 還原全部</button>
                <button className="mini-btn" disabled={!!busy || !allChanges.length} onClick={saveEdits}>{busy === 'save' ? '儲存中…' : '💾 儲存修改（未批）'}</button>
                <button className={approved ? 'mini-btn' : 'btn-sm'} disabled={!!busy || (approved && !allChanges.length)} onClick={approve}>{busy === 'approve' ? '寫入中…' : approved ? '✔ 已批——儲存新修改' : '✔ 批准並通知 CL'}</button>
              </div>
            </section>

            {revisions.length > 0 && (
              <section className="info-card">
                <h3>📜 修訂紀錄（近 {revisions.length} 筆）</h3>
                {revisions.map((r, i) => (
                  <div key={i} style={{ borderBottom: '1px solid #f1f5f9', padding: '8px 0', fontSize: 13 }}>
                    <b>{String(r.at).replace('T', ' ').slice(0, 16)}</b>・{r.by}
                    {r.approval === 'APPROVED' && <span style={{ color: '#166534', fontWeight: 700 }}> ✔ 批准</span>}
                    {r.note && <>・{r.note}</>}
                    {!!r.changes?.length && (
                      <div style={{ marginTop: 4 }}>
                        {r.changes.map((c, j) => (
                          <div key={j} style={{ background: '#fffbeb', display: 'inline-block', margin: '2px 6px 2px 0', padding: '2px 8px', borderRadius: 6 }}>
                            <b>{c.label}</b>：<span style={{ color: '#b45309', textDecoration: 'line-through' }}>{c.from || '（空）'}</span> → <span style={{ color: '#1d4ed8', fontWeight: 700 }}>{c.to || '（空）'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}
          </>
        ) : (
          <section className="info-card">
            <p>{busy === 'load' ? '讀取班資料中…' : '未讀取——撳下面掣拉班 Sheet 全文＋批核摘要。'}</p>
            <button className="btn-sm" disabled={!!busy} onClick={() => load(courseId)}>{busy === 'load' ? '讀取中…' : '⬇ 讀取批核資料'}</button>
          </section>
        )
      )}

      {/* ── 📢 通告＋掛載 ── */}
      {sub === 'notice' && (
        <>
          <section className="info-card" style={{ borderLeft: '4px solid #7c3aed' }}>
            <h3>📢 出通告（管理層話事——批完由呢邊出，唔再煩 CL）</h3>
            <p style={{ fontSize: 13.5, margin: '4px 0 10px' }}>
              1. 見到 ✔ 已批准 → 2. 下面「🖨 列印（12 張）」揀<b>📜 通告</b>列印／存 PDF → 3. 交網頁管理員上區網 →
              4. 貼通告連結撳「🚀 掛載」→ 報名開始流入＋✉ 通知 CL。<br />
              報名辦法會印成員系統訓練班版面網址（<b>{memberPortalUrl ? `${memberPortalUrl.replace(/\/+$/, '')}/training` : '（Config MEMBER_PORTAL_URL 未設定）'}</b>）——公開報名表，唔使帳號，其他區人士都報得到。
            </p>
            {!approved && <div className="err">⚠️ 呢班未批（未有 ✔）——照樣印得，但照流程應該批咗先出通告。</div>}
            <button className="btn-sm" onClick={() => setPrintsOpen(p => !p)}>{printsOpen ? '收起列印' : '🖨 列印（12 張）'}</button>
            {printsOpen && (prints
              ? <div style={{ marginTop: 10 }}><CoursePrints data={prints} districtName={districtName} fpsAccount={fpsAccount} memberPortalUrl={memberPortalUrl} /></div>
              : <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>未有列印數據——先去「🔎 批核」讀取班資料。</p>)}
          </section>

          <section className="info-card">
            <h3>🚀 掛載（通告上網之後）</h3>
            <p style={{ fontSize: 13, margin: '4px 0 8px' }}>
              會由通告連結自動讀料（名／收費／名額／截止／班領導人／服裝／備註等）填齊開班登記＋<b>啟用</b>。
              掛載係俾已經用緊成員系統嘅人喺「訓練班」版面見到＋報名；通告上面嗰條連結就係公開報名入口。
            </p>
            {link?.noticeUrl && <p style={{ fontSize: 13 }}>而家掛住：<a href={link.noticeUrl} target="_blank" rel="noreferrer">{link.noticeUrl}</a>（再貼再撳可以更新）</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={noticeUrl} onChange={e => setNoticeUrl(e.target.value)} placeholder="貼上區網通告 PDF／帖文頁連結" style={{ flex: 1, minWidth: 280, padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6 }} />
              <button className="btn-sm" disabled={!!busy} onClick={mount}>{busy === 'mount' ? '掛載中…' : '🚀 掛載（讀通告＋啟用）'}</button>
              <label style={{ fontSize: 13 }}><input type="checkbox" checked={emailChecked} onChange={e => setEmailChecked(e.target.checked)} /> ✉ 通知 CL</label>
            </div>
          </section>
        </>
      )}

      {/* ── 💰 收款核對 ── */}
      {sub === 'payment' && (
        <section className="info-card">
          <h3>💰 收款核對（報名截止後做——對完區帳戶先 tick）</h3>
          <p style={{ fontSize: 13, margin: '4px 0 8px' }}>
            tick ✔ 會寫入班 Sheet「表格回應」已核對收款／核對人／核對時間——CL 個 APP 即時見 💰✔。
            總共 <b>{payStats.total}</b> 筆報名・已接納 <b>{payStats.approved}</b>・<b style={{ color: payStats.unchecked ? '#b45309' : '#166534' }}>未核對 {payStats.unchecked}</b>。
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {([['all', '全部'], ['unchecked', '未核對'], ['checked', '已核對'], ['approved', '已接納']] as Array<[typeof payFilter, string]>).map(([k, lb]) => (
              <button key={k} className={payFilter === k ? 'btn-sm' : 'mini-btn'} onClick={() => setPayFilter(k)}>{lb}</button>
            ))}
            <span style={{ marginLeft: 'auto' }}>
              <button className="mini-btn" disabled={!!busy || !payStats.total} onClick={notifyPayment}>{busy === 'notifyPay' ? '寄出中…' : '✉ 通知 CL 核對摘要'}</button>
            </span>
          </div>
          {!raw ? <p className="muted" style={{ fontSize: 13 }}>未讀取——先去「🔎 批核」讀取。</p> : shownPay.length ? (
            <div style={{ overflowX: 'auto' }}><table className="data-table">
              <thead><tr>{['報名', '姓名', '旅', '狀態', '入數紙', '收款核對', '動作'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{shownPay.map(r => (
                <tr key={r.id} style={r.payChecked ? { background: '#f0fdf4' } : r.status === 'approved' ? { background: '#fffbeb' } : {}}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{String(r.id).replace('T', ' ').slice(0, 16)}</td>
                  <td>{r.name || '—'}{r.studentNo ? `（${r.studentNo}）` : ''}<br /><span className="muted" style={{ fontSize: 12 }}>{r.phone}</span></td>
                  <td>{r.troopNo || r.troop || '—'}{r.group ? `・${r.group}組` : ''}</td>
                  <td>{STATUS_LABEL[r.status] || r.status}</td>
                  <td>{r.receiptUrl ? <a href={r.receiptUrl} target="_blank" rel="noreferrer">🧾 截圖</a> : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.payChecked ? <>✔ {r.payBy}<br /><span className="muted" style={{ fontSize: 12 }}>{String(r.payAt).slice(0, 16)}</span></> : <b style={{ color: '#b45309' }}>未核對</b>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="mini-btn" disabled={!!busy} onClick={() => tickPay(r, true)}>✔ 對到數</button>{' '}
                    {r.payChecked && <button className="mini-btn" disabled={!!busy} onClick={() => tickPay(r, false)}>↩</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <p className="muted" style={{ fontSize: 13 }}>冇報名（或全部被篩走）。</p>}
        </section>
      )}

      {/* ── 🎓 完成 ── */}
      {sub === 'done' && (
        <section className="info-card">
          <h3>🎓 完成報告（CL 喺 App 評核＋出證書之後，呢邊睇數）</h3>
          {prints ? (
            <>
              <p style={{ fontSize: 13.5 }}>
                報名 {prints.counts.appliedHome + prints.counts.appliedOther}（本區 {prints.counts.appliedHome}／他區 {prints.counts.appliedOther}）・
                接納 <b>{prints.counts.admittedTotal}</b>（本區 {prints.counts.admittedHome}／他區 {prints.counts.admittedOther}）・
                完成紀錄 <b>{prints.counts.completed}</b>・合格 <b style={{ color: '#166534' }}>{prints.counts.passed}</b>
              </p>
              {prints.completion.length ? (
                <div style={{ overflowX: 'auto' }}><table className="data-table">
                  <thead><tr>{['編號', '姓名', '旅號', '證書編號', '合格', '不合格原因'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>{prints.completion.map((c, i) => (
                    <tr key={i}><td>{c.code}</td><td>{c.name}</td><td>{c.troopNo}</td><td>{c.certNo}</td>
                      <td style={{ color: c.pass === '合格' ? '#166534' : '#b91c1c', fontWeight: 700 }}>{c.pass || '—'}</td><td>{c.failReason}</td></tr>
                  ))}</tbody>
                </table></div>
              ) : <p className="muted" style={{ fontSize: 13 }}>班 Sheet 完成報告仲係空——等 CL 喺 App 度評核寫入。</p>}
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13.5 }}>🖨 列印（完成報告／領取證書紀錄／12 張全部）</summary>
                {prints && <div style={{ marginTop: 10 }}><CoursePrints data={prints} districtName={districtName} fpsAccount={fpsAccount} memberPortalUrl={memberPortalUrl} /></div>}
              </details>
            </>
          ) : <p className="muted" style={{ fontSize: 13 }}>未讀取——先去「🔎 批核」讀取。</p>}
        </section>
      )}

      {/* ── 🔗 連結 ── */}
      {sub === 'connect' && link && (
        <section className="info-card">
          <h3>🔗 連結資料</h3>
          <div style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
            <label style={{ fontSize: 13.5 }}>班 Google Sheet 網址（CL 交嚟；批核直接開 GS 用）
              <input value={gsUrl} onChange={e => setGsUrl(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6 }} placeholder="https://docs.google.com/spreadsheets/d/…" />
            </label>
            <label style={{ fontSize: 13.5 }}>訓練班 Script /exec（coursev5 Web App）
              <input value={execUrl} onChange={e => setExecUrl(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6 }} placeholder="https://script.google.com/macros/s/…/exec" />
            </label>
            <label style={{ fontSize: 13.5 }}>API Key
              <span style={{ display: 'flex', gap: 6 }}>
                <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} style={{ flex: 1, padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6 }} placeholder="ck_…" />
                <button className="mini-btn" onClick={() => setShowKey(s => !s)}>{showKey ? '隱藏' : '顯示'}</button>
              </span>
            </label>
            <label style={{ fontSize: 13.5 }}>Drive 資料夾 ID（入數紙／付款證明）
              <input value={driveFolderId} onChange={e => setDriveFolderId(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6 }} />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-sm" disabled={!!busy} onClick={saveConnect}>{busy === 'connect' ? '儲存中…' : '💾 儲存連結'}</button>
              {clLink() && <button className="mini-btn" onClick={() => { void navigator.clipboard.writeText(clLink()); setMsg('已複製職員連結 ✓'); }}>🔗 複製職員連結（exec?key=…）</button>}
              {gsUrl && <a className="mini-btn" href={gsUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>↗ 開班 Sheet</a>}
            </div>
            <p className="muted" style={{ fontSize: 12.5 }}>批核寫入首選直接開班 Sheet（同區後台同帳戶就開到）；開唔到會自動改經 Script 寫——「區會批准」格嗰陣就要人手開 GS tick。</p>
          </div>
        </section>
      )}
      {sub === 'connect' && !link && null}

      {sub === 'connect' && (
        <section className="info-card" style={{ borderLeft: '4px solid #0ea5e9' }}>
          <h3>📨 俾 CL 嘅開班指引（一鍵複製 Send 俾 CL）</h3>
          <textarea readOnly value={clGuide()} rows={12} style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, padding: 10, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn-sm" onClick={() => { void navigator.clipboard.writeText(clGuide()); setMsg('已複製開班指引 ✓——貼俾 CL 就得'); }}>📋 複製指引</button>
            <span className="muted" style={{ fontSize: 12.5 }}>
              訓練班郵件 alias：{opsInfo?.emailFrom ? <b>{opsInfo.emailFrom}</b> : '（未設定——Config COURSE_EMAIL_FROM；須喺部署帳戶 Gmail 驗證「用這個地址傳送郵件」）'}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
