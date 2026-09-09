'use client';
/**
 * 🏕 旅團探訪（v4.8.1）
 *
 * · 幹部一入去預設只睇自己支部（跟角色：小童軍／幼童軍／童軍 ADC），隨時切換
 * · 撳一下旅團格仔 → 填日期 → 儲存，就登記咗今次探訪
 * · DC 出報告：揀「幾月到幾月」→ 探訪 list + 邊個幹部探咗幾多次／邊啲旅 → 匯出 CSV
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { isSuper } from '@/lib/levels';
import type { ScoutUnit, Visit, VisitBoard, VisitKind, VisitSection } from '@/lib/types';
import {
  SECTIONS, SECTION_LABEL, SECTION_EMOJI, KIND_LABEL, VISIT_KINDS,
  troopStats, coverage, visitorStats, sortUnits, rangePresets, quarterOf,
  parseUnitPaste, toCsv, todayStr, hasVisitOn, visitsOn,
} from '@/lib/visits';
import BackLink, { BackBar } from '@/components/BackLink';

type Tab = 'board' | 'report' | 'units';
const TABS: { id: Tab; label: string }[] = [
  { id: 'board', label: '🗺 探訪登記' },
  { id: 'report', label: '📊 探訪報告' },
  { id: 'units', label: '⚙️ 旅團名單' },
];

const SECTION_KEY = 'skw.visit.section';

export default function VisitPage() {
  const session = useRequireCard('visit');
  const [board, setBoard] = useState<VisitBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [needUpgrade, setNeedUpgrade] = useState(false);
  const [tab, setTab] = useState<Tab>('board');

  const thisYear = new Date().getFullYear();
  const [from, setFrom] = useState(`${thisYear}-01-01`);
  const [to, setTo] = useState(`${thisYear}-12-31`);
  const [section, setSection] = useState<VisitSection | ''>('');
  const [sectionReady, setSectionReady] = useState(false);

  useEffect(() => {
    if (!session) return;
    if (isSuper(session)) { setCanEdit(true); return; }
    (async () => {
      const r = await api.getCards(session.token);
      if (r.ok && r.data) setCanEdit(r.data.some(c => c.cardId === 'visit' && c.access === 'edit'));
    })().catch(() => { /* ignore */ });
  }, [session]);

  async function load(f = from, t = to) {
    if (!session) return;
    setLoading(true); setError('');
    const r = await api.getVisitBoard(session.token, f, t);
    if (r.ok && r.data) {
      setBoard(r.data); setNeedUpgrade(false);
      if (!sectionReady) {
        // 一入去預設睇自己支部：先睇上次揀過嘅，冇就跟角色
        const saved = typeof window !== 'undefined' ? window.localStorage.getItem(SECTION_KEY) : null;
        const initial: VisitSection | '' = saved
          ? (saved === 'all' ? '' : (saved as VisitSection))
          : (r.data.me.defaultSection || '');
        setSection(initial);
        setSectionReady(true);
      }
    } else {
      setError(r.error || '讀取失敗');
      if ((r.error || '').includes('Visits') || (r.error || '').includes('未知')) setNeedUpgrade(true);
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);

  function pickSection(s: VisitSection | '') {
    setSection(s);
    if (typeof window !== 'undefined') window.localStorage.setItem(SECTION_KEY, s || 'all');
  }
  function flash(text: string) { setMsg(text); setTimeout(() => setMsg(''), 3200); }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🏕 旅團探訪</h1>
      <p className="page-sub">
        撳一下旅團格仔就登記探訪 · 未探過嘅紅燈提你 · DC 揀日期範圍即出報告
      </p>

      {error && !needUpgrade && <div className="err">{error}</div>}
      {msg && <div className="success">{msg}</div>}

      {needUpgrade && (
        <div className="info-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <h3>⚠️ 後台未升級到 v4.8.1</h3>
          <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
            請去「📢 更新 / 下載」下載最新 <code>Code.gs</code> 貼上 Apps Script →
            執行 <code>setupSheets()</code>（會建立 <code>Units</code>／<code>Visits</code> 兩張表，
            並自動填入港島地域官網嘅筲箕灣區 28 個旅團）→ 重新部署。
          </p>
        </div>
      )}

      <div className="inc-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`inc-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {loading ? <div className="center"><div className="spinner" /></div> : board && (
        <>
          {tab !== 'units' && (
            <SectionPicker board={board} section={section} onPick={pickSection} />
          )}
          {tab === 'board' && (
            <BoardTab
              board={board} section={section} canEdit={canEdit} token={session.token}
              reload={() => load()} flash={flash} setError={setError}
            />
          )}
          {tab === 'report' && (
            <ReportTab
              board={board} section={section} from={from} to={to}
              setRange={(f, t) => { setFrom(f); setTo(t); load(f, t); }}
              canEdit={canEdit} token={session.token} reload={() => load()} flash={flash} setError={setError}
            />
          )}
          {tab === 'units' && (
            <UnitsTab
              board={board} canEdit={canEdit} token={session.token}
              reload={() => load()} flash={flash} setError={setError}
            />
          )}
        </>
      )}

      <BackBar />
    </>
  );
}

