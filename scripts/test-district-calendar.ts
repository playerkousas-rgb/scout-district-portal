import assert from 'node:assert/strict';
import { addIsoDays, buildDistrictEventsIcs, eventOccursOn, monthGridDays } from '../lib/districtCalendar.ts';
import type { DistrictEvent } from '../lib/types.ts';

const april = monthGridDays(2027, 3);
assert.equal(april.length, 42);
assert.equal(april[0], '2027-03-29', '月曆由星期一開始，4 月前補齊 3 月日期');
assert.equal(april[april.length - 1], '2027-05-09');
assert.equal(addIsoDays('2027-04-30', 1), '2027-05-01', '跨月及月底加日');

const allDay: DistrictEvent = {
  id: 'event-all-day', title: '區會露營, 春季', startDate: '2027-04-30', endDate: '2027-05-01',
  allDay: true, location: '大潭; 香港', description: '集合\\解散\n備註', category: '露營',
};
assert.equal(eventOccursOn(allDay, '2027-04-30'), true);
assert.equal(eventOccursOn(allDay, '2027-05-01'), true);
assert.equal(eventOccursOn(allDay, '2027-05-02'), false);
const allDayIcs = buildDistrictEventsIcs([allDay]);
assert.match(allDayIcs, /DTSTART;VALUE=DATE:20270430/);
assert.match(allDayIcs, /DTEND;VALUE=DATE:20270502/, 'ICS 全日事件的結束日採 exclusive');
assert.match(allDayIcs, /SUMMARY:區會露營\\, 春季/);
assert.match(allDayIcs, /LOCATION:大潭\\; 香港/);
assert.match(allDayIcs, /DESCRIPTION:集合\\\\解散\\n備註/);

const timed: DistrictEvent = {
  id: 'event-timed', title: '星期六會議', startDate: '2027-04-17', endDate: '2027-04-17',
  startTime: '19:00', endTime: '20:30', allDay: false,
};
const timedIcs = buildDistrictEventsIcs([timed]);
assert.match(timedIcs, /DTSTART:20270417T110000Z/, '香港 19:00 轉成 UTC 11:00');
assert.match(timedIcs, /DTEND:20270417T123000Z/);
assert.match(timedIcs, /BEGIN:VCALENDAR[\s\S]*END:VCALENDAR/);
assert.ok(timedIcs.endsWith('\r\n'), 'RFC 5545 行尾使用 CRLF');
const longIcs = buildDistrictEventsIcs([{ ...timed, description: '童軍'.repeat(80) }]);
for (const line of longIcs.split('\r\n').filter(Boolean)) {
  assert.ok(new TextEncoder().encode(line).length <= 75, 'ICS 每行不超過 75 octets');
  if (line.startsWith(' ')) assert.ok(line.length > 1, 'fold continuation line begins with one space');
}
console.log('district calendar utility checks passed (ICS folding + 12 assertions)');
