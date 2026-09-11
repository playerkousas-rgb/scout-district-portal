/**
 * gs/Code.gs 邏輯測試 — 用 node 直接跑，唔使開 Apps Script。
 *   node scripts/test-course-links-gs.js
 * 涵蓋（v4.16.0）：
 *   ① CourseLinks 通告全文欄（leader/uniform/remarks/signupText/feeNote）
 *      saveCourseLink_ 寫入 → courseLinkPublic_（listCourseLinks 公開／getCourseLinks 管理）回傳。
 *   ② 同時掛幾個班：三班各自指向唔同收表 Script → listCourseLinks 全部列出；
 *      submitCourseReg_ 各自轉發去啱嗰個 Script（apiKey／driveFolderId 對號），
 *      filled 各自＋1，唔會撈亂；停用／過截止／滿額班報唔到。
 *   ③ 舊表升級：藍圖新增嘅欄 ensureSheetColumns_ 會補喺最尾，唔郁舊資料。
 * 做法：同 test-circulars-gs.js 一樣，vm stub Apps Script，記憶體 2D 陣列扮 Sheet。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs'), 'utf8');

// ── 假 Sheet（同 test-circulars-gs.js 同款） ────────────────────
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
      };
    },
    appendRow: (row) => { data.push(row.slice()); },
    deleteRow: (idx) => { data.splice(idx - 1, 1); },
    setFrozenRows: () => {}, setFrozenColumns: () => {}, clear: () => { data.length = 0; },
    _data: data,
  };
  return sh;
}

// v4.15.0 舊欄位（未有所謂通告全文欄）——upgrade 測試用
const LINK_HEADERS_OLD = ['courseId', 'districtCode', 'title', 'badgeName', 'section', 'courseNo', 'sessionsText',
  'eligibility', 'fee', 'originalFee', 'subsidyNote', 'deadline', 'quota', 'filled',
  'venue', 'noticeUrl', 'contact',
  'scriptExecUrl', 'scriptApiKey', 'driveFolderId',
  'apiBase', 'apiKey',
  'active', 'createdAt',
  'fpsQrPayload', 'fpsAmount', 'fpsReference', 'fpsAccountName', 'fpsAccountNumber', 'fpsUpdatedAt',
  'sheetId', 'setupJson'];
const LINK_HEADERS_NEW = [...LINK_HEADERS_OLD.slice(0, 30), 'leader', 'uniform', 'remarks', 'signupText', 'feeNote',
  'sheetId', 'setupJson'];
function linkRow(headers, o) { return headers.map(h => (o[h] === undefined ? '' : o[h])); }

const day = (offset) => {
  const d = new Date(Date.now() + offset * 86400000 + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};

// 三個班同時掛：各自唔同收表 Script（A/B）；C 冇 Script（直入班；報名會被擋）
function seedCourses(headers) {
  return [
    linkRow(headers, {
      courseId: 'cl-2607', districtCode: 'SKW',
      title: '社區參與章、公民章暨積極公民獎章系列訓練班',
      badgeName: '社區參與章、公民章、積極公民獎章', section: '童軍', courseNo: '2607',
      sessionsText: '2026年7月20日（星期一） 下午七時至十時 香港童軍百周年紀念大樓；…',
      eligibility: '已宣誓及持有有效紀錄冊之童軍支部成員', fee: 100, originalFee: 200,
      subsidyNote: '本活動原價港幣200元，因獲「青少年成員及童軍領袖訓練資助計劃」資助，費用因此獲得減半',
      deadline: day(30), quota: 30, filled: 5,
      venue: '香港童軍百周年紀念大樓、筲箕灣區總部',
      noticeUrl: 'https://www.skwscout.org.hk/wp-content/uploads/2026/05/2607.pdf',
      contact: '胡凱雯小姐（副班領導人） 5721 1100 civics@skwscout.org.hk',
      leader: '楊德銘先生', uniform: '整齊童軍制服',
      remarks: '1. 報名前須獲得家長及旅團領袖同意；\n2. 學員必須全期出席訓練班。',
      signupText: '成員須填妥網上表格', feeNote: '費用：活動費用港幣 100 元正（原價 200 元獲資助減半）…轉數快帳戶識別碼 102866183',
      scriptExecUrl: 'https://script.google.com/macros/A/exec', scriptApiKey: 'ck_AAA',
      driveFolderId: 'folderA', active: 'TRUE', createdAt: '2026-05-22T00:00:00Z',
    }),
    linkRow(headers, {
      courseId: 'cl-2608', districtCode: 'SKW', title: '遠足章訓練班', section: '童軍',
      fee: 50, deadline: day(20), quota: 24, filled: 23, venue: '區總部',
      scriptExecUrl: 'https://script.google.com/macros/B/exec', scriptApiKey: 'ck_BBB',
      driveFolderId: 'folderB', active: 'TRUE',
    }),
    linkRow(headers, {
      courseId: 'cl-2609', districtCode: 'SKW', title: '已截止嘅班', section: '童軍',
      fee: 10, deadline: day(-5), quota: 10, filled: 0, venue: '區總部',
      scriptExecUrl: 'https://script.google.com/macros/C/exec', scriptApiKey: 'ck_CCC',
      active: 'TRUE',
    }),
    linkRow(headers, {
      courseId: 'cl-2610', districtCode: 'SKW', title: '停用咗嘅班', section: '童軍',
      fee: 10, deadline: day(30), quota: 10, filled: 0, venue: '區總部',
      scriptExecUrl: 'https://script.google.com/macros/D/exec', scriptApiKey: 'ck_DDD',
      active: 'FALSE',
    }),
  ];
}

const sheets = {
  Config: makeSheet('Config', [['key', 'value', '說明'],
    ['districtCode', 'SKW', ''], ['districtName', '筲箕灣區', '']]),
  Perms: makeSheet('Perms', [['cardId', 'DC', 'STAFF'],
    ['training', 'edit', 'view']]),
  Users: makeSheet('Users', [['email', 'role', 'active', 'level'], ['dc@x.org', 'DC', 'TRUE', 1]]),
  Roles: makeSheet('Roles', [['role', 'label', 'protected', 'level'], ['DC', '區總監', 'TRUE', 1]]),
  CourseLinks: makeSheet('CourseLinks', [LINK_HEADERS_NEW, ...seedCourses(LINK_HEADERS_NEW)]),
  AllRecords: makeSheet('AllRecords', [['id', 'districtCode', 'type', 'refCode', 'title', 'requester', 'phone', 'troop', 'status', 'detail', 'createdAt']]),
  System: makeSheet('System', [['key', 'value'], ['locked', 'FALSE']]),
};

// UrlFetchApp stub：記低每次轉發去邊個 Script、帶咩 key；A/B 班收表成功，其他一律失敗
const fetches = [];
let fetchResult = '{}';
const ctx = {
  console,
  SpreadsheetApp: {
    getActiveSpreadspread: undefined,
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
  UrlFetchApp: {
    fetch: (url, opt) => {
      const payload = JSON.parse(String((opt && opt.payload) || '{}'));
      fetches.push({ url: String(url), payload });
      const okScript = /macros\/[AB]\/exec/.test(String(url)) && payload.action === 'addReg';
      fetchResult = okScript ? JSON.stringify({ ok: true, data: { refCode: 'CR-' + payload.apiKey } }) : '{"ok":false,"error":"mock fail"}';
      return { getContentText: () => fetchResult, getResponseCode: () => 200 };
    },
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });

function tokenFor(email, role) { return ctx.makeToken_(email, role, 12); }

let pass = 0;
function check(label, fn) { fn(); pass++; console.log('  ✓ ' + label); }

console.log('訓練班目錄（CourseLinks）v4.16.0：通告全文欄＋多班同掛 測試');

// ── ① 公開／管理回傳都有 5 個新欄 ──────────────────────────
check('listCourseLinks（成員系統讀嗰個）：cl-2607 帶齊 leader／uniform／remarks／signupText／feeNote', () => {
  const list = ctx.listCourseLinks_();
  const a = list.find(x => x.courseId === 'cl-2607');
  assert.ok(a, 'cl-2607 要喺列表');
  assert.strictEqual(a.leader, '楊德銘先生');
  assert.strictEqual(a.uniform, '整齊童軍制服');
  assert.ok(String(a.remarks).includes('全期出席'));
  assert.strictEqual(a.signupText, '成員須填妥網上表格');
  assert.ok(String(a.feeNote).includes('102866183'));
  assert.strictEqual(a.subsidyNote.includes('資助'), true);
});

check('getCourseLinks（管理端）：新欄照返，而且唔洩漏 scriptApiKey 以外嘅嘢照舊（apiBase 相容）', () => {
  const r = ctx.getCourseLinks_(tokenFor('dc@x.org', 'DC'));
  assert.ok(r.ok, JSON.stringify(r));
  const a = r.data.find(x => x.courseId === 'cl-2607');
  assert.strictEqual(a.leader, '楊德銘先生');
  assert.strictEqual(a.scriptApiKey, 'ck_AAA');
  assert.strictEqual(a.apiBase, 'https://script.google.com/macros/A/exec');
});

check('doGet listCourseLinks（HTTP 形狀）：公開回應剝走 script key，新欄喺度', () => {
  const raw = ctx.doGet({ parameter: { action: 'listCourseLinks' } });
  const body = JSON.parse(raw);
  assert.ok(body.ok);
  const a = body.data.find(x => x.courseId === 'cl-2607');
  assert.strictEqual(a.uniform, '整齊童軍制服');
  assert.strictEqual(a.scriptApiKey, undefined);
});

// ── ② 多班同掛，各自 Script 報到名 ──────────────────────────
check('同時掛幾個班：active＋未截止先出現（cl-2607／cl-2608），停用同過截止嘅唔見', () => {
  const list = ctx.listCourseLinks_();
  const ids = list.map(x => x.courseId).sort();
  assert.strictEqual(ids.join(','), 'cl-2607,cl-2608');
});

check('submitCourseReg 報 cl-2607 → 轉發去 Script A（key ck_AAA／folderA），filled 5→6', () => {
  fetches.length = 0;
  const r = ctx.submitCourseReg_({
    courseId: 'cl-2607', memberType: '童軍', nameZh: '陳小明', phone: '91234567',
    email: 'student@example.com', receiptDataUrl: 'data:image/jpeg;base64,xxx', troop: '206th',
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.refCode, 'CR-ck_AAA');
  assert.strictEqual(fetches.length, 1);
  assert.strictEqual(fetches[0].url, 'https://script.google.com/macros/A/exec');
  assert.strictEqual(fetches[0].payload.apiKey, 'ck_AAA');
  assert.strictEqual(fetches[0].payload.driveFolderId, 'folderA');
  assert.strictEqual(fetches[0].payload.courseTitle, '社區參與章、公民章暨積極公民獎章系列訓練班');
  assert.strictEqual(fetches[0].payload.section, '童軍');
  const filled = ctx.readSheet_('CourseLinks').find(x => x.courseId === 'cl-2607').filled;
  assert.strictEqual(Number(filled), 6, 'cl-2607 filled 應該 +1');
});

check('submitCourseReg 報 cl-2608 → 轉發去 Script B（key ck_BBB／folderB），cl-2607 嘅 filled 冇被掂', () => {
  fetches.length = 0;
  const r = ctx.submitCourseReg_({
    courseId: 'cl-2608', memberType: '童軍', nameZh: '李大文', phone: '98765432',
    email: 'student2@example.com', receiptDataUrl: 'data:image/jpeg;base64,yyy',
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(fetches[0].url, 'https://script.google.com/macros/B/exec');
  assert.strictEqual(fetches[0].payload.apiKey, 'ck_BBB');
  const rows = ctx.readSheet_('CourseLinks');
  assert.strictEqual(Number(rows.find(x => x.courseId === 'cl-2608').filled), 24, 'cl-2608 filled 應該 +1');
  assert.strictEqual(Number(rows.find(x => x.courseId === 'cl-2607').filled), 6, 'cl-2607 filled 唔應該變');
});

check('cl-2608 滿額（24/24）→ 再報被擋', () => {
  const r = ctx.submitCourseReg_({
    courseId: 'cl-2608', memberType: '童軍', nameZh: '王小美', phone: '91112222',
    email: 's3@example.com', receiptDataUrl: 'data:image/jpeg;base64,zzz',
  });
  assert.ok(!r.ok);
  assert.ok(String(r.error).includes('名額已滿'));
});

check('過截止（cl-2609）／停用（cl-2610）嘅班 → 報名被擋', () => {
  for (const id of ['cl-2609', 'cl-2610']) {
    const r = ctx.submitCourseReg_({
      courseId: id, memberType: '童軍', nameZh: '測試', phone: '91110000',
      email: 'x@example.com', receiptDataUrl: 'data:image/jpeg;base64,q',
    });
    assert.ok(!r.ok, id + ' 應該報唔到');
    assert.ok(String(r.error).includes('找不到此訓練班或已截止'));
  }
});

check('saveCourseLink：貼通告讀完嘅新班（courseId 吉住）→ 自動編號＋5 個新欄存到', () => {
  const r = ctx.saveCourseLink_(tokenFor('dc@x.org', 'DC'), {
    title: '急救工作坊', section: '童軍', fee: 25, quota: 22, deadline: day(15),
    leader: '陳大文先生', uniform: '整齊童軍制服',
    remarks: '1. 全期出席。', signupText: '成員須填妥網上表格', feeNote: '費用：港幣25元正',
    noticeUrl: 'https://www.skwscout.org.hk/x/2612.pdf', active: 'TRUE',
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(/^cl_/.test(r.data.courseId), '自動編號應該 cl_ 開頭');
  const saved = ctx.readSheet_('CourseLinks').find(x => x.courseId === r.data.courseId);
  assert.strictEqual(saved.leader, '陳大文先生');
  assert.strictEqual(saved.uniform, '整齊童軍制服');
  assert.strictEqual(saved.feeNote, '費用：港幣25元正');
  // 公開端即時見到（掛上班）
  const pub = ctx.listCourseLinks_().find(x => x.courseId === r.data.courseId);
  assert.ok(pub, '新班要即時掛上成員系統');
  assert.strictEqual(pub.signupText, '成員須填妥網上表格');
});

// ── ③ 舊表升級：藍圖新欄補喺最尾 ───────────────────────────
check('舊 CourseLinks（v4.15 欄位）→ ensureSheetColumns_ 補 5 欄喺最尾，舊資料原封不動', () => {
  const oldSheet = makeSheet('CourseLinks', [LINK_HEADERS_OLD, ...seedCourses(LINK_HEADERS_OLD)]);
  sheets.CourseLinks = oldSheet;
  // 搵 CourseLinks 嗰份藍圖行 ensureSheetColumns_
  const bp = ctx.blueprint_().filter(function (b) { return b.name === 'CourseLinks'; })[0];
  const added = ctx.ensureSheetColumns_(bp);
  // v4.16.0 5 欄＋v4.17.0 5 欄（新版流程），全部追加喺表尾
  assert.strictEqual(added.join(','), 'leader,uniform,remarks,signupText,feeNote,gsUrl,approval,approvedAt,approvedBy,revisions,regNotices');
  const headers = oldSheet._data[0];
  // 補欄按表尾追加（舊表 sheetId/setupJson 已喺度，所以 11 個新欄排最尾）
  assert.strictEqual(headers.slice(-11).join(','), 'leader,uniform,remarks,signupText,feeNote,gsUrl,approval,approvedAt,approvedBy,revisions,regNotices');
  // 舊資料仲喺度
  const rows = ctx.readSheet_('CourseLinks');
  assert.strictEqual(rows.length, 4);
  assert.strictEqual(rows[0].title, '社區參與章、公民章暨積極公民獎章系列訓練班');
  assert.strictEqual(Number(rows[0].filled), 5);
  // 補完欄之後 saveCourseLink_ 寫新欄即刻得
  const r = ctx.saveCourseLink_(tokenFor('dc@x.org', 'DC'), {
    courseId: 'cl-2607', title: '社區參與章、公民章暨積極公民獎章系列訓練班',
    fee: 100, quota: 30, deadline: day(30), leader: '楊德銘先生', active: 'TRUE',
  });
  assert.ok(r.ok, JSON.stringify(r));
  const saved = ctx.readSheet_('CourseLinks').find(x => x.courseId === 'cl-2607');
  assert.strictEqual(saved.leader, '楊德銘先生');
});

console.log(`\n共 ${pass} 項通過${process.exitCode ? '（有失敗）' : ''}`);
