'use client';
/**
 * 📇 聯結簿 — 三個分頁：旅團 / 港島地域 / 總會
 * 旅團資料由區方稍後提供（先保留結構 + Config TROOP_LIST 旅號清單）；
 * 地域／總會資料整理自官方網站（lib/contactsDirectory.ts 列明來源及日期）。
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import BackLink, { BackBar } from '@/components/BackLink';
import {
  HQ_GROUPS, HQ_OFFICE, REGION_GROUPS, REGION_OFFICE, TROOP_ROWS, type ContactGroup, type ContactRow,
} from '@/lib/contactsDirectory';

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
  const searchParams = useSearchParams();
  const initial = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && TABS.some(t => t.id === initial) ? initial : 'troop');
  const [q, setQ] = useState('');
  const [troopList, setTroopList] = useState<string[]>([]);

  // 旅號清單：先讀 Config TROOP_LIST（活動知會表同一份）
  useEffect(() => {
    (async () => {
      try {
        const r = await api.getPublicInfo();
        if (r.ok && r.data?.troopList) setTroopList(r.data.troopList);
      } catch { /* ignore */ }
    })();
  }, []);

  const regionCount = useMemo(() => REGION_GROUPS.reduce((n, g) => n + g.rows.filter(r => matches(r, q)).length, 0), [q]);
  const hqCount = useMemo(() => HQ_GROUPS.reduce((n, g) => n + g.rows.filter(r => matches(r, q)).length, 0), [q]);

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
          <OfficeCard o={REGION_OFFICE} />
          {q && <p className="fps-help">符合「{q}」：{regionCount} 項</p>}
          {REGION_GROUPS.map(g => <GroupTable key={g.id} g={g} q={q} />)}
          <p className="fps-help">來源：港島地域網站「專業領袖及受薪職員」（2026-07-16 更新）及「總監架構」（2026-08-13 更新）。地域職員及總監個人電郵未有公開，一律經 hkir@scout.org.hk。</p>
        </>
      )}

      {tab === 'hq' && (
        <>
          <OfficeCard o={HQ_OFFICE} />
          {q && <p className="fps-help">符合「{q}」：{hqCount} 項</p>}
          {HQ_GROUPS.map(g => <GroupTable key={g.id} g={g} q={q} />)}
          <p className="fps-help">來源：香港童軍總會網站「總部」各署頁面（2026-09 查閱）。</p>
        </>
      )}
      <BackBar />
    </>
  );
}
