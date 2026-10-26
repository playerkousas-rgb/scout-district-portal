'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { ScoutUnit, TroopDirectoryBoard, VisitSection } from '@/lib/types';
import { SECTIONS, SECTION_LABEL, sortUnits, parseUnitPaste, activeSections } from '@/lib/visits';
import UnitSectionsEditor from './UnitSectionsEditor';

export default function TroopDirectoryEditor({ board, canEdit, token, reload, flash, setError }: {
  board: TroopDirectoryBoard; canEdit: boolean; token: string;
  reload: () => Promise<void>; flash: (s: string) => void; setError: (s: string) => void;
}) {
  const [rows, setRows] = useState<ScoutUnit[]>(() => sortUnits(board.units));
  const [paste, setPaste] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingRoster, setEditingRoster] = useState(false);
  const publicFieldsReady = board.publicTroopFieldsReady === true;

  function setCell(i: number, patch: Partial<ScoutUnit>) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function setSec(i: number, key: VisitSection, value: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, sections: { ...r.sections, [key]: value } } : r));
  }
  function addRow() {
    setRows(prev => [...prev, {
      troop: '', label: '', org: '', meetingTime: '', instagramUrl: '', facebookUrl: '', websiteUrl: '',
      sections: { gh: '', cub: '', scout: '', venture: '', rover: '' }, active: true, publicVisible: true,
    }]);
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
      <div className="unit-editor-grid">
        {sortUnits(board.units).map(unit => <article key={unit.troop} className="info-card">
          <h3>{unit.label || `第 ${unit.troop} 旅`}</h3><p>{unit.org || '—'}</p>
          <div className="vs-card-sections">{activeSections(unit).map(section => <span key={section} className="vs-chip on">{SECTION_LABEL[section]}</span>)}</div>
          {unit.meetingTime && <p>集會時間：{unit.meetingTime}</p>}
          {(['instagramUrl', 'facebookUrl', 'websiteUrl'] as const).map((field, i) => /^https?:\/\//i.test(unit[field] || '') ? <p key={field}><a href={unit[field]} target="_blank" rel="noopener noreferrer">{['Instagram', 'Facebook', '旅團網站'][i]}</a></p> : null)}
          {unit.active === false && <p>旅團已停用</p>}
          {unit.publicVisible === false && <p>不在成員名錄公開</p>}
        </article>)}
      </div>
      <UnitSectionsEditor
        board={board} canEdit={canEdit} token={token}
        reload={reload} flash={flash} setError={setError}
      />
      {!publicFieldsReady && (
        <div className="info-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <strong>公開資料欄位尚未啟用</strong>
          <p className="fps-help">請區方先把 GS v4.28.0 更新至 Apps Script 並執行 setupSheets()；完成後這些欄位才可編輯及公開。</p>
        </div>
      )}
      {canEdit && <button className="mini-btn" onClick={() => setEditingRoster(!editingRoster)}>{editingRoster ? '收起旅團基本資料編輯' : '編輯旅團名單／已開設支部及公開資料'}</button>}
      {canEdit && editingRoster && <div className="info-card">
        <div className="section-head">
          <div>
            <h3>全區旅團名單及公開資料（{rows.length}）</h3>
            <p>旅號、主辦機構及支部資料沿用現有名單；補上集會時間、Instagram、Facebook、旅團網頁後，成員系統「區內旅團」詳情會顯示已填欄位，空白欄位會隱藏。取消「公開顯示」可暫時從成員端名錄隱藏。</p>
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
                <th>旅團啟用</th><th>成員名錄</th><th>集會時間</th><th>Instagram 網址</th><th>Facebook 網址</th><th>旅團網頁</th>
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
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={u.active !== false} disabled={!canEdit} onChange={e => setCell(i, { active: e.target.checked })} aria-label={`${u.label || u.troop} 旅團啟用`} /></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={u.publicVisible !== false} disabled={!canEdit || !publicFieldsReady} onChange={e => setCell(i, { publicVisible: e.target.checked })} aria-label={`${u.label || u.troop} 在成員系統名錄顯示`} /></td>
                  <td><input value={u.meetingTime || ''} disabled={!canEdit || !publicFieldsReady} maxLength={200} onChange={e => setCell(i, { meetingTime: e.target.value })} style={{ width: 180 }} placeholder="例如：星期六 19:30" /></td>
                  <td><input type="url" value={u.instagramUrl || ''} disabled={!canEdit || !publicFieldsReady} onChange={e => setCell(i, { instagramUrl: e.target.value })} style={{ width: 210 }} placeholder="https://instagram.com/…" /></td>
                  <td><input type="url" value={u.facebookUrl || ''} disabled={!canEdit || !publicFieldsReady} onChange={e => setCell(i, { facebookUrl: e.target.value })} style={{ width: 210 }} placeholder="https://facebook.com/…" /></td>
                  <td><input type="url" value={u.websiteUrl || ''} disabled={!canEdit || !publicFieldsReady} onChange={e => setCell(i, { websiteUrl: e.target.value })} style={{ width: 210 }} placeholder="https://…" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fps-help" style={{ marginTop: 8 }}>
          支部格入面填「團數」（例如 1、2、1+A1）；留空 = 冇開嗰個支部，探訪頁就唔會列出。「旅團啟用」沿用原有探訪統計狀態；「成員名錄」獨立控制公開顯示。社交平台／網頁請貼完整 http:// 或 https:// 網址；空白即隱藏。
        </p>
      </div>}

      {canEdit && editingRoster && (
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
