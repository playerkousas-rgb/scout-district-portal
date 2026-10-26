/**
 * v4.19.1 追加式升級測試 — 舊版（4.8.1）已有資料，貼新 Code.gs → setupSheets()：
 *   · 原有 Config／Cards／Perms／AwardTypes／Users／借場／News 全部既有儲存格不得修改
 *   · 只在最右補缺欄、最底補缺行，絕不清空工作表／重設保護或原有 API Key
 *   · 舊 news、meeting、annual 卡保持原 enabled；舊 Awards 規則／Perms 原樣保留
 *   · 權限以讀取時門禁控制，Rooms 卡顯示新名但不改 Sheet，舊卡仍可用
 *   · 未有 API_KEY_HASH 才新增帶雜湊的行；已有空白行亦不覆寫，重跑不重複新增
 *
 *   node scripts/test-upgrade-gs.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs'), 'utf8');

// 僅在 setupSheets 執行期間開啟：任何觸及原有儲存格／格式／保護的寫入即測試失敗。
let originals = null;
const violations = [];
function rejectOldMutation(name, row, col, height, width, operation) {
  if (!originals || !originals[name]) return;
  const old = originals[name];
  if (row > old.rows || col > old.cols) return;
  const message = `${operation} 觸及原有 ${name}!R${row}C${col}（原範圍 ${old.rows}×${old.cols}）`;
  violations.push(message);
  throw new Error(message);
}

function makeSheet(name, rows) {
  const data = rows.map(r => r.slice());
  let maxColumns = Math.max(26, ...rows.map(r => r.length));
  const sh = {
    name,
    getLastRow: () => data.length,
    getLastColumn: () => Math.max(0, ...data.map(r => r.length)),
    getMaxColumns: () => maxColumns,
    insertColumnsAfter(after, count) {
      if (after !== maxColumns) throw new Error('只能喺最右邊追加欄位');
      maxColumns += count;
    },
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange(row, col, numRows = 1, numCols = 1) {
      const guard = operation => rejectOldMutation(name, row, col, numRows, numCols, operation);
      return {
        getValues: () => data.slice(row - 1, row - 1 + numRows).map(r => r.slice(col - 1, col - 1 + numCols)),
        getValue: () => (data[row - 1] || [])[col - 1],
        setValue: (v) => {
          guard('setValue');
          while (data.length < row) data.push([]);
          data[row - 1][col - 1] = v;
        },
        setValues: (vals) => {
          guard('setValues');
          vals.forEach((r, i) => {
            while (data.length < row + i) data.push([]);
            r.forEach((v, j) => { data[row - 1 + i][col - 1 + j] = v; });
          });
        },
        setFontWeight: () => { guard('setFontWeight'); return { setBackground: () => guard('setBackground') }; },
        setBackground: () => guard('setBackground'), setFontColor: () => guard('setFontColor'),
      };
    },
    appendRow: (row) => { data.push(row.slice()); },
    deleteRow: (idx) => { rejectOldMutation(name, idx, 1, 1, 1, 'deleteRow'); data.splice(idx - 1, 1); },
    getProtections: () => { if (originals?.[name]) violations.push(`getProtections 觸及原有 ${name}`); return []; },
    protect: () => {
      if (originals?.[name]) violations.push(`protect 觸及原有 ${name}`);
      return {
        setDescription() { return this; }, addEditor() {}, getEditors: () => [],
        canDomainEdit: () => false,
      };
    },
    setFrozenRows: () => { if (originals?.[name]) violations.push(`setFrozenRows 觸及原有 ${name}`); },
    setFrozenColumns: () => { if (originals?.[name]) violations.push(`setFrozenColumns 觸及原有 ${name}`); },
    clear: () => { if (originals?.[name]) violations.push(`clear 觸及原有 ${name}`); data.length = 0; },
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
    ['meeting', '會議行事曆', '📅', 'builtin', '/meeting', '舊會議入口', 5, 'TRUE', 'FALSE', 'core', 'done'],
    ['annual', '週年會議', '📅', 'builtin', '/annual', '舊週年入口', 6, 'FALSE', 'FALSE', 'core', 'done'],
    ['venueReg', '場地借用審批', '🏛', 'builtin', '/venue-regs', '借場申請批核 · 場地清單', 9, 'TRUE', 'FALSE', 'core', 'done'],
    ['rooms', '地域房間使用情況', '🏢', 'builtin', '/rooms', '17／18／19 樓逐間房睇用途時段 · 今日總覽', 15, 'TRUE', 'FALSE', 'core', 'done'],
  ]),
  // 舊 Perms：awards 全角色 view（除 DC/SYSADMIN/DDC_ADMIN edit）；news 全 edit
  Perms: makeSheet('Perms', [
    ['cardId', 'DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING', 'ADC_SCOUT', 'STAFF'],
    ['contacts', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit'],
    ['awards', 'edit', 'edit', 'edit', 'view', 'view', 'view'],
    ['news', 'edit', 'edit', 'edit', 'edit', 'view', 'edit'],
    ['meeting', 'edit', 'edit', 'view', 'view', 'view', 'view'],
    ['annual', 'edit', 'edit', 'view', 'view', '', 'view'],
    ['venueReg', 'edit', 'edit', 'edit', 'edit', 'view', 'edit'],
    ['rooms', 'view', 'view', 'view', 'view', 'view', 'view'],
  ]),
  Users: makeSheet('Users', [['email', 'role', 'active', 'level'],
    ['dc@x.org', 'DC', 'TRUE', 1], ['sysadmin@x.org', 'SYSADMIN', 'TRUE', 0],
    ['adc@x.org', 'ADC_SCOUT', 'TRUE', 3], ['staff@x.org', 'STAFF', 'TRUE', 4], ['leader@x.org', 'LEADER', 'TRUE', 5]]),
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
  // 舊 News 表：冇 deleted 欄，保留真實升級場景的舊消息（以下只係虛構示例）。
  News: makeSheet('News', [
    ['id', 'districtCode', 'title', 'body', 'date', 'pinned', 'level', 'link', 'linkLabel',
      'notify', 'active', 'expiresAt', 'publishedAt', 'publishedBy', 'updatedAt', 'createdAt'],
    ['old-news-1', 'SKW', '原有消息', '舊內容要保留', '2026-01-01', 'FALSE', '', '', '',
      'FALSE', 'FALSE', '', '', '', '', ''],
  ]),
  VenueBookings: makeSheet('VenueBookings', [
    ['id', 'status', 'purpose'],
    ['original-confirmed-booking', 'approved', '原有借場用途要保留'],
  ]),
};

// 只用無效測試字串；不使用或記錄任何真實 YMIS 帳戶資料。
const scriptProps = {
  PORTAL_TOKEN_SECRET: 'TEST_ONLY_PRIVATE_TOKEN_SECRET_0123456789_ABCD',
  PORTAL_MASTER_PASSWORD: 'FAKE_LEGACY_MASTER_PASSWORD_TO_BE_DELETED',
};
const mockCache = new Map();
let propertyReads = 0;
const ctx = {
  console,
  Logger: { log: () => {} },
  SpreadsheetApp: {
    ProtectionType: { SHEET: 'SHEET' },
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
    getUuid: () => crypto.randomUUID(),
    base64EncodeWebSafe: (s) => Buffer.from(String(s), 'utf8').toString('base64url'),
    base64DecodeWebSafe: (s) => Buffer.from(String(s), 'base64url'),
    newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
    computeDigest: (_a, s) => Array.from(String(s)).map(c => c.charCodeAt(0) % 128),
    computeHmacSha256Signature: (message, key) => Array.from(crypto.createHmac('sha256', String(key)).update(String(message)).digest()).map(b => b > 127 ? b - 256 : b),
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
  },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  MailApp: { sendEmail: () => {} },
  UrlFetchApp: { fetch: () => ({ getContentText: () => '{}', getResponseCode: () => 200 }) },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: (k) => { if (k.startsWith('YMIS_VERIFY_')) propertyReads++; return scriptProps[k] || ''; },
    setProperty: (k, v) => { scriptProps[k] = v; },
    deleteProperty: (k) => { delete scriptProps[k]; },
  }) },
  CacheService: { getScriptCache: () => ({ get: (k) => mockCache.get(k) || null, put: (k, v) => mockCache.set(k, v) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
  __sheets: sheets,
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });
// 測試只核對雜湊有冇新增；唔輸出隨機生成的測試用 API Key。
ctx.uiAlert_ = () => {};
ctx.showKeyDialog_ = () => {};

let pass = 0;
function check(label, fn) { fn(); pass++; console.log('  ✓ ' + label); }

console.log('v4.19.1 只追加升級路徑（舊 Sheet → setupSheets）');

function guardedSetup() {
  const before = Object.fromEntries(Object.entries(sheets).map(([name, sh]) => [
    name, sh._data.map(r => r.slice()),
  ]));
  originals = Object.fromEntries(Object.entries(before).map(([name, rows]) => [
    name, { rows: rows.length, cols: Math.max(0, ...rows.map(r => r.length)) },
  ]));
  violations.length = 0;
  try { ctx.setupSheets(); } finally { originals = null; }
  assert.deepStrictEqual(violations, [], '升級時不可以改動舊儲存格／格式／保護');
  for (const [name, rows] of Object.entries(before)) {
    assert.ok(sheets[name], `原有 ${name} 表不能刪除`);
    rows.forEach((row, i) => {
      assert.deepStrictEqual(sheets[name]._data[i].slice(0, row.length), row,
        `原有 ${name} 表第 ${i + 1} 行任何一格都唔可以改`);
    });
  }
}

check('首輪升級：所有原有表／行／儲存格／格式／保護原封不動，只有缺行／缺欄追加', guardedSetup);
check('setupSheets 清除舊 Apps Script 維護密碼 Property', () => {
  assert.strictEqual(scriptProps.PORTAL_MASTER_PASSWORD, undefined);
});
check('原 Config 未有 API_KEY_HASH：只能在末尾加新行，不觸碰舊 Config 值', () => {
  const hashRows = sheets.Config._data.filter(r => r[0] === 'API_KEY_HASH');
  assert.strictEqual(hashRows.length, 1);
  assert.ok(String(hashRows[0][1]).length > 0);
  assert.strictEqual(sheets.Config._data[1][1], 'SKW');
  assert.strictEqual(sheets.Config._data[2][1], '筲箕灣區');
});

// 模擬三名測試幹部已按區方流程輪換舊密碼；其餘升級舊行 mustChangePassword 仍留空。
const mustChangeCol = sheets.Users._data[0].indexOf('mustChangePassword');
for (const email of ['dc@x.org', 'adc@x.org', 'staff@x.org']) {
  const row = sheets.Users._data.findIndex(r => r[0] === email);
  sheets.Users.getRange(row + 1, mustChangeCol + 1).setValue('FALSE');
}

check('AwardTypes 舊預設原封不動：FIVE/LSM 空白、CCH=CCM+5、HAB/THANKS 舊提名期', () => {
  const by = {};
  ctx.awardTypes_().forEach(t => { by[t.code] = t; });
  assert.strictEqual(by.FIVE.minYears, null);
  assert.strictEqual(by.LSM.minYears, null);
  assert.strictEqual(by.LSM.prevCode, '');
  assert.strictEqual(by.CCH.prevCode, 'CCM');
  assert.strictEqual(by.CCH.minYears, 5);
  assert.strictEqual(by.HAB.round, 'other');
  assert.strictEqual(by.THANKS.round, 'founder');
  assert.strictEqual(by.TEN.prevCode, 'FIVE');
});

check('用戶自訂獎勵年期維持原值，重跑 setupSheets 亦不修改', () => {
  const sh = sheets.AwardTypes;
  const v = sh.getDataRange().getValues();
  const i = v.findIndex(r => r[0] === 'GSA');
  sh.getRange(i + 1, v[0].indexOf('minYears') + 1).setValue(9);
  guardedSetup();
  const by = {};
  ctx.awardTypes_().forEach(t => { by[t.code] = t; });
  assert.strictEqual(by.GSA.minYears, 9);
});

check('Perms：舊 awards view 一格不改，但 ADC／STAFF 實際不可讀／寫提名資料', () => {
  const perms = ctx.readPerms_();
  assert.strictEqual(perms.awards.DC, 'edit');
  assert.strictEqual(perms.awards.DDC_TRAINING, 'view');
  assert.strictEqual(perms.awards.ADC_SCOUT, 'view', '舊矩陣資料不許遷移');
  assert.strictEqual(perms.awards.STAFF, 'view');
  const adc = ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12);
  assert.ok(!ctx.getCards_(adc).data.some(c => c.cardId === 'awards'));
  assert.strictEqual(ctx.getAwardsBoard_(adc).ok, false, '直接調用讀取 API 也要擋');
  assert.ok(ctx.requireCardEdit_(adc, 'awards').error, '直接調用寫入 API 也要擋');
  assert.strictEqual(perms.contacts.STAFF, 'edit');
});

check('Perms：借場審批及房間卡舊矩陣不變，實際門禁分別限制／放行', () => {
  const perms = ctx.readPerms_();
  ['DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING', 'STAFF'].forEach(role => {
    assert.strictEqual(perms.venueReg[role], 'edit', `${role} 舊審批權保留`);
  });
  assert.strictEqual(perms.venueReg.ADC_SCOUT, 'view', '未授權角色的舊 view 格不能清空');
  const adc = ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12);
  const leader = ctx.makeToken_('leader@x.org', 'LEADER', 12);
  assert.ok(!ctx.getCards_(adc).data.some(c => c.cardId === 'venueReg'));
  assert.ok(ctx.requirePerm_(adc, 'canVenue').error, '直接借場審批 API 同樣要檢查 canVenue');
  assert.ok(ctx.getCards_(leader).data.some(c => c.cardId === 'rooms' && c.access === 'view'));
  assert.strictEqual(perms.rooms.LEADER, undefined, '新欄原有行仍是空白，不強行填入');
});

check('getCards：一般登入者／個別卡片範圍仍見 rooms；未獲借場權限者看不到審批', () => {
  const adc = ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12);
  const staff = ctx.makeToken_('staff@x.org', 'STAFF', 12);
  const leader = ctx.makeToken_('leader@x.org', 'LEADER', 12);
  const ids = token => ctx.getCards_(token).data.map(c => c.cardId);
  assert.ok(ids(adc).includes('rooms'));
  assert.ok(!ids(adc).includes('venueReg'));
  assert.ok(ids(staff).includes('venueReg'));

  // 即使有舊 Perms／自訂 edit，後台 canVenue=false 仍要隱藏審批卡。
  const perm = sheets.Perms, head = perm._data[0], venueRow = perm._data.findIndex(r => r[0] === 'venueReg');
  perm.getRange(venueRow + 1, head.indexOf('ADC_SCOUT') + 1).setValue('edit');
  assert.ok(!ids(adc).includes('venueReg'));

  const user = sheets.Users, cardCol = user._data[0].indexOf('cards');
  assert.ok(cardCol >= 0, 'setupSheets 應補 Users.cards');
  const leaderRow = user._data.findIndex(r => r[0] === 'leader@x.org');
  user.getRange(leaderRow + 1, cardCol + 1).setValue('contacts');
  assert.ok(ids(leader).includes('rooms'), '個別 cards 限制唔應阻止查閱日曆');
  assert.ok(!ids(leader).includes('venueReg'));

  // Staff 表專用欄可明確收走 canVenue；即使 Perms=edit 都唔展示審批卡。
  sheets.Staff.appendRow(['staff@x.org', '職員', '', '', 'STAFF', 'FALSE', 'TRUE', '', '', 'TRUE']);
  assert.ok(!ids(staff).includes('venueReg'));
  assert.ok(ids(staff).includes('rooms'));
});

check('舊 Sheet 升級新增 YMIS 卡；DC／DDC／ADC／職員及超管可用，領袖不可見', () => {
  const card = ctx.readSheet_('Cards').find(c => c.cardId === 'ymis');
  assert.ok(card && card.url === '/ymis' && card.enabled === 'TRUE');
  const perms = ctx.readPerms_().ymis;
  ['SYSADMIN', 'DC', 'DDC_ADMIN', 'DDC_TRAINING', 'ADC_SCOUT', 'ADC_CUBS', 'ADC_GH', 'ADC_ROVER', 'ADC_VENTURE', 'STAFF']
    .forEach(role => assert.strictEqual(perms[role], 'view', `${role} 應有查閱權`));
  ['DL', 'LEADER', 'AL'].forEach(role => assert.strictEqual(perms[role], undefined, `${role} 不可見`));

  const adc = ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12);
  const staff = ctx.makeToken_('staff@x.org', 'STAFF', 12);
  const leader = ctx.makeToken_('leader@x.org', 'LEADER', 12);
  const sysadmin = ctx.makeToken_('sysadmin@x.org', 'SYSADMIN', 12);
  const ids = token => ctx.getCards_(token).data.map(c => c.cardId);
  assert.ok(ids(adc).includes('ymis'));
  assert.ok(ids(staff).includes('ymis'), '就算 Staff.canVenue=FALSE，都可查 YMIS：兩種權限分開');
  assert.ok(!ids(ctx.makeToken_('staff@x.org', 'STAFF', 12, 'staff')).includes('ymis'), '同電郵的 Staff 舊登入不可冒充 Users 帳戶');
  assert.ok(!ids(leader).includes('ymis'));
  assert.ok(ids(sysadmin).includes('ymis'), '超管可進入既有 YMIS 帳密內頁');
  sheets.Staff.appendRow(['only-old-staff@x.org', '舊職員', '', '', 'STAFF', 'FALSE', 'TRUE', '', '', 'TRUE']);
  assert.ok(!ids(ctx.makeToken_('only-old-staff@x.org', 'STAFF', 12, 'staff')).includes('ymis'), 'Staff 舊表帳戶無初始密碼檢查，不可查看 YMIS');

  // 故意把舊 Perms 對 LEADER 設為 view，清空帳戶 cards 限制；硬門禁仍不容顯示。
  const user = sheets.Users, leaderRow = user._data.findIndex(r => r[0] === 'leader@x.org');
  const cardCol = user._data[0].indexOf('cards');
  user.getRange(leaderRow + 1, cardCol + 1).setValue('');
  const perm = sheets.Perms;
  const ymisRow = perm._data.findIndex(r => r[0] === 'ymis');
  perm.getRange(ymisRow + 1, perm._data[0].indexOf('LEADER') + 1).setValue('view');
  assert.ok(!ids(leader).includes('ymis'), '即使誤授權都唔可見');
  user.getRange(leaderRow + 1, cardCol + 1).setValue('contacts');
});

check('Token 簽署密鑰缺失時拒絕 token；sheep 只接受 Vercel HMAC 一次性授權，舊 Script Property 不生效', () => {
  const adc = ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12);
  const secret = scriptProps.PORTAL_TOKEN_SECRET;
  delete scriptProps.PORTAL_TOKEN_SECRET;
  try {
    assert.strictEqual(ctx.checkToken_(adc).valid, false, '舊 token 必須失效');
    assert.throws(() => ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12), /PORTAL_TOKEN_SECRET/);
    assert.strictEqual(ctx.login_('sheep', '0728').ok, false, '絕不接受公開舊維護密碼');
  } finally {
    scriptProps.PORTAL_TOKEN_SECRET = secret;
  }
  assert.strictEqual(ctx.login_('sheep', '0728').ok, false);
  scriptProps.PORTAL_MASTER_PASSWORD = 'FAKE-TEST-MASTER-PASSWORD-ONLY';
  assert.strictEqual(ctx.login_('sheep', scriptProps.PORTAL_MASTER_PASSWORD).ok, false,
    'legacy Script Property must never be used to authenticate sheep');
  assert.strictEqual(ctx.getMasterPassword_, undefined, 'Apps Script must not implement master-password lookup');

  const bridgeSecret = scriptProps.PORTAL_MASTER_PROXY_SECRET;
  assert.ok(bridgeSecret && bridgeSecret.length >= 64, 'setup should create a high-entropy machine bridge secret');
  const grant = JSON.stringify({ email: 'sheep', exp: Date.now() + 30_000, nonce: crypto.randomBytes(16).toString('hex') });
  const sig = crypto.createHmac('sha256', bridgeSecret).update(grant).digest('hex');
  assert.strictEqual(ctx.proxyMasterLogin_(grant, 'bad-signature').ok, false, 'API-only / unsigned calls cannot issue a master token');
  const master = ctx.proxyMasterLogin_(grant, sig);
  assert.strictEqual(master.ok, true, 'a valid signed one-time assertion should issue the maintenance session');
  assert.strictEqual(ctx.checkToken_(master.data.token).source, 'proxy');
  assert.strictEqual(ctx.verify_(master.data.token).ok, true);
  assert.ok(ctx.getCards_(master.data.token).data.some(c => c.cardId === 'venueReg'), 'maintenance session keeps superadmin portal access');
  assert.strictEqual(ctx.getYmisCredentials_(master.data.token).ok, true, '已簽署維護超管可使用原有 YMIS 帳密功能');
  assert.strictEqual(ctx.proxyMasterLogin_(grant, sig).ok, false, 'signed assertion replay must be rejected');
  assert.strictEqual(ctx.checkToken_(ctx.makeToken_('sheep', 'SYSADMIN', 12)).valid, false,
    'pre-bridge master tokens must be rejected');
  delete scriptProps.PORTAL_MASTER_PASSWORD;
});

check('YMIS 密碼只在明確要求／有效帳戶／卡片授權之下讀取 Script Properties', () => {
  const adc = ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12);
  const dc = ctx.makeToken_('dc@x.org', 'DC', 12);
  const leader = ctx.makeToken_('leader@x.org', 'LEADER', 12);
  let before = propertyReads;
  assert.strictEqual(ctx.getYmisCredentials_('bad-token').ok, false);
  assert.strictEqual(ctx.getYmisCredentials_(leader).ok, false);
  assert.strictEqual(ctx.getYmisCredentials_(ctx.makeToken_('staff@x.org', 'STAFF', 12, 'staff')).ok, false);
  assert.strictEqual(propertyReads, before, '未獲授權唔可以讀 YMIS 相關 Properties');

  const missing = ctx.getYmisCredentials_(adc);
  assert.ok(missing.ok && missing.data.configured === false);
  assert.strictEqual(missing.data.username, undefined);
  assert.strictEqual(missing.data.password, undefined);

  scriptProps.YMIS_VERIFY_USERNAME = 'fake-test-account';
  scriptProps.YMIS_VERIFY_PASSWORD = 'fake-test-password';
  const granted = ctx.getYmisCredentials_(adc);
  assert.ok(granted.ok && granted.data.configured);
  assert.strictEqual(granted.data.username, 'fake-test-account');
  assert.strictEqual(granted.data.password, 'fake-test-password');
  assert.strictEqual(ctx.getYmisCredentials_(dc).ok, true);
  const adminRow = sheets.Users._data.findIndex(r => r[0] === 'sysadmin@x.org') + 1;
  ctx.setCellByHeader_(sheets.Users, adminRow, 'mustChangePassword', 'FALSE');
  assert.strictEqual(ctx.getYmisCredentials_(ctx.makeToken_('sysadmin@x.org', 'SYSADMIN', 12)).ok, true);
  scriptProps.YMIS_VERIFY_PASSWORD = 'fake-rotated-password';
  assert.strictEqual(ctx.getYmisCredentials_(adc).data.password, 'fake-rotated-password', '更新 Script Properties 後每次讀取均取得新值');
  scriptProps.YMIS_VERIFY_PASSWORD = 'fake-test-password';
  assert.ok(!JSON.stringify(ctx.getCards_(adc)).includes('fake-test-password'), '卡片清單不得洩漏帳密');

  const user = sheets.Users, adcRow = user._data.findIndex(r => r[0] === 'adc@x.org');
  const cardCol = user._data[0].indexOf('cards'), roleCol = user._data[0].indexOf('role');
  user.getRange(adcRow + 1, cardCol + 1).setValue('rooms');
  before = propertyReads;
  assert.strictEqual(ctx.getYmisCredentials_(adc).ok, false, '個別帳戶卡片限制要生效');
  assert.strictEqual(propertyReads, before);
  user.getRange(adcRow + 1, cardCol + 1).setValue('');
  const mustCol = user._data[0].indexOf('mustChangePassword');
  user.getRange(adcRow + 1, mustCol + 1).setValue('TRUE');
  assert.strictEqual(ctx.getYmisCredentials_(adc).ok, false, '仍用初始密碼者不可查共用帳密');
  assert.strictEqual(propertyReads, before);
  user.getRange(adcRow + 1, mustCol + 1).setValue('');
  assert.strictEqual(ctx.getYmisCredentials_(adc).ok, false, '舊 Users 行無法證明已改初始密碼時須拒絕');
  assert.strictEqual(propertyReads, before);
  user.getRange(adcRow + 1, mustCol + 1).setValue('FALSE');
  user.getRange(adcRow + 1, roleCol + 1).setValue('LEADER');
  assert.strictEqual(ctx.getYmisCredentials_(adc).ok, false, '降職後舊 ADC token 不得讀密碼');
  assert.strictEqual(propertyReads, before);
  user.getRange(adcRow + 1, roleCol + 1).setValue('ADC_SCOUT');

  // 舊 token 仍指向 LEADER，但現時 Users 角色已變成 STAFF；即使誤把 LEADER 設為 view 亦不能升權。
  const leaderRow = user._data.findIndex(r => r[0] === 'leader@x.org');
  user.getRange(leaderRow + 1, cardCol + 1).setValue('');
  user.getRange(leaderRow + 1, roleCol + 1).setValue('STAFF');
  assert.strictEqual(ctx.getYmisCredentials_(leader).ok, false);
  assert.strictEqual(propertyReads, before);
  user.getRange(leaderRow + 1, roleCol + 1).setValue('LEADER');
  user.getRange(leaderRow + 1, cardCol + 1).setValue('contacts');
});

check('管理員儲存權限矩陣時會剔走非總監級 YMIS 權限，並維持只讀', () => {
  const matrix = ctx.readPerms_();
  matrix.ymis.LEADER = 'edit';
  matrix.ymis.ADC_SCOUT = 'edit';
  assert.ok(ctx.savePerms_(ctx.makeToken_('dc@x.org', 'DC', 12), matrix).ok);
  const updated = ctx.readPerms_().ymis;
  assert.strictEqual(updated.LEADER, undefined);
  assert.strictEqual(updated.ADC_SCOUT, 'view');
  assert.strictEqual(updated.STAFF, 'view');
});

check('YMIS 憑據只可由 POST action 取得；GET 即使有效 token 也不回傳', () => {
  const orig = ctx.getConfigValue_;
  // 路由 mock 使用測試專用 API Key，保持正式 fail-closed 驗證。
  const testApiKey = 'upgrade-test-api-key';
  ctx.getConfigValue_ = k => k === 'API_KEY_HASH' ? ctx.sha256_(testApiKey) : orig(k);
  try {
    const adc = ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12);
    const leader = ctx.makeToken_('leader@x.org', 'LEADER', 12);
    const get = JSON.parse(ctx.doGet({ parameter: { action: 'getYmisCredentials', token: adc } }));
    assert.strictEqual(get.ok, false);
    const req = token => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'getYmisCredentials', token, apiKey: testApiKey }) } }));
    assert.strictEqual(req(leader).ok, false);
    const granted = req(adc);
    assert.ok(granted.ok && granted.data.username === 'fake-test-account');
    assert.strictEqual(granted.data.password, 'fake-test-password');
  } finally {
    ctx.getConfigValue_ = orig;
  }
});

check('已停用用戶嘅舊 token（包括超管）不可再查看卡片或 YMIS 資料', () => {
  const user = sheets.Users, activeCol = user._data[0].indexOf('active');
  for (const [email, role] of [['leader@x.org', 'LEADER'], ['sysadmin@x.org', 'SYSADMIN']]) {
    const idx = user._data.findIndex(r => r[0] === email);
    const token = ctx.makeToken_(email, role, 12);
    user.getRange(idx + 1, activeCol + 1).setValue('FALSE');
    assert.strictEqual(ctx.getCards_(token).ok, false);
    const before = propertyReads;
    assert.strictEqual(ctx.getYmisCredentials_(token).ok, false);
    assert.strictEqual(propertyReads, before);
    user.getRange(idx + 1, activeCol + 1).setValue('TRUE');
  }
});

check('待批走馬燈不向無審批卡者透露借場申請資料', () => {
  ctx.appendRowObj_(sheets.VenueBookings, { id: 'test-venue', status: 'pending', name: '申請人', venueName: '區總部' });
  const staff = ctx.makeToken_('staff@x.org', 'STAFF', 12);
  const dc = ctx.makeToken_('dc@x.org', 'DC', 12);
  assert.strictEqual(ctx.getPendingInbox_(staff).data.venue.length, 0);
  assert.strictEqual(ctx.getPendingInbox_(dc).data.venue.length, 1);
});

check('Cards：保留舊 news／contacts／rooms 名稱及設定', () => {
  const rows = ctx.readSheet_('Cards');
  const news = rows.find(r => r.cardId === 'news');
  assert.ok(news && news.enabled === 'TRUE', '舊卡啟用狀態必須保留');
  assert.strictEqual(rows.find(r => r.cardId === 'meeting').enabled, 'TRUE');
  assert.strictEqual(rows.find(r => r.cardId === 'annual').enabled, 'FALSE');
  assert.strictEqual(ctx.readPerms_().news.STAFF, 'edit', '舊 news 權限行不應被刪改');
  assert.strictEqual(ctx.readPerms_().meeting.DC, 'edit');
  assert.strictEqual(ctx.readPerms_().annual.DDC_ADMIN, 'view');
  const contacts = rows.find(r => r.cardId === 'contacts');
  assert.strictEqual(contacts.title, '聯結簿');
  assert.strictEqual(contacts.description, '旅團 · 港島地域 · 總會 聯絡資料');
  const rooms = rows.find(r => r.cardId === 'rooms');
  assert.strictEqual(rooms.title, '地域房間使用情況', '原 Sheet 舊名稱不改');
  assert.strictEqual(rooms.description, '17／18／19 樓逐間房睇用途時段 · 今日總覽');
  const displayed = ctx.getCards_(ctx.makeToken_('staff@x.org', 'STAFF', 12)).data;
  assert.strictEqual(displayed.find(c => c.cardId === 'rooms').title, '地域房間使用情況');
  assert.strictEqual(displayed.find(c => c.cardId === 'rooms').description, '17／18／19 樓逐間房睇用途時段 · 今日總覽');
  assert.ok(displayed.some(c => c.cardId === 'news'), '舊 news 入口不自動隱藏，由區方自行決定');
});

check('Cards：用戶自行改過嘅 rooms 名稱／描述保持顯示原樣', () => {
  const sh = sheets.Cards;
  const rows = sh.getDataRange().getValues();
  const i = rows.findIndex(r => r[0] === 'rooms');
  sh.getRange(i + 1, 2).setValue('自訂房間日曆');
  sh.getRange(i + 1, 6).setValue('自訂說明');
  guardedSetup();
  const rooms = ctx.readSheet_('Cards').find(r => r.cardId === 'rooms');
  assert.strictEqual(rooms.title, '自訂房間日曆');
  assert.strictEqual(rooms.description, '自訂說明');
  assert.strictEqual(ctx.getCards_(ctx.makeToken_('dc@x.org', 'DC', 12)).data.find(c => c.cardId === 'rooms').title, '自訂房間日曆');
});

check('現有區有 Users 帳戶時不會新增公開預設密碼的高權限帳戶', () => {
  const users = ctx.readSheet_('Users');
  assert.strictEqual(users.length, 5, '應保留原有五個帳戶而不自動加入示範帳戶');
  assert.ok(!users.some(u => String(u.email || '').endsWith('@skwscout.org.hk')));
});

check('自訂舊卡片／既有借場及消息記錄，升級時不可被刪除或覆寫', () => {
  // 自訂入口即使沿用舊 meeting ID，重跑升級亦不可被停用或清空。
  ctx.appendRowObj_(sheets.Cards, {
    cardId: 'meeting', title: '自訂會議記錄', url: '/my-calendar', type: 'jump',
    source: 'custom', enabled: 'TRUE', category: 'done',
  });
  guardedSetup();
  const custom = ctx.readSheet_('Cards').find(r => r.cardId === 'meeting' && r.source === 'custom');
  assert.ok(custom && custom.title === '自訂會議記錄' && custom.enabled === 'TRUE');
  assert.strictEqual(custom.url, '/my-calendar');
  const booking = ctx.readSheet_('VenueBookings').find(r => r.id === 'original-confirmed-booking');
  assert.ok(booking && booking.status === 'approved' && booking.purpose === '原有借場用途要保留');
  const notice = ctx.readSheet_('News').find(r => r.id === 'old-news-1');
  assert.ok(notice && notice.title === '原有消息' && notice.body === '舊內容要保留');
  assert.strictEqual(ctx.getConfigValue_('districtName'), '筲箕灣區');
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

check('setupSheets 多次重跑：所有格不變、不加重複行，舊資料全部仍在', () => {
  const oldApiKeyHash = ctx.getConfigValue_('API_KEY_HASH');
  const beforeCounts = Object.fromEntries(Object.entries(sheets).map(([name, sh]) => [name, sh.getLastRow()]));
  guardedSetup();
  assert.strictEqual(ctx.getConfigValue_('API_KEY_HASH'), oldApiKeyHash, '重跑不可重設現有 API Key');
  assert.deepStrictEqual(Object.fromEntries(Object.entries(sheets).map(([name, sh]) => [name, sh.getLastRow()])), beforeCounts);
  assert.strictEqual(ctx.readSheet_('Users').length, 5, '重跑不可新增預設管理員帳戶');
  assert.ok(ctx.readSheet_('VenueBookings').some(r => r.id === 'original-confirmed-booking' && r.purpose === '原有借場用途要保留'));
  assert.ok(ctx.readSheet_('News').some(r => r.id === 'old-news-1' && r.body === '舊內容要保留'));
  assert.ok(ctx.readSheet_('Cards').some(r => r.cardId === 'news' && r.enabled === 'TRUE'));
  assert.ok(ctx.readSheet_('Cards').some(r => r.cardId === 'meeting' && r.source === 'custom' && r.enabled === 'TRUE'));
  assert.strictEqual(ctx.readPerms_().news.STAFF, 'edit', '舊 Permissions 行要保留');
  const by = {};
  ctx.awardTypes_().forEach(t2 => { by[t2.code] = t2; });
  assert.strictEqual(by.GSA.minYears, 9, '用戶自訂值重跑後仍然喺度');
  assert.strictEqual(by.FIVE.minYears, null, '舊規則原樣不遷移');
  assert.strictEqual(ctx.readSheet_('Cards').find(r => r.cardId === 'rooms').title, '自訂房間日曆');
  assert.strictEqual(ctx.readPerms_().rooms.LEADER, undefined, '不向原有 rooms 行寫新權限值');
  const leader = ctx.makeToken_('leader@x.org', 'LEADER', 12);
  assert.ok(ctx.getCards_(leader).data.some(c => c.cardId === 'rooms' && c.access === 'view'));
  assert.strictEqual(ctx.readPerms_().venueReg.ADC_SCOUT, 'edit', '自訂矩陣原樣保留');
  const adc = ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12);
  assert.ok(!ctx.getCards_(adc).data.some(c => c.cardId === 'venueReg'), '但無 canVenue 仍唔會展示審批卡');
});

check('現有 API_KEY_HASH 行留空時，setupSheets 保持空白且不產生重複行', () => {
  const cfg = sheets.Config;
  const row = cfg._data.findIndex(r => r[0] === 'API_KEY_HASH');
  const originalHash = cfg._data[row][1];
  cfg.getRange(row + 1, 2).setValue('');
  try {
    const count = cfg.getLastRow();
    guardedSetup();
    assert.strictEqual(cfg._data[row][1], '');
    assert.strictEqual(cfg.getLastRow(), count);
    assert.strictEqual(ctx.getConfigValue_('API_KEY_HASH'), '');
  } finally { cfg.getRange(row + 1, 2).setValue(originalHash); }
});

check('全新 Config 表才可連新行一併建立新 Key；其他原有表不改', () => {
  const previous = sheets.Config;
  delete sheets.Config;
  try {
    guardedSetup();
    const row = sheets.Config._data.find(r => r[0] === 'API_KEY_HASH');
    assert.ok(row && String(row[1]).length > 0, '新表當次寫入時便有 Key 雜湊');
  } finally { sheets.Config = previous; }
});

check('已存在但只有表頭的 Users 表不應種公開初始密碼管理員', () => {
  const previous = sheets.Users;
  sheets.Users = makeSheet('Users', [['email', 'role', 'active']]);
  try {
    guardedSetup();
    assert.strictEqual(sheets.Users.getLastRow(), 1, '現有 Users 只追加欄，不加帳戶行');
  } finally { sheets.Users = previous; }
});

check('已有資料但缺 Users 表時只建空表頭，不植入公開初始管理員', () => {
  const previous = sheets.Users;
  delete sheets.Users;
  try {
    guardedSetup();
    assert.ok(sheets.Users._data[0].includes('email'));
    assert.strictEqual(sheets.Users._data.length, 1);
    guardedSetup();
    assert.strictEqual(sheets.Users._data.length, 1);
  } finally { sheets.Users = previous; }
});

check('已有 Perms 只有表頭時，只在底部追加缺少的權限行', () => {
  const previous = sheets.Perms;
  sheets.Perms = makeSheet('Perms', [['cardId', 'DC', 'STAFF']]);
  try {
    guardedSetup();
    assert.ok(sheets.Perms._data.some(r => r[0] === 'ymis'));
    assert.ok(sheets.Perms._data.some(r => r[0] === 'rooms'));
    const row = sheets.Perms._data.find(r => r[0] === 'ymis');
    assert.strictEqual(row[2], 'view');
    const count = sheets.Perms.getLastRow();
    guardedSetup();
    assert.strictEqual(sheets.Perms.getLastRow(), count, '不加重複 Perms 行');
  } finally { sheets.Perms = previous; }
});

check('已有空白 Awards 表只補新表頭，原有格式及保護不變', () => {
  const previous = sheets.Awards;
  sheets.Awards = makeSheet('Awards', []);
  try {
    guardedSetup();
    assert.strictEqual(sheets.Awards._data.length, 1);
    assert.ok(sheets.Awards._data[0].includes('GSA'));
  } finally { sheets.Awards = previous; }
});

check('整本全新空白 Sheet 仍可初始化並只在首次建立時種初始帳戶', () => {
  const original = { ...sheets };
  for (const name of Object.keys(sheets)) delete sheets[name];
  sheets.Sheet1 = makeSheet('Sheet1', []);
  try {
    guardedSetup();
    assert.ok(sheets.Users._data.length > 1, '全新系統仍可按現有藍圖首次建立帳戶');
    assert.ok(sheets.Config._data.some(r => r[0] === 'API_KEY_HASH' && r[1]));
    guardedSetup();
  } finally {
    for (const name of Object.keys(sheets)) delete sheets[name];
    Object.assign(sheets, original);
  }
});

check('舊 UnitSections 自訂欄位及既有集會資料升級保留，重跑不重複補欄', () => {
  const previous = sheets.UnitSections;
  sheets.UnitSections = makeSheet('UnitSections', [
    ['troop', 'location', 'custom'], ['206', '既有地點必須保留', '自訂資料'],
  ]);
  try {
    guardedSetup();
    assert.deepStrictEqual(sheets.UnitSections._data[0].slice(0, 3), ['troop', 'location', 'custom']);
    assert.deepStrictEqual(sheets.UnitSections._data[1].slice(0, 3), ['206', '既有地點必須保留', '自訂資料']);
    const after = JSON.stringify(sheets.UnitSections._data);
    guardedSetup();
    assert.strictEqual(JSON.stringify(sheets.UnitSections._data), after);
  } finally { sheets.UnitSections = previous; }
});

check('升級追加獨立旅團資料卡及固定權限，原 Cards／Perms 儲存格不變', () => {
  assert.strictEqual(sheets.Cards._data.filter(r => r[0] === 'troopDirectory').length, 1);
  assert.strictEqual(sheets.Perms._data.filter(r => r[0] === 'troopDirectory').length, 1);
  const card = ctx.getCards_(ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12)).data.find(c => c.cardId === 'troopDirectory');
  assert.ok(card);
  assert.strictEqual(card.url, '/troop-directory');
  assert.strictEqual(card.access, 'edit');
  assert.strictEqual(ctx.requireCardEdit_(ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12), 'visit').error != null, true);
  assert.strictEqual(ctx.requireCardEdit_(ctx.makeToken_('staff@x.org', 'STAFF', 12), 'troopDirectory').error != null, true);
});

check('現行發布快照與開發源一致，原 v4.29.0 凍結快照保留', () => {
  const current = fs.readFileSync(path.join(__dirname, '../gs/releases/Code-v4.31.0.gs'), 'utf8');
  assert.strictEqual(current, code);
  assert.ok(fs.readFileSync(path.join(__dirname, '../gs/releases/Code-v4.30.0.gs'), 'utf8').includes("version: '4.30.0'"));
  const frozen = fs.readFileSync(path.join(__dirname, '../gs/releases/Code-v4.29.0.gs'), 'utf8');
  assert.ok(frozen.includes("version: '4.29.0'"));
  assert.ok(code.includes("version: '4.31.0'"));
});

check('前端可下載的完整 Code.gs 與後台原始檔完全一致', () => {
  const downloadable = fs.readFileSync(path.join(__dirname, '..', 'public', 'downloads', 'Code.gs.txt'), 'utf8');
  assert.ok(downloadable === code, '如更新 gs/Code.gs，記得同步更新 public/downloads/Code.gs.txt');
});

console.log(`\n全部通過（${pass} 項）✓`);
