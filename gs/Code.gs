/**
 * 童軍區管理平台 — Apps Script 後端（Google Sheet 當資料庫）v3.0
 * ================================================================
 * 多區模式：每區各自一份此 Sheet + Script。前端用區目錄指向各區的 /exec。
 *
 * 部署：擴充功能 → Apps Script → 貼上本檔 → 執行一次 setupSheets()
 *       → 部署為網頁應用程式（執行身分：我自己；存取：所有人）
 *       → 把 /exec 網址和 API Key 一起交平台管理員登記到前端 lib/district.ts
 *
 * 🔑 API Key 安全架構：
 *   - Setup 時自動生成 API Key（只顯示一次）
 *   - Config 只存 SHA-256 雜湊值（API_KEY_HASH），無法還原
 *   - 前端經 /api/proxy 呼叫，API Key 存在 Vercel 環境變數（不出現在前端）
 *   - 環境變數命名：PORTAL_{區碼}_APIKEY（例如 PORTAL_SKW_APIKEY）
 *   - 忘記 API Key？選單 → 🔑 重新生成 API Key
 *
 * 角色階級：
 *   DC（區總監）最高，可改動 SYSADMIN。
 *   SYSADMIN（系統管理員）接近 DC，但不能改動 DC，也不能改/刪「受保護角色」。
 *   受保護角色 = DC + 8 個真實角色（內建，protected=TRUE），SYSADMIN 只能新增/刪除自訂角色。
 */

var SHEET = {
  USERS: 'Users', ROLES: 'Roles', CARDS: 'Cards',
  PERMS: 'Perms', CONFIG: 'Config', SYSTEM: 'System',
  COURSE_LINKS: 'CourseLinks', // 訓練班目錄（登記每班 Script/Drive/通告）— 單一資料來源
  // 一次性服務（每區開一次）：借場 / 借物資 / 知會
  VENUES: 'Venues', VENUE_REQ: 'VenueBookings',
  ITEMS: 'Items', STOCK_REQ: 'StockRequests',
  ACTIVITY_REQ: 'ActivityNotices',
};

var TOKEN_SECRET = 'CHANGE_ME_DISTRICT_SECRET';
var TOKEN_TTL_HOURS = 12;
var DC_ROLE = 'DC';
var SYSADMIN_ROLE = 'SYSADMIN';
// 可進管理頁的角色
function isAdminRole_(role) { return role === DC_ROLE || role === SYSADMIN_ROLE; }

// 維護用最高存取（改成只有你知道的值；勿沿用示範值）
var MASTER_EMAIL = 'CHANGE_ME_MAINTAINER_ID';
var MASTER_PW    = 'CHANGE_ME_MAINTAINER_PW';
var MASTER_ROLE  = 'DC'; // 對外偽裝成 DC

// 外掛清單（轉駁器）
var REGISTRY_URL = 'https://YOUR-HUB.vercel.app/api/registry.json';

// ===================== HTTP 入口 =====================

function doGet(e) {
  var p = e.parameter, action = (p.action || '').toString();

  // ★ API Key 認證
  var requiredApiKeyHash = getConfigValue_('API_KEY_HASH');
  if (requiredApiKeyHash) {
    if (sha256_(p.apiKey || '') !== requiredApiKeyHash) {
      return json(err('Unauthorized: invalid or missing apiKey'));
    }
  }

  try {
    switch (action) {
      case 'getHealthCheck': return json(ok(getHealthCheck_()));
      case 'getConfig':      return json(ok(getConfig_()));
      case 'getCards':       return json(getCards_(p.token));
      case 'verify':         return json(verify_(p.token));
      case 'getPerms':       return json(getPerms_(p.token));
      case 'getUsers':       return json(getUsers_(p.token));
      case 'getSystem':      return json(ok(getSystemState_()));
      case 'getRegistry':    return json(getRegistry_(p.token));
      case 'getCourseLinks': return json(getCourseLinks_(p.token));
      // 一次性服務
      case 'listVenues':        return json(ok(listVenues_()));
      case 'listItems':         return json(ok(listItems_()));
      case 'listActivityNotices': return json(ok(listActivityNotices_(p)));
      case 'getVenueBookings':  return json(getVenueBookings_(p.token));
      case 'getStockRequests':  return json(getStockRequests_(p.token));
      default:               return json(err('未知的 action: ' + action));
    }
  } catch (ex) { return json(err('伺服器錯誤：' + ex)); }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (x) {}
  var action = (body.action || '').toString();

  // ★ API Key 認證
  var requiredApiKeyHash = getConfigValue_('API_KEY_HASH');
  if (requiredApiKeyHash) {
    if (sha256_(body.apiKey || '') !== requiredApiKeyHash) {
      return json(err('Unauthorized: invalid or missing apiKey'));
    }
  }

  try {
    switch (action) {
      case 'login':           return json(login_(body.email, body.password));
      case 'savePerms':       return json(savePerms_(body.token, body.matrix));
      case 'addRole':         return json(addRole_(body.token, body.role, body.label));
      case 'updateRole':      return json(updateRole_(body.token, body.role, body.label));
      case 'deleteRole':      return json(deleteRole_(body.token, body.role));
      case 'setLock':         return json(setLock_(body.token, body.locked, body.message));
      case 'batchCreateUsers': return json(batchCreateUsers_(body.token, body.users));
      case 'updateUser':      return json(updateUser_(body.token, body.email, body.patch));
      case 'deleteUser':      return json(deleteUser_(body.token, body.email));
      case 'installPlugin':   return json(installPlugin_(body.token, body.plugin));
      case 'uninstallPlugin': return json(uninstallPlugin_(body.token, body.cardId));
      case 'saveCourseLink':  return json(saveCourseLink_(body.token, body.link));
      case 'deleteCourseLink':return json(deleteCourseLink_(body.token, body.courseId));
      // 一次性服務 — 公開提交（intake）
      case 'submitVenueRequest':  return json(submitVenueRequest_(body));
      case 'submitStockRequest':  return json(submitStockRequest_(body));
      case 'submitActivityNotice': return json(submitActivityNotice_(body));
      // 一次性服務 — 管理（批核 / 場地物資維運）
      case 'setVenueBookingStatus': return json(setVenueBookingStatus_(body.token, body.id, body.status));
      case 'setStockRequestStatus': return json(setStockRequestStatus_(body.token, body.id, body.status));
      case 'saveVenue':       return json(saveVenue_(body.token, body.venue));
      case 'deleteVenue':     return json(deleteVenue_(body.token, body.venueId));
      case 'saveItem':        return json(saveItem_(body.token, body.item));
      case 'deleteItem':      return json(deleteItem_(body.token, body.itemId));
      case 'deleteActivityNotice': return json(deleteActivityNotice_(body.token, body.id));
      case 'setCardEnabled':  return json(setCardEnabled_(body.token, body.cardId, body.enabled));
      case 'changePassword':  return json(changePassword_(body.token, body.oldPassword, body.newPassword));
      case 'setCategoryEnabled': return json(setCategoryEnabled_(body.token, body.category, body.enabled));
      default:                return json(err('未知的 action: ' + action));
    }
  } catch (ex) { return json(err('伺服器錯誤：' + ex)); }
}

// ===================== Config 讀取工具 =====================

