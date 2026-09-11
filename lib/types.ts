// 與 Google Sheet 對應的型別

export type CardType = 'builtin' | 'jump' | 'resource';
export type AccessLevel = 'edit' | 'view' | '';

export interface CardDef {
  cardId: string;
  title: string;
  icon: string;
  type: CardType;
  url: string;
  description: string;
  order: number;
  enabled: boolean;
  access?: AccessLevel;
  embed?: boolean;
  source?: string; // core / plugin
  category?: string; // done=已實作 / todo=加入中
}

export interface RoleDef {
  role: string;
  label: string;
  protected?: boolean; // 受保護角色（DC + 8 真實角色）不可被 SYSADMIN 改/刪
  level?: number;      // 層級：0 超管 / 1 DC / 2 DDC / 3 ADC / 4 STAFF / 5 其他
}

export interface PermsBundle {
  cards: CardDef[];
  roles: RoleDef[];
  matrix: Record<string, Record<string, AccessLevel>>;
}

export interface UserSession {
  email: string;
  displayName: string;
  role: string;
  roleLabel: string;
  isAdmin: boolean;       // 可進管理頁（DC / SYSADMIN）
  isDC: boolean;          // 是否區總監（最高，可改 SYSADMIN）
  canManageAccounts?: boolean; // DDC 或以上：可開區長／區領袖／助理區領袖
  scopes: string[];
  token: string;
  level?: number;              // 0 超管（隱藏、最高）/ 1 DC / 2 DDC / 3 ADC / 4 STAFF / 5 其他
  levelLabel?: string;
  isSuper?: boolean;           // level 0：隱藏卡片仍然可見
  mustChangePassword?: boolean; // 首次登入（預設密碼）必須先改密碼
  mockAdmin?: boolean;          // 🎭 模擬示範版：權限全開（僅本地沙盒，後台永遠唔會設）
}

export interface PortalUser {
  email: string;
  displayName: string;
  role: string;
  scopes: string;
  cards?: string; // 每帳戶 scope 覆寫（逗號分隔 cardId；留空 = 用角色矩陣）
  active: boolean;
  level?: number;
  levelLabel?: string;
  mustChangePassword?: boolean;
  delegatedBy?: string;
}

/** 授權面板（getDelegation）：我可授出嘅卡片權限 × 層級較低嘅角色 */
export interface DelegationBundle {
  me: { email: string; role: string; level: number; levelLabel: string };
  myAccess: Record<string, AccessLevel>;
  roles: { role: string; label: string; level: number }[];
  cards: { cardId: string; title: string; icon: string; enabled: boolean }[];
  matrix: Record<string, Record<string, AccessLevel>>;
}

export interface BatchUserInput {
  email: string;
  displayName: string;
  role: string;
  password: string;
  scopes?: string;
  cards?: string; // 卡片範圍 scope 覆寫（逗號分隔 cardId；留空 = 用角色矩陣）
}

export interface DistrictConfig {
  districtName: string;
  theme?: string;
  logoText?: string;
  fpsAccountName?: string;            // 轉數快戶口名（FPS QR 製作卡片用）
  fpsAccountNumber?: string | number; // Apps Script 會把純數字 Sheet 儲存格回傳為 number
  budgetSheetUrl?: string;            // v4.5.0：區年度預算 Google Sheet 網址（Config BUDGET_SHEET_URL；留空用內建）
  memberPortalUrl?: string;           // v4.12.0：成員系統網址（通告「報名辦法」報名連結用）
  courseTemplateSet?: boolean;        // v4.14.0：訓練班總模版有冇設定（新制直入用）
  courseEmailFrom?: string;           // v4.17.0：訓練班郵件 alias（留空=部署帳戶本身地址）
  courseFactoryUrl?: string;          // v4.17.0：CourseFactory 開班網址（開班指引用）
}

/** 開班指引＋訓練班郵件現狀（getCourseOpsInfo；canCourse 先睇到） */
export interface CourseOpsInfo {
  districtName: string;
  factoryUrl: string;                 // CourseFactory /exec（CL「新開班 → 連區會起表」用）
  factoryCode: string;                // 開班碼（只交俾 CL，季度更換）
  emailFrom: string;                  // 訓練班郵件 alias（空 = 用部署帳戶地址）
  memberPortalUrl: string;
  notifyFrom: string;
}

