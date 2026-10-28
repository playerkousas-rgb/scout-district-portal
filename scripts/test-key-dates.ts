/**
 * 📅 重要日期日期解析測試 — node --experimental-strip-types scripts/test-key-dates.ts
 * 用區方真實會議表做案例（9Nov2026、17-18Apr2027、2027…），確保「兩格就得」唔會解錯。
 */
import assert from 'node:assert';
import {
  parseKeyDateText, splitKeyDateEntries, parseSingleKeyDate, formatKeyDate,
  keyDateStatus, isUpcoming, keyDateSortKey, buildKeyDatesIcs, normalizeKeyDateText, daysBetween,
} from '../lib/keyDates.ts';

let pass = 0;
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); process.exitCode = 1; }
}

console.log('\n📅 日期解析');

check('9Nov2026 → 單日', () => {
  const r = parseKeyDateText('9Nov2026');
  assert.equal(r.length, 1);
  assert.equal(r[0].start, '2026-11-09');
  assert.equal(r[0].end, '2026-11-09');
  assert.equal(r[0].precision, 'day');
});

check('青少年委員會會議：一格三個日期 → 拆三項', () => {
  const r = parseKeyDateText('9Nov2026 2Mar2027 26Apr2027');
  assert.equal(r.length, 3);
  assert.deepEqual(r.map(x => x.start), ['2026-11-09', '2027-03-02', '2027-04-26']);
});

check('地域執委會會議：四個日期', () => {
  const r = parseKeyDateText('25Aug2026 24Nov2026 23Mar2027 25May2027');
  assert.deepEqual(r.map(x => x.start), ['2026-08-25', '2026-11-24', '2027-03-23', '2027-05-25']);
});

check('HKIR Retreat 17-18Apr2027 → 同月範圍', () => {
  const r = parseKeyDateText('17-18Apr2027');
  assert.equal(r.length, 1);
  assert.equal(r[0].start, '2027-04-17');
  assert.equal(r[0].end, '2027-04-18');
});

check('跨月範圍 28Dec2026-3Jan2027', () => {
  const r = parseKeyDateText('28Dec2026-3Jan2027');
  assert.equal(r.length, 1);
  assert.equal(r[0].start, '2026-12-28');
  assert.equal(r[0].end, '2027-01-03');
});

check('區大露營 2027 → 只有年份', () => {
  const r = parseKeyDateText('2027');
  assert.equal(r.length, 1);
  assert.equal(r[0].precision, 'year');
  assert.equal(r[0].start, '2027-01-01');
  assert.equal(r[0].end, '2027-12-31');
});

check('Apr2027 → 只有月份', () => {
  const r = parseKeyDateText('Apr2027');
  assert.equal(r[0].precision, 'month');
  assert.equal(r[0].start, '2027-04-01');
  assert.equal(r[0].end, '2027-04-30');
});

check('ISO 2026-11-09 同 香港式 9/11/2026 都收', () => {
  assert.equal(parseKeyDateText('2026-11-09')[0].start, '2026-11-09');
  assert.equal(parseKeyDateText('9/11/2026')[0].start, '2026-11-09');
});

check('中文 2026年11月9日', () => {
  assert.equal(parseKeyDateText('2026年11月9日')[0].start, '2026-11-09');
  assert.equal(parseKeyDateText('2027年4月')[0].precision, 'month');
});

check('全形數字同「至」字範圍', () => {
  const r = parseKeyDateText('１７至１８Apr2027');
  assert.equal(r.length, 1);
  assert.equal(r[0].start, '2027-04-17');
  assert.equal(r[0].end, '2027-04-18');
});

check('date input（type=date）值照收', () => {
  assert.equal(parseSingleKeyDate('2027-07-10').start, '2027-07-10');
});

check('31Feb2027 唔合法 → 當冇日期', () => {
  assert.deepEqual(parseKeyDateText('31Feb2027'), []);
});

check('純文字「待定」→ splitKeyDateEntries 保留原文', () => {
  const r = splitKeyDateEntries('待定');
  assert.equal(r.length, 1);
  assert.equal(r[0].precision, 'none');
  assert.equal(r[0].text, '待定');
  assert.equal(r[0].start, '');
});

check('空白 → 冇項目', () => {
  assert.deepEqual(splitKeyDateEntries('   '), []);
});

