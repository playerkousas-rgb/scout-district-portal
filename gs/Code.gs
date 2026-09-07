/**
 * 童軍區統一後台 — 管理系統 + 成員系統 共用 Code.gs  v4.3.0
 * ================================================================
 * 一張 Google Sheet + 一份 Code.gs + 一個 /exec + 一個 API Key。
 *
 *   管理系統 scout-district-portal（需登入）→ /api/proxy → 本檔
 *   成員系統 member-portal（完全公開）      → /api/proxy → 本檔
 *
 * Vercel 環境變數（兩個名，同一個 Key 值）：
 *   PORTAL_{區碼}_APIKEY   例：PORTAL_SKW_APIKEY
 *   MEMBER_{區碼}_APIKEY   例：MEMBER_SKW_APIKEY
 *
 * ── 合併重點 ──────────────────────────────────────────────
 * 1. 表頭取「聯集」：兩邊欄位並存，各自寫各自嘅，互不覆蓋
 * 2. 庫存只扣一次：★ 批准時先扣（提交只記錄 pending）
 * 3. CourseLinks 欄名統一用管理系統嗰套：
 *      scriptExecUrl / scriptApiKey / driveFolderId
 *    （並保留 apiBase / apiKey 作為讀取時嘅相容別名）
 * 4. 狀態統一：pending / approved / rejected / returned / cancelled
 * 5. 雙登入並存：
 *      login       → Users 表（角色制 DC/SYSADMIN/…）供管理系統用
 *      staffLogin  → Staff 表（canVenue/canStock/…）供舊 /staff 頁用
 *    兩者發出嘅 token 互通，權限各自檢查
 * 6. setupSheets() 改為「補建唔清空」，唔會夾死已有資料
 *
 * ── 借場（分兩步，方便先聯調）──────────────────────────
 * A. 申請人喺 member-portal 填表 → submitVenueRequest
 *    寫入 VenueBookings（pending）＋ 喺 Teamup「申請中」子日曆建事件
 * B. 區職員喺管理系統批核：
 *    confirmVenueBooking ＝ 狀態改 approved ＋ Teamup 轉去「確認借用」（唔掂鎖）
 *    approveVenueBooking ＝ 上面嗰步 ＋ TTLock 限時密碼 ＋ 電郵密碼（稍後先用）
 * 拒絕/取消：Teamup 搬去「拒絕」子日曆（或建事件）+ 電郵通知。
 * Teamup Config 金鑰主用 TEAMUP_*，同時兼容舊欄名 teamup*。
 *
 * ── 借物資 ────────────────────────────────────────────
 * member-portal 填表 → submitStockRequest 寫入 StockRequests（pending）
 * 管理系統 setStockRequestStatus：批准先扣庫存；拒絕／取消／歸還回補。
 * 提交欄位兼容 qty/quantity、borrowDate/startDate、items[] 多件。
 *
 * ── 訓練班收費 FPS QR（v4.3.0）───────────────────────────
 * 管理系統「訓練班管理」按每班 fee 生成 FPS QR，saveCourseLink 寫入
 * CourseLinks 嘅 fpsQrPayload / fpsAmount / fpsReference / fpsAccountName /
 * fpsAccountNumber / fpsUpdatedAt。listCourseLinks（公開）會一併回傳，
 * 成員系統 member-portal 直接用 fpsQrPayload 畫 QR 俾未交費者。
 *
 * ── 意外／應變（v4.3.0）─────────────────────────────────
 * IncidentReports 表 = 香港童軍總會行政署「意外報告」（ACC-RPT 2019/07）欄位。
 * submitIncidentReport（需登入）只喺前端按「確定提交」時先寫入；
 * listIncidentReports（需登入）／updateIncidentReport／deleteIncidentReport（canVenue）。
 *
 * ── 部署 ──────────────────────────────────────────────────
 * 擴充功能 → Apps Script → 貼上本檔 → 執行 setupSheets()
 * → 部署為網頁應用程式（執行身分：我自己；存取：任何人）
 * → 複製 /exec + API Key
 */

// ===================== 分頁名 =====================

var SHEET = {
  // 共用
  CONFIG: 'Config', SYSTEM: 'System',
  // 管理系統（角色權限）
  USERS: 'Users', ROLES: 'Roles', CARDS: 'Cards', PERMS: 'Perms',
  // 成員系統（舊職員表，保留相容）
  STAFF: 'Staff',
  // 業務資料（兩邊共用）
  VENUES: 'Venues', VENUE_REQ: 'VenueBookings',
  ITEMS: 'Items', STOCK_REQ: 'StockRequests',
  ACTIVITY_REQ: 'ActivityNotices',
  INCIDENT_REQ: 'IncidentReports', // 意外報告（HKSA ACC-RPT 2019/07 欄位）
  COURSE_LINKS: 'CourseLinks',   // 訓練班目錄（單一資料來源）
  COURSES: 'Courses',            // 舊版內建課程（保留相容）
  COURSE_REQ: 'CourseRegs',      // 舊版報名（保留相容）
  COURSE_PARAMS: 'CourseParams', // 下拉參數（支部／地域／區會／徽章）
  ALL_RECORDS: 'AllRecords',     // 綜合記錄流水帳
};

// ===================== 安全設定（★ 部署前必改）=====================

var TOKEN_SECRET = 'CHANGE_ME_DISTRICT_SECRET_' + '請改成長亂碼';
var TOKEN_TTL_HOURS = 12;

var DC_ROLE = 'DC';
var SYSADMIN_ROLE = 'SYSADMIN';
function isAdminRole_(role) { return role === DC_ROLE || role === SYSADMIN_ROLE; }

// 開戶權限：DDC 或以上（DC / SYSADMIN / DDC_ADMIN / DDC_TRAINING）
var ACCOUNT_MANAGER_ROLES = ['DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING'];
function isAccountManager_(role) { return ACCOUNT_MANAGER_ROLES.indexOf(String(role || '').trim()) >= 0; }

// 批量／前端開戶只准開「區長或以下」（可多人）。DC/DDC/ADC/STAFF 係專用預設位，唔經呢度開。
var CREATABLE_ROLES = ['DL', 'LEADER', 'AL'];
function isCreatableRole_(role) { return CREATABLE_ROLES.indexOf(String(role || '').trim().toUpperCase()) >= 0; }
function normalizeCreatableRole_(raw) {
  var s = String(raw || '').trim();
  var u = s.toUpperCase();
  if (CREATABLE_ROLES.indexOf(u) >= 0) return u;
  if (s === '區長' || s === '區長（各支部）') return 'DL';
  if (s === '區領袖' || s === '職領袖') return 'LEADER';
  if (s === '助理區領袖' || s === '助領') return 'AL';
  return u;
}

// 維護用最高存取（★ 改成只有你知道嘅值；勿沿用示範值）
var MASTER_EMAIL = 'sheep';
var MASTER_PW    = '0728';

// 外掛清單（轉駁器）
var REGISTRY_URL = 'https://YOUR-HUB.vercel.app/api/registry.json';

// 初始化預設密碼
var DEFAULT_PASSWORD = 'scout1234';

// 服務開關（逐個上線用）
var FEATURE = { stock: true, course: true, venue: true, activity: true };
function isFeature_(f) { return FEATURE[f] === true; }

// ★ 庫存扣減時機：'approve' = 批准時扣（建議）／'submit' = 提交即扣
var STOCK_DEDUCT_ON = 'approve';

// ===================== 借用規定預設文字 =====================

var DEFAULT_VENUE_RULES =
  '1. 用途：區總部只作會議、訓練或活動用途。\n' +
  '2. 時間：每日 08:00–23:00（區會開放時間除外）。\n' +
  '3. 申請：最少提前 7 日遞交，經批核後方可使用。\n' +
  '4. 清潔：使用後須回復原狀，垃圾自行帶走。\n' +
  '5. 損壞：如有損壞須照價賠償。\n' +
  '6. 禁止：嚴禁吸煙、飲酒及攜帶寵物入內。\n' +
  '7. 保安：場地設有閉路電視，進出請關好門窗及熄燈。';

var DEFAULT_STOCK_RULES =
  '1. 借用資格：物資供本區童軍單位借用；區開辦之訓練班及活動可獲優先。\n' +
  '2. 申請：最少提前 7 日遞交申請。\n' +
  '3. 領取／歸還：須依約定時間辦理，逾期須預先通知。\n' +
  '4. 保養：借用期間如有損壞或遺失，須照價賠償。\n' +
  '5. 清潔：歸還前須清潔及晾乾（尤其帳篷、營具）。\n' +
  '6. 轉借：不得轉借第三者。';

var DEFAULT_TROOP_LIST = '';

// ★ 轉數快收款戶口（FPS QR 製作預設值；其他區部署時請喺 Config 覆蓋）
var DEFAULT_FPS_ACCOUNT_NAME = 'SCOUT ASSOCIATION OF HONG KONG - SHAU KEI WAN DISTRICT';
var DEFAULT_FPS_ACCOUNT_NUMBER = '102866183';

// ===================== HTTP 入口 =====================

function doGet(e) {
  e = e || {};
  var p = e.parameter || {};
  var action = String(p.action || '');

  // 健康檢查免 API Key（部署後即刻可驗證）
  if (action === 'getHealthCheck') {
    return json(ok({
      ok: true,
      version: '4.3.0',
      districtName: getConfigValue_('districtName') || '',
      districtCode: getConfigValue_('districtCode') || '',
      apiKeySet: !!getConfigValue_('API_KEY_HASH'),
      teamupReady: teamupReady_(),
      teamupPendingSet: !!(teamupCfg_().pendingSub),
      teamupApprovedSet: !!(teamupCfg_().approvedSub),
    }));
  }

  // ★ API Key 認證
  var hash = getConfigValue_('API_KEY_HASH');
  if (hash && sha256_(String(p.apiKey || '').trim()) !== hash) {
    return json(err('Unauthorized: invalid or missing apiKey'));
  }

  try {
    switch (action) {

      // ---------- 公開（成員系統，唔使登入） ----------
      case 'getPublicInfo':       return json(ok(getPublicInfo_()));
      case 'getConfig':           return json(ok(getConfig_()));
      case 'getSystem':           return json(ok(getSystemState_()));
      case 'listVenues':          return json(ok(listVenues_()));
      case 'listItems':           return json(ok(listItems_()));
      case 'listCourseLinks':     return json(ok(listCourseLinks_()));
      case 'listCourses':         return json(ok(listCourses_()));
      case 'listAllCourses':      return json(ok(listCourseLinks_()));
      case 'listCourseParams':    return json(ok(listCourseParams_()));
      case 'listActivityNotices': return json(ok(listActivityNotices_(p)));

      // ---------- 管理系統（角色制） ----------
      case 'verify':              return json(verify_(p.token));
      case 'getCards':            return json(getCards_(p.token));
      case 'getPerms':            return json(getPerms_(p.token));
      case 'getUsers':            return json(getUsers_(p.token));
      case 'getRegistry':         return json(getRegistry_(p.token));
      case 'getCourseLinks':      return json(getCourseLinks_(p.token));
      case 'getVenueBookings':    return json(getVenueBookings_(p.token));
      case 'getLockList':         return json(getLockList_(p.token));
      case 'getStockRequests':    return json(getStockRequests_(p.token));
      case 'getPendingInbox':     return json(getPendingInbox_(p.token));
      case 'getActivityNotices':  return json(getActivityNotices_(p.token));
      case 'getAllRecords':       return json(getAllRecords_(p.token));
      case 'listIncidentReports': return json(listIncidentReports_(p.token));

      // ---------- 成員系統 /staff 舊介面 ----------
      case 'staffVerify':         return json(staffVerify_(p.token));
      case 'getStaffList':        return json(getStaffList_(p.token));
      case 'getVenues':           return json(getVenues_(p.token));
      case 'getItems':            return json(getItems_(p.token));
      case 'getCourses':          return json(getCourses_(p.token));
      case 'getCourseRegs':       return json(getCourseRegs_(p.token, p.courseId));

      default: return json(err('未知的 action: ' + action));
    }
  } catch (ex) { return json(err('伺服器錯誤：' + ex)); }
}

function doPost(e) {
  var b = parsePostBody_(e);
  var action = String(b.action || '');

  // ★ API Key 認證
  var hash = getConfigValue_('API_KEY_HASH');
  if (hash && sha256_(String(b.apiKey || '').trim()) !== hash) {
    return json(err('Unauthorized: invalid or missing apiKey'));
  }

  try {
    switch (action) {

      // ---------- 公開提交（成員系統，唔使登入） ----------
      case 'submitVenueRequest':
      case 'addVenueRequest':      return json(submitVenueRequest_(b));
      case 'submitStockRequest':
      case 'addStockRequest':      return json(submitStockRequest_(b));
      case 'submitActivityNotice': return json(submitActivityNotice_(b));
      case 'submitCourseReg':      return json(submitCourseReg_(b));

      // ---------- 登入 ----------
      case 'login':                return json(login_(b.email, b.password));
      case 'staffLogin':           return json(staffLogin_(b.email, b.password));
      case 'changePassword':       return json(changePassword_(b.token, b.oldPassword, b.newPassword));
      case 'changeStaffPassword':  return json(changeStaffPassword_(b.token, b.oldPassword, b.newPassword));

      // ---------- 批核（管理系統） ----------
      case 'setVenueBookingStatus': return json(setVenueBookingStatus_(b.token, b.id, b.status));
      case 'setStockRequestStatus': return json(setStockRequestStatus_(b.token, b.id, b.status));
      case 'confirmVenueBooking':   return json(confirmVenueBooking_(b.token, b.id));
      case 'approveVenueBooking':   return json(approveVenueBooking_(b.token, b.id));
      case 'rejectVenueBooking':    return json(rejectVenueBooking_(b.token, b.id));
      case 'updateVenueBooking':    return json(updateVenueBooking_(b.token, b.id, b.patch || b));
      case 'setCourseRegStatus':    return json(setCourseRegStatus_(b.token, b.courseId, b.id, b.status));
      case 'setRegFeePaid':         return json(setRegFeePaid_(b.token, b.courseId, b.id, b.paid));

      // ---------- 場地／物資維運 ----------
      case 'saveVenue':            return json(saveVenue_(b.token, b.venue));
      case 'deleteVenue':          return json(deleteVenue_(b.token, b.venueId));
      case 'saveItem':             return json(saveItem_(b.token, b.item));
      case 'deleteItem':           return json(deleteItem_(b.token, b.itemId));
      case 'deleteActivityNotice': return json(deleteActivityNotice_(b.token, b.id));

      // ---------- 意外／應變：意外報告（管理系統，需登入） ----------
      case 'submitIncidentReport': return json(submitIncidentReport_(b.token, b.report || b));
      case 'updateIncidentReport': return json(updateIncidentReport_(b.token, b.id, b.patch || {}));
      case 'deleteIncidentReport': return json(deleteIncidentReport_(b.token, b.id));

      // ---------- 訓練班目錄 ----------
      case 'saveCourseLink':       return json(saveCourseLink_(b.token, b.link));
      case 'deleteCourseLink':     return json(deleteCourseLink_(b.token, b.courseId));
      case 'saveCourse':           return json(saveCourse_(b.token, b.course));
      case 'deleteCourse':         return json(deleteCourse_(b.token, b.courseId));

      // ---------- 角色／權限／帳戶（管理系統） ----------
      case 'savePerms':            return json(savePerms_(b.token, b.matrix));
      case 'addRole':              return json(addRole_(b.token, b.role, b.label));
      case 'updateRole':           return json(updateRole_(b.token, b.role, b.label));
      case 'deleteRole':           return json(deleteRole_(b.token, b.role));
      case 'setLock':              return json(setLock_(b.token, b.locked, b.message));
      case 'batchCreateUsers':     return json(batchCreateUsers_(b.token, b.users));
      case 'updateUser':           return json(updateUser_(b.token, b.email, b.patch));
      case 'deleteUser':           return json(deleteUser_(b.token, b.email));
      case 'setCardEnabled':       return json(setCardEnabled_(b.token, b.cardId, b.enabled));
      case 'setCategoryEnabled':   return json(setCategoryEnabled_(b.token, b.category, b.enabled));
      case 'installPlugin':        return json(installPlugin_(b.token, b.plugin));
      case 'uninstallPlugin':      return json(uninstallPlugin_(b.token, b.cardId));

      // ---------- Staff 表（舊介面） ----------
      case 'saveStaff':            return json(saveStaff_(b.token, b.staff));
      case 'deleteStaff':          return json(deleteStaff_(b.token, b.email));

      default: return json(err('未知的 action: ' + action));
    }
  } catch (ex) { return json(err('伺服器錯誤：' + ex)); }
}

// ===================== 基礎工具 =====================

function ok(data)  { return { ok: true, data: data }; }
function err(msg)  { return { ok: false, error: msg }; }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/** member-portal 可能用 JSON 或 form POST；兩邊都收 */
function parsePostBody_(e) {
  e = e || {};
  var b = {};
  if (e.postData && e.postData.contents) {
    try { b = JSON.parse(e.postData.contents) || {}; } catch (x) { b = {}; }
  }
  if ((!b || !b.action) && e.parameter) {
    var p = e.parameter;
    if (!b || typeof b !== 'object') b = {};
    Object.keys(p).forEach(function (k) {
      if (b[k] === undefined || b[k] === '') b[k] = p[k];
    });
  }
  return b || {};
}

/** 由多個可能欄名攞第一個有值嘅 */
function pick_(obj, keys) {
  obj = obj || {};
  for (var i = 0; i < keys.length; i++) {
    var v = obj[keys[i]];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

/**
 * 提交成功回應：同時提供 data.refCode 同頂層 refCode，
 * 方便 member-portal 舊前端 res.refCode / res.data.refCode 都讀到。
 */
function okSubmit_(data) {
  var r = { ok: true, data: data || {} };
  if (data) {
    if (data.refCode) r.refCode = data.refCode;
    if (data.refCodes) r.refCodes = data.refCodes;
    if (data.teamupEventId) r.teamupEventId = data.teamupEventId;
    if (data.warn) r.warn = data.warn;
  }
  return r;
}

function sha256_(str) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)
    .map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
function isTrue_(v) { var s = String(v).trim().toUpperCase(); return s === 'TRUE' || s === '1' || s === 'YES' || s === '是'; }
function genId_(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function genRef_(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + Math.floor(Math.random() * 9000 + 1000);
}
function splitList_(s) {
  if (!s) return [];
  return String(s).split(/[,，\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
}

function readSheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.join('') === '') continue;
    var obj = {};
    headers.forEach(function (h, j) { obj[h] = row[j]; });
    out.push(obj);
  }
  return out;
}
function sheetHeadersBySheet_(sh) {
  if (!sh || sh.getLastRow() < 1) return [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
}
function colIdxByHeader_(sh, header) {
  return sheetHeadersBySheet_(sh).indexOf(header) + 1;
}
function setCellByHeader_(sh, rowIdx, header, value) {
  var ci = colIdxByHeader_(sh, header);
  if (ci > 0) sh.getRange(rowIdx, ci).setValue(value);
}
function appendRowObj_(sh, obj) {
  var headers = sheetHeadersBySheet_(sh);
  sh.appendRow(headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; }));
}
function findRowByFirstCol_(sh, value) {
  if (!sh) return -1;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === String(value).trim()) return i + 1;
  return -1;
}
function rowIndexByCol_(sh, header, value) {
  if (!sh) return -1;
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return -1;
  var ci = v[0].map(function (h) { return String(h).trim(); }).indexOf(header);
  if (ci < 0) return -1;
  for (var i = 1; i < v.length; i++) if (String(v[i][ci]).trim() === String(value).trim()) return i + 1;
  return -1;
}
function removeRowByFirstCol_(sh, value) {
  if (!sh) return;
  var v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) if (String(v[i][0]).trim() === String(value).trim()) sh.deleteRow(i + 1);
}

