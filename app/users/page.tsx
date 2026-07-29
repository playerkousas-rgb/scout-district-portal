'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { loadSession } from '@/lib/session';
import { useDistrict } from '@/lib/useDistrict';
import type { BatchUserInput, PortalUser, RoleDef, UserSession } from '@/lib/types';

const TEMPLATE = 'displayName,email,role,password,scopes\n王小明,member@example.com,ADC_SCOUT,ChangeMe2026,section:scout\n陳大文,leader@example.com,DDC_ADMIN,ChangeMe2026,admin\n';

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"' && text[i + 1] === '"' && quoted) { field += '"'; i += 1; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(field.trim()); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i += 1; row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const header = rows[0].map(x => x.replace(/^\uFEFF/, '').trim());
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] || ''])));
}

export default function UsersPage() {
  const router = useRouter(); const { withDistrict } = useDistrict(); const inputRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<UserSession | null>(null); const [roles, setRoles] = useState<RoleDef[]>([]);
  const [users, setUsers] = useState<PortalUser[]>([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<BatchUserInput>({ displayName: '', email: '', role: '', password: '', scopes: '' });
  const [csvRows, setCsvRows] = useState<BatchUserInput[]>([]); const [csvName, setCsvName] = useState('');

  async function load(s: UserSession) {
    setLoading(true); setError('');
    const [u, p] = await Promise.all([api.getUsers(s.token), api.getPerms(s.token)]);
    if (u.ok && u.data) setUsers(u.data); else setError(u.error || '無法載入帳戶');
    if (p.ok && p.data) { setRoles(p.data.roles); setDraft(x => ({ ...x, role: x.role || p.data!.roles[0]?.role || '' })); }
    setLoading(false);
  }
  useEffect(() => { const s = loadSession(); if (!s?.isAdmin) { router.replace(withDistrict('/')); return; } setSession(s); load(s); }, [router, withDistrict]);
  const filtered = useMemo(() => users.filter(u => `${u.displayName} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase())), [users, search]);
  function downloadTemplate() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + TEMPLATE], { type: 'text/csv;charset=utf-8' })); a.download = 'district-accounts-template.csv'; a.click(); URL.revokeObjectURL(a.href); }
  function readFile(e: ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const data = parseCsv(String(r.result)); const mapped = data.map(x => ({ displayName: x.displayName || x.name || x['姓名'] || '', email: x.email || x['電郵'] || '', role: (x.role || x['角色'] || '').toUpperCase(), password: x.password || x['密碼'] || '', scopes: x.scopes || x['範圍'] || '' })); setCsvRows(mapped); setCsvName(f.name); setError(mapped.length ? '' : '找不到資料列；請使用下載的 CSV 範本。'); }; r.readAsText(f, 'utf-8'); }
  async function submit(rows: BatchUserInput[]) { if (!session || !rows.length) return; setBusy(true); setError(''); setMessage(''); const r = await api.batchCreateUsers(session.token, rows); setBusy(false); if (!r.ok || !r.data) { setError(r.error || '開戶失敗'); return; } const rejected = r.data.rejected; setMessage(`已開立 ${r.data.created} 個帳戶${rejected.length ? `；${rejected.length} 列略過` : ''}。`); if (rejected.length) setError(rejected.map(x => `第 ${x.row} 列${x.email ? `（${x.email}）` : ''}：${x.reason}`).join('；')); setCsvRows([]); setCsvName(''); setDraft({ displayName: '', email: '', role: roles[0]?.role || '', password: '', scopes: '' }); await load(session); }
  async function toggleUser(u: PortalUser) { if (!session) return; setBusy(true); const r = await api.updateUser(session.token, u.email, { active: !u.active }); setBusy(false); if (!r.ok) setError(r.error || '更新失敗'); else load(session); }
  async function removeUser(u: PortalUser) { if (!session || !confirm(`確定永久刪除「${u.displayName || u.email}」？`)) return; setBusy(true); const r = await api.deleteUser(session.token, u.email); setBusy(false); if (!r.ok) setError(r.error || '刪除失敗'); else { setMessage('帳戶已刪除。'); load(session); } }
  if (!session) return <div className="center"><div className="spinner" /></div>;
  return <>
    <span className="backlink" onClick={() => router.push(withDistrict('/'))}>← 返回主控台</span>
    <h1 className="page-title">👥 帳戶管理及批量開戶</h1><p className="page-sub">所有開戶、停用及批量匯入均在前端完成；密碼只會以雜湊方式儲存在該區的 Google Sheet。</p>
    {error && <div className="err">{error}</div>}{message && <div className="success">✓ {message}</div>}
    <section className="info-card">
      <div className="section-head"><div><h3>快速開立單一帳戶</h3><p>初始密碼最少 8 個字元；使用者可登入後再自行更改。</p></div></div>
      <div className="account-form">
        <input placeholder="顯示名稱 *" value={draft.displayName} onChange={e => setDraft({ ...draft, displayName: e.target.value })}/>
        <input type="email" placeholder="電郵帳號 *" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })}/>
        <select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}>{roles.map(r => <option key={r.role} value={r.role}>{r.label}（{r.role}）</option>)}</select>
        <input type="password" placeholder="初始密碼（最少 8 字元）*" value={draft.password} onChange={e => setDraft({ ...draft, password: e.target.value })}/>
        <input placeholder="範圍／scopes（選填）" value={draft.scopes} onChange={e => setDraft({ ...draft, scopes: e.target.value })}/>
        <button className="btn-sm" disabled={busy} onClick={() => submit([draft])}>＋ 開立帳戶</button>
      </div>
    </section>
    <section className="info-card bulk-card">
      <div className="section-head"><div><h3>📥 CSV 批量開戶</h3><p>下載範本、在試算表填好後上傳。系統會先驗證資料；重複電郵或不合規列會略過並顯示原因。</p></div><button className="mini-btn" onClick={downloadTemplate}>⬇ 下載 CSV 範本</button></div>
      <div className="upload-zone" onClick={() => inputRef.current?.click()}><b>點按選擇 CSV 檔案</b><span>{csvName ? `${csvName}：已讀取 ${csvRows.length} 列` : '支援 displayName, email, role, password, scopes 欄位'}</span><input ref={inputRef} type="file" accept=".csv,text/csv" onChange={readFile}/></div>
      {csvRows.length > 0 && <div className="batch-preview"><b>準備開立 {csvRows.length} 個帳戶</b><span>預覽：{csvRows.slice(0, 3).map(x => x.displayName || x.email).join('、')}{csvRows.length > 3 ? '…' : ''}</span><button className="btn-sm" disabled={busy} onClick={() => submit(csvRows)}>{busy ? '處理中…' : '🚀 確認批量開戶'}</button></div>}
    </section>
    <section className="info-card"><div className="section-head"><div><h3>現有帳戶 <small>({users.length})</small></h3></div><input className="search-input" placeholder="搜尋姓名、電郵或角色" value={search} onChange={e => setSearch(e.target.value)}/></div>
      {loading ? <div className="small-loading">載入中…</div> : <div className="user-list">{filtered.map(u => <article className="user-row" key={u.email}><div className="user-identity"><b>{u.displayName || '未命名'}</b><span>{u.email}</span></div><div><span className="role-chip">{u.role}</span><span className={u.active ? 'state on' : 'state off'}>{u.active ? '啟用中' : '已停用'}</span></div><div className="user-actions"><button className="mini-btn" disabled={busy} onClick={() => toggleUser(u)}>{u.active ? '停用' : '啟用'}</button><button className="mini-btn danger" disabled={busy || u.email === session.email} onClick={() => removeUser(u)}>刪除</button></div></article>)}{!filtered.length && <p className="empty">沒有符合的帳戶。</p>}</div>}
    </section>
  </>;
}
