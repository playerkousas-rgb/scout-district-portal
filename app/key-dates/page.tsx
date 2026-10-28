'use client';
/**
 * 📅 重要日期（v4.33.0）
 * 大型活動／會議日期集中一處，唔使再喺 WhatsApp 碌返上去搵。
 * 輸入只有兩格：活動 + 日期；日期照原本習慣打（9Nov2026、17-18Apr2027、2027 都收），
 * 一格入面有幾個日期會自動拆開做幾項紀錄。
 * 權限跟 Perms 表 `keyDates` 一行：預設 DDC 或以上 ✏️ 可加／改／刪，其餘已登入職員 👁 可看。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import BackLink, { BackBar } from '@/components/BackLink';
import {
  buildKeyDatesIcs, formatKeyDate, isUpcoming, keyDateSortKey, keyDateStatus,
  splitKeyDateEntries, todayIso,
} from '@/lib/keyDates';
import type { AccessLevel, KeyDate } from '@/lib/types';

type Draft = { id: string; title: string; dateText: string };

function toParsed(item: KeyDate) {
  return {
    text: item.dateText || '',
    start: item.startDate || '',
    end: item.endDate || item.startDate || '',
    precision: item.precision || (item.startDate ? 'day' as const : 'none' as const),
  };
}

export default function KeyDatesPage() {
  const session = useRequireCard('keyDates');
  const [items, setItems] = useState<KeyDate[]>([]);
  const [access, setAccess] = useState<AccessLevel>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showPast, setShowPast] = useState(false);

  const canEdit = access === 'edit';
  const today = todayIso();

  const load = useCallback(async (token: string) => {
    setLoading(true); setError('');
    try {
      const r = await api.getKeyDates(token);
      if (r.ok && r.data) { setItems(r.data.items || []); setAccess(r.data.access || 'view'); }
      else setError(r.error || '載入失敗');
    } catch { setError('連線失敗：請確認該區後台已部署。'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (session) load(session.token); }, [session, load]);

  const sorted = useMemo(
    () => items.slice().sort((a, b) => keyDateSortKey(toParsed(a)).localeCompare(keyDateSortKey(toParsed(b)))),
    [items],
  );
  const upcoming = useMemo(() => sorted.filter(i => isUpcoming(toParsed(i), today)), [sorted, today]);
  const past = useMemo(() => sorted.filter(i => !isUpcoming(toParsed(i), today)).reverse(), [sorted, today]);

  // 新增時先睇吓一格日期會拆到幾多項，話畀用戶知
  const preview = useMemo(
    () => (draft && !draft.id ? splitKeyDateEntries(draft.dateText) : []),
    [draft],
  );

  function flash(text: string) { setMsg(text); setError(''); setTimeout(() => setMsg(''), 3500); }

  function startNew() { setDraft({ id: '', title: '', dateText: '' }); setMsg(''); setError(''); }
  function startEdit(item: KeyDate) {
    setDraft({ id: item.id, title: item.title || '', dateText: item.dateText || '' });
    setMsg(''); setError('');
  }

  async function save() {
    if (!session || !draft) return;
    const title = draft.title.trim();
    const dateText = draft.dateText.trim();
    if (!title) { setError('活動名稱必填'); return; }
    if (!dateText) { setError('日期必填（未定就寫「待定」）'); return; }
    setBusy('save'); setError('');

    // 新增時一格多日期 → 每個日期一項紀錄（例如「9Nov2026 2Mar2027 26Apr2027」＝ 3 項）
    const parts = draft.id ? [{ text: dateText }] : splitKeyDateEntries(dateText);
    const payloads = parts.length ? parts : [{ text: dateText }];
    let okCount = 0;
    let lastError = '';
    for (const part of payloads) {
      const r = await api.saveKeyDate(session.token, {
        id: draft.id || undefined, title, dateText: part.text || dateText,
      });
      if (r.ok) okCount++; else lastError = r.error || '儲存失敗';
    }
    setBusy('');
    if (okCount === payloads.length) {
      setDraft(null);
      flash(draft.id ? '已更新 ✓' : `已加入 ${okCount} 項 ✓`);
      await load(session.token);
    } else {
      setError(lastError || '儲存失敗');
      if (okCount > 0) await load(session.token);
    }
  }

  async function remove(item: KeyDate) {
    if (!session) return;
    if (!confirm(`確定刪除「${item.title}」（${item.dateText}）？`)) return;
    setBusy(item.id); setError('');
    const r = await api.deleteKeyDate(session.token, item.id);
    setBusy('');
    if (r.ok) { flash('已刪除 ✓'); await load(session.token); } else setError(r.error || '刪除失敗');
  }

  function downloadIcs() {
    const ics = buildKeyDatesIcs(
      upcoming.filter(i => i.startDate).map(i => ({
        id: i.id, title: i.title, start: i.startDate as string, end: i.endDate || i.startDate,
      })),
      '區重要日期',
    );
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `重要日期-${today}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyList() {
    const text = upcoming.map(i => `${formatKeyDate(toParsed(i))}　${i.title}`).join('\n');
    try { await navigator.clipboard.writeText(text); flash('已複製未來日期清單（可以直接貼去 WhatsApp）'); }
    catch { setError('瀏覽器唔俾自動複製，請自己選取文字複製。'); }
  }

  function renderRow(item: KeyDate, isPast = false) {
    const parsed = toParsed(item);
    const status = keyDateStatus(parsed, today);
    return (
      <li className={`kd-row ${isPast ? 'past' : ''}`} key={item.id}>
        <div className="kd-when">
          <b>{formatKeyDate(parsed)}</b>
          <span className={`kd-chip ${status.tone}`}>{status.label}</span>
        </div>
        <div className="kd-title">{item.title}</div>
        {canEdit && (
          <div className="kd-actions">
            <button className="mini-btn" disabled={busy === item.id} onClick={() => startEdit(item)}>✏️</button>
            <button className="mini-btn danger" disabled={busy === item.id} onClick={() => remove(item)}>🗑</button>
          </div>
        )}
      </li>
    );
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <BackLink />
      <h1 className="page-title">📅 重要日期</h1>
      <p className="page-sub">
        大型活動、區會同地域會議日期一覽，自動按日子排好同倒數。
        {canEdit ? '你可以加新日期。' : '只有副區總監（DDC）或以上可以加；有日期要補就搵佢哋。'}
      </p>

      {msg && <div className="success">✓ {msg}</div>}
      {error && <div className="err">{error}</div>}

      <div className="lk-toolbar">
        {canEdit && !draft && <button className="btn-sm" onClick={startNew}>＋ 加日期</button>}
        <button className="mini-btn ghost" onClick={copyList} disabled={!upcoming.length}>📋 複製清單</button>
        <button className="mini-btn ghost" onClick={downloadIcs} disabled={!upcoming.some(i => i.startDate)}>
          📥 加入日曆（.ics）
        </button>
      </div>

      {canEdit && draft && (
        <div className="info-card" style={{ borderColor: '#fbbf24' }}>
          <div className="section-head">
            <div>
              <h3>{draft.id ? '✏️ 修改日期' : '＋ 加新日期'}</h3>
              <p>兩格就得。日期照你平時嘅寫法打，系統識睇。</p>
            </div>
            <button className="mini-btn" onClick={() => setDraft(null)}>收起</button>
          </div>
          <div className="kd-form">
            <label className="kd-field">
              <span>活動 *</span>
              <input value={draft.title} maxLength={120} placeholder="例如：青少年委員會會議"
                onChange={e => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="kd-field">
              <span>日期 *</span>
              <input value={draft.dateText} maxLength={120}
                placeholder="9Nov2026　或　17-18Apr2027　或　2027　或　待定"
                onChange={e => setDraft({ ...draft, dateText: e.target.value })} />
            </label>
            <label className="kd-field kd-picker">
              <span>唔想打字？揀日子</span>
              <input type="date" aria-label="用日曆揀日期"
                onChange={e => {
                  if (!e.target.value) return;
                  const next = draft.dateText.trim();
                  setDraft({ ...draft, dateText: next ? `${next} ${e.target.value}` : e.target.value });
                }} />
            </label>
          </div>
          <p className="kd-hint">
            一格可以打幾個日期（空格分隔），會自動拆開：例如 <code>9Nov2026 2Mar2027 26Apr2027</code> → 3 項。
            連續日子打 <code>17-18Apr2027</code>；只知年份就打 <code>2027</code>。
          </p>
          {!draft.id && preview.length > 0 && (
            <p className="kd-preview">
              將會加入 {preview.length} 項：
              {preview.map((p, i) => (
                <span className="kd-preview-chip" key={`${p.text}-${i}`}>{formatKeyDate(p)}</span>
              ))}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn-sm" disabled={busy === 'save'} onClick={save}>
              {busy === 'save' ? '儲存中…' : (draft.id ? '儲存修改' : '加入')}
            </button>
            <button className="mini-btn danger" onClick={() => setDraft(null)}>取消</button>
          </div>
        </div>
      )}

      {loading && <div className="center"><div className="spinner" /><div>載入中…</div></div>}

      {!loading && items.length === 0 && (
        <div className="info-card">
          <p className="muted">
            仲未有紀錄。{canEdit ? '撳「＋ 加日期」開始，例如「青少年委員會會議 9Nov2026 2Mar2027 26Apr2027」。' : '等 DDC 或以上加入。'}
          </p>
        </div>
      )}

      {!loading && upcoming.length > 0 && (
        <div className="info-card">
          <div className="section-head">
            <div><h3>🔜 將來（{upcoming.length}）</h3></div>
            <small>今日 {today}</small>
          </div>
          <ul className="kd-list">{upcoming.map(i => renderRow(i))}</ul>
        </div>
      )}

      {!loading && past.length > 0 && (
        <div className="info-card">
          <div className="section-head">
            <div><h3>🕘 已過去（{past.length}）</h3></div>
            <button className="mini-btn ghost" onClick={() => setShowPast(v => !v)}>
              {showPast ? '收起' : '展開'}
            </button>
          </div>
          {showPast && <ul className="kd-list">{past.map(i => renderRow(i, true))}</ul>}
        </div>
      )}

      <BackBar />
    </>
  );
}
