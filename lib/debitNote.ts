import { checkAmount, checkReference } from './fps.ts';
import type { XlsxSheet, XlsxStyle } from './xlsx.ts';

/** DEBIT NOTE 屬財務文件：只有區總監、行政副區總監及區職員可以使用。 */
export const DEBIT_NOTE_ROLES = ['DC', 'DDC_ADMIN', 'STAFF'] as const;

export function canGenerateDebitNoteRole(role: string | null | undefined): boolean {
  const normalized = String(role || '').trim().toUpperCase();
  return (DEBIT_NOTE_ROLES as readonly string[]).includes(normalized);
}

export interface DebitNoteDraft {
  to: string;
  attention: string;
  /** HTML date input 格式：YYYY-MM-DD。 */
  date: string;
  ref: string;
  /** 可輸入 4950、4950.00 或 4,950.00；輸出時統一整理。 */
  amount: string;
  particulars: string;
  /** 沿用歷史 Excel 帳簿的 S/S 及 Remarks 欄。 */
  status: string;
  remarks: string;
  /** 是否在文件標題右方加上紅色 REMINDER 印。 */
  reminder: boolean;
}

/** 已寫入後端 DebitNotes 工作表的完整記錄（包括付款 QR 快照及審計欄）。 */
export interface DebitNoteRecord extends DebitNoteDraft {
  id: string;
  districtCode: string;
  fpsAccountName: string;
  fpsAccountNumber: string;
  fpsQrPayload: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface DebitNoteCsvRecord extends DebitNoteDraft {
  id: string;
  sourceRow: number;
}

export interface DebitNoteCsvResult {
  records: DebitNoteCsvRecord[];
  skipped: number;
}

export type DebitNoteField = keyof DebitNoteDraft;
export type DebitNoteErrors = Partial<Record<DebitNoteField, string>>;

export function localDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeDebitNoteReminder(raw: unknown): boolean {
  if (raw === true) return true;
  return ['TRUE', '1', 'YES', 'Y', '是'].includes(String(raw ?? '').trim().toUpperCase());
}

export function emptyDebitNote(date = localDateInputValue()): DebitNoteDraft {
  return { to: '', attention: '', date, ref: '', amount: '', particulars: '', status: '', remarks: '', reminder: false };
}

export function debitNoteRecordToDraft(record: DebitNoteRecord): DebitNoteDraft {
  return {
    to: record.to || '', attention: record.attention || '', date: normalizeDebitNoteDate(record.date),
    ref: record.ref || '', amount: normalizeDebitNoteAmount(record.amount), particulars: record.particulars || '',
    status: record.status || '', remarks: record.remarks || '',
    reminder: normalizeDebitNoteReminder(record.reminder),
  };
}

function validDateParts(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

/** 接受 CSV 常見的 19.10.2026、19/10/2026，以及 HTML 的 2026-10-19。 */
export function normalizeDebitNoteDate(raw: string | number | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  let year = 0, month = 0, day = 0;
  let match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  } else {
    match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (!match) return '';
    day = Number(match[1]); month = Number(match[2]);
    year = Number(match[3]);
    if (match[3].length === 2) year += 2000;
  }
  if (!validDateParts(year, month, day)) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 範本日期寫法：19.10.2026（不補日期及月份的前導零）。 */
export function formatDebitNoteDate(raw: string | number | null | undefined): string {
  const normalized = normalizeDebitNoteDate(raw);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-');
  return `${Number(day)}.${Number(month)}.${year}`;
}

/** 將 CSV 的「 4,950.00 」及表單輸入整理成正數、兩位小數字串。 */
export function normalizeDebitNoteAmount(raw: string | number | null | undefined): string {
  const value = String(raw ?? '').trim().replace(/HK\$/gi, '').replace(/[$,\s]/g, '');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return '';
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || value.length > 18) return '';
  return amount.toFixed(2);
}

/** 整數不顯示 .00，與附件中的 $4,950 寫法一致。 */
export function formatDebitNoteMoney(raw: string | number | null | undefined): string {
  const normalized = normalizeDebitNoteAmount(raw);
  if (!normalized) return '';
  const [integer, decimals] = normalized.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimals === '00' ? grouped : `${grouped}.${decimals}`;
}

export function validateDebitNote(draft: DebitNoteDraft): DebitNoteErrors {
  const errors: DebitNoteErrors = {};
  if (!draft.to.trim()) errors.to = '請填寫收款對象（TO）。';
  if (!normalizeDebitNoteDate(draft.date)) errors.date = '請選擇有效日期。';
  if (!draft.ref.trim()) errors.ref = '請填寫 Ref No.。';
  else {
    const reference = checkReference(draft.ref);
    if (reference.error) errors.ref = reference.error;
  }
  const amount = normalizeDebitNoteAmount(draft.amount);
  if (!amount) errors.amount = '請輸入正數金額，最多兩位小數。';
  else {
    const checked = checkAmount(amount);
    if (checked.error) errors.amount = checked.error;
  }
  if (!draft.particulars.trim()) errors.particulars = '請填寫款項內容（PARTICULARS）。';
  return errors;
}

/** 小型 RFC 4180 CSV parser：支援 BOM、CRLF、雙引號跳脫及欄位內逗號／換行。 */
export function parseCsvRows(input: string): string[][] {
  const text = String(input || '').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field === '') { quoted = true; continue; }
    if (char === ',') { row.push(field); field = ''; continue; }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
      continue;
    }
    field += char;
  }
  if (quoted) throw new Error('CSV 有未關閉的雙引號，請檢查檔案格式。');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function headerKey(raw: string): string {
  return String(raw || '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_]/g, '');
}

const CSV_HEADERS: Record<string, string[]> = {
  ref: ['ref', 'refno', 'refno.', '編號'],
  to: ['姓名字', '姓名', 'to', 'name'],
  attention: ['attention', 'attn', '收件人'],
  date: ['date', '日期'],
  amount: ['amount', '金額', '銀碼'],
  particulars: ['par', 'particulars', '款項內容', '內容'],
  status: ['s/s', 'status', '狀態'],
  remarks: ['remarks', 'remark', '備註'],
  reminder: ['reminder', 'remind', '提醒印'],
};

/**
 * 讀取附件同款的 Ref／姓名字／Date／amount／PAR／S/S／Remarks 表。
 * 不完整或空白列不會變成可列印／可匯入記錄；額外的 Attention 等匯出欄可原樣帶回。
 */
export function parseDebitNoteCsv(input: string): DebitNoteCsvResult {
  const rows = parseCsvRows(input);
  if (!rows.length) throw new Error('CSV 沒有資料。');
  const headers = rows[0].map(headerKey);
  const indexes: Record<string, number> = {};
  Object.entries(CSV_HEADERS).forEach(([key, aliases]) => {
    indexes[key] = headers.findIndex(header => aliases.includes(header));
  });
  const missing = ['ref', 'to', 'date', 'amount', 'particulars'].filter(key => indexes[key] < 0);
  if (missing.length) {
    const labels: Record<string, string> = { ref: 'Ref', to: '姓名字', date: 'Date', amount: 'amount', particulars: 'PAR' };
    throw new Error(`CSV 缺少必要欄位：${missing.map(key => labels[key]).join('、')}。`);
  }

  const records: DebitNoteCsvRecord[] = [];
  let skipped = 0;
  const get = (row: string[], key: string) => indexes[key] >= 0 ? String(row[indexes[key]] ?? '').trim() : '';
  rows.slice(1).forEach((row, index) => {
    if (row.every(cell => !String(cell || '').trim())) return;
    const ref = get(row, 'ref');
    const to = get(row, 'to');
    const rawDate = get(row, 'date');
    const rawAmount = get(row, 'amount');
    const particulars = get(row, 'particulars');
    const status = get(row, 'status');
    const remarks = get(row, 'remarks');
    // 附件最尾的空白列仍可能有流水號；冇任何文件欄位就不當作錯誤記錄。
    if (![ref, to, rawDate, rawAmount, particulars, status, remarks].some(Boolean)) return;
    const date = normalizeDebitNoteDate(rawDate);
    const amount = normalizeDebitNoteAmount(rawAmount);
    if (!ref || !to || !date || !amount || !particulars) { skipped++; return; }
    records.push({
      id: `${ref}::${index + 2}`,
      ref, to, attention: get(row, 'attention'), date, amount, particulars,
      status, remarks, reminder: normalizeDebitNoteReminder(get(row, 'reminder')), sourceRow: index + 2,
    });
  });
  return { records, skipped };
}

/** 按所選日期的兩位年份接續 CSV 最大編號，例如 26-010 → 26-011。 */
export function nextDebitNoteReference(records: Array<Pick<DebitNoteCsvRecord, 'ref'>>, date: string): string {
  const normalizedDate = normalizeDebitNoteDate(date) || localDateInputValue();
  const year = normalizedDate.slice(2, 4);
  let highest = 0;
  records.forEach(record => {
    const match = String(record.ref || '').trim().match(/^(\d{2})-(\d+)$/);
    if (!match || match[1] !== year) return;
    const sequence = Number(match[2]);
    if (Number.isSafeInteger(sequence) && sequence > highest) highest = sequence;
  });
  return `${year}-${String(highest + 1).padStart(3, '0')}`;
}

// ───────────────────────── 完整帳簿匯出 ─────────────────────────

export const DEBIT_NOTE_EXPORT_HEADERS = [
  '', 'Ref', '姓名字', 'Date', 'amount', 'PAR', 'S/S', 'Remarks', 'REMINDER', 'Attention',
  'FPS ID', 'FPS 戶口名', '建立時間', '建立者', '更新時間', '更新者', '記錄 ID', '區碼', 'FPS QR Payload',
] as const;

export type DebitNoteExportCell = string | number;

/** 匯出按文件日期及 Ref 由舊至新排列；畫面上的舊記錄則可反向顯示。 */
export function sortDebitNotesForExport(records: DebitNoteRecord[]): DebitNoteRecord[] {
  return records.slice().sort((a, b) => {
    const byDate = normalizeDebitNoteDate(a.date).localeCompare(normalizeDebitNoteDate(b.date));
    if (byDate) return byDate;
    const byRef = String(a.ref || '').localeCompare(String(b.ref || ''), 'en', { numeric: true });
    if (byRef) return byRef;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}

export function debitNoteExportRows(records: DebitNoteRecord[]): DebitNoteExportCell[][] {
  return sortDebitNotesForExport(records).map((record, index) => [
    index + 1,
    record.ref || '',
    record.to || '',
    formatDebitNoteDate(record.date),
    Number(normalizeDebitNoteAmount(record.amount) || 0),
    record.particulars || '',
    record.status || '',
    record.remarks || '',
    normalizeDebitNoteReminder(record.reminder) ? 'TRUE' : 'FALSE',
    record.attention || '',
    record.fpsAccountNumber || '',
    record.fpsAccountName || '',
    record.createdAt || '',
    record.createdBy || '',
    record.updatedAt || '',
    record.updatedBy || '',
    record.id || '',
    record.districtCode || '',
    record.fpsQrPayload || '',
  ]);
}

function csvCell(raw: DebitNoteExportCell): string {
  let value = String(raw ?? '');
  // Excel 開 CSV 時不把使用者輸入當公式執行；XLSX 本身以 inline string 寫入，無此問題。
  if (typeof raw === 'string' && /^[\t\r ]*[=+\-@]/.test(value)) value = `'${value}`;
  return `"${value.replace(/"/g, '""')}"`;
}

/** 完整 CSV 保留原帳簿首八欄，並附加付款快照及審計欄；BOM 方便 Excel 正確顯示中文。 */
export function debitNoteRecordsToCsv(records: DebitNoteRecord[]): string {
  const lines = [DEBIT_NOTE_EXPORT_HEADERS.map(csvCell).join(',')]
    .concat(debitNoteExportRows(records).map(row => row.map(csvCell).join(',')));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function debitNoteExportFilename(extension: 'xlsx' | 'csv', date = localDateInputValue()): string {
  const day = normalizeDebitNoteDate(date) || localDateInputValue();
  // 純 ASCII 檔名可避免部分 Chromium／企業瀏覽器將非英文下載檔名降成 "download"。
  return `DEBIT_NOTE_FULL_LEDGER_${day}.${extension}`;
}

export function buildDebitNoteSheets(records: DebitNoteRecord[]): XlsxSheet[] {
  const headerStyle: XlsxStyle = {
    bold: true, color: 'ffffff', fill: '1e3a5f', border: true,
    align: 'center', valign: 'middle', wrap: true,
  };
  const bodyStyle: XlsxStyle = { border: true, valign: 'top', wrap: true };
  const centerStyle: XlsxStyle = { ...bodyStyle, align: 'center' };
  const moneyStyle: XlsxStyle = { ...bodyStyle, align: 'right' };
  const rows = debitNoteExportRows(records).map(row => ({
    cells: row.map((value, column) => ({
      v: value,
      s: column === 4 ? moneyStyle : ([0, 3, 8, 10, 12, 13, 14, 15, 17].includes(column) ? centerStyle : bodyStyle),
    })),
  }));
  return [{
    name: 'DEBIT NOTES',
    widths: [6, 12, 22, 13, 13, 42, 18, 32, 12, 20, 15, 32, 21, 25, 21, 25, 22, 10, 50],
    freezeRows: 1,
    rows: [{ cells: DEBIT_NOTE_EXPORT_HEADERS.map(header => ({ v: header, s: headerStyle })), height: 32 }, ...rows],
  }];
}
