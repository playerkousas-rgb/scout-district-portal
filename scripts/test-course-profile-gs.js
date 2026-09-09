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
  const at = (row, col) => {
    while (data.length < row) data.push([]);
    while ((data[row - 1] || []).length < col) data[row - 1].push('');
    return data[row - 1][col - 1];
  };
  return {
    name,
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getLastRow: () => data.length,
    getRange: (row, col) => ({
      getValue: () => at(row, col),
      setValue: (v) => { at(row, col); data[row - 1][col - 1] = v; },
    }),
    _data: data,
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

function realNotice() {
  const g = Array.from({ length: 50 }, () => ['', '', '', '', '', '', '']);
  g[11][6] = '檔案編號: 2607';
  g[12][6] = '2025年7月1日（星期二）';
  g[14][0] = '第1屆工作坊';
  g[21][1] = '班領導人：'; g[21][2] = '陳泳欣小姐（消防教練員）';
  g[22][1] = '參加資格：'; g[22][2] = '已宣誓及持有有效紀錄冊之支部成員';
  g[23][1] = '費 用：'; g[23][2] = '活動費用港幣25元正（包括茶點）。';
  g[24][2] = '報名費用必須以轉數快繳付。帳戶識別碼 102866183。';
  g[27][1] = '名 額：'; g[27][2] = '22人';
  g[28][1] = '截止日期：'; g[28][2] = '2025年7月25日（星期五）';
  g[29][1] = '報名辦法：'; g[29][2] = '請於成員系統訓練班版面填表報名。';
  g[30][1] = '服 裝：'; g[30][2] = '整齊童軍制服';
  g[31][1] = '備 註：'; g[31][2] = '1. 報名前須獲得家長同意；';
  g[32][2] = '2. 學員必須全期出席。';
  g[38][1] = '查 詢：'; g[38][2] = '如有查詢請與班領導人聯絡。';
  g[42][4] = '袁可秀';
  g[44][4] = '（楊德銘  代行）';
  return g;
}

const sheets = {
  'Input01 訓練班預算': makeSheet('Input01 訓練班預算', realInput01()),
  'Input02 訓練班資料': makeSheet('Input02 訓練班資料', realInput02()),
  'Print_通告': makeSheet('Print_通告', realNotice()),
};

const props = {};
let lastAlert = '';
const ctx = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
    }),
    getUi: () => ({ alert: (title, msg) => { lastAlert = String(title) + '\n' + String(msg == null ? '' : msg); } }),
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

check('profileDate_ 變體：ISO 原文／兩位年份／中文日期／垃圾原文', () => {
  assert.strictEqual(ctx.profileDate_('2026-01-02'), '2026-01-02');
  assert.strictEqual(ctx.profileDate_('3/4/26'), '2026-04-03');
  assert.strictEqual(ctx.profileDate_('2025年7月25日（星期五）'), '2025-07-25');
  assert.strictEqual(ctx.profileDate_('待定'), '待定');
  assert.strictEqual(ctx.profileDate_(''), '');
});

check('circular：Print_通告 B 欄 label 讀內文＋G12 編號／G13 日期／署名代行', () => {
  const circ = plain(ctx.getCourseProfile_({ apiKey: KEY }).data.circular);
  assert.strictEqual(circ.title, '第1屆工作坊');
  assert.strictEqual(circ.fileNo, '2607');
  assert.strictEqual(circ.issueDateISO, '2025-07-01');
  assert.strictEqual(circ.leaderText, '陳泳欣小姐（消防教練員）');
  assert.strictEqual(circ.eligibility, '已宣誓及持有有效紀錄冊之支部成員');
  assert.strictEqual(circ.feeText, '活動費用港幣25元正（包括茶點）。');
  assert.strictEqual(circ.payText, '報名費用必須以轉數快繳付。帳戶識別碼 102866183。');
  assert.strictEqual(circ.quotaText, '22人');
  assert.strictEqual(circ.signupText, '請於成員系統訓練班版面填表報名。');
  assert.strictEqual(circ.uniform, '整齊童軍制服');
  assert.deepStrictEqual(circ.remarks, ['1. 報名前須獲得家長同意；', '2. 學員必須全期出席。']);
  assert.strictEqual(circ.enquiry, '如有查詢請與班領導人聯絡。');
  assert.strictEqual(circ.signer, '袁可秀');
  assert.strictEqual(circ.deputy, '楊德銘');
});

check('冇 Print_通告 → circular 係 null（唔報錯）', () => {
  const keep = sheets['Print_通告'];
  delete sheets['Print_通告'];
  const d = ctx.getCourseProfile_({ apiKey: KEY }).data;
  assert.strictEqual(d.circular, null);
  assert.strictEqual(d.courseName, '第1屆工作坊');
  sheets['Print_通告'] = keep;
});

