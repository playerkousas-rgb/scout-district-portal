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
  Perms: makeSheet('Perms', [['cardId', 'DC', 'DDC_ADMIN', 'ADC_GH', 'ADC_SCOUT', 'AL'],
    ['visit', 'edit', 'edit', 'view', 'view', 'view'],
    ['troopDirectory', 'edit', 'edit', 'edit', 'edit', 'view'],
    ['troopContacts', 'edit', 'edit', 'view', 'view', ''],
    ['troopRequests', 'edit', 'edit', 'edit', 'edit', '']]),
  Users: makeSheet('Users', [['email', 'role', 'active', 'displayName'],
    ['dc@x.org', 'DC', 'TRUE', '陳區總監'],
    ['gh@x.org', 'ADC_GH', 'TRUE', '李小童軍ADC'],
    ['al@x.org', 'AL', 'TRUE', '助理區領袖']]),
  Roles: makeSheet('Roles', [['role', 'label', 'protected', 'level'],
    ['DC', '區總監', 'TRUE', 1], ['ADC_GH', '助理區總監（小童軍）', 'TRUE', 3], ['AL', '助理區領袖', 'TRUE', 5]]),
  TroopContacts: makeSheet('TroopContacts', [['id', 'troop', 'section', 'unitCode', 'contactRole', 'name', 'phone', 'email', 'note', 'active', 'createdAt', 'updatedAt', 'updatedBy']]),
  VisitRequests: makeSheet('VisitRequests', [['id', 'refCode', 'districtCode', 'createdAt', 'type', 'troop', 'section', 'activityName', 'preferredDate', 'preferredTime', 'location', 'purpose', 'attendeeCount', 'wantReply', 'contactName', 'contactType', 'contact', 'status', 'assignedTo', 'districtNote', 'updatedBy', 'updatedAt', 'source']]),
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
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => k === 'PORTAL_TOKEN_SECRET' ? 'FAKE_UNIT_TEST_PRIVATE_TOKEN_SECRET_0123456789' : '', setProperty: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });
const testApiKey = 'visit-test-api-key';
sheets.Config.appendRow(['API_KEY_HASH', ctx.sha256_(testApiKey), 'test only']);

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

check('visit 只有 view 的用戶也可新增，但不能修改／刪除自己的紀錄', () => {
  const r = ctx.saveVisit_(alToken, { troop: '206', visitDate: `${thisYear}-03-01` });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ctx.saveVisit_(alToken, { id: r.data.id, troop: '206', note: '試圖改自己' }).ok, false);
  assert.strictEqual(ctx.deleteVisit_(alToken, r.data.id).ok, false);
  assert.strictEqual(ctx.deleteVisit_(dcToken, r.data.id).ok, true);
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
  const denied = JSON.parse(ctx.doGet({ parameter: { action: 'getVisitBoard', token: dcToken } }));
  assert.strictEqual(denied.ok, false, 'missing API key must fail closed');
  const g = JSON.parse(ctx.doGet({ parameter: { action: 'getVisitBoard', token: dcToken, apiKey: testApiKey } }));
  assert.strictEqual(g.ok, true);
  assert.ok(Array.isArray(g.data.visits));
  const p = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({
    action: 'saveVisit', apiKey: testApiKey, token: dcToken, visit: { troop: '17', section: 'scout', visitDate: `${thisYear}-05-05` },
  }) } }));
  assert.strictEqual(p.ok, true);
  const del = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({
    action: 'deleteVisit', apiKey: testApiKey, token: dcToken, id: p.data.id,
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

check('舊 Units 表只追加旅團公開資料欄位，原欄位順序不變', () => {
  sheets.Units = makeSheet('Units', [UNIT_HEAD]);
  assert.strictEqual(ctx.getVisitBoard_(dcToken).data.publicTroopFieldsReady, false);
  const bp = ctx.blueprint_().find(b => b.name === 'Units');
  const added = [...ctx.ensureSheetColumns_(bp)];
  assert.deepStrictEqual(added, ['meetingTime', 'instagramUrl', 'facebookUrl', 'websiteUrl', 'publicVisible']);
  assert.deepStrictEqual(sheets.Units._data[0].slice(0, UNIT_HEAD.length), UNIT_HEAD);
  assert.strictEqual(ctx.getVisitBoard_(dcToken).data.publicTroopFieldsReady, true);
});

check('成員公開名錄只回傳啟用及公開旅團的公開欄位，並保留空值供前端隱藏', () => {
  const blankList = JSON.parse(ctx.doGet({ parameter: { action: 'listDistrictTroops', apiKey: testApiKey } }));
  assert.strictEqual(blankList.ok, true);
  assert.strictEqual(blankList.data.troops.length, 28);
  assert.strictEqual(blankList.data.troops[0].instagramUrl, '');
  assert.strictEqual(blankList.data.troops[0].meetingTime, '');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(blankList.data.troops[0], 'sections'), false);

  const saved = ctx.saveUnits_(dcToken, [
    { troop: '17', label: '港島第17旅', org: '慈幼中學', meetingTime: '星期六 19:30', instagramUrl: 'https://www.instagram.com/troop17/', facebookUrl: '', websiteUrl: 'https://example.org/troop17', sections: { gh: '', cub: '1', scout: '1', venture: '', rover: '' }, active: true, note: 'private admin note' },
    { troop: '50', label: '港島第50旅', org: '聖馬可中學', meetingTime: '', instagramUrl: '', facebookUrl: '', websiteUrl: '', sections: { gh: '', cub: '', scout: '1', venture: '1', rover: '1' }, active: false },
    { troop: '51', label: '港島第51旅', org: '測試主辦機構', sections: {}, active: true, publicVisible: false },
  ]);
  assert.strictEqual(saved.ok, true);
  const publicList = JSON.parse(ctx.doGet({ parameter: { action: 'listDistrictTroops', apiKey: testApiKey } }));
  assert.strictEqual(publicList.data.troops.length, 1, 'inactive and hidden troops must be excluded from public listing');
  assert.strictEqual(publicList.data.troops[0].organizer, '慈幼中學');
  assert.strictEqual(publicList.data.troops[0].meetingTime, '星期六 19:30');
  assert.strictEqual(publicList.data.troops[0].instagramUrl, 'https://www.instagram.com/troop17/');
  assert.strictEqual(publicList.data.troops[0].facebookUrl, '');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(publicList.data.troops[0], 'note'), false, 'admin-only note must not be exposed');

  const invalid = ctx.saveUnits_(dcToken, [
    { troop: '17', label: '港島第17旅', sections: {}, active: true, instagramUrl: 'javascript:alert(1)' },
  ]);
  assert.strictEqual(invalid.ok, false, 'non-http(s) URLs must be rejected');
});

