'use client';
/**
 * 🏢 地域房間使用情況（v4.5.0）
 * ─────────────────────────────────────────────────────────────────────
 * 來源：https://sites.google.com/hkirscout.org.hk/hkir-rooms（每間房一個公開 Google 日曆）。
 * 原網站要逐個日曆捲動先睇到；呢度改成「揀樓層 → 揀房 → 逐日列出」，
 * 打通房（1704A／1704B／1704／1704+1705）會自動把相關日曆一齊計入，一眼睇到嗰間房實際有冇人用。
 * 資料由 /api/external?kind=rooms 伺服器端拉公開 ICS（3 分鐘快取）。
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, type RoomEvents } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import BackLink, { BackBar } from '@/components/BackLink';
import { FLOORS, ROOMS, ROOM_NOTES } from '@/lib/roomsDirectory';
import { SOURCES } from '@/lib/externalSources';
import { hkDow, hkHm, hkStartOfDay, hkYmd, type IcsEvent } from '@/lib/ics';

type Mode = 'room' | 'today' | 'embed';
const MODES: { id: Mode; label: string }[] = [
  { id: 'room', label: '🚪 逐間房' },
  { id: 'today', label: '📆 今日總覽' },
  { id: 'embed', label: '🗓 原版日曆' },
];
const RANGES = [7, 14, 30];

interface Booking extends IcsEvent { via: string }   // via = 來自邊個日曆（自己或打通房）

/** 事件標題慣例：<參考編號>_<活動>_<單位>_<人數>（<聯絡人 電話>）；冇參考編號／人數都照拆 */
function parseTitle(s: string): { ref?: string; activity: string; unit?: string; pax?: string; contact?: string } {
  const t = String(s || '').trim();
  const cm = /[（(]([^（）()]*)[）)]\s*$/.exec(t);
  const contact = cm ? cm[1].trim() : undefined;
  const core = cm ? t.slice(0, cm.index).trim() : t;
  const parts = core.split('_').map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return { activity: core || '（未命名）', contact };
  let ref: string | undefined;
  if (parts.length >= 3 && /^[A-Za-z0-9][A-Za-z0-9#/-]*$/.test(parts[0])) ref = parts.shift();
  const activity = parts.shift() || '';
  let pax: string | undefined;
  const units: string[] = [];
  parts.forEach((x) => { if (/^\d+\s*人?$/.test(x) && !pax) pax = x.replace(/人$/, '').trim(); else units.push(x); });
  return { ref, activity, unit: units.join(' ') || undefined, pax, contact };
}

function ymdInput(t: number): string { return hkYmd(t); }

export default function RoomsPage() {
  const session = useRequireCard('rooms');
  const searchParams = useSearchParams();
  const initialRoom = searchParams.get('room');
  const initialMode = searchParams.get('mode') as Mode | null;
  const [mode, setMode] = useState<Mode>(initialMode && MODES.some(m => m.id === initialMode) ? initialMode : 'room');
  const [floor, setFloor] = useState<string>(() => ROOMS.find(r => r.id === initialRoom)?.floor || '17');
  const [roomId, setRoomId] = useState<string>(() => (ROOMS.some(r => r.id === initialRoom) ? initialRoom! : '1702'));
  const [days, setDays] = useState(14);
  const [from, setFrom] = useState(() => ymdInput(hkStartOfDay(Date.now())));
  const [data, setData] = useState<RoomEvents[]>([]);
  const [fetchedAt, setFetchedAt] = useState('');
  const [stale, setStale] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError('');
      const r = await api.extRooms('', from, days);
      if (cancelled) return;
      if (r.ok && r.data) {
        setData(r.data.rooms); setFetchedAt(r.data.fetchedAt);
        setStale(r.data.stale ? (r.data.staleReason || '上游暫時無法連線') : '');
      } else {
        setError(r.error || '未能讀取房間日曆');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session, from, days, tick]);

  const room = ROOMS.find(r => r.id === roomId) || ROOMS[0];
  const byId = useMemo(() => { const m: Record<string, RoomEvents> = {}; data.forEach(d => { m[d.id] = d; }); return m; }, [data]);

  /** 某房間嘅實際佔用 = 自己日曆 + 打通房日曆 */
  function bookingsFor(id: string): Booking[] {
    const r = ROOMS.find(x => x.id === id);
    if (!r) return [];
    const ids = [id, ...(r.combo || [])];
    const out: Booking[] = [];
    ids.forEach((cid) => { (byId[cid]?.events || []).forEach(e => out.push({ ...e, via: cid })); });
    out.sort((a, b) => a.start - b.start || a.end - b.end);
    return out;
  }

  const bookings = useMemo(() => bookingsFor(room.id), [room.id, byId]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayKeys = useMemo(() => {
    const start = Date.parse(`${from}T00:00:00+08:00`);
    return Array.from({ length: days }, (_, i) => start + i * 86_400_000);
  }, [from, days]);

  const current = bookings.find(b => b.start <= now && b.end > now);
  const next = bookings.find(b => b.start > now);
  const ownFailed = byId[room.id] && !byId[room.id].ok;

  if (!session) return <div className="center"><div className="spinner" /></div>;

  const todayStart = hkStartOfDay(now), todayEnd = todayStart + 86_400_000;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🏢 地域房間使用情況</h1>
      <p className="page-sub">灣仔 香港童軍百周年紀念大樓 17／18／19 樓房間；揀一間房即刻見到未來幾日邊個時段有人用。</p>

      <div className="inc-tabs" role="tablist">
        {MODES.map(m => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} className={`inc-tab ${mode === m.id ? 'on' : ''}`} onClick={() => setMode(m.id)}>{m.label}</button>
        ))}
        <span className="dir-search muted" style={{ fontSize: 12, minWidth: 0, textAlign: 'right' }}>
          {fetchedAt ? `同步 ${new Date(fetchedAt).toLocaleTimeString('zh-HK', { hour12: false })}` : ''}
          {stale ? ` · ⚠️ 上次成功結果` : ''}
          {' '}<button className="linkish" onClick={() => setTick(t => t + 1)} disabled={loading}>🔄 更新</button>
        </span>
      </div>

      {error && <div className="err">❌ {error}<div style={{ fontSize: 12, marginTop: 4 }}>可先到原網站查看：<a href={SOURCES.roomsSite} target="_blank" rel="noopener" style={{ textDecoration: 'underline' }}>hkir-rooms ↗</a></div></div>}

      {(mode === 'room' || mode === 'embed') && (
        <>
          <div className="room-pick">
            <div className="room-floors">
              {FLOORS.map(f => (
                <button key={f.id} className={`wx-chip ${floor === f.id ? 'on' : ''}`} onClick={() => { setFloor(f.id); const first = ROOMS.find(r => r.floor === f.id); if (first && room.floor !== f.id) setRoomId(first.id); }}>{f.label}</button>
              ))}
            </div>
            <div className="room-list">
              {ROOMS.filter(r => r.floor === floor).map((r) => {
                const bs = mode === 'room' ? bookingsFor(r.id) : [];
                const busy = bs.some(b => b.start <= now && b.end > now);
                const todayN = bs.filter(b => b.start < todayEnd && b.end > todayStart).length;
                return (
                  <button key={r.id} className={`room-btn ${roomId === r.id ? 'on' : ''}`} onClick={() => setRoomId(r.id)}>
                    <b>{r.id}</b>
                    <span>{r.capacity || r.use || ''}</span>
                    {mode === 'room' && !loading && <em className={busy ? 'busy' : 'free'}>{busy ? '使用中' : todayN ? `今日 ${todayN} 節` : '今日空置'}</em>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="dir-office room-head">
            <div>
              <b>{room.name}</b>
              <div className="dir-office-line">
                {room.capacity && <>👥 {room.capacity} · </>}{room.use && <>🎯 {room.use}</>}
              </div>
              {room.combo && room.combo.length > 0 && (
                <div className="dir-office-line">🔗 已一併計入打通房日曆：{room.combo.join('、')}</div>
              )}
            </div>
            {mode === 'room' && !loading && (
              <div className="room-now">
                {current ? (
                  <><span className="room-state busy">🔴 使用中</span><small>至 {hkHm(current.end)} · {parseTitle(current.summary).activity}</small></>
                ) : (
                  <><span className="room-state free">🟢 現在空置</span>{next && <small>下一節 {hkYmd(next.start) === hkYmd(now) ? '今日' : `${hkYmd(next.start)}(${hkDow(next.start)})`} {hkHm(next.start)}</small>}</>
                )}
              </div>
            )}
          </div>

          {mode === 'embed' ? (
            <div className="embed-shell room-embed">
              <iframe className="embed-frame" title={`${room.name} Google 日曆`} src={`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(`${room.calendarId}@group.calendar.google.com`)}&ctz=Asia%2FHong_Kong&mode=WEEK&showTitle=0&showPrint=0&showCalendars=0&showTz=0`} />
            </div>
          ) : (
            <>
              <div className="bud-toolbar">
                <label className="room-from">由 <input type="date" className="search-input" value={from} onChange={e => e.target.value && setFrom(e.target.value)} /></label>
                <button className="mini-btn ghost" onClick={() => setFrom(ymdInput(hkStartOfDay(Date.now())))}>今日</button>
                <button className="mini-btn ghost" onClick={() => setFrom(ymdInput(Date.parse(`${from}T00:00:00+08:00`) - days * 86_400_000))}>◀ 上 {days} 日</button>
                <button className="mini-btn ghost" onClick={() => setFrom(ymdInput(Date.parse(`${from}T00:00:00+08:00`) + days * 86_400_000))}>下 {days} 日 ▶</button>
                <span className="wx-sim">{RANGES.map(d => <button key={d} className={`wx-chip ${days === d ? 'on' : ''}`} onClick={() => setDays(d)}>{d} 日</button>)}</span>
              </div>

              {loading ? <div className="center"><div className="spinner" /></div> : (
                <>
                  {ownFailed && <p className="fps-notice">⚠️ {room.id} 本身嘅日曆暫時讀唔到（{byId[room.id]?.error}），以下只顯示打通房嘅預約。</p>}
                  <div className="room-days">
                    {dayKeys.map((d0) => {
                      const d1 = d0 + 86_400_000;
                      const list = bookings.filter(b => b.start < d1 && b.end > d0);
                      const isToday = d0 === todayStart;
                      const dow = hkDow(d0);
                      return (
                        <div key={d0} className={`room-day ${list.length ? '' : 'empty'} ${isToday ? 'today' : ''} ${dow === '日' || dow === '六' ? 'wknd' : ''}`}>
                          <div className="room-day-head">
                            <b>{hkYmd(d0).slice(5).replace('-', '/')}</b><span>（{dow}）{isToday && <i className="wx-now">今日</i>}</span>
                            <small>{list.length ? `${list.length} 節` : '空置'}</small>
                          </div>
                          {list.map((b, i) => {
                            const t = parseTitle(b.summary);
                            const live = b.start <= now && b.end > now;
                            return (
                              <div key={`${b.uid}-${b.start}-${i}`} className={`room-ev ${live ? 'live' : ''} ${b.via !== room.id ? 'via' : ''}`}>
                                <div className="room-ev-time">{b.allDay ? '全日' : `${b.start < d0 ? '00:00' : hkHm(b.start)}–${b.end > d1 ? '24:00' : hkHm(b.end)}`}</div>
                                <div className="room-ev-body">
                                  <b>{t.activity}</b>
                                  <small>
                                    {[t.unit, t.pax ? `${t.pax} 人` : '', t.ref ? `#${t.ref}` : ''].filter(Boolean).join(' · ')}
                                    {t.contact && <> · 📞 {t.contact}</>}
                                  </small>
                                  {b.via !== room.id && <small className="room-via">經 {b.via} 打通預約</small>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {mode === 'today' && (
        <>
          {loading ? <div className="center"><div className="spinner" /></div> : (
            <div className="room-overview">
              {FLOORS.map(f => (
                <section className="info-card" key={f.id}>
                  <div className="section-head"><div><h3>🏢 {f.label}</h3></div></div>
                  <div className="room-ov-grid">
                    {ROOMS.filter(r => r.floor === f.id).map((r) => {
                      const bs = bookingsFor(r.id).filter(b => b.start < todayEnd && b.end > todayStart);
                      const busy = bs.some(b => b.start <= now && b.end > now);
                      const failed = byId[r.id] && !byId[r.id].ok;
                      return (
                        <button key={r.id} className={`room-ov ${busy ? 'busy' : bs.length ? 'later' : 'free'}`} onClick={() => { setRoomId(r.id); setFloor(r.floor); setMode('room'); setFrom(ymdInput(todayStart)); }}>
                          <div className="room-ov-head"><b>{r.id}</b><span>{busy ? '🔴 使用中' : bs.length ? '🟡 今日有預約' : failed ? '⚪ 讀取失敗' : '🟢 全日空置'}</span></div>
                          <small>{r.capacity || r.use}</small>
                          <ul>
                            {bs.slice(0, 4).map((b, i) => <li key={i}>{b.allDay ? '全日' : `${hkHm(b.start)}–${hkHm(b.end)}`} {parseTitle(b.summary).activity}{b.via !== r.id ? `（經 ${b.via}）` : ''}</li>)}
                            {bs.length > 4 && <li>…另 {bs.length - 4} 節</li>}
                          </ul>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <section className="info-card" style={{ marginTop: 16 }}>
        <div className="section-head"><div><h3>ℹ️ 使用須知</h3></div></div>
        <ul>{ROOM_NOTES.map((n, i) => <li key={i}>{n}</li>)}</ul>
        <p className="fps-help">來源：<a href={SOURCES.roomsSite} target="_blank" rel="noopener" style={{ textDecoration: 'underline' }}>港島地域房間日曆網站 ↗</a>（公開 Google 日曆，每 3 分鐘同步一次）。本頁只供查閱，唔會改動任何預約。</p>
      </section>
      <BackBar />
    </>
  );
}