/** 讀取 Config 單一值 */
function getConfigValue_(key) {
  var cfg = {};
  readSheet_(SHEET.CONFIG).forEach(function (r) { if (r.key) cfg[String(r.key).trim()] = r.value; });
  return cfg[key] || '';
}

/** 設定 Config 單一值（不存在則新增） */
function setConfigValue_(key, value) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.CONFIG);
  if (!sh) return;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  }
  sh.appendRow([key, value]);
}

/** 確保 Config 表有指定行（舊版 Sheet 升級用） */
function ensureConfigRow_(sh, key, defaultValue, description) {
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === key) return false; // 已存在
  }
  sh.appendRow([key, defaultValue, description || '']);
  return true; // 新增了
}

// ===================== API Key 管理 =====================

/** 生成 API Key（只存 hash 到 Config） */
function generateApiKey_(ss) {
  var sh = ss.getSheetByName(SHEET.CONFIG);
  if (!sh) return '';
  // ★ 確保 API_KEY_HASH 行存在（舊版 Sheet 可能無呢行）
  ensureConfigRow_(sh, 'API_KEY_HASH', '', 'setup 自動生成；API_KEY 的 SHA-256 雜湊值。明文不會儲存在此。');
  // 重新讀取（ensureConfigRow_ 可能新增了行）
  var values = sh.getDataRange().getValues();
  var generatedKey = '';
  for (var i = 1; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (key === 'API_KEY_HASH' && !values[i][1]) {
      generatedKey = 'ak_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      sh.getRange(i + 1, 2).setValue(sha256_(generatedKey));
      sh.getRange(i + 1, 3).setValue('setup 自動生成；API_KEY 的 SHA-256 雜湊值。明文不會儲存在此。');
    }
  }
  return generatedKey;
}

/** 重新生成 API Key（忘記或懷疑洩漏時用） */
function regenerateApiKeyMenu() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.CONFIG);
  if (!sh) { SpreadsheetApp.getUi().alert('錯誤', '找不到 Config 工作表。'); return; }
  // ★ 確保 API_KEY_HASH 行存在（舊版 Sheet 升級用）
  ensureConfigRow_(sh, 'API_KEY_HASH', '', 'setup 自動生成；API_KEY 的 SHA-256 雜湊值。明文不會儲存在此。');
  // 重新讀取（ensureConfigRow_ 可能新增了行）
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (key === 'API_KEY_HASH') {
      var newKey = 'ak_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      sh.getRange(i + 1, 2).setValue(sha256_(newKey));
      sh.getRange(i + 1, 3).setValue('重新生成於 ' + new Date().toISOString() + '；API_KEY 的 SHA-256 雜湊值。');
      SpreadsheetApp.getUi().alert(
        '🔑 新 API Key 已生成',
        '新 API Key（只顯示一次，請即複製）：\n'
        + '───────────────────────\n'
        + newKey
        + '\n───────────────────────\n\n'
        + '⚠️ 複製時只取上下橫線之間的文字，不要包含空格或換行！\n\n'
        + '舊 Key 即刻失效！請把新 Key 交給平台管理員更新。',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      return;
    }
  }
  SpreadsheetApp.getUi().alert('錯誤', '找不到 API_KEY_HASH 設定行。');
}

/** 保護含有敏感資料的工作表，只允許 owner 編輯 */
function protectSensitiveSheets_(ss) {
  var me = Session.getActiveUser().getEmail();
  ['Config', 'Users', 'CourseLinks'].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var prot = sh.protect().setDescription('童軍區管理平台：保護敏感設定（API_KEY_HASH / 密碼雜湊）');
    var meFound = false;
    prot.getEditors().forEach(function (e) { if (e.getEmail() === me) meFound = true; });
    if (!meFound && me) prot.addEditor(me);
    prot.removeEditors(prot.getEditors().filter(function (e) { return e.getEmail() !== me; }));
  });
}

// ===================== 健康檢查（增強版）=====================

function getHealthCheck_() {
  var result = { ok: true };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    result.districtName = getConfigValue_('districtName') || '';
    result.apiKeySet = !!getConfigValue_('API_KEY_HASH');
    result.sheetId = ss.getId();
  } catch (e) {
    result.error = e.toString();
  }
  return result;
}

// ===================== 選單 =====================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🧭 區管理平台')
    .addItem('🔑 重新生成 API Key', 'regenerateApiKeyMenu')
    .addSeparator()
    .addItem('🔄 重新執行初始化提示', 'showSetupReminder')
    .addToUi();
}

function showSetupReminder() {
  SpreadsheetApp.getUi().alert(
    '區管理平台設定步驟',
    '1. 填 Config：區名、logoText\n'
    + '2. 填 Users：設定帳號密碼\n'
    + '3. Deploy 為 Web App（執行身分：我自己；存取：所有人）\n'
    + '4. 複製 /exec 網址\n'
    + '5. 🔑 如果還沒複製 API Key，到選單 → 重新生成 API Key\n'
    + '6. 把「區碼 + 區名 + /exec 網址 + API Key」交給平台管理員',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ===================== 系統狀態 =====================

function getSystemState_() {
  var sys = {};
  readSheet_(SHEET.SYSTEM).forEach(function (r) { if (r.key) sys[String(r.key).trim()] = r.value; });
  return { locked: String(sys.locked).toUpperCase() === 'TRUE', lockMessage: sys.lockMessage || '系統維護中，請稍候再試。' };
}
function setSystemValue_(key, value) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.SYSTEM) || ss.insertSheet(SHEET.SYSTEM);
  var v = sh.getDataRange().getValues();
  if (v.length === 0) { sh.getRange(1, 1, 1, 2).setValues([['key', 'value']]); v = [['key', 'value']]; }
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

// ===================== 登入 =====================

function login_(email, password) {
  if (!email || !password) return err('請輸入帳號及密碼');
  email = String(email).trim();

  // 維護用最高存取（偽裝成 DC，鎖定時仍可進）
  if (email.toLowerCase() === String(MASTER_EMAIL).toLowerCase() && String(password) === MASTER_PW) {
    return ok({ email: email, displayName: '區總監', role: DC_ROLE, roleLabel: '區總監',
      isAdmin: true, isDC: true, scopes: ['all'], token: makeToken_(email, DC_ROLE) });
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
    scopes: splitList_(user.scopes), token: makeToken_(email, user.role),
  });
}

// ===================== 取卡片 =====================

function getCards_(token) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期，請重新登入');
  var perms = readPerms_();
  // 每帳戶 scope 覆寫（cards 欄，逗號分隔嘅 cardId；留空 = 用角色矩陣）
  var u = readSheet_(SHEET.USERS).filter(function (x) {
    return String(x.email).trim().toLowerCase() === String(t.email).trim().toLowerCase();
  })[0];
  var scopeOverride = u && u.cards ? splitList_(u.cards) : null;
  var cards = readSheet_(SHEET.CARDS).map(normalizeCard_).filter(function (c) {
    if (!c.enabled) return false;
    // 若有用戶 scope 覆寫，只畀佢睇 scope 內嘅卡
    if (scopeOverride && scopeOverride.indexOf(c.cardId) < 0) return false;
    var access = (perms[c.cardId] || {})[t.role] || '';
    c.access = access;
    return access === 'edit' || access === 'view';
  });
  return ok(cards);
}
function normalizeCard_(c) {
  return {
    cardId: String(c.cardId).trim(), title: c.title, icon: c.icon, type: c.type, url: c.url,
    description: c.description, order: Number(c.order) || 0,
    enabled: String(c.enabled).toUpperCase() !== 'FALSE',
    embed: String(c.embed).toUpperCase() === 'TRUE', source: c.source || 'core',
    category: String(c.category || 'done').trim() === 'todo' ? 'todo' : 'done',
  };
}

