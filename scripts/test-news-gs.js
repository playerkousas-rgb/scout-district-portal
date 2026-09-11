/**
 * gs/Code.gs 邏輯測試 — 用 node 直接跑，唔使開 Apps Script。
 *   node scripts/test-news-gs.js
 * 涵蓋：📢 消息發佈（News）＋ 📦 一次過借多款物資（submitStockBatchRequest / setStockBatchStatus）。
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

const sheets = {
  Config: makeSheet('Config', [['key', 'value', '說明'], ['districtCode', 'SKW', ''], ['districtName', '筲箕灣區', '']]),
  Perms: makeSheet('Perms', [['cardId', 'DC', 'STAFF', 'AL'], ['news', 'edit', 'edit', 'view']]),
  Users: makeSheet('Users', [['email', 'role', 'active', 'level'],
    ['dc@x.org', 'DC', 'TRUE', 1], ['staff@x.org', 'STAFF', 'TRUE', 4], ['al@x.org', 'AL', 'TRUE', 5]]),
  Roles: makeSheet('Roles', [['role', 'label', 'protected', 'level'], ['DC', '區總監', 'TRUE', 1], ['STAFF', '區職員', 'TRUE', 4], ['AL', '助理區領袖', 'TRUE', 5]]),
  News: makeSheet('News', [['id', 'districtCode', 'title', 'body', 'date', 'pinned', 'level', 'link', 'linkLabel',
    'notify', 'active', 'expiresAt', 'publishedAt', 'publishedBy', 'updatedAt', 'createdAt',
    'deleted', 'deletedAt', 'deletedBy']]),
  ContactNames: makeSheet('ContactNames', [['key', 'name', 'updatedAt', 'updatedBy']]),
  System: makeSheet('System', [['key', 'value'], ['locked', 'FALSE'], ['lockMessage', '維護中']]),
  Items: makeSheet('Items', [
    ['itemId', 'districtCode', 'category', 'name', 'totalQty', 'availableQty', 'unit', 'note', 'location', 'active'],
    ['LAMP', 'SKW', '照明', '營燈', 20, 20, '支', '', '', 'TRUE'],
    ['ROPE', 'SKW', '繩索', '大繩', 10, 10, '條', '', '', 'TRUE'],
    ['TENT', 'SKW', '營具', '營幕', 4, 1, '個', '', '', 'TRUE'],
  ]),
  StockRequests: makeSheet('StockRequests', [
    ['id', 'districtCode', 'refCode', 'batchRef', 'submittedAt', 'itemId', 'itemName', 'category', 'qty',
      'purpose', 'borrowDate', 'returnDate', 'name', 'phone', 'email', 'troop', 'position',
      'agreeRules', 'status', 'reviewer', 'reviewedAt', 'createdAt'],
  ]),
  AllRecords: makeSheet('AllRecords', [
    ['id', 'districtCode', 'type', 'refCode', 'title', 'requester', 'phone', 'troop', 'status', 'detail', 'createdAt'],
  ]),
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
  assert.strictEqual(list[0].level, 'warning');   // 舊詞彙 warn 自動對應成 warning
});

check('對齊成員系統：公開輸出有 content（＝body）', () => {
  const list = ctx.listAnnouncements_({});
  list.forEach((n) => {
    assert.strictEqual(typeof n.content, 'string');
    assert.strictEqual(n.content, n.body);
  });
  assert.ok(list[0].content.length > 0);
});

check('對齊成員系統：level 只會係 info / warning / important', () => {
  const ok = ['info', 'warning', 'important'];
  ctx.listAnnouncements_({}).forEach((n) => assert.ok(ok.indexOf(n.level) >= 0, '意外 level：' + n.level));
  assert.strictEqual(ctx.newsLevel_('warn'), 'warning');
  assert.strictEqual(ctx.newsLevel_('urgent'), 'important');
  assert.strictEqual(ctx.newsLevel_('WARNING'), 'warning');
  assert.strictEqual(ctx.newsLevel_('乜嘢都唔係'), 'info');
  assert.strictEqual(ctx.newsLevel_(''), 'info');
});

check('對齊成員系統：saveAnnouncement 接受 content 當內容', () => {
  const r = ctx.saveAnnouncement_(dcToken, { title: '用 content 交', content: '成員端字眼', level: 'urgent' });
  assert.strictEqual(r.ok, true);
  const row = ctx.listAnnouncements_({}).filter((n) => n.id === r.data.id)[0];
  assert.strictEqual(row.body, '成員端字眼');
  assert.strictEqual(row.content, '成員端字眼');
  assert.strictEqual(row.level, 'important');
  ctx.deleteAnnouncement_(dcToken, r.data.id);
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

check('下架 → 成員端即刻唔見，但管理系統仍見到（連軟刪除留底都回）', () => {
  assert.ok(ctx.setAnnouncementActive_(dcToken, plainId, false).ok);
  assert.strictEqual(ctx.listAnnouncements_({}).length, 1);
  const admin = ctx.getAnnouncements_(dcToken);
  assert.ok(admin.ok);
  // 3 = pinnedId + plainId + 之前軟刪除留底嘅 content 測試行
  assert.strictEqual(admin.data.length, 3);
  const off = admin.data.filter(n => n.id === plainId)[0];
  assert.strictEqual(off.active, false);
  assert.strictEqual(off.live, false);
});

check('v4.9.0：ADC（層級 3）可以直接發佈；STAFF（層級 4）唔可以', () => {
  const adcToken = tokenFor('adc@x.org', 'ADC_SCOUT');
  const staffToken = tokenFor('staff@x.org', 'STAFF');
  // harness Users 表冇 ADC 帳戶 → level 由 Roles 推斷；ADC_SCOUT → 層級 3
  const rAdc = ctx.saveAnnouncement_(adcToken, { title: 'ADC 發佈', body: '掂' });
  assert.ok(rAdc.ok, JSON.stringify(rAdc));
  assert.strictEqual(ctx.listAnnouncements_({}).filter(n => n.title === 'ADC 發佈').length, 1);
  const rStaff = ctx.saveAnnouncement_(staffToken, { title: 'STAFF 發佈', body: '唔應該得' });
  assert.strictEqual(rStaff.ok, false);
  ctx.deleteAnnouncement_(adcToken, rAdc.data.id);   // 清場（軟刪除，成員端睇唔到）
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
  // 先取值做 since（舊 save 一定早過／等於佢，<= 過濾必定唔出）；再等時鐘行前 5ms，
  // 之後嘅 save updatedAt 必定新過 since —— 唔靠運氣，唔會同一毫秒撞車。
  const now = new Date().toISOString();
  const tSpin = Date.now();
  while (Date.now() - tSpin < 5) { /* spin 等時鐘行前 */ }
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