check('DC 保密留言卡清楚標示區總監及系統超管存取範圍', () => {
  const card = ctx.normalizeCard_({ cardId: 'dcFeedback', description: '舊卡片說明' });
  assert.strictEqual(card.description, '只限區總監查閱（系統超級管理員亦可）');
});

check('健康檢查版本 4.32.0（旅團聯絡／申請表就緒）', () => {
  const parsed = JSON.parse(ctx.doGet({ parameter: { action: 'getHealthCheck' } }));
  assert.strictEqual(parsed.data.version, '4.32.0');
  assert.strictEqual(parsed.data.troopContactsReady, true);
  assert.strictEqual(parsed.data.visitRequestsReady, true);
});


check('旅團資料獨立 API：ADC 可修改資料，但探訪只有新增權；AL 唯讀資料', () => {
  const directory = ctx.getTroopDirectoryBoard_(ghToken);
  assert.strictEqual(directory.ok, true);
  assert.strictEqual(directory.data.canEdit, true);
  assert.strictEqual(directory.data.permissionsVersion, 1);
  assert.ok(!('visits' in directory.data), '獨立名錄不得混入探訪紀錄');
  assert.strictEqual(ctx.getTroopDirectoryBoard_(alToken).data.canEdit, false);
  const permissions = ctx.getVisitBoard_(ghToken).data.permissions;
  assert.strictEqual(permissions.canRegister, true);
  assert.strictEqual(permissions.canEditRecords, false, 'Perms 探訪 ADC 係 view：可新增但改唔到紀錄');
  assert.strictEqual(ctx.saveUnits_(ghToken, [{ troop: '1745', sections: { scout: '1', cub: '0' } }]).ok, true);
  assert.strictEqual(ctx.saveUnitSections_(alToken, []).ok, false);
  sheets.UnitSections = makeSheet('UnitSections', ctx.blueprint_().find(x => x.name === 'UnitSections').rows);
  assert.strictEqual(ctx.saveUnitSections_(ghToken, [], '1745').ok, true);
  const g = JSON.parse(ctx.doGet({ parameter: { action: 'getTroopDirectoryBoard', token: ghToken, apiKey: testApiKey } }));
  assert.strictEqual(g.ok, true);
  assert.strictEqual(g.data.canEdit, true);
});

