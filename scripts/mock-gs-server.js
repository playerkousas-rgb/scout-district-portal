#!/usr/bin/env node
/**
 * 本機模擬 Apps Script 後台（開發預覽用，唔會部署）。
 *
 *   node scripts/mock-gs-server.js            # 開喺 http://127.0.0.1:8788/exec
 *   PORT=8899 node scripts/mock-gs-server.js
 *
 * 做法：喺 vm 入面載入真嘅 gs/Code.gs，用記憶體陣列扮 Google Sheet，
 * 然後行 setupSheets() 建晒表，再開一個 HTTP server 將 /exec 轉去 doGet / doPost。
 * 咁樣本機開 `npx next dev` 就可以真係㩒得、睇到資料（重開就 reset，冇任何真實資料）。
 *
 * 前端點指去呢度：
 *   PORTAL_DEV_APIBASE=http://127.0.0.1:8788/exec PORTAL_SKW_APIKEY=dev npx next dev -H 0.0.0.0
 * 登入：sheep / 0728（超級管理員）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs'), 'utf8');
const PORT = Number(process.env.PORT || 8788);

// ───────── 記憶體 Sheet ─────────
function makeSheet(name, rows = []) {
  const data = rows.map(r => r.slice());
  const sheet = {
    name,
    getName: () => name,
    getLastRow: () => data.length,
    getLastColumn: () => data.reduce((m, r) => Math.max(m, r.length), 0),
    getMaxColumns: () => Math.max(26, data.reduce((m, r) => Math.max(m, r.length), 0)),
    getDataRange: () => ({
      getValues: () => data.map(r => r.slice()),
      setValues: (vals) => { data.length = 0; vals.forEach(r => data.push(r.slice())); },
    }),
    getRange(row, col, numRows = 1, numCols = 1) {
      const range = {
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
          data[row - 1][col - 1] = v;
          return range;
        },
        setValues: (vals) => {
          vals.forEach((r, i) => {
            while (data.length < row + i) data.push([]);
            r.forEach((v, j) => { data[row - 1 + i][col - 1 + j] = v; });
          });
          return range;
        },
        setFontWeight: () => range, setBackground: () => range, setFontColor: () => range,
        setNumberFormat: () => range, setWrap: () => range, setHorizontalAlignment: () => range,
        setBorder: () => range, setFontSize: () => range, clearContent: () => range,
      };
      return range;
    },
    appendRow: (row) => { data.push(row.slice()); },
    insertRowBefore: (idx) => { data.splice(idx - 1, 0, []); },
    deleteRow: (idx) => { data.splice(idx - 1, 1); },
    deleteRows: (idx, n) => { data.splice(idx - 1, n); },
    insertColumnAfter: () => {}, deleteColumn: () => {},
    setFrozenRows: () => {}, setFrozenColumns: () => {}, setColumnWidth: () => {},
    autoResizeColumn: () => {}, hideSheet: () => {}, activate: () => {},
    clear: () => { data.length = 0; },
    _data: data,
  };
  return sheet;
}

const sheets = {};
const ss = {
  getSheetByName: (n) => sheets[n] || null,
  insertSheet: (n) => (sheets[n] = makeSheet(n, [])),
  getSheets: () => Object.values(sheets),
  getId: () => 'mock-sheet-id',
  getUrl: () => 'https://docs.google.com/spreadsheets/d/mock',
  toast: () => {}, setActiveSheet: () => {}, moveActiveSheet: () => {},
};

const props = {};
const ctx = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ss,
    getUi: () => { throw new Error('no ui'); },
    flush: () => {},
  },
  Session: { getScriptTimeZone: () => 'Asia/Hong_Kong', getActiveUser: () => ({ getEmail: () => 'mock@local' }) },
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const iso = new Date(d.getTime() + 8 * 3600 * 1000).toISOString();
      if (fmt === 'yyyy-MM-dd') return iso.slice(0, 10);
      if (fmt === 'yyyyMMdd') return iso.slice(0, 10).replace(/-/g, '');
      if (fmt === 'yyyy-MM-dd HH:mm') return iso.slice(0, 16).replace('T', ' ');
      return iso;
    },
    getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
    base64EncodeWebSafe: (s) => Buffer.from(String(s), 'utf8').toString('base64url'),
    base64DecodeWebSafe: (s) => Buffer.from(String(s), 'base64url'),
    newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
    computeDigest: (_a, s) => Array.from(String(s)).map(c => c.charCodeAt(0) % 128),
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    sleep: () => {},
  },
  ContentService: {
    createTextOutput: (t) => ({ setMimeType: () => t, getContent: () => t }),
    MimeType: { JSON: 'json' },
  },
  MailApp: { sendEmail: (...a) => console.log('  ✉️ (mock) sendEmail', JSON.stringify(a).slice(0, 120)) },
  GmailApp: { sendEmail: () => {} },
  UrlFetchApp: {
    // v4.17.0：訓練班新版流程會經 /exec 打去「該班 Script」（coursev5）——本機冇真 Script，
    // 就用 mock 資料扮 coursev5 回應（getCourseSummary／getCourseSheetRaw／saveCourseBatch／setPaymentCheck），
    // 等預覽行到成條批核線。其他 URL 照舊死回 {}。
    fetch: (_url, opt = {}) => {
      let payload = {};
      try { payload = JSON.parse(String(opt.payload || '{}')); } catch (e) {}
      const reply = (obj) => ({ getContentText: () => JSON.stringify(obj), getResponseCode: () => 200 });
      // readSheet：照 Code.gs readSheet_ 同款（表頭 → 物件陣列）
      const readSheet = (name) => {
        const sh = sheets[name];
        if (!sh) return [];
        const v = sh.getDataRange().getValues();
        if (v.length < 2) return [];
        const hd = v[0].map(x => String(x).trim());
        return v.slice(1).filter(r => r.join('') !== '').map(r => { const o = {}; hd.forEach((h, i) => { o[h] = r[i]; }); return o; });
      };
      const row = readSheet('CourseLinks').find(r => r.scriptExecUrl && payload.apiKey === r.scriptApiKey)
        || readSheet('CourseLinks').find(r => r.scriptExecUrl && String(_url).includes(String(r.courseId || ''))) || null;
      if (payload.action === 'getCourseSummary') {
        const t = row ? String(row.title || '模擬訓練班') : '模擬訓練班';
        return reply({ ok: true, data: {
          courseName: t, edition: '1', section: row ? String(row.section || '童軍') : '童軍', badge: '模擬專章',
          customName: '', type1: '訓練班', type2: '', intake: Number((row && row.quota) || 24) - 4,
          fee: Number((row && row.fee) || 100), quota: Number((row && row.quota) || 24), staffCount: 4,
          deadline: String((row && row.deadline) || ''), publish: '',
          sessions: [
            { date: '2026-10-03', time: '09:00 - 12:00', venue: (row && row.venue) || '區總部', onNotice: true },
            { date: '2026-10-10', time: '09:00 - 12:00', venue: (row && row.venue) || '區總部', onNotice: true },
            { date: '2026-10-17', time: '09:00 - 17:00', venue: (row && row.venue) || '區總部', onNotice: true },
          ],
          leader: { name: '陳大文', title: '先生', phone: '97001122', email: 'leader@example.com' },
          staff: [
            { role: '班領導人', name: '陳大文', title: '先生' },
            { role: '副班領導人', name: '黃小明', title: '先生' },
            { role: '助理班領導人', name: '林小珍', title: '小姐' },
            { role: '導師', name: '張嘉偉', title: '先生' },
          ],
          budget: { sections: [
            { key: 'meal', label: '1. 膳食', mapTo: ['B', 'C', 'D'], budget: 480 },
            { key: 'rent', label: '2. 租金（場租＋露營＋住宿）', mapTo: ['E'], budget: 900 },
            { key: 'transport', label: '3. 交通', mapTo: ['F'], budget: 350 },
            { key: 'handouts', label: '4. 講義及快勞', mapTo: ['H'], budget: 220 },
            { key: 'programme', label: '5. 節目', mapTo: ['I'], budget: 150 },
            { key: 'admin', label: '6. 行政', mapTo: ['G'], budget: 80 },
            { key: 'souvenir', label: '7. 紀念品', mapTo: ['I'], budget: 300 },
            { key: 'misc', label: '8. 其他', mapTo: ['I'], budget: 120 },
          ], total: 2600 },
          notice: { fileNo: String((row && row.courseNo) || ''), issueDate: '', eligibility: String((row && row.eligibility) || ''), feeNote: '', uniform: '' },
          courseEmail: String((row && row.courseNo) || 'course').toLowerCase() + '@skwscout.org.hk',
          approved: !!(row && String(row.approval || '') === 'APPROVED'),
          regCount: readSheet('CourseRegs').filter(r => String(r.courseId || '') === String((row && row.courseId) || '')).length,
          pulledAt: new Date().toISOString(),
        } });
      }
      if (payload.action === 'getCourseSheetRaw') {
        // v4.17.1 預覽示範：該班一筆報名都冇 → 塞四筆示範報名（收款核對／收生通知用；重開即 reset）
        if (row && readSheet('CourseRegs').filter(r => String(r.courseId || '') === String(row.courseId)).length === 0) {
          const shR = sheets['CourseRegs'];
          const hdR = (shR.getDataRange().getValues()[0] || []).map(x => String(x).trim());
          if (hdR.length) {
            [
              { email: 'chan@example.com', nameZh: '陳小文', phone: '91230001', status: 'approved' },
              { email: 'wong@example.com', nameZh: '黃小玲', phone: '92340001', status: 'approved' },
              { email: 'lee@example.com', nameZh: '李小強', phone: '93450001', status: 'rejected' },
              { email: 'ho@example.com', nameZh: '何小美', phone: '94560001', status: 'pending' },
            ].forEach((d, i) => {
              shR.appendRow(hdR.map(h => {
                if (h === 'id') return 'reg-demo-' + String(row.courseId) + '-' + (i + 1);
                if (h === 'districtCode') return 'SKW';
                if (h === 'courseId') return row.courseId;
                if (h === 'courseTitle') return row.title;
                if (h === 'timestamp') return '2026/09/0' + (i + 1) + ' 10:0' + i + ':00';
                return d[h] || '';
              }));
            });
            console.log('🧪 [示範] 已為 ' + row.courseId + ' 塞 4 筆模擬報名（收款核對／收生通知用）');
          }
        }
        const regs = readSheet('CourseRegs').filter(r => row && String(r.courseId || '') === String(row.courseId));
        const resp = [['時間戳記', '電郵地址', '中文姓名', '聯絡電話', '審批狀態', '已退款', '退款核對人']]
          .concat(regs.map(r => [r.timestamp || r.id || '', r.email || '', r.nameZh || '', r.phone || '', r.status || 'pending', r.refunded ? '✔' : '', r.refundedBy || '']));
        return reply({ ok: true, data: {
          input01: [], input02: [[String((row && row.title) || '模擬訓練班'), '']], input03: [], input04: [],
          resp, paramsWX: [], notice: [], accept: [], finance: [], completion: [], cert: [], subsidy: [],
          pulledAt: new Date().toISOString(), rev: 1, revSavedAt: new Date().toISOString(), revBy: 'mock',
        } });
      }
      if (payload.action === 'saveCourseBatch') {
        return reply({ ok: true, data: { saved: true, rev: Date.now() % 100000, savedAt: new Date().toISOString(), updated: (payload.cells || []).length, skippedTabs: [] } });
      }
      if (payload.action === 'setPaymentCheck') {
        return reply({ ok: true, data: { saved: true } });
      }
      if (payload.action === 'setCourseRefund') {
        // 照 course repo Refund.gs 語義（identity 對行、唔 bump rev）——mock 直接寫返 CourseRegs 儲存格
        const shR = sheets['CourseRegs'];
        const vals = shR.getDataRange().getValues();
        const hdR = (vals[0] || []).map(x => String(x).trim());
        const iId = hdR.indexOf('timestamp') >= 0 ? hdR.indexOf('timestamp') : hdR.indexOf('id');
        let iRef = hdR.indexOf('refunded');
        let iRefBy = hdR.indexOf('refundedBy');
        if (iRef < 0) { hdR.push('refunded'); iRef = hdR.length - 1; shR.getRange(1, iRef + 1).setValue('refunded'); }
        if (iRefBy < 0) { hdR.push('refundedBy'); iRefBy = hdR.length - 1; shR.getRange(1, iRefBy + 1).setValue('refundedBy'); }
        const refunded = payload.refunded !== false;
        let hit = -1;
        for (let i = 1; i < vals.length; i++) { if (String(vals[i][iId] || '').trim() === String(payload.id || '').trim()) { hit = i; break; } }
        if (hit < 0) return reply({ ok: false, error: '找不到該報名（時間戳記：' + payload.id + '）' });
        shR.getRange(hit + 1, iRef + 1).setValue(refunded ? '✔' : '');
        shR.getRange(hit + 1, iRefBy + 1).setValue(refunded ? String(payload.by || '') : '');
        return reply({ ok: true, data: { saved: true, row: hit + 1, refunded: refunded } });
      }
      if (payload.action === 'getCourseProfile') {
        return reply({ ok: true, data: { courseName: row ? String(row.title || '') : '模擬訓練班', quota: row ? Number(row.quota) || 0 : 0, staff: [], sessions: [] } });
      }
      return reply({});
    },
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: (k) => { delete props[k]; },
      getProperties: () => ({ ...props }),
    }),
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  CalendarApp: { getCalendarById: () => null },
  HtmlService: {
    createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }), setTitle: () => ({}) }),
  },
  Logger: { log: () => {} },
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });

// ───────── 建表 + 假資料 ─────────
ctx.setupSheets();
const cfg = sheets.Config;
const setCfg = (k, v) => {
  const rows = cfg._data;
  for (let i = 1; i < rows.length; i++) if (String(rows[i][0]).trim() === k) { rows[i][1] = v; return; }
  rows.push([k, v, '']);
};
setCfg('districtCode', 'SKW');
setCfg('districtName', '筲箕灣區');
setCfg('API_KEY_HASH', ctx.sha256_('dev'));   // 本機一律用 apiKey=dev，唔使每次抄新 key

// 超級管理員（示範帳號）
sheets.Users.appendRow(['sheep', 'DC', 'TRUE', '牧羊人', '', '', ctx.hashPassword_ ? ctx.hashPassword_('0728') : '0728']);
try {
  const idx = ctx.rowIndexByCol_(sheets.Users, 'email', 'sheep');
  if (idx > 0) ctx.setPassword_(sheets.Users, idx, '0728');
} catch (e) { /* 舊版冇 setPassword_ 就當明文 */ }

