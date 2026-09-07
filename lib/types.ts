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
}

export interface PortalUser {
  email: string;
  displayName: string;
  role: string;
  scopes: string;
  cards?: string; // 每帳戶 scope 覆寫（逗號分隔 cardId；留空 = 用角色矩陣）
  active: boolean;
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
