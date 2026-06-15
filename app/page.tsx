'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { loadSession, saveSession, clearSession } from '@/lib/session';
import { useDistrict } from '@/lib/useDistrict';
import type { UserSession, CardDef } from '@/lib/types';
import CardItem from '@/components/CardItem';

export default function HomePage() {
  const router = useRouter();
  const { district, hasDistrict, withDistrict } = useDistrict();
  const [session, setSession] = useState<UserSession | null>(null);
  const [cards, setCards] = useState<CardDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 登入表單
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockMsg, setLockMsg] = useState('');

  // 已選區後：查系統鎖定 + 既有登入
  useEffect(() => {
    if (!hasDistrict) return;
    const s = loadSession();
    if (s) { setSession(s); loadCards(s); }
    (async () => {
      try {
        const r = await api.getSystem();
        if (r.ok && r.data?.locked) { setLocked(true); setLockMsg(r.data.lockMessage || '系統維護中。'); }
      } catch { /* ignore */ }
    })();
  }, [hasDistrict]);

  async function loadCards(s: UserSession) {
    setLoading(true); setError('');
    try {
      const r = await api.getCards(s.token);
      if (r.ok && r.data) setCards(r.data.filter(c => c.enabled).sort((a, b) => a.order - b.order));
      else setError(r.error || '無法載入卡片');
    } catch {
      setError('連線失敗：請確認該區後台網址已設定且已部署。');
    } finally { setLoading(false); }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (!email || !password) { setError('請輸入帳號及密碼'); return; }
    setLoggingIn(true);
    try {
      const r = await api.login(email.trim(), password);
      if (r.ok && r.data) { saveSession(r.data); setSession(r.data); loadCards(r.data); }
      else setError(r.error || '帳號或密碼不正確');
    } catch {
      setError('連線失敗：請確認該區後台網址已設定且已部署。');
    } finally { setLoggingIn(false); }
  }

  function logout() { clearSession(); setSession(null); setCards([]); }

  if (!hasDistrict) return null; // DistrictShell 會顯示選區

  // 已選區，未登入 → 第二重：帳戶登入
  if (!session) {
    return (
      <div className="center-bg">
        <div className="panel">
          <div className="logo">🧭</div>
          <h1>{district?.name} 登入</h1>
          <p className="sub">第二重：請登入你的帳戶</p>
          {locked && <div className="lock-banner">🔒 系統維護中<br /><small>{lockMsg}</small></div>}
          <form onSubmit={handleLogin}>
            {error && <div className="err">{error}</div>}
            <div className="field"><label>帳號（電郵）</label>
              <input type="text" placeholder="dc@..." value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div className="field"><label>密碼</label>
              <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} /></div>
            <button className="btn" type="submit" disabled={loggingIn}>{loggingIn ? '登入中…' : '登入'}</button>
          </form>
          <p className="hint">帳號與權限由該區自己的 Google Sheet 控制。</p>
        </div>
      </div>
    );
  }

  // 已登入 → 卡片陣列
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">主控台</h1>
          <p className="page-sub" style={{ margin: '4px 0 0' }}>
            {session.roleLabel}，歡迎。以下是你權限範圍內的功能（由該區 Google Sheet 控制）。
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {session.isAdmin && <button className="admin-btn" onClick={() => router.push(withDistrict('/plugins'))}>🧩 外掛市集</button>}
          {session.isAdmin && <button className="admin-btn" onClick={() => router.push(withDistrict('/admin'))}>⚙️ 權限/角色</button>}
          <button className="admin-btn" onClick={logout}>登出</button>
        </div>
      </div>

      <div style={{ height: 18 }} />
      {loading && <div className="center"><div className="spinner" /><div>載入卡片中…</div></div>}
      {error && <div className="err" style={{ maxWidth: 560 }}>{error}</div>}
      {!loading && !error && (
        <>
          <div className="grid">
            {cards.map(c => <CardItem key={c.cardId} card={c} role={session.role} />)}
          </div>
          <div className="legend">
            <span><i className="sq" style={{ background: '#16a34a' }} /> 內建</span>
            <span><i className="sq" style={{ background: '#4338ca' }} /> 跳轉</span>
            <span><i className="sq" style={{ background: '#94a3b8' }} /> 資源</span>
            <span>✏️ 可管理　👁 可看</span>
          </div>
        </>
      )}
    </>
  );
}