check('v4.9.0 刪除 = 軟刪除：成員端即刻冇，Sheet 留底（deleted=TRUE），可以還原', () => {
  assert.ok(ctx.deleteAnnouncement_(dcToken, plainId).ok);
  assert.strictEqual(ctx.listAnnouncements_({}).filter(n => n.id === plainId).length, 0);
  const kept = ctx.getAnnouncements_(dcToken).data.filter(n => n.id === plainId)[0];
  assert.ok(kept, 'Sheet 應該留底');
  assert.strictEqual(kept.deleted, true);
  assert.ok(kept.deletedAt);
  assert.strictEqual(kept.live, false);
  // 再刪一次 = 冇事發生（冇嘢好刪，照樣 ok）
  assert.ok(ctx.deleteAnnouncement_(dcToken, plainId).ok);
  // 還原 → 留底返返出嚟，係「已下架」狀態
  assert.ok(ctx.restoreAnnouncement_(dcToken, plainId).ok);
  const back = ctx.getAnnouncements_(dcToken).data.filter(n => n.id === plainId)[0];
  assert.strictEqual(back.deleted, false);
  assert.strictEqual(back.active, false);
  assert.strictEqual(ctx.listAnnouncements_({}).filter(n => n.id === plainId).length, 0);
});

check('已刪除嘅消息唔可以置頂／上架（只可以還原）', () => {
  assert.ok(ctx.deleteAnnouncement_(dcToken, plainId).ok);
  assert.strictEqual(ctx.setAnnouncementPinned_(dcToken, plainId, true).ok, false);
  assert.strictEqual(ctx.setAnnouncementActive_(dcToken, plainId, true).ok, false);
  assert.ok(ctx.restoreAnnouncement_(dcToken, plainId).ok);
});

