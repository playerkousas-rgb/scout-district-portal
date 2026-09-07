'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { loadSession } from '@/lib/session';
import { useDistrict } from '@/lib/useDistrict';
import {
  ACCOUNT_TEMPLATE_ROWS,
  CREATABLE_ROLES,
  accountsToCsv,
  accountsToJson,
  canManageAccounts,
  isCreatableRole,
  normalizeCreatableRole,
} from '@/lib/accountRoles';
import type { BatchUserInput, PortalUser, UserSession } from '@/lib/types';
import { levelLabel, levelOf } from '@/lib/levels';
import BackLink, { BackBar } from '@/components/BackLink';

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"' && text[i + 1] === '"' && quoted) { field += '"'; i += 1; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(field.trim()); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const header = rows[0].map(x => x.replace(/^\uFEFF/, '').trim());
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] || ''])));
}

function mapRow(x: Record<string, string>): BatchUserInput {
  return {
    displayName: x.displayName || x.name || x['顯示名稱'] || x['姓名'] || '',
    email: (x.email || x['電郵'] || '').trim(),
    role: normalizeCreatableRole(x.role || x['角色'] || ''),
    password: x.password || x['初始密碼'] || x['密碼'] || '',
    scopes: x.scopes || x['支部範圍'] || x['範圍'] || '',
    cards: x.cards || x['卡片範圍'] || '',
  };
}

