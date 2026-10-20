import assert from 'node:assert/strict';
import { hkDayStart } from '../lib/ics.ts';
import { approvedTeamupSlots, memberTeamupLinkFromSource, teamupFeedUrl, teamupPublicKey, withinTeamupIcsWindow } from '../lib/teamupHqIcs.ts';

const key = 'ksabcdefghijklmnop'; // 虛構測試值；唔使用真實公開分享金鑰
const make = (...events: string[]) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Teamup Solutions AG//Teamup Calendar//EN',
  'X-PUBLISHED-TTL:PT15M', ...events, 'END:VCALENDAR',
].join('\r\n');
const block = (uid: string, category: string, start = '20261020T093000', end = '20261020T113000', extra: string[] = []) => [
  'BEGIN:VEVENT', `UID:${uid}`, `CATEGORIES:${category}`,
  'SUMMARY:私人姓名 98765432', 'DESCRIPTION:門鎖密碼 123456', 'LOCATION:私人地址',
  `DTSTART;TZID=Asia/Hong_Kong:${start}`, `DTEND;TZID=Asia/Hong_Kong:${end}`, ...extra, 'END:VEVENT',
].join('\r\n');
const from = hkDayStart('2026-10-20');
const simulatedNow = Date.parse('2026-10-20T12:00:00+08:00');
assert.equal(withinTeamupIcsWindow(from, 31, simulatedNow), true);
assert.equal(withinTeamupIcsWindow(hkDayStart('2026-01-01'), 31, simulatedNow), false, '舊於 ICS 歷史覆蓋範圍不可當空置');
assert.equal(withinTeamupIcsWindow(hkDayStart('2027-11-01'), 31, simulatedNow), false, '未來超出 ICS 範圍不可當空置');

assert.equal(memberTeamupLinkFromSource(`export const TEAMUP_OPEN_URL = 'https://teamup.com/${key}';`), `https://teamup.com/${key}`);
assert.equal(memberTeamupLinkFromSource(`export const TEAMUP_OPEN_URL = 'https://teamup.com.evil/${key}';`), null);
assert.equal(teamupPublicKey(`https://teamup.com/${key}?view=w`), key);
for (const malicious of [
  `http://teamup.com/${key}`, `https://teamup.com.evil.test/${key}`,
  `https://teamup.com@evil.test/${key}`, `https://teamup.com/${key}/events`,
  `https://teamup.com/${key}#other`, `https://ics.teamup.com/feed/${key}/0.ics`,
]) assert.equal(teamupPublicKey(malicious), null, '公開連結必須係 teamup.com/ks…');
assert.equal(teamupFeedUrl(key), `https://ics.teamup.com/feed/${key}/0.ics`);
assert.equal(teamupFeedUrl(key, '9876543'), `https://ics.teamup.com/feed/${key}/9876543.ics`);
assert.throws(() => teamupFeedUrl(key, '0'), /格式不正確/);
assert.throws(() => teamupFeedUrl(key, '2@evil.com'), /格式不正確/);

const source = make(
  block('TU-red-manual', '確認借用區總部'),
  block('TU-blue', '待審批區總部'),
  block('TU-other', '非確認借用區總部'),
  block('TU-folder', '區總部 > 確認借用區總部', '20261020T220000', '20261021T010000'),
  block('TU-cancelled', '確認借用區總部', '20261020T120000', '20261020T130000', ['STATUS:CANCELLED']),
);
const result = approvedTeamupSlots(source, from, 2);
assert.equal(result.length, 2, '包括直接在 Teamup 手動建的紅色事件及跨日，不包括藍色或取消事件');
assert.equal(result[0].start, Date.parse('2026-10-20T09:30:00+08:00'));
assert.equal(result[1].end, Date.parse('2026-10-21T01:00:00+08:00'));
for (const ev of result) {
  assert.deepEqual(Object.keys(ev).sort(), ['allDay', 'end', 'start', 'summary', 'uid']);
  assert.equal(ev.summary, '已確認借用');
  assert.match(ev.uid, /^hq-\d+$/);
}
for (const secret of ['98765432', '123456', '私人姓名', '私人地址', 'TU-red-manual', 'TU-blue']) {
  assert.equal(JSON.stringify(result).includes(secret), false, `不應輸出 ${secret}`);
}
assert.equal(approvedTeamupSlots(source, hkDayStart('2026-11-01'), 1).length, 0, '來源已確認時，該日期可以無預約');
assert.throws(() => approvedTeamupSlots(make(block('TU-blue', '待審批區總部')), from, 1), /未能確認紅色/);
assert.deepEqual(approvedTeamupSlots(make(), from, 1, '9876543'), [], '指定真實紅色 ID 時，即使 feed 為空亦可信');
assert.throws(() => approvedTeamupSlots('<html>permission denied</html>', from, 1, '9876543'), /格式不正確/);
assert.throws(() => approvedTeamupSlots(make(block('bad', '確認借用區總部', '20261020T093000', '20261020T113000', ['RDATE:20261021T093000'])), from, 2), /未支援/);
assert.throws(() => approvedTeamupSlots(make(block('bad', '確認借用區總部', '20261020T093000', '20261020T113000', ['RRULE:FREQ=MONTHLY;BYDAY=2TU'])), from, 2), /未支援/);
assert.throws(() => approvedTeamupSlots(make(block('bad', '確認借用區總部', 'BAD_DATE')), from, 2), /無法辨識/);
assert.throws(() => approvedTeamupSlots(make(block('bad', '確認借用區總部', '20261020T093000', 'BAD_DATE')), from, 2), /無法辨識/);
assert.throws(() => approvedTeamupSlots(make(block('bad', '確認借用區總部', '20261020T093000', '20261020T113000', ['DTEND;TZID=Europe/London:20261020T113000'])), from, 2), /時區不是香港/);

const recurrence = make(
  block('TU-repeat', '確認借用區總部', '20261019T090000', '20261019T100000', ['RRULE:FREQ=WEEKLY;COUNT=3;BYDAY=MO']),
  block('TU-repeat', '待審批區總部', '20261026T090000', '20261026T100000', ['RECURRENCE-ID;TZID=Asia/Hong_Kong:20261026T090000']),
);
const repeat = approvedTeamupSlots(recurrence, hkDayStart('2026-10-19'), 22);
assert.deepEqual(repeat.map(e => e.start), [
  Date.parse('2026-10-19T09:00:00+08:00'), Date.parse('2026-11-02T09:00:00+08:00'),
], '重複系列某一節改返藍色之後，紅色時段必須排除嗰節');
const noCategoryException = make(
  block('TU-inherit', '確認借用區總部', '20261019T090000', '20261019T100000', ['RRULE:FREQ=WEEKLY;COUNT=2;BYDAY=MO']),
  [
    'BEGIN:VEVENT', 'UID:TU-inherit', 'RECURRENCE-ID;TZID=Asia/Hong_Kong:20261026T090000',
    'DTSTART;TZID=Asia/Hong_Kong:20261026T110000', 'DTEND;TZID=Asia/Hong_Kong:20261026T120000', 'END:VEVENT',
  ].join('\r\n'),
);
assert.deepEqual(approvedTeamupSlots(noCategoryException, hkDayStart('2026-10-19'), 15).map(e => e.start), [
  Date.parse('2026-10-19T09:00:00+08:00'), Date.parse('2026-10-26T11:00:00+08:00'),
], '例外事件無 CATEGORIES 時繼承紅色系列，唔可漏掉已確認借用');
console.log('Teamup 公開 ICS：來源驗證、紅色篩選、手動／跨日／重複、匿名隱私及錯誤回退測試通過 ✓');
