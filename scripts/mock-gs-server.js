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
    fetch: () => ({ getContentText: () => '{}', getResponseCode: () => 200, getAllHeaders: () => ({}) }),
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
