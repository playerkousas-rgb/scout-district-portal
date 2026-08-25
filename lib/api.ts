/**
 * API 封裝：所有請求經 /api/proxy 轉發，API Key 不經前端。
 * 區碼從 localStorage 讀取（同 DBS 3.0 模式）。
 */

import { DISTRICT_STORAGE_KEY } from './district';
import type {
  ApiResult, UserSession, CardDef, DistrictConfig, PermsBundle, AccessLevel,
  SystemState, RegistryBundle, PluginItem, RoleDef, PortalUser, BatchUserInput,
  CourseLink, Venue, VenueBooking, StockItem, StockRequest, ActivityNotice,
} from './types';

function getDistrictCode(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(DISTRICT_STORAGE_KEY) || '';
}

async function callGet<T = any>(action: string, params: Record<string, string> = {}): Promise<ApiResult<T>> {
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

async function callPost<T = any>(action: string, body: Record<string, unknown> = {}): Promise<ApiResult<T>> {
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
  login: (email: string, password: string): Promise<ApiResult<UserSession>> =>
    callPost('login', { email, password }),

  getConfig: (): Promise<ApiResult<DistrictConfig>> => callGet('getConfig'),

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
  updateUser: (token: string, email: string, patch: Partial<PortalUser> & { password?: string }): Promise<ApiResult<{ saved: boolean }>> => callPost('updateUser', { token, email, patch }),
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
};