// 幾筆假探訪（睇得出「邊個幹部探咗邊啲旅」）
const Y = new Date().getFullYear();
[
  ['206', 'gh', `${Y}-02-14`, '李小童軍ADC', '集會人數 22'],
  ['1222', 'gh', `${Y}-03-08`, '李小童軍ADC', ''],
  ['82', 'gh', `${Y}-05-20`, '李小童軍ADC', '旅長已交周年報告'],
  ['17', 'scout', `${Y}-04-02`, '陳童軍ADC', ''],
  ['1745', 'scout', `${Y}-07-11`, '陳童軍ADC', '需要協助招募領袖'],
  ['242', 'cub', `${Y}-06-06`, '黃幼童軍ADC', ''],
  ['86', '', `${Y}-08-30`, '牧羊人', '周年大會操'],
].forEach(([troop, section, date, who, note], i) => {
  sheets.Visits.appendRow([
    'vs_seed' + i, 'SKW', troop, section, date,
    Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1,
    section ? 'section' : 'inspection', who, 'mock@local', note, '', new Date().toISOString(), '',
  ]);
});

// ───────── HTTP ─────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (obj) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }); return res.end(); }

  if (req.method === 'GET') {
    const parameter = {};
    url.searchParams.forEach((v, k) => { parameter[k] = v; });
    try { return send(ctx.doGet({ parameter })); }
    catch (e) { return send({ ok: false, error: String(e) }); }
  }

  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    try { send(ctx.doPost({ postData: { contents: body || '{}' } })); }
    catch (e) { send({ ok: false, error: String(e) }); }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🧪 mock Apps Script 後台：http://127.0.0.1:${PORT}/exec`);
  console.log('   登入：sheep / 0728');
  console.log('   前端：PORTAL_DEV_APIBASE=http://127.0.0.1:' + PORT + '/exec PORTAL_SKW_APIKEY=dev npx next dev -H 0.0.0.0\n');
});