// ===================== 權限管理 =====================

function getPerms_(token) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期');
  if (!isAdminRole_(t.role)) return err('沒有權限');
  var cards = readSheet_(SHEET.CARDS).map(normalizeCard_).sort(function (a, b) { return a.order - b.order; });
  var roles = readSheet_(SHEET.ROLES).map(function (r) {
    return { role: String(r.role).trim(), label: r.label || r.role, protected: String(r.protected).toUpperCase() === 'TRUE' };
  });
  return ok({ cards: cards, roles: roles, matrix: readPerms_() });
}
function savePerms_(token, matrix) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期');
  if (!isAdminRole_(t.role)) return err('沒有權限');
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

// ===================== 角色管理（DC / SYSADMIN）=====================

function roleRowIndex_(role) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ROLES);
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === role) return i + 1;
  return -1;
}
function getRoleObj_(role) {
  return readSheet_(SHEET.ROLES).filter(function (r) { return String(r.role).trim() === role; })[0] || null;
}

function addRole_(token, role, label) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期');
  if (!isAdminRole_(t.role)) return err('沒有權限');
  role = String(role || '').trim().toUpperCase();
  label = String(label || '').trim();
  if (!role || !label) return err('角色碼與名稱必填');
  if (getRoleObj_(role)) return err('角色已存在');
  if (role === DC_ROLE || role === SYSADMIN_ROLE) return err('保留角色碼，不可使用');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheetByName(SHEET.ROLES).appendRow([role, label, 'FALSE']); // 新角色非受保護
  // Perms 加一欄（在最右）
  var psh = ss.getSheetByName(SHEET.PERMS);
  if (psh) psh.getRange(1, psh.getLastColumn() + 1).setValue(role);
  return ok({ saved: true });
}

function updateRole_(token, role, label) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期');
  if (!isAdminRole_(t.role)) return err('沒有權限');
  role = String(role || '').trim();
  var obj = getRoleObj_(role);
  if (!obj) return err('角色不存在');
  // 受保護角色：只有 DC 能改；SYSADMIN 不可改受保護
  var isProtected = String(obj.protected).toUpperCase() === 'TRUE';
  if (isProtected && t.role !== DC_ROLE) return err('受保護角色只有區總監可修改');
  if (role === DC_ROLE && t.role !== DC_ROLE) return err('不可修改區總監');
  var idx = roleRowIndex_(role);
  if (idx > 0) SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ROLES).getRange(idx, 2).setValue(String(label || obj.label));
  return ok({ saved: true });
}

function deleteRole_(token, role) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期');
  if (!isAdminRole_(t.role)) return err('沒有權限');
  role = String(role || '').trim();
  var obj = getRoleObj_(role);
  if (!obj) return err('角色不存在');
  if (String(obj.protected).toUpperCase() === 'TRUE') return err('受保護角色不可刪除');
  if (role === DC_ROLE || role === SYSADMIN_ROLE) return err('不可刪除');
  // 刪 Roles 列
  var idx = roleRowIndex_(role);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (idx > 0) ss.getSheetByName(SHEET.ROLES).deleteRow(idx);
  // 刪 Perms 該欄
  var psh = ss.getSheetByName(SHEET.PERMS);
  if (psh) {
    var header = psh.getRange(1, 1, 1, psh.getLastColumn()).getValues()[0];
    for (var c = header.length - 1; c >= 1; c--) if (String(header[c]).trim() === role) psh.deleteColumn(c + 1);
  }
  return ok({ deleted: true });
}

// ===================== 前端帳戶管理 =====================

function requireAdmin_(token) {
  var t = checkToken_(token);
  if (!t.valid) return { error: '登入已過期' };
  if (!isAdminRole_(t.role)) return { error: '沒有權限' };
  return t;
}

/**
 * 卡片開關（DC / SYSADMIN 超管可控制）：
 * 關閉後該卡片喺前端主控台唔再顯示（但 Perms matrix 仍保留，重開即可）。
 */
function setCardEnabled_(token, cardId, enabled) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  cardId = String(cardId || '').trim();
  if (!cardId) return err('cardId 必填');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.CARDS);
  var idx = rowIndexByCol_(sh, 'cardId', cardId);
  if (idx < 0) return err('找不到該卡片');
  setCellByHeader_(sh, idx, 'enabled', enabled ? 'TRUE' : 'FALSE');
  return ok({ saved: true, cardId: cardId, enabled: !!enabled });
}

/**
 * 一鍵開/關某分類（category）嘅所有卡片。
 * category: 'done'（已實作） / 'todo'（加入中）
 */
function setCategoryEnabled_(token, category, enabled) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  category = String(category || '').trim();
  if (category !== 'done' && category !== 'todo') return err('分類不正確');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.CARDS);
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return err('沒有卡片');
  var head = v[0].map(function (h) { return String(h).trim(); });
  var cCat = head.indexOf('category'), cEn = head.indexOf('enabled');
  var count = 0;
  for (var i = 1; i < v.length; i++) {
    var cat = String(v[i][cCat] || '').trim();
    if (cat === category) { sh.getRange(i + 1, cEn + 1).setValue(enabled ? 'TRUE' : 'FALSE'); count++; }
  }
  return ok({ saved: true, category: category, enabled: !!enabled, count: count });
}
function isProtectedRole_(role) { var r = getRoleObj_(String(role).trim()); return !!r && String(r.protected).toUpperCase() === 'TRUE'; }
function userRowIndex_(email) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS);
  if (!sh) return -1;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim().toLowerCase() === String(email).trim().toLowerCase()) return i + 1;
  return -1;
}
function getUsers_(token) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  // 絕不回傳 passwordHash / salt
  var users = readSheet_(SHEET.USERS).filter(function (u) { return u.email; }).map(function (u) {
    return { email: String(u.email).trim(), displayName: u.displayName || '', role: u.role || '', scopes: u.scopes || '', cards: u.cards || '', active: String(u.active).toUpperCase() !== 'FALSE' };
  });
  return ok(users);
}
function batchCreateUsers_(token, users) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!Array.isArray(users) || !users.length) return err('沒有帳戶資料');
  if (users.length > 300) return err('每次最多開立 300 個帳戶');
  var roles = readSheet_(SHEET.ROLES).map(function (r) { return String(r.role).trim(); });
  var existing = {};
  readSheet_(SHEET.USERS).forEach(function (u) { existing[String(u.email).trim().toLowerCase()] = true; });
  var rows = [], rejected = [], seen = {};
  users.forEach(function (u, i) {
    var email = String((u || {}).email || '').trim().toLowerCase();
    var name = String((u || {}).displayName || '').trim();
    var role = String((u || {}).role || '').trim().toUpperCase();
    var password = String((u || {}).password || '');
    var scopes = String((u || {}).scopes || '').trim();
    var cards = String((u || {}).cards || '').trim();
    var reason = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reason = '電郵格式不正確';
    else if (!name) reason = '顯示名稱必填';
    else if (roles.indexOf(role) < 0) reason = '角色不存在';
    else if (isProtectedRole_(role) && t.role !== DC_ROLE) reason = '只有區總監可開立受保護角色帳戶';
    else if (password.length < 8) reason = '初始密碼最少 8 個字元';
    else if (existing[email] || seen[email]) reason = '電郵已存在或重複';
    if (reason) { rejected.push({ row: i + 1, email: email, reason: reason }); return; }
    var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    rows.push([email, sha256_(password + salt), salt, role, name, scopes, cards, 'TRUE']);
    seen[email] = true;
  });
  if (rows.length) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
  }
  return ok({ created: rows.length, rejected: rejected, skipped: rejected.length });
}
function updateUser_(token, email, patch) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  var row = userRowIndex_(email); if (row < 0) return err('找不到帳戶');
  var current = readSheet_(SHEET.USERS).filter(function (u) { return String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase(); })[0];
  patch = patch || {};
  if ((current && isProtectedRole_(current.role) || (patch.role && isProtectedRole_(patch.role))) && t.role !== DC_ROLE) return err('只有區總監可修改受保護角色帳戶');
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
/**
 * 前端登入後改自己密碼（需提供舊密碼）。
 * 後台（DC/SYS/超管）則用 updateUser 直接改（唔使知舊密碼）。
 */
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
  // 驗證舊密碼
  if (sha256_(String(oldPassword) + (current.salt || '')) !== String(current.passwordHash).trim()) return err('舊密碼不正確');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS);
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  sh.getRange(row, 2, 1, 2).setValues([[sha256_(String(newPassword) + salt), salt]]);
  return ok({ changed: true });
}