check('✓上通告剔格 FALSE → 該節唔上通告（就算有通告顯示日期）', () => {
  const v2 = realInput02();
  v2[8][7] = false; // 第一節 H=FALSE
  const keep = sheets['Input02 訓練班資料'];
  sheets['Input02 訓練班資料'] = makeSheet('Input02 訓練班資料', v2);
  const p = ctx.getCourseProfile_({ apiKey: KEY }).data;
  assert.strictEqual(p.sessions[0].showOnCircular, false);
  assert.strictEqual(p.sessions[0].displayDate, '2025年8月8日（星期五）');
  sheets['Input02 訓練班資料'] = keep;
});

check('getCourseSheetRaw 錯 key → Unauthorized（經 doPost router）', () => {
  const bad = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'getCourseSheetRaw', apiKey: 'wrong' }) } }));
  assert.strictEqual(bad.ok, false);
  assert.ok(String(bad.error).indexOf('Unauthorized') >= 0);
});

check('getCourseSheetRaw：12 tabs＋paramsWX＋pulledAt（經 doPost router）', () => {
  // 加一頁參數（淨 W1:X5 範圍讀取）
  sheets['參數'] = {
    getRange: (a1) => {
      assert.strictEqual(a1, 'W1:X5');
      return { getValues: () => [['項目', '內容'], ['w', 'https://m.example/training'], ['f', '102866183'], ['n', 'SKW'], ['w', 'www.skwscout.org.hk']] };
    },
  };
  const r = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'getCourseSheetRaw', apiKey: KEY }) } }));
  assert.ok(r.ok, JSON.stringify(r));
  const d = r.data;
  ['input01', 'input02', 'input03', 'input04', 'resp', 'paramsWX', 'notice', 'accept',
    'finance', 'completion', 'cert', 'subsidy', 'pulledAt'].forEach(k => assert.ok(k in d, '缺 ' + k));
  assert.strictEqual(d.input02[0][1], '第1屆工作坊');
  assert.strictEqual(d.notice[14][0], '第1屆工作坊');
  assert.deepStrictEqual(d.paramsWX[1], ['w', 'https://m.example/training']);
  assert.ok(d.pulledAt);
});

check('getCourseSheetRaw 缺頁 → 該 key 係 []（唔報錯）', () => {
  const r = ctx.getCourseSheetRaw_({ apiKey: KEY }).data;
  assert.deepStrictEqual(plain(r.input03), []);
  assert.deepStrictEqual(plain(r.accept), []);
});

check('rotateCourseApiKey：出新 key＋存 hash＋alert 顯示（唔掂表格）', () => {
  const before = ctx.getCourseProfile_({ apiKey: KEY }).data.courseName;
  const k1 = ctx.rotateCourseApiKey();
  assert.ok(/^ck_[a-z0-9]+$/.test(k1), 'key 格式：' + k1);
  assert.notStrictEqual(k1, KEY);
  assert.ok(lastAlert.includes(k1), 'alert 要顯示新 key');
  assert.ok(/部署/.test(lastAlert), 'alert 要有部署指引');
  assert.strictEqual(props.API_KEY_HASH, ctx.sha256_(k1));
  assert.strictEqual(ctx.getCourseProfile_({ apiKey: k1 }).data.courseName, before, '新 key 用得，表格冇郁');
});

check('rotate 後舊 key 即時作廢（唔影響已收資料）', () => {
  const bad = ctx.getCourseProfile_({ apiKey: KEY });
  assert.strictEqual(bad.ok, false);
  assert.ok(/Unauthorized/.test(bad.error));
  // 還原 key，等之後測試環境乾淨（之後冇測試，純保險）
  props.API_KEY_HASH = ctx.sha256_(KEY);
});

// ── 寫入 API（職員前端契約） ──
function realCompletion() {
  const g = Array.from({ length: 32 }, () => ['', '', '', '', '', '']);
  g[9] = ['SFA-01', '陳小文', '123', '', '', ''];
  g[10] = ['SFA-02', '黃小玲', '45', '', '', ''];
  return g;
}
function realCert() {
  const g = Array.from({ length: 30 }, () => ['', '', '', '', '', '', '']);
  g[6] = ['', 'SFA-01', '陳小文', '123', '', '', ''];
  return g;
}
function realInput04() {
  const g = Array.from({ length: 46 }, () => ['', '', '', '', '', '', '', '', '', '', '']);
  g.forEach((r, i) => { if (i >= 7 && i <= 41) r[0] = String(i - 6); }); // 收據 1–35
  g[7][1] = '500'; // 第一行已用
  return g;
}
sheets['Print_訓練班完成報告'] = makeSheet('Print_訓練班完成報告', realCompletion());
sheets['Print_領取證書紀錄'] = makeSheet('Print_領取證書紀錄', realCert());
sheets['Input04_Print支出表'] = makeSheet('Input04_Print支出表', realInput04());