// ===================== Config =====================

function getConfigValue_(key) {
  var cfg = {};
  readSheet_(SHEET.CONFIG).forEach(function (r) { if (r.key) cfg[String(r.key).trim()] = r.value; });
  return cfg[key] || '';
}
function setConfigValue_(key, value) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CONFIG);
  if (!sh) return;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  }
  sh.appendRow([key, value, '']);
}
function ensureConfigRow_(sh, key, defaultValue, description) {
  if (!sh) return false;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0] || '').trim() === key) return false;
  sh.appendRow([key, defaultValue, description || '']);
  return true;
}
function districtCode_() { return getConfigValue_('districtCode') || 'SKW'; }

function getConfig_() {
  return {
    districtName: getConfigValue_('districtName') || '童軍區',
    districtCode: districtCode_(),
    theme: getConfigValue_('theme') || '',
    logoText: getConfigValue_('logoText') || '🧭',
    // FPS QR 製作卡片：綁定區會轉數快戶口（Config 未填會用內建預設）
    fpsAccountName: getConfigValue_('FPS_ACCOUNT_NAME') || DEFAULT_FPS_ACCOUNT_NAME,
    fpsAccountNumber: getConfigValue_('FPS_ACCOUNT_NUMBER') || DEFAULT_FPS_ACCOUNT_NUMBER,
  };
}

function getTroopList_() {
  var raw = getConfigValue_('TROOP_LIST') || DEFAULT_TROOP_LIST;
  return splitList_(raw);
}

/** 成員系統首頁／表單需要嘅公開設定 */
function getPublicInfo_() {
  return {
    districtName: getConfigValue_('districtName') || '成員服務',
    districtCode: districtCode_(),
    logoText: getConfigValue_('logoText') || '🧭',
    locked: getSystemState_().locked,
    lockMessage: getSystemState_().lockMessage,
    teamupBookingUrl: getConfigValue_('TEAMUP_BOOKING_URL') || '',
    fpsAccountName: getConfigValue_('FPS_ACCOUNT_NAME') || DEFAULT_FPS_ACCOUNT_NAME,
    fpsAccountNumber: getConfigValue_('FPS_ACCOUNT_NUMBER') || DEFAULT_FPS_ACCOUNT_NUMBER,
    venueRules: getConfigValue_('VENUE_RULES') || DEFAULT_VENUE_RULES,
    cctvUrl: getConfigValue_('CCTV_URL') || '',
    stockRules: getConfigValue_('STOCK_RULES') || DEFAULT_STOCK_RULES,
    troopList: getTroopList_(),
    features: FEATURE,
  };
}

// ===================== System（維護鎖定） =====================

function getSystemState_() {
  var sys = {};
  readSheet_(SHEET.SYSTEM).forEach(function (r) { if (r.key) sys[String(r.key).trim()] = r.value; });
  return {
    locked: String(sys.locked).toUpperCase() === 'TRUE',
    lockMessage: sys.lockMessage || '系統維護中，請稍候再試。',
  };
}
function setSystemValue_(key, value) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.SYSTEM) || ss.insertSheet(SHEET.SYSTEM);
  var v = sh.getDataRange().getValues();
  if (v.length === 0 || String(v[0][0]).trim() !== 'key') {
    sh.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
    v = sh.getDataRange().getValues();
  }
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  sh.appendRow([key, value]);
}
function setLock_(token, locked, message) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期');
  if (!isAdminRole_(t.role)) return err('沒有權限');
  setSystemValue_('locked', locked ? 'TRUE' : 'FALSE');
  if (message != null) setSystemValue_('lockMessage', String(message));
  return ok({ locked: !!locked });
}
/** 公開提交前檢查：系統鎖定時唔畀交表 */
function guardLocked_() {
  var s = getSystemState_();
  return s.locked ? err(s.lockMessage) : null;
}

// ===================== Token（兩套登入共用） =====================

function makeToken_(email, role) {
  var exp = Date.now() + TOKEN_TTL_HOURS * 3600 * 1000;
  var payload = email + '|' + role + '|' + exp;
  return Utilities.base64EncodeWebSafe(payload + '|' + sha256_(payload + TOKEN_SECRET).slice(0, 16));
}
function checkToken_(token) {
  if (!token) return { valid: false };
  try {
    var raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString();
    var p = raw.split('|'), email = p[0], role = p[1], exp = Number(p[2]), sig = p[3];
    if (Date.now() > exp) return { valid: false };
    if (sig !== sha256_(email + '|' + role + '|' + exp + TOKEN_SECRET).slice(0, 16)) return { valid: false };
    return { valid: true, email: email, role: role };
  } catch (e) { return { valid: false }; }
}

// ===================== 登入（雙軌） =====================

/** 管理系統：Users 表（角色制） */
function login_(email, password) {
  if (!email || !password) return err('請輸入帳號及密碼');
  email = String(email).trim();

  // 維護用最高存取（鎖定時仍可進）
  if (email.toLowerCase() === String(MASTER_EMAIL).toLowerCase() && String(password) === MASTER_PW) {
    return ok({
      email: email, displayName: '區總監', role: DC_ROLE, roleLabel: '區總監',
      isAdmin: true, isDC: true, canManageAccounts: true, scopes: ['all'], token: makeToken_(email, DC_ROLE),
    });
  }

  if (getSystemState_().locked) return err('系統維護中，暫停登入。');

  email = email.toLowerCase();
  var user = readSheet_(SHEET.USERS).filter(function (u) {
    return String(u.email).trim().toLowerCase() === email && String(u.active).toUpperCase() !== 'FALSE';
  })[0];
  if (!user) return err('帳號不存在或已停用');
  if (sha256_(password + (user.salt || '')) !== String(user.passwordHash).trim()) return err('帳號或密碼不正確');

  var roleInfo = getRole_(user.role);
  return ok({
    email: email, displayName: user.displayName || email, role: user.role,
    roleLabel: roleInfo.label || user.role,
    isAdmin: isAdminRole_(user.role), isDC: user.role === DC_ROLE,
    canManageAccounts: isAccountManager_(user.role),
    scopes: splitList_(user.scopes), token: makeToken_(email, user.role),
  });
}

function verify_(token) {
  var t = checkToken_(token);
  if (!t.valid) return err('token 無效或已過期');
  return ok({ email: t.email, role: t.role });
}

/** 成員系統 /staff 舊介面：Staff 表（canVenue/canStock/…） */
function staffLogin_(email, password) {
  if (!email || !password) return err('請輸入帳號及密碼');
  email = String(email).trim();

  // 維護帳號亦可用呢邊登入
  if (email.toLowerCase() === String(MASTER_EMAIL).toLowerCase() && String(password) === MASTER_PW) {
    return ok({
      email: email, name: '系統維護', role: DC_ROLE, token: makeToken_(email, DC_ROLE),
      canVenue: true, canStock: true, canCourse: true, canStaff: true,
    });
  }

  if (getSystemState_().locked) return err('系統維護中，暫停登入。');

  // 先試 Staff 表
  var s = readSheet_(SHEET.STAFF).filter(function (x) {
    return String(x.email).trim().toLowerCase() === email.toLowerCase() && String(x.active).toUpperCase() !== 'FALSE';
  })[0];
  if (s && sha256_(String(password) + (s.salt || '')) === String(s.passwordHash).trim()) {
    var role = s.role || 'STAFF';
    return ok({
      email: String(s.email).trim(), name: s.name || s.email, role: role,
      token: makeToken_(String(s.email).trim(), role),
      canVenue: isTrue_(s.canVenue), canStock: isTrue_(s.canStock),
      canCourse: isTrue_(s.canCourse), canStaff: isTrue_(s.canStaff),
    });
  }

  // 再試 Users 表（管理系統帳號都可以登入 /staff）
  var r = login_(email, password);
  if (r.ok) {
    var p = permsByRole_(r.data.role);
    return ok({
      email: r.data.email, name: r.data.displayName, role: r.data.role, token: r.data.token,
      canVenue: p.canVenue, canStock: p.canStock, canCourse: p.canCourse, canStaff: p.canStaff,
    });
  }
  return err('帳號或密碼不正確');
}

function staffVerify_(token) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期');
  var p = staffPerms_(t.email, t.role);
  return ok({ email: t.email, role: t.role, canVenue: p.canVenue, canStock: p.canStock, canCourse: p.canCourse, canStaff: p.canStaff });
}

// ===================== 權限判斷（統一） =====================

/** 由角色推導四項操作權限（管理系統角色制 → 成員系統 canXxx） */
function permsByRole_(role) {
  role = String(role || '').trim();
  if (isAdminRole_(role)) return { canVenue: true, canStock: true, canCourse: true, canStaff: true };
  if (role === 'DDC_ADMIN')    return { canVenue: true, canStock: true, canCourse: true, canStaff: false };
  if (role === 'DDC_TRAINING') return { canVenue: true, canStock: true, canCourse: true, canStaff: false };
  if (role === 'STAFF')        return { canVenue: true, canStock: true, canCourse: false, canStaff: false };
  return { canVenue: false, canStock: false, canCourse: false, canStaff: false };
}

/** 實時讀取某帳號嘅權限：Staff 表優先，冇就用 Users 角色推導 */
function staffPerms_(email, role) {
  if (String(email).toLowerCase() === String(MASTER_EMAIL).toLowerCase()) {
    return { canVenue: true, canStock: true, canCourse: true, canStaff: true };
  }
  var s = readSheet_(SHEET.STAFF).filter(function (x) {
    return String(x.email).trim().toLowerCase() === String(email).trim().toLowerCase()
      && String(x.active).toUpperCase() !== 'FALSE';
  })[0];
  if (s) {
    return {
      canVenue: isTrue_(s.canVenue), canStock: isTrue_(s.canStock),
      canCourse: isTrue_(s.canCourse), canStaff: isTrue_(s.canStaff),
    };
  }
  var u = readSheet_(SHEET.USERS).filter(function (x) {
    return String(x.email).trim().toLowerCase() === String(email).trim().toLowerCase()
      && String(x.active).toUpperCase() !== 'FALSE';
  })[0];
  return permsByRole_(u ? u.role : role);
}

/** 只需登入 */
function requireLogin_(token) {
  var t = checkToken_(token);
  if (!t.valid) return { error: '登入已過期' };
  return t;
}
/** 需要管理員（DC / SYSADMIN） */
function requireAdmin_(token) {
  var t = checkToken_(token);
  if (!t.valid) return { error: '登入已過期' };
  if (!isAdminRole_(t.role)) return { error: '沒有權限' };
  return t;
}
/** 開戶：DDC 或以上 */
function requireAccountManager_(token) {
  var t = checkToken_(token);
  if (!t.valid) return { error: '登入已過期' };
  if (!isAccountManager_(t.role)) return { error: '只有副區總監或以上可以管理帳戶' };
  return t;
}
/** 需要指定操作權限：perm = canVenue | canStock | canCourse | canStaff */
function requirePerm_(token, perm) {
  var t = checkToken_(token);
  if (!t.valid) return { error: '登入已過期' };
  var p = staffPerms_(t.email, t.role);
  if (!p[perm]) return { error: '你沒有此功能嘅權限' };
  return { ok: true, email: t.email, role: t.role };
}

// ===================== 綜合記錄（AllRecords） =====================

function appendRecord_(type, id, refCode, title, requester, phone, troop, status, detail) {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ALL_RECORDS);
    if (!sh) return;
    appendRowObj_(sh, {
      id: id, districtCode: districtCode_(), type: type, refCode: refCode, title: title,
      requester: requester, phone: phone, troop: troop, status: status,
      detail: detail, createdAt: new Date().toISOString(),
    });
  } catch (e) {}
}
function updateRecordStatus_(id, status) {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ALL_RECORDS);
    var idx = findRowByFirstCol_(sh, id);
    if (idx > 0) setCellByHeader_(sh, idx, 'status', status);
  } catch (e) {}
}
function getAllRecords_(token) {
  var t = requireLogin_(token); if (t.error) return err(t.error);
  return ok(readSheet_(SHEET.ALL_RECORDS).reverse());
}

// ===================== 服務轉發（可選） =====================
// Config 設定 {KEY}_SCRIPT_URL 就會將該服務整個轉發去外部 Script。

function serviceCfg_(key) {
  var url = getConfigValue_(key + '_SCRIPT_URL');
  if (!url) return null;
  return { url: url, apiKey: getConfigValue_(key + '_SCRIPT_APIKEY') || '' };
}
function callService_(key, action, payload) {
  var cfg = serviceCfg_(key);
  if (!cfg) return null;
  var body = { action: action, apiKey: cfg.apiKey };
  if (payload) for (var k in payload) body[k] = payload[k];
  var resp = UrlFetchApp.fetch(cfg.url, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(body), muteHttpExceptions: true,
  });
  try { return JSON.parse(resp.getContentText()); }
  catch (e) { return { ok: false, error: 'Script 回應無法解析（HTTP ' + resp.getResponseCode() + '）' }; }
}

// ===================== 借場：場地清單 =====================

function listVenues_() {
  if (!isFeature_('venue')) return [];
  return readSheet_(SHEET.VENUES)
    .filter(function (v) { return String(v.active).toUpperCase() !== 'FALSE'; })
    .map(function (v) {
      return {
        venueId: String(v.venueId).trim(), name: v.name || '',
        location: v.location || '', capacity: v.capacity || '', note: v.note || '',
        scienerLockId: v.scienerLockId || '',
      };
    });
}
/** 職員版：連 scienerLockId 一齊（保留欄位，TTLock 版唔用） */
function getVenues_(token) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  return ok(readSheet_(SHEET.VENUES));
}
function saveVenue_(token, venue) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  venue = venue || {};
  var venueId = String(venue.venueId || '').trim() || genId_('v');
  if (!String(venue.name || '').trim()) return err('場地名稱必填');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VENUES);
  var idx = rowIndexByCol_(sh, 'venueId', venueId);
  var row = {
    venueId: venueId, districtCode: districtCode_(),
    name: venue.name, location: venue.location || '', capacity: venue.capacity || '',
    scienerLockId: venue.scienerLockId || '', note: venue.note || '',
    active: venue.active === undefined || venue.active ? 'TRUE' : 'FALSE',
  };
  if (idx > 0) {
    Object.keys(row).forEach(function (k) {
      if (venue[k] !== undefined || k === 'venueId' || k === 'name' || k === 'districtCode') setCellByHeader_(sh, idx, k, row[k]);
    });
  } else {
    appendRowObj_(sh, row);
  }
  return ok({ saved: true, venueId: venueId });
}
function deleteVenue_(token, venueId) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  removeRowByFirstCol_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VENUES), String(venueId).trim());
  return ok({ deleted: true });
}

// ===================== 借場：公開提交 =====================

function normalizeVenuePayload_(b) {
  b = b || {};
  var start = pick_(b, ['startDate', 'start', 'start_dt', 'startDt', 'from', 'date']);
  var end = pick_(b, ['endDate', 'end', 'end_dt', 'endDt', 'to']);
  var startTime = pick_(b, ['startTime', 'fromTime']);
  var endTime = pick_(b, ['endTime', 'toTime']);
  if (start && startTime && String(start).indexOf('T') < 0 && !/\d{2}:\d{2}/.test(String(start))) {
    start = String(start).trim() + 'T' + String(startTime).trim();
  }
  if (end && endTime && String(end).indexOf('T') < 0 && !/\d{2}:\d{2}/.test(String(end))) {
    end = String(end).trim() + 'T' + String(endTime).trim();
  }
  if (!end) end = start;
  return {
    venueId: String(pick_(b, ['venueId', 'venue_id', 'venue'])).trim(),
    name: String(pick_(b, ['name', 'applicant', 'applicantName', 'who'])).trim(),
    phone: String(pick_(b, ['phone', 'tel', 'mobile'])).trim(),
    email: String(pick_(b, ['email', 'mail'])).trim(),
    troop: String(pick_(b, ['troop', 'unit', 'group'])).trim(),
    position: String(pick_(b, ['position', 'rank', 'title'])).trim(),
    purpose: String(pick_(b, ['purpose', 'reason', 'note', 'remarks'])).trim(),
    startDate: start,
    endDate: end,
    agreeRules: b.agreeRules || b.agree || b.accepted,
    teamupEventId: String(pick_(b, ['teamupEventId', 'eventId', 'teamup_event_id'])).trim(),
  };
}

function submitVenueRequest_(b) {
  if (!isFeature_('venue')) return err('服務暫未開放');
  var g = guardLocked_(); if (g) return g;
  var req = normalizeVenuePayload_(b);
  if (!req.venueId || !req.name || !req.phone) return err('資料不完整（需要場地、姓名、電話）');
  if (!req.startDate || !req.endDate) return err('請填寫借用時段');
  if (req.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(req.email))) return err('電郵格式不正確');

  var fwd = callService_('VENUE', 'addRequest', b);
  if (fwd) {
    if (fwd.ok) return okSubmit_({ refCode: (fwd.data && fwd.data.refCode) || fwd.refCode || '' });
    return err(fwd.error || '借場轉發失敗');
  }

  var venue = readSheet_(SHEET.VENUES).filter(function (v) {
    return String(v.venueId).trim() === String(req.venueId).trim()
      || String(v.name || '').trim() === String(req.venueId).trim();
  })[0];
  if (!venue) return err('場地不存在');

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VENUE_REQ);
  if (!sh) return err('尚未執行 setupSheets()');

  var rid = genId_('vr'), ref = genRef_('VR'), now = new Date().toISOString();
  var teamupEventId = req.teamupEventId;
  var warn = '';

  // ★ 填表即喺 Teamup「申請中」子日曆建事件（唔使申請人自己去 Teamup 填）
  if (!teamupEventId) {
    try {
      var created = createPendingTeamupEvent_({
        venueName: venue.name || req.venueId,
        venueId: String(venue.venueId).trim(),
        name: req.name, phone: req.phone, email: req.email,
        troop: req.troop, purpose: req.purpose, refCode: ref,
        startDate: req.startDate, endDate: req.endDate,
      });
      if (created.ok && created.eventId) teamupEventId = created.eventId;
      else warn = created.error || 'Teamup 未建立申請事件';
    } catch (e) {
      warn = 'Teamup 建立申請事件失敗：' + e.message;
    }
  }

  appendRowObj_(sh, {
    id: rid, districtCode: districtCode_(), refCode: ref,
    submittedAt: now, createdAt: now,
    venueId: String(venue.venueId).trim(), venueName: venue.name || '',
    purpose: req.purpose || '', startDate: req.startDate, endDate: req.endDate,
    name: req.name, phone: req.phone, email: req.email || '',
    troop: req.troop || '', position: req.position || '',
    agreeRules: isTrue_(req.agreeRules) ? 'TRUE' : '',
    status: 'pending', teamupEventId: teamupEventId || '', pwdRef: '',
    reviewer: '', reviewedAt: '',
  });
  appendRecord_('venue', rid, ref, '🏛 借場：' + (venue.name || req.venueId), req.name, req.phone, req.troop || '', 'pending',
    req.startDate + ' → ' + req.endDate);
  notifyStaff_('🏛 新借場申請', '場地：' + (venue.name || req.venueId) + '\n申請人：' + req.name + '（' + req.phone + '）\n' + req.startDate + ' → ' + req.endDate);
  return okSubmit_({ refCode: ref, id: rid, teamupEventId: teamupEventId || '', warn: warn });
}