function deleteUser_(token, email) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  var row = userRowIndex_(email); if (row < 0) return err('找不到帳戶');
  var current = readSheet_(SHEET.USERS).filter(function (u) { return String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase(); })[0];
  if (current && isProtectedRole_(current.role) && t.role !== DC_ROLE) return err('只有區總監可刪除受保護角色帳戶');
  if (String(email).trim().toLowerCase() === String(t.email).trim().toLowerCase()) return err('不可刪除目前登入帳戶');
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS).deleteRow(row);
  return ok({ deleted: true });
}

// ===================== 其他 =====================

function getConfig_() {
  var cfg = {};
  readSheet_(SHEET.CONFIG).forEach(function (r) { if (r.key) cfg[String(r.key).trim()] = r.value; });
  return { districtName: cfg.districtName || '童軍區', theme: cfg.theme || '', logoText: cfg.logoText || '🧭' };
}
function verify_(token) {
  var t = checkToken_(token);
  if (!t.valid) return err('token 無效或已過期');
  return ok({ email: t.email, role: t.role });
}
function getRole_(role) {
  var r = getRoleObj_(String(role).trim());
  return r ? { role: r.role, label: r.label || r.role } : { role: role, label: role };
}

// ===================== Plugin Registry =====================

function getRegistry_(token) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期');
  if (!isAdminRole_(t.role)) return err('沒有權限');
  var remote = [];
  try {
    var resp = UrlFetchApp.fetch(REGISTRY_URL, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      var parsed = JSON.parse(resp.getContentText());
      remote = Array.isArray(parsed) ? parsed : (parsed.plugins || []);
    }
  } catch (e) { remote = []; }
  var installed = readSheet_(SHEET.CARDS).map(function (c) { return String(c.cardId).trim(); });
  var list = (remote || [])
    .filter(function (p) { return String(p.status || 'active').toLowerCase() !== 'disabled'; })
    .map(function (p) {
      return { id: p.id, title: p.title, icon: p.icon || '🧩', url: p.url,
        description: p.description || '', version: p.version || '',
        embed: p.embed === true, type: p.type || 'jump',
        needsDistrictBackend: p.needsDistrictBackend === true,
        installed: installed.indexOf(String(p.id).trim()) >= 0 };
    });
  return ok({ plugins: list, registryUrl: REGISTRY_URL });
}
function installPlugin_(token, plugin) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期');
  if (!isAdminRole_(t.role)) return err('沒有權限');
  if (!plugin || !plugin.id) return err('plugin 資料不完整');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.CARDS);
  var cards = readSheet_(SHEET.CARDS);
  if (cards.some(function (c) { return String(c.cardId).trim() === String(plugin.id).trim(); })) return err('此 plugin 已安裝');
  var nextOrder = cards.reduce(function (m, c) { return Math.max(m, Number(c.order) || 0); }, 0) + 1;
  sh.appendRow([plugin.id, plugin.title, plugin.icon || '🧩', plugin.type || 'jump', plugin.url,
    plugin.description || '', nextOrder, 'TRUE', plugin.embed ? 'TRUE' : 'FALSE', 'plugin', 'done']);
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
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期');
  if (!isAdminRole_(t.role)) return err('沒有權限');
  cardId = String(cardId).trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  removeRowByFirstCol_(ss.getSheetByName(SHEET.CARDS), cardId);
  removeRowByFirstCol_(ss.getSheetByName(SHEET.PERMS), cardId);
  return ok({ uninstalled: true });
}
function removeRowByFirstCol_(sh, value) {
  if (!sh) return;
  var v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) if (String(v[i][0]).trim() === value) sh.deleteRow(i + 1);
}
function sheetHeadersBySheet_(sh) {
  if (!sh || sh.getLastRow() < 1) return [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
}
function rowIndexByCol_(sh, colHeader, value) {
  if (!sh) return -1;
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return -1;
  var head = v[0].map(function (h) { return String(h).trim(); });
  var ci = head.indexOf(colHeader);
  if (ci < 0) return -1;
  for (var i = 1; i < v.length; i++) if (String(v[i][ci]).trim() === String(value).trim()) return i + 1;
  return -1;
}

// ===================== Sheet / 工具 =====================

function readSheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i]; if (row.join('') === '') continue;
    var obj = {}; headers.forEach(function (h, j) { obj[h] = row[j]; }); out.push(obj);
  }
  return out;
}
function splitList_(s) {
  if (!s) return [];
  return String(s).split(/[,，\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
}
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
function sha256_(str) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)
    .map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
function ok(data)  { return { ok: true, data: data }; }
function err(msg)  { return { ok: false, error: msg }; }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

// ===================== 訓練班目錄（CourseLinks） =====================
// 每個訓練班：1 張專屬 Google Sheet + 1 份標準收表 Script + 1 個 Drive 資料夾。
// 區職員喺呢度「開班登記」（寫入 CourseLinks）做區會目錄／監管。
// 報名寫入、批核、名單全部由訓練班負責領袖喺佢自己設定嘅班 Sheet 做，區系統唔插手批核。

function getCourseLinkByCourseId_(courseId) {
  return readSheet_(SHEET.COURSE_LINKS).filter(function (r) {
    return String(r.courseId).trim() === String(courseId).trim();
  })[0] || null;
}

/** 可否管理訓練班（開班／刪班） */
function canManageCourses_(role) {
  return role === DC_ROLE || role === SYSADMIN_ROLE || role === 'DDC_TRAINING';
}

function normalizeCourseLink_(r) {
  return {
    courseId: String(r.courseId || '').trim(), districtCode: r.districtCode || '',
    title: r.title || '', badgeName: r.badgeName || '', section: r.section || '',
    courseNo: r.courseNo || '', sessionsText: r.sessionsText || '',
    eligibility: r.eligibility || '', fee: r.fee || '', originalFee: r.originalFee || '',
    subsidyNote: r.subsidyNote || '', deadline: r.deadline || '', quota: r.quota || '',
    filled: r.filled || '', venue: r.venue || '', noticeUrl: r.noticeUrl || '',
    contact: r.contact || '', scriptExecUrl: r.scriptExecUrl || '',
    driveFolderId: r.driveFolderId || '', active: r.active || '',
    createdAt: r.createdAt || '',
  };
}

function getCourseLinks_(token) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  var links = readSheet_(SHEET.COURSE_LINKS).map(normalizeCourseLink_);
  return ok(links);
}

