/**
 * gs/Code.gs 邏輯測試（Teamup 區會行事曆及 v4.33.0 卡片）— node scripts/test-links-keydates-gs.js
 * 涵蓋：🔗 常用連結／📅 重要日期／🔢 實體密碼／🗓️ 區會行事曆
 *   · Perms 門禁：全部已登入職員 👁；links ADC+ ✏️、keyDates／passcodes DDC+ ✏️
 *   · CRUD、驗證（網址格式、必填、長度、唔准放網上帳戶密碼）
 *   · 日期文字解析同排序（9Nov2026 / 17-18Apr2027 / 2027 / 待定）
 *   · setupSheets 會補建連結／日期／密碼及 append-only 行事曆稽核表，唔會建立本地活動表
 * 做法同其他 *-gs 測試一樣：喺 vm 入面 stub Apps Script 全域物件，用記憶體 2D 陣列扮 Sheet。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'gs', 'Code.gs'), 'utf8');

function makeSheet(name, rows) {
  const data = rows.map(r => r.slice());
  let maxColumns = Math.max(26, ...rows.map(r => r.length), 1);
  return {
    name,
    getName: () => name,
    getLastRow: () => data.length,
    getLastColumn: () => Math.max(0, ...data.map(r => r.length)),
    getMaxColumns: () => maxColumns,
    getMaxRows: () => Math.max(data.length, 1),
    insertColumnsAfter: (_after, count) => { maxColumns += count; },
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
        setFontWeight() { return this; }, setBackground() { return this; },
        setFontColor() { return this; }, setNumberFormat() { return this; },
        setHorizontalAlignment() { return this; }, setWrap() { return this; },
        setBorder() { return this; }, setDataValidation() { return this; },
        clearDataValidations() { return this; }, setNote() { return this; },
      };
    },
    appendRow: (row) => { data.push(row.slice()); },
    deleteRow: (idx) => { data.splice(idx - 1, 1); },
    setFrozenRows: () => {}, setFrozenColumns: () => {}, clear: () => { data.length = 0; },
    setColumnWidth: () => {}, autoResizeColumn: () => {}, hideColumns: () => {}, hideSheet: () => {},
    protect: () => ({
      setDescription() { return this; }, addEditor() { return this; },
      getEditors: () => [], removeEditor() { return this; },
      setWarningOnly() { return this; }, canDomainEdit: () => false, remove() {},
    }),
    getProtections: () => [],
    _data: data,
  };
}

const ROLES = ['DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING', 'ADC_ROVER', 'ADC_VENTURE',
  'ADC_SCOUT', 'ADC_CUBS', 'ADC_GH', 'DL', 'LEADER', 'AL', 'STAFF'];

const sheets = {
  Config: makeSheet('Config', [['key', 'value', '說明'], ['districtCode', 'SKW', ''], ['districtName', '筲箕灣區', ''],
    ['TEAMUP_API_KEY', 'unit-test-token', ''], ['TEAMUP_CALENDAR_KEY', 'unit-test-calendar', ''],
    ['TEAMUP_PENDING_SUBCAL_ID', '1001', ''], ['TEAMUP_APPROVED_SUBCAL_ID', '1002', ''],
    ['TEAMUP_REJECTED_SUBCAL_ID', '1003', ''], ['TEAMUP_DISTRICT_SUBCAL_ID', '1004', '']]),
  Users: makeSheet('Users', [['email', 'role', 'active', 'level', 'cards'],
    ['dc@x.org', 'DC', 'TRUE', 1, ''],
    ['ddc@x.org', 'DDC_ADMIN', 'TRUE', 2, ''],
    ['adc@x.org', 'ADC_SCOUT', 'TRUE', 3, ''],
    ['staff@x.org', 'STAFF', 'TRUE', 4, ''],
    ['al@x.org', 'AL', 'TRUE', 5, ''],
    ['scoped@x.org', 'DC', 'TRUE', 1, 'contacts'],
  ]),
  Roles: makeSheet('Roles', [['role', 'label', 'protected', 'level']].concat(
    ROLES.map(r => [r, r, 'TRUE', r === 'SYSADMIN' ? 0 : r === 'DC' ? 1 : /^DDC/.test(r) ? 2 : /^ADC/.test(r) ? 3 : r === 'STAFF' ? 4 : 5]),
  )),
  // 刻意只放幾行舊 Perms：測 setupSheets 會唔會補三行新權限而唔郁舊行
  Perms: makeSheet('Perms', [['cardId'].concat(ROLES), ['contacts'].concat(ROLES.map(() => 'edit'))]),
  Cards: makeSheet('Cards', [
    ['cardId', 'title', 'icon', 'type', 'url', 'description', 'order', 'enabled', 'embed', 'source', 'category'],
    ['contacts', '聯絡簿', '📇', 'builtin', '/contacts', '舊描述', 2, 'TRUE', 'FALSE', 'core', 'done'],
  ]),
  System: makeSheet('System', [['key', 'value'], ['locked', 'FALSE'], ['lockMessage', '維護中']]),
};

const teamupEvents = new Map();
let nextTeamupId = 1;
let teamupChangeCount = 0;
let observedTeamupToken = '';
const scriptProps = { PORTAL_TOKEN_SECRET: 'FAKE_UNIT_TEST_PRIVATE_TOKEN_SECRET_0123456789_ABCDEFGHIJKLMNOP' };

const ctx = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => (sheets[n] = makeSheet(n, [])),
      getSheets: () => Object.values(sheets),
    }),
    ProtectionType: { SHEET: 'SHEET' },
  },
  Session: { getScriptTimeZone: () => 'Asia/Hong_Kong', getEffectiveUser: () => ({ getEmail: () => 'owner@x.org' }) },
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const iso = new Date(d.getTime() + 8 * 3600 * 1000).toISOString();
      if (fmt === 'yyyy-MM-dd' || fmt === 'yyyy-MM-01') return fmt === 'yyyy-MM-01' ? iso.slice(0, 7) + '-01' : iso.slice(0, 10);
      if (fmt === "yyyy-MM-dd'T'HH:mm:ss") return iso.slice(0, 19);
      if (fmt === 'HH:mm') return iso.slice(11, 16);
      if (fmt === 'yyyyMMdd') return iso.slice(0, 10).replace(/-/g, '');
      return iso;
    },
    getUuid: () => require('crypto').randomUUID(),
    base64EncodeWebSafe: (str) => Buffer.from(String(str), 'utf8').toString('base64url'),
    base64DecodeWebSafe: (str) => Buffer.from(String(str), 'base64url'),
    newBlob: (buf) => ({ getDataAsString: () => Buffer.from(buf).toString('utf8') }),
    computeDigest: (_alg, str) => Array.from(String(str)).map(c => c.charCodeAt(0) % 128),
    computeHmacSha256Signature: (msg, secret) => Array.from(
      require('crypto').createHmac('sha256', String(secret)).update(String(msg)).digest(),
    ).map(b => (b > 127 ? b - 256 : b)),
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
  },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  MailApp: { sendEmail: () => {} },
  UrlFetchApp: { fetch: (url, options = {}) => {
    observedTeamupToken = options.headers && options.headers['Teamup-Token'] || '';
    const u = new URL(url);
    const method = String(options.method || 'get').toLowerCase();
    const pathName = decodeURIComponent(u.pathname).replace(/^\//, '');
    const result = (data, code = 200) => ({ getContentText: () => JSON.stringify(data), getResponseCode: () => code });
    if (pathName.endsWith('/subcalendars')) return result({ subcalendars: [
      { id: 1001, name: '借場申請中', active: true }, { id: 1002, name: '借場已批', active: true },
      { id: 1003, name: '借場拒絕', active: true }, { id: 1004, name: '區會行事曆', active: true },
    ] });
    const body = options.payload ? JSON.parse(options.payload) : {};
    const match = pathName.match(/\/events(?:\/([^/]+))?$/);
    if (!match) return result({ error: 'not found' }, 404);
    const eventId = match[1] ? decodeURIComponent(match[1]) : '';
    if (!eventId && method === 'get') {
      const wantedSub = u.searchParams.getAll('subcalendarId[]').map(String);
      const events = [...teamupEvents.values()].filter(ev => !wantedSub.length || ev.subcalendar_ids.some(id => wantedSub.includes(String(id))));
      return result({ events });
    }
    if (!eventId && method === 'post') {
      const id = 'tu-' + nextTeamupId++;
      const stamp = new Date(Date.UTC(2027, 0, 1, 0, 0, teamupChangeCount++)).toISOString();
      const ev = { ...body, id, create_dt: stamp, modify_dt: stamp };
      teamupEvents.set(id, ev);
      return result({ event: ev }, 201);
    }
    const current = teamupEvents.get(eventId);
    if (!current) return result({ error: 'not found' }, 404);
    if (method === 'get') return result({ event: current });
    if (method === 'put') {
      const stamp = new Date(Date.UTC(2027, 0, 1, 0, 0, teamupChangeCount++)).toISOString();
      const ev = { ...current, ...body, id: eventId, create_dt: current.create_dt, modify_dt: stamp };
      teamupEvents.set(eventId, ev); return result({ event: ev });
    }
    if (method === 'delete') { teamupEvents.delete(eventId); return result({}); }
    return result({ error: 'unsupported' }, 405);
  } },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: k => scriptProps[k] || '',
      setProperty: (k, v) => { scriptProps[k] = v; },
      deleteProperty: (k) => { delete scriptProps[k]; },
    }),
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'Code.gs' });

const token = (email, role) => ctx.makeToken_(email, role, 12);
const dc = token('dc@x.org', 'DC');
const ddc = token('ddc@x.org', 'DDC_ADMIN');
const adc = token('adc@x.org', 'ADC_SCOUT');
const staff = token('staff@x.org', 'STAFF');
const al = token('al@x.org', 'AL');
const scoped = token('scoped@x.org', 'DC');

let pass = 0;
function check(label, fn) { fn(); pass++; console.log('  ✓ ' + label); }

// ───────────────────────── setupSheets 補建 ─────────────────────────

console.log('\n🧱 setupSheets 補建（唔郁舊資料）');

const beforePermRows = sheets.Perms._data.length;
ctx.uiAlert_ = () => {};
ctx.showKeyDialog_ = () => {};
ctx.setupSheets();

check('補建 Links / KeyDates / Passcodes 及 append-only DistrictCalendarAudit；不建立本地活動表', () => {
  ['Links', 'KeyDates', 'Passcodes', 'DistrictCalendarAudit'].forEach(n => assert.ok(sheets[n], `缺 ${n} 表`));
  assert.ok(!sheets.DistrictEvents, '不得以 Sheet 作活動主資料來源');
  assert.ok(sheets.Config._data.some(row => row[0] === 'TEAMUP_DISTRICT_SUBCAL_ID'), '專用子日曆 ID 必須有 Config 設定入口');
  assert.strictEqual(sheets.Links._data[0].slice(0, 4).join('|'), 'id|districtCode|title|url');
  assert.strictEqual(sheets.KeyDates._data[0].slice(0, 6).join('|'),
    'id|districtCode|title|dateText|startDate|endDate');
  assert.strictEqual(sheets.Passcodes._data[0].slice(0, 4).join('|'), 'id|districtCode|name|code');
  assert.strictEqual(sheets.DistrictCalendarAudit._data[0].join('|'), 'districtCode|eventId|action|actor|at|beforeHash|afterHash|previousHash|hash');
});

check('補建四行 Cards，舊 contacts 行冇被覆寫', () => {
  const ids = sheets.Cards._data.slice(1).map(r => r[0]);
  ['links', 'keyDates', 'passcodes', 'districtCalendar'].forEach(id => assert.ok(ids.includes(id), `缺 ${id} 卡`));
  const contacts = sheets.Cards._data.find(r => r[0] === 'contacts');
  assert.strictEqual(contacts[1], '聯絡簿');
});

check('補建三行 Perms：全部角色 view，指定層級 edit', () => {
  const head = sheets.Perms._data[0];
  const get = (cid, role) => {
    const row = sheets.Perms._data.find(r => r[0] === cid);
    return row ? row[head.indexOf(role)] : undefined;
  };
  assert.ok(sheets.Perms._data.length > beforePermRows);
  // links：ADC 或以上 edit
  assert.strictEqual(get('links', 'DC'), 'edit');
  assert.strictEqual(get('links', 'DDC_TRAINING'), 'edit');
  assert.strictEqual(get('links', 'ADC_SCOUT'), 'edit');
  assert.strictEqual(get('links', 'STAFF'), 'view');
  assert.strictEqual(get('links', 'AL'), 'view');
  // keyDates / passcodes：DDC 或以上 edit，其餘 view（全部人可看）
  ['keyDates', 'passcodes'].forEach(cid => {
    assert.strictEqual(get(cid, 'DC'), 'edit');
    assert.strictEqual(get(cid, 'DDC_ADMIN'), 'edit');
    assert.strictEqual(get(cid, 'ADC_SCOUT'), 'view');
    assert.strictEqual(get(cid, 'DL'), 'view');
    assert.strictEqual(get(cid, 'AL'), 'view');
  });
  // 行事曆：全部已登入角色可看；DDC+、STAFF、管理員可編輯，ADC 由後端另授新增權。
  ['DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING', 'STAFF'].forEach(role => assert.strictEqual(get('districtCalendar', role), 'edit'));
  assert.strictEqual(get('districtCalendar', 'ADC_SCOUT'), 'view');
  assert.strictEqual(get('districtCalendar', 'AL'), 'view');
});

check('三張卡唔會列入敏感保護表（實體密碼刻意唔當機密）', () => {
  assert.ok(!code.includes('SHEET.PASSCODES]'), 'Passcodes 唔應該喺 protectSensitiveSheets_ 清單');
  assert.ok(code.includes('protectSensitiveSheets_'));
});

// ───────────────────────── 🔗 常用連結 ─────────────────────────

console.log('\n🔗 常用連結（links）');

let linkId = '';
check('ADC 可以加連結', () => {
  const r = ctx.saveLink_(adc, { title: 'HKIR 停車場', url: 'http://bit.ly/HKIRCarPark', category: '港島地域' });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.data.created, true);
  linkId = r.data.id;
});

check('STAFF／區領袖只可以睇，唔可以加', () => {
  assert.strictEqual(ctx.saveLink_(staff, { title: 'x', url: 'https://x.org' }).ok, false);
  assert.strictEqual(ctx.saveLink_(al, { title: 'x', url: 'https://x.org' }).ok, false);
});

check('全部已登入職員都睇到（AL 都有 view）', () => {
  const r = ctx.getLinks_(al);
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.data.access, 'view');
  assert.strictEqual(r.data.items.length, 1);
  assert.strictEqual(r.data.items[0].url, 'http://bit.ly/HKIRCarPark');
});

check('ADC 讀到 access=edit（前端靠呢個決定顯唔顯示編輯掣）', () => {
  assert.strictEqual(ctx.getLinks_(adc).data.access, 'edit');
});

check('未登入／過期 token 一律擋', () => {
  assert.strictEqual(ctx.getLinks_('bogus').ok, false);
  assert.strictEqual(ctx.saveLink_('bogus', { title: 'x', url: 'https://x.org' }).ok, false);
});

check('帳戶卡片範圍（Users.cards）冇 links 就睇唔到', () => {
  assert.strictEqual(ctx.getLinks_(scoped).ok, false);
});

check('網址驗證：必須 http(s)，擋 javascript: 同空白', () => {
  assert.strictEqual(ctx.saveLink_(dc, { title: 'x', url: 'javascript:alert(1)' }).ok, false);
  assert.strictEqual(ctx.saveLink_(dc, { title: 'x', url: 'bit.ly/abc' }).ok, false);
  assert.strictEqual(ctx.saveLink_(dc, { title: 'x', url: 'https://a.org/ b' }).ok, false);
  assert.strictEqual(ctx.saveLink_(dc, { title: 'x', url: '' }).ok, false);
  assert.strictEqual(ctx.saveLink_(dc, { title: '', url: 'https://a.org' }).ok, false);
});

check('名稱過長拒絕', () => {
  assert.strictEqual(ctx.saveLink_(dc, { title: 'x'.repeat(81), url: 'https://a.org' }).ok, false);
});

check('更新連結唔會改 id／createdAt', () => {
  const before = ctx.getLinks_(dc).data.items[0];
  const r = ctx.saveLink_(dc, { id: linkId, title: 'HKIR 停車場登記', url: 'http://bit.ly/HKIRCarPark', note: '活動前一日截止' });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.data.created, false);
  const after = ctx.getLinks_(dc).data.items[0];
  assert.strictEqual(after.id, before.id);
  assert.strictEqual(after.createdAt, before.createdAt);
  assert.strictEqual(after.title, 'HKIR 停車場登記');
  assert.strictEqual(after.note, '活動前一日截止');
  assert.strictEqual(after.updatedBy, 'dc@x.org');
});

check('揾唔到 id 會報錯而唔係靜雞雞新增', () => {
  assert.strictEqual(ctx.saveLink_(dc, { id: 'nope', title: 'x', url: 'https://a.org' }).ok, false);
  assert.strictEqual(ctx.deleteLink_(dc, 'nope').ok, false);
});

check('按分類→排序→名稱排好', () => {
  ctx.saveLink_(dc, { title: 'B 表格', url: 'https://b.org', category: '區會', order: 2 });
  ctx.saveLink_(dc, { title: 'A 表格', url: 'https://a.org', category: '區會', order: 1 });
  const items = ctx.getLinks_(dc).data.items;
  const district = items.filter(i => i.category === '區會').map(i => i.title).join('|');
  assert.strictEqual(district, 'A 表格|B 表格');
});

check('STAFF 唔刪得；ADC 刪得', () => {
  const extra = ctx.saveLink_(adc, { title: '暫時', url: 'https://tmp.org' }).data.id;
  assert.strictEqual(ctx.deleteLink_(staff, extra).ok, false);
  assert.strictEqual(ctx.deleteLink_(adc, extra).ok, true);
  assert.ok(!ctx.getLinks_(dc).data.items.some(i => i.id === extra));
});

// ───────────────────────── 📅 重要日期 ─────────────────────────

console.log('\n📅 重要日期（keyDates）');

check('ADC 唔可以加（只限 DDC 或以上），但睇得到', () => {
  assert.strictEqual(ctx.saveKeyDate_(adc, { title: 'x', dateText: '9Nov2026' }).ok, false);
  assert.strictEqual(ctx.getKeyDates_(adc).data.access, 'view');
  assert.strictEqual(ctx.getKeyDates_(al).ok, true);
});

check('DDC 可以加；後台自己解析排序日期', () => {
  const r = ctx.saveKeyDate_(ddc, { title: '青少年委員會會議', dateText: '9Nov2026' });
  assert.strictEqual(r.ok, true, r.error);
  const item = ctx.getKeyDates_(ddc).data.items.find(i => i.id === r.data.id);
  assert.strictEqual(item.startDate, '2026-11-09');
  assert.strictEqual(item.endDate, '2026-11-09');
  assert.strictEqual(item.precision, 'day');
});

check('連續日子 17-18Apr2027 解做範圍', () => {
  const r = ctx.saveKeyDate_(dc, { title: 'HKIR Retreat', dateText: '17-18Apr2027' });
  const item = ctx.getKeyDates_(dc).data.items.find(i => i.id === r.data.id);
  assert.strictEqual(item.startDate, '2027-04-17');
  assert.strictEqual(item.endDate, '2027-04-18');
});

check('只知年份 2027 → 全年範圍', () => {
  const r = ctx.saveKeyDate_(dc, { title: '區大露營', dateText: '2027' });
  const item = ctx.getKeyDates_(dc).data.items.find(i => i.id === r.data.id);
  assert.strictEqual(item.precision, 'year');
  assert.strictEqual(item.startDate, '2027-01-01');
  assert.strictEqual(item.endDate, '2027-12-31');
});

check('解唔到嘅日期（待定）照收，排最後', () => {
  const r = ctx.saveKeyDate_(dc, { title: '區執委會會議', dateText: '待定' });
  assert.strictEqual(r.ok, true, r.error);
  const items = ctx.getKeyDates_(dc).data.items;
  assert.strictEqual(items[items.length - 1].title, '區執委會會議');
  assert.strictEqual(items[items.length - 1].startDate, '');
  assert.strictEqual(items[items.length - 1].precision, 'none');
});

check('ISO 同中文日期都收', () => {
  const a = ctx.saveKeyDate_(dc, { title: 'ISO', dateText: '2026-11-24' });
  const b = ctx.saveKeyDate_(dc, { title: '中文', dateText: '2027年3月23日' });
  const items = ctx.getKeyDates_(dc).data.items;
  assert.strictEqual(items.find(i => i.id === a.data.id).startDate, '2026-11-24');
  assert.strictEqual(items.find(i => i.id === b.data.id).startDate, '2027-03-23');
});

check('一格多個日期：後台只取第一個（前端負責拆開逐項送）', () => {
  const r = ctx.saveKeyDate_(dc, { title: '多日期', dateText: '9Nov2026 2Mar2027' });
  const item = ctx.getKeyDates_(dc).data.items.find(i => i.id === r.data.id);
  assert.strictEqual(item.startDate, '2026-11-09');
  assert.strictEqual(item.dateText, '9Nov2026');
});

check('按日期由早到遲排好', () => {
  const dated = Array.from(ctx.getKeyDates_(dc).data.items).filter(i => i.startDate).map(i => String(i.startDate));
  assert.strictEqual(dated.join('|'), dated.slice().sort().join('|'));
});

check('活動名／日期必填；過長拒絕', () => {
  assert.strictEqual(ctx.saveKeyDate_(dc, { title: '', dateText: '9Nov2026' }).ok, false);
  assert.strictEqual(ctx.saveKeyDate_(dc, { title: 'x', dateText: '' }).ok, false);
  assert.strictEqual(ctx.saveKeyDate_(dc, { title: 'x'.repeat(121), dateText: '9Nov2026' }).ok, false);
});

check('直接喺 Sheet 加行（只填 dateText）都排得返', () => {
  ctx.appendRowObj_(sheets.KeyDates, {
    id: 'manual-1', districtCode: 'SKW', title: '手動加嘅會議', dateText: '10Nov2026', active: 'TRUE',
  });
  const item = ctx.getKeyDates_(dc).data.items.find(i => i.id === 'manual-1');
  assert.strictEqual(item.startDate, '2026-11-10');
  assert.strictEqual(item.precision, 'day');
  // 唔會回寫落 Sheet（只係讀嗰陣補）
  const head = sheets.KeyDates._data[0];
  const row = sheets.KeyDates._data.find(r => r[0] === 'manual-1');
  assert.strictEqual(row[head.indexOf('startDate')], '');
});

check('DDC 刪得、ADC 刪唔到', () => {
  const tmp = ctx.saveKeyDate_(ddc, { title: '暫時', dateText: '1Jan2028' }).data.id;
  assert.strictEqual(ctx.deleteKeyDate_(adc, tmp).ok, false);
  assert.strictEqual(ctx.deleteKeyDate_(ddc, tmp).ok, true);
});

// ───────────────────────── 🗓️ 區會行事曆 ─────────────────────────

console.log('\n🗓️ 區會行事曆（Teamup 為主資料來源）');

let eventId = '';
let currentVersion = '';
check('子日曆清單後端讀取；借場三個子日曆不能選，專用子日曆可設定', () => {
  const options = ctx.getDistrictCalendarSubcalendars_(dc);
  assert.strictEqual(options.ok, true);
  assert.strictEqual(options.data.items.length, 4);
  assert.deepStrictEqual(Array.from(options.data.excludedIds), ['1001', '1002', '1003']);
  assert.strictEqual(ctx.saveDistrictCalendarSubcalendar_(dc, '1001').ok, false);
  assert.strictEqual(ctx.saveDistrictCalendarSubcalendar_(dc, '1004').ok, true);
  assert.strictEqual(ctx.getConfigValue_('TEAMUP_DISTRICT_SUBCAL_ID'), '1004');
  assert.strictEqual(ctx.saveDistrictCalendarSubcalendar_(adc, '1004').ok, false, 'ADC 不可更改日曆設定');
});

check('Teamup 活動讀取以指定專用子日曆為範圍；權限由後端回傳', () => {
  const board = ctx.getDistrictEvents_(adc, '2027-04-01', '2027-04-30');
  assert.strictEqual(board.ok, true);
  assert.strictEqual(board.data.access, 'view');
  assert.strictEqual(board.data.configured, true);
  assert.strictEqual(board.data.source, 'teamup');
  assert.strictEqual(board.data.canCreate, true);
  assert.strictEqual(board.data.canEdit, false);
  assert.strictEqual(board.data.items.length, 0);
  assert.ok(!JSON.stringify(board).includes('unit-test-token'), 'Teamup API Token 絕不可出現在 API response');
  assert.strictEqual(observedTeamupToken, 'unit-test-token', 'Teamup Token 只應由 server-side header 使用');
});

check('ADC 新增活動會直接 POST 到 Teamup；Token 留在 server-side header', () => {
  const created = ctx.saveDistrictEvent_(adc, { title: '區會會議', startDate: '2027-04-17', endDate: '2027-04-17', startTime: '19:00', endTime: '21:00', location: '區總部', category: '會議', description: '測試議程' });
  assert.strictEqual(created.ok, true, created.error); eventId = created.data.id;
  assert.ok(eventId.startsWith('tu-'));
  const saved = teamupEvents.get(eventId);
  assert.strictEqual(saved.subcalendar_ids[0], 1004);
  assert.strictEqual(saved.title, '區會會議');
  assert.strictEqual(saved.location, '區總部');
  assert.strictEqual(saved.notes.includes('測試議程'), true);
  const board = ctx.getDistrictEvents_(adc, '2027-04-01', '2027-04-30');
  assert.strictEqual(board.data.items[0].id, eventId);
  assert.strictEqual(board.data.items[0].category, '會議');
  assert.strictEqual(board.data.items[0].description, '測試議程');
  currentVersion = board.data.items[0].updatedAt;
  assert.ok(currentVersion);
});

check('ADC 不能修改／刪除；DDC 可更新 Teamup，並拒絕過期版本覆寫', () => {
  const patch = { id: eventId, expectedUpdatedAt: currentVersion, title: '改名', startDate: '2027-04-17', endDate: '2027-04-17', startTime: '19:00', endTime: '21:00', category: '會議' };
  assert.strictEqual(ctx.saveDistrictEvent_(adc, patch).ok, false);
  assert.strictEqual(ctx.deleteDistrictEvent_(adc, eventId, currentVersion).ok, false);
  const updated = ctx.saveDistrictEvent_(ddc, patch);
  assert.strictEqual(updated.ok, true, updated.error);
  assert.strictEqual(teamupEvents.get(eventId).title, '改名');
  const board = ctx.getDistrictEvents_(ddc, '2027-04-01', '2027-04-30');
  assert.strictEqual(board.data.items[0].title, '改名');
  const freshVersion = board.data.items[0].updatedAt;
  assert.notStrictEqual(freshVersion, currentVersion);
  assert.strictEqual(ctx.saveDistrictEvent_(ddc, { ...patch, title: '舊版本覆寫', expectedUpdatedAt: currentVersion }).ok, false);
  assert.strictEqual(teamupEvents.get(eventId).title, '改名');
  currentVersion = freshVersion;
});

check('區職員可修改／刪除但不可新增；領袖不可新增；成功操作 append-only 審計並串 hash', () => {
  assert.strictEqual(ctx.saveDistrictEvent_(staff, { title: '職員不應新增', startDate: '2027-05-02', endDate: '2027-05-02', allDay: true }).ok, false);
  const staffEdit = ctx.saveDistrictEvent_(staff, { id: eventId, expectedUpdatedAt: currentVersion, title: '職員修改', startDate: '2027-04-17', endDate: '2027-04-17', startTime: '19:00', endTime: '21:00' });
  assert.strictEqual(staffEdit.ok, true, staffEdit.error);
  currentVersion = ctx.getDistrictEvents_(ddc, '2027-04-01', '2027-04-30').data.items[0].updatedAt;
  assert.strictEqual(ctx.deleteDistrictEvent_(staff, eventId, currentVersion).ok, true);
  assert.strictEqual(ctx.saveDistrictEvent_(al, { title: '領袖不應新增', startDate: '2027-05-02', endDate: '2027-05-02', allDay: true }).ok, false);
  const rows = sheets.DistrictCalendarAudit._data.slice(1);
  assert.ok(rows.some(r => r[1] === eventId && r[2] === 'create' && r[3] === 'adc@x.org'));
  assert.ok(rows.some(r => r[1] === eventId && r[2] === 'update' && r[3] === 'ddc@x.org'));
  assert.ok(rows.some(r => r[1] === eventId && r[2] === 'update' && r[3] === 'staff@x.org'));
  const deletes = rows.filter(r => r[2] === 'delete');
  assert.strictEqual(deletes[deletes.length - 1][3], 'staff@x.org');
  assert.ok(rows.some(r => r[2] === 'create' && !r[5] && r[6]), 'create records afterHash only');
  assert.ok(rows.some(r => r[2] === 'update' && r[5] && r[6]), 'update records beforeHash and afterHash');
  assert.ok(rows.some(r => r[2] === 'delete' && r[5] && !r[6]), 'delete records beforeHash only');
  for (let i = 1; i < rows.length; i++) assert.strictEqual(rows[i][7], rows[i - 1][8], 'hash chain previousHash must link');
  assert.ok(!teamupEvents.has(eventId), 'delete must call Teamup DELETE');
});

check('日期／欄位驗證後端執行，借場子日曆重疊時 fail closed', () => {
  assert.strictEqual(ctx.saveDistrictEvent_(adc, { title: '', startDate: '2027-01-01', endDate: '2027-01-01', allDay: true }).ok, false);
  assert.strictEqual(ctx.saveDistrictEvent_(adc, { title: 'x', startDate: '2027-02-30', endDate: '2027-02-30', allDay: true }).ok, false);
  assert.strictEqual(ctx.saveDistrictEvent_(adc, { title: 'x', startDate: '2027-01-02', endDate: '2027-01-01', allDay: true }).ok, false);
  ctx.setConfigTextValue_('TEAMUP_DISTRICT_SUBCAL_ID', '1001', 'test');
  assert.strictEqual(ctx.getDistrictEvents_(adc, '2027-04-01', '2027-04-30').ok, false);
  assert.strictEqual(ctx.saveDistrictEvent_(adc, { title: '不應寫入', startDate: '2027-05-01', endDate: '2027-05-01', allDay: true }).ok, false);
  ctx.setConfigTextValue_('TEAMUP_DISTRICT_SUBCAL_ID', '1004', 'test');
});

// ───────────────────────── 🔢 實體密碼 ─────────────────────────

console.log('\n🔢 實體密碼（passcodes）');

let pcId = '';
check('DDC 可以加；ADC 唔可以加但睇得到', () => {
  const r = ctx.savePasscode_(ddc, { name: '1802 房門', code: '1802#', location: '地域總部 18 樓' });
  assert.strictEqual(r.ok, true, r.error);
  pcId = r.data.id;
  assert.strictEqual(ctx.savePasscode_(adc, { name: 'x', code: '1234' }).ok, false);
  const view = ctx.getPasscodes_(adc);
  assert.strictEqual(view.data.access, 'view');
  assert.strictEqual(view.data.items[0].code, '1802#');
});

check('全部已登入職員（連 AL）都睇到', () => {
  const r = ctx.getPasscodes_(al);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.items.length, 1);
});

check('擋低網上帳戶密碼：電郵／網址格式嘅 code 拒絕', () => {
  assert.strictEqual(ctx.savePasscode_(dc, { name: 'Gmail', code: 'adc@skwscout.org.hk' }).ok, false);
  assert.strictEqual(ctx.savePasscode_(dc, { name: '網站', code: 'https://ymis.scout.org.hk' }).ok, false);
});

check('名稱／密碼必填；過長拒絕', () => {
  assert.strictEqual(ctx.savePasscode_(dc, { name: '', code: '1234' }).ok, false);
  assert.strictEqual(ctx.savePasscode_(dc, { name: 'x', code: '' }).ok, false);
  assert.strictEqual(ctx.savePasscode_(dc, { name: 'x', code: 'y'.repeat(61) }).ok, false);
});

check('按位置→排序→名稱排好', () => {
  ctx.savePasscode_(dc, { name: '影印機', code: '2468', location: '地域總部 18 樓', order: 2 });
  ctx.savePasscode_(dc, { name: '物資倉', code: '1357', location: '區總部', order: 1 });
  const items = ctx.getPasscodes_(dc).data.items;
  assert.strictEqual(items.map(i => i.location).join('|'), '區總部|地域總部 18 樓|地域總部 18 樓');
  assert.strictEqual(
    items.filter(i => i.location === '地域總部 18 樓').map(i => i.name).join('|'),
    '1802 房門|影印機',
  );
});

check('更新密碼寫低更新人同時間', () => {
  const r = ctx.savePasscode_(dc, { id: pcId, name: '1802 房門', code: '1803#' });
  assert.strictEqual(r.ok, true, r.error);
  const item = ctx.getPasscodes_(dc).data.items.find(i => i.id === pcId);
  assert.strictEqual(item.code, '1803#');
  assert.strictEqual(item.updatedBy, 'dc@x.org');
  assert.ok(item.updatedAt);
});

check('STAFF 刪唔到；DC 刪得', () => {
  assert.strictEqual(ctx.deletePasscode_(staff, pcId).ok, false);
  assert.strictEqual(ctx.deletePasscode_(dc, pcId).ok, true);
  assert.ok(!ctx.getPasscodes_(dc).data.items.some(i => i.id === pcId));
});

// ───────────────────────── 卡片／路由 ─────────────────────────

console.log('\n🧭 卡片清單同路由');

check('getCards_ 新卡都會回，access 跟角色', () => {
  const forDc = ctx.getCards_(dc).data;
  const forAl = ctx.getCards_(al).data;
  const pick = (list, id) => list.find(c => c.cardId === id);
  assert.strictEqual(pick(forDc, 'links').access, 'edit');
  assert.strictEqual(pick(forDc, 'keyDates').access, 'edit');
  assert.strictEqual(pick(forDc, 'passcodes').access, 'edit');
  assert.strictEqual(pick(forDc, 'districtCalendar').access, 'edit');
  assert.strictEqual(pick(forAl, 'links').access, 'view');
  assert.strictEqual(pick(forAl, 'keyDates').access, 'view');
  assert.strictEqual(pick(forAl, 'passcodes').access, 'view');
  assert.strictEqual(pick(forAl, 'districtCalendar').access, 'view');
  assert.strictEqual(pick(forDc, 'links').url, '/links');
  assert.strictEqual(pick(forDc, 'keyDates').url, '/key-dates');
  assert.strictEqual(pick(forDc, 'passcodes').url, '/passcodes');
  assert.strictEqual(pick(forDc, 'districtCalendar').url, '/district-calendar');
  // 新卡均係真卡（唔係子權限偽卡）
  ['links', 'keyDates', 'passcodes', 'districtCalendar'].forEach(id => assert.ok(!pick(forDc, id).subPerm));
});

check('doGet／doPost 路由駁通', () => {
  const apiKey = 'links-test-api-key';
  sheets.Config.appendRow(['API_KEY_HASH', ctx.sha256_(apiKey), 'test only']);
  const get = ctx.doGet({ parameter: { apiKey, action: 'getKeyDates', token: dc } });
  assert.strictEqual(JSON.parse(get).ok, true);
  const calendarGet = ctx.doGet({ parameter: { apiKey, action: 'getDistrictEvents', token: adc, from: '2027-06-01', to: '2027-06-30' } });
  assert.strictEqual(JSON.parse(calendarGet).ok, true);
  const post = ctx.doPost({
    parameter: {},
    postData: { contents: JSON.stringify({ apiKey, action: 'saveLink', token: dc, link: { title: '路由測試', url: 'https://route.org' } }) },
  });
  assert.strictEqual(JSON.parse(post).ok, true);
  const del = ctx.doPost({
    parameter: {},
    postData: { contents: JSON.stringify({ apiKey, action: 'deleteLink', token: dc, id: JSON.parse(post).data.id }) },
  });
  assert.strictEqual(JSON.parse(del).ok, true);
  const calendar = ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify({ apiKey, action: 'saveDistrictEvent', token: adc, event: { title: '路由活動', startDate: '2027-06-01', endDate: '2027-06-01', allDay: true } }) } });
  const calendarResult = JSON.parse(calendar);
  assert.strictEqual(calendarResult.ok, true, calendarResult.error);
  const calendarBoard = JSON.parse(ctx.doGet({ parameter: { apiKey, action: 'getDistrictEvents', token: ddc, from: '2027-06-01', to: '2027-06-30' } }));
  const routeVersion = calendarBoard.data.items.find(e => e.id === calendarResult.data.id).updatedAt;
  const calendarDelete = ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify({ apiKey, action: 'deleteDistrictEvent', token: ddc, id: calendarResult.data.id, expectedUpdatedAt: routeVersion }) } });
  assert.strictEqual(JSON.parse(calendarDelete).ok, true);
});

check('新日曆 action 唔會喺公開（免登入）路由出現', () => {
  const apiKey = 'links-test-api-key';
  ['getLinks', 'getKeyDates', 'getPasscodes', 'getDistrictEvents'].forEach(action => {
    const r = JSON.parse(ctx.doGet({ parameter: { apiKey, action } }));
    assert.strictEqual(r.ok, false, `${action} 無 token 竟然通過`);
  });
});

console.log(`\n全部通過（${pass} 項）✓\n`);
