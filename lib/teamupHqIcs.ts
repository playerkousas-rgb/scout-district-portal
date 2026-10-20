import { hkStartOfDay, parseIcsEvents, parseIcsDate, unfoldIcs, type IcsEvent } from './ics.ts';

/** Teamup 的公開分享連結只提供用戶身份；不可當成 JSON API 的 Teamup-Token。 */
export const HQ_APPROVED_CATEGORY = '確認借用區總部';
export const HQ_ICS_HOST = 'ics.teamup.com';
/** SKW 現有 Config 的公開子日曆編號（用戶核對 2026-10-20）；不是 API Token 或分享連結。 */
export const SKW_APPROVED_SUBCAL_ID = '11188257';

/** 從成員系統固定公開元件的備用常量讀連結，不抄寫 ks 分享金鑰進本倉庫。 */
export function memberTeamupLinkFromSource(source: string): string | null {
  return /^export const TEAMUP_OPEN_URL\s*=\s*['"](https:\/\/teamup\.com\/ks[a-z0-9]{16})['"];?\s*$/im.exec(source)?.[1] || null;
}

/** Teamup 對外 ICS 僅含過去 6 個月／未來 12 個月；留安全邊界，範圍以外不能聲稱空置。 */
export function withinTeamupIcsWindow(from: number, days: number, now: number): boolean {
  const day = 86_400_000;
  const today = hkStartOfDay(now);
  return Number.isFinite(from) && Number.isInteger(days) && days > 0 &&
    from >= today - 170 * day && from + days * day <= today + 350 * day;
}

/** 僅接受公開 teamup.com/ks… 連結，絕不能由用戶輸入任意上游網址。 */
export function teamupPublicKey(link: string): string | null {
  try {
    const u = new URL(link.trim());
    if (u.protocol !== 'https:' || u.hostname !== 'teamup.com' || u.port || u.username || u.password || u.hash) return null;
    const m = /^\/(ks[a-z0-9]{16})\/?$/i.exec(u.pathname);
    return m ? m[1] : null;
  } catch { return null; }
}

/** Teamup 官方提供的唯讀 iCalendar feed；0 = 公開連結內所有子日曆。 */
export function teamupFeedUrl(key: string, approvedSubId?: string): string {
  if (!/^ks[a-z0-9]{16}$/i.test(key) || (approvedSubId && !/^[1-9]\d{0,14}$/.test(approvedSubId))) {
    throw new Error('Teamup 公開日曆或紅色子日曆 ID 格式不正確');
  }
  return `https://${HQ_ICS_HOST}/feed/${key}/${approvedSubId || '0'}.ics`;
}

function unescapeIcsText(s: string): string {
  return s.replace(/\\([\\,;])/g, '$1').trim();
}

/** CATEGORIES 可以有多個值、亦可以是「上層 > 確認借用區總部」；不依賴顏色或活動標題。 */
function approvedCategory(lines: string[]): boolean {
  return lines.some((line) => {
    if (!/^CATEGORIES(?:;[^:]*)?:/i.test(line)) return false;
    const value = line.slice(line.indexOf(':') + 1);
    // 逗號可以是 ICS 轉義文字，不能直接用 String.split(',')。
    const categories = value.split(/(?<!\\),/).map(unescapeIcsText);
    return categories.some(c => c.split(/\s*>\s*/).at(-1)?.trim() === HQ_APPROVED_CATEGORY);
  });
}

interface EventBlock { lines: string[]; uid: string; approved: boolean; hasCategories: boolean; override: boolean }
function blocksFromIcs(text: string): EventBlock[] {
  // 唔可以將 403/404 網頁或空文件誤當成「冇借用」。
  if (!/^BEGIN:VCALENDAR(?:\r?\n)/.test(text) || !/\r?\nEND:VCALENDAR\s*$/.test(text) ||
      !/^PRODID:-\/\/Teamup Solutions AG\/\/Teamup Calendar\/\/EN\s*$/m.test(text)) {
    throw new Error('Teamup iCalendar 回應格式不正確');
  }
  const blocks: EventBlock[] = [];
  let cur: string[] | null = null;
  for (const line of unfoldIcs(text)) {
    if (line === 'BEGIN:VEVENT') { cur = [line]; continue; }
    if (!cur) continue;
    cur.push(line);
    if (line === 'END:VEVENT') {
      const uid = cur.find(x => x.startsWith('UID:'))?.slice(4).trim() || '';
      blocks.push({
        lines: cur, uid, approved: approvedCategory(cur),
        hasCategories: cur.some(x => /^CATEGORIES(?:;[^:]*)?:/i.test(x)),
        override: cur.some(x => /^RECURRENCE-ID(?:;[^:]*)?:/i.test(x)),
      });
      cur = null;
    }
  }
  if (cur) throw new Error('Teamup iCalendar 事件未完成');
  return blocks;
}

/**
 * 4.18.0 無讀取 Teamup 的後台 action。Vercel 可以用成員系統已公開的分享連結，
 * 優先讀指定紅色子日曆的 ICS；未提供 ID 時讀公開 combined feed，只選 CATEGORIES 精確吻合紅色的事件。
 * 如 feed 無紅色事件，指定 ID 時仍要由 Teamup 日曆名稱確認係紅色子日曆；否則報錯，不能當空置。
 * 回傳只含匿名時間，絕不傳出事件標題、聯絡人、備註或原始 UID。
 */
export function approvedTeamupSlots(text: string, from: number, days: number, approvedSubId?: string): IcsEvent[] {
  if (!Number.isFinite(from) || !Number.isInteger(days) || days < 1 || days > 60) throw new Error('日曆查詢範圍不正確');
  const blocks = blocksFromIcs(text);
  // 指定 ID 時核對 Teamup ICS 子日曆名稱；有事件時亦要有紅色類別，防止用錯藍色 ID 而報「未見借用」。
  const namedRed = unfoldIcs(text).some(line => /^X-WR-CALNAME:/i.test(line) &&
    line.slice(line.indexOf(':') + 1).replace(/\\\|/g, '|').split('|').at(-1)?.trim() === HQ_APPROVED_CATEGORY);
  if ((approvedSubId && (!namedRed || (blocks.length > 0 && !blocks.some(b => b.approved)))) ||
      (!approvedSubId && !blocks.some(b => b.approved))) {
    throw new Error('公開日曆未能確認紅色「確認借用區總部」子日曆；請核對現有子日曆 ID');
  }
  const redRecurringUids = new Set(blocks.filter(b => b.approved && !b.override).map(b => b.uid));
  const chosen: string[] = [];
  for (const b of blocks) {
    const inheritedRed = b.override && !b.hasCategories && redRecurringUids.has(b.uid);
    if (!b.approved && !inheritedRed) {
      // 某次重複事件明確轉往其他子日曆：須排除該次，否則主事件仍會展開成「已確認」。
      if (b.override && redRecurringUids.has(b.uid)) {
        const rec = b.lines.find(x => /^RECURRENCE-ID(?:;[^:]*)?:/i.test(x));
        const start = b.lines.find(x => /^DTSTART(?:;[^:]*)?:/i.test(x));
        if (!rec || !start) throw new Error('Teamup iCalendar 有無法辨識的重複事件例外');
        for (const line of [rec, start]) {
          const tz = /(?:^|;)TZID=([^;:]+)/i.exec(line)?.[1]?.replace(/^"|"$/g, '');
          if (tz && tz !== 'Asia/Hong_Kong') throw new Error('Teamup iCalendar 時區不是香港，暫不能可靠顯示時段');
          if (!parseIcsDate(line.slice(line.indexOf(':') + 1), {})) {
            throw new Error('Teamup iCalendar 有無法辨識的重複事件例外');
          }
        }
        chosen.push(`BEGIN:VEVENT\nUID:${b.uid}\n${rec}\n${start}\nSTATUS:CANCELLED\nEND:VEVENT`);
      }
      continue;
    }
    if (!b.uid) throw new Error('Teamup iCalendar 事件沒有識別碼，暫不能可靠顯示時段');
    // 既有房間 parser 以香港時間讀 TZID；如遇非香港時區／未實作的重複規則，不可默默漏報。
    for (const line of b.lines) {
      if (/^(?:DTSTART|DTEND|EXDATE|RECURRENCE-ID);/i.test(line)) {
        const tz = /(?:^|;)TZID=([^;:]+)/i.exec(line)?.[1]?.replace(/^"|"$/g, '');
        if (tz && tz !== 'Asia/Hong_Kong') throw new Error('Teamup iCalendar 時區不是香港，暫不能可靠顯示時段');
      }
      if (/^(?:RDATE|EXRULE)(?:;|:)/i.test(line)) throw new Error('Teamup iCalendar 有未支援的重複時段規則');
      if (/^RRULE:/i.test(line)) {
        const r = line.slice(6).toUpperCase();
        const freq = /(?:^|;)FREQ=([A-Z]+)/.exec(r)?.[1];
        const names = r.split(';').map(p => p.split('=')[0]);
        if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq) ||
            names.some(n => !['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'WKST'].includes(n)) ||
            ((freq === 'DAILY' || freq === 'YEARLY') && names.includes('BYDAY')) ||
            (freq === 'MONTHLY' && names.includes('BYDAY') &&
              !/(?:^|;)BYDAY=[+-]?[1-5](?:SU|MO|TU|WE|TH|FR|SA)(?:,[+-]?[1-5](?:SU|MO|TU|WE|TH|FR|SA))*(?:;|$)/.test(r)) ||
            (freq === 'WEEKLY' && /(?:^|;)BYDAY=[^;]*\d/i.test(r))) {
          throw new Error('Teamup iCalendar 有未支援的重複時段規則');
        }
      }
    }
    const dtstart = b.lines.find(x => /^DTSTART(?:;[^:]*)?:/i.test(x));
    const dtend = b.lines.find(x => /^DTEND(?:;[^:]*)?:/i.test(x));
    const recurrence = b.lines.find(x => /^RECURRENCE-ID(?:;[^:]*)?:/i.test(x));
    const duration = b.lines.find(x => /^DURATION:/i.test(x));
    const date = (line?: string) => line && parseIcsDate(line.slice(line.indexOf(':') + 1), {
      VALUE: /;VALUE=DATE(?:;|:)/i.test(line) ? 'DATE' : '',
    });
    if (!date(dtstart) || (dtend ? !date(dtend) : !duration) || (recurrence && !date(recurrence)) ||
        (duration && !/^DURATION:P(?:(?:\d+)W)?(?:(?:\d+)D)?(?:T(?:(?:\d+)H)?(?:(?:\d+)M)?(?:(?:\d+)S)?)?$/.test(duration))) {
      throw new Error('Teamup iCalendar 有無法辨識的借用日期');
    }
    chosen.push(b.lines.join('\n'));
  }
  const parsed = parseIcsEvents(`BEGIN:VCALENDAR\n${chosen.join('\n')}\nEND:VCALENDAR`, from, from + days * 86_400_000);
  const seen = new Set<string>();
  const slots: IcsEvent[] = [];
  for (const b of parsed) {
    if (!Number.isFinite(b.start) || !Number.isFinite(b.end) || b.end <= b.start || b.start >= from + days * 86_400_000 || b.end <= from) continue;
    const unique = `${b.uid}:${b.start}`;
    if (seen.has(unique)) continue;
    seen.add(unique);
    slots.push({ uid: `hq-${slots.length + 1}`, summary: '已確認借用', start: b.start, end: b.end, allDay: b.allDay });
  }
  return slots;
}