check('各角色預設權限由 Perms 子權限行決定；超管改表即時生效；Users.cards 個人範圍同其他卡一致', () => {
  const cardsBefore = sheets.Cards;
  const permsBefore = sheets.Perms;
  const bpCards = ctx.blueprint_().find(x => x.name === 'Cards');
  const bpPerms = ctx.blueprint_().find(x => x.name === 'Perms');
  const SUB_IDS = ['visit', 'troopDirectory', 'troopContacts', 'troopRequests', 'activity'];
  sheets.Cards = makeSheet('Cards', bpCards.rows.filter((row, i) => i === 0 || ['troop', 'contacts'].includes(row[0])));
  sheets.Perms = makeSheet('Perms', bpPerms.rows.filter((row, i) => i === 0 || SUB_IDS.includes(row[0]) || row[0] === 'contacts'));
  // blueprint 一定要有齊五行子權限，而且入口卡唔可以有自己一行；activity／unit 不再是主卡
  SUB_IDS.forEach(id => assert.strictEqual(sheets.Perms._data.filter(r => r[0] === id).length, 1, id));
  assert.strictEqual(sheets.Perms._data.filter(r => r[0] === 'troop').length, 0);
  assert.strictEqual(bpCards.rows.filter(r => r[0] === 'activity').length, 0, 'activity 只做子權限，唔再種主卡');
  assert.strictEqual(bpCards.rows.filter(r => r[0] === 'unit').length, 0, 'unit 主卡已刪');
  assert.strictEqual(bpPerms.rows.filter(r => r[0] === 'activity').length, 1, 'activity 保留一行 Perms');
  assert.strictEqual(bpPerms.rows.filter(r => r[0] === 'unit').length, 0, 'unit Perms 行已刪');
  sheets.Users._data[0].push('cards');
  const roles = ['DDC_ADMIN', 'DDC_TRAINING', 'ADC_GH', 'ADC_CUBS', 'ADC_SCOUT', 'ADC_VENTURE', 'ADC_ROVER', 'STAFF', 'LEADER', 'SYSADMIN', 'DC'];
  try {
    roles.forEach((role, i) => {
      const email = `split-${i}@x.org`;
      sheets.Users.appendRow([email, role, 'TRUE', role, '']);
      sheets.Roles.appendRow([role, role, 'TRUE', role === 'SYSADMIN' ? 0 : role === 'DC' ? 1 : role.startsWith('DDC') ? 2 : role.startsWith('ADC') ? 3 : 5]);
      const token = ctx.makeToken_(email, role, 12);
      const visitEdit = ['SYSADMIN', 'DC', 'DDC_ADMIN', 'DDC_TRAINING'].includes(role);
      const directoryEdit = visitEdit || role.startsWith('ADC');
      const activityEdit = visitEdit || role === 'STAFF';
      const actual = ctx.getCards_(token).data;
      assert.strictEqual(actual.find(x => x.cardId === 'visit').access, visitEdit ? 'edit' : 'view', role + ' 探訪預設');
      assert.strictEqual(actual.find(x => x.cardId === 'troopDirectory').access, directoryEdit ? 'edit' : 'view', role + ' 資料預設');
      assert.strictEqual(actual.find(x => x.cardId === 'visit').subPerm, true, role + ' 子權限標記');
      assert.strictEqual(actual.find(x => x.cardId === 'activity').access, activityEdit ? 'edit' : 'view', role + ' 活動知會預設');
      assert.strictEqual(actual.find(x => x.cardId === 'activity').parentId, 'troop', role + ' 活動知會歸旅團');
      assert.strictEqual(actual.find(x => x.cardId === 'troop').access, visitEdit || directoryEdit || role === 'STAFF' ? 'edit' : 'view', role + ' 入口卡推導');
      const contactsCard = actual.find(x => x.cardId === 'troopContacts');
      if (role === 'LEADER') assert.strictEqual(contactsCard, undefined, '一般領袖預設睇唔到私隱聯絡');
      else { assert.ok(contactsCard, role + ' 預設有聯絡權限'); assert.strictEqual(contactsCard.parentId, 'contacts', role + ' 私隱聯絡歸聯絡簿'); }
      assert.strictEqual(ctx.getTroopDirectoryBoard_(token).data.canEdit, directoryEdit, role);
      const created = ctx.saveVisit_(token, { troop: '1745', visitDate: `${thisYear}-10-26`, visitorEmail: 'forged@x.org', visitorName: '冒認他人' });
      assert.strictEqual(created.ok, true, role + ' 可新增');
      const saved = ctx.getVisitBoard_(token).data.visits.find(x => x.id === created.data.id);
      if (!visitEdit) { assert.strictEqual(saved.visitorEmail, email); assert.strictEqual(saved.visitorName, role); }
      const before = JSON.stringify(sheets.Visits._data);
      const updated = ctx.saveVisit_(token, { id: created.data.id, troop: '1745', visitDate: `${thisYear}-10-26`, note: '修改' });
      assert.strictEqual(updated.ok, visitEdit, role + ' 修改自己');
      if (!visitEdit) assert.strictEqual(JSON.stringify(sheets.Visits._data), before);
      assert.strictEqual(ctx.deleteVisit_(token, created.data.id).ok, visitEdit, role + ' 刪除自己');
      if (!visitEdit) assert.strictEqual(ctx.deleteVisit_(dcToken, created.data.id).ok, true);
    });
    // Users.cards 個人範圍：同其他卡一樣，揀咗 contacts 就入唔到探訪
    sheets.Users.appendRow(['scoped@x.org', 'STAFF', 'TRUE', '受限職員', 'contacts']);
    const scopedToken = ctx.makeToken_('scoped@x.org', 'STAFF', 12);
    assert.strictEqual(ctx.getVisitBoard_(scopedToken).ok, false, '個人卡範圍對子權限同樣生效');
    // Perms 即係唯一準則：超管俾 STAFF edit 就真係 edit 到（毋須改 code）
    sheets.Perms = makeSheet('Perms', [['cardId', 'STAFF', 'ADC_SCOUT'], ['visit', 'edit', 'edit'], ['troopDirectory', 'edit', 'edit'], ['troopContacts', 'edit', 'view'], ['troopRequests', 'edit', 'edit'], ['activity', 'edit', 'view']]);
    const staffToken = ctx.makeToken_('split-7@x.org', 'STAFF', 12);
    assert.strictEqual(ctx.requireCardEdit_(staffToken, 'troopDirectory').error == null, true);
    assert.strictEqual(ctx.requireCardEdit_(staffToken, 'visit').error == null, true);
    assert.strictEqual(ctx.saveUnits_(staffToken, [{ troop: '1745', sections: { scout: '1' } }]).ok, true);
    assert.strictEqual(ctx.saveUnitSections_(staffToken, [], '1745').ok, true);
    assert.strictEqual(ctx.savePerms_(dcToken, { visit: { ADC_SCOUT: 'edit' }, troopDirectory: { STAFF: 'edit' }, troopContacts: { ADC_SCOUT: 'edit' }, activity: { ADC_SCOUT: 'edit' }, troop: { DC: '' } }).ok, true);
    const matrix = ctx.readPerms_();
    assert.strictEqual(matrix.visit.ADC_SCOUT, 'edit', 'savePerms 照單保存子權限，唔再強制覆寫');
    assert.strictEqual(matrix.troopDirectory.STAFF, 'edit');
    assert.strictEqual(matrix.troopContacts.ADC_SCOUT, 'edit');
    assert.strictEqual(matrix.activity.ADC_SCOUT, 'edit', 'savePerms 保存活動知會子權限');
    assert.ok(matrix.troopRequests, 'savePerms 必須寫齊五行子權限');
    assert.strictEqual(matrix.troop, undefined, '入口卡唔寫 Perms 行');
    const subPerms = ctx.getPerms_(dcToken).data.subPerms;
    assert.strictEqual(subPerms.length, 5, 'getPerms 要回子分頁清單俾管理頁畫行');
    assert.strictEqual(subPerms.find(x => x.id === 'activity').parentId, 'troop');
    assert.strictEqual(subPerms.find(x => x.id === 'troopContacts').parentId, 'contacts');
    // 只有聯絡簿私隱權限時，不得順手解鎖「旅團」入口卡
    sheets.Perms = makeSheet('Perms', [['cardId', 'ADC_SCOUT'], ['troopContacts', 'view']]);
    const contactsOnly = { email: 'split-4@x.org', role: 'ADC_SCOUT', source: 'users' };
    assert.strictEqual(ctx.cardAccessOf_(contactsOnly, 'troopContacts'), 'view');
    assert.strictEqual(ctx.cardAccessOf_(contactsOnly, 'troop'), '', 'troopContacts 已歸聯絡簿，不計入旅團入口');
  } finally {
    if (cardsBefore) sheets.Cards = cardsBefore; else delete sheets.Cards;
    sheets.Perms = permsBefore;
  }
});

