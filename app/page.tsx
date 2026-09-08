'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { loadSession, saveSession, clearSession } from '@/lib/session';
import { useDistrict } from '@/lib/useDistrict';
import type { UserSession, CardDef } from '@/lib/types';
import { canManageAccounts } from '@/lib/accountRoles';
import { canDelegate, isSuper, levelLabel, levelOf } from '@/lib/levels';
import { applyCardOrder, clearCardOrder, loadCardOrder, moveInList, saveCardOrder, type CardOrderMap } from '@/lib/cardOrder';
import { enterDemoRole } from '@/lib/demo/session';
import { DEMO_IDENTITIES } from '@/lib/demo/seed';
import CardItem from '@/components/CardItem';
import PendingTicker from '@/components/PendingTicker';
import WeatherDecisionBanner from '@/components/WeatherDecisionBanner';
import NewsTopPanel from '@/components/NewsTopPanel';

const REMEMBER_KEY = 'portal_remember_login';

type LoginMode = 'login' | 'forgot' | 'reset';

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { district, hasDistrict, withDistrict, districtCode } = useDistrict();
  const [session, setSession] = useState<UserSession | null>(null);
  const [cards, setCards] = useState<CardDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // v4.9.0：自行排列卡片次序（瀏覽器 localStorage，各用戶各自記住）
  const [cardOrder, setCardOrder] = useState<CardOrderMap>({});
  const dragFrom = useRef<number | null>(null);

  // 登入表單
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockMsg, setLockMsg] = useState('');
  const [mode, setMode] = useState<LoginMode>('login');
  const [info, setInfo] = useState('');

  // 忘記密碼 / 重設
  const [resetToken, setResetToken] = useState('');
  const [resetPw1, setResetPw1] = useState('');
  const [resetPw2, setResetPw2] = useState('');

  // 首次登入強制改密碼
  const [forcePw1, setForcePw1] = useState('');
  const [forcePw2, setForcePw2] = useState('');
  const [forceErr, setForceErr] = useState('');
  const [forceBusy, setForceBusy] = useState(false);

  // 已選區後：查系統鎖定 + 既有登入（瀏覽器記住）
  useEffect(() => {
    if (!hasDistrict) return;
    const s = loadSession();
    if (s) { setSession(s); loadCards(s); }
    try {
      const rememberedEmail = localStorage.getItem(REMEMBER_KEY);
      if (rememberedEmail) setEmail(rememberedEmail);
    } catch { /* ignore */ }
    (async () => {
      try {
        const r = await api.getSystem();
        if (r.ok && r.data?.locked) { setLocked(true); setLockMsg(r.data.lockMessage || '系統維護中。'); }
      } catch { /* ignore */ }
    })();
  }, [hasDistrict]);

  // 電郵入面嘅重設連結：/?d=SKW&reset=TOKEN
  useEffect(() => {
    const t = searchParams.get('reset');
    if (t) { setResetToken(t); setMode('reset'); }
  }, [searchParams]);

  // 舊 session 升級：後台 v4.4.0 開始回傳 level / mustChangePassword，用 verify 補回
  useEffect(() => {
    if (!session || typeof session.level === 'number') return;
    (async () => {
      const r = await api.verify(session.token);
      if (r.ok && r.data && typeof r.data.level === 'number') {
        const merged = { ...session, ...r.data, token: session.token };
        saveSession(merged); setSession(merged);
      }
    })();
  }, [session]);

  async function loadCards(s: UserSession) {
    setLoading(true); setError('');
    try {
      const r = await api.getCards(s.token);
      // 後台已過濾：隱藏卡片只會回傳俾超管（enabled=false 用作標示）
      if (r.ok && r.data) {
        const defaults = r.data.slice().sort((a, b) => a.order - b.order);
        const saved = loadCardOrder(districtCode || '', s.email || '');
        setCardOrder(saved);
        setCards(applyCardOrder(defaults, saved));
      }
      else setError(r.error || '無法載入卡片');
    } catch {
      setError('連線失敗：請確認該區後台網址已設定且已部署。');
    } finally { setLoading(false); }
  }

  // ── v4.9.0 卡片次序：移動一格 → 存返 localStorage ──
  const persistOrder = useCallback((list: CardDef[], email: string) => {
    const full: CardOrderMap = {};
    list.forEach((c, i) => { full[c.cardId] = i; });
    saveCardOrder(districtCode || '', email || '', full);
    return full;
  }, [districtCode]);

  function moveCard(from: number, to: number) {
    setCards(prev => {
      const next = moveInList(prev, from, to);
      if (next === prev) return prev;
      if (session) setCardOrder(persistOrder(next, session.email || ''));
      return next;
    });
  }

  function resetCardOrder() {
    if (!session) return;
    clearCardOrder(districtCode || '', session.email || '');
    const defaults = cards.slice().sort((a, b) => a.order - b.order);
    setCardOrder({});
    setCards(defaults);
  }

  // 桌面拖拽（手機用 ▲▼ 掣）
  const dragProps = (i: number) => ({
    draggable: true,
    onDragStart: () => { dragFrom.current = i; },
    onDragOver: (e: React.DragEvent) => { if (dragFrom.current !== null) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const from = dragFrom.current;
      dragFrom.current = null;
      if (from !== null && from !== i) moveCard(from, i);
    },
    onDragEnd: () => { dragFrom.current = null; },
  });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setError(''); setInfo('');
    if (!email || !password) { setError('請輸入帳號及密碼'); return; }
    setLoggingIn(true);
    try {
      const r = await api.login(email.trim(), password, remember);
      if (r.ok && r.data) {
        // 記住登入：session 存 localStorage（依區碼分開）；「記住帳號」另存電郵方便下次
        saveSession(r.data); setSession(r.data); loadCards(r.data);
        try { if (remember) localStorage.setItem(REMEMBER_KEY, email.trim()); else localStorage.removeItem(REMEMBER_KEY); } catch { /* ignore */ }
        setPassword('');
      } else setError(r.error || '帳號或密碼不正確');
    } catch {
      setError('連線失敗：請確認該區後台網址已設定且已部署。');
    } finally { setLoggingIn(false); }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault(); setError(''); setInfo('');
    if (!email.trim()) { setError('請輸入帳號電郵'); return; }
    setLoggingIn(true);
    try {
      const base = `${window.location.origin}${withDistrict('/')}`;
      const r = await api.requestPasswordReset(email.trim(), base);
      if (r.ok) setInfo(r.data?.message || '如該電郵已登記，重設連結已寄出。');
      else setError(r.error || '寄出失敗');
    } catch { setError('連線失敗'); } finally { setLoggingIn(false); }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault(); setError(''); setInfo('');
    if (!resetToken.trim()) { setError('請貼上電郵內嘅重設代碼'); return; }
    if (resetPw1.length < 8) { setError('新密碼最少 8 個字元'); return; }
    if (resetPw1 !== resetPw2) { setError('兩次輸入嘅新密碼唔一樣'); return; }
    setLoggingIn(true);
    try {
      const r = await api.resetPassword(resetToken.trim(), resetPw1);
      if (r.ok) {
        setInfo('密碼已重設 ✓ 請用新密碼登入。');
        if (r.data?.email) setEmail(r.data.email);
        setMode('login'); setResetPw1(''); setResetPw2(''); setResetToken('');
        router.replace(withDistrict('/'));
      } else setError(r.error || '重設失敗');
    } catch { setError('連線失敗'); } finally { setLoggingIn(false); }
  }

  async function handleForceChange(e: React.FormEvent) {
    e.preventDefault(); setForceErr('');
    if (!session) return;
    if (forcePw1.length < 8) { setForceErr('新密碼最少 8 個字元'); return; }
    if (forcePw1 === '1234') { setForceErr('新密碼不可沿用預設密碼 1234'); return; }
    if (forcePw1 !== forcePw2) { setForceErr('兩次輸入嘅新密碼唔一樣'); return; }
    setForceBusy(true);
    try {
      // 首次登入：舊密碼一定係預設 1234（或上級代設嘅密碼——請用戶輸入）
      const r = await api.changePassword(session.token, forceOld || '1234', forcePw1);
      if (r.ok) {
        const next = { ...session, mustChangePassword: false };
        saveSession(next); setSession(next); setForcePw1(''); setForcePw2(''); setForceOld('');
      } else setForceErr(r.error || '修改失敗');
    } catch { setForceErr('連線失敗'); } finally { setForceBusy(false); }
  }
  const [forceOld, setForceOld] = useState('');

  function logout() { clearSession(); setSession(null); setCards([]); }

  // 🎭 模擬示範版：一鍵以示範身份進入（本地沙盒，唔會掂正式後台）
  function startDemo(roleKey: string) {
    enterDemoRole(roleKey);
    window.location.assign(withDistrict('/'));
  }
  // 改自己密碼
  const [showPw, setShowPw] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  async function submitPw() {
    if (!session) return;
    setPwErr(''); setPwMsg('');
    const r = await api.changePassword(session.token, oldPw, newPw);
    if (r.ok) { setPwMsg('密碼已更新 ✓'); setOldPw(''); setNewPw(''); }
    else setPwErr(r.error || '修改失敗');
  }

  // 超管：卡片開啟／隱藏（隱藏後只有超管見到）
  const [cardBusy, setCardBusy] = useState('');
  async function toggleCardEnabled(card: CardDef) {
    if (!session) return;
    setCardBusy(card.cardId); setError('');
    try {
      const r = await api.setCardEnabled(session.token, card.cardId, !card.enabled);
      if (r.ok) setCards(prev => prev.map(c => c.cardId === card.cardId ? { ...c, enabled: !card.enabled } : c));
      else setError(r.error || '操作失敗');
    } catch { setError('連線失敗'); } finally { setCardBusy(''); }
  }

  const superUser = isSuper(session);
  const hiddenCount = useMemo(() => cards.filter(c => !c.enabled).length, [cards]);

  if (!hasDistrict) return null; // DistrictShell 會顯示選區

  // 已選區，未登入 → 第二重：帳戶登入 / 忘記密碼 / 重設密碼
  if (!session) {
    return (
      <div className="center-bg">
        <div className="panel">
          <div className="logo">🧭</div>
          <h1>{district?.name} 登入</h1>
          {mode === 'login' && <p className="sub">第二重：請登入你的帳戶</p>}
          {mode === 'forgot' && <p className="sub">忘記密碼：輸入帳號電郵，重設連結會寄去該帳戶登記嘅電郵</p>}
          {mode === 'reset' && <p className="sub">設定新密碼</p>}
          {locked && <div className="lock-banner">🔒 系統維護中<br /><small>{lockMsg}</small></div>}
          {error && <div className="err">{error}</div>}
          {info && <div className="success">✓ {info}</div>}

          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="field"><label>帳號</label>
                <input type="text" placeholder="帳號或電郵" value={email} onChange={e => setEmail(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" /></div>
              <div className="field"><label>密碼</label>
                <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></div>
              <label className="remember-row">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                <span>記住我（此瀏覽器下次自動登入）</span>
              </label>
              <button className="btn" type="submit" disabled={loggingIn}>{loggingIn ? '登入中…' : '登入'}</button>
              <div className="login-links">
                <button type="button" className="linkish" onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}>忘記密碼？</button>
                <button type="button" className="linkish" onClick={() => { setMode('reset'); setError(''); setInfo(''); }}>已有重設代碼</button>
              </div>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgot}>
              <div className="field"><label>帳號電郵</label>
                <input type="email" placeholder="例如 adc.cub@skwscout.org.hk" value={email} onChange={e => setEmail(e.target.value)} autoCapitalize="none" autoComplete="username" /></div>
              <button className="btn" type="submit" disabled={loggingIn}>{loggingIn ? '寄出中…' : '寄出重設連結'}</button>
              <div className="login-links">
                <button type="button" className="linkish" onClick={() => { setMode('login'); setError(''); }}>← 返回登入</button>
              </div>
              <p className="hint">連結 24 小時內有效，只會寄去該帳戶喺區 Google Sheet 登記嘅電郵。</p>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleReset}>
              <div className="field"><label>重設代碼（電郵連結會自動填好）</label>
                <input type="text" placeholder="貼上電郵內嘅代碼" value={resetToken} onChange={e => setResetToken(e.target.value)} autoCapitalize="none" /></div>
              <div className="field"><label>新密碼（最少 8 字元）</label>
                <input type="password" value={resetPw1} onChange={e => setResetPw1(e.target.value)} autoComplete="new-password" /></div>
              <div className="field"><label>再輸入一次</label>
                <input type="password" value={resetPw2} onChange={e => setResetPw2(e.target.value)} autoComplete="new-password" /></div>
              <button className="btn" type="submit" disabled={loggingIn}>{loggingIn ? '處理中…' : '設定新密碼'}</button>
              <div className="login-links">
                <button type="button" className="linkish" onClick={() => { setMode('login'); setError(''); }}>← 返回登入</button>
              </div>
            </form>
          )}
          <p className="hint">帳號與權限由該區自己的 Google Sheet 控制。</p>

          {/* 🎭 v4.9.0 模擬示範版 — 未登入都可以試晒成個系統（本地沙盒） */}
          <div className="demo-entry">
            <div className="demo-entry-head">
              <span className="demo-badge">🎭 模擬示範版</span>
              <span className="demo-entry-title">未登入都可以試晒成個系統</span>
            </div>
            <p className="demo-entry-desc">
              完整示範資料（獎勵名冊／旅團探訪／借場借物資／消息發佈…），改動<b>只存喺你嘅瀏覽器</b>，絕對唔會影響正式後台。
              以助理區總監（ADC）身份進入，<b>示範版權限全開</b>，咩功能都試到。
            </p>
            <div className="demo-entry-roles">
              {DEMO_IDENTITIES.map(r => (
                <button key={r.key} type="button" className="demo-chip demo-entry-chip" style={{ borderColor: r.color }} onClick={() => startDemo(r.key)} title={r.desc}>
                  {r.icon} 以{r.label}示範
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 首次登入（預設密碼 1234）→ 必須先改密碼，改完先入主控台
  if (session.mustChangePassword) {
    return (
      <div className="center-bg">
        <div className="panel">
          <div className="logo">🔑</div>
          <h1>首次登入：請先設定新密碼</h1>
          <p className="sub">{session.displayName}（{session.roleLabel}）— 為保安全，預設密碼只可用一次。</p>
          {forceErr && <div className="err">{forceErr}</div>}
          <form onSubmit={handleForceChange}>
            <div className="field"><label>目前密碼（預設 1234；如上級代設請輸入該密碼）</label>
              <input type="password" placeholder="1234" value={forceOld} onChange={e => setForceOld(e.target.value)} autoComplete="current-password" /></div>
            <div className="field"><label>新密碼（最少 8 字元，不可再用 1234）</label>
              <input type="password" value={forcePw1} onChange={e => setForcePw1(e.target.value)} autoComplete="new-password" /></div>
            <div className="field"><label>再輸入一次</label>
              <input type="password" value={forcePw2} onChange={e => setForcePw2(e.target.value)} autoComplete="new-password" /></div>
            <button className="btn" type="submit" disabled={forceBusy}>{forceBusy ? '儲存中…' : '儲存並進入主控台'}</button>
          </form>
          <div className="login-links"><button type="button" className="linkish" onClick={logout}>改用其他帳戶登入</button></div>
        </div>
      </div>
    );
  }

  // 已登入 → HERO + 卡片陣列
  return (
    <>
      <section className="dash-hero">
        <div className="dash-hero-top">
          <div>
            <p className="dash-hero-kicker">區管理系統</p>
            <h1 className="page-title" style={{ color: '#fff', fontSize: 26 }}>主控台</h1>
            <p className="dash-hero-sub">
              {session.roleLabel}
              {superUser ? <span className="lvl-chip super">L0 超管</span> : <span className="lvl-chip">L{levelOf(session)} {levelLabel(levelOf(session))}</span>}
              ，歡迎。以下是你權限範圍內的功能（由該區 Google Sheet 控制）。
            </p>
          </div>
          <div className="dash-hero-actions">
            {canManageAccounts(session) && <button className="admin-btn hero-ghost" onClick={() => router.push(withDistrict('/users'))}>👥 帳戶管理</button>}
            {canDelegate(session) && <button className="admin-btn hero-ghost" onClick={() => router.push(withDistrict('/delegate'))}>🤝 授權／收回</button>}
            {session.isAdmin && <button className="admin-btn hero-ghost" onClick={() => router.push(withDistrict('/plugins'))}>🧩 外掛市集</button>}
            {session.isAdmin && <button className="admin-btn hero-ghost" onClick={() => router.push(withDistrict('/admin'))}>⚙️ 權限/角色</button>}
            <button className="admin-btn hero-ghost" onClick={() => setShowPw(v => !v)}>🔑 改密碼</button>
            <button className="admin-btn hero-ghost" onClick={logout}>登出</button>
          </div>
        </div>
        <PendingTicker session={session} />
      </section>

      {showPw && (
        <div className="info-card" style={{ marginTop: 14, borderColor: '#fbbf24' }}>
          <div className="section-head"><div><h3>🔑 修改密碼</h3></div><button className="mini-btn" onClick={() => setShowPw(false)}>關閉</button></div>
          <div className="account-form" style={{ flexWrap: 'wrap', display: 'flex', gap: 8 }}>
            <input type="password" placeholder="舊密碼" value={oldPw} onChange={e => setOldPw(e.target.value)} style={{ width: 180 }} />
            <input type="password" placeholder="新密碼（最少 8 字元）" value={newPw} onChange={e => setNewPw(e.target.value)} style={{ width: 200 }} />
            <button className="btn-sm" onClick={submitPw}>更新</button>
            {pwErr && <span className="err" style={{ fontSize: 12 }}>{pwErr}</span>}
            {pwMsg && <span className="ok-msg">{pwMsg}</span>}
          </div>
        </div>
      )}

      {/* 📢 消息（v4.9.0）：一入主控台就喺最頂，ADC+ 可以直接編輯／刪除，唔使再搵卡片 */}
      <NewsTopPanel session={session} />

      {/* 天氣決策：而家有咩警告 → 活動應唔應該取消（活動指引通告 04/2018） */}
      <WeatherDecisionBanner districtCode={districtCode || ''} onOpen={() => router.push(withDistrict('/incident?tab=weather'))} />

      {superUser && (
        <div className="super-bar">
          <b>🛠 超管模式</b>
          <span>每張卡右上角可「開啟／隱藏」。隱藏後其他人一律睇唔到，只有超管仍可進入，方便私下加功能或升級。</span>
          {hiddenCount > 0 && <span className="lvl-chip super">目前隱藏 {hiddenCount} 張</span>}
        </div>
      )}

      <div style={{ height: 12 }} />
      {loading && <div className="center"><div className="spinner" /><div>載入卡片中…</div></div>}
      {error && <div className="err" style={{ maxWidth: 560 }}>{error}</div>}
      {!loading && !error && (
        <>
          <div className="card-order-bar">
            <span className="muted" style={{ fontSize: 12 }}>
              ✋ 拖拽或者用 ▲▼ 排自己鍾意嘅次序（只影響呢部機／呢個帳號）
            </span>
            {Object.keys(cardOrder).length > 0 && (
              <button className="linkish" onClick={resetCardOrder}>↺ 還原預設次序</button>
            )}
          </div>
          <div className="grid">
            {cards.map((c, i) => (
              <CardItem
                key={c.cardId} card={c} role={session.role}
                canToggle={superUser}
                toggling={cardBusy === c.cardId}
                onToggle={() => toggleCardEnabled(c)}
                canReorder
                first={i === 0}
                last={i === cards.length - 1}
                onMoveUp={() => moveCard(i, i - 1)}
                onMoveDown={() => moveCard(i, i + 1)}
                dragProps={dragProps(i)}
              />
            ))}
          </div>
          <div className="legend">
            <span><i className="sq" style={{ background: '#16a34a' }} /> 內建</span>
            <span><i className="sq" style={{ background: '#4338ca' }} /> 跳轉</span>
            <span><i className="sq" style={{ background: '#94a3b8' }} /> 資源</span>
            <span><i className="sq done" /> 藍框＝已完成</span>
            <span><i className="sq todo" /> 虛線＝🚧 加入中</span>
            {superUser && <span><i className="sq hidden" /> 灰＝已隱藏（只有超管見）</span>}
            <span>✏️ 可管理　👁 可看</span>
          </div>
        </>
      )}
    </>
  );
}
