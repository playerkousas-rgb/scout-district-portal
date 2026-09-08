'use client';
/**
 * 🏢 地域房間使用情況（v4.5.0；v4.9.0 加返「月曆模式」做預設）
 * ─────────────────────────────────────────────────────────────────────
 * 來源：https://sites.google.com/hkirscout.org.hk/hkir-rooms（每間房一個公開 Google 日曆）。
 * v4.9.0：預設改成「月曆模式」— 成個月一目了然，逐日格仔列出邊個房邊段時間有人用；
 * 另外保留 逐間房／今日總覽／原版日曆。打通房（1704A／1704B／1704／1704+1705）
 * 會自動把相關日曆一齊計入。資料由 /api/external?kind=rooms 伺服器端拉公開 ICS（3 分鐘快取）。
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, type RoomEvents } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import BackLink, { BackBar } from '@/components/BackLink';
import { FLOORS, ROOMS, ROOM_NOTES } from '@/lib/roomsDirectory';
import { SOURCES } from '@/lib/externalSources';
import { HK_OFFSET_MS, hkDayStart, hkDow, hkHm, hkStartOfDay, hkYmd, type IcsEvent } from '@/lib/ics';

type Mode = 'calendar' | 'room' | 'today' | 'embed';
const MODES: { id: Mode; label: string }[] = [
  { id: 'calendar', label: '📅 月曆' },
  { id: 'room', label: '🚪 逐間房' },
  { id: 'today', label: '📆 今日總覽' },
  { id: 'embed', label: '🗓 原版日曆' },
];
const RANGES = [7, 14, 30];
const DOW = ['日', '一', '二', '三', '四', '五', '六'];

interface Booking extends IcsEvent { via: string; roomId: string }   // via = 來自邊個日曆（自己或打通房）

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

/** 用香港年月 → 該月 1 號 00:00 epoch ms */
function hkMonthStart(y: number, m0: number): number {
  return Date.UTC(y, m0, 1) - HK_OFFSET_MS;
}
function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