// ===================== 借場：查閱／批核 =====================

function getVenueBookings_(token) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  return ok(readSheet_(SHEET.VENUE_REQ).reverse());
}

var VENUE_STATUS = ['pending', 'approved', 'rejected', 'cancelled'];

/** 簡單改狀態（管理系統用；唔掂電子鎖） */
function setVenueBookingStatus_(token, id, status) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  status = String(status).toLowerCase();
  if (VENUE_STATUS.indexOf(status) < 0) return err('狀態不正確');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VENUE_REQ);
  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx < 0) return err('找不到該申請');
  var req = readSheet_(SHEET.VENUE_REQ).filter(function (r) { return String(r.id).trim() === String(id).trim(); })[0] || {};
  setCellByHeader_(sh, idx, 'status', status);
  setCellByHeader_(sh, idx, 'reviewer', t.email);
  setCellByHeader_(sh, idx, 'reviewedAt', new Date().toISOString());
  updateRecordStatus_(id, status);
  // 拒絕 / 取消 → Teamup 建「拒絕」事件（選填子日曆）+ 電郵通知申請人
  if (status === 'rejected' || status === 'cancelled') {
    try { teamupOnReject_(req, status); } catch (e) { console.error('Teamup 拒絕事件建立失敗：' + e.message); }
    sendVenueRejectionEmail_(req, status);
  }
  return ok({ saved: true });
}

/**
 * 聯調批核：只改狀態 + Teamup 轉色，唔掂 TTLock / 唔寄密碼。
 * 用嚟測試「member 填表 → Teamup 登記 → 呢邊批核」。
 */
function confirmVenueBooking_(token, id) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VENUE_REQ);
  var booking = readSheet_(SHEET.VENUE_REQ).filter(function (x) { return String(x.id) === String(id); })[0];
  if (!booking) return err('找不到申請');
  if (String(booking.status).toLowerCase() === 'approved') return err('此申請已批核');

  var tup = applyTeamupApproved_(booking, '');
  var tupMsg = tup.warn || '';
  var eventId = tup.eventId || booking.teamupEventId || '';

  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx > 0) {
    setCellByHeader_(sh, idx, 'status', 'approved');
    setCellByHeader_(sh, idx, 'reviewer', t.email);
    setCellByHeader_(sh, idx, 'reviewedAt', new Date().toISOString());
    if (eventId) setCellByHeader_(sh, idx, 'teamupEventId', eventId);
  }
  updateRecordStatus_(id, 'approved');
  return ok({ saved: true, teamupEventId: eventId, warn: tupMsg || '' });
}

/**
 * 完整批核（一條龍）：TTLock 限時密碼 + Teamup 轉色 + 電郵。
 * - 已有 pending 事件（teamupEventId）→ 搬去「確認借用」子日曆
 * - 冇 → 喺「確認借用」子日曆新建事件
 * TTLock 未設定 / 停用 → 自動改用隨機密碼，其餘流程照跑。
 */
function approveVenueBooking_(token, id) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.VENUE_REQ);
  var booking = readSheet_(SHEET.VENUE_REQ).filter(function (x) { return String(x.id) === String(id); })[0];
  if (!booking) return err('找不到申請');
  if (String(booking.status).toLowerCase() === 'approved') return err('此申請已批核');

  // 1) TTLock 限時密碼（提前/延後 15 分鐘；撞碼自動重試；失敗→隨機密碼照跑）
  var passcode = String(booking.passcode || '').trim();
  var warn = '';
  if (!passcode) {
    try {
      var venueLock = '';
      try {
        var vrow = readSheet_(SHEET.VENUES).filter(function (v) {
          return String(v.venueId).trim() === String(booking.venueId || '').trim();
        })[0];
        venueLock = vrow ? String(vrow.scienerLockId || '').trim() : '';
      } catch (x) { venueLock = ''; }
      var pc = createTtlockPasscode_(booking.phone || '0000', booking.startDate, booking.endDate || booking.startDate, booking.name || '申請人', venueLock);
      passcode = pc.passcode;
    } catch (e) {
      console.error('TTLock 建碼失敗，改用隨機密碼：' + e.message);
      passcode = genPasscode_();
      warn = 'TTLock 建碼失敗，已改用隨機密碼';
    }
  }

  // 2) Teamup 轉色
  var tup = applyTeamupApproved_(booking, '\n🔑 密碼：' + passcode);
  var tupMsg = tup.warn || '';
  if (tup.eventId && !booking.teamupEventId) booking.teamupEventId = tup.eventId;

  // 3) 電郵密碼俾申請人
  var mailMsg = '';
  try { sendVenueApprovalEmail_(booking, passcode); } catch (e) { mailMsg = e.message; }

  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx > 0) {
    setCellByHeader_(sh, idx, 'status', 'approved');
    setCellByHeader_(sh, idx, 'passcode', passcode);
    setCellByHeader_(sh, idx, 'reviewer', t.email);
    setCellByHeader_(sh, idx, 'reviewedAt', new Date().toISOString());
    if (booking.teamupEventId) setCellByHeader_(sh, idx, 'teamupEventId', booking.teamupEventId);
  }
  updateRecordStatus_(id, 'approved');
  return ok({ saved: true, password: passcode, warn: [warn, tupMsg, mailMsg].filter(Boolean).join('；') });
}

function rejectVenueBooking_(token, id) {
  return setVenueBookingStatus_(token, id, 'rejected');
}

/** 職員改申請內容（唔改 status） */
function updateVenueBooking_(token, id, patch) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  patch = patch || {};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VENUE_REQ);
  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx < 0) return err('找不到該申請');
  var allow = ['venueId', 'venueName', 'purpose', 'startDate', 'endDate', 'name', 'phone', 'email', 'troop', 'position'];
  if (patch.venueId) {
    var venue = readSheet_(SHEET.VENUES).filter(function (v) {
      return String(v.venueId).trim() === String(patch.venueId).trim()
        || String(v.name || '').trim() === String(patch.venueId).trim();
    })[0];
    if (venue) {
      patch.venueId = String(venue.venueId).trim();
      patch.venueName = venue.name || patch.venueName;
    }
  }
  allow.forEach(function (k) {
    if (patch[k] !== undefined && patch[k] !== null) setCellByHeader_(sh, idx, k, patch[k]);
  });
  return ok({ saved: true });
}

/** 主控台走馬燈：待批借場 + 待批借物資 */
function getPendingInbox_(token) {
  var t = requireLogin_(token); if (t.error) return err(t.error);
  var p = staffPerms_(t.email, t.role);
  var venue = [];
  var stock = [];
  if (p.canVenue) {
    venue = readSheet_(SHEET.VENUE_REQ).filter(function (r) {
      return String(r.status || 'pending').toLowerCase() === 'pending';
    }).map(function (r) {
      return {
        id: r.id, type: 'venue', refCode: r.refCode || '',
        title: r.venueName || r.venueId || '區總部',
        name: r.name || '', startDate: r.startDate || '', endDate: r.endDate || '',
        purpose: r.purpose || '',
      };
    });
  }
  if (p.canStock) {
    stock = readSheet_(SHEET.STOCK_REQ).filter(function (r) {
      return String(r.status || 'pending').toLowerCase() === 'pending';
    }).map(function (r) {
      return {
        id: r.id, type: 'stock', refCode: r.refCode || '',
        title: (r.itemName || r.itemId || '物資') + (r.qty ? (' ×' + r.qty) : ''),
        name: r.name || '', startDate: r.borrowDate || '', endDate: r.returnDate || '',
        purpose: r.purpose || '',
      };
    });
  }
  return ok({ venue: venue, stock: stock, total: venue.length + stock.length });
}


// ===================== 借物資：物資清單 =====================

function listItems_() {
  if (!isFeature_('stock')) return [];
  var r = callService_('STOCK', 'list', null);
  if (r) return r.ok && r.data ? r.data : [];
  return readSheet_(SHEET.ITEMS)
    .filter(function (v) { return String(v.active).toUpperCase() !== 'FALSE'; })
    .map(function (v) {
      return {
        itemId: String(v.itemId).trim(), name: v.name || '', category: v.category || '',
        totalQty: Number(v.totalQty) || 0, availableQty: Number(v.availableQty) || 0,
        unit: v.unit || '', note: v.note || '', location: v.location || '',
      };
    });
}
function getItems_(token) {
  var t = requirePerm_(token, 'canStock'); if (t.error) return err(t.error);
  return ok(readSheet_(SHEET.ITEMS));
}
function saveItem_(token, item) {
  var t = requirePerm_(token, 'canStock'); if (t.error) return err(t.error);
  item = item || {};
  var itemId = String(item.itemId || '').trim() || genId_('i');
  if (!String(item.name || '').trim()) return err('物資名稱必填');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ITEMS);
  var idx = rowIndexByCol_(sh, 'itemId', itemId);
  var row = {
    itemId: itemId, districtCode: districtCode_(),
    category: item.category || '', name: item.name,
    totalQty: Number(item.totalQty) || 0,
    availableQty: item.availableQty !== undefined ? Number(item.availableQty) : (Number(item.totalQty) || 0),
    unit: item.unit || '', note: item.note || '', location: item.location || '',
    active: item.active === undefined || item.active ? 'TRUE' : 'FALSE',
  };
  if (idx > 0) {
    Object.keys(row).forEach(function (k) {
      if (item[k] !== undefined || k === 'itemId' || k === 'name' || k === 'districtCode') setCellByHeader_(sh, idx, k, row[k]);
    });
  } else {
    appendRowObj_(sh, row);
  }
  return ok({ saved: true, itemId: itemId });
}
function deleteItem_(token, itemId) {
  var t = requirePerm_(token, 'canStock'); if (t.error) return err(t.error);
  removeRowByFirstCol_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ITEMS), String(itemId).trim());
  return ok({ deleted: true });
}

// ===================== 借物資：公開提交 =====================

function normalizeStockApplicant_(b) {
  b = b || {};
  return {
    name: String(pick_(b, ['name', 'applicant', 'applicantName', 'who'])).trim(),
    phone: String(pick_(b, ['phone', 'tel', 'mobile'])).trim(),
    email: String(pick_(b, ['email', 'mail'])).trim(),
    troop: String(pick_(b, ['troop', 'unit', 'group'])).trim(),
    position: String(pick_(b, ['position', 'rank', 'title'])).trim(),
    purpose: String(pick_(b, ['purpose', 'reason', 'note', 'remarks'])).trim(),
    borrowDate: pick_(b, ['borrowDate', 'startDate', 'start', 'date', 'from']),
    returnDate: pick_(b, ['returnDate', 'endDate', 'end', 'to']),
    agreeRules: b.agreeRules || b.agree || b.accepted,
  };
}

function stockLineItems_(b) {
  var lines = b.items || b.cart || b.lines;
  if (typeof lines === 'string') {
    try { lines = JSON.parse(lines); } catch (e) { lines = null; }
  }
  if (Array.isArray(lines) && lines.length) {
    return lines.map(function (it) {
      it = it || {};
      return {
        itemId: String(pick_(it, ['itemId', 'item_id', 'id', 'sku'])).trim(),
        qty: Number(pick_(it, ['qty', 'quantity', 'amount', 'count'])) || 0,
      };
    });
  }
  var itemId = String(pick_(b, ['itemId', 'item_id', 'item'])).trim();
  var qty = Number(pick_(b, ['qty', 'quantity', 'amount', 'count'])) || 0;
  if (itemId) return [{ itemId: itemId, qty: qty }];
  return [];
}

function submitOneStockLine_(ss, applicant, line) {
  var item = readSheet_(SHEET.ITEMS).filter(function (v) {
    return String(v.itemId).trim() === String(line.itemId).trim()
      || String(v.name || '').trim() === String(line.itemId).trim();
  })[0];
  if (!item) return { ok: false, error: '物資不存在：' + line.itemId };

  var qty = Number(line.qty) || 0;
  if (qty <= 0) return { ok: false, error: '數量不正確（' + (item.name || line.itemId) + '）' };
  var avail = Number(item.availableQty) || 0;
  if (qty > avail) return { ok: false, error: '「' + item.name + '」數量超出可借數量（可借 ' + avail + '）' };

  var sh = ss.getSheetByName(SHEET.STOCK_REQ);
  if (!sh) return { ok: false, error: '尚未執行 setupSheets()' };

  var rid = genId_('sr'), ref = genRef_('SR'), now = new Date().toISOString();
  appendRowObj_(sh, {
    id: rid, districtCode: districtCode_(), refCode: ref,
    submittedAt: now, createdAt: now,
    itemId: String(item.itemId).trim(), itemName: item.name || '', category: item.category || '', qty: qty,
    purpose: applicant.purpose || '', borrowDate: applicant.borrowDate || '', returnDate: applicant.returnDate || '',
    name: applicant.name, phone: applicant.phone, email: applicant.email || '',
    troop: applicant.troop || '', position: applicant.position || '',
    agreeRules: isTrue_(applicant.agreeRules) ? 'TRUE' : '',
    status: 'pending', reviewer: '', reviewedAt: '',
  });

  if (STOCK_DEDUCT_ON === 'submit') {
    var iIdx = rowIndexByCol_(ss.getSheetByName(SHEET.ITEMS), 'itemId', String(item.itemId).trim());
    if (iIdx > 0) setCellByHeader_(ss.getSheetByName(SHEET.ITEMS), iIdx, 'availableQty', avail - qty);
  }

  appendRecord_('stock', rid, ref, '📦 借物資：' + item.name, applicant.name, applicant.phone, applicant.troop || '', 'pending',
    item.name + ' x' + qty + ' · ' + (applicant.borrowDate || '') + ' → ' + (applicant.returnDate || ''));
  return { ok: true, refCode: ref, id: rid, itemName: item.name, qty: qty };
}

function submitStockRequest_(b) {
  if (!isFeature_('stock')) return err('服務暫未開放');
  var g = guardLocked_(); if (g) return g;
  var applicant = normalizeStockApplicant_(b);
  var lines = stockLineItems_(b);
  if (!applicant.name || !applicant.phone) return err('資料不完整（需要姓名、電話）');
  if (!lines.length) return err('資料不完整（需要物資及數量）');

  var fwd = callService_('STOCK', 'addRequest', b);
  if (fwd) {
    if (fwd.ok) return okSubmit_({ refCode: (fwd.data && fwd.data.refCode) || fwd.refCode || '' });
    return err(fwd.error || '借物資轉發失敗');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SHEET.STOCK_REQ)) return err('尚未執行 setupSheets()');

  var refs = [], names = [];
  for (var i = 0; i < lines.length; i++) {
    var one = submitOneStockLine_(ss, applicant, lines[i]);
    if (!one.ok) return err(one.error);
    refs.push(one.refCode);
    names.push((one.itemName || lines[i].itemId) + ' x' + one.qty);
  }

  notifyStaff_('📦 新借物資申請',
    '物資：' + names.join('、') + '\n申請人：' + applicant.name + '（' + applicant.phone + '）\n'
    + (applicant.borrowDate || '') + ' → ' + (applicant.returnDate || ''));
  return okSubmit_({
    refCode: refs[0],
    refCodes: refs,
    count: refs.length,
  });
}

// ===================== 借物資：查閱／批核（庫存只扣一次） =====================

function getStockRequests_(token) {
  var t = requirePerm_(token, 'canStock'); if (t.error) return err(t.error);
  return ok(readSheet_(SHEET.STOCK_REQ).reverse());
}

var STOCK_STATUS = ['pending', 'approved', 'rejected', 'returned', 'cancelled'];
/** 呢啲狀態代表「物資喺申請人手上」，需要佔用庫存 */
function stockHolds_(status) { return String(status).toLowerCase() === 'approved'; }

function setStockRequestStatus_(token, id, status) {
  var t = requirePerm_(token, 'canStock'); if (t.error) return err(t.error);
  status = String(status).toLowerCase();
  if (STOCK_STATUS.indexOf(status) < 0) return err('狀態不正確');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.STOCK_REQ);
  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx < 0) return err('找不到該申請');

  var req = readSheet_(SHEET.STOCK_REQ).filter(function (r) { return String(r.id).trim() === String(id).trim(); })[0];
  if (!req) return err('找不到該申請');
  var prev = String(req.status || '').toLowerCase();

  // ★ 只喺「佔用狀態」轉變時調整庫存，避免重複加減
  var wasHeld = (STOCK_DEDUCT_ON === 'submit') ? (prev !== 'rejected' && prev !== 'returned' && prev !== 'cancelled') : stockHolds_(prev);
  var nowHeld = (STOCK_DEDUCT_ON === 'submit') ? (status !== 'rejected' && status !== 'returned' && status !== 'cancelled') : stockHolds_(status);

  if (wasHeld !== nowHeld) {
    var ish = ss.getSheetByName(SHEET.ITEMS);
    var iIdx = rowIndexByCol_(ish, 'itemId', String(req.itemId).trim());
    if (iIdx > 0) {
      var cur = Number(ish.getRange(iIdx, colIdxByHeader_(ish, 'availableQty')).getValue()) || 0;
      var delta = (nowHeld ? -1 : 1) * (Number(req.qty) || 0);
      setCellByHeader_(ish, iIdx, 'availableQty', Math.max(0, cur + delta));
    }
  }

  setCellByHeader_(sh, idx, 'status', status);
  setCellByHeader_(sh, idx, 'reviewer', t.email);
  setCellByHeader_(sh, idx, 'reviewedAt', new Date().toISOString());
  updateRecordStatus_(id, status);

  if (req.email) {
    try {
      var subject = '', body = '';
      if (status === 'approved') {
        subject = '✅ 借物資申請已批核';
        body = '你申請借用「' + req.itemName + '」x' + req.qty + ' 已獲批核。\n'
          + '借用期：' + (req.borrowDate || '') + ' 至 ' + (req.returnDate || '') + '。\n請於約定時間到區總部領取。\n申請編號：' + (req.refCode || '');
      } else if (status === 'rejected') {
        subject = '❌ 借物資申請未獲批准';
        body = '你申請借用「' + req.itemName + '」x' + req.qty + ' 未獲批准。如有疑問請聯絡區職員。\n申請編號：' + (req.refCode || '');
      } else if (status === 'returned') {
        subject = '📥 借物資已登記歸還';
        body = '你借用的「' + req.itemName + '」x' + req.qty + ' 已登記歸還，多謝。\n申請編號：' + (req.refCode || '');
      }
      if (subject) MailApp.sendEmail(req.email, subject, body);
    } catch (e) {}
  }
  return ok({ saved: true });
}

// ===================== 活動知會 =====================

