/**
 * v4.9.0 升級路徑測試 — 舊版（4.8.1）已經用緊嘅 Sheet，貼新 Code.gs → setupSheets()：
 *   · AwardTypes 舊預設值自動升級（FIVE/LSM 補年期、CCH 斬開 CCM 連結、THANKS/HAB 轉提名期、note 更新）
 *   · 用戶自己改過嘅設定絕對唔會被掂
 *   · Perms：awards 舊預設（全角色 view）→ 只限 DDC 或以上
 *   · Cards：news 卡自動移除（連 Perms 行）；contacts 改名「聯絡簿」
 *   · News 表自動補 deleted/deletedAt/deletedBy 欄；ContactNames 表自動補建
 *
 *   node scripts/test-upgrade-gs.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs'), 'utf8');

function makeSheet(name, rows) {
  const data = rows.map(r => r.slice());
  const sh = {
    name,
    getLastRow: () => data.length,
    getLastColumn: () => (data[0] ? data[0].length : 0),
    getMaxColumns: () => Math.max(26, data[0] ? data[0].length : 0),
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValues: () => data.slice(row - 1, row - 1 + numRows).map(r => r.slice(col - 1, col - 1 + numCols)),
        getValue: () => (data[row - 1] || [])[col - 1],
        setValue: (v) => { while (data.length < row) data.push([]); data[row - 1][col - 1] = v; },
        setValues: (vals) => {
          vals.forEach((r, i) => {
            while (data.length < row + i) data.push([]);
            r.forEach((v, j) => { data[row - 1 + i][col - 1 + j] = v; });
          });
        },
        setFontWeight: () => ({ setBackground: () => {} }),
        setBackground: () => {}, setFontColor: () => {},
      };
    },
    appendRow: (row) => { data.push(row.slice()); },
    deleteRow: (idx) => { data.splice(idx - 1, 1); },
    setFrozenRows: () => {}, setFrozenColumns: () => {}, clear: () => { data.length = 0; },
    _data: data,
  };
  return sh;
}

// ── 模擬一張 4.8.1 年代已經用緊嘅 Sheet ──
const sheets = {
  Config: makeSheet('Config', [['key', 'value', '說明'], ['districtCode', 'SKW', ''], ['districtName', '筲箕灣區', '']]),
  System: makeSheet('System', [['key', 'value'], ['locked', 'FALSE']]),
  Roles: makeSheet('Roles', [['role', 'label', 'protected', 'level'], ['DC', '區總監', 'TRUE', 1], ['SYSADMIN', '超管', 'TRUE', 0], ['DDC_ADMIN', '副區總監（行政）', 'TRUE', 2], ['DDC_TRAINING', '副區總監（訓練）', 'TRUE', 2], ['ADC_SCOUT', '助區（童軍）', 'TRUE', 3], ['STAFF', '區職員', 'TRUE', 4]]),
  // 舊 Cards：仲有 news 卡；contacts 仲係「聯結簿」；awards 係舊描述
  Cards: makeSheet('Cards', [
    ['cardId', 'title', 'icon', 'type', 'url', 'description', 'order', 'enabled', 'embed', 'source', 'category'],
    ['contacts', '聯結簿', '📇', 'builtin', '/contacts', '旅團 · 港島地域 · 總會 聯絡資料', 2, 'TRUE', 'FALSE', 'core', 'done'],
    ['awards', '獎勵提名', '🎖', 'builtin', '/awards', '獎勵名冊 · 自動計夠期可提名 · 年期自訂', 3, 'TRUE', 'FALSE', 'core', 'done'],
    ['news', '消息發佈', '📢', 'builtin', '/news', '發佈消息到成員系統首頁置頂 · 一刪即消失', 4, 'TRUE', 'FALSE', 'core', 'done'],
    ['rooms', '地域房間使用情況', '🏢', 'builtin', '/rooms', '17／18／19 樓逐間房睇用途時段 · 今日總覽', 15, 'TRUE', 'FALSE', 'core', 'done'],
  ]),
  // 舊 Perms：awards 全角色 view（除 DC/SYSADMIN/DDC_ADMIN edit）；news 全 edit
  Perms: makeSheet('Perms', [
    ['cardId', 'DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING', 'ADC_SCOUT', 'STAFF'],
    ['contacts', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit'],
    ['awards', 'edit', 'edit', 'edit', 'view', 'view', 'view'],
    ['news', 'edit', 'edit', 'edit', 'edit', 'view', 'edit'],
    ['rooms', 'view', 'view', 'view', 'view', 'view', 'view'],
  ]),
  Users: makeSheet('Users', [['email', 'role', 'active', 'level'], ['dc@x.org', 'DC', 'TRUE', 1], ['sysadmin@x.org', 'SYSADMIN', 'TRUE', 0]]),
  // 舊 AwardTypes：4.7.3 預設值（未經 v4.9.0 修訂）
  AwardTypes: makeSheet('AwardTypes', [
    ['code', 'label', 'short', 'category', 'prevCode', 'minYears', 'round', 'note', 'enabled'],
    ['GSA', '優良服務獎章', 'GSA', '功績榮譽', '', 7, 'founder', 'Good Service Award；由服務開始年份起計 7 年', 'TRUE'],
    ['CCH', '香港總監高級嘉許', '高級嘉許', '嘉許', 'CCM', 5, 'other', '黃紫綠笛繩；獲總監嘉許後有超卓表現', 'TRUE'],
    ['HAB', '民政及青年事務局局長嘉許', '民青局', '外部嘉許', '', '', 'other', '前稱民政事務局局長嘉許計劃；義務領袖須服務滿 10 年（限提名名額，預設唔自動推算；想自動列出就喺年期設定填 10）', 'TRUE'],
    ['FIVE', '五年長期服務獎狀', '五年', '長期服務', '', '', 'other', '會務委員專用（預設唔自動推算；想自動列出就喺年期設定填 5）', 'TRUE'],
    ['TEN', '十年長期服務獎狀', '十年', '長期服務', 'FIVE', 5, 'other', '會務委員', 'TRUE'],
    ['LSM', '長期服務獎章', 'LSM', '長期服務', '', '', 'other', '服務實職滿 15 年；第一個由區會自己入紀錄，預設唔自動推算（想自動列出就喺年期設定填 15）', 'TRUE'],
    ['THANKS', '感謝狀', '感謝狀', '其他', '', '', 'founder', '表格 DA2；頒予配偶／家長／支持童軍運動人士', 'TRUE'],
  ]),
  // 舊 News 表：冇 deleted 欄
  News: makeSheet('News', [['id', 'districtCode', 'title', 'body', 'date', 'pinned', 'level', 'link', 'linkLabel',
    'notify', 'active', 'expiresAt', 'publishedAt', 'publishedBy', 'updatedAt', 'createdAt']]),
};

const ctx = {
  console,
  Logger: { log: () => {} },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => (sheets[n] = makeSheet(n, [])),
      getSheets: () => Object.values(sheets),
    }),
    getUi: () => { throw new Error('no ui'); },
  },
  Session: { getScriptTimeZone: () => 'Asia/Hong_Kong', getActiveUser: () => ({ getEmail: () => 'mock@local' }) },
  Utilities: {
    formatDate: (d, tz, fmt) => { const iso = new Date(d.getTime() + 8 * 3600 * 1000).toISOString(); return fmt === 'yyyy-MM-dd' ? iso.slice(0, 10) : iso; },
    getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
    base64EncodeWebSafe: (s) => Buffer.from(String(s), 'utf8').toString('base64url'),
    base64DecodeWebSafe: (s) => Buffer.from(String(s), 'base64url'),
    newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
    computeDigest: (_a, s) => Array.from(String(s)).map(c => c.charCodeAt(0) % 128),
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
  },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  MailApp: { sendEmail: () => {} },
  UrlFetchApp: { fetch: () => ({ getContentText: () => '{}', getResponseCode: () => 200 }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
  __sheets: sheets,
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });

let pass = 0;
function check(label, fn) { fn(); pass++; console.log('  ✓ ' + label); }

console.log('v4.9.0 升級路徑（舊 Sheet → setupSheets）');

ctx.setupSheets();

check('AwardTypes 舊預設自動升級：FIVE=5、LSM=15、CCH 斬開、HAB→hab、THANKS→other', () => {
  const by = {};
  ctx.awardTypes_().forEach(t => { by[t.code] = t; });
  assert.strictEqual(by.FIVE.minYears, 5);
  assert.strictEqual(by.LSM.minYears, 15);
  assert.strictEqual(by.LSM.prevCode, '');
  assert.strictEqual(by.CCH.prevCode, '');
  assert.strictEqual(by.CCH.minYears, null);
  assert.strictEqual(by.HAB.round, 'hab');
  assert.strictEqual(by.THANKS.round, 'other');
  assert.strictEqual(by.TEN.prevCode, 'FIVE');   // 本來就啱，唔會被掂
});

check('用戶改過嘅 AwardTypes 設定唔會被掂', () => {
  // 用戶早已自訂 GSA 年期 = 9 → patch 唔應該改
  const sh = sheets.AwardTypes;
  const v = sh.getDataRange().getValues();
  const cCode = v[0].indexOf('code'), cMin = v[0].indexOf('minYears');
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][cCode]) === 'GSA') { sh.getRange(i + 1, cMin + 1).setValue(9); break; }
  }
  ctx.patchAwardTypes_(ctx.SpreadsheetApp.getActiveSpreadsheet());
  const by = {};
  ctx.awardTypes_().forEach(t => { by[t.code] = t; });
  assert.strictEqual(by.GSA.minYears, 9, '用戶自訂 GSA=9 唔應該被改');
});

check('Perms：awards 舊預設（全 view）→ 只限 DDC 或以上', () => {
  const perms = ctx.readPerms_();
  assert.strictEqual(perms.awards.DC, 'edit');
  assert.strictEqual(perms.awards.SYSADMIN, 'edit');
  assert.strictEqual(perms.awards.DDC_ADMIN, 'edit');
  assert.strictEqual(perms.awards.DDC_TRAINING, 'view');
  assert.strictEqual(perms.awards.ADC_SCOUT, undefined);
  assert.strictEqual(perms.awards.STAFF, undefined);
  assert.strictEqual(perms.contacts.STAFF, 'edit');   // 其他行照舊
});

check('Cards：news 卡自動移除（連 Perms 行）、contacts 改名聯絡簿、awards 描述更新', () => {
  const rows = ctx.readSheet_('Cards');   // readSheet_ 回傳物件（header 當 key）
  const ids = rows.map(c => String(c.cardId || '').trim());
  assert.strictEqual(ids.indexOf('news'), -1, 'news 卡應該被移除');
  const contacts = rows.filter(r => String(r.cardId || '').trim() === 'contacts')[0];
  assert.ok(contacts, 'contacts 卡應該仍在');
  assert.strictEqual(contacts.title, '聯絡簿');
  assert.strictEqual(contacts.description, '聯絡電話：旅團 · 港島地域 · 總會（職員姓名區方可改）');
  assert.strictEqual(ctx.readPerms_().news, undefined, 'news Perms 行都應該被清走');
});

check('News 表自動補 deleted/deletedAt/deletedBy 欄；ContactNames 表自動補建', () => {
  const raw = sheets.News.getDataRange().getValues();
  const head = raw[0].map(h => String(h).trim());
  ['deleted', 'deletedAt', 'deletedBy'].forEach(h => assert.ok(head.indexOf(h) >= 0, '缺欄 ' + h));
  assert.ok(sheets.ContactNames, 'ContactNames 表應該補建');
  assert.deepStrictEqual(sheets.ContactNames.getDataRange().getValues()[0], ['key', 'name', 'updatedAt', 'updatedBy']);
});

check('舊 News 行（未有 deleted 值）照樣正常讀；刪除後會留底', () => {
  const t = ctx.makeToken_('dc@x.org', 'DC', 12);
  const r = ctx.saveAnnouncement_(t, { title: '升級測試', body: 'x', pinned: true });
  assert.ok(r.ok);
  assert.strictEqual(ctx.listAnnouncements_({}).length, 1);
  assert.ok(ctx.deleteAnnouncement_(t, r.data.id).ok);
  assert.strictEqual(ctx.listAnnouncements_({}).length, 0);
  assert.strictEqual(ctx.getAnnouncements_(t).data.filter(n => n.id === r.data.id)[0].deleted, true);
});

check('setupSheets 重跑都唔會清資料（補建唔清空）', () => {
  ctx.setupSheets();
  const by = {};
  ctx.awardTypes_().forEach(t2 => { by[t2.code] = t2; });
  assert.strictEqual(by.GSA.minYears, 9, '用戶自訂值重跑 setupSheets 之後仍然喺度');
  assert.strictEqual(by.FIVE.minYears, 5);
});

console.log(`\n全部通過（${pass} 項）✓`);
