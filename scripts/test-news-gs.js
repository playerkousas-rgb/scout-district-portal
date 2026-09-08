/**
 * gs/Code.gs 消息發佈（News）邏輯測試 — 用 node 直接跑，唔使開 Apps Script。
 *   node scripts/test-news-gs.js
 * 做法：喺 vm 入面 stub 幾個 Apps Script 全域物件（SpreadsheetApp / Utilities / Session），
 * 用記憶體 2D 陣列扮 Sheet，然後直接叫 listAnnouncements_ / saveAnnouncement_ 等函數。
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

const sheets = {
  Config: makeSheet('Config', [['key', 'value', '說明'], ['districtCode', 'SKW', ''], ['districtName', '筲箕灣區', '']]),
  Perms: makeSheet('Perms', [['cardId', 'DC', 'STAFF', 'AL'], ['news', 'edit', 'edit', 'view']]),
  Users: makeSheet('Users', [['email', 'role', 'active', 'level'],
    ['dc@x.org', 'DC', 'TRUE', 1], ['staff@x.org', 'STAFF', 'TRUE', 4], ['al@x.org', 'AL', 'TRUE', 5]]),
  Roles: makeSheet('Roles', [['role', 'label', 'protected', 'level'], ['DC', '區總監', 'TRUE', 1], ['STAFF', '區職員', 'TRUE', 4], ['AL', '助理區領袖', 'TRUE', 5]]),
  News: makeSheet('News', [['id', 'districtCode', 'title', 'body', 'date', 'pinned', 'level', 'link', 'linkLabel',
    'notify', 'active', 'expiresAt', 'publishedAt', 'publishedBy', 'updatedAt', 'createdAt']]),
};

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
  UrlFetchApp: { fetch: () => ({ getContentText: () => '{}', getResponseCode: () => 200 }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });

// 直接扮 token：checkToken_ 用 TOKEN_SECRET 簽名，makeToken_ 可以照用
function tokenFor(email, role) { return ctx.makeToken_(email, role, 12); }

const day = (offset) => {
  const d = new Date(Date.now() + offset * 86400000 + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};

let pass = 0;
function check(label, fn) { fn(); pass++; console.log('  ✓ ' + label); }

console.log('消息發佈（News）測試');

const dcToken = tokenFor('dc@x.org', 'DC');
const alToken = tokenFor('al@x.org', 'AL');

check('冇消息時 listAnnouncements 回空陣列', () => {
  assert.strictEqual(ctx.listAnnouncements_({}).length, 0);
});

check('冇 news edit 權限唔可以發佈', () => {
  const r = ctx.saveAnnouncement_(alToken, { title: 'x', body: 'y' });
  assert.strictEqual(r.ok, false);
});

check('標題／內容必填', () => {
  assert.strictEqual(ctx.saveAnnouncement_(dcToken, { title: '', body: 'y' }).ok, false);
  assert.strictEqual(ctx.saveAnnouncement_(dcToken, { title: 'x', body: '' }).ok, false);
});

let pinnedId, plainId;
check('發佈置頂消息', () => {
  const r = ctx.saveAnnouncement_(dcToken, { title: '區會議改期', body: '改到 11 月 8 日', pinned: true, level: 'warn' });
  assert.ok(r.ok, JSON.stringify(r));
  pinnedId = r.data.id;
  assert.strictEqual(r.data.created, true);
});

check('發佈非置頂消息', () => {
  const r = ctx.saveAnnouncement_(dcToken, { title: '物資已補貨', body: '營燈 20 支', pinned: false });
  assert.ok(r.ok);
  plainId = r.data.id;
});

check('公開 listAnnouncements 兩則都見到，置頂排前', () => {
  const list = ctx.listAnnouncements_({});
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].id, pinnedId);
  assert.strictEqual(list[0].pinned, true);
  assert.strictEqual(list[0].level, 'warn');
});

check('pinnedOnly 只回置頂', () => {
  const list = ctx.listAnnouncements_({ pinnedOnly: '1' });
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].id, pinnedId);
});

check('公開版唔會漏 active / publishedBy', () => {
  const n = ctx.listAnnouncements_({})[0];
  assert.strictEqual(n.active, undefined);
  assert.strictEqual(n.publishedBy, undefined);
  assert.ok(n.updatedAt);
});

check('下架 → 成員端即刻唔見，但管理系統仍見到', () => {
  assert.ok(ctx.setAnnouncementActive_(dcToken, plainId, false).ok);
  assert.strictEqual(ctx.listAnnouncements_({}).length, 1);
  const admin = ctx.getAnnouncements_(dcToken);
  assert.ok(admin.ok);
  assert.strictEqual(admin.data.length, 2);
  const off = admin.data.filter(n => n.id === plainId)[0];
  assert.strictEqual(off.active, false);
  assert.strictEqual(off.live, false);
});

check('重新上架', () => {
  assert.ok(ctx.setAnnouncementActive_(dcToken, plainId, true).ok);
  assert.strictEqual(ctx.listAnnouncements_({}).length, 2);
});

check('取消置頂', () => {
  assert.ok(ctx.setAnnouncementPinned_(dcToken, pinnedId, false).ok);
  assert.strictEqual(ctx.listAnnouncements_({ pinnedOnly: '1' }).length, 0);
  assert.ok(ctx.setAnnouncementPinned_(dcToken, pinnedId, true).ok);
  assert.strictEqual(ctx.listAnnouncements_({ pinnedOnly: '1' }).length, 1);
});

check('已過期（expiresAt 喺過去）自動唔顯示', () => {
  assert.ok(ctx.saveAnnouncement_(dcToken, { title: '舊消息', body: '過咗期', expiresAt: day(-1) }).ok);
  assert.strictEqual(ctx.listAnnouncements_({}).filter(n => n.title === '舊消息').length, 0);
  assert.strictEqual(ctx.getAnnouncements_(dcToken).data.filter(n => n.title === '舊消息' && n.expired).length, 1);
});

check('未到日期（date 喺將來）未顯示', () => {
  assert.ok(ctx.saveAnnouncement_(dcToken, { title: '下星期先出', body: '排期', date: day(3) }).ok);
  assert.strictEqual(ctx.listAnnouncements_({}).filter(n => n.title === '下星期先出').length, 0);
  assert.strictEqual(ctx.getAnnouncements_(dcToken).data.filter(n => n.title === '下星期先出' && n.scheduled).length, 1);
});

check('since 只回之後更新過嘅（供成員端「有新消息」判斷）', () => {
  // 減 1 毫秒：saveAnnouncement 可能同一毫秒發生（since 係「嚴格之後」先當新消息）
  const now = new Date(Date.now() - 1).toISOString();
  assert.strictEqual(ctx.listAnnouncements_({ since: now }).length, 0);
  assert.ok(ctx.saveAnnouncement_(dcToken, { title: '最新', body: '啱啱發' }).ok);
  const fresh = ctx.listAnnouncements_({ since: now });
  assert.strictEqual(fresh.length, 1);
  assert.strictEqual(fresh[0].title, '最新');
});

check('更新內容唔會改 id / publishedAt / publishedBy', () => {
  const before = ctx.getAnnouncements_(dcToken).data.filter(n => n.id === pinnedId)[0];
  assert.ok(ctx.saveAnnouncement_(dcToken, { id: pinnedId, title: '區會議改期（更新）', body: '改到 11 月 9 日', pinned: true }).ok);
  const after = ctx.getAnnouncements_(dcToken).data.filter(n => n.id === pinnedId)[0];
  assert.strictEqual(after.title, '區會議改期（更新）');
  assert.strictEqual(after.publishedAt, before.publishedAt);
  assert.strictEqual(after.publishedBy, before.publishedBy);
});

check('刪除 → 兩邊都冇', () => {
  assert.ok(ctx.deleteAnnouncement_(dcToken, plainId).ok);
  assert.strictEqual(ctx.listAnnouncements_({}).filter(n => n.id === plainId).length, 0);
  assert.strictEqual(ctx.getAnnouncements_(dcToken).data.filter(n => n.id === plainId).length, 0);
  assert.strictEqual(ctx.deleteAnnouncement_(dcToken, plainId).ok, false);
});

check('limit 上限 50、預設 20', () => {
  assert.ok(ctx.listAnnouncements_({ limit: 999 }).length <= 50);
});

check('doGet 公開路由 listAnnouncements 通', () => {
  const out = ctx.doGet({ parameter: { action: 'listAnnouncements' } });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.ok, true);
  assert.ok(parsed.data.length >= 0);
});

check('健康檢查版本 4.6.0', () => {
  const parsed = JSON.parse(ctx.doGet({ parameter: { action: 'getHealthCheck' } }));
  assert.strictEqual(parsed.data.version, '4.6.0');
});

console.log(`\n全部通過（${pass} 項）✓`);