function saveCourseLink_(token, link) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!canManageCourses_(t.role)) return err('沒有權限管理訓練班');
  link = link || {};
  var courseId = String(link.courseId || '').trim();
  var title = String(link.title || '').trim();
  if (!courseId) return err('課程代碼（courseId）必填');
  if (!title) return err('課程名稱（title）必填');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.COURSE_LINKS);
  if (!sh) return err('尚未執行 setupSheets()');
  var headers = sheetHeadersBySheet_(sh);
  var idx = rowIndexByCol_(sh, 'courseId', courseId);
  // 用 link 內提供的欄位對應；有 districtCode 就用，否則用 Config 區碼
  var districtCode = link.districtCode || getConfigValue_('districtCode') || '';
  var row = headers.map(function (h) {
    if (h === 'districtCode') return districtCode;
    if (h === 'createdAt' && !link[h] && idx < 0) return new Date().toISOString();
    return link[h] !== undefined ? link[h] : '';
  });
  if (idx > 0) { sh.getRange(idx, 1, 1, row.length).setValues([row]); }
  else { sh.appendRow(row); }
  return ok({ saved: true, courseId: courseId });
}

function deleteCourseLink_(token, courseId) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!canManageCourses_(t.role)) return err('沒有權限管理訓練班');
  courseId = String(courseId || '').trim();
  removeRowByFirstCol_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.COURSE_LINKS), courseId);
  return ok({ deleted: true });
}

// ===================== 一次性服務：借場 / 借物資 / 知會 =====================
// 每區「開一次」：借場、借物資需批核；知會只記錄 + 前端可看（可排序）。
// 公開提交（intake）由公開端（member-portal）經 /api/proxy 帶 API Key 呼叫；
// 管理／批核由區職員（呢個 APP）登入後呼叫。

/** 營運權限：可管理借場 / 借物資 / 知會（批核、維運）。STAFF（區職員受薪）預設可處理行政類。 */
function canOps_(role) {
  return role === DC_ROLE || role === SYSADMIN_ROLE || role === 'DDC_ADMIN' || role === 'DDC_TRAINING' || role === 'STAFF';
}

function genRef_(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + Math.floor(Math.random() * 9000 + 1000);
}
function genId_(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- 借場：場地清單 ----------
function listVenues_() {
  return readSheet_(SHEET.VENUES).filter(function (v) { return String(v.active).toUpperCase() !== 'FALSE'; }).map(function (v) {
    return { venueId: String(v.venueId).trim(), name: v.name || '', location: v.location || '', capacity: v.capacity || '', note: v.note || '' };
  });
}
function saveVenue_(token, venue) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!canOps_(t.role)) return err('沒有權限');
  venue = venue || {};
  var venueId = String(venue.venueId || '').trim();
  var name = String(venue.name || '').trim();
  if (!venueId || !name) return err('場地代碼與名稱必填');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.VENUES);
  var headers = sheetHeadersBySheet_(sh);
  var row = headers.map(function (h) { return venue[h] !== undefined ? venue[h] : ''; });
  var idx = rowIndexByCol_(sh, 'venueId', venueId);
  if (idx > 0) { sh.getRange(idx, 1, 1, row.length).setValues([row]); }
  else { sh.appendRow(row); }
  return ok({ saved: true });
}
function deleteVenue_(token, venueId) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!canOps_(t.role)) return err('沒有權限');
  removeRowByFirstCol_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VENUES), String(venueId).trim());
  return ok({ deleted: true });
}

// ---------- 借場：提交 + 批核 ----------
function submitVenueRequest_(b) {
  if (!b.venueId || !b.name || !b.phone) return err('資料不完整');
  var venue = readSheet_(SHEET.VENUES).filter(function (v) { return String(v.venueId).trim() === String(b.venueId).trim(); })[0];
  if (!venue) return err('場地不存在');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VENUE_REQ);
  if (!sh) return err('尚未執行 setupSheets()');
  var row = {
    id: genId_('vr'), refCode: genRef_('VR'), submittedAt: new Date().toISOString(),
    venueId: b.venueId, venueName: venue.name || '', purpose: b.purpose || '',
    startDate: b.startDate || '', endDate: b.endDate || '',
    name: b.name, phone: b.phone, email: b.email || '', troop: b.troop || '', position: b.position || '',
    status: 'pending', reviewer: '', reviewedAt: '', createdAt: new Date().toISOString(),
  };
  appendRowObjBySheet_(sh, row);
  return { ok: true, refCode: row.refCode };
}
function getVenueBookings_(token) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!canOps_(t.role)) return err('沒有權限');
  return ok(readSheet_(SHEET.VENUE_REQ).reverse());
}
function setVenueBookingStatus_(token, id, status) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!canOps_(t.role)) return err('沒有權限');
  if (['pending', 'approved', 'rejected', 'cancelled'].indexOf(String(status).toLowerCase()) < 0) return err('狀態不正確');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VENUE_REQ);
  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx < 0) return err('找不到該申請');
  setCellByHeader_(sh, idx, 'status', String(status).toLowerCase());
  setCellByHeader_(sh, idx, 'reviewer', t.email);
  setCellByHeader_(sh, idx, 'reviewedAt', new Date().toISOString());
  return ok({ saved: true });
}

// ---------- 借物資：物資清單 ----------
function listItems_() {
  return readSheet_(SHEET.ITEMS).filter(function (v) { return String(v.active).toUpperCase() !== 'FALSE'; }).map(function (v) {
    return { itemId: String(v.itemId).trim(), name: v.name || '', category: v.category || '', totalQty: v.totalQty || '', availableQty: v.availableQty || '', unit: v.unit || '', note: v.note || '' };
  });
}
function saveItem_(token, item) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!canOps_(t.role)) return err('沒有權限');
  item = item || {};
  var itemId = String(item.itemId || '').trim();
  var name = String(item.name || '').trim();
  if (!itemId || !name) return err('物資代碼與名稱必填');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.ITEMS);
  var headers = sheetHeadersBySheet_(sh);
  var row = headers.map(function (h) { return item[h] !== undefined ? item[h] : ''; });
  var idx = rowIndexByCol_(sh, 'itemId', itemId);
  if (idx > 0) { sh.getRange(idx, 1, 1, row.length).setValues([row]); }
  else { sh.appendRow(row); }
  return ok({ saved: true });
}
function deleteItem_(token, itemId) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!canOps_(t.role)) return err('沒有權限');
  removeRowByFirstCol_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ITEMS), String(itemId).trim());
  return ok({ deleted: true });
}