/** 收款核對一列（收款核對分頁用；由表格回應 header 對位） */
export interface CoursePaymentRow {
  id: string;                         // 時間戳記（setPaymentCheck 對行用）
  name: string; nameEn: string; phone: string; email: string;
  troop: string; troopNo: string; group: string; studentNo: string;
  district: string;
  status: string;                     // approved / rejected / cancelled / pending
  receiptUrl: string;                 // 入數紙截圖（Drive）
  payChecked: boolean; payBy: string; payAt: string;
  refunded: boolean; refundedBy: string;   // v4.17.2 已退款（管理層 tick，CL 個 APP 見到）
  sta: boolean; staNote: string;
}

export interface SystemState {
  locked: boolean;
  lockMessage: string;
}

export interface PluginItem {
  id: string;
  title: string;
  icon: string;
  url: string;
  description: string;
  version: string;
  embed: boolean;
  type: CardType;
  installed: boolean;
  needsDistrictBackend?: boolean; // true=複雜(各區需自建後台) false=簡單(即插即用共用)
}

export interface RegistryBundle {
  plugins: PluginItem[];
  registryUrl: string;
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ===================== 訓練班（CourseLinks + 報名） =====================

export interface CourseLink {
  courseId: string;
  districtCode?: string;
  title: string;
  badgeName?: string;
  section?: string;
  courseNo?: string;
  sessionsText?: string;
  eligibility?: string;
  fee?: string;
  originalFee?: string;
  subsidyNote?: string;
  deadline?: string;
  quota?: string;
  filled?: string;
  venue?: string;
  noticeUrl?: string;
  contact?: string;
  scriptExecUrl?: string;
  scriptApiKey?: string;
  driveFolderId?: string;
  active?: string;
  createdAt?: string;
  // ── 每班收費 FPS QR（v4.3.0）：由訓練班管理生成，成員系統直接顯示 ──
  fpsQrPayload?: string;      // 已計好 CRC 嘅 FPS QR 內容（成員系統只需畫 QR）
  fpsAmount?: string;         // QR 內固定銀碼（通常 = fee）；空 = 靜態 QR
  fpsReference?: string;      // QR 參考編號（預設 = courseNo 或 courseId）
  fpsAccountName?: string;    // 生成當刻嘅收款戶口名（供公開端顯示）
  fpsAccountNumber?: string;  // 生成當刻嘅 FPS ID（供公開端顯示）
  fpsUpdatedAt?: string;      // QR 最後更新時間（ISO）
  // ── 通告全文欄（v4.16.0）：由「📥 由通告網址讀取」帶入，成員系統直接顯示 ──
  leader?: string;            // 班領導人（通告「班領導人」段）
  uniform?: string;           // 服裝（通告「服裝」段）
  remarks?: string;           // 備註全文（通告「備註」段，可多行）
  signupText?: string;        // 報名辦法全文（通告原文；成員系統照舊用內置報名表）
  feeNote?: string;           // 費用全文（含原價／資助／轉數快戶口等付款說明）
  // ── 新制直入（v4.14.0）：區系統建嘅班，後端 Sheet ID＋設定 JSON ──
  sheetId?: string;           // 區後台自動複製嘅班 Sheet ID（人手建表嘅班冇）
  setupJson?: string;         // CourseSetup JSON（list 唔回，要用 getCourseSetup 攞）
  hasSetup?: boolean;         // 有冇儲存過直入設定
  // ── 新版流程（v4.17.0：訓練班系統先行）──
  gsUrl?: string;             // CL 交嚟嘅班 Google Sheet 網址（批核直接開 GS 用）
  approval?: string;          // '' | 'PENDING' | 'APPROVED'（區會批准）
  regNotices?: string;        // v4.17.1 收生通知紀錄 JSON（{報名id:{kind,at,by}}）
  approvedAt?: string;        // 批准時間（ISO）
  approvedBy?: string;        // 批准人
  revisions?: string;         // 修訂清單 JSON（CourseRevision[]；list 唔回原字串）
}

/** 批核修訂一項（v4.17.0）：管理層改咗嘅嘢——標亮俾 CL 知 */
export interface CourseChange {
  label: string;              // 人類可讀欄位名（例「名額」「1. 膳食 第2行 價錢」）
  from: string;               // 原值（CL 填嘅）
  to: string;                 // 新值（管理層改嘅）
}

/** 收生通知紀錄一筆（CourseLinks.regNotices JSON） */
export interface CourseRegNoticeRec {
  kind: 'approved' | 'rejected' | string;   // 寄咗邊種
  at: string;                               // ISO 時間
  by: string;                               // 邊個寄
}

/** 修訂紀錄一筆（CourseLinks.revisions JSON） */
export interface CourseRevision {
  at: string;                 // ISO 時間
  by: string;                 // 管理層名
  approval: string;           // 'APPROVED' | 'PENDING' | ''
  changes: CourseChange[];
  note: string;
  cellsApplied?: number;
  path?: string;              // 'direct'（開 GS 寫）| 'exec'（經 Script 寫）
}

// ===================== 訓練班 Sheet profile（pullCourseProfile） =====================

/** Input02 節次（showOnCircular = 有通告顯示日期，即上通告） */
export interface CourseProfileSession {
  date: string;         // yyyy-MM-dd
  time: string;         // 例如 1900 - 2200
  venue: string;
  displayDate: string;  // 通告顯示日期（中文寫法）
  displayTime: string;  // 通告顯示時間
  displayVenue: string; // 通告顯示地點
  showOnCircular: boolean;
}

/** Input02 職員（職位／姓名／稱謂／單位／資格／電話／電郵） */
export interface CourseProfileStaff {
  role: string;
  name: string;
  title: string;
  unit: string;
  qualification: string;
  phone: string;
  email: string;
}

/** 訓練班 Script getCourseProfile 回傳（Input01 預算＋Input02 資料） */
export interface CourseProfile {
  courseName: string;
  quota: string;
  fee: string;
  staffCount: string;
  deadline: string;       // yyyy-MM-dd
  publishDate: string;    // 最遲公佈取錄名單日 yyyy-MM-dd
  totalStaff: string;
  residentStaff: string;
  sessions: CourseProfileSession[];
  staff: CourseProfileStaff[];
  leader: CourseProfileStaff | null;  // 班領導人
  // ── Input01 預算 ──
  edition: string;
  section: string;
  badge: string;
  customName: string;
  form1: string;
  form2: string;
  expectedIntake: string;
  expectedFee: string;
  expectedStaff: string;
  budgetDates: { date: string; time: string; venue: string }[];
  budgetApproved: string;
  subsidyRequired: string;
  pulledAt: string;
  circular?: CourseProfileCircular | null;  // Print_通告內文（冇呢頁就 null）
}

/** Print_通告讀出嚟嘅內文（B 欄 label 對位；供通告記錄一鍵預填） */
export interface CourseProfileCircular {
  title: string;
  fileNo: string;         // 檔案編號（純數字先會代入通告編號）
  fileNoRaw: string;
  issueDate: string;      // 發出日期原文（中文寫法）
  issueDateISO: string;   // 發出日期 yyyy-MM-dd（解唔到就空字串）
  leaderText: string;
  eligibility: string;
  feeText: string;        // C24 費用說明
  payText: string;        // C25 FPS 段（portal 自己印 QR，呢段只作參考）
  quotaText: string;
  deadlineText: string;
  signupText: string;     // C30 報名辦法
  uniform: string;
  remarks: string[];
  enquiry: string;        // C39 查詢句
  signer: string;         // E43 區總監簽署
  deputy: string;         // E45 代行（已剔符號）
  deputyRaw: string;
}

// ===================== 一次性服務：借場 / 借物資 / 知會 =====================

export interface Venue {
  venueId: string;
  name: string;
  location?: string;
  capacity?: string;
  note?: string;
  active?: string;
  scienerLockId?: string; // 呢個場地嘅 Sciener/TTLock Lock ID（數字）
}
export interface VenueBooking {
  id: string;
  refCode?: string;
  submittedAt?: string;
  venueId?: string;
  venueName?: string;
  purpose?: string;
  startDate?: string;
  endDate?: string;
  name?: string;
  phone?: string;
  email?: string;
  troop?: string;
  position?: string;
  status?: string;
  reviewer?: string;
  reviewedAt?: string;
  passcode?: string; // 批准後自動生成並電郵俾申請人嘅入場密碼（稍後）
  pwdRef?: string; // 電子鎖密碼記錄 ID
  teamupEventId?: string; // 填表時 GS 喺 Teamup「申請中」建嘅事件 ID
  agreeRules?: string; // 已同意借用守則（v4.0）
}
export interface StockItem {
  itemId: string;
  name: string;
  category?: string;
  totalQty?: string;
  availableQty?: string;
  unit?: string;
  note?: string;
  active?: string;
}
export interface StockRequest {
  id: string;
  refCode?: string;
  /** 一次過借多款物資時共用嘅批次編號（v4.6.1）；單件申請為空 */
  batchRef?: string;
  submittedAt?: string;
  itemId?: string;
  itemName?: string;
  qty?: number;
  purpose?: string;
  borrowDate?: string;
  returnDate?: string;
  name?: string;
  phone?: string;
  email?: string;
  troop?: string;
  position?: string;
  status?: string;
  reviewer?: string;
  reviewedAt?: string;
}
// ===================== 意外／應變：意外報告（HKSA 行政署 ACC-RPT 2019/07 格式） =====================

export type IncidentTimelineRow = { when: string; text: string };

export interface IncidentReport {
  id?: string;
  districtCode?: string;
  refCode?: string;
  status?: string;          // submitted / reviewed
  submittedAt?: string;
  submittedBy?: string;     // 提交者登入帳號
  // 基本資料
  accidentDate?: string;    // yyyy-mm-dd
  accidentTime?: string;    // HH:mm
  activityName?: string;
  place?: string;
  organiser?: string;
  injuryPart?: string;      // 受傷部位（如右腳）
  injuryType?: string;      // 傷勢（如骨折）
  // 傷者個人資料
  injuredNameZh?: string;
  injuredNameEn?: string;
  scoutId?: string;         // 童軍成員編號／委任證或委任書編號
  hkid?: string;            // 身份証／護照號碼（非童軍人士）
  age?: string;
  sex?: string;             // 男 / 女
  phone?: string;
  email?: string;
  address?: string;
  unit?: string;            // 所屬單位／童軍旅
  position?: string;
  // 未滿 18 歲
  guardianName?: string;
  guardianRelation?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  // 救護車
  ambulanceCalled?: string; // 有 / 沒有
  ambCallerName?: string;
  ambCallerPhone?: string;
  ambCallerUnit?: string;
  ambCallerPosition?: string;
  ambCallTime?: string;
  ambArriveTime?: string;
  // 醫院／診所
  hospital?: string;
  hospitalStay?: string;    // 當日出院 / 留院
  hospitalDays?: string;
  escortName?: string;
  escortPhone?: string;
  escortUnit?: string;
  escortPosition?: string;
  // 報案
  policeReported?: string;  // 是 / 否
  policeStation?: string;
  policeCaseNo?: string;
  // 目擊者
  hasWitness?: string;      // 有 / 沒有
  witnessName?: string;
  witnessPhone?: string;
  witnessSex?: string;
  witnessAddress?: string;
  witnessUnit?: string;
  witnessPosition?: string;
  witness2Name?: string;
  witness2Phone?: string;
  witness2Sex?: string;
  witness2Address?: string;
  witness2Unit?: string;
  witness2Position?: string;
  // 第二頁
  details?: string;         // JSON: IncidentTimelineRow[]（意外詳情）
  followUps?: string;       // JSON: IncidentTimelineRow[]（事發後之跟進工作）
  reporterName?: string;    // 活動負責人／導師／本會有關單位職員
  reporterPosition?: string;
  reporterUnit?: string;
  reporterDate?: string;
  reporterPhone?: string;
  reporterEmail?: string;
  // 童軍單位主管專用（單位主管填）
  supervisorReceivedDate?: string;
  supervisorUnit?: string;
  supervisorDate?: string;
  supervisorName?: string;
  supervisorRemark?: string;
  // 內部
  serious?: string;         // TRUE = 嚴重傷亡（3 個工作天內通知行政署）
  createdAt?: string;
}

/**
 * 消息發佈（v4.6.0）— News 表。
 * 管理系統 /news 發佈 → 成員系統 member-portal 首頁頂部置頂顯示（純拉取，冇推送）。
 * 呢邊刪咗／下架（active=false）／過咗 expiresAt → 成員系統下次載入即刻消失。
 */
/** 同成員系統 AnnouncementBanner 一致嘅詞彙（後台 v4.6.2 起；舊 warn/urgent 會自動對應）。 */
export type NewsLevel = 'info' | 'warning' | 'important';

export interface Announcement {
  id: string;
  districtCode?: string;
  title: string;
  body: string;
  content?: string;       // = body，後台額外回一份畀成員系統讀（欄位名對齊）
  date?: string;          // yyyy-MM-dd：顯示日期；日期喺將來 = 未到發佈日，成員端未見到
  pinned?: boolean;       // 置頂：成員系統首頁頂部一直顯示
  level?: NewsLevel;      // info 一般 / warning 請留意 / important 緊急
  link?: string;          // 選填「查看詳情」連結
  linkLabel?: string;
  notify?: boolean;       // 允許成員端彈系統通知（Notification API；純顯示可忽略）
  active?: boolean;       // 發佈中；FALSE = 下架
  expiresAt?: string;     // yyyy-MM-dd：自動落架日（留空 = 一直顯示）
  publishedAt?: string;
  publishedBy?: string;
  updatedAt?: string;
  // 只喺管理系統 getAnnouncements 回傳
  expired?: boolean;
  scheduled?: boolean;
  live?: boolean;
  // v4.9.0 軟刪除留底：刪咗仍喺 Sheet 紀錄，成員端一律見唔到
  deleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
}

/**
 * 🎖 獎勵提名（v4.7.1）— Awards / AwardTypes 表。
 * 一人一行，每個獎項存獲獎年份（字串，可以係 "2015"、"2015?" 未確定、"無"）。
 * 年期規則（邊個獎跟邊個、要相隔幾多年、屬邊個提名期）全部喺 AwardTypes 表，可喺 /awards 改。
 */
export type AwardRound = 'founder' | 'rally' | 'hab' | 'other';
export type AwardMemberStatus = 'active' | 'noNomination' | 'noAppointment' | 'notInDistrict' | 'applying' | 'left';

export interface AwardType {
  code: string;            // 代號（同時係 Awards 表嘅欄名），例如 GSA
  label: string;           // 全名，例如 優良服務獎章
  short?: string;          // 表格用短名，例如 LSM*
  category?: string;       // 功績榮譽／長期服務／嘉許／外部嘉許／其他
  prevCode?: string;       // 上一級代號（空 = 入門級，冇得自動推算）
  minYears?: number | null;// 距上一級最少年數（空 = 唔設限）
  round: AwardRound;       // founder 創辦人紀念日／rally 大會操（童軍獎勵）／other 自行申請
  note?: string;
  enabled?: boolean;
  orderNo?: number;
}

export interface AwardMember {
  id: string;
  districtCode?: string;
  name: string;
  nameEn?: string;
  troop?: string;          // 旅團編號
  position?: string;       // 職位（GSL / ASL / LAY …）
  serviceStart?: string;   // 服務開始（委任）年份；入門級獎項（GSA 7 年、LSM 15 年）由呢個年份起計
  status?: AwardMemberStatus;
  note?: string;
  awards: Record<string, string>;  // { GSA: '2015', LSM: '2020?' }
  updatedAt?: string;
}

export interface AwardsBoard {
  types: AwardType[];
  members: AwardMember[];
  counts: Record<string, number>;
  total: number;
  /** 後台內建建議年期（「↺ 套用建議」用，唔會自動覆蓋你改過嘅設定） */
  defaults?: AwardType[];
  /** 提名期死線（v4.9.0）：民青局嘉許（MM-DD；可喺年期設定改） */
  deadlineCfg?: { habDistrict?: string; habHq?: string };
}

export interface ActivityNotice {
  id: string;
  refCode?: string;
  submittedAt?: string;
  year?: string;
  section?: string;
  nature?: string;
  troop?: string;
  activityName?: string;
  startDateTime?: string;
  endDateTime?: string;
  location?: string;
  membersCount?: string;
  leadersCount?: string;
  parentsCount?: string;
  leaderName?: string;
  leaderPhone?: string;
  leaderEmail?: string;
  note?: string;
  districtCode?: string;
}

/**
 * 🏕 旅團探訪（v4.8.1）— Units（旅團名單）＋ Visits（探訪記錄）。
 * 幹部撳一下旅團格仔就登記；DC 揀日期範圍出報告，仲睇到邊個幹部探咗邊啲旅。
 */
export type VisitSection = 'gh' | 'cub' | 'scout' | 'venture' | 'rover';
export type VisitKind = 'general' | 'inspection' | 'meeting' | 'section' | 'event' | 'other';

export interface ScoutUnit {
  troop: string;                              // 旅號，例如 "206"
  label: string;                              // 港島第206旅
  org?: string;                               // 主辦機構
  sections: Record<VisitSection, string>;     // 各支部團數（"" = 冇該支部）
  active?: boolean;
  note?: string;
}

export interface Visit {
  id: string;
  districtCode?: string;
  troop: string;
  section?: VisitSection | '';
  visitDate: string;        // yyyy-MM-dd
  year?: number;
  quarter?: number;         // 1..4
  kind: VisitKind;
  visitorName?: string;
  visitorEmail?: string;
  note?: string;
  followUp?: string;
  // ── 總會匯報欄位（v4.10.0：「區職員探訪區內旅團匯報」八欄格式） ──
  leaderMet?: string;       // 與旅領袖會面（旅長／支部團長／副團長…）
  method?: string;          // 探訪方式（面談／電話／WhatsApp／Email／其他）
  officerCount?: number;    // 區職員探訪人數（冇填當 1）
  support?: string;         // 區已經提供之支援之項目
  createdAt?: string;
  updatedAt?: string;
}

export interface VisitBoard {
  from: string;
  to: string;
  today: string;
  districtName?: string;    // 區會名（Config districtName，總會匯報表頭用）
  units: ScoutUnit[];
  visits: Visit[];
  years: number[];
  sections: { key: VisitSection; label: string }[];
  me: { email: string; role: string; name: string; defaultSection: VisitSection | '' };
}

/**
 * 📜 區通告（v4.13.0）— Circulars 表（職員專用；輸出傳統格式 PDF）。
 * 訓練班 Sheet → 訓練班目錄 → 通告草稿自動預填 → 列印 PDF 上載區網／交總會。
 * sessions／attachments 喺 Sheet 以 JSON 字串存，API 讀寫都係陣列。
 */
export type CircularStatus = 'draft' | 'published' | 'closed' | 'archived';

export interface CircularSession {
  date: string;   // 節日期（yyyy-MM-dd 或中文寫法）
  time: string;   // 時間（例如 下午七時至十時）
  venue: string;  // 地點
}

export interface CircularAttachment {
  label: string;
  url: string;
}

/** 掛接訓練班 snapshot（後台由 CourseLinks 即時讀出） */
export interface CircularCourseSnap {
  courseId: string;
  title: string;
  fee: string;
  deadline: string;
  quota: string;
  filled: string;
  noticeUrl?: string;   // 區網 PDF 連結（職員回填；成員系統跳轉睇真通告）
}

export interface Circular {
  id: string;
  districtCode?: string;
  circularNo: string;             // 通告編號（人手輸入，跨類別共用，區內唔重複）
  category: string;               // 訓練班／活動／服務／比賽／會議／行政／其他
  title: string;
  sections?: string;              // 支部（「、」分隔）：小童軍／幼童軍／童軍／深資童軍／樂行童軍／領袖
  sessions?: CircularSession[];
  leader?: string;                // 班領導人
  eligibility?: string;           // 參加資格
  fee?: string;                   // 費用（字串：100／免費／詳見內文…）
  originalFee?: string;
  subsidyNote?: string;
  feeNote?: string;               // 費用說明全文（訓練班 Sheet 通告 C24；有就代替組合句列印）
  quota?: string;
  deadline?: string;              // 截止日期 yyyy-MM-dd
  courseId?: string;              // 掛接訓練班（報名直達；留空＝純通告）
  signupUrl?: string;              // 報名連結（成員系統訓練班頁；列印為報名辦法文字）
  signupNote?: string;            // 報名辦法全文（訓練班 Sheet 通告 C30；列印喺連結上面）
  uniform?: string;               // 服裝
  remarks?: string;               // 備註
  contactName?: string;           // 查詢聯絡人
  contactEmail?: string;
  contactPhone?: string;
  enquiryNote?: string;           // 查詢補充（例如「如在 X 月 X 日尚未接獲通知…」）
  attachments?: CircularAttachment[];
  issueDate?: string;             // 發出日期
  issuer?: string;                // 署名（例如 區總監 袁可秀）
  signedBy?: string;              // 代行（例如 楊德銘）
  status?: CircularStatus;        // draft 草稿／published 已發佈／closed 截止／archived 封存
  publishedAt?: string;
  publishedBy?: string;           // 只管理系統回傳
  updatedAt?: string;
  createdAt?: string;             // 只管理系統回傳
  // ── 後台計好嘅 ──
  isOpen?: boolean;               // 接受報名中（已發佈＋未過截止）
  course?: CircularCourseSnap | null;
}

/** 管理系統列表：全部通告＋下一個建議編號 */
export interface CircularsBoard {
  items: Circular[];
  suggestedNo: string;
}

// ===================== 通告 URL 自動讀料（舊制開班登記） =====================
// ADC 貼上區網通告 PDF 連結 → 伺服器抽文字 → lib/notice-parse.ts 按 label 讀出報班必備欄位。

/** 通告節次（display = 日期＋時間＋地點一行，拆唔開都保證有料） */
export interface NoticeSession {
  date: string;      // 中文：2026年7月20日（星期一）
  dateISO: string;   // 2026-07-20
  weekday: string;   // 星期一
  time: string;      // 下午七時至十時
  venue: string;     // 香港童軍百周年紀念大樓
  display: string;   // 上面砌埋一行
}

/** 通告查詢聯絡 */
export interface NoticeContact {
  name: string;
  role: string;
  phone: string;     // 4-4：5721 1100
  email: string;
}

/** 通告讀出嚟嘅報班必備欄位（warnings = 邊啲讀唔到，叫職員人手補） */
export interface NoticeFields {
  title: string;
  fee: string;            // 銀碼數字字串（冇就空字串）
  originalFee: string;    // 原價（有資助先有）
  feeText: string;        // 費用段全文
  subsidyNote: string;    // 資助說明（費用段「原價…資助」嗰句；直入 CourseLink.subsidyNote）
  badges: string[];       // 徽章／章別（標題拆出嚟；網頁帖文標籤會再補）
  section: string;        // 支部（由參加資格推；網頁帖文標籤會再補）
  freeFee: boolean;       // 免費／全免
  quota: string;
  deadline: string;       // yyyy-MM-dd
  eligibility: string;    // 參加資格全文
  sessions: NoticeSession[];
  sessionsText: string;   // display 以「；」串起（直入 CourseLink.sessionsText）
  venue: string;          // 去重以「、」串起
  leader: string;         // 班領導人
  contact: string;        // 聯絡一行（直入 CourseLink.contact）
  contactDetail: NoticeContact;
  uniform: string;
  remarks: string;        // 備註全文
  enquiry: string;        // 查詢段全文
  signupText: string;     // 報名辦法全文
  fileNo: string;         // 通告編號（text＝內文讀到，url＝由檔名估）
  fileNoFrom: '' | 'text' | 'url';
  issueDate: string;
  signer: string;         // 區總監署名
  deputy: string;         // 代行
  warnings: string[];
}

// ===================== 新制：區系統直入＋網頁列印（v4.14.0） =====================
// ADC 喺區系統填晒成份開班設定 → 區後台自動複製班 Sheet＋寫入 → 12 張列印喺網頁出。
// 寫入座標跟足 v4.13.0 工作簿模版（人手舊班唔保證啱位，只讀唔寫）。

/** Input01 預算日期（B16:B24 共 9 行：B 日期／C 時間／E 場地） */
export interface SetupBudgetDate { date: string; time: string; venue: string; }

/** Input01 膳食行 32–39：B 日期／C 時間／E–I 早午晚茶水／J 職員學員 */
export interface SetupMealLine {
  date: string; time: string;
  breakfast: string; lunch: string; dinner: string; snack: string; water: string;
  who: string;  // '' | '職員' | '學員'
}
/** Input01 租金：場租行 47–49／露營行 54–56／住宿行 62–64（B 地點／C 時段營期／F 數量／G 人數房數／H 單價） */
export interface SetupRentLine { place: string; period: string; qty: string; qty2: string; price: string; }
/** Input01 交通行 69–74：C 日期路線車種／H 預算 */
export interface SetupTransportLine { route: string; budget: string; }
/** Input01 講義 79–81／節目 85–87／行政 91–93／紀念品 97–98：B 項目／G 數量／H 單價 */
export interface SetupQtyPriceLine { item: string; qty: string; price: string; }
/** Input01 其他行 102–104：B 註明／E 金額 */
export interface SetupMiscLine { item: string; amount: string; }

export interface SetupExpenses {
  meals: SetupMealLine[];       // 8 行
  venue: SetupRentLine[];       // 3 行（第 2 行預設「其他收費」）
  camp: SetupRentLine[];        // 3 行
  lodging: SetupRentLine[];     // 3 行
  transport: SetupTransportLine[];  // 6 行（3.1／3.2／3.3 各 2 行）
  handouts: SetupQtyPriceLine[];    // 3 行（影印／光碟／快勞）
  program: SetupQtyPriceLine[];     // 3 行
  admin: SetupQtyPriceLine[];       // 3 行（攝影／印刷郵費／文具）
  souvenir: SetupQtyPriceLine[];    // 2 行（紀念品／獎品）
  misc: SetupMiscLine[];            // 3 行
}

/** Input02 節次行 9–16：B 日期／C 跨日／D 時間／E 場地／H ✓上通告／I–K 通告顯示 */
export interface SetupSession {
  date: string; spanNext: boolean; time: string; venue: string;
  displayDate: string; displayTime: string; displayVenue: string; show: boolean;
}

/** Input03 節目流程（每組 5 行：C 需時／D 項目／E 負責人；B 時間自動計） */
export interface SetupFlow { mins: string; item: string; owner: string; }
/** Input03 每節一組（E 服裝＋5 行流程） */
export interface SetupTimetable { clothing: string; flows: SetupFlow[]; }

/** 成份開班設定（新制直入表單＋setupJson＋列印數據來源） */
export interface CourseSetup {
  courseId: string;
  // ── Input01 頭段 ──
  courseName: string; edition: string; section: string; badge: string;
  customName: string; form1: string; form2: string;
  expectedIntake: string; expectedFee: string; expectedStaff: string;
  budgetDates: SetupBudgetDate[];
  expenses: SetupExpenses;
  // ── Input02 ──
  quota: string; fee: string; staffCount: string;
  sessions: SetupSession[];
  deadline: string; publishDate: string;
  staff: CourseProfileStaff[];   // 20 行（職位預設）
  residentStaff: string;
  // ── Input03 ──
  timetable: SetupTimetable[];   // 3 組
  // ── Print_通告人手格 ──
  eligibility: string; feeNote: string; uniform: string; remarks: string[];
  fileNo: string; issueDate: string; signer: string; deputy: string;
  // ── Print_接納通知書人手格 ──
  acceptCheckin: string; acceptItems: string; acceptOthers: string; acceptNote: string;
  // ── Print_財政預算＋資助人手格 ──
  financeApproved: string; financeHqSubsidy: string; subsidyOrigFee: string;
  // ── 交收 ──
  clEmail: string;               // 班領導人電郵（自動分享班 Sheet 用）
  sheetId?: string; sheetUrl?: string; updatedAt?: string;
}

/** 寫入班 Sheet 嘅格（後台照單寫入，唔使識座標） */
export interface SetupCell { tab: string; row: number; col: number; value: string | boolean; }

/** 班 Sheet 原始數據（pullCourseSheetRaw 回傳，前端 parse） */
export type SheetMatrix = unknown[][];
export interface CourseSheetRaw {
  input01: SheetMatrix; input02: SheetMatrix; input03: SheetMatrix; input04: SheetMatrix;
  resp: SheetMatrix;         // 表格回應全文
  paramsWX: SheetMatrix;     // 參數 W1:X5（成員網址／FPS／區網）
  notice: SheetMatrix;       // Print_通告
  accept: SheetMatrix;       // Print_接納通知書
  finance: SheetMatrix;      // Print_財政預算
  completion: SheetMatrix;   // Print_訓練班完成報告
  cert: SheetMatrix;         // Print_領取證書紀錄
  subsidy: SheetMatrix;      // Print_總會資助計劃
  pulledAt: string;
  rev?: number; revSavedAt?: string; revBy?: string; // v4.15.0：_Sync 版本號（防呆樂觀鎖用）
}

/** 名單列（approved 順序） */
export interface PrintRosterRow {
  seq: number; group: string; code: string; name: string; nameEn: string; gender: string;
  troop: string; district: string; phone: string; parentPhone: string; email: string;
  scoutId: string; position: string; troopNo: string;
}
/** 完成報告學員列（D–F 人手） */
export interface PrintCompletionRow { code: string; name: string; troopNo: string; certNo: string; pass: string; failReason: string; }
/** 領取證書列（E–G 人手） */
export interface PrintCertRow { code: string; name: string; troopNo: string; certNo: string; pickupDate: string; signed: string; }

/** 12 張網頁列印嘅總數據（setup＋班 Sheet 活數據合併） */
export interface CoursePrintData {
  setup: CourseSetup;
  roster: PrintRosterRow[];
  counts: {
    appliedHome: number; appliedOther: number;
    admittedHome: number; admittedOther: number; admittedTotal: number;
    completed: number; passed: number;
  };
  actuals: number[];       // Input04 小計 B43:J43（9 項）
  actualTotal: number;
  revised: Record<string, string>;  // 財政預算修訂欄（key = 行號字串）
  completion: PrintCompletionRow[];
  certRows: PrintCertRow[];
  subsidyRows: SheetMatrix;         // 資助學員列原文（22–51 行）
  portalUrl: string; fpsId: string; fpsName: string; webUrl: string;
  pulledAt: string;
}
