'use client';
/**
 * 🏕 本區旅團聯絡名單（聯絡簿 › 旅團，v4.33.0）
 * 旅號／主辦機構／支部由全區旅團名單自動帶出；旅長姓名、電話、電郵逐旅填寫，
 * 亦可以由 Excel／WhatsApp 一次過貼上（同「旅團資料」嘅貼上方式一樣）。
 * 資料存於 TroopContacts（contactRole = gsl），只經 troopContacts 權限行讀寫，
 * 成員系統睇唔到。集會時間地點唔收錄。
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { TroopContactsBoard } from '@/lib/types';
import { activeSections, SECTION_LABEL } from '@/lib/visits';
import {
  applyLeaderEntries, buildLeaderRows, isRowDirty, leaderProblem, LEADER_PROBLEM_LABEL, parseLeaderPaste,
  telLink, trimFields, type LeaderFields, type LeaderRow,
} from '@/lib/troopLeaders';

const PASTE_PLACEHOLDER = '港島第17旅\t林志傑\t9456 7890\tgsl17@example.com\n206\t張國強\t9123 4567\tgsl206@example.com';

export default function TroopLeaderList({ token, q }: { token: string; q: string }) {
  const [board, setBoard] = useState<TroopContactsBoard | null>(null);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [paste, setPaste] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true); setErrors([]);
    try {
      const r = await api.getTroopContacts(token);
      if (r.ok && r.data) {
        setBoard(r.data);
        setRows(buildLeaderRows(r.data.units, r.data.contacts, u => activeSections(u)));
      } else setErrors([r.error || '讀取失敗；請確認 GS 已更新至 v4.32.0、執行 setupSheets() 並重新部署。']);
    } catch { setErrors(['連線失敗，請稍後再試。']); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  // 支部 ADC 只係睇（後台只准改自己支部，旅長屬全旅）
  const canEdit = board?.canEdit === true && !board?.scopeSection;
  const dirtyRows = useMemo(() => rows.filter(isRowDirty), [rows]);
  const shown = rows.filter(r => !q || [r.troop, r.label, r.org, r.value.name, r.value.phone, r.value.email]
    .join(' ').toLowerCase().includes(q.toLowerCase()));

  function setField(troop: string, key: keyof LeaderFields, value: string) {
    setRows(prev => prev.map(r => (r.troop === troop ? { ...r, value: { ...r.value, [key]: value } } : r)));
  }

  function doPaste() {
    const parsed = parseLeaderPaste(paste);
    if (!parsed.entries.length) { setErrors(parsed.errors.length ? parsed.errors : ['解析唔到，請檢查格式（每行第一格要有旅號）']); setMsg(''); return; }
    const res = applyLeaderEntries(rows, parsed.entries);
    setRows(res.rows);
    setPaste('');
    setErrors([...parsed.errors, ...res.errors]);
    setMsg(`已讀入 ${res.applied} 旅，撳「💾 儲存」先會寫入`);
  }

  function discard() {
    if (dirtyRows.length && !window.confirm('未儲存的修改會被放棄，確定還原？')) return;
    setMsg(''); load();
  }

  async function save() {
    if (!dirtyRows.length) return;
    // 先全部檢查；有問題就一個都唔寫，免得半寫半唔寫
    const blocked: string[] = [];
    dirtyRows.forEach(r => {
      const p = leaderProblem(r.value);
      if (p === 'noName' || p === 'noContact' || p === 'badEmail') blocked.push(`第 ${r.troop} 旅：${LEADER_PROBLEM_LABEL[p]}`);
    });
    if (blocked.length) { setErrors(['請先修正以下旅團，未有任何內容被儲存：', ...blocked]); return; }

    setSaving(true); setErrors([]); setMsg('');
    let done = 0;
    const fails: string[] = [];
    for (const r of dirtyRows) {
      const f = trimFields(r.value);
      const p = leaderProblem(f);
      let res: { ok: boolean; error?: string };
      if (p === 'clear') {
        if (!r.contactId) { done++; continue; }
        res = await api.deleteTroopContact(token, r.contactId);
      } else {
        res = await api.saveTroopContact(token, {
          ...(r.contactId ? { id: r.contactId } : {}),
          troop: r.troop, contactRole: 'gsl', section: '', unitCode: '',
          name: f.name, phone: f.phone, email: f.email, note: r.note, active: r.recordActive,
        });
      }
      if (res.ok) done++;
      else fails.push(`第 ${r.troop} 旅：${res.error || '儲存失敗'}`);
    }
    setSaving(false);
    if (fails.length) setErrors([`已儲存 ${done} 旅，以下失敗：`, ...fails]);
    else setMsg(`已儲存 ${done} 旅旅長資料 ✓`);
    await load();
  }

  return (
    <section className="info-card" aria-label="本區旅團聯絡名單">
      <div className="section-head">
        <div>
          <h3>🏕 本區旅團聯絡 <small>({shown.length}{q ? ` / ${rows.length}` : ''})</small></h3>
          <p>
            旅號、主辦機構、支部由旅團名單自動帶出；旅長電話及電郵為私隱資料，只顯示予有「旅團聯絡」權限嘅人，成員系統睇唔到。
            {board?.scopeSection ? '你負責嘅支部只可睇，唔可以改。' : canEdit ? '' : '（唯讀）'}
          </p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="mini-btn" disabled={saving || !dirtyRows.length} onClick={discard}>↺ 還原</button>
            <button className="btn-sm" disabled={saving || !dirtyRows.length} onClick={save}>
              {saving ? '儲存中…' : `💾 儲存${dirtyRows.length ? `（${dirtyRows.length} 旅）` : ''}`}
            </button>
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div role="alert" className="err" style={{ whiteSpace: 'pre-line' }}>{errors.join('\n')}</div>
      )}
      {msg && <div role="status" className="success">{msg}</div>}

      {loading ? <div className="center"><div className="spinner" /></div> : (
        <>
          {canEdit && (
            <div className="info-card" style={{ margin: '12px 0', background: '#f8fafc' }}>
              <div className="section-head">
                <div>
                  <h3 style={{ fontSize: 15 }}>📋 貼上旅長資料</h3>
                  <p className="fps-help">每行一旅：旅號 · 旅長姓名 · 電話 · 電郵（Tab、逗號或空格分隔，次序唔拘；由 Excel 直接複製得）。貼上會覆蓋該旅現有嘅旅長資料，撳「💾 儲存」先寫入。</p>
                </div>
                <button className="mini-btn" disabled={!paste.trim()} onClick={doPaste}>🔍 讀入</button>
              </div>
              <textarea className="aw-paste" rows={4} value={paste} onChange={e => setPaste(e.target.value)} placeholder={PASTE_PLACEHOLDER} />
            </div>
          )}

          {rows.length === 0 ? (
            <p className="empty">未有旅團名單，請先到「旅團 → 旅團資料」設定旅團。</p>
          ) : shown.length === 0 ? (
            <p className="empty">冇符合「{q}」嘅旅團</p>
          ) : (
            <div className="mtx-scroll">
              <table className="perm-table dir-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>旅號</th>
                    <th style={{ textAlign: 'left' }}>主辦機構</th>
                    <th style={{ textAlign: 'left' }}>支部</th>
                    <th style={{ textAlign: 'left' }}>旅長</th>
                    <th style={{ textAlign: 'left' }}>電話</th>
                    <th style={{ textAlign: 'left' }}>電郵</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(r => {
                    const dirty = isRowDirty(r);
                    const problem = dirty ? leaderProblem(r.value) : 'ok';
                    const issue = problem === 'noName' || problem === 'noContact' || problem === 'badEmail' ? LEADER_PROBLEM_LABEL[problem] : '';
                    return (
                      <tr key={r.troop} style={{ opacity: r.unitActive ? 1 : 0.55, background: dirty ? '#fffbeb' : undefined }}>
                        <td style={{ textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {r.label}{!r.unitActive && <span className="aw-tag">已停用</span>}
                        </td>
                        <td style={{ textAlign: 'left' }}>{r.org || '—'}</td>
                        <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                          {r.sections.length ? r.sections.map(s => SECTION_LABEL[s]).join('、') : '—'}
                        </td>
                        <td style={{ textAlign: 'left' }}>
                          {canEdit ? (
                            <>
                              <input value={r.value.name} maxLength={100} aria-label={`${r.label} 旅長姓名`} placeholder="姓名"
                                onChange={e => setField(r.troop, 'name', e.target.value)} style={{ width: 130 }} />
                              {issue && <div style={{ color: '#b91c1c', fontSize: 12 }}>⚠ {issue}</div>}
                            </>
                          ) : (r.value.name || '—')}
                        </td>
                        <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                          {canEdit ? (
                            <input type="tel" value={r.value.phone} maxLength={60} aria-label={`${r.label} 旅長電話`} placeholder="電話"
                              onChange={e => setField(r.troop, 'phone', e.target.value)} style={{ width: 120 }} />
                          ) : (r.value.phone ? <a href={telLink(r.value.phone)}>{r.value.phone}</a> : '—')}
                        </td>
                        <td style={{ textAlign: 'left' }}>
                          {canEdit ? (
                            <input type="email" value={r.value.email} maxLength={200} aria-label={`${r.label} 旅長電郵`} placeholder="電郵"
                              onChange={e => setField(r.troop, 'email', e.target.value)} style={{ width: 200 }} />
                          ) : (r.value.email ? <a href={`mailto:${r.value.email}`}>{r.value.email}</a> : '—')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
