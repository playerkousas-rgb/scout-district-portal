'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { loadSession } from '@/lib/session';
import { useDistrict } from '@/lib/useDistrict';
import type { UserSession, PermsBundle, AccessLevel, RoleDef } from '@/lib/types';

const NEXT: Record<string, AccessLevel> = { '': 'view', view: 'edit', edit: '' };
const CELL: Record<string, { txt: string; cls: string }> = {
  '': { txt: '—', cls: 'c-none' }, view: { txt: '👁', cls: 'c-view' }, edit: { txt: '✏️', cls: 'c-edit' },
};

export default function AdminPage() {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const [session, setSession] = useState<UserSession | null>(null);
  const [bundle, setBundle] = useState<PermsBundle | null>(null);
  const [matrix, setMatrix] = useState<Record<string, Record<string, AccessLevel>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [locking, setLocking] = useState(false);
  const [lockMsg, setLockMsg] = useState('');
  // 新增角色
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [roleBusy, setRoleBusy] = useState('');

  async function reload(token: string) {
    setLoading(true);
    try {
      const r = await api.getPerms(token);
      if (r.ok && r.data) { setBundle(r.data); setMatrix(r.data.matrix || {}); }
      else setError(r.error || '無法載入');
    } catch { setError('連線失敗。'); } finally { setLoading(false); }
  }

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace(withDistrict('/')); return; }
    if (!s.isAdmin) { router.replace(withDistrict('/')); return; }
    setSession(s); reload(s.token);
  }, [router, withDistrict]);

  function cellVal(c: string, r: string): AccessLevel { return (matrix[c] && matrix[c][r]) || ''; }
  function toggle(c: string, r: string) {
    setMsg('');
    setMatrix(prev => {
      const cur = (prev[c] && prev[c][r]) || '';
      return { ...prev, [c]: { ...(prev[c] || {}), [r]: NEXT[cur] } };
    });
  }
  function setRow(c: string, v: AccessLevel) {
    if (!bundle) return;
    setMatrix(prev => {
      const row: Record<string, AccessLevel> = {};
      bundle.roles.forEach(r => (row[r.role] = v));
      return { ...prev, [c]: row };
    });
  }

  async function save() {
    if (!session) return;
    setSaving(true); setMsg(''); setError('');
    try {
      const r = await api.savePerms(session.token, matrix);
      if (r.ok) setMsg('權限已儲存 ✓'); else setError(r.error || '儲存失敗');
    } catch { setError('連線失敗'); } finally { setSaving(false); }
  }

  async function toggleLock(locked: boolean) {
    if (!session) return;
    const note = locked ? '確定鎖定整個系統（暫停所有人登入）？' : '確定解除鎖定，恢復登入？';
    if (!confirm(note)) return;
    setLocking(true); setLockMsg('');
    try {
      const r = await api.setLock(session.token, locked, locked ? '系統暫停服務，請稍候。' : '');
      if (r.ok) setLockMsg(locked ? '系統已鎖定 🔒' : '系統已解鎖 🔓'); else setLockMsg(r.error || '操作失敗');
    } catch { setLockMsg('連線失敗'); } finally { setLocking(false); }
  }

  async function addRole() {
    if (!session || !newCode.trim() || !newLabel.trim()) return;
    setRoleBusy('add'); setError(''); setMsg('');
    try {
      const r = await api.addRole(session.token, newCode.trim().toUpperCase(), newLabel.trim());
      if (r.ok) { setNewCode(''); setNewLabel(''); setMsg('已新增角色 ✓'); reload(session.token); }
      else setError(r.error || '新增失敗');
    } catch { setError('連線失敗'); } finally { setRoleBusy(''); }
  }
  async function delRole(role: string) {
    if (!session) return;
    if (!confirm(`確定刪除角色「${role}」？`)) return;
    setRoleBusy(role); setError('');
    try {
      const r = await api.deleteRole(session.token, role);
      if (r.ok) { setMsg('已刪除 ✓'); reload(session.token); } else setError(r.error || '刪除失敗');
    } catch { setError('連線失敗'); } finally { setRoleBusy(''); }
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <span className="backlink" onClick={() => router.push(withDistrict('/'))}>← 返回主控台</span>
      <h1 className="page-title">⚙️ 權限 / 角色管理</h1>
      <p className="page-sub">點格子切換：— 不可見 → 👁 可看 → ✏️ 可管理。受保護角色（標🔒）不可刪改。</p>

      {/* 系統鎖定 */}
      <div className="lock-panel">
        <b>🔒 系統維護鎖定</b>
        <span> — 緊急或維護時可一鍵暫停整個系統登入。</span>
        <div className="lock-actions">
          <button className="lock-btn danger" disabled={locking} onClick={() => toggleLock(true)}>鎖定系統</button>
          <button className="lock-btn" disabled={locking} onClick={() => toggleLock(false)}>解除鎖定</button>
          {lockMsg && <span className="ok-msg">{lockMsg}</span>}
        </div>
      </div>

      {loading && <div className="center"><div className="spinner" /><div>載入中…</div></div>}
      {error && <div className="err" style={{ maxWidth: 560 }}>{error}</div>}

      {!loading && bundle && (
        <>
          {/* 角色管理 */}
          <div className="info-card">
            <h3>👥 角色管理</h3>
            {bundle.roles.map((r: RoleDef) => (
              <div className="role-row" key={r.role}>
                <span className="rname">{r.label}</span>
                <span className="rcode">{r.role}</span>
                {r.protected && <span className="badge-prot">🔒 受保護</span>}
                <div className="ractions">
                  {!r.protected && (
                    <button className="mini-btn danger" disabled={roleBusy === r.role} onClick={() => delRole(r.role)}>刪除</button>
                  )}
                </div>
              </div>
            ))}
            <div className="role-row" style={{ background: '#f0f6ff' }}>
              <input placeholder="角色碼（如 LIBRARIAN）" value={newCode} onChange={e => setNewCode(e.target.value)} style={{ width: 180 }} />
              <input placeholder="顯示名稱（如 圖書管理員）" value={newLabel} onChange={e => setNewLabel(e.target.value)} style={{ width: 200 }} />
              <div className="ractions">
                <button className="mini-btn" disabled={roleBusy === 'add'} onClick={addRole}>➕ 新增角色</button>
              </div>
            </div>
          </div>

          {/* 權限矩陣 */}
          <div className="toolbar">
            <button className="btn-sm" onClick={save} disabled={saving}>{saving ? '儲存中…' : '💾 儲存權限'}</button>
            {msg && <span className="ok-msg">{msg}</span>}
          </div>
          <div className="mtx-scroll">
            <table className="perm-table">
              <thead>
                <tr>
                  <th className="sticky-col">卡片＼角色</th>
                  {bundle.roles.map(r => <th key={r.role} title={r.role}>{r.label}{r.protected ? ' 🔒' : ''}</th>)}
                  <th>整列</th>
                </tr>
              </thead>
              <tbody>
                {bundle.cards.slice().sort((a, b) => a.order - b.order).map(c => (
                  <tr key={c.cardId}>
                    <td className="sticky-col card-name">
                      <span>{c.icon}</span> {c.title}
                      <small className={`badge-type ${c.type}`}>{c.type}</small>
                    </td>
                    {bundle.roles.map(r => {
                      const v = cellVal(c.cardId, r.role);
                      return <td key={r.role} className={`pcell ${CELL[v].cls}`} onClick={() => toggle(c.cardId, r.role)}>{CELL[v].txt}</td>;
                    })}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="mini-btn" onClick={() => setRow(c.cardId, 'view')}>👁</button>{' '}
                      <button className="mini-btn" onClick={() => setRow(c.cardId, 'edit')}>✏️</button>{' '}
                      <button className="mini-btn danger" onClick={() => setRow(c.cardId, '')}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