function submitActivityNotice_(b) {
  if (!isFeature_('activity')) return err('服務暫未開放');
  var g = guardLocked_(); if (g) return g;
  if (!b.troop || !b.activityName || !b.leaderName || !b.leaderPhone) return err('資料不完整');

  var fwd = callService_('ACTIVITY', 'addNotice', b);
  if (fwd) {
    if (fwd.ok) return ok({ refCode: (fwd.data && fwd.data.refCode) || '' });
    return err(fwd.error || '活動知會轉發失敗');
  }

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ACTIVITY_REQ);
  if (!sh) return err('尚未執行 setupSheets()');

  // sections（成員系統，多選）／section（管理系統，單一）兩邊並存
  var sections = b.sections || b.section || '';
  var rid = genId_('an'), ref = genRef_('AN'), now = new Date().toISOString();
  appendRowObj_(sh, {
    id: rid, districtCode: districtCode_(), refCode: ref,
    submittedAt: now, createdAt: now,
    year: b.year || new Date().getFullYear(),
    section: Array.isArray(sections) ? sections.join('、') : sections,
    sections: Array.isArray(sections) ? sections.join('、') : sections,
    nature: b.nature || '', troop: b.troop, activityName: b.activityName,
    startDateTime: b.startDateTime || '', endDateTime: b.endDateTime || '',
    location: b.location || '',
    membersCount: b.membersCount || '', leadersCount: b.leadersCount || '', parentsCount: b.parentsCount || '',
    leaderName: b.leaderName, leaderPhone: b.leaderPhone, leaderEmail: b.leaderEmail || '',
    note: b.note || '',
  });
  appendRecord_('activity', rid, ref, '🗓 知會：' + b.activityName, b.leaderName, b.leaderPhone, b.troop, 'filed',
    (b.startDateTime || '') + ' · ' + (b.location || ''));
  notifyStaff_('🗓 新活動知會', '旅團：' + b.troop + '\n活動：' + b.activityName + '\n' + (b.startDateTime || ''));
  return ok({ refCode: ref });
}

/** 公開查閱（可 year / section / nature 過濾） */
function listActivityNotices_(p) {
  p = p || {};
  var list = readSheet_(SHEET.ACTIVITY_REQ);
  list.sort(function (a, b) {
    var yr = (Number(b.year) || 0) - (Number(a.year) || 0);
    if (yr !== 0) return yr;
    return String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt));
  });
  if (p.year)    list = list.filter(function (r) { return String(r.year) === String(p.year); });
  if (p.section) list = list.filter(function (r) { return String(r.section || r.sections).indexOf(String(p.section)) >= 0; });
  if (p.nature)  list = list.filter(function (r) { return String(r.nature) === String(p.nature); });
  var dc = districtCode_();
  return list.map(function (r) {
    var o = {};
    Object.keys(r).forEach(function (k) { o[k] = r[k]; });
    o.districtCode = o.districtCode || dc;
    return o;
  });
}
function getActivityNotices_(token) {
  var t = requireLogin_(token); if (t.error) return err(t.error);
  return ok(listActivityNotices_({}));
}
function deleteActivityNotice_(token, id) {
  // 行政類角色（同借場/借物資運維權限）可刪
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  removeRowByFirstCol_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ACTIVITY_REQ), String(id).trim());
  return ok({ deleted: true });
}

// ===================== 意外／應變：意外報告（v4.3.0） =====================
// 欄位 = 香港童軍總會行政署「意外報告」(ACC-RPT 2019/07) 兩頁內容（camelCase），
// 另加 id / districtCode / refCode / status / submittedAt / submittedBy / serious / createdAt。
// details / followUps 以 JSON 字串儲存 [{when, text}, ...]。

var INCIDENT_FIELDS = [
  'id', 'districtCode', 'refCode', 'status', 'submittedAt', 'submittedBy', 'serious',
  // 基本資料
  'accidentDate', 'accidentTime', 'activityName', 'place', 'organiser', 'injuryPart', 'injuryType',
  // 傷者個人資料
  'injuredNameZh', 'injuredNameEn', 'scoutId', 'hkid', 'age', 'sex', 'phone', 'email', 'address', 'unit', 'position',
  // 未滿 18 歲
  'guardianName', 'guardianRelation', 'guardianPhone', 'guardianEmail',
  // 救護車
  'ambulanceCalled', 'ambCallerName', 'ambCallerPhone', 'ambCallerUnit', 'ambCallerPosition', 'ambCallTime', 'ambArriveTime',
  // 醫院／診所
  'hospital', 'hospitalStay', 'hospitalDays', 'escortName', 'escortPhone', 'escortUnit', 'escortPosition',
  // 報案
  'policeReported', 'policeStation', 'policeCaseNo',
  // 目擊者（兩位；更多另紙）
  'hasWitness', 'witnessName', 'witnessPhone', 'witnessSex', 'witnessAddress', 'witnessUnit', 'witnessPosition',
  'witness2Name', 'witness2Phone', 'witness2Sex', 'witness2Address', 'witness2Unit', 'witness2Position',
  // 第二頁
  'details', 'followUps',
  'reporterName', 'reporterPosition', 'reporterUnit', 'reporterDate', 'reporterPhone', 'reporterEmail',
  // 童軍單位主管專用
  'supervisorReceivedDate', 'supervisorUnit', 'supervisorDate', 'supervisorName', 'supervisorRemark',
  'createdAt',
];
var INCIDENT_LOCKED_FIELDS = ['id', 'districtCode', 'refCode', 'submittedAt', 'submittedBy', 'createdAt'];

function incidentJsonList_(v) {
  if (Array.isArray(v)) return JSON.stringify(v.map(function (r) {
    return { when: String((r && r.when) || '').trim(), text: String((r && r.text) || '').trim() };
  }).filter(function (r) { return r.when || r.text; }));
  var s = String(v || '').trim();
  if (!s) return '[]';
  try { var arr = JSON.parse(s); return Array.isArray(arr) ? JSON.stringify(arr) : '[]'; } catch (e) { return '[]'; }
}
function incidentClean_(r) {
  var out = {};
  INCIDENT_FIELDS.forEach(function (k) {
    if (k === 'details' || k === 'followUps') { out[k] = incidentJsonList_(r[k]); return; }
    var v = r[k];
    out[k] = v === undefined || v === null ? '' : String(v).trim();
  });
  return out;
}

/** 提交意外報告（需登入；前端只喺按「確定提交」時先呼叫） */
function submitIncidentReport_(token, report) {
  var t = requireLogin_(token); if (t.error) return err(t.error);
  var g = guardLocked_(); if (g) return g;
  report = report || {};
  if (!String(report.activityName || '').trim()) return err('活動名稱必填');
  if (!String(report.accidentDate || '').trim()) return err('意外發生日期必填');
  if (!String(report.injuredNameZh || '').trim() && !String(report.injuredNameEn || '').trim()) return err('傷者姓名必填');
  if (!String(report.reporterName || '').trim()) return err('活動負責人／導師姓名必填');

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.INCIDENT_REQ);
  if (!sh) return err('尚未執行 setupSheets()（缺 IncidentReports 表）');

  var rid = genId_('ir'), ref = genRef_('IR'), now = new Date().toISOString();
  var row = incidentClean_(report);
  row.id = rid; row.districtCode = districtCode_(); row.refCode = ref;
  row.status = 'submitted'; row.submittedAt = now; row.createdAt = now; row.submittedBy = t.email;
  row.serious = isTrue_(report.serious) ? 'TRUE' : 'FALSE';
  appendRowObj_(sh, row);

  var injured = row.injuredNameZh || row.injuredNameEn;
  appendRecord_('incident', rid, ref, '🚨 意外報告：' + row.activityName, row.reporterName, row.reporterPhone, row.reporterUnit || row.unit,
    row.serious === 'TRUE' ? 'serious' : 'filed',
    row.accidentDate + ' ' + row.accidentTime + ' · ' + row.place + ' · 傷者 ' + injured + '（' + row.injuryPart + '／' + row.injuryType + '）');
  notifyStaff_((row.serious === 'TRUE' ? '🚨【嚴重】' : '🚨 ') + '意外報告 ' + ref + '：' + row.activityName,
    '活動：' + row.activityName + '\n日期：' + row.accidentDate + ' ' + row.accidentTime + '\n地點：' + row.place
    + '\n傷者：' + injured + '（' + row.injuryPart + '／' + row.injuryType + '）'
    + '\n送院：' + (row.hospital || '—') + '\n負責人：' + row.reporterName + ' ' + row.reporterPhone
    + '\n提交者：' + t.email
    + (row.serious === 'TRUE' ? '\n\n★ 嚴重傷亡：須於 3 個工作天內通知總會行政署。' : '')
    + '\n\n請於事發後 7 個工作天內將正本經單位主管轉交總會行政署。');
  return okSubmit_({ refCode: ref, id: rid });
}

/** 查閱（需登入；最新在前） */
function listIncidentReports_(token) {
  var t = requireLogin_(token); if (t.error) return err(t.error);
  var list = readSheet_(SHEET.INCIDENT_REQ).map(function (r) {
    var o = {};
    Object.keys(r).forEach(function (k) {
      var v = r[k];
      // Sheet 會自動把 "2026-09-07" / "14:35" 轉成 Date；讀返出嚟時還原成字串
      if (v instanceof Date) {
        v = v.getFullYear() < 1900
          ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm')        // 純時間（1899-12-30 基準）
          : Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      o[k] = v === undefined || v === null ? '' : String(v);
    });
    o.districtCode = o.districtCode || districtCode_();
    return o;
  });
  list.sort(function (a, b) { return String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')); });
  return ok(list);
}

/** 補充／修正（例如單位主管省閱資料、跟進工作）：行政類角色 */
function updateIncidentReport_(token, id, patch) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  id = String(id || '').trim();
  if (!id) return err('id 必填');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.INCIDENT_REQ);
  var idx = findRowByFirstCol_(sh, id);
  if (idx < 0) return err('找不到該意外報告');
  patch = patch || {};
  Object.keys(patch).forEach(function (k) {
    if (INCIDENT_FIELDS.indexOf(k) < 0 || INCIDENT_LOCKED_FIELDS.indexOf(k) >= 0) return;
    var v = patch[k];
    if (k === 'details' || k === 'followUps') v = incidentJsonList_(v);
    else if (k === 'serious') v = isTrue_(v) ? 'TRUE' : 'FALSE';
    else v = v === undefined || v === null ? '' : String(v).trim();
    setCellByHeader_(sh, idx, k, v);
  });
  if (patch.status) updateRecordStatus_(id, String(patch.status).trim());
  return ok({ saved: true });
}

function deleteIncidentReport_(token, id) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  removeRowByFirstCol_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.INCIDENT_REQ), String(id).trim());
  return ok({ deleted: true });
}

// ===================== 訓練班目錄（CourseLinks） =====================
// 每個訓練班 = 1 張專屬 Sheet + 1 份收表 Script + 1 個 Drive 資料夾。
// 欄名以管理系統為準：scriptExecUrl / scriptApiKey / driveFolderId
// 讀取時同時接受舊欄名 apiBase / apiKey（相容成員系統舊資料）。

function courseExecUrl_(r) { return String(r.scriptExecUrl || r.apiBase || '').trim(); }
function courseApiKey_(r)  { return String(r.scriptApiKey || r.apiKey || '').trim(); }

/** 公開顯示用（唔含 script url / api key） */
function courseLinkPublic_(r) {
  return {
    courseId: String(r.courseId || '').trim(), districtCode: r.districtCode || districtCode_(),
    title: r.title || '', badgeName: r.badgeName || '', section: r.section || '',
    courseNo: r.courseNo || '', sessionsText: r.sessionsText || '',
    eligibility: r.eligibility || '',
    fee: Number(r.fee) || 0, originalFee: Number(r.originalFee) || 0,
    subsidyNote: r.subsidyNote || '', deadline: r.deadline || '',
    quota: Number(r.quota) || 0, filled: Number(r.filled) || 0,
    venue: r.venue || '', noticeUrl: r.noticeUrl || '', contact: r.contact || '',
    // 每班收費 FPS QR（v4.3.0）：成員系統直接畫 QR；冇生成過就全部空字串
    fpsQrPayload: String(r.fpsQrPayload || '').trim(),
    fpsAmount: r.fpsAmount === undefined || r.fpsAmount === null ? '' : String(r.fpsAmount).trim(),
    fpsReference: String(r.fpsReference || '').trim(),
    fpsAccountName: String(r.fpsAccountName || '').trim(),
    fpsAccountNumber: r.fpsAccountNumber === undefined || r.fpsAccountNumber === null ? '' : String(r.fpsAccountNumber).trim(),
    fpsUpdatedAt: r.fpsUpdatedAt || '',
  };
}

/** ★ 公開：成員系統讀開放中嘅訓練班（active=TRUE 且 deadline 未過） */
function listCourseLinks_() {
  if (!isFeature_('course')) return [];
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return readSheet_(SHEET.COURSE_LINKS)
    .filter(function (r) {
      if (!String(r.courseId || '').trim()) return false;
      if (String(r.active).toUpperCase() === 'FALSE') return false;
      var dl = String(r.deadline || '').trim();
      return !dl || dl >= today;
    })
    .map(courseLinkPublic_);
}

/** 管理：連 scriptExecUrl / scriptApiKey / driveFolderId */
function getCourseLinks_(token) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  return ok(readSheet_(SHEET.COURSE_LINKS).map(function (r) {
    var o = courseLinkPublic_(r);
    o.scriptExecUrl = courseExecUrl_(r);
    o.scriptApiKey  = courseApiKey_(r);
    o.driveFolderId = r.driveFolderId || '';
    o.apiBase = o.scriptExecUrl;  // 相容舊前端
    o.apiKey  = o.scriptApiKey;
    o.active = String(r.active).toUpperCase() !== 'FALSE';
    o.createdAt = r.createdAt || '';
    return o;
  }));
}

function saveCourseLink_(token, link) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  link = link || {};
  var courseId = String(link.courseId || '').trim() || genId_('cl');
  var title = String(link.title || '').trim();
  if (!title) return err('課程名稱（title）必填');

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.COURSE_LINKS);
  if (!sh) return err('尚未執行 setupSheets()');
  var idx = rowIndexByCol_(sh, 'courseId', courseId);

  // 兩套欄名都收，統一寫入
  var execUrl = String(link.scriptExecUrl || link.apiBase || '').trim();
  var apiKey  = String(link.scriptApiKey || link.apiKey || '').trim();

  var row = {
    courseId: courseId, districtCode: link.districtCode || districtCode_(),
    title: title, badgeName: link.badgeName || '', section: link.section || '',
    courseNo: link.courseNo || '', sessionsText: link.sessionsText || '',
    eligibility: link.eligibility || '',
    fee: Number(link.fee) || 0, originalFee: Number(link.originalFee) || 0,
    subsidyNote: link.subsidyNote || '', deadline: link.deadline || '',
    quota: Number(link.quota) || 0,
    venue: link.venue || '', noticeUrl: link.noticeUrl || '', contact: link.contact || '',
    scriptExecUrl: execUrl, scriptApiKey: apiKey,
    apiBase: execUrl, apiKey: apiKey,           // 同步舊欄位，兩邊前端都讀到
    driveFolderId: link.driveFolderId || '',
    active: link.active === undefined || link.active ? 'TRUE' : 'FALSE',
  };

  // 每班收費 FPS QR（v4.3.0）：前端只會喺「儲存 QR」時帶 fpsQrPayload；
  // 舊前端／未帶欄位時唔掂已儲存嘅 QR（undefined = 保留），帶空字串 = 移除。
  if (link.fpsQrPayload !== undefined) {
    var payload = String(link.fpsQrPayload || '').trim();
    row.fpsQrPayload = payload;
    row.fpsAmount = payload ? String(link.fpsAmount || '').trim() : '';
    row.fpsReference = payload ? String(link.fpsReference || '').trim() : '';
    row.fpsAccountName = payload ? String(link.fpsAccountName || '').trim() : '';
    row.fpsAccountNumber = payload ? String(link.fpsAccountNumber || '').trim() : '';
    row.fpsUpdatedAt = payload ? (link.fpsUpdatedAt || new Date().toISOString()) : '';
  }

  if (idx > 0) {
    Object.keys(row).forEach(function (k) { setCellByHeader_(sh, idx, k, row[k]); });
  } else {
    row.filled = Number(link.filled) || 0;
    row.createdAt = new Date().toISOString();
    appendRowObj_(sh, row);
  }
  return ok({ saved: true, courseId: courseId });
}

function deleteCourseLink_(token, courseId) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  removeRowByFirstCol_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.COURSE_LINKS), String(courseId).trim());
  return ok({ deleted: true });
}

// ===================== 訓練班：公開報名（轉發去該班 Script） =====================

function submitCourseReg_(b) {
  if (!isFeature_('course')) return err('服務暫未開放');
  var g = guardLocked_(); if (g) return g;
  if (!b.courseId || !b.nameZh || !b.phone || !b.email) return err('資料不完整');
  if (!b.memberType && !b.section) return err('請選擇所屬支部');
  if (!b.receiptDataUrl) return err('請上傳入數紙截圖。未繳費將不獲處理申請');

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var link = readSheet_(SHEET.COURSE_LINKS).filter(function (x) {
    var dl = String(x.deadline || '').trim();
    return String(x.courseId).trim() === String(b.courseId).trim()
      && String(x.active).toUpperCase() !== 'FALSE'
      && (!dl || dl >= today);
  })[0];
  if (!link) return err('找不到此訓練班或已截止報名');

  var execUrl = courseExecUrl_(link);
  if (!execUrl) return err('此訓練班未設定收表 Script，請聯絡職員');
  if (Number(link.quota) > 0 && (Number(link.filled) || 0) >= Number(link.quota)) return err('此班名額已滿');

  var payload = {
    action: 'addReg',
    apiKey: courseApiKey_(link),
    driveFolderId: link.driveFolderId || '',
    courseId: b.courseId, courseTitle: link.title || '',
    nameZh: b.nameZh, nameEn: b.nameEn || '', gender: b.gender || '', dob: b.dob || '',
    phone: b.phone, email: b.email,
    memberType: b.memberType || '', section: link.section || '', badgeCode: link.badgeCode || '',
    scoutDistrict: b.scoutDistrict || '', region: b.region || '', troop: b.troop || '',
    scoutId: b.scoutId || '', scoutPosition: b.scoutPosition || '',
    extra: b.extra || '',
    guardianConsent: b.guardianConsent || '', guardianName: b.guardianName || '',
    guardianRelation: b.guardianRelation || '', guardianEmail: b.guardianEmail || '',
    guardianPhone: b.guardianPhone || '',
    leaderConsent: b.leaderConsent || '', leaderName: b.leaderName || '',
    leaderPosition: b.leaderPosition || '', leaderEmail: b.leaderEmail || '',
    payMethod: b.payMethod || 'FPS', payerName: b.payerName || '', payAccount: b.payAccount || '',
    receiptFileName: b.receiptFileName || '', receiptMimeType: b.receiptMimeType || 'image/jpeg',
    receiptDataUrl: b.receiptDataUrl || '', needReceipt: b.needReceipt || '', note: b.note || '',
  };

  var resp = UrlFetchApp.fetch(execUrl, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  var result = {};
  try { result = JSON.parse(resp.getContentText()); } catch (e) {}
  if (!result.ok) return err((result && result.error) || '訓練班收表失敗（HTTP ' + resp.getResponseCode() + '）');

  var ref = (result.data && result.data.refCode) || '';

  // 更新已報名人數
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.COURSE_LINKS);
  var idx = rowIndexByCol_(sh, 'courseId', String(b.courseId).trim());
  if (idx > 0) setCellByHeader_(sh, idx, 'filled', (Number(link.filled) || 0) + 1);

  appendRecord_('course', genId_('crs'), ref, '🎓 報班：' + (link.title || b.courseId),
    b.nameZh, b.phone, b.troop || '', 'filed',
    '已轉發至訓練班專屬表 · ' + (b.memberType || '') + '（已交入數紙）');
  notifyStaff_('🎓 新訓練班報名',
    '班：' + (link.title || b.courseId) + '\n學員：' + b.nameZh + '（' + b.phone + '）\n支部：' + (b.memberType || ''));
  return ok({ refCode: ref });
}