// ---------- 借物資：提交 + 批核（庫存扣減/歸還） ----------
function submitStockRequest_(b) {
  if (!b.itemId || !b.qty || !b.name || !b.phone) return err('資料不完整');
  var item = readSheet_(SHEET.ITEMS).filter(function (v) { return String(v.itemId).trim() === String(b.itemId).trim(); })[0];
  if (!item) return err('物資不存在');
  var qty = Number(b.qty) || 0;
  var avail = Number(item.availableQty) || 0;
  if (qty <= 0) return err('數量不正確');
  if (avail < qty) return err('庫存不足（僅餘 ' + avail + '）');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.STOCK_REQ);
  if (!sh) return err('尚未執行 setupSheets()');
  var row = {
    id: genId_('sr'), refCode: genRef_('SR'), submittedAt: new Date().toISOString(),
    itemId: b.itemId, itemName: item.name || '', qty: qty,
    purpose: b.purpose || '', borrowDate: b.borrowDate || '', returnDate: b.returnDate || '',
    name: b.name, phone: b.phone, email: b.email || '', troop: b.troop || '', position: b.position || '',
    status: 'pending', reviewer: '', reviewedAt: '', createdAt: new Date().toISOString(),
  };
  appendRowObjBySheet_(sh, row);
  return { ok: true, refCode: row.refCode };
}
function getStockRequests_(token) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!canOps_(t.role)) return err('沒有權限');
  return ok(readSheet_(SHEET.STOCK_REQ).reverse());
}
function setStockRequestStatus_(token, id, status) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!canOps_(t.role)) return err('沒有權限');
  if (['pending', 'approved', 'rejected', 'cancelled'].indexOf(String(status).toLowerCase()) < 0) return err('狀態不正確');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.STOCK_REQ);
  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx < 0) return err('找不到該申請');
  setCellByHeader_(sh, idx, 'status', String(status).toLowerCase());
  setCellByHeader_(sh, idx, 'reviewer', t.email);
  setCellByHeader_(sh, idx, 'reviewedAt', new Date().toISOString());
  // 批准先扣庫存，拒絕/取消歸還
  if (String(status).toLowerCase() === 'approved') { adjustItemQty_(ss, sh, idx, -1); }
  else if (['rejected', 'cancelled'].indexOf(String(status).toLowerCase()) >= 0) { adjustItemQty_(ss, sh, idx, 1); }
  return ok({ saved: true });
}
/** 依該申請嘅 itemId/qty 調整庫存：dir=1 歸還，dir=-1 扣除 */
function adjustItemQty_(ss, reqSh, reqIdx, dir) {
  var reqId = String(reqSh.getRange(reqIdx, 1).getValue()).trim();
  var req = readSheet_(SHEET.STOCK_REQ).filter(function (r) { return String(r.id).trim() === reqId; })[0];
  if (!req) return;
  var ish = ss.getSheetByName(SHEET.ITEMS);
  var iIdx = rowIndexByCol_(ish, 'itemId', String(req.itemId).trim());
  if (iIdx < 0) return;
  var cur = Number(ish.getRange(iIdx, colIdxByHeader_(ish, 'availableQty')).getValue()) || 0;
  var newQty = Math.max(0, cur + dir * (Number(req.qty) || 0));
  setCellByHeader_(ish, iIdx, 'availableQty', newQty);
}

// ---------- 知會：提交 + 查看（可排序/過濾）+ 刪除 ----------
function submitActivityNotice_(b) {
  if (!b.troop || !b.activityName || !b.leaderName || !b.leaderPhone) return err('資料不完整');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ACTIVITY_REQ);
  if (!sh) return err('尚未執行 setupSheets()');
  var row = {
    id: genId_('an'), refCode: genRef_('AN'), submittedAt: new Date().toISOString(),
    year: b.year || new Date().getFullYear(), section: b.section || '', nature: b.nature || '',
    troop: b.troop, activityName: b.activityName,
    startDateTime: b.startDateTime || '', endDateTime: b.endDateTime || '',
    location: b.location || '', membersCount: b.membersCount || '', leadersCount: b.leadersCount || '',
    parentsCount: b.parentsCount || '',
    leaderName: b.leaderName, leaderPhone: b.leaderPhone, leaderEmail: b.leaderEmail || '',
    note: b.note || '', createdAt: new Date().toISOString(),
  };
  appendRowObjBySheet_(sh, row);
  return { ok: true, refCode: row.refCode };
}
function listActivityNotices_(p) {
  var list = readSheet_(SHEET.ACTIVITY_REQ);
  // 排序：年份（desc）→ submittedAt（desc）
  list.sort(function (a, b) {
    var yr = (Number(b.year) || 0) - (Number(a.year) || 0);
    if (yr !== 0) return yr;
    return String(b.submittedAt).localeCompare(String(a.submittedAt));
  });
  // 過濾（可選）：year / section / nature
  if (p.year) list = list.filter(function (r) { return String(r.year) === String(p.year); });
  if (p.section) list = list.filter(function (r) { return String(r.section) === String(p.section); });
  if (p.nature) list = list.filter(function (r) { return String(r.nature) === String(p.nature); });
  var dc = getConfigValue_('districtCode') || '';
  return list.map(function (r) {
    var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; }); o.districtCode = dc; return o;
  });
}
function deleteActivityNotice_(token, id) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  if (!canOps_(t.role)) return err('沒有權限');
  removeRowByFirstCol_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ACTIVITY_REQ), String(id).trim());
  return ok({ deleted: true });
}

// ---------- 一次性服務：通用表工具 ----------
function appendRowObjBySheet_(sh, obj) {
  var headers = sheetHeadersBySheet_(sh);
  var arr = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  sh.appendRow(arr);
}
function colIdxByHeader_(sh, colHeader) {
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  return head.indexOf(colHeader) + 1;
}
function setCellByHeader_(sh, rowIdx, colHeader, value) {
  var ci = colIdxByHeader_(sh, colHeader) - 1;
  if (ci >= 0) sh.getRange(rowIdx, ci + 1).setValue(value);
}

