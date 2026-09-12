/**
 * 🏕 旅團探訪後台邏輯測試 — 用 node 直接跑，唔使開 Apps Script。
 *   node scripts/test-visit-gs.js
 * 同 test-awards-gs.js 一樣，喺 vm 入面 stub Apps Script，用記憶體陣列扮 Sheet。
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
      };
    },
    appendRow: (row) => { data.push(row.slice()); },
    deleteRow: (idx) => { data.splice(idx - 1, 1); },
    deleteRows: (idx, n) => { data.splice(idx - 1, n); },
    setFrozenRows: () => {}, setFrozenColumns: () => {}, clear: () => { data.length = 0; },
    _data: data,
  };
}

const VISIT_HEAD = ['id', 'districtCode', 'troop', 'section', 'visitDate', 'quarter', 'kind',
  'visitorName', 'visitorEmail', 'note', 'followUp', 'createdAt', 'updatedAt',
  'leaderMet', 'method', 'officerCount', 'support'];
const UNIT_HEAD = ['troop', 'label', 'org', 'gh', 'cub', 'scout', 'venture', 'rover', 'active', 'note'];

const sheets = {
  Config: makeSheet('Config', [['key', 'value', '說明'], ['districtCode', 'SKW', ''], ['districtName', '筲箕灣區', ''], ['TROOP_LIST', '', '']]),
  Perms: makeSheet('Perms', [['cardId', 'DC', 'ADC_GH', 'AL'], ['visit', 'edit', 'edit', 'view']]),
  Users: makeSheet('Users', [['email', 'role', 'active', 'displayName'],
    ['dc@x.org', 'DC', 'TRUE', '陳區總監'],
    ['gh@x.org', 'ADC_GH', 'TRUE', '李小童軍ADC'],
    ['al@x.org', 'AL', 'TRUE', '助理區領袖']]),
  Roles: makeSheet('Roles', [['role', 'label', 'protected', 'level'],
    ['DC', '區總監', 'TRUE', 1], ['ADC_GH', '助理區總監（小童軍）', 'TRUE', 3], ['AL', '助理區領袖', 'TRUE', 5]]),
  Units: makeSheet('Units', [UNIT_HEAD]),
  Visits: makeSheet('Visits', [VISIT_HEAD]),
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
const ghToken = ctx.makeToken_('gh@x.org', 'ADC_GH', 12);
const alToken = ctx.makeToken_('al@x.org', 'AL', 12);
const thisYear = new Date().getFullYear();

let pass = 0;
function check(label, fn) { fn(); pass++; console.log('  ✓ ' + label); }

console.log('旅團探訪（Visits）後台測試');

check('Units 空表時用內建名單（港島地域官網筲箕灣區 28 個旅）', () => {
  const units = ctx.visitUnits_();
  assert.strictEqual(units.length, 28);
  const u206 = units.filter(u => u.troop === '206')[0];
  assert.strictEqual(u206.label, '港島第206旅');
  assert.strictEqual(u206.org, '太古城物業管理聯絡議會');
  assert.strictEqual(u206.sections.gh, '1');
  assert.strictEqual(u206.sections.rover, '');       // 206 冇樂行
  const u101 = units.filter(u => u.troop === '101')[0];
  assert.strictEqual(u101.sections.venture, '1+A1+S1');  // 空童軍團／海童軍團寫法照留
  assert.strictEqual(u101.sections.cub, '');
});

check('支部代號同標籤：gh/cub/scout/venture/rover', () => {
  assert.strictEqual(ctx.VISIT_SECTIONS.length, 5);
  assert.strictEqual(ctx.VISIT_SECTION_LABEL.gh, '小童軍');
  assert.strictEqual(ctx.VISIT_SECTION_LABEL.venture, '深資童軍');
  assert.strictEqual(ctx.visitSection_('CUB'), 'cub');
  assert.strictEqual(ctx.visitSection_('乜嘢'), '');   // 唔啱就當「全旅」
});

check('角色 → 預設支部（小童軍 ADC 一入去只睇小童軍）', () => {
  assert.strictEqual(ctx.VISIT_ROLE_SECTION.ADC_GH, 'gh');
  assert.strictEqual(ctx.VISIT_ROLE_SECTION.ADC_CUBS, 'cub');
  assert.strictEqual(ctx.VISIT_ROLE_SECTION.ADC_SCOUT, 'scout');
  const board = ctx.getVisitBoard_(ghToken).data;
  assert.strictEqual(board.me.defaultSection, 'gh');
  assert.strictEqual(board.me.name, '李小童軍ADC');
  assert.strictEqual(ctx.getVisitBoard_(dcToken).data.me.defaultSection, '');  // DC 睇晒全部
});

check('日期／季度：Date 物件、2026/3/8 都讀到，季度自動計', () => {
  assert.strictEqual(ctx.visitDate_('2026-03-08'), '2026-03-08');
  assert.strictEqual(ctx.visitDate_('2026/3/8'), '2026-03-08');
  assert.strictEqual(ctx.visitDate_(new Date('2026-07-01T00:00:00Z')), '2026-07-01');
  assert.strictEqual(ctx.visitDate_('唔係日期'), '');
  assert.strictEqual(ctx.visitQuarter_('2026-01-15'), 1);
  assert.strictEqual(ctx.visitQuarter_('2026-06-30'), 2);
  assert.strictEqual(ctx.visitQuarter_('2026-09-08'), 3);
  assert.strictEqual(ctx.visitQuarter_('2026-12-31'), 4);
});

check('冇 visit edit 權限唔可以登記', () => {
  const r = ctx.saveVisit_(alToken, { troop: '206', visitDate: `${thisYear}-03-01` });
  assert.strictEqual(r.ok, false);
});

check('登記探訪：預設今日、探訪幹部自動填登入者、季度自動計', () => {
  const r = ctx.saveVisit_(ghToken, { troop: '206', section: 'gh', visitDate: `${thisYear}-03-08`, note: '集會人數 24' });
  assert.strictEqual(r.ok, true);
  const v = ctx.getVisitBoard_(ghToken).data.visits[0];
  assert.strictEqual(v.troop, '206');
  assert.strictEqual(v.section, 'gh');
  assert.strictEqual(v.visitDate, `${thisYear}-03-08`);
  assert.strictEqual(v.quarter, 1);
  assert.strictEqual(v.visitorName, '李小童軍ADC');
  assert.strictEqual(v.visitorEmail, 'gh@x.org');
  assert.strictEqual(v.kind, 'general');
  assert.strictEqual(v.note, '集會人數 24');
});

check('一日一個旅一次：同一日同一位幹部再撳同一個旅（就算轉支部）都唔會多一筆', () => {
  const before = ctx.getVisitBoard_(ghToken).data.visits.length;
  const again = ctx.saveVisit_(ghToken, { troop: '206', section: 'gh', visitDate: `${thisYear}-03-08` });
  assert.strictEqual(again.ok, false);
  const other = ctx.saveVisit_(ghToken, { troop: '206', section: 'scout', visitDate: `${thisYear}-03-08` });
  assert.strictEqual(other.ok, false);
  assert.strictEqual(ctx.getVisitBoard_(ghToken).data.visits.length, before);
});

check('同一日探 X／Y／Z 幾個旅冇問題；第二日再探返同一個旅都得', () => {
  const before = ctx.getVisitBoard_(ghToken).data.visits.length;
  assert.strictEqual(ctx.saveVisit_(ghToken, { troop: '82', section: 'gh', visitDate: `${thisYear}-03-08` }).ok, true);
  assert.strictEqual(ctx.saveVisit_(ghToken, { troop: '206', section: 'gh', visitDate: `${thisYear}-04-19` }).ok, true);
  const after = ctx.getVisitBoard_(ghToken).data.visits;
  assert.strictEqual(after.length, before + 2);
  // 清返場，等後面嘅測試數目唔變
  after.filter(v => v.visitDate === `${thisYear}-04-19` || v.troop === '82').forEach(v => ctx.deleteVisit_(dcToken, v.id));
  assert.strictEqual(ctx.getVisitBoard_(ghToken).data.visits.length, before);
});

check('第二位幹部同一日探同一個旅 → 佢有佢自己嗰筆', () => {
  const r = ctx.saveVisit_(dcToken, { troop: '206', section: 'scout', visitDate: `${thisYear}-03-08` });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ctx.deleteVisit_(dcToken, r.data.id).ok, true);
});

check('揀日期範圍：由幾月到幾月，範圍以外唔會出', () => {
  ctx.saveVisit_(dcToken, { troop: '17', section: 'scout', visitDate: `${thisYear}-08-20` });
  ctx.saveVisit_(dcToken, { troop: '82', section: 'cub', visitDate: `${thisYear}-11-05` });
  const q3 = ctx.getVisitBoard_(dcToken, `${thisYear}-07-01`, `${thisYear}-09-30`).data;
  assert.strictEqual(q3.visits.length, 1);
  assert.strictEqual(q3.visits[0].troop, '17');
  assert.strictEqual(q3.from, `${thisYear}-07-01`);
  assert.strictEqual(q3.to, `${thisYear}-09-30`);
  const all = ctx.getVisitBoard_(dcToken, `${thisYear}-01-01`, `${thisYear}-12-31`).data;
  assert.strictEqual(all.visits.length, 3);
  assert.strictEqual(all.visits[0].visitDate, `${thisYear}-11-05`);   // 新到舊
});

check('由 / 到 掉轉都唔怕，會自動調返轉頭', () => {
  const b = ctx.getVisitBoard_(dcToken, `${thisYear}-12-31`, `${thisYear}-01-01`).data;
  assert.strictEqual(b.from, `${thisYear}-01-01`);
  assert.strictEqual(b.to, `${thisYear}-12-31`);
});

check('改記錄：只更新有帶嘅欄，探訪幹部唔會無端變咗', () => {
  const board = ctx.getVisitBoard_(dcToken).data;
  const target = board.visits.filter(v => v.troop === '206')[0];
  const r = ctx.saveVisit_(dcToken, { id: target.id, troop: '206', visitDate: `${thisYear}-03-09`, followUp: '協助招募領袖' });
  assert.strictEqual(r.ok, true);
  const after = ctx.getVisitBoard_(dcToken).data.visits.filter(v => v.id === target.id)[0];
  assert.strictEqual(after.visitDate, `${thisYear}-03-09`);
  assert.strictEqual(after.followUp, '協助招募領袖');
  assert.strictEqual(after.visitorName, '李小童軍ADC');   // 原本邊個探就係邊個
  assert.strictEqual(after.section, 'gh');                // 冇帶就唔郁
  assert.strictEqual(after.note, '集會人數 24');
});

check('刪除記錄', () => {
  const before = ctx.getVisitBoard_(dcToken).data.visits;
  const r = ctx.deleteVisit_(dcToken, before[0].id);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ctx.getVisitBoard_(dcToken).data.visits.length, before.length - 1);
  assert.strictEqual(ctx.deleteVisit_(dcToken, 'no-such-id').ok, false);
});

check('冇揀旅團就唔畀儲存', () => {
  assert.strictEqual(ctx.saveVisit_(dcToken, { troop: '' }).ok, false);
});

check('改旅團名單：寫入 Units 表，同時同步 Config TROOP_LIST', () => {
  const r = ctx.saveUnits_(dcToken, [
    { troop: '206', label: '港島第206旅', org: '太古城', sections: { gh: '1', cub: '1', scout: '1', venture: '', rover: '' } },
    { troop: '17', label: '港島第17旅', org: '慈幼中學', sections: { gh: '', cub: '1', scout: '1', venture: '1', rover: '' } },
  ]);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.count, 2);
  const units = ctx.visitUnits_();
  assert.strictEqual(units.length, 2);
  assert.strictEqual(units[0].sections.venture, '');
  assert.strictEqual(ctx.getConfigValue_('TROOP_LIST'), '206,17');
  assert.deepStrictEqual(ctx.getTroopList_().length, 2);
});

check('名單唔可以空、旅號唔可以重複、冇權限唔改得', () => {
  assert.strictEqual(ctx.saveUnits_(dcToken, []).ok, false);
  assert.strictEqual(ctx.saveUnits_(dcToken, [
    { troop: '206', sections: {} }, { troop: '206', sections: {} },
  ]).ok, false);
  assert.strictEqual(ctx.saveUnits_(alToken, [{ troop: '206', sections: {} }]).ok, false);
});

check('doGet / doPost 路由通', () => {
  const g = JSON.parse(ctx.doGet({ parameter: { action: 'getVisitBoard', token: dcToken } }));
  assert.strictEqual(g.ok, true);
  assert.ok(Array.isArray(g.data.visits));
  const p = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({
    action: 'saveVisit', token: dcToken, visit: { troop: '17', section: 'scout', visitDate: `${thisYear}-05-05` },
  }) } }));
  assert.strictEqual(p.ok, true);
  const del = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({
    action: 'deleteVisit', token: dcToken, id: p.data.id,
  }) } }));
  assert.strictEqual(del.ok, true);
});

// ───────────────────────── 🏢 總會匯報（v4.10.0） ─────────────────────────

check('Visits 藍圖表頭有總會匯報四欄（leaderMet/method/officerCount/support）', () => {
  const bp = ctx.blueprint_().filter(b => b.name === 'Visits')[0];
  const header = bp.rows[0];
  ['leaderMet', 'method', 'officerCount', 'support'].forEach(h => assert.ok(header.includes(h), '缺 ' + h));
});

check('getVisitBoard 回傳區會名（districtName）做匯報表頭', () => {
  const b = ctx.getVisitBoard_(dcToken).data;
  assert.strictEqual(b.districtName, '筲箕灣區');
});

check('登記時帶總會匯報欄：面見領袖／方式／人數／支援全部存到、讀返出嚟一樣', () => {
  const r = ctx.saveVisit_(dcToken, {
    troop: '180', section: 'cub', visitDate: `${thisYear}-01-18`,
    leaderMet: '副團長', method: '電話', officerCount: 3, support: 'Census',
    followUp: '支部領袖人數未達最低要求', note: '內部備註',
  });
  assert.strictEqual(r.ok, true);
  const v = ctx.getVisitBoard_(dcToken).data.visits.filter(x => x.troop === '180')[0];
  assert.strictEqual(v.leaderMet, '副團長');
  assert.strictEqual(v.method, '電話');
  assert.strictEqual(v.officerCount, 3);
  assert.strictEqual(v.support, 'Census');
  assert.strictEqual(v.followUp, '支部領袖人數未達最低要求');
  assert.strictEqual(v.note, '內部備註');
  ctx.deleteVisit_(dcToken, v.id);
});

check('人數填 0／負數／唔係數字 → 當空（匯報時當 1）', () => {
  [0, -2, 'abc'].forEach(bad => {
    const r = ctx.saveVisit_(dcToken, { troop: '242', visitDate: `${thisYear}-02-01`, officerCount: bad });
    assert.strictEqual(r.ok, true);
    const v = ctx.getVisitBoard_(dcToken).data.visits.filter(x => x.troop === '242')[0];
    assert.strictEqual(v.officerCount, '', `officerCount=${bad} 應該存空`);
    ctx.deleteVisit_(dcToken, v.id);
  });
});

check('舊 Visits 表（未升級）跑 ensureSheetColumns_ 自動補四欄，舊資料唔會爛', () => {
  // 整返一張「舊版」Visits 表：得 13 欄，已有一行舊資料
  const oldHead = ['id', 'districtCode', 'troop', 'section', 'visitDate', 'quarter', 'kind',
    'visitorName', 'visitorEmail', 'note', 'followUp', 'createdAt', 'updatedAt'];
  sheets.Visits = makeSheet('Visits', [
    oldHead,
    ['vs-old', 'SKW', '255', 'scout', `${thisYear}-01-15`, 1, 'general', '陳區總監', 'dc@x.org', '舊備註', '', '', ''],
  ]);
  const bp = ctx.blueprint_().filter(b => b.name === 'Visits')[0];
  const added = [...ctx.ensureSheetColumns_(bp)];   // vm realm 陣列 → copy 做主 realm
  assert.deepStrictEqual(added, ['leaderMet', 'method', 'officerCount', 'support']);

  // 舊資料照讀到，新欄係空字串
  const v = ctx.getVisitBoard_(dcToken).data.visits.filter(x => x.troop === '255')[0];
  assert.strictEqual(v.note, '舊備註');
  assert.strictEqual(v.leaderMet, '');
  assert.strictEqual(v.officerCount, '');

  // 補完欄即刻可以寫新資料
  const r = ctx.saveVisit_(dcToken, { id: 'vs-old', troop: '255', visitDate: `${thisYear}-01-15`, method: '面談', officerCount: 2, support: '增長人數' });
  assert.strictEqual(r.ok, true);
  const after = ctx.getVisitBoard_(dcToken).data.visits.filter(x => x.id === 'vs-old')[0];
  assert.strictEqual(after.method, '面談');
  assert.strictEqual(after.officerCount, 2);
  assert.strictEqual(after.note, '舊備註');     // 舊資料仲喺度

  // 已經齊欄：再跑一次唔會重複補
  assert.deepStrictEqual([...ctx.ensureSheetColumns_(bp)], []);
  sheets.Visits = makeSheet('Visits', [VISIT_HEAD]);   // 還原，等其他測試環境乾淨
});

check('健康檢查版本 4.14.0', () => {
  const parsed = JSON.parse(ctx.doGet({ parameter: { action: 'getHealthCheck' } }));
  assert.strictEqual(parsed.data.version, '4.18.0');
});

console.log(`\n全部通過（${pass} 項）✓`);
