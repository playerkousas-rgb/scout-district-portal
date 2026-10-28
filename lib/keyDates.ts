/**
 * 📅 重要日期 — 日期文字解析（v4.33.0）
 * ─────────────────────────────────────────────────────────────────
 * 「活動 + 日期」兩格就得：日期格任人照原本習慣打（`9Nov2026`、`17-18Apr2027`、
 * `2027`、`2026-11-09`、`9/11/2026`、`2026年11月9日` 都收），
 * 呢度負責解析成可排序嘅 ISO 日期、計倒數、同埋把一格入面嘅多個日期拆開
 * （例如「9Nov2026 2Mar2027 26Apr2027」＝三項紀錄）。
 *
 * ⚠️ 同一套規則喺 gs/Code.gs 有對應實作（`parseKeyDateText_`）：
 *    後台唔信前端計出嚟嘅排序值，收到之後會自己再解析一次。改格式規則兩邊都要改。
 *
 * 純函數，冇瀏覽器相依 → `node --experimental-strip-types scripts/test-key-dates.ts` 直接測。
 */

export type KeyDatePrecision = 'day' | 'month' | 'year' | 'none';

export interface ParsedKeyDate {
  /** 原文片段（保留用戶點樣打；顯示唔到結構化日期時就顯示佢） */
  text: string;
  /** YYYY-MM-DD；precision='none' 時為 '' */
  start: string;
  /** YYYY-MM-DD；單日同 start 一樣；precision='none' 時為 '' */
  end: string;
  precision: KeyDatePrecision;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function validYear(y: number): boolean {
  return Number.isFinite(y) && y >= MIN_YEAR && y <= MAX_YEAR;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function monthNum(name: string): number {
  return MONTHS[String(name || '').toLowerCase().replace(/\./g, '')] || 0;
}

/** 全形 → 半形、各種破折號 → `-`、中文年月日 → ISO，方便之後用同一套 pattern 掃 */
export function normalizeKeyDateText(raw: string): string {
  let s = String(raw == null ? '' : raw)
    .replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[\u3000]/g, ' ')
    .replace(/[\uFF0C,、；;]/g, ' ')
    .replace(/[\u2010-\u2015\uFF0D~\uFF5E\u301C]/g, '-')
    .replace(/\s*(?:至|到)\s*/g, '-');
  s = s
    .replace(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g, '$1-$2-$3')
    .replace(/(\d{4})\s*年\s*(\d{1,2})\s*月/g, '$1-$2')
    .replace(/(\d{4})\s*年/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

interface Pattern {
  re: RegExp;
  build: (m: RegExpExecArray) => ParsedKeyDate | null;
}

function dayItem(text: string, y: number, m: number, d: number): ParsedKeyDate | null {
  if (!validYear(y) || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  const v = iso(y, m, d);
  return { text, start: v, end: v, precision: 'day' };
}

function rangeItem(text: string, y1: number, m1: number, d1: number, y2: number, m2: number, d2: number): ParsedKeyDate | null {
  const a = dayItem(text, y1, m1, d1);
  const b = dayItem(text, y2, m2, d2);
  if (!a || !b) return null;
  const start = a.start <= b.start ? a.start : b.start;
  const end = a.start <= b.start ? b.start : a.start;
  return { text, start, end, precision: 'day' };
}

function monthItem(text: string, y: number, m: number): ParsedKeyDate | null {
  if (!validYear(y) || m < 1 || m > 12) return null;
  return { text, start: iso(y, m, 1), end: iso(y, m, daysInMonth(y, m)), precision: 'month' };
}

function yearItem(text: string, y: number): ParsedKeyDate | null {
  if (!validYear(y)) return null;
  return { text, start: iso(y, 1, 1), end: iso(y, 12, 31), precision: 'year' };
}

// 次序有意思：長／精確嘅 pattern 要行先，否則 2026-11-09 會被「年」pattern 先食咗。
const PATTERNS: Pattern[] = [
  // 28Dec2026-3Jan2027 ／ 17Apr2027 - 18Apr2027（跨月範圍）
  {
    re: /(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*(\d{4})?\s*-\s*(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*(\d{4})/iy,
    build: m => {
      const m1 = monthNum(m[2]); const m2 = monthNum(m[5]);
      if (!m1 || !m2) return null;
      const y2 = Number(m[6]);
      const y1 = m[3] ? Number(m[3]) : y2;
      return rangeItem(m[0], y1, m1, Number(m[1]), y2, m2, Number(m[4]));
    },
  },
  // 17-18Apr2027（同月日子範圍）
  {
    re: /(\d{1,2})\s*-\s*(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*(\d{4})/iy,
    build: m => {
      const mo = monthNum(m[3]);
      if (!mo) return null;
      const y = Number(m[4]);
      return rangeItem(m[0], y, mo, Number(m[1]), y, mo, Number(m[2]));
    },
  },
  // 9Nov2026 ／ 9 Nov 2026
  {
    re: /(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*(\d{4})/iy,
    build: m => {
      const mo = monthNum(m[2]);
      return mo ? dayItem(m[0], Number(m[3]), mo, Number(m[1])) : null;
    },
  },
  // Nov 9 2026
  {
    re: /([A-Za-z]{3,9})\.?\s*(\d{1,2})\s+(\d{4})/iy,
    build: m => {
      const mo = monthNum(m[1]);
      return mo ? dayItem(m[0], Number(m[3]), mo, Number(m[2])) : null;
    },
  },
  // 2026-11-09（亦即中文「2026年11月9日」正規化之後）
  {
    re: /(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/iy,
    build: m => dayItem(m[0], Number(m[1]), Number(m[2]), Number(m[3])),
  },
  // 9/11/2026（香港習慣：日/月/年）
  {
    re: /(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?!\d)/iy,
    build: m => dayItem(m[0], Number(m[3]), Number(m[2]), Number(m[1])),
  },
  // 2026-11（只有月）
  {
    re: /(\d{4})-(0?[1-9]|1[0-2])(?!\d)/iy,
    build: m => monthItem(m[0], Number(m[1]), Number(m[2])),
  },
  // Nov2026 ／ Apr 2027（只有月）
  {
    re: /([A-Za-z]{3,9})\.?\s*(\d{4})(?!\d)/iy,
    build: m => {
      const mo = monthNum(m[1]);
      return mo ? monthItem(m[0], Number(m[2]), mo) : null;
    },
  },
  // 2027（只有年；例如「區大露營 2027」）
  {
    re: /(\d{4})(?!\d)/iy,
    build: m => yearItem(m[0], Number(m[1])),
  },
];

/**
 * 解析日期格：回傳 0 至多個日期（「9Nov2026 2Mar2027 26Apr2027」＝ 3 個）。
 * 一個都解唔到就回空陣列（由 `splitKeyDateEntries` 決定要唔要當純文字保留）。
 */
export function parseKeyDateText(raw: string): ParsedKeyDate[] {
  const s = normalizeKeyDateText(raw);
  if (!s) return [];
  const out: ParsedKeyDate[] = [];
  let i = 0;
  while (i < s.length) {
    let advanced = 0;
    // 掃到一串長數字嘅中間（例如 20261109 食剩嘅尾）就唔好硬砌出一個年份
    if (i > 0 && /\d/.test(s.charAt(i - 1)) && /\d/.test(s.charAt(i))) { i++; continue; }
    for (let p = 0; p < PATTERNS.length; p++) {
      const pattern = PATTERNS[p];
      pattern.re.lastIndex = i;
      const m = pattern.re.exec(s);
      if (!m) continue;
      const item = pattern.build(m);
      if (item) {
        out.push({ ...item, text: m[0].trim() });
        advanced = m[0].length;
        break;
      }
      // 配到格式但日期不合法（例如 31Feb2027）→ 跳過呢段，唔好再用短 pattern 砌出錯嘢
      advanced = m[0].length;
      break;
    }
    i += advanced > 0 ? advanced : 1;
  }
  return out;
}

/**
 * 新增表單用：日期格拆成「要建立幾多項紀錄」。
 * 完全解唔到（例如「待定」「農曆新年前」）都唔會擋住用戶 —— 原文照存，排最後。
 */
export function splitKeyDateEntries(raw: string): ParsedKeyDate[] {
  const parsed = parseKeyDateText(raw);
  if (parsed.length) return parsed;
  const text = normalizeKeyDateText(raw);
  return text ? [{ text, start: '', end: '', precision: 'none' }] : [];
}

/** 單一日期格 → 一項（多過一個日期時只取第一個；編輯既有紀錄用） */
export function parseSingleKeyDate(raw: string): ParsedKeyDate {
  const list = splitKeyDateEntries(raw);
  return list[0] || { text: '', start: '', end: '', precision: 'none' };
}

export function weekdayLabel(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return '';
  return WEEKDAYS[dt.getDay()] || '';
}

/** 顯示用文字：日／範圍／月／年／純文字 */
export function formatKeyDate(item: Pick<ParsedKeyDate, 'text' | 'start' | 'end' | 'precision'>): string {
  const { start, end, precision } = item;
  if (precision === 'day' && start) {
    if (end && end !== start) {
      const sameMonth = start.slice(0, 7) === end.slice(0, 7);
      const tail = sameMonth ? end.slice(8) : end;
      return `${start}（${weekdayLabel(start)}）– ${tail}（${weekdayLabel(end)}）`;
    }
    return `${start}（${weekdayLabel(start)}）`;
  }
  if (precision === 'month' && start) return `${start.slice(0, 4)} 年 ${Number(start.slice(5, 7))} 月`;
  if (precision === 'year' && start) return `${start.slice(0, 4)} 年`;
  return item.text || '—';
}

/** 排序鍵：有日期按日期，純文字排最後（但同組之間維持穩定） */
export function keyDateSortKey(item: Pick<ParsedKeyDate, 'start'>): string {
  return item.start || '9999-99-99';
}

export function todayIso(now: Date = new Date()): string {
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** 相差日數（正數＝將來）；任何一邊唔係 ISO 就回 null */
export function daysBetween(fromIso: string, toIso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIso) || !/^\d{4}-\d{2}-\d{2}$/.test(toIso)) return null;
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

export type KeyDateTone = 'past' | 'today' | 'soon' | 'future' | 'unknown';

export interface KeyDateStatus { tone: KeyDateTone; label: string }

/** 倒數標籤：今日／聽日／N 日後／進行中／已過 */
export function keyDateStatus(
  item: Pick<ParsedKeyDate, 'start' | 'end' | 'precision'>,
  today: string = todayIso(),
): KeyDateStatus {
  if (!item.start) return { tone: 'unknown', label: '未定日期' };
  const end = item.end || item.start;
  if (end < today) return { tone: 'past', label: '已過' };
  if (item.start <= today && today <= end) {
    return { tone: 'today', label: item.start === end ? '今日' : '進行中' };
  }
  const days = daysBetween(today, item.start);
  if (days === null) return { tone: 'unknown', label: '未定日期' };
  if (days === 1) return { tone: 'soon', label: '聽日' };
  if (days <= 14) return { tone: 'soon', label: `仲有 ${days} 日` };
  if (days <= 60) return { tone: 'future', label: `仲有 ${days} 日` };
  return { tone: 'future', label: `仲有 ${Math.round(days / 30)} 個月` };
}

/** 未來（包括進行中）＝ end >= today */
export function isUpcoming(item: Pick<ParsedKeyDate, 'start' | 'end'>, today: string = todayIso()): boolean {
  if (!item.start) return true;            // 未定日期當「待辦」，唔好當歷史收埋
  return (item.end || item.start) >= today;
}

function icsEscape(s: string): string {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsDate(isoDate: string): string { return isoDate.replace(/-/g, ''); }

function icsDayAfter(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}`;
}

/** 匯出 .ics（全日事件）：想入手機日曆就唔使再抄一次 */
export function buildKeyDatesIcs(
  items: Array<{ id?: string; title: string; start: string; end?: string }>,
  calendarName = '區重要日期',
): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//scout-district-portal//key-dates//ZH',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(calendarName)}`,
  ];
  items.filter(it => /^\d{4}-\d{2}-\d{2}$/.test(it.start)).forEach((it, i) => {
    const end = /^\d{4}-\d{2}-\d{2}$/.test(it.end || '') ? (it.end as string) : it.start;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icsEscape(it.id || `kd-${i}`)}@scout-district-portal`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(it.start)}`,
      `DTEND;VALUE=DATE:${icsDayAfter(end)}`,
      `SUMMARY:${icsEscape(it.title)}`,
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