check('寫入 API：錯 key 全部被擋（經 doPost router）', () => {
  ['setCourseCells', 'setCompletionRow', 'setCertRow', 'addExpenseRow'].forEach(a => {
    const r = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: a, apiKey: 'wrong' }) } }));
    assert.strictEqual(r.ok, false);
    assert.ok(/Unauthorized/.test(r.error), a);
  });
});

check('setCourseCells：寫入指定格＋skip 唔識嘅頁', () => {
  const r = ctx.setCourseCells_({ apiKey: KEY, cells: [
    { tab: 'Input02 訓練班資料', row: 4, col: 2, value: '30' },
    { tab: 'Print_通告', row: 23, col: 3, value: '新資格' },
    { tab: '亂入頁', row: 1, col: 1, value: 'x' },
  ] });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.updated, 2);
  assert.deepStrictEqual(plain(r.data.skippedTabs), ['亂入頁']);
  assert.strictEqual(sheets['Input02 訓練班資料']._data[3][1], '30');
  assert.strictEqual(sheets['Print_通告']._data[22][2], '新資格');
});

check('setCourseCells：空陣列／超上限／錯座標 → 報錯', () => {
  assert.strictEqual(ctx.setCourseCells_({ apiKey: KEY, cells: [] }).ok, false);
  assert.strictEqual(ctx.setCourseCells_({ apiKey: KEY, cells: Array.from({ length: 1001 }, () => ({})) }).ok, false);
  const bad = ctx.setCourseCells_({ apiKey: KEY, cells: [{ tab: 'Input02 訓練班資料', row: 999, col: 1, value: 'x' }] });
  assert.strictEqual(bad.ok, false);
  assert.ok(/座標/.test(bad.error));
});

check('setCompletionRow：by 學員編號寫證書＋合格（淨寫有帶欄）', () => {
  const r = ctx.setCompletionRow_({ apiKey: KEY, code: 'SFA-01', certNo: 'CERT-1', pass: '合格' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.row, 10);
  const row = sheets['Print_訓練班完成報告']._data[9];
  assert.strictEqual(row[3], 'CERT-1');
  assert.strictEqual(row[4], '合格');
  assert.strictEqual(row[5], '', '冇帶 failReason 唔郁');
});

check('setCompletionRow：by 姓名都得；搵唔到／冇 key 報錯', () => {
  const r = ctx.setCompletionRow_({ apiKey: KEY, name: '黃小玲', pass: '缺席', failReason: '缺席第二節' });
  assert.ok(r.ok);
  assert.strictEqual(sheets['Print_訓練班完成報告']._data[10][5], '缺席第二節');
  assert.strictEqual(ctx.setCompletionRow_({ apiKey: KEY, code: '冇呢個' }).ok, false);
  assert.strictEqual(ctx.setCompletionRow_({ apiKey: KEY }).ok, false);
});

check('setCertRow：by 學員編號寫領取（E／F／G）', () => {
  const r = ctx.setCertRow_({ apiKey: KEY, code: 'SFA-01', certNo: 'CERT-1', pickupDate: '2026-09-14', signed: '陳小文' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.row, 7);
  const row = sheets['Print_領取證書紀錄']._data[6];
  assert.deepStrictEqual(row.slice(4, 7), ['CERT-1', '2026-09-14', '陳小文']);
  assert.strictEqual(ctx.setCertRow_({ apiKey: KEY, name: '冇呢個' }).ok, false);
});

check('addExpenseRow：寫入第一個空收據行（skip 已用行）', () => {
  const r = ctx.addExpenseRow_({ apiKey: KEY, amounts: { B: '120', F: '300' }, note: '茶點＋車費' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.row, 9, 'row 8 已用，寫 row 9');
  assert.strictEqual(r.data.receiptNo, '2');
  const row = sheets['Input04_Print支出表']._data[8];
  assert.strictEqual(row[1], '120');
  assert.strictEqual(row[5], '300');
  assert.strictEqual(row[10], '茶點＋車費');
});

check('addExpenseRow：乜都冇填／爆滿 → 報錯', () => {
  assert.strictEqual(ctx.addExpenseRow_({ apiKey: KEY, amounts: {} }).ok, false);
  const full = realInput04();
  for (let i = 7; i <= 41; i++) full[i][1] = '1';
  const keep = sheets['Input04_Print支出表'];
  sheets['Input04_Print支出表'] = makeSheet('Input04_Print支出表', full);
  const r = ctx.addExpenseRow_({ apiKey: KEY, amounts: { B: '5' } });
  assert.strictEqual(r.ok, false);
  assert.ok(/已滿/.test(r.error));
  sheets['Input04_Print支出表'] = keep;
});

console.log(pass ? `\n全部通過（${pass} 項）✓` : '\n冇跑到任何測試');
if (!pass) process.exitCode = 1;
