'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import BackLink, { BackBar } from '@/components/BackLink';
import DebitNoteView from '@/components/DebitNoteView';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { useDistrict } from '@/lib/useDistrict';
import { DEFAULT_FPS_ACCOUNT, FPS_ID_PATTERN, buildFpsPayload } from '@/lib/fps';
import { downloadXlsx } from '@/lib/xlsx';
import { downloadDebitNotePdf } from '@/lib/debitNotePdf';
import {
  buildDebitNoteSheets,
  canGenerateDebitNoteRole,
  debitNoteExportFilename,
  debitNoteRecordToDraft,
  debitNoteRecordsToCsv,
  emptyDebitNote,
  formatDebitNoteDate,
  formatDebitNoteMoney,
  nextDebitNoteReference,
  normalizeDebitNoteAmount,
  normalizeDebitNoteDate,
  parseDebitNoteCsv,
  validateDebitNote,
  type DebitNoteCsvRecord,
  type DebitNoteDraft,
  type DebitNoteRecord,
} from '@/lib/debitNote';

type BusyAction = 'save' | 'print' | 'pdf' | 'import' | 'refresh' | 'xlsx' | 'csv' | '';
type WorkspaceView = 'create' | 'records';

function sortRecent(records: DebitNoteRecord[]): DebitNoteRecord[] {
  return records.slice().sort((a, b) => {
    const byDate = String(b.date || '').localeCompare(String(a.date || ''));
    if (byDate) return byDate;
    const byRef = String(b.ref || '').localeCompare(String(a.ref || ''), 'en', { numeric: true });
    if (byRef) return byRef;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
}

function auditTime(value: string): string {
  return value ? value.replace('T', ' ').slice(0, 16) : '—';
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(anchor.href), 4000);
}

export default function DebitNotePage() {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const session = useRequireCard('debitNote');
  const sessionToken = session?.token || '';
  const roleAllowed = !!session && (canGenerateDebitNoteRole(session.role) || !!session.mockAdmin);
  const demo = !!session?.mockAdmin;
  const previewRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<WorkspaceView>('create');
  const [draft, setDraft] = useState<DebitNoteDraft>(() => emptyDebitNote());
  const [currentRecord, setCurrentRecord] = useState<DebitNoteRecord | null>(null);
  const [dirty, setDirty] = useState(false);
  const [accountName, setAccountName] = useState(DEFAULT_FPS_ACCOUNT.name);
  const [fpsId, setFpsId] = useState(DEFAULT_FPS_ACCOUNT.id);
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [configNotice, setConfigNotice] = useState('');
  const [records, setRecords] = useState<DebitNoteRecord[]>([]);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [recordsError, setRecordsError] = useState('');
  const [csvRecords, setCsvRecords] = useState<DebitNoteCsvRecord[]>([]);
  const [selectedCsv, setSelectedCsv] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<BusyAction>('');
  const [query, setQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [recordLimit, setRecordLimit] = useState(25);

  useEffect(() => {
    if (session && !roleAllowed) router.replace(withDistrict('/'));
  }, [session, roleAllowed, router, withDistrict]);

  useEffect(() => {
    if (!sessionToken || !roleAllowed) return;
    let cancelled = false;
    setCfgLoaded(false);
    (async () => {
      try {
        const result = await api.getConfig();
        if (cancelled) return;
        if (result.ok && result.data) {
          const remoteName = String(result.data.fpsAccountName ?? '').trim();
          const remoteId = String(result.data.fpsAccountNumber ?? '').trim();
          if (remoteName) setAccountName(remoteName);
          if (remoteId) setFpsId(remoteId);
        } else {
          setConfigNotice('未能讀取區設定，現正使用預設 FPS 收款戶口。');
        }
      } catch {
        if (!cancelled) setConfigNotice('未能讀取區設定，現正使用預設 FPS 收款戶口。');
      } finally {
        if (!cancelled) setCfgLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionToken, roleAllowed]);

  const loadRecords = useCallback(async (showBusy = true): Promise<boolean> => {
    if (!sessionToken) return false;
    if (showBusy) setBusy('refresh');
    setRecordsError('');
    try {
      const result = await api.listDebitNotes(sessionToken);
      if (result.ok && Array.isArray(result.data)) {
        setRecords(sortRecent(result.data));
        setRecordsLoaded(true);
        return true;
      }
      setRecordsError(result.error || '未能讀取 DEBIT NOTE 帳簿。');
      return false;
    } catch (error) {
      setRecordsError(error instanceof Error ? error.message : '未能讀取 DEBIT NOTE 帳簿。');
      return false;
    } finally {
      if (showBusy) setBusy(previous => previous === 'refresh' ? '' : previous);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken || !roleAllowed) return;
    setRecordsLoaded(false);
    void loadRecords();
  }, [sessionToken, roleAllowed, loadRecords]);

  const errors = useMemo(() => validateDebitNote(draft), [draft]);
  const cleanFpsId = fpsId.trim();
  const savedSnapshot = !!currentRecord && !dirty && !!currentRecord.fpsQrPayload;
  const accountError = !demo && cfgLoaded && !FPS_ID_PATTERN.test(cleanFpsId)
    ? '收款帳戶不是有效的 7 至 9 位 FPS ID，請管理員檢查 Config。'
    : '';
  const fieldsReady = Object.keys(errors).length === 0;
  const ready = fieldsReady && (savedSnapshot || (cfgLoaded && !accountError));

  const draftFpsPayload = useMemo(() => {
    if (!cfgLoaded || !fieldsReady || accountError) return '';
    const amount = normalizeDebitNoteAmount(draft.amount);
    if (demo) return `DEMO-FPS-QR|${draft.ref.trim()}|${amount}`;
    return buildFpsPayload(cleanFpsId, amount, draft.ref.trim());
  }, [cfgLoaded, fieldsReady, accountError, demo, cleanFpsId, draft.amount, draft.ref]);

  const fpsPayload = savedSnapshot && currentRecord ? currentRecord.fpsQrPayload : draftFpsPayload;
  const displayFpsId = savedSnapshot && currentRecord
    ? currentRecord.fpsAccountNumber
    : (demo ? 'DEMO' : cleanFpsId);
  const displayAccountName = savedSnapshot && currentRecord ? currentRecord.fpsAccountName : accountName;

  const years = useMemo(() => Array.from(new Set(records
    .map(record => normalizeDebitNoteDate(record.date).slice(0, 4))
    .filter(Boolean))).sort((a, b) => b.localeCompare(a)), [records]);
  const statuses = useMemo(() => Array.from(new Set(records
    .map(record => record.status.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [records]);
  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter(record => {
      if (yearFilter !== 'all' && normalizeDebitNoteDate(record.date).slice(0, 4) !== yearFilter) return false;
      if (statusFilter === 'blank' && record.status.trim()) return false;
      if (statusFilter !== 'all' && statusFilter !== 'blank' && record.status !== statusFilter) return false;
      if (!needle) return true;
      return [record.ref, record.to, record.attention, record.particulars, record.status, record.remarks,
        record.reminder ? 'REMINDER' : '', record.date, formatDebitNoteDate(record.date), record.createdBy, record.updatedBy]
        .some(value => String(value || '').toLowerCase().includes(needle));
    });
  }, [records, query, yearFilter, statusFilter]);
  const filteredTotal = filteredRecords.reduce((sum, record) => sum + (Number(record.amount) || 0), 0);

  useEffect(() => { setRecordLimit(25); }, [query, yearFilter, statusFilter]);

  function set<K extends keyof DebitNoteDraft>(key: K, value: DebitNoteDraft[K]) {
    setDraft(previous => ({ ...previous, [key]: value }));
    setDirty(true);
    setFeedback('');
  }

  function hasUnsavedWork(): boolean {
    return dirty && !!(draft.to || draft.ref || draft.amount || draft.particulars || draft.status || draft.remarks);
  }

  async function saveRecord(action: 'save' | 'print' | 'pdf' = 'save'): Promise<DebitNoteRecord | null> {
    setShowErrors(true);
    if (!ready) {
      setFeedback(accountError || '請先填妥收款對象、日期、Ref No.、金額及款項內容，並等待戶口設定載入。');
      return null;
    }
    if (currentRecord && !dirty) {
      setFeedback(`${currentRecord.ref} 已儲存在後端，沒有未儲存改動。`);
      return currentRecord;
    }
    setBusy(action);
    setFeedback('');
    try {
      const result = await api.saveDebitNote(sessionToken, {
        ...draft,
        amount: normalizeDebitNoteAmount(draft.amount),
        date: normalizeDebitNoteDate(draft.date),
        id: currentRecord?.id,
      });
      if (!result.ok || !result.data?.record) {
        setFeedback(result.error || '儲存失敗，請稍後再試。');
        return null;
      }
      const saved = result.data.record;
      setCurrentRecord(saved);
      setDraft(debitNoteRecordToDraft(saved));
      setDirty(false);
      setRecords(previous => {
        const index = previous.findIndex(record => record.id === saved.id);
        const next = previous.slice();
        if (index >= 0) next[index] = saved;
        else next.push(saved);
        return sortRecent(next);
      });
      setRecordsLoaded(true);
      setFeedback(`✅ ${saved.ref} 已儲存到後端帳簿；FPS QR 及戶口快照亦已保存。`);
      return saved;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '儲存失敗，請稍後再試。');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function printNote() {
    setShowErrors(true);
    if (!ready) {
      setFeedback(accountError || '請先填妥收款對象、日期、Ref No.、金額及款項內容，並等待戶口設定載入。');
      return;
    }
    // 新單或有改動的舊單：先成功寫入帳簿才開列印視窗。
    if (!currentRecord || dirty) {
      const saved = await saveRecord('print');
      if (!saved) return;
    }
    setFeedback('');
    const previousTitle = document.title;
    const safeRef = draft.ref.trim().replace(/[^A-Za-z0-9_-]+/g, '_');
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    document.title = `DEBIT NOTE ${safeRef}`;
    window.addEventListener('afterprint', restoreTitle, { once: true });
    window.print();
    window.setTimeout(restoreTitle, 1000);
  }

  async function downloadPdfNote() {
    setShowErrors(true);
    if (!ready) {
      setFeedback(accountError || '請先填妥收款對象、日期、Ref No.、金額及款項內容，並等待戶口設定載入。');
      return;
    }
    // 直接 PDF 與列印一樣，必須先把新單或改動保存，避免下載與帳簿內容不一致。
    if (!currentRecord || dirty) {
      const saved = await saveRecord('pdf');
      if (!saved) return;
    }
    const element = previewRef.current?.querySelector<HTMLElement>('.debit-note-paper');
    if (!element) { setFeedback('找不到 DEBIT NOTE 預覽，未能生成 PDF。'); return; }
    setBusy('pdf');
    setFeedback('正在生成單頁 A4 PDF，請稍候…');
    try {
      await downloadDebitNotePdf(element, draft.ref);
      setFeedback(`✅ ${draft.ref} 已生成單頁 A4 PDF；REMINDER 及 FPS QR 會按現時預覽保留。`);
    } catch (error) {
      setFeedback(error instanceof Error ? `PDF 生成失敗：${error.message}` : 'PDF 生成失敗，請稍後再試。');
    } finally {
      setBusy('');
    }
  }

  async function readCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setBusy('import'); setImportMessage(''); setFeedback('');
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('CSV 不可大過 2 MB。');
      const result = parseDebitNoteCsv(await file.text());
      if (!result.records.length) throw new Error('CSV 沒有可用的完整 DEBIT NOTE 記錄。');
      setCsvRecords(result.records);
      setSelectedCsv('');
      setImportMessage(`已讀取 ${result.records.length} 筆記錄${result.skipped ? `；略過 ${result.skipped} 筆空白或未填妥記錄` : ''}。可先選一筆帶入，或按「匯入後端帳簿」整批保存。`);
    } catch (error) {
      setCsvRecords([]); setSelectedCsv('');
      setImportMessage(error instanceof Error ? error.message : '未能讀取 CSV。');
    } finally {
      setBusy('');
      input.value = '';
    }
  }

  function loadCsvRecord(id: string) {
    const record = csvRecords.find(item => item.id === id);
    if (!record) { setSelectedCsv(''); return; }
    if (hasUnsavedWork() && !window.confirm('以 CSV 記錄取代現時未儲存欄位？')) return;
    setSelectedCsv(id);
    setCurrentRecord(null);
    setDraft({
      to: record.to, attention: record.attention, date: record.date, ref: record.ref,
      amount: record.amount, particulars: record.particulars, status: record.status, remarks: record.remarks,
      reminder: record.reminder,
    });
    setDirty(true);
    setShowErrors(false);
    setFeedback(`已帶入 CSV 的 ${record.ref}；請核對後按「儲存記錄」，或列印時自動儲存。`);
  }

  async function importCsvToBackend() {
    if (!csvRecords.length || busy) return;
    if (!window.confirm(`將 ${csvRecords.length} 筆 CSV 記錄匯入後端？相同 Ref No. 的現有記錄不會被覆蓋。`)) return;
    setBusy('import'); setImportMessage('正在寫入後端帳簿…');
    try {
      const result = await api.importDebitNotes(sessionToken, csvRecords.map(record => ({
        to: record.to, attention: record.attention, date: record.date, ref: record.ref,
        amount: record.amount, particulars: record.particulars, status: record.status,
        remarks: record.remarks, reminder: record.reminder, sourceRow: record.sourceRow,
      })));
      if (!result.ok || !result.data) {
        setImportMessage(result.error || '匯入失敗，請稍後再試。');
        return;
      }
      const summary = result.data;
      if (summary.aborted || summary.errors.length) {
        const detail = summary.errors.slice(0, 5).map(item => `第 ${item.row} 行${item.ref ? `（${item.ref}）` : ''}：${item.error}`).join('\n');
        setImportMessage(`整批未匯入。請修正以下資料後再試：\n${detail}${summary.errors.length > 5 ? `\n另有 ${summary.errors.length - 5} 個錯誤。` : ''}`);
        return;
      }
      const duplicateText = summary.duplicates
        ? `；略過 ${summary.duplicates} 筆重複 Ref No.${summary.duplicateRefs.length ? `（${summary.duplicateRefs.slice(0, 5).join('、')}${summary.duplicates > 5 ? '…' : ''}）` : ''}`
        : '';
      setImportMessage(`✅ 已新增 ${summary.imported} 筆到後端帳簿${duplicateText}。現有記錄沒有被覆蓋。`);
      await loadRecords(false);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : '匯入失敗，請稍後再試。');
    } finally {
      setBusy('');
    }
  }

  function suggestReference() {
    const ref = nextDebitNoteReference([...records, ...csvRecords], draft.date);
    set('ref', ref);
    setFeedback(records.length || csvRecords.length
      ? `已按後端及本次 CSV 的同年最大編號建議 ${ref}，儲存前請再核對。`
      : `帳簿暫時沒有同年記錄，建議由 ${ref} 開始。`);
  }

  function resetForm() {
    if (hasUnsavedWork() && !window.confirm('清除現時未儲存的 DEBIT NOTE 欄位？後端舊記錄及 CSV 清單會保留。')) return;
    setDraft(emptyDebitNote());
    setCurrentRecord(null);
    setDirty(false);
    setSelectedCsv('');
    setShowErrors(false);
    setFeedback('已開啟空白 DEBIT NOTE。');
  }

  function openRecord(record: DebitNoteRecord) {
    if (hasUnsavedWork() && !window.confirm('開啟舊記錄會取代現時未儲存欄位，是否繼續？')) return;
    setDraft(debitNoteRecordToDraft(record));
    setCurrentRecord(record);
    setDirty(false);
    setSelectedCsv('');
    setShowErrors(false);
    setView('create');
    setFeedback(`已開啟 ${record.ref}。目前顯示當時保存的 FPS QR；任何改動會在下次儲存時更新記錄及 QR。`);
  }

  async function downloadRecords(format: 'xlsx' | 'csv') {
    if (busy) return;
    setBusy(format); setFeedback(''); setRecordsError('');
    try {
      // 每次先取最新完整帳簿；不使用畫面上的搜尋、年份或狀態篩選。
      const result = await api.listDebitNotes(sessionToken);
      if (!result.ok || !Array.isArray(result.data)) throw new Error(result.error || '未能讀取完整帳簿。');
      const all = result.data;
      setRecords(sortRecent(all)); setRecordsLoaded(true);
      if (!all.length) throw new Error('帳簿暫時沒有記錄可下載。');
      if (format === 'xlsx') {
        downloadXlsx(buildDebitNoteSheets(all), debitNoteExportFilename('xlsx'));
      } else {
        downloadCsv(debitNoteRecordsToCsv(all), debitNoteExportFilename('csv'));
      }
      setFeedback(`✅ 已下載完整 ${format.toUpperCase()} 帳簿，共 ${all.length} 筆記錄（不受目前篩選影響）。`);
    } catch (error) {
      setRecordsError(error instanceof Error ? error.message : '下載失敗，請稍後再試。');
    } finally {
      setBusy('');
    }
  }

  if (!session || !roleAllowed) return <div className="center"><div className="spinner" /></div>;

  const selectedCsvRecord = csvRecords.find(record => record.id === selectedCsv) || null;

  return (
    <div className="debit-note-page">
      <BackLink />
      <div className="no-print">
        <h1 className="page-title">🧾 DEBIT NOTE 生成</h1>
        <p className="page-sub">直接取代 Excel 輸入：生成正式單據及 FPS QR、可選 REMINDER 印、單頁 A4 PDF／列印、後端帳簿及完整 Excel／CSV。只限 DC、區職員及 DDC_ADMIN。</p>
      </div>

      <div className="debit-note-workspace-tabs no-print" role="tablist" aria-label="DEBIT NOTE 工作區">
        <button type="button" role="tab" aria-selected={view === 'create'} className={view === 'create' ? 'active' : ''} onClick={() => setView('create')}>
          🧾 生成／修改{currentRecord ? `：${currentRecord.ref}` : ''}
        </button>
        <button type="button" role="tab" aria-selected={view === 'records'} className={view === 'records' ? 'active' : ''} onClick={() => setView('records')}>
          🗂 舊記錄（{records.length}）
        </button>
      </div>
      {feedback && <p className="debit-note-feedback no-print" role="status">{feedback}</p>}

      {view === 'create' ? (
        <>
          <section className="info-card debit-note-editor no-print">
            <div className="section-head">
              <div>
                <h3>1️⃣ {currentRecord ? `修改 ${currentRecord.ref}` : '填寫新 DEBIT NOTE'}</h3>
                <p>{currentRecord && !dirty ? '這張單已保存；修改任何欄位後請再儲存。' : '列印會先自動儲存。亦可先按「儲存記錄」，核對無誤後再列印。'}</p>
              </div>
              <div className="debit-note-head-actions">
                <span className={`debit-note-save-state ${currentRecord && !dirty ? 'saved' : ''}`}>
                  {currentRecord ? (dirty ? '● 有未儲存改動' : '✓ 已保存後端') : '○ 未儲存新單'}
                </span>
                <button type="button" className="mini-btn" onClick={resetForm} disabled={!!busy}>＋ 新張</button>
                <button type="button" className="btn-sm" onClick={() => void saveRecord()} disabled={!!busy}>
                  {busy === 'save' ? '儲存中…' : '💾 儲存記錄'}
                </button>
              </div>
            </div>

            <div className="debit-note-form-grid">
              <label className="debit-note-field debit-note-span-2">
                <span>TO 收款對象 <b>*</b></span>
                <input value={draft.to} onChange={event => set('to', event.target.value)} maxLength={140} placeholder="例如：收款對象姓名／機構" aria-invalid={showErrors && !!errors.to} />
                {showErrors && errors.to && <small className="debit-note-error">{errors.to}</small>}
              </label>
              <label className="debit-note-field">
                <span>Attention（選填）</span>
                <input value={draft.attention} onChange={event => set('attention', event.target.value)} maxLength={100} placeholder="留空即可" />
              </label>
              <label className="debit-note-field">
                <span>Date 日期 <b>*</b></span>
                <input type="date" value={draft.date} onChange={event => set('date', event.target.value)} aria-invalid={showErrors && !!errors.date} />
                {showErrors && errors.date && <small className="debit-note-error">{errors.date}</small>}
              </label>
              <div className="debit-note-field">
                <label htmlFor="debit-note-ref">Ref No. <b>*</b></label>
                <div className="debit-note-ref-input">
                  <input id="debit-note-ref" value={draft.ref} onChange={event => set('ref', event.target.value)} maxLength={25} placeholder="例如：26-011" aria-invalid={showErrors && !!errors.ref} />
                  <button type="button" className="mini-btn" onClick={suggestReference} disabled={!!busy}>下一編號</button>
                </div>
                {showErrors && errors.ref && <small className="debit-note-error">{errors.ref}</small>}
              </div>
              <label className="debit-note-field">
                <span>Amount 金額（HK$） <b>*</b></span>
                <input inputMode="decimal" value={draft.amount} onChange={event => set('amount', event.target.value)} maxLength={20} placeholder="例如：4,950.00" aria-invalid={showErrors && !!errors.amount} />
                {showErrors && errors.amount && <small className="debit-note-error">{errors.amount}</small>}
              </label>
              <label className="debit-note-field debit-note-span-2">
                <span>PARTICULARS 款項內容 <b>*</b></span>
                <textarea value={draft.particulars} onChange={event => set('particulars', event.target.value)} maxLength={500} rows={3} placeholder="例如：Sponsorship of Fellowship Dinner (1.11.2026)" aria-invalid={showErrors && !!errors.particulars} />
                {showErrors && errors.particulars && <small className="debit-note-error">{errors.particulars}</small>}
              </label>
              <label className="debit-note-field">
                <span>S/S 狀態（帳簿用，不印出）</span>
                <input value={draft.status} onChange={event => set('status', event.target.value)} maxLength={80} placeholder="例如：Paid / Pending payment" list="debit-note-status-options" />
                <datalist id="debit-note-status-options">
                  <option value="Pending payment" /><option value="Paid" /><option value="Cancelled" />
                  {statuses.map(status => <option key={status} value={status} />)}
                </datalist>
              </label>
              <label className="debit-note-field">
                <span>Remarks 備註（帳簿用，不印出）</span>
                <input value={draft.remarks} onChange={event => set('remarks', event.target.value)} maxLength={500} placeholder="沿用舊 Excel 備註欄" />
              </label>
              <label className="debit-note-reminder-toggle debit-note-span-2">
                <input type="checkbox" checked={draft.reminder} onChange={event => set('reminder', event.target.checked)} />
                <span><b>加「REMINDER」印</b><small>在 DEBIT NOTE 標題右方加紅字紅框；會隨後端記錄、PDF 及 A4 列印保存。</small></span>
              </label>
            </div>

            <details className="debit-note-import">
              <summary>📥 匯入現有 Excel 帳簿 CSV（遷移用）</summary>
              <p>先在 Excel「另存為 CSV UTF-8」。支援 <code>Ref、姓名字、Date、amount、PAR、S/S、Remarks</code>；讀取後仍可逐筆檢查，按匯入才會寫入後端。重複 Ref No. 不會覆蓋舊單。</p>
              <label className="debit-note-file">
                <span>選擇 CSV 檔案</span>
                <input type="file" accept=".csv,text/csv" onChange={readCsv} disabled={!!busy} />
              </label>
              {busy === 'import' && <p className="debit-note-import-message">處理中…</p>}
              {importMessage && <p className="debit-note-import-message debit-note-preline" role="status">{importMessage}</p>}
              {csvRecords.length > 0 && (
                <div className="debit-note-csv-ready">
                  <label className="debit-note-field">
                    <span>先選一筆帶入表單（可選）</span>
                    <select value={selectedCsv} onChange={event => loadCsvRecord(event.target.value)} disabled={!!busy}>
                      <option value="">— 請選擇 Ref No. —</option>
                      {csvRecords.slice().reverse().map(record => (
                        <option key={record.id} value={record.id}>
                          {record.ref} · {record.to} · HK${formatDebitNoteMoney(record.amount)}{record.status ? ` · ${record.status}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="btn-sm" onClick={() => void importCsvToBackend()} disabled={!!busy}>
                    {busy === 'import' ? '匯入中…' : `☁ 匯入 ${csvRecords.length} 筆到後端帳簿`}
                  </button>
                </div>
              )}
              {selectedCsvRecord && <p className="debit-note-record-note">CSV 第 {selectedCsvRecord.sourceRow} 行已帶入；儲存後才會成為後端記錄。</p>}
            </details>

            <div className="debit-note-account">
              <div><span>{savedSnapshot ? '已保存的 FPS 收款戶口快照' : 'FPS 收款戶口'}</span><b>{demo ? '示範戶口（不可付款）' : displayAccountName}</b></div>
              <code>{displayFpsId || '—'}</code>
            </div>
            {configNotice && !demo && <p className="fps-notice">ℹ️ {configNotice}</p>}
            {accountError && !savedSnapshot && <div className="err" role="alert">{accountError}</div>}
            {demo && <p className="fps-notice">🎭 示範帳簿只存於這個瀏覽器分頁；QR 明確不可付款，不會寫入正式 Google Sheet。</p>}
          </section>

          <section className="debit-note-preview-section">
            <div className="section-head no-print">
              <div><h3>2️⃣ 預覽、儲存及輸出</h3><p>{currentRecord && !dirty ? '目前正顯示已保存記錄及 QR 快照。' : '新單或有改動時，下載 PDF 或列印會先自動儲存到後端。'}</p></div>
              <div className="debit-note-output-actions">
                <button type="button" className="btn-sm" onClick={() => void downloadPdfNote()} disabled={!!busy}>
                  {busy === 'pdf' ? '儲存及生成 PDF…' : '⬇ 下載整頁 PDF'}
                </button>
                <button type="button" className="mini-btn" onClick={() => void printNote()} disabled={!!busy}>
                  {busy === 'print' ? '儲存及準備列印…' : '🖨 瀏覽器列印（A4）'}
                </button>
              </div>
            </div>
            <p className="debit-note-print-help no-print">直接下載為單頁 A4 PDF；瀏覽器列印請選 A4、直向及比例 100%，亦可選「另存為 PDF」保留可搜尋文字。正式發出前請用銀行 App 試掃 FPS QR。</p>
            <div className="debit-note-preview-scroll" ref={previewRef}>
              <DebitNoteView draft={draft} fpsId={displayFpsId} fpsPayload={fpsPayload} demo={demo} />
            </div>
          </section>
        </>
      ) : (
        <section className="info-card debit-note-ledger no-print">
          <div className="section-head">
            <div><h3>🗂 DEBIT NOTE 後端帳簿</h3><p>開啟舊單可重印或修改；完整下載包括全部記錄、FPS QR 快照及審計欄。</p></div>
            <div className="debit-note-ledger-actions">
              <button type="button" className="mini-btn" onClick={() => void loadRecords()} disabled={!!busy}>{busy === 'refresh' ? '更新中…' : '↻ 重新整理'}</button>
              <button type="button" className="mini-btn" onClick={() => void downloadRecords('csv')} disabled={!!busy}>{busy === 'csv' ? '準備中…' : '⬇ 完整 CSV'}</button>
              <button type="button" className="btn-sm" onClick={() => void downloadRecords('xlsx')} disabled={!!busy}>{busy === 'xlsx' ? '準備中…' : '⬇ 完整 Excel (.xlsx)'}</button>
            </div>
          </div>

          <div className="debit-note-ledger-filters">
            <label className="debit-note-field">
              <span>搜尋舊記錄</span>
              <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ref、姓名、款項、備註、建立者…" />
            </label>
            <label className="debit-note-field">
              <span>年份</span>
              <select value={yearFilter} onChange={event => setYearFilter(event.target.value)}>
                <option value="all">全部年份</option>
                {years.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="debit-note-field">
              <span>S/S 狀態</span>
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                <option value="all">全部狀態</option>
                <option value="blank">（空白）</option>
                {statuses.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
          </div>

          <div className="debit-note-ledger-summary" aria-live="polite">
            <span>顯示 <b>{Math.min(recordLimit, filteredRecords.length)}</b>／篩選到 <b>{filteredRecords.length}</b> 筆（帳簿共 {records.length} 筆）</span>
            <span>篩選金額合計 <b>HK${formatDebitNoteMoney(filteredTotal.toFixed(2))}</b></span>
          </div>
          <p className="debit-note-download-note">⬇ 下載永遠包含全部 {records.length} 筆，不受以上搜尋或篩選影響。</p>
          {recordsError && <div className="err" role="alert">{recordsError}</div>}
          {busy === 'refresh' && !recordsLoaded ? (
            <div className="center"><div className="spinner" /><p>正在讀取後端帳簿…</p></div>
          ) : filteredRecords.length ? (
            <>
              <div className="debit-note-ledger-table-wrap">
                <table className="debit-note-ledger-table">
                  <thead><tr><th>Date</th><th>Ref No.</th><th>TO / Attention</th><th>PARTICULARS</th><th>Amount</th><th>S/S / Remarks</th><th>最後更新</th><th>操作</th></tr></thead>
                  <tbody>
                    {filteredRecords.slice(0, recordLimit).map(record => (
                      <tr key={record.id}>
                        <td data-label="Date" className="debit-note-nowrap"><span className="debit-note-ledger-value">{formatDebitNoteDate(record.date)}</span></td>
                        <td data-label="Ref No."><span className="debit-note-ledger-value"><b className="debit-note-ledger-ref">{record.ref}</b>{record.reminder && <small className="debit-note-ledger-reminder">REMINDER</small>}</span></td>
                        <td data-label="TO / Attention"><span className="debit-note-ledger-value"><b>{record.to}</b>{record.attention && <small>Attn: {record.attention}</small>}</span></td>
                        <td data-label="PARTICULARS" className="debit-note-ledger-particulars"><span className="debit-note-ledger-value">{record.particulars}</span></td>
                        <td data-label="Amount" className="debit-note-ledger-money"><span className="debit-note-ledger-value">HK${formatDebitNoteMoney(record.amount)}</span></td>
                        <td data-label="S/S / Remarks"><span className="debit-note-ledger-value">{record.status && <span className="debit-note-ledger-status">{record.status}</span>}{record.remarks && <small>{record.remarks}</small>}{!record.status && !record.remarks && '—'}</span></td>
                        <td data-label="最後更新"><span className="debit-note-ledger-value"><span className="debit-note-nowrap">{auditTime(record.updatedAt)}</span><small>{record.updatedBy || '—'}</small></span></td>
                        <td data-label="操作"><span className="debit-note-ledger-value"><button type="button" className="mini-btn" onClick={() => openRecord(record)} disabled={!!busy}>開啟／輸出</button></span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {recordLimit < filteredRecords.length && (
                <div className="debit-note-load-more"><button type="button" className="mini-btn" onClick={() => setRecordLimit(limit => limit + 25)}>顯示多 25 筆（尚餘 {filteredRecords.length - recordLimit}）</button></div>
              )}
            </>
          ) : (
            <div className="debit-note-empty">
              <b>{records.length ? '沒有符合篩選條件的記錄' : '帳簿暫時未有記錄'}</b>
              <p>{records.length ? '請清除搜尋或改選年份／狀態。' : '返回「生成／修改」新增第一張單，或匯入現有 CSV 帳簿。'}</p>
              {records.length > 0 && <button type="button" className="mini-btn" onClick={() => { setQuery(''); setYearFilter('all'); setStatusFilter('all'); }}>清除篩選</button>}
            </div>
          )}
        </section>
      )}

      <BackBar />
    </div>
  );
}
