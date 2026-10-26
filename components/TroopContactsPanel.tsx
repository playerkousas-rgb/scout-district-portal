'use client';
/**
 * 🔒 旅團聯絡（v4.32.0）— 旅長／支部團長個人聯絡資料（個人私隱）。
 * 權限行：troopContacts（👁 睇、✏️ 改，超管喺權限表設定）。
 * 後台支部過濾：支部 ADC 只收到自己支部聯絡（該旅冇該支部團長時收到旅長），前端收到咩就顯示咩。
 * 資料永不經公開 listDistrictTroops 發放，成員系統睇唔到。
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TroopContact, TroopContactRole, TroopContactsBoard, VisitSection } from '@/lib/types';
import { SECTIONS, SECTION_LABEL, SECTION_EMOJI, activeSections, sortUnits } from '@/lib/visits';

export const CONTACT_ROLE_LABEL: Record<TroopContactRole, string> = {
  gsl: '旅長',
  leader: '團長',
  assistant: '副團長',
  other: '其他',
};
const ROLES = Object.keys(CONTACT_ROLE_LABEL) as TroopContactRole[];

const emptyDraft = (): Partial<TroopContact> => ({
  troop: '', section: '', unitCode: '', contactRole: 'leader',
  name: '', phone: '', email: '', note: '', active: true,
});

export default function TroopContactsPanel({ token }: { token: string }) {
  const [board, setBoard] = useState<TroopContactsBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<Partial<TroopContact> | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const r = await api.getTroopContacts(token);
      if (r.ok && r.data) setBoard(r.data);
      else setError(r.error || '讀取失敗；請確認 GS 已更新至 v4.32.0、執行 setupSheets() 並重新部署。');
    } catch { setError('連線失敗，請稍後再試。'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const canEdit = board?.canEdit === true;
  const units = board ? sortUnits(board.units) : [];
  const unitLabel = (troop: string) => units.find(u => u.troop === troop)?.label || `第 ${troop} 旅`;

  async function save() {
    if (!editing) return;
    setSaving(true); setError('');
    const r = await api.saveTroopContact(token, editing);
    setSaving(false);
    if (r.ok) { setEditing(null); setMsg('已儲存聯絡資料 ✓'); await load(); }
    else setError(r.error || '儲存失敗');
  }
  async function remove(c: TroopContact) {
    if (!confirm(`刪除 ${unitLabel(c.troop)} ${c.name} 的聯絡紀錄？`)) return;
    setBusy(c.id); setError('');
    const r = await api.deleteTroopContact(token, c.id);
    setBusy('');
    if (r.ok) { setMsg('已刪除'); await load(); }
    else setError(r.error || '刪除失敗');
  }

  if (loading) return <div className="center"><div className="spinner" /></div>;
  return (
    <section className="info-card" aria-label="旅團聯絡（私隱）" style={{ borderLeft: '4px solid #6366f1' }}>
      <div className="section-head">
        <div>
          <h3>🔒 旅團聯絡（私隱）</h3>
          <p>
            旅長／團長個人聯絡，不會顯示於成員系統。
            {board?.scopeSection
              ? `你負責${SECTION_LABEL[board.scopeSection as VisitSection]}支部，只顯示該支部聯絡（該旅未有該支部團長時顯示旅長）。`
              : '你可查看全部旅團聯絡。'}
            {canEdit ? '' : '（唯讀）'}
          </p>
        </div>
        {canEdit && <button className="btn-sm" onClick={() => setEditing(emptyDraft())}>＋ 新增聯絡</button>}
      </div>
      {error && <div role="alert" className="err">{error}</div>}
      {msg && <div role="status" className="success">{msg}</div>}
      {!board || board.contacts.length === 0 ? <p className="empty">暫時未有聯絡資料{canEdit ? '，按「＋ 新增聯絡」開始' : ''}</p> : (
        <div className="mtx-scroll">
          <table className="perm-table">
            <thead><tr><th>旅團</th><th>支部／職銜</th><th>姓名</th><th>電話</th><th>電郵</th><th>備註</th>{canEdit && <th></th>}</tr></thead>
            <tbody>
              {board.contacts.map(c => (
                <tr key={c.id} style={c.active === false ? { opacity: 0.55 } : undefined}>
                  <td><b>{unitLabel(c.troop)}</b></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {c.section ? `${SECTION_EMOJI[c.section as VisitSection]} ${SECTION_LABEL[c.section as VisitSection]}` : '全旅'}
                    {' · '}{CONTACT_ROLE_LABEL[c.contactRole]}{c.unitCode ? `（${c.unitCode}）` : ''}
                  </td>
                  <td><b>{c.name}</b>{c.active === false && <span className="aw-tag">已停用</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.phone ? <a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a> : '—'}</td>
                  <td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</td>
                  <td>{c.note || '—'}</td>
                  {canEdit && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="mini-btn" onClick={() => setEditing({ ...c })}>編輯</button>{' '}
                      <button className="lock-btn" disabled={busy === c.id} onClick={() => remove(c)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="inc-modal" onClick={() => setEditing(null)}>
          <div className="inc-modal-box aw-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>{editing.id ? '改聯絡資料' : '新增聯絡'}</h3>
            <div className="aw-form-grid">
              <label className="aw-field"><span>旅團 *</span>
                <select value={editing.troop || ''} onChange={e => setEditing({ ...editing, troop: e.target.value, section: editing.contactRole === 'gsl' ? '' : editing.section })}>
                  <option value="">請揀旅團</option>
                  {units.map(u => <option key={u.troop} value={u.troop}>{u.label || `第 ${u.troop} 旅`}</option>)}
                </select>
              </label>
              <label className="aw-field"><span>職銜 *</span>
                <select value={editing.contactRole || 'leader'} onChange={e => {
                  const role = e.target.value as TroopContactRole;
                  setEditing({ ...editing, contactRole: role, section: role === 'gsl' ? '' : editing.section });
                }}>
                  {ROLES.map(r => <option key={r} value={r}>{CONTACT_ROLE_LABEL[r]}</option>)}
                </select>
              </label>
              <label className="aw-field"><span>支部{editing.contactRole === 'gsl' ? '（旅長不用填）' : ' *'}</span>
                <select value={editing.section || ''} disabled={editing.contactRole === 'gsl'} onChange={e => setEditing({ ...editing, section: e.target.value as VisitSection | '' })}>
                  <option value="">請揀支部</option>
                  {(editing.troop ? activeSections(units.find(u => u.troop === editing.troop) || { sections: { gh: '', cub: '', scout: '', venture: '', rover: '' } }) : SECTIONS)
                    .map(k => <option key={k} value={k}>{SECTION_LABEL[k]}</option>)}
                </select>
              </label>
              <label className="aw-field"><span>團代號</span>
                <input value={editing.unitCode || ''} maxLength={3} placeholder="單團留空；多團 1／2，空團 A1、海團 S1" onChange={e => setEditing({ ...editing, unitCode: e.target.value.toUpperCase() })} />
              </label>
              <label className="aw-field"><span>姓名 *</span>
                <input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
              </label>
              <label className="aw-field"><span>電話</span>
                <input value={editing.phone || ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} />
              </label>
              <label className="aw-field"><span>電郵</span>
                <input type="email" value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} />
              </label>
              <label className="aw-field"><span>備註</span>
                <input value={editing.note || ''} onChange={e => setEditing({ ...editing, note: e.target.value })} />
              </label>
            </div>
            <label className="aw-check" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={editing.active !== false} onChange={e => setEditing({ ...editing, active: e.target.checked })} /> 啟用（停用後支部 ADC 睇唔到）
            </label>
            <div className="inc-submit-actions" style={{ marginTop: 14 }}>
              <button className="mini-btn" onClick={() => setEditing(null)}>取消</button>
              <button className="btn-sm" disabled={saving} onClick={save}>{saving ? '儲存中…' : '✅ 儲存'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
