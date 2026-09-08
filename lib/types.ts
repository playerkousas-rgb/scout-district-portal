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
  createdAt?: string;
  updatedAt?: string;
}

export interface VisitBoard {
  from: string;
  to: string;
  today: string;
  units: ScoutUnit[];
  visits: Visit[];
  years: number[];
  sections: { key: VisitSection; label: string }[];
  me: { email: string; role: string; name: string; defaultSection: VisitSection | '' };
}
