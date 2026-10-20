import { hkHm, hkStartOfDay, hkYmd, type IcsEvent } from './ics.ts';
import { FLOORS } from './roomsDirectory.ts';

const DAY_MS = 86_400_000;
export const DISTRICT_HQ_LABEL = '區總部';
/** 查閱介面嘅樓層：區總部只係展示樓層，唔加入 Google ICS 房間清單。 */
export const USAGE_FLOORS = [...FLOORS, { id: 'hq', label: DISTRICT_HQ_LABEL }] as const;
export type UsageFloorId = (typeof USAGE_FLOORS)[number]['id'];

/** 跨日預約喺指定香港日期嘅顯示時間（午夜結束顯示 24:00）。 */
export function districtHqTimeOnDay(b: Pick<IcsEvent, 'start' | 'end' | 'allDay'>, dayStart: number): string {
  if (b.allDay) return '全日';
  return `${b.start < dayStart ? '00:00' : hkHm(b.start)}–${b.end >= dayStart + DAY_MS ? '24:00' : hkHm(b.end)}`;
}

/** 與地域房間日曆格仔共用嘅形狀；唔容許 Teamup 標題／備註流到介面。 */
export interface DistrictHqDayBooking {
  start: number;
  end: number;
  dayStart: number;
  dayEnd: number;
  roomId: typeof DISTRICT_HQ_LABEL;
  roomName: typeof DISTRICT_HQ_LABEL;
  floor: 'hq';
  via: typeof DISTRICT_HQ_LABEL;
  summary: '已確認借用';
  allDay: boolean;
}

/** 把區總部已確認時段疊加到香港時間月曆；跨日／跨月只顯示可見嗰幾日。 */
export function districtHqByDay(events: IcsEvent[], monthStart: number, days: number): Record<string, DistrictHqDayBooking[]> {
  const map: Record<string, DistrictHqDayBooking[]> = {};
  const monthEnd = monthStart + days * DAY_MS;
  const seen = new Set<string>();
  for (const b of events) {
    if (!Number.isFinite(b.start) || !Number.isFinite(b.end) || b.end <= b.start) continue;
    const key = `${b.uid}-${b.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (let d = hkStartOfDay(Math.max(b.start, monthStart)); d < Math.min(b.end, monthEnd); d += DAY_MS) {
      const ymd = hkYmd(d);
      (map[ymd] = map[ymd] || []).push({
        start: b.start, end: b.end, dayStart: d, dayEnd: d + DAY_MS,
        roomId: DISTRICT_HQ_LABEL, roomName: DISTRICT_HQ_LABEL,
        floor: 'hq', via: DISTRICT_HQ_LABEL, summary: '已確認借用', allDay: b.allDay,
      });
    }
  }
  Object.values(map).forEach(list => list.sort((a, b) => a.start - b.start || a.end - b.end));
  return map;
}
