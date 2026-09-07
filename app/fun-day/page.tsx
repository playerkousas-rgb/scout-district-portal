'use client';
/**
 * 🎪 港島童軍繽紛日 2026 — 籌備會議 + 執行手冊
 * ─────────────────────────────────────────────────────────────────────
 * 注意：呢頁唔經後台 Cards／Perms（唔使改 Apps Script），只要求已登入。
 * 資料全部喺 lib/funDay.ts：加開會／補文件只改嗰個檔。
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loadSession } from '@/lib/session';
import { useDistrict } from '@/lib/useDistrict';
import BackLink, { BackBar } from '@/components/BackLink';
import {
  FUN_DAY_MANUAL,
  FUN_DAY_MEETINGS,
  FUN_DAY_NAME,
  meetingIcs,
  meetingNoticeText,
  meetingTitle,
  nextFunDayMeeting,
  type FunDayMeeting,
} from '@/lib/funDay';

type Tab = 'meetings' | 'manual';
const TABS: { id: Tab; label: string }[] = [
  { id: 'meetings', label: '🗓 籌備會議' },
  { id: 'manual', label: '📖 執行手冊' },
];

export default function FunDayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { district, withDistrict } = useDistrict();
  const [ready, setReady] = useState(false);
  const initialTab = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(initialTab && TABS.some((x) => x.id === initialTab) ? initialTab : 'meetings');

  // 只要求登入（唔 check 卡片權限，唔使改後台）
  useEffect(() => {
    if (!loadSession()) router.replace(withDistrict('/'));
    else setReady(true);
  }, [router, withDistrict]);

  const upcoming = useMemo(() => nextFunDayMeeting(), []);

  if (!ready) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🎪 {FUN_DAY_NAME}</h1>
      <p className="page-sub">
        籌備會議通知＋執行手冊（急救文件等大會文件）。
        {district ? `你而家以「${district.name}」身份查閱。` : ''}
      </p>

      {upcoming && (
        <div className="fund-next">
          <span className="fund-next-ico">⏰</span>
          <span>
            下一次：<b>{meetingTitle(upcoming)}</b>
            <br />
            <small>{upcoming.dateLabel} · {upcoming.timeLabel} · {upcoming.venue}</small>
          </span>
        </div>
      )}

      <div className="inc-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`inc-tab ${tab === t.id ? 'on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'meetings' && <MeetingsTab upcomingNo={upcoming?.no} />}
      {tab === 'manual' && <ManualTab />}
      <BackBar />
    </>
  );
}

/* ───────────────────────── 分頁 1：籌備會議 ───────────────────────── */

function MeetingsTab({ upcomingNo }: { upcomingNo?: number }) {
  const ordered = useMemo(() => [...FUN_DAY_MEETINGS].sort((a, b) => b.no - a.no), []);
  return (
    <>
      {ordered.map((m) => (
        <MeetingCard key={m.no} m={m} isNext={m.no === upcomingNo} />
      ))}
      <p className="hint">第 1–4 次會議詳情待補：有日期／文件連結話我知，我幫你填返入去。</p>
    </>
  );
}

