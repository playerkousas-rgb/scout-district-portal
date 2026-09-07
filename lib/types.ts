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
