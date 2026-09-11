/**
 * gs/Code.gs 訓練班新版流程測試（v4.17.0）— node 直接跑，唔使開 Apps Script。
 *   node scripts/test-course-ops-gs.js
 * 涵蓋：
 *   ① pullCourseSummary_：經該班 /exec getCourseSummary 拉批核摘要；冇網址報錯
 *   ② saveCourseApproval_ direct（有 gsUrl）：cells 寫入＋「區會批准」「訓練班電郵」參數 label 對位
 *      ＋「區會修訂」行＋ _Sync rev bump＋CourseLinks approval/approvedBy/revisions 更新
 *   ③ saveCourseApproval_ fallback（冇 gsUrl 得 /exec）：saveCourseBatch 轉發；警告人手 tick 批准格
 *   ④ setCoursePaymentCheck_ direct：時間戳記對行 tick AS/AT/AU；搵唔到 id 回 error result
 *   ⑤ setCoursePaymentCheck_ exec：setPaymentCheck 轉發
 *   ⑥ sendCourseEmail_：ReplyTo 班信箱＋寄件人顯示名；COURSE_EMAIL_FROM alias 優先＋fallback
 *   ⑦ getCourseOpsInfo_：CourseFactory 網址／開班碼由 Config 帶出
 * 做法：同 test-course-links-gs.js 一樣，vm stub Apps Script，記憶體 2D 陣列扮 Sheet。
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
    getLastColumn: () => data.reduce((m, r) => Math.max(m, r.length), 0),
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValues: () => {
          const out = [];
          for (let i = 0; i < numRows; i++) {
            const r = data[row - 1 + i] || [];
            out.push(r.slice(col - 1, col - 1 + numCols));
          }
          return out;
        },
        getDisplayValues: () => {
          const out = [];
          for (let i = 0; i < numRows; i++) {
            const r = data[row - 1 + i] || [];
            out.push(r.slice(col - 1, col - 1 + numCols).map(v => String(v ?? '')));
          }
          return out;
        },
        getDisplayValue: () => String((data[row - 1] || [])[col - 1] ?? ''),
        getValue: () => (data[row - 1] || [])[col - 1],
        setValue: (v) => {
          while (data.length < row) data.push([]);
          while ((data[row - 1] || []).length < col) data[row - 1].push('');
          data[row - 1][col - 1] = v;
        },
        setValues: (vals) => {
          vals.forEach((r, i) => r.forEach((v, j) => {
            while (data.length < row + i) data.push([]);
            while ((data[row - 1 + i] || []).length < col + j) data[row - 1 + i].push('');
            data[row - 1 + i][col - 1 + j] = v;
          }));
        },
        setFontWeight: () => ({ setBackground: () => {} }),
        setBackground: () => {},
        hideSheet: () => {},
      };
    },
    appendRow: (row) => { data.push(row.slice()); },
    deleteRow: (idx) => { data.splice(idx - 1, 1); },
    setFrozenRows: () => {}, setFrozenColumns: () => {}, clear: () => { data.length = 0; },
    _data: data,
  };
  return sh;
}

const LINK_HEADERS = ['courseId', 'districtCode', 'title', 'badgeName', 'section', 'courseNo', 'sessionsText',
  'eligibility', 'fee', 'originalFee', 'subsidyNote', 'deadline', 'quota', 'filled',
  'venue', 'noticeUrl', 'contact',
  'scriptExecUrl', 'scriptApiKey', 'driveFolderId',
  'apiBase', 'apiKey',
  'active', 'createdAt',
  'fpsQrPayload', 'fpsAmount', 'fpsReference', 'fpsAccountName', 'fpsAccountNumber', 'fpsUpdatedAt',
  'leader', 'uniform', 'remarks', 'signupText', 'feeNote',
  'sheetId', 'setupJson', 'gsUrl', 'approval', 'approvedAt', 'approvedBy', 'revisions', 'regNotices'];
const linkRow = (o) => LINK_HEADERS.map(h => (o[h] === undefined ? '' : o[h]));

function seedCourseSS() {
  // 班 Sheet（direct 測試用）：參數＋Input02＋表格回應＋_Sync
  const ssSheets = {
    '參數': makeSheet('參數', [['獎章', ''], ['專章', ''], ['舉辦單位', ''], ['區會', '']]),
    'Input02 訓練班資料': makeSheet('Input02 訓練班資料', [['活動/訓練班名稱', '測試班'], ['名額', '30']]),
    '表格回應': makeSheet('表格回應', [
      ['時間戳記', '電郵地址', '中文姓名', '聯絡電話', '審批狀態'],
      ['2026-09-01T10:00:00Z', 'p1@x.org', '陳小文', '91230001', 'approved'],
      ['2026-09-02T11:00:00Z', 'p2@x.org', '黃小玲', '92340001', 'approved'],
    ]),
  };
  let sync = makeSheet('_Sync', [[0, '', '']]);
  return {
    getSheetByName: (n) => {
      if (n === '_Sync') return sync;
      return ssSheets[n] || null;
    },
    insertSheet: (n) => { if (n === '_Sync') { sync = makeSheet('_Sync', [[0, '', '']]); return sync; } ssSheets[n] = makeSheet(n, []); return ssSheets[n]; },
    _sheets: ssSheets, _sync: () => sync,
  };
}

const sheets = {
  Config: makeSheet('Config', [['key', 'value', '說明'],
    ['districtCode', 'SKW', ''], ['districtName', '筲箕灣區', ''],
    ['COURSE_FACTORY_URL', 'https://script.google.com/macros/FACTORY/exec', ''],
    ['COURSE_FACTORY_CODE', 'SKW-TEST-CODE', ''],
    ['COURSE_EMAIL_FROM', 'courses@skwscout.org.hk', '']]),
  Perms: makeSheet('Perms', [['cardId', 'DC', 'STAFF'], ['training', 'edit', 'view']]),
  Users: makeSheet('Users', [['email', 'role', 'active', 'level'], ['dc@x.org', 'DC', 'TRUE', 1]]),
  Roles: makeSheet('Roles', [['role', 'label', 'protected', 'level'], ['DC', '區總監', 'TRUE', 1]]),
  CourseLinks: makeSheet('CourseLinks', [LINK_HEADERS, ...[
    linkRow({ courseId: 'cl-ops1', title: '新版流程班（有 GS）', section: '童軍', fee: 100, quota: 30,
      scriptExecUrl: 'https://script.google.com/macros/OPS1/exec', scriptApiKey: 'ck_OPS1',
      gsUrl: 'https://docs.google.com/spreadsheets/d/OPS1SHEET/edit', active: 'TRUE' }),
    linkRow({ courseId: 'cl-ops2', title: '新版流程班（冇 GS，淨 Script）', section: '童軍', fee: 100, quota: 30,
      scriptExecUrl: 'https://script.google.com/macros/OPS2/exec', scriptApiKey: 'ck_OPS2', active: 'TRUE' }),
    linkRow({ courseId: 'cl-ops3', title: '直入班（淨 sheetId）', section: '童軍', fee: 100, quota: 30,
      sheetId: 'OPS3SHEET', active: 'TRUE' }),
  ]]),
  AllRecords: makeSheet('AllRecords', [['id', 'districtCode', 'type', 'refCode', 'title', 'requester', 'phone', 'troop', 'status', 'detail', 'createdAt']]),
  System: makeSheet('System', [['key', 'value'], ['locked', 'FALSE']]),
};

const courseSS = seedCourseSS();

// UrlFetchApp stub：記低每次轉發；getCourseSummary／saveCourseBatch／setPaymentCheck 對號回應
const fetches = [];
const ctx = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => (sheets[n] = makeSheet(n, [])),
    }),
    openById: (id) => {
      if (String(id).includes('OPS1SHEET') || String(id).includes('OPS3SHEET')) return courseSS;
      throw new Error('no permission');
    },
  },
  Session: { getScriptTimeZone: () => 'Asia/Hong_Kong' },
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const iso = new Date(d.getTime() + 8 * 3600 * 1000).toISOString();
      if (fmt === 'yyyy-MM-dd') return iso.slice(0, 10);
      if (fmt === 'yyyy-MM-dd HH:mm') return iso.slice(0, 16).replace('T', ' ');
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
  MailApp: { sendEmail: (o) => { mails.push(typeof o === 'object' && o && !Array.isArray(o) && (o.to || o.subject) ? o : { to: arguments0_(o) }); } },
  UrlFetchApp: {
    fetch: (url, opt) => {
      const payload = JSON.parse(String((opt && opt.payload) || '{}'));
      fetches.push({ url: String(url), payload });
      let out = { ok: false, error: 'mock fail' };
      if (/OPS1\/exec|OPS2\/exec/.test(String(url))) {
        if (payload.action === 'getCourseSummary') {
          out = { ok: true, data: { courseName: '新版流程班', quota: 30, fee: 100, approved: false, courseEmail: 'ops1@skwscout.org.hk', regCount: 5, sessions: [], staff: [], budget: { sections: [], total: 0 } } };
        } else if (payload.action === 'saveCourseBatch') {
          out = { ok: true, data: { saved: true, updated: payload.cells.length, skippedTabs: [] } };
        } else if (payload.action === 'setPaymentCheck') {
          out = payload.id === '2026-09-02T11:00:00Z' ? { ok: true, data: { saved: true } } : { ok: false, error: '找不到該報名' };
        } else if (payload.action === 'setCourseRefund') {
          out = payload.id === '2026-09-02T11:00:00Z' ? { ok: true, data: { saved: true, refunded: payload.refunded } } : { ok: false, error: '找不到該報名' };
        }
      }
      return { getContentText: () => JSON.stringify(out), getResponseCode: () => 200 };
    },
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
};
// MailApp stub 助手（支援 object 同舊式 positional 兩種 call）
const mails = [];
function arguments0_() { return '(positional)'; }
ctx.MailApp.sendEmail = function (a, b, c, d) {
  if (a && typeof a === 'object') mails.push(a);
  else mails.push({ to: a, subject: b, body: c, htmlBody: d });
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });

function tokenFor(email, role) { return ctx.makeToken_(email, role, 12); }
const tk = tokenFor('dc@x.org', 'DC');

let pass = 0;
const test = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { console.log('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };

// ── ① pullCourseSummary_ ──
test('① pullCourseSummary 經 /exec getCourseSummary 拉到摘要', () => {
  const r = ctx.pullCourseSummary_(tk, { courseId: 'cl-ops2' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.courseName, '新版流程班');
  assert.strictEqual(r.data.courseEmail, 'ops1@skwscout.org.hk');
  const f = fetches[fetches.length - 1];
  assert.strictEqual(f.payload.action, 'getCourseSummary');
  assert.strictEqual(f.payload.apiKey, 'ck_OPS2');
});
test('①b pullCourseSummary 冇網址（又冇 sheet summary）報錯', () => {
  const r = ctx.pullCourseSummary_(tk, { courseId: 'cl-ops3' }); // 淨 sheetId，冇 execUrl
  assert.ok(!r.ok);
  assert.ok(/Script 網址/.test(r.error), r.error);
});
test('①c pullCourseSummary 冇 token 被擋', () => {
  const r = ctx.pullCourseSummary_('bad-token', { courseId: 'cl-ops2' });
  assert.ok(!r.ok);
});

// ── ② saveCourseApproval_ direct ──
test('② saveCourseApproval direct：cells＋批准格＋訓練班電郵＋修訂行一次過寫入', () => {
  const r = ctx.saveCourseApproval_(tk, {
    courseId: 'cl-ops1', by: '示範ADC',
    cells: [{ tab: 'Input02 訓練班資料', row: 2, col: 2, value: '36' }],
    approval: 'APPROVED', courseEmail: 'ops1@skwscout.org.hk',
    changes: [{ label: '名額', from: '30', to: '36' }],
    revisionNote: '加返名額',
    link: { title: '新版流程班（有 GS）' },
  });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.path, 'direct');
  assert.strictEqual(r.data.approvalDone, true);
  assert.strictEqual(r.data.cellsApplied, 1);
  assert.strictEqual(r.data.warnings.length, 0);
  // 班 Sheet：cells 寫入
  assert.strictEqual(courseSS._sheets['Input02 訓練班資料'].getDataRange().getValues()[1][1], '36');
  // 參數分頁：label 對位（表尾自動補行）
  const param = courseSS._sheets['參數'].getDataRange().getValues().map(r => [String(r[0]), String(r[1])]);
  const apprRow = param.find(x => x[0] === '區會批准');
  assert.ok(apprRow, '冇補「區會批准」行');
  assert.strictEqual(apprRow[1], '✔');
  const emailRow = param.find(x => x[0] === '訓練班電郵');
  assert.ok(emailRow && emailRow[1] === 'ops1@skwscout.org.hk');
  const revRow = param.find(x => String(x[0]).indexOf('區會修訂') === 0);
  assert.ok(revRow && String(revRow[1]).includes('名額：30 → 36'), '修訂行冇寫');
  // _Sync rev bump
  assert.ok(Number(courseSS._sync().getDataRange().getValues()[0][0]) >= 1);
  // CourseLinks：approval 欄＋修訂 JSON
  const link = ctx.courseLinkById_('cl-ops1');
  assert.strictEqual(link.approval, 'APPROVED');
  assert.strictEqual(link.approvedBy, '示範ADC');
  const revs = JSON.parse(link.revisions);
  assert.ok(revs.length >= 1 && revs[0].approval === 'APPROVED' && revs[0].changes[0].label === '名額');
});
test('②b saveCourseApproval direct：PENDING 還原批准格', () => {
  const r = ctx.saveCourseApproval_(tk, { courseId: 'cl-ops1', by: '示範ADC', cells: [], approval: 'PENDING', link: {} });
  assert.ok(r.ok, r.error);
  const param = courseSS._sheets['參數'].getDataRange().getValues().map(r => [String(r[0]), String(r[1])]);
  assert.strictEqual(param.find(x => x[0] === '區會批准')[1], '');
  assert.strictEqual(ctx.courseLinkById_('cl-ops1').approval, 'PENDING');
});

// ── ③ saveCourseApproval_ fallback ──
test('③ saveCourseApproval 冇 gsUrl：經 /exec saveCourseBatch＋警告人手 tick', () => {
  const r = ctx.saveCourseApproval_(tk, {
    courseId: 'cl-ops2', by: '示範ADC',
    cells: [{ tab: 'Input02 訓練班資料', row: 2, col: 2, value: '40' }],
    approval: 'APPROVED', link: {},
  });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.path, 'exec');
  assert.strictEqual(r.data.approvalDone, false);
  assert.ok(r.data.warnings.length === 1 && /區會批准/.test(r.data.warnings[0]), JSON.stringify(r.data.warnings));
  const f = fetches[fetches.length - 1];
  assert.strictEqual(f.payload.action, 'saveCourseBatch');
  assert.strictEqual(f.payload.cells[0].value, '40');
  assert.strictEqual(ctx.courseLinkById_('cl-ops2').approval, 'APPROVED');
});

// ── ④ setCoursePaymentCheck_ direct ──
test('④ 收款核對 direct：時間戳記對行 tick AS/AT/AU', () => {
  const r = ctx.setCoursePaymentCheck_(tk, { courseId: 'cl-ops1', by: '示範財務', checks: [{ id: '2026-09-01T10:00:00Z', verified: true }] });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.path, 'direct');
  assert.strictEqual(r.data.results[0].ok, true);
  const resp = courseSS._sheets['表格回應'].getDataRange().getValues();
  assert.strictEqual(String(resp[0][44]), '已核對收款');           // AS1 自動補表頭
  assert.strictEqual(String(resp[1][44]), '✔');                  // AS2
  assert.strictEqual(String(resp[1][45]), '示範財務');            // AT2
  assert.ok(resp[1][46]);                                        // AU2 有時間
});
test('④b 收款核對 direct：搵唔到 id 回 error result（其他照寫）', () => {
  const r = ctx.setCoursePaymentCheck_(tk, { courseId: 'cl-ops1', by: 'X', checks: [{ id: '2026-09-02T11:00:00Z', verified: true }, { id: 'ghost', verified: true }] });
  assert.ok(r.ok);
  assert.strictEqual(r.data.results[0].ok, true);
  assert.strictEqual(r.data.results[1].ok, false);
  assert.ok(/找不到/.test(r.data.results[1].error));
});
test('④c 收款核對 直入班（淨 sheetId）都直接寫到', () => {
  const r = ctx.setCoursePaymentCheck_(tk, { courseId: 'cl-ops3', by: '示範財務', checks: [{ id: '2026-09-02T11:00:00Z', verified: false }] });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.path, 'direct');
  const resp = courseSS._sheets['表格回應'].getDataRange().getValues();
  assert.strictEqual(String(resp[2][44]), '');                   // verified=false → 清走
});

// ── ⑤ setCoursePaymentCheck_ exec ──
test('⑤ 收款核對 冇 GS：setPaymentCheck 經 /exec', () => {
  const r = ctx.setCoursePaymentCheck_(tk, { courseId: 'cl-ops2', by: '示範財務', checks: [{ id: '2026-09-02T11:00:00Z', verified: true }] });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.path, 'exec');
  assert.strictEqual(r.data.results[0].ok, true);
  const f = fetches[fetches.length - 1];
  assert.strictEqual(f.payload.action, 'setPaymentCheck');
  assert.strictEqual(f.payload.by, '示範財務');
});
test('⑤b 收款核對 exec：後端話搵唔到 → result error', () => {
  const r = ctx.setCoursePaymentCheck_(tk, { courseId: 'cl-ops2', by: 'X', checks: [{ id: 'ghost', verified: true }] });
  assert.ok(r.ok && r.data.results[0].ok === false);
});

// ── ⑪ setCourseRefund_（v4.17.2 已退款——管理層理錢，CL 個 APP 見到）──
test('⑪ 退款 tick direct：AX/AY 自動補表頭＋寫 ✔/核對人', () => {
  const r = ctx.setCourseRefund_(tk, { courseId: 'cl-ops1', by: '示範財務', refunds: [{ id: '2026-09-01T10:00:00Z', refunded: true }] });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.path, 'direct');
  assert.strictEqual(r.data.results[0].ok, true);
  const resp = courseSS._sheets['表格回應'].getDataRange().getValues();
  assert.strictEqual(String(resp[0][49]), '已退款');             // AX1 自動補表頭
  assert.strictEqual(String(resp[0][50]), '退款核對人');          // AY1
  assert.strictEqual(String(resp[1][49]), '✔');                  // AX2
  assert.strictEqual(String(resp[1][50]), '示範財務');            // AY2
});
test('⑪b 退款還原：refunded=false 清走 AX/AY', () => {
  const r = ctx.setCourseRefund_(tk, { courseId: 'cl-ops1', by: 'X', refunds: [{ id: '2026-09-01T10:00:00Z', refunded: false }] });
  assert.ok(r.ok, r.error);
  const resp = courseSS._sheets['表格回應'].getDataRange().getValues();
  assert.strictEqual(String(resp[1][49]), '');
  assert.strictEqual(String(resp[1][50]), '');
});
test('⑪c 退款 exec：setCourseRefund 經 /exec', () => {
  const r = ctx.setCourseRefund_(tk, { courseId: 'cl-ops2', by: '示範財務', refunds: [{ id: '2026-09-02T11:00:00Z', refunded: true }] });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.path, 'exec');
  assert.strictEqual(r.data.results[0].ok, true);
  const f = fetches[fetches.length - 1];
  assert.strictEqual(f.payload.action, 'setCourseRefund');
  assert.strictEqual(f.payload.refunded, true);
  assert.strictEqual(f.payload.by, '示範財務');
});
test('⑪d 退款 ghost id → error result', () => {
  const r = ctx.setCourseRefund_(tk, { courseId: 'cl-ops1', by: 'X', refunds: [{ id: 'ghost', refunded: true }] });
  assert.ok(r.ok && r.data.results[0].ok === false);
  assert.ok(/找不到/.test(r.data.results[0].error));
});

// ── ⑥ sendCourseEmail_ ──
test('⑥ 寄信：ReplyTo 班信箱＋寄件人顯示名＋COURSE_EMAIL_FROM alias', () => {
  mails.length = 0;
  const r = ctx.sendCourseEmail_(tk, {
    courseId: 'cl-ops1', kind: 'approved', to: 'cl@personal.example',
    replyTo: 'ops1@skwscout.org.hk', title: '新版流程班（有 GS）', by: '示範ADC',
    changes: [{ label: '名額', from: '30', to: '36' }],
  });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.fromUsed, 'courses@skwscout.org.hk');
  assert.strictEqual(mails.length, 1);
  assert.strictEqual(mails[0].replyTo, 'ops1@skwscout.org.hk');
  assert.ok(String(mails[0].name).includes('新版流程班'));
  assert.ok(String(mails[0].htmlBody).includes('名額'), '修訂表冇喺 email 出現');
  assert.ok(String(mails[0].htmlBody).includes('已經批准'));
});
test('⑥b 寄信：冇 to 报錯', () => {
  const r = ctx.sendCourseEmail_(tk, { courseId: 'cl-ops1', kind: 'custom', to: '' });
  assert.ok(!r.ok);
});
test('⑥c COURSE_EMAIL_FROM_MODE=course：寄件人直接用班信箱（非 Gmail 班信箱＋Gmail send-as 情境）', () => {
  const cfg = sheets.Config._data;
  let row = cfg.find(r => r[0] === 'COURSE_EMAIL_FROM_MODE');
  if (row) row[1] = 'course'; else cfg.push(['COURSE_EMAIL_FROM_MODE', 'course', '']);
  mails.length = 0;
  const r = ctx.sendCourseEmail_(tk, { courseId: 'cl-ops1', kind: 'mounted', to: 'cl@personal.example', replyTo: 'ops1@skwscout.org.hk', title: 'X' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(mails[0].from, 'ops1@skwscout.org.hk');
  assert.strictEqual(mails[0].replyTo, 'ops1@skwscout.org.hk');
  // mode 留空時 from 用 COURSE_EMAIL_FROM，唔會攞班信箱
  cfg.find(r => r[0] === 'COURSE_EMAIL_FROM_MODE')[1] = '';
  mails.length = 0;
  ctx.sendCourseEmail_(tk, { courseId: 'cl-ops1', kind: 'custom', to: 'x@y.z', replyTo: 'ops1@skwscout.org.hk', note: 'hi' });
  assert.strictEqual(mails[0].from, 'courses@skwscout.org.hk');
});

// ── ⑦ getCourseOpsInfo_ ──
test('⑦ 開班指引：CourseFactory 網址＋開班碼由 Config 帶出', () => {
  const r = ctx.getCourseOpsInfo_(tk);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.factoryUrl, 'https://script.google.com/macros/FACTORY/exec');
  assert.strictEqual(r.data.factoryCode, 'SKW-TEST-CODE');
  assert.strictEqual(r.data.emailFrom, 'courses@skwscout.org.hk');
});

// ── ⑧ 舊班零影響 ──
test('⑧ 普通儲存 saveCourseLink 唔會洗走 approval／revisions', () => {
  const before = ctx.courseLinkById_('cl-ops1');
  const r = ctx.saveCourseLink_(tk, { courseId: 'cl-ops1', title: '改名咗', fee: 120 });
  assert.ok(r.ok, r.error);
  const after = ctx.courseLinkById_('cl-ops1');
  assert.strictEqual(after.title, '改名咗');
  assert.strictEqual(after.approval, before.approval);
  assert.strictEqual(after.revisions, before.revisions);
});

// ── ⑨⑩ 收生通知 ──
test('⑨ 收生通知：接納＋不接納一撳寄（ReplyTo 班信箱＋紀錄寫返 CourseLinks）', () => {
  mails.length = 0;
  const r = ctx.sendCourseRegNotice_(tk, {
    courseId: 'cl-ops1', by: '示範ADC', replyTo: 'ops1@skwscout.org.hk',
    notices: [
      { id: '2026-09-01T10:00:00Z', kind: 'approved' },
      { id: '2026-09-02T11:00:00Z', kind: 'rejected' },
    ],
  });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.sent, 2);
  assert.strictEqual(mails.length, 2);
  assert.ok(String(mails[0].subject).includes('接納通知'), mails[0].subject);
  assert.ok(String(mails[0].htmlBody).includes('已獲接納'));
  assert.ok(String(mails[0].htmlBody).includes('陳小文'));
  assert.ok(String(mails[1].subject).includes('申請結果'));
  assert.ok(String(mails[1].htmlBody).includes('未能獲得接納'));
  assert.strictEqual(mails[0].replyTo, 'ops1@skwscout.org.hk');
  const link = ctx.courseLinkById_('cl-ops1');
  const recs = JSON.parse(link.regNotices);
  assert.strictEqual(recs['2026-09-01T10:00:00Z'].kind, 'approved');
  assert.strictEqual(recs['2026-09-02T11:00:00Z'].kind, 'rejected');
});
test('⑩ 收生通知：ghost id 回 error result（唔會炸成批）', () => {
  const r = ctx.sendCourseRegNotice_(tk, { courseId: 'cl-ops1', by: 'X', notices: [{ id: 'ghost', kind: 'approved' }] });
  assert.ok(r.ok && r.data.results[0].ok === false && /找不到/.test(r.data.results[0].error));
});
test('⑩b 收生通知：申請人冇電郵 → error result', () => {
  const sh = courseSS._sheets['表格回應'];
  sh.appendRow(['2026-09-03T09:00:00Z', '', '無郵人', '90000000', 'approved']);
  const r = ctx.sendCourseRegNotice_(tk, { courseId: 'cl-ops1', by: 'X', notices: [{ id: '2026-09-03T09:00:00Z', kind: 'approved' }] });
  assert.ok(r.ok && r.data.results[0].ok === false && /冇電郵/.test(r.data.results[0].error));
});

console.log(`\n共 ${pass} 項通過${process.exitCode ? '（有失敗）' : ' ✓'}`);
