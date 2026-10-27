/**
 * 🧱 旅→團階層名錄後台邏輯測試（v4.29.0）— 用 node 直接跑，唔使開 Apps Script。
 *   node scripts/test-unit-sections-gs.js
 * 喺 vm 入面 stub Apps Script，用記憶體陣列扮 Sheet（harness 同 test-visit-gs.js 同款）。
 *
 * 覆蓋：
 *  1. parseSectionCount_：團數字串拆解（常規／A 空／S 海、cap 9、非法代號丟棄、大小寫）
 *  2. publicUnitLabel_：支部＋代號 → 顯示名
 *  3. 無維護列時由團數字串自動產骨架（101 旅 7 團、206 旅 4 團）
 *  4. 公開名錄無內部欄位外洩（note／active／publicVisible）
 *  5. UnitSections 維護覆蓋骨架；停用／非公開團唔出現喺公開名錄
 *  6. saveUnitSections：權限（visit edit）、網址／代號／dup key 驗證、全表重寫
 *  7. getVisitBoard：unitSectionsReady 閘＋管理端拎到全部列（含停用）
 *  8. 藍圖／健康檢查：UnitSections 喺 blueprint，補建偵測得到
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs'), 'utf8');

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
        setValue: (v) => { while (data.length < row) data.push([]); data[row - 1][col - 1] = v; },
        setValues: (vals) => {
          vals.forEach((r, i) => {
            while (data.length < row + i) data.push([]);
            if (!data[row - 1 + i]) data[row - 1 + i] = [];
            r.forEach((v, j) => { data[row - 1 + i][col - 1 + j] = v; });
          });
        },
        setFontWeight: () => ({ setBackground: () => {} }),
        setBackground: () => {},
        setNumberFormat: () => {},
      };
    },
    appendRow: (row) => { data.push(row.slice()); },
    deleteRow: (idx) => { data.splice(idx - 1, 1); },
    deleteRows: (idx, n) => { data.splice(idx - 1, n); },
    setFrozenRows: () => {}, setFrozenColumns: () => {}, clear: () => { data.length = 0; },
    _data: data,
  };
}

const UNIT_HEAD = ['troop', 'label', 'org', 'gh', 'cub', 'scout', 'venture', 'rover',
  'active', 'note', 'meetingTime', 'instagramUrl', 'facebookUrl', 'websiteUrl', 'publicVisible'];
const US_HEAD = ['troop', 'section', 'unitCode', 'meetingTime', 'location',
  'instagramUrl', 'facebookUrl', 'websiteUrl', 'active', 'publicVisible'];

function buildContext() {
  const sheets = {
    Config: makeSheet('Config', [['key', 'value', '說明'],
      ['districtCode', 'SKW', ''], ['districtName', '筲箕灣區', ''], ['TROOP_LIST', '', '']]),
    Perms: makeSheet('Perms', [['cardId', 'DC', 'AL'], ['visit', 'edit', 'view'], ['troopDirectory', 'edit', 'view']]),
    Users: makeSheet('Users', [['email', 'role', 'active', 'displayName'],
      ['dc@x.org', 'DC', 'TRUE', '陳區總監'], ['al@x.org', 'AL', 'TRUE', '助理區領袖']]),
    Roles: makeSheet('Roles', [['role', 'label', 'protected', 'level'],
      ['DC', '區總監', 'TRUE', 1], ['AL', '助理區領袖', 'TRUE', 5]]),
    Units: makeSheet('Units', [UNIT_HEAD]),
    UnitSections: makeSheet('UnitSections', [US_HEAD]),
    Visits: makeSheet('Visits', [['id']]),
    System: makeSheet('System', [['key', 'value'], ['locked', 'FALSE']]),
  };
  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getId: () => 'ss-id',
        getSheetByName: (n) => sheets[n] || null,
        getSheets: () => Object.keys(sheets).map(n => ({ getName: () => n })),
        insertSheet: (n) => (sheets[n] = makeSheet(n, [])),
      }),
    },
    Session: { getScriptTimeZone: () => 'Asia/Hong_Kong' },
    Utilities: {
      formatDate: (d) => new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10),
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
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k === 'PORTAL_TOKEN_SECRET' ? 'FAKE_UNIT_TEST_PRIVATE_TOKEN_SECRET_0123456789' : ''),
        setProperty: () => {},
      }),
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'Code.gs' });
  const testApiKey = 'us-test-api-key';
  sheets.Config.appendRow(['API_KEY_HASH', ctx.sha256_(testApiKey), 'test only']);
  return { ctx, sheets };
}

let pass = 0;
function check(label, fn) { fn(); pass++; console.log('  ✓ ' + label); }

console.log('旅→團階層名錄（UnitSections v4.29.0）後台測試');

// ── 1. parseSectionCount_ ──
check('parseSectionCount_：常規團＋A／S 變體拆解正確', () => {
  const { ctx } = buildContext();
  assert.deepEqual(ctx.parseSectionCount_('1+A1'), ['', 'A1']);
  assert.deepEqual(ctx.parseSectionCount_('2'), ['', '']);
  assert.deepEqual(ctx.parseSectionCount_('1+A1+S1'), ['', 'A1', 'S1']);
  assert.deepEqual(ctx.parseSectionCount_(''), []);
  assert.deepEqual(ctx.parseSectionCount_(null), []);
});

check('parseSectionCount_：cap 9、非法代號丟棄、小寫自動轉大寫', () => {
  const { ctx } = buildContext();
  assert.strictEqual(ctx.parseSectionCount_('99').length, 9);
  assert.deepEqual(ctx.parseSectionCount_('1+X9'), ['']);
  assert.deepEqual(ctx.parseSectionCount_('a1'), ['A1']);
  assert.deepEqual(ctx.parseSectionCount_('2+A1+A1'), ['', '', 'A1'], '重複變體只留一個');
});

// ── 2. publicUnitLabel_ ──
check('publicUnitLabel_：支部名＋空／海前綴標籤', () => {
  const { ctx } = buildContext();
  assert.strictEqual(ctx.publicUnitLabel_('scout', ''), '童軍團');
  assert.strictEqual(ctx.publicUnitLabel_('scout', 'A1'), '空童軍團');
  assert.strictEqual(ctx.publicUnitLabel_('venture', 'S1'), '海深資童軍團');
  assert.strictEqual(ctx.publicUnitLabel_('gh', ''), '小童軍團');
  assert.strictEqual(ctx.publicUnitLabel_('rover', 'A1'), '空樂行童軍團');
  assert.strictEqual(ctx.publicUnitLabel_('hack', ''), '');
});

// ── 3. 骨架生成 ──
check('無維護列：listDistrictTroops 按團數字串自動產骨架（101 旅 7 團、206 旅 4 團）', () => {
  const { ctx } = buildContext();
  const res = ctx.listDistrictTroops_();
  assert.strictEqual(res.ok, true);
  const t101 = res.data.troops.find(t => t.troop === '101');
  assert.strictEqual(t101.units.length, 7);
  assert.deepEqual(t101.sectionCounts, { scout: '1+A1', venture: '1+A1+S1', rover: '1+A1' });
  const labels = t101.units.map(u => u.label);
  for (const want of ['童軍團', '空童軍團', '深資童軍團', '空深資童軍團', '海深資童軍團', '樂行童軍團', '空樂行童軍團']) {
    assert.ok(labels.includes(want), '缺 ' + want);
  }
  assert.ok(t101.units.every(u => u.meetingTime === '' && u.location === '' && u.instagramUrl === ''));
  const t206 = res.data.troops.find(t => t.troop === '206');
  assert.strictEqual(t206.units.length, 4);
  assert.strictEqual(res.data.troops.length, 28, 'seed 28 旅全部公開');
});

// ── 4. 無內部欄位外洩 ──
check('公開名錄結構：每團淨係 8 個公開欄位，note／active／publicVisible 唔流出', () => {
  const { ctx } = buildContext();
  const res = ctx.listDistrictTroops_();
  const unitKeys = Object.keys(res.data.troops[0].units[0]).sort();
  assert.deepEqual(unitKeys,
    ['facebookUrl', 'instagramUrl', 'label', 'location', 'meetingTime', 'section', 'unitCode', 'websiteUrl'].sort());
  const serialized = JSON.stringify(res.data);
  for (const banned of ['"note"', '"active"', 'publicVisible']) {
    assert.ok(!serialized.includes(banned), '公開輸出唔應包含 ' + banned);
  }
});

// ── 5. 維護覆蓋＋停用／非公開排除 ──
check('UnitSections 維護列覆蓋骨架；停用同非公開團唔喺公開名錄', () => {
  const { ctx, sheets } = buildContext();
  const dcToken = ctx.makeToken_('dc@x.org', 'DC', 12);
  const save = ctx.saveUnitSections_(dcToken, [
    { troop: '206', section: 'scout', unitCode: '', meetingTime: '逢星期六 14:00-17:00',
      location: '太古城番禺會所', instagramUrl: 'https://ig.test/206', facebookUrl: '', websiteUrl: '',
      active: true, publicVisible: true },
    { troop: '206', section: 'gh', unitCode: '', meetingTime: '', location: '',
      instagramUrl: '', facebookUrl: '', websiteUrl: '', active: false, publicVisible: true },
    { troop: '206', section: 'cub', unitCode: '', meetingTime: '內部測試', location: '內部地點',
      instagramUrl: '', facebookUrl: '', websiteUrl: '', active: true, publicVisible: false },
  ]);
  assert.strictEqual(save.ok, true);
  assert.strictEqual(save.data.count, 3);
  const res = ctx.listDistrictTroops_();
  const t206 = res.data.troops.find(t => t.troop === '206');
  assert.strictEqual(t206.units.length, 1, '停用 gh＋非公開 cub 被排除，淨餘公開 scout 團');
  const scout = t206.units[0];
  assert.strictEqual(scout.section, 'scout');
  assert.strictEqual(scout.location, '太古城番禺會所');
  assert.strictEqual(scout.meetingTime, '逢星期六 14:00-17:00');
  assert.strictEqual(scout.instagramUrl, 'https://ig.test/206');
  // 管理端讀原始 sheet 仍然見到全部 3 列
  assert.strictEqual(ctx.readUnitSections_().length, 3);
  assert.ok(sheets.UnitSections._data[0].length === 10, '表頭維持 10 欄');
});

// ── 6. saveUnitSections 權限＋驗證 ──
check('saveUnitSections：AL 無 edit 權限被擋；壞網址／壞代號／dup key 報錯；空陣列可清空', () => {
  const { ctx } = buildContext();
  const dcToken = ctx.makeToken_('dc@x.org', 'DC', 12);
  const alToken = ctx.makeToken_('al@x.org', 'AL', 12);
  const base = { troop: '206', section: 'scout', unitCode: '', meetingTime: '', location: '',
    instagramUrl: '', facebookUrl: '', websiteUrl: '', active: true, publicVisible: true };

  assert.strictEqual(ctx.saveUnitSections_(alToken, [base]).ok, false, 'AL 只得 view，應被擋');
  assert.strictEqual(ctx.saveUnitSections_(dcToken, [{ ...base, instagramUrl: 'javascript:alert(1)' }]).ok, false);
  assert.strictEqual(ctx.saveUnitSections_(dcToken, [{ ...base, unitCode: 'X9' }]).ok, false);
  assert.strictEqual(ctx.saveUnitSections_(dcToken, [base, { ...base }]).ok, false, 'dup key 應被擋');
  assert.strictEqual(ctx.saveUnitSections_(dcToken, [{ ...base, unitCode: 'A1' }]).ok, true, 'A1 代號合法');

  const cleared = ctx.saveUnitSections_(dcToken, []);
  assert.strictEqual(cleared.ok, true, '空陣列＝清空維護資料');
  const fallback = ctx.listDistrictTroops_().data.troops.find(t => t.troop === '206');
  assert.strictEqual(fallback.units.length, 4, '清空後回落自動骨架');
});

// ── 7. getVisitBoard 閘＋管理端完整列 ──
check('getVisitBoard：unitSectionsReady 閘；管理端攞到全部列（含停用／非公開）', () => {
  const { ctx, sheets } = buildContext();
  const dcToken = ctx.makeToken_('dc@x.org', 'DC', 12);
  ctx.saveUnitSections_(dcToken, [
    { troop: '206', section: 'scout', unitCode: '', meetingTime: '時間', location: '地點',
      instagramUrl: '', facebookUrl: '', websiteUrl: '', active: true, publicVisible: true },
    { troop: '206', section: 'gh', unitCode: '', meetingTime: '', location: '',
      instagramUrl: '', facebookUrl: '', websiteUrl: '', active: false, publicVisible: false },
  ]);
  const board = ctx.getVisitBoard_(dcToken, '', '');
  assert.strictEqual(board.ok, true);
  assert.strictEqual(board.data.unitSectionsReady, true);
  assert.strictEqual(board.data.unitSections.length, 2, '管理端連停用列都見到');

  delete sheets.UnitSections;
  const board2 = ctx.getVisitBoard_(dcToken, '', '');
  assert.strictEqual(board2.data.unitSectionsReady, false);
  assert.deepEqual(board2.data.unitSections, []);
});

// ── 8. 藍圖／健康檢查 ──
check('blueprint 含 UnitSections（10 欄表頭），健康檢查可偵測缺表', () => {
  const { ctx, sheets } = buildContext();
  const names = ctx.blueprint_().map(bp => bp.name);
  assert.ok(names.includes('UnitSections'));
  const bp = ctx.blueprint_().find(b => b.name === 'UnitSections');
  assert.deepEqual(bp.rows[0],
    ['troop', 'section', 'unitCode', 'meetingTime', 'location', 'instagramUrl', 'facebookUrl', 'websiteUrl', 'active', 'publicVisible']);

  const h = ctx.getHealthCheck_();
  assert.ok(h.sheets.includes('UnitSections'));
  delete sheets.UnitSections;
  const h2 = ctx.getHealthCheck_();
  assert.ok(!h2.sheets.includes('UnitSections'));
  const missing = ctx.blueprint_()
    .map(bp => bp.name)
    .filter(n => (h2.sheets || []).indexOf(n) < 0);
  assert.ok(missing.includes('UnitSections'), '缺表會喺健康檢查露出');
});

check('所有團隱藏時不重現骨架；Sheet 直接輸入的惡意連結也不公開', () => {
  const { ctx, sheets } = buildContext();
  sheets.UnitSections.appendRow(['206', 'scout', '', '', '隱藏地點', '', '', '', 'TRUE', 'FALSE']);
  let troop = ctx.listDistrictTroops_().data.troops.find(t => t.troop === '206');
  assert.strictEqual(troop.units.length, 0);
  sheets.UnitSections._data[1][9] = 'TRUE';
  sheets.UnitSections._data[1][5] = 'javascript:alert(1)';
  troop = ctx.listDistrictTroops_().data.troops.find(t => t.troop === '206');
  assert.strictEqual(troop.units[0].instagramUrl, '');
});

check('部分不完整的全表提交必須拒絕，不能靜默略過並清走現有資料', () => {
  const { ctx, sheets } = buildContext();
  const token = ctx.makeToken_('dc@x.org', 'DC', 12);
  const base = { troop: '206', section: 'scout', unitCode: '' };
  assert.strictEqual(ctx.saveUnitSections_(token, [base]).ok, true);
  const before = JSON.stringify(sheets.UnitSections._data);
  for (const bad of [null, {}, { ...base, troop: 'missing' }, { ...base, section: '' },
    { ...base, publicVisible: 'FALSE' }, { ...base, active: 'FALSE' }]) {
    assert.strictEqual(ctx.saveUnitSections_(token, [base, bad]).ok, false);
    assert.strictEqual(JSON.stringify(sheets.UnitSections._data), before);
  }
});

check('POST rows 與 unitSections 相容別名都可用，GET 不可儲存團資料', () => {
  const { ctx, sheets } = buildContext();
  const key = 'unit-sections-test-only-key';
  sheets.Config.appendRow(['API_KEY_HASH', ctx.sha256_(key), 'test only']);
  const token = ctx.makeToken_('dc@x.org', 'DC', 12);
  for (const field of ['rows', 'unitSections']) {
    const payload = { apiKey: key, action: 'saveUnitSections', token,
      [field]: [{ troop: '206', section: 'scout', unitCode: '', location: '校本部' }] };
    const result = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(payload) } }));
    assert.strictEqual(result.ok, true, result.error);
  }
  const denied = JSON.parse(ctx.doGet({ parameter: { apiKey: key, action: 'saveUnitSections', token } }));
  assert.strictEqual(denied.ok, false);
});

check('按旅儲存第82旅五支部，不覆寫其他旅或其自訂欄位', () => {
  const { ctx, sheets } = buildContext();
  const token = ctx.makeToken_('dc@x.org', 'DC', 12);
  const other = { troop: '206', section: 'scout', unitCode: '', meetingTime: '原有時間' };
  assert.strictEqual(ctx.saveUnitSections_(token, [other]).ok, true);
  sheets.UnitSections._data[0].push('custom');
  sheets.UnitSections._data[1].push('保留原有自訂資料');
  const unchanged = JSON.stringify(sheets.UnitSections._data[1]);
  const rows = ['gh', 'cub', 'scout', 'venture', 'rover'].map((section, i) => ({
    troop: '82', section, unitCode: '', meetingTime: `第${i}個時段`, location: `地點${i}`,
    instagramUrl: `https://example.org/${section}`,
  }));
  const req = { action: 'saveUnitSections', token, troop: '82', rows, apiKey: 'us-test-api-key' };
  const saved = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(req) } }));
  assert.strictEqual(saved.ok, true, saved.error);
  assert.strictEqual(saved.data.count, 5);
  assert.strictEqual(JSON.stringify(sheets.UnitSections._data[1]), unchanged);
  const troop = ctx.listDistrictTroops_().data.troops.find(t => t.troop === '82');
  assert.strictEqual(troop.units.length, 5);
  assert.strictEqual(new Set(troop.units.map(u => u.meetingTime)).size, 5);
  assert.strictEqual(new Set(troop.units.map(u => u.instagramUrl)).size, 5);
  const before = JSON.stringify(sheets.UnitSections._data);
  assert.strictEqual(ctx.saveUnitSections_(token, [other], '82').ok, false, '拒絕混入其他旅');
  assert.strictEqual(ctx.saveUnitSections_(token, rows, 'missing').ok, false);
  assert.strictEqual(JSON.stringify(sheets.UnitSections._data), before);
  assert.strictEqual(ctx.getVisitBoard_(token).data.unitSectionsScopedSave, true);
  assert.strictEqual(ctx.saveUnitSections_(token, [], '82').ok, true);
  assert.strictEqual(JSON.stringify(sheets.UnitSections._data[1]), unchanged);
});

check('同一支部可分開儲存兩個常規團，各有獨立集會時間', () => {
  const { ctx } = buildContext();
  const token = ctx.makeToken_('dc@x.org', 'DC', 12);
  assert.strictEqual(ctx.saveUnitSections_(token, [
    { troop: '114', section: 'cub', unitCode: '1', meetingTime: '早上' },
    { troop: '114', section: 'cub', unitCode: '2', meetingTime: '下午' },
  ], '114').ok, true);
  const units = ctx.listDistrictTroops_().data.troops.find(t => t.troop === '114').units;
  assert.strictEqual(units.length, 2);
  assert.strictEqual(units[0].meetingTime, '早上');
  assert.strictEqual(units[1].meetingTime, '下午');
});

console.log('\n✅ 全部 ' + pass + ' 項測試通過');