function MeetingCard({ m, isNext }: { m: FunDayMeeting; isNext: boolean }) {
  const { withDistrict } = useDistrict();
  const router = useRouter();
  const [copied, setCopied] = useState('');
  const hasDate = !!m.dateISO;
  const ics = meetingIcs(m);

  async function copyNotice() {
    const text = meetingNoticeText(m);
    try {
      await navigator.clipboard.writeText(text);
      setCopied('✓ 已複製，可直接貼去 WhatsApp／Signal');
    } catch {
      // 舊瀏覽器 fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied('✓ 已複製，可直接貼去 WhatsApp／Signal'); }
      catch { setCopied('複製失敗，請手動抄低'); }
      document.body.removeChild(ta);
    }
    setTimeout(() => setCopied(''), 4000);
  }

  function downloadIcs() {
    if (!ics) return;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `funday2026-meeting${m.no}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return (
    <section className={`info-card fund-meet ${isNext ? 'next' : ''}`}>
      <div className="section-head">
        <div>
          <h3>
            {isNext ? '🔴 ' : ''}{meetingTitle(m)}
          </h3>
          {hasDate ? (
            <p>{m.dateLabel} · {m.timeLabel} · {m.venue}</p>
          ) : (
            <p className="muted">日期／時間／地點待補</p>
          )}
        </div>
        {isNext && <span className="fund-pill">下一次會議</span>}
      </div>

      <dl className="fund-dl">
        <div><dt>日期</dt><dd>{m.dateLabel}</dd></div>
        <div><dt>時間</dt><dd>{m.timeLabel}{m.endNote ? `（${m.endNote}）` : ''}</dd></div>
        <div>
          <dt>地點</dt>
          <dd>
            {m.venue}
            {m.venueRoomId && (
              <>
                {' '}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => router.push(withDistrict(`/rooms?room=${encodeURIComponent(m.venueRoomId!)}&mode=room`))}
                  title="開啟地域房間頁，查 1704 當日有冇人用"
                >
                  查房間使用情況 →
                </button>
              </>
            )}
          </dd>
        </div>
      </dl>

      {m.docsNote && <p className="fps-notice">{m.docsNote}</p>}

      {m.docs.length > 0 && (
        <ul className="inc-docs" style={{ marginTop: 10 }}>
          {m.docs.map((d) => (
            <li key={d.title}>
              {d.url ? (
                <a href={d.url} target="_blank" rel="noopener noreferrer">
                  <b>{d.title}</b>
                  {d.ref && <span className="rcode">{d.ref}</span>}
                </a>
              ) : (
                <span style={{ fontSize: 13.5 }}><b>{d.title}</b> <span className="rcode">⏳ 待上載</span></span>
              )}
              {d.note && <small>{d.note}</small>}
            </li>
          ))}
        </ul>
      )}

      {hasDate && (
        <div className="fund-actions">
          <button type="button" className="btn-sm" onClick={copyNotice}>📋 複製開會通知</button>
          {ics && (
            <button type="button" className="btn-sm fps-secondary-btn" onClick={downloadIcs}>
              📅 加入日曆（.ics）
            </button>
          )}
          {copied && <span className="ok-msg">{copied}</span>}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── 分頁 2：執行手冊 ───────────────────────── */

function ManualTab() {
  const { withDistrict } = useDistrict();
  const router = useRouter();
  return (
    <>
      <p className="fps-notice">
        ℹ️ 執行手冊文件會陸續上載：已有連結嘅可直接開啟；標示「⏳ 待上載」嘅係大會稍後提供。
        總會官方通告全文可去「意外／應變 → 完整指引」查閱。
      </p>
      {FUN_DAY_MANUAL.map((s) => (
        <section key={s.id} className="info-card">
          <div className="section-head">
            <div>
              <h3>{s.icon} {s.title}</h3>
              {s.desc && <p>{s.desc}</p>}
            </div>
          </div>
          <ul className="inc-docs">
            {s.docs.map((d) => (
              <li key={d.title}>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer">
                    <b>{d.title}</b>
                    {d.ref && <span className="rcode">{d.ref}</span>}
                  </a>
                ) : (
                  <span style={{ fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b style={{ flex: 1, minWidth: 200 }}>{d.title}</b>
                    <span className="rcode">⏳ 待上載</span>
                  </span>
                )}
                {d.note && <small>{d.note}</small>}
              </li>
            ))}
          </ul>
          {s.link && (
            <div className="fund-actions">
              <button type="button" className="mini-btn" onClick={() => router.push(withDistrict(s.link!.href))}>
                {s.link.label} →
              </button>
            </div>
          )}
        </section>
      ))}
    </>
  );
}
