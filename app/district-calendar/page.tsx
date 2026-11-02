'use client';
/** 區會行事曆：獨立於重要日期，保存活動時間、地點、分類及詳情。 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { canManageAccounts } from '@/lib/accountRoles';
import BackLink from '@/components/BackLink';
import type { DistrictEvent } from '@/lib/types';
import { buildDistrictEventsIcs, eventOccursOn, formatEventDateRange, isoLocalDay, monthGridDays } from '@/lib/districtCalendar';

type EventDraft = {
  id: string; title: string; startDate: string; endDate: string; startTime: string; endTime: string;
  allDay: boolean; location: string; category: string; description: string; expectedUpdatedAt?: string;
};

const blankDraft = (date: string): EventDraft => ({
  id: '', title: '', startDate: date, endDate: date, startTime: '09:00', endTime: '10:00',
  allDay: false, location: '', category: '', description: '',
});
const CATEGORIES = ['會議', '訓練', '活動', '典禮', '露營', '其他'];

export default function DistrictCalendarPage() {
  const session = useRequireCard('districtCalendar');
  const [events, setEvents] = useState<DistrictEvent[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [source, setSource] = useState<'teamup' | 'demo'>('teamup');
  const [subcalOptions, setSubcalOptions] = useState<Array<{ id: string; name: string; color?: string }>>([]);
  const [excludedSubcals, setExcludedSubcals] = useState<string[]>([]);
  const [selectedSubcal, setSelectedSubcal] = useState('');
  const [subcalError, setSubcalError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [selectedDay, setSelectedDay] = useState(isoLocalDay(new Date()));
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [categoryFilter, setCategoryFilter] = useState('');

  const monthDays = useMemo(() => monthGridDays(month.getFullYear(), month.getMonth()), [month]);
  const monthStart = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = isoLocalDay(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  const load = useCallback(async (token: string, from = monthStart, to = monthEnd) => {
    setLoading(true); setError('');
    try {
      const r = await api.getDistrictEvents(token, from, to);
      if (r.ok && r.data) {
        setEvents(r.data.items || []); setCanCreate(!!r.data.canCreate); setCanEdit(!!r.data.canEdit);
        setConfigured(r.data.configured !== false); setSource(r.data.source || 'teamup');
        if (r.data.subcalendarId) setSelectedSubcal(r.data.subcalendarId);
      } else setError(r.error || '載入 Teamup 行事曆失敗');
    } catch { setError('連線失敗：請確認區會後台已部署。'); }
    finally { setLoading(false); }
  }, [monthStart, monthEnd]);

  useEffect(() => {
    if (!session) return;
    void load(session.token, monthStart, monthEnd);
  }, [session, load, monthStart, monthEnd]);

  useEffect(() => {
    if (!session || (!canManageAccounts(session) && !session.isSuper)) return;
    void api.getDistrictCalendarSubcalendars(session.token).then(r => {
      if (r.ok && r.data) {
        setSubcalOptions(r.data.items || []);
        setExcludedSubcals(r.data.excludedIds || []);
        setSelectedSubcal(r.data.selectedId || '');
        setSubcalError('');
      } else setSubcalError(r.error || '無法讀取 Teamup 子日曆設定');
    }).catch(() => setSubcalError('無法連接後端讀取 Teamup 子日曆'));
  }, [session]);

  const visibleEvents = useMemo(() => events.filter(e => !categoryFilter || e.category === categoryFilter), [events, categoryFilter]);
  const dayEvents = useMemo(() => visibleEvents.filter(e => eventOccursOn(e, selectedDay)), [visibleEvents, selectedDay]);
  const monthEvents = useMemo(() => visibleEvents.filter(e => e.startDate <= monthEnd && (e.endDate || e.startDate) >= monthStart)
    .sort((a, b) => `${a.startDate}${a.startTime || ''}`.localeCompare(`${b.startDate}${b.startTime || ''}`)), [visibleEvents, monthEnd, monthStart]);
  const categories = useMemo(() => Array.from(new Set(events.map(e => e.category).filter((x): x is string => !!x))).sort(), [events]);

  function flash(text: string) { setMessage(text); setError(''); window.setTimeout(() => setMessage(''), 3500); }
  function shiftMonth(delta: number) { setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1)); }
  function startNew(date = selectedDay) { setDraft(blankDraft(date)); setError(''); setMessage(''); }
  function startEdit(event: DistrictEvent) {
    setDraft({ id: event.id, title: event.title, startDate: event.startDate, endDate: event.endDate || event.startDate,
      startTime: event.startTime || '', endTime: event.endTime || '', allDay: !!event.allDay,
      location: event.location || '', category: event.category || '', description: event.description || '', expectedUpdatedAt: event.updatedAt || '' });
    setError(''); setMessage('');
  }

  async function saveEvent() {
    if (!session || !draft) return;
    if (!draft.title.trim()) { setError('活動名稱必填'); return; }
    if (!draft.startDate || !draft.endDate) { setError('開始及結束日期必填'); return; }
    setBusy(true); setError('');
    const result = await api.saveDistrictEvent(session.token, { ...draft, title: draft.title.trim(),
      location: draft.location.trim(), category: draft.category.trim(), description: draft.description.trim() });
    setBusy(false);
    if (result.ok) { setDraft(null); flash((result.data?.created ? '已寫入 Teamup ✓' : '已更新 Teamup 活動 ✓') + (result.data?.warn ? '；' + result.data.warn : '')); await load(session.token); }
    else setError(result.error || '儲存失敗');
  }

  async function deleteEvent(event: DistrictEvent) {
    if (!session || !confirm(`確定刪除「${event.title}」？`)) return;
    setBusy(true); setError('');
    const result = await api.deleteDistrictEvent(session.token, event.id, event.updatedAt || '');
    setBusy(false);
    if (result.ok) { flash('已從 Teamup 刪除活動 ✓' + (result.data?.warn ? '；' + result.data.warn : '')); await load(session.token); }
    else setError(result.error || '刪除失敗');
  }

  async function saveSubcalendar() {
    if (!session || !selectedSubcal) return;
    setBusy(true); setError(''); setMessage('');
    const result = await api.saveDistrictCalendarSubcalendar(session.token, selectedSubcal);
    setBusy(false);
    if (result.ok) {
      flash(`已指定 Teamup 子日曆：${result.data?.subcalendarName || selectedSubcal}${result.data?.warn ? '；' + result.data.warn : ''}`);
      await load(session.token, monthStart, monthEnd);
    } else setError(result.error || '儲存 Teamup 子日曆失敗');
  }

  function exportIcs() {
    const ics = buildDistrictEventsIcs(monthEvents, '區會行事曆');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `區會行事曆-${monthStart.slice(0, 7)}.ics`;
    anchor.click(); URL.revokeObjectURL(url);
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return <>
    <BackLink />
    <h1 className="page-title">🗓️ 區會行事曆</h1>
    <p className="page-sub">區會會議、訓練及活動一站式安排，活動直接讀寫 Teamup 專用日曆。ADC 或以上可新增；DDC 或以上、區職員及管理員可修改和刪除。每次寫入由後端重新驗權並記錄操作者、時間及 hash-chain 稽核；香港時間。</p>
    {message && <div className="success">✓ {message}</div>}
    {error && <div className="err" role="alert">{error}</div>}
    {source === 'demo' && <div className="dc-source-notice" role="note">示範環境：活動只存在本機示範資料，不會寫入 Teamup。真實 Teamup 整合須在已部署的 Apps Script 後端設定並實測。</div>}
    {source !== 'demo' && !configured && <div className="dc-source-notice" role="status">尚未設定區會行事曆專用 Teamup 子日曆。請管理員選擇專用子日曆後，行事曆才會載入及開放寫入；借場的 pending／approved／rejected 子日曆不可選。</div>}
    {source !== 'demo' && subcalError && <div className="dc-source-notice error" role="alert">{subcalError}</div>}
    {source !== 'demo' && (canManageAccounts(session) || session.isSuper) && subcalOptions.length > 0 && <section className="dc-calendar-shell" aria-label="Teamup 設定">
      <h2>Teamup 專用子日曆設定</h2>
      <p className="page-sub">活動只會讀寫所選子日曆。後端會再次驗證選項，並拒絕借場流程使用中的子日曆。</p>
      <div className="dc-calendar-actions">
        <select aria-label="區會行事曆 Teamup 子日曆" value={selectedSubcal} onChange={e => setSelectedSubcal(e.target.value)}>
          <option value="">選擇專用子日曆</option>
          {subcalOptions.map(item => <option key={item.id} value={item.id} disabled={excludedSubcals.includes(item.id)}>{item.name}{excludedSubcals.includes(item.id) ? '（借場專用，不可選）' : ''}</option>)}
        </select>
        <button className="btn-sm" onClick={saveSubcalendar} disabled={busy || !selectedSubcal}>儲存日曆設定</button>
      </div>
    </section>}

    <section className="dc-calendar-shell">
      <div className="dc-calendar-toolbar">
        <div className="dc-month-controls">
          <button className="mini-btn" aria-label="上個月" onClick={() => shiftMonth(-1)}>‹</button>
          <h2>{new Intl.DateTimeFormat('zh-HK', { year: 'numeric', month: 'long', timeZone: 'Asia/Hong_Kong' }).format(month)}</h2>
          <button className="mini-btn" aria-label="下個月" onClick={() => shiftMonth(1)}>›</button>
          <button className="mini-btn ghost" onClick={() => { const now = new Date(); const today = isoLocalDay(now); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDay(today); }}>今日</button>
        </div>
        <div className="dc-calendar-actions">
          <select aria-label="按活動類別篩選" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">全部類別</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="mini-btn ghost" onClick={exportIcs} disabled={!monthEvents.length}>📥 匯出本月 .ics</button>
          {configured && canCreate && !draft && <button className="btn-sm" onClick={() => startNew()}>＋ 新增活動</button>}
        </div>
      </div>

      <div className="dc-calendar-grid" role="grid" aria-label="區會行事曆">
        {['一', '二', '三', '四', '五', '六', '日'].map(day => <div className="dc-weekday" role="columnheader" key={day}>{day}</div>)}
        {monthDays.map(day => {
          const dayItems = visibleEvents.filter(event => eventOccursOn(event, day));
          const inMonth = day.slice(0, 7) === monthStart.slice(0, 7);
          const number = Number(day.slice(-2));
          return <button type="button" role="gridcell" aria-selected={selectedDay === day} key={day}
            className={`dc-day ${inMonth ? '' : 'outside'} ${selectedDay === day ? 'selected' : ''}`}
            onClick={() => { setSelectedDay(day); setDraft(null); }}>
            <span className="dc-day-number">{number}</span>
            <span className="dc-day-events">
              {dayItems.slice(0, 2).map(event => <span className="dc-day-event" key={event.id} title={event.title}>{event.title}</span>)}
              {dayItems.length > 2 && <span className="dc-more">+{dayItems.length - 2} 項</span>}
            </span>
          </button>;
        })}
      </div>
      <div className="dc-calendar-footer"><span>本月 {monthEvents.length} 項活動</span><span>點選日期查看活動；跨日活動會顯示於每一日。</span></div>
    </section>

    <section className="dc-agenda">
      <div className="section-head">
        <div><h2>📌 {new Intl.DateTimeFormat('zh-HK', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Hong_Kong' }).format(new Date(`${selectedDay}T12:00:00+08:00`))}</h2>
          <p>{dayEvents.length ? `共 ${dayEvents.length} 項活動` : '此日暫無活動'}</p></div>
        {configured && canCreate && !draft && <button className="mini-btn" onClick={() => startNew(selectedDay)}>＋ 加到此日</button>}
      </div>
      {loading ? <div className="center"><div className="spinner" /><div>載入行事曆…</div></div> : dayEvents.length === 0 ?
        <div className="info-card"><p className="muted">未有活動。{canCreate ? '可以新增會議、訓練或區會活動。' : ''}</p></div> :
        <div className="dc-event-list">{dayEvents.map(event => <article className="dc-event-card" key={event.id}>
          <div className="dc-event-time">{event.allDay ? '全日' : event.startTime || '時間待定'}{event.endTime && !event.allDay ? ` – ${event.endTime}` : ''}</div>
          <div className="dc-event-body"><div className="dc-event-title-row"><h3>{event.title}</h3>{event.category && <span className="dc-event-category">{event.category}</span>}</div>
            <p>{formatEventDateRange(event)}</p>
            {event.location && <p>📍 {event.location}</p>}{event.description && <p className="dc-event-description">{event.description}</p>}
          </div>
          {configured && canEdit && <div className="dc-event-actions"><button className="mini-btn" disabled={busy} onClick={() => startEdit(event)}>✏️ 修改</button>
            <button className="mini-btn danger" disabled={busy} onClick={() => deleteEvent(event)}>刪除</button></div>}
        </article>)}</div>}
    </section>

    {configured && canEdit && <section className="dc-agenda">
      <div className="section-head"><div><h2>🗂 本月議程</h2><p>方便快速掃描及修改整月安排</p></div></div>
      {monthEvents.length ? <div className="dc-month-agenda">{monthEvents.map(event => <button key={event.id} className="dc-month-row" onClick={() => { setSelectedDay(event.startDate); startEdit(event); }}>
        <time>{event.startDate.slice(5).replace('-', '/')} {event.allDay ? '' : event.startTime}</time><b>{event.title}</b><span>{event.location || event.category || ''}</span>
      </button>)}</div> : <p className="muted">本月未有活動。</p>}
    </section>}

    {configured && (canCreate || canEdit) && draft && <section className="info-card dc-event-form">
      <div className="section-head"><div><h2>{draft.id ? '✏️ 修改活動' : '＋ 新增區會活動'}</h2><p>{draft.id ? '修改此活動資料。' : 'ADC 或以上可新增；如要修改或刪除既有活動，請聯絡 DDC、區職員或管理員。'}</p></div>
        <button className="mini-btn" onClick={() => setDraft(null)}>收起</button></div>
      <div className="dc-form-grid">
        <label className="dc-field wide"><span>活動名稱 *</span><input autoFocus maxLength={120} value={draft.title} placeholder="例如：區執行委員會會議" onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
        <label className="dc-field"><span>開始日期 *</span><input type="date" value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value, endDate: draft.endDate < e.target.value ? e.target.value : draft.endDate })} /></label>
        <label className="dc-field"><span>結束日期 *</span><input type="date" min={draft.startDate} value={draft.endDate} onChange={e => setDraft({ ...draft, endDate: e.target.value })} /></label>
        <label className="dc-field dc-checkbox"><input type="checkbox" checked={draft.allDay} onChange={e => setDraft({ ...draft, allDay: e.target.checked })} /><span>全日活動</span></label>
        {!draft.allDay && <>
          <label className="dc-field"><span>開始時間（香港）</span><input type="time" value={draft.startTime} onChange={e => setDraft({ ...draft, startTime: e.target.value })} /></label>
          <label className="dc-field"><span>結束時間（香港）</span><input type="time" value={draft.endTime} onChange={e => setDraft({ ...draft, endTime: e.target.value })} /></label>
        </>}
        <label className="dc-field"><span>地點</span><input maxLength={160} value={draft.location} placeholder="例如：區總部 18 樓" onChange={e => setDraft({ ...draft, location: e.target.value })} /></label>
        <label className="dc-field"><span>類別</span><input maxLength={40} list="dc-categories" value={draft.category} placeholder="會議／訓練／活動…" onChange={e => setDraft({ ...draft, category: e.target.value })} /><datalist id="dc-categories">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist></label>
        <label className="dc-field wide"><span>詳情／備註</span><textarea rows={4} maxLength={2000} value={draft.description} placeholder="議程、集合時間、負責人或注意事項" onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      </div>
      <div className="dc-form-actions"><button className="btn-sm" disabled={busy} onClick={saveEvent}>{busy ? '儲存中…' : draft.id ? '儲存修改' : '新增活動'}</button><button className="mini-btn danger" disabled={busy} onClick={() => setDraft(null)}>取消</button></div>
    </section>}
  </>;
}
