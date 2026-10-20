/* 區總部月曆後台合約：node scripts/test-district-hq-gs.js （不需真 Teamup 憑據） */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../gs/Code.gs'), 'utf8');
const config = {
  TEAMUP_API_KEY: 'private-token',
  TEAMUP_CALENDAR_KEY: 'ksTestCalendar',
  TEAMUP_APPROVED_SUBCAL_ID: '304',
};
let requests = [], response = { events: [] };
const ctx = {
  console,
  Utilities: {
    formatDate: (date, timezone, format) => {
      assert.equal(timezone, 'Asia/Hong_Kong');
      assert.equal(format, 'yyyy-MM-dd');
      return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
    },
  },
  UrlFetchApp: {
    fetch: (url, options) => {
      requests.push({ url, options });
      return { getContentText: () => JSON.stringify(response) };
    },
  },
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });
// 用假 token 權限及 Config 取代 Sheet，測試真 route、真 Teamup URL、真匿名回傳。
ctx.getCards_ = token => token === 'allowed' ? { ok: true, data: [{ cardId: 'rooms' }] }
  : token === 'denied' ? { ok: true, data: [{ cardId: 'other' }] }
  : { ok: false, error: '登入已過期，請重新登入' };
ctx.getConfigValue_ = key => config[key] || '';
ctx.json = object => object;

let pass = 0;
function check(label, fn) {
  fn(); pass++;
  console.log('  ✓ ' + label);
}
function invoke(token = 'allowed', from = '2026-10-20', days = 31) {
  return ctx.doPost({ postData: { contents: JSON.stringify({ action: 'getDistrictHqBookings', token, from, days }) } });
}

check('route 先核對登入同 rooms 卡權限，拒絕時唔連 Teamup', () => {
  assert.equal(invoke('expired').ok, false);
  assert.equal(invoke('denied').ok, false);
  assert.equal(requests.length, 0);
});
check('不合法日期及超出上限（60 日）唔打 API', () => {
  for (const [date, days] of [['2026-02-30', 1], ['2026-10-20', 0], ['2026-10-20', 61], ['nonsense', 14]]) {
    assert.equal(invoke('allowed', date, days).ok, false);
  }
  assert.equal(requests.length, 0);
});
check('未設定紅色子日曆：明確回傳 configured=false，唔好誤當空置', () => {
  delete config.TEAMUP_APPROVED_SUBCAL_ID;
  const r = invoke();
  assert.equal(r.ok, true);
  assert.equal(r.data.configured, false);
  assert.equal(r.data.events.length, 0);
  assert.equal(requests.length, 0);
  config.TEAMUP_APPROVED_SUBCAL_ID = '304';
});
check('讀 Teamup 確認子日曆（包括人手事件），過濾其他子日曆/刪除事件，僅回傳匿名時段', () => {
  response = { events: [
    { id: 'manual', subcalendar_ids: [304], start_dt: '2026-10-20T09:30:00', end_dt: '2026-10-20T12:00:00+08:00',
      all_day: false, title: '某單位聯絡人 98765432', notes: '大門密碼 123456', who: '小明', email: 'secret@example.org' },
    { id: 'pending', subcalendar_ids: [303], start_dt: '2026-10-21T13:00:00+08:00', end_dt: '2026-10-21T15:00:00+08:00', title: '【申請】' },
    { id: 'multi', subcalendar_ids: [303, 304], start_dt: '2026-10-22T20:00:00+08:00', end_dt: '2026-10-22T21:00:00+08:00' },
    { id: 'deleted', subcalendar_ids: [304], start_dt: '2026-10-20T13:00:00+08:00', end_dt: '2026-10-20T15:00:00+08:00', delete_dt: '2026-10-19T00:00:00Z' },
    { id: 'all-day', subcalendar_ids: [304], start_dt: '2026-10-23', end_dt: '2026-10-23', all_day: true },
    { id: 'invalid', subcalendar_ids: [304], start_dt: 'oops', end_dt: 'oops' }, null,
  ] };
  const r = invoke();
  assert.equal(r.ok, true);
  assert.equal(r.data.configured, true);
  assert.equal(r.data.events.length, 3);
  assert.equal(r.data.events[0].start, Date.parse('2026-10-20T09:30:00+08:00'));
  assert.equal(r.data.events[0].end, Date.parse('2026-10-20T12:00:00+08:00'));
  assert.equal(r.data.events[2].end - r.data.events[2].start, 86400000);
  assert.ok(r.data.events.every(e => e.summary === '已確認借用'));
  assert.ok(r.data.events.every(e => Object.keys(e).sort().join(',') === 'allDay,end,start,summary,uid'));
  const serialized = JSON.stringify(r);
  for (const secret of ['98765432', '123456', 'secret@example.org', '某單位', 'manual', 'private-token']) {
    assert.equal(serialized.includes(secret), false, `不可以透露 ${secret}`);
  }
  const { url, options } = requests[0];
  assert.equal(url, 'https://api.teamup.com/ksTestCalendar/events?startDate=2026-10-20&endDate=2026-11-19&subcalendarId%5B%5D=304&tz=Asia%2FHong_Kong');
  assert.equal(options.headers['Teamup-Token'], 'private-token');
});
check('Teamup 請求失敗唔當作冇預約；亦可解析 Teamup Unix 秒數', () => {
  response = { error: 'unauthorized' };
  const bad = invoke();
  assert.equal(bad.ok, false);
  assert.ok(bad.error.includes('暫時無法讀取'));
  response = { events: [{ subcalendar_ids: [304], start_dt: 1792479600, end_dt: 1792483200, all_day: false }] };
  const good = invoke();
  assert.equal(good.ok, true);
  assert.equal(good.data.events[0].end - good.data.events[0].start, 3600000);
});

console.log(`\n全部通過（${pass} 項）✓`);
