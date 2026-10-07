/*
 * TTLock 預置限時密碼格重用測試。
 *   node scripts/test-ttlock-slots-gs.js
 *
 * 驗證只會重用 Config 白名單中已過期的「限時N」格，絕不呼叫 add、
 * 不會改有效中／未來排期／非白名單格。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs'), 'utf8');

function makeSheet(rows) {
  const data = rows.map(row => row.slice());
  return {
    getDataRange: () => ({ getValues: () => data.map(row => row.slice()) }),
    getLastRow: () => data.length,
    getLastColumn: () => data[0] ? data[0].length : 0,
    getRange: () => ({ getValues: () => [] }),
  };
}

const sheets = {
  VenueBookings: makeSheet([
    ['id', 'passcode'],
    ['old-booking', '654321'],
  ]),
};
const lock = { held: false, released: 0 };
let currentSlots = [];
let fetches = [];

const context = {
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => sheets[name] || null }) },
  LockService: {
    getScriptLock: () => ({
      tryLock: () => { if (lock.held) return false; lock.held = true; return true; },
      releaseLock: () => { lock.held = false; lock.released++; },
    }),
  },
  Utilities: { DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' }, Charset: { UTF_8: 'utf8' } },
  ContentService: { createTextOutput: text => ({ setMimeType: () => text }), MimeType: { JSON: 'json' } },
  MailApp: { sendEmail: () => {} },
  UrlFetchApp: {
    fetch: (url, options) => {
      fetches.push({ url, options });
      if (/\/lock\/listKeyboardPwd$/.test(url)) return { getContentText: () => JSON.stringify({ list: currentSlots }) };
      if (/\/keyboardPwd\/change$/.test(url)) return { getContentText: () => JSON.stringify({ errcode: 0, errmsg: 'ok' }) };
      throw new Error('不應呼叫的 TTLock endpoint: ' + url);
    },
  },
  Session: { getScriptTimeZone: () => 'Asia/Hong_Kong' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
};
vm.createContext(context);
vm.runInContext(code, context, { filename: 'Code.gs' });

// 所有網絡認證在這裡替身，讓測試只驗證選格和 change 請求內容。
context.ttlockDisabled_ = () => false;
context.ttlockToken_ = () => 'test-access-token';
context.ttlockBase_ = () => 'https://api.sciener.test';
context.lockCfg_ = () => ({ clientId: 'client-id', lockId: '987654', pwdMode: 'random' });
context.getConfigValue_ = key => key === 'SCIENER_SLOT_NAMES' ? '限時2,限時3,限時12' : '';

const now = Date.now();
function ttSlot(id, name, startAt, endAt, password) {
  return { keyboardPwdId: id, keyboardPwdName: name, startDate: startAt, endDate: endAt, keyboardPwd: password };
}

let passed = 0;
function check(label, test) {
  test();
  passed++;
  console.log('  ✓ ' + label);
}

console.log('TTLock 預置限時密碼格重用測試');

check('只選白名單且已過期的格，不碰有效中、未來或非白名單格', () => {
  const slots = [
    { id: '1', name: '限時2', startAt: now - 7200000, endAt: now + 7200000 }, // 有效中
    { id: '2', name: '限時3', startAt: now + 7200000, endAt: now + 10800000 }, // 未來
    { id: '3', name: '限時12', startAt: now - 10800000, endAt: now - 1800000 }, // 已過期
    { id: '4', name: '限時1', startAt: now - 10800000, endAt: now - 7200000 }, // 非白名單
  ];
  const chosen = context.findReusableTtlockSlot_(slots, now);
  assert.strictEqual(chosen.id, '3');
  assert.strictEqual(chosen.name, '限時12');
});

check('只經 Gateway change 已過期格；不呼叫 add 並保留格名稱', () => {
  currentSlots = [
    ttSlot(101, '限時2', now - 7200000, now + 7200000, '111111'),
    ttSlot(102, '限時3', now + 7200000, now + 10800000, '222222'),
    ttSlot(103, '限時12', now - 10800000, now - 1800000, '333333'),
    ttSlot(104, '限時1', now - 10800000, now - 7200000, '444444'),
  ];
  fetches = [];
  const start = new Date(now + 86400000).toISOString();
  const end = new Date(now + 90000000).toISOString();
  const result = context.createTtlockPasscode_('91234567', start, end, '申請人', '');
  assert.strictEqual(result.pwdRef, '103');
  assert.strictEqual(result.slotName, '限時12');
  assert.match(result.passcode, /^\d{6}$/);
  assert.notStrictEqual(result.passcode, '111111');
  assert.notStrictEqual(result.passcode, '222222');
  assert.notStrictEqual(result.passcode, '333333');
  assert.notStrictEqual(result.passcode, '444444');
  assert.strictEqual(fetches.filter(x => /\/keyboardPwd\/add$/.test(x.url)).length, 0);
  const change = fetches.filter(x => /\/keyboardPwd\/change$/.test(x.url));
  assert.strictEqual(change.length, 1);
  assert.strictEqual(change[0].options.payload.keyboardPwdId, '103');
  assert.strictEqual(change[0].options.payload.keyboardPwdName, '限時12');
  assert.strictEqual(change[0].options.payload.changeType, '2');
  assert.strictEqual(lock.held, false);
});

check('白名單全部仍有效或未來排期時，拒絕批准而不改任何密碼格', () => {
  currentSlots = [
    ttSlot(101, '限時2', now - 7200000, now + 7200000, '111111'),
    ttSlot(102, '限時3', now + 7200000, now + 10800000, '222222'),
    ttSlot(103, '限時12', now + 7200000, now + 10800000, '333333'),
  ];
  fetches = [];
  assert.throws(
    () => context.createTtlockPasscode_('91234567', new Date(now + 86400000).toISOString(), new Date(now + 90000000).toISOString(), '申請人', ''),
    /沒有已失效的可重用 TTLock 密碼格/
  );
  assert.strictEqual(fetches.filter(x => /\/keyboardPwd\/change$/.test(x.url)).length, 0);
  assert.strictEqual(fetches.filter(x => /\/keyboardPwd\/add$/.test(x.url)).length, 0);
  assert.strictEqual(lock.held, false);
});

console.log(`\n${passed} 項測試全部通過。`);
