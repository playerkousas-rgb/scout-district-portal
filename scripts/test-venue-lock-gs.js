/*
 * TTLock / Sciener 一鍵批准安全測試。
 *   node scripts/test-venue-lock-gs.js
 *
 * 確保「⚡ 一鍵批准」只會在真實電子鎖成功寫入密碼後才轉 Teamup、寄密碼及標記 approved。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs'), 'utf8');

function makeSheet(rows) {
  const data = rows.map(row => row.slice());
  return {
    getLastRow: () => data.length,
    getLastColumn: () => data[0] ? data[0].length : 0,
    getDataRange: () => ({ getValues: () => data.map(row => row.slice()) }),
    getRange(row, col, rowsCount = 1, colsCount = 1) {
      return {
        getValue: () => (data[row - 1] || [])[col - 1],
        getValues: () => data.slice(row - 1, row - 1 + rowsCount)
          .map(r => r.slice(col - 1, col - 1 + colsCount)),
        setValue: value => { data[row - 1][col - 1] = value; },
        setValues: values => values.forEach((r, y) => r.forEach((value, x) => { data[row - 1 + y][col - 1 + x] = value; })),
      };
    },
    _data: data,
  };
}

const venueHeaders = [
  'id', 'districtCode', 'refCode', 'submittedAt', 'venueId', 'venueName', 'purpose',
  'startDate', 'endDate', 'name', 'phone', 'email', 'troop', 'position', 'agreeRules',
  'status', 'teamupEventId', 'pwdRef', 'passcode', 'reviewer', 'reviewedAt', 'createdAt',
];
const sheets = {
  VenueBookings: makeSheet([
    venueHeaders,
    ['vb-1', 'SKW', 'VR-TEST', '', 'skw-hq', '筲箕灣區總部', '測試',
      '2026-10-20T10:00', '2026-10-20T12:00', '陳大文', '91234567', 'applicant@example.test', '', '', 'TRUE',
      'pending', 'pending-event', '', '', '', '', ''],
  ]),
  Venues: makeSheet([
    ['venueId', 'districtCode', 'name', 'location', 'capacity', 'scienerLockId', 'note', 'active'],
    ['skw-hq', 'SKW', '筲箕灣區總部', '', '', '', '', 'TRUE'],
  ]),
};

const context = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({ getSheetByName: name => sheets[name] || null }),
  },
  // 只為載入整份 Code.gs 所需；本測試不會觸發這些服務。
  Utilities: { DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' }, Charset: { UTF_8: 'utf8' } },
  ContentService: { createTextOutput: text => ({ setMimeType: () => text }), MimeType: { JSON: 'json' } },
  MailApp: { sendEmail: () => {} },
  UrlFetchApp: { fetch: () => { throw new Error('測試不應直接呼叫外網'); } },
  Session: { getScriptTimeZone: () => 'Asia/Hong_Kong' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
};
vm.createContext(context);
vm.runInContext(code, context, { filename: 'Code.gs' });

// 把外部副作用換成可驗證的 stub；目標是驗證 approveVenueBooking_ 的流程次序。
context.requirePerm_ = () => ({ email: 'dc@example.test' });
let teamupCalls = 0;
let mailCalls = 0;
context.applyTeamupApproved_ = () => { teamupCalls++; return { eventId: 'approved-event', warn: '' }; };
context.sendVenueApprovalEmail_ = () => { mailCalls++; };
context.updateRecordStatus_ = () => {};

const row = () => {
  const header = sheets.VenueBookings._data[0];
  const values = sheets.VenueBookings._data[1];
  return Object.fromEntries(header.map((name, index) => [name, values[index]]));
};

let passed = 0;
function check(label, test) {
  test();
  passed++;
  console.log('  ✓ ' + label);
}

console.log('TTLock / Sciener 一鍵批准安全測試');

check('鎖 API 失敗：保持 pending，不轉 Teamup、不寄密碼、不寫假密碼', () => {
  context.createTtlockPasscode_ = () => { throw new Error('gateway offline'); };
  const result = context.approveVenueBooking_('token', 'vb-1');
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /未能寫入電子鎖/);
  assert.strictEqual(row().status, 'pending');
  assert.strictEqual(row().passcode, '');
  assert.strictEqual(teamupCalls, 0);
  assert.strictEqual(mailCalls, 0);
});

check('模擬模式：保持 pending，不轉 Teamup、不寄密碼', () => {
  context.createTtlockPasscode_ = () => ({ passcode: '123456', simulated: true });
  const result = context.approveVenueBooking_('token', 'vb-1');
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /模擬模式/);
  assert.strictEqual(row().status, 'pending');
  assert.strictEqual(row().passcode, '');
  assert.strictEqual(teamupCalls, 0);
  assert.strictEqual(mailCalls, 0);
});

check('缺少申請人電郵：不寫鎖，保持 pending', () => {
  const emailColumn = sheets.VenueBookings._data[0].indexOf('email');
  sheets.VenueBookings._data[1][emailColumn] = '';
  let lockCalls = 0;
  context.createTtlockPasscode_ = () => { lockCalls++; return { passcode: '654321', simulated: false }; };
  const result = context.approveVenueBooking_('token', 'vb-1');
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /未有電郵/);
  assert.strictEqual(lockCalls, 0);
  assert.strictEqual(row().status, 'pending');
  assert.strictEqual(teamupCalls, 0);
  assert.strictEqual(mailCalls, 0);
  sheets.VenueBookings._data[1][emailColumn] = 'applicant@example.test';
});

check('真鎖成功：才轉 Teamup、寄密碼及完成批准', () => {
  context.createTtlockPasscode_ = () => ({ passcode: '654321', pwdRef: 'slot-103', simulated: false });
  const result = context.approveVenueBooking_('token', 'vb-1');
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  assert.strictEqual(row().status, 'approved');
  assert.strictEqual(row().passcode, '654321');
  assert.strictEqual(row().pwdRef, 'slot-103');
  // 已有 pending Teamup event 時，移動後仍沿用原 event ID。
  assert.strictEqual(row().teamupEventId, 'pending-event');
  assert.strictEqual(row().reviewer, 'dc@example.test');
  assert.ok(row().reviewedAt);
  assert.strictEqual(teamupCalls, 1);
  assert.strictEqual(mailCalls, 1);
});

console.log(`\n${passed} 項測試全部通過。`);