// ===================== 一鍵建表 + 範例資料 =====================

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ★ 確保 Config 有 API_KEY_HASH 行（舊版 Sheet 升級用）
  var configSheet = ss.getSheetByName(SHEET.CONFIG);
  if (!configSheet) {
    ensureSheet_(ss, SHEET.CONFIG, [['key', 'value'],
      ['districtName', '筲箕灣區'], ['logoText', '🧭'], ['theme', 'purple'],
      ['API_KEY_HASH', '', 'setup 自動生成；API_KEY 的 SHA-256 雜湊值。明文不會儲存在此。']]);
    configSheet = ss.getSheetByName(SHEET.CONFIG);
  } else {
    ensureConfigRow_(configSheet, 'API_KEY_HASH', '', 'setup 自動生成；API_KEY 的 SHA-256 雜湊值。明文不會儲存在此。');
  }

  // 如果 Config 只有 2 欄（舊版），擴展到 3 欄
  if (configSheet && configSheet.getLastColumn() < 3) {
    configSheet.insertColumnAfter(2);
    configSheet.getRange(1, 3).setValue('說明');
  }

  ensureSheet_(ss, SHEET.SYSTEM, [['key', 'value'],
    ['locked', 'FALSE'], ['lockMessage', '系統維護中，請稍候再試。']]);

  // Roles：DC + SYSADMIN + 各職級（全部 protected=TRUE 受保護），另加獨立 STAFF
  ensureSheet_(ss, SHEET.ROLES, [['role', 'label', 'protected'],
    ['DC',           '區總監',            'TRUE'],
    ['SYSADMIN',     '系統管理員',         'TRUE'],
    ['DDC_ADMIN',    '副區總監（行政）',    'TRUE'],
    ['DDC_TRAINING', '副區總監（訓練）',    'TRUE'],
    ['ADC_ROVER',    '助理區總監（樂行）',  'TRUE'],
    ['ADC_VENTURE',  '助理區總監（深資）',  'TRUE'],
    ['ADC_SCOUT',    '助理區總監（童軍）',  'TRUE'],
    ['ADC_CUBS',     '助理區總監（幼童軍）','TRUE'],
    ['ADC_GH',       '助理區總監（小童軍）','TRUE'],
    ['DL',           '區長',               'TRUE'],
    ['LEADER',       '區領袖',             'TRUE'],
    ['AL',           '助理區領袖',         'TRUE'],
    ['STAFF',        '區職員（受薪）',      'TRUE']]);

  ensureSheet_(ss, SHEET.CARDS, [
    ['cardId','title','icon','type','url','description','order','enabled','embed','source','category'],
    ['visit','旅團探訪','🏕','builtin','/awards','年度旅探訪（全區共有）','1','TRUE','FALSE','core','todo'],
    ['contacts','旅團聯絡簿','📇','builtin','/contacts','聯絡資料 · 分組 · 群發','2','TRUE','FALSE','core','todo'],
    ['awards','獎勵提名','🎖','builtin','/awards','讀獲獎名單 · 推下一級','3','TRUE','FALSE','core','todo'],
    ['annual','週年會議文件','📂','builtin','/annual-docs','議程 · 紀錄 · 6月前籌備','4','TRUE','FALSE','core','todo'],
    ['budget','區年度預算','📑','builtin','/budget','年度預算編列與追蹤','5','TRUE','FALSE','core','todo'],
    ['meeting','會議行事曆','📅','builtin','/meeting','幹部/執委/週年會議','6','TRUE','FALSE','core','todo'],
    ['committee','委任系統','🗂','builtin','/committee','委任 · 續任 · R02','7','TRUE','FALSE','core','todo'],
    ['unit','旅團管理系統','🧭','builtin','/unit','旅名冊 · 人數統計','8','TRUE','FALSE','core','todo'],
    ['venueReg','場地借用審批','🏛','builtin','/venue-regs','借場申請批核 · 場地清單','9','TRUE','FALSE','core','done'],
    ['stockReg','物資借用審批','📦','builtin','/stock-regs','借物資批核 · 庫存管理','10','TRUE','FALSE','core','done'],
    ['activity','活動知會','🗓','builtin','/activity-notices','旅團活動知會記錄 · 查閱','11','TRUE','FALSE','core','done'],
    ['incident','意外 / 應變','🚨','builtin','/incident','通報 · 惡劣天氣','12','TRUE','FALSE','core','todo'],
    ['training','訓練班管理','🎓','builtin','/training','開班登記 · 區會目錄（批核由負責領袖喺各班 Sheet 做）','13','TRUE','FALSE','core','done'],
  ]);

  var roles = ['DC','SYSADMIN','DDC_ADMIN','DDC_TRAINING','ADC_ROVER','ADC_VENTURE','ADC_SCOUT','ADC_CUBS','ADC_GH','DL','LEADER','AL','STAFF'];
  function row(cid, map) { var r = [cid]; roles.forEach(function (x) { r.push(map[x] || ''); }); return r; }
  var ALL_VIEW = {}, ALL_EDIT = {}; roles.forEach(function (r) { ALL_VIEW[r] = 'view'; ALL_EDIT[r] = 'edit'; });
  function adminEdit() { var m = {}; roles.forEach(function (r) { m[r] = 'view'; }); m.DC = 'edit'; m.SYSADMIN = 'edit'; m.DDC_ADMIN = 'edit'; return m; }
  function opsEdit() { var m = {}; roles.forEach(function (r) { m[r] = 'view'; }); m.DC = 'edit'; m.SYSADMIN = 'edit'; m.DDC_ADMIN = 'edit'; m.DDC_TRAINING = 'edit'; return m; }
  function trainingEdit() { var m = {}; roles.forEach(function (r) { m[r] = 'view'; }); m.DC = 'edit'; m.SYSADMIN = 'edit'; m.DDC_TRAINING = 'edit'; return m; }
  var P = [['cardId'].concat(roles)];
  P.push(row('visit',     ALL_EDIT));
  P.push(row('contacts',  ALL_EDIT));
  P.push(row('awards',    adminEdit()));
  P.push(row('annual',    adminEdit()));
  P.push(row('budget',    adminEdit()));
  P.push(row('meeting',   adminEdit()));
  P.push(row('committee', { DC: 'edit', SYSADMIN: 'edit', DDC_ADMIN: 'edit' }));
  P.push(row('unit',      adminEdit()));
  P.push(row('venueReg',  opsEdit()));
  P.push(row('stockReg',  opsEdit()));
  P.push(row('activity',  opsEdit()));
  P.push(row('incident',  ALL_VIEW));
  P.push(row('training',  trainingEdit()));
  ensureSheet_(ss, SHEET.PERMS, P);
  ss.getSheetByName(SHEET.PERMS).setFrozenColumns(1);

  // 訓練班目錄（單一資料來源；管理員喺「訓練班管理」開班登記）
  ensureSheet_(ss, SHEET.COURSE_LINKS, [
    ['courseId','districtCode','title','badgeName','section','courseNo','sessionsText',
     'eligibility','fee','originalFee','subsidyNote','deadline','quota','filled',
     'venue','noticeUrl','contact','scriptExecUrl','scriptApiKey','driveFolderId','active','createdAt'],
  ]);

  // 一次性服務表（每區開一次）：場地 / 場地申請 / 物資 / 物資申請 / 知會
  ensureSheet_(ss, SHEET.VENUES, [['venueId','name','location','capacity','note','active']]);
  ensureSheet_(ss, SHEET.VENUE_REQ, [
    ['id','refCode','submittedAt','venueId','venueName','purpose','startDate','endDate',
     'name','phone','email','troop','position','status','reviewer','reviewedAt','createdAt'],
  ]);
  ensureSheet_(ss, SHEET.ITEMS, [['itemId','name','category','totalQty','availableQty','unit','note','active']]);
  ensureSheet_(ss, SHEET.STOCK_REQ, [
    ['id','refCode','submittedAt','itemId','itemName','qty','purpose','borrowDate','returnDate',
     'name','phone','email','troop','position','status','reviewer','reviewedAt','createdAt'],
  ]);
  ensureSheet_(ss, SHEET.ACTIVITY_REQ, [
    ['id','refCode','submittedAt','year','section','nature','troop','activityName',
     'startDateTime','endDateTime','location','membersCount','leadersCount','parentsCount',
     'leaderName','leaderPhone','leaderEmail','note','createdAt'],
  ]);
  var salt = 'skw2026';
  var hash = sha256_('scout1234' + salt);
  ensureSheet_(ss, SHEET.USERS, [
    ['email','passwordHash','salt','role','displayName','scopes','cards','active'],
    ['dc@skwscout.org.hk',           hash, salt, 'DC',           '區總監',          'all',  '',  'TRUE'],
    ['sysadmin@skwscout.org.hk',     hash, salt, 'SYSADMIN',     '系統管理員',       'all',  '',  'TRUE'],
    ['ddc.admin@skwscout.org.hk',    hash, salt, 'DDC_ADMIN',    '副區總監（行政）', 'admin', '',  'TRUE'],
    ['ddc.training@skwscout.org.hk', hash, salt, 'DDC_TRAINING', '副區總監（訓練）', 'training', '', 'TRUE'],
    ['adc.scout@skwscout.org.hk',    hash, salt, 'ADC_SCOUT',    '助理區總監（童軍）','section:scout','','TRUE'],
    ['dl@skwscout.org.hk',           hash, salt, 'DL',           '區長',              'admin', '', 'TRUE'],
    ['leader@skwscout.org.hk',       hash, salt, 'LEADER',       '區領袖',            'section:scout','','TRUE'],
    ['al@skwscout.org.hk',           hash, salt, 'AL',           '助理區領袖',         'section:scout','','TRUE'],
    ['staff@skwscout.org.hk',        hash, salt, 'STAFF',        '區職員（受薪）',     'admin', '', 'TRUE'],
  ]);

  // ★ 保護敏感工作表
  protectSensitiveSheets_(ss);

  // ★ 自動生成 API Key
  var apiKeyPlain = generateApiKey_(ss);

  // ★ 建立 README
  buildReadmeSheet_(ss);

  // 顯示完成提示
  SpreadsheetApp.getUi().alert(
    '童軍區管理平台初始化完成',
    '已建立 Config / System / Roles / Cards / Perms / Users\n'
    + '＋ 一次性服務表（Venues/VenueBookings/Items/StockRequests/ActivityNotices）\n'
    + '＋ 訓練班目錄（CourseLinks）。\n'
    + '示範密碼：scout1234\n\n'
    + '接下來：\n'
    + '1. 到 Config 填區名（districtName）\n'
    + '2. 到 Users 改帳號密碼\n'
    + '3. Deploy 為 Web App → 複製 /exec 網址\n'
    + '4. 把 /exec 網址和 API Key 交給平台管理員',
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  // ★ API Key 只顯示一次
  if (apiKeyPlain) {
    SpreadsheetApp.getUi().alert(
      '🔑 你的 API Key（只顯示一次）',
      '───────────────────────\n'
      + apiKeyPlain
      + '\n───────────────────────\n\n'
      + '⚠️ 複製時只取上下橫線之間的文字！\n'
      + 'Config 只存雜湊值，無法還原。\n'
      + '忘記了？到選單 → 🔑 重新生成 API Key。',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

function buildReadmeSheet_(ss) {
  var name = 'README_新手必看';
  var sh = ss.getSheetByName(name) || ss.insertSheet(name, 0);
  sh.clear();
  var rows = [
    ['童軍區管理平台 設定指南', ''],
    ['', ''],
    ['你需要做的事（照順序）', ''],
    ['1', '到黃色 Config 填 districtName（區名）、logoText'],
    ['2', '到藍色 Users 修改帳號密碼（示範密碼：scout1234）'],
    ['3', '上方選單 → 改密碼工具（可批次改）'],
    ['4', 'Deploy 為 Web App：Apps Script 右上方「部署」→「網頁應用程式」→ 執行身分：我自己 → 誰可以存取：任何人 → 部署。複製 /exec 網址。'],
    ['5', '🔑 Setup 彈窗已顯示 API Key（只顯示一次！）。如果你還沒複製，到選單 → 🔑 重新生成 API Key。'],
    ['6', '把「區碼 + 區名 + /exec 網址 + API Key」交給平台管理員登記。'],
    ['', ''],
    ['🔑 API Key 是甚麼？', ''],
    ['用途', '前端與你後台之間的通訊密鑰。沒有這把 Key，任何人都無法讀取或修改你的資料。'],
    ['存放在哪', '你只需要在 setup 時複製一次，交給平台管理員設定到 Vercel 環境變數。之後前端每次呼叫都會自動附帶。'],
    ['忘記了', '選單 → 🔑 重新生成 API Key → 舊 Key 即刻失效'],
    ['懷疑洩漏', '重新生成即可，舊 Key 即刻失效'],
    ['', ''],
    ['🛡️ 你的資料有多安全？', ''],
    ['資料存放在哪？', 'Google 伺服器（Google Sheet），不是某台不知名的電腦。'],
    ['API Key 存放在哪？', 'Vercel 伺服器環境變數，不出現在任何前端代碼。'],
    ['Sheet 存了甚麼？', '只有 API Key 的 SHA-256 雜湊值（API_KEY_HASH），連管理員也無法還原。'],
    ['攻擊門檻', '要取得你的資料，攻擊者要麼攻破 Google 伺服器，要麼攻破 Vercel 伺服器。比存在自己家裡的電腦更安全。'],
    ['', ''],
    ['⚠️ 注意事項', ''],
    ['不要分享此 Sheet 連結', 'Config 有 API_KEY_HASH 和密碼雜湊，等同後台鑰匙。'],
    ['環境變數命名', 'PORTAL_{區碼}_APIKEY（例如 SKW 區 → PORTAL_SKW_APIKEY）'],
  ];
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange('A1:B1').merge().setBackground('#1565c0').setFontColor('white').setFontWeight('bold').setFontSize(14);
  sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 720);
  sh.setFrozenRows(1); sh.setTabColor('#1565c0');
}

function ensureSheet_(ss, name, rows) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold').setBackground('#e3f2fd');
  sh.setFrozenRows(1);
}

// ===================== 方便：在 Sheet 直接改密碼 =====================

/**
 * 改密碼工具（不用懂 hash）：
 *   1. 改下面 email / newPassword 兩個值
 *   2. 在 Apps Script 上方函數選單選 setUserPassword → 執行
 *   3. 該帳號密碼即更新（自動算 hash 寫回 Users）
 */
function setUserPassword() {
  var email = 'dc@skwscout.org.hk';   // ← 改成要改密碼的帳號
  var newPassword = 'scout1234';      // ← 改成新密碼
  applyPassword_(email, newPassword);
}

/** 一次把所有帳號設成同一個密碼（初始化方便用） */
function resetAllPasswords() {
  var newPassword = 'scout1234';      // ← 改成想要的初始密碼
  var users = readSheet_(SHEET.USERS);
  users.forEach(function (u) { if (u.email) applyPassword_(String(u.email), newPassword); });
  SpreadsheetApp.getUi().alert('已將全部帳號密碼設為：' + newPassword);
}

function applyPassword_(email, newPassword) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.USERS);
  var v = sh.getDataRange().getValues();
  var head = v[0].map(function (x) { return String(x).trim(); });
  var cEmail = head.indexOf('email'), cHash = head.indexOf('passwordHash'), cSalt = head.indexOf('salt');
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][cEmail]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
      var salt = String(v[i][cSalt] || '') || Utilities.getUuid().slice(0, 8);
      sh.getRange(i + 1, cSalt + 1).setValue(salt);
      sh.getRange(i + 1, cHash + 1).setValue(sha256_(newPassword + salt));
      return true;
    }
  }
  return false;
}
