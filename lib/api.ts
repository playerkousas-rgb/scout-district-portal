/**
 * API 封裝：所有請求經 /api/proxy 轉發，API Key 不經前端。
 * 區碼從 localStorage 讀取（同 DBS 3.0 模式）。
 */

import { DISTRICT_STORAGE_KEY } from './district.ts';
import type {
  ApiResult, UserSession, CardDef, DistrictConfig, PermsBundle, AccessLevel,
  SystemState, RegistryBundle, PluginItem, RoleDef, PortalUser, BatchUserInput,
  CourseLink, Venue, VenueBooking, StockItem, StockRequest, ActivityNotice, IncidentReport, DelegationBundle,
  Announcement, AwardsBoard, AwardMember, AwardType, Visit, VisitBoard, ScoutUnit,
} from './types.ts';
import type { BudgetRow, BudgetSummary, DeptContact, OrgGroup, OrgMember, StaffRow } from './externalParsers.ts';
import type { IcsEvent } from './ics.ts';
import { isDemoMode } from './demo/session.ts';
import { demoCall, demoExternal } from './demo/engine.ts';

function getDistrictCode(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(DISTRICT_STORAGE_KEY) || '';
}

async function callGet<T = any>(action: string, params: Record<string, string> = {}): Promise<ApiResult<T>> {
  // 🎭 模擬示範版：全部行本地引擎，唔會打去後端
  if (isDemoMode()) return demoCall(action, { ...params }, 'GET') as ApiResult<T>;
  const districtCode = getDistrictCode();
  const url = new URL('/api/proxy', window.location.origin);
  url.searchParams.set('districtCode', districtCode);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('GET Error:', error);
    return { ok: false, error: '連線失敗：請確認該區後台已部署且 API Key 已設定。' };
  }
}

/** v4.5.0：外部公開資料（港島地域／總會網頁、預算 Sheet、房間日曆）— 由 /api/external 伺服器端代抓，唔經 Apps Script */
async function callExternal<T = any>(kind: string, params: Record<string, string> = {}): Promise<ApiResult<T>> {
  // 🎭 模擬示範版：外部資料用內建示範資料
  if (isDemoMode()) return demoExternal(kind, { ...params }) as ApiResult<T>;
  const url = new URL('/api/external', window.location.origin);
  url.searchParams.set('kind', kind);
  Object.entries(params).forEach(([k, v]) => { if (v !== '') url.searchParams.set(k, v); });
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    return await res.json();
  } catch (error) {
    console.error('External Error:', error);
    return { ok: false, error: '連線失敗：暫時未能讀取外部資料。' };
  }
}

async function callPost<T = any>(action: string, body: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  // 🎭 模擬示範版：全部行本地引擎，唔會打去後端
  if (isDemoMode()) return demoCall(action, { ...body }, 'POST') as ApiResult<T>;
  const districtCode = getDistrictCode();
  const postBody = { districtCode, action, ...body };

  try {
    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
    });
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('POST Error:', error);
    return { ok: false, error: '連線失敗：請確認該區後台已部署且 API Key 已設定。' };
  }
}