function downloadBlob(filename: string, content: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + content], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function UsersPage() {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const inputRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<UserSession | null>(null);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<BatchUserInput>({
    displayName: '', email: '', role: 'DL', password: '', scopes: '', cards: '',
  });
  const [editingCards, setEditingCards] = useState('');
  const [cardsDraft, setCardsDraft] = useState('');
  const [batchRows, setBatchRows] = useState<BatchUserInput[]>([]);
  const [fileName, setFileName] = useState('');
  const [showJson, setShowJson] = useState(false);

  async function load(s: UserSession) {
    setLoading(true); setError('');
    const u = await api.getUsers(s.token);
    if (u.ok && u.data) setUsers(u.data); else setError(u.error || '無法載入帳戶');
    setLoading(false);
  }

  useEffect(() => {
    const s = loadSession();
    if (!canManageAccounts(s)) { router.replace(withDistrict('/')); return; }
    setSession(s);
    if (s) load(s);
  }, [router, withDistrict]);

  const filtered = useMemo(
    () => users.filter(u => `${u.displayName} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase())),
    [users, search],
  );

  function ingestRows(mapped: BatchUserInput[], name: string) {
    setBatchRows(mapped);
    setFileName(name);
    setShowJson(true);
    setError(mapped.length ? '' : '找不到資料列；請使用下載的 CSV／JSON 範本。');
  }

  function readFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const raw = String(r.result || '').replace(/^\uFEFF/, '').trim();
      try {
        if (f.name.toLowerCase().endsWith('.json') || raw.startsWith('[') || raw.startsWith('{')) {
          const parsed = JSON.parse(raw);
          const arr = Array.isArray(parsed) ? parsed : parsed.users || parsed.accounts || [];
          ingestRows((arr as Record<string, string>[]).map(mapRow), f.name);
          return;
        }
        ingestRows(parseCsv(raw).map(mapRow), f.name);
      } catch {
        setError('檔案無法解析。請上傳 CSV 或 JSON 陣列。');
        setBatchRows([]);
      }
    };
    r.readAsText(f, 'utf-8');
  }

  async function submit(rows: BatchUserInput[]) {
    if (!session || !rows.length) return;
    setBusy(true); setError(''); setMessage('');
    const payload = rows.map(x => ({ ...x, role: normalizeCreatableRole(x.role) }));
    const r = await api.batchCreateUsers(session.token, payload);
    setBusy(false);
    if (!r.ok || !r.data) { setError(r.error || '開戶失敗'); return; }
    const rejected = r.data.rejected;
    setMessage(`已開立 ${r.data.created} 個帳戶${rejected.length ? `；${rejected.length} 列略過` : ''}。`);
    if (rejected.length) setError(rejected.map(x => `第 ${x.row} 列${x.email ? `（${x.email}）` : ''}：${x.reason}`).join('；'));
    setBatchRows([]); setFileName(''); setShowJson(false);
    setDraft({ displayName: '', email: '', role: 'DL', password: '', scopes: '', cards: '' });
    await load(session);
  }

  function canTouch(u: PortalUser) {
    if (!session) return false;
    if (u.email === session.email) return false;
    // 層級守則：只可管理層級比自己低嘅帳戶（超管 L0 可管所有）
    const myLv = levelOf(session), uLv = typeof u.level === 'number' ? u.level : levelOf({ role: u.role });
    if (myLv !== 0 && uLv <= myLv) return false;
    if (session.isAdmin || session.isDC || myLv <= 1) return true;
    return isCreatableRole(u.role);
  }

  async function resetToDefault(u: PortalUser) {
    if (!session || !confirm(`把「${u.displayName || u.email}」密碼重設為預設 1234？對方下次登入必須即刻改密碼。`)) return;
    setBusy(true); setError(''); setMessage('');
    const r = await api.updateUser(session.token, u.email, { resetToDefault: true });
    setBusy(false);
    if (r.ok) { setMessage(`${u.displayName || u.email} 密碼已重設為 1234（首次登入必改）。`); load(session); }
    else setError(r.error || '重設失敗');
  }

  async function toggleUser(u: PortalUser) {
    if (!session) return;
    setBusy(true);
    const r = await api.updateUser(session.token, u.email, { active: !u.active });
    setBusy(false);
    if (!r.ok) setError(r.error || '更新失敗'); else load(session);
  }
  async function removeUser(u: PortalUser) {
    if (!session || !confirm(`確定永久刪除「${u.displayName || u.email}」？`)) return;
    setBusy(true);
    const r = await api.deleteUser(session.token, u.email);
    setBusy(false);
    if (!r.ok) setError(r.error || '刪除失敗');
    else { setMessage('帳戶已刪除。'); load(session); }
  }
  async function saveCards(u: PortalUser) {
    if (!session) return;
    setBusy(true); setError(''); setMessage('');
    const r = await api.updateUser(session.token, u.email, { cards: cardsDraft });
    setBusy(false);
    if (r.ok) { setMessage(`已更新 ${u.displayName || u.email} 嘅卡片範圍 ✓`); setEditingCards(''); await load(session); }
    else setError(r.error || '更新失敗');
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  const jsonPreview = accountsToJson(batchRows);

  return (
    <>
      <BackLink />
      <h1 className="page-title">👥 帳戶管理及批量開戶</h1>
      <p className="page-sub">
        只有 <b>副區總監或以上</b> 可以開戶；只可以開 <b>區長／區領袖／助理區領袖</b>（可多人）。
        DC、DDC、ADC、STAFF 係預設帳戶（@skwscout.org.hk，預設密碼 <code>1234</code>，首次登入必須改密碼）。
        只可管理層級比自己低嘅帳戶。密碼只以雜湊寫入該區 Google Sheet。
      </p>
      {error && <div className="err">{error}</div>}
      {message && <div className="success">✓ {message}</div>}

      <section className="info-card">
        <div className="section-head">
          <div>
            <h3>快速開立單一帳戶</h3>
            <p>初始密碼最少 8 個字元；使用者登入後可自行更改。</p>
          </div>
        </div>
        <div className="account-form">
          <input placeholder="顯示名稱 *" value={draft.displayName} onChange={e => setDraft({ ...draft, displayName: e.target.value })} />
          <input type="email" placeholder="電郵帳號 *" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} />
          <select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}>
            {CREATABLE_ROLES.map(r => <option key={r.role} value={r.role}>{r.label}（{r.role}）</option>)}
          </select>
          <input type="password" placeholder="初始密碼（最少 8 字元）*" value={draft.password} onChange={e => setDraft({ ...draft, password: e.target.value })} />
          <input placeholder="支部範圍／scopes（選填，例如 scout）" value={draft.scopes} onChange={e => setDraft({ ...draft, scopes: e.target.value })} />
          <input placeholder="卡片範圍（選填，cardId 逗號分隔）" value={draft.cards || ''} onChange={e => setDraft({ ...draft, cards: e.target.value })} />
          <button className="btn-sm" disabled={busy} onClick={() => submit([draft])}>＋ 開立帳戶</button>
        </div>
      </section>

      <section className="info-card bulk-card">
        <div className="section-head">
          <div>
            <h3>📥 下載模版 → 填好 → 上傳轉 JSON 開戶</h3>
            <p>
              角色只可填 <code>DL</code>／<code>LEADER</code>／<code>AL</code>（或中文：區長／區領袖／助理區領袖）。
              上傳後會轉成 JSON 預覽，確認先寫入後台 Sheet。
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="mini-btn" onClick={() => downloadBlob('district-accounts-template.csv', accountsToCsv(), 'text/csv;charset=utf-8')}>⬇ 下載 CSV 模版</button>
            <button className="mini-btn" onClick={() => downloadBlob('district-accounts-template.json', accountsToJson(ACCOUNT_TEMPLATE_ROWS), 'application/json')}>⬇ 下載 JSON 模版</button>
          </div>
        </div>
        <div className="upload-zone" onClick={() => inputRef.current?.click()}>
          <b>點按選擇 CSV 或 JSON</b>
          <span>{fileName ? `${fileName}：已讀取 ${batchRows.length} 列` : '欄位：顯示名稱, 電郵, 角色, 初始密碼, 支部範圍, 卡片範圍'}</span>
          <input ref={inputRef} type="file" accept=".csv,.json,text/csv,application/json" onChange={readFile} />
        </div>
        {batchRows.length > 0 && (
          <div className="batch-preview">
            <b>準備開立 {batchRows.length} 個帳戶</b>
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['姓名', '電郵', '角色', '範圍'].map(h => <th key={h} style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #e2e8f0' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {batchRows.map((x, i) => (
                    <tr key={i}>
                      <td style={{ padding: '4px 8px' }}>{x.displayName}</td>
                      <td style={{ padding: '4px 8px' }}>{x.email}</td>
                      <td style={{ padding: '4px 8px' }}>{x.role}{!isCreatableRole(x.role) ? ' ⚠️' : ''}</td>
                      <td style={{ padding: '4px 8px' }}>{x.scopes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="mini-btn" onClick={() => setShowJson(v => !v)}>{showJson ? '隱藏 JSON' : '顯示將送出嘅 JSON'}</button>
            {showJson && (
              <pre style={{ width: '100%', maxHeight: 220, overflow: 'auto', background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12 }}>
                {jsonPreview}
              </pre>
            )}
            <button className="mini-btn" onClick={() => downloadBlob('accounts-payload.json', jsonPreview, 'application/json')}>⬇ 下載呢份 JSON</button>
            <button className="btn-sm" disabled={busy} onClick={() => submit(batchRows)}>{busy ? '處理中…' : '🚀 確認寫入後台 Sheet'}</button>
          </div>
        )}
      </section>

      <section className="info-card">
        <div className="section-head">
          <div><h3>現有帳戶 <small>({users.length})</small></h3></div>
          <input className="search-input" placeholder="搜尋姓名、電郵或角色" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {loading ? <div className="small-loading">載入中…</div> : (
          <div className="user-list">
            {filtered.map(u => (
              <article className="user-row" key={u.email}>
                <div className="user-identity"><b>{u.displayName || '未命名'}</b><span>{u.email}</span></div>
                <div>
                  <span className="role-chip">{u.role}</span>
                  <span className="lvl-chip dark">L{typeof u.level === 'number' ? u.level : levelOf({ role: u.role })} {u.levelLabel || levelLabel(levelOf({ role: u.role }))}</span>
                  <span className={u.active ? 'state on' : 'state off'}>{u.active ? '啟用中' : '已停用'}</span>
                  {u.mustChangePassword && <span className="state warn" title="仍用緊預設密碼，首次登入會被要求改">🔑 未改密碼</span>}
                  {!isCreatableRole(u.role) && <span className="role-chip">預設位</span>}
                </div>
                <div className="user-actions" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <button className="mini-btn" disabled={busy || !canTouch(u)} onClick={() => toggleUser(u)}>{u.active ? '停用' : '啟用'}</button>
                  <button className="mini-btn" disabled={busy || !canTouch(u)} onClick={() => resetToDefault(u)} title="重設為 1234，對方下次登入必改">🔑 重設 1234</button>
                  <button className="mini-btn" disabled={busy || !canTouch(u)} onClick={() => { setEditingCards(u.email); setCardsDraft(u.cards || ''); }}>🎯 卡片範圍</button>
                  <button className="mini-btn danger" disabled={busy || !canTouch(u)} onClick={() => removeUser(u)}>刪除</button>
                </div>
                {editingCards === u.email && (
                  <div style={{ flexBasis: '100%', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: '#f0f6ff', padding: 8, borderRadius: 8 }}>
                    <span style={{ fontSize: 12 }}>卡片範圍（cardId 逗號分隔；留空 = 用角色矩陣）：</span>
                    <input value={cardsDraft} onChange={e => setCardsDraft(e.target.value)} placeholder="例如 stockReg,venueReg" style={{ flex: 1, minWidth: 200 }} />
                    <button className="btn-sm" disabled={busy} onClick={() => saveCards(u)}>儲存範圍</button>
                    <button className="mini-btn" onClick={() => setEditingCards('')}>取消</button>
                  </div>
                )}
              </article>
            ))}
            {!filtered.length && <p className="empty">沒有符合的帳戶。</p>}
          </div>
        )}
      </section>
      <BackBar />
    </>
  );
}
