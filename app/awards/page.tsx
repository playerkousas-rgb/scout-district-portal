'use client';
/**
 * 🎖 獎勵提名（v4.7.0）
 *
 * 一站式：名冊（Awards 表）＋ 年期規則（AwardTypes 表）＋ 每年「夠期可提名」自動推算。
 * 年期／獎項名稱全部可以喺「年期設定」頁改，唔使改程式、唔使重新部署。
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { isSuper } from '@/lib/levels';
import type { AwardMember, AwardType, AwardRound, AwardsBoard } from '@/lib/types';
import {
  ROUND_LABEL, ROUND_HINT, STATUS_LABEL, awardYear, isUncertain, hasAward,
  nominationBoard, deadlines, daysUntil, parseAwardPaste, toCsv, shortLabel,
} from '@/lib/awards';
import BackLink, { BackBar } from '@/components/BackLink';

type Tab = 'nominate' | 'roster' | 'rules' | 'import';
const TABS: { id: Tab; label: string }[] = [
  { id: 'nominate', label: '🏅 提名建議' },
  { id: 'roster', label: '📋 獎勵名冊' },
  { id: 'rules', label: '⚙️ 年期設定' },
  { id: 'import', label: '⬆️ 匯入名單' },
];

const STATUS_OPTIONS = ['active', 'applying', 'noAppointment', 'notInDistrict', 'left'];

function emptyMember(): Partial<AwardMember> {
  return { id: '', name: '', troop: '', position: '', status: 'active', note: '', awards: {} };
}

export default function AwardsPage() {
  const session = useRequireCard('awards');
  const [board, setBoard] = useState<AwardsBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [needUpgrade, setNeedUpgrade] = useState(false);
  const [tab, setTab] = useState<Tab>('nominate');

  useEffect(() => {
    if (!session) return;
    if (isSuper(session)) { setCanEdit(true); return; }
    (async () => {
      const r = await api.getCards(session.token);
      if (r.ok && r.data) setCanEdit(r.data.some(c => c.cardId === 'awards' && c.access === 'edit'));
    })().catch(() => { /* ignore */ });
  }, [session]);

  async function load() {
    if (!session) return;
    setLoading(true); setError('');
    const r = await api.getAwardsBoard(session.token);
    if (r.ok && r.data) { setBoard(r.data); setNeedUpgrade(false); }
    else {
      setError(r.error || '讀取失敗');
      if ((r.error || '').includes('Awards') || (r.error || '').includes('未知')) setNeedUpgrade(true);
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);

  function flash(text: string) { setMsg(text); setTimeout(() => setMsg(''), 3200); }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🎖 獎勵提名</h1>
      <p className="page-sub">
        區會獎勵名冊 · 自動計邊個夠期可以提名下一級 · 年期同獎項名稱可自己改
      </p>

      {error && !needUpgrade && <div className="err">{error}</div>}
      {msg && <div className="success">{msg}</div>}

      {needUpgrade && (
        <div className="info-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <h3>⚠️ 後台未升級到 v4.7.0</h3>
          <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
            請去「📢 更新 / 下載」下載最新 <code>Code.gs</code> 貼上 Apps Script →
            執行 <code>setupSheets()</code>（會自動建立 <code>Awards</code> 同 <code>AwardTypes</code> 兩張表，
            唔會清走現有資料）→ 重新部署。
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
          {tab === 'nominate' && <NominateTab board={board} />}
          {tab === 'roster' && (
            <RosterTab
              board={board} canEdit={canEdit} busy={busy} setBusy={setBusy}
              token={session.token} reload={load} flash={flash} setError={setError}
            />
          )}
          {tab === 'rules' && (
            <RulesTab
              board={board} canEdit={canEdit} token={session.token}
              reload={load} flash={flash} setError={setError}
            />
          )}
          {tab === 'import' && (
            <ImportTab
              board={board} canEdit={canEdit} token={session.token}
              reload={load} flash={flash} setError={setError}
            />
          )}
        </>
      )}

      <BackBar />
    </>
  );
}

// ───────────────────────── 🏅 提名建議 ─────────────────────────

