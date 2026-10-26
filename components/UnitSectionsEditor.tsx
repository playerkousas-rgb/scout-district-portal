'use client';
/**
 * 🧱 旅→團階層編輯器（v4.29.0 UnitSections 表）
 *
 * 每個團（支部單位）一列：旅號／支部下拉、團代號（常規團留空；A1＝空、S1＝海）、
 * 集會時間、集會地點、三個社交網址、啟用／公開 checkbox。
 * 整份覆寫儲存（同 Units 名單一樣）；後台做權限、dup key、網址同代號驗證。
 * 未補建 UnitSections 表（舊 GS）時只顯示升級提示，編輯器唔開放。
 */
import { useState } from 'react';
import { api } from '@/lib/api';
import type { UnitSection, VisitBoard, VisitSection } from '@/lib/types';
import { SECTIONS, SECTION_LABEL, SECTION_EMOJI } from '@/lib/visits';

function blankRow(troop = '', section: VisitSection | '' = ''): UnitSection {
  return {
    troop,
    section,
    unitCode: '',
    meetingTime: '',
    location: '',
    instagramUrl: '',
    facebookUrl: '',
    websiteUrl: '',
    active: true,
    publicVisible: true,
  };
}

export default function UnitSectionsEditor({
  board, canEdit, token, reload, flash, setError,
}: {
  board: VisitBoard;
  canEdit: boolean;
  token: string;
  reload: () => Promise<void>;
  flash: (s: string) => void;
  setError: (s: string) => void;
}) {
  const [rows, setRows] = useState<UnitSection[]>(() => (board.unitSections || []).map(r => ({ ...r })));
  const [saving, setSaving] = useState(false);
  const ready = board.unitSectionsReady === true;
  const troopOptions = board.units.map(u => ({ troop: u.troop, label: u.label || u.troop }));

  function patch(i: number, p: Partial<UnitSection>) {
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function addRow() {
    const firstTroop = troopOptions[0]?.troop || '';
    setRows(prev => [...prev, blankRow(firstTroop)]);
  }
  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (rows.some(r => !String(r.troop).trim() || !r.section)) {
      setError('請為每列填寫旅號及支部，或移除未填好的列；未有資料寫入。');
      return;
    }
    const clean = rows;
    if (!clean.length && (board.unitSections || []).length && !window.confirm('確定清空所有旅的團級維護資料？成員名錄將回落自動骨架。')) return;
    setSaving(true);
    const r = await api.saveUnitSections(token, clean);
    setSaving(false);
    if (r.ok) {
      flash(`已儲存 ${r.data?.count ?? clean.length} 個團`);
      await reload();
      setRows(clean.map(x => ({ ...x })));
    } else {
      setError(r.error || '儲存失敗');
    }
  }

  if (!ready) {
    return (
      <div className="info-card" style={{ borderLeft: '4px solid #f59e0b' }}>
        <strong>團層級編輯尚未啟用</strong>
        <p className="fps-help">
          請區方先把 GS v4.29.0 更新至 Apps Script 並執行 setupSheets() 補建 UnitSections 表；
          完成後即可喺度維護每個團嘅集會時間、地點同社交帳戶。未維護嘅旅，成員端會按支部團數自動顯示骨架。
        </p>
      </div>
    );
  }

  return (
    <div className="info-card">
      <div className="section-head">
        <div>
          <h3>旅→團階層：各團集會資料（{rows.length}）</h3>
          <p>
            每個團一列。旅號同支部用下拉選擇；團代號常規團留空，空童軍團填 A1、海童軍團填 S1。
            集會時間同地點會顯示喺成員端該團嘅彈窗；空白欄位唔會公開。取消「啟用」或「公開」即從成員名錄隱藏該團。
            同一旅＋支部＋代號唔可以重複；淨空全部列再儲存＝回落自動骨架。
          </p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="mini-btn" onClick={addRow}>＋ 加一個團</button>
            <button className="btn-sm" disabled={saving} onClick={save}>{saving ? '儲存中…' : '💾 儲存團資料'}</button>
          </div>
        )}
      </div>

      <div className="mtx-scroll">
        <table className="perm-table vs-units">
          <thead>
            <tr>
              <th>旅號</th><th>支部</th><th>團代號</th>
              <th>集會時間</th><th>集會地點</th>
              <th>Instagram 網址</th><th>Facebook 網址</th><th>網頁</th>
              <th>啟用</th><th>成員名錄</th>{canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 11 : 10} className="fps-help" style={{ textAlign: 'center', padding: 16 }}>
                  未維護任何團 — 成員端而家按 Units 嘅支部團數自動顯示骨架（詳情空白會回落旅層級資料）。
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <select
                    value={r.troop} disabled={!canEdit}
                    onChange={e => patch(i, { troop: e.target.value })}
                    style={{ width: 130 }}
                    aria-label={`第 ${i + 1} 列旅號`}
                  >
                    <option value="">— 揀旅團 —</option>
                    {troopOptions.map(o => (
                      <option key={o.troop} value={o.troop}>{o.troop} {o.label}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={r.section} disabled={!canEdit}
                    onChange={e => patch(i, { section: e.target.value as VisitSection | '' })}
                    style={{ width: 120 }}
                    aria-label={`第 ${i + 1} 列支部`}
                  >
                    <option value="">—</option>
                    {SECTIONS.map(k => (
                      <option key={k} value={k}>{SECTION_EMOJI[k]} {SECTION_LABEL[k]}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    value={r.unitCode} disabled={!canEdit} maxLength={10}
                    onChange={e => patch(i, { unitCode: e.target.value.toUpperCase() })}
                    style={{ width: 64 }} placeholder="常規留空"
                    aria-label={`第 ${i + 1} 列團代號`}
                  />
                </td>
                <td>
                  <input
                    value={r.meetingTime} disabled={!canEdit} maxLength={200}
                    onChange={e => patch(i, { meetingTime: e.target.value })}
                    style={{ width: 170 }} placeholder="例如：星期六 14:00–17:00"
                  />
                </td>
                <td>
                  <input
                    value={r.location} disabled={!canEdit} maxLength={200}
                    onChange={e => patch(i, { location: e.target.value })}
                    style={{ width: 170 }} placeholder="例如：校本部禮堂"
                  />
                </td>
                <td><input type="url" value={r.instagramUrl} disabled={!canEdit} onChange={e => patch(i, { instagramUrl: e.target.value })} style={{ width: 200 }} placeholder="https://instagram.com/…" /></td>
                <td><input type="url" value={r.facebookUrl} disabled={!canEdit} onChange={e => patch(i, { facebookUrl: e.target.value })} style={{ width: 200 }} placeholder="https://facebook.com/…" /></td>
                <td><input type="url" value={r.websiteUrl} disabled={!canEdit} onChange={e => patch(i, { websiteUrl: e.target.value })} style={{ width: 200 }} placeholder="https://…" /></td>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={r.active !== false} disabled={!canEdit} onChange={e => patch(i, { active: e.target.checked })} aria-label={`第 ${i + 1} 列啟用`} />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={r.publicVisible !== false} disabled={!canEdit} onChange={e => patch(i, { publicVisible: e.target.checked })} aria-label={`第 ${i + 1} 列於成員名錄顯示`} />
                </td>
                {canEdit && (
                  <td>
                    <button className="mini-btn" style={{ color: '#b91c1c' }} onClick={() => removeRow(i)} aria-label={`刪除第 ${i + 1} 列`}>✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fps-help" style={{ marginTop: 8 }}>
        社交平台／網頁請貼完整 http:// 或 https:// 網址（後台會再驗證）；空白即喺成員端隱藏。
        團代號格式：常規團留空；A 開頭＝空童軍團（A1）、S 開頭＝海童軍團（S1）。
      </p>
    </div>
  );
}