/** 讀某班名單（轉發去該班 Script listRegs） */
function getCourseRegs_(token, courseId) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  var link = readSheet_(SHEET.COURSE_LINKS).filter(function (x) {
    return String(x.courseId).trim() === String(courseId).trim();
  })[0];
  if (!link) return err('找不到此訓練班');
  var execUrl = courseExecUrl_(link);
  if (!execUrl) return ok([]);
  try {
    var resp = UrlFetchApp.fetch(execUrl + '?action=listRegs&apiKey=' + encodeURIComponent(courseApiKey_(link)),
      { muteHttpExceptions: true });
    var r = JSON.parse(resp.getContentText());
    return r.ok ? ok(r.data || []) : err(r.error || '讀取名單失敗');
  } catch (e) { return err('讀取名單失敗：' + e); }
}

function setCourseRegStatus_(token, courseId, id, status) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  var link = readSheet_(SHEET.COURSE_LINKS).filter(function (x) {
    return String(x.courseId).trim() === String(courseId).trim();
  })[0];
  if (!link) return err('找不到此訓練班');
  var execUrl = courseExecUrl_(link);
  if (!execUrl) return err('此訓練班未設定收表 Script');
  try {
    var resp = UrlFetchApp.fetch(execUrl, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ action: 'setRegStatus', apiKey: courseApiKey_(link), id: id, status: status }),
      muteHttpExceptions: true,
    });
    var r = JSON.parse(resp.getContentText());
    return r.ok ? ok(r.data || { saved: true }) : err(r.error || '更新失敗');
  } catch (e) { return err('更新失敗：' + e); }
}

function setRegFeePaid_(token, courseId, id, paid) {
  return setCourseRegStatus_(token, courseId, id, paid ? 'paid' : 'unpaid');
}

// ===================== 舊版內建課程（Courses，保留相容） =====================

function listCourses_() {
  if (!isFeature_('course')) return [];
  return readSheet_(SHEET.COURSES).map(function (r) {
    return {
      courseId: r.courseId, title: r.title, section: r.section || '',
      badgeName: r.badgeName || '', courseNo: r.courseNo || '',
      sessionsText: r.sessionsText || '', eligibility: r.eligibility || '',
      fee: Number(r.fee) || 0, originalFee: Number(r.originalFee) || 0,
      deadline: r.deadline || '', quota: Number(r.quota) || 0, filled: Number(r.filled) || 0,
      venue: r.venue || '', status: r.status || 'open',
      noticeUrl: r.noticeUrl || '', fpsNote: r.fpsNote || '',
    };
  }).filter(function (c) { return String(c.status).toLowerCase() !== 'closed'; });
}
function getCourses_(token) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  return ok(readSheet_(SHEET.COURSES));
}
function saveCourse_(token, course) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  course = course || {};
  var courseId = String(course.courseId || '').trim() || genId_('c');
  if (!String(course.title || '').trim()) return err('課程名稱必填');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.COURSES);
  var idx = rowIndexByCol_(sh, 'courseId', courseId);
  var row = {
    courseId: courseId, districtCode: districtCode_(), title: course.title,
    sessionsText: course.sessionsText || '', eligibility: course.eligibility || '',
    fee: Number(course.fee) || 0, originalFee: Number(course.originalFee) || 0,
    deadline: course.deadline || '', quota: Number(course.quota) || 0,
    venue: course.venue || '', status: course.status || 'open',
    noticeUrl: course.noticeUrl || '', fpsNote: course.fpsNote || '',
  };
  if (idx > 0) Object.keys(row).forEach(function (k) { setCellByHeader_(sh, idx, k, row[k]); });
  else { row.filled = 0; appendRowObj_(sh, row); }
  return ok({ saved: true, courseId: courseId });
}
function deleteCourse_(token, courseId) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  removeRowByFirstCol_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.COURSES), String(courseId).trim());
  return ok({ deleted: true });
}

/** 下拉參數：支部／地域／區會／徽章 */
function listCourseParams_() {
  var raw = readSheet_(SHEET.COURSE_PARAMS);
  var badges = [], sections = [], districts = [], regions = [], memberTypes = [];
  raw.forEach(function (r) {
    var k = r.key || '', v = r.value || '';
    if (k === 'badge') badges.push({ code: r.code || '', group: r.group || '', nameZh: v, nameEn: r.nameEn || '', kind: r.kind || '' });
    else if (k === 'section') sections.push(v);
    else if (k === 'district') districts.push(v);
    else if (k === 'region') regions.push(v);
    else if (k === 'memberType') memberTypes.push(v);
  });
  return { badges: badges, sections: sections, districts: districts, regions: regions, memberTypes: memberTypes };
}

// ===================== 電子鎖（通通鎖 TTLock）/ 日曆 / 電郵 =====================
// 門鎖用 TTLock（SKW 區現有硬件）。批准 → createTtlockPasscode_ 建限時密碼。
// Teamup 金鑰主用 TEAMUP_* 欄名，同時兼容舊 teamup* 欄名。

function md5_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8)
    .map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
function cfgFirst_() {
  for (var i = 0; i < arguments.length; i++) {
    var v = getConfigValue_(arguments[i]);
    if (v) return String(v).trim();
  }
  return '';
}
/** Sciener / TTLock 共用：Config 主用 SCIENER_*，兼容 ttlock* */
function lockCfg_() {
  return {
    clientId: cfgFirst_('SCIENER_CLIENT_ID', 'ttlockClientId'),
    clientSecret: cfgFirst_('SCIENER_CLIENT_SECRET', 'ttlockClientSecret'),
    username: cfgFirst_('SCIENER_USERNAME', 'ttlockUsername'),
    password: cfgFirst_('SCIENER_PASSWORD', 'ttlockPassword'),
    lockId: cfgFirst_('SCIENER_LOCK_ID', 'ttlockLockId'),
    apiBase: cfgFirst_('SCIENER_API_BASE', 'ttlockApiBase'),
    pwdMode: cfgFirst_('PWD_MODE', 'pwdMode') || 'phone4',
  };
}
function ttlockBase_() {
  var b = lockCfg_().apiBase || 'https://api.sciener.com';
  b = String(b).replace(/\/+$/, '');
  // 開放平台網站 ≠ API；自動改去正確主機
  if (/^https?:\/\/(www\.)?open\.sciener\.com$/i.test(b)) return 'https://api.sciener.com';
  if (/^https?:\/\/(www\.)?open\.ttlock\.com$/i.test(b)) return 'https://api.ttlock.com';
  return b;
}
function ttlockDisabled_() { return String(getConfigValue_('ttlockDisabled')).toUpperCase() === 'TRUE'; }
function ttlockToken_() {
  var c = lockCfg_();
  if (!c.clientId || !c.clientSecret || !c.username || !c.password) {
    throw new Error('未設定電子鎖 Config（SCIENER_CLIENT_ID/SECRET/USERNAME/PASSWORD 或 ttlock*）');
  }
  var payload = { client_id: c.clientId, client_secret: c.clientSecret, username: c.username, password: md5_(c.password), grant_type: 'password' };
  var res = UrlFetchApp.fetch(ttlockBase_() + '/oauth2/token', { method: 'post', payload: payload, muteHttpExceptions: true });
  var data = JSON.parse(res.getContentText());
  if (!data.access_token) throw new Error('Sciener/TTLock 登入失敗 ' + JSON.stringify(data));
  return data.access_token;
}

/** 生成 6 位數字密碼（避開已存在嘅 passcode，防撞碼） */
function genPasscode_() {
  var existing = {};
  readSheet_(SHEET.VENUE_REQ).forEach(function (r) { if (r.passcode) existing[String(r.passcode).trim()] = true; });
  for (var i = 0; i < 200; i++) {
    var code = String(Math.floor(100000 + Math.random() * 900000));
    if (!existing[code]) return code;
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** phone4=電話頭4位（你而家用緊）；phone4tail=尾4位；random=隨機6位 */
function buildKeyboardPwd_(phone) {
  var mode = String(lockCfg_().pwdMode || 'phone4').toLowerCase();
  var digits = String(phone || '').replace(/\D/g, '');
  if (mode === 'phone4' || mode === 'phone4head') return (digits + '0000').slice(0, 4);
  if (mode === 'phone4tail') return digits.length >= 4 ? digits.slice(-4) : ('0000' + digits).slice(-4);
  return genPasscode_();
}

/** 從 Sciener 撈鎖列表，方便抄 Lock ID 填入 Config */
function getLockList_(token) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  try {
    var access = ttlockToken_();
    var c = lockCfg_();
    var res = UrlFetchApp.fetch(ttlockBase_() + '/v3/lock/list', {
      method: 'post',
      payload: { clientId: c.clientId, accessToken: access, pageNo: '1', pageSize: '50', date: String(Date.now()) },
      muteHttpExceptions: true,
    });
    var data = {};
    try { data = JSON.parse(res.getContentText()); } catch (e) { data = {}; }
    if (!data.list) return err('讀鎖列表失敗：' + res.getContentText());
    return ok({
      apiBase: ttlockBase_(),
      configuredLockId: c.lockId,
      locks: data.list.map(function (lock) {
        return {
          lockId: lock.lockId,
          name: lock.lockAlias || lock.lockName || '',
          mac: lock.lockMac || '',
          hasGateway: lock.hasGateway === 1 || lock.hasGateway === true,
        };
      }),
    });
  } catch (e) {
    return err(String(e.message || e));
  }
}

/** 建立限時密碼；ttlockDisabled=TRUE 時返回模擬密碼，其餘流程照跑 */
function createTtlockPasscode_(phone, startDate, endDate, name, venueLockId) {
  if (ttlockDisabled_()) return { passcode: buildKeyboardPwd_(phone), simulated: true };
  var token = ttlockToken_();
  var c = lockCfg_();
  var lockId = String(venueLockId || '').trim() || c.lockId;
  var clientId = c.clientId;
  if (!lockId) throw new Error('未設定 SCIENER_LOCK_ID / ttlockLockId（Config 工作表 key 欄），或喺場地填 Lock ID');
  var base = ttlockBase_();
  var start = new Date(startDate); start.setMinutes(start.getMinutes() - 15);
  var end = new Date(endDate); end.setMinutes(end.getMinutes() + 15);
  var passcode = buildKeyboardPwd_(phone);
  var lastErr = null;
  for (var attempt = 0; attempt < 8; attempt++) {
    var payload = {
      clientId: clientId, accessToken: token, lockId: String(lockId),
      keyboardPwd: passcode, keyboardPwdName: String(name || '申請人').substring(0, 30),
      startDate: String(start.getTime()), endDate: String(end.getTime()),
      addType: '2', date: String(Date.now())
    };
    var res = UrlFetchApp.fetch(base + '/v3/keyboardPwd/add', { method: 'post', payload: payload, muteHttpExceptions: true });
    var data; try { data = JSON.parse(res.getContentText()); } catch (e) { data = {}; }
    if (data.keyboardPwdId || data.errcode === 0) return { passcode: passcode, validFrom: start, validTo: end };
    lastErr = data;
    passcode = String(parseInt(passcode, 10) + 1).padStart(String(passcode).length, '0'); // 撞碼 +1 重試
  }
  throw new Error('TTLock 建碼多次失敗 ' + (lastErr.errmsg || JSON.stringify(lastErr)));
}

// ---------- Teamup ----------

/** Teamup 金鑰：主用 TEAMUP_*，兼容舊 teamup* 欄名 */
function teamupCfg_() {
  return {
    apiKey: getConfigValue_('TEAMUP_API_KEY') || getConfigValue_('teamupApiKey'),
    calendarId: getConfigValue_('TEAMUP_CALENDAR_KEY') || getConfigValue_('teamupCalendarId'),
    pendingSub: getConfigValue_('TEAMUP_PENDING_SUBCAL_ID') || '',
    approvedSub: getConfigValue_('TEAMUP_APPROVED_SUBCAL_ID') || getConfigValue_('teamupApprovedSubId'),
    rejectedSub: getConfigValue_('TEAMUP_REJECTED_SUBCAL_ID') || getConfigValue_('teamupRejectedSubId'),
  };
}
function teamupReady_() {
  var c = teamupCfg_();
  return !!(c.apiKey && c.calendarId);
}
function teamupApi_(method, path, body) {
  var c = teamupCfg_();
  if (!c.apiKey || !c.calendarId) return null;
  var options = { method: method, headers: { 'Teamup-Token': c.apiKey }, muteHttpExceptions: true };
  if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
  try { return JSON.parse(UrlFetchApp.fetch('https://api.teamup.com/' + path, options).getContentText()); }
  catch (e) { return null; }
}
function teamupFetch_(url, options) {
  var opt = options || {};
  opt.headers = { 'Teamup-Token': teamupCfg_().apiKey, 'Content-Type': 'application/json' };
  opt.muteHttpExceptions = true;
  var res = UrlFetchApp.fetch(url, opt);
  return { code: res.getResponseCode(), text: res.getContentText() };
}
/** 把申請資料寫成 Teamup 事件 notes */
function buildTeamupNotes_(req) {
  return '姓名：' + String(req.name || '') + '\n電話：' + String(req.phone || '')
    + '\n電郵：' + String(req.email || '') + '\n旅團：' + String(req.troop || '')
    + '\n申請編號：' + String(req.refCode || '') + '\n用途：' + String(req.purpose || '');
}
/** 正規化成 Teamup 需要嘅 ISO 起訖時間（香港 +08:00） */
function toTeamupDt_(value, endOfDay) {
  if (!value) return '';
  var raw = String(value).trim();
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw + (endOfDay ? 'T23:59:00+08:00' : 'T00:00:00+08:00');
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}/.test(raw)) {
    var t = raw.replace(' ', 'T');
    var parts = t.split('T');
    var hm = parts[1];
    if (/^\d:\d{2}/.test(hm)) hm = '0' + hm;
    if (hm.length === 5) hm += ':00';
    return parts[0] + 'T' + hm.slice(0, 8) + '+08:00';
  }
  var d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  if (endOfDay && raw.indexOf(':') < 0) { d.setHours(23, 59, 59, 999); }
  return d.toISOString();
}

/** 申請人填表 → 喺「申請中」子日曆建事件 */
function createPendingTeamupEvent_(req) {
  var c = teamupCfg_();
  if (!teamupReady_()) return { ok: false, error: 'Teamup 尚未設定（TEAMUP_API_KEY / TEAMUP_CALENDAR_KEY）' };
  if (!c.pendingSub) return { ok: false, error: '未設定 TEAMUP_PENDING_SUBCAL_ID（申請中子日曆）' };
  var title = '【申請】' + (req.venueName || req.venueId || '區總部') + (req.name ? ' · ' + req.name : '');
  return createTeamupEvent_(c.pendingSub, title, buildTeamupNotes_(req),
    toTeamupDt_(req.startDate, false), toTeamupDt_(req.endDate || req.startDate, true));
}

/** 批准：有 pending 事件就搬去確認子日曆；冇就新建。回傳 {warn, eventId} */
function applyTeamupApproved_(booking, extraNotes) {
  var out = { warn: '', eventId: String(booking.teamupEventId || '').trim() };
  try {
    var extra = extraNotes || '';
    var stamp = '\n✅ 已批准於 ' + new Date().toLocaleString('zh-HK') + extra;
    if (out.eventId) {
      var moved = teamupMoveToApproved_(out.eventId, booking, stamp);
      if (moved) out.warn = moved;
    } else {
      var ev = createTeamupEvent_(teamupCfg_().approvedSub,
        (booking.venueName || booking.venueId || '區總部') + '（已批准）',
        buildTeamupNotes_(booking) + stamp,
        toTeamupDt_(booking.startDate, false), toTeamupDt_(booking.endDate || booking.startDate, true));
      if (!ev.ok) out.warn = ev.error || 'Teamup 建立確認事件失敗';
      else out.eventId = ev.eventId || '';
    }
  } catch (e) {
    out.warn = e.message;
  }
  return out;
}
/** 建立 Teamup 事件到指定子日曆 */
function createTeamupEvent_(subId, title, notes, startDt, endDt) {
  if (!teamupReady_() || !subId) return { ok: false, error: 'Teamup 尚未設定' };
  var body = JSON.stringify({
    subcalendar_ids: [parseInt(subId, 10)],
    title: title,
    notes: notes,
    start_dt: startDt,
    end_dt: endDt || startDt,
  });
  var r = teamupFetch_('https://api.teamup.com/' + teamupCfg_().calendarId + '/events', { method: 'post', payload: body });
  if (r.code < 200 || r.code >= 300) return { ok: false, error: 'Teamup 建立事件失敗 HTTP ' + r.code + '：' + r.text };
  try { var data = JSON.parse(r.text); return { ok: true, eventId: data && data.event ? data.event.id : '' }; }
  catch (e) { return { ok: true, eventId: '' }; }
}
/** 將 pending 事件搬去「確認借用」子日曆（轉色） */
function teamupMoveToApproved_(eventId, booking, extraNotes) {
  var c = teamupCfg_();
  if (!eventId) return '冇 Teamup 事件 ID';
  if (!c.approvedSub) return '未設定 TEAMUP_APPROVED_SUBCAL_ID';
  var cur = teamupApi_('get', c.calendarId + '/events/' + eventId);
  var ev = cur && cur.event ? cur.event : {};
  var title = (booking && (booking.venueName || booking.venueId))
    ? String(booking.venueName || booking.venueId) + '（已批准）'
    : ((ev.title || '區總部').replace('【申請】', '').replace('（已批准）', '').trim() + '（已批准）');
  var notes = ev.notes || (booking ? buildTeamupNotes_(booking) : '');
  if (extraNotes && notes.indexOf(extraNotes) < 0) notes = String(notes || '') + extraNotes;
  var body = {
    subcalendar_ids: [Number(c.approvedSub)],
    title: title,
    notes: notes,
    start_dt: ev.start_dt,
    end_dt: ev.end_dt,
  };
  var r = teamupApi_('put', c.calendarId + '/events/' + eventId, body);
  return (r && r.event) ? '' : 'TeamUp 更新失敗';
}
/** 拒絕/取消：有原事件就搬去拒絕子日曆，否則選填新建 */
function teamupOnReject_(req, status) {
  if (!teamupReady_()) return;
  var label = status === 'cancelled' ? '已取消' : '已拒絕';
  var title = (req.venueName || req.venueId || '區總部') + '（' + label + '）';
  var notes = buildTeamupNotes_(req) + '\n❌ ' + label + '於 ' + new Date().toLocaleString('zh-HK');
  var c = teamupCfg_();
  if (req.teamupEventId) {
    var cur = teamupApi_('get', c.calendarId + '/events/' + req.teamupEventId);
    var ev = cur && cur.event ? cur.event : {};
    var body = {
      subcalendar_ids: c.rejectedSub ? [Number(c.rejectedSub)] : (ev.subcalendar_ids || []),
      title: title,
      notes: notes,
      start_dt: ev.start_dt,
      end_dt: ev.end_dt,
    };
    teamupApi_('put', c.calendarId + '/events/' + req.teamupEventId, body);
    return;
  }
  if (!c.rejectedSub) return;
  createTeamupEvent_(c.rejectedSub, title, notes,
    toTeamupDt_(req.startDate, false), toTeamupDt_(req.endDate || req.startDate, true));
}

