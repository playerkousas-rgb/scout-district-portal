'use client';
/**
 * 🏛 地域及總會架構（v4.5.0）
 * ─────────────────────────────────────────────────────────────────────
 * 港島地域總監架構 + 總會（香港總監諮議會／執行委員會）。
 * 名單由 /api/external 即時讀官方網頁（hkirscout.org.hk 總監架構、scout.org.hk 香港總監諮議會），
 * 職位改人自動反映；讀唔到就用 lib/orgDirectory.ts 靜態備援（會標明）。
 * 只列架構，唔放電話——要搵人解決問題請用「聯絡簿」。
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { useDistrict } from '@/lib/useDistrict';
import BackLink, { BackBar } from '@/components/BackLink';
import { SOURCES } from '@/lib/externalSources';
import { groupByRank, type OrgGroup, type OrgMember } from '@/lib/externalParsers';
import {
  HKSA_COUNCIL_FALLBACK, HKSA_COUNCIL_UPDATED, HKSA_EC, HKSA_EC_UPDATED, HKSA_REGIONS,
  REGION_ORG_FALLBACK, REGION_ORG_UPDATED,
} from '@/lib/orgDirectory';

type Tab = 'region' | 'hksa';
const TABS: { id: Tab; label: string }[] = [
  { id: 'region', label: '🏝 港島地域' },
  { id: 'hksa', label: '🏛 總會' },
];

const GROUP_ICON: Record<string, string> = {
  地域總監: '⭐', 副地域總監: '🌟', 助理地域總監: '✨', 區總監: '🧭', 地域總部總監: '📌', 助理地域總部總監: '📎',
  香港總監: '⭐', 副香港總監: '🌟', 助理香港總監: '✨', 總幹事: '🏢',
};

function hit(x: OrgMember, q: string) {
  if (!q) return true;
  return `${x.post} ${x.scope || ''} ${x.name}`.toLowerCase().includes(q.toLowerCase());
}

function Person({ p, big = false }: { p: OrgMember; big?: boolean }) {
  return (
    <div className={`org-person ${big ? 'big' : ''}`}>
      {p.photo ? <img src={p.photo} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : <span className="org-avatar">{p.name.slice(0, 1)}</span>}
      <div>
        <b>{p.name}</b>
        <small>{p.scope ? `（${p.scope}）` : p.post}</small>
      </div>
    </div>
  );
}

/**
 * 一組職位：同一 rank 內以「範疇」分行；姓名直接跟住。
 * v4.9.0：「區總監」7 區合併做一個大格（標明 xx 區），一眼睇晒全部區總監。
 */
function RankBlock({ g, q }: { g: OrgGroup; q: string }) {
  const rows = g.members.filter(x => hit(x, q));
  if (!rows.length) return null;
  const single = g.members.length === 1;
  const isDCs = g.title === '區總監';
  return (
    <section className="info-card org-block">
      <div className="section-head"><div><h3>{GROUP_ICON[g.title] || '•'} {g.title} <small>({rows.length})</small></h3></div></div>
      {isDCs ? (
        <div className="org-dc-cell">
          <div className="org-dc-cell-head"><span className="org-avatar big">🧭</span><b>港島地域 7 區區總監</b></div>
          <div className="org-dc-grid">
            {rows.map((p, i) => (
              <div key={`${p.name}-${p.scope}-${i}`} className="org-dc-item">
                <small>{p.scope || p.post}</small>
                <b>{p.name}</b>
              </div>
            ))}
          </div>
        </div>
      ) : single ? <Person p={rows[0]} big /> : (
        <div className="org-grid">
          {rows.map((p, i) => <Person key={`${p.name}-${p.scope}-${i}`} p={p} />)}
        </div>
      )}
    </section>
  );
}

function SourceLine({ live, updated, fetchedAt, stale, source }: { live: boolean; updated?: string; fetchedAt?: string; stale?: string; source: string }) {
  return (
    <p className="fps-help">
      {live ? '🟢 已由官方網頁即時同步' : '⚪ 官方網頁暫時讀唔到，顯示內建備援名單'}
      {updated ? ` · 網頁更新日期 ${updated}` : ''}
      {fetchedAt ? ` · 同步 ${new Date(fetchedAt).toLocaleString('zh-HK', { hour12: false })}` : ''}
      {stale ? ` · ⚠️ 上次成功結果（${stale}）` : ''}
      {' · '}<a href={source} target="_blank" rel="noopener" style={{ textDecoration: 'underline' }}>來源 ↗</a>
    </p>
  );
}