check('v4.9.0 聯絡簿姓名：ADC+ 可以改／還原，AL（層級 5）唔可以', () => {
  const r1 = ctx.saveContactName_(dcToken, '執行幹事|2835 7711|0', '陳大文先生（新）');
  assert.ok(r1.ok, JSON.stringify(r1));
  let names = ctx.getContactNames_(dcToken).data.names;
  assert.strictEqual(names['執行幹事|2835 7711|0'], '陳大文先生（新）');
  // 留空 = 還原（刪走自訂）
  assert.ok(ctx.saveContactName_(dcToken, '執行幹事|2835 7711|0', '').ok);
  names = ctx.getContactNames_(dcToken).data.names;
  assert.strictEqual(names['執行幹事|2835 7711|0'], undefined);
  const rAl = ctx.saveContactName_(alToken, '執行幹事|2835 7711|0', '唔應該改到');
  assert.strictEqual(rAl.ok, false);
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

check('健康檢查版本 4.14.0', () => {
  const parsed = JSON.parse(ctx.doGet({ parameter: { action: 'getHealthCheck' } }));
  assert.strictEqual(parsed.data.version, '4.17.1');
});

// ───────────────────────────────────────────────────────────
console.log('\n一次過借多款物資（submitStockBatchRequest）測試');

const applicant = { name: '陳小明', phone: '91234567', email: 'ming@example.com', troop: '第 1 旅',
  borrowDate: day(3), returnDate: day(5), purpose: '旅團露營', agreeRules: true };
const avail = (id) => {
  const rows = ctx.readSheet_('Items');
  return Number(rows.filter(r => r.itemId === id)[0].availableQty);
};

let batchRef;
check('一次過交 3 款物資 = 3 行，共用同一個 batchRef', () => {
  const r = ctx.submitStockBatchRequest_({ ...applicant, items: [{ itemId: 'LAMP', qty: 4 }, { itemId: 'ROPE', qty: 2 }] });
  assert.ok(r.ok, JSON.stringify(r));
  batchRef = r.data.batchRef;
  assert.ok(/^SB-/.test(batchRef), batchRef);
  assert.strictEqual(r.data.submittedCount, 2);
  assert.strictEqual(r.refCodes.length, 2);          // member-portal proxy 直接讀 refCode / refCodes
  assert.strictEqual(r.refCode, batchRef);
  const rows = ctx.readSheet_('StockRequests').filter(x => x.batchRef === batchRef);
  assert.strictEqual(rows.length, 2);
  assert.ok(rows.every(x => x.status === 'pending'));
});

check('提交唔會即扣庫存（批准先扣）', () => {
  assert.strictEqual(avail('LAMP'), 20);
});

check('同一款物資揀兩次會自動合併數量', () => {
  const r = ctx.submitStockBatchRequest_({ ...applicant, items: [{ itemId: 'LAMP', qty: 2 }, { itemId: 'LAMP', qty: 3 }] });
  assert.ok(r.ok);
  const rows = ctx.readSheet_('StockRequests').filter(x => x.batchRef === r.data.batchRef);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(Number(rows[0].qty), 5);
});

check('任何一款唔夠貨 → 成批唔寫（唔會寫一半）', () => {
  const before = ctx.readSheet_('StockRequests').length;
  const r = ctx.submitStockBatchRequest_({ ...applicant, items: [{ itemId: 'ROPE', qty: 1 }, { itemId: 'TENT', qty: 99 }] });
  assert.strictEqual(r.ok, false);
  assert.ok(/營幕/.test(r.error), r.error);
  assert.strictEqual(ctx.readSheet_('StockRequests').length, before);
});

check('物資唔存在 → 整批唔寫', () => {
  const before = ctx.readSheet_('StockRequests').length;
  const r = ctx.submitStockBatchRequest_({ ...applicant, items: [{ itemId: 'NOPE', qty: 1 }] });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(ctx.readSheet_('StockRequests').length, before);
});

check('成員系統自訂 batchRef 會沿用；亂碼會被丟棄', () => {
  const good = ctx.submitStockBatchRequest_({ ...applicant, batchRef: 'SB-20260908-ABC123', items: [{ itemId: 'ROPE', qty: 1 }] });
  assert.strictEqual(good.data.batchRef, 'SB-20260908-ABC123');
  const bad = ctx.submitStockBatchRequest_({ ...applicant, batchRef: 'x'.repeat(80), items: [{ itemId: 'ROPE', qty: 1 }] });
  assert.ok(/^SB-/.test(bad.data.batchRef));
});

check('一次過批准整批：逐行扣庫存、狀態全部 approved', () => {
  const r = ctx.setStockBatchStatus_(dcToken, batchRef, 'approved');
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.count, 2);
  const rows = ctx.readSheet_('StockRequests').filter(x => x.batchRef === batchRef);
  assert.ok(rows.every(x => x.status === 'approved'));
  assert.strictEqual(avail('LAMP'), 16);   // 20 - 4
  assert.strictEqual(avail('ROPE'), 8);    // 10 - 2（另外兩批仲係 pending）
});

check('重複批准唔會重複扣庫存', () => {
  ctx.setStockBatchStatus_(dcToken, batchRef, 'approved');
  assert.strictEqual(avail('LAMP'), 16);
});

check('整批歸還會回補庫存', () => {
  assert.ok(ctx.setStockBatchStatus_(dcToken, batchRef, 'returned').ok);
  assert.strictEqual(avail('LAMP'), 20);
  assert.strictEqual(avail('ROPE'), 10);
});

check('搵唔到批次／狀態唔啱會報錯', () => {
  assert.strictEqual(ctx.setStockBatchStatus_(dcToken, 'SB-XXXX', 'approved').ok, false);
  assert.strictEqual(ctx.setStockBatchStatus_(dcToken, batchRef, 'whatever').ok, false);
});

check('冇 canStock 權限唔可以批核', () => {
  assert.strictEqual(ctx.setStockBatchStatus_(alToken, batchRef, 'approved').ok, false);
});

check('單件 submitStockRequest 照舊work（冇 batchRef）', () => {
  const r = ctx.submitStockRequest_({ ...applicant, itemId: 'ROPE', qty: 1 });
  assert.ok(r.ok, JSON.stringify(r));
  const row = ctx.readSheet_('StockRequests').filter(x => x.refCode === r.refCode)[0];
  assert.strictEqual(String(row.batchRef || ''), '');
  assert.ok(ctx.setStockRequestStatus_(dcToken, row.id, 'approved').ok);
  assert.strictEqual(avail('ROPE'), 9);
});

check('doPost 路由 submitStockBatchRequest 通', () => {
  const out = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({
    action: 'submitStockBatchRequest', ...applicant, items: [{ itemId: 'LAMP', qty: 1 }],
  }) } }));
  assert.strictEqual(out.ok, true);
  assert.ok(out.refCode);
});

console.log(`\n全部通過（${pass} 項）✓`);
