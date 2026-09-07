'use client';
/**
 * 📇 聯結簿 — 三個分頁：旅團 / 港島地域 / 總會
 * 旅團資料由區方稍後提供（先保留結構 + Config TROOP_LIST 旅號清單）；
 * 港島地域分頁只放「職員直線電話」（v4.5.0：總監架構搬去 /orgchart），
 * 職員表及總會各署電話由 /api/external 即時讀官方網頁，讀唔到先用 lib/contactsDirectory.ts 備援。
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { useDistrict } from '@/lib/useDistrict';
import BackLink, { BackBar } from '@/components/BackLink';
import { SOURCES } from '@/lib/externalSources';
import {
  HQ_GROUPS, HQ_OFFICE, REGION_GROUPS, REGION_OFFICE, TROOP_ROWS, staffEmailFor, type ContactGroup, type ContactRow,
} from '@/lib/contactsDirectory';

interface LiveState { live: boolean; updated?: string; fetchedAt?: string; stale?: string }

function SyncLine({ st, source, label }: { st: LiveState; source: string; label: string }) {
  return (
    <p className="fps-help">
      {st.live ? `🟢 ${label}已由官方網頁即時同步` : `⚪ ${label}官方網頁暫時讀唔到，顯示內建備援資料`}
      {st.updated ? ` · 網頁更新日期 ${st.updated}` : ''}
      {st.fetchedAt ? ` · 同步 ${new Date(st.fetchedAt).toLocaleString('zh-HK', { hour12: false })}` : ''}
      {st.stale ? ` · ⚠️ 上次成功結果（${st.stale}）` : ''}
      {' · '}<a href={source} target="_blank" rel="noopener" style={{ textDecoration: 'underline' }}>來源 ↗</a>
    </p>
  );
}

type Tab = 'troop' | 'region' | 'hq';
const TABS: { id: Tab; label: string }[] = [
  { id: 'troop', label: '🏕 旅團' },
  { id: 'region', label: '🏝 港島地域' },
  { id: 'hq', label: '🏛 總會' },
];

function telHref(t?: string) { return t ? `tel:${t.split(/[/／]/)[0].replace(/\s/g, '')}` : ''; }

function matches(r: ContactRow, q: string) {
  if (!q) return true;
  const s = `${r.post} ${r.name || ''} ${r.tel || ''} ${r.email || ''} ${r.note || ''}`.toLowerCase();
  return s.includes(q.toLowerCase());
}

function GroupTable({ g, q }: { g: ContactGroup; q: string }) {
  const rows = g.rows.filter(r => matches(r, q));
  if (!rows.length) return null;
  const hasTel = rows.some(r => r.tel), hasMail = rows.some(r => r.email), hasNote = rows.some(r => r.note || r.fax);
  return (
    <section className="info-card">
      <div className="section-head"><div><h3>{g.icon} {g.title} <small>({rows.length})</small></h3>{g.intro && <p>{g.intro}</p>}</div></div>
      <div className="mtx-scroll">
        <table className="perm-table dir-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>職位／單位</th>
              <th style={{ textAlign: 'left' }}>姓名</th>
              {hasTel && <th style={{ textAlign: 'left' }}>電話</th>}
              {hasMail && <th style={{ textAlign: 'left' }}>電郵</th>}
              {hasNote && <th style={{ textAlign: 'left' }}>備註</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'left', fontWeight: 700 }}>{r.post}</td>
                <td style={{ textAlign: 'left' }}>{r.name || <span className="muted">—</span>}</td>
                {hasTel && <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{r.tel ? <a href={telHref(r.tel)}>{r.tel}</a> : <span className="muted">—</span>}</td>}
                {hasMail && <td style={{ textAlign: 'left' }}>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : <span className="muted">—</span>}</td>}
                {hasNote && <td style={{ textAlign: 'left', fontSize: 12, color: '#475569' }}>{[r.fax ? `傳真 ${r.fax}` : '', r.note || ''].filter(Boolean).join(' · ')}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OfficeCard({ o }: { o: { name: string; address: string; tel: string; fax?: string; email?: string; web?: string; hours?: string; updated: string } }) {
  return (
    <div className="dir-office">
      <div>
        <b>{o.name}</b>
        <div className="dir-office-line">📍 {o.address}</div>
        {o.hours && <div className="dir-office-line">🕘 {o.hours}</div>}
      </div>
      <div className="dir-office-actions">
        <a className="mini-btn" href={telHref(o.tel)}>📞 {o.tel}</a>
        {o.fax && <span className="mini-btn ghost">📠 {o.fax}</span>}
        {o.email && <a className="mini-btn" href={`mailto:${o.email}`}>✉️ {o.email}</a>}
        {o.web && <a className="mini-btn" href={o.web} target="_blank" rel="noopener">🌐 網站 ↗</a>}
        <small className="muted">資料截至 {o.updated}</small>
      </div>
    </div>
  );
}

export default function ContactsPage() {
  const session = useRequireCard('contacts');
  const { withDistrict } = useDistrict();
  const searchParams = useSearchParams();
  const initial = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && TABS.some(t => t.id === initial) ? initial : 'troop');
  const [q, setQ] = useState('');
  const [troopList, setTroopList] = useState<string[]>([]);
  const [regionGroups, setRegionGroups] = useState<ContactGroup[]>(REGION_GROUPS);
  const [regionSync, setRegionSync] = useState<LiveState>({ live: false, updated: REGION_OFFICE.updated });
  const [hqGroups, setHqGroups] = useState<ContactGroup[]>(HQ_GROUPS);
  const [hqSync, setHqSync] = useState<LiveState>({ live: false });

  // 旅號清單：先讀 Config TROOP_LIST（活動知會表同一份）
  useEffect(() => {
    (async () => {
      try {
        const r = await api.getPublicInfo();
        if (r.ok && r.data?.troopList) setTroopList(r.data.troopList);
      } catch { /* ignore */ }
    })();
  }, []);

  // 港島地域職員表 + 總會各署：由官方網頁即時同步（失敗保留靜態備援）
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const [rs, rd] = await Promise.all([api.extRegionStaff(), api.extHksaDepts()]);
      if (cancelled) return;
      if (rs.ok && rs.data && rs.data.rows.length) {
        const staticStaff = REGION_GROUPS.find(g => g.id === 'staff');
        const rows: ContactRow[] = rs.data.rows.map((r) => {
          const prev = staticStaff?.rows.find(x => x.tel === r.tel && x.post === r.post);
          return { post: r.post, name: r.name || '—', tel: r.tel, email: staffEmailFor(r.post) || undefined, note: prev?.note };
        });
        setRegionGroups(REGION_GROUPS.map(g => (g.id === 'staff' ? { ...g, rows } : g)));
        setRegionSync({ live: true, updated: rs.data.updated || undefined, fetchedAt: rs.data.fetchedAt, stale: rs.data.stale ? (rs.data.staleReason || '') : undefined });
      }
      if (rd.ok && rd.data && rd.data.depts.some(d => d.ok)) {
        const staticDepts = HQ_GROUPS.find(g => g.id === 'depts');
        const rows: ContactRow[] = rd.data.depts.map((d) => {
          const prev = staticDepts?.rows.find(x => x.post.startsWith(d.name));
          if (!d.ok) return prev || { post: d.name };
          return {
            post: prev?.post || d.name, name: undefined, tel: d.tel || prev?.tel, fax: d.fax || prev?.fax, email: d.email || prev?.email,
            note: [d.address ? d.address.replace(/^.*?童軍中心/, '童軍中心') : '', prev?.note?.replace(/^\d+ 樓 \d+ 室(?: · )?/, '') || ''].filter(Boolean).join(' · ') || undefined,
          };
        });
        setHqGroups(HQ_GROUPS.map(g => (g.id === 'depts' ? { ...g, rows } : g)));
        setHqSync({ live: true, fetchedAt: rd.data.fetchedAt, stale: rd.data.stale ? (rd.data.staleReason || '') : undefined });
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  const regionCount = useMemo(() => regionGroups.reduce((n, g) => n + g.rows.filter(r => matches(r, q)).length, 0), [regionGroups, q]);
  const hqCount = useMemo(() => hqGroups.reduce((n, g) => n + g.rows.filter(r => matches(r, q)).length, 0), [hqGroups, q]);

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">📇 聯結簿</h1>
      <p className="page-sub">旅團 · 港島地域 · 總會 聯絡資料；手機上按電話即可致電、按電郵即可寫信。</p>

      <div className="inc-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`inc-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
        <input className="search-input dir-search" placeholder="搜尋姓名／職位／電話／電郵" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {tab === 'troop' && (
        <>
          <section className="info-card">
            <div className="section-head"><div><h3>🏕 本區旅團 <small>({TROOP_ROWS.length || troopList.length})</small></h3><p>旅團聯絡資料由區方提供後匯入；現時先列出 Config「TROOP_LIST」旅號清單。</p></div></div>
            {TROOP_ROWS.length > 0 ? (
              <div className="mtx-scroll">
                <table className="perm-table dir-table">
                  <thead><tr><th style={{ textAlign: 'left' }}>旅號</th><th style={{ textAlign: 'left' }}>主辦機構</th><th style={{ textAlign: 'left' }}>支部</th><th style={{ textAlign: 'left' }}>旅長／團長</th><th style={{ textAlign: 'left' }}>電話</th><th style={{ textAlign: 'left' }}>電郵</th><th style={{ textAlign: 'left' }}>集會</th></tr></thead>
                  <tbody>
                    {TROOP_ROWS.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())).map((r, i) => (
                      <tr key={i}>
                        <td style={{ textAlign: 'left', fontWeight: 700 }}>{r.troop}</td>
                        <td style={{ textAlign: 'left' }}>{r.sponsor || '—'}</td>
                        <td style={{ textAlign: 'left' }}>{r.sections || '—'}</td>
                        <td style={{ textAlign: 'left' }}>{r.leader || '—'}</td>
                        <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{r.phone ? <a href={telHref(r.phone)}>{r.phone}</a> : '—'}</td>
                        <td style={{ textAlign: 'left' }}>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : '—'}</td>
                        <td style={{ textAlign: 'left', fontSize: 12 }}>{r.meet || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : troopList.length > 0 ? (
              <div className="dir-troops">
                {troopList.filter(t => !q || t.toLowerCase().includes(q.toLowerCase())).map(t => <span key={t} className="dir-troop-chip">{t}</span>)}
              </div>
            ) : (
              <div className="placeholder-box" style={{ padding: 22 }}>
                <div className="big">🏕</div>
                <p style={{ fontWeight: 700, color: '#003366', marginBottom: 6 }}>等待區方提供旅團資料</p>
                <p style={{ fontSize: 13, color: '#475569' }}>格式建議：旅號 / 主辦機構 / 支部 / 旅長 / 電話 / 電郵 / 集會時間地點。提供後可匯入 Google Sheet，聯結簿即時顯示。</p>
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'region' && (
        <>
          <OfficeCard o={{ ...REGION_OFFICE, updated: regionSync.updated || REGION_OFFICE.updated }} />
          {q && <p className="fps-help">符合「{q}」：{regionCount} 項</p>}
          {regionGroups.map(g => <GroupTable key={g.id} g={g} q={q} />)}
          <SyncLine st={regionSync} source={SOURCES.hkirStaff} label="職員表" />
          <p className="fps-help">呢頁只放搵人解決問題用嘅職員直線電話；地域總監／區總監等架構請睇 <Link href={withDistrict('/orgchart')} style={{ textDecoration: 'underline' }}>🏛 地域及總會架構</Link>。地域職員個人電郵未有公開，一律經 hkir@scout.org.hk。</p>
        </>
      )}

      {tab === 'hq' && (
        <>
          <OfficeCard o={{ ...HQ_OFFICE, updated: hqSync.fetchedAt ? hqSync.fetchedAt.slice(0, 10) : HQ_OFFICE.updated }} />
          {q && <p className="fps-help">符合「{q}」：{hqCount} 項</p>}
          {hqGroups.map(g => <GroupTable key={g.id} g={g} q={q} />)}
          <SyncLine st={hqSync} source={SOURCES.hksaHq} label="總會各署電話" />
          <p className="fps-help">其他總部單位／五個地域辦事處／緊急電話為內建資料（2026-09 查閱）；總會領導層架構請睇 <Link href={withDistrict('/orgchart?tab=hksa')} style={{ textDecoration: 'underline' }}>🏛 地域及總會架構</Link>。</p>
        </>
      )}
      <BackBar />
    </>
  );
}
