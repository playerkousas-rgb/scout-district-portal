/**
 * gs/Code.gs 邏輯測試 — 用 node 直接跑，唔使開 Apps Script。
 *   node scripts/test-course-setup-gs.js
 * 涵蓋：🆕 新制直入（v4.14.0）createCourseSheet／pushCourseSetup／
 *      pullCourseSheetRaw／getCourseSetup＋CourseLinks sheetId/setupJson 欄。
 * 做法：同 test-circulars-gs.js 一樣，vm＋記憶體 Sheet；另 stub DriveApp
 * （總模版複製＋分享）同 SpreadsheetApp.openById（班 Sheet 直讀寫）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs'), 'utf8');

// ── 假 Sheet ────────────────────────────────────────────────
function makeSheet(name, rows) {
  const data = rows.map(r => r.slice());
  return {
    name,
    getLastRow: () => data.length,
    getLastColumn: () => (data[0] ? data[0].length : 0),
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValues: () => data.slice(row - 1, row - 1 + numRows).map(r => r.slice(col - 1, col - 1 + numCols)),
        getValue: () => (data[row - 1] || [])[col - 1],
        setValue: (v) => { data[row - 1][col - 1] = v; },
        setValues: (vals) => { vals.forEach((r, i) => r.forEach((v, j) => { data[row - 1 + i][col - 1 + j] = v; })); },
        setFontWeight: () => ({ setBackground: () => {} }),
        setBackground: () => {},
      };
    },
    appendRow: (row) => { data.push(row.slice()); },
    deleteRow: (idx) => { data.splice(idx - 1, 1); },
    setFrozenRows: () => {}, setFrozenColumns: () => {}, clear: () => { data.length = 0; },
    _data: data,
  };
}

// A1 轉行列（淨支援 W1:X5 呢類簡單範圍，夠 paramsWX 用）
function a1ToRange(a1) {
  const colN = (s) => { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
  const m = String(a1).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) throw new Error('stub 只支援 A1 範圍：' + a1);
  return { row: Number(m[2]), col: colN(m[1]), numRows: Number(m[4]) - Number(m[2]) + 1, numCols: colN(m[3]) - colN(m[1]) + 1 };
}

// ── 假班 Sheet（夠大＋自動增長，記低每次寫入） ──
const writeLog = [];
function makeCourseTab(name, rows = 110, cols = 25) {
  const data = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
  return {
    name,
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange(a, b) {
      let row = a, col = b, numRows = 1, numCols = 1;
      if (typeof a === 'string') { const g = a1ToRange(a); row = g.row; col = g.col; numRows = g.numRows; numCols = g.numCols; }
      return {
        getValues: () => data.slice(row - 1, row - 1 + numRows).map(r => r.slice(col - 1, col - 1 + numCols)),
        getValue: () => (data[row - 1] || [])[col - 1],
        setValue: (v) => {
          while (data.length < row) data.push(Array.from({ length: cols }, () => ''));
          data[row - 1][col - 1] = v;
          writeLog.push({ tab: name, row, col, value: v });
        },
      };
    },
    _data: data,
  };
}
const COURSE_TABS = ['Input01 訓練班預算', 'Input02 訓練班資料', 'Input03 時間表', 'Input04_Print支出表',
  '表格回應', '參數', 'Print_通告', 'Print_接納通知書', 'Print_財政預算', 'Print_訓練班完成報告',
  'Print_領取證書紀錄', 'Print_總會資助計劃'];
function makeCourseSs() {
  const tabs = {};
  COURSE_TABS.forEach(t => { tabs[t] = makeCourseTab(t); });
  // 參數 W/X 常數（W=23, X=24）
  tabs['參數']._data[1][22] = '成員系統報名網址'; tabs['參數']._data[1][23] = 'https://member.example/training';
  tabs['參數']._data[2][22] = 'FPS 識別碼'; tabs['參數']._data[2][23] = '102866183';
  return { getSheetByName: (n) => tabs[n] || null, _tabs: tabs };
}
let courseSs = makeCourseSs();
const openedIds = [];

// ── 假 Drive（總模版複製） ──
let copyName = '', copyFolder = null, sharedTo = '', shareShouldFail = false, copyShouldFail = false;
const fakeFile = {
  getId: () => 'sheet-new-001',
  addEditor: (email) => { if (shareShouldFail) throw new Error('share denied'); sharedTo = email; },
};

const LINK_HEADERS = ['courseId', 'districtCode', 'title', 'badgeName', 'section', 'courseNo', 'sessionsText',
  'eligibility', 'fee', 'originalFee', 'subsidyNote', 'deadline', 'quota', 'filled',
  'venue', 'noticeUrl', 'contact',
  'scriptExecUrl', 'scriptApiKey', 'driveFolderId',
  'apiBase', 'apiKey',
  'active', 'createdAt',
  'fpsQrPayload', 'fpsAmount', 'fpsReference', 'fpsAccountName', 'fpsAccountNumber', 'fpsUpdatedAt',
  'sheetId', 'setupJson'];
function linkRow(o) { return LINK_HEADERS.map(h => (o[h] === undefined ? '' : o[h])); }

const sheets = {
  Config: makeSheet('Config', [['key', 'value', '說明'],
    ['districtCode', 'SKW', ''], ['districtName', '筲箕灣區', ''],
    ['COURSE_TEMPLATE_ID', 'tpl-123', ''], ['COURSE_FOLDER_ID', '', '']]),
  Perms: makeSheet('Perms', [['cardId', 'DC', 'STAFF'], ['training', 'edit', 'edit']]),
  Users: makeSheet('Users', [['email', 'role', 'active', 'level'], ['dc@x.org', 'DC', 'TRUE', 1]]),
  Roles: makeSheet('Roles', [['role', 'label', 'protected', 'level'], ['DC', '區總監', 'TRUE', 1]]),
  CourseLinks: makeSheet('CourseLinks', [LINK_HEADERS,
    linkRow({ courseId: 'cl-old', title: '舊制班', scriptExecUrl: 'https://course-script/exec', scriptApiKey: 'k1', active: 'TRUE' }),
    linkRow({ courseId: 'cl-direct', title: '直入班', sheetId: 'sheet-direct-1', active: 'TRUE' }),
  ]),
  System: makeSheet('System', [['key', 'value'], ['locked', 'FALSE'], ['lockMessage', '維護中']]),
};

let fetchResult = '{}';
let lastFetchUrl = '', lastFetchPayload = '';
const ctx = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => (sheets[n] = makeSheet(n, [])),
    }),
    openById: (id) => { openedIds.push(id); return courseSs; },
  },
  DriveApp: {
    getFileById: (id) => {
      if (copyShouldFail || id !== 'tpl-123') throw new Error('file not found: ' + id);
      return { makeCopy: (name, folder) => { copyName = name; copyFolder = folder || null; courseSs = makeCourseSs(); return fakeFile; } };
    },
    getFolderById: (id) => ({ getId: () => id }),
  },
  Session: { getScriptTimeZone: () => 'Asia/Hong_Kong' },
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const iso = new Date(d.getTime() + 8 * 3600 * 1000).toISOString();
      if (fmt === 'yyyy-MM-dd') return iso.slice(0, 10);
      return iso;
    },
    getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
    base64EncodeWebSafe: (str) => Buffer.from(String(str), 'utf8').toString('base64url'),
    base64DecodeWebSafe: (str) => Buffer.from(String(str), 'base64url'),
    newBlob: (buf) => ({ getDataAsString: () => Buffer.from(buf).toString('utf8') }),
    computeDigest: (_alg, str) => Array.from(String(str)).map(c => c.charCodeAt(0) % 128),
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
  },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  MailApp: { sendEmail: () => {} },
  UrlFetchApp: {
    fetch: (url, opt) => {
      lastFetchUrl = String(url); lastFetchPayload = String((opt && opt.payload) || '');
      return { getContentText: () => fetchResult, getResponseCode: () => 200 };
    },
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });

function tokenFor(email, role) { return ctx.makeToken_(email, role, 12); }

let pass = 0;
function check(label, fn) { fn(); pass++; console.log('  ✓ ' + label); }

console.log('新制直入（create／push／pull-raw／getSetup）測試');

const dcToken = tokenFor('dc@x.org', 'DC');
const badToken = 'nope';

check('壞 token → 4 個 action 全部被擋', () => {
  assert.strictEqual(ctx.createCourseSheet_(badToken, {}).ok, false);
  assert.strictEqual(ctx.pushCourseSetup_(badToken, {}).ok, false);
  assert.strictEqual(ctx.pullCourseSheetRaw_(badToken, {}).ok, false);
  assert.strictEqual(ctx.getCourseSetup_(badToken, 'x').ok, false);
});

check('未設總模版 → create 報錯＋指引（唔會開表）', () => {
  const cfg = sheets.Config._data;
  const i = cfg.findIndex(r => r[0] === 'COURSE_TEMPLATE_ID');
  const keep = cfg[i][1]; cfg[i][1] = '';
  const r = ctx.createCourseSheet_(dcToken, { setup: { courseName: 'X班' }, cells: [] });
  assert.strictEqual(r.ok, false);
  assert.ok(/COURSE_TEMPLATE_ID/.test(r.error));
  cfg[i][1] = keep;
});

check('冇班名 → create 報錯', () => {
  assert.strictEqual(ctx.createCourseSheet_(dcToken, { setup: {}, cells: [] }).ok, false);
});

check('錯 template ID → 複製失敗有中文錯', () => {
  copyShouldFail = true;
  const r = ctx.createCourseSheet_(dcToken, { setup: { courseName: 'X班' }, cells: [] });
  assert.strictEqual(r.ok, false);
  assert.ok(/複製總模版失敗/.test(r.error));
  copyShouldFail = false;
});

const DEMO_CELLS = [
  { tab: 'Input01 訓練班預算', row: 1, col: 2, value: '第2屆急救工作坊' },
  { tab: 'Input02 訓練班資料', row: 4, col: 2, value: '22' },
  { tab: 'Print_通告', row: 23, col: 3, value: '已宣誓成員' },
  { tab: '唔存在嘅頁', row: 1, col: 1, value: 'x' },
];
let newCourseId = '';
check('create 成功：複製名啱＋寫入指定格＋開班登記＋分享', () => {
  writeLog.length = 0; sharedTo = '';
  const r = ctx.createCourseSheet_(dcToken, {
    link: { courseId: 'cl-new', title: '第2屆急救工作坊', fee: '25' },
    setup: { courseName: '第2屆急救工作坊', fee: '25' },
    cells: DEMO_CELLS, clEmail: 'cl@example.com',
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.created, true);
  assert.strictEqual(r.data.sheetId, 'sheet-new-001');
  assert.ok(r.data.sheetUrl.includes('sheet-new-001'));
  assert.strictEqual(r.data.cellsApplied, 3);
  assert.deepStrictEqual([...r.data.skippedTabs], ['唔存在嘅頁']);
  assert.strictEqual(copyName, '【訓練班】第2屆急救工作坊');
  assert.strictEqual(sharedTo, 'cl@example.com');
  newCourseId = r.data.courseId;
  // 寫入位置啱
  assert.strictEqual(courseSs._tabs['Input01 訓練班預算']._data[0][1], '第2屆急救工作坊');
  assert.strictEqual(courseSs._tabs['Input02 訓練班資料']._data[3][1], '22');
  assert.strictEqual(courseSs._tabs['Print_通告']._data[22][2], '已宣誓成員');
  // CourseLinks 行
  const got = ctx.getCourseLinks_(dcToken).data.filter(x => x.courseId === 'cl-new')[0];
  assert.ok(got);
  assert.strictEqual(got.sheetId, 'sheet-new-001');
  assert.strictEqual(got.hasSetup, true);
  assert.strictEqual(got.setupJson, undefined, 'list 唔回 setupJson 本體');
});

check('分享失敗 → warning 唔阻開班', () => {
  shareShouldFail = true;
  const r = ctx.createCourseSheet_(dcToken, {
    link: { courseId: 'cl-new2', title: '分享失敗班' },
    setup: { courseName: '分享失敗班' }, cells: [], clEmail: 'bad@x',
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(/分享/.test(r.data.shareWarning));
  assert.strictEqual(r.data.sharedTo, '');
  shareShouldFail = false;
});

check('push 成功：寫入格＋setupJson 更新', () => {
  writeLog.length = 0;
  const r = ctx.pushCourseSetup_(dcToken, {
    courseId: 'cl-direct',
    setup: { courseName: '直入班（改咗）' },
    cells: [{ tab: 'Input02 訓練班資料', row: 4, col: 2, value: '30' }],
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.pushed, true);
  assert.strictEqual(r.data.cellsApplied, 1);
  assert.ok(openedIds.includes('sheet-direct-1'));
  assert.strictEqual(courseSs._tabs['Input02 訓練班資料']._data[3][1], '30');
  const g = ctx.getCourseSetup_(dcToken, 'cl-direct');
  assert.ok(g.ok);
  assert.strictEqual(g.data.setup.courseName, '直入班（改咗）');
});

check('push 人手班（冇 sheetId）→ 報錯指引', () => {
  const r = ctx.pushCourseSetup_(dcToken, { courseId: 'cl-old', setup: {}, cells: [] });
  assert.strictEqual(r.ok, false);
  assert.ok(/人手建表/.test(r.error));
});

check('push／getSetup 唔存在 courseId → 報錯', () => {
  assert.strictEqual(ctx.pushCourseSetup_(dcToken, { courseId: 'cl-nope', cells: [] }).ok, false);
  assert.strictEqual(ctx.getCourseSetup_(dcToken, 'cl-nope').ok, false);
});

check('pull direct（冇 URL）：12 tabs＋paramsWX＋pulledAt', () => {
  openedIds.length = 0;
  const r = ctx.pullCourseSheetRaw_(dcToken, { courseId: 'cl-direct' });
  assert.ok(r.ok, JSON.stringify(r));
  const d = r.data;
  ['input01', 'input02', 'input03', 'input04', 'resp', 'paramsWX', 'notice', 'accept',
    'finance', 'completion', 'cert', 'subsidy', 'pulledAt'].forEach(k => assert.ok(k in d, '缺 ' + k));
  assert.ok(Array.isArray(d.input02) && d.input02.length > 0);
  assert.strictEqual(d.paramsWX[1][1], 'https://member.example/training');
  assert.strictEqual(d.paramsWX[2][1], '102866183');
  assert.ok(openedIds.includes('sheet-direct-1'));
});

check('pull URL 優先：送 getCourseSheetRaw＋apiKey，原樣回傳', () => {
  fetchResult = JSON.stringify({ ok: true, data: { input01: [['x']], pulledAt: 't' } });
  const r = ctx.pullCourseSheetRaw_(dcToken, { courseId: 'cl-old' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(lastFetchUrl, 'https://course-script/exec');
  const sent = JSON.parse(lastFetchPayload);
  assert.strictEqual(sent.action, 'getCourseSheetRaw');
  assert.strictEqual(sent.apiKey, 'k1');
  assert.strictEqual(r.data.pulledAt, 't');
});

check('pull URL 端報錯 → 原樣傳返', () => {
  fetchResult = JSON.stringify({ ok: false, error: 'Unauthorized: invalid or missing apiKey' });
  const r = ctx.pullCourseSheetRaw_(dcToken, { courseId: 'cl-old' });
  assert.strictEqual(r.ok, false);
  assert.ok(/Unauthorized/.test(r.error));
});

check('pull 又冇 URL 又冇 sheetId → 報錯指引', () => {
  ctx.saveCourseLink_(dcToken, { courseId: 'cl-bare', title: '乜都冇班' });
  const r = ctx.pullCourseSheetRaw_(dcToken, { courseId: 'cl-bare' });
  assert.strictEqual(r.ok, false);
  assert.ok(/\/exec|自動建表/.test(r.error));
});

check('getCourseSetup：有 setup 回物件；冇回 null', () => {
  const g1 = ctx.getCourseSetup_(dcToken, 'cl-new');
  assert.ok(g1.ok);
  assert.strictEqual(g1.data.sheetId, 'sheet-new-001');
  assert.strictEqual(g1.data.setup.courseName, '第2屆急救工作坊');
  const g2 = ctx.getCourseSetup_(dcToken, 'cl-old');
  assert.ok(g2.ok);
  assert.strictEqual(g2.data.setup, null);
});

check('saveCourseLink 照存 sheetId／setupJson；undefined＝保留', () => {
  const r = ctx.saveCourseLink_(dcToken, { courseId: 'cl-old', title: '舊制班', sheetId: 's-1', setupJson: '{"a":1}' });
  assert.ok(r.ok);
  let got = ctx.getCourseLinks_(dcToken).data.filter(x => x.courseId === 'cl-old')[0];
  assert.strictEqual(got.sheetId, 's-1');
  assert.strictEqual(got.hasSetup, true);
  const r2 = ctx.saveCourseLink_(dcToken, { courseId: 'cl-old', title: '舊制班（改名）' });
  assert.ok(r2.ok);
  got = ctx.getCourseLinks_(dcToken).data.filter(x => x.courseId === 'cl-old')[0];
  assert.strictEqual(got.sheetId, 's-1', 'undefined 要保留舊值');
  assert.strictEqual(got.hasSetup, true);
});

check('健康檢查版本 4.14.0', () => {
  const parsed = JSON.parse(ctx.doGet({ parameter: { action: 'getHealthCheck' } }));
  assert.strictEqual(parsed.data.version, '4.14.0');
});

console.log(`\n全部通過（${pass} 項）✓`);
