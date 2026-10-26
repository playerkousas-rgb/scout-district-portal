#!/usr/bin/env node
/**
 * 場地借用「一鍵批准＋製作電子鎖匙＋回傳」端到端整合測試（v4.30.0）
 *
 * 涵蓋：
 *  1. 跨區自動探測（api.sciener.com 10003 → 自動切換 euapi.ttlock.com + 852 電話帳號相容）
 *  2. 密碼規則（PWD_MODE=phone4：電話頭4位 → 撞碼先試電話尾4位，再逐個 +1）及前導 0 純文字 '@' 回傳
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

function makeSheet(name, ownerMap = null) {
  const data = [];
  const formats = {};
  const protections = [];
  const sh = {
    _name: name,
    _data: data,
    _formats: formats,
    getName: () => sh._name,
    setName: (next) => {
      if (ownerMap) { delete ownerMap[sh._name]; ownerMap[next] = sh; }
      sh._name = next;
      return sh;
    },
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
    getProtections: () => protections,
    protect: () => {
      const prot = {
        description: '', editors: [],
        setDescription(value) { this.description = value; return this; },
        addEditor(value) { this.editors.push(typeof value === 'string' ? { getEmail: () => value } : value); return this; },
        getEditors() { return this.editors; },
        removeEditor(user) { this.editors = this.editors.filter(x => x !== user); },
        getDescription() { return this.description; },
        canDomainEdit: () => false,
        setDomainEdit: () => {},
        setWarningOnly: () => {},
      };
      protections.push(prot);
      return prot;
    },
  };
  return sh;
}

const sheets = {};
const mockSpreadsheets = { 'test-ss-id': null };
function makeSpreadsheet(id, sheetMap) {
  const map = sheetMap || {};
  return {
    _sheets: map,
    getSheetByName: (n) => map[n] || null,
    insertSheet: (n) => (map[n] = makeSheet(n, map)),
    getSheets: () => Object.values(map),
    getId: () => id,
    getUrl: () => `https://docs.google.com/spreadsheets/d/${id}/edit`,
  };
}
const ss = makeSpreadsheet('test-ss-id', sheets);
mockSpreadsheets['test-ss-id'] = ss;
let nextDcSheetId = 1;

const sentEmails = [];
const driveFiles = {};
const driveUser = (email) => ({ getEmail: () => email });
function mockDriveFile(id) {
  if (!driveFiles[id]) {
    driveFiles[id] = {
      id,
      owner: driveUser('sysadmin@skwscout.org.hk'),
      editors: [],
      viewers: [],
      setSharing(access, permission) { this.access = access; this.permission = permission; },
      getSharingAccess() { return this.access; },
      getOwner() { return this.owner; },
      getEditors() { return this.editors.slice(); },
      getViewers() { return this.viewers.slice(); },
      removeEditor(user) { this.editors = this.editors.filter(x => x !== user); },
      removeViewer(user) { this.viewers = this.viewers.filter(x => x !== user); },
      addViewer(email) { if (!this.viewers.some(x => x.getEmail() === email)) this.viewers.push(driveUser(email)); },
    };
  }
  return driveFiles[id];
}
const ttlockState = {
  gatewayOffline: false,
  returnExistingPwdIdOnce: false,
  returnMissingPwdIdOnce: false,
  rejectCodes: new Set(),
  addedPwds: [],
  existingPwds: [],
  changedPwds: [],
};
const teamupEvents = {};
const teamupState = { failNextCreate: false, failNextOverlap: false, failNextUpdate: false, failNextDelete: false, failDeleteCount: 0, throwNextDelete: false, failNextApprovedList: false };
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

const props = { PORTAL_MASTER_PASSWORD: 'TEST_ONLY_OLD_PROPERTY_MUST_BE_IGNORED' };
const mockCache = new Map();

const expectedMd5 = crypto.createHash('md5').update('MyLockPass!99', 'utf8').digest('hex');

const ctx = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ss,
    openById: (id) => mockSpreadsheets[id] || null,
    create: (name) => {
      const id = `dc-feedback-${nextDcSheetId++}`;
      const spreadsheet = makeSpreadsheet(id, {});
      spreadsheet.insertSheet('Sheet1');
      mockSpreadsheets[id] = spreadsheet;
      mockDriveFile(id).name = name;
      return spreadsheet;
    },
    ProtectionType: { SHEET: 'SHEET' },
    getUi: () => { throw new Error('no ui'); },
    flush: () => {},
  },
  DriveApp: {
    Access: { PRIVATE: 'PRIVATE' },
    Permission: { NONE: 'NONE', VIEW: 'VIEW' },
    getFileById: (id) => mockDriveFile(id),
  },
  Session: {
    getScriptTimeZone: () => 'America/Los_Angeles', // 刻意模擬錯時區 Apps Script 專案，驗證香港 +08:00 解析
    getActiveUser: () => ({ getEmail: () => 'hq@skwscout.org.hk' }),
    getEffectiveUser: () => ({ getEmail: () => 'sysadmin@skwscout.org.hk' }),
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
    getUuid: () => crypto.randomUUID(),
    base64EncodeWebSafe: (s) => Buffer.from(String(s), 'utf8').toString('base64url'),
    base64DecodeWebSafe: (s) => Buffer.from(String(s), 'base64url'),
    newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
    computeDigest: (algo, s) =>
      Array.from(crypto.createHash(algo || 'sha256').update(String(s), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
    computeHmacSha256Signature: (message, key) => Array.from(crypto.createHmac('sha256', String(key)).update(String(message)).digest()).map(b => b > 127 ? b - 256 : b),
    DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' },
    Charset: { UTF_8: 'utf8' },
    sleep: () => {},
  },
  ContentService: {
    createTextOutput: (t) => ({ setMimeType: () => t, getContent: () => t }),
    MimeType: { JSON: 'json' },
  },
  MailApp: {
    sendEmail: (...mail) => { sentEmails.push(mail.length === 1 ? mail[0] : { to: mail[0], subject: mail[1], body: mail[2] }); },
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

      if (/\/v3\/lock\/listKeyboardPwd$/.test(url)) {
        const p = parseFormPayload(opt.payload);
        assert.strictEqual(p.accessToken, 'tok-eu-valid');
        assert.strictEqual(p.lockId, '170488');
        return reply(200, { list: ttlockState.existingPwds.slice() });
      }

      if (/\/v3\/keyboardPwd\/change$/.test(url)) {
        const p = parseFormPayload(opt.payload);
        assert.strictEqual(p.accessToken, 'tok-eu-valid');
        const found = ttlockState.existingPwds.find(x => String(x.keyboardPwdId) === String(p.keyboardPwdId));
        if (!found) return reply(200, { errcode: -3004, errmsg: 'keyboardPwdId does not exist' });
        found.startDate = Number(p.startDate);
        found.endDate = Number(p.endDate);
        found.keyboardPwdName = p.keyboardPwdName;
        ttlockState.changedPwds.push({ ...found });
        return reply(200, { errcode: 0 });
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
        if (ttlockState.returnExistingPwdIdOnce) {
          ttlockState.returnExistingPwdIdOnce = false;
          assert.ok(ttlockState.existingPwds.length, '此測試需先建立既有 keyboardPwdId');
          return reply(200, { errcode: 0, keyboardPwdId: ttlockState.existingPwds[0].keyboardPwdId });
        }
        if (ttlockState.returnMissingPwdIdOnce) {
          ttlockState.returnMissingPwdIdOnce = false;
          return reply(200, { errcode: 0 });
        }
        const pwdId = ++nextPwdId;
        const added = {
          keyboardPwdId: pwdId,
          lockId: Number(p.lockId),
          keyboardPwd: String(p.keyboardPwd),
          startDate: Number(p.startDate),
          endDate: Number(p.endDate),
          keyboardPwdName: p.keyboardPwdName,
        };
        ttlockState.addedPwds.push(added);
        ttlockState.existingPwds.push({ ...added });
        return reply(200, { keyboardPwdId: pwdId, errcode: 0 });
      }

      // 2) 模擬 Teamup API（嚴格拒絕 .000Z，只接受 YYYY-MM-DDTHH:mm:ss+08:00，還原真實 Teamup 行為）
      const tupList = url.match(/^https:\/\/api\.teamup\.com\/([^/]+)\/events\?(.*)$/);
      if (tupList && String(opt.method || 'get').toLowerCase() === 'get') {
        const params = new URLSearchParams(tupList[2]);
        assert.strictEqual(params.get('subcalendarId[]'), '102', '已批查詢只可讀紅色子日曆');
        assert.strictEqual(params.get('tz'), 'Asia/Hong_Kong');
        if (teamupState.failNextApprovedList) {
          teamupState.failNextApprovedList = false;
          return reply(503, { error: 'Teamup unavailable' });
        }
        return reply(200, {
          events: Object.values(teamupEvents).filter(event =>
            Array.isArray(event.subcalendar_ids) && event.subcalendar_ids.map(String).includes('102')
          ),
        });
      }
      const validTeamupIso = (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(String(s || ''));
      const tupCreate = url.match(/^https:\/\/api\.teamup\.com\/([^/]+)\/events$/);
      if (tupCreate && String(opt.method || 'get').toLowerCase() === 'post') {
        if (teamupState.failNextCreate) {
          teamupState.failNextCreate = false;
          return reply(503, { error: 'Teamup unavailable' });
        }
        if (teamupState.failNextOverlap) {
          teamupState.failNextOverlap = false;
          return reply(400, { error: { id: 'event_overlapping', message: 'Event overlaps an existing reservation' } });
        }
        const body = JSON.parse(opt.payload);
        assert.ok(body.custom && body.custom['1'] && body.who, 'Teamup 事件必須提供參加人數 custom[1] 及內建 who 欄位');
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
        if (method === 'delete') {
          if (teamupState.throwNextDelete) {
            teamupState.throwNextDelete = false;
            throw new Error('simulated Teamup network failure');
          }
          if (teamupState.failDeleteCount > 0) {
            teamupState.failDeleteCount -= 1;
            return reply(403, { error: { id: 'no_permission', message: 'no permission to delete' } });
          }
          if (teamupState.failNextDelete) {
            teamupState.failNextDelete = false;
            return reply(403, { error: { id: 'no_permission', message: 'no permission to delete' } });
          }
          if (!teamupEvents[id]) return reply(404, { error: 'not found' });
          delete teamupEvents[id];
          return reply(204, {});
        }
        if (method === 'put') {
          if (teamupState.failNextUpdate) {
            teamupState.failNextUpdate = false;
            return reply(403, { error: { id: 'no_permission', message: 'no permission' } });
          }
          const body = JSON.parse(opt.payload);
          if (body.subcalendar_ids && body.subcalendar_ids.includes(102)) {
            assert.strictEqual(String(body.id), String(id), 'Teamup 更新既有事件需在 body 帶上 event id');
          }
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
  CacheService: { getScriptCache: () => ({ get: (k) => mockCache.get(k) || null, put: (k, v) => mockCache.set(k, v), remove: (k) => mockCache.delete(k) }) },
  CalendarApp: { getCalendarById: () => null },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }), setTitle: () => ({}) }) },
  Logger: { log: () => {} },
};

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs'), 'utf8');
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });
ctx.setupSheets();
assert.strictEqual(props.PORTAL_MASTER_PASSWORD, undefined, 'setup must remove the obsolete Apps Script master-password property');

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
ctx.setConfigTextValue_('TEAMUP_FIELD_ATTENDEE_KEY', '1', 'Teamup 參加人數 custom field');

function callGet(action, params = {}) {
  return JSON.parse(ctx.doGet({ parameter: { action, apiKey, ...params } }));
}
function callPost(action, body = {}) {
  return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action, apiKey, ...body }) } }));
}

console.log('🔑 測試場地借用「一鍵批准＋製作電子鎖匙＋回傳」全流程 (v4.30.0)');

// 1. 登入超管／DC 並檢查初始健康狀態
const assertion = JSON.stringify({ email: 'sheep', exp: Date.now() + 30_000, nonce: crypto.randomBytes(16).toString('hex') });
const bridgeSignature = crypto.createHmac('sha256', props.PORTAL_MASTER_PROXY_SECRET).update(assertion).digest('hex');
assert.strictEqual(callPost('proxyMasterLogin', { assertion, signature: 'invalid' }).ok, false,
  'the shared API Key alone must not be sufficient to mint the maintenance token');
const loginRes = callPost('proxyMasterLogin', { assertion, signature: bridgeSignature });
assert.strictEqual(loginRes.ok, true, '維護管理員應成功登入');
const token = loginRes.data.token;

const h0 = callGet('getHealthCheck');
assert.strictEqual(h0.ok, true);
assert.strictEqual(h0.data.version, '4.30.0');
assert.strictEqual(h0.data.ttlockConfigured, false);
assert.strictEqual(h0.data.lockIdSet, false);
assert.strictEqual(h0.data.feedbackReady, true, 'DistrictFeedback should be ready after setup');
assert.strictEqual(h0.data.dcFeedbackReady, true, 'DCConfidential should be ready after setup');
console.log('  ✓ getHealthCheck 回傳版本 4.30.0、意見箱就緒及電子鎖初始狀態');
assert.strictEqual(h0.data.tokenSecretSet, true, 'setup should create a private token signing secret');
assert.strictEqual(h0.data.masterProxyBridgeSet, true, 'setup should create the Vercel-to-Apps-Script bridge secret');
assert.ok(props.PORTAL_TOKEN_SECRET && props.PORTAL_TOKEN_SECRET.length >= 32, 'token secret should be stored in Script Properties');
assert.strictEqual(ctx.MASTER_PW, undefined, 'the source must not define a hard-coded maintenance password');
assert.strictEqual(ctx.login_('sheep', '0728').ok, false, 'the published legacy maintenance password must no longer work');
assert.strictEqual(ctx.login_('sheep', props.PORTAL_MASTER_PASSWORD).ok, false, 'Apps Script must ignore any legacy master-password property');
assert.strictEqual(callPost('login', { email: 'sysadmin@skwscout.org.hk', password: '1234' }).ok, false,
  'shared preset credentials must be denied');

// A token signed with the former source-visible secret must not verify.
const legacyPayload = `attacker@example.invalid|SYSADMIN|${Date.now() + 60 * 60 * 1000}`;
const legacySignature = ctx.sha256_(legacyPayload + 'CHANGE_ME_DISTRICT_SECRET_請改成長亂碼').slice(0, 32);
const legacyToken = ctx.Utilities.base64EncodeWebSafe(`${legacyPayload}|${legacySignature}`);
assert.strictEqual(ctx.checkToken_(legacyToken).valid, false, 'legacy public signing secret must not forge a token');

// API-key auth must reject missing keys/hashes; health check remains the only documented bypass.
const savedApiHash = cfgRows[hashIdx][1];
cfgRows[hashIdx][1] = '';
assert.strictEqual(callGet('getPublicInfo').ok, false, 'missing API_KEY_HASH must fail closed');
cfgRows[hashIdx][1] = savedApiHash;

// Force-change accounts may only verify/read cards/change password until their temporary password is rotated.
const securityUsersRows = sheets.Users._data;
const securityUsersHeader = securityUsersRows[0];
const sysadminRow = securityUsersRows.find((r, i) => i > 0 && r[securityUsersHeader.indexOf('email')] === 'sysadmin@skwscout.org.hk');
const saltCol = securityUsersHeader.indexOf('salt'), hashCol = securityUsersHeader.indexOf('passwordHash');
sysadminRow[saltCol] = 'unit-test-salt';
sysadminRow[hashCol] = ctx.sha256_('OneTimeTempPass_123' + sysadminRow[saltCol]);
sysadminRow[securityUsersHeader.indexOf('mustChangePassword')] = 'TRUE';
const forceLogin = callPost('login', { email: 'sysadmin@skwscout.org.hk', password: 'OneTimeTempPass_123' });
assert.strictEqual(forceLogin.ok, true);
assert.strictEqual(forceLogin.data.mustChangePassword, true);
assert.strictEqual(callGet('getUsers', { token: forceLogin.data.token }).ok, false,
  'must-change-password token cannot read user records');
assert.strictEqual(callPost('changePassword', { token: forceLogin.data.token, oldPassword: 'OneTimeTempPass_123', newPassword: 'NewUniquePassword_2026' }).ok, true,
  'must-change-password token can change its own password');
assert.strictEqual(callGet('getUsers', { token: forceLogin.data.token }).ok, true,
  'account regains authorized access after changing its password');

// 「你講我聽」公開提交、聯絡資料最小化及 DC 儲存隔離
const feedbackDenied = callPost('submitDistrictFeedback', { category: 'wrong', message: '這是一段足夠長的測試留言。' });
assert.strictEqual(feedbackDenied.ok, false, 'invalid feedback category must be rejected');
const tooShortFeedback = callPost('submitDistrictFeedback', { category: 'opinion', message: '太短' });
assert.strictEqual(tooShortFeedback.ok, false, 'short feedback must be rejected');
const missingContact = callPost('submitDistrictFeedback', {
  category: 'support', message: '我需要一段足夠長的支援留言內容。', wantReply: true, contactType: 'email', contact: '',
});
assert.strictEqual(missingContact.ok, false, 'reply requests require a contact account');
const normalFeedback = callPost('submitDistrictFeedback', {
  category: 'opinion', message: '這是一段一般意見留言，字數符合要求。', wantReply: false,
  contactName: '不應保留', contactType: 'phone', contact: '+85291234567', dcOnly: false,
});
assert.strictEqual(normalFeedback.ok, true);
const mainFeedbackRows = ctx.feedbackReadRows_(sheets.DistrictFeedback);
assert.strictEqual(mainFeedbackRows.length, 1);
assert.strictEqual(mainFeedbackRows[0].contactName, '', 'no-reply contactName must be discarded');
assert.strictEqual(mainFeedbackRows[0].contactType, '', 'no-reply contactType must be discarded');
assert.strictEqual(mainFeedbackRows[0].contact, '', 'no-reply contact must be discarded');
assert.strictEqual(mainFeedbackRows[0].dcOnly, 'FALSE');

const noNotifyFeedback = callPost('submitDistrictFeedback', {
  category: 'opinion', message: '即使沒有通知地址，這則保密留言仍須安全儲存。', dcOnly: true,
});
assert.strictEqual(noNotifyFeedback.ok, true, 'DC-only feedback must save when notifications are unconfigured');
assert.strictEqual(sentEmails.length, 0, 'no notification should be sent when DC_NOTIFY_EMAIL is blank');
ctx.setConfigTextValue_('DC_NOTIFY_EMAIL', 'dc-notify@example.org', 'test-only notification address');
const privateFeedback = callPost('submitDistrictFeedback', {
  category: 'support', message: '這是一段只供區總監查看的保密支援留言。', wantReply: true,
  contactName: '保密聯絡人', contactType: 'ig', contact: '@private-account', dcOnly: true,
});
assert.strictEqual(privateFeedback.ok, true);
const confidentialSheet = sheets.DCConfidential;
assert.ok(confidentialSheet, 'setupSheets must create the DCConfidential tab in the main spreadsheet');
assert.strictEqual(ctx.feedbackReadRows_(confidentialSheet).length, 2, 'both notified and non-notified DC feedback should persist in the DC tab');
assert.strictEqual(ctx.getDCFeedbackSheet_(), confidentialSheet);
assert.strictEqual(ctx.feedbackReadRows_(sheets.DistrictFeedback).length, 1, 'DC feedback must stay in its own tab, not the general inbox tab');
assert.strictEqual(sentEmails.at(-1).to, 'dc-notify@example.org');
assert.ok(!sentEmails.at(-1).body.includes('保密支援留言'), 'notification must not contain message content');

// Tests use explicitly rotated credentials for normal users, so their fixtures are not force-change sessions.
for (const email of ['dc@skwscout.org.hk', 'ddc.admin@skwscout.org.hk', 'adc.scout@skwscout.org.hk']) {
  const row = sheets.Users._data.find((r, i) => i > 0 && r[0] === email);
  if (row) row[sheets.Users._data[0].indexOf('mustChangePassword')] = 'FALSE';
}
const dcToken = ctx.makeToken_('dc@skwscout.org.hk', 'DC');
const ddcToken = ctx.makeToken_('ddc.admin@skwscout.org.hk', 'DDC_ADMIN');
const adcToken = ctx.makeToken_('adc.scout@skwscout.org.hk', 'ADC_SCOUT');
assert.strictEqual(callGet('getDistrictFeedback', { token: dcToken }).ok, true);
assert.strictEqual(callGet('getDistrictFeedback', { token: token }).ok, true, 'superadmin should read general feedback');
assert.strictEqual(callGet('getDistrictFeedback', { token: ddcToken }).ok, true, 'ops role with view permission should read general feedback');
assert.strictEqual(callGet('getDistrictFeedback', { token: adcToken }).ok, false, 'roles without permission cannot read general feedback');
assert.strictEqual(callGet('getDCFeedback', { token: dcToken }).ok, true);
assert.strictEqual(callGet('getDCFeedback', { token: token }).ok, true, 'superadmin should read confidential feedback');
assert.strictEqual(callGet('getDCFeedback', { token: ddcToken }).ok, false, 'non-DC role cannot read confidential feedback');
assert.strictEqual(callGet('getDCFeedback', { token: adcToken }).ok, false, 'non-DC role cannot read confidential feedback');
const usersRows = sheets.Users._data;
const dcUserRow = usersRows.findIndex((row, i) => i > 0 && row[0] === 'dc@skwscout.org.hk');
const activeCol = usersRows[0].indexOf('active');
usersRows[dcUserRow][activeCol] = 'FALSE';
assert.strictEqual(callGet('getDCFeedback', { token: dcToken }).ok, false, 'disabled DC account cannot read confidential feedback');
usersRows[dcUserRow][activeCol] = 'TRUE';
const permsRows = sheets.Perms._data;
const ddcCol = permsRows[0].indexOf('DDC_ADMIN');
const dcCardRow = permsRows.findIndex((row, i) => i > 0 && row[0] === 'dcFeedback');
permsRows[dcCardRow][ddcCol] = 'edit';
assert.strictEqual(callGet('getDCFeedback', { token: ddcToken }).ok, false, 'private backend guard must not trust Perms');
permsRows[dcCardRow][ddcCol] = '';

const feedbackRowsBeforeSetup = sheets.DistrictFeedback._data.length;
ctx.setupSheets();
assert.strictEqual(sheets.DistrictFeedback._data.length, feedbackRowsBeforeSetup, 'setupSheets must preserve general feedback');
assert.strictEqual(sheets.DCConfidential, confidentialSheet, 'setupSheets must reuse the confidential tab');
assert.strictEqual(ctx.feedbackReadRows_(confidentialSheet).length, 2, 'setupSheets must preserve DC feedback');
console.log('  ✓ 留言驗證、聯絡資料清除、DC 分頁分流、後端角色限制及 setup 不清資料');
sentEmails.length = 0; // 後續借場電郵斷言只統計借場流程

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

// 5. 新增欄位需由 GS 再驗證：缺活動名稱／參加人數不得建事件或寫 Sheet
const venueRowsBeforeInvalid = sheets.VenueBookings._data.length;
const invalidNewFields = callPost('submitVenueRequest', {
  venueId: 'HQ-1704', name: '欄位測試', phone: '91234567',
  activityName: '', attendeeCount: 0,
  startDate: '2027-05-15T19:00', endDate: '2027-05-15T20:00',
});
assert.strictEqual(invalidNewFields.ok, false);
assert.ok(/活動名稱|參加人數/.test(invalidNewFields.error));
assert.strictEqual(sheets.VenueBookings._data.length, venueRowsBeforeInvalid);
[
  { activityName: 'A'.repeat(121), attendeeCount: 1, expected: '活動名稱' },
  { activityName: '有效活動', attendeeCount: 1.5, expected: '參加人數' },
  { activityName: '有效活動', attendeeCount: 10000, expected: '參加人數' },
].forEach(({ activityName, attendeeCount, expected }) => {
  const invalid = callPost('submitVenueRequest', {
    venueId: 'HQ-1704', name: '欄位測試', phone: '91234567', activityName, attendeeCount,
    agreeRules: true, startDate: '2027-05-15T19:00', endDate: '2027-05-15T20:00',
  });
  assert.strictEqual(invalid.ok, false);
  assert.ok(invalid.error.includes(expected));
});
assert.strictEqual(sheets.VenueBookings._data.length, venueRowsBeforeInvalid);
const missingConsent = callPost('submitVenueRequest', {
  venueId: 'HQ-1704', name: '欄位測試', phone: '91234567',
  activityName: '測試活動', attendeeCount: 5, agreeRules: false,
  startDate: '2027-05-15T19:00', endDate: '2027-05-15T20:00',
});
assert.strictEqual(missingConsent.ok, false);
assert.ok(missingConsent.error.includes('同意借用守則'));
assert.strictEqual(sheets.VenueBookings._data.length, venueRowsBeforeInvalid);

// 6. Teamup 建立藍色事件失敗時，必須明確回報且不可只收進表格
const venueRowsBeforeFailure = sheets.VenueBookings._data.length;
teamupState.failNextCreate = true;
const failedSubmit = callPost('submitVenueRequest', {
  venueId: 'HQ-1704', name: '測試申請人', position: '領袖', phone: '91234567', email: 'test@example.com',
  activityName: '測試活動', attendeeCount: 5, agreeRules: true,
  startDate: '2027-05-15T19:00', endDate: '2027-05-15T20:00',
});
assert.strictEqual(failedSubmit.ok, false, 'Teamup 建立失敗不可回報申請成功');
assert.ok(failedSubmit.error.includes('Teamup'), '應回報 Teamup 錯誤原因');
assert.strictEqual(sheets.VenueBookings._data.length, venueRowsBeforeFailure, 'Teamup 建立失敗時不得新增孤立的 pending 表格記錄');
teamupState.failNextOverlap = true;
const overlapSubmit = callPost('submitVenueRequest', {
  venueId: 'HQ-1704', name: '撞期測試', phone: '91234567', activityName: '撞期測試',
  attendeeCount: 5, agreeRules: true,
  startDate: '2027-05-15T19:00', endDate: '2027-05-15T20:00',
});
assert.strictEqual(overlapSubmit.ok, false);
assert.strictEqual(overlapSubmit.error, '該時段已有人使用或已有行事曆安排，請選擇其他時段後再申請。');
assert.strictEqual(sheets.VenueBookings._data.length, venueRowsBeforeFailure, '撞期失敗不得留下 pending 記錄');

// 6b. 同日紅色已批時段必須攔截；藍色申請中不納入衝突判斷。
const redApprovedFixtureId = 'red-approved-fixture';
teamupEvents[redApprovedFixtureId] = {
  id: redApprovedFixtureId,
  subcalendar_ids: [102],
  title: '已批准借用',
  start_dt: '2027-05-16T14:00:00+08:00',
  end_dt: '2027-05-16T15:00:00+08:00',
};
const rowsBeforeRedConflict = sheets.VenueBookings._data.length;
const redConflictSubmit = callPost('submitVenueRequest', {
  venueId: 'HQ-1704', name: '紅色已批衝突測試', position: '領袖', phone: '91234567',
  activityName: '紅色已批衝突測試', attendeeCount: 5, agreeRules: true,
  startDate: '2027-05-16T14:30', endDate: '2027-05-16T15:00',
});
assert.strictEqual(redConflictSubmit.ok, false);
assert.strictEqual(redConflictSubmit.error, '該時段已有已批借用，請選擇其他時段後再申請。');
assert.strictEqual(sheets.VenueBookings._data.length, rowsBeforeRedConflict, '紅色已批衝突不可留下 pending 表格列');
const adjacentApprovedCheck = ctx.checkApprovedTeamupOverlap_('2027-05-16T15:00', '2027-05-16T16:00');
assert.strictEqual(adjacentApprovedCheck.ok, true);
assert.strictEqual(adjacentApprovedCheck.conflict, false, '紅色時段 14:00–15:00 與新申請 15:00–16:00 相連但不重疊');
delete teamupEvents[redApprovedFixtureId];

const pendingBeforeApprovalConflict = callPost('submitVenueRequest', {
  venueId: 'HQ-1704', name: '後批核衝突測試', position: '領袖', phone: '91234569',
  activityName: '後批核衝突測試', attendeeCount: 3, agreeRules: true,
  startDate: '2027-05-18T14:30', endDate: '2027-05-18T15:00',
});
assert.strictEqual(pendingBeforeApprovalConflict.ok, true);
teamupEvents['red-approved-after-submit'] = {
  id: 'red-approved-after-submit', subcalendar_ids: [102],
  start_dt: '2027-05-18T14:00:00+08:00', end_dt: '2027-05-18T15:00:00+08:00',
};
const approvalConflict = callPost('confirmVenueBooking', { token, id: pendingBeforeApprovalConflict.data.id });
assert.strictEqual(approvalConflict.ok, false, '審批前再次檢查已批紅色日曆');
assert.ok(approvalConflict.error.includes('另一筆已批借用'));
const venueHeadersForConflict = sheets.VenueBookings._data[0];
const pendingConflictRow = sheets.VenueBookings._data.find(row => row[venueHeadersForConflict.indexOf('id')] === pendingBeforeApprovalConflict.data.id);
assert.strictEqual(pendingConflictRow[venueHeadersForConflict.indexOf('status')], 'pending', '審批衝突時狀態需維持 pending');
assert.ok(teamupEvents[pendingBeforeApprovalConflict.data.teamupEventId], '審批衝突時藍色申請事件需保留');
delete teamupEvents['red-approved-after-submit'];

teamupState.failNextApprovedList = true;
const listFailureRowsBefore = sheets.VenueBookings._data.length;
const listFailureEventsBefore = Object.keys(teamupEvents).length;
const approvedListFailure = callPost('submitVenueRequest', {
  venueId: 'HQ-1704', name: '已批清單讀取失敗測試', phone: '91234567',
  activityName: '已批清單讀取失敗測試', attendeeCount: 5, agreeRules: true,
  startDate: '2027-05-17T14:30', endDate: '2027-05-17T15:00',
});
assert.strictEqual(approvedListFailure.ok, false, '讀取紅色已批事件失敗時必須 fail closed');
assert.ok(approvedListFailure.error.includes('無法確認已批借用'));
assert.strictEqual(sheets.VenueBookings._data.length, listFailureRowsBefore, '紅色清單失敗不可建立 pending 表格列');
assert.strictEqual(Object.keys(teamupEvents).length, listFailureEventsBefore, '紅色清單失敗時不可建立藍色事件');
console.log('  ✓ 只攔截紅色已批重疊；紅色查詢異常 fail-closed，均不留 pending');

// 7. 申請人提交借場（電話帶前導 0：05129876，時段為未來香港時間）
const submit1 = callPost('submitVenueRequest', {
  venueId: 'HQ-1704',
  name: '陳大文領袖',
  position: '團長',
  activityName: '團長會議',
  attendeeCount: 12,
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
assert.ok(pendingEvId, '成員系統提交後應由後台建立 Teamup 申請中事件');
assert.deepStrictEqual(teamupEvents[pendingEvId].subcalendar_ids, [101], '新申請必須直接建立在藍色「申請中」子日曆');
assert.ok(String(teamupEvents[pendingEvId].title).includes('團長會議'), 'Teamup 事件標題應採用活動名稱');
assert.strictEqual(teamupEvents[pendingEvId].who, '陳大文領袖 團長', '領袖姓名及職位應寫入 Teamup 內建 who 欄位');
assert.deepStrictEqual(teamupEvents[pendingEvId].custom, {
  '1': '12',
}, 'Teamup event custom 欄位應收到參加人數');
const bookingHeaders = sheets.VenueBookings._data[0];
const bookingRow = sheets.VenueBookings._data.find(row => row[bookingHeaders.indexOf('id')] === booking1Id);
assert.strictEqual(bookingRow[bookingHeaders.indexOf('activityName')], '團長會議');
assert.strictEqual(bookingRow[bookingHeaders.indexOf('attendeeCount')], 12);

const pendingRowsBeforeBlueOverlap = sheets.VenueBookings._data.length;
const secondPendingOverlap = callPost('submitVenueRequest', {
  venueId: 'HQ-1704', name: '同時段另一申請', position: '副團長', phone: '91234568',
  activityName: '同時段另一申請', attendeeCount: 4, agreeRules: true,
  startDate: '2027-05-15T20:30', endDate: '2027-05-15T21:00',
});
assert.strictEqual(secondPendingOverlap.ok, true, '藍色申請中與另一藍色申請重疊時仍可提交');
assert.strictEqual(sheets.VenueBookings._data.length, pendingRowsBeforeBlueOverlap + 1);
assert.deepStrictEqual(teamupEvents[secondPendingOverlap.data.teamupEventId].subcalendar_ids, [101]);
console.log('  ✓ 藍色申請中相撞仍可並存；紅色已批先由後台判斷');

// 8. 模擬 Gateway 離線（-2012）：一鍵批准必須明確報錯，唔可以靜默假批核或寄假密碼
ttlockState.gatewayOffline = true;
const failApprove = callPost('approveVenueBooking', { token, id: booking1Id });
assert.strictEqual(failApprove.ok, false, '網關離線時預設必須拒絕假批核');
assert.ok(failApprove.error.includes('Gateway') || failApprove.error.includes('網關'), '錯誤訊息需清楚指出網關問題：' + failApprove.error);
assert.strictEqual(sentEmails.length, 0, '寫鎖失敗時絕不可寄出無效密碼電郵');
const afterFailList = callGet('getVenueBookings', { token });
assert.strictEqual(afterFailList.data.find(x => x.id === booking1Id).status, 'pending', '失敗後狀態必須維持 pending 以便重試');
console.log('  ✓ Gateway 離線時嚴格攔截，不吞錯、不假批核、不寄假密碼');

// 9. Gateway 恢復在線 → 一鍵批准：驗證香港 +08:00 時間（前後 15 分鐘緩衝）、前導 0 密碼 '0512' 純文字回傳、Teamup 轉紅及電郵
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
const booking1SheetRow = sheets.VenueBookings._data.findIndex(row => row[vbHeaders.indexOf('id')] === booking1Id) + 1;
assert.ok(booking1SheetRow > 1, '應找到 booking1 對應的 Sheet 列');
assert.strictEqual(sheets.VenueBookings._formats[`${booking1SheetRow}:${passcodeCol}`], '@', 'passcode 儲存格必須設為純文字 @');
assert.strictEqual(sheets.VenueBookings._formats[`${booking1SheetRow}:${pwdRefCol}`], '@', 'pwdRef 儲存格必須設為純文字 @');

const afterOkList = callGet('getVenueBookings', { token });
const row1 = afterOkList.data.find(x => x.id === booking1Id);
assert.strictEqual(row1.status, 'approved');
assert.strictEqual(row1.passcode, '0512');
assert.strictEqual(row1.pwdRef, String(lastLockCall.keyboardPwdId));
const approvedEvId = okApprove.data.teamupEventId;
assert.ok(approvedEvId && approvedEvId !== pendingEvId, '批核應建立新的紅色事件並回傳新 event ID');
assert.strictEqual(teamupEvents[pendingEvId], undefined, '紅色事件建立成功後應刪除舊藍色事件');
assert.deepStrictEqual(teamupEvents[approvedEvId].subcalendar_ids, [102], '批核事件應建立在紅色已批子日曆');
assert.deepStrictEqual(teamupEvents[approvedEvId].custom, {
  '1': '12',
}, '批核事件需保留參加人數自訂欄位');
assert.strictEqual(teamupEvents[approvedEvId].who, '陳大文領袖 團長', '批核事件需保留領袖姓名及職位');
assert.strictEqual(sentEmails.length, 1);
assert.ok(sentEmails[0].htmlBody.includes('0512#'), '電郵應包含入場密碼及 # 提示');
console.log('  ✓ 一鍵批准完整打通：香港時區準確、前導 0 密碼純文字寫回 Sheet、pwdRef／Teamup／電郵全部回傳');

// 10. 驗證撞碼自動退避規則（頭4位 '0512' 被拒 → 先試電話尾4位 '9876'，尾4亦撞才 +1 得 '0513'）及 confirmOnly → reissue 補發流程
ttlockState.rejectCodes.add('0512');
const submit2 = callPost('submitVenueRequest', {
  venueId: 'HQ-1704',
  name: '李小明副團長',
  position: '副團長',
  activityName: '訓練籌備',
  attendeeCount: 20,
  phone: '05129876',
  email: 'lee@example.com',
  troop: '港島第 1888 旅',
  purpose: '訓練籌備',
  startDate: '2027-05-16T20:00',
  endDate: '2027-05-16T22:00',
  agreeRules: 'TRUE',
});
const booking2Id = submit2.data.id;
let ev2Id = submit2.data.teamupEventId;

// 先做「僅確認（唔設鎖）」：建立紅色事件後刪除原藍色事件
const confirmRes = callPost('confirmVenueBooking', { token, id: booking2Id });
assert.strictEqual(confirmRes.ok, true);
assert.ok(confirmRes.data.teamupEventId && confirmRes.data.teamupEventId !== ev2Id);
assert.strictEqual(teamupEvents[ev2Id], undefined, '建立紅色事件後應刪除藍色事件');
ev2Id = confirmRes.data.teamupEventId;

// 隨後點「補發電子鎖匙」（即使無傳 reissue，因為未有真實 pwdRef 亦允許直接補發；撞碼先試電話尾4）
const reissueRes = callPost('approveVenueBooking', { token, id: booking2Id, reissue: true });
assert.strictEqual(reissueRes.ok, true, '補發鎖匙應成功：' + JSON.stringify(reissueRes));
assert.strictEqual(reissueRes.data.passcode, '9876', '頭 4 位撞碼時應改用電話尾 4 位 9876');
assert.strictEqual(reissueRes.data.lockWritten, true);
assert.strictEqual(teamupEvents[ev2Id], undefined, '補發成功後亦應刪除舊紅色事件');
ev2Id = reissueRes.data.teamupEventId;

// 再令頭4及尾4都撞碼，確認兩者失敗後才 +1；同時確保 Teamup 備註只留最新密碼
ttlockState.rejectCodes.add('9876');
const reissueAgain = callPost('approveVenueBooking', { token, id: booking2Id, reissue: true });
assert.strictEqual(reissueAgain.ok, true);
assert.strictEqual(reissueAgain.data.passcode, '0513', '頭4和電話尾4均撞碼後才應使用 +1 備選碼');
assert.strictEqual(teamupEvents[ev2Id], undefined, '再次補發成功後應刪除上一個紅色事件');
ev2Id = reissueAgain.data.teamupEventId;
const pwdNoteMatches = String(teamupEvents[ev2Id].notes || '').match(/🔑 密碼：/g) || [];
assert.strictEqual(pwdNoteMatches.length, 1, '重製鎖匙後 Teamup 備註只應保留最新一行密碼');
console.log('  ✓ 電話頭4撞碼後先改用尾4；僅確認後補發鎖匙及重製鎖匙覆寫 Teamup 備註全部通過');

// 11. 驗證實機常見陷阱：Google Sheet 自動將日期轉為 Date 物件或 .000Z 字串時，Teamup 仍收標準 +08:00 唔彈 HTTP 400
const submit3 = callPost('submitVenueRequest', {
  venueId: 'HQ-1704',
  name: '張三領袖',
  position: '領袖',
  activityName: '支部集會',
  attendeeCount: 8,
  phone: '93651111',
  email: 'cheung@example.com',
  troop: '港島第 206 旅',
  purpose: '支部集會',
  startDate: '2027-06-01T22:47:00.000Z',
  endDate: '2027-06-01T23:47:00.000Z',
  agreeRules: 'TRUE',
});
assert.strictEqual(submit3.ok, true);
assert.ok(submit3.data.teamupEventId && teamupEvents[submit3.data.teamupEventId], '帶 .000Z 嘅時間應成功建立並回傳 Teamup 事件 ID');
const approve3 = callPost('approveVenueBooking', { token, id: submit3.data.id });
assert.strictEqual(approve3.ok, true);
assert.strictEqual(approve3.data.passcode, '9365');
assert.strictEqual(approve3.data.teamupSynced, true, '批核時 Teamup 亦應零錯誤同步');
console.log('  ✓ .000Z／Date 時間自動正規化為香港 +08:00 無毫秒格式，徹底消除 Teamup HTTP 400');

// 12. 有效頭4碼撞碼時改試電話尾4；過期同碼優先更新舊 keyboardPwdId，不新增另一條 key
const expiredPwdId = 909001;
const oldStart = Date.now() - 30 * 24 * 60 * 60 * 1000;
const oldEnd = Date.now() - 24 * 60 * 60 * 1000;
ttlockState.existingPwds.push({
  keyboardPwdId: expiredPwdId, lockId: 170488, keyboardPwd: '6107',
  startDate: oldStart, endDate: oldEnd, keyboardPwdName: '舊申請',
});
const addedBeforeReuse = ttlockState.addedPwds.length;
const changedBeforeReuse = ttlockState.changedPwds.length;
const reusedExpired = ctx.createTtlockPasscode_(
  '61070452', '2027-06-10T19:00', '2027-06-10T20:00', '重用過期碼測試', '170488'
);
assert.strictEqual(reusedExpired.passcode, '6107');
assert.strictEqual(reusedExpired.pwdRef, String(expiredPwdId));
assert.strictEqual(reusedExpired.reused, true);
assert.strictEqual(ttlockState.addedPwds.length, addedBeforeReuse, '重用過期碼不得呼叫 add 新增 key');
assert.strictEqual(ttlockState.changedPwds.length, changedBeforeReuse + 1, '應呼叫 change 更新舊 key 時段');

// 舊 key 的時段雖早於新申請，但它此刻尚未到期；不可改寫原 key，應改用尾4 0452。
// 這覆蓋「前一位用戶下午時段仍有效，後一位申請晚些時段」的實際情況。
const tailFirst = ctx.createTtlockPasscode_(
  '61070452', '2027-07-10T19:00', '2027-07-10T20:00', '尾4測試', '170488'
);
assert.strictEqual(tailFirst.passcode, '0452', '頭4撞碼必須先改用尾4；兩者都撞才可 +1');

// 12b. 活躍 10–12 的 6107 不可被 13–14 申請當作成功；新增 API 若錯回既有 ID，必須拒絕並試下一候選。
const existingActiveId = 700001;
ttlockState.existingPwds.length = 0;
ttlockState.existingPwds.push({
  keyboardPwdId: existingActiveId, keyboardPwd: '6107',
  startDate: Date.parse('2027-08-10T10:00:00+08:00'),
  endDate: Date.parse('2027-08-10T12:15:00+08:00'),
});
ttlockState.returnExistingPwdIdOnce = true;
const addedBeforeExistingIdCase = ttlockState.addedPwds.length;
const existingIdGuard = ctx.createTtlockPasscode_(
  '61070452', '2027-08-10T13:00', '2027-08-10T14:00', '既有 ID 假成功測試', '170488'
);
assert.strictEqual(existingIdGuard.passcode, '6108', '6107 在使用中、尾4回傳既有 ID 時，應改試下一遞增候選');
assert.notStrictEqual(existingIdGuard.pwdRef, String(existingActiveId), '不可把 API 回傳既有 keyboardPwdId 當作新 key 成功');
assert.strictEqual(ttlockState.addedPwds.length, addedBeforeExistingIdCase + 1, '只有最終有效的新候選可計入新增');
assert.strictEqual(ttlockState.addedPwds[ttlockState.addedPwds.length - 1].keyboardPwd, '6108');
const addedBeforeMissingIdCase = ttlockState.addedPwds.length;
ttlockState.returnMissingPwdIdOnce = true;
assert.throws(
  () => ctx.createTtlockPasscode_('77778888', '2027-08-11T13:00', '2027-08-11T14:00', '缺少 ID 測試', '170488'),
  /keyboardPwdId/,
  '即使 errcode=0，沒有 keyboardPwdId 亦不得假報成功'
);
assert.strictEqual(ttlockState.addedPwds.length, addedBeforeMissingIdCase, '無 ID 回應不得假裝成功新增');
console.log('  ✓ TTLock 拒絕既有／缺失 keyboardPwdId 假成功；13–14 不會誤報 6107 已設定');

console.log('  ✓ TTLock 過期鍵碼更新原 key；有效頭4撞碼改用尾4 0452');

// 13. Teamup 建紅色失敗保留藍色；刪除藍色失敗時回滾紅色，避免留下兩筆
const submit4 = callPost('submitVenueRequest', {
  venueId: 'HQ-1704', name: '批核建立失敗測試', position: '領袖', phone: '91231234',
  activityName: '批核建立失敗測試', attendeeCount: 3, agreeRules: true,
  startDate: '2027-07-20T19:00', endDate: '2027-07-20T20:00',
});
assert.strictEqual(submit4.ok, true);
const eventCountBeforeCreateFail = Object.keys(teamupEvents).length;
teamupState.failNextCreate = true;
const createFail = callPost('confirmVenueBooking', { token, id: submit4.data.id });
assert.strictEqual(createFail.ok, true);
assert.ok(createFail.data.warn.includes('HTTP 503'));
assert.strictEqual(Object.keys(teamupEvents).length, eventCountBeforeCreateFail, '建立紅色失敗不可刪藍色或留下額外事件');
assert.deepStrictEqual(teamupEvents[submit4.data.teamupEventId].subcalendar_ids, [101], '建立失敗時原藍色事件必須保留');

const submit5 = callPost('submitVenueRequest', {
  venueId: 'HQ-1704', name: '批核刪除失敗測試', position: '領袖', phone: '91231235',
  activityName: '批核刪除失敗測試', attendeeCount: 4, agreeRules: true,
  startDate: '2027-07-21T19:00', endDate: '2027-07-21T20:00',
});
assert.strictEqual(submit5.ok, true);
const eventCountBeforeDeleteFail = Object.keys(teamupEvents).length;
teamupState.failNextDelete = true;
const deleteFail = callPost('confirmVenueBooking', { token, id: submit5.data.id });
assert.strictEqual(deleteFail.ok, true);
assert.ok(deleteFail.data.warn.includes('HTTP 403'));
assert.strictEqual(Object.keys(teamupEvents).length, eventCountBeforeDeleteFail, '刪除藍色失敗時應回滾新紅色事件');
assert.deepStrictEqual(teamupEvents[submit5.data.teamupEventId].subcalendar_ids, [101], '刪除失敗時原藍色事件保留，供職員重試');

const submit6 = callPost('submitVenueRequest', {
  venueId: 'HQ-1704', name: '批核刪除網絡錯誤測試', position: '領袖', phone: '91231236',
  activityName: '批核刪除網絡錯誤測試', attendeeCount: 5, agreeRules: true,
  startDate: '2027-07-22T19:00', endDate: '2027-07-22T20:00',
});
assert.strictEqual(submit6.ok, true);
const eventCountBeforeThrownDelete = Object.keys(teamupEvents).length;
teamupState.throwNextDelete = true;
const networkDeleteFail = callPost('confirmVenueBooking', { token, id: submit6.data.id });
assert.strictEqual(networkDeleteFail.ok, true);
assert.ok(networkDeleteFail.data.warn.includes('連線錯誤'));
assert.strictEqual(Object.keys(teamupEvents).length, eventCountBeforeThrownDelete, '刪除請求拋出連線錯誤時亦應回滾紅色事件');
assert.deepStrictEqual(teamupEvents[submit6.data.teamupEventId].subcalendar_ids, [101]);

const submit7 = callPost('submitVenueRequest', {
  venueId: 'HQ-1704', name: '批核回滾失敗告警測試', position: '領袖', phone: '91231237',
  activityName: '批核回滾失敗告警測試', attendeeCount: 6, agreeRules: true,
  startDate: '2027-07-23T19:00', endDate: '2027-07-23T20:00',
});
assert.strictEqual(submit7.ok, true);
const eventCountBeforeRollbackFail = Object.keys(teamupEvents).length;
teamupState.failDeleteCount = 2;
const rollbackFail = callPost('confirmVenueBooking', { token, id: submit7.data.id });
assert.strictEqual(rollbackFail.ok, true);
assert.ok(rollbackFail.data.warn.includes('撤銷紅色事件亦失敗'));
assert.ok(rollbackFail.data.warn.includes('tup-'), '回滾失敗告警應包含需人工檢查的紅色事件 ID');
assert.strictEqual(Object.keys(teamupEvents).length, eventCountBeforeRollbackFail + 1, '模擬 Teamup 同時拒絕刪除與回滾時應保留可定位的紅色事件供人工處理');
console.log('  ✓ Teamup 建立紅色失敗保留藍色；刪除失敗回滾並告警，回滾失敗會提供人工檢查 ID');

console.log('\n🎉 場地借用電子鎖與回傳整合測試全部通過！');