export default function OrgChartPage() {
  const session = useRequireCard('orgchart');
  const { withDistrict } = useDistrict();
  const searchParams = useSearchParams();
  const initial = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && TABS.some(t => t.id === initial) ? initial : 'region');
  const [q, setQ] = useState('');

  const [region, setRegion] = useState<{ groups: OrgGroup[]; updated: string; live: boolean; fetchedAt?: string; stale?: string }>({ groups: REGION_ORG_FALLBACK, updated: REGION_ORG_UPDATED, live: false });
  const [council, setCouncil] = useState<{ members: OrgMember[]; live: boolean; fetchedAt?: string; stale?: string }>({ members: HKSA_COUNCIL_FALLBACK, live: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const [r1, r2] = await Promise.all([api.extRegionOrg(), api.extHksaCouncil()]);
      if (cancelled) return;
      if (r1.ok && r1.data && r1.data.groups.length) {
        setRegion({ groups: r1.data.groups, updated: r1.data.updated || '', live: true, fetchedAt: r1.data.fetchedAt, stale: r1.data.stale ? (r1.data.staleReason || '') : undefined });
      }
      if (r2.ok && r2.data && r2.data.members.length) {
        setCouncil({ members: r2.data.members, live: true, fetchedAt: r2.data.fetchedAt, stale: r2.data.stale ? (r2.data.staleReason || '') : undefined });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session]);

  const councilGroups = useMemo(() => groupByRank(council.members), [council.members]);
  const regionCount = useMemo(() => region.groups.reduce((n, g) => n + g.members.filter(x => hit(x, q)).length, 0), [region.groups, q]);
  const hksaCount = useMemo(() => council.members.filter(x => hit(x, q)).length + HKSA_EC.filter(x => hit(x, q)).length, [council.members, q]);

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🏛 地域及總會架構</h1>
      <p className="page-sub">邊個職位而家係邊個——名單自動跟官方網頁更新。要聯絡地域職員請用 <Link href={withDistrict('/contacts?tab=region')} style={{ textDecoration: 'underline' }}>聯絡簿</Link>。</p>

      <div className="inc-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`inc-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
        <input className="search-input dir-search" placeholder="搜尋姓名／職位／範疇" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {tab === 'region' && (
        <>
          <div className="org-summary">
            <div className="org-sum-item"><b>{region.groups.reduce((n, g) => n + g.members.length, 0)}</b><span>總監職位</span></div>
            {region.groups.map(g => <div key={g.id} className="org-sum-item"><b>{g.members.length}</b><span>{g.title}</span></div>)}
          </div>
          {q && <p className="fps-help">符合「{q}」：{regionCount} 人</p>}
          {loading && <p className="fps-help">⏳ 正由官方網頁同步最新名單…</p>}
          {region.groups.map(g => <RankBlock key={g.id} g={g} q={q} />)}
          <SourceLine live={region.live} updated={region.updated} fetchedAt={region.fetchedAt} stale={region.stale} source={SOURCES.hkirCommissioner} />
        </>
      )}

      {tab === 'hksa' && (
        <>
          <section className="info-card org-tree">
            <div className="section-head"><div><h3>🗺 總會 → 地域 → 區</h3><p>港島地域係總會五個地域之一；筲箕灣區屬港島地域轄下 7 個區之一。</p></div></div>
            <div className="org-tree-row"><span className="org-node root">香港童軍總會（總會執行委員會 · 香港總監諮議會）</span></div>
            <div className="org-tree-row">
              {HKSA_REGIONS.map(r => <span key={r} className={`org-node ${r === '港島地域' ? 'me' : ''}`}>{r}</span>)}
            </div>
            <div className="org-tree-row"><span className="org-node leaf">柴灣區 · 港島北區 · 港島南區 · 港島西區 · <b>筲箕灣區</b> · 維多利亞城區 · 灣仔區</span></div>
          </section>

          {q && <p className="fps-help">符合「{q}」：{hksaCount} 人</p>}
          {loading && <p className="fps-help">⏳ 正由官方網頁同步最新名單…</p>}
          <h2 className="org-h2">香港總監諮議會（受薪及義務領導層）</h2>
          {councilGroups.map(g => <RankBlock key={g.id} g={g} q={q} />)}
          <SourceLine live={council.live} updated={council.live ? undefined : HKSA_COUNCIL_UPDATED} fetchedAt={council.fetchedAt} stale={council.stale} source={SOURCES.hksaCouncil} />

          <h2 className="org-h2">總會執行委員會 主要職位 <small className="muted" style={{ fontWeight: 500, fontSize: 12 }}>（{HKSA_EC_UPDATED}）</small></h2>
          <section className="info-card org-block">
            <div className="org-grid">
              {HKSA_EC.filter(x => hit(x, q)).map((p, i) => (
                <div className="org-person" key={i}><span className="org-avatar">{p.name.slice(0, 1)}</span><div><b>{p.name}</b><small>{p.post}</small></div></div>
              ))}
            </div>
            <p className="fps-help">來源：<a href={SOURCES.hksaEc} target="_blank" rel="noopener" style={{ textDecoration: 'underline' }}>總會執行委員會 ↗</a>（每年度改選，內建名單需人手核對）。</p>
          </section>
        </>
      )}
      <BackBar />
    </>
  );
}
