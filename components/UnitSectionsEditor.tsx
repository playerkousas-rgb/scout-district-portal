'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { UnitSection, VisitBoard, VisitSection } from '@/lib/types';
import { SECTIONS, SECTION_LABEL } from '@/lib/visits';
import { blankUnitSection, unitSectionDrafts } from '@/lib/unitSectionDrafts';

/** 按旅維護，各支部一張編輯卡；儲存只影響所選旅。 */
export default function UnitSectionsEditor({ board, canEdit, token, reload, flash, setError }: {
  board: VisitBoard; canEdit: boolean; token: string; reload: () => Promise<void>;
  flash: (s: string) => void; setError: (s: string) => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const initial = board.units.find(u => u.troop === params.get('troop')) || board.units[0];
  const [troop, setTroop] = useState(initial?.troop || '');
  const [rows, setRows] = useState(() => unitSectionDrafts(initial, board.unitSections || []));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const ready = board.unitSectionsReady === true && board.unitSectionsScopedSave === true;
  const disabled = !canEdit || saving;
  function patch(i: number, value: Partial<UnitSection>) {
    setRows(prev => prev.map((row, index) => index === i ? { ...row, ...value } : row));
    setDirty(true);
  }
  function selectTroop(value: string) {
    if (dirty && !window.confirm('所選旅的修改尚未儲存，確定放棄修改並切換？')) return;
    setTroop(value);
    const query = new URLSearchParams(params.toString());
    query.set('troop', value);
    router.replace(`${window.location.pathname}?${query.toString()}`, { scroll: false });
    setRows(unitSectionDrafts(board.units.find(u => u.troop === value), board.unitSections || []));
    setDirty(false);
  }
  async function save() {
    if (!troop || rows.some(r => !r.section)) { setError('請為每個團選擇支部。'); return; }
    if (!rows.length && !window.confirm('確定移除此旅的團級資料並回落自動列表？其他旅不受影響。')) return;
    setSaving(true); setError('');
    try {
      const result = await api.saveUnitSections(token, rows, troop);
      if (!result.ok) { setError(result.error || '儲存失敗'); return; }
      setDirty(false);
      flash(`已儲存第 ${troop} 旅 ${rows.length} 個團的獨立資料，其他旅不受影響`);
      await reload();
    } catch { setError('連線失敗，修改仍保留，請再試。'); }
    finally { setSaving(false); }
  }
  if (!ready) return <div className="info-card"><strong>各支部獨立設定尚未啟用</strong><p>請先更新 GS v4.30.0、執行 setupSheets() 並更新原有 Web App 部署，以啟用 UnitSections。</p></div>;
  return <section className="info-card" aria-label="各旅各支部資料設定">
    <h3>各旅・各支部獨立設定</h3>
    <p>先選旅，再逐支部填寫集會時間、地點及社交平台。例如第 82 旅的五個支部各有自己的資料，互不覆蓋。儲存只影響所選旅。</p>
    <label>選擇旅團 <select value={troop} disabled={saving} onChange={e => selectTroop(e.target.value)}>
      {board.units.map(u => <option key={u.troop} value={u.troop}>{u.troop} · {u.label}</option>)}
    </select></label>
    <p className="fps-help">已按支部團數補出尚未設定的支部；空欄不會複製旅層的時間或社交平台。填寫後按下方「儲存此旅」才會寫入。</p>
    <div className="unit-editor-grid">
      {rows.map((row, i) => <fieldset key={`${troop}-${i}`} className="unit-editor-card" disabled={disabled}>
        <legend>{row.section ? SECTION_LABEL[row.section] : '新增支部'}{row.unitCode ? ` · ${row.unitCode}` : ''}</legend>
        <label>支部<select value={row.section} onChange={e => patch(i, { section: e.target.value as VisitSection | '' })}>
          <option value="">請選擇支部</option>{SECTIONS.map(s => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}
        </select></label>
        <label>團代號<input value={row.unitCode} maxLength={3} placeholder="單團留空；多團填 1／2，空團 A1、海團 S1" onChange={e => patch(i, { unitCode: e.target.value.toUpperCase() })} /></label>
        <label>集會時間<input value={row.meetingTime} maxLength={200} placeholder="例如：星期六 14:00–17:00" onChange={e => patch(i, { meetingTime: e.target.value })} /></label>
        <label>集會地點<input value={row.location} maxLength={200} onChange={e => patch(i, { location: e.target.value })} /></label>
        {(['instagramUrl', 'facebookUrl', 'websiteUrl'] as const).map((field, index) => <label key={field}>{['Instagram', 'Facebook', '網站'][index]}
          <input type="url" value={row[field]} maxLength={500} placeholder="https://…（此支部專用）" onChange={e => patch(i, { [field]: e.target.value })} />
        </label>)}
        <label><input type="checkbox" checked={row.active !== false} onChange={e => patch(i, { active: e.target.checked })} /> 支部啟用</label>
        <label><input type="checkbox" checked={row.publicVisible !== false} onChange={e => patch(i, { publicVisible: e.target.checked })} /> 在成員名錄公開</label>
        {canEdit && <button type="button" className="mini-btn" onClick={() => { setRows(prev => prev.filter((_, index) => index !== i)); setDirty(true); }}>移除此團設定</button>}
      </fieldset>)}
    </div>
    {canEdit && <div className="unit-editor-actions">
      <button type="button" className="mini-btn" disabled={saving || !troop} onClick={() => { setRows(prev => [...prev, blankUnitSection(troop)]); setDirty(true); }}>＋ 新增支部／團</button>
      <button type="button" className="btn-sm" disabled={saving || !troop} onClick={save}>{saving ? '儲存中…' : `儲存第 ${troop} 旅（只影響此旅）`}</button>
      <span role="status">{dirty ? '尚未儲存' : '切換旅團可查看其他旅的資料'}</span>
    </div>}
  </section>;
}
