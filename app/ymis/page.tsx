'use client';
/** 區獲發的 YMIS 唯讀核實帳戶：只供總監級／職員查閱，再自行到官方網站登入。 */
import { useEffect, useRef, useState } from 'react';
import { api, type YmisCredentials } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { useDistrict } from '@/lib/useDistrict';
import BackLink, { BackBar } from '@/components/BackLink';

const YMIS_LOGIN_URL = 'https://ymis.scout.org.hk/#/Login';
const HIDE_AFTER_MS = 60_000;

type Revealed = Pick<YmisCredentials, 'username' | 'password'> & { username: string; password: string };

export default function YmisPage() {
  const session = useRequireCard('ymis');
  const { districtCode } = useDistrict();
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  useEffect(() => () => {
    requestId.current++;
    if (timer.current) clearTimeout(timer.current);
  }, []);
  // 換區／換登入帳戶時，唔容許上一個區的帳密留喺畫面上。
  useEffect(() => {
    requestId.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRevealed(null); setNotConfigured(false); setError(''); setBusy(false);
  }, [districtCode, session?.token]);

  function hide() {
    requestId.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRevealed(null);
    setBusy(false);
  }

  async function reveal() {
    if (!session || busy) return;
    hide();
    setError(''); setNotConfigured(false); setBusy(true);
    const id = ++requestId.current;
    try {
      const result = await api.getYmisCredentials(session.token);
      if (id !== requestId.current) return;
      if (!result.ok) { setError(result.error || '暫時無法讀取帳戶資料。'); return; }
      if (!result.data?.configured || !result.data.username || !result.data.password) {
        setNotConfigured(true); return;
      }
      // 只存在目前頁面的記憶體；不寫入 URL、localStorage、sessionStorage 或紀錄。
      setRevealed({ username: result.data.username, password: result.data.password });
      timer.current = setTimeout(() => { setRevealed(null); timer.current = null; }, HIDE_AFTER_MS);
    } catch {
      if (id === requestId.current) setError('連線失敗，請稍後再試。');
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🪪 YMIS 會員核實</h1>
      <p className="page-sub">按「權限／角色管理」獲授權的角色可查閱區方核實帳戶；區系統只協助找回帳密，YMIS 仍要在官方網站自行登入。</p>
      {session.mockAdmin && <div className="fps-notice" role="status" style={{ marginBottom: 16 }}>🎭 示範版只展示無法登入的虛構帳密，並不會讀取正式後台。</div>}

      <div className="ymis-intro">
        <div className="ymis-eyebrow">🔗 官方網站 · 手動登入</div>
        <h2>前往 YMIS 核實會員及所屬旅團</h2>
        <p>先在下方按掣查看區方帳密，再開啟官方登入頁，自己輸入資料。區系統不會代你登入、查詢或儲存核實結果。</p>
        <a className="admin-btn ymis-open" href={YMIS_LOGIN_URL} target="_blank" rel="noopener noreferrer">開啟 YMIS 登入頁 ↗</a>
      </div>

      <section className="info-card ymis-card">
        <div className="section-head">
          <div>
            <h3>🔐 區方核實帳戶</h3>
            <p>只在按「顯示帳密」後讀取；顯示 60 秒後自動隱藏。請勿截圖、轉發或在公用電腦查閱。</p>
          </div>
        </div>

        {error && <div className="err" role="alert">{error}</div>}
        {notConfigured && <div className="fps-notice" role="status">後台尚未設定 YMIS 核實帳戶。請區系統管理員在 Apps Script 的 Script Properties 填寫新帳密；不要放在公開網頁或試算表。</div>}

        {revealed ? (
          <div className="ymis-credentials" role="group" aria-label="區方核實帳戶（60 秒後隱藏）">
            <div className="ymis-credential"><span>帳號</span><code>{revealed.username}</code></div>
            <div className="ymis-credential"><span>密碼</span><code>{revealed.password}</code></div>
            <div className="ymis-actions">
              <span>請在官方 YMIS 頁面自行輸入 · 60 秒後自動隱藏</span>
              <button type="button" className="mini-btn ghost" onClick={hide}>隱藏帳密</button>
            </div>
          </div>
        ) : (
          <button type="button" className="admin-btn" onClick={reveal} disabled={busy}>
            {busy ? '核對權限及讀取中…' : '顯示帳密（60 秒）'}
          </button>
        )}
      </section>

      <p className="fps-help">此帳戶由區方管理，供獲授權的總監級／職員核實會員及所屬旅團。顯示帳密只係方便手動登入，唔會將區系統登入狀態傳畀 YMIS；如果帳戶權限或密碼有變，請向區方管理員查詢。</p>
      <BackBar />
    </>
  );
}