function NominateTab({ board }: { board: AwardsBoard }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear + 1);
  const [includeInactive, setIncludeInactive] = useState(false);

  const buckets = useMemo(
    () => nominationBoard(board.members, board.types, year, { includeInactive }),
    [board, year, includeInactive],
  );

  function exportCsv(round: AwardRound) {
    const b = buckets.find(x => x.round === round);
    if (!b) return;
    const rows: (string | number)[][] = [['姓名', '旅團', '職位', '建議提名獎勵', '上一級獎勵', '獲獎年份', '已夠期年數']];
    b.ready.forEach(e => rows.push([
      e.member.name, e.member.troop || '', e.member.position || '',
      e.type.label, e.prevType?.label || '', e.prevYear ?? '', e.waited,
    ]));
    const blob = new Blob(['\ufeff' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${year}年${ROUND_LABEL[round]}_建議提名名單.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="info-card aw-controls">
        <label className="aw-field">
          <span>頒獎年份</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))}>
            {[thisYear, thisYear + 1, thisYear + 2, thisYear + 3].map(y => (
              <option key={y} value={y}>{y} 年</option>
            ))}
          </select>
        </label>
        <label className="aw-check">
          <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />
          連「沒有委任／不在本區」都計埋
        </label>
        <span className="aw-controls-hint">
          名冊共 {board.total} 人 · 規則以「年期設定」為準
        </span>
      </div>

      {buckets.map(b => {
        const dl = deadlines(b.round, year);
        const dDistrict = dl ? daysUntil(dl.district) : 0;
        return (
          <div key={b.round} className="info-card">
            <div className="section-head">
              <div>
                <h3>{ROUND_LABEL[b.round]}</h3>
                <p>{ROUND_HINT[b.round]}</p>
              </div>
              {b.ready.length > 0 && (
                <button className="mini-btn" onClick={() => exportCsv(b.round)}>⬇ 匯出名單</button>
              )}
            </div>

            {dl && (
              <div className={`aw-deadline${dDistrict < 0 ? ' past' : dDistrict < 45 ? ' soon' : ''}`}>
                <b>提名截止</b>
                <span>區部 → 地域：{dl.district}</span>
                <span>總會：{dl.hq}</span>
                <span className="aw-dl-count">
                  {dDistrict < 0 ? `區部死線已過 ${-dDistrict} 日` : `距區部死線 ${dDistrict} 日`}
                </span>
              </div>
            )}

            {b.ready.length === 0 ? (
              <p className="empty">冇人喺 {year} 年夠期（可改上面年份睇下一年）</p>
            ) : (
              <div className="mtx-scroll">
                <table className="perm-table aw-table">
                  <thead>
                    <tr>
                      <th>姓名</th><th>旅團</th><th>職位</th>
                      <th>建議提名</th><th>上一級</th><th>已夠期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.ready.map(e => (
                      <tr key={e.member.id + e.type.code}>
                        <td><b>{e.member.name}</b>{e.member.status !== 'active' && <span className="aw-tag">{STATUS_LABEL[e.member.status || 'active']}</span>}</td>
                        <td>{e.member.troop || '—'}</td>
                        <td>{e.member.position || '—'}</td>
                        <td><span className="aw-chip on">{e.type.label}</span></td>
                        <td>
                          {e.prevType ? `${shortLabel(e.prevType)} ${e.prevYear}` : '—'}
                          {e.uncertain && <span className="aw-tag warn">年份未確定</span>}
                        </td>
                        <td>{e.waited === 0 ? '啱啱夠' : `已過 ${e.waited} 年`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {b.soon.length > 0 && (
              <details className="aw-soon">
                <summary>未夠期，但兩年內會夠（{b.soon.length}）</summary>
                <ul>
                  {b.soon.map(e => (
                    <li key={e.member.id + e.type.code}>
                      {e.member.name}
                      {e.member.troop ? `（${e.member.troop}）` : ''} —
                      {' '}{e.type.label}，最快 <b>{e.eligibleYear}</b> 年
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}

      <div className="info-card aw-note">
        <b>點計出嚟？</b> 未有嗰個獎 + 已有上一級 + （上一級年份 ＋ 設定年期）≤ 頒獎年份。
        入門級獎項（例如優良服務獎章、感謝狀）冇「上一級」，唔會自動推算，要自己揀人提名。
      </div>
    </>
  );
}

// ───────────────────────── 📋 名冊 ─────────────────────────

function RosterTab({ board, canEdit, busy, setBusy, token, reload, flash, setError }: {
  board: AwardsBoard; canEdit: boolean; busy: string; setBusy: (v: string) => void;
  token: string; reload: () => Promise<void>; flash: (s: string) => void; setError: (s: string) => void;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [awardFilter, setAwardFilter] = useState('');
  const [editing, setEditing] = useState<Partial<AwardMember> | null>(null);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return board.members.filter(m => {
      if (status && (m.status || 'active') !== status) return false;
      if (awardFilter && !hasAward(m, awardFilter)) return false;
      if (!kw) return true;
      return [m.name, m.nameEn, m.troop, m.position, m.note].some(v => String(v || '').toLowerCase().includes(kw));
    }).sort((a, b) => (a.troop || '').localeCompare(b.troop || '') || a.name.localeCompare(b.name));
  }, [board, q, status, awardFilter]);

  const shownTypes = board.types.filter(t => t.enabled !== false);

  async function remove(m: AwardMember) {
    if (!confirm(`確定刪除「${m.name}」？呢個動作唔可以還原。`)) return;
    setBusy(m.id);
    const r = await api.deleteAwardMember(token, m.id);
    setBusy('');
    if (r.ok) { flash('已刪除 ' + m.name); await reload(); } else setError(r.error || '刪除失敗');
  }

  function exportRoster() {
    const head = ['姓名', '旅團', '職位', '狀態', ...shownTypes.map(t => t.label), '備註'];
    const rows: (string | number)[][] = [head];
    list.forEach(m => rows.push([
      m.name, m.troop || '', m.position || '', STATUS_LABEL[m.status || 'active'],
      ...shownTypes.map(t => m.awards?.[t.code] || ''), m.note || '',
    ]));
    const blob = new Blob(['\ufeff' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '區會獎勵名冊.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="info-card aw-controls">
        <input
          className="search-input" style={{ maxWidth: 240 }}
          placeholder="搜尋姓名／旅團／職位…" value={q} onChange={e => setQ(e.target.value)}
        />
        <label className="aw-field">
          <span>狀態</span>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">全部</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="aw-field">
          <span>已有獎項</span>
          <select value={awardFilter} onChange={e => setAwardFilter(e.target.value)}>
            <option value="">不限</option>
            {shownTypes.map(t => <option key={t.code} value={t.code}>{t.label}（{board.counts[t.code] || 0}）</option>)}
          </select>
        </label>
        <span className="aw-controls-hint">顯示 {list.length} / {board.total} 人</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="mini-btn" onClick={exportRoster}>⬇ 匯出</button>
          {canEdit && <button className="btn-sm" onClick={() => setEditing(emptyMember())}>＋ 新增成員</button>}
        </div>
      </div>

      <div className="mtx-scroll">
        <table className="perm-table aw-table">
          <thead>
            <tr>
              <th className="aw-sticky">姓名</th>
              <th>旅團</th><th>職位</th><th>獎項</th>{canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={5} className="empty">冇資料（可以去「⬆️ 匯入名單」貼上你份 Excel）</td></tr>}
            {list.map(m => (
              <tr key={m.id}>
                <td className="aw-sticky">
                  <b>{m.name}</b>
                  {(m.status && m.status !== 'active') && <span className="aw-tag">{STATUS_LABEL[m.status]}</span>}
                  {m.note && <div className="aw-note-sm">{m.note}</div>}
                </td>
                <td>{m.troop || '—'}</td>
                <td>{m.position || '—'}</td>
                <td>
                  <div className="aw-chips">
                    {shownTypes.filter(t => m.awards?.[t.code]).map(t => (
                      <span key={t.code} className={`aw-chip${isUncertain(m.awards[t.code]) ? ' q' : ''}`} title={t.label}>
                        {shortLabel(t)} {m.awards[t.code]}
                      </span>
                    ))}
                    {Object.keys(m.awards || {}).length === 0 && <span className="aw-none">未有記錄</span>}
                  </div>
                </td>
                {canEdit && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="mini-btn" onClick={() => setEditing({ ...m, awards: { ...m.awards } })}>編輯</button>{' '}
                    <button className="lock-btn" disabled={busy === m.id} onClick={() => remove(m)}>刪除</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <MemberModal
          draft={editing} types={board.types} token={token}
          onClose={() => setEditing(null)}
          onSaved={async (name) => { setEditing(null); flash('已儲存 ' + name); await reload(); }}
          setError={setError}
        />
      )}
    </>
  );
}

function MemberModal({ draft, types, token, onClose, onSaved, setError }: {
  draft: Partial<AwardMember>; types: AwardType[]; token: string;
  onClose: () => void; onSaved: (name: string) => void; setError: (s: string) => void;
}) {
  const [d, setD] = useState<Partial<AwardMember>>({ ...draft, awards: { ...(draft.awards || {}) } });
  const [saving, setSaving] = useState(false);
  const cats = [...new Set(types.filter(t => t.enabled !== false).map(t => t.category || '其他'))];

  function setAward(code: string, value: string) {
    setD(prev => ({ ...prev, awards: { ...(prev.awards || {}), [code]: value } }));
  }

  async function save() {
    if (!String(d.name || '').trim()) { setError('姓名必填'); return; }
    setSaving(true);
    const r = await api.saveAwardMember(token, d);
    setSaving(false);
    if (r.ok) onSaved(String(d.name)); else setError(r.error || '儲存失敗');
  }

  return (
    <div className="inc-modal" onClick={onClose}>
      <div className="inc-modal-box aw-modal" onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 12 }}>{d.id ? '編輯成員' : '新增成員'}</h3>

        <div className="aw-form-grid">
          <label className="aw-field"><span>姓名 *</span>
            <input value={d.name || ''} onChange={e => setD({ ...d, name: e.target.value })} />
          </label>
          <label className="aw-field"><span>英文名</span>
            <input value={d.nameEn || ''} onChange={e => setD({ ...d, nameEn: e.target.value })} />
          </label>
          <label className="aw-field"><span>旅團</span>
            <input value={d.troop || ''} onChange={e => setD({ ...d, troop: e.target.value })} placeholder="206" />
          </label>
          <label className="aw-field"><span>職位</span>
            <input value={d.position || ''} onChange={e => setD({ ...d, position: e.target.value })} placeholder="GSL / ASL / LAY" />
          </label>
          <label className="aw-field"><span>狀態</span>
            <select value={d.status || 'active'} onChange={e => setD({ ...d, status: e.target.value as AwardMember['status'] })}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="aw-field"><span>備註</span>
            <input value={d.note || ''} onChange={e => setD({ ...d, note: e.target.value })} placeholder="86th since 2004/01/15" />
          </label>
        </div>

        <p className="aw-hint">獲獎年份直接填四位數字；未確定可以喺後面加「?」，冇獲過就留空。</p>

        {cats.map(cat => (
          <div key={cat} className="aw-cat">
            <h4>{cat}</h4>
            <div className="aw-award-grid">
              {types.filter(t => t.enabled !== false && (t.category || '其他') === cat).map(t => (
                <label key={t.code} className="aw-field" title={t.note || t.label}>
                  <span>{t.label}</span>
                  <input
                    value={d.awards?.[t.code] || ''} placeholder="—"
                    onChange={e => setAward(t.code, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="inc-submit-actions" style={{ marginTop: 16 }}>
          <button className="btn-sm" disabled={saving} onClick={save}>{saving ? '儲存中…' : '儲存'}</button>
          <button className="lock-btn" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── ⚙️ 年期設定 ─────────────────────────

function RulesTab({ board, canEdit, token, reload, flash, setError }: {
  board: AwardsBoard; canEdit: boolean; token: string;
  reload: () => Promise<void>; flash: (s: string) => void; setError: (s: string) => void;
}) {
  const [rows, setRows] = useState<AwardType[]>(board.types.map(t => ({ ...t })));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setRows(board.types.map(t => ({ ...t }))); }, [board.types]);

  function patch(i: number, key: keyof AwardType, value: unknown) {
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } as AwardType : r)));
  }
  function addRow() {
    setRows(prev => [...prev, { code: '', label: '', short: '', category: '其他', prevCode: '', minYears: null, round: 'other', note: '', enabled: true }]);
  }
  function removeRow(i: number) {
    if (!confirm('刪走呢個獎項？（Awards 表嗰欄唔會刪，資料仍然喺 Sheet 度）')) return;
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }
  async function save() {
    setSaving(true);
    const r = await api.saveAwardTypes(token, rows);
    setSaving(false);
    if (r.ok) {
      flash(`已儲存 ${r.data?.count ?? rows.length} 個獎項` + (r.data?.newColumns?.length ? `（Awards 表新增欄：${r.data.newColumns.join('、')}）` : ''));
      await reload();
    } else setError(r.error || '儲存失敗');
  }

  return (
    <>
      <div className="info-card aw-note">
        <b>年期點用？</b>「上一級」＋「相隔年數」＝ 最快可提名年份。
        例如優異服務獎章上一級係優良服務獎章、相隔 5 年 → 2015 年攞咗優良，2020 年就夠期。
        留空「上一級」＝ 入門級（唔會自動推算）。改完撳最底「儲存設定」即刻生效。
      </div>

      <div className="mtx-scroll">
        <table className="perm-table aw-rules">
          <thead>
            <tr>
              <th>代號</th><th>獎項名稱</th><th>短名</th><th>分類</th>
              <th>上一級</th><th>相隔年數</th><th>提名期</th><th>啟用</th><th>備註</th>{canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={i}>
                <td><input className="aw-in code" value={t.code} disabled={!canEdit} onChange={e => patch(i, 'code', e.target.value.toUpperCase())} /></td>
                <td><input className="aw-in wide" value={t.label} disabled={!canEdit} onChange={e => patch(i, 'label', e.target.value)} /></td>
                <td><input className="aw-in short" value={t.short || ''} disabled={!canEdit} onChange={e => patch(i, 'short', e.target.value)} /></td>
                <td><input className="aw-in short" value={t.category || ''} disabled={!canEdit} onChange={e => patch(i, 'category', e.target.value)} /></td>
                <td>
                  <select className="aw-in" value={t.prevCode || ''} disabled={!canEdit} onChange={e => patch(i, 'prevCode', e.target.value)}>
                    <option value="">（入門級）</option>
                    {rows.filter(x => x.code && x.code !== t.code).map(x => <option key={x.code} value={x.code}>{x.code}</option>)}
                  </select>
                </td>
                <td>
                  <input
                    className="aw-in num" type="number" min={0} max={99} disabled={!canEdit}
                    value={t.minYears == null ? '' : t.minYears}
                    onChange={e => patch(i, 'minYears', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </td>
                <td>
                  <select className="aw-in" value={t.round} disabled={!canEdit} onChange={e => patch(i, 'round', e.target.value as AwardRound)}>
                    <option value="founder">創辦人紀念日</option>
                    <option value="rally">大會操（童軍獎勵）</option>
                    <option value="other">自行申請／其他</option>
                  </select>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={t.enabled !== false} disabled={!canEdit} onChange={e => patch(i, 'enabled', e.target.checked)} />
                </td>
                <td><input className="aw-in wide" value={t.note || ''} disabled={!canEdit} onChange={e => patch(i, 'note', e.target.value)} /></td>
                {canEdit && <td><button className="lock-btn" onClick={() => removeRow(i)}>✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="inc-submit-actions" style={{ marginTop: 14 }}>
          <button className="btn-sm" disabled={saving} onClick={save}>{saving ? '儲存中…' : '💾 儲存設定'}</button>
          <button className="lock-btn" onClick={addRow}>＋ 加一個獎項</button>
          <button className="lock-btn" onClick={() => setRows(board.types.map(t => ({ ...t })))}>還原</button>
        </div>
      )}
    </>
  );
}

// ───────────────────────── ⬆️ 匯入 ─────────────────────────

function ImportTab({ board, canEdit, token, reload, flash, setError }: {
  board: AwardsBoard; canEdit: boolean; token: string;
  reload: () => Promise<void>; flash: (s: string) => void; setError: (s: string) => void;
}) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [parsed, setParsed] = useState<ReturnType<typeof parseAwardPaste> | null>(null);
  const [saving, setSaving] = useState(false);

  function doParse() {
    const r = parseAwardPaste(text, board.types);
    setParsed(r);
    if (!r.rows.length) setError('解析唔到任何一行，請確認由 Excel 直接複製（Tab 分隔）');
  }
  async function doImport() {
    if (!parsed || !parsed.rows.length) return;
    if (mode === 'replace' && !confirm('「清空重寫」會刪走名冊上所有現有記錄，確定？')) return;
    setSaving(true);
    const r = await api.importAwardMembers(token, parsed.rows, mode);
    setSaving(false);
    if (r.ok && r.data) {
      flash(`匯入完成：新增 ${r.data.added} 人、更新 ${r.data.updated} 人${r.data.skipped ? `、略過 ${r.data.skipped} 行` : ''}`);
      setText(''); setParsed(null);
      await reload();
    } else setError(r.error || '匯入失敗');
  }

  return (
    <>
      <div className="info-card">
        <div className="section-head">
          <div>
            <h3>由 Excel 貼上</h3>
            <p>喺你份獎勵 Excel 揀晒啲資料（可連表頭）→ Ctrl+C → 貼落下面個框</p>
          </div>
        </div>
        <ul className="aw-guide">
          <li>頭三欄固定當作 <b>姓名 · 旅團 · 職位</b></li>
          <li>格入面可以係 <code>GSA1985</code>、<code>LSM*2005</code>、<code>CCM2025?</code>（問號＝未確定），
            亦可以淨係年份（會靠表頭知道係邊個獎）</li>
          <li>「合併更新」＝ 同名同旅團就更新，其餘新增；「清空重寫」＝ 先刪晒再入</li>
        </ul>
        <textarea
          className="aw-paste" rows={8} value={text} disabled={!canEdit}
          onChange={e => { setText(e.target.value); setParsed(null); }}
          placeholder={'姓名\t旅團\t職位\tGSA\tDSA\tLSM\n陳大文\t206\tGSL\tGSA2001\tDSA2008\tLSM2009'}
        />
        <div className="inc-submit-actions" style={{ marginTop: 10 }}>
          <button className="mini-btn" disabled={!canEdit || !text.trim()} onClick={doParse}>🔍 解析預覽</button>
          <label className="aw-check">
            <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} /> 合併更新
          </label>
          <label className="aw-check">
            <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> 清空重寫
          </label>
        </div>
      </div>

      {parsed && (
        <div className="info-card">
          <div className="section-head">
            <div>
              <h3>預覽</h3>
              <p>共 {parsed.rows.length} 行{parsed.skipped ? `（略過 ${parsed.skipped} 行）` : ''}
                {parsed.unknown.length > 0 && ` · 認唔到嘅代號：${parsed.unknown.join('、')}`}</p>
            </div>
            <button className="btn-sm" disabled={saving || !canEdit} onClick={doImport}>
              {saving ? '匯入中…' : `✅ 確認匯入 ${parsed.rows.length} 行`}
            </button>
          </div>
          <div className="mtx-scroll">
            <table className="perm-table aw-table">
              <thead><tr><th>姓名</th><th>旅團</th><th>職位</th><th>解析到嘅獎項</th></tr></thead>
              <tbody>
                {parsed.rows.slice(0, 12).map((r, i) => (
                  <tr key={i}>
                    <td><b>{r.name}</b></td><td>{r.troop || '—'}</td><td>{r.position || '—'}</td>
                    <td>
                      <div className="aw-chips">
                        {Object.entries(r.awards || {}).map(([code, y]) => (
                          <span key={code} className="aw-chip">{code} {y}</span>
                        ))}
                        {Object.keys(r.awards || {}).length === 0 && <span className="aw-none">冇</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > 12 && <p className="aw-hint">…另外仲有 {parsed.rows.length - 12} 行</p>}
        </div>
      )}
    </>
  );
}
