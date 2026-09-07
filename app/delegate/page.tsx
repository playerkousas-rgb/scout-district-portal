'use client';
/**
 * 🤝 授權／收回
 * ─────────────────────────────────────────────────────────────────────
 * 層級：0 超管 → 1 DC → 2 DDC → 3 ADC → 4 STAFF → 5 區長／領袖。
 * 上級可以把「自己現時擁有」嘅卡片權限（✏️ 可管理 / 👁 可看）授予層級較低嘅角色，
 * 方便下級協助處理；亦可隨時一鍵收回某角色／全部下級嘅卡片權限。
 * 實作 = 後台 Perms 表（角色 × 卡片），與「權限/角色」頁同一份資料。
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { loadSession } from '@/lib/session';
import { useDistrict } from '@/lib/useDistrict';
import { canDelegate, levelLabel } from '@/lib/levels';
import BackLink, { BackBar } from '@/components/BackLink';
import type { AccessLevel, DelegationBundle, UserSession } from '@/lib/types';

const CELL: Record<string, { txt: string; cls: string }> = {
  '': { txt: '—', cls: 'c-none' }, view: { txt: '👁', cls: 'c-view' }, edit: { txt: '✏️', cls: 'c-edit' },
};

export default function DelegatePage() {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const [session, setSession] = useState<UserSession | null>(null);
  const [bundle, setBundle] = useState<DelegationBundle | null>(null);
  const [target, setTarget] = useState('');
  const [draft, setDraft] = useState<Record<string, AccessLevel>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function reload(token: string, keepTarget?: string) {
    setLoading(true); setError('');
    try {
      const r = await api.getDelegation(token);
      if (r.ok && r.data) {
        setBundle(r.data);
        const t = keepTarget && r.data.roles.some(x => x.role === keepTarget) ? keepTarget : (r.data.roles[0]?.role || '');
        setTarget(t);
        setDraft({ ...(r.data.matrix[t] || {}) });
      } else setError(r.error || '無法載入（請確認後台已升級至 v4.4.0）');
    } catch { setError('連線失敗'); } finally { setLoading(false); }
  }

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace(withDistrict('/')); return; }
    if (!canDelegate(s)) { router.replace(withDistrict('/')); return; }
    setSession(s); reload(s.token);
  }, [router, withDistrict]);

  function pickTarget(role: string) {
    if (!bundle) return;
    setTarget(role); setDraft({ ...(bundle.matrix[role] || {}) }); setMsg('');
  }

  /** 點格子：— → 👁 → ✏️ → —，但唔可以超過我自己嘅權限 */
  function cycle(cardId: string) {
    if (!bundle) return;
    const mine = bundle.myAccess[cardId] || '';
    if (!mine) return;
    const cur = draft[cardId] || '';
    let next: AccessLevel = cur === '' ? 'view' : cur === 'view' ? (mine === 'edit' ? 'edit' : '') : '';
    if (next === 'edit' && mine !== 'edit') next = '';
    setDraft(prev => ({ ...prev, [cardId]: next }));
  }
  function grantAllMine() {
    if (!bundle) return;
    const d: Record<string, AccessLevel> = {};
    bundle.cards.forEach(c => { d[c.cardId] = bundle.myAccess[c.cardId] || ''; });
    setDraft(d);
  }
  function clearAll() {
    if (!bundle) return;
    const d: Record<string, AccessLevel> = {};
    bundle.cards.forEach(c => { d[c.cardId] = ''; });
    setDraft(d);
  }

  async function save() {
    if (!session || !bundle || !target) return;
    setBusy('save'); setMsg(''); setError('');
    try {
      const grants: Record<string, AccessLevel> = {};
      bundle.cards.forEach(c => { grants[c.cardId] = draft[c.cardId] || ''; });
      const r = await api.delegatePerms(session.token, target, grants);
      if (r.ok && r.data) {
        setMsg(`已更新 ${r.data.applied} 張卡片嘅授權 ✓${r.data.rejected.length ? `（${r.data.rejected.length} 項略過：${r.data.rejected.join('；')}）` : ''}`);
        reload(session.token, target);
      } else setError(r.error || '授權失敗');
    } catch { setError('連線失敗'); } finally { setBusy(''); }
  }

  async function revoke(role: string) {
    if (!session) return;
    const label = role === '*' ? '全部下級角色' : (bundle?.roles.find(r => r.role === role)?.label || role);
    if (!confirm(`確定收回「${label}」嘅全部卡片權限？佢哋會即時睇唔到任何卡片，直至你再授權。`)) return;
    setBusy('revoke:' + role); setMsg(''); setError('');
    try {
      const r = await api.revokePerms(session.token, role);
      if (r.ok && r.data) { setMsg(`已收回 ${r.data.revoked} 項權限（${r.data.roles.join('、')}）✓`); reload(session.token, target); }
      else setError(r.error || '收回失敗');
    } catch { setError('連線失敗'); } finally { setBusy(''); }
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  const targetRole = bundle?.roles.find(r => r.role === target);

  return (
    <>
      <BackLink />
      <h1 className="page-title">🤝 授權／收回</h1>
      <p className="page-sub">
        你係 <b>L{bundle?.me.level ?? '?'} {bundle ? levelLabel(bundle.me.level) : ''}</b>。你可以把自己現有嘅卡片權限授予層級較低嘅角色協助處理，亦可隨時一鍵收回。
        層級：L0 超管 → L1 區總監 → L2 副區總監 → L3 助理區總監 → L4 區職員 → L5 區長／領袖。
      </p>

      {loading && <div className="center"><div className="spinner" /><div>載入中…</div></div>}
      {error && <div className="err" style={{ maxWidth: 640 }}>{error}</div>}
      {msg && <div className="success">✓ {msg}</div>}

      {!loading && bundle && (
        <>
          {bundle.roles.length === 0 && <div className="info-card"><p>你之下已冇更低層級嘅角色可以授權。</p></div>}

          {bundle.roles.length > 0 && (
            <>
              <div className="info-card">
                <div className="section-head"><div><h3>1️⃣ 揀要授權嘅角色</h3><p>只列出層級比你低嘅角色</p></div></div>
                <div className="dlg-roles">
                  {bundle.roles.map(r => {
                    const n = Object.values(bundle.matrix[r.role] || {}).filter(Boolean).length;
                    return (
                      <button key={r.role} type="button" className={`dlg-role ${target === r.role ? 'on' : ''}`} onClick={() => pickTarget(r.role)}>
                        <b>{r.label}</b>
                        <span>L{r.level} · {r.role} · 現有 {n} 張卡</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="info-card">
                <div className="section-head">
                  <div><h3>2️⃣ 揀卡片權限 → {targetRole?.label || target}</h3><p>點格子切換：— 不可見 → 👁 可看 → ✏️ 可管理（唔可以超過你自己嘅權限；你冇嘅卡片會鎖住）</p></div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="mini-btn" onClick={grantAllMine}>全部照我嘅權限</button>
                    <button className="mini-btn" onClick={clearAll}>全部清空</button>
                  </div>
                </div>
                <div className="mtx-scroll">
                  <table className="perm-table">
                    <thead><tr><th className="sticky-col">卡片</th><th>我有</th><th>授予 {targetRole?.label || ''}</th></tr></thead>
                    <tbody>
                      {bundle.cards.map(c => {
                        const mine = bundle.myAccess[c.cardId] || '';
                        const v = draft[c.cardId] || '';
                        return (
                          <tr key={c.cardId} className={mine ? '' : 'dlg-locked'}>
                            <td className="sticky-col card-name"><span>{c.icon}</span> {c.title}{!c.enabled && <small className="badge-type" style={{ background: '#e2e8f0' }}>已隱藏</small>}</td>
                            <td className={`pcell ${CELL[mine].cls}`} title={mine ? '你現有嘅權限' : '你冇此卡片權限，不能授出'}>{CELL[mine].txt}</td>
                            <td className={`pcell ${CELL[v].cls}`} onClick={() => cycle(c.cardId)} title={mine ? '點擊切換' : '鎖住'}>{mine ? CELL[v].txt : '🔒'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="toolbar">
                  <button className="btn-sm" onClick={save} disabled={busy === 'save' || !target}>{busy === 'save' ? '儲存中…' : '💾 儲存授權'}</button>
                  {target && <button className="mini-btn danger" disabled={busy === 'revoke:' + target} onClick={() => revoke(target)}>🚫 收回 {targetRole?.label} 全部權限</button>}
                </div>
              </div>

              <div className="lock-panel" style={{ marginTop: 12 }}>
                <b>⛔ 緊急收回</b>
                <span> — 一鍵收回你之下所有角色嘅全部卡片權限（{bundle.roles.map(r => r.label).join('、')}）。</span>
                <div className="lock-actions">
                  <button className="lock-btn danger" disabled={busy === 'revoke:*'} onClick={() => revoke('*')}>收回全部下級權限</button>
                </div>
              </div>
            </>
          )}
        </>
      )}
      <BackBar />
    </>
  );
}