// ---------- 電郵 ----------

function venueMailConfig_() {
  var districtName = getConfigValue_('districtName') || '童軍區';
  var fromName = getConfigValue_('notifyFrom') || (districtName + ' 管理系統');
  return { districtName: districtName, fromName: fromName };
}
/** HTML 轉義，避免申請人名字含特殊字元破壞電郵樣式 */
function esc_(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/** 批准 → 寄「已批准 + 入場密碼」俾申請人 */
function sendVenueApprovalEmail_(req, passcode) {
  var email = String(req.email || '').trim();
  if (!email) { console.log('無申請人電郵，跳過批准通知。'); return; }
  var cfg = venueMailConfig_();
  var name = req.name || '申請人';
  var html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:20px;border:1px solid #e1e4e8;border-radius:8px;">'
    + '<h2 style="color:#15803d;text-align:center;border-bottom:2px solid #bbf7d0;padding-bottom:10px;">✅ 場地借用已獲批准</h2>'
    + '<p>你好 ' + esc_(name) + '，你所申請的場地借用已獲批核：</p>'
    + '<div style="background:#f6f8fa;border-left:4px solid #16a34a;padding:14px 18px;margin:16px 0;font-size:14px;color:#444;line-height:1.8;">'
    + '<b>場地：</b>' + esc_(req.venueName || req.venueId) + '<br/>'
    + '<b>日期：</b>' + esc_(req.startDate || '') + (req.endDate ? ' → ' + esc_(req.endDate) : '') + '<br/>'
    + '<b>申請編號：</b>' + esc_(req.refCode || '') + '<br/>'
    + '<b>用途：</b>' + esc_(req.purpose || '—')
    + '</div>'
    + '<div style="background:#f0fdf4;border:2px dashed #bbf7d0;border-radius:8px;padding:22px;text-align:center;margin:18px 0;">'
    + '<div style="font-size:13px;color:#166534;font-weight:bold;">🔑 入場密碼</div>'
    + '<div style="font-size:40px;font-weight:800;letter-spacing:6px;color:#166534;font-family:monospace;margin:10px 0;">' + esc_(passcode) + '</div>'
    + '<div style="font-size:13px;color:#374151;">請於借用時段使用此密碼進入場地。</div>'
    + '</div>'
    + '<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;font-size:13px;color:#78350f;line-height:1.7;">'
    + '<b>使用守則：</b>使用完畢後請關閉所有電源、清走垃圾並鎖好場地。如有問題請聯絡區職員。'
    + '</div>'
    + '<p style="font-size:13px;color:#666;text-align:center;margin-top:26px;">' + esc_(cfg.districtName) + ' 敬啟</p>'
    + '</div>';
  MailApp.sendEmail({ to: email, subject: '[' + cfg.districtName + '] 場地借用已獲批准 - 入場密碼 ' + passcode, htmlBody: html, name: cfg.fromName });
}
/** 拒絕 / 取消 → 電郵通知申請人 */
function sendVenueRejectionEmail_(req, status) {
  var email = String(req.email || '').trim();
  if (!email) { console.log('無申請人電郵，跳過拒絕通知。'); return; }
  var cfg = venueMailConfig_();
  var name = req.name || '申請人';
  var title = status === 'cancelled' ? '已取消' : '未獲批准';
  var html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:20px;border:1px solid #e1e4e8;border-radius:8px;">'
    + '<h2 style="color:#dc2626;text-align:center;border-bottom:2px solid #fecaca;padding-bottom:10px;">❌ 場地借用' + title + '</h2>'
    + '<p>你好 ' + esc_(name) + '，你所申請的場地借用已' + title + '：</p>'
    + '<div style="background:#f6f8fa;border-left:4px solid #dc2626;padding:14px 18px;margin:16px 0;font-size:14px;color:#444;line-height:1.8;">'
    + '<b>場地：</b>' + esc_(req.venueName || req.venueId) + '<br/>'
    + '<b>日期：</b>' + esc_(req.startDate || '') + (req.endDate ? ' → ' + esc_(req.endDate) : '')
    + '</div>'
    + '<p style="font-size:14px;color:#555;">如有疑問，請聯絡區職員查詢。</p>'
    + '<p style="font-size:13px;color:#666;text-align:center;margin-top:26px;">' + esc_(cfg.districtName) + ' 敬啟</p>'
    + '</div>';
  MailApp.sendEmail({ to: email, subject: '[' + cfg.districtName + '] 場地借用' + title, htmlBody: html, name: cfg.fromName });
}
function notifyStaff_(subject, body) {
  var to = getConfigValue_('NOTIFY_STAFF_EMAIL');
  if (!to) return;
  try { MailApp.sendEmail(to, subject, body); } catch (e) {}
}

// ===================== 卡片（管理系統主控台） =====================

function normalizeCard_(c) {
  return {
    cardId: String(c.cardId).trim(), title: c.title, icon: c.icon, type: c.type, url: c.url,
    description: c.description, order: Number(c.order) || 0,
    enabled: String(c.enabled).toUpperCase() !== 'FALSE',
    embed: String(c.embed).toUpperCase() === 'TRUE',
    source: c.source || 'core',
    category: String(c.category || 'done').trim() === 'todo' ? 'todo' : 'done',
  };
}
function getCards_(token) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期，請重新登入');
  var perms = readPerms_();
  var u = readSheet_(SHEET.USERS).filter(function (x) {
    return String(x.email).trim().toLowerCase() === String(t.email).trim().toLowerCase();
  })[0];
  var scopeOverride = u && u.cards ? splitList_(u.cards) : null;
  var cards = readSheet_(SHEET.CARDS).map(normalizeCard_).filter(function (c) {
    if (!c.enabled) return false;
    if (scopeOverride && scopeOverride.indexOf(c.cardId) < 0) return false;
    var access = (perms[c.cardId] || {})[t.role] || '';
    c.access = access;
    return access === 'edit' || access === 'view';
  }).sort(function (a, b) { return a.order - b.order; });
  return ok(cards);
}
function setCardEnabled_(token, cardId, enabled) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  cardId = String(cardId || '').trim();
  if (!cardId) return err('cardId 必填');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CARDS);
  var idx = rowIndexByCol_(sh, 'cardId', cardId);
  if (idx < 0) return err('找不到該卡片');
  setCellByHeader_(sh, idx, 'enabled', enabled ? 'TRUE' : 'FALSE');
  return ok({ saved: true, cardId: cardId, enabled: !!enabled });
}
function setCategoryEnabled_(token, category, enabled) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  category = String(category || '').trim();
  if (category !== 'done' && category !== 'todo') return err('分類不正確');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CARDS);
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return err('沒有卡片');
  var head = v[0].map(function (h) { return String(h).trim(); });
  var cCat = head.indexOf('category'), cEn = head.indexOf('enabled');
  if (cCat < 0 || cEn < 0) return err('Cards 表缺少 category / enabled 欄');
  var count = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][cCat] || '').trim() === category) {
      sh.getRange(i + 1, cEn + 1).setValue(enabled ? 'TRUE' : 'FALSE');
      count++;
    }
  }
  return ok({ saved: true, category: category, enabled: !!enabled, count: count });
}

// ===================== 權限矩陣 =====================

function readPerms_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.PERMS);
  if (!sh) return {};
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return {};
  var roles = v[0].slice(1).map(function (x) { return String(x).trim(); });
  var out = {};
  for (var i = 1; i < v.length; i++) {
    var cid = String(v[i][0]).trim(); if (!cid) continue;
    out[cid] = {};
    for (var j = 0; j < roles.length; j++) {
      var val = String(v[i][j + 1] || '').trim().toLowerCase();
      if (val === 'edit' || val === 'view') out[cid][roles[j]] = val;
    }
  }
  return out;
}
function getPerms_(token) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  var cards = readSheet_(SHEET.CARDS).map(normalizeCard_).sort(function (a, b) { return a.order - b.order; });
  var roles = readSheet_(SHEET.ROLES).map(function (r) {
    return { role: String(r.role).trim(), label: r.label || r.role, protected: String(r.protected).toUpperCase() === 'TRUE' };
  });
  return ok({ cards: cards, roles: roles, matrix: readPerms_() });
}
function savePerms_(token, matrix) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!matrix) return err('沒有資料');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var roles = readSheet_(SHEET.ROLES).map(function (r) { return String(r.role).trim(); });
  var cards = readSheet_(SHEET.CARDS).map(function (c) { return String(c.cardId).trim(); });
  var header = ['cardId'].concat(roles);
  var rows = [header];
  cards.forEach(function (cid) {
    var row = [cid];
    roles.forEach(function (role) {
      var v = ((matrix[cid] || {})[role] || '').toString().toLowerCase();
      row.push(v === 'edit' || v === 'view' ? v : '');
    });
    rows.push(row);
  });
  var sh = ss.getSheetByName(SHEET.PERMS) || ss.insertSheet(SHEET.PERMS);
  sh.clear();
  sh.getRange(1, 1, rows.length, header.length).setValues(rows);
  sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#ede9fe');
  sh.setFrozenRows(1); sh.setFrozenColumns(1);
  return ok({ saved: true });
}

// ===================== 角色管理 =====================

function getRoleObj_(role) {
  return readSheet_(SHEET.ROLES).filter(function (r) { return String(r.role).trim() === role; })[0] || null;
}
function getRole_(role) {
  var r = getRoleObj_(String(role).trim());
  return r ? { role: r.role, label: r.label || r.role } : { role: role, label: role };
}
function isProtectedRole_(role) {
  var r = getRoleObj_(String(role).trim());
  return !!r && String(r.protected).toUpperCase() === 'TRUE';
}
function roleRowIndex_(role) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ROLES);
  if (!sh) return -1;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === role) return i + 1;
  return -1;
}
function addRole_(token, role, label) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  role = String(role || '').trim().toUpperCase();
  label = String(label || '').trim();
  if (!role || !label) return err('角色碼與名稱必填');
  if (getRoleObj_(role)) return err('角色已存在');
  if (role === DC_ROLE || role === SYSADMIN_ROLE) return err('保留角色碼，不可使用');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheetByName(SHEET.ROLES).appendRow([role, label, 'FALSE']);
  var psh = ss.getSheetByName(SHEET.PERMS);
  if (psh) psh.getRange(1, psh.getLastColumn() + 1).setValue(role);
  return ok({ saved: true });
}
function updateRole_(token, role, label) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  role = String(role || '').trim();
  var obj = getRoleObj_(role);
  if (!obj) return err('角色不存在');
  if (String(obj.protected).toUpperCase() === 'TRUE' && t.role !== DC_ROLE) return err('受保護角色只有區總監可修改');
  if (role === DC_ROLE && t.role !== DC_ROLE) return err('不可修改區總監');
  var idx = roleRowIndex_(role);
  if (idx > 0) SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ROLES).getRange(idx, 2).setValue(String(label || obj.label));
  return ok({ saved: true });
}
function deleteRole_(token, role) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  role = String(role || '').trim();
  var obj = getRoleObj_(role);
  if (!obj) return err('角色不存在');
  if (String(obj.protected).toUpperCase() === 'TRUE') return err('受保護角色不可刪除');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var idx = roleRowIndex_(role);
  if (idx > 0) ss.getSheetByName(SHEET.ROLES).deleteRow(idx);
  var psh = ss.getSheetByName(SHEET.PERMS);
  if (psh) {
    var header = psh.getRange(1, 1, 1, psh.getLastColumn()).getValues()[0];
    for (var c = header.length - 1; c >= 1; c--) if (String(header[c]).trim() === role) psh.deleteColumn(c + 1);
  }
  return ok({ deleted: true });
}

// ===================== 帳戶管理（Users） =====================

function userRowIndex_(email) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS);
  if (!sh) return -1;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim().toLowerCase() === String(email).trim().toLowerCase()) return i + 1;
  }
  return -1;
}
function getUsers_(token) {
  var t = requireAccountManager_(token); if (t.error) return err(t.error);
  return ok(readSheet_(SHEET.USERS).filter(function (u) { return u.email; }).map(function (u) {
    return {
      email: String(u.email).trim(), displayName: u.displayName || '', role: u.role || '',
      scopes: u.scopes || '', cards: u.cards || '',
      active: String(u.active).toUpperCase() !== 'FALSE',
    };
  }));
}
function batchCreateUsers_(token, users) {
  var t = requireAccountManager_(token); if (t.error) return err(t.error);
  if (!Array.isArray(users) || !users.length) return err('沒有帳戶資料');
  if (users.length > 300) return err('每次最多開立 300 個帳戶');
  var roles = readSheet_(SHEET.ROLES).map(function (r) { return String(r.role).trim(); });
  var existing = {};
  readSheet_(SHEET.USERS).forEach(function (u) { existing[String(u.email).trim().toLowerCase()] = true; });
  var rows = [], rejected = [], seen = {};
  users.forEach(function (u, i) {
    u = u || {};
    var email = String(u.email || '').trim().toLowerCase();
    var name = String(u.displayName || u.name || '').trim();
    var role = normalizeCreatableRole_(u.role);
    var password = String(u.password || '');
    var reason = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reason = '電郵格式不正確';
    else if (!name) reason = '顯示名稱必填';
    else if (!isCreatableRole_(role)) reason = '只可以開區長／區領袖／助理區領袖（DC、DDC、ADC、STAFF 為專用預設位）';
    else if (roles.indexOf(role) < 0) reason = '角色不存在';
    else if (password.length < 8) reason = '初始密碼最少 8 個字元';
    else if (existing[email] || seen[email]) reason = '電郵已存在或重複';
    if (reason) { rejected.push({ row: i + 1, email: email, reason: reason }); return; }
    var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    rows.push([email, sha256_(password + salt), salt, role, name,
      String(u.scopes || '').trim(), String(u.cards || '').trim(), 'TRUE']);
    seen[email] = true;
  });
  if (rows.length) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
  }
  return ok({ created: rows.length, rejected: rejected, skipped: rejected.length });
}
function updateUser_(token, email, patch) {
  var t = requireAccountManager_(token); if (t.error) return err(t.error);
  var row = userRowIndex_(email); if (row < 0) return err('找不到帳戶');
  var current = readSheet_(SHEET.USERS).filter(function (u) {
    return String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase();
  })[0];
  patch = patch || {};
  var curRole = current ? String(current.role).trim() : '';
  if (!isAdminRole_(t.role) && !isCreatableRole_(curRole)) {
    return err('副區總監只可以管理區長／區領袖／助理區領袖帳戶');
  }
  if (patch.role) patch.role = normalizeCreatableRole_(patch.role);
  if (patch.role && !isCreatableRole_(patch.role) && !isAdminRole_(t.role)) {
    return err('只可以改為區長／區領袖／助理區領袖');
  }
  if (((current && isProtectedRole_(current.role)) || (patch.role && isProtectedRole_(patch.role))) && t.role !== DC_ROLE && !isCreatableRole_(curRole) && !isCreatableRole_(patch.role || '')) {
    return err('只有區總監可修改受保護角色帳戶');
  }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS);
  var roles = readSheet_(SHEET.ROLES).map(function (r) { return String(r.role).trim(); });
  if (patch.role && roles.indexOf(String(patch.role).trim()) < 0) return err('角色不存在');
  if (patch.displayName != null) sh.getRange(row, 5).setValue(String(patch.displayName).trim());
  if (patch.role) sh.getRange(row, 4).setValue(String(patch.role).trim());
  if (patch.scopes != null) sh.getRange(row, 6).setValue(String(patch.scopes).trim());
  if (patch.cards != null) sh.getRange(row, 7).setValue(String(patch.cards).trim());
  if (patch.active != null) sh.getRange(row, 8).setValue(patch.active ? 'TRUE' : 'FALSE');
  if (patch.password != null && String(patch.password).length) {
    if (String(patch.password).length < 8) return err('新密碼最少 8 個字元');
    var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    sh.getRange(row, 2, 1, 2).setValues([[sha256_(String(patch.password) + salt), salt]]);
  }
  return ok({ saved: true });
}
function deleteUser_(token, email) {
  var t = requireAccountManager_(token); if (t.error) return err(t.error);
  var row = userRowIndex_(email); if (row < 0) return err('找不到帳戶');
  var current = readSheet_(SHEET.USERS).filter(function (u) {
    return String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase();
  })[0];
  var curRole = current ? String(current.role).trim() : '';
  if (!isAdminRole_(t.role) && !isCreatableRole_(curRole)) return err('副區總監只可以刪除區長／區領袖／助理區領袖帳戶');
  if (current && isProtectedRole_(current.role) && t.role !== DC_ROLE && !isCreatableRole_(curRole)) return err('只有區總監可刪除受保護角色帳戶');
  if (String(email).trim().toLowerCase() === String(t.email).trim().toLowerCase()) return err('不可刪除目前登入帳戶');
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS).deleteRow(row);
  return ok({ deleted: true });
}
function changePassword_(token, oldPassword, newPassword) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期');
  if (!oldPassword || !newPassword) return err('請輸入舊密碼及新密碼');
  if (String(newPassword).length < 8) return err('新密碼最少 8 個字元');
  var row = userRowIndex_(t.email);
  if (row < 0) return err('找不到帳戶');
  var current = readSheet_(SHEET.USERS).filter(function (u) {
    return String(u.email).trim().toLowerCase() === String(t.email).trim().toLowerCase();
  })[0];
  if (!current) return err('找不到帳戶');
  if (sha256_(String(oldPassword) + (current.salt || '')) !== String(current.passwordHash).trim()) return err('舊密碼不正確');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS);
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  sh.getRange(row, 2, 1, 2).setValues([[sha256_(String(newPassword) + salt), salt]]);
  return ok({ changed: true });
}

// ===================== Staff 表（成員系統舊介面） =====================

