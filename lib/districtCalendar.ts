import type { DistrictEvent } from './types';

export function isoLocalDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function eventOccursOn(event: Pick<DistrictEvent, 'startDate' | 'endDate'>, day: string): boolean {
  return event.startDate <= day && (event.endDate || event.startDate) >= day;
}

export function monthGridDays(year: number, monthIndex: number): string[] {
  const first = new Date(year, monthIndex, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const start = new Date(year, monthIndex, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => isoLocalDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}

function escapeIcs(text: string): string {
  return String(text || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function foldIcsLine(line: string): string {
  const chunks: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75 && current) {
      chunks.push(current); current = ' '; bytes = 1;
    }
    current += char; bytes += size;
  }
  chunks.push(current);
  return chunks.join('\r\n');
}

function compactDate(iso: string): string { return iso.replace(/-/g, '');}
function compactHkDateTime(iso: string, time: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
  return `${utc.getUTCFullYear()}${String(utc.getUTCMonth() + 1).padStart(2, '0')}${String(utc.getUTCDate()).padStart(2, '0')}T${String(utc.getUTCHours()).padStart(2, '0')}${String(utc.getUTCMinutes()).padStart(2, '0')}00Z`;
}

/** Export a portable RFC 5545 calendar. Hong Kong has no daylight-saving time (UTC+8). */
export function buildDistrictEventsIcs(events: DistrictEvent[], name = '區會行事曆'): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Scout District Portal//District Calendar//ZH-HK',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeIcs(name)}`,
  ];
  events.forEach((event, index) => {
    lines.push('BEGIN:VEVENT', `UID:${escapeIcs(event.id || `district-event-${index}`)}@scout-district-portal`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `SUMMARY:${escapeIcs(event.title)}`);
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(event.startDate)}`,
        `DTEND;VALUE=DATE:${compactDate(addIsoDays(event.endDate || event.startDate, 1))}`);
    } else {
      lines.push(`DTSTART:${compactHkDateTime(event.startDate, event.startTime || '00:00')}`,
        `DTEND:${compactHkDateTime(event.endDate || event.startDate, event.endTime || event.startTime || '00:00')}`);
    }
    if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
    if (event.category) lines.push(`CATEGORIES:${escapeIcs(event.category)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

export function formatEventDateRange(event: Pick<DistrictEvent, 'startDate' | 'endDate' | 'startTime' | 'endTime' | 'allDay'>): string {
  const dateFmt = (iso: string) => new Intl.DateTimeFormat('zh-HK', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${iso}T12:00:00+08:00`));
  const start = dateFmt(event.startDate);
  const endDate = event.endDate || event.startDate;
  const range = endDate === event.startDate ? start : `${start} 至 ${dateFmt(endDate)}`;
  if (event.allDay) return `${range} · 全日`;
  const startTime = event.startTime || '';
  const endTime = event.endTime || '';
  return `${range}${startTime ? ` · ${startTime}${endTime ? `–${endTime}` : ''}` : ''}`;
}