check('即時停用／降職／刪帳戶，舊 token 不得保留新增或修改權；匿名及舊 Staff 來源不得進入', () => {
  const user = ['live@x.org', 'DDC_ADMIN', 'TRUE', '副總監'];
  sheets.Users._data.push(user);
  const token = ctx.makeToken_(user[0], 'DDC_ADMIN', 12);
  assert.strictEqual(ctx.requireCardEdit_(token, 'visit').ok, true);
  user[1] = 'ADC_SCOUT';
  assert.ok(ctx.requireCardEdit_(token, 'visit').error);
  user[2] = 'FALSE';
  assert.strictEqual(ctx.saveVisit_(token, { troop: '1745' }).ok, false);
  assert.strictEqual(ctx.getTroopDirectoryBoard_(token).ok, false);
  sheets.Users._data.pop();
  assert.strictEqual(ctx.getVisitBoard_(token).ok, false);
  assert.strictEqual(ctx.getTroopDirectoryBoard_('').ok, false);
  assert.strictEqual(ctx.saveVisit_('', { troop: '1745' }).ok, false);
  assert.strictEqual(ctx.cardAccessOf_({ email: 'dc@x.org', role: 'DC', source: 'staff' }, 'visit'), '');
  assert.strictEqual(ctx.cardAccessOf_({ email: 'dc@x.org', role: 'DC', source: 'staff' }, 'troopDirectory'), '');
});