function getStaffList_(token) {
  var t = requirePerm_(token, 'canStaff'); if (t.error) return err(t.error);
  return ok(readSheet_(SHEET.STAFF).filter(function (s) { return s.email; }).map(function (s) {
    return {
      email: String(s.email).trim(), name: s.name || '', role: s.role || '',
      canVenue: isTrue_(s.canVenue), canStock: isTrue_(s.canStock),
      canCourse: isTrue_(s.canCourse), canStaff: isTrue_(s.canStaff),
      active: String(s.active).toUpperCase() !== 'FALSE',
    };
  }));
}
function saveStaff_(token, staff) {
  var t = requirePerm_(token, 'canStaff'); if (t.error) return err(t.error);
  staff = staff || {};
  var email = String(staff.email || '').trim().toLowerCase();
  if (!email) return err('電郵必填');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.STAFF);
  var idx = rowIndexByCol_(sh, 'email', email);
  var row = {
    email: email, name: staff.name || '', role: staff.role || 'STAFF',
    canVenue: staff.canVenue ? 'TRUE' : 'FALSE', canStock: staff.canStock ? 'TRUE' : 'FALSE',
    canCourse: staff.canCourse ? 'TRUE' : 'FALSE', canStaff: staff.canStaff ? 'TRUE' : 'FALSE',
    active: staff.active === undefined || staff.active ? 'TRUE' : 'FALSE',
  };
  if (staff.password) {
    if (String(staff.password).length < 8) return err('密碼最少 8 個字元');
    row.salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    row.passwordHash = sha256_(String(staff.password) + row.salt);
  }
  if (idx > 0) Object.keys(row).forEach(function (k) { setCellByHeader_(sh, idx, k, row[k]); });
  else {
    if (!row.passwordHash) return err('新帳戶必須設定密碼');
    appendRowObj_(sh, row);
  }
  return ok({ saved: true });
}
function deleteStaff_(token, email) {
  var t = requirePerm_(token, 'canStaff'); if (t.error) return err(t.error);
  removeRowByFirstCol_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.STAFF), String(email).trim().toLowerCase());
  return ok({ deleted: true });
}
function changeStaffPassword_(token, oldPassword, newPassword) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期');
  if (String(newPassword || '').length < 8) return err('新密碼最少 8 個字元');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.STAFF);
  var idx = rowIndexByCol_(sh, 'email', String(t.email).trim().toLowerCase());
  if (idx < 0) return changePassword_(token, oldPassword, newPassword); // 唔喺 Staff 表就試 Users
  var cur = readSheet_(SHEET.STAFF).filter(function (s) {
    return String(s.email).trim().toLowerCase() === String(t.email).trim().toLowerCase();
  })[0];
  if (sha256_(String(oldPassword) + (cur.salt || '')) !== String(cur.passwordHash).trim()) return err('舊密碼不正確');
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  setCellByHeader_(sh, idx, 'salt', salt);
  setCellByHeader_(sh, idx, 'passwordHash', sha256_(String(newPassword) + salt));
  return ok({ changed: true });
}

// ===================== Plugin Registry =====================

function getRegistry_(token) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  var remote = [];
  try {
    var resp = UrlFetchApp.fetch(REGISTRY_URL, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      var parsed = JSON.parse(resp.getContentText());
      remote = Array.isArray(parsed) ? parsed : (parsed.plugins || []);
    }
  } catch (e) { remote = []; }
  var installed = readSheet_(SHEET.CARDS).map(function (c) { return String(c.cardId).trim(); });
  return ok({
    plugins: (remote || [])
      .filter(function (p) { return String(p.status || 'active').toLowerCase() !== 'disabled'; })
      .map(function (p) {
        return {
          id: p.id, title: p.title, icon: p.icon || '🧩', url: p.url,
          description: p.description || '', version: p.version || '',
          embed: p.embed === true, type: p.type || 'jump',
          needsDistrictBackend: p.needsDistrictBackend === true,
          installed: installed.indexOf(String(p.id).trim()) >= 0,
        };
      }),
    registryUrl: REGISTRY_URL,
  });
}
function installPlugin_(token, plugin) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!plugin || !plugin.id) return err('plugin 資料不完整');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cards = readSheet_(SHEET.CARDS);
  if (cards.some(function (c) { return String(c.cardId).trim() === String(plugin.id).trim(); })) return err('此 plugin 已安裝');
  var nextOrder = cards.reduce(function (m, c) { return Math.max(m, Number(c.order) || 0); }, 0) + 1;
  ss.getSheetByName(SHEET.CARDS).appendRow([plugin.id, plugin.title, plugin.icon || '🧩',
    plugin.type || 'jump', plugin.url, plugin.description || '', nextOrder, 'TRUE',
    plugin.embed ? 'TRUE' : 'FALSE', 'plugin', 'done']);
  var psh = ss.getSheetByName(SHEET.PERMS);
  if (psh) {
    var header = psh.getRange(1, 1, 1, psh.getLastColumn()).getValues()[0];
    var prow = [plugin.id];
    header.slice(1).forEach(function (role) { prow.push(String(role).trim() === DC_ROLE ? 'edit' : ''); });
    psh.appendRow(prow);
  }
  return ok({ installed: true, cardId: plugin.id });
}
function uninstallPlugin_(token, cardId) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  cardId = String(cardId).trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  removeRowByFirstCol_(ss.getSheetByName(SHEET.CARDS), cardId);
  removeRowByFirstCol_(ss.getSheetByName(SHEET.PERMS), cardId);
  return ok({ uninstalled: true });
}

// ===================== 安全 UI 工具（無 UI 環境自動降級） =====================

function safeUi_() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}
function uiAlert_(title, message) {
  var ui = safeUi_();
  if (ui) { ui.alert(title, message, ui.ButtonSet.OK); return false; }
  Logger.log('\n===== ' + title + ' =====\n' + message + '\n');
  console.log('\n===== ' + title + ' =====\n' + message + '\n');
  return true;
}
function uiPrompt_(title, message) {
  var ui = safeUi_();
  if (!ui) { Logger.log('（無 UI 環境，略過提示：' + title + '）'); return null; }
  var r = ui.prompt(title, message, ui.ButtonSet.OK_CANCEL);
  return r.getSelectedButton() === ui.Button.OK ? r.getResponseText() : null;
}
function showKeyDialog_(title, key, note) {
  var ui = safeUi_();
  if (!ui) {
    var msg = '\n╔══════════════════════════════════════╗\n'
      + '  ' + title + '\n'
      + '╚══════════════════════════════════════╝\n'
      + '  API KEY ↓↓↓ 只顯示一次，請即刻複製 ↓↓↓\n\n'
      + '  ' + key + '\n\n'
      + '  ↑↑↑ 只取上面一行文字，唔好帶空格 ↑↑↑\n'
      + (note ? '  ' + note + '\n' : '');
    Logger.log(msg); console.log(msg);
    return;
  }
  var safeKey = String(key).replace(/</g, '&lt;');
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,-apple-system,\'Noto Sans TC\',sans-serif;padding:8px 4px">'
    + '<p style="margin:0 0 8px">請即刻複製下面嘅 API Key（<b>只顯示一次</b>）：</p>'
    + '<input id="k" value="' + safeKey + '" readonly style="width:100%;padding:10px;font-size:15px;'
    + 'font-family:ui-monospace,Menlo,Consolas,monospace;border:2px solid #1565c0;border-radius:6px" />'
    + '<p style="margin:10px 0 0;color:#b00">' + (note || '') + '</p>'
    + '<p style="margin:8px 0 0;color:#666;font-size:12px">同一個 Key 要設定去兩個 Vercel 環境變數：'
    + 'PORTAL_{區碼}_APIKEY 同 MEMBER_{區碼}_APIKEY。</p>'
    + '<script>var i=document.getElementById("k");i.focus();i.select();<\/script>'
    + '</div>'
  ).setWidth(560).setHeight(250);
  ui.showModalDialog(html, title);
}

// ===================== API Key 管理 =====================

function newApiKey_() {
  return 'ak_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function generateApiKey_(ss) {
  var sh = ss.getSheetByName(SHEET.CONFIG);
  if (!sh) return '';
  ensureConfigRow_(sh, 'API_KEY_HASH', '', 'setup 自動生成；API_KEY 的 SHA-256 雜湊值。明文不會儲存在此。');
  var values = sh.getDataRange().getValues();
  var generated = '';
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === 'API_KEY_HASH' && !String(values[i][1] || '').trim()) {
      generated = newApiKey_();
      sh.getRange(i + 1, 2).setValue(sha256_(generated));
      sh.getRange(i + 1, 3).setValue('setup 自動生成；API_KEY 的 SHA-256 雜湊值。明文不會儲存在此。');
    }
  }
  return generated;
}
function regenerateApiKeyMenu() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.CONFIG);
  if (!sh) { uiAlert_('錯誤', '找不到 Config 工作表。請先執行 setupSheets()。'); return; }
  ensureConfigRow_(sh, 'API_KEY_HASH', '', 'setup 自動生成；API_KEY 的 SHA-256 雜湊值。明文不會儲存在此。');
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === 'API_KEY_HASH') {
      var key = newApiKey_();
      sh.getRange(i + 1, 2).setValue(sha256_(key));
      sh.getRange(i + 1, 3).setValue('重新生成於 ' + new Date().toISOString());
      showKeyDialog_('🔑 新 API Key 已生成', key, '舊 Key 即刻失效！兩個前端嘅環境變數都要更新。');
      return;
    }
  }
  uiAlert_('錯誤', '找不到 API_KEY_HASH 設定行。');
}
/** 別名：喺編輯器直接執行，Key 印去執行記錄 */
function showNewApiKey() { regenerateApiKeyMenu(); }

function protectSensitiveSheets_(ss) {
  var me = '';
  try { me = Session.getEffectiveUser().getEmail() || ''; } catch (e) { me = ''; }
  [SHEET.CONFIG, SHEET.USERS, SHEET.STAFF, SHEET.COURSE_LINKS, SHEET.INCIDENT_REQ].forEach(function (name) {
    try {
      var sh = ss.getSheetByName(name);
      if (!sh) return;
      sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) {
        if (p.getDescription().indexOf('童軍區統一後台') === 0) p.remove();
      });
      var prot = sh.protect().setDescription('童軍區統一後台：保護敏感設定（API_KEY_HASH / 密碼雜湊）');
      if (me) {
        prot.addEditor(me);
        prot.getEditors().forEach(function (ed) {
          if (ed.getEmail() && ed.getEmail() !== me) { try { prot.removeEditor(ed); } catch (x) {} }
        });
      }
      if (prot.canDomainEdit && prot.canDomainEdit()) prot.setDomainEdit(false);
    } catch (e) {}
  });
}

// ===================== 健康檢查 =====================

function getHealthCheck_() {
  var r = { ok: true };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    r.districtName = getConfigValue_('districtName') || '';
    r.districtCode = districtCode_();
    r.apiKeySet = !!getConfigValue_('API_KEY_HASH');
    r.sheetId = ss.getId();
    r.sheets = ss.getSheets().map(function (s) { return s.getName(); });
  } catch (e) { r.ok = false; r.error = e.toString(); }
  return r;
}
function healthCheckMenu() {
  var h = getHealthCheck_();
  var missing = [];
  blueprint_().forEach(function (bp) { if ((h.sheets || []).indexOf(bp.name) < 0) missing.push(bp.name); });
  uiAlert_('🩺 健康檢查',
    '區名：' + (h.districtName || '（未填）') + '\n'
    + '區碼：' + (h.districtCode || '（未填）') + '\n'
    + 'API Key：' + (h.apiKeySet ? '已設定 ✅' : '未設定 ❌') + '\n'
    + '缺少的工作表：' + (missing.length ? missing.join('、') : '無 ✅')
    + (missing.length ? '\n\n→ 執行選單「🧱 補建缺失表」' : ''));
}

// ===================== 選單 =====================

function onOpen() {
  var ui = safeUi_();
  if (!ui) return;
  ui.createMenu('🧭 區統一後台')
    .addItem('🔑 重新生成 API Key', 'regenerateApiKeyMenu')
    .addItem('🩺 健康檢查', 'healthCheckMenu')
    .addSeparator()
    .addItem('🧱 補建缺失表（不清空資料）', 'setupSheets')
    .addItem('🔐 改單一帳號密碼', 'setUserPasswordMenu')
    .addItem('♻️ 全部帳號重設密碼', 'resetAllPasswordsMenu')
    .addSeparator()
    .addItem('📋 顯示設定步驟', 'showSetupReminder')
    .addToUi();
}
function showSetupReminder() {
  uiAlert_('設定步驟',
    '1. Config 填 districtName（區名）、districtCode（區碼）\n'
    + '2. Users / Staff 改帳號密碼（示範密碼：' + DEFAULT_PASSWORD + '）\n'
    + '3. 借場一條龍（選填）：Config 填 TEAMUP_*（Teamup）同 ttlock*（通通鎖）金鑰\n'
    + '4. 部署為 Web App（執行身分：我自己；存取：任何人）→ 複製 /exec\n'
    + '5. 選單 🔑 重新生成 API Key → 複製\n'
    + '6. 兩個 Vercel 專案各設一個環境變數（同一個 Key 值）：\n'
    + '   · 管理系統 PORTAL_{區碼}_APIKEY\n'
    + '   · 成員系統 MEMBER_{區碼}_APIKEY\n'
    + '7. 兩邊 lib/district.ts 嘅 apiBase 都填同一條 /exec 網址');
}

// ===================== 表格藍圖（表頭取聯集） =====================

var ROLE_LIST = ['DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING', 'ADC_ROVER', 'ADC_VENTURE',
  'ADC_SCOUT', 'ADC_CUBS', 'ADC_GH', 'DL', 'LEADER', 'AL', 'STAFF'];

