/**
 * v4.19.0 無損升級路徑測試 — 舊版（4.8.1）已經用緊嘅 Sheet，貼新 Code.gs → setupSheets()：
 *   · AwardTypes 舊預設值自動升級（FIVE/LSM 補年期、CCH 斬開 CCM 連結、THANKS/HAB 轉提名期、note 更新）
 *   · 用戶自己改過嘅設定絕對唔會被掂
 *   · Perms：awards 舊預設（全角色 view）→ 只限 DDC 或以上
 *   · Cards：舊 news 入口只停用（保留原 Card／Perms 行）；contacts／rooms 舊預設改名
 *   · News 表自動補 deleted/deletedAt/deletedBy 欄；ContactNames 表自動補建
 *   · 已有借場記錄、舊消息、設定、自訂卡片一律不可刪除
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
    ['venueReg', '場地借用審批', '🏛', 'builtin', '/venue-regs', '借場申請批核 · 場地清單', 9, 'TRUE', 'FALSE', 'core', 'done'],
    ['rooms', '地域房間使用情況', '🏢', 'builtin', '/rooms', '17／18／19 樓逐間房睇用途時段 · 今日總覽', 15, 'TRUE', 'FALSE', 'core', 'done'],
  ]),
  // 舊 Perms：awards 全角色 view（除 DC/SYSADMIN/DDC_ADMIN edit）；news 全 edit
  Perms: makeSheet('Perms', [
    ['cardId', 'DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING', 'ADC_SCOUT', 'STAFF'],
    ['contacts', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit'],
    ['awards', 'edit', 'edit', 'edit', 'view', 'view', 'view'],
    ['news', 'edit', 'edit', 'edit', 'edit', 'view', 'edit'],
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
const scriptProps = { PORTAL_TOKEN_SECRET: 'TEST_ONLY_PRIVATE_TOKEN_SECRET_0123456789_ABCD' };
let propertyReads = 0;
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
  PropertiesService: { getScriptProperties: () => ({
    getProperty: (k) => { if (k.startsWith('YMIS_VERIFY_')) propertyReads++; return scriptProps[k] || ''; },
    setProperty: (k, v) => { scriptProps[k] = v; },
  }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
  __sheets: sheets,
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });

let pass = 0;
function check(label, fn) { fn(); pass++; console.log('  ✓ ' + label); }

console.log('v4.19.0 無損升級路徑（舊 Sheet → setupSheets）');

ctx.setupSheets();
// 模擬三名測試幹部已按區方流程輪換舊密碼；其餘升級舊行 mustChangePassword 仍留空。
const mustChangeCol = sheets.Users._data[0].indexOf('mustChangePassword');
for (const email of ['dc@x.org', 'adc@x.org', 'staff@x.org']) {
  const row = sheets.Users._data.findIndex(r => r[0] === email);
  sheets.Users.getRange(row + 1, mustChangeCol + 1).setValue('FALSE');
}

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

check('Perms：舊場地審批預設 view → 只限有審批權角色；rooms 繼續全員 view', () => {
  const perms = ctx.readPerms_();
  ['DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING', 'STAFF'].forEach(role => {
    assert.strictEqual(perms.venueReg[role], 'edit', `${role} 可見審批卡`);
  });
  ['ADC_SCOUT', 'LEADER', 'AL'].forEach(role => {
    assert.strictEqual(perms.venueReg[role], undefined, `${role} 不應見審批卡`);
    assert.strictEqual(perms.rooms[role], 'view', `${role} 仍可查看房間及區總部`);
  });
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

check('舊 Sheet 升級新增 YMIS 卡；預設只限 DC／DDC／ADC／職員，領袖不可見', () => {
  const card = ctx.readSheet_('Cards').find(c => c.cardId === 'ymis');
  assert.ok(card && card.url === '/ymis' && card.enabled === 'TRUE');
  const perms = ctx.readPerms_().ymis;
  ['DC', 'DDC_ADMIN', 'DDC_TRAINING', 'ADC_SCOUT', 'ADC_CUBS', 'ADC_GH', 'ADC_ROVER', 'ADC_VENTURE', 'STAFF']
    .forEach(role => assert.strictEqual(perms[role], 'view', `${role} 應有查閱權`));
  ['SYSADMIN', 'DL', 'LEADER', 'AL'].forEach(role => assert.strictEqual(perms[role], undefined, `${role} 不可見`));

  const adc = ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12);
  const staff = ctx.makeToken_('staff@x.org', 'STAFF', 12);
  const leader = ctx.makeToken_('leader@x.org', 'LEADER', 12);
  const sysadmin = ctx.makeToken_('sysadmin@x.org', 'SYSADMIN', 12);
  const ids = token => ctx.getCards_(token).data.map(c => c.cardId);
  assert.ok(ids(adc).includes('ymis'));
  assert.ok(ids(staff).includes('ymis'), '就算 Staff.canVenue=FALSE，都可查 YMIS：兩種權限分開');
  assert.ok(!ids(ctx.makeToken_('staff@x.org', 'STAFF', 12, 'staff')).includes('ymis'), '同電郵的 Staff 舊登入不可冒充 Users 帳戶');
  assert.ok(!ids(leader).includes('ymis'));
  assert.ok(!ids(sysadmin).includes('ymis'), '超管不屬於區總監／副總監／助總監／職員，不能直接讀 YMIS');
  sheets.Staff.appendRow(['only-old-staff@x.org', '舊職員', '', '', 'STAFF', 'FALSE', 'TRUE', '', '', 'TRUE']);
  assert.ok(!ids(ctx.makeToken_('only-old-staff@x.org', 'STAFF', 12)).includes('ymis'), 'Staff 舊表帳戶無初始密碼檢查，不可查看 YMIS');

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

check('登入簽署金鑰未私下設定時拒絕 token；維護帳號必須私下設定長密碼', () => {
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
  try {
    const master = ctx.login_('sheep', scriptProps.PORTAL_MASTER_PASSWORD);
    assert.strictEqual(master.ok, true);
    assert.ok(!ctx.getCards_(master.data.token).data.some(c => c.cardId === 'ymis'));
    assert.strictEqual(ctx.getYmisCredentials_(master.data.token).ok, false);
  } finally {
    delete scriptProps.PORTAL_MASTER_PASSWORD;
  }
});

check('YMIS 密碼只在明確要求／有效帳戶／卡片授權之下讀取 Script Properties', () => {
  const adc = ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12);
  const dc = ctx.makeToken_('dc@x.org', 'DC', 12);
  const leader = ctx.makeToken_('leader@x.org', 'LEADER', 12);
  let before = propertyReads;
  assert.strictEqual(ctx.getYmisCredentials_('bad-token').ok, false);
  assert.strictEqual(ctx.getYmisCredentials_(leader).ok, false);
  assert.strictEqual(ctx.getYmisCredentials_(ctx.makeToken_('staff@x.org', 'STAFF', 12, 'staff')).ok, false);
  assert.strictEqual(ctx.getYmisCredentials_(ctx.makeToken_('sysadmin@x.org', 'SYSADMIN', 12)).ok, false);
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
  // 測試路由時臨時略過假 API Key，正式後台仍會驗證 API Key。
  ctx.getConfigValue_ = k => k === 'API_KEY_HASH' ? '' : orig(k);
  try {
    const adc = ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12);
    const leader = ctx.makeToken_('leader@x.org', 'LEADER', 12);
    const get = JSON.parse(ctx.doGet({ parameter: { action: 'getYmisCredentials', token: adc } }));
    assert.strictEqual(get.ok, false);
    const req = token => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'getYmisCredentials', token }) } }));
    assert.strictEqual(req(leader).ok, false);
    const granted = req(adc);
    assert.ok(granted.ok && granted.data.username === 'fake-test-account');
    assert.strictEqual(granted.data.password, 'fake-test-password');
  } finally {
    ctx.getConfigValue_ = orig;
  }
});

check('已停用用戶嘅舊 token（包括超管）不可再睇房間卡或讀區總部時段', () => {
  const user = sheets.Users, activeCol = user._data[0].indexOf('active');
  for (const [email, role] of [['leader@x.org', 'LEADER'], ['sysadmin@x.org', 'SYSADMIN']]) {
    const idx = user._data.findIndex(r => r[0] === email);
    const token = ctx.makeToken_(email, role, 12);
    user.getRange(idx + 1, activeCol + 1).setValue('FALSE');
    assert.strictEqual(ctx.getCards_(token).ok, false);
    assert.strictEqual(ctx.getDistrictHqBookings_(token, '2026-10-20', 1).ok, false);
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

check('Cards：舊 news 入口只隱藏不刪，舊 Perms 留底；contacts／rooms 預設值升級', () => {
  const rows = ctx.readSheet_('Cards');   // readSheet_ 回傳物件（header 當 key）
  const news = rows.find(r => r.cardId === 'news');
  assert.ok(news, 'news 卡原始行必須保留');
  assert.strictEqual(news.enabled, 'FALSE', '只停用舊內建入口，新版消息改用主控台');
  assert.strictEqual(ctx.readPerms_().news.STAFF, 'edit', 'news 權限行不應被刪除');
  const contacts = rows.filter(r => String(r.cardId || '').trim() === 'contacts')[0];
  assert.ok(contacts, 'contacts 卡應該仍在');
  assert.strictEqual(contacts.title, '聯絡簿');
  assert.strictEqual(contacts.description, '聯絡電話：旅團 · 港島地域 · 總會（職員姓名區方可改）');
  const rooms = rows.find(r => r.cardId === 'rooms');
  assert.strictEqual(rooms.title, '地域房間及區總部使用情況');
  assert.strictEqual(rooms.description, '地域 17／18／19 樓 + 區總部確認借用（紅色）· 月曆');
  assert.strictEqual(ctx.readPerms_().rooms.STAFF, 'view', '原 rooms 卡權限要保留');
  assert.ok(!ctx.getCards_(ctx.makeToken_('staff@x.org', 'STAFF', 12)).data.some(c => c.cardId === 'news'), '一般用戶不應再見舊 news 入口');
});

check('Cards：用戶自行改過嘅 rooms 名稱／描述唔會被覆寫', () => {
  const sh = sheets.Cards;
  const rows = sh.getDataRange().getValues();
  const i = rows.findIndex(r => r[0] === 'rooms');
  sh.getRange(i + 1, 2).setValue('自訂房間日曆');
  sh.getRange(i + 1, 6).setValue('自訂說明');
  ctx.patchCardRows_(ctx.SpreadsheetApp.getActiveSpreadsheet());
  const rooms = ctx.readSheet_('Cards').find(r => r.cardId === 'rooms');
  assert.strictEqual(rooms.title, '自訂房間日曆');
  assert.strictEqual(rooms.description, '自訂說明');
});

check('現有區有 Users 帳戶時不會新增公開預設密碼的高權限帳戶', () => {
  const users = ctx.readSheet_('Users');
  assert.strictEqual(users.length, 5, '應保留原有五個帳戶而不自動加入示範帳戶');
  assert.ok(!users.some(u => String(u.email || '').endsWith('@skwscout.org.hk')));
});

check('自訂舊卡片／既有借場及消息記錄，升級時不可被刪除或覆寫', () => {
  // 自訂入口即使沿用已棄用嘅 meeting ID，亦不可被停用或清空。
  ctx.appendRowObj_(sheets.Cards, {
    cardId: 'meeting', title: '自訂會議記錄', url: '/my-calendar', type: 'jump',
    source: 'custom', enabled: 'TRUE', category: 'done',
  });
  ctx.patchCardRows_(ctx.SpreadsheetApp.getActiveSpreadsheet());
  const custom = ctx.readSheet_('Cards').find(r => r.cardId === 'meeting');
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

check('setupSheets 重跑都唔會清資料（補建唔清空）', () => {
  const oldApiKeyHash = ctx.getConfigValue_('API_KEY_HASH');
  ctx.setupSheets();
  assert.strictEqual(ctx.getConfigValue_('API_KEY_HASH'), oldApiKeyHash, '重跑不可重設現有 API Key');
  assert.strictEqual(ctx.readSheet_('Users').length, 5, '重跑不可新增預設管理員帳戶');
  assert.ok(ctx.readSheet_('VenueBookings').some(r => r.id === 'original-confirmed-booking' && r.purpose === '原有借場用途要保留'));
  assert.ok(ctx.readSheet_('News').some(r => r.id === 'old-news-1' && r.body === '舊內容要保留'));
  assert.ok(ctx.readSheet_('Cards').some(r => r.cardId === 'news' && r.enabled === 'FALSE'));
  assert.ok(ctx.readSheet_('Cards').some(r => r.cardId === 'meeting' && r.enabled === 'TRUE'));
  assert.strictEqual(ctx.readPerms_().news.STAFF, 'edit', '舊 Permissions 行要保留');
  const by = {};
  ctx.awardTypes_().forEach(t2 => { by[t2.code] = t2; });
  assert.strictEqual(by.GSA.minYears, 9, '用戶自訂值重跑 setupSheets 之後仍然喺度');
  assert.strictEqual(by.FIVE.minYears, 5);
  assert.strictEqual(ctx.readSheet_('Cards').find(r => r.cardId === 'rooms').title, '自訂房間日曆');
  assert.strictEqual(ctx.readPerms_().rooms.LEADER, 'view', '房間全員查閱權重跑仍在');
  assert.strictEqual(ctx.readPerms_().venueReg.ADC_SCOUT, 'edit', '自訂嘅審批權限矩陣唔會被遷移覆蓋');
  const adc = ctx.makeToken_('adc@x.org', 'ADC_SCOUT', 12);
  assert.ok(!ctx.getCards_(adc).data.some(c => c.cardId === 'venueReg'), '但無 canVenue 仍唔會展示審批卡');
});

check('前端可下載的完整 Code.gs 與後台原始檔完全一致', () => {
  const downloadable = fs.readFileSync(path.join(__dirname, '..', 'public', 'downloads', 'Code.gs.txt'), 'utf8');
  assert.strictEqual(downloadable, code, '如更新 gs/Code.gs，記得同步更新 public/downloads/Code.gs.txt');
});

console.log(`\n全部通過（${pass} 項）✓`);