check('1745 只公開童軍標籤，0 團或已關閉的舊維護列不顯示，原資料仍保留', () => {
  const before = sheets.UnitSections;
  sheets.UnitSections = makeSheet('UnitSections', [['troop', 'section', 'unitCode', 'active', 'publicVisible'],
    ['1745', 'scout', '', 'TRUE', 'TRUE'], ['1745', 'venture', '', 'TRUE', 'TRUE']]);
  try {
    const payload = ctx.listDistrictTroops_().data.troops.find(x => x.troop === '1745');
    assert.deepStrictEqual(Object.keys(payload.sectionCounts), ['scout']);
    assert.strictEqual(payload.units.length, 1);
    assert.strictEqual(payload.units[0].section, 'scout');
    assert.strictEqual(ctx.getTroopDirectoryBoard_(ghToken).data.unitSections.length, 2, '管理端保留隱藏列，儲存不丟資料');
    sheets.UnitSections._data.splice(1, 1); // 只餘已關閉深資的歷史列
    const scaffold = ctx.listDistrictTroops_().data.troops.find(x => x.troop === '1745');
    assert.strictEqual(scaffold.units.length, 1, '已關閉支部不阻擋現有童軍支部生成骨架');
    assert.strictEqual(scaffold.units[0].section, 'scout');
  } finally { sheets.UnitSections = before; }
});

