/**
 * gs/Code.gs v6.2.1 對接測試（opsKey＋fileId 對班＋addReg 全欄轉發）— node 直接跑，唔使開 Apps Script。
 *   node scripts/test-course-621-gs.js
 * 涵蓋：
 *   ① courseHubInfo_／courseHubFileIdReady_：GET /exec 能力檢查（hubVersion ≥ 6.2.1 先行 fileId 路）
 *   ② courseTarget_：hub 班 → opsKey＋fileId；舊班 → apiKey；無接駁 → error
 *   ③ pullCourseSummary_ 經 opsKey＋fileId 拉到批核摘要
 *   ④ setCoursePaymentCheck_／setCourseRefund_ hub 班 exec 路 → opsKey＋fileId
 *   ⑤ saveCourseApproval_ 開唔到班 Sheet（hub）→ setParamLabel tick「區會批准」（opsKey＋fileId）
 *   ⑥ listHubCourses_：公開 listCourses 攞班名＋公開課程ID 配對
 *   ⑦ submitCourseReg_：hub 班公開 addReg 只憑 publicCourseId＋canonical 全欄轉發（舊欄名照送）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs'), 'utf8');
const HUB = 'https://script.google.com/macros/HUB/exec';
const HUB_VERSION = '6.2.1';

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
  'sheetId', 'setupJson', 'gsUrl', 'approval', 'approvedAt', 'approvedBy', 'revisions', 'regNotices', 'publicCourseId'];
const linkRow = (o) => LINK_HEADERS.map(h => (o[h] === undefined ? '' : o[h]));

const sheets = {
  Config: makeSheet('Config', [['key', 'value', '說明'],
    ['districtCode', 'SKW', ''], ['districtName', '筲箕灣區', ''],
    ['COURSE_HUB_URL', HUB, ''],
    ['COURSE_OPS_KEY', 'ops-123', '']]),
  Perms: makeSheet('Perms', [['cardId', 'DC', 'STAFF'], ['training', 'edit', 'view']]),
  Users: makeSheet('Users', [['email', 'role', 'active', 'level'], ['dc@x.org', 'DC', 'TRUE', 1]]),
  Roles: makeSheet('Roles', [['role', 'label', 'protected', 'level'], ['DC', '區總監', 'TRUE', 1]]),
  CourseLinks: makeSheet('CourseLinks', [LINK_HEADERS,
    // hub 班：開唔到 GS（唔同帳戶）＋有 publicCourseId → 靠 opsKey＋fileId
    linkRow({ courseId: 'cl-hub1', title: '測試班A', section: '童軍', fee: 100, quota: 30, deadline: '2999-01-01',
      scriptExecUrl: HUB, gsUrl: 'https://docs.google.com/spreadsheets/d/HUBSHEET2/edit', publicCourseId: 'crs_hub2', active: 'TRUE' }),
    // 舊班：自己有 /exec＋apiKey
    linkRow({ courseId: 'cl-old1', title: '測試班B', section: '童軍', fee: 100, quota: 30, deadline: '2999-01-01',
      scriptExecUrl: 'https://script.google.com/macros/OLD1/exec', scriptApiKey: 'ck_OLD1',
      gsUrl: 'https://docs.google.com/spreadsheets/d/OLD1SHEET/edit', active: 'TRUE' }),
  ]),
  AllRecords: makeSheet('AllRecords', [['id', 'districtCode', 'type', 'refCode', 'title', 'requester', 'phone', 'troop', 'status', 'detail', 'createdAt']]),
  System: makeSheet('System', [['key', 'value'], ['locked', 'FALSE']]),
};

const fetches = [];
const ctx = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => (sheets[n] = makeSheet(n, [])),
    }),
    openById: (id) => {
      // HUBSHEET2 扮「唔同帳戶擁有」開唔到；OLD1SHEET 開到
      if (String(id).includes('HUBSHEET2')) throw new Error('no permission');
      return { getSheetByName: () => null, insertSheet: () => null };
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
  MailApp: { sendEmail: () => {} },
  UrlFetchApp: {
    fetch: (url, opt) => {
      const method = String((opt && opt.method) || 'post').toLowerCase();
      const payload = JSON.parse(String((opt && opt.payload) || '{}'));
      const u = String(url);
      fetches.push({ url: u, method, payload });
      let out = { ok: false, error: 'mock fail' };
      if (/HUB\/exec/.test(u)) {
        if (method === 'get') {
          out = { ok: true, data: { hubVersion: HUB_VERSION, ready: true } };
        } else if (payload.action === 'listCourses') {
          out = { ok: true, data: { courses: [{ courseId: 'c1', publicCourseId: 'crs_hub2', name: '測試班A', status: 'active', cl: '班長' }] } };
        } else if (payload.action === 'getCourseSummary') {
          out = { ok: true, data: { courseName: '測試班A', quota: 30, fee: 100, approved: false, courseEmail: 'a@skwscout.org.hk', regCount: 3, sessions: [], staff: [], budget: { sections: [], total: 0 } } };
        } else if (payload.action === 'setPaymentCheck' || payload.action === 'setCourseRefund') {
          out = { ok: true, data: { saved: true } };
        } else if (payload.action === 'setParamLabel') {
          out = { ok: true, data: { saved: true, label: payload.label } };
        } else if (payload.action === 'addReg') {
          out = { ok: true, refCode: 'CR-hub' };
        }
      } else if (/OLD1\/exec/.test(u)) {
        if (method === 'get') out = { ok: false, error: 'old backend, no hubInfo' };
        else if (payload.action === 'addReg') out = { ok: true, data: { refCode: 'CR-old' } };
      }
      return { getContentText: () => JSON.stringify(out), getResponseCode: () => 200 };
    },
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });

function tokenFor(email, role) { return ctx.makeToken_(email, role, 12); }
const tk = tokenFor('dc@x.org', 'DC');

let pass = 0;
const test = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { console.log('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };

// ── ① 能力檢查 ──
test('① GET hub /exec → hubVersion 6.2.1＋ready（先識行 fileId 路）', () => {
  const info = ctx.courseHubInfo_(HUB);
  assert.ok(info, '要讀到 hubInfo');
  assert.strictEqual(info.hubVersion, '6.2.1');
  assert.strictEqual(info.ready, true);
  const link = ctx.courseLinkById_('cl-hub1');
  assert.strictEqual(ctx.courseHubFileIdReady_(link), true);
  assert.strictEqual(ctx.courseIsHub_(link), true);
});

// ── ② courseTarget_ 三路 ──
test('② courseTarget_：hub 班 → opsKey＋fileId（唔再逐班 apiKey）', () => {
  const link = ctx.courseLinkById_('cl-hub1');
  const t = ctx.courseTarget_(link, { action: 'getCourseSummary' });
  assert.strictEqual(t.path, 'ops-fileId');
  assert.strictEqual(t.payload.opsKey, 'ops-123');
  assert.strictEqual(t.payload.fileId, 'HUBSHEET2');
  assert.strictEqual(t.payload.apiKey, undefined);
});
test('②b courseTarget_：舊班（自己 /exec）→ apiKey', () => {
  const link = ctx.courseLinkById_('cl-old1');
  const t = ctx.courseTarget_(link, { action: 'getCourseSummary' });
  assert.strictEqual(t.path, 'apiKey');
  assert.strictEqual(t.payload.apiKey, 'ck_OLD1');
  assert.strictEqual(t.payload.opsKey, undefined);
});

// ── ③ pullCourseSummary_ 經 opsKey＋fileId ──
test('③ pullCourseSummary 經 opsKey＋fileId 拉到摘要', () => {
  fetches.length = 0;
  const r = ctx.pullCourseSummary_(tk, { courseId: 'cl-hub1' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.courseName, '測試班A');
  const f = fetches.filter(x => x.payload.action === 'getCourseSummary').pop();
  assert.ok(f, '要 call 過 getCourseSummary');
  assert.strictEqual(f.payload.opsKey, 'ops-123');
  assert.strictEqual(f.payload.fileId, 'HUBSHEET2');
  assert.strictEqual(f.payload.apiKey, undefined);
});

// ── ④ 收款核對／退款 exec 路 → opsKey＋fileId ──
test('④ 收款核對 hub 班（開唔到 GS）→ setPaymentCheck 經 opsKey＋fileId', () => {
  fetches.length = 0;
  const r = ctx.setCoursePaymentCheck_(tk, { courseId: 'cl-hub1', by: '示範財務', checks: [{ id: '2026-09-01T10:00:00Z', verified: true }] });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.path, 'exec');
  const f = fetches.filter(x => x.payload.action === 'setPaymentCheck').pop();
  assert.ok(f, '要 call 過 setPaymentCheck');
  assert.strictEqual(f.payload.opsKey, 'ops-123');
  assert.strictEqual(f.payload.fileId, 'HUBSHEET2');
});
test('④b 退款 hub 班 → setCourseRefund 經 opsKey＋fileId', () => {
  fetches.length = 0;
  const r = ctx.setCourseRefund_(tk, { courseId: 'cl-hub1', by: '示範財務', refunds: [{ id: '2026-09-01T10:00:00Z', refunded: true }] });
  assert.ok(r.ok, r.error);
  const f = fetches.filter(x => x.payload.action === 'setCourseRefund').pop();
  assert.strictEqual(f.payload.opsKey, 'ops-123');
  assert.strictEqual(f.payload.fileId, 'HUBSHEET2');
});

// ── ⑤ saveCourseApproval_ 開唔到 GS（hub）→ setParamLabel tick 區會批准 ──
test('⑤ 開唔到班 Sheet（hub）→ setParamLabel（opsKey＋fileId）tick 區會批准', () => {
  fetches.length = 0;
  const r = ctx.saveCourseApproval_(tk, { courseId: 'cl-hub1', by: '示範ADC', cells: [], approval: 'APPROVED', link: {} });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.approvalDone, true, JSON.stringify(r.data));
  assert.strictEqual(r.data.path, 'ops');
  const f = fetches.filter(x => x.payload.action === 'setParamLabel').pop();
  assert.ok(f, '要 call 過 setParamLabel');
  assert.strictEqual(f.payload.opsKey, 'ops-123');
  assert.strictEqual(f.payload.fileId, 'HUBSHEET2');
  assert.strictEqual(f.payload.label, '區會批准');
  assert.strictEqual(f.payload.value, '✔');
  assert.strictEqual(ctx.courseLinkById_('cl-hub1').approval, 'APPROVED');
});
test('⑤b 開唔到班 Sheet（hub）＋有 cells 冇 apiKey → 警告核心資料寫唔到', () => {
  fetches.length = 0;
  const r = ctx.saveCourseApproval_(tk, {
    courseId: 'cl-hub1', by: '示範ADC', approval: 'PENDING',
    cells: [{ tab: 'Input02 訓練班資料', row: 2, col: 2, value: '40' }], link: {},
  });
  assert.ok(r.ok, r.error);
  assert.ok(r.data.warnings.some(w => /核心資料修改寫唔到/.test(w)), JSON.stringify(r.data.warnings));
  // 批准格照樣經 setParamLabel 還原
  const f = fetches.filter(x => x.payload.action === 'setParamLabel').pop();
  assert.strictEqual(f.payload.value, '');
});

// ── ⑥ listHubCourses_ ──
test('⑥ listHubCourses：公開 listCourses 攞班名＋公開課程ID（配對用）', () => {
  const r = ctx.listHubCourses_(tk);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.hubVersion, '6.2.1');
  assert.strictEqual(r.data.hubReady, true);
  assert.strictEqual(r.data.courses[0].name, '測試班A');
  assert.strictEqual(r.data.courses[0].publicCourseId, 'crs_hub2');
});

// ── ⑦ submitCourseReg_：hub 班公開 addReg（publicCourseId）＋全欄轉發 ──
test('⑦ hub 班公開 addReg：只憑 publicCourseId＋canonical 欄（舊欄名自動對應）', () => {
  fetches.length = 0;
  const r = ctx.submitCourseReg_({
    courseId: 'cl-hub1', memberType: '童軍', nameZh: '陳小明', phone: '91234567',
    email: 's@example.com', receiptDataUrl: 'data:image/jpeg;base64,xxx', troop: '206th',
    scoutId: 'S123', scoutRank: '小隊長', extra: '想學嘢',
    guardianConsent: '是', guardianName: '陳爸', guardianRelation: '父', guardianEmail: 'dad@x.org', guardianPhone: '91112222',
    leaderConsent: '✔', leaderName: '王領袖', leaderPosition: '旅長', leaderEmail: 'l@x.org',
    payMethod: 'FPS', payerName: '陳爸', payAccount: '1234', needReceipt: '1',
    note: '第一次參加', formScreenshot: 'data:image/png;base64,form',
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.refCode, 'CR-hub');
  const f = fetches.filter(x => x.payload.action === 'addReg').pop();
  assert.strictEqual(f.url, HUB);
  assert.strictEqual(f.payload.publicCourseId, 'crs_hub2');
  assert.strictEqual(f.payload.apiKey, undefined);
  // canonical 欄（hub 寫入）
  assert.strictEqual(f.payload.consentParent, '是');
  assert.strictEqual(f.payload.gName, '陳爸');
  assert.strictEqual(f.payload.consentLeader, '✔');
  assert.strictEqual(f.payload.leaderTitle, '旅長');
  assert.strictEqual(f.payload.payer, '陳爸');
  assert.strictEqual(f.payload.remark, '第一次參加');
  assert.strictEqual(f.payload.formDataUrl, 'data:image/png;base64,form');
  assert.strictEqual(f.payload.scoutPosition, '小隊長');
  assert.strictEqual(f.payload.reason, '想學嘢');
  // 舊制別名照送（等舊班收表 Script 都收到）
  assert.strictEqual(f.payload.guardianConsent, '是');
  assert.strictEqual(f.payload.leaderPosition, '旅長');
  assert.strictEqual(f.payload.payerName, '陳爸');
  assert.strictEqual(f.payload.note, '第一次參加');
});
test('⑦b 舊班 addReg：apiKey 路＋全欄照送', () => {
  fetches.length = 0;
  const r = ctx.submitCourseReg_({
    courseId: 'cl-old1', memberType: '童軍', nameZh: '李大文', phone: '98765432',
    email: 's2@example.com', receiptDataUrl: 'data:image/jpeg;base64,yyy',
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.refCode, 'CR-old');
  const f = fetches.filter(x => x.payload.action === 'addReg').pop();
  assert.strictEqual(f.url, 'https://script.google.com/macros/OLD1/exec');
  assert.strictEqual(f.payload.apiKey, 'ck_OLD1');
  assert.strictEqual(f.payload.publicCourseId, undefined);
});

console.log(`\n共 ${pass} 項通過${process.exitCode ? '（有失敗）' : ' ✓'}`);
