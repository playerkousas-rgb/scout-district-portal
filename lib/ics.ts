/**
 * 極簡 iCalendar (.ics) 解析 + 重複事件展開（v4.5.0 地域房間日曆用）
 * ─────────────────────────────────────────────────────────────────────
 * 只支援本平台需要嘅子集：VEVENT、DTSTART/DTEND（UTC Z／TZID／全日 DATE）、
 * RRULE FREQ=DAILY|WEEKLY|MONTHLY（INTERVAL/COUNT/UNTIL/BYDAY）、EXDATE、
 * RECURRENCE-ID 覆寫、STATUS:CANCELLED。所有時間以 epoch ms 計，輸出用香港時間（UTC+8，無夏令）。
 */

export const HK_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface IcsEvent {
  uid: string;
  summary: string;
  start: number;       // epoch ms
  end: number;         // epoch ms（全日事件 = 翌日 00:00 HK）
  allDay: boolean;
  location?: string;
  description?: string;
}

interface RawEvent {
  uid: string; summary: string; location?: string; description?: string;
  start: number; end: number; allDay: boolean;
  rrule?: string; exdates: number[]; recurrenceId?: number; cancelled: boolean;
}

/** 展開摺行（CRLF + 空白／Tab 開頭 = 上一行延續） */
export function unfoldIcs(text: string): string[] {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (const l of lines) {
    if ((l.startsWith(' ') || l.startsWith('\t')) && out.length) out[out.length - 1] += l.slice(1);
    else out.push(l);
  }
  return out;
}

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

/** 解析 DTSTART/DTEND 值；回傳 epoch ms + 是否全日 */
export function parseIcsDate(value: string, params: Record<string, string>): { t: number; allDay: boolean } | null {
  const v = value.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m || params.VALUE === 'DATE') {
    m = m || /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    // 全日：以香港 00:00 為準
    return { t: Date.UTC(+m[1], +m[2] - 1, +m[3]) - HK_OFFSET_MS, allDay: true };
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3], h = +m[4], mi = +m[5], s = +(m[6] || 0);
  if (m[7] === 'Z') return { t: Date.UTC(y, mo, d, h, mi, s), allDay: false };
  // TZID（幾乎一定係 Asia/Hong_Kong）或浮動時間：一律當香港時間
  return { t: Date.UTC(y, mo, d, h, mi, s) - HK_OFFSET_MS, allDay: false };
}

function parseLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  // 參數值可能含引號內嘅冒號（少見）；簡單處理
  let head = line.slice(0, idx), value = line.slice(idx + 1);
  const q = head.indexOf('"');
  if (q >= 0 && (head.match(/"/g) || []).length % 2 === 1) {
    const close = line.indexOf('"', idx);
    if (close > 0) { const idx2 = line.indexOf(':', close); head = line.slice(0, idx2); value = line.slice(idx2 + 1); }
  }
  const parts = head.split(';');
  const name = parts[0].toUpperCase();
  const params: Record<string, string> = {};
  parts.slice(1).forEach((p) => {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  });
  return { name, params, value };
}

function parseRaw(text: string): RawEvent[] {
  const out: RawEvent[] = [];
  let cur: Partial<RawEvent> | null = null;
  for (const line of unfoldIcs(text)) {
    if (line === 'BEGIN:VEVENT') { cur = { exdates: [], cancelled: false, summary: '', uid: '' }; continue; }
    if (line === 'END:VEVENT') {
      if (cur && typeof cur.start === 'number') {
        if (typeof cur.end !== 'number') cur.end = cur.allDay ? cur.start + 86400000 : cur.start;
        out.push(cur as RawEvent);
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const p = parseLine(line);
    if (!p) continue;
    switch (p.name) {
      case 'UID': cur.uid = p.value.trim(); break;
      case 'SUMMARY': cur.summary = unescapeText(p.value).trim(); break;
      case 'LOCATION': cur.location = unescapeText(p.value).trim(); break;
      case 'DESCRIPTION': cur.description = unescapeText(p.value).trim(); break;
      case 'STATUS': if (/CANCELLED/i.test(p.value)) cur.cancelled = true; break;
      case 'RRULE': cur.rrule = p.value.trim(); break;
      case 'DTSTART': { const d = parseIcsDate(p.value, p.params); if (d) { cur.start = d.t; cur.allDay = d.allDay; } break; }
      case 'DTEND': { const d = parseIcsDate(p.value, p.params); if (d) cur.end = d.t; break; }
      case 'DURATION': {
        const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(p.value.trim());
        if (m && typeof cur.start === 'number') {
          const ms = ((+(m[1] || 0)) * 7 * 86400 + (+(m[2] || 0)) * 86400 + (+(m[3] || 0)) * 3600 + (+(m[4] || 0)) * 60 + (+(m[5] || 0))) * 1000;
          cur.end = cur.start + ms;
        }
        break;
      }
      case 'EXDATE': p.value.split(',').forEach((v) => { const d = parseIcsDate(v, p.params); if (d) cur!.exdates!.push(d.t); }); break;
      case 'RECURRENCE-ID': { const d = parseIcsDate(p.value, p.params); if (d) cur.recurrenceId = d.t; break; }
      default: break;
    }
  }
  return out;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function hkParts(t: number): { y: number; m: number; d: number; dow: number; msOfDay: number } {
  const local = new Date(t + HK_OFFSET_MS);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(), dow: local.getUTCDay(), msOfDay: t + HK_OFFSET_MS - Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) };
}
function hkDate(y: number, m: number, d: number, msOfDay: number): number {
  return Date.UTC(y, m, d) - HK_OFFSET_MS + msOfDay;
}

/** 展開 RRULE（只到 windowEnd／UNTIL／COUNT；最多 1000 個實例） */
function expandRrule(ev: RawEvent, windowStart: number, windowEnd: number, skip: Set<number>): number[] {
  const rule: Record<string, string> = {};
  (ev.rrule || '').split(';').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) rule[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1).toUpperCase(); });
  const freq = rule.FREQ;
  const interval = Math.max(1, parseInt(rule.INTERVAL || '1', 10) || 1);
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : Infinity;
  let until = Infinity;
  if (rule.UNTIL) { const u = parseIcsDate(rule.UNTIL, {}); if (u) until = u.t + (u.allDay ? 86400000 - 1 : 0); }
  const dur = ev.end - ev.start;
  const base = hkParts(ev.start);
  const exset = new Set(ev.exdates);
  const starts: number[] = [];
  let produced = 0;
  /** 回傳 false = 已超出範圍，停止展開 */
  const consider = (t: number): boolean => {
    if (t < ev.start) return true;
    if (t > until || t > windowEnd) return false;
    produced++;
    if (!exset.has(t) && !skip.has(t) && t + dur >= windowStart) starts.push(t);
    return produced < count && starts.length < 1000;
  };

  if (freq === 'DAILY') {
    for (let i = 0; i < 5000; i += interval) if (!consider(hkDate(base.y, base.m, base.d + i, base.msOfDay))) break;
  } else if (freq === 'WEEKLY') {
    const wkst = Math.max(0, DAY_CODES.indexOf(rule.WKST || 'MO'));
    const pos = (dow: number) => (dow - wkst + 7) % 7;
    const byday = rule.BYDAY
      ? rule.BYDAY.split(',').map(s => DAY_CODES.indexOf(s.replace(/^[-+]?\d+/, ''))).filter(i => i >= 0).sort((a, b) => pos(a) - pos(b))
      : [base.dow];
    const weekStartOffset = -pos(base.dow); // 由 base 日期退到該週 WKST
    outer: for (let w = 0; w < 1000; w += interval) {
      for (const dow of byday) {
        const t = hkDate(base.y, base.m, base.d + weekStartOffset + w * 7 + pos(dow), base.msOfDay);
        if (!consider(t)) break outer;
      }
    }
  } else if (freq === 'MONTHLY') {
    for (let i = 0; i < 600; i += interval) {
      const t = hkDate(base.y, base.m + i, base.d, base.msOfDay);
      if (hkParts(t).d !== base.d) continue; // 該月無此日（例如 31 號）
      if (!consider(t)) break;
    }
  } else if (freq === 'YEARLY') {
    for (let i = 0; i < 60; i += interval) if (!consider(hkDate(base.y + i, base.m, base.d, base.msOfDay))) break;
  } else {
    consider(ev.start);
  }
  return starts;
}

/** 解析 + 展開至時間窗內嘅事件（已排序） */
export function parseIcsEvents(text: string, windowStart: number, windowEnd: number): IcsEvent[] {
  const raw = parseRaw(text);
  const overrides = new Map<string, Set<number>>();
  raw.forEach((e) => {
    if (typeof e.recurrenceId === 'number') {
      if (!overrides.has(e.uid)) overrides.set(e.uid, new Set());
      overrides.get(e.uid)!.add(e.recurrenceId);
    }
  });
  const out: IcsEvent[] = [];
  raw.forEach((e) => {
    if (e.cancelled) return;
    const dur = Math.max(0, e.end - e.start);
    if (e.rrule && typeof e.recurrenceId !== 'number') {
      expandRrule(e, windowStart, windowEnd, overrides.get(e.uid) || new Set()).forEach((s) => {
        out.push({ uid: e.uid, summary: e.summary, start: s, end: s + dur, allDay: e.allDay, location: e.location, description: e.description });
      });
      return;
    }
    if (e.end < windowStart || e.start > windowEnd) return;
    out.push({ uid: e.uid, summary: e.summary, start: e.start, end: e.end, allDay: e.allDay, location: e.location, description: e.description });
  });
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  return out;
}

/* ───────────── 香港時間格式工具（前後端共用） ───────────── */

export function hkYmd(t: number): string {
  const p = hkParts(t);
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}
export function hkHm(t: number): string {
  const p = hkParts(t);
  const h = Math.floor(p.msOfDay / 3600000), mi = Math.floor((p.msOfDay % 3600000) / 60000);
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
export function hkDow(t: number): string {
  return ['日', '一', '二', '三', '四', '五', '六'][hkParts(t).dow];
}
/** 今日（香港）00:00 嘅 epoch ms */
export function hkStartOfDay(t: number): number {
  const p = hkParts(t);
  return hkDate(p.y, p.m, p.d, 0);
}
/** 由 YYYY-MM-DD（香港）→ 00:00 epoch ms */
export function hkDayStart(ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) - HK_OFFSET_MS;
}
