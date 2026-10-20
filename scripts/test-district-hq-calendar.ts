/** 香港時間區總部月曆拆日／跨月／隱私回歸：node --experimental-strip-types scripts/test-district-hq-calendar.ts */
import assert from 'node:assert/strict';
import { districtHqByDay, districtHqTimeOnDay, USAGE_FLOORS } from '../lib/districtHqCalendar.ts';
import { ROOMS } from '../lib/roomsDirectory.ts';
import type { IcsEvent } from '../lib/ics.ts';

const epoch = (s: string) => Date.parse(`${s}+08:00`);
const mk = (uid: string, start: string, end: string): IcsEvent => ({
  uid, start: epoch(start), end: epoch(end), allDay: false,
  summary: '私人姓名 98765432', description: '門鎖密碼 123456', location: '測試私密地點',
});
const events = [
  mk('previous-month', '2026-09-30T23:30:00', '2026-10-01T02:00:00'),
  mk('midnight', '2026-10-01T22:00:00', '2026-10-02T00:00:00'),
  mk('next-month', '2026-10-31T23:00:00', '2026-11-01T02:00:00'),
  mk('next-month', '2026-10-31T23:00:00', '2026-11-01T02:00:00'), // 同 uid+start 去重
  mk('invalid', '2026-10-10T12:00:00', '2026-10-10T11:00:00'),
];
assert.deepEqual(USAGE_FLOORS.map(f => f.id), ['17', '18', '19', 'hq'], '區總部與地域樓層同一清單');
assert.ok(!ROOMS.some(r => r.id === 'hq'), '區總部唔應當成 Google ICS 房間讀取');
assert.equal(districtHqTimeOnDay(events[0], epoch('2026-09-30T00:00:00')), '23:30–24:00');
assert.equal(districtHqTimeOnDay(events[0], epoch('2026-10-01T00:00:00')), '00:00–02:00');
assert.equal(districtHqTimeOnDay(events[1], epoch('2026-10-01T00:00:00')), '22:00–24:00');
assert.equal(districtHqTimeOnDay({ ...events[0], allDay: true }, epoch('2026-09-30T00:00:00')), '全日');
const october = districtHqByDay(events, epoch('2026-10-01T00:00:00'), 31);
assert.deepEqual(Object.keys(october).sort(), ['2026-10-01', '2026-10-31']);
assert.equal(october['2026-10-01'].length, 2);
assert.equal(october['2026-10-31'].length, 1);
assert.equal(october['2026-10-01'][0].floor, 'hq');
assert.equal(october['2026-10-01'][0].summary, '已確認借用');
const serialized = JSON.stringify(october);
for (const secret of ['98765432', '123456', '私人姓名', '測試私密地點']) {
  assert.equal(serialized.includes(secret), false, `唔可以透露 ${secret}`);
}
const november = districtHqByDay(events, epoch('2026-11-01T00:00:00'), 30);
assert.deepEqual(Object.keys(november), ['2026-11-01']);
assert.equal(november['2026-11-01'].length, 1);
console.log('區總部月曆香港時間／去重／隱私測試通過 ✓');
