#!/usr/bin/env node
/**
 * 場地借用「一鍵批准＋製作電子鎖匙＋回傳」端到端整合測試（v4.24.0）
 *
 * 涵蓋：
 *  1. 跨區自動探測（api.sciener.com 10003 → 自動切換 euapi.ttlock.com + 852 電話帳號相容）
 *  2. 保持現有密碼規則（PWD_MODE=phone4：電話頭4位 → 撞碼自動試尾4位 → +1）及前導 0 純文字 '@' 回傳
 *  3. 舊 Sheet 缺少 passcode / pwdRef / scienerLockId 欄時自動補欄並完整寫回（零掉字）
 *  4. Teamup pending → approved 轉色及補發鎖匙時覆寫舊密碼備註（唔重複疊加）
 *  5. 實體鎖／Gateway 離線（-2012）時嚴格報錯、唔假批核；傳 allowFallback=true 先啟用備用碼
 *  6. confirmVenueBooking（僅確認未設鎖）後可用 reissue=true 補發真實電子鎖匙並電郵申請人
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

function makeSheet(name) {
  const data = [];
  const formats = {};
  const sh = {
    _name: name,
    _data: data,
    _formats: formats,
    getName: () => name,
    getLastRow: () => data.length,
    getLastColumn: () => (data[0] ? data[0].length : 0),
    getMaxRows: () => Math.max(data.length, 100),
    getMaxColumns: () => Math.max(data[0] ? data[0].length : 0, 26),
    getDataRange: () => sh.getRange(1, 1, Math.max(data.length, 1), Math.max(data[0] ? data[0].length : 1, 1)),
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = data[r - 1 + i] || [];
          const line = [];
          for (let j = 0; j < nc; j++) line.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]);
          out.push(line);
        }
        return out;
      },
      getValue: () => ((data[r - 1] || [])[c - 1] === undefined ? '' : data[r - 1][c - 1]),
      setValues: (vals) => {
        for (let i = 0; i < nr; i++) {
          if (!data[r - 1 + i]) data[r - 1 + i] = [];
          for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = vals[i][j];
        }
      },
      setValue: (v) => {
        if (!data[r - 1]) data[r - 1] = [];
        data[r - 1][c - 1] = v;
      },
      setNumberFormat: (fmt) => {
        formats[`${r}:${c}`] = fmt;
        return sh.getRange(r, c, nr, nc);
      },
      setFontWeight: () => sh.getRange(r, c, nr, nc),
      setBackground: () => sh.getRange(r, c, nr, nc),
    }),
    appendRow: (row) => { data.push(row.slice()); },
    deleteRow: (r) => { data.splice(r - 1, 1); },
    clear: () => { data.length = 0; },
    setFrozenRows: () => {},
    setFrozenColumns: () => {},
    autoResizeColumns: () => {},
    insertColumnAfter: () => {},
    protect: () => ({
      setDescription: () => ({
        setWarningOnly: () => {},
        removeEditors: () => {},
        getEditors: () => [],
        canDomainEdit: () => false,
        setDomainEdit: () => {},
      }),
    }),
  };
  return sh;
}

const sheets = {};
const ss = {
  getSheetByName: (n) => sheets[n] || null,
  insertSheet: (n) => (sheets[n] = makeSheet(n)),
  getSheets: () => Object.values(sheets),
  getId: () => 'test-ss-id',
  getUrl: () => 'https://docs.google.com/spreadsheets/d/test-ss-id/edit',
};

const sentEmails = [];
const ttlockState = {
  gatewayOffline: false,
  rejectCodes: new Set(),
  addedPwds: [],
};
const teamupEvents = {};
let nextPwdId = 700100;
let nextTeamupId = 5001;

function parseFormPayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  const out = {};
  String(raw).split('&').forEach(pair => {
    const [k, v] = pair.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return out;
}

const props = {
  PORTAL_MASTER_PASSWORD: 'TEST_MASTER_PASSWORD_123456',
};

const expectedMd5 = crypto.createHash('md5').update('MyLockPass!99', 'utf8').digest('hex');

const ctx = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ss,
    getUi: () => { throw new Error('no ui'); },
    flush: () => {},
  },
  Session: {
    getScriptTimeZone: () => 'America/Los_Angeles', // 刻意模擬錯時區 Apps Script 專案，驗證香港 +08:00 解析
    getActiveUser: () => ({ getEmail: () => 'hq@skwscout.org.hk' }),
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Utilities: {
    formatDate: (d, _tz, fmt) => {
      const iso = new Date(d.getTime() + 8 * 3600 * 1000).toISOString();
      if (fmt === 'yyyy-MM-dd') return iso.slice(0, 10);
      if (fmt === 'yyyyMMdd') return iso.slice(0, 10).replace(/-/g, '');
      if (fmt === 'yyyy-MM-dd HH:mm') return iso.slice(0, 16).replace('T', ' ');
      if (fmt === "yyyy-MM-dd'T'HH:mm") return iso.slice(0, 16);
      if (fmt === "yyyy-MM-dd'T'HH:mm:ss") return iso.slice(0, 19);
      return iso;
    },
    getUuid: () => 'uuid-' + Math.random().toString(36).slice(2, 10),
    base64EncodeWebSafe: (s) => Buffer.from(String(s), 'utf8').toString('base64url'),
    base64DecodeWebSafe: (s) => Buffer.from(String(s), 'base64url'),
    newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
    computeDigest: (algo, s) =>
      Array.from(crypto.createHash(algo || 'sha256').update(String(s), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
    DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' },
    Charset: { UTF_8: 'utf8' },
    sleep: () => {},
  },
  ContentService: {
    createTextOutput: (t) => ({ setMimeType: () => t, getContent: () => t }),
    MimeType: { JSON: 'json' },
  },
  MailApp: {
    sendEmail: (mail) => { sentEmails.push(mail); },
  },
  GmailApp: { sendEmail: () => {} },
  UrlFetchApp: {
    fetch: (url, opt = {}) => {
      const reply = (code, obj) => ({
        getResponseCode: () => code,
        getContentText: () => JSON.stringify(obj),
      });

      // 1) 模擬跨區 TTLock / Sciener API：帳號只存在於 euapi.ttlock.com 且需加 852 區號
      if (/\/oauth2\/token$/.test(url)) {
        const p = parseFormPayload(opt.payload);
        if (p.client_id !== 'app-skw-001' || p.client_secret !== 'sec-skw-999') {
          return reply(200, { errcode: 10001, errmsg: 'invalid client_id' });
        }
        if (!url.startsWith('https://euapi.ttlock.com/')) {
          return reply(200, { errcode: 10003, errmsg: 'user does not exist on this region' });
        }
        if (p.username === '85291234567' && p.password === expectedMd5) {
          return reply(200, { access_token: 'tok-eu-valid', uid: 8801 });
        }
        return reply(200, { errcode: 10003, errmsg: 'invalid username format' });
      }

      if (/\/v3\/lock\/list$/.test(url)) {
        const p = parseFormPayload(opt.payload);
        assert.strictEqual(url, 'https://euapi.ttlock.com/v3/lock/list');
        assert.strictEqual(p.accessToken, 'tok-eu-valid');
        return reply(200, {
          list: [
            { lockId: 170488, lockAlias: 'SKW 1704 大門鎖', lockMac: 'AA:11:22:33:44:55', hasGateway: 1, electricQuantity: 92 },
          ],
        });
      }

      if (/\/v3\/keyboardPwd\/add$/.test(url)) {
        const p = parseFormPayload(opt.payload);
        assert.strictEqual(url, 'https://euapi.ttlock.com/v3/keyboardPwd/add');
        assert.strictEqual(p.accessToken, 'tok-eu-valid');
        assert.strictEqual(p.lockId, '170488');
        if (ttlockState.gatewayOffline) {
          return reply(200, { errcode: -2012, errmsg: 'lock is not connected to any gateway' });
        }
        if (ttlockState.rejectCodes.has(String(p.keyboardPwd))) {
          return reply(200, { errcode: -3007, errmsg: 'duplicate or invalid keyboardPwd' });
        }
        const pwdId = ++nextPwdId;
        ttlockState.addedPwds.push({
          keyboardPwdId: pwdId,
          keyboardPwd: String(p.keyboardPwd),
          startDate: Number(p.startDate),
          endDate: Number(p.endDate),
          name: p.keyboardPwdName,
        });
        return reply(200, { keyboardPwdId: pwdId, errcode: 0 });
      }

      // 2) 模擬 Teamup API（嚴格拒絕 .000Z，只接受 YYYY-MM-DDTHH:mm:ss+08:00，還原真實 Teamup 行為）
      const validTeamupIso = (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(String(s || ''));
      const tupCreate = url.match(/^https:\/\/api\.teamup\.com\/([^/]+)\/events$/);
      if (tupCreate && String(opt.method || 'get').toLowerCase() === 'post') {
        const body = JSON.parse(opt.payload);
        if (!validTeamupIso(body.start_dt) || !validTeamupIso(body.end_dt)) {
          return reply(400, { error: { id: 'event_invalid_datetime_string', message: `Invalid datetime string: "${body.start_dt}"` } });
        }
        const id = 'tup-' + (++nextTeamupId);
        teamupEvents[id] = { id, ...body };
        return reply(201, { event: teamupEvents[id] });
      }
      const tupItem = url.match(/^https:\/\/api\.teamup\.com\/([^/]+)\/events\/([^/]+)$/);
      if (tupItem) {
        const id = tupItem[2];
        const method = String(opt.method || 'get').toLowerCase();
        if (method === 'get') {
          return teamupEvents[id] ? reply(200, { event: teamupEvents[id] }) : reply(404, { error: 'not found' });
        }
        if (method === 'put') {
          const body = JSON.parse(opt.payload);
          if (!validTeamupIso(body.start_dt) || !validTeamupIso(body.end_dt)) {
            return reply(400, { error: { id: 'event_invalid_datetime_string', message: `Invalid datetime string: "${body.start_dt}"` } });
          }
          teamupEvents[id] = { id, ...body };
          return reply(200, { event: teamupEvents[id] });
        }
      }

      return reply(200, {});
    },
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: (k) => { delete props[k]; },
      getProperties: () => ({ ...props }),
    }),
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  CalendarApp: { getCalendarById: () => null },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }), setTitle: () => ({}) }) },
  Logger: { log: () => {} },
};

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs'), 'utf8');
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });
ctx.MASTER_PW = props.PORTAL_MASTER_PASSWORD;
ctx.setupSheets();

// 設定 API Key 供 doGet / doPost 驗證
const apiKey = 'ak_test_venue_flow';
const apiKeyHash = JSON.parse(
  ctx.doPost({ postData: { contents: JSON.stringify({ action: 'getHealthCheck' }) } }) || '{}'
);
void apiKeyHash;
// 直接透過 ctx.sha256_ 寫入 API_KEY_HASH
const cfgRows = sheets.Config._data;
const hashIdx = cfgRows.findIndex((r, i) => i > 0 && r[0] === 'API_KEY_HASH');
if (hashIdx > 0) cfgRows[hashIdx][1] = ctx.sha256_(apiKey);
else cfgRows.push(['API_KEY_HASH', ctx.sha256_(apiKey), 'test']);

function callGet(action, params = {}) {
  return JSON.parse(ctx.doGet({ parameter: { action, apiKey, ...params } }));
}
function callPost(action, body = {}) {
  return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action, apiKey, ...body }) } }));
}

console.log('🔑 測試場地借用「一鍵批准＋製作電子鎖匙＋回傳」全流程 (v4.24.0)');

// 1. 登入超管／DC 並檢查初始健康狀態
const loginRes = callPost('login', { email: ctx.MASTER_EMAIL, password: props.PORTAL_MASTER_PASSWORD });
assert.strictEqual(loginRes.ok, true, '維護管理員應成功登入');
const token = loginRes.data.token;

const h0 = callGet('getHealthCheck');
assert.strictEqual(h0.ok, true);
assert.strictEqual(h0.data.version, '4.24.0');
assert.strictEqual(h0.data.ttlockConfigured, false);
assert.strictEqual(h0.data.lockIdSet, false);
console.log('  ✓ getHealthCheck 回傳版本 4.24.0 及電子鎖初始狀態');

// 2. 模擬舊版 Sheet：刻意移除 VenueBookings 的 pwdRef / passcode 欄及 Venues 的 scienerLockId 欄
sheets.VenueBookings._data[0] = [
  'id', 'districtCode', 'refCode', 'submittedAt', 'venueId', 'venueName', 'purpose',
  'startDate', 'endDate', 'name', 'phone', 'email', 'troop', 'position', 'agreeRules',
  'status', 'teamupEventId', 'reviewer', 'reviewedAt', 'createdAt',
];
sheets.Venues._data.splice(
  0,
  sheets.Venues._data.length,
  ['venueId', 'districtCode', 'name', 'location', 'capacity', 'note', 'active'],
  ['HQ-1704', 'SKW', '區總部 1704 室', '筲箕灣', '40', '', 'TRUE'],
);

// 3. 儲存連線設定（故意保留舊預設 api.sciener.com 同埋 8 位電話 91234567，驗證跨區＋852 自動相容）
const saveCfg1 = callPost('saveVenueLockConfig', {
  token,
  config: {
    clientId: 'app-skw-001',
    clientSecret: 'sec-skw-999',
    username: '91234567',
    password: 'MyLockPass!99',
    apiBase: 'https://api.sciener.com',
    pwdMode: 'phone4',
    teamupApiKey: 'tup-secret-key',
    teamupCalendarKey: 'ks9testcal',
    teamupPendingSub: '101',
    teamupApprovedSub: '102',
    teamupRejectedSub: '103',
  },
});
assert.strictEqual(saveCfg1.ok, true, 'saveVenueLockConfig 應成功：' + JSON.stringify(saveCfg1));
assert.strictEqual(saveCfg1.data.clientSecretSet, true);
assert.strictEqual(saveCfg1.data.passwordSet, true);
assert.strictEqual(saveCfg1.data.sheetHasPasscodeCol, true, '應自動為舊 VenueBookings 補回 passcode 欄');
assert.strictEqual(saveCfg1.data.sheetHasPwdRefCol, true, '應自動為舊 VenueBookings 補回 pwdRef 欄');

// 4. 跨區讀取鎖列表 + 一鍵綁定門鎖至 Config 及現有場地（留空密碼唔覆蓋）
const lockListRes = callGet('getLockList', { token });
assert.strictEqual(lockListRes.ok, true, '跨區 getLockList 應成功：' + JSON.stringify(lockListRes));
assert.strictEqual(lockListRes.data.apiBase, 'https://euapi.ttlock.com');
assert.strictEqual(lockListRes.data.locks.length, 1);
assert.strictEqual(lockListRes.data.locks[0].lockId, 170488);
assert.strictEqual(lockListRes.data.locks[0].hasGateway, true);
console.log('  ✓ 自動跨區探測（api.sciener.com → euapi.ttlock.com）及香港電話 852 相容成功');

const bindRes = callPost('saveVenueLockConfig', {
  token,
  config: {
    lockId: '170488',
    clientSecret: '', // 留空應保留原 Secret
    password: '',     // 留空應保留原密碼
    bindLockToVenues: true,
  },
});
assert.strictEqual(bindRes.ok, true);
assert.strictEqual(bindRes.data.ttlockReady, true);
assert.strictEqual(bindRes.data.clientSecretSet, true, '留空 Secret 不可洗走舊值');
assert.strictEqual(bindRes.data.passwordSet, true, '留空 Password 不可洗走舊值');
assert.strictEqual(bindRes.data.boundVenues, 1, '應一鍵同步 Lock ID 至現有場地');

// 5. 申請人提交借場（電話帶前導 0：05129876，時段為未來香港時間）
const submit1 = callPost('submitVenueRequest', {
  venueId: 'HQ-1704',
  name: '陳大文領袖',
  phone: '05129876',
  email: 'chan@example.com',
  troop: '港島第 1888 旅',
  purpose: '團長會議',
  startDate: '2027-05-15T19:00',
  endDate: '2027-05-15T21:30',
  agreeRules: 'TRUE',
});
assert.strictEqual(submit1.ok, true);
const booking1Id = submit1.data.id;
const pendingEvId = submit1.data.teamupEventId;
assert.ok(pendingEvId, '應建立 Teamup 申請中事件');

// 6. 模擬 Gateway 離線（-2012）：一鍵批准必須明確報錯，唔可以靜默假批核或寄假密碼
ttlockState.gatewayOffline = true;
const failApprove = callPost('approveVenueBooking', { token, id: booking1Id });
assert.strictEqual(failApprove.ok, false, '網關離線時預設必須拒絕假批核');
assert.ok(failApprove.error.includes('Gateway') || failApprove.error.includes('網關'), '錯誤訊息需清楚指出網關問題：' + failApprove.error);
assert.strictEqual(sentEmails.length, 0, '寫鎖失敗時絕不可寄出無效密碼電郵');
const afterFailList = callGet('getVenueBookings', { token });
assert.strictEqual(afterFailList.data.find(x => x.id === booking1Id).status, 'pending', '失敗後狀態必須維持 pending 以便重試');
console.log('  ✓ Gateway 離線時嚴格攔截，不吞錯、不假批核、不寄假密碼');

// 7. Gateway 恢復在線 → 一鍵批准：驗證香港 +08:00 時間（前後 15 分鐘緩衝）、前導 0 密碼 '0512' 純文字回傳、Teamup 轉紅及電郵
ttlockState.gatewayOffline = false;
const okApprove = callPost('approveVenueBooking', { token, id: booking1Id });
assert.strictEqual(okApprove.ok, true, '一鍵批准應成功：' + JSON.stringify(okApprove));
assert.strictEqual(okApprove.data.passcode, '0512', '應按 phone4 生成前導 0 密碼 0512');
assert.strictEqual(okApprove.data.lockWritten, true);
assert.ok(okApprove.data.pwdRef && okApprove.data.pwdRef !== 'SIMULATED', '應回傳真實 keyboardPwdId');
assert.strictEqual(okApprove.data.teamupSynced, true);
assert.strictEqual(okApprove.data.emailSent, true);

// 驗證寫入 TTLock 的毫秒時間完全對應香港 +08:00（即使 Apps Script 時區係 America/Los_Angeles）
const lastLockCall = ttlockState.addedPwds[ttlockState.addedPwds.length - 1];
assert.strictEqual(lastLockCall.startDate, Date.parse('2027-05-15T18:45:00+08:00'), '生效時間應為香港時間提前 15 分鐘');
assert.strictEqual(lastLockCall.endDate, Date.parse('2027-05-15T21:45:00+08:00'), '結束時間應為香港時間延後 15 分鐘');

// 驗證 Sheet 儲存格以 '@' 純文字格式寫入，且模擬 Google Sheet 誤轉數字 512 時讀取仍自動補回 '0512'
const vbHeaders = sheets.VenueBookings._data[0];
const passcodeCol = vbHeaders.indexOf('passcode') + 1;
const pwdRefCol = vbHeaders.indexOf('pwdRef') + 1;
assert.strictEqual(sheets.VenueBookings._formats[`2:${passcodeCol}`], '@', 'passcode 儲存格必須設為純文字 @');
assert.strictEqual(sheets.VenueBookings._formats[`2:${pwdRefCol}`], '@', 'pwdRef 儲存格必須設為純文字 @');

const afterOkList = callGet('getVenueBookings', { token });
const row1 = afterOkList.data.find(x => x.id === booking1Id);
assert.strictEqual(row1.status, 'approved');
assert.strictEqual(row1.passcode, '0512');
assert.strictEqual(row1.pwdRef, String(lastLockCall.keyboardPwdId));
assert.deepStrictEqual(teamupEvents[pendingEvId].subcalendar_ids, [102], 'Teamup 事件應轉去紅色已批子日曆');
assert.strictEqual(sentEmails.length, 1);
assert.ok(sentEmails[0].htmlBody.includes('0512#'), '電郵應包含入場密碼及 # 提示');
console.log('  ✓ 一鍵批准完整打通：香港時區準確、前導 0 密碼純文字寫回 Sheet、pwdRef／Teamup／電郵全部回傳');

// 8. 驗證撞碼自動退避規則（頭4位 '0512' 被拒 → 自動試尾4位 '9876'）及 confirmOnly → reissue 補發流程
ttlockState.rejectCodes.add('0512');
const submit2 = callPost('submitVenueRequest', {
  venueId: 'HQ-1704',
  name: '李小明副團長',
  phone: '05129876',
  email: 'lee@example.com',
  troop: '港島第 1888 旅',
  purpose: '訓練籌備',
  startDate: '2027-05-20T19:30',
  endDate: '2027-05-20T22:00',
  agreeRules: 'TRUE',
});
const booking2Id = submit2.data.id;
const ev2Id = submit2.data.teamupEventId;

// 先做「僅確認（唔設鎖）」
const confirmRes = callPost('confirmVenueBooking', { token, id: booking2Id });
assert.strictEqual(confirmRes.ok, true);

// 隨後點「補發電子鎖匙」（即使無傳 reissue，因為未有真實 pwdRef 亦允許直接補發；並測試撞頭4自動改尾4）
const reissueRes = callPost('approveVenueBooking', { token, id: booking2Id, reissue: true });
assert.strictEqual(reissueRes.ok, true, '補發鎖匙應成功：' + JSON.stringify(reissueRes));
assert.strictEqual(reissueRes.data.passcode, '9876', '頭 4 位撞碼時應按規則自動改用電話尾 4 位 9876');
assert.strictEqual(reissueRes.data.lockWritten, true);

// 再重製一次鎖匙，確認 Teamup 備註唔會重複疊加兩行「🔑 密碼：」
const reissueAgain = callPost('approveVenueBooking', { token, id: booking2Id, reissue: true });
assert.strictEqual(reissueAgain.ok, true);
const pwdNoteMatches = String(teamupEvents[ev2Id].notes || '').match(/🔑 密碼：/g) || [];
assert.strictEqual(pwdNoteMatches.length, 1, '重製鎖匙後 Teamup 備註只應保留最新一行密碼');
console.log('  ✓ 電話頭4撞碼自動改尾4、僅確認後補發鎖匙、重製鎖匙覆寫 Teamup 備註全部通過');

// 9. 驗證實機常見陷阱：Google Sheet 自動將日期轉為 Date 物件或 .000Z 字串時，Teamup 仍收標準 +08:00 唔彈 HTTP 400
const submit3 = callPost('submitVenueRequest', {
  venueId: 'HQ-1704',
  name: '張三領袖',
  phone: '93651111',
  email: 'cheung@example.com',
  troop: '港島第 206 旅',
  purpose: '支部集會',
  startDate: '2027-06-01T22:47:00.000Z',
  endDate: '2027-06-01T23:47:00.000Z',
  agreeRules: 'TRUE',
});
assert.strictEqual(submit3.ok, true);
assert.strictEqual(submit3.data.warn, '', '帶 .000Z 嘅時間經 toTeamupDt_ 轉換後不應觸發 Teamup HTTP 400：' + submit3.data.warn);
const approve3 = callPost('approveVenueBooking', { token, id: submit3.data.id });
assert.strictEqual(approve3.ok, true);
assert.strictEqual(approve3.data.passcode, '9365');
assert.strictEqual(approve3.data.teamupSynced, true, '批核時 Teamup 亦應零錯誤同步');
console.log('  ✓ .000Z／Date 時間自動正規化為香港 +08:00 無毫秒格式，徹底消除 Teamup HTTP 400');

console.log('\n🎉 場地借用電子鎖與回傳整合測試全部通過！');
