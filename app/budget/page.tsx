'use client';
/**
 * 📑 區年度預算（v4.5.0）
 * ─────────────────────────────────────────────────────────────────────
 * 資料來源：區方 Google Sheet「2025-26 Year Plan」（月份／支部／活動／原收費／人數／區資助／CC submission／
 * 類別碼／支部碼／狀態）。由 /api/external?kind=budget 伺服器端讀 gviz CSV（Sheet 需「知道連結可查看」），
 * Config `BUDGET_SHEET_URL` 可換另一張表／另一個年度分頁；DC 照舊喺 Excel／Sheet 改，呢度即時反映。
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import BackLink, { BackBar } from '@/components/BackLink';
import { SOURCES } from '@/lib/externalSources';
import {
  BUDGET_TYPE_LABEL, budgetStatusKind, type BudgetRow, type BudgetSummary,
} from '@/lib/externalParsers';

type View = 'month' | 'section' | 'list';
const VIEWS: { id: View; label: string }[] = [
  { id: 'month', label: '📅 按月份' },
  { id: 'section', label: '🧩 按支部' },
  { id: 'list', label: '📋 全部活動' },
];
const SECTION_ORDER = ['小童軍', '幼童軍', '童軍', '深資童軍', '樂行童軍', '領袖', '跨支部'];
const STATUS_LABEL: Record<string, string> = { done: '✅ 已完成', progress: '🔄 進行中', no: '⏸ 未舉行', cancel: '✖ 取消／保留', '': '' };

function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-HK', { maximumFractionDigits: 0 })}`;
}
function monthLabel(m: string): string {
  const x = /^(\d{4})-(\d{2})$/.exec(m);
  return x ? `${x[1]} 年 ${parseInt(x[2], 10)} 月` : m;
}
function fiscalLabel(rows: BudgetRow[]): string {
  const ms = rows.map(r => r.month).filter(m => /^\d{4}-\d{2}$/.test(m)).sort();
  if (!ms.length) return '';
  return `${monthLabel(ms[0])} – ${monthLabel(ms[ms.length - 1])}`;
}
function sectionRank(s: string): number { const i = SECTION_ORDER.indexOf(s); return i < 0 ? 99 : i; }

function StatusChip({ s }: { s: string }) {
  const k = budgetStatusKind(s);
  if (!k) return <span className="muted">—</span>;
  return <span className={`bud-status ${k}`} title={s}>{STATUS_LABEL[k]}</span>;
}

function ActivityTable({ rows, showMonth = true, showSection = true }: { rows: BudgetRow[]; showMonth?: boolean; showSection?: boolean }) {
  if (!rows.length) return <p className="muted" style={{ fontSize: 13, padding: '6px 0' }}>此範圍未有活動。</p>;
  return (
    <div className="mtx-scroll">
      <table className="perm-table bud-table">
        <thead>
          <tr>
            {showMonth && <th style={{ textAlign: 'left' }}>月份</th>}
            {showSection && <th style={{ textAlign: 'left' }}>支部</th>}
            <th style={{ textAlign: 'left' }}>活動</th>
            <th>類別</th>
            <th>原收費</th>
            <th>人數</th>
            <th>區資助</th>
            <th>CC 申報</th>
            <th>狀態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={budgetStatusKind(r.status) === 'cancel' ? 'bud-row-cancel' : ''}>
              {showMonth && <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{r.month}</td>}
              {showSection && <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{r.section}</td>}
              <td style={{ textAlign: 'left', minWidth: 200 }}>
                <b>{r.activity}</b>
                {r.notes && <div className="bud-note">{r.notes}</div>}
                {r.links.map(l => <div key={l}><a className="bud-link" href={l} target="_blank" rel="noopener">🔗 相關連結 ↗</a></div>)}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{r.typeCode ? <span className="bud-type">{BUDGET_TYPE_LABEL[r.typeCode] || r.typeCode}</span> : <span className="muted">—</span>}</td>
              <td>{r.fee || <span className="muted">—</span>}</td>
              <td>{r.headcount ?? <span className="muted">—</span>}</td>
              <td style={{ fontWeight: 700, color: (r.subsidy || 0) > 0 ? '#1d4ed8' : undefined }}>{money(r.subsidy)}</td>
              <td>{r.ccSubmission || <span className="muted">—</span>}</td>
              <td><StatusChip s={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BudgetPage() {
  const session = useRequireCard('budget');
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [summary, setSummary] = useState<BudgetSummary[]>([]);
  const [sheetUrl, setSheetUrl] = useState(SOURCES.budgetSheet);
  const [fetchedAt, setFetchedAt] = useState('');
  const [stale, setStale] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('month');
  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError('');
      let url = '';
      try {
        const cfg = await api.getConfig();
        if (cfg.ok && cfg.data?.budgetSheetUrl) url = String(cfg.data.budgetSheetUrl);
      } catch { /* 用內建 */ }
      const r = await api.extBudget(url);
      if (cancelled) return;
      if (r.ok && r.data) {
        setRows(r.data.rows); setSummary(r.data.summary);
        setSheetUrl(r.data.sheetUrl || url || SOURCES.budgetSheet);
        setFetchedAt(r.data.fetchedAt);
        setStale(r.data.stale ? (r.data.staleReason || '上游暫時無法連線') : '');
      } else {
        setError(r.error || '未能讀取預算表');
        if (url) setSheetUrl(url);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session, reloadKey]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyActive && !r.activity) return false;
      if (!ql) return true;
      return `${r.month} ${r.section} ${r.activity} ${r.notes} ${r.status} ${BUDGET_TYPE_LABEL[r.typeCode] || ''}`.toLowerCase().includes(ql);
    });
  }, [rows, q, onlyActive]);

  const months = useMemo(() => Array.from(new Set(filtered.map(r => r.month))).sort(), [filtered]);
  const sections = useMemo(() => Array.from(new Set(filtered.map(r => r.section))).sort((a, b) => sectionRank(a) - sectionRank(b)), [filtered]);

  const stats = useMemo(() => {
    const act = rows.filter(r => r.activity);
    const total = act.reduce((n, r) => n + (r.subsidy || 0), 0);
    const done = act.filter(r => budgetStatusKind(r.status) === 'done');
    const doneAmt = done.reduce((n, r) => n + (r.subsidy || 0), 0);
    const byType: Record<string, number> = {};
    act.forEach((r) => { const k = BUDGET_TYPE_LABEL[r.typeCode] || '未分類'; byType[k] = (byType[k] || 0) + (r.subsidy || 0); });
    const bySection: Record<string, number> = {};
    act.forEach((r) => { bySection[r.section] = (bySection[r.section] || 0) + (r.subsidy || 0); });
    return { count: act.length, total, doneCount: done.length, doneAmt, byType, bySection };
  }, [rows]);

  const sheetTotal = summary.find(s => /總計/.test(s.label))?.amount;

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">📑 區年度預算</h1>
      <p className="page-sub">
        直接讀取區方預算 Google Sheet{rows.length ? `（${fiscalLabel(rows)}）` : ''}；DC 照舊喺 Sheet 改，呢度即時同步。
      </p>

      <div className="bud-toolbar">
        <a className="mini-btn" href={sheetUrl} target="_blank" rel="noopener">📗 開啟 Google Sheet ↗</a>
        <button className="mini-btn ghost" onClick={() => setReloadKey(k => k + 1)} disabled={loading}>🔄 重新讀取</button>
        <span className="muted" style={{ fontSize: 12 }}>
          {fetchedAt ? `同步時間 ${new Date(fetchedAt).toLocaleString('zh-HK', { hour12: false })}` : ''}
          {stale ? ` · ⚠️ 顯示上次成功結果（${stale}）` : ''}
        </span>
      </div>

      {error && (
        <div className="err">
          ❌ {error}
          <div style={{ marginTop: 6, fontSize: 12 }}>
            請確認該 Sheet 已設定「知道連結的任何人可查看」；如要改用另一張表，喺後台 Config 加 <code>BUDGET_SHEET_URL</code>。
          </div>
        </div>
      )}

      {loading ? <div className="center"><div className="spinner" /></div> : rows.length > 0 && (
        <>
          <div className="bud-kpis">
            <div className="bud-kpi"><span>全年區資助預算</span><b>{money(sheetTotal ?? stats.total)}</b><small>{stats.count} 項活動{sheetTotal !== undefined && sheetTotal !== stats.total ? ` · 逐項合計 ${money(stats.total)}` : ''}</small></div>
            <div className="bud-kpi done"><span>已完成</span><b>{money(stats.doneAmt)}</b><small>{stats.doneCount} 項 · 佔 {stats.total ? Math.round(stats.doneAmt / stats.total * 100) : 0}%</small></div>
            <div className="bud-kpi"><span>按類別</span>
              <div className="bud-mini-list">{Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k}><em>{k}</em><b>{money(v)}</b></div>)}</div>
            </div>
            <div className="bud-kpi"><span>按支部</span>
              <div className="bud-mini-list">{Object.entries(stats.bySection).sort((a, b) => sectionRank(a[0]) - sectionRank(b[0])).map(([k, v]) => <div key={k}><em>{k}</em><b>{money(v)}</b></div>)}</div>
            </div>
          </div>

          <div className="inc-tabs" role="tablist">
            {VIEWS.map(v => (
              <button key={v.id} role="tab" aria-selected={view === v.id} className={`inc-tab ${view === v.id ? 'on' : ''}`} onClick={() => setView(v.id)}>{v.label}</button>
            ))}
            <input className="search-input dir-search" placeholder="搜尋活動／支部／狀態" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <label className="remember-row" style={{ marginTop: -6 }}>
            <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} /> 只顯示有活動嘅格（隱藏 $0 空白列）
          </label>

          {view === 'month' && months.map((m) => {
            const rs = filtered.filter(r => r.month === m).sort((a, b) => sectionRank(a.section) - sectionRank(b.section));
            const sum = rs.reduce((n, r) => n + (r.subsidy || 0), 0);
            return (
              <section className="info-card" key={m}>
                <div className="section-head"><div><h3>📅 {monthLabel(m)} <small>({rs.filter(r => r.activity).length} 項)</small></h3></div><b className="bud-sum">{money(sum)}</b></div>
                <ActivityTable rows={rs} showMonth={false} />
              </section>
            );
          })}

          {view === 'section' && sections.map((s) => {
            const rs = filtered.filter(r => r.section === s).sort((a, b) => a.month.localeCompare(b.month));
            const sum = rs.reduce((n, r) => n + (r.subsidy || 0), 0);
            return (
              <section className="info-card" key={s}>
                <div className="section-head"><div><h3>🧩 {s} <small>({rs.filter(r => r.activity).length} 項)</small></h3></div><b className="bud-sum">{money(sum)}</b></div>
                <ActivityTable rows={rs} showSection={false} />
              </section>
            );
          })}

          {view === 'list' && (
            <section className="info-card">
              <div className="section-head"><div><h3>📋 全部活動 <small>({filtered.length})</small></h3></div><b className="bud-sum">{money(filtered.reduce((n, r) => n + (r.subsidy || 0), 0))}</b></div>
              <ActivityTable rows={[...filtered].sort((a, b) => a.month.localeCompare(b.month) || sectionRank(a.section) - sectionRank(b.section))} />
            </section>
          )}

          {summary.length > 0 && (
            <section className="info-card">
              <div className="section-head"><div><h3>Σ Sheet 內合計列</h3><p>直接取自 Sheet 底部（訓練／活動／社區服務／儀式典禮／會議；各支部）。</p></div></div>
              <div className="bud-summary">
                {summary.map((s, i) => <span key={i} className={/總計/.test(s.label) ? 'total' : ''}>{s.label} <b>{money(s.amount)}</b></span>)}
              </div>
            </section>
          )}

          <p className="fps-help">
            類別碼：T 訓練 · M 會議 · A 活動 · S 社區服務 · Y 儀式典禮。狀態依 Sheet「completed／not happened／in progress／X」顯示。
            每 10 分鐘自動更新一次；按「重新讀取」可即時更新。
          </p>
        </>
      )}
      <BackBar />
    </>
  );
}
