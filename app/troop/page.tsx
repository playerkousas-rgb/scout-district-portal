'use client';
/**
 * 🏕 旅團（v4.32.0 合併卡）— 一張卡，兩個分頁：
 *   🏕 旅團探訪（探訪登記／探訪報告／📨 申請邀請）
 *   🧭 旅團資料（公開資料／🔒 旅團聯絡）
 *
 * 每個小分頁在 Perms 權限表各有一行子權限（visit／troopDirectory／
 * troopContacts／troopRequests），由超管在「⚙️ 權限／角色管理」以 👁／✏️ 設定。
 * 本頁按子權限決定顯示哪些分頁；後台各 action 亦各自複查，前端隱藏不構成安全邊界。
 * 舊 GS（未升級）後台回獨立 visit／troopDirectory 卡時，同樣以該兩卡 access 放行。
 */
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkCardAccess } from '@/lib/cardAccess';
import { loadSession } from '@/lib/session';
import { useDistrict } from '@/lib/useDistrict';
import type { UserSession } from '@/lib/types';
import VisitPanel from '@/components/VisitPanel';
import TroopDirectoryPanel from '@/components/TroopDirectoryPanel';
import BackLink, { BackBar } from '@/components/BackLink';

type MainTab = 'visit' | 'directory';

interface SubAccess {
  visit: boolean;
  directory: boolean;
  contacts: boolean;
  requests: boolean;
}

export default function TroopPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { withDistrict } = useDistrict();
  const requested = searchParams.get('tab');
  const initialMain: MainTab = requested === 'directory' || requested === 'units' ? 'directory' : 'visit';
  const initialVisitTab = requested === 'report' || requested === 'requests' ? requested : 'board';

  const [session, setSession] = useState<UserSession | null>(null);
  const [subs, setSubs] = useState<SubAccess | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [mainTab, setMainTab] = useState<MainTab>(initialMain);

  useEffect(() => {
    let cancelled = false;
    setChecking(true); setError('');
    const s = loadSession();
    if (!s) { router.replace(withDistrict('/')); return () => { cancelled = true; }; }
    (async () => {
      const ids = ['troop', 'visit', 'troopDirectory', 'troopContacts', 'troopRequests'] as const;
      const results = await Promise.all(ids.map(id => checkCardAccess(s.token, id)));
      if (cancelled) return;
      const allowed = (i: number) => results[i].status === 'allowed';
      const next: SubAccess = {
        visit: allowed(1),
        directory: allowed(2),
        contacts: allowed(3),
        requests: allowed(4),
      };
      const anyAllowed = allowed(0) || next.visit || next.directory || next.contacts || next.requests;
      const allError = results.every(r => r.status === 'error');
      setChecking(false);
      if (!anyAllowed) {
        if (allError) {
          const firstError = results.find(r => r.status === 'error');
          setError(firstError && firstError.status === 'error' ? firstError.error : '暫未能確認權限，請稍後再試。');
        } else {
          router.replace(withDistrict('/'));
        }
        return;
      }
      setSubs(next);
      setSession(prev => (prev && prev.token === s.token ? prev : s));
      setMainTab(prev => {
        const wantVisit = next.visit || next.requests;
        const wantDirectory = next.directory || next.contacts;
        if (prev === 'visit' && !wantVisit && wantDirectory) return 'directory';
        if (prev === 'directory' && !wantDirectory && wantVisit) return 'visit';
        return prev;
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  function pickMain(tab: MainTab) {
    setMainTab(tab);
    const query = new URLSearchParams(searchParams.toString());
    query.set('tab', tab === 'directory' ? 'directory' : 'visit');
    router.replace(withDistrict(`/troop?${query.toString()}`), { scroll: false });
  }

  if (error) {
    return (
      <>
        <BackLink />
        <h1 className="page-title">🏕 旅團</h1>
        <div className="err" role="alert">{error}</div>
        <button className="mini-btn" onClick={() => setAttempt(a => a + 1)}>重試</button>
        <BackBar />
      </>
    );
  }
  if (checking || !session || !subs) return <div className="center"><div className="spinner" /></div>;

  const showVisitTab = subs.visit || subs.requests;
  const showDirectoryTab = subs.directory || subs.contacts;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🏕 旅團</h1>
      <p className="page-sub">旅團探訪 · 旅團資料（各小分頁權限於權限表獨立設定）</p>

      <div className="inc-tabs" role="tablist" aria-label="旅團分頁">
        {showVisitTab && (
          <button role="tab" aria-selected={mainTab === 'visit'} className={`inc-tab${mainTab === 'visit' ? ' on' : ''}`} onClick={() => pickMain('visit')}>🏕 旅團探訪</button>
        )}
        {showDirectoryTab && (
          <button role="tab" aria-selected={mainTab === 'directory'} className={`inc-tab${mainTab === 'directory' ? ' on' : ''}`} onClick={() => pickMain('directory')}>🧭 旅團資料</button>
        )}
      </div>

      {mainTab === 'visit' && showVisitTab && (
        <VisitPanel
          session={session}
          initialTab={initialVisitTab === 'requests' && subs.requests ? 'requests' : initialVisitTab === 'report' && subs.visit ? 'report' : subs.visit ? 'board' : 'requests'}
          showVisit={subs.visit}
          showRequests={subs.requests}
        />
      )}
      {mainTab === 'directory' && showDirectoryTab && (
        <TroopDirectoryPanel session={session} showDirectory={subs.directory} showContacts={subs.contacts} />
      )}
      <BackBar />
    </>
  );
}
