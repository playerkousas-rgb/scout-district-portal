/**
 * gs/Code.gs.course.js 邏輯測試 — 用 node 直接跑，唔使開 Apps Script。
 *   node scripts/test-course-profile-gs.js
 * 涵蓋：📥 getCourseProfile（讀 Input01 訓練班預算＋Input02 訓練班資料 → JSON，
 *      label 對位，容忍 template 版同實填版行號差異）。
 * Fixture 照真 Sheet「第1屆工作坊」式佈局（表頭行喺 label 上面一行，
 * label 行本身就係第一節資料；職員表 A–G 七欄）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs.course.js'), 'utf8');

function makeSheet(name, rows) {
  const data = rows.map(r => r.slice());
  return {
    name,
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getLastRow: () => data.length,
  };
}

// ── 實填版 Input02（0-based；留意表頭 r7 喺 label r8 上面） ──
function realInput02() {
  const E = [];
  return [
    ['活動/訓練班名稱', '第1屆工作坊'], E.slice(), E.slice(),
    ['名額', '22'],
    ['預計收費', '25'],
    ['職員人數', '1'],
    E.slice(),
    ['', 'dd/mm/yyyy', '橫跨至下一日？', '0000 - 2359', '場地', '', '', '', '通告顯示日期', '通告顯示時間', '通告顯示地點'],
    ['活動日期及場地', '8/8/2025', '', '1900 - 2200', '筲箕灣區總部', '', '2025年8月8日（星期五）', true, '2025年8月8日（星期五）', '晚上7時至晚上10時', '筲箕灣區總部'],
    ['', new Date(Date.UTC(2025, 7, 7, 16, 0, 0)), '', '0900 - 0000', '筲箕灣區總部', '', '2025年8月8日（星期五）', true, '2025年8月8日', '上午9時', '筲箕灣區總部'],
    ['', '11/8/2025', '', '0000 - 1300', '筲箕灣區總部', '', '2025年8月11日（星期一）', false, '', '', '筲箕灣區總部'],
    ['', '', '', '', '', '', '', false, '', '', ''],
    E.slice(), E.slice(), E.slice(), E.slice(), E.slice(),
    ['截止報名日期', '25/7/2025'],
    ['最遲公佈取錄名單日', '1/8/2025'],
    E.slice(),
    ['職員資料'],
    ['職位', '姓名', '稱謂', '所屬單位 / 職銜', '資格標註', '電話', '電郵'],
    ['班領導人', '陳大文', '先生', '筲箕灣區 區領袖', '急救教練員', '9123 4567', 'demo@demo'],
    ['班務行政', '黃志強', '先生', '筲箕灣區', '', '9234 5678', 'demo-adc@demo'],
    E.slice(), E.slice(), E.slice(), E.slice(), E.slice(), E.slice(), E.slice(), E.slice(),
    E.slice(), E.slice(), E.slice(), E.slice(), E.slice(), E.slice(), E.slice(), E.slice(),
    E.slice(), E.slice(), E.slice(),
    ['班職員總人數', '2'],
    ['常駐班職員人數', '2'],
  ];
}

// ── 實填版 Input01 ──
function realInput01() {
  const E = [];
  return [
    ['活動/訓練班名稱', '第1屆工作坊'], E.slice(), E.slice(),
    ['屆別', '1'],
    ['支部', '童軍'],
    ['專章', '急救'],
    ['自定義名稱', ''],
    ['形式-1', ''],
    ['形式-2', '工作坊'],
    E.slice(),
    ['預計收生人數', '22'],
    ['預計收費', '25'],
    ['職員人數', '4'],
    E.slice(),
    ['', 'dd/mm/yyyy', '0000 - 2359', '', '場地'],
    ['活動日期及場地', '08/8/2025', '1900 - 2200', '', '筲箕灣區總部'],
    ['', '10/8/2025', '0900 - 0000', '', '筲箕灣區總部'],
    ['', '11/8/2025', '0000 - 1300', '', '筲箕灣區總部'],
    E.slice(), E.slice(), E.slice(), E.slice(), E.slice(), E.slice(),
    ['財政預算'],
    ['項目批准總預算 Budget Approved', '500'],
    ['是次活動申請津貼 Subsidy Required', '-1100'],
  ];
}

// ── template 版 Input02（label 行本身就係表頭，行號緊湊） ──
function templateInput02() {
  return [
    ['活動/訓練班名稱', '樣板班'],
    ['名額', '30'],
    ['預計收費', '100'],
    ['職員人數', '2'],
    ['活動日期及場地', '日期', '橫跨至下一日？', '時間', '場地', '通告顯示日期', '通告顯示時間', '通告顯示地點'],
    ['', '8/8/2025', '', '1900 - 2200', '區總部', '2025年8月8日（星期五）', '晚上7時', '區總部'],
    ['截止報名日期', '25/7/2025'],
    ['最遲公佈取錄名單日', '1/8/2025'],
    ['職員名單', '職位', '姓名', '稱謂', '所屬單位 / 職銜', '電話', '電郵'],
    ['', '班領導人', '陳大文', '先生', '筲箕灣區', '9123 4567', 'demo@demo'],
    ['班職員總人數', '1'],
    ['常駐班職員人數', '1'],
  ];
}

const sheets = {
  'Input01 訓練班預算': makeSheet('Input01 訓練班預算', realInput01()),
  'Input02 訓練班資料': makeSheet('Input02 訓練班資料', realInput02()),
};

const props = {};
const ctx = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
    }),
  },
  Session: { getScriptTimeZone: () => 'Asia/Hong_Kong' },
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const iso = new Date(d.getTime() + 8 * 3600 * 1000).toISOString();
      if (fmt === 'yyyy-MM-dd') return iso.slice(0, 10);
      return iso;
    },
    computeDigest: (_alg, str, _cs) => Array.from(Buffer.from(String(str), 'utf8')).map(b => (b > 127 ? b - 256 : b)),
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
  },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : ''),
      setProperty: (k, v) => { props[k] = v; },
    }),
  },
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs.course.js' });

props.API_KEY_HASH = ctx.sha256_('test-key-123');
const KEY = 'test-key-123';

const plain = (v) => JSON.parse(JSON.stringify(v)); // vm realm 物件轉返普通物件先 deepEqual

let pass = 0;
function check(label, fn) { fn(); pass++; console.log('  ✓ ' + label); }

console.log('訓練班 Script getCourseProfile 測試');

check('冇／錯 apiKey → Unauthorized（經 doPost router）', () => {
  const bad = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'getCourseProfile', apiKey: 'wrong' }) } }));
  assert.strictEqual(bad.ok, false);
  assert.ok(String(bad.error).indexOf('Unauthorized') >= 0);
  const missing = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'getCourseProfile' }) } }));
  assert.strictEqual(missing.ok, false);
});

check('doPost 有 wiring：正確 key → ok＋profile', () => {
  const r = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'getCourseProfile', apiKey: KEY }) } }));
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.courseName, '第1屆工作坊');
});

check('缺 Input02 → 報錯（唔爆）', () => {
  const keep = sheets['Input02 訓練班資料'];
  delete sheets['Input02 訓練班資料'];
  const r = ctx.getCourseProfile_({ apiKey: KEY });
  assert.strictEqual(r.ok, false);
  assert.ok(String(r.error).indexOf('Input02') >= 0);
  sheets['Input02 訓練班資料'] = keep;
});

const P = () => ctx.getCourseProfile_({ apiKey: KEY }).data;

check('基本欄：名稱／名額／收費／職員＋截止／公佈日正規化＋總人數', () => {
  const p = P();
  assert.strictEqual(p.courseName, '第1屆工作坊');
  assert.strictEqual(p.quota, '22');
  assert.strictEqual(p.fee, '25');
  assert.strictEqual(p.staffCount, '1');
  assert.strictEqual(p.deadline, '2025-07-25');
  assert.strictEqual(p.publishDate, '2025-08-01');
  assert.strictEqual(p.totalStaff, '2');
  assert.strictEqual(p.residentStaff, '2');
  assert.ok(p.pulledAt);
});

check('節次：label 行第一節都讀到＋空日期行 skip＋Date 物件正規化', () => {
  const p = P();
  assert.strictEqual(p.sessions.length, 3);
  assert.strictEqual(p.sessions[0].date, '2025-08-08');
  assert.strictEqual(p.sessions[0].time, '1900 - 2200');
  assert.strictEqual(p.sessions[0].venue, '筲箕灣區總部');
  assert.strictEqual(p.sessions[1].date, '2025-08-08', 'Date 物件要轉 yyyy-MM-dd');
});

check('通告顯示：有 displayDate 先上通告（showOnCircular）', () => {
  const p = P();
  assert.strictEqual(p.sessions[0].showOnCircular, true);
  assert.strictEqual(p.sessions[0].displayDate, '2025年8月8日（星期五）');
  assert.strictEqual(p.sessions[0].displayTime, '晚上7時至晚上10時');
  assert.strictEqual(p.sessions[0].displayVenue, '筲箕灣區總部');
  assert.strictEqual(p.sessions[2].showOnCircular, false, 'displayDate 空＝唔上通告');
});

check('職員：七欄映射＋leader 係班領導人', () => {
  const p = P();
  assert.strictEqual(p.staff.length, 2);
  assert.deepStrictEqual(plain(p.staff[0]), {
    role: '班領導人', name: '陳大文', title: '先生', unit: '筲箕灣區 區領袖',
    qualification: '急救教練員', phone: '9123 4567', email: 'demo@demo',
  });
  assert.strictEqual(p.staff[1].qualification, '');
  assert.strictEqual(p.leader.name, '陳大文');
});

check('Input01：屆別／支部／專章／形式／預計收生收費職員', () => {
  const p = P();
  assert.strictEqual(p.edition, '1');
  assert.strictEqual(p.section, '童軍');
  assert.strictEqual(p.badge, '急救');
  assert.strictEqual(p.form2, '工作坊');
  assert.strictEqual(p.expectedIntake, '22');
  assert.strictEqual(p.expectedFee, '25');
  assert.strictEqual(p.expectedStaff, '4');
});

check('預算日期 3 筆＋總額（批准／申請津貼）', () => {
  const p = P();
  assert.strictEqual(p.budgetDates.length, 3);
  assert.strictEqual(p.budgetDates[0].date, '2025-08-08');
  assert.strictEqual(p.budgetDates[0].time, '1900 - 2200');
  assert.strictEqual(p.budgetDates[0].venue, '筲箕灣區總部');
  assert.strictEqual(p.budgetApproved, '500');
  assert.strictEqual(p.subsidyRequired, '-1100');
});

check('冇 Input01 都唔爆（budget 欄留空，Input02 照讀）', () => {
  const keep = sheets['Input01 訓練班預算'];
  delete sheets['Input01 訓練班預算'];
  const p = ctx.getCourseProfile_({ apiKey: KEY }).data;
  assert.strictEqual(p.courseName, '第1屆工作坊');
  assert.strictEqual(p.edition, '');
  assert.deepStrictEqual(plain(p.budgetDates), []);
  sheets['Input01 訓練班預算'] = keep;
});

check('template 版容忍：label 行即表頭＋六欄職員表都讀到', () => {
  const keep = sheets['Input02 訓練班資料'];
  sheets['Input02 訓練班資料'] = makeSheet('Input02 訓練班資料', templateInput02());
  const p = ctx.getCourseProfile_({ apiKey: KEY }).data;
  assert.strictEqual(p.courseName, '樣板班');
  assert.strictEqual(p.sessions.length, 1);
  assert.strictEqual(p.sessions[0].date, '2025-08-08');
  assert.strictEqual(p.sessions[0].displayDate, '2025年8月8日（星期五）');
  assert.strictEqual(p.sessions[0].showOnCircular, true);
  assert.strictEqual(p.staff.length, 1);
  assert.strictEqual(p.leader.name, '陳大文');
  assert.strictEqual(p.deadline, '2025-07-25');
  sheets['Input02 訓練班資料'] = keep;
});

check('profileDate_ 變體：ISO 原文／兩位年份／垃圾原文', () => {
  assert.strictEqual(ctx.profileDate_('2026-01-02'), '2026-01-02');
  assert.strictEqual(ctx.profileDate_('3/4/26'), '2026-04-03');
  assert.strictEqual(ctx.profileDate_('待定'), '待定');
  assert.strictEqual(ctx.profileDate_(''), '');
});

console.log(pass ? `\n全部通過（${pass} 項）✓` : '\n冇跑到任何測試');
if (!pass) process.exitCode = 1;