export default function RoomsPage() {
  const session = useRequireCard('rooms');
  const searchParams = useSearchParams();
  const initialRoom = searchParams.get('room');
  const initialMode = searchParams.get('mode') as Mode | null;
  const [mode, setMode] = useState<Mode>(initialMode && MODES.some(m => m.id === initialMode) ? initialMode : 'calendar');
  const [floor, setFloor] = useState<string>(() => ROOMS.find(r => r.id === initialRoom)?.floor || '17');
  const [roomId, setRoomId] = useState<string>(() => (ROOMS.some(r => r.id === initialRoom) ? initialRoom! : '1702'));
  const [days, setDays] = useState(14);
  const [from, setFrom] = useState(() => ymdInput(hkStartOfDay(Date.now())));
  // 月曆模式狀態：香港年月 + 樓層篩選 + 點選嘅日子
  const nowParts = new Date(Date.now() + HK_OFFSET_MS);
  const [calY, setCalY] = useState(() => nowParts.getUTCFullYear());
  const [calM, setCalM] = useState(() => nowParts.getUTCMonth());
  const [calFloor, setCalFloor] = useState<'all' | '17' | '18' | '19'>('all');
  const [selDay, setSelDay] = useState<string>('');   // YYYY-MM-DD
  const [data, setData] = useState<RoomEvents[]>([]);
  const [fetchedAt, setFetchedAt] = useState('');
  const [stale, setStale] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const calFrom = useMemo(() => hkYmd(hkMonthStart(calY, calM)), [calY, calM]);
  const calDays = useMemo(() => daysInMonth(calY, calM), [calY, calM]);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError('');
      const useCal = mode === 'calendar';
      const r = await api.extRooms('', useCal ? calFrom : from, useCal ? calDays : days);
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
  }, [session, from, days, tick, mode, calFrom, calDays]);

  const room = ROOMS.find(r => r.id === roomId) || ROOMS[0];
  const byId = useMemo(() => { const m: Record<string, RoomEvents> = {}; data.forEach(d => { m[d.id] = d; }); return m; }, [data]);

  /** 某房間嘅實際佔用 = 自己日曆 + 打通房日曆 */
  function bookingsFor(id: string): Booking[] {
    const r = ROOMS.find(x => x.id === id);
    if (!r) return [];
    const ids = [id, ...(r.combo || [])];
    const out: Booking[] = [];
    ids.forEach((cid) => { (byId[cid]?.events || []).forEach(e => out.push({ ...e, via: cid, roomId: id })); });
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

  // ── 月曆模式（v4.9.0）：成個月每日格仔，跨全部（或所選樓層）房間 ──
  const calRooms = useMemo(() => ROOMS.filter(r => calFloor === 'all' || r.floor === calFloor), [calFloor]);
  const calByDay = useMemo(() => {
    const map: Record<string, { start: number; end: number; dayStart: number; dayEnd: number; roomId: string; roomName: string; floor: string; via: string; summary: string; allDay: boolean }[]> = {};
    calRooms.forEach((r) => {
      const ids = [r.id, ...(r.combo || [])];
      const out: Booking[] = [];
      ids.forEach((cid) => { (byId[cid]?.events || []).forEach(e => out.push({ ...e, via: cid, roomId: r.id })); });
      out.sort((a, b) => a.start - b.start || a.end - b.end);
      // 去重：同一預約經幾個打通日曆都會出現，按 uid+start 只計一次
      const seen = new Set<string>();
      out.forEach((b) => {
        const key = `${b.uid}-${b.start}`;
        if (seen.has(key)) return;
        seen.add(key);
        for (let d = hkStartOfDay(Math.max(b.start, hkMonthStart(calY, calM))); d < Math.min(b.end, hkMonthStart(calY, calM) + calDays * 86_400_000); d += 86_400_000) {
          const ymd = hkYmd(d);
          (map[ymd] = map[ymd] || []).push({
            start: b.start, end: b.end, dayStart: d, dayEnd: d + 86_400_000,
            roomId: r.id, roomName: r.name, floor: r.floor, via: b.via, summary: b.summary, allDay: b.allDay,
          });
        }
      });
    });
    Object.values(map).forEach(list => list.sort((a, b) => a.start - b.start || a.roomId.localeCompare(b.roomId)));
    return map;
  }, [byId, calRooms, calY, calM, calDays]);
  const calLead = DOW.indexOf(hkDow(hkMonthStart(calY, calM)));
  const calTodayYmd = hkYmd(now);
  const selList = selDay ? (calByDay[selDay] || []) : [];

  if (!session) return <div className="center"><div className="spinner" /></div>;

  const todayStart = hkStartOfDay(now), todayEnd = todayStart + 86_400_000;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🏢 地域房間使用情況</h1>
      <p className="page-sub">灣仔 香港童軍百周年紀念大樓 17／18／19 樓房間 — 月曆一目了然；亦可以逐間房睇時段。</p>

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

      {/* ── 📅 月曆模式（v4.9.0 預設）：成個月格仔，逐日列出邊個房有人用 ── */}
      {mode === 'calendar' && (
        <>
          <div className="bud-toolbar">
            <button className="mini-btn ghost" onClick={() => { const m = calM === 0 ? 11 : calM - 1; setCalM(m); if (calM === 0) setCalY(y => y - 1); }}>◀ 上月</button>
            <button className="mini-btn ghost" onClick={() => { const p = new Date(Date.now() + HK_OFFSET_MS); setCalY(p.getUTCFullYear()); setCalM(p.getUTCMonth()); }}>本月</button>
            <button className="mini-btn ghost" onClick={() => { const m = calM === 11 ? 0 : calM + 1; setCalM(m); if (calM === 11) setCalY(y => y + 1); }}>下月 ▶</button>
            <b className="cal-title">{calY} 年 {calM + 1} 月</b>
            <span className="wx-sim" style={{ marginLeft: 'auto' }}>
              <button className={`wx-chip ${calFloor === 'all' ? 'on' : ''}`} onClick={() => setCalFloor('all')}>全部樓層</button>
              {FLOORS.map(f => <button key={f.id} className={`wx-chip ${calFloor === f.id ? 'on' : ''}`} onClick={() => setCalFloor(f.id as '17' | '18' | '19')}>{f.label}</button>)}
            </span>
          </div>

          {loading ? <div className="center"><div className="spinner" /></div> : (
            <>
              <div className="cal-grid">
                {DOW.map(d => <div key={d} className="cal-dow">{d}</div>)}
                {Array.from({ length: calLead }, (_, i) => <div key={`lead-${i}`} className="cal-cell empty" />)}
                {Array.from({ length: calDays }, (_, i) => {
                  const d = hkMonthStart(calY, calM) + i * 86_400_000;
                  const ymd = hkYmd(d);
                  const list = calByDay[ymd] || [];
                  const isToday = ymd === calTodayYmd;
                  const isSel = ymd === selDay;
                  const dow = hkDow(d);
                  return (
                    <button
                      key={ymd} className={`cal-cell ${list.length ? 'has' : 'free'} ${isToday ? 'today' : ''} ${isSel ? 'sel' : ''} ${dow === '日' || dow === '六' ? 'wknd' : ''}`}
                      onClick={() => setSelDay(isSel ? '' : ymd)}
                    >
                      <span className="cal-d">{i + 1}</span>
                      {list.length === 0 ? (
                        <span className="cal-free">—</span>
                      ) : (
                        <span className="cal-events">
                          {list.slice(0, 3).map((b, j) => (
                            <span key={j} className={`cal-ev f-${b.floor}`}>
                              <i>{b.allDay ? '全日' : `${hkHm(b.start)}–${hkHm(b.end)}`}</i> {b.roomId} {parseTitle(b.summary).activity}
                            </span>
                          ))}
                          {list.length > 3 && <span className="cal-more">+{list.length - 3}</span>}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {selDay && (
                <section className="info-card" style={{ marginTop: 12 }}>
                  <div className="section-head">
                    <div>
                      <h3>{selDay}（{hkDow(hkDayStart(selDay))}）<small>· {selList.length} 節</small></h3>
                      <p>點格仔揀日子；再點一次收起。包括打通房預約（標明「經 XXXX」）。</p>
                    </div>
                    <button className="mini-btn ghost" onClick={() => setSelDay('')}>收起</button>
                  </div>
                  {selList.length === 0 ? (
                    <p className="empty">全日冇預約。</p>
                  ) : (
                    <div className="cal-day-list">
                      {selList.map((b, i) => {
                        const t = parseTitle(b.summary);
                        return (
                          <div key={i} className="room-ev">
                            <div className="room-ev-time">{b.allDay ? '全日' : `${b.start < hkDayStart(selDay) ? '00:00' : hkHm(b.start)}–${b.end > hkDayStart(selDay) + 86_400_000 ? '24:00' : hkHm(b.end)}`}</div>
                            <div className="room-ev-body">
                              <b>{b.roomId} · {t.activity}</b>
                              <small>
                                {[t.unit, t.pax ? `${t.pax} 人` : '', t.ref ? `#${t.ref}` : ''].filter(Boolean).join(' · ')}
                                {t.contact && <> · 📞 {t.contact}</>}
                              </small>
                              {b.via !== b.roomId && <small className="room-via">經 {b.via} 打通預約</small>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              <div className="legend" style={{ marginTop: 10 }}>
                <span><i className="sq" style={{ background: '#dbeafe' }} /> 17 樓</span>
                <span><i className="sq" style={{ background: '#dcfce7' }} /> 18 樓</span>
                <span><i className="sq" style={{ background: '#fef9c3' }} /> 19 樓</span>
                <span>點日子睇詳情 · 撳「🚪 逐間房」睇單一房間</span>
              </div>
            </>
          )}
        </>
      )}

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