export const api = {
  login: (email: string, password: string, remember = false): Promise<ApiResult<UserSession>> =>
    callPost('login', { email, password, remember }),

  getConfig: (): Promise<ApiResult<DistrictConfig>> => callGet('getConfig'),
  /** 公開設定（成員系統同一份）：旅號清單 troopList 等 */
  getPublicInfo: (): Promise<ApiResult<{ districtName: string; districtCode: string; troopList?: string[]; locked?: boolean }>> => callGet('getPublicInfo'),

  getCards: (token: string): Promise<ApiResult<CardDef[]>> =>
    callGet('getCards', { token }),

  verify: (token: string): Promise<ApiResult<UserSession>> =>
    callGet('verify', { token }),

  // 健康檢查（接入測試用）
  health: (): Promise<ApiResult<{ ok: boolean }>> => callGet('getHealthCheck'),

  // 權限管理
  getPerms: (token: string): Promise<ApiResult<PermsBundle>> =>
    callGet('getPerms', { token }),
  savePerms: (token: string, matrix: Record<string, Record<string, AccessLevel>>):
    Promise<ApiResult<{ saved: boolean }>> =>
    callPost('savePerms', { token, matrix }),
  setCardEnabled: (token: string, cardId: string, enabled: boolean):
    Promise<ApiResult<{ saved: boolean; cardId: string; enabled: boolean }>> =>
    callPost('setCardEnabled', { token, cardId, enabled }),
  // 密碼（v4.4.0）：忘記密碼寄重設連結去帳戶電郵；用重設代碼設定新密碼
  requestPasswordReset: (email: string, resetUrlBase: string): Promise<ApiResult<{ sent: boolean; message: string }>> =>
    callPost('requestPasswordReset', { email, resetUrlBase }),
  resetPassword: (resetToken: string, newPassword: string): Promise<ApiResult<{ reset: boolean; email: string }>> =>
    callPost('resetPassword', { resetToken, newPassword }),
  // 授權／收回（v4.4.0）
  getDelegation: (token: string): Promise<ApiResult<DelegationBundle>> => callGet('getDelegation', { token }),
  delegatePerms: (token: string, targetRole: string, grants: Record<string, AccessLevel>): Promise<ApiResult<{ applied: number; rejected: string[] }>> =>
    callPost('delegatePerms', { token, targetRole, grants }),
  revokePerms: (token: string, targetRole: string): Promise<ApiResult<{ revoked: number; roles: string[] }>> =>
    callPost('revokePerms', { token, targetRole }),
  changePassword: (token: string, oldPassword: string, newPassword: string):
    Promise<ApiResult<{ changed: boolean }>> =>
    callPost('changePassword', { token, oldPassword, newPassword }),
  setCategoryEnabled: (token: string, category: string, enabled: boolean):
    Promise<ApiResult<{ saved: boolean; category: string; enabled: boolean; count: number }>> =>
    callPost('setCategoryEnabled', { token, category, enabled }),

  // 角色管理（DC / SYSADMIN）
  addRole: (token: string, role: string, label: string): Promise<ApiResult<{ saved: boolean }>> =>
    callPost('addRole', { token, role, label }),
  updateRole: (token: string, role: string, label: string): Promise<ApiResult<{ saved: boolean }>> =>
    callPost('updateRole', { token, role, label }),
  deleteRole: (token: string, role: string): Promise<ApiResult<{ deleted: boolean }>> =>
    callPost('deleteRole', { token, role }),

  // 前端帳戶管理
  getUsers: (token: string): Promise<ApiResult<PortalUser[]>> => callGet('getUsers', { token }),
  batchCreateUsers: (token: string, users: BatchUserInput[]): Promise<ApiResult<{ created: number; skipped: number; rejected: { row: number; email: string; reason: string }[] }>> => callPost('batchCreateUsers', { token, users }),
  updateUser: (token: string, email: string, patch: Partial<PortalUser> & { password?: string; resetToDefault?: boolean }): Promise<ApiResult<{ saved: boolean }>> => callPost('updateUser', { token, email, patch }),
  deleteUser: (token: string, email: string): Promise<ApiResult<{ deleted: boolean }>> => callPost('deleteUser', { token, email }),

  // 系統鎖定
  getSystem: (): Promise<ApiResult<SystemState>> => callGet('getSystem'),
  setLock: (token: string, locked: boolean, message?: string): Promise<ApiResult<{ locked: boolean }>> =>
    callPost('setLock', { token, locked, message }),

  // 外掛
  getRegistry: (token: string): Promise<ApiResult<RegistryBundle>> =>
    callGet('getRegistry', { token }),
  installPlugin: (token: string, plugin: PluginItem): Promise<ApiResult<{ installed: boolean }>> =>
    callPost('installPlugin', { token, plugin }),
  uninstallPlugin: (token: string, cardId: string): Promise<ApiResult<{ uninstalled: boolean }>> =>
    callPost('uninstallPlugin', { token, cardId }),

  // 訓練班（CourseLinks + 報名審批）
  getCourseLinks: (token: string): Promise<ApiResult<CourseLink[]>> =>
    callGet('getCourseLinks', { token }),
  saveCourseLink: (token: string, link: CourseLink): Promise<ApiResult<{ saved: boolean; courseId: string }>> =>
    callPost('saveCourseLink', { token, link }),
  deleteCourseLink: (token: string, courseId: string): Promise<ApiResult<{ deleted: boolean }>> =>
    callPost('deleteCourseLink', { token, courseId }),

  // 借場（申請由 member-portal 公開端提交；呢度只做批核）
  listVenues: (): Promise<ApiResult<Venue[]>> => callGet('listVenues'),
  getLockList: (token: string): Promise<ApiResult<{
    apiBase: string;
    configuredLockId: string;
    locks: { lockId: number | string; name: string; mac: string; hasGateway: boolean }[];
  }>> => callGet('getLockList', { token }),
  getVenueBookings: (token: string): Promise<ApiResult<VenueBooking[]>> => callGet('getVenueBookings', { token }),
  setVenueBookingStatus: (token: string, id: string, status: string): Promise<ApiResult<{ saved: boolean }>> =>
    callPost('setVenueBookingStatus', { token, id, status }),
  // 聯調批核：狀態 approved + Teamup 轉色（唔掂鎖、唔寄密碼）
  confirmVenueBooking: (token: string, id: string): Promise<ApiResult<{ saved: boolean; teamupEventId?: string; warn: string }>> =>
    callPost('confirmVenueBooking', { token, id }),
  // 完整批核：TTLock 限時密碼 + Teamup 轉色 + 電郵申請人（稍後先用）
  approveVenueBooking: (token: string, id: string): Promise<ApiResult<{ saved: boolean; password: string; warn: string }>> =>
    callPost('approveVenueBooking', { token, id }),
  rejectVenueBooking: (token: string, id: string): Promise<ApiResult<{ saved: boolean }>> =>
    callPost('rejectVenueBooking', { token, id }),
  updateVenueBooking: (token: string, id: string, patch: Record<string, string>): Promise<ApiResult<{ saved: boolean }>> =>
    callPost('updateVenueBooking', { token, id, patch }),
  submitVenueRequest: (body: Record<string, string>): Promise<ApiResult<{ refCode: string; id?: string; teamupEventId?: string; warn?: string }>> =>
    callPost('submitVenueRequest', body),
  getPendingInbox: (token: string): Promise<ApiResult<{
    venue: { id: string; type: string; refCode: string; title: string; name: string; startDate: string; endDate: string; purpose: string }[];
    stock: { id: string; type: string; refCode: string; title: string; name: string; startDate: string; endDate: string; purpose: string }[];
    total: number;
  }>> => callGet('getPendingInbox', { token }),
  saveVenue: (token: string, venue: Venue): Promise<ApiResult<{ saved: boolean }>> =>
    callPost('saveVenue', { token, venue }),
  deleteVenue: (token: string, venueId: string): Promise<ApiResult<{ deleted: boolean }>> =>
    callPost('deleteVenue', { token, venueId }),

  // 借物資
  listItems: (): Promise<ApiResult<StockItem[]>> => callGet('listItems'),
  getStockRequests: (token: string): Promise<ApiResult<StockRequest[]>> => callGet('getStockRequests', { token }),
  setStockRequestStatus: (token: string, id: string, status: string): Promise<ApiResult<{ saved: boolean }>> =>
    callPost('setStockRequestStatus', { token, id, status }),
  /** 一次過批核整張多款物資申請（同一 batchRef）；庫存逐行加減，只寄一封通知 */
  setStockBatchStatus: (token: string, batchRef: string, status: string):
    Promise<ApiResult<{ saved: boolean; batchRef: string; count: number; failed: string[] }>> =>
    callPost('setStockBatchStatus', { token, batchRef, status }),
  saveItem: (token: string, item: StockItem): Promise<ApiResult<{ saved: boolean }>> =>
    callPost('saveItem', { token, item }),
  deleteItem: (token: string, itemId: string): Promise<ApiResult<{ deleted: boolean }>> =>
    callPost('deleteItem', { token, itemId }),

  // 知會
  listActivityNotices: (params: Record<string, string> = {}): Promise<ApiResult<ActivityNotice[]>> =>
    callGet('listActivityNotices', params),
  submitActivityNotice: (data: Record<string, string>): Promise<ApiResult<{ refCode: string }>> =>
    callPost('submitActivityNotice', data),
  deleteActivityNotice: (token: string, id: string): Promise<ApiResult<{ deleted: boolean }>> =>
    callPost('deleteActivityNotice', { token, id }),

  // 消息發佈（v4.6.0）：呢邊發 → 成員系統 member-portal 首頁頂部置頂顯示；呢邊刪／下架即刻消失
  /** 公開讀（同成員系統睇到嘅完全一樣）：pinnedOnly 只要置頂 */
  listAnnouncements: (params: { pinnedOnly?: boolean; limit?: number; since?: string } = {}): Promise<ApiResult<Announcement[]>> =>
    callGet('listAnnouncements', {
      ...(params.pinnedOnly ? { pinnedOnly: '1' } : {}),
      ...(params.limit ? { limit: String(params.limit) } : {}),
      ...(params.since ? { since: params.since } : {}),
    }),
  /** 管理系統列表：連未到期／已過期／已下架都回 */
  getAnnouncements: (token: string): Promise<ApiResult<Announcement[]>> =>
    callGet('getAnnouncements', { token }),
  /** 新增（id 留空）或更新消息 */
  saveAnnouncement: (token: string, announcement: Partial<Announcement>): Promise<ApiResult<{ saved: boolean; id: string; created: boolean }>> =>
    callPost('saveAnnouncement', { token, announcement }),
  // ── 🎖 獎勵提名（v4.7.0）──────────────────────────────
  /** 一次過攞名冊 + 年期規則 */
  getAwardsBoard: (token: string): Promise<ApiResult<AwardsBoard>> =>
    callGet('getAwardsBoard', { token }),
  /** 新增（id 留空）或更新一位成員 */
  saveAwardMember: (token: string, member: Partial<AwardMember>): Promise<ApiResult<{ saved: boolean; id: string; created: boolean }>> =>
    callPost('saveAwardMember', { token, member }),
  deleteAwardMember: (token: string, id: string): Promise<ApiResult<{ deleted: boolean; id: string }>> =>
    callPost('deleteAwardMember', { token, id }),
  /** 由 Excel 貼上批量匯入；mode: merge（同名同旅團更新）／replace（清空重寫） */
  importAwardMembers: (token: string, rows: Partial<AwardMember>[], mode: 'merge' | 'replace'): Promise<ApiResult<{ added: number; updated: number; skipped: number }>> =>
    callPost('importAwardMembers', { token, rows, mode }),
  /** 儲存獎項及年期設定（整張表覆寫） */
  // ── 🏕 旅團探訪（v4.8.1）──────────────────────────────
  getVisitBoard: (token: string, from?: string, to?: string): Promise<ApiResult<VisitBoard>> =>
    callGet('getVisitBoard', { token, ...(from ? { from } : {}), ...(to ? { to } : {}) }),
  saveVisit: (token: string, visit: Partial<Visit>): Promise<ApiResult<{ saved: boolean; id: string; troop: string; visitDate: string }>> =>
    callPost('saveVisit', { token, visit }),
  deleteVisit: (token: string, id: string): Promise<ApiResult<{ deleted: boolean }>> =>
    callPost('deleteVisit', { token, id }),
  saveUnits: (token: string, units: ScoutUnit[]): Promise<ApiResult<{ saved: boolean; count: number }>> =>
    callPost('saveUnits', { token, units }),

  saveAwardTypes: (token: string, types: AwardType[]): Promise<ApiResult<{ saved: boolean; count: number; newColumns: string[] }>> =>
    callPost('saveAwardTypes', { token, types }),

  deleteAnnouncement: (token: string, id: string): Promise<ApiResult<{ deleted: boolean; id: string }>> =>
    callPost('deleteAnnouncement', { token, id }),
  /** v4.9.0：還原已刪除留底嘅消息（還原後係「已下架」狀態） */
  restoreAnnouncement: (token: string, id: string): Promise<ApiResult<{ restored: boolean; id: string }>> =>
    callPost('restoreAnnouncement', { token, id }),
  setAnnouncementPinned: (token: string, id: string, pinned: boolean): Promise<ApiResult<{ saved: boolean; id: string; pinned: boolean }>> =>
    callPost('setAnnouncementPinned', { token, id, pinned }),
  setAnnouncementActive: (token: string, id: string, active: boolean): Promise<ApiResult<{ saved: boolean; id: string; active: boolean }>> =>
    callPost('setAnnouncementActive', { token, id, active }),

  // ── 🎖 獎勵提名：提名期死線（v4.9.0，民青局嘉許）──
  saveAwardDeadlines: (token: string, cfg: { habDistrict: string; habHq: string }): Promise<ApiResult<{ saved: boolean; deadlineCfg: { habDistrict: string; habHq: string } }>> =>
    callPost('saveAwardDeadlines', { token, cfg }),

  // ── 📇 聯絡簿：地域職員姓名區方自訂（v4.9.0；電話唔變人會轉）──
  getContactNames: (token: string): Promise<ApiResult<{ names: Record<string, string> }>> =>
    callPost('getContactNames', { token }),
  /** name 留空 = 還原官方同步名 */
  saveContactName: (token: string, key: string, name: string): Promise<ApiResult<{ saved: boolean; key: string; name: string }>> =>
    callPost('saveContactName', { token, key, name }),

  // 意外／應變：意外報告（只喺按「確定提交」時先送後台；草稿留喺本機）
  submitIncidentReport: (token: string, report: IncidentReport): Promise<ApiResult<{ refCode: string; id: string }>> =>
    callPost('submitIncidentReport', { token, report }),
  listIncidentReports: (token: string): Promise<ApiResult<IncidentReport[]>> =>
    callGet('listIncidentReports', { token }),
  updateIncidentReport: (token: string, id: string, patch: Partial<IncidentReport>): Promise<ApiResult<{ saved: boolean }>> =>
    callPost('updateIncidentReport', { token, id, patch }),
  deleteIncidentReport: (token: string, id: string): Promise<ApiResult<{ deleted: boolean }>> =>
    callPost('deleteIncidentReport', { token, id }),

  // ── v4.5.0 外部同步（/api/external）──
  /** 港島地域職員直線電話（hkirscout.org.hk 專業領袖及受薪職員） */
  extRegionStaff: (): Promise<ApiResult<ExternalMeta & { rows: StaffRow[]; updated: string }>> => callExternal('regionStaff'),
  /** 港島地域總監架構 */
  extRegionOrg: (): Promise<ApiResult<ExternalMeta & { groups: OrgGroup[]; updated: string }>> => callExternal('regionOrg'),
  /** 總會香港總監諮議會 */
  extHksaCouncil: (): Promise<ApiResult<ExternalMeta & { members: OrgMember[] }>> => callExternal('hksaCouncil'),
  /** 總會 11 個署聯絡 */
  extHksaDepts: (): Promise<ApiResult<ExternalMeta & { depts: (DeptContact & { ok: boolean })[] }>> => callExternal('hksaDepts'),
  /** 區年度預算（Google Sheet gviz CSV） */
  extBudget: (sheetUrl = ''): Promise<ApiResult<ExternalMeta & { rows: BudgetRow[]; summary: BudgetSummary[]; sheetUrl: string }>> =>
    callExternal('budget', { sheet: sheetUrl }),
  /** 地域房間日曆（公開 ICS）；room 留空 = 全部 */
  extRooms: (room = '', from = '', days = 14): Promise<ApiResult<ExternalMeta & { from: number; to: number; days: number; rooms: RoomEvents[] }>> =>
    callExternal('rooms', { room, from, days: String(days) }),
};

/** /api/external 共同欄位 */
export interface ExternalMeta {
  fetchedAt: string;     // 伺服器抓取時間（ISO）
  cached?: boolean;      // 命中伺服器快取
  stale?: boolean;       // 上游失敗，回傳最後一次成功結果
  staleReason?: string;
  source?: string;
}
export interface RoomEvents { id: string; ok: boolean; error?: string; events: IcsEvent[] }
