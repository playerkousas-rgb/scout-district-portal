'use client';
/**
 * 🆕 新制直入分頁（v4.14.0）— 揀班／開新班／填設定／雙向同步／12 張列印。
 * 舊制（CL 填 Sheet）原封不動，呢條係並行試驗線。
 */
import { useState } from 'react';
import { api } from '@/lib/api';
import type { CourseLink, CoursePrintData, CourseSetup, CourseSheetRaw, UserSession } from '@/lib/types';
import { emptySetup, normalizeSetup, parseRawToPrints, parseRawToSetup, setupToCells, setupToLinkSummary } from '@/lib/course-setup';
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

export default function CourseSetupTab({ session, links, reloadLinks, districtName, fpsAccount, memberPortalUrl, courseTemplateSet }: Props) {
  const [courseId, setCourseId] = useState('');
  const [setup, setSetup] = useState<CourseSetup>(emptySetup());
  const [prints, setPrints] = useState<CoursePrintData | null>(null);
  const [view, setView] = useState<'form' | 'print'>('form');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');

  const link = links.find(l => l.courseId === courseId);
  const isDirect = !!link?.sheetId;   // 區系統自動建嘅班（可推送）
  const hasUrl = !!link?.scriptExecUrl;

  function pick(id: string) {
    setCourseId(id); setPrints(null); setView('form'); setError(''); setMsg(''); setSheetUrl('');
    setSetup(emptySetup());
    if (id) void loadSetup(id);
  }

  /** 開班：先攞儲存過嘅設定，冇就由班 Sheet 讀返嚟 parse */
  async function loadSetup(id: string) {
    setBusy('load'); setError(''); setMsg('');
    const g = await api.getCourseSetup(session.token, id);
    if (g.ok && g.data?.setup) {
      setSetup(normalizeSetup(g.data.setup));
      setMsg('已載入上次儲存嘅設定 ✓（班 Sheet 有更新請撳「由班 Sheet 重讀」）');
      setBusy('');
      return;
    }
    const r = await api.pullCourseSheetRaw(session.token, { courseId: id });
    setBusy('');
    if (!r.ok || !r.data) { setError(g.ok ? '呢班未儲存過設定，亦讀唔到班 Sheet。' : (r.error || '讀取失敗')); return; }
    setSetup(parseRawToSetup(r.data, id));
    setPrints(parseRawToPrints(r.data, parseRawToSetup(r.data, id)));
    setMsg('已由班 Sheet 讀返設定 ✓');
  }

  /** ⬇ 由班 Sheet 重讀（職員喺 Sheet 改咗嘢，呢度即時睇返） */
  async function reload() {
    if (!courseId) return;
    setBusy('reload'); setError(''); setMsg('');
    const r = await api.pullCourseSheetRaw(session.token, { courseId });
    setBusy('');
    if (!r.ok || !r.data) { setError(r.error || '讀取失敗'); return; }
    const s = parseRawToSetup(r.data, courseId);
    if (setup.clEmail && !s.clEmail) s.clEmail = setup.clEmail;  // 電郵唔存喺 Sheet，保留
    setSetup(s);
    setPrints(parseRawToPrints(r.data, s));
    setMsg('已由班 Sheet 重讀 ✓（表單＋列印數據已更新）');
  }

  /** 🏗 建立班 Sheet＋開班登記（新班） */
  async function create() {
    setError(''); setMsg('');
    if (!setup.courseName.trim()) { setError('請先填班名'); return; }
    if (!courseTemplateSet) { setError('未設定訓練班總模版（Config COURSE_TEMPLATE_ID），建唔到班 Sheet。'); return; }
    if (!confirm(`確定建立「${setup.courseName}」嘅後端班 Sheet 並開班登記？`)) return;
    setBusy('create');
    const summary = setupToLinkSummary(setup);
    const r = await api.createCourseSheet(session.token, {
      link: { courseId: setup.courseId || undefined, ...summary, active: 'TRUE' } as CourseLink,
      setup: { ...setup, courseId: setup.courseId },
      cells: setupToCells(setup),
      clEmail: setup.clEmail,
    });
    setBusy('');
    if (!r.ok || !r.data) { setError(r.error || '建立失敗'); return; }
    setSheetUrl(r.data.sheetUrl);
    setMsg(`已建立班 Sheet＋開班登記 ✓（寫入 ${r.data.cellsApplied} 格${r.data.sharedTo ? `，已分享畀 ${r.data.sharedTo}` : ''}${r.data.shareWarning ? `；⚠️ ${r.data.shareWarning}` : ''}）`);
    await reloadLinks();
    setCourseId(r.data.courseId);
    setSetup({ ...setup, courseId: r.data.courseId, sheetId: r.data.sheetId, sheetUrl: r.data.sheetUrl });
  }

  /** ⬆ 儲存並推送去班 Sheet（直入班） */
  async function push() {
    if (!courseId || !link) return;
    setError(''); setMsg('');
    setBusy('push');
    const r = await api.pushCourseSetup(session.token, { courseId, setup: { ...setup, courseId }, cells: setupToCells(setup) });
    // 順手同步開班登記摘要（名額／收費／截止／場地等）
    let linkMsg = '';
    if (r.ok) {
      const s2 = await api.saveCourseLink(session.token, { ...link, ...setupToLinkSummary(setup), title: setup.courseName || link.title });
      if (!s2.ok) linkMsg = `；⚠️ 開班登記摘要同步失敗：${s2.error}`;
    }
    setBusy('');
    if (!r.ok || !r.data) { setError(r.error || '推送失敗'); return; }
    setMsg(`已推送去班 Sheet ✓（${r.data.cellsApplied} 格，開班登記摘要已同步）${linkMsg}`);
    await reloadLinks();
  }

  /** 💾 只儲存設定草稿（舊制班／未建表都用得） */
  async function saveDraft() {
    if (!courseId || !link) return;
    setError(''); setMsg('');
    setBusy('draft');
    const r = await api.saveCourseLink(session.token, { ...link, setupJson: JSON.stringify({ ...setup, courseId }) });
    setBusy('');
    if (!r.ok) { setError(r.error || '儲存失敗'); return; }
    setMsg('設定草稿已儲存 ✓（唔影響班 Sheet）');
    await reloadLinks();
  }

  /** 🖨 列印預覽（冇數據就先讀） */
  async function openPrints() {
    setError(''); setMsg('');
    if (prints) { setView('print'); return; }
    if (!courseId) {
      // 新班未建表：用表單設定即時計（名單等活數據留空）
      const blank: CourseSheetRaw = {
        input01: [], input02: [], input03: [], input04: [], resp: [], paramsWX: [],
        notice: [], accept: [], finance: [], completion: [], cert: [], subsidy: [], pulledAt: new Date().toISOString(),
      };
      setPrints(parseRawToPrints(blank, setup));
      setView('print');
      setMsg('預覽用緊表單設定（未建表，名單等活數據留空）');
      return;
    }
    setBusy('prints');
    const r = await api.pullCourseSheetRaw(session.token, { courseId });
    setBusy('');
    if (!r.ok || !r.data) { setError(r.error || '讀取失敗'); return; }
    setPrints(parseRawToPrints(r.data, setup));
    setView('print');
  }

  return (
    <div>
      {!courseTemplateSet && (
        <div className="err" style={{ marginBottom: 10 }}>
          ⚠️ 未設定訓練班總模版（Config <code>COURSE_TEMPLATE_ID</code>）：開一張空白 Google Sheet 跑一次訓練班模版
          <code>setupCourseSheet()</code>，再將試算表 ID 填入 Config。「建立班 Sheet」要設好先用得；舊班重讀／列印唔受影響。
        </div>
      )}
      {error && <div className="err">{error}</div>}
      {msg && <div className="success">✓ {msg}</div>}

      {/* 揀班列 */}
      <section className="info-card no-print">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label><b>訓練班</b>
            <select value={courseId} onChange={e => pick(e.target.value)} style={{ marginLeft: 6, padding: '6px 8px', borderRadius: 6, minWidth: 260 }}>
              <option value="">＋ 新開班（直入）</option>
              {links.map(l => (
                <option key={l.courseId} value={l.courseId}>
                  {l.title}{l.sheetId ? ' 🆕直入' : l.scriptExecUrl ? '（舊制）' : ''}{l.hasSetup ? ' 💾' : ''}
                </option>
              ))}
            </select>
          </label>
          {link && <span className="muted" style={{ fontSize: 12 }}>
            {isDirect ? `🆕 直入班（後端 Sheet：${link.sheetId}）` : hasUrl ? '舊制班（人手建表；呢度睇得印得，推送唔用得）' : '未設定 Script／Sheet'}
          </span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className={view === 'form' ? 'btn-sm' : 'mini-btn'} onClick={() => setView('form')}>📝 填表</button>
            <button className={view === 'print' ? 'btn-sm' : 'mini-btn'} onClick={openPrints}>🖨 列印預覽</button>
          </span>
        </div>
        {sheetUrl && <p style={{ fontSize: 13 }}>後端班 Sheet：<a href={sheetUrl} target="_blank" rel="noreferrer">{sheetUrl}</a></p>}
      </section>

      {view === 'form' ? (
        <>
          {/* 動作列 */}
          <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {!courseId && <button className="btn-sm" disabled={!!busy} onClick={create}>🏗 建立班 Sheet＋開班登記</button>}
            {courseId && <button className="mini-btn" disabled={!!busy} onClick={reload}>⬇ 由班 Sheet 重讀</button>}
            {courseId && isDirect && <button className="btn-sm" disabled={!!busy} onClick={push}>⬆ 儲存並推送去班 Sheet</button>}
            {courseId && <button className="mini-btn" disabled={!!busy} onClick={saveDraft}>💾 只儲存草稿（唔掂班 Sheet）</button>}
            {busy && <span className="muted" style={{ fontSize: 13 }}>處理緊…</span>}
          </div>
          <div className="no-print">
            <CourseSetupForm setup={setup} onChange={setSetup} />
          </div>
        </>
      ) : (
        <section className="info-card">
          {prints
            ? <CoursePrints data={prints} districtName={districtName} fpsAccount={fpsAccount} memberPortalUrl={memberPortalUrl} />
            : <p className="muted">載入緊列印數據…</p>}
        </section>
      )}
    </div>
  );
}
