/**
 * 🎖 獎勵提名後台邏輯測試 — 用 node 直接跑，唔使開 Apps Script。
 *   node scripts/test-awards-gs.js
 * 同 test-news-gs.js 一樣，喺 vm 入面 stub Apps Script，用記憶體陣列扮 Sheet。
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
            r.forEach((v, j) => { data[row - 1 + i][col - 1 + j] = v; });
          });
        },
        setFontWeight: () => ({ setBackground: () => {} }),
        setBackground: () => {},
      };
    },
    appendRow: (row) => { data.push(row.slice()); },
    deleteRow: (idx) => { data.splice(idx - 1, 1); },
    deleteRows: (idx, n) => { data.splice(idx - 1, n); },
    setFrozenRows: () => {}, setFrozenColumns: () => {}, clear: () => { data.length = 0; },
    _data: data,
  };
}

const AWARD_HEAD = ['id', 'districtCode', 'name', 'nameEn', 'troop', 'position', 'serviceStart', 'status', 'note',
  'GSA', 'DSA', 'DSM', 'DSC', 'BRL', 'SVL', 'GDL', 'LSM', 'LSM1', 'LSM2', 'LSM3', 'LSM4',
  'CCM', 'CCH', 'HAB', 'FIVE', 'TEN', 'THANKS', 'updatedAt', 'createdAt'];

const sheets = {
  Config: makeSheet('Config', [['key', 'value', '說明'], ['districtCode', 'SKW', ''], ['districtName', '筲箕灣區', '']]),
  Perms: makeSheet('Perms', [['cardId', 'DC', 'STAFF', 'AL'], ['awards', 'edit', 'edit', 'view']]),
  Users: makeSheet('Users', [['email', 'role', 'active', 'level'],
    ['dc@x.org', 'DC', 'TRUE', 1], ['staff@x.org', 'STAFF', 'TRUE', 4], ['al@x.org', 'AL', 'TRUE', 5]]),
  Roles: makeSheet('Roles', [['role', 'label', 'protected', 'level'],
    ['DC', '區總監', 'TRUE', 1], ['STAFF', '區職員', 'TRUE', 4], ['AL', '助理區領袖', 'TRUE', 5]]),
  Awards: makeSheet('Awards', [AWARD_HEAD]),
  AwardTypes: makeSheet('AwardTypes', [['code', 'label', 'short', 'category', 'prevCode', 'minYears', 'round', 'note', 'enabled']]),
  System: makeSheet('System', [['key', 'value'], ['locked', 'FALSE']]),
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

const dcToken = ctx.makeToken_('dc@x.org', 'DC', 12);
const alToken = ctx.makeToken_('al@x.org', 'AL', 12);

let pass = 0;
function check(label, fn) { fn(); pass++; console.log('  ✓ ' + label); }

console.log('獎勵提名（Awards）後台測試');

check('AwardTypes 空表時用內建預設（18 個獎項）', () => {
  const types = ctx.awardTypes_();
  assert.strictEqual(types.length, 18);
  const gsa = types.filter(t => t.code === 'GSA')[0];
  assert.strictEqual(gsa.label, '優良服務獎章');
  assert.strictEqual(gsa.round, 'founder');
  const dsa = types.filter(t => t.code === 'DSA')[0];
  assert.strictEqual(dsa.prevCode, 'GSA');
  assert.strictEqual(dsa.minYears, 5);
});

check('v4.9.0 預設年期：GSA 7、FIVE 5→TEN +5→LSM 15（LAY 階梯）、CCH 冇得推算、HAB=hab 提名期', () => {
  const by = {};
  ctx.awardTypes_().forEach(t => { by[t.code] = t; });
  assert.strictEqual(by.GSA.prevCode, '');
  assert.strictEqual(by.GSA.minYears, 7);
  assert.strictEqual(by.DSM.minYears, 7);
  assert.strictEqual(by.DSC.minYears, 5);
  assert.strictEqual(by.BRL.minYears, null);
  assert.strictEqual(by.SVL.minYears, null);
  // LAY／會務委員長期服務階梯：五年(5) → 十年(+5) → 長期服務獎章(15) → 一二三星(每 10 年)
  assert.strictEqual(by.FIVE.prevCode, '');
  assert.strictEqual(by.FIVE.minYears, 5);
  assert.strictEqual(by.TEN.prevCode, 'FIVE');
  assert.strictEqual(by.TEN.minYears, 5);
  assert.strictEqual(by.LSM.prevCode, '');
  assert.strictEqual(by.LSM.minYears, 15);
  assert.strictEqual(by.LSM1.prevCode, 'LSM');
  assert.strictEqual(by.LSM1.minYears, 10);
  // 自行申請四寶：全部唔可以推算（CCM/CCH/HAB/THANKS 冇 prev、冇年期）
  ['CCM', 'CCH', 'HAB', 'THANKS'].forEach(c => {
    assert.strictEqual(by[c].prevCode, '', c + ' prevCode');
    assert.strictEqual(by[c].minYears, null, c + ' minYears');
  });
  assert.strictEqual(by.CCH.round, 'other');
  assert.strictEqual(by.HAB.round, 'hab');
  assert.strictEqual(by.THANKS.round, 'other');
});

check('服務開始年份：2004 / 2004-01-15 / 「86th since 2004/01/15」都讀到年份', () => {
  assert.strictEqual(ctx.awardServiceStart_('2004'), '2004');
  assert.strictEqual(ctx.awardServiceStart_('2004/01/15'), '2004');
  assert.strictEqual(ctx.awardServiceStart_('86th since 2004/01/15'), '2004');
  assert.strictEqual(ctx.awardServiceStart_(new Date('2011-06-01T00:00:00Z')), '2011');
  assert.strictEqual(ctx.awardServiceStart_(''), '');
  assert.strictEqual(ctx.awardServiceStart_('冇'), '');
});

check('冇 awards edit 權限唔可以改名冊', () => {
  const r = ctx.saveAwardMember_(alToken, { name: '測試' });
  assert.strictEqual(r.ok, false);
  assert.ok(/權限/.test(r.error));
});

check('姓名必填', () => {
  assert.strictEqual(ctx.saveAwardMember_(dcToken, { name: '  ' }).ok, false);
});

let id1 = '';
check('新增成員 + 獎項年份', () => {
  const r = ctx.saveAwardMember_(dcToken, {
    name: '陳大文', troop: '206', position: 'GSL', status: 'active',
    serviceStart: '2004/01/15',
    awards: { GSA: '2015', LSM: 2009 },
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.created, true);
  id1 = r.data.id;
  const board = ctx.getAwardsBoard_(dcToken);
  assert.strictEqual(board.ok, true);
  assert.strictEqual(board.data.total, 1);
  const m = board.data.members[0];
  assert.strictEqual(m.name, '陳大文');
  assert.strictEqual(m.awards.GSA, '2015');
  assert.strictEqual(m.awards.LSM, '2009');
  assert.strictEqual(m.serviceStart, '2004');
});

check('年份格會清乾淨：2015? 保留問號、「無」保留、日期取年份', () => {
  assert.strictEqual(ctx.awardYearCell_('DSA2015?'), '2015?');
  assert.strictEqual(ctx.awardYearCell_(' 2020 '), '2020');
  assert.strictEqual(ctx.awardYearCell_('無'), '無');
  assert.strictEqual(ctx.awardYearCell_(new Date('2011-06-01T00:00:00Z')), '2011');
  assert.strictEqual(ctx.awardYearCell_(''), '');
});

check('更新成員：只改有帶嘅欄，其餘唔郁', () => {
  const r = ctx.saveAwardMember_(dcToken, { id: id1, name: '陳大文', troop: '206', position: 'GSL', awards: { DSA: '2021?' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.created, false);
  const m = ctx.getAwardsBoard_(dcToken).data.members[0];
  assert.strictEqual(m.awards.DSA, '2021?');
  assert.strictEqual(m.awards.GSA, '2015');   // 原有嘅唔會冇咗
  assert.strictEqual(m.serviceStart, '2004'); // 冇帶 serviceStart 就唔會被清走
});

check('狀態唔啱會變返 active', () => {
  assert.strictEqual(ctx.awardStatus_('hello'), 'active');
  assert.strictEqual(ctx.awardStatus_('notInDistrict'), 'notInDistrict');
  assert.strictEqual(ctx.awardStatus_(''), 'active');
});

check('批量匯入 merge：同名同旅團更新、其餘新增', () => {
  const r = ctx.importAwardMembers_(dcToken, [
    { name: '陳大文', troop: '206', awards: { DSM: '2026' } },   // 已存在 → 更新
    { name: '李小明', troop: '86', position: 'ASL', awards: { GSA: '2019' } },
    { name: '', troop: 'x' },                                     // 冇名 → 略過
  ], 'merge');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.added, 1);
  assert.strictEqual(r.data.updated, 1);
  assert.strictEqual(r.data.skipped, 1);
  const members = ctx.getAwardsBoard_(dcToken).data.members;
  assert.strictEqual(members.length, 2);
  const tai = members.filter(m => m.name === '陳大文')[0];
  assert.strictEqual(tai.awards.DSM, '2026');
  assert.strictEqual(tai.awards.GSA, '2015');
});

check('統計 counts 唔會計「無」', () => {
  ctx.saveAwardMember_(dcToken, { name: '無獎人', troop: '99', awards: { GSA: '無' } });
  const board = ctx.getAwardsBoard_(dcToken).data;
  assert.strictEqual(board.counts.GSA, 2);   // 陳大文 2015、李小明 2019；「無獎人」唔計
  ctx.deleteAwardMember_(dcToken, board.members.filter(m => m.name === '無獎人')[0].id);
});

check('批量匯入 replace 會清空重寫', () => {
  const r = ctx.importAwardMembers_(dcToken, [{ name: '新人甲', troop: '1', awards: { GSA: '2024' } }], 'replace');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.added, 1);
  const members = ctx.getAwardsBoard_(dcToken).data.members;
  assert.strictEqual(members.length, 1);
  assert.strictEqual(members[0].name, '新人甲');
});

check('刪除成員', () => {
  const id = ctx.getAwardsBoard_(dcToken).data.members[0].id;
  assert.strictEqual(ctx.deleteAwardMember_(dcToken, id).ok, true);
  assert.strictEqual(ctx.getAwardsBoard_(dcToken).data.total, 0);
  assert.strictEqual(ctx.deleteAwardMember_(dcToken, 'nope').ok, false);
});

check('頒完獎登記：只帶 id + name + 一個獎年份，其他欄唔會被清走', () => {
  const created = ctx.saveAwardMember_(dcToken, {
    name: '登記測試', troop: '206', position: 'GSL', serviceStart: '2004',
    status: 'active', note: '測試備註', awards: { GSA: '2015' },
  });
  const id = created.data.id;
  const r = ctx.saveAwardMember_(dcToken, { id: id, name: '登記測試', awards: { DSA: '2027' } });
  assert.strictEqual(r.data.saved, true);
  const after = ctx.getAwardsBoard_(dcToken).data.members.filter(m => m.id === id)[0];
  assert.strictEqual(after.awards.DSA, '2027');
  assert.strictEqual(after.awards.GSA, '2015');
  assert.strictEqual(after.troop, '206');
  assert.strictEqual(after.position, 'GSL');
  assert.strictEqual(after.serviceStart, '2004');
  assert.strictEqual(after.note, '測試備註');
  ctx.deleteAwardMember_(dcToken, id);
});

check('儲存年期設定：寫入 AwardTypes 表', () => {
  const r = ctx.saveAwardTypes_(dcToken, [
    { code: 'GSA', label: '優良服務獎章', round: 'founder' },
    { code: 'DSA', label: '優異服務獎章', prevCode: 'GSA', minYears: 6, round: 'founder' },
  ]);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.count, 2);
  const types = ctx.awardTypes_();
  assert.strictEqual(types.length, 2);
  assert.strictEqual(types[1].minYears, 6);
});

check('年期設定：代號重複／上一級唔存在／自己指自己 → 報錯', () => {
  assert.strictEqual(ctx.saveAwardTypes_(dcToken, [
    { code: 'GSA', label: 'a' }, { code: 'GSA', label: 'b' },
  ]).ok, false);
  assert.strictEqual(ctx.saveAwardTypes_(dcToken, [
    { code: 'DSA', label: 'a', prevCode: 'NOPE' },
  ]).ok, false);
  assert.strictEqual(ctx.saveAwardTypes_(dcToken, [
    { code: 'DSA', label: 'a', prevCode: 'DSA' },
  ]).ok, false);
  assert.strictEqual(ctx.saveAwardTypes_(dcToken, [{ code: '中文', label: 'a' }]).ok, false);
});

check('新增獎項會自動補 Awards 表欄位', () => {
  const r = ctx.saveAwardTypes_(dcToken, [
    { code: 'GSA', label: '優良服務獎章', round: 'founder' },
    { code: 'NEWAW', label: '新獎項', round: 'other' },
  ]);
  assert.strictEqual(r.ok, true);
  assert.ok(r.data.newColumns.indexOf('NEWAW') >= 0);
  const head = sheets.Awards._data[0];
  assert.ok(head.indexOf('NEWAW') >= 0);
  // 舊欄唔會冇咗
  assert.ok(head.indexOf('GSA') >= 0 && head.indexOf('LSM4') >= 0);
});

check('冇 edit 權限唔可以改年期設定', () => {
  assert.strictEqual(ctx.saveAwardTypes_(alToken, [{ code: 'GSA', label: 'x' }]).ok, false);
});

check('doGet / doPost 路由通', () => {
  const g = JSON.parse(ctx.doGet({ parameter: { action: 'getAwardsBoard', token: dcToken } }));
  assert.strictEqual(g.ok, true);
  const p = JSON.parse(ctx.doPost({
    parameter: {},
    postData: { contents: JSON.stringify({ action: 'saveAwardMember', token: dcToken, member: { name: '路由測試' } }) },
  }));
  assert.strictEqual(p.ok, true);
});

check('getAwardsBoard 有回內建建議年期（畀「套用建議」用）', () => {
  const d = ctx.getAwardsBoard_(dcToken).data.defaults;
  assert.strictEqual(d.length, 18);
  assert.strictEqual(d.filter(t => t.code === 'GSA')[0].minYears, 7);
  assert.strictEqual(d.filter(t => t.code === 'BRL')[0].minYears, null);
});

check('健康檢查版本 4.14.0', () => {
  const parsed = JSON.parse(ctx.doGet({ parameter: { action: 'getHealthCheck' } }));
  assert.strictEqual(parsed.data.version, '4.17.1');
});

console.log(`\n全部通過（${pass} 項）✓`);
