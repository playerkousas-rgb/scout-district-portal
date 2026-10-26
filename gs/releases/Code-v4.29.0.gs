/**
 * 童軍區統一後台 — 管理系統 + 成員系統 共用 Code.gs  v4.29.0
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
 * ──「你講我聽」區務意見箱（v4.26.1）────────────────────
 * member-portal POST submitDistrictFeedback（匿名／支援／DC 保密直達）。
 * DistrictFeedback 與 DCConfidential 均為主 Sheet 分頁；DCConfidential 卡只授予 DC／超管，
 * 後端列表 API 亦重複驗證角色。主 Sheet 的直接檢視者仍可直接讀取該分頁（不做分頁級閱讀隔離）。
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
 * ── 帳戶層級 / 授權 / 隱藏卡片（v4.4.0）──────────────────
 * 層級 level：0 超管（隱藏、最高）／1 DC／2 DDC／3 ADC／4 STAFF／5 區長等。
 * Users 表新增 level / mustChangePassword / delegatedBy 欄；預設 9 個 @skwscout.org.hk
 * 預設帳戶只補角色資料；密碼每次新建時隨機產生且不顯示，共用初始密碼禁止登入。
 *   requestPasswordReset（公開）→ 寄一次性重設連結（token 24h）去該帳戶電郵
 *   resetPassword（公開，帶 resetToken）／ changePassword（登入後）
 *   delegatePerms：上級把自己「現有」卡片權限授予下級（Perms 表寫 edit/view）
 *   revokePerms：上級一鍵收回下級全部卡片權限
 *   setCardEnabled / getCards：卡片 enabled=FALSE 時只有 level 0 超管仍可見（供私下升級）
 *
 * ── 區年度預算 / 地域房間 / 架構（v4.5.0）───────────────────
 * 預算、港島地域職員／總監架構、總會各署、房間日曆全部係公開網頁／Sheet／日曆，
 * 由前端 Vercel `/api/external` 伺服器端代抓，本檔唔使抓網頁。
 * 本檔只負責：Config `BUDGET_SHEET_URL`（區年度預算 Google Sheet 網址，getConfig 回傳 budgetSheetUrl）、
 * 新卡片 rooms（/rooms 地域房間使用情況）／orgchart（/orgchart 地域及總會架構），
 * budget 卡片由 todo → done（patchCardRows_ 只改仍係舊預設值嘅行），
 * 以及刪除 annual（週年會議文件）卡片（setupSheets 會同步移除 Cards／Perms 舊行）。
 *
 * ── 消息發佈 News（v4.6.0）──────────────────────────────────
 * 管理系統 /news 發佈 → 成員系統 member-portal 首頁頂部「置頂消息」直接顯示。
 * 純粹「讀同顯示」，冇推送：member-portal 每次載入 fetch 一次 listAnnouncements。
 *   listAnnouncements（公開，免登入）  參數 pinnedOnly / limit / since
 *   getAnnouncements（登入）           連未發佈／已過期／已下架都回，供管理系統列表
 *   saveAnnouncement / deleteAnnouncement / setAnnouncementPinned / setAnnouncementActive
 *     （需要 Perms 矩陣入面 news 卡片 = edit；層級 0 超管永遠可）
 * 呢邊刪咗 / 下架 / 過期 → 成員系統下次載入即刻消失（唔使清 cache）。
 * News 表欄位：title 標題、body 內容、date 日期、pinned 置頂、level 類別、
 *   link/linkLabel 詳情連結、notify 是否廣播（member-portal 可選擇彈 Notification）、
 *   active 發佈中、expiresAt 自動落架日、publishedAt/publishedBy/updatedAt。
 *
 * ── 一次過借多款物資 submitStockBatchRequest（v4.6.1）──────────
 * 成員系統一張表揀多款物資 → 一個 action 搞掂：全部夠貨先寫（唔會寫一半），
 * 每款仍然係 StockRequests 一行（批核／庫存邏輯完全唔變）但共用 batchRef，
 * 只寄一封通知。區職員喺 /stock-regs 見到「一張申請 N 款」，可 setStockBatchStatus
 * 一次過批准／拒絕／歸還（庫存逐行加減，只寄一封俾申請人）。
 * ⚠️ 呢個 action 舊版冇，成員系統以前要 fallback 逐件 POST；而家統一由本檔處理。
 *
 * ── 消息欄位對齊成員系統（v4.6.2）──────────────────────────
 * 成員系統 AnnouncementBanner 讀 { id, title, content, date, pinned, level }，
 * 佢個 proxy 會做欄位白名單，唔喺清單嘅 key 會被剝走。所以本檔 listAnnouncements：
 *   ① 除咗原有 body，額外回一份 content（同內容，畀成員端讀）；
 *   ② level 統一用成員端詞彙 info / warning / important
 *      （舊資料 warn → warning、urgent → important 自動對應，Sheet 唔使改）。
 * 佢個 proxy 唔會轉發 link / linkLabel / notify / districtCode，呢啲欄位只有管理系統用。
 *
 * ── 獎勵提名 Awards（v4.7.0／年期修訂 v4.9.0）──────────────
 * 管理系統 /awards：區會獎勵名冊（一人一行）＋「今年夠期可提名」自動推算。
 *   Awards 表      一人一行；每個獎項一欄，格入面填獲獎年份（可加「?」表示未確定）
 *                  serviceStart = 服務開始年份（委任年份）；入門級獎項（優良服務獎章 7 年、
 *                  五年長期服務獎狀 5 年、長期服務獎章 15 年）由呢個年份起計，冇填就計唔到
 *   AwardTypes 表  獎項清單同年期規則（label／上一級 prevCode／最少相隔 minYears／
 *                  提名期 round：founder 創辦人紀念日、rally 大會操（童軍獎勵）、
 *                  hab 民青局局長嘉許提名期、other 自行申請）
 *                  ★ 全部可以喺 /awards「年期設定」頁面改，唔使改程式、唔使重新部署
 * 加新獎項 → 自動喺 Awards 表補一欄（唔會清走舊資料）。
 * v4.9.0 年期修訂（用戶提供）：
 *   · LAY／會務委員階梯：五年獎狀(5) → 十年獎狀(+5) → 長期服務獎章(15) → 一二三星(每 10 年)
 *   · 香港總監嘉許／高級嘉許／民青局局長嘉許／感謝狀 ＝ 自行申請，一律唔自動推算
 *   · 民青局局長嘉許有提名期：總會每年初發通告收集，2 月初交民青局（死線可喺「年期設定」改）
 *   · 名冊狀態加「沒有提名資格」（noNomination）— 唔會出現喺提名建議
 * 提名期（總會 ACR 20/2024）：創辦人紀念日 區部 10/31 → 總會 11/30；
 *                              童軍獎勵（大會操）區部 4/30 → 總會 5/31。
 *
 * ── 消息發佈 News（v4.9.0 修訂）─────────────────────────
 * 管理入口搬咗去主控台最頂（ADC 層級 3 或以上直接編輯／刪除，唔使再搵卡片）；
 * news 卡片已移除（patchCardRows_ 會清走舊行）。
 * 刪除改為「軟刪除」：deleted=TRUE ＋ deletedAt/deletedBy，Sheet 留底曾經出現過嘅消息；
 * 公開 listAnnouncements 一律唔回已刪除嘅行（成員端即刻消失）。
 *
 * ── 聯絡簿 — 職員姓名區方自訂（v4.9.0）───────────────────
 * ContactNames 表：地域職員姓名可由區方改（電話唔變但人會轉）。
 * key = 「職位|電話|出現次序」，存區方自訂姓名；官方網頁同步返嚟之後會蓋上區方姓名。
 *
 * ── 區通告 Circulars（v4.12.0；PDF only，無公開頁）───────
 * 訓練班 Sheet（ADC 填一次）→ pullCourseProfile 自動帶入訓練班目錄 →
 * 通告草稿自動預填 → 職員列印傳統格式 PDF → 上載區網／交總會（圖書館自動收錄）。
 * 通告編號人手輸入（跨類別共用區編號順序，不只訓練班用），同一區唔可以重複。
 *   getCirculars（登入）   全部狀態＋isOpen＋course snapshot＋suggestedNo
 *   saveCircular／deleteCircular／setCircularStatus（circulars 卡 edit 權限）
 *   pullCourseProfile（canCourse）  由訓練班 Script 讀 getCourseProfile，開班自動填表
 * courseId 掛接 CourseLinks：附帶該班名額／已報／截止 snapshot。
 * v4.16.0 通告全文欄：CourseLinks 加 leader／uniform／remarks／signupText／feeNote
 * （「📥 由通告網址讀取」由區網 PDF／帖文頁帶入，貼帖文頁會自動跟去 PDF 正本）；
 * listCourseLinks 公開回傳多呢 5 欄，成員系統顯示晒區通告格式嘅項目。
 * v4.15.0 寫入防呆：班 Sheet _Sync 版本號（rev 樂觀鎖＋儲存確認）＋訓練班 Script
 * saveCourseBatch 一次過儲存；區系統推送都會 bump rev。
 * v4.14.0 新制直入：區系統填設定 → createCourseSheet 自動複製班 Sheet＋寫入 →
 * pushCourseSetup 雙向同步 → pullCourseSheetRaw 讀全文 → 12 張網頁列印。
 * 區網 PDF 連結回填 CourseLinks.noticeUrl（成員系統訓練班自動跳轉睇真通告）。
 * Config：MEMBER_PORTAL_URL（通告「報名辦法」成員系統報名連結）。
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
  NEWS: 'News',                  // 消息發佈（管理系統主控台頂發 → 成員系統首頁置頂顯示）
  CONTACT_NAMES: 'ContactNames', // 聯絡簿：地域職員姓名區方自訂（電話唔變人會轉）
  FEEDBACK: 'DistrictFeedback', // 一般「你講我聽」意見（主試算表）
  DC_FEEDBACK: 'DCConfidential', // DC 意見管理分頁（主試算表；前端卡片及 API 角色受限）
  AWARDS: 'Awards',              // 獎勵提名名冊（一人一行，每個獎一欄＝獲獎年份）
  UNITS: 'Units',                // 全區旅團名單（旅號、主辦機構、各支部團數）
  UNIT_SECTIONS: 'UnitSections', // v4.29.0 旅→團階層：每個團（支部單位）一列嘅集會時間／地點／社交帳戶
  VISITS: 'Visits',              // 旅團探訪登記（一次探訪一行）
  AWARD_TYPES: 'AwardTypes',     // 獎項及年期設定（可喺管理系統改，唔使改程式）
  INCIDENT_REQ: 'IncidentReports', // 意外報告（HKSA ACC-RPT 2019/07 欄位）
  COURSE_LINKS: 'CourseLinks',   // 訓練班目錄（單一資料來源）
  COURSES: 'Courses',            // 舊版內建課程（保留相容）
  COURSE_REQ: 'CourseRegs',      // 舊版報名（保留相容）
  COURSE_PARAMS: 'CourseParams', // 下拉參數（支部／地域／區會／徽章）
  ALL_RECORDS: 'AllRecords',     // 綜合記錄流水帳
  CIRCULARS: 'Circulars',        // 區通告（職員專用；輸出係傳統格式 PDF）
  DEBIT_NOTES: 'DebitNotes',     // DEBIT NOTE 帳簿（文件、FPS QR 快照及審計欄）
};

// ===================== 安全設定（★ 部署前必改）=====================

var TOKEN_SECRET_PROPERTY = 'PORTAL_TOKEN_SECRET';
var MASTER_PROXY_SECRET_PROPERTY = 'PORTAL_MASTER_PROXY_SECRET';
var TOKEN_TTL_HOURS = 12;

/** 只從 Script Properties 讀取私密簽署密鑰；絕不回退到原始碼常數。 */
function getTokenSecret_() {
  try {
    var value = String(PropertiesService.getScriptProperties().getProperty(TOKEN_SECRET_PROPERTY) || '');
    return value.length >= 32 ? value : '';
  } catch (e) { return ''; }
}
/** 首次 setup 時每個 Apps Script 專案自動建立獨立高熵密鑰；已有有效值不改。 */
function ensureTokenSecret_() {
  if (getTokenSecret_()) return false;
  var value = '';
  for (var i = 0; i < 6; i++) value += Utilities.getUuid().replace(/-/g, '');
  if (value.length < 64) throw new Error('無法安全建立 Token 簽署密鑰');
  PropertiesService.getScriptProperties().setProperty(TOKEN_SECRET_PROPERTY, value);
  return true;
}
/** Vercel → Apps Script 專用高熵橋接密鑰。 */
function getMasterProxySecret_() {
  try {
    var value = String(PropertiesService.getScriptProperties().getProperty(MASTER_PROXY_SECRET_PROPERTY) || '');
    return /^[a-f0-9]{64,}$/i.test(value) ? value : '';
  } catch (e) { return ''; }
}
/** 首次 setup 自動建立機器橋接密鑰；由管理員從私密選單顯示並貼入 Vercel。 */
function ensureMasterProxySecret_() {
  if (getMasterProxySecret_()) return false;
  var value = '';
  for (var i = 0; i < 4; i++) value += Utilities.getUuid().replace(/-/g, '');
  if (value.length < 64) throw new Error('無法安全建立維護登入橋接密鑰');
  PropertiesService.getScriptProperties().setProperty(MASTER_PROXY_SECRET_PROPERTY, value);
  return true;
}
function hmacSha256Hex_(message, secret) {
  return Utilities.computeHmacSha256Signature(String(message), String(secret)).map(function (b) {
    return ('0' + ((Number(b) + 256) % 256).toString(16)).slice(-2);
  }).join('');
}
function constantTimeEqual_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function isLegacySharedPassword_(password) {
  var value = String(password || '');
  return value === '1234' || value === 'scout1234';
}
function temporaryPassword_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 24);
}

var DC_ROLE = 'DC';
var SYSADMIN_ROLE = 'SYSADMIN';
function isAdminRole_(role) { return role === DC_ROLE || role === SYSADMIN_ROLE; }
function canViewYmisRole_(role) {
  role = String(role || '').trim().toUpperCase();
  return role === DC_ROLE || role === 'DDC_ADMIN' || role === 'DDC_TRAINING'
    || role === 'ADC_SCOUT' || role === 'ADC_CUBS' || role === 'ADC_GH'
    || role === 'ADC_ROVER' || role === 'ADC_VENTURE' || role === 'STAFF';
}

// DEBIT NOTE 屬區會財務文件：超管擁有最高權限，另開放 DC、行政 DDC 及區職員。
// 其他 DDC、ADC、領袖或自訂角色不能靠誤改 Perms 擴大此卡權限。
var DEBIT_NOTE_ROLES = ['DC', 'SYSADMIN', 'DDC_ADMIN', 'STAFF'];
function canGenerateDebitNoteRole_(role) {
  return DEBIT_NOTE_ROLES.indexOf(String(role || '').trim().toUpperCase()) >= 0;
}

// ── 帳戶層級（v4.4.0）─────────────────────────────────────
// 0 超管（隱藏、最高）／1 區總監／2 副區總監／3 助理區總監／4 區職員／5 區長、區領袖、助理區領袖及自訂角色
var LEVEL_SUPER = 0, LEVEL_DC = 1, LEVEL_DDC = 2, LEVEL_ADC = 3, LEVEL_STAFF = 4, LEVEL_OTHER = 5;
var LEVEL_LABELS = { 0: '超管', 1: '區總監', 2: '副區總監', 3: '助理區總監', 4: '區職員', 5: '區長／領袖' };
/** 由角色碼推導層級；Roles 表如有 level 欄（數字）則以該值為準 */
function levelOfRole_(role) {
  role = String(role || '').trim().toUpperCase();
  if (!role) return LEVEL_OTHER;
  var r = null;
  try { r = getRoleObj_(role); } catch (e) { r = null; }
  if (r && r.level !== '' && r.level != null && !isNaN(Number(r.level))) {
    var lv = Math.round(Number(r.level));
    if (lv >= 0 && lv <= 9) return lv;
  }
  if (role === SYSADMIN_ROLE) return LEVEL_SUPER;
  if (role === DC_ROLE) return LEVEL_DC;
  if (role.indexOf('DDC') === 0) return LEVEL_DDC;
  if (role.indexOf('ADC') === 0) return LEVEL_ADC;
  if (role === 'STAFF') return LEVEL_STAFF;
  return LEVEL_OTHER;
}
/** 某帳戶嘅實際層級：Users.level（數字）優先，否則按角色 */
function levelOfUser_(email, role) {
  if (String(email || '').toLowerCase() === String(MASTER_EMAIL).toLowerCase()) return LEVEL_SUPER;
  var u = readSheet_(SHEET.USERS).filter(function (x) {
    return String(x.email).trim().toLowerCase() === String(email || '').trim().toLowerCase();
  })[0];
  if (u && u.level !== '' && u.level != null && !isNaN(Number(u.level))) {
    var lv = Math.round(Number(u.level));
    if (lv >= 0 && lv <= 9) return lv;
  }
  return levelOfRole_(u ? u.role : role);
}
function levelLabel_(lv) { return LEVEL_LABELS[lv] || ('第 ' + lv + ' 級'); }

// 開戶權限：DDC 或以上（層級 ≤ 2；兼容舊角色名單）
var ACCOUNT_MANAGER_ROLES = ['DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING'];
function isAccountManager_(role) {
  return ACCOUNT_MANAGER_ROLES.indexOf(String(role || '').trim()) >= 0 || levelOfRole_(role) <= LEVEL_DDC;
}

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

// 核心維護帳戶：密碼只存在 Vercel；Apps Script 只驗證伺服器簽署的短效授權。
var MASTER_EMAIL = 'sheep';
/** Script 維護超管刻意不存在於 Users 表；只接受已簽名 token 內的 MASTER 身份及 SYSADMIN 角色。 */
function isMaintenanceSuper_(email, role) {
  return String(email || '').trim().toLowerCase() === String(MASTER_EMAIL || '').trim().toLowerCase()
    && String(role || '').trim().toUpperCase() === SYSADMIN_ROLE;
}

// 外掛清單（轉駁器）
var REGISTRY_URL = 'https://YOUR-HUB.vercel.app/api/registry.json';

// 舊版共享初始密碼只作拒絕登入／拒絕重設的相容檢查。
var PRESET_USERS = [
  // email, role, displayName, scopes, level
  ['sysadmin@skwscout.org.hk',     'SYSADMIN',     '系統管理員（超管）',   'all',      0],
  ['dc@skwscout.org.hk',           'DC',           '區總監',               'all',      1],
  ['ddc.admin@skwscout.org.hk',    'DDC_ADMIN',    '副區總監（行政）',     'admin',    2],
  ['ddc.training@skwscout.org.hk', 'DDC_TRAINING', '副區總監（訓練）',     'training', 2],
  ['adc.gh@skwscout.org.hk',       'ADC_GH',       '助理區總監（小童軍）', 'gh',       3],
  ['adc.cub@skwscout.org.hk',      'ADC_CUBS',     '助理區總監（幼童軍）', 'cubs',     3],
  ['adc.scout@skwscout.org.hk',    'ADC_SCOUT',    '助理區總監（童軍）',   'scout',    3],
  ['adc.venture@skwscout.org.hk',  'ADC_VENTURE',  '助理區總監（深資童軍）', 'venture', 3],
  ['adc.rover@skwscout.org.hk',    'ADC_ROVER',    '助理區總監（樂行童軍）', 'rover',  3],
  ['info@skwscout.org.hk',         'STAFF',        '區職員',               'admin',    4],
];

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
      version: '4.29.0',
      feedbackReady: feedbackReady_(),
      dcFeedbackReady: dcFeedbackReady_(),
      districtName: getConfigValue_('districtName') || '',
      districtCode: getConfigValue_('districtCode') || '',
      apiKeySet: !!getConfigValue_('API_KEY_HASH'),
      tokenSecretSet: !!getTokenSecret_(),
      masterProxyBridgeSet: !!getMasterProxySecret_(),
      teamupReady: teamupReady_(),
      teamupPendingSet: !!(teamupCfg_().pendingSub),
      teamupApprovedSet: !!(teamupCfg_().approvedSub),
      teamupAttendeeFieldSet: !!(teamupCfg_().attendeeFieldKey),
      ttlockConfigured: ttlockReady_(),
      lockIdSet: !!(lockCfg_().lockId),
      ttlockDisabled: ttlockDisabled_(),
    }));
  }

  // ★ API Key 認證
  var hash = getConfigValue_('API_KEY_HASH');
  if (!hash || sha256_(String(p.apiKey || '').trim()) !== hash) {
    return json(err('Unauthorized: API key is not configured or is invalid'));
  }
  var passwordGate = passwordChangeGate_(action, p.token);
  if (passwordGate) return json(err(passwordGate));

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
      case 'listAnnouncements':   return json(ok(listAnnouncements_(p)));
      case 'listDistrictTroops':  return json(listDistrictTroops_());

      // ---------- 管理系統（角色制） ----------
      case 'verify':              return json(verify_(p.token));
      case 'getCards':            return json(getCards_(p.token));
      case 'listDebitNotes':      return json(listDebitNotes_(p.token));
      case 'getPerms':            return json(getPerms_(p.token));
      case 'getUsers':            return json(getUsers_(p.token));
      case 'getDelegation':       return json(getDelegation_(p.token));
      case 'getRegistry':         return json(getRegistry_(p.token));
      case 'getCourseLinks':      return json(getCourseLinks_(p.token));
      case 'getVenueBookings':    return json(getVenueBookings_(p.token));
      case 'getLockList':         return json(getLockList_(p.token));
      case 'getStockRequests':    return json(getStockRequests_(p.token));
      case 'getPendingInbox':     return json(getPendingInbox_(p.token));
      case 'getActivityNotices':  return json(getActivityNotices_(p.token));
      case 'getAwardsBoard':      return json(getAwardsBoard_(p.token));
      case 'getVisitBoard':       return json(getVisitBoard_(p.token, p.from, p.to));
      case 'getAnnouncements':    return json(getAnnouncements_(p.token));
      case 'getCirculars':         return json(getCirculars_(p.token));
      case 'getAllRecords':       return json(getAllRecords_(p.token));
      case 'listIncidentReports': return json(listIncidentReports_(p.token));
      case 'getDistrictFeedback': return json(getDistrictFeedback_(p.token));
      case 'getDCFeedback':       return json(getDCFeedback_(p.token));

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
  if (!hash || sha256_(String(b.apiKey || '').trim()) !== hash) {
    return json(err('Unauthorized: API key is not configured or is invalid'));
  }
  var passwordGate = passwordChangeGate_(action, b.token);
  if (passwordGate) return json(err(passwordGate));

  try {
    switch (action) {

      // ---------- 公開提交（成員系統，唔使登入） ----------
      case 'submitVenueRequest':
      case 'addVenueRequest':      return json(submitVenueRequest_(b));
      case 'submitStockRequest':
      case 'addStockRequest':      return json(submitStockRequest_(b));
      case 'submitStockBatchRequest':
      case 'addStockBatchRequest': return json(submitStockBatchRequest_(b));
      case 'submitActivityNotice': return json(submitActivityNotice_(b));
      case 'submitCourseReg':      return json(submitCourseReg_(b));
      case 'submitDistrictFeedback': return json(submitDistrictFeedback_(b));

      // ---------- 登入 ----------
      case 'proxyMasterLogin':     return json(proxyMasterLogin_(b.assertion, b.signature));
      case 'login':                return json(login_(b.email, b.password, b.remember));
      case 'staffLogin':           return json(staffLogin_(b.email, b.password));
      case 'changePassword':       return json(changePassword_(b.token, b.oldPassword, b.newPassword));
      case 'requestPasswordReset': return json(requestPasswordReset_(b.email, b.resetUrlBase));
      case 'resetPassword':        return json(resetPassword_(b.resetToken, b.newPassword));
      case 'delegatePerms':        return json(delegatePerms_(b.token, b.targetRole, b.grants));
      case 'revokePerms':          return json(revokePerms_(b.token, b.targetRole));
      case 'changeStaffPassword':  return json(changeStaffPassword_(b.token, b.oldPassword, b.newPassword));

      // ---------- 批核（管理系統） ----------
      case 'setVenueBookingStatus': return json(setVenueBookingStatus_(b.token, b.id, b.status));
      case 'setStockRequestStatus': return json(setStockRequestStatus_(b.token, b.id, b.status));
      case 'setStockBatchStatus':   return json(setStockBatchStatus_(b.token, b.batchRef, b.status));
      case 'confirmVenueBooking':   return json(confirmVenueBooking_(b.token, b.id));
      case 'approveVenueBooking':   return json(approveVenueBooking_(b.token, b.id, b));
      case 'rejectVenueBooking':    return json(rejectVenueBooking_(b.token, b.id));
      case 'updateVenueBooking':    return json(updateVenueBooking_(b.token, b.id, b.patch || b));
      case 'getLockList':           return json(getLockList_(b.token));
      case 'getVenueLockConfig':    return json(getVenueLockConfig_(b.token));
      case 'saveVenueLockConfig':   return json(saveVenueLockConfig_(b.token, b.config || b));
      case 'setCourseRegStatus':    return json(setCourseRegStatus_(b.token, b.courseId, b.id, b.status));
      case 'setRegFeePaid':         return json(setRegFeePaid_(b.token, b.courseId, b.id, b.paid));

      // ---------- 場地／物資維運 ----------
      case 'saveVenue':            return json(saveVenue_(b.token, b.venue));
      case 'deleteVenue':          return json(deleteVenue_(b.token, b.venueId));
      case 'saveItem':             return json(saveItem_(b.token, b.item));
      case 'deleteItem':           return json(deleteItem_(b.token, b.itemId));
      case 'deleteActivityNotice': return json(deleteActivityNotice_(b.token, b.id));

      // ---------- 消息發佈（管理系統發，成員系統首頁顯示） ----------
      case 'saveAwardMember':     return json(saveAwardMember_(b.token, b.member || b.award));
      case 'deleteAwardMember':   return json(deleteAwardMember_(b.token, b.id));
      case 'importAwardMembers':  return json(importAwardMembers_(b.token, b.rows, b.mode));
      case 'saveAwardTypes':      return json(saveAwardTypes_(b.token, b.types));
      case 'saveAwardDeadlines':  return json(saveAwardDeadlines_(b.token, b.cfg || b.deadlineCfg || b));

      // ---------- 旅團探訪（v4.8.1） ----------
      case 'saveVisit':           return json(saveVisit_(b.token, b.visit || b));
      case 'deleteVisit':         return json(deleteVisit_(b.token, b.id));
      case 'saveDebitNote':       return json(saveDebitNote_(b.token, b.note || b.debitNote || {}));
      case 'importDebitNotes':    return json(importDebitNotes_(b.token, b.rows));
      case 'saveUnits':           return json(saveUnits_(b.token, b.units));
      case 'saveUnitSections':    return json(saveUnitSections_(b.token, b.rows || b.unitSections));
      case 'saveAnnouncement':      return json(saveAnnouncement_(b.token, b.announcement || b.news || b));
      case 'deleteAnnouncement':    return json(deleteAnnouncement_(b.token, b.id));
      case 'restoreAnnouncement':   return json(restoreAnnouncement_(b.token, b.id));
      case 'setAnnouncementPinned': return json(setAnnouncementPinned_(b.token, b.id, b.pinned));
      case 'setAnnouncementActive': return json(setAnnouncementActive_(b.token, b.id, b.active));
      case 'getContactNames':       return json(getContactNames_(b.token));
      case 'saveContactName':       return json(saveContactName_(b.token, b.key, b.name));

      // ---------- 意外／應變：意外報告（管理系統，需登入） ----------
      case 'submitIncidentReport': return json(submitIncidentReport_(b.token, b.report || b));
      case 'updateIncidentReport': return json(updateIncidentReport_(b.token, b.id, b.patch || {}));
      case 'deleteIncidentReport': return json(deleteIncidentReport_(b.token, b.id));

      // ---------- 訓練班目錄 ----------
      case 'saveCourseLink':       return json(saveCourseLink_(b.token, b.link));
      case 'deleteCourseLink':     return json(deleteCourseLink_(b.token, b.courseId));
      case 'saveCourse':           return json(saveCourse_(b.token, b.course));
      case 'deleteCourse':         return json(deleteCourse_(b.token, b.courseId));
      case 'pullCourseProfile':    return json(pullCourseProfile_(b.token, b));
      case 'createCourseSheet':    return json(createCourseSheet_(b.token, b));
      case 'pushCourseSetup':      return json(pushCourseSetup_(b.token, b));
      case 'pullCourseSheetRaw':   return json(pullCourseSheetRaw_(b.token, b));
      case 'getCourseSetup':       return json(getCourseSetup_(b.token, b.courseId));
      // v4.17.0 新版流程（訓練班系統先行）：批核＋修訂＋收款核對＋CL 電郵＋開班指引
      case 'pullCourseSummary':    return json(pullCourseSummary_(b.token, b));
      case 'saveCourseApproval':   return json(saveCourseApproval_(b.token, b));
      case 'setCoursePaymentCheck': return json(setCoursePaymentCheck_(b.token, b));
      case 'setCourseRefund': return json(setCourseRefund_(b.token, b));
      case 'sendCourseEmail':      return json(sendCourseEmail_(b.token, b));
      case 'sendCourseRegNotice':  return json(sendCourseRegNotice_(b.token, b));
      case 'getCourseOpsInfo':     return json(getCourseOpsInfo_(b.token));
      case 'listHubCourses':       return json(listHubCourses_(b.token));

      // ---------- 區通告 ----------
      case 'saveCircular':         return json(saveCircular_(b.token, b.circular || {}));
      case 'deleteCircular':       return json(deleteCircular_(b.token, b.id));
      case 'getYmisCredentials':  return json(getYmisCredentials_(b.token));
      case 'setBudgetSheetUrl':   return json(setBudgetSheetUrl_(b.token, b.budgetSheetUrl));
      case 'setCircularStatus':    return json(setCircularStatus_(b.token, b.id, b.status));

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
/** 確保工作表第 1 列有指定欄名（冇就只喺最右邊追加表頭，唔郁舊資料），回傳 1-based 欄號 */
function ensureSheetColumn_(sh, header) {
  if (!sh) return -1;
  var ci = colIdxByHeader_(sh, header);
  if (ci > 0) return ci;
  var nextCol = Math.max(1, sh.getLastColumn() + 1);
  var hdrCell = sh.getRange(1, nextCol);
  hdrCell.setValue(header);
  hdrCell.setFontWeight('bold');
  return nextCol;
}
/** 以純文字格式寫入儲存格（自動補缺欄），保留前導 0（如 0123 密碼）及 +852 帳號 */
function setTextCellByHeader_(sh, rowIdx, header, value) {
  var ci = ensureSheetColumn_(sh, header);
  if (ci > 0 && rowIdx > 0) {
    var r = sh.getRange(rowIdx, ci);
    r.setNumberFormat('@');
    r.setValue(value === undefined || value === null ? '' : String(value));
  }
}
function getCellByHeader_(sh, rowIdx, header) {
  var ci = colIdxByHeader_(sh, header);
  return ci > 0 ? sh.getRange(rowIdx, ci).getValue() : '';
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
  return (cfg[key] !== undefined && cfg[key] !== null && cfg[key] !== '') ? String(cfg[key]) : '';
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
/** 純文字寫入 Config（防止 +852 電話帳號變公式、前導 0 密碼／Lock ID 被吞走） */
function setConfigTextValue_(key, value, description) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CONFIG);
  if (!sh) return;
  var textVal = value === undefined || value === null ? '' : String(value);
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === key) {
      var cell = sh.getRange(i + 1, 2);
      cell.setNumberFormat('@');
      cell.setValue(textVal);
      return;
    }
  }
  var nextRow = sh.getLastRow() + 1;
  sh.getRange(nextRow, 1).setValue(key);
  var newCell = sh.getRange(nextRow, 2);
  newCell.setNumberFormat('@');
  newCell.setValue(textVal);
  sh.getRange(nextRow, 3).setValue(description || '');
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
    // v4.5.0 區年度預算：Google Sheet 網址（含 gid）；留空 = 前端內建預設（筲箕灣區 2025-26 Year Plan）
    budgetSheetUrl: getConfigValue_('BUDGET_SHEET_URL') || '',
    // v4.12.0 區通告：成員系統網址（通告「報名辦法」報名連結用）
    memberPortalUrl: getConfigValue_('MEMBER_PORTAL_URL') || '',
    // v4.14.0 新制直入：訓練班總模版有冇設定（CourseLinks.sheetId 班先有後端直讀）
    courseTemplateSet: !!String(getConfigValue_('COURSE_TEMPLATE_ID') || '').trim(),
    // v4.17.0 新版流程：訓練班郵件 alias（留空=部署帳戶本身地址）＋CourseFactory 開班網址
    courseEmailFrom: getConfigValue_('COURSE_EMAIL_FROM') || '',
    courseFactoryUrl: getConfigValue_('COURSE_FACTORY_URL') || '',
    // v6.2.1 對接：新制 hub 網址＋區系統密匙有冇設（公開端只回 boolean，唔洩漏 opsKey）
    courseHubUrl: getConfigValue_('COURSE_HUB_URL') || '',
    courseOpsKeySet: !!String(getConfigValue_('COURSE_OPS_KEY') || '').trim(),
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
    memberPortalUrl: getConfigValue_('MEMBER_PORTAL_URL') || '',
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

var TOKEN_TTL_REMEMBER_HOURS = 24 * 30; // 「記住我」：30 日
function makeToken_(email, role, ttlHours, accountStore) {
  var secret = getTokenSecret_();
  if (!secret) throw new Error('登入安全設定未完成：PORTAL_TOKEN_SECRET');
  var hours = Number(ttlHours) > 0 ? Math.min(Number(ttlHours), TOKEN_TTL_REMEMBER_HOURS) : TOKEN_TTL_HOURS;
  var exp = Date.now() + hours * 3600 * 1000;
  var source = accountStore === 'staff' ? 'staff' : accountStore === 'proxy' ? 'proxy' : 'users';
  var payload = email + '|' + role + '|' + exp + '|' + source;
  return Utilities.base64EncodeWebSafe(payload + '|' + sha256_(payload + secret).slice(0, 32));
}
function checkToken_(token) {
  if (!token) return { valid: false };
  try {
    var secret = getTokenSecret_();
    if (!secret) return { valid: false };
    var raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString();
    var p = raw.split('|'), email = p[0], role = p[1], exp = Number(p[2]), source = p[3], sig = p[4];
    if (!email || !role || (source !== 'users' && source !== 'staff' && source !== 'proxy') || !isFinite(exp) || exp < Date.now() || exp > Date.now() + (TOKEN_TTL_REMEMBER_HOURS + 1) * 3600 * 1000) return { valid: false };
    var payload = email + '|' + role + '|' + exp + '|' + source;
    if (sig !== sha256_(payload + secret).slice(0, 32)) return { valid: false };
    // 維護帳戶只接受新代理流程簽發的 proxy source token；舊 master token 一律失效。
    if (email.toLowerCase() === String(MASTER_EMAIL).toLowerCase()) {
      if (source !== 'proxy' || role !== SYSADMIN_ROLE) return { valid: false };
      return { valid: true, email: email, role: role, source: source };
    }
    if (source === 'proxy') return { valid: false };
    var store = source === 'users' ? SHEET.USERS : SHEET.STAFF;
    var account = readSheet_(store).filter(function (u) {
      return String(u.email || '').trim().toLowerCase() === email.toLowerCase();
    })[0];
    var currentRole = store === SHEET.STAFF ? String((account && account.role) || 'STAFF').trim() : String((account && account.role) || '').trim();
    if (!account || String(account.active || '').toUpperCase() === 'FALSE' || currentRole !== role) return { valid: false };
    return { valid: true, email: email, role: role, source: source };
  } catch (e) { return { valid: false }; }
}
/** 首次／臨時密碼未更換前，HTTP API 只准驗證、讀取卡片清單及改密碼。 */
function passwordChangeGate_(action, token) {
  if (!token || action === 'verify' || action === 'getCards' || action === 'changePassword') return '';
  var t = checkToken_(token);
  if (!t.valid || isMaintenanceSuper_(t.email, t.role)) return '';
  var user = readSheet_(SHEET.USERS).filter(function (u) {
    return String(u.email || '').trim().toLowerCase() === String(t.email || '').trim().toLowerCase();
  })[0];
  return user && String(user.active || '').toUpperCase() !== 'FALSE' && isTrue_(user.mustChangePassword)
    ? '請先更換初始／臨時密碼，完成後才可使用其他功能。' : '';
}

// ===================== 登入（雙軌） =====================

/**
 * 僅供 Vercel server-to-server 使用。授權內容由橋接密鑰 HMAC 簽署、30 秒到期、nonce 一次性。
 * API Key 單獨不足以呼叫本入口；sheep 密碼不會傳到或儲存在 Apps Script。
 */
function proxyMasterLogin_(assertion, signature) {
  var secret = getMasterProxySecret_();
  if (!secret || !assertion || String(assertion).length > 2048) return err('維護登入橋接未設定');
  var raw = String(assertion), expected = hmacSha256Hex_(raw, secret);
  if (!constantTimeEqual_(String(signature || '').toLowerCase(), expected)) return err('維護登入授權無效');
  var grant;
  try { grant = JSON.parse(raw); } catch (e) { return err('維護登入授權格式錯誤'); }
  var now = Date.now();
  if (!grant || String(grant.email || '').trim().toLowerCase() !== String(MASTER_EMAIL).toLowerCase()
      || !/^[a-f0-9]{32}$/i.test(String(grant.nonce || ''))
      || !isFinite(Number(grant.exp)) || Number(grant.exp) < now || Number(grant.exp) > now + 60000) {
    return err('維護登入授權已過期或格式錯誤');
  }
  var nonceLock;
  try {
    nonceLock = LockService.getScriptLock();
    if (!nonceLock.tryLock(5000)) return err('維護登入防重放檢查忙碌，請稍後重試');
    var cache = CacheService.getScriptCache();
    var nonceKey = 'master_proxy_nonce_' + sha256_(String(grant.nonce));
    if (cache.get(nonceKey)) return err('維護登入授權已使用');
    cache.put(nonceKey, '1', 120);
  } catch (e) { return err('維護登入防重放檢查失敗'); }
  finally { try { if (nonceLock) nonceLock.releaseLock(); } catch (ignored) {} }
  if (!getTokenSecret_()) return err('系統登入安全設定未完成，請管理員執行 setupSheets()');
  var email = String(MASTER_EMAIL);
  // 高權限維護 session 不提供「記住我」延長，密碼變更後舊 session 最遲 12 小時到期。
  var ttl = TOKEN_TTL_HOURS;
  return ok({
    email: email, displayName: '系統維護', role: SYSADMIN_ROLE, roleLabel: '超管',
    isAdmin: true, isDC: true, canManageAccounts: true, scopes: ['all'],
    token: makeToken_(email, SYSADMIN_ROLE, ttl, 'proxy'),
    level: LEVEL_SUPER, levelLabel: levelLabel_(LEVEL_SUPER), isSuper: true, mustChangePassword: false,
  });
}

/** 管理系統：Users 表（角色制）；sheep 必須走 Vercel proxyMasterLogin。 */
function login_(email, password, remember) {
  if (!email || !password) return err('請輸入帳號及密碼');
  if (!getTokenSecret_()) return err('系統登入安全設定未完成，請管理員執行 setupSheets()');
  email = String(email).trim();
  var ttl = isTrue_(remember) ? TOKEN_TTL_REMEMBER_HOURS : TOKEN_TTL_HOURS;
  // sheep 只能由 Vercel proxy 驗證密碼後，透過短效 HMAC 授權登入。
  if (email.toLowerCase() === String(MASTER_EMAIL).toLowerCase()) return err('維護帳號只可透過平台登入');

  if (isLegacySharedPassword_(password)) return err('共用初始密碼已停用，請用「忘記密碼」重設，或聯絡管理員。');
  if (getSystemState_().locked) return err('系統維護中，暫停登入。');

  email = email.toLowerCase();
  var user = readSheet_(SHEET.USERS).filter(function (u) {
    return String(u.email).trim().toLowerCase() === email && String(u.active).toUpperCase() !== 'FALSE';
  })[0];
  if (!user) return err('帳號不存在或已停用');
  if (sha256_(password + (user.salt || '')) !== String(user.passwordHash).trim()) return err('帳號或密碼不正確');

  return ok(sessionPayload_(user, makeToken_(email, user.role, ttl)));
}

/** 統一組裝前端 session（login / verify 共用） */
function sessionPayload_(user, token) {
  var email = String(user.email).trim().toLowerCase();
  var roleInfo = getRole_(user.role);
  var lv = levelOfUser_(email, user.role);
  return {
    email: email, displayName: user.displayName || email, role: user.role,
    roleLabel: roleInfo.label || user.role,
    isAdmin: isAdminRole_(user.role) || lv <= LEVEL_DC, isDC: user.role === DC_ROLE || lv === LEVEL_DC,
    canManageAccounts: isAccountManager_(user.role) || lv <= LEVEL_DDC,
    scopes: splitList_(user.scopes), token: token,
    level: lv, levelLabel: levelLabel_(lv), isSuper: lv === LEVEL_SUPER,
    mustChangePassword: isTrue_(user.mustChangePassword),
  };
}

function verify_(token) {
  var t = checkToken_(token);
  if (!t.valid || (t.source !== 'users' && t.source !== 'proxy')) return err('token 無效或已過期');
  if (String(t.email).toLowerCase() === String(MASTER_EMAIL).toLowerCase()) {
    return ok({ email: t.email, role: t.role, level: LEVEL_SUPER, isSuper: true, mustChangePassword: false });
  }
  var user = readSheet_(SHEET.USERS).filter(function (u) {
    return String(u.email).trim().toLowerCase() === String(t.email).trim().toLowerCase() && String(u.active).toUpperCase() !== 'FALSE';
  })[0];
  if (!user) return err('帳號不存在或已停用');
  return ok(sessionPayload_(user, token));
}

// ===================== 密碼：首次登入必改 / 忘記密碼（v4.4.0） =====================

/** 登入後改密碼（首次登入 mustChangePassword=TRUE 時前端會強制先行） */
function setPassword_(sh, row, newPassword) {
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  sh.getRange(row, 2, 1, 2).setValues([[sha256_(String(newPassword) + salt), salt]]);
  setCellByHeader_(sh, row, 'mustChangePassword', 'FALSE');
}
function validateNewPassword_(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return '新密碼最少 8 個字元';
  if (isLegacySharedPassword_(pw)) return '新密碼不可使用共用初始密碼';
  return '';
}

/** 忘記密碼（公開）：只會寄去該帳戶登記嘅電郵；無論帳戶存在與否都回應成功，避免被人試帳號 */
function requestPasswordReset_(email, resetUrlBase) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return err('請輸入帳號電郵');
  var generic = ok({ sent: true, message: '如該電郵已登記，重設連結已寄出（24 小時內有效）。' });
  var user = readSheet_(SHEET.USERS).filter(function (u) {
    return String(u.email).trim().toLowerCase() === email && String(u.active).toUpperCase() !== 'FALSE';
  })[0];
  if (!user || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return generic;
  var exp = Date.now() + 24 * 3600 * 1000;
  var payload = 'reset|' + email + '|' + exp;
  var secret = getTokenSecret_();
  if (!secret) return err('系統登入安全設定未完成');
  var token = Utilities.base64EncodeWebSafe(payload + '|' + sha256_(payload + secret + String(user.passwordHash)).slice(0, 40));
  var districtName = getConfigValue_('districtName') || '童軍區';
  var base = String(resetUrlBase || '').trim();
  var link = base ? (base + (base.indexOf('?') >= 0 ? '&' : '?') + 'reset=' + encodeURIComponent(token)) : '';
  var body = '你（或其他人）要求重設「' + districtName + '管理系統」帳戶 ' + email + ' 嘅密碼。\n\n'
    + (link ? '請喺 24 小時內開啟以下連結設定新密碼：\n' + link + '\n\n' : '重設代碼（24 小時內有效，請喺登入頁「忘記密碼 → 已有重設代碼」貼上）：\n' + token + '\n\n')
    + '如果唔係你本人要求，請忽略此電郵，密碼唔會改變。\n\n' + districtName + ' 管理系統';
  try {
    MailApp.sendEmail({ to: email, subject: '[' + districtName + '] 重設密碼', body: body, name: venueMailConfig_().fromName });
  } catch (e) { return err('寄出電郵失敗：' + e); }
  return generic;
}
/** 用重設代碼設定新密碼（公開）；代碼綁定舊密碼雜湊，用過一次即失效 */
function resetPassword_(resetToken, newPassword) {
  if (!resetToken) return err('缺少重設代碼');
  var v = validateNewPassword_(newPassword); if (v) return err(v);
  var raw = '';
  try { raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(String(resetToken).trim())).getDataAsString(); } catch (e) { return err('重設代碼無效'); }
  var p = raw.split('|');
  if (p.length !== 4 || p[0] !== 'reset') return err('重設代碼無效');
  var email = p[1], exp = Number(p[2]), sig = p[3];
  if (!(Date.now() < exp)) return err('重設代碼已過期，請重新申請');
  var user = readSheet_(SHEET.USERS).filter(function (u) {
    return String(u.email).trim().toLowerCase() === String(email).toLowerCase();
  })[0];
  if (!user) return err('帳戶不存在');
  var payload = 'reset|' + email + '|' + exp;
  var secret = getTokenSecret_();
  if (!secret || sig !== sha256_(payload + secret + String(user.passwordHash)).slice(0, 40)) return err('重設代碼無效或已使用');
  var row = userRowIndex_(email); if (row < 0) return err('帳戶不存在');
  setPassword_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS), row, newPassword);
  return ok({ reset: true, email: email });
}

/** 成員系統 /staff 舊介面：Staff 表（canVenue/canStock/…） */
function staffLogin_(email, password) {
  if (!email || !password) return err('請輸入帳號及密碼');
  if (!getTokenSecret_()) return err('系統登入安全設定未完成，請管理員執行 setupSheets()');
  email = String(email).trim();
  if (email.toLowerCase() === String(MASTER_EMAIL).toLowerCase()) return err('維護帳號只可透過平台登入');

  if (isLegacySharedPassword_(password)) return err('共用初始密碼已停用，請用「忘記密碼」重設，或聯絡管理員。');
  if (getSystemState_().locked) return err('系統維護中，暫停登入。');

  // 先試 Staff 表
  var s = readSheet_(SHEET.STAFF).filter(function (x) {
    return String(x.email).trim().toLowerCase() === email.toLowerCase() && String(x.active).toUpperCase() !== 'FALSE';
  })[0];
  if (s && sha256_(String(password) + (s.salt || '')) === String(s.passwordHash).trim()) {
    var role = s.role || 'STAFF';
    return ok({
      email: String(s.email).trim(), name: s.name || s.email, role: role,
      token: makeToken_(String(s.email).trim(), role, TOKEN_TTL_HOURS, 'staff'),
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
  var p = staffPerms_(t.email, t.role, t.source);
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

/** 讀取 Perms 表頭有涵蓋嘅角色清單（用嚟判斷某角色是否已由 Perms 矩陣接管） */
function permSheetRoles_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.PERMS);
  if (!sh) return [];
  var v = sh.getDataRange().getValues();
  if (!v.length) return [];
  return v[0].slice(1).map(function (x) { return String(x).trim(); }).filter(Boolean);
}

/** 實時讀取某帳號嘅權限：Staff 表優先，否則跟 Perms 矩陣（venueReg / stockReg / training），最後先用預設角色推導 */
function staffPerms_(email, role, source) {
  if (isMaintenanceSuper_(email, role)) {
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
  if (source === 'staff') return { canVenue: false, canStock: false, canCourse: false, canStaff: false };
  if (levelOfUser_(email, role) === LEVEL_SUPER) return { canVenue: true, canStock: true, canCourse: true, canStaff: true };
  var u = readSheet_(SHEET.USERS).filter(function (x) {
    return String(x.email).trim().toLowerCase() === String(email).trim().toLowerCase();
  })[0];
  if (u && String(u.active).toUpperCase() === 'FALSE') {
    return { canVenue: false, canStock: false, canCourse: false, canStaff: false };
  }
  var effRole = String((u && u.role) ? u.role : role || '').trim();
  var base = permsByRole_(effRole);
  var pRoles = permSheetRoles_();
  if (pRoles.indexOf(effRole) >= 0) {
    var perms = readPerms_();
    var scopeOverride = u && u.cards ? splitList_(u.cards) : null;
    var hasEdit = function (cid, fallback) {
      if (scopeOverride && scopeOverride.indexOf(cid) < 0) return false;
      // Perms 可收窄角色的原生操作能力，但不可將 canVenue/canStock/canCourse 為 false 的角色提升。
      if (!fallback) return false;
      if (!perms[cid]) return fallback;
      return perms[cid][effRole] === 'edit';
    };
    return {
      canVenue: hasEdit('venueReg', base.canVenue),
      canStock: hasEdit('stockReg', base.canStock),
      canCourse: hasEdit('training', base.canCourse),
      canStaff: base.canStaff,
    };
  }
  return base;
}

/** 只需登入 */
function requireLogin_(token) {
  var t = checkToken_(token);
  if (!t.valid || (t.source !== 'users' && !isMaintenanceSuper_(t.email, t.role))) return { error: '登入已過期' };
  return t;
}
/** 需要管理員（DC / SYSADMIN） */
function requireAdmin_(token) {
  var t = checkToken_(token);
  if (!t.valid || (t.source !== 'users' && !isMaintenanceSuper_(t.email, t.role))) return { error: '登入已過期' };
  if (!isAdminRole_(t.role) && levelOfUser_(t.email, t.role) > LEVEL_DC) return { error: '沒有權限' };
  return t;
}
/** 開戶：DDC 或以上 */
function requireAccountManager_(token) {
  var t = checkToken_(token);
  if (!t.valid || (t.source !== 'users' && !isMaintenanceSuper_(t.email, t.role))) return { error: '登入已過期' };
  if (!isAccountManager_(t.role)) return { error: '只有副區總監或以上可以管理帳戶' };
  return t;
}
/** 需要指定操作權限（✏️ 可管理）：perm = canVenue | canStock | canCourse | canStaff */
function requirePerm_(token, perm) {
  var t = checkToken_(token);
  if (!t.valid) return { error: '登入已過期' };
  var p = staffPerms_(t.email, t.role, t.source);
  if (!p[perm]) return { error: '你沒有此功能嘅權限' };
  return { ok: true, email: t.email, role: t.role };
}
/** 需要指定查閱權限（👁 可看 或 ✏️ 可管理）：支援 Perms 設為 view 時唯讀瀏覽 */
function requirePermRead_(token, perm, cardId) {
  var t = checkToken_(token);
  if (!t.valid) return { error: '登入已過期' };
  var p = staffPerms_(t.email, t.role);
  if (p[perm]) return { ok: true, email: t.email, role: t.role };
  if (cardId) {
    var access = cardAccessOf_(t, cardId);
    if (access === 'view' || access === 'edit') return { ok: true, email: t.email, role: t.role };
  }
  return { error: '你沒有此功能嘅權限' };
}
/** 實時讀取某帳戶對某張卡片嘅 Perms 權限（'' | 'view' | 'edit'） */
function cardAccessOf_(t, cardId) {
  var cid = String(cardId || '').trim();
  if (!cid) return '';
  if (isMaintenanceSuper_(t.email, t.role)) return 'edit';
  if (t.source !== 'users') return '';
  var u = readSheet_(SHEET.USERS).filter(function (x) {
    return String(x.email).trim().toLowerCase() === String(t.email).trim().toLowerCase();
  })[0];
  if (!u || String(u.active).toUpperCase() === 'FALSE') return '';
  if (levelOfUser_(t.email, t.role) === LEVEL_SUPER) return 'edit';
  if (cid === 'awards' && levelOfUser_(t.email, u.role || t.role) > LEVEL_DDC) return '';
  if (u.cards && splitList_(u.cards).indexOf(cid) < 0) return '';
  var effRole = String((u && u.role) ? u.role : t.role || '').trim();
  return (readPerms_()[cid] || {})[effRole] || '';
}
/** 需要「某張卡片」嘅查閱權（👁 view 或 ✏️ edit） */
function requireCardView_(token, cardId) {
  var t = checkToken_(token);
  if (!t.valid) return { error: '登入已過期' };
  var access = cardAccessOf_(t, cardId);
  if (access !== 'edit' && access !== 'view') return { error: '你沒有此功能嘅權限' };
  return { ok: true, email: t.email, role: t.role, access: access };
}
/**
 * 需要「某張卡片」嘅編輯權（✏️ edit）：直接跟 Perms 矩陣，管理員可自由配置任何角色。
 * 層級 0 超管永遠可以（同 getCards_ 一致）。
 */
function requireCardEdit_(token, cardId) {
  var t = checkToken_(token);
  if (!t.valid) return { error: '登入已過期' };
  var access = cardAccessOf_(t, cardId);
  if (access !== 'edit') return { error: '你沒有此功能嘅權限' };
  return { ok: true, email: t.email, role: t.role, access: 'edit' };
}

// ===================== DEBIT NOTE 帳簿（v4.21.0） =====================
// 專用工作表保存完整文件、FPS QR 快照及審計欄。三個入口都經 requireCardEdit_，
// 一般帳戶會再核對 Users 目前有效帳戶／角色；Script 維護超管以簽名身份放行，不能只靠 Perms 或舊 token 繞過。

function debitNoteText_(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function debitNoteDate_(raw) {
  if (Object.prototype.toString.call(raw) === '[object Date]' && !isNaN(raw.getTime())) {
    return Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var value = debitNoteText_(raw);
  if (!value) return '';
  var match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  var year, month, day;
  if (match) {
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  } else {
    match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (!match) return '';
    day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
    if (match[3].length === 2) year += 2000;
  }
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return '';
  var check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '';
  return String(year) + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2);
}

function debitNoteAmount_(raw) {
  var value = debitNoteText_(raw).replace(/HK\$/gi, '').replace(/[$,\s]/g, '');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return '';
  var amount = Number(value);
  if (!isFinite(amount) || amount <= 0 || value.length > 18) return '';
  var normalized = amount.toFixed(2);
  return normalized.length <= 13 ? normalized : '';
}

function debitNoteValidate_(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var out = {
    to: debitNoteText_(raw.to),
    attention: debitNoteText_(raw.attention),
    date: debitNoteDate_(raw.date),
    ref: debitNoteText_(raw.ref),
    amount: debitNoteAmount_(raw.amount),
    particulars: debitNoteText_(raw.particulars),
    status: debitNoteText_(raw.status),
    remarks: debitNoteText_(raw.remarks),
    reminder: isTrue_(raw.reminder),
  };
  if (!out.to) return { error: '請填寫收款對象（TO）' };
  if (out.to.length > 140) return { error: 'TO 最多 140 個字元' };
  if (out.attention.length > 100) return { error: 'Attention 最多 100 個字元' };
  if (!out.date) return { error: '日期無效' };
  if (!out.ref) return { error: '請填寫 Ref No.' };
  if (out.ref.length > 25 || !/^[A-Za-z0-9 ._:\/@+()\-]+$/.test(out.ref)) {
    return { error: 'Ref No. 最多 25 個字元，只可用英文、數字、空格及常用符號' };
  }
  if (!out.amount) return { error: '金額必須是大於 0 的數字，最多兩位小數（含小數點總長最多 13 字元）' };
  if (!out.particulars) return { error: '請填寫款項內容（PARTICULARS）' };
  if (out.particulars.length > 500) return { error: 'PARTICULARS 最多 500 個字元' };
  if (out.status.length > 80) return { error: 'S/S 最多 80 個字元' };
  if (out.remarks.length > 500) return { error: 'Remarks 最多 500 個字元' };
  return { data: out };
}

function debitNoteTlv_(id, value) {
  value = String(value);
  if (value.length > 99) throw new Error('FPS QR 欄位 ' + id + ' 過長');
  return id + ('0' + value.length).slice(-2) + value;
}

function debitNoteCrc16_(value) {
  var crc = 0xffff;
  for (var i = 0; i < value.length; i++) {
    crc ^= value.charCodeAt(i) << 8;
    for (var bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  var hex = crc.toString(16).toUpperCase();
  return ('0000' + hex).slice(-4);
}

/** 與前端 lib/fps.ts 同一 HKICL payload；後端自行生成，不信任 client 傳入的 QR 字串。 */
function debitNoteBuildFpsPayload_(fpsId, amount, reference) {
  var payload = '';
  payload += debitNoteTlv_('00', '01');
  payload += debitNoteTlv_('01', '12');
  payload += debitNoteTlv_('26', debitNoteTlv_('00', 'hk.com.hkicl') + debitNoteTlv_('02', fpsId));
  payload += debitNoteTlv_('52', '0000');
  payload += debitNoteTlv_('53', '344');
  payload += debitNoteTlv_('54', amount);
  payload += debitNoteTlv_('58', 'HK');
  payload += debitNoteTlv_('59', 'NA');
  payload += debitNoteTlv_('60', 'HK');
  if (reference) payload += debitNoteTlv_('62', debitNoteTlv_('05', reference));
  return payload + '6304' + debitNoteCrc16_(payload + '6304');
}

function debitNoteFpsAccount_() {
  var fpsId = debitNoteText_(getConfigValue_('FPS_ACCOUNT_NUMBER') || DEFAULT_FPS_ACCOUNT_NUMBER);
  if (!/^\d{7,9}$/.test(fpsId)) return { error: 'Config 的 FPS_ACCOUNT_NUMBER 不是有效的 7 至 9 位 FPS ID' };
  return { data: {
    fpsAccountName: debitNoteText_(getConfigValue_('FPS_ACCOUNT_NAME') || DEFAULT_FPS_ACCOUNT_NAME),
    fpsAccountNumber: fpsId,
  } };
}

function debitNoteWithPayment_(data, account) {
  data.fpsAccountName = account.fpsAccountName;
  data.fpsAccountNumber = account.fpsAccountNumber;
  data.fpsQrPayload = debitNoteBuildFpsPayload_(account.fpsAccountNumber, data.amount, data.ref);
  return data;
}

function debitNoteSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.DEBIT_NOTES);
  var bp = blueprint_().filter(function (b) { return b.name === SHEET.DEBIT_NOTES; })[0];
  if (!bp) throw new Error('DEBIT NOTE 藍圖缺失');
  if (!sh || sh.getLastRow() < 1) sh = ensureSheet_(ss, SHEET.DEBIT_NOTES, bp.rows, bp.headerColor, bp.frozenCols);
  else ensureSheetColumns_(bp);
  return sh;
}

function debitNotePublic_(r) {
  return {
    id: debitNoteText_(r.id),
    districtCode: debitNoteText_(r.districtCode),
    ref: debitNoteText_(r.ref),
    to: debitNoteText_(r.to),
    attention: debitNoteText_(r.attention),
    date: debitNoteDate_(r.date) || debitNoteText_(r.date),
    amount: debitNoteAmount_(r.amount) || debitNoteText_(r.amount),
    particulars: debitNoteText_(r.particulars),
    status: debitNoteText_(r.status),
    remarks: debitNoteText_(r.remarks),
    reminder: isTrue_(r.reminder),
    fpsAccountName: debitNoteText_(r.fpsAccountName),
    fpsAccountNumber: debitNoteText_(r.fpsAccountNumber),
    fpsQrPayload: debitNoteText_(r.fpsQrPayload),
    createdAt: debitNoteText_(r.createdAt),
    createdBy: debitNoteText_(r.createdBy),
    updatedAt: debitNoteText_(r.updatedAt),
    updatedBy: debitNoteText_(r.updatedBy),
  };
}

function debitNoteDistrictRows_() {
  var district = String(districtCode_());
  return readSheet_(SHEET.DEBIT_NOTES).filter(function (r) {
    return String(r.districtCode || '') === district;
  });
}

function listDebitNotes_(token) {
  var auth = requireCardView_(token, 'debitNote'); if (auth.error) return err(auth.error);
  debitNoteSheet_();
  var rows = debitNoteDistrictRows_().map(debitNotePublic_);
  rows.sort(function (a, b) {
    var byDate = String(b.date || '').localeCompare(String(a.date || ''));
    if (byDate) return byDate;
    var byRef = String(b.ref || '').localeCompare(String(a.ref || ''), 'en', { numeric: true });
    if (byRef) return byRef;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
  return ok(rows);
}

function saveDebitNote_(token, raw) {
  var auth = requireCardEdit_(token, 'debitNote'); if (auth.error) return err(auth.error);
  var checked = debitNoteValidate_(raw); if (checked.error) return err(checked.error);
  var account = debitNoteFpsAccount_(); if (account.error) return err(account.error);
  var sh = debitNoteSheet_();
  var id = debitNoteText_(raw && raw.id);
  if (id.length > 100) return err('記錄 ID 無效');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return err('另一筆 DEBIT NOTE 正在儲存，請稍後再試');
  try {
    var rows = debitNoteDistrictRows_();
    var existing = id ? rows.filter(function (r) { return String(r.id || '') === id; })[0] : null;
    if (id && !existing) return err('找不到這張 DEBIT NOTE，或它屬於另一區');
    var duplicate = rows.filter(function (r) {
      return String(r.ref || '').trim().toLowerCase() === checked.data.ref.toLowerCase()
        && String(r.id || '') !== id;
    })[0];
    if (duplicate) return err('Ref No.「' + checked.data.ref + '」已存在，請使用下一編號或開啟舊記錄修改');
    var now = new Date().toISOString();
    var record = debitNoteWithPayment_(checked.data, account.data);
    record.id = id || genId_('dn');
    record.districtCode = String(districtCode_());
    record.createdAt = existing ? debitNoteText_(existing.createdAt) || now : now;
    record.createdBy = existing ? debitNoteText_(existing.createdBy) || auth.email : auth.email;
    record.updatedAt = now;
    record.updatedBy = auth.email;
    if (existing) {
      var rowIndex = rowIndexByCol_(sh, 'id', id);
      if (rowIndex < 2) return err('找不到舊記錄的 Sheet 行，請重新整理後再試');
      Object.keys(record).forEach(function (key) { setCellByHeader_(sh, rowIndex, key, record[key]); });
    } else {
      appendRowObj_(sh, record);
    }
    return ok({ saved: true, record: debitNotePublic_(record) });
  } finally {
    lock.releaseLock();
  }
}

function importDebitNotes_(token, rows) {
  var auth = requireCardEdit_(token, 'debitNote'); if (auth.error) return err(auth.error);
  if (!Array.isArray(rows)) return err('匯入資料格式不正確');
  if (!rows.length) return err('沒有可匯入的 DEBIT NOTE');
  if (rows.length > 500) return err('每次最多匯入 500 筆，請分批處理');
  var valid = [];
  var errors = [];
  rows.forEach(function (raw, index) {
    var checked = debitNoteValidate_(raw);
    var sourceRow = Number(raw && raw.sourceRow) || index + 2;
    if (checked.error) errors.push({ row: sourceRow, ref: debitNoteText_(raw && raw.ref), error: checked.error });
    else valid.push({ data: checked.data, sourceRow: sourceRow });
  });
  // 有任何格式錯誤就整批不寫，避免財務帳簿只匯入一半。
  if (errors.length) return ok({ imported: 0, duplicates: 0, duplicateRefs: [], errors: errors, aborted: true });
  var account = debitNoteFpsAccount_(); if (account.error) return err(account.error);
  var sh = debitNoteSheet_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return err('另一筆 DEBIT NOTE 正在儲存，請稍後再試');
  try {
    var seen = {};
    debitNoteDistrictRows_().forEach(function (r) {
      var ref = debitNoteText_(r.ref).toLowerCase(); if (ref) seen[ref] = true;
    });
    var now = new Date().toISOString();
    var imported = 0;
    var duplicateRefs = [];
    valid.forEach(function (item) {
      var key = item.data.ref.toLowerCase();
      if (seen[key]) { duplicateRefs.push(item.data.ref); return; }
      seen[key] = true;
      var record = debitNoteWithPayment_(item.data, account.data);
      record.id = genId_('dn');
      record.districtCode = String(districtCode_());
      record.createdAt = now;
      record.createdBy = auth.email;
      record.updatedAt = now;
      record.updatedBy = auth.email;
      appendRowObj_(sh, record);
      imported++;
    });
    return ok({
      imported: imported,
      duplicates: duplicateRefs.length,
      duplicateRefs: duplicateRefs.slice(0, 30),
      errors: [], aborted: false,
    });
  } finally {
    lock.releaseLock();
  }
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
  var t = requirePermRead_(token, 'canVenue', 'venueReg'); if (t.error) return err(t.error);
  return ok(readSheet_(SHEET.VENUES));
}
function saveVenue_(token, venue) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  venue = venue || {};
  var venueId = String(venue.venueId || '').trim() || genId_('v');
  if (!String(venue.name || '').trim()) return err('場地名稱必填');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VENUES);
  ensureSheetColumn_(sh, 'scienerLockId');
  var idx = rowIndexByCol_(sh, 'venueId', venueId);
  var row = {
    venueId: venueId, districtCode: districtCode_(),
    name: venue.name, location: venue.location || '', capacity: venue.capacity || '',
    scienerLockId: String(venue.scienerLockId || '').trim(), note: venue.note || '',
    active: venue.active === undefined || isTrue_(venue.active) ? 'TRUE' : 'FALSE',
  };
  if (idx > 0) {
    Object.keys(row).forEach(function (k) {
      if (venue[k] !== undefined || k === 'venueId' || k === 'name' || k === 'districtCode') {
        if (k === 'scienerLockId') setTextCellByHeader_(sh, idx, k, row[k]);
        else setCellByHeader_(sh, idx, k, row[k]);
      }
    });
  } else {
    appendRowObj_(sh, row);
    var newIdx = rowIndexByCol_(sh, 'venueId', venueId);
    if (newIdx > 0 && row.scienerLockId) setTextCellByHeader_(sh, newIdx, 'scienerLockId', row.scienerLockId);
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
    activityName: String(pick_(b, ['activityName', 'eventName'])).trim(),
    attendeeCount: Number(pick_(b, ['attendeeCount', 'participants', 'participantsCount'])),
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
  if (!req.activityName || req.activityName.length > 120) return err('請填寫活動名稱（最多 120 字）');
  if (!isFinite(req.attendeeCount) || Math.floor(req.attendeeCount) !== req.attendeeCount || req.attendeeCount < 1 || req.attendeeCount > 9999) {
    return err('參加人數必須是 1 至 9999 的正整數');
  }
  if (!isTrue_(req.agreeRules)) return err('請先同意借用守則');
  if (!req.startDate || !req.endDate) return err('請填寫借用時段');
  if (req.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(req.email))) return err('電郵格式不正確');

  var venue = readSheet_(SHEET.VENUES).filter(function (v) {
    return String(v.venueId).trim() === String(req.venueId).trim()
      || String(v.name || '').trim() === String(req.venueId).trim();
  })[0];
  if (!venue) return err('場地不存在');

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VENUE_REQ);
  if (!sh) return err('尚未執行 setupSheets()');

  var approvedCheck = checkApprovedTeamupOverlap_(req.startDate, req.endDate);
  if (!approvedCheck.ok) return err(approvedCheck.error);
  if (approvedCheck.conflict) return err('該時段已有已批借用，請選擇其他時段後再申請。');

  var rid = genId_('vr'), ref = genRef_('VR'), now = new Date().toISOString();
  var teamupEventId = '';

  // 新申請只檢查紅色「已批」時段；藍色「申請中」可重疊，讓多人同時候批。
  // 不信任用戶端傳入的 eventId，亦不走 VENUE_SCRIPT_URL 外部轉發，避免成功收件但漏掉藍色事件。
  try {
    var created = createPendingTeamupEvent_({
      venueName: venue.name || req.venueId,
      venueId: String(venue.venueId).trim(),
      name: req.name, position: req.position, phone: req.phone, email: req.email,
      troop: req.troop, purpose: req.purpose, activityName: req.activityName,
      attendeeCount: req.attendeeCount, refCode: ref,
      startDate: req.startDate, endDate: req.endDate,
    });
    if (!created.ok || !created.eventId) {
      return err(created.error || 'Teamup 未能建立藍色「申請中」事件，請稍後再試');
    }
    teamupEventId = created.eventId;
  } catch (e) {
    return err('Teamup 建立藍色「申請中」事件失敗：' + e.message);
  }

  ensureSheetColumn_(sh, 'activityName');
  ensureSheetColumn_(sh, 'attendeeCount');
  appendRowObj_(sh, {
    id: rid, districtCode: districtCode_(), refCode: ref,
    submittedAt: now, createdAt: now,
    venueId: String(venue.venueId).trim(), venueName: venue.name || '',
    purpose: req.purpose || '', activityName: req.activityName, attendeeCount: req.attendeeCount,
    startDate: req.startDate, endDate: req.endDate,
    name: req.name, phone: req.phone, email: req.email || '',
    troop: req.troop || '', position: req.position || '',
    agreeRules: isTrue_(req.agreeRules) ? 'TRUE' : '',
    status: 'pending', teamupEventId: teamupEventId || '', pwdRef: '', passcode: '',
    reviewer: '', reviewedAt: '',
  });
  var newRowIdx = rowIndexByCol_(sh, 'id', rid);
  if (newRowIdx > 0) {
    setTextCellByHeader_(sh, newRowIdx, 'phone', req.phone);
    setTextCellByHeader_(sh, newRowIdx, 'startDate', req.startDate);
    setTextCellByHeader_(sh, newRowIdx, 'endDate', req.endDate);
    if (teamupEventId) setTextCellByHeader_(sh, newRowIdx, 'teamupEventId', teamupEventId);
  }
  appendRecord_('venue', rid, ref, '🏛 借場：' + (venue.name || req.venueId), req.name, req.phone, req.troop || '', 'pending',
    req.startDate + ' → ' + req.endDate);
  notifyStaff_('🏛 新借場申請', '場地：' + (venue.name || req.venueId) + '\n申請人：' + req.name + '（' + req.phone + '）\n' + req.startDate + ' → ' + req.endDate);
  return okSubmit_({ refCode: ref, id: rid, teamupEventId: teamupEventId });
}

// ===================== 借場：查閱／批核 =====================

function formatVenueDateField_(v) {
  if (v === undefined || v === null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, 'Asia/Hong_Kong', "yyyy-MM-dd'T'HH:mm");
  }
  return String(v);
}

function normalizeVenueBookingRow_(r) {
  var out = {};
  Object.keys(r || {}).forEach(function (k) { out[k] = r[k]; });
  out.startDate = formatVenueDateField_(r.startDate);
  out.endDate = formatVenueDateField_(r.endDate);
  out.phone = r.phone === undefined || r.phone === null ? '' : String(r.phone);
  out.pwdRef = r.pwdRef === undefined || r.pwdRef === null ? '' : String(r.pwdRef).trim();
  out.teamupEventId = r.teamupEventId === undefined || r.teamupEventId === null ? '' : String(r.teamupEventId).trim();
  var rawPwd = r.passcode;
  if (rawPwd === undefined || rawPwd === null || rawPwd === '') {
    out.passcode = '';
  } else if (typeof rawPwd === 'number' && rawPwd >= 0 && rawPwd < 1000 && String(lockCfg_().pwdMode || 'phone4').toLowerCase().indexOf('phone4') === 0) {
    out.passcode = ('0000' + String(Math.floor(rawPwd))).slice(-4);
  } else {
    out.passcode = String(rawPwd).trim();
  }
  return out;
}

function getVenueBookings_(token) {
  var t = requirePermRead_(token, 'canVenue', 'venueReg'); if (t.error) return err(t.error);
  return ok(readSheet_(SHEET.VENUE_REQ).map(normalizeVenueBookingRow_).reverse());
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
  req = normalizeVenueBookingRow_(req);
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
  var rawBooking = readSheet_(SHEET.VENUE_REQ).filter(function (x) { return String(x.id) === String(id); })[0];
  if (!rawBooking) return err('找不到申請');
  var booking = normalizeVenueBookingRow_(rawBooking);
  if (String(booking.status).toLowerCase() === 'approved') return err('此申請已批核');
  var approvedCheck = checkApprovedTeamupOverlap_(booking.startDate, booking.endDate, booking.teamupEventId);
  if (!approvedCheck.ok) return err(approvedCheck.error);
  if (approvedCheck.conflict) return err('該時段已有另一筆已批借用，未能批核此申請');

  var tup = applyTeamupApproved_(booking, '');
  var tupMsg = tup.warn || '';
  var eventId = tup.eventId || booking.teamupEventId || '';

  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx > 0) {
    ensureSheetColumn_(sh, 'passcode');
    ensureSheetColumn_(sh, 'pwdRef');
    setCellByHeader_(sh, idx, 'status', 'approved');
    setCellByHeader_(sh, idx, 'reviewer', t.email);
    setCellByHeader_(sh, idx, 'reviewedAt', new Date().toISOString());
    if (eventId) setTextCellByHeader_(sh, idx, 'teamupEventId', eventId);
  }
  updateRecordStatus_(id, 'approved');
  return ok({ saved: true, teamupEventId: eventId, warn: tupMsg || '' });
}

/**
 * 完整批核（一條龍）：TTLock 限時密碼 + Teamup 轉色 + 電郵 + 完整結果回傳寫回 Sheet。
 * - 支援首次批核，以及對「僅確認未設鎖／模擬碼」或傳入 reissue=true 嘅申請補發電子鎖匙
 * - 預設嚴格檢查電子鎖寫入：寫鎖失敗時直接回傳具體原因，唔會假批核或寄出無效隨機密碼
 * - 若職員明確傳 allowFallback=true（或 Config 設 ttlockDisabled=TRUE），先至改用備用／模擬密碼
 */
function approveVenueBooking_(token, id, opts) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  opts = opts || {};
  var isReissue = isTrue_(opts.reissue);
  var allowFallback = isTrue_(opts.allowFallback);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.VENUE_REQ);
  if (!sh) return err('找不到 VenueBookings 工作表');
  var rawBooking = readSheet_(SHEET.VENUE_REQ).filter(function (x) { return String(x.id) === String(id); })[0];
  if (!rawBooking) return err('找不到申請');
  var booking = normalizeVenueBookingRow_(rawBooking);
  var existingPwd = String(booking.passcode || '').trim();
  var existingRef = String(booking.pwdRef || '').trim();
  var alreadyRealKey = existingPwd && existingRef && existingRef !== 'SIMULATED';
  if (String(booking.status).toLowerCase() === 'approved' && alreadyRealKey && !isReissue) {
    return err('此申請已批核並已發出電子鎖匙（如需重新製作鎖匙，請點「補發／重製鎖匙」）');
  }
  var approvedCheck = checkApprovedTeamupOverlap_(booking.startDate, booking.endDate, booking.teamupEventId);
  if (!approvedCheck.ok) return err(approvedCheck.error);
  if (approvedCheck.conflict) return err('該時段已有另一筆已批借用，未能批核此申請');

  // 1) TTLock 限時密碼（電話頭4 → 撞碼改用尾4 → 再撞碼逐個 +1）
  var passcode = '';
  var pwdRef = '';
  var lockWritten = false;
  var simulated = false;
  var usedApiBase = '';
  var usedLockId = '';
  var validFrom = null;
  var validTo = null;
  var warn = '';

  try {
    var venueLock = '';
    try {
      var vrow = readSheet_(SHEET.VENUES).filter(function (v) {
        return String(v.venueId).trim() === String(booking.venueId || '').trim()
          || String(v.name || '').trim() === String(booking.venueId || '').trim();
      })[0];
      venueLock = vrow ? String(vrow.scienerLockId || '').trim() : '';
    } catch (x) { venueLock = ''; }
    var pc = createTtlockPasscode_(
      booking.phone || '0000',
      booking.startDate,
      booking.endDate || booking.startDate,
      booking.name || '申請人',
      venueLock
    );
    passcode = String(pc.passcode || '').trim();
    pwdRef = String(pc.pwdRef || '').trim();
    lockWritten = !!pc.lockWritten;
    simulated = !!pc.simulated;
    usedApiBase = String(pc.apiBase || '');
    usedLockId = String(pc.lockId || '');
    validFrom = pc.validFrom || null;
    validTo = pc.validTo || null;
    if (simulated) warn = '目前設定為跳過實體寫鎖（ttlockDisabled=TRUE），密碼屬模擬值';
  } catch (e) {
    var errDetail = String((e && e.message) || e);
    console.error('TTLock 建碼失敗：' + errDetail);
    if (!allowFallback) {
      return err('電子鎖匙製作失敗：' + errDetail);
    }
    passcode = genPasscode_();
    pwdRef = '';
    lockWritten = false;
    simulated = true;
    warn = '電子鎖未寫入（' + errDetail + '），已按指示改用備用隨機密碼';
  }

  // 2) Teamup 轉色／更新密碼備註
  var tup = applyTeamupApproved_(booking, '\n🔑 密碼：' + passcode);
  var tupMsg = tup.warn || '';
  var finalEventId = tup.eventId || booking.teamupEventId || '';
  if (finalEventId) booking.teamupEventId = finalEventId;

  // 3) 電郵密碼俾申請人
  var emailTo = String(booking.email || '').trim();
  var emailSent = false;
  var mailMsg = '';
  if (emailTo) {
    try {
      sendVenueApprovalEmail_(booking, passcode, validFrom, validTo);
      emailSent = true;
    } catch (e) {
      mailMsg = '電郵發送失敗：' + String((e && e.message) || e);
    }
  } else {
    mailMsg = '申請人未填電郵，請用頁面 WhatsApp／手動通知密碼';
  }

  // 4) 回傳寫入 VenueBookings（自動補缺 passcode / pwdRef / teamupEventId 欄，純文字保留前導 0）
  var reviewedAt = new Date().toISOString();
  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx > 0) {
    ensureSheetColumn_(sh, 'status');
    ensureSheetColumn_(sh, 'reviewer');
    ensureSheetColumn_(sh, 'reviewedAt');
    setCellByHeader_(sh, idx, 'status', 'approved');
    setTextCellByHeader_(sh, idx, 'passcode', passcode);
    setTextCellByHeader_(sh, idx, 'pwdRef', pwdRef);
    setCellByHeader_(sh, idx, 'reviewer', t.email);
    setCellByHeader_(sh, idx, 'reviewedAt', reviewedAt);
    if (finalEventId) setTextCellByHeader_(sh, idx, 'teamupEventId', finalEventId);
  }
  updateRecordStatus_(id, 'approved');

  return ok({
    saved: true,
    id: String(booking.id),
    status: 'approved',
    password: passcode,
    passcode: passcode,
    pwdRef: pwdRef,
    lockWritten: lockWritten,
    simulated: simulated,
    apiBase: usedApiBase,
    lockId: usedLockId,
    validFrom: validFrom ? validFrom.toISOString() : '',
    validTo: validTo ? validTo.toISOString() : '',
    teamupSynced: !tupMsg && !!finalEventId,
    teamupEventId: finalEventId,
    emailSent: emailSent,
    emailTo: emailTo,
    reviewer: t.email,
    reviewedAt: reviewedAt,
    warn: [warn, tupMsg, mailMsg].filter(Boolean).join('；'),
  });
}

function maskAccount_(s) {
  var v = String(s || '').trim();
  if (!v) return '';
  if (v.length <= 4) return v.slice(0, 1) + '***';
  return v.slice(0, 3) + '***' + v.slice(-2);
}

/** 讀取借場＋電子鎖＋Teamup＋回傳欄位就緒狀態（只回遮罩／布林值，絕不回傳明文密碼或 Secret） */
function getVenueLockConfig_(token) {
  var t = requireAccountManager_(token); if (t.error) return err(t.error);
  var c = lockCfg_();
  var tc = teamupCfg_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var vSh = ss.getSheetByName(SHEET.VENUE_REQ);
  var headers = vSh ? sheetHeadersBySheet_(vSh) : [];
  var activeVenues = readSheet_(SHEET.VENUES).filter(function (v) {
    return String(v.active).toUpperCase() !== 'FALSE';
  });
  var venuesWithLock = activeVenues.filter(function (v) {
    return !!String(v.scienerLockId || '').trim();
  });
  return ok({
    version: '4.29.0',
    clientId: c.clientId || '',
    clientIdSet: !!c.clientId,
    clientSecretSet: !!c.clientSecret,
    username: c.username || '',
    usernameMasked: maskAccount_(c.username),
    usernameSet: !!c.username,
    passwordSet: !!c.password,
    lockId: c.lockId || '',
    lockIdSet: !!(c.lockId || venuesWithLock.length),
    apiBase: c.apiBase || '',
    resolvedApiBase: ttlockBase_(),
    pwdMode: c.pwdMode || 'phone4',
    ttlockDisabled: ttlockDisabled_(),
    ttlockReady: ttlockReady_() && !!(c.lockId || venuesWithLock.length),
    teamupApiKeySet: !!tc.apiKey,
    teamupCalendarKey: tc.calendarId || '',
    teamupPendingSub: tc.pendingSub || '',
    teamupApprovedSub: tc.approvedSub || '',
    teamupRejectedSub: tc.rejectedSub || '',
    teamupAttendeeFieldSet: !!tc.attendeeFieldKey,
    teamupReady: !!(tc.apiKey && tc.calendarId && tc.approvedSub),
    notifyStaffEmail: getConfigValue_('NOTIFY_STAFF_EMAIL') || '',
    venueCount: activeVenues.length,
    venuesWithLockCount: venuesWithLock.length,
    sheetHasPasscodeCol: headers.indexOf('passcode') >= 0,
    sheetHasPwdRefCol: headers.indexOf('pwdRef') >= 0,
  });
}

/** 儲存電子鎖及 Teamup 設定到 Config（純文字寫入，留空密碼／Secret 則保留原值），並自動補齊回傳欄 */
function saveVenueLockConfig_(token, cfg) {
  var t = requireAccountManager_(token); if (t.error) return err(t.error);
  cfg = cfg || {};
  var plainFields = [
    ['clientId', 'SCIENER_CLIENT_ID', 'Sciener / TTLock 開放平台 App ID'],
    ['username', 'SCIENER_USERNAME', '管鎖帳號（TTLock / Sciener App 登入帳號）'],
    ['lockId', 'SCIENER_LOCK_ID', '大門 Lock ID（數字）'],
    ['apiBase', 'SCIENER_API_BASE', 'API 主機（留空自動偵測 euapi.ttlock.com / api.ttlock.com / api.sciener.com）'],
    ['pwdMode', 'PWD_MODE', 'phone4=頭4位，撞碼試尾4再逐個+1；phone4tail=尾4位，撞碼試頭4再逐個+1；random=隨機6位'],
    ['teamupCalendarKey', 'TEAMUP_CALENDAR_KEY', 'Teamup 分享金鑰 ks...'],
    ['teamupPendingSub', 'TEAMUP_PENDING_SUBCAL_ID', '藍色（申請中）子日曆 ID'],
    ['teamupApprovedSub', 'TEAMUP_APPROVED_SUBCAL_ID', '紅色（確認借用）子日曆 ID'],
    ['teamupRejectedSub', 'TEAMUP_REJECTED_SUBCAL_ID', '拒絕子日曆 ID（選填）'],
    ['notifyStaffEmail', 'NOTIFY_STAFF_EMAIL', '新申請通知收件人'],
  ];
  plainFields.forEach(function (item) {
    var prop = item[0], key = item[1], desc = item[2];
    if (cfg[prop] !== undefined && cfg[prop] !== null) {
      setConfigTextValue_(key, String(cfg[prop]).trim(), desc);
    }
  });
  if (cfg.ttlockDisabled !== undefined && cfg.ttlockDisabled !== null) {
    setConfigTextValue_('ttlockDisabled', isTrue_(cfg.ttlockDisabled) ? 'TRUE' : '', 'TRUE = 跳過寫鎖，改用模擬密碼');
  }

  // 私密欄：留空 = 保持原有設定；傳 '__CLEAR__' = 清空
  var secretFields = [
    ['clientSecret', 'SCIENER_CLIENT_SECRET', 'Sciener / TTLock App Secret'],
    ['password', 'SCIENER_PASSWORD', '管鎖密碼'],
    ['teamupApiKey', 'TEAMUP_API_KEY', 'Teamup API Token'],
  ];
  secretFields.forEach(function (item) {
    var prop = item[0], key = item[1], desc = item[2];
    if (cfg[prop] === '__CLEAR__') {
      setConfigTextValue_(key, '', desc);
    } else if (cfg[prop] !== undefined && cfg[prop] !== null && String(cfg[prop]).trim() !== '') {
      setConfigTextValue_(key, String(cfg[prop]).trim(), desc);
    }
  });

  // 可選：一鍵將 Lock ID 同步綁定到現有啟用場地（如區總部）
  var lockId = cfg.lockId !== undefined ? String(cfg.lockId || '').trim() : lockCfg_().lockId;
  var boundVenues = 0;
  if (isTrue_(cfg.bindLockToVenues) && lockId) {
    var vSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VENUES);
    if (vSh && vSh.getLastRow() >= 2) {
      ensureSheetColumn_(vSh, 'scienerLockId');
      var rows = readSheet_(SHEET.VENUES);
      rows.forEach(function (v) {
        if (String(v.active).toUpperCase() === 'FALSE') return;
        var rIdx = rowIndexByCol_(vSh, 'venueId', String(v.venueId).trim());
        if (rIdx > 0) {
          setTextCellByHeader_(vSh, rIdx, 'scienerLockId', lockId);
          boundVenues++;
        }
      });
    }
  }

  // 自動確保 VenueBookings 具備回傳欄位 passcode / pwdRef / teamupEventId
  var reqSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VENUE_REQ);
  if (reqSh) {
    ensureSheetColumn_(reqSh, 'teamupEventId');
    ensureSheetColumn_(reqSh, 'pwdRef');
    ensureSheetColumn_(reqSh, 'passcode');
  }

  var status = getVenueLockConfig_(token);
  if (!status.ok) return status;
  status.data.saved = true;
  status.data.boundVenues = boundVenues;
  return status;
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
  var allow = ['venueId', 'venueName', 'purpose', 'activityName', 'attendeeCount', 'startDate', 'endDate', 'name', 'phone', 'email', 'troop', 'position'];
  if (patch.activityName !== undefined && (!String(patch.activityName || '').trim() || String(patch.activityName).trim().length > 120)) {
    return err('活動名稱必填（最多 120 字）');
  }
  if (patch.attendeeCount !== undefined) {
    var attendeeCount = Number(patch.attendeeCount);
    if (!isFinite(attendeeCount) || Math.floor(attendeeCount) !== attendeeCount || attendeeCount < 1 || attendeeCount > 9999) {
      return err('參加人數必須是 1 至 9999 的正整數');
    }
    patch.attendeeCount = attendeeCount;
  }
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
  var textCols = { startDate: true, endDate: true, phone: true, activityName: true };
  allow.forEach(function (k) {
    if (patch[k] !== undefined && patch[k] !== null) {
      if (textCols[k]) setTextCellByHeader_(sh, idx, k, patch[k]);
      else setCellByHeader_(sh, idx, k, patch[k]);
    }
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
  var t = requirePermRead_(token, 'canStock', 'stockReg'); if (t.error) return err(t.error);
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

/** 合併同一件物資嘅數量（成員系統一次揀多款時可能重複） */
function stockMergeLines_(lines) {
  var out = [], index = {};
  (lines || []).forEach(function (l) {
    var key = String(l.itemId || '').trim();
    if (!key) return;
    if (index[key] === undefined) { index[key] = out.length; out.push({ itemId: key, qty: Number(l.qty) || 0 }); }
    else out[index[key]].qty += Number(l.qty) || 0;
  });
  return out;
}

/**
 * 逐行核對物資（存在／數量正確／夠貨），**唔會寫入**。
 * items 只讀一次；整批任何一行唔合格就成批唔寫（避免寫一半）。
 */
function resolveStockLines_(lines) {
  var items = readSheet_(SHEET.ITEMS);
  var rows = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var item = items.filter(function (v) {
      return String(v.itemId).trim() === String(line.itemId).trim()
        || String(v.name || '').trim() === String(line.itemId).trim();
    })[0];
    if (!item) return { ok: false, error: '物資不存在：' + line.itemId };
    var qty = Number(line.qty) || 0;
    if (qty <= 0) return { ok: false, error: '數量不正確（' + (item.name || line.itemId) + '）' };
    var avail = Number(item.availableQty) || 0;
    if (qty > avail) return { ok: false, error: '「' + item.name + '」數量超出可借數量（可借 ' + avail + '）' };
    rows.push({ item: item, qty: qty, avail: avail });
  }
  return { ok: true, rows: rows };
}

/** 寫一行 StockRequests（已核對過）；batchRef 有值＝同一張申請嘅其中一款物資 */
function writeStockRow_(ss, applicant, item, qty, avail, batchRef) {
  var sh = ss.getSheetByName(SHEET.STOCK_REQ);
  if (!sh) return { ok: false, error: '尚未執行 setupSheets()' };

  var rid = genId_('sr'), ref = genRef_('SR'), now = new Date().toISOString();
  appendRowObj_(sh, {
    id: rid, districtCode: districtCode_(), refCode: ref, batchRef: batchRef || '',
    submittedAt: now, createdAt: now,
    itemId: String(item.itemId).trim(), itemName: item.name || '', category: item.category || '', qty: qty,
    purpose: applicant.purpose || '', borrowDate: applicant.borrowDate || '', returnDate: applicant.returnDate || '',
    name: applicant.name, phone: applicant.phone, email: applicant.email || '',
    troop: applicant.troop || '', position: applicant.position || '',
    agreeRules: isTrue_(applicant.agreeRules) ? 'TRUE' : '',
    status: 'pending', reviewer: '', reviewedAt: '',
  });

  if (STOCK_DEDUCT_ON === 'submit') {
    var ish = ss.getSheetByName(SHEET.ITEMS);
    var iIdx = rowIndexByCol_(ish, 'itemId', String(item.itemId).trim());
    if (iIdx > 0) setCellByHeader_(ish, iIdx, 'availableQty', Math.max(0, avail - qty));
  }

  appendRecord_('stock', rid, ref, '📦 借物資：' + item.name, applicant.name, applicant.phone, applicant.troop || '', 'pending',
    item.name + ' x' + qty + ' · ' + (applicant.borrowDate || '') + ' → ' + (applicant.returnDate || '')
    + (batchRef ? ' · 批次 ' + batchRef : ''));
  return { ok: true, refCode: ref, id: rid, itemName: item.name, qty: qty };
}

function submitOneStockLine_(ss, applicant, line, batchRef) {
  var res = resolveStockLines_([line]);
  if (!res.ok) return { ok: false, error: res.error };
  var r = res.rows[0];
  return writeStockRow_(ss, applicant, r.item, r.qty, r.avail, batchRef);
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
    var one = submitOneStockLine_(ss, applicant, lines[i], stockBatchRefOf_(b));
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

/** 只收安全字元嘅批次編號（成員系統會自己生成 SB-yyyymmdd-XXXXXX） */
function stockBatchRefOf_(b) {
  var raw = String((b && (b.batchRef || b.batch_ref || b.batchId)) || '').trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(raw) ? raw : '';
}

/**
 * 一次過借多款物資（成員系統 member-portal 一張表揀多件時用）。
 * 同 submitStockRequest 分別：
 *   1. **全部合格先寫**（任何一款唔夠貨即成批唔寫，唔會出現寫咗一半）；
 *   2. 每款物資仍然係 StockRequests 一行（批核邏輯、庫存扣減完全唔變），
 *      但共用同一個 batchRef，區職員可以喺 /stock-regs 一次過批成批；
 *   3. 只寄一封通知（列晒全部物資），唔會逐件洗版。
 * 回應包含 refCode（= batchRef）／refCodes／submittedCount，member-portal proxy 直接讀得到。
 */
function submitStockBatchRequest_(b) {
  if (!isFeature_('stock')) return err('服務暫未開放');
  var g = guardLocked_(); if (g) return g;
  var applicant = normalizeStockApplicant_(b);
  var lines = stockMergeLines_(stockLineItems_(b));
  if (!applicant.name || !applicant.phone) return err('資料不完整（需要姓名、電話）');
  if (!lines.length) return err('資料不完整（需要物資及數量）');

  // Config 有填外部收表 Script 就照舊轉發（同單件一致）
  var fwd = callService_('STOCK', 'addRequest', b);
  if (fwd) {
    if (fwd.ok) return okSubmit_({ refCode: (fwd.data && fwd.data.refCode) || fwd.refCode || '' });
    return err(fwd.error || '借物資轉發失敗');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SHEET.STOCK_REQ)) return err('尚未執行 setupSheets()');

  var checked = resolveStockLines_(lines);
  if (!checked.ok) return err(checked.error);

  var batchRef = stockBatchRefOf_(b) || genRef_('SB');
  var refs = [], names = [];
  for (var i = 0; i < checked.rows.length; i++) {
    var r = checked.rows[i];
    var one = writeStockRow_(ss, applicant, r.item, r.qty, r.avail, batchRef);
    if (!one.ok) return err(one.error);
    refs.push(one.refCode);
    names.push((one.itemName || r.item.itemId) + ' x' + one.qty);
  }

  notifyStaff_('📦 新借物資申請（' + refs.length + ' 款）',
    '批次：' + batchRef + '\n物資：' + names.join('、') + '\n'
    + '申請人：' + applicant.name + '（' + applicant.phone + '）\n'
    + (applicant.borrowDate || '') + ' → ' + (applicant.returnDate || ''));

  return okSubmit_({
    refCode: batchRef, batchRef: batchRef, refCodes: refs,
    submittedCount: refs.length, requestedCount: lines.length, count: refs.length,
  });
}

// ===================== 借物資：查閱／批核（庫存只扣一次） =====================

function getStockRequests_(token) {
  var t = requirePermRead_(token, 'canStock', 'stockReg'); if (t.error) return err(t.error);
  return ok(readSheet_(SHEET.STOCK_REQ).reverse());
}

var STOCK_STATUS = ['pending', 'approved', 'rejected', 'returned', 'cancelled'];
/** 呢啲狀態代表「物資喺申請人手上」，需要佔用庫存 */
function stockHolds_(status) { return String(status).toLowerCase() === 'approved'; }

/**
 * 改一行申請嘅狀態 + 調整庫存（**唔寄電郵**，由呼叫者決定寄一封定係唔寄）。
 * 單件同批次批核共用同一段邏輯，庫存永遠只加減一次。
 */
function applyStockStatusRow_(ss, req, status, reviewer) {
  var sh = ss.getSheetByName(SHEET.STOCK_REQ);
  var idx = rowIndexByCol_(sh, 'id', String(req.id).trim());
  if (idx < 0) return { ok: false, error: '找不到該申請' };
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
  setCellByHeader_(sh, idx, 'reviewer', reviewer);
  setCellByHeader_(sh, idx, 'reviewedAt', new Date().toISOString());
  updateRecordStatus_(req.id, status);
  return { ok: true };
}

/**
 * 一次過批核／拒絕整張多款物資申請（同一個 batchRef）。
 * 逐行行返單件嗰套庫存邏輯，但**只寄一封**列晒全部物資嘅通知。
 */
function setStockBatchStatus_(token, batchRef, status) {
  var t = requirePerm_(token, 'canStock'); if (t.error) return err(t.error);
  status = String(status).toLowerCase();
  if (STOCK_STATUS.indexOf(status) < 0) return err('狀態不正確');
  batchRef = String(batchRef || '').trim();
  if (!batchRef) return err('缺少批次編號');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet_(SHEET.STOCK_REQ).filter(function (r) { return String(r.batchRef || '').trim() === batchRef; });
  if (!rows.length) return err('找不到該批次');

  var done = 0, failed = [], names = [], email = '', who = '';
  rows.forEach(function (req) {
    var res = applyStockStatusRow_(ss, req, status, t.email);
    if (res.ok) {
      done++;
      names.push((req.itemName || req.itemId) + ' x' + (req.qty || 0));
      email = email || String(req.email || '');
      who = who || String(req.name || '');
    } else failed.push(req.refCode || req.id);
  });

  if (email && done) {
    try {
      var label = { approved: '✅ 借物資申請已批核', rejected: '❌ 借物資申請未獲批准', returned: '📥 借物資已登記歸還' }[status] || '';
      if (label) {
        MailApp.sendEmail(email, label + '（批次 ' + batchRef + '）',
          (who ? who + '，你' : '你') + '嘅借物資申請（批次 ' + batchRef + '）共 ' + done + ' 款物資：\n'
          + names.join('\n') + '\n\n狀態：' + label);
      }
    } catch (e) {}
  }
  return ok({ saved: true, batchRef: batchRef, count: done, failed: failed });
}

function setStockRequestStatus_(token, id, status) {
  var t = requirePerm_(token, 'canStock'); if (t.error) return err(t.error);
  status = String(status).toLowerCase();
  if (STOCK_STATUS.indexOf(status) < 0) return err('狀態不正確');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var req = readSheet_(SHEET.STOCK_REQ).filter(function (r) { return String(r.id).trim() === String(id).trim(); })[0];
  if (!req) return err('找不到該申請');

  var applied = applyStockStatusRow_(ss, req, status, t.email);
  if (!applied.ok) return err(applied.error);

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

// ===================== 區務意見箱（v4.26.1） =====================

var FEEDBACK_HEADERS = [
  'id', 'refCode', 'createdAt', 'category', 'message', 'wantReply',
  'contactName', 'contactType', 'contact', 'dcOnly', 'source', 'districtCode', 'status',
];

function feedbackText_(value, maxLength) {
  var text = String(value == null ? '' : value).trim();
  if (text.length > maxLength) return null;
  return text;
}
function feedbackBool_(value) {
  return value === true || String(value == null ? '' : value).trim().toLowerCase() === 'true';
}
function ensureFeedbackHeaders_(sh) {
  if (!sh) return false;
  var data = sh.getDataRange().getValues();
  if (!data.length || !data[0].some(function (v) { return String(v || '').trim(); })) {
    sh.getRange(1, 1, 1, FEEDBACK_HEADERS.length).setValues([FEEDBACK_HEADERS]);
    return true;
  }
  var headers = data[0].map(function (v) { return String(v || '').trim(); });
  FEEDBACK_HEADERS.forEach(function (h) {
    if (headers.indexOf(h) < 0) {
      var next = sh.getLastColumn() + 1;
      sh.getRange(1, next).setValue(h);
      headers.push(h);
    }
  });
  return true;
}
function appendFeedback_(sh, record) {
  if (!ensureFeedbackHeaders_(sh)) throw new Error('找不到意見箱工作表');
  var headers = sheetHeadersBySheet_(sh);
  var row = headers.map(function (h) {
    var value = record[h] === undefined || record[h] === null ? '' : record[h];
    return typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value);
  });
  var rowIndex = sh.getLastRow() + 1;
  var range = sh.getRange(rowIndex, 1, 1, row.length);
  range.setNumberFormat('@');
  range.setValues([row]);
}
function normalizeFeedbackRecord_(row) {
  return {
    id: String(row.id || ''),
    refCode: String(row.refCode || ''),
    createdAt: String(row.createdAt || ''),
    category: String(row.category || ''),
    message: String(row.message || ''),
    wantReply: feedbackBool_(row.wantReply),
    contactName: String(row.contactName || ''),
    contactType: String(row.contactType || ''),
    contact: String(row.contact || ''),
    dcOnly: feedbackBool_(row.dcOnly),
    status: String(row.status || 'new'),
  };
}
function feedbackReadRows_(sh) {
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  return values.slice(1).map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
    return obj;
  });
}
function feedbackRecordsFromSheet_(sh, dcOnly) {
  if (!sh) return [];
  return feedbackReadRows_(sh).filter(function (r) {
    return feedbackBool_(r.dcOnly) === !!dcOnly;
  }).map(normalizeFeedbackRecord_).sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  }).slice(0, 1000);
}
function submitDistrictFeedback_(b) {
  var locked = guardLocked_(); if (locked) return locked;
  var category = String(b.category || '').trim().toLowerCase();
  if (category !== 'opinion' && category !== 'support') return err('留言類別不正確');
  var message = feedbackText_(b.message, 2000);
  if (message === null || message.length < 10) return err('留言內容須為 10 至 2000 字');
  var wantReply = feedbackBool_(b.wantReply);
  var dcOnly = feedbackBool_(b.dcOnly);
  var contactName = '', contactType = '', contact = '';
  if (wantReply) {
    contactName = feedbackText_(b.contactName, 100);
    contactType = String(b.contactType || '').trim().toLowerCase();
    contact = feedbackText_(b.contact, 200);
    if (contactName === null || contact === null) return err('聯絡資料太長');
    if (['phone', 'email', 'ig', 'fb'].indexOf(contactType) < 0 || !contact) {
      return err('選擇需要回覆時，請提供有效的聯絡方式及帳號');
    }
  }
  var id = Utilities.getUuid();
  var refCode = 'FB-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd')
    + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  var now = new Date().toISOString();
  var record = {
    id: id, refCode: refCode, createdAt: now, category: category, message: message,
    wantReply: wantReply ? 'TRUE' : 'FALSE', contactName: contactName,
    contactType: contactType, contact: contact, dcOnly: dcOnly ? 'TRUE' : 'FALSE',
    source: 'member-portal', districtCode: districtCode_(), status: 'new',
  };
  try {
    if (dcOnly) {
      // 此版本把 DC 留言寫入主試算表 DCConfidential 分頁；此檢查只確認工作表及表頭就緒。
      if (!dcFeedbackReady_()) return err('DC 保密意見分頁尚未就緒，請聯絡系統管理員');
      var dcSheet = getDCFeedbackSheet_();
      if (!dcSheet) return err('DC 保密意見箱尚未設定，請聯絡系統管理員');
      appendFeedback_(dcSheet, record);
      notifyDCFeedback_(record);
    } else {
      var mainSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.FEEDBACK);
      if (!mainSheet) return err('一般意見箱尚未設定，請聯絡系統管理員');
      appendFeedback_(mainSheet, record);
    }
    return ok({ id: id, refCode: refCode, dcOnly: dcOnly });
  } catch (e) {
    console.error('submitDistrictFeedback failed: ' + e);
    return err('暫時未能提交留言，請稍後再試');
  }
}
function getDistrictFeedback_(token) {
  var t = requireCardView_(token, 'feedback'); if (t.error) return err(t.error);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.FEEDBACK);
  if (!sh) return err('找不到一般意見箱工作表');
  return ok(feedbackRecordsFromSheet_(sh, false));
}
function getDCFeedback_(token) {
  var t = checkToken_(token);
  if (!t.valid || (t.source !== 'users' && !isMaintenanceSuper_(t.email, t.role))) return err('登入已過期');
  // 即使 Perms 被誤改，也只向現時仍啟用的 DC 或最高層級超管開放。
  var isMaintenanceSuper = isMaintenanceSuper_(t.email, t.role);
  var current = readSheet_(SHEET.USERS).filter(function (u) {
    return String(u.email || '').trim().toLowerCase() === String(t.email || '').trim().toLowerCase();
  })[0];
  if (!isMaintenanceSuper && (!current || String(current.active || '').toUpperCase() === 'FALSE')) return err('帳戶不存在或已停用');
  var currentRole = current ? String(current.role || '').trim().toUpperCase() : String(t.role || '').trim().toUpperCase();
  var currentLevel = isMaintenanceSuper ? LEVEL_SUPER : levelOfUser_(t.email, currentRole);
  if (currentRole !== DC_ROLE && currentLevel !== LEVEL_SUPER) return err('只有區總監或超級管理員可以查看保密留言');
  if (!dcFeedbackReady_()) return err('DC 保密意見分頁尚未就緒');
  var sh = getDCFeedbackSheet_();
  if (!sh) return err('DC 保密意見箱尚未設定');
  return ok(feedbackRecordsFromSheet_(sh, true));
}

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
  var t = checkToken_(token); if (!t.valid) return err('登入已過期');
  var hasCardRow = !!readPerms_().activity;
  var allowed = hasCardRow ? (cardAccessOf_(t, 'activity') === 'edit') : staffPerms_(t.email, t.role).canVenue;
  if (!allowed) return err('你沒有此功能嘅權限');
  removeRowByFirstCol_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ACTIVITY_REQ), String(id).trim());
  return ok({ deleted: true });
}

// ===================== 消息發佈 News（v4.6.0） =====================
// 管理系統 /news 發佈 → 成員系統 member-portal 首頁頂部置頂顯示。
// 純拉取：member-portal 每次載入 fetch 一次 listAnnouncements，冇推送、冇 cache。
// 呢邊刪咗 / 下架（active=FALSE）／過咗 expiresAt → 成員系統下次載入即刻消失。

// 統一詞彙（同成員系統 AnnouncementBanner 一致）：info 一般 / warning 請留意 / important 緊急。
// 舊 Sheet 用過 warn / urgent，讀寫時自動對應，唔使人手改資料。
var NEWS_LEVELS = ['info', 'warning', 'important'];
var NEWS_LEVEL_ALIAS = { warn: 'warning', warning: 'warning', urgent: 'important', important: 'important', info: 'info', normal: 'info', '': 'info' };
var NEWS_LOCKED_FIELDS = ['id', 'districtCode', 'publishedAt', 'publishedBy', 'createdAt'];

function newsLevel_(v) {
  var s = String(v || '').trim().toLowerCase();
  var mapped = NEWS_LEVEL_ALIAS[s];
  if (mapped) return mapped;
  return NEWS_LEVELS.indexOf(s) >= 0 ? s : 'info';
}
/** Sheet 嘅日期格可能係 Date 物件，一律轉 yyyy-MM-dd 字串 */
function newsDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  return s;
}
function newsToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
/** 一行 News → 統一物件（內部用，連 active / publishedBy） */
function newsRow_(r) {
  return {
    id: String(r.id || '').trim(),
    districtCode: String(r.districtCode || '').trim() || districtCode_(),
    title: String(r.title == null ? '' : r.title).trim(),
    body: String(r.body == null ? '' : r.body),
    date: newsDate_(r.date),
    pinned: isTrue_(r.pinned),
    level: newsLevel_(r.level),
    link: String(r.link || '').trim(),
    linkLabel: String(r.linkLabel || '').trim(),
    notify: isTrue_(r.notify),
    active: String(r.active).toUpperCase() !== 'FALSE',
    expiresAt: newsDate_(r.expiresAt),
    // v4.9.0 軟刪除：刪咗都留底（deleted=TRUE；成員端一律見唔到）
    deleted: isTrue_(r.deleted),
    deletedAt: String(r.deletedAt || ''),
    deletedBy: String(r.deletedBy || ''),
    publishedAt: String(r.publishedAt || ''),
    publishedBy: String(r.publishedBy || ''),
    updatedAt: String(r.updatedAt || r.publishedAt || ''),
  };
}
/** 公開版（成員系統）：唔回 active / publishedBy */
function newsPublic_(n) {
  return {
    id: n.id, districtCode: n.districtCode,
    // body = 管理系統用；content = 成員系統 AnnouncementBanner 讀嘅欄位名（同一份內容）
    title: n.title, body: n.body, content: n.body, date: n.date,
    pinned: n.pinned, level: n.level,
    link: n.link, linkLabel: n.linkLabel, notify: n.notify,
    publishedAt: n.publishedAt, updatedAt: n.updatedAt,
  };
}
function newsSort_(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  var ad = a.date || String(a.publishedAt || '').slice(0, 10);
  var bd = b.date || String(b.publishedAt || '').slice(0, 10);
  if (ad !== bd) return bd.localeCompare(ad);
  return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
}

/**
 * 公開讀消息（成員系統首頁）— 免登入。
 * 參數：pinnedOnly=1 只要置頂／limit（預設 20，上限 50）／since=ISO（只回之後更新過嘅，供「有新消息」判斷）
 * 舊 Sheet 未有 News 表 → 回空陣列（成員系統唔會爆）。
 */
function listAnnouncements_(p) {
  p = p || {};
  if (!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.NEWS)) return [];
  var today = newsToday_();
  var pinnedOnly = isTrue_(p.pinnedOnly || p.pinned || '');
  var since = String(p.since || '').trim();
  var limit = Math.max(1, Math.min(Number(p.limit) || 20, 50));
  var list = readSheet_(SHEET.NEWS).map(newsRow_).filter(function (n) {
    if (!n.id || (!n.title && !n.body)) return false;
    if (!n.active) return false;
    if (n.deleted) return false;                                  // 已刪除留底嘅唔會出返嚟
    if (n.expiresAt && n.expiresAt < today) return false;
    if (n.date && n.date > today) return false;                 // 預設日期喺將來 = 未到發佈日
    if (pinnedOnly && !n.pinned) return false;
    if (since && String(n.updatedAt || '') <= since) return false;
    return true;
  });
  list.sort(newsSort_);
  return list.slice(0, limit).map(newsPublic_);
}

/**
 * 消息管理權限（v4.9.0）：層級 3（ADC）或以上 — 主控台頂部直接編輯／刪除，
 * 唔使再經 news 卡片（卡片已移除）。層級 0 超管永遠可以。
 */
function requireNewsEdit_(token) {
  var t = checkToken_(token);
  if (!t.valid) return { error: '登入已過期' };
  if (levelOfUser_(t.email, t.role) <= LEVEL_ADC) return { ok: true, email: t.email, role: t.role };
  return { error: '只有 ADC（助理區總監）或以上可以管理消息' };
}

/** 管理系統列表（需登入）：連已下架／已過期／已刪除留底都回 */
function getAnnouncements_(token) {
  var t = requireLogin_(token); if (t.error) return err(t.error);
  if (!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.NEWS)) {
    return err('尚未執行 setupSheets()（缺 News 表）');
  }
  var today = newsToday_();
  var list = readSheet_(SHEET.NEWS).map(newsRow_).filter(function (n) { return !!n.id; });
  list.sort(newsSort_);
  return ok(list.map(function (n) {
    n.expired = !!(n.expiresAt && n.expiresAt < today);
    n.scheduled = !!(n.date && n.date > today);
    n.live = n.active && !n.deleted && !n.expired && !n.scheduled;
    return n;
  }));
}

/** 新增／更新消息（ADC 層級 3 或以上）；a.id 留空 = 新增 */
function saveAnnouncement_(token, a) {
  var t = requireNewsEdit_(token); if (t.error) return err(t.error);
  a = a || {};
  var title = String(a.title || '').trim();
  var body = String((a.body === undefined || a.body === null || a.body === '') ? (a.content || '') : a.body).trim();
  if (!title) return err('標題必填');
  if (!body) return err('內容必填');

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.NEWS);
  if (!sh) return err('尚未執行 setupSheets()（缺 News 表）');

  var now = new Date().toISOString();
  var fields = {
    title: title,
    body: body,
    date: newsDate_(a.date) || newsToday_(),
    pinned: isTrue_(a.pinned) ? 'TRUE' : 'FALSE',
    level: newsLevel_(a.level),
    link: String(a.link || '').trim(),
    linkLabel: String(a.linkLabel || '').trim(),
    notify: isTrue_(a.notify) ? 'TRUE' : 'FALSE',
    active: (a.active === undefined || a.active === '' || isTrue_(a.active)) ? 'TRUE' : 'FALSE',
    expiresAt: newsDate_(a.expiresAt),
    updatedAt: now,
  };

  var id = String(a.id || '').trim();
  if (id) {
    var idx = rowIndexByCol_(sh, 'id', id);
    if (idx < 0) return err('找不到該消息');
    Object.keys(fields).forEach(function (k) {
      if (NEWS_LOCKED_FIELDS.indexOf(k) >= 0) return;
      setCellByHeader_(sh, idx, k, fields[k]);
    });
    return ok({ saved: true, id: id, created: false });
  }

  id = genId_('nw');
  var row = { id: id, districtCode: districtCode_(), publishedAt: now, publishedBy: t.email || '', createdAt: now };
  Object.keys(fields).forEach(function (k) { row[k] = fields[k]; });
  appendRowObj_(sh, row);
  return ok({ saved: true, id: id, created: true });
}

/**
 * 刪除消息（v4.9.0 軟刪除）：行唔會刪走 — deleted=TRUE ＋ deletedAt/deletedBy 留底，
 * Sheet 繼續紀錄曾經出現過嘅消息；成員系統下次載入即刻唔見。
 */
function deleteAnnouncement_(token, id) {
  var t = requireNewsEdit_(token); if (t.error) return err(t.error);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.NEWS);
  if (!sh) return err('尚未執行 setupSheets()（缺 News 表）');
  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx < 0) return err('找不到該消息');
  var now = new Date().toISOString();
  setCellByHeader_(sh, idx, 'deleted', 'TRUE');
  setCellByHeader_(sh, idx, 'deletedAt', now);
  setCellByHeader_(sh, idx, 'deletedBy', t.email || '');
  setCellByHeader_(sh, idx, 'active', 'FALSE');
  setCellByHeader_(sh, idx, 'pinned', 'FALSE');
  setCellByHeader_(sh, idx, 'updatedAt', now);
  return ok({ deleted: true, id: String(id).trim() });
}

/** 還原已刪除消息（翻查留底後想收返用；還原後係「已下架」狀態） */
function restoreAnnouncement_(token, id) {
  var t = requireNewsEdit_(token); if (t.error) return err(t.error);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.NEWS);
  if (!sh) return err('尚未執行 setupSheets()（缺 News 表）');
  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx < 0) return err('找不到該消息');
  var now = new Date().toISOString();
  setCellByHeader_(sh, idx, 'deleted', 'FALSE');
  setCellByHeader_(sh, idx, 'active', 'FALSE');
  setCellByHeader_(sh, idx, 'updatedAt', now);
  return ok({ restored: true, id: String(id).trim() });
}

/** 置頂／取消置頂 */
function setAnnouncementPinned_(token, id, pinned) {
  return updateAnnouncementFlag_(token, id, 'pinned', pinned);
}
/** 上架／下架（下架＝成員系統即刻唔見，但記錄仍在） */
function setAnnouncementActive_(token, id, active) {
  return updateAnnouncementFlag_(token, id, 'active', active);
}
function updateAnnouncementFlag_(token, id, field, value) {
  var t = requireNewsEdit_(token); if (t.error) return err(t.error);
  if (field === 'pinned' || field === 'active') {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.NEWS);
    var idx = sh ? rowIndexByCol_(sh, 'id', String(id).trim()) : -1;
    if (sh && idx > 0 && isTrue_(getCellByHeader_(sh, idx, 'deleted'))) {
      return err('該消息已刪除（只可以還原）');
    }
  }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.NEWS);
  if (!sh) return err('尚未執行 setupSheets()（缺 News 表）');
  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx < 0) return err('找不到該消息');
  var on = (value === true || isTrue_(value));
  setCellByHeader_(sh, idx, field, on ? 'TRUE' : 'FALSE');
  setCellByHeader_(sh, idx, 'updatedAt', new Date().toISOString());
  var out = { saved: true, id: String(id).trim() };
  out[field] = on;
  return ok(out);
}

// ===================== 區通告 Circulars（v4.12.0；職員專用） =====================
// 開班文件流程（PDF only，無公開頁無 feed）：
//   訓練班 Sheet（ADC 填 Input01／02／03 一次）→ pullCourseProfile 自動帶入訓練班目錄 →
//   通告草稿自動預填（從訓練班帶入）→ 職員補內文 → 列印傳統格式 PDF →
//   上載區網／交總會（通告圖書館自動收錄）→ 區網 PDF 連結回填 CourseLinks.noticeUrl。
// 通告編號人手輸入（跨類別共用區編號順序，不只訓練班用），同一區唔可以重複。
//
// 管理（需登入）：
//   getCirculars        全部狀態＋isOpen 旗＋course snapshot＋suggestedNo（下一個建議編號）
//   saveCircular        新增（id 留空，預設 draft）／更新；circulars 卡 edit 權限
//   deleteCircular      直接刪除（通告係永久文件：已發佈嘅請先封存；前端刪除前會再確認）
//   setCircularStatus   draft → published → closed → archived（可隨時互相轉）
//   pullCourseProfile   經訓練班 Script 讀 getCourseProfile（canCourse 權限）
//
// sessions／attachments 喺 Sheet 以 JSON 字串存，API 讀寫都係陣列。
// courseId 掛接 CourseLinks：附帶該班 snapshot（名額／已報／截止／區網 PDF 連結）。

var CIRCULAR_STATUS = ['draft', 'published', 'closed', 'archived'];
var CIRCULAR_CATEGORIES = ['訓練班', '活動', '服務', '比賽', '會議', '行政', '其他'];
var CIRCULAR_SECTIONS = ['小童軍', '幼童軍', '童軍', '深資童軍', '樂行童軍', '領袖'];
var CIRCULAR_LOCKED_FIELDS = ['id', 'districtCode', 'publishedAt', 'publishedBy', 'createdAt'];

function circularStatus_(v) {
  var s = String(v || '').trim().toLowerCase();
  return CIRCULAR_STATUS.indexOf(s) >= 0 ? s : 'draft';
}
function circularCategory_(v) {
  var s = String(v || '').trim();
  return CIRCULAR_CATEGORIES.indexOf(s) >= 0 ? s : '其他';
}
/** 支部：陣列或「、」分隔字串 → 「、」分隔字串 */
function circularSections_(v) {
  var arr = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[、,，]/);
  var out = [];
  arr.forEach(function (x) {
    var s = String(x || '').trim();
    if (s && out.indexOf(s) < 0) out.push(s);
  });
  return out.join('、');
}
/** 節數表／附件：陣列或 JSON 字串 → 陣列（寫入時再 stringify） */
function circularJsonArr_(v, max) {
  var arr = v;
  if (typeof arr === 'string') {
    var s = arr.trim();
    if (!s) return [];
    try { arr = JSON.parse(s); } catch (e) { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, max || 50);
}
function circularSessions_(v) {
  return circularJsonArr_(v, 50).map(function (r) {
    r = r || {};
    return {
      date: String(r.date == null ? '' : r.date).trim().slice(0, 20),
      time: String(r.time == null ? '' : r.time).trim().slice(0, 60),
      venue: String(r.venue == null ? '' : r.venue).trim().slice(0, 120),
    };
  }).filter(function (r) { return r.date || r.time || r.venue; });
}
function circularAttachments_(v) {
  return circularJsonArr_(v, 20).map(function (r) {
    r = r || {};
    return {
      label: String(r.label == null ? '' : r.label).trim().slice(0, 60),
      url: String(r.url == null ? '' : r.url).trim().slice(0, 500),
    };
  }).filter(function (r) { return r.label || r.url; });
}
function circularDate_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v == null ? '' : v).trim().slice(0, 20);
}
function circularToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
/** 一行 Circulars → 統一物件（內部用，連 publishedBy） */
function circularRow_(r) {
  return {
    id: String(r.id || '').trim(),
    districtCode: String(r.districtCode || '').trim() || districtCode_(),
    circularNo: String(r.circularNo == null ? '' : r.circularNo).trim(),
    category: circularCategory_(r.category),
    title: String(r.title == null ? '' : r.title).trim(),
    sections: circularSections_(r.sections),
    sessions: circularSessions_(r.sessions),
    leader: String(r.leader == null ? '' : r.leader).trim(),
    eligibility: String(r.eligibility == null ? '' : r.eligibility),
    fee: String(r.fee == null ? '' : r.fee).trim(),
    originalFee: String(r.originalFee == null ? '' : r.originalFee).trim(),
    subsidyNote: String(r.subsidyNote == null ? '' : r.subsidyNote),
    feeNote: String(r.feeNote == null ? '' : r.feeNote),
    quota: String(r.quota == null ? '' : r.quota).trim(),
    deadline: circularDate_(r.deadline),
    courseId: String(r.courseId == null ? '' : r.courseId).trim(),
    signupUrl: String(r.signupUrl || r.formUrl || '').trim(),
    signupNote: String(r.signupNote == null ? '' : r.signupNote),
    uniform: String(r.uniform == null ? '' : r.uniform),
    remarks: String(r.remarks == null ? '' : r.remarks),
    contactName: String(r.contactName == null ? '' : r.contactName).trim(),
    contactEmail: String(r.contactEmail || '').trim(),
    contactPhone: String(r.contactPhone == null ? '' : r.contactPhone).trim(),
    enquiryNote: String(r.enquiryNote == null ? '' : r.enquiryNote),
    attachments: circularAttachments_(r.attachments),
    issueDate: circularDate_(r.issueDate),
    issuer: String(r.issuer == null ? '' : r.issuer).trim(),
    signedBy: String(r.signedBy == null ? '' : r.signedBy).trim(),
    status: circularStatus_(r.status),
    publishedAt: String(r.publishedAt || ''),
    publishedBy: String(r.publishedBy || ''),
    updatedAt: String(r.updatedAt || r.publishedAt || ''),
    createdAt: String(r.createdAt || ''),
  };
}
/** 掛接訓練班 snapshot（名額／已報／截止；該班唔存在就 null） */
function circularCourse_(courseId) {
  var cid = String(courseId || '').trim();
  if (!cid) return null;
  var link = readSheet_(SHEET.COURSE_LINKS).filter(function (x) {
    return String(x.courseId).trim() === cid;
  })[0];
  if (!link) return null;
  return {
    courseId: cid,
    title: String(link.title || ''),
    fee: link.fee === undefined || link.fee === null ? '' : String(link.fee),
    deadline: String(link.deadline || ''),
    quota: link.quota === undefined || link.quota === null ? '' : String(link.quota),
    filled: link.filled === undefined || link.filled === null ? '' : String(link.filled),
    noticeUrl: String(link.noticeUrl || ''),
  };
}
/** 接受報名中 = 已發佈＋未過截止日 */
function circularIsOpen_(n, today) {
  if (n.status !== 'published') return false;
  var dl = String(n.deadline || '').trim();
  return !dl || dl >= (today || circularToday_());
}
/** 管理版：附 course snapshot＋isOpen＋publishedBy／createdAt（無公開連結，PDF only） */
function circularStaff_(n, today) {
  today = today || circularToday_();
  return {
    id: n.id, districtCode: n.districtCode, circularNo: n.circularNo,
    category: n.category, title: n.title, sections: n.sections, sessions: n.sessions,
    leader: n.leader, eligibility: n.eligibility,
    fee: n.fee, originalFee: n.originalFee, subsidyNote: n.subsidyNote, feeNote: n.feeNote,
    quota: n.quota, deadline: n.deadline,
    courseId: n.courseId, course: circularCourse_(n.courseId), signupUrl: n.signupUrl, signupNote: n.signupNote,
    uniform: n.uniform, remarks: n.remarks,
    contactName: n.contactName, contactEmail: n.contactEmail, contactPhone: n.contactPhone,
    enquiryNote: n.enquiryNote, attachments: n.attachments,
    issueDate: n.issueDate, issuer: n.issuer, signedBy: n.signedBy,
    status: n.status, isOpen: circularIsOpen_(n, today),
    publishedAt: n.publishedAt, publishedBy: n.publishedBy, updatedAt: n.updatedAt,
    createdAt: n.createdAt,
  };
}
function circularSort_(a, b) {
  var ad = a.issueDate || String(a.publishedAt || '').slice(0, 10) || '';
  var bd = b.issueDate || String(b.publishedAt || '').slice(0, 10) || '';
  if (ad !== bd) return bd.localeCompare(ad);
  var an = parseInt(String(a.circularNo || '').trim(), 10);
  var bn = parseInt(String(b.circularNo || '').trim(), 10);
  if (!isNaN(an) && !isNaN(bn) && an !== bn) return bn - an;
  return String(b.circularNo || '').localeCompare(String(a.circularNo || ''));
}

/** 管理系統列表（需登入）：全部狀態＋isOpen＋course＋suggestedNo */
function getCirculars_(token) {
  var t = requireLogin_(token); if (t.error) return err(t.error);
  if (!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CIRCULARS)) {
    return err('尚未執行 setupSheets()（缺 Circulars 表）');
  }
  var today = circularToday_();
  var list = readSheet_(SHEET.CIRCULARS).map(circularRow_).filter(function (n) { return !!n.id; });
  list.sort(circularSort_);
  var maxNo = 0;
  list.forEach(function (n) {
    var m = String(n.circularNo || '').trim().match(/^(\d{1,6})$/);
    if (m) maxNo = Math.max(maxNo, Number(m[1]));
  });
  return ok({
    items: list.map(function (n) { return circularStaff_(n, today); }),
    suggestedNo: maxNo > 0 ? String(maxNo + 1) : '',
  });
}

/** 新增／更新通告（circulars 卡 edit 權限）；c.id 留空 = 新增（狀態預設 draft） */
function saveCircular_(token, c) {
  var t = requireCardEdit_(token, 'circulars'); if (t.error) return err(t.error);
  c = c || {};
  var no = String(c.circularNo == null ? '' : c.circularNo).trim().slice(0, 24);
  var title = String(c.title == null ? '' : c.title).trim().slice(0, 200);
  if (!no) return err('通告編號必填');
  if (!title) return err('標題必填');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CIRCULARS);
  if (!sh) return err('尚未執行 setupSheets()（缺 Circulars 表）');

  var id = String(c.id || '').trim();
  // 同一區通告編號唔可以重複（唔計自己）
  var dup = readSheet_(SHEET.CIRCULARS).map(circularRow_).filter(function (n) {
    return String(n.circularNo) === no && n.id !== id;
  })[0];
  if (dup) return err('通告編號「' + no + '」已經用咗（' + (dup.title || dup.id) + '）');

  var str = function (v, n) { return String(v == null ? '' : v).trim().slice(0, n || 500); };
  var big = function (v) { return String(v == null ? '' : v).slice(0, 5000); };
  var now = new Date().toISOString();
  var fields = {
    circularNo: no,
    category: circularCategory_(c.category),
    title: title,
    sections: circularSections_(c.sections),
    sessions: JSON.stringify(circularSessions_(c.sessions)),
    leader: str(c.leader, 120),
    eligibility: big(c.eligibility),
    fee: str(c.fee, 40),
    originalFee: str(c.originalFee, 40),
    subsidyNote: big(c.subsidyNote),
    feeNote: big(c.feeNote),
    quota: str(c.quota, 20),
    deadline: circularDate_(c.deadline),
    courseId: str(c.courseId, 60),
    signupUrl: str(c.signupUrl || c.formUrl, 500),
    signupNote: big(c.signupNote),
    uniform: big(c.uniform),
    remarks: big(c.remarks),
    contactName: str(c.contactName, 120),
    contactEmail: str(c.contactEmail, 200),
    contactPhone: str(c.contactPhone, 60),
    enquiryNote: big(c.enquiryNote),
    attachments: JSON.stringify(circularAttachments_(c.attachments)),
    issueDate: circularDate_(c.issueDate) || circularToday_(),
    issuer: str(c.issuer, 120),
    signedBy: str(c.signedBy, 120),
    status: circularStatus_(c.status),
    updatedAt: now,
  };

  if (id) {
    var idx = rowIndexByCol_(sh, 'id', id);
    if (idx < 0) return err('找不到該通告');
    if (!String(c.issueDate || '').trim()) fields.issueDate = circularDate_(getCellByHeader_(sh, idx, 'issueDate'));
    if (c.status == null || !String(c.status).trim()) fields.status = circularStatus_(getCellByHeader_(sh, idx, 'status'));
    Object.keys(fields).forEach(function (k) {
      if (CIRCULAR_LOCKED_FIELDS.indexOf(k) >= 0) return;
      setCellByHeader_(sh, idx, k, fields[k]);
    });
    circularTouchPublished_(sh, idx, t.email);
    return ok({ saved: true, id: id, created: false });
  }
  id = genId_('cr');
  var row = { id: id, districtCode: districtCode_(), publishedAt: '', publishedBy: '', createdAt: now };
  Object.keys(fields).forEach(function (k) { row[k] = fields[k]; });
  if (row.status === 'published' || row.status === 'closed') {
    row.publishedAt = now;
    row.publishedBy = t.email || '';
  }
  appendRowObj_(sh, row);
  return ok({ saved: true, id: id, created: true });
}

/** 首次發佈時補 publishedAt／publishedBy（之後轉 status 唔會再郁） */
function circularTouchPublished_(sh, idx, email) {
  try {
    var st = circularStatus_(getCellByHeader_(sh, idx, 'status'));
    if ((st === 'published' || st === 'closed') && !String(getCellByHeader_(sh, idx, 'publishedAt') || '').trim()) {
      setCellByHeader_(sh, idx, 'publishedAt', new Date().toISOString());
      setCellByHeader_(sh, idx, 'publishedBy', email || '');
    }
  } catch (e) {}
}

function deleteCircular_(token, id) {
  var t = requireCardEdit_(token, 'circulars'); if (t.error) return err(t.error);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CIRCULARS);
  if (!sh) return err('尚未執行 setupSheets()（缺 Circulars 表）');
  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx < 0) return err('找不到該通告');
  sh.deleteRow(idx);
  return ok({ deleted: true, id: String(id).trim() });
}

/** 轉狀態（draft／published／closed／archived，可隨時互相轉） */
function setCircularStatus_(token, id, status) {
  var t = requireCardEdit_(token, 'circulars'); if (t.error) return err(t.error);
  var st = String(status || '').trim().toLowerCase();
  if (CIRCULAR_STATUS.indexOf(st) < 0) return err('狀態不正確');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CIRCULARS);
  if (!sh) return err('尚未執行 setupSheets()（缺 Circulars 表）');
  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx < 0) return err('找不到該通告');
  setCellByHeader_(sh, idx, 'status', st);
  setCellByHeader_(sh, idx, 'updatedAt', new Date().toISOString());
  circularTouchPublished_(sh, idx, t.email);
  return ok({ saved: true, id: String(id).trim(), status: st });
}

// ===================== 聯絡簿 — 職員姓名區方自訂（v4.9.0） =====================
// 電話唔變但人會轉：地域職員姓名可以由區方自行改（全區同步，存 ContactNames 表）。
// key 慣例：「職位|電話|第幾個同 key」（重複職位+電話都用唔同 key）；name 留空 = 還原官方名。
var CONTACTNAMES_ADMIT_LEVEL = 3; // ADC（助理區總監）或以上

function getContactNames_(token) {
  var t = requireLogin_(token); if (t.error) return err(t.error);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CONTACT_NAMES);
  if (!sh) return ok({ names: {} });
  var names = {};
  readSheet_(SHEET.CONTACT_NAMES).forEach(function (r) {
    var k = String(r.key || '').trim();
    var v = String(r.name == null ? '' : r.name).trim();
    if (k && v) names[k] = v;
  });
  return ok({ names: names });
}

/** 改／還原一個姓名（ADC 或以上）；name 留空 = 刪走自訂（還原用官方同步名） */
function saveContactName_(token, key, name) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期');
  if (levelOfUser_(t.email, t.role) > CONTACTNAMES_ADMIT_LEVEL) return err('只有 ADC（助理區總監）或以上可以改聯絡簿姓名');
  key = String(key || '').trim().slice(0, 120);
  if (!key) return err('key 必填');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.CONTACT_NAMES);
  if (!sh) { ensureSheet_(ss, SHEET.CONTACT_NAMES, [['key', 'name', 'updatedAt', 'updatedBy']]); sh = ss.getSheetByName(SHEET.CONTACT_NAMES); }
  var idx = rowIndexByCol_(sh, 'key', key);
  var v = String(name == null ? '' : name).trim();
  if (!v) {
    if (idx > 0) sh.deleteRow(idx);
    return ok({ saved: true, key: key, name: '' });
  }
  var row = { key: key, name: v.slice(0, 60), updatedAt: new Date().toISOString(), updatedBy: t.email || '' };
  if (idx > 0) {
    sheetHeadersBySheet_(sh).forEach(function (h, j) { if (row[h] !== undefined) sh.getRange(idx, j + 1).setValue(row[h]); });
  } else {
    appendRowObj_(sh, row);
  }
  return ok({ saved: true, key: key, name: row.name });
}

// ===================== 獎勵提名 Awards（v4.7.0） =====================
// 一站式：名冊（Awards 表，一人一行、每個獎一欄＝獲獎年份）
//        + 年期規則（AwardTypes 表，可喺管理系統改）
//        + 「今年夠期可提名」由前端按規則即時推算（後台只負責存取）。
// 加新獎項 → ensureAwardColumns_ 自動喺 Awards 表補一欄，唔會清走舊資料。

var AWARD_FIXED_COLS = ['id', 'districtCode', 'name', 'nameEn', 'troop', 'position', 'serviceStart', 'status', 'note'];
var AWARD_TAIL_COLS = ['updatedAt', 'createdAt'];
var AWARD_ROUNDS = ['founder', 'rally', 'hab', 'other'];
// 名冊狀態（同用戶原本 Excel 嘅顏色註腳對應）；noNomination = 沒有提名資格（唔會出現喺提名建議）
var AWARD_STATUSES = ['active', 'noNomination', 'noAppointment', 'notInDistrict', 'applying', 'left'];
// 民青局局長嘉許提名期死線（MM-DD；Config 可覆蓋 — 2026 年度：制服團體須於 2/3 前交民青局）
var AWARD_HAB_DL_DEFAULT = { district: '01-15', hq: '02-03' };

/** 預設獎項及年期（第一次 setupSheets 會種入 AwardTypes 表；之後全部以表為準） */
function awardTypeSeed_() {
  return [
    // code, label, short, category, prevCode, minYears, round, note, enabled
    ['GSA',    '優良服務獎章',            'GSA',   '功績榮譽', '',      7,    'founder', 'Good Service Award；由服務開始年份起計 7 年', 'TRUE'],
    ['DSA',    '優異服務獎章',            'DSA',   '功績榮譽', 'GSA',   5,    'founder', 'Dedicated Service Award', 'TRUE'],
    ['DSM',    '功績榮譽獎章',            'DSM',   '功績榮譽', 'DSA',   7,    'rally',   'Distinguished Service Medal；獎勵委員會批准', 'TRUE'],
    ['DSC',    '功績榮譽十字章',          'DSC',   '功績榮譽', 'DSM',   5,    'rally',   'Distinguished Service Cross；成年成員最高功績獎勵', 'TRUE'],
    ['BRL',    '銅獅勳章',                '銅獅',  '獅勳章',   'DSC',   '',   'rally',   'Bronze Lion；冇固定年期規定', 'TRUE'],
    ['SVL',    '銀獅勳章',                '銀獅',  '獅勳章',   'BRL',   '',   'rally',   'Silver Lion；冇固定年期規定', 'TRUE'],
    ['GDL',    '金獅勳章',                '金獅',  '獅勳章',   'SVL',   '',   'rally',   'Gold Lion；制服成年成員最高功績獎勵，冇固定年期規定', 'TRUE'],
    ['FIVE',   '五年長期服務獎狀',        '五年',  '長期服務', '',      5,    'other',   '會務委員（LAY）階梯第一級；由服務開始年份起計 5 年', 'TRUE'],
    ['TEN',    '十年長期服務獎狀',        '十年',  '長期服務', 'FIVE',  5,    'other',   '會務委員（LAY）；五年獎狀後 5 年（共 10 年）', 'TRUE'],
    ['LSM',    '長期服務獎章',            'LSM',   '長期服務', '',      15,   'other',   '服務滿 15 年（由服務開始年份起計；會務委員 LAY 五年→十年→十五年 自動接上，十年獎狀後 5 年可獲）', 'TRUE'],
    ['LSM1',   '長期服務一星獎章',        'LSM*',  '長期服務', 'LSM',   10,   'other',   '再服務滿 10 年（共 25 年）', 'TRUE'],
    ['LSM2',   '長期服務二星獎章',        'LSM**', '長期服務', 'LSM1',  10,   'other',   '共 35 年', 'TRUE'],
    ['LSM3',   '長期服務三星獎章',        'LSM***','長期服務', 'LSM2',  10,   'other',   '共 45 年', 'TRUE'],
    ['LSM4',   '長期服務四星獎章',        'LSM****','長期服務','LSM3',  10,   'other',   '共 55 年', 'TRUE'],
    ['CCM',    '香港總監嘉許',            '總監嘉許', '嘉許',  '',      '',   'other',   '黃色笛繩（榮譽笛子）；自行申請，香港總監全權批准，唔會自動推算', 'TRUE'],
    ['CCH',    '香港總監高級嘉許',        '高級嘉許', '嘉許',  '',      '',   'other',   '黃紫綠笛繩；自行申請，唔可以由總監嘉許年份推算', 'TRUE'],
    ['HAB',    '民政及青年事務局局長嘉許', '民青局',  '外部嘉許', '',    '',   'hab',     '自行申請＋有提名期：總會每年初發通告收集（2026 年度 2/3 前交民青局）；死線可喺年期設定改', 'TRUE'],
    ['THANKS', '感謝狀',                  '感謝狀', '其他',   '',      '',   'other',   '表格 DA2；自行申請，唔會自動推算', 'TRUE'],
  ];
}

/**
 * v4.9.0 年期修訂 — AwardTypes 舊值自動升級（只改仍然同舊預設一樣嘅格，
 * 用戶自行改過嘅設定絕對唔掂）。同一 philosophy 同 patchCardRows_。
 * v4.9.1 / v4.10.0：LSM 備註補上十年獎狀後 5 年可獲（LAY 階梯）
 */
function patchAwardTypes_(ss) {
  var sh = ss.getSheetByName(SHEET.AWARD_TYPES);
  if (!sh) return;
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return;
  var head = v[0].map(function (h) { return String(h).trim(); });
  var c = {};
  ['code', 'prevCode', 'minYears', 'round', 'note'].forEach(function (k) { c[k] = head.indexOf(k); });
  if (c.code < 0 || c.prevCode < 0 || c.minYears < 0 || c.round < 0) return;
  // code → [舊 prevCode, 舊 minYears, 新 prevCode, 新 minYears, 舊 round, 新 round, 舊 note, 新 note]
  var patches = {
    FIVE:   ['',  '',      '',  '5',  'other', 'other', '會務委員專用（預設唔自動推算；想自動列出就喺年期設定填 5）', '會務委員（LAY）階梯第一級；由服務開始年份起計 5 年'],
    LSM:    ['',  '',      '',  '15', 'other', 'other', '服務實職滿 15 年；第一個由區會自己入紀錄，預設唔自動推算（想自動列出就喺年期設定填 15）', '服務滿 15 年（由服務開始年份起計；會務委員 五年→十年→十五年 自動接上）'],
    CCH:    ['CCM', '5',   '',  '',   'other', 'other', '黃紫綠笛繩；獲總監嘉許後有超卓表現', '黃紫綠笛繩；自行申請，唔可以由總監嘉許年份推算'],
    THANKS: ['',  '',      '',  '',   'founder', 'other', '表格 DA2；頒予配偶／家長／支持童軍運動人士', '表格 DA2；自行申請，唔會自動推算'],
    HAB:    ['',  '',      '',  '',   'other', 'hab',   '前稱民政事務局局長嘉許計劃；義務領袖須服務滿 10 年（限提名名額，預設唔自動推算；想自動列出就喺年期設定填 10）', '自行申請＋有提名期：總會每年初發通告收集（2026 年度 2/3 前交民青局）；死線可喺年期設定改'],
  };
  // v4.9.1→v4.17.0 追加：LSM 舊備註自動升級到新版（含 TEN+5）
  var notePatches = {
    LSM: [
      ['服務滿 15 年（由服務開始年份起計；會務委員 五年→十年→十五年 自動接上）', '服務滿 15 年（由服務開始年份起計；會務委員 LAY 五年→十年→十五年 自動接上，十年獎狀後 5 年可獲）'],
    ],
  };
  for (var i = 1; i < v.length; i++) {
    var code = String(v[i][c.code] || '').trim().toUpperCase();
    var p = patches[code];
    var curPrev = String(v[i][c.prevCode] || '').trim().toUpperCase();
    var curMin = String(v[i][c.minYears] == null ? '' : v[i][c.minYears]).trim();
    var curRound = String(v[i][c.round] || '').trim().toLowerCase();
    var curNote = c.note >= 0 ? String(v[i][c.note] || '').trim() : '';
    var changed = false;
    if (p) {
      if (curPrev === String(p[0]).toUpperCase() && curMin === p[1] && (curMin !== String(p[3]))) {
        sh.getRange(i + 1, c.prevCode + 1).setValue(p[2]);
        sh.getRange(i + 1, c.minYears + 1).setValue(p[3]);
        changed = true;
      }
      if (curRound === p[4] && curRound !== p[5]) {
        sh.getRange(i + 1, c.round + 1).setValue(p[5]);
        changed = true;
      }
      if (c.note >= 0 && p[6] && curNote === p[6]) {
        sh.getRange(i + 1, c.note + 1).setValue(p[7]);
        curNote = p[7];
        changed = true;
      }
    }
    // 追加備註升級（LSM TEN+5）
    var np = notePatches[code];
    if (np && c.note >= 0) {
      for (var k = 0; k < np.length; k++) {
        if (curNote === np[k][0]) {
          sh.getRange(i + 1, c.note + 1).setValue(np[k][1]);
          changed = true;
          break;
        }
      }
    }
    if (changed) v[i] = sh.getRange(i + 1, 1, 1, head.length).getValues()[0]; // refresh
  }
}

function awardCode_(v) {
  var c = String(v == null ? '' : v).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  return c.slice(0, 16);
}
function awardRound_(v) {
  var r = String(v || '').trim().toLowerCase();
  return AWARD_ROUNDS.indexOf(r) >= 0 ? r : 'other';
}
function awardStatus_(v) {
  var t = String(v || '').trim();
  if (!t) return 'active';
  return AWARD_STATUSES.indexOf(t) >= 0 ? t : 'active';
}
/** 獎年份格：可以係 2015、"2015"、"2015?"（未確定）、"無"、日期物件 */
function awardYearCell_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return String(v.getFullYear());
  var t = String(v).trim();
  if (!t) return '';
  if (/^(無|冇|N\/A|NA|-)$/i.test(t)) return '無';
  var m = t.match(/(\d{4})/);
  if (!m) return t.slice(0, 20);
  return m[1] + (/\?/.test(t) ? '?' : '');
}

/** 服務開始年份：接受 2004、2004/01/15、"86th since 2004/01/15"、日期格 */
function awardServiceStart_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return String(v.getFullYear());
  var m = String(v).match(/(19|20)\d{2}/);
  return m ? m[0] : '';
}

/** AwardTypes 表 → 陣列（未有表 / 空表 → 用預設種子，唔會炸） */
function awardTypes_() {
  var rows = readSheet_(SHEET.AWARD_TYPES);
  var list = rows.map(function (r, i) {
    return {
      code: awardCode_(r.code),
      label: String(r.label || '').trim(),
      short: String(r.short || '').trim(),
      category: String(r.category || '').trim() || '其他',
      prevCode: awardCode_(r.prevCode),
      minYears: r.minYears === '' || r.minYears === null || r.minYears === undefined ? null : (Number(r.minYears) || 0),
      round: awardRound_(r.round),
      note: String(r.note || '').trim(),
      enabled: String(r.enabled).toUpperCase() !== 'FALSE',
      orderNo: i,
    };
  }).filter(function (t) { return !!t.code; });
  if (list.length) return list;
  return awardTypeSeed_().map(function (r, i) {
    return {
      code: awardCode_(r[0]), label: r[1], short: r[2], category: r[3],
      prevCode: awardCode_(r[4]), minYears: r[5] === '' ? null : Number(r[5]),
      round: awardRound_(r[6]), note: r[7], enabled: String(r[8]).toUpperCase() !== 'FALSE', orderNo: i,
    };
  });
}

/** Awards 表要有嘅欄 = 固定欄 + 每個獎項一欄 + 尾欄；缺就補（唔會清資料） */
function ensureAwardColumns_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.AWARDS);
  if (!sh) return [];
  var want = AWARD_FIXED_COLS.concat(awardTypes_().map(function (t) { return t.code; })).concat(AWARD_TAIL_COLS);
  var have = sheetHeadersBySheet_(sh);
  if (!have.length) {
    sh.getRange(1, 1, 1, want.length).setValues([want]);
    sh.getRange(1, 1, 1, want.length).setFontWeight('bold').setBackground('#fde68a');
    sh.setFrozenRows(1);
    return want;
  }
  var missing = want.filter(function (h) { return have.indexOf(h) < 0; });
  if (missing.length) {
    sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
    sh.getRange(1, 1, 1, have.length + missing.length).setFontWeight('bold');
  }
  return missing;
}

/** 一行 Awards → 物件（awards 收埋做 map） */
function awardMemberRow_(r, types) {
  var awards = {};
  types.forEach(function (t) {
    var y = awardYearCell_(r[t.code]);
    if (y) awards[t.code] = y;
  });
  return {
    id: String(r.id || '').trim(),
    districtCode: String(r.districtCode || '').trim() || districtCode_(),
    name: String(r.name || '').trim(),
    nameEn: String(r.nameEn || '').trim(),
    troop: String(r.troop == null ? '' : r.troop).trim(),
    position: String(r.position || '').trim(),
    serviceStart: awardServiceStart_(r.serviceStart),
    status: awardStatus_(r.status),
    note: String(r.note || '').trim(),
    awards: awards,
    updatedAt: String(r.updatedAt || ''),
  };
}

/** 一次過攞晒名冊＋規則（管理系統 /awards 只需呢一個 call） */
function getAwardsBoard_(token) {
  var t = requireCardView_(token, 'awards'); if (t.error) return err(t.error);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SHEET.AWARDS)) return err('尚未執行 setupSheets()（缺 Awards 表）');
  var types = awardTypes_();
  var members = readSheet_(SHEET.AWARDS).map(function (r) { return awardMemberRow_(r, types); })
    .filter(function (m) { return !!m.name; });
  var counts = {};
  types.forEach(function (ty) {
    counts[ty.code] = members.filter(function (m) { return m.awards[ty.code] && m.awards[ty.code] !== '無'; }).length;
  });
  var defaults = awardTypeSeed_().map(function (r) {
    return {
      code: awardCode_(r[0]), label: r[1], short: r[2], category: r[3],
      prevCode: awardCode_(r[4]), minYears: r[5] === '' ? null : Number(r[5]),
      round: awardRound_(r[6]), note: r[7], enabled: true,
    };
  });
  return ok({
    types: types, members: members, counts: counts, total: members.length, defaults: defaults,
    deadlineCfg: {
      habDistrict: getConfigValue_('AWARD_HAB_DL_DISTRICT') || AWARD_HAB_DL_DEFAULT.district,
      habHq: getConfigValue_('AWARD_HAB_DL_HQ') || AWARD_HAB_DL_DEFAULT.hq,
    },
  });
}
/** 民青局局長嘉許提名期死線（MM-DD）— /awards「年期設定」改 */
function saveAwardDeadlines_(token, cfg) {
  var t = requireCardEdit_(token, 'awards'); if (t.error) return err(t.error);
  cfg = cfg || {};
  var mmdd = function (v, fallback) {
    var s = String(v == null ? '' : v).trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) || s.match(/^(\d{1,2})-(\d{1,2})$/);
    if (!m) return fallback;
    var mm = Math.min(12, Math.max(1, Number(m[m.length - 2]))), dd = Math.min(31, Math.max(1, Number(m[m.length - 1])));
    return ('0' + mm).slice(-2) + '-' + ('0' + dd).slice(-2);
  };
  setConfigValue_('AWARD_HAB_DL_DISTRICT', mmdd(cfg.habDistrict, AWARD_HAB_DL_DEFAULT.district));
  setConfigValue_('AWARD_HAB_DL_HQ', mmdd(cfg.habHq, AWARD_HAB_DL_DEFAULT.hq));
  return ok({
    saved: true,
    deadlineCfg: {
      habDistrict: getConfigValue_('AWARD_HAB_DL_DISTRICT') || AWARD_HAB_DL_DEFAULT.district,
      habHq: getConfigValue_('AWARD_HAB_DL_HQ') || AWARD_HAB_DL_DEFAULT.hq,
    },
  });
}

/**
 * 寫入一位成員嘅欄位。
 * ⚠️ 只會寫「payload 有帶」嘅欄（新增時例外，會寫齊做預設值）——
 *    咁前端先可以做「淨係更新某個獎嘅年份」（例如頒完獎登記獲獎），唔會意外清走旅團／職位。
 */
function awardWriteFields_(sh, rowIdx, a, types, isNew) {
  var has = function (k) { return Object.prototype.hasOwnProperty.call(a, k); };
  setCellByHeader_(sh, rowIdx, 'name', String(a.name || '').trim());
  if (isNew || has('nameEn')) setCellByHeader_(sh, rowIdx, 'nameEn', String(a.nameEn || '').trim());
  if (isNew || has('troop')) setCellByHeader_(sh, rowIdx, 'troop', String(a.troop == null ? '' : a.troop).trim());
  if (isNew || has('position')) setCellByHeader_(sh, rowIdx, 'position', String(a.position || '').trim());
  if (isNew || has('serviceStart')) {
    setCellByHeader_(sh, rowIdx, 'serviceStart', awardServiceStart_(a.serviceStart));
  }
  if (isNew || has('status')) setCellByHeader_(sh, rowIdx, 'status', awardStatus_(a.status));
  if (isNew || has('note')) setCellByHeader_(sh, rowIdx, 'note', String(a.note || '').trim());
  var awards = a.awards || {};
  types.forEach(function (ty) {
    if (!Object.prototype.hasOwnProperty.call(awards, ty.code)) return;
    setCellByHeader_(sh, rowIdx, ty.code, awardYearCell_(awards[ty.code]));
  });
  setCellByHeader_(sh, rowIdx, 'updatedAt', new Date().toISOString());
}

/** 新增／更新一位成員（awards 卡片 edit 權限）；a.id 留空 = 新增 */
function saveAwardMember_(token, a) {
  var t = requireCardEdit_(token, 'awards'); if (t.error) return err(t.error);
  a = a || {};
  var name = String(a.name || '').trim();
  if (!name) return err('姓名必填');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.AWARDS);
  if (!sh) return err('尚未執行 setupSheets()（缺 Awards 表）');
  ensureAwardColumns_(ss);
  var types = awardTypes_();

  var id = String(a.id || '').trim();
  if (id) {
    var idx = rowIndexByCol_(sh, 'id', id);
    if (idx < 0) return err('找不到該成員');
    awardWriteFields_(sh, idx, a, types, false);
    return ok({ saved: true, id: id, created: false });
  }
  id = genId_('aw');
  var now = new Date().toISOString();
  var row = { id: id, districtCode: districtCode_(), createdAt: now, updatedAt: now };
  appendRowObj_(sh, row);
  var newIdx = rowIndexByCol_(sh, 'id', id);
  if (newIdx < 0) return err('寫入失敗');
  awardWriteFields_(sh, newIdx, a, types, true);
  return ok({ saved: true, id: id, created: true });
}

function deleteAwardMember_(token, id) {
  var t = requireCardEdit_(token, 'awards'); if (t.error) return err(t.error);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.AWARDS);
  if (!sh) return err('尚未執行 setupSheets()（缺 Awards 表）');
  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx < 0) return err('找不到該成員');
  sh.deleteRow(idx);
  return ok({ deleted: true, id: String(id).trim() });
}

/**
 * 批量匯入（由 Excel／Google Sheet 複製貼上）。
 * rows: [{ name, nameEn, troop, position, status, note, awards:{CODE:year} }]
 * mode: 'merge'（預設，同名同旅團就更新，其餘新增）／'replace'（清空重寫）
 */
function importAwardMembers_(token, rows, mode) {
  var t = requireCardEdit_(token, 'awards'); if (t.error) return err(t.error);
  if (!rows || !rows.length) return err('冇資料可匯入');
  if (rows.length > 2000) return err('一次最多匯入 2000 行');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.AWARDS);
  if (!sh) return err('尚未執行 setupSheets()（缺 Awards 表）');
  ensureAwardColumns_(ss);
  var types = awardTypes_();
  var replace = String(mode || 'merge') === 'replace';

  if (replace && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);

  var existing = {};
  if (!replace) {
    readSheet_(SHEET.AWARDS).forEach(function (r) {
      var key = String(r.name || '').trim() + '|' + String(r.troop == null ? '' : r.troop).trim();
      if (String(r.name || '').trim()) existing[key] = String(r.id || '').trim();
    });
  }

  var added = 0, updated = 0, skipped = 0;
  var now = new Date().toISOString();
  for (var i = 0; i < rows.length; i++) {
    var a = rows[i] || {};
    var name = String(a.name || '').trim();
    if (!name) { skipped++; continue; }
    var key = name + '|' + String(a.troop == null ? '' : a.troop).trim();
    var id = existing[key];
    if (id) {
      var idx = rowIndexByCol_(sh, 'id', id);
      if (idx < 0) { skipped++; continue; }
      awardWriteFields_(sh, idx, a, types, false);
      updated++;
    } else {
      var newId = genId_('aw');
      appendRowObj_(sh, { id: newId, districtCode: districtCode_(), createdAt: now, updatedAt: now });
      var ni = rowIndexByCol_(sh, 'id', newId);
      if (ni < 0) { skipped++; continue; }
      awardWriteFields_(sh, ni, a, types, true);
      existing[key] = newId;
      added++;
    }
  }
  return ok({ imported: true, added: added, updated: updated, skipped: skipped, mode: replace ? 'replace' : 'merge' });
}

/** 儲存獎項及年期設定（整張表覆寫）；新增獎項會自動補 Awards 欄 */
function saveAwardTypes_(token, types) {
  var t = requireCardEdit_(token, 'awards'); if (t.error) return err(t.error);
  if (!types || !types.length) return err('至少要有一個獎項');
  if (types.length > 60) return err('獎項最多 60 個');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.AWARD_TYPES);
  if (!sh) return err('尚未執行 setupSheets()（缺 AwardTypes 表）');

  var seen = {}, out = [];
  for (var i = 0; i < types.length; i++) {
    var ty = types[i] || {};
    var code = awardCode_(ty.code);
    if (!code) return err('第 ' + (i + 1) + ' 行：代號只可以用英文字母／數字／底線');
    if (seen[code]) return err('代號重複：' + code);
    seen[code] = true;
    var label = String(ty.label || '').trim();
    if (!label) return err(code + '：獎項名稱必填');
    var minYears = (ty.minYears === '' || ty.minYears === null || ty.minYears === undefined) ? '' : Math.max(0, Math.min(99, Number(ty.minYears) || 0));
    out.push([code, label, String(ty.short || '').trim(), String(ty.category || '其他').trim(),
      awardCode_(ty.prevCode), minYears, awardRound_(ty.round), String(ty.note || '').trim(),
      (ty.enabled === false || String(ty.enabled).toUpperCase() === 'FALSE') ? 'FALSE' : 'TRUE']);
  }
  // 上一級唔可以指向唔存在嘅代號（否則永遠計唔到夠期）
  for (var j = 0; j < out.length; j++) {
    if (out[j][4] && !seen[out[j][4]]) return err(out[j][0] + '：上一級代號「' + out[j][4] + '」唔存在');
    if (out[j][4] === out[j][0]) return err(out[j][0] + '：上一級唔可以係自己');
  }

  var header = ['code', 'label', 'short', 'category', 'prevCode', 'minYears', 'round', 'note', 'enabled'];
  sh.clear();
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#fde68a');
  sh.setFrozenRows(1);
  sh.getRange(2, 1, out.length, header.length).setValues(out);
  var addedCols = ensureAwardColumns_(ss);
  return ok({ saved: true, count: out.length, newColumns: addedCols });
}


// ===================== 旅團探訪 Visits（v4.8.1 → v4.10.0） =====================
// 區幹部落旅團探訪，喺 /visit 撳一下嗰個旅團格仔就登記低「邊個、幾時、探邊一旅邊個支部」。
// 幹部一入去預設只睇自己支部（跟角色：小童軍／幼童軍／童軍 ADC），要睇其他支部隨時切換。
// DC 出報告：揀「幾月到幾月」即刻有探訪 list，仲有邊個幹部探咗幾多次、探過邊啲旅。
// v4.10.0：Visits 表加咗總會匯報四欄（leaderMet 與旅領袖會面／method 探訪方式／
//          officerCount 區職員探訪人數／support 區已提供支援），前端可以直接生成
//          「區職員探訪區內旅團匯報」Excel 交總會；幹部努力統計照舊淨係內部睇。
//
// Units 表 = 全區旅團名單（旅號、主辦機構、各支部團數），預設跟港島地域官網筲箕灣區一覽表；
// 名單可以喺 app 內改（saveUnits），改完會順手同步 Config TROOP_LIST 畀「活動知會／聯結簿」用。

var VISIT_SECTIONS = ['gh', 'cub', 'scout', 'venture', 'rover'];
var VISIT_SECTION_LABEL = { gh: '小童軍', cub: '幼童軍', scout: '童軍', venture: '深資童軍', rover: '樂行童軍' };
// 角色 → 一入去預設睇邊個支部（其他角色 = 全部）
var VISIT_ROLE_SECTION = { ADC_GH: 'gh', ADC_CUBS: 'cub', ADC_SCOUT: 'scout' };
var VISIT_KINDS = ['general', 'inspection', 'meeting', 'section', 'event', 'other'];

function visitSection_(v) {
  var s = String(v || '').trim().toLowerCase();
  return VISIT_SECTIONS.indexOf(s) >= 0 ? s : '';
}
function visitKind_(v) {
  var s = String(v || '').trim().toLowerCase();
  return VISIT_KINDS.indexOf(s) >= 0 ? s : 'general';
}
/** Sheet 日期格可能係 Date → 一律 yyyy-MM-dd */
function visitDate_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (!m) return '';
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}
function visitToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function visitQuarter_(dateStr) {
  var d = visitDate_(dateStr);
  if (!d) return 0;
  var mo = Number(d.slice(5, 7));
  return mo ? Math.floor((mo - 1) / 3) + 1 : 0;
}
/** 登入者顯示名（Users 表 displayName，冇就用 email 前半） */
function visitorName_(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) return '';
  var hit = readSheet_(SHEET.USERS).filter(function (u) {
    return String(u.email || '').trim().toLowerCase() === e;
  })[0];
  var nm = hit ? String(hit.displayName || '').trim() : '';
  return nm || e.split('@')[0];
}

/** 內建旅團名單（港島地域官網「筲箕灣區」旅團一覽表，覆檢日期 2026-03-31）；喺 app 可改 */
function unitSeed_() {
  return [
    // troop, label, org, gh, cub, scout, venture, rover
    ['17',   '港島第17旅',   '慈幼中學', '', '1', '1', '1', ''],
    ['50',   '港島第50旅',   '聖馬可中學', '', '', '1', '1', '1'],
    ['81',   '港島第81旅',   '筲箕灣官立中學', '', '', '1', '1', ''],
    ['82',   '港島第82旅',   '香港小童群益會康山兒童中心', '1', '1', '1', '1', '1'],
    ['86',   '港島第86旅',   '愛秩序灣居民協會', '', '1', '1', '1', '1'],
    ['101',  '港島第101旅',  '筲箕灣東官立中學', '', '', '1+A1', '1+A1+S1', '1+A1'],
    ['114',  '港島第114旅',  '香港中國婦女會丘佐榮學校', '', '2', '', '', ''],
    ['180',  '港島第180旅',  '中華基督教會基灣小學', '', '1', '', '', ''],
    ['182',  '港島第182旅',  '香港中國婦女會中學', '', '', '1', '', ''],
    ['183',  '港島第183旅',  '中華基督教會基灣小學（愛蝶灣）', '1', '1', '', '', ''],
    ['196',  '港島第196旅',  '香港童軍總會港島第一九六旅（公開旅）', '1', '1', '1', '', ''],
    ['206',  '港島第206旅',  '太古城物業管理聯絡議會', '1', '1', '1', '1', ''],
    ['219',  '港島第219旅',  '太古小學', '', '1', '', '', ''],
    ['226',  '港島第226旅',  '佛教中華康山學校', '', '1', '', '', ''],
    ['227',  '港島第227旅',  '滬江小學', '', '1', '', '', ''],
    ['242',  '港島第242旅',  '香港中華基督教青年會康怡會所', '1', '2', '1', '1', '1'],
    ['255',  '港島第255旅',  '香港中華基督教青年會康怡會所', '1', '1', '1', '1', ''],
    ['257',  '港島第257旅',  '勵志會梁李秀娛紀念小學', '', '1', '', '', ''],
    ['1095', '港島第1095旅', '東區撲滅罪行委員會', '', '1', '2+S1', '2', '1'],
    ['1127', '港島第1127旅', '香港小童群益會筲箕灣兒童中心', '1', '1', '1', '', ''],
    ['1222', '港島第1222旅', '維多利亞幼稚園', '3', '', '', '', ''],
    ['1368', '港島第1368旅', '鯉景灣物業管理有限公司', '', '1', '', '', ''],
    ['1423', '港島第1423旅', '愛秩序灣官立小學', '', '1', '', '', ''],
    ['1544', '港島第1544旅', '基督教康山中英文幼稚園', '2', '', '', '', ''],
    ['1560', '港島第1560旅', '協康會賽馬會家長資源中心', '1', '1', '', '', ''],
    ['1682', '港島第1682旅', '康怡維多利亞幼稚園', '1', '', '', '', ''],
    ['1745', '港島第1745旅', '港島民生書院', '', '', '1', '', ''],
    ['1762', '港島第1762旅', '筲箕灣官立小學', '', '1', '', '', ''],
  ];
}
function unitRow_(r) {
  var sections = {};
  VISIT_SECTIONS.forEach(function (k) { sections[k] = String(r[k] == null ? '' : r[k]).trim(); });
  return {
    troop: String(r.troop == null ? '' : r.troop).trim(),
    label: String(r.label || '').trim() || ('港島第' + String(r.troop || '').trim() + '旅'),
    org: String(r.org || '').trim(),
    meetingTime: String(r.meetingTime || '').trim(),
    instagramUrl: String(r.instagramUrl || '').trim(),
    facebookUrl: String(r.facebookUrl || '').trim(),
    websiteUrl: String(r.websiteUrl || '').trim(),
    publicVisible: String(r.publicVisible).toUpperCase() !== 'FALSE',
    sections: sections,
    active: String(r.active).toUpperCase() !== 'FALSE',
    note: String(r.note || '').trim(),
  };
}
/** 全區旅團名單；Units 表未有資料就用內建 seed */
function visitUnits_() {
  var rows = readSheet_(SHEET.UNITS).map(unitRow_).filter(function (u) { return !!u.troop; });
  if (rows.length) return rows;
  return unitSeed_().map(function (a) {
    var sections = {};
    VISIT_SECTIONS.forEach(function (k, i) { sections[k] = a[3 + i]; });
    return { troop: a[0], label: a[1], org: a[2], meetingTime: '', instagramUrl: '', facebookUrl: '', websiteUrl: '', publicVisible: true, sections: sections, active: true, note: '' };
  });
}

// ===================== 旅→團階層名錄（v4.29.0：UnitSections 表） =====================
// 架構：Units 表維護「旅」層級（旅號／主辦／五支部團數字串）；UnitSections 表維護「團」層級
// （每個支部單位一列：集會時間／地點／社交帳戶）。未維護團資料時按團數字串自動產骨架，
// 公開名錄永遠有結構、詳情空白由前端回落旅層級資料。

var UNIT_SECTION_HEADER = ['troop', 'section', 'unitCode', 'meetingTime', 'location',
  'instagramUrl', 'facebookUrl', 'websiteUrl', 'active', 'publicVisible'];

/**
 * 拆團數字串（Units 表 gh/cub/scout/venture/rover 欄）→ 團代號陣列。
 * '1+A1' → ['', 'A1']（''＝常規團）；'2' → ['', '']；'1+A1+S1' → ['', 'A1', 'S1']。
 * 純數字＝常規團數目（每支部 cap 9）；A／S 前綴＝空／海童軍團變體；無法辨識嘅部份丟棄。
 */
function parseSectionCount_(text) {
  var tokens = String(text == null ? '' : text).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  var regular = 0, variants = [], seen = {};
  tokens.forEach(function (tk) {
    var plain = tk.match(/^(\d{1,2})$/);
    if (plain) {
      regular += Math.min(parseInt(plain[1], 10), 9);
      return;
    }
    var variant = tk.match(/^([AS])(\d{1,2})$/);
    if (variant && !seen[tk]) { seen[tk] = true; variants.push(tk); }
  });
  var out = [];
  var i;
  for (i = 0; i < Math.min(regular, 9); i++) out.push('');
  for (i = 0; i < variants.length && out.length < 9; i++) out.push(variants[i]);
  return out;
}

/** 團嘅公開顯示名：常規團＝支部名＋團（童軍團）；A 前綴＝空童軍團；S 前綴＝海童軍團。 */
function publicUnitLabel_(section, unitCode) {
  var base = VISIT_SECTION_LABEL[section] || '';
  var code = String(unitCode == null ? '' : unitCode).trim().toUpperCase();
  if (!base) return '';
  if (!code) return base + '團';
  if (code.charAt(0) === 'A') return '空' + base + '團';
  if (code.charAt(0) === 'S') return '海' + base + '團';
  return base + '團';
}

/** UnitSections 表一列 → 結構化列（內部 active/publicVisible 保留俾管理端，公開端另做過濾）。 */
function unitSectionRow_(r) {
  return {
    troop: String(r.troop == null ? '' : r.troop).trim(),
    section: visitSection_(r.section),
    unitCode: String(r.unitCode == null ? '' : r.unitCode).trim().toUpperCase(),
    meetingTime: String(r.meetingTime || '').trim(),
    location: String(r.location || '').trim(),
    instagramUrl: String(r.instagramUrl || '').trim(),
    facebookUrl: String(r.facebookUrl || '').trim(),
    websiteUrl: String(r.websiteUrl || '').trim(),
    active: String(r.active).toUpperCase() !== 'FALSE',
    publicVisible: String(r.publicVisible).toUpperCase() !== 'FALSE',
  };
}

/** 讀 UnitSections 全部列（管理端用；含停用／非公開，過濾唔成列嘅壞 row）。 */
function readUnitSections_() {
  return readSheet_(SHEET.UNIT_SECTIONS).map(unitSectionRow_).filter(function (u) {
    return u.troop && u.section;
  });
}

/**
 * 一個旅嘅公開團列表（8 個公開欄位，無 note／active／publicVisible）。
 * UnitSections 有該旅嘅啟用＋公開列 → 用維護資料；否則按 Units 團數字串自動產骨架（詳情空白）。
 */
function publicTroopUnits_(troopRow) {
  var maintained = readUnitSections_().filter(function (u) {
    return u.troop === troopRow.troop && u.active && u.publicVisible;
  });
  if (maintained.length) {
    return maintained.map(function (u) {
      return {
        section: u.section,
        unitCode: u.unitCode || '',
        label: publicUnitLabel_(u.section, u.unitCode),
        meetingTime: u.meetingTime || '',
        location: u.location || '',
        instagramUrl: u.instagramUrl || '',
        facebookUrl: u.facebookUrl || '',
        websiteUrl: u.websiteUrl || '',
      };
    });
  }
  var out = [];
  VISIT_SECTIONS.forEach(function (sec) {
    parseSectionCount_(troopRow.sections[sec]).forEach(function (code) {
      out.push({
        section: sec,
        unitCode: code,
        label: publicUnitLabel_(sec, code),
        meetingTime: '', location: '', instagramUrl: '', facebookUrl: '', websiteUrl: '',
      });
    });
  });
  return out;
}

/** 成員系統公開名錄：旅層級 7 欄＋五支部團數＋各團公開列表；空值保留空字串，由前端隱藏欄位。 */
function listDistrictTroops_() {
  var troops = visitUnits_().filter(function (u) { return u.active && u.publicVisible; }).map(function (u) {
    var sectionCounts = {};
    VISIT_SECTIONS.forEach(function (k) {
      var count = String(u.sections[k] == null ? '' : u.sections[k]).trim();
      if (count) sectionCounts[k] = count;
    });
    return {
      troop: u.troop,
      label: u.label,
      organizer: u.org,
      meetingTime: u.meetingTime || '',
      instagramUrl: u.instagramUrl || '',
      facebookUrl: u.facebookUrl || '',
      websiteUrl: u.websiteUrl || '',
      sectionCounts: sectionCounts,
      units: publicTroopUnits_(u),
    };
  });
  return ok({ districtCode: districtCode_(), districtName: getConfigValue_('districtName') || '', troops: troops });
}

/**
 * 整份覆寫 UnitSections 表（同 saveUnits 一樣嘅全表重寫模式）。
 * 需要 visit 卡 edit 權限；dup key＝troop|section|unitCode；網址同團代號伺服器端驗證。
 * 傳空陣列＝清空維護資料，公開名錄回落自動骨架。
 */
function saveUnitSections_(token, rows) {
  var t = requireCardEdit_(token, 'visit'); if (t.error) return err(t.error);
  if (!Array.isArray(rows)) return err('支部團資料格式錯誤');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.UNIT_SECTIONS);
  if (!sh) return err('尚未執行 setupSheets()（缺 UnitSections 表）');

  var seen = {}, out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    var troop = String(r.troop == null ? '' : r.troop).trim();
    var section = visitSection_(r.section);
    if (!troop || !section) continue;
    var unitCode = String(r.unitCode == null ? '' : r.unitCode).trim().toUpperCase();
    if (unitCode && !/^[AS]\d{1,2}$/.test(unitCode)) {
      return err('旅團 ' + troop + ' 嘅團代號格式錯誤（應為 A1／S1 呢類，常規團留空）');
    }
    var key = troop + '|' + section + '|' + unitCode;
    if (seen[key]) {
      return err('支部團資料重複：' + troop + ' ' + VISIT_SECTION_LABEL[section] + ' ' + (unitCode || '常規團'));
    }
    seen[key] = true;
    var instagramUrl = validPublicUnitUrl_(r.instagramUrl);
    var facebookUrl = validPublicUnitUrl_(r.facebookUrl);
    var websiteUrl = validPublicUnitUrl_(r.websiteUrl);
    if (instagramUrl === null) return err('旅團 ' + troop + ' 的 Instagram 網址必須以 http:// 或 https:// 開頭，且不可含空白');
    if (facebookUrl === null) return err('旅團 ' + troop + ' 的 Facebook 網址必須以 http:// 或 https:// 開頭，且不可含空白');
    if (websiteUrl === null) return err('旅團 ' + troop + ' 的網頁網址必須以 http:// 或 https:// 開頭，且不可含空白');
    var meetingTime = String(r.meetingTime || '').trim().slice(0, 200);
    var location = String(r.location || '').trim().slice(0, 200);
    out.push([
      troop, section, unitCode, meetingTime, location,
      instagramUrl || '', facebookUrl || '', websiteUrl || '',
      r.active === false ? 'FALSE' : 'TRUE',
      r.publicVisible === false ? 'FALSE' : 'TRUE',
    ]);
  }

  sh.clear();
  sh.getRange(1, 1, 1, UNIT_SECTION_HEADER.length).setValues([UNIT_SECTION_HEADER]);
  sh.getRange(1, 1, 1, UNIT_SECTION_HEADER.length).setFontWeight('bold').setBackground('#bbf7d0');
  sh.setFrozenRows(1);
  if (out.length) sh.getRange(2, 1, out.length, UNIT_SECTION_HEADER.length).setValues(out);
  return ok({ saved: true, count: out.length });
}
function validPublicUnitUrl_(value) {
  var url = String(value == null ? '' : value).trim();
  if (!url) return '';
  return url.length <= 500 && /^https?:\/\/[^\s]+$/i.test(url) ? url : null;
}

function visitRow_(r) {
  var date = visitDate_(r.visitDate);
  return {
    id: String(r.id || '').trim(),
    districtCode: String(r.districtCode || '').trim() || districtCode_(),
    troop: String(r.troop == null ? '' : r.troop).trim(),
    section: visitSection_(r.section),
    visitDate: date,
    year: date ? Number(date.slice(0, 4)) : 0,
    quarter: visitQuarter_(date),
    kind: visitKind_(r.kind),
    visitorName: String(r.visitorName || '').trim(),
    visitorEmail: String(r.visitorEmail || '').trim(),
    note: String(r.note == null ? '' : r.note).trim(),
    followUp: String(r.followUp == null ? '' : r.followUp).trim(),
    // ── 總會匯報欄（v4.10.0）；舊表未補欄時 r 冧呢啟 key，會係空字串 ──
    leaderMet: String(r.leaderMet == null ? '' : r.leaderMet).trim(),
    method: String(r.method == null ? '' : r.method).trim(),
    officerCount: Number(r.officerCount) > 0 ? Math.floor(Number(r.officerCount)) : '',
    support: String(r.support == null ? '' : r.support).trim(),
    createdAt: String(r.createdAt || ''),
    updatedAt: String(r.updatedAt || r.createdAt || ''),
  };
}

/**
 * 一次過攢：旅團名單（連支部）＋ 探訪記錄。
 * from / to = yyyy-MM-dd（留空 = 今年 1 月 1 日至 12 月 31 日）。
 */
function getVisitBoard_(token, from, to) {
  var t = requireLogin_(token); if (t.error) return err(t.error);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SHEET.VISITS)) return err('尚未執行 setupSheets()（缺 Visits 表）');
  var today = visitToday_();
  var f = visitDate_(from) || (today.slice(0, 4) + '-01-01');
  var tt = visitDate_(to) || (today.slice(0, 4) + '-12-31');
  if (f > tt) { var tmp = f; f = tt; tt = tmp; }

  var unitSheet = ss.getSheetByName(SHEET.UNITS);
  var unitHeaders = unitSheet ? sheetHeadersBySheet_(unitSheet) : [];
  var publicTroopFieldsReady = ['meetingTime', 'instagramUrl', 'facebookUrl', 'websiteUrl', 'publicVisible'].every(function (h) {
    return unitHeaders.indexOf(h) >= 0;
  });
  // v4.29.0：UnitSections 表存在先開放團層級編輯器；未補建時管理端只顯示提示。
  var unitSectionsReady = !!ss.getSheetByName(SHEET.UNIT_SECTIONS);
  var unitSections = unitSectionsReady ? readUnitSections_() : [];
  var all = readSheet_(SHEET.VISITS).map(visitRow_).filter(function (v) { return !!v.troop && !!v.visitDate; });
  var visits = all.filter(function (v) { return v.visitDate >= f && v.visitDate <= tt; });
  visits.sort(function (a, b) { return a.visitDate < b.visitDate ? 1 : a.visitDate > b.visitDate ? -1 : 0; });

  var years = {};
  all.forEach(function (v) { if (v.year) years[v.year] = true; });
  years[Number(today.slice(0, 4))] = true;

  var role = String(t.role || '').trim();
  return ok({
    from: f, to: tt, today: today,
    districtName: getConfigValue_('districtName') || '',
    units: visitUnits_(),
    publicTroopFieldsReady: publicTroopFieldsReady,
    unitSectionsReady: unitSectionsReady,
    unitSections: unitSections,
    visits: visits,
    years: Object.keys(years).map(Number).sort(function (a, b) { return b - a; }),
    sections: VISIT_SECTIONS.map(function (k) { return { key: k, label: VISIT_SECTION_LABEL[k] }; }),
    me: {
      email: t.email, role: role,
      name: visitorName_(t.email),
      defaultSection: VISIT_ROLE_SECTION[role] || '',
    },
  });
}

/** 登記一次探訪（visit.id 留空 = 新增）；只寫 payload 有帶嘅欄 */
function saveVisit_(token, v) {
  var t = requireCardEdit_(token, 'visit'); if (t.error) return err(t.error);
  v = v || {};
  var troop = String(v.troop == null ? '' : v.troop).trim();
  if (!troop) return err('請揀旅團');
  var date = visitDate_(v.visitDate) || visitToday_();
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VISITS);
  if (!sh) return err('尚未執行 setupSheets()（缺 Visits 表）');

  var id = String(v.id || '').trim();
  var now = new Date().toISOString();
  var who = String(v.visitorName == null ? '' : v.visitorName).trim() || visitorName_(t.email);
  var mail = String(v.visitorEmail || '').trim() || t.email;

  // 一日一個旅一次：同一日、同一個旅、同一位幹部，唔會有兩筆（改緊嗰筆唔計）
  var dup = readSheet_(SHEET.VISITS).map(visitRow_).filter(function (o) {
    if (!o || String(o.id) === id) return false;
    if (String(o.troop).trim() !== troop || o.visitDate !== date) return false;
    var sameMail = mail && o.visitorEmail && String(o.visitorEmail).trim().toLowerCase() === String(mail).toLowerCase();
    var sameName = who && o.visitorName && String(o.visitorName).trim() === who;
    return sameMail || sameName;
  });
  if (dup.length) {
    return err(troop + ' 旅喺 ' + date + ' 已經登記咗（' + (dup[0].visitorName || who) + '）—— 同一日唔使登記兩次');
  }

  if (!id) {
    id = genId_('vs');
    appendRowObj_(sh, {
      id: id, districtCode: districtCode_(),
      visitorEmail: mail,
      visitorName: who,
      createdAt: now,
    });
  }
  var idx = rowIndexByCol_(sh, 'id', id);
  if (idx < 0) return err('找不到該探訪記錄');
  var has = function (k) { return Object.prototype.hasOwnProperty.call(v, k); };
  setCellByHeader_(sh, idx, 'troop', troop);
  setCellByHeader_(sh, idx, 'visitDate', date);
  setCellByHeader_(sh, idx, 'quarter', visitQuarter_(date));
  if (has('section')) setCellByHeader_(sh, idx, 'section', visitSection_(v.section));
  if (has('kind')) setCellByHeader_(sh, idx, 'kind', visitKind_(v.kind));
  if (has('note')) setCellByHeader_(sh, idx, 'note', String(v.note == null ? '' : v.note).trim());
  if (has('followUp')) setCellByHeader_(sh, idx, 'followUp', String(v.followUp == null ? '' : v.followUp).trim());
  // ── 總會匯報欄（v4.10.0）；舊後台冇呢啲欄會自動跳過，唔會報錯 ──
  if (has('leaderMet')) setCellByHeader_(sh, idx, 'leaderMet', String(v.leaderMet == null ? '' : v.leaderMet).trim());
  if (has('method')) setCellByHeader_(sh, idx, 'method', String(v.method == null ? '' : v.method).trim());
  if (has('officerCount')) {
    var oc = Number(v.officerCount);
    setCellByHeader_(sh, idx, 'officerCount', oc > 0 ? Math.floor(oc) : '');
  }
  if (has('support')) setCellByHeader_(sh, idx, 'support', String(v.support == null ? '' : v.support).trim());
  if (has('visitorName') && String(v.visitorName || '').trim()) {
    setCellByHeader_(sh, idx, 'visitorName', String(v.visitorName).trim());
  }
  setCellByHeader_(sh, idx, 'updatedAt', now);
  return ok({ saved: true, id: id, troop: troop, section: visitSection_(v.section), visitDate: date });
}

function deleteVisit_(token, id) {
  var t = requireCardEdit_(token, 'visit'); if (t.error) return err(t.error);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.VISITS);
  if (!sh) return err('尚未執行 setupSheets()（缺 Visits 表）');
  var idx = rowIndexByCol_(sh, 'id', String(id).trim());
  if (idx < 0) return err('找不到該探訪記錄');
  sh.deleteRow(idx);
  return ok({ deleted: true, id: String(id).trim() });
}

/** 更新全區旅團名單（整份覆寫 Units 表）；順手同步 Config TROOP_LIST */
function saveUnits_(token, units) {
  var t = requireCardEdit_(token, 'visit'); if (t.error) return err(t.error);
  if (!units || !units.length) return err('旅團名單唔可以空');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.UNITS);
  if (!sh) return err('尚未執行 setupSheets()（缺 Units 表）');

  var seen = {}, out = [], troops = [];
  for (var i = 0; i < units.length; i++) {
    var u = units[i] || {};
    var troop = String(u.troop == null ? '' : u.troop).trim();
    if (!troop) continue;
    if (seen[troop]) return err('旅號重複：' + troop);
    seen[troop] = true;
    var sec = u.sections || {};
    var instagramUrl = validPublicUnitUrl_(u.instagramUrl);
    var facebookUrl = validPublicUnitUrl_(u.facebookUrl);
    var websiteUrl = validPublicUnitUrl_(u.websiteUrl);
    if (instagramUrl === null) return err('旅團 ' + troop + ' 的 Instagram 網址必須以 http:// 或 https:// 開頭，且不可含空白');
    if (facebookUrl === null) return err('旅團 ' + troop + ' 的 Facebook 網址必須以 http:// 或 https:// 開頭，且不可含空白');
    if (websiteUrl === null) return err('旅團 ' + troop + ' 的網頁網址必須以 http:// 或 https:// 開頭，且不可含空白');
    var meetingTime = String(u.meetingTime || '').trim();
    if (meetingTime.length > 200) return err('旅團 ' + troop + ' 的集會時間最多 200 字');
    var row = [
      troop,
      String(u.label || '').trim() || ('港島第' + troop + '旅'),
      String(u.org || '').trim(),
    ];
    VISIT_SECTIONS.forEach(function (k) { row.push(String(sec[k] == null ? '' : sec[k]).trim()); });
    row.push(u.active === false ? 'FALSE' : 'TRUE');
    row.push(String(u.note || '').trim());
    row.push(meetingTime, instagramUrl, facebookUrl, websiteUrl, u.publicVisible === false ? 'FALSE' : 'TRUE');
    out.push(row);
    troops.push(troop);
  }
  if (!out.length) return err('旅團名單唔可以空');

  var header = ['troop', 'label', 'org'].concat(VISIT_SECTIONS).concat(['active', 'note', 'meetingTime', 'instagramUrl', 'facebookUrl', 'websiteUrl', 'publicVisible']);
  sh.clear();
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#bbf7d0');
  sh.setFrozenRows(1);
  sh.getRange(2, 1, out.length, header.length).setValues(out);
  setConfigValue_('TROOP_LIST', troops.join(','));
  return ok({ saved: true, count: out.length });
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
  var t = checkToken_(token); if (!t.valid) return err('登入已過期');
  var hasCardRow = !!readPerms_().incident;
  var allowed = hasCardRow ? (cardAccessOf_(t, 'incident') === 'edit') : staffPerms_(t.email, t.role).canVenue;
  if (!allowed) return err('你沒有此功能嘅權限');
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
  var t = checkToken_(token); if (!t.valid) return err('登入已過期');
  var hasCardRow = !!readPerms_().incident;
  var allowed = hasCardRow ? (cardAccessOf_(t, 'incident') === 'edit') : staffPerms_(t.email, t.role).canVenue;
  if (!allowed) return err('你沒有此功能嘅權限');
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
    // v4.16.0 通告全文欄：班領導人／服裝／備註／報名辦法／費用全文（成員系統顯示）
    leader: String(r.leader || '').trim(),
    uniform: String(r.uniform || '').trim(),
    remarks: String(r.remarks || '').trim(),
    signupText: String(r.signupText || '').trim(),
    feeNote: String(r.feeNote || '').trim(),
    // 成員系統 proxy 嘅 publicCourse 會讀 active 再過濾，所以公開版都要回（listCourseLinks_ 本身已隔走 FALSE）
    active: String(r.active).toUpperCase() !== 'FALSE',
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
  var t = requirePermRead_(token, 'canCourse', 'training'); if (t.error) return err(t.error);
  return ok(readSheet_(SHEET.COURSE_LINKS).map(function (r) {
    var o = courseLinkPublic_(r);
    o.scriptExecUrl = courseExecUrl_(r);
    o.scriptApiKey  = courseApiKey_(r);
    o.driveFolderId = r.driveFolderId || '';
    o.sheetId = r.sheetId || '';                       // v4.14.0 新制直入：後端班 Sheet ID
    o.hasSetup = !!String(r.setupJson || '').trim();   // 有冇儲存過直入設定（JSON 本體用 getCourseSetup 攞）
    // v4.17.0 新版流程：GS 網址＋批核狀態＋修訂清單（revisions = JSON 字串，前端 parse）
    o.gsUrl = String(r.gsUrl || '').trim();
    o.approval = String(r.approval || '').trim();
    o.approvedAt = String(r.approvedAt || '').trim();
    o.approvedBy = String(r.approvedBy || '').trim();
    o.revisions = String(r.revisions || '').trim();
    o.regNotices = String(r.regNotices || '').trim();   // v4.17.1 收生通知紀錄（JSON 字串，前端 parse）
    o.publicCourseId = String(r.publicCourseId || '').trim();  // v6.2.1：公開課程ID（hub 公開報名／opsKey 舊路用）
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
    // v4.16.0 通告全文欄（由「📥 由通告網址讀取」帶入）
    leader: link.leader || '', uniform: link.uniform || '',
    remarks: link.remarks || '', signupText: link.signupText || '', feeNote: link.feeNote || '',
    scriptExecUrl: execUrl, scriptApiKey: apiKey,
    apiBase: execUrl, apiKey: apiKey,           // 同步舊欄位，兩邊前端都讀到
    driveFolderId: link.driveFolderId || '',
    active: link.active === undefined || link.active ? 'TRUE' : 'FALSE',
  };

  // 每班收費 FPS QR（v4.3.0）：前端只會喺「儲存 QR」時帶 fpsQrPayload；
  // 舊前端／未帶欄位時唔掂已儲存嘅 QR（undefined = 保留），帶空字串 = 移除。
  // v4.14.0 新制直入：後端 Sheet ID＋設定 JSON（undefined = 保留；空字串 = 清除）
  if (link.sheetId !== undefined) row.sheetId = String(link.sheetId || '').trim();
  if (link.setupJson !== undefined) row.setupJson = String(link.setupJson || '');
  // v4.17.0 新版流程：GS 網址＋批核狀態＋修訂清單（revisions 由 saveCourseApproval_ 維護，
  //  呢度 undefined = 保留；saveCourseLink 明確帶先寫——避免普通儲存洗走修訂紀錄）
  if (link.gsUrl !== undefined) row.gsUrl = String(link.gsUrl || '').trim();
  if (link.approval !== undefined) row.approval = String(link.approval || '').trim();
  if (link.approvedAt !== undefined) row.approvedAt = String(link.approvedAt || '').trim();
  if (link.approvedBy !== undefined) row.approvedBy = String(link.approvedBy || '').trim();
  if (link.revisions !== undefined) row.revisions = String(link.revisions || '').trim();
  if (link.regNotices !== undefined) row.regNotices = String(link.regNotices || '').trim();   // v4.17.1
  if (link.publicCourseId !== undefined) row.publicCourseId = String(link.publicCourseId || '').trim();   // v6.2.1

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

/**
 * 由訓練班專屬 Sheet 經其收表 Script 讀 course profile（開班自動填表用）。
 * b: { courseId }（用已存嘅 scriptExecUrl／scriptApiKey）或直接 { scriptExecUrl, scriptApiKey }。
 * 對應訓練班 Script action=getCourseProfile（見 gs/Code.gs.course.js）。
 */
function pullCourseProfile_(token, b) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  b = b || {};
  var link = null;
  if (b.scriptExecUrl || b.apiBase || b.scriptApiKey || b.apiKey) {
    link = {
      courseId: b.courseId || '', title: '',
      scriptExecUrl: String(b.scriptExecUrl || b.apiBase || '').trim(),
      scriptApiKey: String(b.scriptApiKey || b.apiKey || '').trim(),
      gsUrl: String(b.gsUrl || '').trim(), publicCourseId: String(b.publicCourseId || '').trim(),
    };
  } else if (b.courseId) {
    link = courseLinkById_(b.courseId);
  }
  if (!link) return err('缺少訓練班連線資料（courseId 或 scriptExecUrl）');
  var tgt = courseTarget_(link, { action: 'getCourseProfile' });
  if (tgt.error) return err(tgt.error);
  try {
    var resp = UrlFetchApp.fetch(tgt.execUrl, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(tgt.payload),
      muteHttpExceptions: true,
    });
    var r = {};
    try { r = JSON.parse(resp.getContentText()); } catch (e) { r = {}; }
    if (!r.ok) return err((r && r.error) || '讀取訓練班資料失敗（HTTP ' + resp.getResponseCode() + '）');
    return ok(r.data || {});
  } catch (e) { return err('讀取訓練班資料失敗：' + e); }
}

// ===================== 新制直入：自動建班 Sheet＋雙向同步（v4.14.0） =====================
// ADC 喺區系統填成份開班設定 → 區後台由總模版複製班 Sheet＋寫入 → 之後雙向同步＋網頁列印。
// 總模版：開一張空白 Sheet 跑一次訓練班模版 setupCourseSheet()，將試算表 ID 填入 Config
// COURSE_TEMPLATE_ID（新班放邊個 Drive 資料夾：COURSE_FOLDER_ID，留空 = 根目錄）。
// 複製出嚟嘅表自帶收表 Script 碼（同帳戶），要收報名嗰陣部署一次就得；ADC 呢邊讀寫
// 唔經 /exec，直接 openById（快＋唔使部署）。人手舊班（冇 sheetId）只讀唔寫。

/** 搵 CourseLink（by courseId） */
function courseLinkById_(courseId) {
  return readSheet_(SHEET.COURSE_LINKS).filter(function (x) {
    return String(x.courseId || '').trim() === String(courseId || '').trim();
  })[0] || null;
}

/** 將 SetupCell[] 寫入指定試算表（tab／row／col 逐格寫；冇嗰頁就 skip） */
function applySetupCells_(ss, cells) {
  var applied = 0, skipped = [];
  (cells || []).forEach(function (c) {
    if (!c || !c.tab || !c.row || !c.col) return;
    var sh = ss.getSheetByName(String(c.tab));
    if (!sh) { if (skipped.indexOf(c.tab) < 0) skipped.push(c.tab); return; }
    sh.getRange(Number(c.row), Number(c.col)).setValue(c.value === undefined ? '' : c.value);
    applied++;
  });
  return { applied: applied, skippedTabs: skipped };
}

/**
 * 自動建班 Sheet：由總模版複製 → 寫入設定 →（選填）分享畀 CL → 開班登記。
 * b: { link, setup, cells, clEmail }（link = CourseLink 摘要，前端由設定計好）
 */
function createCourseSheet_(token, b) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  b = b || {};
  var setup = b.setup || {};
  var title = String(setup.courseName || (b.link || {}).title || '').trim();
  if (!title) return err('課程名稱（courseName）必填');
  var templateId = String(getConfigValue_('COURSE_TEMPLATE_ID') || '').trim();
  if (!templateId) return err('未設定訓練班總模版：請開一張空白 Google Sheet 跑一次訓練班模版 setupCourseSheet()，再將試算表 ID 填入 Config COURSE_TEMPLATE_ID');
  var folder = null;
  var folderId = String(getConfigValue_('COURSE_FOLDER_ID') || '').trim();
  try {
    if (folderId) folder = DriveApp.getFolderById(folderId);
  } catch (e) { folder = null; }
  var copy;
  try {
    copy = folder
      ? DriveApp.getFileById(templateId).makeCopy('【訓練班】' + title, folder)
      : DriveApp.getFileById(templateId).makeCopy('【訓練班】' + title);
  } catch (e) { return err('複製總模版失敗：' + e + '（請檢查 COURSE_TEMPLATE_ID／COURSE_FOLDER_ID）'); }
  var sheetId = copy.getId();
  var applied = { applied: 0, skippedTabs: [] };
  try {
    applied = applySetupCells_(SpreadsheetApp.openById(sheetId), b.cells || []);
  } catch (e) { return err('寫入班 Sheet 失敗：' + e); }
  // 分享畀班領導人（失敗唔阻住開班，只係回 warning）
  var shareWarning = '';
  var clEmail = String(b.clEmail || setup.clEmail || '').trim();
  if (clEmail) {
    try { copy.addEditor(clEmail); }
    catch (e) { shareWarning = '自動分享畀 ' + clEmail + ' 失敗（請人手分享）：' + e; }
  }
  // 開班登記（沿用 saveCourseLink_，加 sheetId＋setupJson）
  var link = b.link || {};
  link.title = link.title || title;
  link.courseId = String(link.courseId || setup.courseId || '').trim();
  link.sheetId = sheetId;
  link.setupJson = JSON.stringify(setup);
  var saved = saveCourseLink_(token, link);
  if (!saved.ok) return err('班 Sheet 已建立（' + sheetId + '），但開班登記失敗：' + saved.error + '（請人手喺訓練班管理補登記＋貼上 Sheet ID）');
  return ok({
    created: true, courseId: (saved.data && saved.data.courseId) || link.courseId, sheetId: sheetId,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/' + sheetId,
    cellsApplied: applied.applied, skippedTabs: applied.skippedTabs,
    sharedTo: shareWarning ? '' : clEmail, shareWarning: shareWarning,
  });
}

/**
 * 推送設定：將區系統嘅設定寫返入班 Sheet（direct openById，唔經 /exec）。
 * b: { courseId, setup, cells }。只限自動建嘅班（有 sheetId）。
 */
/** 班 Sheet 版本號 bump（同訓練班 Script _Sync 同一格：A1 rev／B1 savedAt／C1 by）。
 *  區系統推送都要 bump，等職員前端知有人改過（讀返嚟嘅 rev 對唔上就會 conflict）。 */
function bumpCourseRev_(ss, by) {
  var sh = ss.getSheetByName('_Sync');
  if (!sh) { sh = ss.insertSheet('_Sync'); try { sh.hideSheet(); } catch (e) {} }
  var rev = 0;
  try { rev = Number((sh.getDataRange().getValues()[0] || [])[0]) || 0; } catch (e) { rev = 0; }
  rev++;
  var at = new Date().toISOString();
  sh.getRange(1, 1).setValue(rev);
  sh.getRange(1, 2).setValue(at);
  sh.getRange(1, 3).setValue(String(by || ''));
  return { rev: rev, savedAt: at };
}

function pushCourseSetup_(token, b) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  b = b || {};
  var link = courseLinkById_(b.courseId);
  if (!link) return err('找不到此訓練班（courseId）');
  var sheetId = String(link.sheetId || '').trim();
  if (!sheetId) return err('呢班係人手建表，冇後端 Sheet ID（新制推送只限區系統自動建嘅班）');
  var applied, css;
  try {
    css = SpreadsheetApp.openById(sheetId);
    applied = applySetupCells_(css, b.cells || []);
  } catch (e) { return err('寫入班 Sheet 失敗：' + e); }
  var revInfo = { rev: -1, savedAt: '' };
  try { revInfo = bumpCourseRev_(css, '區系統'); } catch (e) { revInfo = { rev: -1, savedAt: '' }; }
  if (b.setup) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.COURSE_LINKS);
    var idx = rowIndexByCol_(sh, 'courseId', String(b.courseId).trim());
    if (idx > 0) setCellByHeader_(sh, idx, 'setupJson', JSON.stringify(b.setup));
  }
  return ok({ pushed: true, courseId: String(b.courseId).trim(), sheetId: sheetId, cellsApplied: applied.applied, skippedTabs: applied.skippedTabs, rev: revInfo.rev });
}

/** 由試算表 ID 直接 dump 成份 raw（同訓練班 Script getCourseSheetRaw 同一形狀） */
function dumpCourseSheetRaw_(ss) {
  var dump = function (name) {
    var sh = ss.getSheetByName(name);
    return sh ? sh.getDataRange().getValues() : [];
  };
  var pw = [];
  var ps = ss.getSheetByName('參數');
  if (ps) { try { pw = ps.getRange('W1:X5').getValues(); } catch (e) { pw = []; } }
  var rev = 0, revSavedAt = '', revBy = '';
  try {
    var sync = ss.getSheetByName('_Sync');
    if (sync) {
      var sv = sync.getDataRange().getValues();
      if (sv && sv[0]) { rev = Number(sv[0][0]) || 0; revSavedAt = String(sv[0][1] || ''); revBy = String(sv[0][2] || ''); }
    }
  } catch (e) {}
  return {
    input01: dump('Input01 訓練班預算'), input02: dump('Input02 訓練班資料'),
    input03: dump('Input03 時間表'), input04: dump('Input04_Print支出表'),
    resp: dump('表格回應'), paramsWX: pw,
    notice: dump('Print_通告'), accept: dump('Print_接納通知書'),
    finance: dump('Print_財政預算'), completion: dump('Print_訓練班完成報告'),
    cert: dump('Print_領取證書紀錄'), subsidy: dump('Print_總會資助計劃'),
    pulledAt: new Date().toISOString(),
    rev: rev, revSavedAt: revSavedAt, revBy: revBy,
  };
}

/**
 * 讀返班 Sheet 全文：有 /exec 就經訓練班 Script，冇就 direct openById。
 * b: { courseId } 或直接 { scriptExecUrl, scriptApiKey }。
 */
function pullCourseSheetRaw_(token, b) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  b = b || {};
  var execUrl = String(b.scriptExecUrl || b.apiBase || '').trim();
  // 注意：唔可以 fallback 用 b.apiKey（嗰個係區後台 key，唔係班 Script 嘅 key）
  var apiKey = String(b.scriptApiKey || '').trim();
  var sheetId = '';
  if ((!execUrl || !apiKey) && b.courseId) {
    var link = courseLinkById_(b.courseId);
    if (link) {
      if (!execUrl) execUrl = courseExecUrl_(link);
      if (!apiKey) apiKey = courseApiKey_(link) || String(b.apiKey || '').trim();
      sheetId = String(link.sheetId || '').trim();
    }
  }
  if (execUrl) {
    try {
      var resp = UrlFetchApp.fetch(execUrl, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ action: 'getCourseSheetRaw', apiKey: apiKey }),
        muteHttpExceptions: true,
      });
      var r = {};
      try { r = JSON.parse(resp.getContentText()); } catch (e) { r = {}; }
      if (!r.ok) return err((r && r.error) || '讀取班 Sheet 失敗（HTTP ' + resp.getResponseCode() + '）');
      return ok(r.data || {});
    } catch (e) { return err('讀取班 Sheet 失敗：' + e); }
  }
  if (sheetId) {
    try {
      return ok(dumpCourseSheetRaw_(SpreadsheetApp.openById(sheetId)));
    } catch (e) { return err('直接讀取班 Sheet 失敗：' + e); }
  }
  return err('呢班未設定收表 Script 網址，亦冇後端 Sheet ID（請先貼上 /exec 或用新制自動建表）');
}

/** 攞返上次儲存嘅開班設定（setupJson） */
function getCourseSetup_(token, courseId) {
  var t = requirePermRead_(token, 'canCourse', 'training'); if (t.error) return err(t.error);
  var link = courseLinkById_(courseId);
  if (!link) return err('找不到此訓練班（courseId）');
  var setup = null;
  try { setup = link.setupJson ? JSON.parse(link.setupJson) : null; } catch (e) { setup = null; }
  return ok({ courseId: String(courseId).trim(), sheetId: String(link.sheetId || ''), setup: setup });
}

// ===================== 訓練班新版流程（v4.17.0：訓練班系統先行） ======================
// CL 喺訓練班 App（course repo）開班＋填晒 Input01/02/03＋通告 → 交「GS＋SCRIPT 網址」→
// 管理層喺區系統：①拉 getCourseSummary 批核 ②改核心資料（修訂清單標亮＋寫返 GS）③tick 區會批准
// ④出通告上網→貼 URL 掛載 ⑤報名截止後收款核對（setPaymentCheck）⑥完成報告對接。
// 決定權喺區管理層——批完由呢邊出通告，CL 純被通知（email 由 COURSE_EMAIL_FROM alias 出）。

/** 由 CourseLink 解析班 Sheet 檔案 ID（gsUrl 為主；sheetId 後備） */
function courseSheetFileId_(link) {
  var url = String(link.gsUrl || '').trim();
  var m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return String(link.sheetId || '').trim();
}

// ===================== v6.2.1 對接：opsKey＋fileId 對班（兩條路並存） =====================
// CL 交嚟班 GS 網址 → 抽 fileId → 用區系統密匙（opsKey）＋fileId 就對到班，唔使逐班搵 publicCourseId。
// 白名單 action（hub 6.2.1）：getCourseProfile／getCourseSummary／listRegs／listBudgetVersions／
// setPaymentCheck／setCourseRefund／approveBudgetVersion＋setParamLabel（tick 區會批准，要傳 fileId）。
// 舊路 opsKey＋publicCourseId 照用得；舊後端（冇 hubVersion）自動退回逐班 apiKey。

function courseHubUrl_() { return String(getConfigValue_('COURSE_HUB_URL') || '').trim(); }
function courseOpsKey_() { return String(getConfigValue_('COURSE_OPS_KEY') || '').trim(); }

/** 版本比較（粗粒度）：'6.2.1' 對 '6.2.0' → 1/-1/0 */
function compareVersion_(a, b) {
  var pa = String(a || '').replace(/[^\d.]/g, '').split('.');
  var pb = String(b || '').replace(/[^\d.]/g, '').split('.');
  for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
    var x = Number(pa[i] || 0), y = Number(pb[i] || 0);
    if (x > y) return 1; if (x < y) return -1;
  }
  return 0;
}

/** 能力檢查：GET 該班 /exec 睇 hubVersion（hub ≥ 6.2.1 先識 fileId）。Cache 1 小時。 */
function courseHubInfo_(execUrl) {
  var url = String(execUrl || '').trim();
  if (!url) return null;
  var c = null;
  try { c = CacheService.getScriptCache(); } catch (e) { c = null; }
  var k = 'hubinfo_' + url;
  var hit = null;
  try { if (c) hit = c.get(k); } catch (e) { hit = null; }
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* 繼續 */ } }
  var out = null;
  try {
    var resp = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    var r = {};
    try { r = JSON.parse(resp.getContentText()); } catch (e) { r = {}; }
    if (r && r.ok && r.data && r.data.hubVersion) {
      out = { hubVersion: String(r.data.hubVersion), ready: !!r.data.ready, ownerEmail: String(r.data.ownerEmail || '') };
      try { if (c) c.put(k, JSON.stringify(out), 3600); } catch (e) {}
    }
  } catch (e) { out = null; }
  return out;
}

/** hub ≥ 6.2.1 先識 fileId；舊後端唔識 → 唔好行 fileId 路 */
function courseHubFileIdReady_(link) {
  var info = courseHubInfo_(courseExecUrl_(link));
  if (!info || !info.hubVersion) return false;
  return compareVersion_(info.hubVersion, '6.2.1') >= 0;
}

/** 呢班係咪行新制 hub（Script 網址 = 全區共用 hub /exec） */
function courseIsHub_(link) {
  var hub = courseHubUrl_();
  if (!hub) return false;
  return courseExecUrl_(link) === hub;
}

/** 由多個欄名攞第一個有值嘅（入參別名對照用） */
function firstVal_(obj /*, names... */) {
  for (var i = 1; i < arguments.length; i++) {
    var v = obj == null ? undefined : obj[arguments[i]];
    if (v !== undefined && v !== null && String(v) !== '') return v;
  }
  return '';
}

/**
 * 6.2.1 對接：決定 call 班後端用邊條路（自動揀）。
 * 回 { execUrl, payload, path }（payload 已含認證字段）；搵唔到路回 { error }。
 *   優先：hub 已接駁＋hubVersion ≥ 6.2.1＋有 fileId → opsKey＋fileId
 *   次選：opsKey＋publicCourseId（兩條路並存，唔使能力檢查）
 *   最後：逐班 apiKey（舊制／舊後端）
 */
function courseTarget_(link, params) {
  var execUrl = courseExecUrl_(link);
  var apiKey = courseApiKey_(link);
  var fileId = courseSheetFileId_(link);
  var opsKey = courseOpsKey_();
  var pubId = String(link.publicCourseId || '').trim();
  var hub = courseHubUrl_();

  var payload = {};
  Object.keys(params || {}).forEach(function (k) { payload[k] = params[k]; });

  if (opsKey && fileId && hub && execUrl === hub && courseHubFileIdReady_(link)) {
    payload.opsKey = opsKey; payload.fileId = fileId;
    return { execUrl: execUrl, payload: payload, path: 'ops-fileId' };
  }
  if (opsKey && pubId && hub && execUrl === hub) {
    payload.opsKey = opsKey; payload.publicCourseId = pubId;
    return { execUrl: execUrl, payload: payload, path: 'ops-publicId' };
  }
  if (apiKey && execUrl) {
    payload.apiKey = apiKey;
    return { execUrl: execUrl, payload: payload, path: 'apiKey' };
  }
  return { error: '未設定訓練班連線資料（Script 網址＋Key，或 GS 網址＋區系統密匙 COURSE_OPS_KEY）' };
}

/** tick「區會批准」等參數 label：hub 班經 setParamLabel（opsKey＋fileId）。回 {ok} 或 null（行唔到呢條路） */
function courseSetParamLabel_(link, label, value) {
  var hub = courseHubUrl_();
  var opsKey = courseOpsKey_();
  var fileId = courseSheetFileId_(link);
  var execUrl = courseExecUrl_(link);
  if (!opsKey || !fileId || !hub || execUrl !== hub) return null;
  try {
    var resp = UrlFetchApp.fetch(execUrl, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ action: 'setParamLabel', opsKey: opsKey, fileId: fileId, label: label, value: value }),
      muteHttpExceptions: true,
    });
    var r = {};
    try { r = JSON.parse(resp.getContentText()); } catch (e) { r = {}; }
    return r.ok ? { ok: true } : { ok: false, error: (r && r.error) || '寫參數失敗' };
  } catch (e) { return { ok: false, error: String(e) }; }
}

/** 參數分頁 label 對位：搵「label」行（A 欄整格相符）；冇就喺表尾補一行（CourseFactory 同款）。
 *  回傳 { row }；搵唔到分頁回 null。 */
function courseParamRow_(ss, label) {
  var sh = ss.getSheetByName('參數');
  if (!sh) return null;
  var last = sh.getLastRow();
  if (last > 0) {
    var found = sh.getRange(1, 1, last, 1).getValues();
    for (var i = 0; i < found.length; i++) {
      if (String(found[i][0] || '').trim() === label) return { row: i + 1 };
    }
  }
  sh.getRange(last + 1, 1, 1, 2).setValues([[label, '']]);
  return { row: last + 1 };
}

/**
 * 拉訓練班批核摘要（coursev5 getCourseSummary——一個 call 攞齊課程資料・節次・職員・
 * 預算 8 大類・通告要點・批准狀態・報名數）。b: { courseId } 或 { scriptExecUrl, scriptApiKey }。
 * 淨係 /exec 班（新版流程班）；直入班（得 sheetId）前端用 pullCourseSheetRaw 自己組。
 */
function pullCourseSummary_(token, b) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  b = b || {};
  var link = null;
  if (b.scriptExecUrl || b.apiBase || b.scriptApiKey || b.apiKey) {
    link = {
      courseId: b.courseId || '', title: '',
      scriptExecUrl: String(b.scriptExecUrl || b.apiBase || '').trim(),
      scriptApiKey: String(b.scriptApiKey || b.apiKey || '').trim(),
      gsUrl: String(b.gsUrl || '').trim(), publicCourseId: String(b.publicCourseId || '').trim(),
    };
  } else if (b.courseId) {
    link = courseLinkById_(b.courseId);
  }
  if (!link) return err('呢班未有訓練班 Script 網址（新版流程班請貼 CL 交嚟嘅網址）');
  var tgt = courseTarget_(link, { action: 'getCourseSummary' });
  if (tgt.error) return err(tgt.error);
  try {
    var resp = UrlFetchApp.fetch(tgt.execUrl, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(tgt.payload),
      muteHttpExceptions: true,
    });
    var r = {};
    try { r = JSON.parse(resp.getContentText()); } catch (e) { r = {}; }
    if (!r.ok) return err((r && r.error) || '讀取批核摘要失敗（HTTP ' + resp.getResponseCode() + '）——請確認該班 Script 已裝 coursev5（Summary.gs）');
    return ok(r.data || {});
  } catch (e) { return err('讀取批核摘要失敗：' + e); }
}

/**
 * 批核寫入：核心資料修改（cells）＋區會批准 tick＋訓練班電郵＋修訂清單，一次過寫入班 Sheet。
 * b: { courseId, by, cells[{tab,row,col,value}], approval('APPROVED'|'PENDING'|''=不變),
 *      courseEmail, changes[{label,from,to}], revisionNote, link(摘要同步欄) }
 * 首選 direct openById（gsUrl／sheetId；同一帳戶擁有）：先寫格，再參數分頁 label 對位寫
 * 「區會批准」「訓練班電郵」「區會修訂」行，最後 bump rev（職員前端會偵測到有人改過）。
 * 開唔到 Sheet（唔同帳戶）就 fallback 經 /exec saveCourseBatch 寫 cells——批准格要人手開 GS tick。
 */
function saveCourseApproval_(token, b) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  b = b || {};
  var link = courseLinkById_(b.courseId);
  if (!link) return err('找不到此訓練班（courseId）');
  var by = String(b.by || '區管理系統').trim();
  var cells = Array.isArray(b.cells) ? b.cells : [];
  var warnings = [];
  var applied = { applied: 0, skippedTabs: [] };
  var approvalDone = false, path = '';

  var fileId = courseSheetFileId_(link);
  var ss = null;
  if (fileId) {
    try { ss = SpreadsheetApp.openById(fileId); } catch (e) { ss = null; }
  }
  if (ss) {
    path = 'direct';
    try {
      applied = applySetupCells_(ss, cells);
      // 區會批准 tick（approval=''=唔掂）
      var appr = String(b.approval || '').trim().toUpperCase();
      if (appr === 'APPROVED' || appr === 'PENDING') {
        var prow = courseParamRow_(ss, '區會批准');
        if (prow) {
          ss.getSheetByName('參數').getRange(prow.row, 2).setValue(appr === 'APPROVED' ? '✔' : '');
          approvalDone = true;
        } else warnings.push('班 Sheet 冇「參數」分頁——批准格寫唔到');
      }
      // 訓練班電郵（有帶先寫；通告查詢行自動用）
      var cemail = String(b.courseEmail || '').trim();
      if (cemail) {
        var erow = courseParamRow_(ss, '訓練班電郵');
        if (erow) ss.getSheetByName('參數').getRange(erow.row, 2).setValue(cemail);
      }
      // 區會修訂行（等 CL 開 GS／日後訓練班 App 都見到管理層改咗咩）
      var changes = Array.isArray(b.changes) ? b.changes : [];
      var note = String(b.revisionNote || '').trim();
      if (changes.length || note) {
        var lines = changes.map(function (c) {
          return c.label + '：' + String(c.from === undefined || c.from === null ? '（空）' : c.from) + ' → ' + String(c.to === undefined || c.to === null ? '（空）' : c.to);
        });
        if (note) lines.unshift(note);
        var ts = Utilities.formatDate(new Date(), 'Asia/Hong_Kong', 'yyyy-MM-dd HH:mm');
        var sh = ss.getSheetByName('參數');
        var last = sh.getLastRow();
        sh.getRange(last + 1, 1, 1, 2).setValues([['區會修訂 ' + ts, '【' + by + '】' + lines.join('；').substring(0, 900)]]);
      }
      try { bumpCourseRev_(ss, by); } catch (e) {}
    } catch (e) {
      return err('寫入班 Sheet 失敗：' + e);
    }
  } else {
    // fallback：開唔到班 Sheet（可能唔同帳戶擁有）→ 經該班 /exec 寫
    var appr2 = String(b.approval || '').trim().toUpperCase();
    var cemail = String(b.courseEmail || '').trim();

    // 區會批准 tick（v6.2.1）：hub 班經 setParamLabel（opsKey＋fileId）；舊制／未接駁 → 人手開 GS
    if (appr2 === 'APPROVED' || appr2 === 'PENDING') {
      var pl = courseSetParamLabel_(link, '區會批准', appr2 === 'APPROVED' ? '✔' : '');
      if (pl && pl.ok) { approvalDone = true; if (!path) path = 'ops'; }
      else if (pl && !pl.ok) { warnings.push('「區會批准」經 setParamLabel 寫唔到：' + pl.error); }
      else { warnings.push('開唔到班 Sheet（可能唔同帳戶擁有）——「區會批准」格請開 GS 人手 tick：' + String(link.gsUrl || '（未存 GS 網址）')); }
    }
    // 訓練班電郵：hub 班經 setParamLabel 寫返（舊制只係通知，電郵格唔寫）
    if (cemail) {
      var el = courseSetParamLabel_(link, '訓練班電郵', cemail);
      if (el && !el.ok) warnings.push('「訓練班電郵」經 setParamLabel 寫唔到：' + el.error);
    }

    // cells（改核心資料）：saveCourseBatch 唔喺 opsKey 白名單 → 淨係逐班 apiKey 先寫到
    if (cells.length) {
      var execUrl2 = courseExecUrl_(link), apiKey2 = courseApiKey_(link);
      if (!execUrl2 || !apiKey2) {
        warnings.push('開唔到班 Sheet，又冇逐班 apiKey——核心資料修改寫唔到（批准格已另外處理）');
      } else {
        try {
          var resp = UrlFetchApp.fetch(execUrl2, {
            method: 'post', contentType: 'application/json',
            payload: JSON.stringify({ action: 'saveCourseBatch', apiKey: apiKey2, by: by, cells: cells }),
            muteHttpExceptions: true,
          });
          var r = {};
          try { r = JSON.parse(resp.getContentText()); } catch (e) {}
          if (!r.ok) return err((r && r.error) || '經 Script 寫入失敗');
          applied = { applied: (r.data && r.data.updated) || cells.length, skippedTabs: (r.data && r.data.skippedTabs) || [] };
          path = 'exec';
        } catch (e) { return err('經 Script 寫入失敗：' + e); }
      }
    }
  }

  // 修訂紀錄（CourseLinks.revisions JSON；近 30 筆）
  var prev = [];
  try { prev = JSON.parse(String(link.revisions || '') || '[]') || []; } catch (e) { prev = []; }
  if (!Array.isArray(prev)) prev = [];
  var changes2 = Array.isArray(b.changes) ? b.changes : [];
  var appr3 = String(b.approval || '').trim().toUpperCase();
  if (changes2.length || approvalDone || note2_(b)) {
    prev.unshift({
      at: new Date().toISOString(), by: by,
      approval: appr3 === 'APPROVED' ? 'APPROVED' : (appr3 === 'PENDING' ? 'PENDING' : ''),
      changes: changes2.map(function (c) { return { label: c.label, from: String(c.from == null ? '' : c.from), to: String(c.to == null ? '' : c.to) }; }),
      note: String(b.revisionNote || '').trim(),
      cellsApplied: applied.applied, path: path,
    });
    if (prev.length > 30) prev = prev.slice(0, 30);
  }

  // 開班登記同步（先攤平【現有成行 link】再覆蓋 approval／sync 欄——
  //  唔攤平嘅話 saveCourseLink_ 會當冇帶＝寫空串，洗走 scriptExecUrl／apiKey／fee 等現有值）
  var sync = b.link || {};
  var saved = saveCourseLink_(token, Object.assign({}, link, {
    approval: appr3 === 'APPROVED' ? 'APPROVED' : (appr3 === 'PENDING' ? 'PENDING' : String(link.approval || '')),
    approvedAt: appr3 === 'APPROVED' ? new Date().toISOString() : String(link.approvedAt || ''),
    approvedBy: appr3 === 'APPROVED' ? by : String(link.approvedBy || ''),
    revisions: JSON.stringify(prev),
  }, sync));
  if (!saved.ok) warnings.push('開班登記同步失敗：' + saved.error);

  return ok({ saved: true, courseId: String(b.courseId).trim(), path: path, approvalDone: approvalDone,
    cellsApplied: applied.applied, skippedTabs: applied.skippedTabs, warnings: warnings, revisions: prev });
}
function note2_(b) { return String(b.revisionNote || '').trim() !== ''; }

/**
 * 收款核對（報名截止後，區管理層對完區帳戶 tick）——寫「表格回應」AS/AT/AU
 * （已核對收款／核對人／核對時間）。b: { courseId, checks[{id(=時間戳記), verified}], by }。
 * 首選經該班 /exec setPaymentCheck；直入班（sheetId）直接寫（照 PaymentCheck.gs 語義：identity 對行、唔 bump rev）。
 */
function setCoursePaymentCheck_(token, b) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  b = b || {};
  var link = courseLinkById_(b.courseId);
  if (!link) return err('找不到此訓練班（courseId）');
  var checks = Array.isArray(b.checks) ? b.checks : [];
  if (!checks.length) return err('冇帶 checks');
  var by = String(b.by || '區管理系統').trim();
  var execUrl = courseExecUrl_(link), apiKey = courseApiKey_(link);
  var sheetId = courseSheetFileId_(link);
  var results = [];
  var ss = null;
  if (sheetId) {
    // 首選 direct：一次過寫晒（批量唔使逐筆打 Script quota）；開唔到（唔同帳戶）先 fallback exec
    try { ss = SpreadsheetApp.openById(sheetId); } catch (e) { ss = null; }
  }
  if (ss) {
    var sh = ss.getSheetByName('表格回應');
    if (!sh) return err('班 Sheet 冇「表格回應」分頁');
    if (String(sh.getRange(1, 45).getDisplayValue() || '').trim() === '') {
      sh.getRange(1, 45, 1, 3).setValues([['已核對收款', '核對人', '核對時間']]);
    }
    var last = sh.getLastRow();
    var ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getDisplayValues() : [];
    checks.forEach(function (c) {
      var id = String((c && c.id) != null ? c.id : '').trim();
      var hit = -1;
      for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]).trim() === id) { hit = i + 2; break; } }
      if (hit < 0) { results.push({ id: id, ok: false, error: '找不到該報名' }); return; }
      var verified = !(c && c.verified === false);
      sh.getRange(hit, 45).setValue(verified ? '✔' : '');
      sh.getRange(hit, 46).setValue(verified ? by : '');
      sh.getRange(hit, 47).setValue(verified ? new Date() : '');
      results.push({ id: id, ok: true, verified: verified, row: hit });
    });
    return ok({ saved: true, results: results, path: 'direct' });
  }
  var tgt = courseTarget_(link, { action: 'setPaymentCheck' });
  if (tgt.error) return err(tgt.error);
  checks.forEach(function (c) {
    try {
      var payload = {};
      Object.keys(tgt.payload).forEach(function (k) { payload[k] = tgt.payload[k]; });
      payload.id = String((c && c.id) || '').trim();
      payload.verified = !(c && c.verified === false);
      payload.by = by;
      var resp = UrlFetchApp.fetch(tgt.execUrl, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      var r = {};
      try { r = JSON.parse(resp.getContentText()); } catch (e) {}
      if (r.ok) results.push({ id: String((c && c.id) || ''), ok: true, verified: !(c && c.verified === false) });
      else results.push({ id: String((c && c.id) || ''), ok: false, error: (r && r.error) || '寫入失敗' });
    } catch (e) { results.push({ id: String((c && c.id) || ''), ok: false, error: String(e) }); }
  });
  var failed = results.filter(function (x) { return !x.ok; }).length;
  return ok({ saved: failed < results.length, results: results, path: 'exec' });
}

/**
 * 已退款 tick（管理層退咗錢俾未獲接納／取消嘅申請人之後 tick，CL 喺 App 見到）——寫「表格回應」AX/AY
 * （已退款／退款核對人）。b: { courseId, refunds[{id(=時間戳記), refunded}], by }。
 * 首選 direct 寫班 Sheet；fallback 經該班 /exec setCourseRefund（course repo Refund.gs，
 * 照 PaymentCheck.gs 語義：identity 對行、唔 bump rev、自動補表頭；
 * 舊班 Script 未貼 Refund.gs 之前 exec 模式會回 error——direct 模式唔受影響）。
 */
function setCourseRefund_(token, b) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  b = b || {};
  var link = courseLinkById_(b.courseId);
  if (!link) return err('找不到此訓練班（courseId）');
  var refunds = Array.isArray(b.refunds) ? b.refunds : [];
  if (!refunds.length) return err('冇帶 refunds');
  var by = String(b.by || '區管理系統').trim();
  var execUrl = courseExecUrl_(link), apiKey = courseApiKey_(link);
  var sheetId = courseSheetFileId_(link);
  var results = [];
  var ss = null;
  if (sheetId) {
    try { ss = SpreadsheetApp.openById(sheetId); } catch (e) { ss = null; }
  }
  if (ss) {
    var sh = ss.getSheetByName('表格回應');
    if (!sh) return err('班 Sheet 冇「表格回應」分頁');
    if (String(sh.getRange(1, 50).getDisplayValue() || '').trim() === '') {
      sh.getRange(1, 50, 1, 2).setValues([['已退款', '退款核對人']]);
    }
    var last = sh.getLastRow();
    var ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getDisplayValues() : [];
    refunds.forEach(function (c) {
      var id = String((c && c.id) != null ? c.id : '').trim();
      var hit = -1;
      for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]).trim() === id) { hit = i + 2; break; } }
      if (hit < 0) { results.push({ id: id, ok: false, error: '找不到該報名' }); return; }
      var refunded = !(c && c.refunded === false);
      sh.getRange(hit, 50).setValue(refunded ? '✔' : '');
      sh.getRange(hit, 51).setValue(refunded ? by : '');
      results.push({ id: id, ok: true, refunded: refunded, row: hit });
    });
    return ok({ saved: true, results: results, path: 'direct' });
  }
  var tgt = courseTarget_(link, { action: 'setCourseRefund' });
  if (tgt.error) return err(tgt.error);
  refunds.forEach(function (c) {
    try {
      var payload = {};
      Object.keys(tgt.payload).forEach(function (k) { payload[k] = tgt.payload[k]; });
      payload.id = String((c && c.id) || '').trim();
      payload.refunded = !(c && c.refunded === false);
      payload.by = by;
      var resp = UrlFetchApp.fetch(tgt.execUrl, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      var r = {};
      try { r = JSON.parse(resp.getContentText()); } catch (e2) {}
      if (r.ok) results.push({ id: String((c && c.id) || ''), ok: true, refunded: !(c && c.refunded === false) });
      else results.push({ id: String((c && c.id) || ''), ok: false, error: (r && r.error) || '寫入失敗（班 Script 貼咗 Refund.gs 先支援）' });
    } catch (e) { results.push({ id: String((c && c.id) || ''), ok: false, error: String(e) }); }
  });
  var failed = results.filter(function (x) { return !x.ok; }).length;
  return ok({ saved: failed < results.length, results: results, path: 'exec' });
}

/**
 * 寄 CL 電郵（通知已批准／通告已上網／收款核對摘要）。
 * b: { courseId, kind('approved'|'mounted'|'payment'|'custom'), to, cc?, title?,
 *      replyTo?, changes?, noticeUrl?, paymentStats?, note?, by? }
 * 寄件架構（v4.17.0）：From = 機房帳戶（部署呢個 Script 嘅帳戶；設 COURSE_EMAIL_FROM alias 就用 alias），
 * ReplyTo = 班信箱（b.replyTo——例 blt2601@skwscout.org.hk）。CL 撳回覆會去班信箱，
 * 班職員 delegate／group 睇得到；機房信箱（例 skw@hkirscout.org.hk）唔會收到班務信。
 */
function courseMail_(to, subject, htmlBody, textBody, opts) {
  opts = opts || {};
  var replyTo = String(opts.replyTo || '').trim();
  // 寄件地址：opts.from（例 mode=course 傳入班信箱）> Config COURSE_EMAIL_FROM > 留空（部署帳戶本身）
  var from = String(opts.from || getConfigValue_('COURSE_EMAIL_FROM') || '').trim();
  var name = String(opts.name || getConfigValue_('notifyFrom') || ((getConfigValue_('districtName') || '童軍區') + ' 管理系統'));
  var base = { to: to, subject: subject, htmlBody: htmlBody, body: textBody, name: name };
  if (replyTo && replyTo.indexOf('@') > 0) base.replyTo = replyTo;
  if (from) {
    try {
      MailApp.sendEmail(Object.assign({}, base, { from: from }));
      return { fromUsed: from, warning: '' };
    } catch (e) {
      // alias 未驗證／無效——fallback 機房帳戶地址（replyTo 照跟，回覆照去班信箱）
      MailApp.sendEmail(base);
      return { fromUsed: '(帳戶本身)', warning: from + ' 寄唔到（send-as 未喺部署帳戶 Gmail 驗證／SMTP 唔對？），已改用部署帳戶地址寄出；回覆照去班信箱。' };
    }
  }
  MailApp.sendEmail(base);
  return { fromUsed: '(帳戶本身)' + (replyTo ? '・回覆去 ' + replyTo : ''), warning: '' };
}

function courseChangesHtml_(changes) {
  if (!changes || !changes.length) return '';
  var rows = changes.map(function (c) {
    return '<tr><td style="padding:4px 10px 4px 0;white-space:nowrap;"><b>' + esc_(c.label) + '</b></td>' +
      '<td style="padding:4px 10px;color:#b45309;">' + esc_(String(c.from == null || c.from === '' ? '（空）' : c.from)) + '</td>' +
      '<td style="padding:4px 10px;color:#1d4ed8;">' + esc_(String(c.to == null || c.to === '' ? '（空）' : c.to)) + '</td></tr>';
  }).join('');
  return '<p><b>✏️ 區會修訂（改咗咩——標亮俾你知）：</b></p>' +
    '<table style="border-collapse:collapse;font-size:13.5px;">' + rows + '</table>';
}

function sendCourseEmail_(token, b) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  b = b || {};
  var link = courseLinkById_(b.courseId);
  if (!link) return err('找不到此訓練班（courseId）');
  var to = String(b.to || '').trim();
  if (!to || to.indexOf('@') < 0) return err('缺少收件人電郵（to——通常係班領導人 email）');
  var kind = String(b.kind || 'custom').trim();
  var districtName = getConfigValue_('districtName') || '童軍區';
  var title = String(b.title || link.title || '').trim();
  var by = String(b.by || '').trim();
  var subject = '', body = '', html = '';
  var head = '<p>你好，</p><p>呢封係<b>' + esc_(districtName) + '訓練班管理系統</b>嘅自動通知（' + esc_(title) + '）。' +
    (by ? '<br>處理人：' + esc_(by) : '') + '</p>';
  var foot = '<p style="color:#666;font-size:12.5px;">此郵件由 ' + esc_(districtName) + '訓練班系統自動發出——直接回覆此郵件即可聯絡區管理層。</p>';
  if (kind === 'approved') {
    subject = '[' + districtName + '] 訓練班已批准——' + title;
    body = head + '<p style="color:#15803d;"><b>✅ 你嘅訓練班已經批准晒（區會批准 ✔）。</b></p>' +
      '<p>批核途中區會有機會改咗少少嘢，改動如下（你唔使再做嘢，等區會出通告上網就得）：</p>' +
      courseChangesHtml_(b.changes) +
      (String(b.note || '').trim() ? '<p>備註：' + esc_(b.note) + '</p>' : '') + foot;
  } else if (kind === 'mounted') {
    subject = '[' + districtName + '] 訓練班通告已上網——' + title;
    body = head + '<p style="color:#15803d;"><b>📢 通告已上網，報名正式開始。</b></p>' +
      (String(b.noticeUrl || '').trim() ? '<p>通告網址：<a href="' + esc_(b.noticeUrl) + '">' + esc_(b.noticeUrl) + '</a></p>' : '') +
      '<p>報名會自動流入你嘅訓練班系統（「收生」版面），收款核對由區會財務負責（💰 已核對收款會喺你個 APP 見到 ✔）。</p>' + foot;
  } else if (kind === 'payment') {
    var st = b.paymentStats || {};
    subject = '[' + districtName + '] 訓練班收款核對摘要——' + title;
    body = head + '<p><b>💰 收款核對進度：已核對 ' + Number(st.checked || 0) + ' ／ 共 ' + Number(st.total || 0) + ' 筆</b>' +
      (Number(st.unchecked || 0) > 0 ? '（尚餘 ' + Number(st.unchecked) + ' 筆未對到）' : '（全部對完）') + '</p>' +
      (Array.isArray(st.pending) && st.pending.length ? '<p><b>未核對：</b>' + esc_(st.pending.join('、')) + '</p>' : '') +
      '<p>有疑問（例如入咗數但未見 ✔）請直接回覆此郵件話我哋知。</p>' + foot;
  } else {
    subject = '[' + districtName + '] 訓練班通知——' + title;
    body = head + '<p>' + esc_(String(b.note || '').trim() || '（冇內容）') + '</p>' + courseChangesHtml_(b.changes) + foot;
  }
  var cc = String(b.cc || '').trim();
  var replyTo = String(b.replyTo || '').trim();
  // COURSE_EMAIL_FROM_MODE=course：寄件人直接用班信箱（須預先喺部署帳戶 Gmail
  // 「用這個地址傳送郵件」＋班信箱 SMTP 驗證；未驗證 courseMail_ 會自動 fallback 機房地址）
  var fromOpt = '';
  if (String(getConfigValue_('COURSE_EMAIL_FROM_MODE') || '').trim().toLowerCase() === 'course'
      && replyTo && replyTo.indexOf('@') > 0) fromOpt = replyTo;
  var mail;
  try {
    mail = courseMail_(to, subject, body, subject + '\n\n（詳情請睇 HTML 版）', {
      replyTo: replyTo,
      from: fromOpt,
      name: (districtName + '·' + title).substring(0, 60),
    });
    if (cc && cc.indexOf('@') >= 0) {
      try {
        var ccOpts = { to: cc, subject: subject, htmlBody: body,
          name: (districtName + '·' + title).substring(0, 60), replyTo: replyTo };
        if (fromOpt) ccOpts.from = fromOpt;
        MailApp.sendEmail(ccOpts);
      } catch (e) {}
    }
  } catch (e) { return err('寄電郵失敗：' + e); }
  return ok({ sent: true, to: to, cc: cc, fromUsed: mail.fromUsed, warning: mail.warning, subject: subject });
}

// ===================== 收生通知（v4.17.1：接納／不接納通知寄俾申請人） ======================

/** 參數分頁 label 對位讀值（direct 先用到；例「訓練班電郵」） */
function courseParamLabelValue_(ss, label) {
  var sh = ss.getSheetByName('參數');
  if (!sh || sh.getLastRow() < 1) return '';
  var v = sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0] || '').trim() === label) return String(v[i][1] || '').trim();
  }
  return '';
}

/**
 * 寄收生通知俾申請人：接納（節次＋報到時間／攜帶物品由班 Sheet 帶出）／不接納（客氣版）。
 * b: { courseId, notices:[{id(=時間戳記), kind:'approved'|'rejected'}], by, replyTo? }
 * ReplyTo＝班信箱（b.replyTo > 班 Sheet 參數「訓練班電郵」> 班領導人電郵）；副本 CC 班領導人。
 * 寄件人跟 COURSE_EMAIL_FROM_MODE（=course 時直接用班信箱寄）。紀錄寫 CourseLinks.regNotices JSON。
 */
function sendCourseRegNotice_(token, b) {
  var t = requirePerm_(token, 'canCourse'); if (t.error) return err(t.error);
  b = b || {};
  var link = courseLinkById_(b.courseId);
  if (!link) return err('找不到此訓練班（courseId）');
  var items = Array.isArray(b.notices) ? b.notices : [];
  if (!items.length) return err('冇帶 notices');
  var by = String(b.by || '區管理系統').trim();

  // 1) 讀班 Sheet 全文（首選 direct；fallback 經 /exec）
  var fileId = courseSheetFileId_(link);
  var raw = null;
  if (fileId) { try { raw = dumpCourseSheetRaw_(SpreadsheetApp.openById(fileId)); } catch (e) { raw = null; } }
  if (!raw) {
    var execUrl = courseExecUrl_(link), apiKey = courseApiKey_(link);
    if (!execUrl) return err('開唔到班 Sheet，又冇 Script 網址——請喺「連結」分頁補返');
    try {
      var resp0 = UrlFetchApp.fetch(execUrl, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ action: 'getCourseSheetRaw', apiKey: apiKey }),
        muteHttpExceptions: true,
      });
      var r0 = {}; try { r0 = JSON.parse(resp0.getContentText()); } catch (e) {}
      if (!r0.ok) return err((r0 && r0.error) || '經 Script 讀班 Sheet 失敗');
      raw = r0.data;
    } catch (e) { return err('經 Script 讀班 Sheet 失敗：' + e); }
  }

  // 2) 抽課程資料（Input02 B1 班名・9–16 節次・職員 23–42 班領導人・接納通知書人手格）
  var v2 = Array.isArray(raw.input02) ? raw.input02 : [];
  var v1 = Array.isArray(raw.input01) ? raw.input01 : [];
  var courseName = String((v2[0] || [])[1] || '').trim() || String((v1[0] || [])[1] || '').trim() || String(link.title || '').trim();
  var districtName = getConfigValue_('districtName') || '童軍區';
  var sessions = [];
  for (var sr = 8; sr < 16; sr++) {
    var rv = v2[sr] || [];
    var dS = String(rv[8] != null ? rv[8] : '').trim() || String(rv[1] != null ? rv[1] : '').trim();
    var tS = String(rv[9] != null ? rv[9] : '').trim() || String(rv[3] != null ? rv[3] : '').trim();
    var vS = String(rv[10] != null ? rv[10] : '').trim() || String(rv[4] != null ? rv[4] : '').trim();
    if (!dS && !tS) continue;
    if (String(rv[7] != null ? rv[7] : '').trim().toUpperCase() === 'FALSE') continue;
    sessions.push('・' + dS + (tS ? '　' + tS : '') + (vS ? '（' + vS + '）' : ''));
  }
  var va = Array.isArray(raw.accept) ? raw.accept : [];
  var acc = {
    checkin: String((va[22] || [])[3] || '').trim(),
    items: String((va[29] || [])[3] || '').trim(),
    others: String((va[31] || [])[3] || '').trim(),
    note: String((va[33] || [])[3] || '').trim(),
  };
  var leader = null;
  for (var lr = 22; lr < 42; lr++) {
    var lv = v2[lr] || [];
    var role = String(lv[0] || '').trim(), nmL = String(lv[1] || '').trim();
    if (role && nmL && role.indexOf('班領導人') >= 0) {
      leader = { name: nmL, title: String(lv[2] || '').trim(), email: String(lv[6] || '').trim() };
      break;
    }
  }
  var leaderLine = leader ? (leader.name + (leader.title || '')) : '';
  // ReplyTo：前端帶 > 班 Sheet 參數「訓練班電郵」（direct 先讀到）> 班領導人電郵
  var replyTo = String(b.replyTo || '').trim();
  if (!replyTo && fileId) {
    try { replyTo = courseParamLabelValue_(SpreadsheetApp.openById(fileId), '訓練班電郵'); } catch (e) { replyTo = ''; }
  }
  if (!replyTo && leader) replyTo = leader.email;
  var fromOpt = '';
  if (String(getConfigValue_('COURSE_EMAIL_FROM_MODE') || '').trim().toLowerCase() === 'course' && replyTo) fromOpt = replyTo;

  // 3) 表格回應 header 對位
  var vresp = Array.isArray(raw.resp) ? raw.resp : [];
  var headers = (vresp[0] || []).map(function (x) { return String(x == null ? '' : x).trim(); });
  var iId = headers.indexOf('時間戳記') >= 0 ? headers.indexOf('時間戳記') : 0;
  var iEmail = headers.indexOf('電郵地址'); if (iEmail < 0) iEmail = headers.indexOf('電郵');
  var iName = headers.indexOf('中文姓名');

  // 4) 逐筆組版＋寄出
  var senderName = (districtName + '·' + courseName).substring(0, 60);
  var results = [], sent = 0;
  var recs = {};
  try { recs = JSON.parse(String(link.regNotices || '') || '{}') || {}; } catch (e) { recs = {}; }
  if (typeof recs !== 'object' || Array.isArray(recs)) recs = {};
  items.forEach(function (it) {
    var id = String((it && it.id) != null ? it.id : '').trim();
    var kind = String((it && it.kind) || '').trim().toLowerCase() === 'rejected' ? 'rejected' : 'approved';
    var hit = null;
    for (var i = 1; i < vresp.length; i++) {
      if (String((vresp[i] || [])[iId] || '').trim() === id) { hit = vresp[i]; break; }
    }
    if (!hit) { results.push({ id: id, ok: false, error: '找不到該報名' }); return; }
    var to = iEmail >= 0 ? String(hit[iEmail] || '').trim() : '';
    var nm = iName >= 0 ? String(hit[iName] || '').trim() : '';
    if (!to || to.indexOf('@') < 0) { results.push({ id: id, ok: false, error: '申請人冇電郵' }); return; }
    var sign = '<p>' + esc_(districtName) + '訓練班' + (leaderLine ? '<br>' + esc_(leaderLine) + ' 謹啟' : ' 謹啟') + '</p>';
    var subject = kind === 'approved'
      ? '[' + districtName + '] 訓練班接納通知——' + courseName
      : '[' + districtName + '] 訓練班申請結果通知——' + courseName;
    var body;
    if (kind === 'approved') {
      body = '<p>' + esc_(nm || '申請人') + ' 您好，</p>' +
        '<p>多謝 閣下報名參加<b>' + esc_(courseName) + '</b>。很高興通知您：<b style="color:#15803d">閣下之申請已獲接納</b>。</p>' +
        (sessions.length ? '<p><b>上課日期及時間：</b></p><p>' + sessions.map(function (x) { return esc_(x); }).join('<br>') + '</p>' : '') +
        (acc.checkin ? '<p><b>報到時間：</b>' + esc_(acc.checkin) + '</p>' : '') +
        (acc.items ? '<p><b>請攜帶物品：</b>' + esc_(acc.items) + '</p>' : '') +
        (acc.others ? '<p>' + esc_(acc.others) + '</p>' : '') +
        (acc.note ? '<p style="color:#666">備註：' + esc_(acc.note) + '</p>' : '') +
        '<p>如有任何疑問，直接回覆本電郵即可（由班職員跟進）。</p>' + sign;
    } else {
      body = '<p>' + esc_(nm || '申請人') + ' 您好，</p>' +
        '<p>多謝 閣下報名參加<b>' + esc_(courseName) + '</b>。由於報名人數眾多，名額所限，是次申請<b>未能獲得接納</b>，敬請原諒。</p>' +
        '<p>日後如有其他訓練班，歡迎 閣下再報名參加。</p>' + sign;
    }
    try {
      courseMail_(to, subject, body, courseName + '—' + (kind === 'approved' ? '已獲接納' : '未能接納（名額所限）'), { replyTo: replyTo, from: fromOpt, name: senderName });
      if (leader && leader.email && leader.email !== to) {
        try {
          var ccOpts = { to: leader.email, subject: '[副本] ' + subject, htmlBody: body, name: senderName };
          if (replyTo) ccOpts.replyTo = replyTo;
          if (fromOpt) ccOpts.from = fromOpt;
          MailApp.sendEmail(ccOpts);
        } catch (e) {}
      }
      recs[id] = { kind: kind, at: new Date().toISOString(), by: by };
      results.push({ id: id, ok: true });
      sent++;
    } catch (e) { results.push({ id: id, ok: false, error: String(e && e.message ? e.message : e) }); }
  });

  // 5) 紀錄寫返 CourseLinks（flatten link 先寫——同 saveCourseApproval_ 同一套防洗走）
  var keys = Object.keys(recs);
  if (keys.length > 300) {
    keys.sort(function (a, c) { return String((recs[a] || {}).at || '').localeCompare(String((recs[c] || {}).at || '')); });
    keys.slice(0, keys.length - 300).forEach(function (k) { delete recs[k]; });
  }
  var saved = saveCourseLink_(token, Object.assign({}, link, { regNotices: JSON.stringify(recs) }));
  if (!saved.ok) results.push({ id: '', ok: false, error: '通知紀錄寫唔入：' + saved.error });
  return ok({ sent: sent, results: results, regNotices: recs, replyTo: replyTo });
}

/** 開班指引（俾 CL 嘅嘢）：CourseFactory 網址＋開班碼＋訓練班郵件 alias 現狀 */
function getCourseOpsInfo_(token) {
  var t = requirePermRead_(token, 'canCourse', 'training'); if (t.error) return err(t.error);
  return ok({
    districtName: getConfigValue_('districtName') || '童軍區',
    factoryUrl: String(getConfigValue_('COURSE_FACTORY_URL') || '').trim(),
    factoryCode: String(getConfigValue_('COURSE_FACTORY_CODE') || '').trim(),
    emailFrom: String(getConfigValue_('COURSE_EMAIL_FROM') || '').trim(),
    memberPortalUrl: String(getConfigValue_('MEMBER_PORTAL_URL') || '').trim(),
    notifyFrom: String(getConfigValue_('notifyFrom') || '').trim(),
    // v6.2.1 對接：新制 hub＋區系統密匙現狀（前端「🔗 連結」顯示接駁狀態）
    hubUrl: courseHubUrl_(),
    opsKeySet: !!courseOpsKey_(),
  });
}

/**
 * v6.2.1 對接：讀訓練班系統（hub）公開班列表（唔使 key）＋hubVersion 能力檢查。
 * 攞班名＋公開課程ID 嚟配對——CL 交嚟 GS 網址（fileId）後，用班名對返 publicCourseId。
 */
function listHubCourses_(token) {
  var t = requirePermRead_(token, 'canCourse', 'training'); if (t.error) return err(t.error);
  var hub = courseHubUrl_();
  if (!hub) return err('未設定 COURSE_HUB_URL（新制訓練班 CourseHub /exec）——請喺 Config 填返');
  var info = courseHubInfo_(hub);
  try {
    var resp = UrlFetchApp.fetch(hub, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ action: 'listCourses' }),
      muteHttpExceptions: true,
    });
    var r = {};
    try { r = JSON.parse(resp.getContentText()); } catch (e) { r = {}; }
    if (!r.ok) return err((r && r.error) || '讀取訓練班系統班列表失敗（HTTP ' + resp.getResponseCode() + '）');
    var courses = (r.data && r.data.courses) || [];
    return ok({
      hubUrl: hub,
      hubVersion: info ? info.hubVersion : '',
      hubReady: info ? !!info.ready : false,
      courses: courses.map(function (c) {
        return {
          courseId: String(c.courseId || '').trim(),
          publicCourseId: String(c.publicCourseId || '').trim(),
          name: String(c.name || c.courseName || '').trim(),
          status: c.status || 'active',
          cl: c.cl || '',
        };
      }),
    });
  } catch (e) { return err('讀取訓練班系統班列表失敗：' + e); }
}


// ===================== 訓練班：公開報名（轉發去該班 Script） ======================

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

  // v6.2.1：報名表全部欄位都轉發（canonical 名＋舊制別名，兩邊後端都收到，唔再靜默丟失）
  var payload = {
    action: 'addReg',
    // ── 基本 ──
    nameZh: b.nameZh, nameEn: b.nameEn || '', gender: b.gender || '', dob: b.dob || '',
    phone: b.phone, email: b.email,
    scoutDistrict: b.scoutDistrict || '', troop: b.troop || '',
    // ── 6.2.1 canonical 欄位（hub 全部寫入）──
    scoutId: b.scoutId || '',
    scoutPosition: firstVal_(b, 'scoutPosition', 'scoutRank'),
    reason: firstVal_(b, 'reason', 'extra'),
    consentParent: firstVal_(b, 'consentParent', 'guardianConsent'),
    gName: firstVal_(b, 'gName', 'guardianName'),
    gRelation: firstVal_(b, 'gRelation', 'guardianRelation'),
    gEmail: firstVal_(b, 'gEmail', 'guardianEmail'),
    gPhone: firstVal_(b, 'gPhone', 'guardianPhone'),
    consentLeader: firstVal_(b, 'consentLeader', 'leaderConsent'),
    leaderName: b.leaderName || '',
    leaderTitle: firstVal_(b, 'leaderTitle', 'leaderPosition'),
    leaderEmail: b.leaderEmail || '',
    payMethod: b.payMethod || 'FPS',
    payer: firstVal_(b, 'payer', 'payerName'),
    payAccount: b.payAccount || '',
    receiptDataUrl: b.receiptDataUrl || '',
    formDataUrl: firstVal_(b, 'formDataUrl', 'formShotDataUrl', 'formScreenshot', 'formUrl'),
    needReceipt: b.needReceipt || '',
    remark: firstVal_(b, 'remark', 'comment', 'note'),
    // ── 舊制（v4.13.0）別名：等舊班收表 Script 都收到全部欄 ──
    extra: firstVal_(b, 'reason', 'extra'),
    guardianConsent: firstVal_(b, 'consentParent', 'guardianConsent'),
    guardianName: firstVal_(b, 'gName', 'guardianName'),
    guardianRelation: firstVal_(b, 'gRelation', 'guardianRelation'),
    guardianEmail: firstVal_(b, 'gEmail', 'guardianEmail'),
    guardianPhone: firstVal_(b, 'gPhone', 'guardianPhone'),
    leaderConsent: firstVal_(b, 'consentLeader', 'leaderConsent'),
    leaderPosition: firstVal_(b, 'leaderTitle', 'leaderPosition'),
    payerName: firstVal_(b, 'payer', 'payerName'),
    note: firstVal_(b, 'remark', 'comment', 'note'),
    formUrl: firstVal_(b, 'formDataUrl', 'formShotDataUrl', 'formScreenshot', 'formUrl'),
    // ── 舊制收表 script 用（保持現有）──
    courseId: b.courseId, courseTitle: link.title || '',
    driveFolderId: link.driveFolderId || '',
    receiptFileName: b.receiptFileName || '', receiptMimeType: b.receiptMimeType || 'image/jpeg',
    memberType: b.memberType || '', section: link.section || '', badgeCode: link.badgeCode || '',
    region: b.region || '',
  };

  // 新制 hub 班：公開 addReg 只憑 publicCourseId（write-only，唔送 key／driveFolderId）
  if (courseIsHub_(link)) {
    var pubId = String(link.publicCourseId || '').trim();
    if (!pubId) return err('呢班未配對公開課程ID——請喺「🔗 連結」分頁由班名配對');
    delete payload.apiKey;
    delete payload.driveFolderId;
    payload.publicCourseId = pubId;
  } else {
    payload.apiKey = courseApiKey_(link);
  }

  var resp = UrlFetchApp.fetch(execUrl, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  var result = {};
  try { result = JSON.parse(resp.getContentText()); } catch (e) {}
  if (!result.ok) return err((result && result.error) || '訓練班收表失敗（HTTP ' + resp.getResponseCode() + '）');

  // refCode：兼容 {ok,data:{refCode}}（舊制）同 {ok,refCode}（hub 公開 addReg）
  var ref = (result.data && result.data.refCode) || result.refCode || '';

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
  var t = requirePermRead_(token, 'canCourse', 'training'); if (t.error) return err(t.error);
  var link = courseLinkById_(courseId);
  if (!link) return err('找不到此訓練班');
  var tgt = courseTarget_(link, { action: 'listRegs' });
  if (tgt.error) return ok([]);
  try {
    var resp = UrlFetchApp.fetch(tgt.execUrl, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(tgt.payload),
      muteHttpExceptions: true,
    });
    var r = {};
    try { r = JSON.parse(resp.getContentText()); } catch (e) { r = {}; }
    return r.ok ? ok(r.data || []) : err((r && r.error) || '讀取名單失敗');
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
  var t = requirePermRead_(token, 'canCourse', 'training'); if (t.error) return err(t.error);
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

// ===================== 電子鎖（通通鎖 TTLock / Sciener）/ 日曆 / 電郵 =====================
// 門鎖用 TTLock / Sciener（SKW 區現有硬件）。批准 → createTtlockPasscode_ 建限時密碼並回傳 pwdRef。
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
function ttlockReady_() {
  var c = lockCfg_();
  return !!(c.clientId && c.clientSecret && c.username && c.password);
}
function normalizeTtlockBase_(raw) {
  var b = String(raw || '').trim().replace(/\/+$/, '');
  if (!b || /^auto$/i.test(b)) return '';
  if (/^(global|ttlock)$/i.test(b)) return 'https://api.ttlock.com';
  if (/^(eu|intl|international)$/i.test(b)) return 'https://euapi.ttlock.com';
  if (/^cn$/i.test(b)) return 'https://cnapi.ttlock.com';
  if (/^sciener$/i.test(b)) return 'https://api.sciener.com';
  // 開放平台／管鎖網頁 ≠ API；自動轉去對應 API 主機
  if (/^https?:\/\/(www\.|lock2\.)?open\.sciener\.com$/i.test(b) || /^https?:\/\/lock2\.sciener\.com$/i.test(b)) return 'https://api.sciener.com';
  if (/^https?:\/\/(www\.)?open\.ttlock\.com$/i.test(b) || /^https?:\/\/lock2\.ttlock\.com$/i.test(b)) return 'https://api.ttlock.com';
  if (/^https?:\/\/euopen\.ttlock\.com$/i.test(b)) return 'https://euapi.ttlock.com';
  if (/^https?:\/\/cnopen\.ttlock\.com$/i.test(b)) return 'https://cnapi.ttlock.com';
  b = b.replace(/\/(oauth2\/token|v3\/.*)$/i, '');
  return b;
}
function ttlockBase_() {
  return normalizeTtlockBase_(lockCfg_().apiBase) || 'https://euapi.ttlock.com';
}
function ttlockBaseCandidates_() {
  var configured = normalizeTtlockBase_(lockCfg_().apiBase);
  var defaults = [
    'https://euapi.ttlock.com',
    'https://api.ttlock.com',
    'https://api.sciener.com',
    'https://cnapi.ttlock.com',
  ];
  var list = [];
  if (configured) list.push(configured);
  defaults.forEach(function (u) { if (list.indexOf(u) < 0) list.push(u); });
  return list;
}
function ttlockUsernameCandidates_(raw) {
  var u = String(raw || '').trim();
  if (!u) return [];
  var list = [u];
  var digits = u.replace(/[\s-]/g, '');
  if (/^[456789]\d{7}$/.test(digits)) {
    if (list.indexOf('852' + digits) < 0) list.push('852' + digits);
    if (list.indexOf('+852' + digits) < 0) list.push('+852' + digits);
  } else if (/^852\d{8}$/.test(digits)) {
    if (list.indexOf('+' + digits) < 0) list.push('+' + digits);
  } else if (/^\+852\d{8}$/.test(digits)) {
    if (list.indexOf(digits.slice(1)) < 0) list.push(digits.slice(1));
  }
  return list;
}
function ttlockPasswordHashes_(raw) {
  var p = String(raw || '');
  var m = md5_(p);
  var list = [m];
  if (/^[a-f0-9]{32}$/i.test(p) && p.toLowerCase() !== m) list.push(p.toLowerCase());
  return list;
}
function explainTtlockError_(data) {
  if (!data || typeof data !== 'object') return String(data || '未知錯誤');
  var code = Number(data.errcode);
  var rawMsg = data.errmsg || data.description || data.error_description || data.error || '';
  var hint = '';
  if (code === 10001 || code === 10002 || data.error === 'invalid_client') {
    hint = 'SCIENER_CLIENT_ID 或 SCIENER_CLIENT_SECRET 不正確（請核對開放平台 App ID／Secret，並確認應用已審核通過）';
  } else if (code === 10003) {
    hint = '找不到此管鎖帳號（請填 TTLock／Sciener 手機 App 登入帳號，唔係開放平台開發者帳號；香港電話請連 852 區號）';
  } else if (code === 10004 || code === 10007 || data.error === 'invalid_grant') {
    hint = '管鎖帳號密碼不正確（請核對 SCIENER_PASSWORD）';
  } else if (code === -2012 || code === -3002 || code === -3003 || code === 30002 || code === -4037) {
    hint = '門鎖未連接網關或 Gateway 離線，無法遠端寫入密碼（請確認區總部 WiFi 網關通電在線）';
  } else if (code === -2018 || code === 20002 || code === -1009) {
    hint = '找不到指定 Lock ID，或此帳號無該把鎖嘅管理權限（請重新「讀取鎖列表」核對 Lock ID）';
  } else if (code === -3007 || code === -3008) {
    hint = '門鎖拒絕此密碼格式或位數（如門鎖韌體要求 6 位密碼，可將 PWD_MODE 改為 random）';
  } else if (code === -3006 || code === -2019) {
    hint = '密碼有效起訖時間無效（結束時間必須遲於現在）';
  } else if (code === -3009) {
    hint = '門鎖內存密碼數量已滿，請先喺 App 清理過期密碼';
  }
  var detail = (data.errcode !== undefined ? 'errcode ' + data.errcode : '') + (rawMsg ? (data.errcode !== undefined ? ': ' : '') + rawMsg : '');
  if (hint) return hint + (detail ? '（' + detail + '）' : '');
  return detail || JSON.stringify(data);
}
function ttlockDisabled_() { return String(getConfigValue_('ttlockDisabled')).toUpperCase() === 'TRUE'; }

/**
 * 自動跨區（euapi / api.ttlock / api.sciener / cnapi）登入並定位門鎖所在伺服器。
 * opts: { fetchLocks?: boolean, targetLockId?: string }
 */
function ttlockConnect_(opts) {
  opts = opts || {};
  var c = lockCfg_();
  var missing = [];
  if (!c.clientId) missing.push('SCIENER_CLIENT_ID');
  if (!c.clientSecret) missing.push('SCIENER_CLIENT_SECRET');
  if (!c.username) missing.push('SCIENER_USERNAME');
  if (!c.password) missing.push('SCIENER_PASSWORD');
  if (missing.length) {
    throw new Error('未設定電子鎖金鑰：缺少 ' + missing.join('、') + '（可喺場地借用審批頁「電子鎖連線設定」直接填寫）');
  }
  var bases = ttlockBaseCandidates_();
  var users = ttlockUsernameCandidates_(c.username);
  var pwds = ttlockPasswordHashes_(c.password);
  var targetLock = String(opts.targetLockId || '').trim();
  var needLocks = !!opts.fetchLocks || !!targetLock;

  var bestConn = null;
  var lastErr = null;

  for (var bi = 0; bi < bases.length; bi++) {
    var base = bases[bi];
    var authedOnBase = false;
    for (var ui = 0; ui < users.length && !authedOnBase; ui++) {
      for (var pi = 0; pi < pwds.length && !authedOnBase; pi++) {
        var payload = {
          client_id: c.clientId,
          client_secret: c.clientSecret,
          username: users[ui],
          password: pwds[pi],
          grant_type: 'password',
        };
        var res = UrlFetchApp.fetch(base + '/oauth2/token', { method: 'post', payload: payload, muteHttpExceptions: true });
        var data = {};
        try { data = JSON.parse(res.getContentText()); } catch (e) { data = { error: res.getContentText().slice(0, 120) }; }
        if (data && data.access_token) {
          authedOnBase = true;
          if (!needLocks) {
            return { accessToken: data.access_token, apiBase: base, clientId: c.clientId, locks: [] };
          }
          var lRes = UrlFetchApp.fetch(base + '/v3/lock/list', {
            method: 'post',
            payload: { clientId: c.clientId, accessToken: data.access_token, pageNo: '1', pageSize: '50', date: String(Date.now()) },
            muteHttpExceptions: true,
          });
          var lData = {};
          try { lData = JSON.parse(lRes.getContentText()); } catch (e) { lData = {}; }
          var list = (lData && Array.isArray(lData.list)) ? lData.list : null;
          // 授權管理員（Authorized Admin）帳號嘅鎖唔喺 /v3/lock/list，而喺 /v3/key/list！若讀到 0 把或搵唔到目標鎖就自動補撈 /v3/key/list
          if (list && (list.length === 0 || (targetLock && !list.some(function (lk) { return String(lk.lockId) === targetLock; })))) {
            try {
              var kRes = UrlFetchApp.fetch(base + '/v3/key/list', {
                method: 'post',
                payload: { clientId: c.clientId, accessToken: data.access_token, pageNo: '1', pageSize: '50', date: String(Date.now()) },
                muteHttpExceptions: true,
              });
              var kData = JSON.parse(kRes.getContentText());
              if (kData && Array.isArray(kData.list) && kData.list.length > 0) {
                var seenLocks = {};
                list.forEach(function (lk) { seenLocks[String(lk.lockId)] = true; });
                kData.list.forEach(function (ek) {
                  if (ek.lockId && !seenLocks[String(ek.lockId)]) {
                    seenLocks[String(ek.lockId)] = true;
                    list.push({
                      lockId: ek.lockId,
                      lockAlias: ek.lockAlias || ek.keyName || ek.lockName || '',
                      lockName: ek.lockName || '',
                      lockMac: ek.lockMac || '',
                      hasGateway: ek.hasGateway !== undefined ? ek.hasGateway : 1,
                      electricQuantity: ek.electricQuantity,
                    });
                  }
                });
              }
            } catch (ke) {}
          }
          if (list) {
            var conn = { accessToken: data.access_token, apiBase: base, clientId: c.clientId, locks: list };
            if (targetLock && list.some(function (lk) { return String(lk.lockId) === targetLock; })) {
              return conn;
            }
            if (!bestConn || (bestConn.locks.length === 0 && list.length > 0)) {
              bestConn = conn;
            }
            if (list.length > 0 && !targetLock) return conn;
          } else {
            lastErr = lData;
          }
        } else {
          // 保留較具體嘅密碼錯誤（10004/10007）優先於跨區找不到帳號（10003）
          if (!lastErr || Number(lastErr.errcode) === 10003) lastErr = data;
          // 若 client_id / client_secret 錯，所有區都會一樣錯，無須重複試其他帳號變體
          if (Number(data.errcode) === 10001 || Number(data.errcode) === 10002 || data.error === 'invalid_client') {
            throw new Error('電子鎖連線失敗：' + explainTtlockError_(data));
          }
        }
      }
    }
  }
  if (bestConn) return bestConn;
  throw new Error('電子鎖登入失敗：' + explainTtlockError_(lastErr));
}

function ttlockToken_() {
  return ttlockConnect_({ fetchLocks: false }).accessToken;
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

/** phone4=電話頭4位（預設）；phone4tail=電話尾4位；random=隨機6位 */
function buildKeyboardPwd_(phone) {
  var mode = String(lockCfg_().pwdMode || 'phone4').toLowerCase();
  var digits = String(phone || '').replace(/\D/g, '');
  if (mode === 'phone4' || mode === 'phone4head') return (digits + '0000').slice(0, 4);
  if (mode === 'phone4tail') return digits.length >= 4 ? digits.slice(-4) : ('0000' + digits).slice(-4);
  return genPasscode_();
}

function phoneTail4_(phone) {
  var digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}

function phoneHead4_(phone) {
  var digits = String(phone || '').replace(/\D/g, '');
  return (digits + '0000').slice(0, 4);
}

/**
 * 頭4位模式：先試電話頭4位，再試電話尾4位，兩者都撞碼才逐個 +1。
 * phone4tail 模式順序相反；random 模式以 6 位隨機碼開始，之後逐個 +1。
 */
function passcodeCandidates_(phone) {
  var mode = String(lockCfg_().pwdMode || 'phone4').toLowerCase();
  var first = buildKeyboardPwd_(phone);
  var list = [first];
  var alternate = '';
  if (mode === 'phone4' || mode === 'phone4head') alternate = phoneTail4_(phone);
  else if (mode === 'phone4tail') alternate = phoneHead4_(phone);
  if (alternate && list.indexOf(alternate) < 0) list.push(alternate);

  var len = first.length;
  var mod = Math.pow(10, len);
  var cur = parseInt(first, 10) || 0;
  for (var i = 0; i < 6; i++) {
    cur = (cur + 1) % mod;
    var nextCode = String(cur).padStart(len, '0');
    if (list.indexOf(nextCode) < 0) list.push(nextCode);
  }
  return list;
}

/** 以香港時區 (+08:00) 解析借用起訖時間為毫秒 timestamp */
function parseVenueDateMs_(value, endOfDay) {
  if (value === undefined || value === null || value === '') return NaN;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return value.getTime();
  }
  var iso = toTeamupDt_(String(value), !!endOfDay);
  var d = new Date(iso);
  return d.getTime();
}

function formatHkDateTime_(dt) {
  if (!dt || isNaN(dt.getTime())) return '';
  return Utilities.formatDate(dt, 'Asia/Hong_Kong', 'yyyy-MM-dd HH:mm');
}

/** 從 Sciener / TTLock 撈鎖列表（自動跨區搜尋），方便一鍵綁定 Lock ID */
function getLockList_(token) {
  var t = requirePerm_(token, 'canVenue'); if (t.error) return err(t.error);
  try {
    var c = lockCfg_();
    var conn = ttlockConnect_({ fetchLocks: true, targetLockId: c.lockId });
    return ok({
      apiBase: conn.apiBase,
      configuredLockId: c.lockId,
      locks: conn.locks.map(function (lock) {
        return {
          lockId: lock.lockId,
          name: lock.lockAlias || lock.lockName || '',
          mac: lock.lockMac || '',
          hasGateway: lock.hasGateway === 1 || lock.hasGateway === true,
          electricQuantity: lock.electricQuantity,
        };
      }),
    });
  } catch (e) {
    return err(String((e && e.message) || e));
  }
}

/** 讀取鎖上既有鍵盤密碼；用於重用已過期密碼及避開仍有效的撞碼。 */
function listTtlockKeyboardPwds_(conn, lockId) {
  var rows = [];
  var pageSize = 100;
  for (var pageNo = 1; pageNo <= 20; pageNo++) {
    var payload = {
      clientId: conn.clientId,
      accessToken: conn.accessToken,
      lockId: String(lockId),
      pageNo: String(pageNo),
      pageSize: String(pageSize),
      date: String(Date.now()),
    };
    var res = UrlFetchApp.fetch(conn.apiBase + '/v3/lock/listKeyboardPwd', {
      method: 'post', payload: payload, muteHttpExceptions: true,
    });
    var data;
    try { data = JSON.parse(res.getContentText()); }
    catch (e) { throw new Error('讀取 TTLock 現有密碼清單失敗：' + res.getContentText().slice(0, 160)); }
    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300 || (data && data.errcode !== undefined && Number(data.errcode) !== 0)) {
      throw new Error('讀取 TTLock 現有密碼清單失敗：' + explainTtlockError_(data));
    }
    if (!data || !Array.isArray(data.list)) throw new Error('TTLock 密碼清單回應沒有 list，無法安全檢查重複碼');
    var page = data.list;
    if (page.some(function (row) { return row.keyboardPwd === undefined || row.keyboardPwd === null || String(row.keyboardPwd) === ''; })) {
      throw new Error('TTLock 密碼清單未回傳完整 keyboardPwd，無法安全檢查重複碼');
    }
    rows = rows.concat(page);
    var total = Number(data.total || data.totalCount || 0);
    if (page.length < pageSize || (total && rows.length >= total)) break;
    if (pageNo === 20 && total && rows.length < total) throw new Error('TTLock 密碼清單超過安全查詢上限，停止新增避免漏判重複碼');
  }
  return rows;
}

/** 未真正到期的鍵碼視為仍被預約，避免改寫另一筆未來申請正在使用的同一 keyboardPwdId。 */
function ttlockPwdOverlaps_(record, startMs, endMs) {
  var oldEnd = Number(record && record.endDate);
  if (!oldEnd) return true;
  // 即使舊時段與新時段不重疊，只要舊密碼現在仍未到期，就不可改寫同一條 key。
  return oldEnd > Date.now();
}

/** 重用既有 keyboardPwdId，只更新密碼名稱及有效期，不另開一條 key。 */
function changeTtlockPasscodePeriod_(conn, lockId, record, name, validFrom, validTo) {
  var payload = {
    clientId: conn.clientId,
    accessToken: conn.accessToken,
    lockId: String(lockId),
    keyboardPwdId: String(record.keyboardPwdId),
    keyboardPwdName: String(name || '申請人').substring(0, 30),
    startDate: String(validFrom.getTime()),
    endDate: String(validTo.getTime()),
    date: String(Date.now()),
  };
  var res = UrlFetchApp.fetch(conn.apiBase + '/v3/keyboardPwd/change', {
    method: 'post', payload: payload, muteHttpExceptions: true,
  });
  var data;
  try { data = JSON.parse(res.getContentText()); }
  catch (e) { data = { errmsg: res.getContentText().slice(0, 160) }; }
  if (res.getResponseCode() >= 200 && res.getResponseCode() < 300
    && (!data || data.errcode === undefined || Number(data.errcode) === 0)) {
    return { ok: true, data: data || {} };
  }
  return { ok: false, data: data || {} };
}

/** 只把明確的重複鍵碼錯誤當作撞碼；其他 API 失敗不可誤跳到 +1。 */
function isTtlockPwdCollision_(data) {
  var code = Number(data && data.errcode);
  if (code === -3007 || code === 3007) return true;
  var message = String((data && (data.errmsg || data.description || data.message)) || '').toLowerCase();
  return /duplicate|already exists|already used|password exists|keyboard.?pwd exists|重複|已存在|已使用/.test(message);
}

/** 建立或重用限時密碼；ttlockDisabled=TRUE 時返回模擬密碼。 */
function createTtlockPasscode_(phone, startDate, endDate, name, venueLockId) {
  var startMs = parseVenueDateMs_(startDate, false);
  var endMs = parseVenueDateMs_(endDate || startDate, true);
  if (isNaN(startMs) || isNaN(endMs)) {
    throw new Error('借用日期時間格式不正確（' + String(startDate || '') + ' → ' + String(endDate || '') + '）');
  }
  if (endMs < startMs) throw new Error('結束時間不可早於開始時間');
  var validFrom = new Date(startMs - 15 * 60 * 1000);
  var validTo = new Date(endMs + 15 * 60 * 1000);

  if (ttlockDisabled_()) {
    return {
      passcode: buildKeyboardPwd_(phone), pwdRef: 'SIMULATED', simulated: true,
      lockWritten: false, validFrom: validFrom, validTo: validTo, apiBase: '', lockId: '',
    };
  }
  if (validTo.getTime() <= Date.now()) {
    throw new Error('借用時段已過期（' + formatHkDateTime_(validTo) + '），電子鎖不接受過去時段密碼；請先編輯延長時間或改用「確認（唔設鎖）」');
  }

  var c = lockCfg_();
  var lockId = String(venueLockId || '').trim() || c.lockId;
  if (!lockId) {
    var probe = ttlockConnect_({ fetchLocks: true });
    var hintLock = probe.locks && probe.locks.length === 1 ? '（偵測到帳號內有門鎖 Lock ID：' + probe.locks[0].lockId + '，請於審批頁點「綁定為預設門鎖」）' : '（請先喺審批頁點「讀取鎖列表」並綁定門鎖）';
    throw new Error('未設定門鎖 Lock ID ' + hintLock);
  }

  var conn = ttlockConnect_({ targetLockId: lockId });
  var candidates = passcodeCandidates_(phone);
  var lastErr = null;
  var fatalCodes = [-2012, -3002, -3003, 30002, -4037, -2018, 20002, -1009, -3006, -2019, -3009, 10001, 10002, 10003, 10004];
  // 為免清單讀取失敗時又新增重複 key，先確認可讀取鎖上密碼清單；失敗即停止，不寫鎖。
  var existingPwds = listTtlockKeyboardPwds_(conn, lockId);

  for (var i = 0; i < candidates.length; i++) {
    var code = candidates[i];
    var matching = existingPwds.filter(function (row) {
      return String(row.keyboardPwd || '').trim() === code;
    });
    var overlapping = matching.filter(function (row) { return ttlockPwdOverlaps_(row, validFrom.getTime(), validTo.getTime()); });
    if (overlapping.length) {
      lastErr = { errcode: -3007, errmsg: '鍵盤碼 ' + code + ' 在申請時段仍被使用' };
      continue;
    }

    // 若同碼只存在於已過期／不重疊的舊記錄，優先更新該 keyboardPwdId。
    if (matching.length) {
      var reusable = matching.filter(function (row) { return !!row.keyboardPwdId; })[0];
      if (!reusable) {
        throw new Error('找到舊鍵盤碼 ' + code + '，但清單沒有 keyboardPwdId；為免新增重複 key，已停止寫鎖');
      }
      var changed = changeTtlockPasscodePeriod_(conn, lockId, reusable, name, validFrom, validTo);
      if (changed.ok) {
        reusable.startDate = validFrom.getTime();
        reusable.endDate = validTo.getTime();
        reusable.keyboardPwdName = String(name || '申請人').substring(0, 30);
        return {
          passcode: code, pwdRef: String(reusable.keyboardPwdId), simulated: false,
          lockWritten: true, validFrom: validFrom, validTo: validTo,
          apiBase: conn.apiBase, lockId: String(lockId), reused: true,
        };
      }
      lastErr = changed.data;
      throw new Error('找到同碼過期 key（ID ' + reusable.keyboardPwdId + '），但 TTLock 更新失敗；為免新增另一條 key，已停止寫鎖：' + explainTtlockError_(lastErr));
    }

    var payload = {
      clientId: conn.clientId,
      accessToken: conn.accessToken,
      lockId: String(lockId),
      keyboardPwd: code,
      keyboardPwdName: String(name || '申請人').substring(0, 30),
      keyboardPwdType: '3',
      startDate: String(validFrom.getTime()),
      endDate: String(validTo.getTime()),
      addType: '2',
      date: String(Date.now()),
    };
    var res = UrlFetchApp.fetch(conn.apiBase + '/v3/keyboardPwd/add', { method: 'post', payload: payload, muteHttpExceptions: true });
    var data;
    try { data = JSON.parse(res.getContentText()); } catch (e) { data = { errmsg: res.getContentText().slice(0, 120) }; }
    var addHttpOk = res.getResponseCode() >= 200 && res.getResponseCode() < 300;
    var addApiOk = !data || data.errcode === undefined || Number(data.errcode) === 0;
    if (addHttpOk && addApiOk) {
      if (!data || data.keyboardPwdId === undefined || data.keyboardPwdId === null || String(data.keyboardPwdId).trim() === '') {
        throw new Error('TTLock 新增密碼回應沒有 keyboardPwdId；無法確認已建立有效密碼，請檢查鎖上密碼清單後再重試');
      }
      var returnedPwdId = String(data.keyboardPwdId).trim();
      var idAlreadyExists = existingPwds.some(function (row) {
        return row.keyboardPwdId !== undefined && row.keyboardPwdId !== null
          && String(row.keyboardPwdId).trim() === returnedPwdId;
      });
      if (idAlreadyExists) {
        // add 回傳既有 ID 代表並未證實新 key 成功；視為本候選撞碼，按既定順序試下一候選。
        lastErr = { errcode: -3007, errmsg: 'TTLock 新增回應回傳既有 keyboardPwdId ' + returnedPwdId };
        continue;
      }
      return {
        passcode: code, pwdRef: returnedPwdId, simulated: false,
        lockWritten: true, validFrom: validFrom, validTo: validTo,
        apiBase: conn.apiBase, lockId: String(lockId), reused: false,
      };
    }
    lastErr = data;
    if (data && fatalCodes.indexOf(Number(data.errcode)) >= 0) break;
    if (!isTtlockPwdCollision_(data)) break;
  }
  throw new Error(explainTtlockError_(lastErr));
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
    attendeeFieldKey: getConfigValue_('TEAMUP_FIELD_ATTENDEE_KEY') || '',
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
  var leader = String(req.name || '') + (req.position ? '（' + String(req.position) + '）' : '');
  return '活動名稱：' + String(req.activityName || '') + '\n負責領袖：' + leader
    + '\n參加人數：' + String(req.attendeeCount || '')
    + '\n姓名：' + String(req.name || '') + '\n職位：' + String(req.position || '')
    + '\n電話：' + String(req.phone || '') + '\n電郵：' + String(req.email || '')
    + '\n旅團：' + String(req.troop || '') + '\n申請編號：' + String(req.refCode || '')
    + '\n用途：' + String(req.purpose || '');
}

/** Teamup 的領袖資料走內建 who 欄位；參加人數走 Config 指定的 custom field。 */
function teamupLeader_(req) {
  var leader = String(req && req.name || '').trim();
  var position = String(req && req.position || '').trim();
  return leader + (position ? ' ' + position : '');
}
function teamupCustomFields_(req) {
  var c = teamupCfg_();
  if (!c.attendeeFieldKey) {
    return { error: '請先在 Config 設定 TEAMUP_FIELD_ATTENDEE_KEY（此日曆參加人數欄位 key 為 1）' };
  }
  var count = Number(req && req.attendeeCount);
  if (!teamupLeader_(req) || !isFinite(count) || Math.floor(count) !== count || count < 1 || count > 9999) {
    return { error: 'Teamup 事件資料不完整（負責領袖姓名／職位或參加人數）' };
  }
  var custom = {};
  custom[c.attendeeFieldKey] = String(count);
  return { custom: custom, who: teamupLeader_(req) };
}
/** 正規化成 Teamup 需要嘅 ISO 起訖時間（香港 +08:00，絕不帶 .000Z 毫秒以免 Teamup HTTP 400） */
function toTeamupDt_(value, endOfDay) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, 'Asia/Hong_Kong', "yyyy-MM-dd'T'HH:mm:ss") + '+08:00';
  }
  var raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw + (endOfDay ? 'T23:59:00+08:00' : 'T00:00:00+08:00');
  }
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)) {
    var dTz = new Date(raw);
    if (!isNaN(dTz.getTime())) {
      return Utilities.formatDate(dTz, 'Asia/Hong_Kong', "yyyy-MM-dd'T'HH:mm:ss") + '+08:00';
    }
    return raw.replace(/\.\d{3}([zZ]|[+-]\d{2}:\d{2})$/, '$1');
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}/.test(raw)) {
    var t = raw.replace(' ', 'T');
    var parts = t.split('T');
    var hm = parts[1].replace(/\.\d+$/, '');
    if (/^\d:\d{2}/.test(hm)) hm = '0' + hm;
    if (hm.length === 5) hm += ':00';
    return parts[0] + 'T' + hm.slice(0, 8) + '+08:00';
  }
  var d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  if (endOfDay && raw.indexOf(':') < 0) { d.setHours(23, 59, 59, 999); }
  return Utilities.formatDate(d, 'Asia/Hong_Kong', "yyyy-MM-dd'T'HH:mm:ss") + '+08:00';
}

/** Teamup event start_dt/end_dt 可為 ISO 日期字串或 Unix timestamp。 */
function teamupEventDateMs_(value, endOfDay) {
  if (typeof value === 'number' && isFinite(value)) return value < 100000000000 ? value * 1000 : value;
  if (/^\d{10,13}$/.test(String(value || ''))) {
    var numeric = Number(value);
    return numeric < 100000000000 ? numeric * 1000 : numeric;
  }
  return parseVenueDateMs_(value, endOfDay);
}

/**
 * 檢查申請時段是否撞到紅色「已批」事件。
 * 藍色「申請中」事件刻意不納入檢查，容許多筆候批申請重疊。
 */
function checkApprovedTeamupOverlap_(startDate, endDate, excludeEventId) {
  var c = teamupCfg_();
  if (!c.apiKey || !c.calendarId || !c.approvedSub) {
    return { ok: false, error: '暫時無法確認已批借用時段，請稍後再試或聯絡管理員' };
  }
  var startMs = parseVenueDateMs_(startDate, false);
  var endMs = parseVenueDateMs_(endDate || startDate, true);
  if (!isFinite(startMs) || !isFinite(endMs) || endMs <= startMs) {
    return { ok: false, error: '借用時段格式不正確，請檢查開始及結束時間' };
  }

  // Teamup events API 接受日期範圍；前後各擴一天，確保跨日事件亦在查詢結果內，之後再精確比較時間。
  var dayMs = 24 * 60 * 60 * 1000;
  var queryStart = Utilities.formatDate(new Date(startMs - dayMs), 'Asia/Hong_Kong', 'yyyy-MM-dd');
  var queryEnd = Utilities.formatDate(new Date(endMs + dayMs), 'Asia/Hong_Kong', 'yyyy-MM-dd');
  var url = 'https://api.teamup.com/' + c.calendarId + '/events'
    + '?startDate=' + encodeURIComponent(queryStart)
    + '&endDate=' + encodeURIComponent(queryEnd)
    + '&subcalendarId%5B%5D=' + encodeURIComponent(String(c.approvedSub))
    + '&tz=' + encodeURIComponent('Asia/Hong_Kong');

  try {
    var res = teamupFetch_(url, { method: 'get' });
    if (res.code < 200 || res.code >= 300) {
      return { ok: false, error: '暫時無法確認已批借用時段（Teamup HTTP ' + res.code + '），請稍後再試' };
    }
    var data;
    try { data = JSON.parse(res.text || '{}'); }
    catch (parseError) { return { ok: false, error: '暫時無法讀取已批借用時段，請稍後再試' }; }
    if (!data || !Array.isArray(data.events)) {
      return { ok: false, error: 'Teamup 未回傳完整已批借用清單，為免重複預約請稍後再試' };
    }

    var approvedId = String(c.approvedSub);
    for (var i = 0; i < data.events.length; i++) {
      var event = data.events[i] || {};
      if (excludeEventId && String(event.id) === String(excludeEventId)) continue;
      if (event.delete_dt) continue;
      if (!Array.isArray(event.subcalendar_ids)) {
        return { ok: false, error: 'Teamup 已批事件缺少子日曆資料，為免重複預約請聯絡管理員' };
      }
      var subIds = event.subcalendar_ids;
      if (subIds.map(String).indexOf(approvedId) < 0) continue;
      var eventStart = teamupEventDateMs_(event.start_dt, false);
      var eventEnd = teamupEventDateMs_(event.end_dt, true);
      if (!isFinite(eventStart) || !isFinite(eventEnd)) {
        return { ok: false, error: 'Teamup 有已批事件時間無法辨認，為免重複預約請聯絡管理員' };
      }
      // 採半開區間：14:00–15:00 與 15:00–16:00 相連但不算重疊。
      if (eventStart < endMs && eventEnd > startMs) return { ok: true, conflict: true };
    }
    return { ok: true, conflict: false };
  } catch (e) {
    return { ok: false, error: '暫時無法確認已批借用時段，請稍後再試' };
  }
}

/** 申請人填表 → 喺「申請中」子日曆建事件 */
function createPendingTeamupEvent_(req) {
  var c = teamupCfg_();
  if (!teamupReady_()) return { ok: false, error: 'Teamup 尚未設定（TEAMUP_API_KEY / TEAMUP_CALENDAR_KEY）' };
  if (!c.pendingSub) return { ok: false, error: '未設定 TEAMUP_PENDING_SUBCAL_ID（申請中子日曆）' };
  var fields = teamupCustomFields_(req);
  if (fields.error) return { ok: false, error: fields.error };
  var title = '【申請】' + (req.venueName || req.venueId || '區總部') + ' · ' + req.activityName;
  return createTeamupEvent_(c.pendingSub, title, buildTeamupNotes_(req),
    toTeamupDt_(req.startDate, false), toTeamupDt_(req.endDate || req.startDate, true), fields.custom, fields.who);
}

/** 批准時建立紅色確認事件，成功後刪除舊藍色事件；任一步失敗都避免留下兩筆。 */
function applyTeamupApproved_(booking, extraNotes) {
  var out = { warn: '', eventId: String(booking.teamupEventId || '').trim() };
  if (!teamupReady_()) {
    out.warn = 'Teamup 未設定（已略過日曆同步）';
    return out;
  }
  try {
    var extra = extraNotes || '';
    var stamp = '\n✅ 已批准於 ' + formatHkDateTime_(new Date()) + extra;
    if (out.eventId) {
      var transfer = teamupMoveToApproved_(out.eventId, booking, stamp);
      if (!transfer.ok) out.warn = transfer.error;
      else out.eventId = transfer.eventId || out.eventId;
      return out;
    }

    var fields = teamupCustomFields_(booking);
    if (fields.error) {
      out.warn = fields.error;
      return out;
    }
    var ev = createTeamupEvent_(teamupCfg_().approvedSub,
      (booking.venueName || booking.venueId || '區總部') + '（已批准）',
      buildTeamupNotes_(booking) + stamp,
      toTeamupDt_(booking.startDate, false), toTeamupDt_(booking.endDate || booking.startDate, true), fields.custom, fields.who);
    if (!ev.ok) out.warn = ev.error || 'Teamup 建立確認事件失敗';
    else out.eventId = ev.eventId || '';
  } catch (e) {
    out.warn = e.message;
  }
  return out;
}
/** 將 Teamup 衝突回應轉為申請人可理解的提示。 */
function teamupEventErrorMessage_(code, text) {
  var data = {};
  try { data = JSON.parse(String(text || '{}')); } catch (ignore) {}
  var detail = data.error || data;
  var errorId = String((detail && detail.id) || data.type || '').toLowerCase();
  var message = String((detail && (detail.message || detail.detail || detail.title)) || '').toLowerCase();
  if (errorId === 'event_overlapping' || /event.overlapping|schedule conflict|排程衝突|時段.*重疊/.test(errorId + ' ' + message)) {
    return '該時段已有人使用或已有行事曆安排，請選擇其他時段後再申請。';
  }
  if (Number(code) === 403 || errorId === 'no_permission') {
    return 'Teamup 權限不足，申請未能提交；請聯絡管理員檢查日曆寫入權限。';
  }
  return 'Teamup 建立事件失敗 HTTP ' + code + '：' + String((detail && (detail.message || detail.detail)) || text || '未知錯誤');
}

/** 建立 Teamup 事件到指定子日曆 */
function createTeamupEvent_(subId, title, notes, startDt, endDt, customFields, who) {
  if (!teamupReady_() || !subId) return { ok: false, error: 'Teamup 尚未設定' };
  var eventBody = {
    subcalendar_ids: [parseInt(subId, 10)],
    title: title,
    notes: notes,
    start_dt: startDt,
    end_dt: endDt || startDt,
  };
  if (customFields) eventBody.custom = customFields;
  if (who) eventBody.who = who;
  var body = JSON.stringify(eventBody);
  var r = teamupFetch_('https://api.teamup.com/' + teamupCfg_().calendarId + '/events', { method: 'post', payload: body });
  if (r.code < 200 || r.code >= 300) return { ok: false, error: teamupEventErrorMessage_(r.code, r.text) };
  try {
    var data = JSON.parse(r.text);
    var eventId = data && data.event && data.event.id ? String(data.event.id) : '';
    if (!eventId) return { ok: false, error: 'Teamup 已回應建立事件，但沒有回傳 event ID；請檢查日曆確認事件狀態' };
    return { ok: true, eventId: eventId };
  } catch (e) {
    return { ok: false, error: 'Teamup 已回應建立事件，但回應格式無法確認 event ID；請檢查日曆確認事件狀態' };
  }
}
/** 建立紅色事件成功後才刪除舊事件；刪除失敗會回滾新事件，避免重複。 */
function teamupMoveToApproved_(eventId, booking, extraNotes) {
  var c = teamupCfg_();
  if (!eventId) return { ok: false, error: '冇 Teamup 事件 ID' };
  if (!c.approvedSub) return { ok: false, error: '未設定 TEAMUP_APPROVED_SUBCAL_ID' };
  var cur = teamupApi_('get', c.calendarId + '/events/' + eventId);
  if (!cur || !cur.event) return { ok: false, error: '找不到原 Teamup 事件（' + eventId + '），未建立紅色事件' };
  var ev = cur.event;
  var fields = teamupCustomFields_(booking || {});
  if (fields.error) return { ok: false, error: fields.error };
  var customFields = {};
  Object.keys(ev.custom || {}).forEach(function (key) { customFields[key] = ev.custom[key]; });
  Object.keys(fields.custom).forEach(function (key) { customFields[key] = fields.custom[key]; });
  var titleBase = (ev.title || booking.venueName || booking.venueId || '區總部')
    .replace('【申請】', '').replace('（已批准）', '').trim();
  var title = String(booking.venueName || booking.venueId || titleBase) + '（已批准）';
  var notes = String(ev.notes || buildTeamupNotes_(booking))
    .replace(/\n✅ 已批准於 [^\n]*/g, '')
    .replace(/\n🔑 密碼：[^\n]*/g, '') + (extraNotes || '');
  var startDt = ev.start_dt || toTeamupDt_(booking.startDate, false);
  var endDt = ev.end_dt || toTeamupDt_(booking.endDate || booking.startDate, true);

  var created = createTeamupEvent_(c.approvedSub, title, notes, startDt, endDt, customFields, fields.who);
  if (!created.ok || !created.eventId) {
    return { ok: false, error: created.error || '無法確認紅色事件 ID；原藍色事件保留，請管理員檢查 Teamup 日曆' };
  }

  var deleteError = '';
  try {
    var deleted = teamupFetch_('https://api.teamup.com/' + c.calendarId + '/events/' + eventId, { method: 'delete' });
    if (deleted.code >= 200 && deleted.code < 300) {
      return { ok: true, eventId: created.eventId };
    }
    deleteError = 'HTTP ' + deleted.code;
  } catch (e) {
    deleteError = '連線錯誤：' + String((e && e.message) || e);
  }

  // 藍色事件刪除失敗時，撤銷剛建立的紅色事件，避免同時留下兩筆。
  var rollbackOk = false;
  var rollbackError = '';
  try {
    var rollback = teamupFetch_('https://api.teamup.com/' + c.calendarId + '/events/' + created.eventId, { method: 'delete' });
    rollbackOk = rollback.code >= 200 && rollback.code < 300;
    if (!rollbackOk) rollbackError = 'HTTP ' + rollback.code;
  } catch (e) {
    rollbackError = '連線錯誤：' + String((e && e.message) || e);
  }
  return {
    ok: false,
    error: '紅色事件已建立，但刪除原事件失敗 ' + deleteError
      + (rollbackOk ? '；已撤銷紅色事件，藍色事件保留供重試'
        : '；撤銷紅色事件亦失敗（' + rollbackError + '），請管理員檢查 Teamup 事件 ' + created.eventId),
  };
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
    var customFields = {};
    Object.keys(ev.custom || {}).forEach(function (key) { customFields[key] = ev.custom[key]; });
    var fields = teamupCustomFields_(req);
    if (!fields.error) Object.keys(fields.custom).forEach(function (key) { customFields[key] = fields.custom[key]; });
    var body = {
      id: String(req.teamupEventId),
      subcalendar_ids: c.rejectedSub ? [Number(c.rejectedSub)] : (ev.subcalendar_ids || []),
      title: title,
      notes: notes,
      start_dt: ev.start_dt,
      end_dt: ev.end_dt,
      who: teamupLeader_(req) || ev.who || '',
      custom: customFields,
    };
    teamupApi_('put', c.calendarId + '/events/' + req.teamupEventId, body);
    return;
  }
  if (!c.rejectedSub) return;
  var custom = teamupCustomFields_(req);
  if (custom.error) throw new Error(custom.error);
  createTeamupEvent_(c.rejectedSub, title, notes,
    toTeamupDt_(req.startDate, false), toTeamupDt_(req.endDate || req.startDate, true), custom.custom, custom.who);
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
function sendVenueApprovalEmail_(req, passcode, validFrom, validTo) {
  var email = String(req.email || '').trim();
  if (!email) { console.log('無申請人電郵，跳過批准通知。'); return; }
  var cfg = venueMailConfig_();
  var name = req.name || '申請人';
  var validLine = (validFrom && validTo)
    ? ('<div style="font-size:12px;color:#166534;margin-top:6px;">密碼生效時段：' + esc_(formatHkDateTime_(validFrom)) + ' → ' + esc_(formatHkDateTime_(validTo)) + '（已含前後 15 分鐘緩衝）</div>')
    : '';
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
    + '<div style="font-size:13px;color:#166534;font-weight:bold;">🔑 電子門鎖入場密碼</div>'
    + '<div style="font-size:40px;font-weight:800;letter-spacing:6px;color:#166534;font-family:monospace;margin:10px 0;">' + esc_(passcode) + '#</div>'
    + '<div style="font-size:13px;color:#374151;">請於借用時段在門鎖鍵盤輸入 <b>' + esc_(passcode) + '</b> 後按 <b>#</b> 開鎖。</div>'
    + validLine
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
    description: String(c.cardId).trim() === 'dcFeedback'
      ? '只限區總監查閱（系統超級管理員亦可）'
      : c.description,
    order: Number(c.order) || 0,
    enabled: String(c.enabled).toUpperCase() !== 'FALSE',
    embed: String(c.embed).toUpperCase() === 'TRUE',
    source: c.source || 'core',
    category: String(c.category || 'done').trim() === 'todo' ? 'todo' : 'done',
  };
}
function getCards_(token) {
  var t = checkToken_(token);
  if (!t.valid) return err('登入已過期，請重新登入');
  if (t.source !== 'users' && !isMaintenanceSuper_(t.email, t.role)) return ok([]); // 舊 Staff session 不進入管理平台
  var perms = readPerms_();
  var u = readSheet_(SHEET.USERS).filter(function (x) {
    return String(x.email).trim().toLowerCase() === String(t.email).trim().toLowerCase();
  })[0];
  var isMaintenanceSuper = isMaintenanceSuper_(t.email, t.role);
  if (!isMaintenanceSuper && (!u || String(u.active).toUpperCase() === 'FALSE')) return ok([]);
  var isSuper = isMaintenanceSuper || levelOfUser_(t.email, t.role) === LEVEL_SUPER;
  var effRole = String((u && u.role) ? u.role : t.role || '').trim();
  var currentLevel = isSuper ? LEVEL_SUPER : levelOfUser_(t.email, effRole);
  var staffPermissions = staffPerms_(t.email, effRole);
  var scopeOverride = u && u.cards ? splitList_(u.cards) : null;
  var cards = readSheet_(SHEET.CARDS).map(normalizeCard_).filter(function (c) {
    // YMIS 帳密按明確角色白名單開放；層級 0 維護超管亦不可見。
    if (c.cardId === 'ymis' && !canViewYmisRole_(effRole)) return false;
    // 業務操作卡片須同時具備底層操作權，不可由舊 Perms 的 view/edit 格放寬。
    if (c.cardId === 'venueReg' && !staffPermissions.canVenue) return false;
    if (c.cardId === 'stockReg' && !staffPermissions.canStock) return false;
    if (c.cardId === 'training' && !staffPermissions.canCourse) return false;
    // 獎勵提名卡固定只向 DDC 或以上顯示，不能靠舊 Perms 的 view 格放寬。
    if (c.cardId === 'awards' && currentLevel > LEVEL_DDC) return false;
    // 房間月曆是所有已登入帳戶可讀功能，不依賴舊 Perms／個人卡片範圍。
    if (c.cardId === 'rooms' && c.enabled) { c.access = 'view'; return true; }
    // 隱藏卡片（enabled=FALSE）：只有層級 0 超管見到（用嚟私下加功能／升級），其他人一律睇唔到
    if (!c.enabled && !isSuper) return false;
    if (isSuper) { c.access = 'edit'; return true; }
    if (scopeOverride && scopeOverride.indexOf(c.cardId) < 0) return false;
    var access = (perms[c.cardId] || {})[effRole] || '';
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
      if (cid === 'ymis') {
        if (canViewYmisRole_(roles[j]) && (val === 'edit' || val === 'view')) out[cid][roles[j]] = 'view';
        continue;
      }
      if (val === 'edit' || val === 'view') out[cid][roles[j]] = val;
    }
  }
  return out;
}
function getPerms_(token) {
  var t = requireAdmin_(token); if (t.error) return err(t.error);
  var cards = readSheet_(SHEET.CARDS).map(normalizeCard_).sort(function (a, b) { return a.order - b.order; });
  var roles = readSheet_(SHEET.ROLES).map(function (r) {
    var role = String(r.role).trim();
    return { role: role, label: r.label || role, protected: String(r.protected).toUpperCase() === 'TRUE', level: levelOfRole_(role) };
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
      if (cid === 'ymis') row.push(canViewYmisRole_(role) ? 'view' : '');
      else row.push(v === 'edit' || v === 'view' ? v : '');
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
  var myLv = levelOfUser_(t.email, t.role);
  return ok(readSheet_(SHEET.USERS).filter(function (u) { return u.email; }).map(function (u) {
    var lv = levelOfUser_(u.email, u.role);
    return {
      email: String(u.email).trim(), displayName: u.displayName || '', role: u.role || '',
      scopes: u.scopes || '', cards: u.cards || '',
      active: String(u.active).toUpperCase() !== 'FALSE',
      level: lv, levelLabel: levelLabel_(lv),
      mustChangePassword: isTrue_(u.mustChangePassword),
      delegatedBy: u.delegatedBy || '',
    };
  }).filter(function (u) {
    // 超管帳戶只有超管本人見到（層級 0 隱藏）
    return u.level !== LEVEL_SUPER || myLv === LEVEL_SUPER;
  }));
}

// ===================== 授權 / 收回（v4.4.0） =====================
/**
 * 上級可以把「自己現時擁有」嘅卡片權限授予層級較低嘅角色，方便下級協助處理；
 * 上級亦可隨時一鍵收回下級嘅全部卡片權限。實作＝直接寫 Perms 表（角色 × 卡片）。
 */
function myCardAccess_(t) {
  var lv = levelOfUser_(t.email, t.role);
  var perms = readPerms_();
  var out = {};
  readSheet_(SHEET.CARDS).map(normalizeCard_).forEach(function (c) {
    if (lv === LEVEL_SUPER) { out[c.cardId] = 'edit'; return; }
    var a = (perms[c.cardId] || {})[t.role] || '';
    if (a === 'edit' || a === 'view') out[c.cardId] = a;
  });
  return out;
}
/** 我可以授權俾邊啲角色（層級比我低）＋ 我現有嘅卡片權限 */
function getDelegation_(token) {
  var t = requireLogin_(token); if (t.error) return err(t.error);
  var myLv = levelOfUser_(t.email, t.role);
  var perms = readPerms_();
  var roles = readSheet_(SHEET.ROLES).map(function (r) {
    var role = String(r.role).trim();
    return { role: role, label: r.label || role, level: levelOfRole_(role) };
  }).filter(function (r) { return r.level > myLv && r.role !== SYSADMIN_ROLE; });
  var cards = readSheet_(SHEET.CARDS).map(normalizeCard_).filter(function (c) { return c.enabled || myLv === LEVEL_SUPER; })
    .sort(function (a, b) { return a.order - b.order; });
  var mine = myCardAccess_(t);
  var matrix = {};
  roles.forEach(function (r) {
    matrix[r.role] = {};
    cards.forEach(function (c) { matrix[r.role][c.cardId] = (perms[c.cardId] || {})[r.role] || ''; });
  });
  return ok({
    me: { email: t.email, role: t.role, level: myLv, levelLabel: levelLabel_(myLv) },
    myAccess: mine,
    roles: roles,
    cards: cards.map(function (c) { return { cardId: c.cardId, title: c.title, icon: c.icon, enabled: c.enabled }; }),
    matrix: matrix,
  });
}
/** 授權：grants = { cardId: 'edit'|'view'|'' }；只可授出自己擁有（且不高於自己）嘅權限，只可授俾層級較低嘅角色 */
function delegatePerms_(token, targetRole, grants) {
  var t = requireLogin_(token); if (t.error) return err(t.error);
  targetRole = String(targetRole || '').trim();
  if (!targetRole || !getRoleObj_(targetRole)) return err('目標角色不存在');
  var myLv = levelOfUser_(t.email, t.role);
  var targetLv = levelOfRole_(targetRole);
  if (targetLv <= myLv) return err('只可以授權俾層級比你低嘅角色（' + levelLabel_(myLv) + ' → ' + levelLabel_(targetLv) + ' 不容許）');
  if (targetRole === SYSADMIN_ROLE) return err('不可更改超管權限');
  if (!grants || typeof grants !== 'object') return err('沒有授權資料');
  var mine = myCardAccess_(t);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.PERMS);
  if (!sh) return err('Perms 表不存在');
  var v = sh.getDataRange().getValues();
  var header = v[0].map(function (h) { return String(h).trim(); });
  var col = header.indexOf(targetRole);
  if (col < 0) { col = header.length; sh.getRange(1, col + 1).setValue(targetRole); header.push(targetRole); }
  var applied = 0, rejected = [];
  Object.keys(grants).forEach(function (cid) {
    var want = String(grants[cid] || '').toLowerCase();
    if (want !== 'edit' && want !== 'view' && want !== '') { rejected.push(cid + '：值不正確'); return; }
    var have = mine[cid] || '';
    if (want === 'edit' && have !== 'edit') { rejected.push(cid + '：你本身冇「可管理」權限'); return; }
    if (want === 'view' && !have) { rejected.push(cid + '：你本身冇此卡片權限'); return; }
    var row = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === cid) { row = i + 1; break; }
    if (row < 0) { sh.appendRow([cid]); row = sh.getLastRow(); }
    sh.getRange(row, col + 1).setValue(want);
    applied++;
  });
  // 記錄授權人（Users 表 delegatedBy：每個屬於該角色嘅帳戶）
  try {
    var ush = ss.getSheetByName(SHEET.USERS);
    var uv = ush.getDataRange().getValues();
    var uh = uv[0].map(function (h) { return String(h).trim(); });
    var cRole = uh.indexOf('role'), cBy = uh.indexOf('delegatedBy');
    if (cRole >= 0 && cBy >= 0) {
      for (var r = 1; r < uv.length; r++) {
        if (String(uv[r][cRole]).trim() === targetRole) ush.getRange(r + 1, cBy + 1).setValue(t.email + ' @ ' + new Date().toISOString().slice(0, 16).replace('T', ' '));
      }
    }
  } catch (e) {}
  return ok({ applied: applied, rejected: rejected });
}
/** 收回：把某個較低層級角色（或所有較低層級角色）嘅全部卡片權限清空 */
function revokePerms_(token, targetRole) {
  var t = requireLogin_(token); if (t.error) return err(t.error);
  var myLv = levelOfUser_(t.email, t.role);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.PERMS);
  if (!sh) return err('Perms 表不存在');
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return ok({ revoked: 0 });
  var header = v[0].map(function (h) { return String(h).trim(); });
  var targets = [];
  if (targetRole && String(targetRole).trim() !== '*') {
    targetRole = String(targetRole).trim();
    if (!getRoleObj_(targetRole)) return err('目標角色不存在');
    if (levelOfRole_(targetRole) <= myLv) return err('只可以收回層級比你低嘅角色權限');
    targets.push(targetRole);
  } else {
    header.slice(1).forEach(function (r) { if (r && levelOfRole_(r) > myLv && r !== SYSADMIN_ROLE) targets.push(r); });
  }
  var revoked = 0;
  targets.forEach(function (role) {
    var col = header.indexOf(role);
    if (col < 1) return;
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][col] || '').trim()) { sh.getRange(i + 1, col + 1).setValue(''); revoked++; }
    }
  });
  return ok({ revoked: revoked, roles: targets });
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
    else if (isLegacySharedPassword_(password)) reason = '不可使用共用初始密碼';
    else if (existing[email] || seen[email]) reason = '電郵已存在或重複';
    if (reason) { rejected.push({ row: i + 1, email: email, reason: reason }); return; }
    var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    rows.push({
      email: email, passwordHash: sha256_(password + salt), salt: salt, role: role, displayName: name,
      scopes: String(u.scopes || '').trim(), cards: String(u.cards || '').trim(), active: 'TRUE',
      level: levelOfRole_(role), mustChangePassword: 'TRUE', delegatedBy: '',
    });
    seen[email] = true;
  });
  if (rows.length) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS);
    rows.forEach(function (r) { appendRowObj_(sh, r); });
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
  // 層級守則：只可管理層級比自己低嘅帳戶（超管 0 可管所有；本人除外由 changePassword 處理）
  var myLv = levelOfUser_(t.email, t.role), curLv = current ? levelOfUser_(current.email, curRole) : LEVEL_OTHER;
  if (myLv !== LEVEL_SUPER && curLv <= myLv) return err('只可以管理層級比你低嘅帳戶（' + levelLabel_(curLv) + '）');
  if (patch.resetToDefault) {
    // 舊 API 欄名保留相容，但改為每次產生隨機一次性密碼，不再重設成共享預設值。
    var temporaryPassword = temporaryPassword_();
    setPassword_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS), row, temporaryPassword);
    setCellByHeader_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS), row, 'mustChangePassword', 'TRUE');
    return ok({ saved: true, resetToDefault: true, temporaryPassword: temporaryPassword });
  }
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
    var passwordError = validateNewPassword_(patch.password); if (passwordError) return err(passwordError);
    setPassword_(sh, row, patch.password);
    setCellByHeader_(sh, row, 'mustChangePassword', 'TRUE'); // 上級代設密碼 → 下級首次登入要改
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
  var myLv = levelOfUser_(t.email, t.role), curLv = current ? levelOfUser_(current.email, curRole) : LEVEL_OTHER;
  if (myLv !== LEVEL_SUPER && curLv <= myLv) return err('只可以刪除層級比你低嘅帳戶');
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
  var v = validateNewPassword_(newPassword); if (v) return err(v);
  var row = userRowIndex_(t.email);
  if (row < 0) return err('找不到帳戶');
  var current = readSheet_(SHEET.USERS).filter(function (u) {
    return String(u.email).trim().toLowerCase() === String(t.email).trim().toLowerCase();
  })[0];
  if (!current) return err('找不到帳戶');
  if (sha256_(String(oldPassword) + (current.salt || '')) !== String(current.passwordHash).trim()) return err('舊密碼不正確');
  setPassword_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS), row, newPassword);
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
    var pwError = validateNewPassword_(staff.password); if (pwError) return err(pwError);
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
  var pwError = validateNewPassword_(newPassword); if (pwError) return err(pwError);
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
function escapeHtml_(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function showKeyDialog_(title, key, note) {
  var ui = safeUi_();
  var isApiKey = String(title || '').indexOf('API Key') >= 0;
  var prompt = isApiKey ? '請即刻複製下面嘅 API Key：' : '請複製下面嘅橋接密鑰（可再次從選單顯示）：';
  var footer = isApiKey
    ? '同一個 Key 要設定去兩個 Vercel 環境變數：PORTAL_{區碼}_APIKEY 同 MEMBER_{區碼}_APIKEY。'
    : '請將密鑰複製並保存在 Vercel 環境變數。';
  if (!ui) {
    var msg = '\n╔══════════════════════════════════════╗\n'
      + '  ' + title + '\n'
      + '╚══════════════════════════════════════╝\n'
      + '  ' + prompt + '\n\n'
      + '  ' + key + '\n\n'
      + (note ? '  ' + note + '\n' : '') + '  ' + footer + '\n';
    Logger.log(msg); console.log(msg);
    return;
  }
  var safeKey = escapeHtml_(key);
  var safeNote = escapeHtml_(note || '');
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,-apple-system,\'Noto Sans TC\',sans-serif;padding:8px 4px">'
    + '<p style="margin:0 0 8px">' + escapeHtml_(prompt) + '</p>'
    + '<input id="k" value="' + safeKey + '" readonly style="width:100%;padding:10px;font-size:15px;'
    + 'font-family:ui-monospace,Menlo,Consolas,monospace;border:2px solid #1565c0;border-radius:6px" />'
    + '<p style="margin:10px 0 0;color:#b00">' + safeNote + '</p>'
    + '<p style="margin:8px 0 0;color:#666;font-size:12px">' + escapeHtml_(footer) + '</p>'
    + '<script>var i=document.getElementById("k");i.focus();i.select();<\/script>'
    + '</div>'
  ).setWidth(560).setHeight(250);
  ui.showModalDialog(html, title);
}

// ===================== API Key 管理 =====================

function newApiKey_() {
  return 'ak_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function generateApiKey_(ss, allowGenerate) {
  var sh = ss.getSheetByName(SHEET.CONFIG);
  if (!sh) return '';
  ensureConfigRow_(sh, 'API_KEY_HASH', '', 'setup 自動生成；API_KEY 的 SHA-256 雜湊值。明文不會儲存在此。');
  if (!allowGenerate) return ''; // 舊 Config 空 hash 代表 fail-closed；不可 setup 時默默換 Key。
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

function protectSensitiveSheets_(ss, newlyCreatedNames) {
  var me = '';
  try { me = Session.getEffectiveUser().getEmail() || ''; } catch (e) { me = ''; }
  [SHEET.CONFIG, SHEET.USERS, SHEET.STAFF, SHEET.COURSE_LINKS, SHEET.INCIDENT_REQ, SHEET.DEBIT_NOTES, SHEET.FEEDBACK, SHEET.DC_FEEDBACK].forEach(function (name) {
    if (Array.isArray(newlyCreatedNames) && newlyCreatedNames.indexOf(name) < 0) return;
    try {
      var sh = ss.getSheetByName(name);
      if (!sh) return;
      sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) {
        if (p.getDescription().indexOf('童軍區統一後台') === 0) p.remove();
      });
      var prot = sh.protect().setDescription('童軍區統一後台：保護系統敏感資料（禁止直接編輯）');
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

function getDCFeedbackSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.DC_FEEDBACK);
}
function feedbackSheetHasHeaders_(sh) {
  if (!sh) return false;
  var h = sheetHeadersBySheet_(sh);
  return FEEDBACK_HEADERS.every(function (name) { return h.indexOf(name) >= 0; });
}
function feedbackReady_() {
  return feedbackSheetHasHeaders_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.FEEDBACK));
}
function dcFeedbackReady_() {
  return feedbackSheetHasHeaders_(getDCFeedbackSheet_());
}
function ensureDCFeedbackStore_(ss) {
  try {
    // DCConfidential is a tab in the existing main spreadsheet. Create only if missing;
    // never clear or replace existing rows. Read access in the management app/API is role restricted.
    var sh = ss.getSheetByName(SHEET.DC_FEEDBACK);
    if (!sh) sh = ss.insertSheet(SHEET.DC_FEEDBACK);
    ensureFeedbackHeaders_(sh);
    return feedbackSheetHasHeaders_(sh);
  } catch (e) {
    console.error('ensureDCFeedbackStore failed: ' + e);
    return false;
  }
}
function notifyDCFeedback_(record) {
  var to = String(getConfigValue_('DC_NOTIFY_EMAIL') || '').trim();
  if (!to) return;
  try {
    MailApp.sendEmail(to,
      '收到新的 DC 保密留言（' + record.refCode + '）',
      '系統已安全收妥一則新的 DC 保密留言。\n參考編號：' + record.refCode + '\n\n請登入區統一後台「DC 保密留言」查看。電郵不包含留言內容。');
  } catch (e) {
    console.error('DC feedback notification failed: ' + e);
  }
}

// ===================== 健康檢查 =====================

function getHealthCheck_() {
  var r = { ok: true };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    r.districtName = getConfigValue_('districtName') || '';
    r.districtCode = districtCode_();
    r.apiKeySet = !!getConfigValue_('API_KEY_HASH');
    r.tokenSecretSet = !!getTokenSecret_();
    r.masterProxyBridgeSet = !!getMasterProxySecret_();
    r.feedbackReady = feedbackReady_();
    r.dcFeedbackReady = dcFeedbackReady_();
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
    + 'Token 簽署密鑰：' + (h.tokenSecretSet ? '已設定 ✅' : '未設定 ❌') + '\n'
    + '維護登入橋接密鑰：' + (h.masterProxyBridgeSet ? '已設定 ✅' : '未設定 ❌') + '\n'
    + '一般意見箱：' + (h.feedbackReady ? '就緒 ✅' : '未就緒 ❌') + '\n'
    + 'DC 保密意見分頁：' + (h.dcFeedbackReady ? '就緒 ✅' : '未就緒 ❌') + '\n'
    + '缺少的工作表：' + (missing.length ? missing.join('、') : '無 ✅')
    + (missing.length ? '\n\n→ 執行選單「🧱 補建缺失表」' : ''));
}

// ===================== 選單 =====================

function showMasterProxySecretMenu() {
  var secret = getMasterProxySecret_();
  if (!secret) {
    ensureMasterProxySecret_();
    secret = getMasterProxySecret_();
  }
  if (!secret) { uiAlert_('錯誤', '無法讀取維護登入橋接密鑰，請先執行 setupSheets()。'); return; }
  var code = districtCode_() || '區碼';
  showKeyDialog_('🔐 Vercel 維護登入橋接密鑰', secret,
    '請將此密鑰設為 Vercel 環境變數 PORTAL_' + code + '_MASTER_BRIDGE_SECRET。');
}

function onOpen() {
  var ui = safeUi_();
  if (!ui) return;
  ui.createMenu('🧭 區統一後台')
    .addItem('🔑 重新生成 API Key', 'regenerateApiKeyMenu')
    .addItem('🔐 顯示 Vercel 維護橋接密鑰', 'showMasterProxySecretMenu')
    .addItem('🩺 健康檢查', 'healthCheckMenu')
    .addSeparator()
    .addItem('🧱 補建缺失表（不清空資料）', 'setupSheets')
    .addItem('🔐 改單一帳號密碼', 'setUserPasswordMenu')
    .addSeparator()
    .addItem('📋 顯示設定步驟', 'showSetupReminder')
    .addToUi();
}
function showSetupReminder() {
  uiAlert_('設定步驟',
    '1. Config 填 districtName（區名）、districtCode（區碼）\n'
    + '2. 使用忘記密碼或管理員一次性臨時密碼設定帳戶；共用初始密碼已停用\n'
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
  var permRows = (function () {
    function row(cid, map) { var r = [cid]; ROLE_LIST.forEach(function (x) { r.push(map[x] || ''); }); return r; }
    var ALL_VIEW = {}, ALL_EDIT = {};
    ROLE_LIST.forEach(function (r) { ALL_VIEW[r] = 'view'; ALL_EDIT[r] = 'edit'; });
    function adminEdit() { var m = {}; ROLE_LIST.forEach(function (r) { m[r] = 'view'; }); m.DC = 'edit'; m.SYSADMIN = 'edit'; m.DDC_ADMIN = 'edit'; return m; }
    function opsEdit() { var m = adminEdit(); m.DDC_TRAINING = 'edit'; m.STAFF = 'edit'; return m; }
    // v4.9.0：獎勵提名只限 DDC 或以上（層級 0–2）進入 — ADC／STAFF／區長／領袖一律冇 access
    function ddcUp() { var m = {}; ROLE_LIST.forEach(function (r) { m[r] = ''; }); m.DC = 'edit'; m.SYSADMIN = 'edit'; m.DDC_ADMIN = 'edit'; m.DDC_TRAINING = 'view'; return m; }
    function trainingEdit() { var m = {}; ROLE_LIST.forEach(function (r) { m[r] = 'view'; }); m.DC = 'edit'; m.SYSADMIN = 'edit'; m.DDC_TRAINING = 'edit'; return m; }
    function circularsEdit() { var m = {}; ROLE_LIST.forEach(function (r) { m[r] = 'view'; }); m.DC = 'edit'; m.SYSADMIN = 'edit'; m.DDC_ADMIN = 'edit'; m.DDC_TRAINING = 'edit'; m.ADC_ROVER = 'edit'; m.ADC_VENTURE = 'edit'; m.ADC_SCOUT = 'edit'; m.ADC_CUBS = 'edit'; m.ADC_GH = 'edit'; m.STAFF = 'edit'; return m; }
    var P = [['cardId'].concat(ROLE_LIST)];
    P.push(row('visit', ALL_EDIT));
    P.push(row('contacts', ALL_EDIT));
    P.push(row('awards', ddcUp()));
    P.push(row('budget', adminEdit()));
    P.push(row('committee', { DC: 'edit', SYSADMIN: 'edit', DDC_ADMIN: 'edit' }));
    P.push(row('unit', adminEdit()));
    P.push(row('venueReg', opsEdit()));
    P.push(row('stockReg', opsEdit()));
    P.push(row('activity', opsEdit()));
    // v4.9.0：消息發佈搬咗去主控台頂（ADC+ 直接編輯），news 卡片已移除
    P.push(row('incident', ALL_VIEW));
    P.push(row('training', trainingEdit()));
    P.push(row('circulars', circularsEdit()));
    P.push(row('fps', ALL_EDIT));
    P.push(row('debitNote', { DC: 'edit', SYSADMIN: 'edit', DDC_ADMIN: 'edit', STAFF: 'edit' }));
    P.push(row('feedback', { DC: 'edit', SYSADMIN: 'edit', DDC_ADMIN: 'view', DDC_TRAINING: 'view', STAFF: 'view' }));
    P.push(row('dcFeedback', { DC: 'edit', SYSADMIN: 'edit' }));
    P.push(row('rooms', ALL_VIEW));
    P.push(row('orgchart', ALL_VIEW));
    P.push(row('ymis', ALL_VIEW));
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
      ['DC_NOTIFY_EMAIL', '', '（選填）DC 保密留言通知收件人；只寄通知，不在電郵內包含留言內容'],
      // 借場一條龍（Teamup + 通通鎖 TTLock）
      ['TEAMUP_API_KEY', '', 'Teamup API Token（兼容舊欄名 teamupApiKey）'],
      ['TEAMUP_CALENDAR_KEY', '', 'Teamup 分享金鑰 ks...（兼容舊 teamupCalendarId）'],
      ['TEAMUP_PENDING_SUBCAL_ID', '', '藍色（申請中）子日曆'],
      ['TEAMUP_APPROVED_SUBCAL_ID', '', '紅色（已批）子日曆（兼容舊 teamupApprovedSubId）'],
      ['TEAMUP_REJECTED_SUBCAL_ID', '', '(選填) 拒絕子日曆（兼容舊 teamupRejectedSubId）'],
      ['TEAMUP_BOOKING_URL', '', '公開唯讀月曆連結'],
      ['TEAMUP_FIELD_ATTENDEE_KEY', '', 'Teamup custom field key：參加人數（本日曆 API 回應顯示為 1）'],
      ['SCIENER_CLIENT_ID', '', 'Sciener 開放平台 app_id（兼容 ttlockClientId）'],
      ['SCIENER_CLIENT_SECRET', '', 'Sciener app_secret（兼容 ttlockClientSecret）'],
      ['SCIENER_USERNAME', '', '管鎖帳號（lock2.sciener.com / App，唔係開放平台帳）'],
      ['SCIENER_PASSWORD', '', '管鎖密碼'],
      ['SCIENER_LOCK_ID', '', '大門 Lock ID（數字；Config 係「一列 key」唔係欄。可用審批頁「讀取鎖列表」）'],
      ['SCIENER_API_BASE', '', 'API 主機（留空自動跨區偵測 euapi.ttlock.com / api.ttlock.com / api.sciener.com；切勿填 open.* 網站）'],
      ['PWD_MODE', 'phone4', 'phone4=頭4位，撞碼試尾4再逐個+1；phone4tail=尾4位，撞碼試頭4再逐個+1；random=隨機6位'],
      ['ttlockClientId', '', '（舊名）等同 SCIENER_CLIENT_ID'],
      ['ttlockClientSecret', '', '（舊名）等同 SCIENER_CLIENT_SECRET'],
      ['ttlockUsername', '', '（舊名）等同 SCIENER_USERNAME'],
      ['ttlockPassword', '', '（舊名）等同 SCIENER_PASSWORD'],
      ['ttlockLockId', '', '（舊名）等同 SCIENER_LOCK_ID'],
      ['ttlockApiBase', '', '（舊名）等同 SCIENER_API_BASE'],
      ['ttlockDisabled', '', 'TRUE = 跳過寫鎖，改用模擬密碼'],
      ['notifyFrom', '', '寄件人顯示名稱（不是 Gmail 地址；留空用區名）'],
      // v4.17.0 訓練班新版流程：CL 電郵 alias＋開班指引（CourseFactory）
      ['COURSE_EMAIL_FROM', '', '（選填）通知寄件 alias；留空=用部署帳戶地址＋ReplyTo 班信箱（CL 回覆去班信箱，唔入機房 inbox）'],
      ['COURSE_EMAIL_FROM_MODE', '', 'course = 寄件人直接用該班班信箱（須先喺部署帳戶 Gmail「用這個地址傳送郵件」＋班信箱 SMTP 驗證；未驗證自動 fallback）；留空=上式'],
      ['COURSE_FACTORY_URL', '', 'CourseFactory 開班網址（/exec）——CL 喺訓練班 App「新開班」用'],
      ['COURSE_FACTORY_CODE', '', '開班碼（明文；只交俾 CL，季度更換）'],
      // v6.2.1 對接：新制 CourseHub 共用 /exec＋區系統密匙（opsKey）——靠 CL 條 GS 網址（fileId）對班
      ['COURSE_HUB_URL', '', '新制訓練班 CourseHub /exec（全部班共用；= CL 交嚟嘅 Script 網址）。設咗先用 opsKey＋fileId 路'],
      ['COURSE_OPS_KEY', '', '區系統密匙（opsKey）：喺訓練班系統「設定」分頁攞（後台 adminListCourses.secrets.opsKey 都攞得返）'],
      // 付款 / 規定
      ['FPS_ACCOUNT_NAME', DEFAULT_FPS_ACCOUNT_NAME, '轉數快戶口名'],
      ['FPS_ACCOUNT_NUMBER', DEFAULT_FPS_ACCOUNT_NUMBER, '轉數快號碼'],
      ['BUDGET_SHEET_URL', '', '區年度預算 Google Sheet 網址（連 gid=分頁；Sheet 要設「知道連結可查看」；留空用前端內建）'],
      // 獎勵提名：民青局局長嘉許提名期死線（MM-DD；留空用內建 01-15 / 02-03）
      ['AWARD_HAB_DL_DISTRICT', '', '民青局嘉許 區→總會死線（MM-DD，例 01-15；留空用內建）'],
      ['AWARD_HAB_DL_HQ', '', '民青局嘉許 總會→民青局死線（MM-DD，例 02-03；留空用內建）'],
      ['VENUE_RULES', '', '借場規定（留空用內建）'],
      ['CCTV_URL', '', '閉路電視指引 PDF'],
      ['STOCK_RULES', '', '借物資規定（留空用內建）'],
      // 服務轉發（借物資／活動知會；借場提交固定由本 GS 處理）
      ['STOCK_SCRIPT_URL', '', '【借物資】外部收表 Script（留空=寫入本表）'],
      ['STOCK_SCRIPT_APIKEY', '', ''],
      ['VENUE_SCRIPT_URL', '', '【舊設定，不再用於提交】借場現由本 GS 寫 VenueBookings + Teamup 藍色申請事件'],
      ['VENUE_SCRIPT_APIKEY', '', ''],
      ['ACTIVITY_SCRIPT_URL', '', '【活動知會】外部收表 Script（留空=寫入本表）'],
      ['ACTIVITY_SCRIPT_APIKEY', '', ''],
      ['MEMBER_PORTAL_URL', '', '成員系統網址（通告「報名辦法」＋訓練班報名連結用；例 https://xxx.vercel.app）'],
      ['COURSE_TEMPLATE_ID', '', '【新制直入】訓練班總模版試算表 ID（空白 Sheet 跑一次訓練班模版 setupCourseSheet，貼 ID 入嚟；自動建班 Sheet 用）'],
      ['COURSE_FOLDER_ID', '', '【新制直入】新班 Sheet 放邊個 Drive 資料夾 ID（留空 = 根目錄）'],
    ] },

    { name: SHEET.SYSTEM, rows: [
      ['key', 'value'],
      ['locked', 'FALSE'],
      ['lockMessage', '系統維護中，請稍候再試。'],
    ] },

    { name: SHEET.ROLES, rows: [
      ['role', 'label', 'protected', 'level'],
      ['DC', '區總監', 'TRUE', 1],
      ['SYSADMIN', '系統管理員（超管）', 'TRUE', 0],
      ['DDC_ADMIN', '副區總監（行政）', 'TRUE', 2],
      ['DDC_TRAINING', '副區總監（訓練）', 'TRUE', 2],
      ['ADC_ROVER', '助理區總監（樂行）', 'TRUE', 3],
      ['ADC_VENTURE', '助理區總監（深資）', 'TRUE', 3],
      ['ADC_SCOUT', '助理區總監（童軍）', 'TRUE', 3],
      ['ADC_CUBS', '助理區總監（幼童軍）', 'TRUE', 3],
      ['ADC_GH', '助理區總監（小童軍）', 'TRUE', 3],
      ['DL', '區長', 'TRUE', 5],
      ['LEADER', '區領袖', 'TRUE', 5],
      ['AL', '助理區領袖', 'TRUE', 5],
      ['STAFF', '區職員（受薪）', 'TRUE', 4],
    ] },

    { name: SHEET.CARDS, rows: [
      ['cardId', 'title', 'icon', 'type', 'url', 'description', 'order', 'enabled', 'embed', 'source', 'category'],
      ['visit', '旅團探訪', '🏕', 'builtin', '/visit', '一撳登記探訪 · 未探旅團紅燈 · 季度報告', 1, 'TRUE', 'FALSE', 'core', 'done'],
      ['contacts', '聯絡簿', '📇', 'builtin', '/contacts', '聯絡電話：旅團 · 港島地域 · 總會（職員姓名區方可改）', 2, 'TRUE', 'FALSE', 'core', 'done'],
      ['awards', '獎勵提名', '🎖', 'builtin', '/awards', '獎勵名冊 · 自動計夠期可提名 · 年期自訂', 3, 'TRUE', 'FALSE', 'core', 'done'],
      ['circulars', '區通告', '📜', 'builtin', '/circulars', '開班資料自動帶入 · 傳統通告列印 PDF 上載區網', 4, 'TRUE', 'FALSE', 'core', 'done'],
      ['budget', '區年度預算', '📑', 'builtin', '/budget', '直讀區方預算 Sheet · 按月／支部 · 資助合計', 5, 'TRUE', 'FALSE', 'core', 'done'],
      ['ymis', 'YMIS 會員核實', '🪪', 'builtin', '/ymis', '前往 YMIS 並查看區方核實帳戶', 6, 'TRUE', 'FALSE', 'core', 'done'],
      ['committee', '委任系統', '🗂', 'builtin', '/committee', '委任 · 續任 · R02', 7, 'TRUE', 'FALSE', 'core', 'todo'],
      ['unit', '旅團管理系統', '🧭', 'builtin', '/unit', '旅名冊 · 人數統計', 8, 'TRUE', 'FALSE', 'core', 'todo'],
      ['venueReg', '場地借用審批', '🏛', 'builtin', '/venue-regs', '借場申請批核 · 場地清單', 9, 'TRUE', 'FALSE', 'core', 'done'],
      ['stockReg', '物資借用審批', '📦', 'builtin', '/stock-regs', '借物資批核 · 庫存管理', 10, 'TRUE', 'FALSE', 'core', 'done'],
      ['activity', '活動知會', '🗓', 'builtin', '/activity-notices', '旅團活動知會記錄', 11, 'TRUE', 'FALSE', 'core', 'done'],
      ['incident', '意外 / 應變', '🚨', 'builtin', '/incident', '天氣決策 · 即時應變 · 總會指引 · 意外報告', 12, 'TRUE', 'FALSE', 'core', 'done'],
      ['training', '訓練班管理', '🎓', 'builtin', '/training', '開班登記 · 區會目錄', 13, 'TRUE', 'FALSE', 'core', 'done'],
      ['fps', 'FPS QR 製作', '💳', 'builtin', '/fps', '轉數快 QR 碼：綁區會戶口，填銀碼即生成', 14, 'TRUE', 'FALSE', 'core', 'done'],
      ['rooms', '地域房間使用情況', '🏢', 'builtin', '/rooms', '17／18／19 樓逐間房睇用途時段 · 今日總覽', 15, 'TRUE', 'FALSE', 'core', 'done'],
      ['orgchart', '地域及總會架構', '🏛', 'builtin', '/orgchart', '港島地域總監架構 · 總會領導層，自動跟官網更新', 16, 'TRUE', 'FALSE', 'core', 'done'],
      ['debitNote', 'DEBIT NOTE 生成', '🧾', 'builtin', '/debit-note', '正式單據 · FPS QR · 後端帳簿 · 舊單翻查 · Excel 匯出', 17, 'TRUE', 'FALSE', 'core', 'done'],
      ['feedback', '你講我聽｜意見箱', '💬', 'builtin', '/feedback-inbox', '查閱一般意見及支援留言', 18, 'TRUE', 'FALSE', 'core', 'done'],
      ['dcFeedback', 'DC 保密留言', '🔒', 'builtin', '/dc-feedback', '只限區總監查閱（系統超級管理員亦可）', 19, 'TRUE', 'FALSE', 'core', 'done'],
    ] },

    { name: SHEET.UNITS, headerColor: '#bbf7d0', rows: [
      ['troop', 'label', 'org', 'gh', 'cub', 'scout', 'venture', 'rover', 'active', 'note', 'meetingTime', 'instagramUrl', 'facebookUrl', 'websiteUrl', 'publicVisible'],
    ].concat(unitSeed_().map(function (a) { return a.concat(['TRUE', '', '', '', '', '', 'TRUE']); })) },

    // v4.29.0 旅→團階層：每個團（支部單位）一列；全空表時公開名錄按 Units 團數字串自動產骨架
    { name: SHEET.UNIT_SECTIONS, headerColor: '#bbf7d0', rows: [
      UNIT_SECTION_HEADER.slice(),
    ] },

    { name: SHEET.VISITS, rows: [
      // v4.10.0 加咗總會匯報四欄（leaderMet/method/officerCount/support）喺尾，舊表跑 setupSheets 自動補
      ['id', 'districtCode', 'troop', 'section', 'visitDate', 'quarter', 'kind', 'visitorName', 'visitorEmail', 'note', 'followUp', 'createdAt', 'updatedAt',
        'leaderMet', 'method', 'officerCount', 'support'],
    ] },

    { name: SHEET.PERMS, headerColor: '#ede9fe', frozenCols: 1, rows: permRows },

    { name: SHEET.USERS, rows: [
      ['email', 'passwordHash', 'salt', 'role', 'displayName', 'scopes', 'cards', 'active', 'level', 'mustChangePassword', 'delegatedBy'],
    ] },

    { name: SHEET.STAFF, rows: [
      ['email', 'name', 'passwordHash', 'salt', 'role', 'canVenue', 'canStock', 'canCourse', 'canStaff', 'active'],
    ] },

    // ── 業務表：表頭取兩邊聯集 ──
    { name: SHEET.VENUES, rows: [
      ['venueId', 'districtCode', 'name', 'location', 'capacity', 'scienerLockId', 'note', 'active'],
    ] },
    { name: SHEET.VENUE_REQ, rows: [
      ['id', 'districtCode', 'refCode', 'submittedAt', 'venueId', 'venueName', 'purpose', 'activityName', 'attendeeCount',
        'startDate', 'endDate', 'name', 'phone', 'email', 'troop', 'position', 'agreeRules',
        'status', 'teamupEventId', 'pwdRef', 'passcode', 'reviewer', 'reviewedAt', 'createdAt'],
    ] },
    { name: SHEET.ITEMS, rows: [
      ['itemId', 'districtCode', 'category', 'name', 'totalQty', 'availableQty', 'unit', 'note', 'location', 'active'],
    ] },
    { name: SHEET.STOCK_REQ, rows: [
      ['id', 'districtCode', 'refCode', 'batchRef', 'submittedAt', 'itemId', 'itemName', 'category', 'qty',
        'purpose', 'borrowDate', 'returnDate', 'name', 'phone', 'email', 'troop', 'position',
        'agreeRules', 'status', 'reviewer', 'reviewedAt', 'createdAt'],
    ] },
    { name: SHEET.ACTIVITY_REQ, rows: [
      ['id', 'districtCode', 'refCode', 'submittedAt', 'year', 'section', 'sections', 'nature',
        'troop', 'activityName', 'startDateTime', 'endDateTime', 'location',
        'membersCount', 'leadersCount', 'parentsCount',
        'leaderName', 'leaderPhone', 'leaderEmail', 'note', 'createdAt'],
    ] },
    // 消息發佈（v4.6.0）：管理系統發 → 成員系統 member-portal 首頁頂部置頂顯示
    { name: SHEET.NEWS, headerColor: '#fef3c7', rows: [
      ['id', 'districtCode', 'title', 'body', 'date', 'pinned', 'level', 'link', 'linkLabel',
        'notify', 'active', 'expiresAt', 'publishedAt', 'publishedBy', 'updatedAt', 'createdAt',
        // v4.9.0 軟刪除留底：刪咗都喺 Sheet 紀錄曾經出現過嘅消息
        'deleted', 'deletedAt', 'deletedBy'],
    ] },
    { name: SHEET.CONTACT_NAMES, rows: [
      ['key', 'name', 'updatedAt', 'updatedBy'],
    ] },
    { name: SHEET.FEEDBACK, headerColor: '#e0f2fe', rows: [
      FEEDBACK_HEADERS.slice(),
    ] },
    { name: SHEET.DC_FEEDBACK, headerColor: '#f3e8ff', rows: [
      FEEDBACK_HEADERS.slice(),
    ] },
    { name: SHEET.AWARDS, headerColor: '#fde68a', frozenCols: 1, rows: [
      AWARD_FIXED_COLS.concat(awardTypeSeed_().map(function (r) { return r[0]; })).concat(AWARD_TAIL_COLS),
    ] },
    { name: SHEET.AWARD_TYPES, headerColor: '#fde68a', rows: [
      ['code', 'label', 'short', 'category', 'prevCode', 'minYears', 'round', 'note', 'enabled'],
    ].concat(awardTypeSeed_()) },
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
        'fpsQrPayload', 'fpsAmount', 'fpsReference', 'fpsAccountName', 'fpsAccountNumber', 'fpsUpdatedAt',
        // v4.16.0 通告全文欄（由通告網址讀取帶入；成員系統直接顯示）
        'leader', 'uniform', 'remarks', 'signupText', 'feeNote',
        'sheetId', 'setupJson',
        // v4.17.0 新版流程（訓練班系統先行）：GS 網址＋批核狀態＋修訂清單
        'gsUrl', 'approval', 'approvedAt', 'approvedBy', 'revisions',
        // v4.17.1 收生通知紀錄（JSON：{報名時間戳記:{kind,at,by}}）
        'regNotices',
        // v6.2.1 對接：公開課程ID（hub 公開 addReg 用；由班名經 listHubCourses 配對寫入）
        'publicCourseId'],
    ] },

    // DEBIT NOTE 完整帳簿：原 Excel 欄位 + QR／戶口快照 + 建立／更新審計。
    { name: SHEET.DEBIT_NOTES, headerColor: '#fce7f3', frozenCols: 1, rows: [
      ['id', 'districtCode', 'ref', 'to', 'attention', 'date', 'amount', 'particulars', 'status', 'remarks', 'reminder',
        'fpsAccountName', 'fpsAccountNumber', 'fpsQrPayload', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
    ] },
    { name: SHEET.CIRCULARS, rows: [
      ['id', 'districtCode', 'circularNo', 'category', 'title', 'sections', 'sessions',
        'leader', 'eligibility', 'fee', 'originalFee', 'subsidyNote', 'feeNote', 'quota', 'deadline',
        'courseId', 'signupUrl', 'signupNote', 'uniform', 'remarks', 'contactName', 'contactEmail',
        'contactPhone', 'enquiryNote', 'attachments', 'issueDate', 'issuer', 'signedBy',
        'status', 'publishedAt', 'publishedBy', 'updatedAt', 'createdAt'],
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
  var originalConfig = ss.getSheetByName(SHEET.CONFIG);
  var freshInstall = !originalConfig && !ss.getSheetByName(SHEET.USERS)
    && !ss.getSheetByName(SHEET.CARDS) && !ss.getSheetByName(SHEET.PERMS);
  var apiKeyHashExisted = !!(originalConfig && originalConfig.getDataRange().getValues().some(function (row) {
    return String(row[0] || '').trim() === 'API_KEY_HASH';
  }));
  // 舊密碼不再存於 Apps Script；每次 setup 均清除遺留 property（若有）。
  try { PropertiesService.getScriptProperties().deleteProperty('PORTAL_MASTER_PASSWORD'); } catch (ignored) {}
  var tokenSecretCreated = ensureTokenSecret_();
  var masterProxySecretCreated = ensureMasterProxySecret_();

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
    var added = ensureSheetColumns_(bp);
    if (added.length) patched.push(bp.name + '（+' + added.join('/') + '）');
  });

  // Config 必備行（逐條補，唔覆蓋已填值）
  var cfg = ss.getSheetByName(SHEET.CONFIG);
  blueprint_()[0].rows.slice(1).forEach(function (r) { ensureConfigRow_(cfg, r[0], r[1], r[2]); });

  seedCourseParams_(ss);
  ensureAwardColumns_(ss);
  // AwardTypes 的舊規則屬既有資料；setupSheets 不再自動改寫。
  ensureCardRows_(ss);
  ensurePermsRows_(ss);
  ensureRoleLevels_(ss);
  // 僅在真正全新空白試算表種入隨機未知密碼的初始帳戶；部分舊系統升級絕不補帳戶。
  if (freshInstall) ensurePresetUsers_(ss);
  var dcFeedbackStoreReady = ensureDCFeedbackStore_(ss);
  // 只保護此輪新建的敏感分頁；不重寫舊表的既有保護／編輯者。
  protectSensitiveSheets_(ss, created);

  var key = generateApiKey_(ss, !apiKeyHashExisted);

  uiAlert_('✅ 補建完成（已有資料全部保留）',
    '★ 只補缺失表／欄／Config 列，唔清空、唔覆寫已填格。\n\n'
    + '新建工作表：' + (created.length ? created.join('、') : '無') + '\n'
    + '補上欄位：' + (patched.length ? patched.join('、') : '無') + '\n'
    + 'API Key：' + (key ? '已新生成（下一個視窗顯示）' : '原有設定保持不變') + '\n'
    + 'Token 簽署密鑰：' + (tokenSecretCreated ? '已安全建立（舊登入 Token 失效，請重新登入）' : '原有密鑰保留') + '\n'
    + '維護登入橋接密鑰：' + (masterProxySecretCreated ? '已自動建立，請由選單顯示並設定到 Vercel' : '原有密鑰保留') + '\n'
    + '一般意見箱：' + (feedbackReady_() ? '就緒 ✅' : '未就緒 ❌') + '\n'
    + 'DC 保密意見分頁：' + (dcFeedbackStoreReady ? '就緒 ✅' : '未就緒 ❌') + '\n\n'
    + '下一步：\n'
    + '1. 確認 Users 的 DC 帳戶已啟用；Cards／Perms 只向 DC／超管顯示 DC 保密留言卡\n'
    + '2. （選填）Config 填 DC_NOTIFY_EMAIL；通知信不包含留言內容\n'
    + '3. 借場一條龍：Config 填 TEAMUP_*（Teamup）同 ttlock*（通通鎖）金鑰\n'
    + '4. 部署為 Web App（存取：任何人）→ 複製 /exec\n'
    + '5. 同一個 API Key 設定去兩個 Vercel 環境變數：\n'
    + '   PORTAL_{區碼}_APIKEY 同 MEMBER_{區碼}_APIKEY\n'
    + '6. 維護登入：Vercel 設 PORTAL_{區碼}_MASTER_PASSWORD；執行「顯示 Vercel 維護橋接密鑰」複製 PORTAL_{區碼}_MASTER_BRIDGE_SECRET。密碼長度由你選擇；短密碼較易被猜中。');

  if (key) showKeyDialog_('🔑 你的 API Key（只顯示一次）', key,
    '⚠️ 兩個前端都用呢一個 Key。而家就複製。');
}

/**
 * 舊表補返藍圖有但表上冇嘅欄（加喺最尾，唔郁已有資料）— v4.10.0 由 setupSheets 抽出嚟，
 * Visits 加總會匯報四欄（leaderMet/method/officerCount/support）就係行呢條路。回傳補咗嘅欄名。
 */
function ensureSheetColumns_(bp) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(bp.name);
  if (!sh) return [];
  var want = bp.rows[0].map(function (h) { return String(h).trim(); });
  var have = sheetHeadersBySheet_(sh);
  if (!have.length) return [];
  var missing = want.filter(function (h) { return have.indexOf(h) < 0; });
  if (!missing.length) return [];
  sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
  sh.getRange(1, have.length + 1, 1, missing.length).setFontWeight('bold');
  return missing;
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
  var cTitle = head.indexOf('title');
  // 只當該行仍然係藍圖舊值先改（用戶自行改過就唔掂）
  var patches = {
    incident: { oldDesc: '通報 · 惡劣天氣', desc: '即時應變 · 總會指引 · 意外報告' },
    // v4.9.0：聯結簿 → 聯絡簿（強調聯絡電話用途；逐個舊名都試）
    contacts: { oldTitles: ['旅團聯絡簿', '聯結簿'], title: '聯絡簿', oldDesc: '聯絡資料 · 分組 · 群發', desc: '旅團 · 港島地域 · 總會 聯絡資料', oldDescs: ['旅團 · 港島地域 · 總會 聯絡資料'], desc2: '聯絡電話：旅團 · 港島地域 · 總會（職員姓名區方可改）' },
    // v4.5.0 區年度預算已完成（直讀區方 Google Sheet）
    budget: { oldDesc: '預算編列與追蹤', desc: '直讀區方預算 Sheet · 按月／支部 · 資助合計' },
    // v4.7.0 獎勵提名已完成（名冊 + 夠期提名推算 + 年期可自訂）；v4.9.0 限 DDC 或以上
    awards: { oldDesc: '讀獲獎名單 · 推下一級', desc: '獎勵名冊 · 自動計夠期可提名 · 年期自訂', oldDescs: ['獎勵名冊 · 自動計夠期可提名 · 年期自訂'], desc2: '獎勵名冊 · 夠期自動推算 · 只限 DDC 或以上' },
  };
  var descOnly = {
    incident: { oldDesc: '即時應變 · 總會指引 · 意外報告', desc: '天氣決策 · 即時應變 · 總會指引 · 意外報告' },
    debitNote: {
      oldDesc: '正式單據 · FPS QR · 後端帳簿 · 舊單翻查 · Excel 匯出（DC／DDC_ADMIN／職員）',
      oldDescs: [
        '區會範本 · CSV 帶入 · FPS QR · 列印 PDF（DC／DDC_ADMIN／職員）',
        '正式單據 · FPS QR · 後端帳簿 · 舊單翻查 · Excel 匯出（DC／DDC_ADMIN／職員）',
      ],
      desc: '正式單據 · FPS QR · 後端帳簿 · 舊單翻查 · Excel 匯出（超管／DC／DDC_ADMIN／職員）',
    },
  };
  // v4.4.0 刪會議行事曆；v4.5.0 刪週年會議文件；v4.9.0 刪消息發佈卡片（搬咗去主控台頂）
  var removeIds = { meeting: true, annual: true, news: true };
  for (var i = v.length - 1; i >= 1; i--) {
    var id = String(v[i][cId] || '').trim();
    if (removeIds[id]) { sh.deleteRow(i + 1); continue; }
    var p = patches[id];
    var d = descOnly[id];
    var oldCardDescs = d ? (d.oldDescs || [d.oldDesc]) : [];
    if (d && cDesc >= 0 && oldCardDescs.indexOf(String(v[i][cDesc] || '').trim()) >= 0) sh.getRange(i + 1, cDesc + 1).setValue(d.desc);
    if (!p) continue;
    if (p.title && cTitle >= 0) {
      var olds = p.oldTitles || (p.oldTitle ? [p.oldTitle] : []);
      if (olds.indexOf(String(v[i][cTitle] || '').trim()) >= 0) sh.getRange(i + 1, cTitle + 1).setValue(p.title);
    }
    if (cDesc >= 0) {
      var curDesc = String(v[i][cDesc] || '').trim();
      if (curDesc === p.oldDesc) sh.getRange(i + 1, cDesc + 1).setValue(p.desc);
      else if (p.oldDescs && p.oldDescs.indexOf(curDesc) >= 0 && p.desc2) sh.getRange(i + 1, cDesc + 1).setValue(p.desc2);
    }
    if (String(v[i][cCat] || '').trim() === 'todo') sh.getRange(i + 1, cCat + 1).setValue('done');
  }
  // Perms 表同步移除已刪卡片
  var psh = ss.getSheetByName(SHEET.PERMS);
  if (psh) Object.keys(removeIds).forEach(function (cid) { removeRowByFirstCol_(psh, cid); });
}

/** Roles 表補 level 欄值（只填空格；已有數字唔改） */
function ensureRoleLevels_(ss) {
  var sh = ss.getSheetByName(SHEET.ROLES);
  if (!sh) return;
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return;
  var head = v[0].map(function (h) { return String(h).trim(); });
  var cRole = head.indexOf('role'), cLv = head.indexOf('level');
  if (cRole < 0 || cLv < 0) return;
  var bp = blueprint_().filter(function (b) { return b.name === SHEET.ROLES; })[0];
  var bpLv = {};
  if (bp) bp.rows.slice(1).forEach(function (r) { bpLv[String(r[0]).trim()] = r[3]; });
  for (var i = 1; i < v.length; i++) {
    var role = String(v[i][cRole] || '').trim();
    if (!role) continue;
    var cur = v[i][cLv];
    if (cur !== '' && cur != null && !isNaN(Number(cur))) continue;
    var lv = bpLv[role];
    if (lv == null) lv = levelOfRole_(role);
    sh.getRange(i + 1, cLv + 1).setValue(lv);
  }
}

/** 補建缺少的預設角色帳戶，密碼使用隨機值且不輸出；已有帳戶不改，同時補空白 level。 */
function ensurePresetUsers_(ss) {
  var sh = ss.getSheetByName(SHEET.USERS);
  if (!sh) return;
  var existing = {};
  readSheet_(SHEET.USERS).forEach(function (u) { if (u.email) existing[String(u.email).trim().toLowerCase()] = u; });
  PRESET_USERS.forEach(function (u) {
    if (existing[u[0]]) return;
    var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
    var initialPassword = temporaryPassword_();
    appendRowObj_(sh, {
      email: u[0], passwordHash: sha256_(initialPassword + salt), salt: salt, role: u[1], displayName: u[2], scopes: u[3],
      cards: '', active: 'TRUE', level: u[4], mustChangePassword: 'TRUE', delegatedBy: '',
    });
  });
  // 已有帳戶：level 空白就按角色補上（唔掂已填值）
  var v = sh.getDataRange().getValues();
  var head = v[0].map(function (h) { return String(h).trim(); });
  var cEmail = head.indexOf('email'), cRole = head.indexOf('role'), cLv = head.indexOf('level');
  if (cLv < 0 || cRole < 0) return;
  for (var i = 1; i < v.length; i++) {
    if (!String(v[i][cEmail] || '').trim()) continue;
    var cur = v[i][cLv];
    if (cur !== '' && cur != null && !isNaN(Number(cur))) continue;
    sh.getRange(i + 1, cLv + 1).setValue(levelOfRole_(v[i][cRole]));
  }
}

/** 補建缺失權限行（Perms 表）：新卡片自動按藍圖角色補權限，唔會掂已有行 */
function ensurePermsRows_(ss) {
  var sh = ss.getSheetByName(SHEET.PERMS);
  if (!sh) return;
  var v = sh.getDataRange().getValues();
  if (!v.length) return;
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

/**
 * v4.9.0 權限修訂：獎勵提名只限 DDC 或以上；v4.23.0 補 DEBIT NOTE 超管權限。
 * awards 只改仍同舊預設一樣嘅行；debitNote 只補 SYSADMIN 一格，其他自訂矩陣唔掂。
 */
function patchPermsRows_(ss) {
  var sh = ss.getSheetByName(SHEET.PERMS);
  if (!sh) return;
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return;
  var header = v[0].map(function (h) { return String(h).trim(); });
  var bp = blueprint_().filter(function (b) { return b.name === SHEET.PERMS; })[0];
  if (!bp || bp.rows.length < 2) return;
  var bpHeader = bp.rows[0].map(function (h) { return String(h).trim(); });
  function blueprintRow(cid) {
    for (var r = 1; r < bp.rows.length; r++) if (String(bp.rows[r][0]).trim() === cid) return bp.rows[r];
    return null;
  }
  // 舊 awards 預設：全部角色 'view'，除咗 DC/SYSADMIN/DDC_ADMIN = 'edit'
  // （空白格都當 legacy：setupSheets 補新角色欄時係留空嘅）
  function isLegacyAwardsRow(row) {
    for (var c = 1; c < header.length; c++) {
      var role = header[c], bi = bpHeader.indexOf(role);
      if (bi < 1) continue;
      var cur = String(row[c] || '').trim().toLowerCase();
      var want = (role === 'DC' || role === 'SYSADMIN' || role === 'DDC_ADMIN') ? 'edit' : 'view';
      if (cur !== want && cur !== '') return false;
    }
    return true;
  }
  for (var i = 1; i < v.length; i++) {
    var cid = String(v[i][0] || '').trim();
    // v4.23.0：DEBIT NOTE 恢復超管最高權限；只補 SYSADMIN 一格，其他角色維持原設定。
    if (cid === 'debitNote') {
      var superCol = header.indexOf('SYSADMIN');
      if (superCol > 0 && String(v[i][superCol] || '').trim().toLowerCase() !== 'edit') {
        sh.getRange(i + 1, superCol + 1).setValue('edit');
      }
      continue;
    }
    if (cid !== 'awards') continue;
    if (!isLegacyAwardsRow(v[i])) break;
    var br = blueprintRow('awards');
    if (!br) break;
    for (var c2 = 1; c2 < header.length; c2++) {
      var role2 = header[c2], bi2 = bpHeader.indexOf(role2);
      sh.getRange(i + 1, c2 + 1).setValue(bi2 > 0 && bi2 < br.length ? br[bi2] : '');
    }
    break;
  }
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

function setUserPasswordMenu() {
  var email = uiPrompt_('🔐 改密碼', '請輸入帳號電郵：');
  if (email === null) { uiAlert_('提示', '請喺 Sheet 內用選單執行。'); return; }
  var pw = uiPrompt_('🔐 改密碼', '請輸入新密碼（最少 8 個字元）：');
  if (pw === null) return;
  var pwError = validateNewPassword_(pw);
  if (pwError) { uiAlert_('錯誤', pwError); return; }
  uiAlert_('改密碼', applyPassword_(String(email).trim(), pw) ? '✅ 已更新：' + email : '❌ 找不到帳戶：' + email);
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
    if (name === SHEET.USERS) setCellByHeader_(sh, idx, 'mustChangePassword', 'TRUE');
    done = true;
  });
  return done;
}
// ===================== YMIS 會員核實帳戶（舊版相容） =====================
function getYmisCredentials_(token) {
  var t = checkToken_(token);
  if (!t.valid || t.source !== 'users') return err('登入已過期');
  if (!canViewYmisRole_(t.role)) return err('此帳戶不可查看 YMIS 帳密');
  var auth = requireCardView_(token, 'ymis');
  if (auth.error) return err(auth.error);
  var user = readSheet_(SHEET.USERS).filter(function (u) {
    return String(u.email || '').trim().toLowerCase() === String(t.email || '').trim().toLowerCase()
      && String(u.active || '').toUpperCase() !== 'FALSE';
  })[0];
  if (!user || isTrue_(user.mustChangePassword) || String(user.mustChangePassword).toUpperCase() !== 'FALSE') return err('請先完成帳戶密碼設定');
  var props = PropertiesService.getScriptProperties();
  var username = String(props.getProperty('YMIS_VERIFY_USERNAME') || '').trim();
  var password = String(props.getProperty('YMIS_VERIFY_PASSWORD') || '');
  if (!username || !password) return ok({ configured: false });
  return ok({ configured: true, username: username, password: password });
}

// ===================== 區年度預算網址設定 =====================
function setBudgetSheetUrl_(token, budgetSheetUrl) {
  var t = checkToken_(token);
  if (!t.valid) return err('請先登入系統');
  // DC / SYSADMIN / DDC / level <= 2 可修改
  var isAllowed = isAdminRole_(t.role) || String(t.role).indexOf('DDC') >= 0 || levelOfUser_(t.email, t.role) <= LEVEL_DDC;
  if (!isAllowed) return err('只有區總監或副區總監可以修改預算表網址');
  budgetSheetUrl = String(budgetSheetUrl || '').trim();
  setConfigValue_('BUDGET_SHEET_URL', budgetSheetUrl);
  return ok({ saved: true, budgetSheetUrl: budgetSheetUrl });
}