// ───────────────────────── 支部切換 ─────────────────────────

function SectionPicker({ board, section, onPick }: {
  board: VisitBoard; section: VisitSection | ''; onPick: (s: VisitSection | '') => void;
}) {
  const mine = board.me.defaultSection;
  return (
    <div className="info-card vs-sections">
      <span className="vs-sec-label">睇邊個支部</span>
      {SECTIONS.map(s => (
        <button
          key={s}
          className={`vs-sec${section === s ? ' on' : ''}`}
          onClick={() => onPick(s)}
        >
          {SECTION_EMOJI[s]} {SECTION_LABEL[s]}
          {mine === s && <span className="vs-mine">我嘅</span>}
        </button>
      ))}
      <button className={`vs-sec${section === '' ? ' on' : ''}`} onClick={() => onPick('')}>🌐 全部支部</button>
    </div>
  );
}

// ───────────────────────── 🗺 探訪登記（方塊磚：揀完先儲存） ─────────────────────────

function BoardTab({ board, section, canEdit, token, reload, flash, setError }: {
  board: VisitBoard; section: VisitSection | ''; canEdit: boolean; token: string;
  reload: () => Promise<void>; flash: (s: string) => void; setError: (s: string) => void;
}) {
  const [editing, setEditing] = useState<Partial<Visit> | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  // 未撳「儲存」之前，一切都淨係喺畫面度，唔會寫後端
  const [picked, setPicked] = useState<string[]>([]);
  const [date, setDate] = useState(board.today);
  const [saving, setSaving] = useState(false);

  const visits = useMemo(
    () => (onlyMine ? board.visits.filter(v => (v.visitorName || '') === board.me.name) : board.visits),
    [board, onlyMine],
  );
  const stats = useMemo(
    () => troopStats(sortUnits(board.units), visits, section),
    [board, visits, section],
  );
  const cov = coverage(stats);

  // 換日子／換支部 → 揀咗嘅清零（「聽日就係新一日」）
  useEffect(() => { setPicked([]); }, [date, section]);

  // 防呆：仲有揀咗未儲存就離開／refresh，會提你
  useEffect(() => {
    if (!picked.length) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [picked.length]);

  function toggle(troop: string) {
    if (!canEdit) return;
    if (picked.includes(troop)) { setPicked(prev => prev.filter(t => t !== troop)); return; }

    const label = board.units.find(u => u.troop === troop)?.label || troop;
    // 一日一個旅一次：同一日已經登記過就唔畀再登記（要改就撳「✎ 詳細」／喺記錄度改）
    const mine = visitsOn(board.visits, troop, date, board.me.name);
    if (mine.length) {
      setError(`${label} 喺 ${date} 你已經登記咗，同一日唔使登記兩次。（要改日期／加備註，撳方塊右下「✎ 詳細」）`);
      return;
    }
    // 第二位幹部同一日都去咗 → 佢有佢嗰筆，你有你嗰筆，但要確認一次
    const others = visitsOn(board.visits, troop, date);
    if (others.length) {
      const who = [...new Set(others.map(v => v.visitorName || '其他幹部'))].join('、');
      if (!confirm(`${label} 喺 ${date} 已經由 ${who} 登記咗。\n你自己都有去？撳「確定」就會加你名下嗰筆。`)) return;
    }
    setPicked(prev => [...prev, troop]);
  }

  async function savePicked() {
    if (!picked.length) return;
    const label = (t: string) => board.units.find(u => u.troop === t)?.label || t;
    if (!confirm(
      `確定登記以下 ${picked.length} 個旅團嘅探訪？\n探訪日期：${date}\n支部：${section ? SECTION_LABEL[section] : '全旅／唔分支部'}\n\n` +
      picked.map(t => `· ${label(t)}`).join('\n')
    )) return;

    setSaving(true);
    const failed: string[] = [];
    for (const troop of picked) {
      // 保險：儲存前再查一次，同一日同一個旅（同一個幹部）已經有就跳過
      if (hasVisitOn(board.visits, troop, date, board.me.name)) continue;
      const r = await api.saveVisit(token, {
        troop, section: section || '', visitDate: date,
        kind: 'general', visitorName: board.me.name,
      });
      if (!r.ok) { failed.push(troop); setError(`${label(troop)}：${r.error || '寫入失敗'}`); }
    }
    setSaving(false);
    setPicked(failed);                    // 寫失敗嗰啲留返喺度，可以再試
    await reload();
    const done = picked.length - failed.length;
    if (done > 0) flash(`已登記 ${done} 個旅團嘅探訪（${date}）✓`);
  }

  return (
    <>
      <div className="info-card vs-summary">
        <div className="vs-kpi">
          <b>{cov.visited} / {cov.total}</b>
          <span>{section ? SECTION_LABEL[section] : '全區'}旅團已探訪</span>
        </div>
        <div className="vs-bar"><i style={{ width: `${cov.percent}%` }} /></div>
        <div className="vs-kpi-side">
          <span className="vs-pct">{cov.percent}%</span>
          <span className="vs-range">{board.from} → {board.to}</span>
        </div>
        <label className="aw-check">
          <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />
          淨係睇我探嘅
        </label>
      </div>

      {canEdit && (
        <div className="info-card vs-howto">
          <b>點登記</b>
          <p>
            撳一下方塊 = <b>揀咗</b>（藍色），同一日可以一次過揀 X、Y、Z 幾個旅；撳多次可以取消。
            揀好之後撳下面「<b>💾 儲存登記</b>」先會寫入後台 —— 未撳儲存，咩都唔會入數。
            <b>一日一個旅淨係一次</b>：已經登記咗嗰日嘅方塊會鎖住（🔒），唔會不小心撳多次。
            日期預設今日，<b>儲存嗰日就係探訪日期</b>；聽日入返嚟就係新一日，方塊自動清零，同一個旅下個月再探再撳過就得。
          </p>
        </div>
      )}

      <div className="vs-grid">
        {stats.length === 0 && (
          <div className="info-card" style={{ gridColumn: '1 / -1' }}>
            <p className="empty">呢個支部冇旅團（可以去「⚙️ 旅團名單」加返）</p>
          </div>
        )}
        {stats.map(st => {
          const isPicked = picked.includes(st.unit.troop);
          const mineToday = hasVisitOn(board.visits, st.unit.troop, date, board.me.name);
          const anyToday = hasVisitOn(board.visits, st.unit.troop, date);
          const todayWho = anyToday && !mineToday
            ? [...new Set(visitsOn(board.visits, st.unit.troop, date).map(v => v.visitorName || '其他幹部'))].join('、')
            : '';
          return (
            <div
              key={st.unit.troop}
              className={`vs-tile${st.visited ? ' done' : ''}${isPicked ? ' picked' : ''}${anyToday ? ' today' : ''}${mineToday ? ' locked' : ''}`}
              role="button" tabIndex={0}
              title={!canEdit ? '你冇登記權限'
                : mineToday ? `${date} 已經登記咗，同一日唔會登記兩次`
                : '撳一下揀／取消，最後撳「儲存登記」'}
              onClick={() => toggle(st.unit.troop)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(st.unit.troop); } }}
            >
              <div className="vs-tile-top">
                <b>{st.unit.label || st.unit.troop}</b>
                {isPicked
                  ? <span className="vs-badge pick">✔ 揀咗</span>
                  : mineToday
                    ? <span className="vs-badge ok">🔒 呢日已登記</span>
                    : st.visited
                      ? <span className="vs-badge ok">✓ {st.count} 次</span>
                      : <span className="vs-badge no">未探</span>}
              </div>
              <div className="vs-tile-org">{st.unit.org || '—'}</div>
              {todayWho && <div className="vs-tile-hint">呢日 {todayWho} 已探過</div>}
              <div className="vs-card-sections">
                {SECTIONS.filter(k => String(st.unit.sections?.[k] || '').trim()).map(k => (
                  <span key={k} className={`vs-chip${section === k ? ' on' : ''}`}>
                    {SECTION_EMOJI[k]} {SECTION_LABEL[k]} {st.unit.sections[k]}
                  </span>
                ))}
              </div>
              <div className="vs-tile-foot">
                <span className="vs-card-last">
                  {st.visited
                    ? <>最近 {st.last}{st.visitors.length > 0 ? ` · ${st.visitors[0]}${st.visitors.length > 1 ? ' 等' : ''}` : ''}</>
                    : <span className="vs-none">今年未探過</span>}
                </span>
                {canEdit && (
                  <button
                    className="vs-detail"
                    title="填備註／跟進，或者補返以前嘅探訪"
                    onClick={e => {
                      e.stopPropagation();
                      setEditing({
                        troop: st.unit.troop, section: section || '', visitDate: date,
                        kind: 'general', visitorName: board.me.name,
                      });
                    }}
                  >✎ 詳細</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className={`vs-savebar${picked.length ? ' on' : ''}`}>
          <label className="aw-field vs-savebar-date">
            <span>探訪日期</span>
            <input type="date" value={date} max={board.today} onChange={e => setDate(e.target.value)} />
          </label>
          <span className="vs-savebar-info">
            {picked.length
              ? <>已揀 <b>{picked.length}</b> 個旅團 · {section ? SECTION_LABEL[section] : '全旅'} · 未儲存</>
              : <>撳方塊揀旅團，撳完先儲存</>}
          </span>
          {picked.length > 0 && (
            <button className="mini-btn" disabled={saving} onClick={() => setPicked([])}>清除揀選</button>
          )}
          <button className="btn-sm" disabled={!picked.length || saving} onClick={savePicked}>
            {saving ? '儲存中…' : `💾 儲存登記${picked.length ? `（${picked.length}）` : ''}`}
          </button>
        </div>
      )}

      {stats.some(s => s.visited) && (
        <div className="info-card">
          <div className="section-head">
            <div>
              <h3>最近登記</h3>
              <p>撳「編輯」可以改日期／加備註，或者刪除</p>
            </div>
          </div>
          <VisitList
            visits={visits.slice(0, 12)} units={board.units} canEdit={canEdit}
            onEdit={v => setEditing({ ...v })} token={token} reload={reload} flash={flash} setError={setError}
          />
        </div>
      )}

      {editing && (
        <VisitModal
          draft={editing} board={board} token={token}
          onClose={() => setEditing(null)}
          onSaved={async (label) => { setEditing(null); flash(label); await reload(); }}
          setError={setError}
        />
      )}
    </>
  );
}

// ───────────────────────── 📊 探訪報告 ─────────────────────────

function ReportTab({ board, section, from, to, setRange, canEdit, token, reload, flash, setError }: {
  board: VisitBoard; section: VisitSection | ''; from: string; to: string;
  setRange: (f: string, t: string) => void;
  canEdit: boolean; token: string; reload: () => Promise<void>; flash: (s: string) => void; setError: (s: string) => void;
}) {
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [editing, setEditing] = useState<Partial<Visit> | null>(null);
  const presets = useMemo(() => rangePresets(), []);

  const visits = useMemo(
    () => board.visits.filter(v => !section || !v.section || v.section === section),
    [board, section],
  );
  const people = useMemo(() => visitorStats(visits), [visits]);
  const stats = useMemo(() => troopStats(sortUnits(board.units), visits, section), [board, visits, section]);
  const cov = coverage(stats);
  const missing = stats.filter(s => !s.visited);
  const unitLabel = (troop: string) => board.units.find(u => u.troop === troop)?.label || troop;

  function exportCsv() {
    const rows: (string | number)[][] = [
      [`旅團探訪報告`, `${board.from} 至 ${board.to}`, section ? SECTION_LABEL[section] : '全部支部'],
      [],
      ['日期', '季度', '旅團', '支部', '探訪形式', '探訪幹部', '觀察／備註', '跟進事項'],
    ];
    visits.forEach(v => rows.push([
      v.visitDate, `Q${quarterOf(v.visitDate)}`, unitLabel(v.troop),
      v.section ? SECTION_LABEL[v.section as VisitSection] : '全旅',
      KIND_LABEL[v.kind as VisitKind] || '', v.visitorName || '', v.note || '', v.followUp || '',
    ]));
    rows.push([], ['幹部', '探訪次數', '探過旅團']);
    people.forEach(p => rows.push([p.name, p.count, p.troops.map(unitLabel).join('、')]));
    rows.push([], ['未探訪旅團', missing.map(m => m.unit.label).join('、') || '（全部已探）']);

    const blob = new Blob(['\ufeff' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `旅團探訪報告_${board.from}_${board.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="info-card vs-range-bar">
        <label className="aw-field"><span>由</span>
          <input type="date" value={f} onChange={e => setF(e.target.value)} />
        </label>
        <label className="aw-field"><span>到</span>
          <input type="date" value={t} onChange={e => setT(e.target.value)} />
        </label>
        <button className="btn-sm" onClick={() => setRange(f, t)}>🔍 出報告</button>
        <div className="vs-presets">
          {presets.map(p => (
            <button key={p.id} className="mini-btn" onClick={() => { setF(p.from); setT(p.to); setRange(p.from, p.to); }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="info-card">
        <div className="section-head">
          <div>
            <h3>📋 {board.from} 至 {board.to}（{section ? SECTION_LABEL[section] : '全部支部'}）</h3>
            <p>共 {visits.length} 次探訪 · 覆蓋 {cov.visited}/{cov.total} 旅（{cov.percent}%）· 未探 {missing.length} 旅</p>
          </div>
          <button className="mini-btn" onClick={exportCsv} disabled={visits.length === 0}>⬇ 匯出報告 CSV</button>
        </div>
        <VisitList
          visits={visits} units={board.units} canEdit={canEdit} showAll
          onEdit={v => setEditing({ ...v })} token={token} reload={reload} flash={flash} setError={setError}
        />
      </div>

      <div className="info-card">
        <div className="section-head">
          <div><h3>👥 邊個幹部探咗幾多</h3><p>期間內按探訪次數排</p></div>
        </div>
        {people.length === 0 ? <p className="empty">呢段期間未有探訪記錄</p> : (
          <div className="mtx-scroll">
            <table className="perm-table">
              <thead><tr><th>幹部</th><th>次數</th><th>最近</th><th>探過邊啲旅</th></tr></thead>
              <tbody>
                {people.map((p, i) => (
                  <tr key={p.name}>
                    <td><b>{i === 0 && p.count > 0 ? '🏅 ' : ''}{p.name}</b></td>
                    <td><span className="vs-badge ok">{p.count} 次</span></td>
                    <td>{p.last}</td>
                    <td>
                      <div className="aw-chips">
                        {p.troops.map(tr => <span key={tr} className="aw-chip">{unitLabel(tr)}</span>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {missing.length > 0 && (
        <div className="info-card aw-warn">
          <b>🔴 仲有 {missing.length} 旅未探過（{section ? SECTION_LABEL[section] : '全部支部'}）</b>
          <div className="aw-chips">
            {missing.map(m => <span key={m.unit.troop} className="aw-chip">{m.unit.label}</span>)}
          </div>
        </div>
      )}

      {editing && (
        <VisitModal
          draft={editing} board={board} token={token}
          onClose={() => setEditing(null)}
          onSaved={async (label) => { setEditing(null); flash(label); await reload(); }}
          setError={setError}
        />
      )}
    </>
  );
}

// ───────────────────────── 記錄列表 ─────────────────────────

function VisitList({ visits, units, canEdit, showAll, onEdit, token, reload, flash, setError }: {
  visits: Visit[]; units: ScoutUnit[]; canEdit: boolean; showAll?: boolean;
  onEdit: (v: Visit) => void;
  token: string; reload: () => Promise<void>; flash: (s: string) => void; setError: (s: string) => void;
}) {
  const [busy, setBusy] = useState('');
  const label = (troop: string) => units.find(u => u.troop === troop)?.label || troop;

  async function remove(v: Visit) {
    if (!confirm(`刪除 ${v.visitDate} ${label(v.troop)} 嘅探訪記錄？`)) return;
    setBusy(v.id);
    const r = await api.deleteVisit(token, v.id);
    setBusy('');
    if (r.ok) { flash('已刪除'); await reload(); } else setError(r.error || '刪除失敗');
  }

  if (visits.length === 0) return <p className="empty">未有探訪記錄</p>;

  return (
    <div className="mtx-scroll">
      <table className="perm-table">
        <thead>
          <tr>
            <th>日期</th><th>旅團</th><th>支部</th><th>形式</th><th>幹部</th>
            {showAll && <th>觀察／跟進</th>}
            {canEdit && <th></th>}
          </tr>
        </thead>
        <tbody>
          {visits.map(v => (
            <tr key={v.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{v.visitDate}<span className="aw-tag">Q{quarterOf(v.visitDate)}</span></td>
              <td><b>{label(v.troop)}</b></td>
              <td>{v.section ? `${SECTION_EMOJI[v.section as VisitSection]} ${SECTION_LABEL[v.section as VisitSection]}` : '全旅'}</td>
              <td>{KIND_LABEL[v.kind as VisitKind] || '—'}</td>
              <td>{v.visitorName || '—'}</td>
              {showAll && (
                <td>
                  {v.note || '—'}
                  {v.followUp && <div className="aw-note-sm">跟進：{v.followUp}</div>}
                </td>
              )}
              {canEdit && (
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="mini-btn" onClick={() => onEdit(v)}>編輯</button>{' '}
                  <button className="lock-btn" disabled={busy === v.id} onClick={() => remove(v)}>刪除</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────── 登記彈窗 ─────────────────────────

function VisitModal({ draft, board, token, onClose, onSaved, setError }: {
  draft: Partial<Visit>; board: VisitBoard; token: string;
  onClose: () => void; onSaved: (label: string) => void; setError: (s: string) => void;
}) {
  const [d, setD] = useState<Partial<Visit>>({ ...draft });
  const [saving, setSaving] = useState(false);
  const unit = board.units.find(u => u.troop === d.troop);
  const openSections = SECTIONS.filter(k => String(unit?.sections?.[k] || '').trim());

  async function save() {
    if (!d.troop) { setError('請揀旅團'); return; }
    // 一日一個旅一次：同一日同一個幹部唔可以有兩筆（改緊舊記錄嗰筆唔計）
    const date = d.visitDate || todayStr();
    const who = d.visitorName || board.me.name;
    const dup = visitsOn(board.visits, d.troop, date, who).filter(v => v.id !== d.id);
    if (dup.length) {
      setError(`${unit?.label || d.troop} 喺 ${date} 已經有一筆（${who}）—— 同一日唔使登記兩次，可以喺「最近登記」度改嗰筆。`);
      return;
    }
    setSaving(true);
    const r = await api.saveVisit(token, {
      id: d.id, troop: d.troop, section: d.section || '',
      visitDate: d.visitDate || todayStr(), kind: (d.kind as VisitKind) || 'general',
      visitorName: d.visitorName || board.me.name,
      note: d.note || '', followUp: d.followUp || '',
    });
    setSaving(false);
    if (r.ok) onSaved(`已登記：${unit?.label || d.troop}（${d.visitDate}）✓`);
    else setError(r.error || '儲存失敗');
  }

  return (
    <div className="inc-modal" onClick={onClose}>
      <div className="inc-modal-box aw-modal" onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>{d.id ? '改探訪記錄' : '登記探訪'}</h3>
        <p className="page-sub" style={{ marginBottom: 12 }}>
          {unit?.label || d.troop}{unit?.org ? ` · ${unit.org}` : ''}
        </p>

        <div className="aw-form-grid">
          <label className="aw-field"><span>探訪日期 *</span>
            <input type="date" value={d.visitDate || ''} onChange={e => setD({ ...d, visitDate: e.target.value })} />
          </label>
          <label className="aw-field"><span>支部</span>
            <select value={d.section || ''} onChange={e => setD({ ...d, section: e.target.value as VisitSection | '' })}>
              <option value="">全旅／唔分支部</option>
              {(openSections.length ? openSections : SECTIONS).map(k => (
                <option key={k} value={k}>{SECTION_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label className="aw-field"><span>形式</span>
            <select value={d.kind || 'general'} onChange={e => setD({ ...d, kind: e.target.value as VisitKind })}>
              {VISIT_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="aw-field"><span>探訪幹部</span>
            <input
              value={d.visitorName || ''} placeholder={board.me.name}
              onChange={e => setD({ ...d, visitorName: e.target.value })}
            />
          </label>
        </div>

        <label className="aw-field" style={{ marginTop: 10 }}><span>觀察／備註</span>
          <textarea rows={2} value={d.note || ''} onChange={e => setD({ ...d, note: e.target.value })}
            placeholder="例如：集會人數 24、旅長已交周年報告" />
        </label>
        <label className="aw-field" style={{ marginTop: 8 }}><span>跟進事項</span>
          <textarea rows={2} value={d.followUp || ''} onChange={e => setD({ ...d, followUp: e.target.value })}
            placeholder="例如：需要協助招募領袖" />
        </label>

        <div className="inc-submit-actions" style={{ marginTop: 14 }}>
          <button className="mini-btn" onClick={onClose}>取消</button>
          <button className="btn-sm" disabled={saving} onClick={save}>{saving ? '儲存中…' : '✅ 儲存'}</button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── ⚙️ 旅團名單 ─────────────────────────

function UnitsTab({ board, canEdit, token, reload, flash, setError }: {
  board: VisitBoard; canEdit: boolean; token: string;
  reload: () => Promise<void>; flash: (s: string) => void; setError: (s: string) => void;
}) {
  const [rows, setRows] = useState<ScoutUnit[]>(() => sortUnits(board.units));
  const [paste, setPaste] = useState('');
  const [saving, setSaving] = useState(false);

  function setCell(i: number, patch: Partial<ScoutUnit>) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function setSec(i: number, key: VisitSection, value: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, sections: { ...r.sections, [key]: value } } : r));
  }
  function addRow() {
    setRows(prev => [...prev, { troop: '', label: '', org: '', sections: { gh: '', cub: '', scout: '', venture: '', rover: '' }, active: true }]);
  }
  function doPaste() {
    const parsed = parseUnitPaste(paste, rows);
    if (!parsed.length) { setError('解析唔到（每行第一格要有旅號數字）'); return; }
    setRows(sortUnits(parsed));
    setPaste('');
    flash(`已讀入 ${parsed.length} 個旅團，撳「儲存名單」先會寫入`);
  }
  async function save() {
    const clean = rows.filter(r => String(r.troop).trim());
    if (!clean.length) { setError('至少要有一個旅團'); return; }
    setSaving(true);
    const r = await api.saveUnits(token, clean);
    setSaving(false);
    if (r.ok) { flash(`已儲存 ${r.data?.count ?? clean.length} 個旅團`); await reload(); }
    else setError(r.error || '儲存失敗');
  }

  return (
    <>
      <div className="info-card">
        <div className="section-head">
          <div>
            <h3>全區旅團名單（{rows.length}）</h3>
            <p>預設跟港島地域官網「筲箕灣區旅團一覽表」。改咗之後，「活動知會」同「聯絡簿」嘅旅號清單都會一齊更新。</p>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="mini-btn" onClick={addRow}>＋ 加一行</button>
              <button className="btn-sm" disabled={saving} onClick={save}>{saving ? '儲存中…' : '💾 儲存名單'}</button>
            </div>
          )}
        </div>

        <div className="mtx-scroll">
          <table className="perm-table vs-units">
            <thead>
              <tr>
                <th>旅號</th><th>旅團名稱</th><th>主辦機構</th>
                {SECTIONS.map(k => <th key={k}>{SECTION_LABEL[k]}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((u, i) => (
                <tr key={i}>
                  <td><input value={u.troop} disabled={!canEdit} onChange={e => setCell(i, { troop: e.target.value })} style={{ width: 62 }} /></td>
                  <td><input value={u.label} disabled={!canEdit} onChange={e => setCell(i, { label: e.target.value })} style={{ width: 130 }} /></td>
                  <td><input value={u.org || ''} disabled={!canEdit} onChange={e => setCell(i, { org: e.target.value })} style={{ width: 200 }} /></td>
                  {SECTIONS.map(k => (
                    <td key={k}>
                      <input
                        value={u.sections?.[k] || ''} disabled={!canEdit}
                        onChange={e => setSec(i, k, e.target.value)}
                        style={{ width: 54 }} placeholder="—"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fps-help" style={{ marginTop: 8 }}>
          支部格入面填「團數」（例如 1、2、1+A1）；留空 = 冇開嗰個支部，探訪頁就唔會列出。
        </p>
      </div>

      {canEdit && (
        <div className="info-card">
          <div className="section-head">
            <div>
              <h3>由官網／Excel 貼上</h3>
              <p>每行：旅號（可連旅名） · 主辦機構 · 小童軍 · 幼童軍 · 童軍 · 深資 · 樂行</p>
            </div>
            <button className="mini-btn" disabled={!paste.trim()} onClick={doPaste}>🔍 讀入</button>
          </div>
          <textarea
            className="aw-paste" rows={5} value={paste} onChange={e => setPaste(e.target.value)}
            placeholder={'港島第206旅\t太古城物業管理聯絡議會\t1\t1\t1\t1\t'}
          />
        </div>
      )}
    </>
  );
}
