/**
 * gs/Code.gs 邏輯測試 — 用 node 直接跑，唔使開 Apps Script。
 *   node scripts/test-circulars-gs.js
 * 涵蓋：📜 區通告（Circulars 職員專用；PDF only，無公開頁）＋ 📥 pullCourseProfile
 *      （由訓練班 Script 讀 getCourseProfile，開班自動填表）。
 * 做法：同 test-news-gs.js 一樣，喺 vm 入面 stub Apps Script 全域物件，
 * 用記憶體 2D 陣列扮 Sheet，直接叫 getCirculars_ / saveCircular_ 等函數。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs'), 'utf8');

// ── 假 Sheet ────────────────────────────────────────────────
function makeSheet(name, rows) {
  const data = rows.map(r => r.slice());
  const sh = {
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
  return sh;
}

const CIRC_HEADERS = ['id', 'districtCode', 'circularNo', 'category', 'title', 'sections', 'sessions',
  'leader', 'eligibility', 'fee', 'originalFee', 'subsidyNote', 'quota', 'deadline',
  'courseId', 'signupUrl', 'uniform', 'remarks', 'contactName', 'contactEmail',
  'contactPhone', 'enquiryNote', 'attachments', 'issueDate', 'issuer', 'signedBy',
  'status', 'publishedAt', 'publishedBy', 'updatedAt', 'createdAt'];
const LINK_HEADERS = ['courseId', 'districtCode', 'title', 'badgeName', 'section', 'courseNo', 'sessionsText',
  'eligibility', 'fee', 'originalFee', 'subsidyNote', 'deadline', 'quota', 'filled',
  'venue', 'noticeUrl', 'contact',
  'scriptExecUrl', 'scriptApiKey', 'driveFolderId',
  'apiBase', 'apiKey',
  'active', 'createdAt',
  'fpsQrPayload', 'fpsAmount', 'fpsReference', 'fpsAccountName', 'fpsAccountNumber', 'fpsUpdatedAt'];

function linkRow(o) { return LINK_HEADERS.map(h => (o[h] === undefined ? '' : o[h])); }

const day = (offset) => {
  const d = new Date(Date.now() + offset * 86400000 + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};

const sheets = {
  Config: makeSheet('Config', [['key', 'value', '說明'],
    ['districtCode', 'SKW', ''], ['districtName', '筲箕灣區', ''],
    ['MEMBER_PORTAL_URL', 'https://member-portal-sigma-swart.vercel.app', '']]),
  Perms: makeSheet('Perms', [['cardId', 'DC', 'STAFF', 'AL'],
    ['circulars', 'edit', 'edit', 'view'], ['training', 'edit', 'edit', 'view']]),
  Users: makeSheet('Users', [['email', 'role', 'active', 'level'],
    ['dc@x.org', 'DC', 'TRUE', 1], ['al@x.org', 'AL', 'TRUE', 5]]),
  Roles: makeSheet('Roles', [['role', 'label', 'protected', 'level'],
    ['DC', '區總監', 'TRUE', 1], ['AL', '助理區領袖', 'TRUE', 5]]),
  CourseLinks: makeSheet('CourseLinks', [LINK_HEADERS,
    linkRow({ courseId: 'cl-01', districtCode: 'SKW', title: '示範訓練班', fee: 100, deadline: day(30), quota: 30, filled: 5, venue: '區總部', noticeUrl: 'https://www.skwscout.org.hk/2607.pdf', contact: '楊德銘 5721 1100', scriptExecUrl: 'https://course-script/exec', scriptApiKey: 'k1', active: 'TRUE' }),
  ]),
  Circulars: makeSheet('Circulars', [CIRC_HEADERS]),
  System: makeSheet('System', [['key', 'value'], ['locked', 'FALSE'], ['lockMessage', '維護中']]),
};

// UrlFetchApp 可換回傳（模擬訓練班 Script）
let fetchResult = '{}';
let lastFetchUrl = '', lastFetchPayload = '';
const ctx = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => (sheets[n] = makeSheet(n, [])),
    }),
  },
  Session: { getScriptTimeZone: () => 'Asia/Hong_Kong' },
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const iso = new Date(d.getTime() + 8 * 3600 * 1000).toISOString();
      if (fmt === 'yyyy-MM-dd') return iso.slice(0, 10);
      if (fmt === 'yyyyMMdd') return iso.slice(0, 10).replace(/-/g, '');
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

console.log('區通告（Circulars）＋ pullCourseProfile 測試');

const dcToken = tokenFor('dc@x.org', 'DC');
const alToken = tokenFor('al@x.org', 'AL');
const badToken = 'nope';

check('缺 Circulars 表 → getCirculars 報錯（唔爆）', () => {
  const keep = sheets.Circulars;
  delete sheets.Circulars;
  const r = ctx.getCirculars_(dcToken);
  assert.strictEqual(r.ok, false);
  sheets.Circulars = keep;
});

check('壞 token → get／save／set／delete 全部被擋', () => {
  assert.strictEqual(ctx.getCirculars_(badToken).ok, false);
  assert.strictEqual(ctx.saveCircular_(badToken, { circularNo: '1', title: 'x' }).ok, false);
  assert.strictEqual(ctx.setCircularStatus_(badToken, 'x', 'published').ok, false);
  assert.strictEqual(ctx.deleteCircular_(badToken, 'x').ok, false);
});

check('空板：items []＋suggestedNo 空字串', () => {
  const r = ctx.getCirculars_(dcToken);
  assert.ok(r.ok);
  assert.strictEqual(r.data.items.length, 0);
  assert.strictEqual(r.data.suggestedNo, '');
});

check('編號／標題必填', () => {
  assert.strictEqual(ctx.saveCircular_(dcToken, { circularNo: '', title: 'x' }).ok, false);
  assert.strictEqual(ctx.saveCircular_(dcToken, { circularNo: '2607', title: '' }).ok, false);
});

let id2607;
check('新增草稿：created＋預設 draft＋issueDate 預設今日＋signupUrl 照存', () => {
  const r = ctx.saveCircular_(dcToken, {
    circularNo: '2607', title: '測試通告', category: '訓練班', issueDate: day(-30),
    signupUrl: 'https://member-portal-sigma-swart.vercel.app/training',
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.created, true);
  id2607 = r.data.id;
  const got = ctx.getCirculars_(dcToken).data.items[0];
  assert.strictEqual(got.status, 'draft');
  assert.strictEqual(got.signupUrl, 'https://member-portal-sigma-swart.vercel.app/training');
  assert.strictEqual(got.url, undefined, 'PDF-only：唔再有公開 url 欄');
});

check('舊欄 formUrl 輸入 → 照收做 signupUrl（相容）', () => {
  const r = ctx.saveCircular_(dcToken, { circularNo: '2608', title: '舊欄測試', formUrl: 'https://forms.gle/abc' });
  assert.ok(r.ok);
  const got = ctx.getCirculars_(dcToken).data.items.filter(n => n.id === r.data.id)[0];
  assert.strictEqual(got.signupUrl, 'https://forms.gle/abc');
  ctx.deleteCircular_(dcToken, r.data.id);
});

check('類別／支部正規化（bogus→其他；陣列→「、」分隔）', () => {
  const r = ctx.saveCircular_(dcToken, { circularNo: '2609', title: '正規化', category: '亂填', sections: ['童軍', '領袖'] });
  assert.ok(r.ok);
  const got = ctx.getCirculars_(dcToken).data.items.filter(n => n.id === r.data.id)[0];
  assert.strictEqual(got.category, '其他');
  assert.strictEqual(got.sections, '童軍、領袖');
  ctx.deleteCircular_(dcToken, r.data.id);
});

check('sessions／attachments 上限 50／20＋JSON round-trip', () => {
  const many = [];
  for (let i = 0; i < 55; i++) many.push({ date: 'd' + i, time: 't', venue: 'v' });
  const atta = [];
  for (let i = 0; i < 25; i++) atta.push({ label: 'a' + i, url: 'https://x/' + i });
  const r = ctx.saveCircular_(dcToken, { circularNo: '2610', title: '上限', sessions: many, attachments: atta });
  assert.ok(r.ok);
  const got = ctx.getCirculars_(dcToken).data.items.filter(n => n.id === r.data.id)[0];
  assert.strictEqual(got.sessions.length, 50);
  assert.strictEqual(got.attachments.length, 20);
  ctx.deleteCircular_(dcToken, r.data.id);
});

check('編號重複被擋；更新自己唔受影響；冇交 issueDate／status 就保留原值', () => {
  const dup = ctx.saveCircular_(dcToken, { circularNo: '2607', title: '撞號' });
  assert.strictEqual(dup.ok, false);
  const upd = ctx.saveCircular_(dcToken, { id: id2607, circularNo: '2607', title: '測試通告（改）' });
  assert.ok(upd.ok && upd.data.created === false);
  const kept = ctx.getCirculars_(dcToken).data.items.filter(n => n.id === id2607)[0];
  assert.strictEqual(kept.issueDate, day(-30), '更新唔可以靜靜雞 reset 發出日期');
  assert.strictEqual(kept.status, 'draft', '更新唔可以靜靜雞郁狀態');
});

let id99;
check('suggestedNo＝最大純數字編號＋1；列表 issueDate 新排先', () => {
  const r = ctx.saveCircular_(dcToken, { circularNo: '99', title: '舊號', issueDate: day(-5) });
  assert.ok(r.ok);
  id99 = r.data.id;
  const b = ctx.getCirculars_(dcToken).data;
  assert.strictEqual(b.suggestedNo, '2608');
  const ids = b.items.map(n => n.id);
  assert.ok(ids.indexOf(id99) < ids.indexOf(id2607), 'issueDate 新嘅排先');
});

check('course snapshot＋isOpen（published 未過期 true；closed false；冇掛接 null）', () => {
  const a = ctx.saveCircular_(dcToken, { circularNo: '2611', title: '掛接班', courseId: 'cl-01', deadline: day(20), status: 'published' });
  assert.ok(a.ok);
  const b = ctx.saveCircular_(dcToken, { circularNo: '2612', title: '已截止', courseId: 'cl-01', status: 'closed' });
  assert.ok(b.ok);
  const items = ctx.getCirculars_(dcToken).data.items;
  const ga = items.filter(n => n.id === a.data.id)[0];
  assert.strictEqual(ga.isOpen, true);
  assert.strictEqual(ga.course.courseId, 'cl-01');
  assert.strictEqual(ga.course.filled, '5');
  assert.strictEqual(ga.course.noticeUrl, 'https://www.skwscout.org.hk/2607.pdf');
  const gb = items.filter(n => n.id === b.data.id)[0];
  assert.strictEqual(gb.isOpen, false);
  const g0 = items.filter(n => n.id === id2607)[0];
  assert.strictEqual(g0.course, null);
  ctx.deleteCircular_(dcToken, a.data.id);
  ctx.deleteCircular_(dcToken, b.data.id);
});

check('更新唔郁鎖死欄（createdAt／publishedBy）', () => {
  const r = ctx.saveCircular_(dcToken, { circularNo: '2613', title: '鎖死欄', status: 'published' });
  assert.ok(r.ok);
  const before = ctx.getCirculars_(dcToken).data.items.filter(n => n.id === r.data.id)[0];
  assert.ok(before.createdAt && before.publishedBy);
  ctx.saveCircular_(dcToken, { id: r.data.id, circularNo: '2613', title: '鎖死欄（改）', createdAt: 'HACK', publishedBy: 'HACK' });
  const after = ctx.getCirculars_(dcToken).data.items.filter(n => n.id === r.data.id)[0];
  assert.strictEqual(after.createdAt, before.createdAt);
  assert.strictEqual(after.publishedBy, before.publishedBy);
  ctx.deleteCircular_(dcToken, r.data.id);
});

check('setCircularStatus：發佈設 publishedAt＋之後唔再郁；非法／唔存在報錯', () => {
  assert.ok(ctx.setCircularStatus_(dcToken, id2607, 'published').ok);
  const at1 = ctx.getCirculars_(dcToken).data.items.filter(n => n.id === id2607)[0].publishedAt;
  assert.ok(at1);
  assert.ok(ctx.setCircularStatus_(dcToken, id2607, 'closed').ok);
  const at2 = ctx.getCirculars_(dcToken).data.items.filter(n => n.id === id2607)[0].publishedAt;
  assert.strictEqual(at2, at1);
  assert.strictEqual(ctx.setCircularStatus_(dcToken, id2607, 'bogus').ok, false);
  assert.strictEqual(ctx.setCircularStatus_(dcToken, 'no-such-id', 'published').ok, false);
  ctx.setCircularStatus_(dcToken, id2607, 'draft');
});

check('刪除：唔存在報錯；刪除後消失', () => {
  assert.strictEqual(ctx.deleteCircular_(dcToken, 'no-such-id').ok, false);
  assert.ok(ctx.deleteCircular_(dcToken, id99).ok);
  const ids = ctx.getCirculars_(dcToken).data.items.map(n => n.id);
  assert.strictEqual(ids.indexOf(id99), -1);
});

check('權限：view 角色 save／delete／setStatus 全被擋', () => {
  assert.strictEqual(ctx.saveCircular_(alToken, { circularNo: '2700', title: 'x' }).ok, false);
  assert.strictEqual(ctx.deleteCircular_(alToken, id2607).ok, false);
  assert.strictEqual(ctx.setCircularStatus_(alToken, id2607, 'published').ok, false);
  assert.ok(ctx.getCirculars_(alToken).ok, '讀列表只需登入');
});

check('signupUrl 500 字上限', () => {
  const long = 'https://x/' + 'a'.repeat(600);
  const r = ctx.saveCircular_(dcToken, { circularNo: '2614', title: '長連結', signupUrl: long });
  assert.ok(r.ok);
  const got = ctx.getCirculars_(dcToken).data.items.filter(n => n.id === r.data.id)[0];
  assert.strictEqual(got.signupUrl.length, 500);
  ctx.deleteCircular_(dcToken, r.data.id);
});

check('Date 物件 deadline → yyyy-MM-dd', () => {
  const r = ctx.saveCircular_(dcToken, { circularNo: '2615', title: '日期', deadline: new Date(Date.UTC(2026, 6, 25, 0, 0, 0)) });
  assert.ok(r.ok);
  const got = ctx.getCirculars_(dcToken).data.items.filter(n => n.id === r.data.id)[0];
  assert.strictEqual(got.deadline, '2026-07-25');
  ctx.deleteCircular_(dcToken, r.data.id);
});

check('pullCourseProfile：壞 token／冇 URL／搵唔到班被擋', () => {
  assert.strictEqual(ctx.pullCourseProfile_(badToken, {}).ok, false);
  assert.strictEqual(ctx.pullCourseProfile_(dcToken, {}).ok, false);
  assert.strictEqual(ctx.pullCourseProfile_(dcToken, { courseId: 'no-such-course' }).ok, false);
  assert.strictEqual(ctx.pullCourseProfile_(alToken, { scriptExecUrl: 'https://x/exec' }).ok, false, 'AL 冇 canCourse');
});

check('pullCourseProfile 經 courseId 讀已存 URL＋Key（POST getCourseProfile）', () => {
  fetchResult = JSON.stringify({ ok: true, data: { courseName: '第1屆工作坊', quota: '22', sessions: [{ date: '2025-08-08' }] } });
  const r = ctx.pullCourseProfile_(dcToken, { courseId: 'cl-01' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.courseName, '第1屆工作坊');
  assert.strictEqual(lastFetchUrl, 'https://course-script/exec');
  const sent = JSON.parse(lastFetchPayload);
  assert.strictEqual(sent.action, 'getCourseProfile');
  assert.strictEqual(sent.apiKey, 'k1');
});

check('pullCourseProfile 直接 URL＋Key（未開班登記都讀到）', () => {
  fetchResult = JSON.stringify({ ok: true, data: { courseName: '直接讀' } });
  const r = ctx.pullCourseProfile_(dcToken, { scriptExecUrl: 'https://other/exec', scriptApiKey: 'k2' });
  assert.ok(r.ok && r.data.courseName === '直接讀');
  assert.strictEqual(lastFetchUrl, 'https://other/exec');
});

check('課程端報錯原樣 passthrough', () => {
  fetchResult = JSON.stringify({ ok: false, error: 'Unauthorized: invalid or missing apiKey' });
  const r = ctx.pullCourseProfile_(dcToken, { courseId: 'cl-01' });
  assert.strictEqual(r.ok, false);
  assert.ok(String(r.error).indexOf('Unauthorized') >= 0);
});

check('Router：doGet getCirculars 有 wiring；listCirculars／getCircular 已移除', () => {
  const r = JSON.parse(ctx.doGet({ parameter: { action: 'getCirculars', token: dcToken } }));
  assert.ok(r.ok && Array.isArray(r.data.items));
  const gone1 = JSON.parse(ctx.doGet({ parameter: { action: 'listCirculars' } }));
  assert.strictEqual(gone1.ok, false);
  assert.ok(String(gone1.error).indexOf('未知的 action') >= 0);
  const gone2 = JSON.parse(ctx.doGet({ parameter: { action: 'getCircular', id: 'x' } }));
  assert.strictEqual(gone2.ok, false);
});

check('getConfig／getPublicInfo 回 memberPortalUrl（報名辦法連結用）', () => {
  assert.strictEqual(ctx.getConfig_().memberPortalUrl, 'https://member-portal-sigma-swart.vercel.app');
  assert.strictEqual(ctx.getPublicInfo_().memberPortalUrl, 'https://member-portal-sigma-swart.vercel.app');
});

console.log(pass ? `\n全部通過（${pass} 項）✓` : '\n冇跑到任何測試');
if (!pass) process.exitCode = 1;