check('🔒 旅團聯絡：ADC 只見自己支部；支部冇團長就只見旅長；AL 無權；公開 API 唔洩漏', () => {
  // 上面 STAFF 儲存示範覆寫咗 Units，先復原測試旅團
  assert.strictEqual(ctx.saveUnits_(dcToken, [
    { troop: '206', sections: { gh: '1', cub: '1', scout: '1' } },
    { troop: '82', sections: { gh: '1', scout: '1' } },
    { troop: '1745', sections: { scout: '1' } },
  ]).ok, true);
  const scoutToken = (() => {
    sheets.Users.appendRow(['scout-adc@x.org', 'ADC_SCOUT', 'TRUE', '童軍ADC']);
    return ctx.makeToken_('scout-adc@x.org', 'ADC_SCOUT', 12);
  })();
  const add = (contact) => ctx.saveTroopContact_(dcToken, contact);
  // 206：有童軍團長 + 幼童軍團長 + 旅長；82：只有旅長（童軍團長空缺）
  assert.strictEqual(add({ troop: '206', contactRole: 'gsl', name: '二零六旅長', phone: '9000 0001', email: '' }).ok, true);
  assert.strictEqual(add({ troop: '206', contactRole: 'leader', section: 'scout', name: '童軍團長', phone: '9000 0002', email: '' }).ok, true);
  assert.strictEqual(add({ troop: '206', contactRole: 'leader', section: 'cub', name: '幼童軍團長', phone: '9000 0003', email: '' }).ok, true);
  assert.strictEqual(add({ troop: '82', contactRole: 'gsl', name: '八二旅長', phone: '9000 0004', email: '' }).ok, true);
  assert.strictEqual(add({ troop: '206', contactRole: 'leader', section: 'scout', name: '', phone: '1' }).ok, false, '冇姓名要拒絕');
  assert.strictEqual(add({ troop: '206', contactRole: 'leader', section: 'scout', name: '冇聯絡方法', phone: '', email: '' }).ok, false, '電話電郵至少一樣');
  const adcBoard = ctx.getTroopContacts_(scoutToken);
  assert.strictEqual(adcBoard.ok, true);
  assert.strictEqual(adcBoard.data.scopeSection, 'scout');
  const names = adcBoard.data.contacts.map(c => c.name).sort();
  assert.strictEqual(JSON.stringify(names), JSON.stringify(['八二旅長', '童軍團長']), '206 有團長就只見自己支部；82 冇團長就只見旅長');
  assert.strictEqual(adcBoard.data.canEdit, false, 'ADC 預設唯讀（Perms view）');
  assert.strictEqual(ctx.saveTroopContact_(scoutToken, { troop: '206', contactRole: 'leader', section: 'scout', name: 'x', phone: '1' }).ok, false);
  assert.strictEqual(ctx.getTroopContacts_(alToken).ok, false, 'Perms 空白角色不可見');
  assert.strictEqual(ctx.getTroopContacts_(dcToken).data.contacts.length, 4, '無範圍角色見全部');
  const pub = JSON.stringify(ctx.listDistrictTroops_());
  assert.ok(!pub.includes('9000 000'), '成員端公開回應絕不可包含聯絡電話');
  assert.ok(!pub.includes('童軍團長'), '成員端公開回應絕不可包含領袖姓名');
});

check('📨 聯絡區會：公開提交、回覆聯絡可選、唔寫入 Visits、ADC 分流支部申請', () => {
  const visitsBefore = sheets.Visits._data.length;
  const noReply = ctx.submitVisitRequest_({ type: 'visit', troop: '206', section: 'scout', purpose: '想請區幹部嚟集會交流招募經驗', wantReply: false, contactName: '唔想留名', contactType: 'phone', contact: '9999 8888' });
  assert.strictEqual(noReply.ok, true);
  assert.ok(/^TR-/.test(noReply.data.refCode));
  const stored = sheets.VisitRequests._data.find(r => r[0] === noReply.data.id);
  const head = sheets.VisitRequests._data[0];
  assert.strictEqual(stored[head.indexOf('contact')], '', '唔要回覆就不可以存聯絡方式');
  assert.strictEqual(stored[head.indexOf('contactName')], '');
  assert.strictEqual(sheets.Visits._data.length, visitsBefore, '申請絕不可直接寫入探訪紀錄');
  assert.strictEqual(ctx.submitVisitRequest_({ type: 'visit', troop: '206', purpose: '短' }).ok, false, '目的太短拒絕');
  assert.strictEqual(ctx.submitVisitRequest_({ type: 'invite', troop: '206', purpose: '邀請出席周年檢閱主禮' }).ok, false, '邀請要填活動名');
  assert.strictEqual(ctx.submitVisitRequest_({ type: 'visit', troop: '99999', purpose: '唔存在嘅旅團申請探訪' }).ok, false);
  assert.strictEqual(ctx.submitVisitRequest_({ type: 'visit', troop: '206', purpose: '要回覆但冇填聯絡方法嘅申請', wantReply: true }).ok, false);
  const invite = ctx.submitVisitRequest_({ type: 'invite', troop: '82', section: 'cub', activityName: '幼童軍宣誓典禮', purpose: '誠邀幼童軍支部幹部出席主禮', wantReply: true, contactType: 'email', contact: 'gsl82@x.org' });
  assert.strictEqual(invite.ok, true);
  const board = ctx.getVisitRequests_(dcToken);
  assert.strictEqual(board.ok, true);
  assert.strictEqual(board.data.requests.length, 2);
  assert.strictEqual(ctx.getVisitRequests_(alToken).ok, false);
  assert.strictEqual(ctx.setVisitRequestStatus_(dcToken, invite.data.id, { status: 'accepted', assignedTo: '幼童軍 ADC' }).ok, true);
  assert.strictEqual(ctx.getVisitRequests_(dcToken).data.requests.find(r => r.id === invite.data.id).status, 'accepted');
  assert.strictEqual(ctx.setVisitRequestStatus_(dcToken, invite.data.id, { status: 'bogus' }).ok, false);
});

console.log(`\n全部通過（${pass} 項）✓`);