function blueprint_() {
  var salt = 'skw' + new Date().getFullYear();
  var hash = sha256_(DEFAULT_PASSWORD + salt);

  var permRows = (function () {
    function row(cid, map) { var r = [cid]; ROLE_LIST.forEach(function (x) { r.push(map[x] || ''); }); return r; }
    var ALL_VIEW = {}, ALL_EDIT = {};
    ROLE_LIST.forEach(function (r) { ALL_VIEW[r] = 'view'; ALL_EDIT[r] = 'edit'; });
    function adminEdit() { var m = {}; ROLE_LIST.forEach(function (r) { m[r] = 'view'; }); m.DC = 'edit'; m.SYSADMIN = 'edit'; m.DDC_ADMIN = 'edit'; return m; }
    function opsEdit() { var m = adminEdit(); m.DDC_TRAINING = 'edit'; m.STAFF = 'edit'; return m; }
    function trainingEdit() { var m = {}; ROLE_LIST.forEach(function (r) { m[r] = 'view'; }); m.DC = 'edit'; m.SYSADMIN = 'edit'; m.DDC_TRAINING = 'edit'; return m; }
    var P = [['cardId'].concat(ROLE_LIST)];
    P.push(row('visit', ALL_EDIT));
    P.push(row('contacts', ALL_EDIT));
    P.push(row('awards', adminEdit()));
    P.push(row('annual', adminEdit()));
    P.push(row('budget', adminEdit()));
    P.push(row('meeting', adminEdit()));
    P.push(row('committee', { DC: 'edit', SYSADMIN: 'edit', DDC_ADMIN: 'edit' }));
    P.push(row('unit', adminEdit()));
    P.push(row('venueReg', opsEdit()));
    P.push(row('stockReg', opsEdit()));
    P.push(row('activity', opsEdit()));
    P.push(row('incident', ALL_VIEW));
    P.push(row('training', trainingEdit()));
    P.push(row('fps', ALL_EDIT));
    return P;
  })();

  return [
    { name: SHEET.CONFIG, headerColor: '#fff3cd', rows: [
      ['key', 'value', '說明'],
      ['districtName', '筲箕灣區', '區名'],
      ['districtCode', 'SKW', '區碼（大寫），環境變數用：PORTAL_{區碼}_APIKEY / MEMBER_{區碼}_APIKEY'],
      ['logoText', '🧭', '前端 logo'],
      ['theme', 'purple', '主題色'],
      ['API_KEY_HASH', '', 'setup 自動生成；API_KEY 的 SHA-256 雜湊值。明文不會儲存在此。'],
      ['TROOP_LIST', '', '旅號清單（逗號分隔），活動知會表用'],
      ['NOTIFY_STAFF_EMAIL', '', '新申請通知收件人'],
      // 借場一條龍（Teamup + 通通鎖 TTLock）
      ['TEAMUP_API_KEY', '', 'Teamup API Token（兼容舊欄名 teamupApiKey）'],
      ['TEAMUP_CALENDAR_KEY', '', 'Teamup 分享金鑰 ks...（兼容舊 teamupCalendarId）'],
      ['TEAMUP_PENDING_SUBCAL_ID', '', '藍色（申請中）子日曆'],
      ['TEAMUP_APPROVED_SUBCAL_ID', '', '紅色（已批）子日曆（兼容舊 teamupApprovedSubId）'],
      ['TEAMUP_REJECTED_SUBCAL_ID', '', '(選填) 拒絕子日曆（兼容舊 teamupRejectedSubId）'],
      ['TEAMUP_BOOKING_URL', '', '公開登記連結'],
      ['SCIENER_CLIENT_ID', '', 'Sciener 開放平台 app_id（兼容 ttlockClientId）'],
      ['SCIENER_CLIENT_SECRET', '', 'Sciener app_secret（兼容 ttlockClientSecret）'],
      ['SCIENER_USERNAME', '', '管鎖帳號（lock2.sciener.com / App，唔係開放平台帳）'],
      ['SCIENER_PASSWORD', '', '管鎖密碼'],
      ['SCIENER_LOCK_ID', '', '大門 Lock ID（數字；Config 係「一列 key」唔係欄。可用審批頁「讀取鎖列表」）'],
      ['SCIENER_API_BASE', 'https://api.sciener.com', 'API 主機（唔好填 open.sciener.com 網站）'],
      ['PWD_MODE', 'phone4', 'phone4=電話頭4位；phone4tail=尾4位；random=隨機6位'],
      ['ttlockClientId', '', '（舊名）等同 SCIENER_CLIENT_ID'],
      ['ttlockClientSecret', '', '（舊名）等同 SCIENER_CLIENT_SECRET'],
      ['ttlockUsername', '', '（舊名）等同 SCIENER_USERNAME'],
      ['ttlockPassword', '', '（舊名）等同 SCIENER_PASSWORD'],
      ['ttlockLockId', '', '（舊名）等同 SCIENER_LOCK_ID'],
      ['ttlockApiBase', '', '（舊名）等同 SCIENER_API_BASE'],
      ['ttlockDisabled', '', 'TRUE = 跳過寫鎖，改用模擬密碼'],
      ['notifyFrom', '', '寄件人顯示名稱（不是 Gmail 地址；留空用區名）'],
      // 付款 / 規定
      ['FPS_ACCOUNT_NAME', DEFAULT_FPS_ACCOUNT_NAME, '轉數快戶口名'],
      ['FPS_ACCOUNT_NUMBER', DEFAULT_FPS_ACCOUNT_NUMBER, '轉數快號碼'],
      ['VENUE_RULES', '', '借場規定（留空用內建）'],
      ['CCTV_URL', '', '閉路電視指引 PDF'],
      ['STOCK_RULES', '', '借物資規定（留空用內建）'],
      // 服務轉發（留空 = 寫入本表）
      ['STOCK_SCRIPT_URL', '', '【借物資】外部收表 Script（留空=寫入本表）'],
      ['STOCK_SCRIPT_APIKEY', '', ''],
      ['VENUE_SCRIPT_URL', '', '【借場】外部收表 Script（留空=寫入本表）'],
      ['VENUE_SCRIPT_APIKEY', '', ''],
      ['ACTIVITY_SCRIPT_URL', '', '【活動知會】外部收表 Script（留空=寫入本表）'],
      ['ACTIVITY_SCRIPT_APIKEY', '', ''],
    ] },

    { name: SHEET.SYSTEM, rows: [
      ['key', 'value'],
      ['locked', 'FALSE'],
      ['lockMessage', '系統維護中，請稍候再試。'],
    ] },

    { name: SHEET.ROLES, rows: [
      ['role', 'label', 'protected'],
      ['DC', '區總監', 'TRUE'],
      ['SYSADMIN', '系統管理員', 'TRUE'],
      ['DDC_ADMIN', '副區總監（行政）', 'TRUE'],
      ['DDC_TRAINING', '副區總監（訓練）', 'TRUE'],
      ['ADC_ROVER', '助理區總監（樂行）', 'TRUE'],
      ['ADC_VENTURE', '助理區總監（深資）', 'TRUE'],
      ['ADC_SCOUT', '助理區總監（童軍）', 'TRUE'],
      ['ADC_CUBS', '助理區總監（幼童軍）', 'TRUE'],
      ['ADC_GH', '助理區總監（小童軍）', 'TRUE'],
      ['DL', '區長', 'TRUE'],
      ['LEADER', '區領袖', 'TRUE'],
      ['AL', '助理區領袖', 'TRUE'],
      ['STAFF', '區職員（受薪）', 'TRUE'],
    ] },

    { name: SHEET.CARDS, rows: [
      ['cardId', 'title', 'icon', 'type', 'url', 'description', 'order', 'enabled', 'embed', 'source', 'category'],
      ['visit', '旅團探訪', '🏕', 'builtin', '/visit', '年度旅團探訪', 1, 'TRUE', 'FALSE', 'core', 'todo'],
      ['contacts', '旅團聯絡簿', '📇', 'builtin', '/contacts', '聯絡資料 · 分組 · 群發', 2, 'TRUE', 'FALSE', 'core', 'todo'],
      ['awards', '獎勵提名', '🎖', 'builtin', '/awards', '讀獲獎名單 · 推下一級', 3, 'TRUE', 'FALSE', 'core', 'todo'],
      ['annual', '週年會議文件', '📂', 'builtin', '/annual-docs', '議程 · 紀錄', 4, 'TRUE', 'FALSE', 'core', 'todo'],
      ['budget', '區年度預算', '📑', 'builtin', '/budget', '預算編列與追蹤', 5, 'TRUE', 'FALSE', 'core', 'todo'],
      ['meeting', '會議行事曆', '📅', 'builtin', '/meeting', '幹部/執委/週年會議', 6, 'TRUE', 'FALSE', 'core', 'todo'],
      ['committee', '委任系統', '🗂', 'builtin', '/committee', '委任 · 續任 · R02', 7, 'TRUE', 'FALSE', 'core', 'todo'],
      ['unit', '旅團管理系統', '🧭', 'builtin', '/unit', '旅名冊 · 人數統計', 8, 'TRUE', 'FALSE', 'core', 'todo'],
      ['venueReg', '場地借用審批', '🏛', 'builtin', '/venue-regs', '借場申請批核 · 場地清單', 9, 'TRUE', 'FALSE', 'core', 'done'],
      ['stockReg', '物資借用審批', '📦', 'builtin', '/stock-regs', '借物資批核 · 庫存管理', 10, 'TRUE', 'FALSE', 'core', 'done'],
      ['activity', '活動知會', '🗓', 'builtin', '/activity-notices', '旅團活動知會記錄', 11, 'TRUE', 'FALSE', 'core', 'done'],
      ['incident', '意外 / 應變', '🚨', 'builtin', '/incident', '即時應變 · 總會指引 · 意外報告', 12, 'TRUE', 'FALSE', 'core', 'done'],
      ['training', '訓練班管理', '🎓', 'builtin', '/training', '開班登記 · 區會目錄', 13, 'TRUE', 'FALSE', 'core', 'done'],
      ['fps', 'FPS QR 製作', '💳', 'builtin', '/fps', '轉數快 QR 碼：綁區會戶口，填銀碼即生成', 14, 'TRUE', 'FALSE', 'core', 'done'],
    ] },

    { name: SHEET.PERMS, headerColor: '#ede9fe', frozenCols: 1, rows: permRows },

    { name: SHEET.USERS, rows: [
      ['email', 'passwordHash', 'salt', 'role', 'displayName', 'scopes', 'cards', 'active'],
      ['dc@skwscout.org.hk', hash, salt, 'DC', '區總監', 'all', '', 'TRUE'],
      ['sysadmin@skwscout.org.hk', hash, salt, 'SYSADMIN', '系統管理員', 'all', '', 'TRUE'],
      ['ddc.admin@skwscout.org.hk', hash, salt, 'DDC_ADMIN', '副區總監（行政）', 'admin', '', 'TRUE'],
      ['ddc.training@skwscout.org.hk', hash, salt, 'DDC_TRAINING', '副區總監（訓練）', 'training', '', 'TRUE'],
      ['staff@skwscout.org.hk', hash, salt, 'STAFF', '區職員（受薪）', 'admin', '', 'TRUE'],
    ] },

    { name: SHEET.STAFF, rows: [
      ['email', 'name', 'passwordHash', 'salt', 'role', 'canVenue', 'canStock', 'canCourse', 'canStaff', 'active'],
    ] },

    // ── 業務表：表頭取兩邊聯集 ──
    { name: SHEET.VENUES, rows: [
      ['venueId', 'districtCode', 'name', 'location', 'capacity', 'scienerLockId', 'note', 'active'],
    ] },
    { name: SHEET.VENUE_REQ, rows: [
      ['id', 'districtCode', 'refCode', 'submittedAt', 'venueId', 'venueName', 'purpose',
        'startDate', 'endDate', 'name', 'phone', 'email', 'troop', 'position', 'agreeRules',
        'status', 'teamupEventId', 'pwdRef', 'passcode', 'reviewer', 'reviewedAt', 'createdAt'],
    ] },
    { name: SHEET.ITEMS, rows: [
      ['itemId', 'districtCode', 'category', 'name', 'totalQty', 'availableQty', 'unit', 'note', 'location', 'active'],
    ] },
    { name: SHEET.STOCK_REQ, rows: [
      ['id', 'districtCode', 'refCode', 'submittedAt', 'itemId', 'itemName', 'category', 'qty',
        'purpose', 'borrowDate', 'returnDate', 'name', 'phone', 'email', 'troop', 'position',
        'agreeRules', 'status', 'reviewer', 'reviewedAt', 'createdAt'],
    ] },
    { name: SHEET.ACTIVITY_REQ, rows: [
      ['id', 'districtCode', 'refCode', 'submittedAt', 'year', 'section', 'sections', 'nature',
        'troop', 'activityName', 'startDateTime', 'endDateTime', 'location',
        'membersCount', 'leadersCount', 'parentsCount',
        'leaderName', 'leaderPhone', 'leaderEmail', 'note', 'createdAt'],
    ] },
    // 意外報告：欄位對應香港童軍總會行政署「意外報告」(ACC-RPT 2019/07) 兩頁內容
    { name: SHEET.INCIDENT_REQ, headerColor: '#fee2e2', rows: [
      INCIDENT_FIELDS.slice(),
    ] },
    { name: SHEET.COURSE_LINKS, rows: [
      ['courseId', 'districtCode', 'title', 'badgeName', 'section', 'courseNo', 'sessionsText',
        'eligibility', 'fee', 'originalFee', 'subsidyNote', 'deadline', 'quota', 'filled',
        'venue', 'noticeUrl', 'contact',
        'scriptExecUrl', 'scriptApiKey', 'driveFolderId',
        'apiBase', 'apiKey',
        'active', 'createdAt',
        'fpsQrPayload', 'fpsAmount', 'fpsReference', 'fpsAccountName', 'fpsAccountNumber', 'fpsUpdatedAt'],
    ] },
    { name: SHEET.COURSES, rows: [
      ['courseId', 'districtCode', 'title', 'section', 'badgeName', 'courseNo', 'sessionsText',
        'eligibility', 'fee', 'originalFee', 'deadline', 'quota', 'filled', 'venue',
        'status', 'noticeUrl', 'fpsNote'],
    ] },
    { name: SHEET.COURSE_REQ, rows: [
      ['id', 'districtCode', 'courseId', 'courseTitle', 'timestamp', 'email', 'nameZh', 'nameEn',
        'phone', 'gender', 'dob', 'scoutDistrict', 'troop', 'scoutId', 'scoutPosition', 'note',
        'guardianConsent', 'guardianName', 'guardianRelation', 'guardianEmail', 'guardianPhone',
        'leaderConsent', 'leaderName', 'leaderPosition', 'leaderEmail',
        'payMethod', 'payerName', 'payAccount', 'receiptUrl', 'formUrl', 'needReceipt', 'status', 'refCode'],
    ] },
    { name: SHEET.COURSE_PARAMS, rows: [
      ['key', 'group', 'code', 'value', 'nameEn', 'kind'],
    ] },
    { name: SHEET.ALL_RECORDS, rows: [
      ['id', 'districtCode', 'type', 'refCode', 'title', 'requester', 'phone', 'troop', 'status', 'detail', 'createdAt'],
    ] },
  ];
}

// ===================== 一鍵建表（★ 補建，唔會清空） =====================

/**
 * 安全：已存在嘅表只會「補缺失欄位」，唔會 clear。
 * 全新表先會寫入示範資料。
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var created = [], patched = [];

  blueprint_().forEach(function (bp) {
    var sh = ss.getSheetByName(bp.name);
    if (!sh) {
      ensureSheet_(ss, bp.name, bp.rows, bp.headerColor, bp.frozenCols);
      created.push(bp.name);
      return;
    }
    var want = bp.rows[0].map(function (h) { return String(h).trim(); });
    var have = sheetHeadersBySheet_(sh);
    if (!have.length) {
      sh.getRange(1, 1, 1, want.length).setValues([want]);
      sh.getRange(1, 1, 1, want.length).setFontWeight('bold').setBackground(bp.headerColor || '#e3f2fd');
      patched.push(bp.name + '（補表頭）');
      return;
    }
    var missing = want.filter(function (h) { return have.indexOf(h) < 0; });
    if (missing.length) {
      sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
      sh.getRange(1, 1, 1, have.length + missing.length).setFontWeight('bold');
      patched.push(bp.name + '（+' + missing.join('/') + '）');
    }
  });

  // Config 必備行（逐條補，唔覆蓋已填值）
  var cfg = ss.getSheetByName(SHEET.CONFIG);
  blueprint_()[0].rows.slice(1).forEach(function (r) { ensureConfigRow_(cfg, r[0], r[1], r[2]); });

  seedCourseParams_(ss);
  ensureCardRows_(ss);
  patchCardRows_(ss);
  ensurePermsRows_(ss);
  protectSensitiveSheets_(ss);

  var key = generateApiKey_(ss);

  uiAlert_('✅ 補建完成（已有資料全部保留）',
    '★ 只補缺失表／欄／Config 列，唔清空、唔覆寫已填格。\n\n'
    + '新建工作表：' + (created.length ? created.join('、') : '無') + '\n'
    + '補上欄位：' + (patched.length ? patched.join('、') : '無') + '\n'
    + 'API Key：' + (key ? '已新生成（下一個視窗顯示）' : '原有設定保持不變') + '\n\n'
    + '示範密碼：' + DEFAULT_PASSWORD + '\n\n'
    + '下一步：\n'
    + '1. Config 填 districtName / districtCode\n'
    + '2. 借場一條龍：Config 填 TEAMUP_*（Teamup）同 ttlock*（通通鎖）金鑰\n'
    + '3. 部署為 Web App（存取：任何人）→ 複製 /exec\n'
    + '4. 同一個 API Key 設定去兩個 Vercel 環境變數：\n'
    + '   PORTAL_{區碼}_APIKEY 同 MEMBER_{區碼}_APIKEY');

  if (key) showKeyDialog_('🔑 你的 API Key（只顯示一次）', key,
    '⚠️ 兩個前端都用呢一個 Key。而家就複製。');
}

/** 補建缺失卡片（Cards 表）：新版本新增咗卡片時，重跑 setup 就會自動補上，唔會掂已有行 */
function ensureCardRows_(ss) {
  var sh = ss.getSheetByName(SHEET.CARDS);
  if (!sh) return;
  var existing = {};
  readSheet_(SHEET.CARDS).forEach(function (c) { existing[String(c.cardId).trim()] = true; });
  var bp = blueprint_().filter(function (b) { return b.name === SHEET.CARDS; })[0];
  if (!bp || bp.rows.length < 2) return;
  var header = bp.rows[0].map(function (h) { return String(h).trim(); });
  bp.rows.slice(1).forEach(function (r) {
    var cid = String(r[0]).trim();
    if (!cid || existing[cid]) return;
    var obj = {};
    header.forEach(function (h, j) { obj[h] = r[j] !== undefined ? r[j] : ''; });
    appendRowObj_(sh, obj);
  });
}

/**
 * 卡片升級補丁（唔會掂用戶自行改過嘅值）：
 * v4.3.0 意外／應變卡片已完成 → 只當該行仍然係藍圖舊值（category=todo 且 description=舊字串）先改為 done。
 */
function patchCardRows_(ss) {
  var sh = ss.getSheetByName(SHEET.CARDS);
  if (!sh) return;
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return;
  var head = v[0].map(function (h) { return String(h).trim(); });
  var cId = head.indexOf('cardId'), cCat = head.indexOf('category'), cDesc = head.indexOf('description');
  if (cId < 0 || cCat < 0) return;
  var patches = { incident: { oldDesc: '通報 · 惡劣天氣', desc: '即時應變 · 總會指引 · 意外報告' } };
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][cId] || '').trim();
    var p = patches[id];
    if (!p) continue;
    if (String(v[i][cCat] || '').trim() !== 'todo') continue;
    sh.getRange(i + 1, cCat + 1).setValue('done');
    if (cDesc >= 0 && String(v[i][cDesc] || '').trim() === p.oldDesc) sh.getRange(i + 1, cDesc + 1).setValue(p.desc);
  }
}

/** 補建缺失權限行（Perms 表）：新卡片自動按藍圖角色補權限，唔會掂已有行 */
function ensurePermsRows_(ss) {
  var sh = ss.getSheetByName(SHEET.PERMS);
  if (!sh) return;
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return;
  var header = v[0].map(function (h) { return String(h).trim(); });
  var existing = {};
  for (var i = 1; i < v.length; i++) existing[String(v[i][0]).trim()] = true;
  var bp = blueprint_().filter(function (b) { return b.name === SHEET.PERMS; })[0];
  if (!bp || bp.rows.length < 2) return;
  var bpHeader = bp.rows[0].map(function (h) { return String(h).trim(); });
  bp.rows.slice(1).forEach(function (r) {
    var cid = String(r[0]).trim();
    if (!cid || existing[cid]) return;
    var newRow = [cid];
    for (var c = 1; c < header.length; c++) {
      var role = header[c];
      var bi = bpHeader.indexOf(role);
      newRow.push(bi > 0 && bi < r.length ? r[bi] : '');
    }
    sh.appendRow(newRow);
  });
}

/** 建立新表（每行長度可以唔同，自動補空白） */
function ensureSheet_(ss, name, rows, headerColor, frozenCols) {
  var sh = ss.getSheetByName(name);
  if (sh && sh.getLastRow() > 0) return sh; // 已有內容：絕對唔洗
  sh = sh || ss.insertSheet(name);
  sh.clear();
  var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
  if (!width) return sh;
  var padded = rows.map(function (r) {
    var c = r.slice();
    while (c.length < width) c.push('');
    return c;
  });
  sh.getRange(1, 1, padded.length, width).setValues(padded);
  sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground(headerColor || '#e3f2fd');
  sh.setFrozenRows(1);
  if (frozenCols) sh.setFrozenColumns(frozenCols);
  return sh;
}

/** 種入下拉參數（只喺空表時做一次） */
function seedCourseParams_(ss) {
  var sh = ss.getSheetByName(SHEET.COURSE_PARAMS);
  if (!sh || sh.getLastRow() > 1) return;
  var rows = [];
  ['小童軍', '幼童軍', '童軍', '深資童軍', '樂行童軍'].forEach(function (v) { rows.push(['section', '', '', v, '', '']); });
  ['港島地域', '九龍地域', '東九龍地域', '新界地域', '新界東地域'].forEach(function (v) { rows.push(['region', '', '', v, '', '']); });
  [
    '銀禧區',
    '港島西區', '維多利亞城區', '灣仔區', '港島北區', '筲箕灣區', '柴灣區', '港島南區',
    '深水埗西區', '深水埗東區', '九龍塘區', '九龍城區', '何文田區', '紅磡區', '油尖區', '旺角區', '深旺區',
    '慈雲山區', '黃大仙區', '九龍灣區', '觀塘區', '鯉魚門區', '將軍澳區', '秀茂坪區', '西貢區',
    '元朗西區', '元朗東區', '十八鄉區', '北葵涌區', '南葵涌區', '青衣區', '荃灣區', '離島區', '大嶼山區',
    '屯門東區', '屯門西區', '壁峰區', '沙田西區', '沙田南區', '沙田東區', '沙田北區',
    '大埔南區', '大埔北區', '雙魚區'
  ].forEach(function (v) { rows.push(['district', '', '', v, '', '']); });
  if (rows.length) sh.getRange(2, 1, rows.length, 6).setValues(rows);
}

// ===================== 改密碼工具 =====================

function setUserPassword() {
  applyPassword_('dc@skwscout.org.hk', DEFAULT_PASSWORD);
}
function setUserPasswordMenu() {
  var email = uiPrompt_('🔐 改密碼', '請輸入帳號電郵：');
  if (email === null) { uiAlert_('提示', '請喺 Sheet 內用選單執行。'); return; }
  var pw = uiPrompt_('🔐 改密碼', '請輸入新密碼（最少 8 個字元）：');
  if (pw === null) return;
  if (String(pw).length < 8) { uiAlert_('錯誤', '新密碼最少 8 個字元。'); return; }
  uiAlert_('改密碼', applyPassword_(String(email).trim(), pw) ? '✅ 已更新：' + email : '❌ 找不到帳戶：' + email);
}
function resetAllPasswords() {
  readSheet_(SHEET.USERS).forEach(function (u) { if (u.email) applyPassword_(String(u.email), DEFAULT_PASSWORD); });
}
function resetAllPasswordsMenu() {
  var pw = uiPrompt_('♻️ 全部帳號重設密碼', '請輸入新密碼（最少 8 個字元）：');
  if (pw === null) { uiAlert_('提示', '請喺 Sheet 內用選單執行。'); return; }
  if (String(pw).length < 8) { uiAlert_('錯誤', '新密碼最少 8 個字元。'); return; }
  var n = 0;
  readSheet_(SHEET.USERS).forEach(function (u) { if (u.email && applyPassword_(String(u.email), pw)) n++; });
  readSheet_(SHEET.STAFF).forEach(function (u) { if (u.email && applyPassword_(String(u.email), pw)) n++; });
  uiAlert_('完成', '✅ 已將 ' + n + ' 個帳號密碼設為：' + pw);
}
/** Users 同 Staff 兩張表都試 */
function applyPassword_(email, newPassword) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var done = false;
  [SHEET.USERS, SHEET.STAFF].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var idx = rowIndexByCol_(sh, 'email', String(email).trim().toLowerCase());
    if (idx < 0) {
      // email 可能大小寫唔同，逐行比對
      var v = sh.getDataRange().getValues();
      var ci = v[0].map(function (h) { return String(h).trim(); }).indexOf('email');
      for (var i = 1; i < v.length && ci >= 0; i++) {
        if (String(v[i][ci]).trim().toLowerCase() === String(email).trim().toLowerCase()) { idx = i + 1; break; }
      }
    }
    if (idx < 0) return;
    var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    setCellByHeader_(sh, idx, 'salt', salt);
    setCellByHeader_(sh, idx, 'passwordHash', sha256_(newPassword + salt));
    done = true;
  });
  return done;
}