check('長數字串唔會砌出假年份', () => {
  assert.deepEqual(parseKeyDateText('20261109'), []);
});

check('normalize：逗號／波浪號／全形空格', () => {
  assert.equal(normalizeKeyDateText('9Nov2026，2Mar2027'), '9Nov2026 2Mar2027');
  assert.equal(normalizeKeyDateText('17～18Apr2027'), '17-18Apr2027');
});

console.log('\n🖥 顯示 / 排序 / 倒數');

check('formatKeyDate：單日帶星期', () => {
  assert.equal(formatKeyDate(parseSingleKeyDate('9Nov2026')), '2026-11-09（一）');
});

check('formatKeyDate：同月範圍縮寫尾日', () => {
  assert.equal(formatKeyDate(parseSingleKeyDate('17-18Apr2027')), '2027-04-17（六）– 18（日）');
});

check('formatKeyDate：年／月／純文字', () => {
  assert.equal(formatKeyDate(parseSingleKeyDate('2027')), '2027 年');
  assert.equal(formatKeyDate(parseSingleKeyDate('Apr2027')), '2027 年 4 月');
  assert.equal(formatKeyDate(parseSingleKeyDate('待定')), '待定');
});

check('排序：未定日期排最後', () => {
  const items = [parseSingleKeyDate('待定'), parseSingleKeyDate('9Nov2026'), parseSingleKeyDate('2Mar2027')];
  const sorted = items.slice().sort((a, b) => keyDateSortKey(a).localeCompare(keyDateSortKey(b)));
  assert.deepEqual(sorted.map(x => x.text), ['9Nov2026', '2Mar2027', '待定']);
});

check('倒數：今日／聽日／仲有 N 日／已過', () => {
  const today = '2026-11-01';
  assert.equal(keyDateStatus(parseSingleKeyDate('1Nov2026'), today).label, '今日');
  assert.equal(keyDateStatus(parseSingleKeyDate('2Nov2026'), today).label, '聽日');
  assert.equal(keyDateStatus(parseSingleKeyDate('9Nov2026'), today).label, '仲有 8 日');
  assert.equal(keyDateStatus(parseSingleKeyDate('31Oct2026'), today).tone, 'past');
  assert.equal(keyDateStatus(parseSingleKeyDate('待定'), today).tone, 'unknown');
});

check('倒數：範圍進行中', () => {
  const s = keyDateStatus(parseSingleKeyDate('17-18Apr2027'), '2027-04-17');
  assert.equal(s.label, '進行中');
});

check('isUpcoming：已過隱藏、未定日期保留', () => {
  assert.equal(isUpcoming(parseSingleKeyDate('9Nov2026'), '2026-11-01'), true);
  assert.equal(isUpcoming(parseSingleKeyDate('9Nov2026'), '2026-11-10'), false);
  assert.equal(isUpcoming(parseSingleKeyDate('17-18Apr2027'), '2027-04-18'), true);
  assert.equal(isUpcoming(parseSingleKeyDate('待定'), '2030-01-01'), true);
});

check('daysBetween', () => {
  assert.equal(daysBetween('2026-11-01', '2026-11-09'), 8);
  assert.equal(daysBetween('壞', '2026-11-09'), null);
});

console.log('\n📤 .ics 匯出');

check('buildKeyDatesIcs：全日事件、DTEND 為尾日翌日', () => {
  const ics = buildKeyDatesIcs([{ id: 'kd1', title: 'HKIR Retreat', start: '2027-04-17', end: '2027-04-18' }]);
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270417'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20270419'));
  assert.ok(ics.includes('SUMMARY:HKIR Retreat'));
});

check('buildKeyDatesIcs：冇日期嘅唔會寫入', () => {
  const ics = buildKeyDatesIcs([{ title: '待定活動', start: '' }]);
  assert.ok(!ics.includes('BEGIN:VEVENT'));
});

check('buildKeyDatesIcs：特殊字元 escape', () => {
  const ics = buildKeyDatesIcs([{ title: '會議; 地點, 1802', start: '2026-11-09' }]);
  assert.ok(ics.includes('SUMMARY:會議\\; 地點\\, 1802'));
});

console.log(`\n✅ ${pass} 項通過\n`);
