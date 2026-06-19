/**
 * API 封裝：所有請求經 /api/proxy 轉發，API Key 不經前端。
 * 區碼從 localStorage 讀取（同 DBS 3.0 模式）。
 */

import { DISTRICT_STORAGE_KEY } from './district';
import type {
  ApiResult, UserSession, CardDef, DistrictConfig, PermsBundle, AccessLevel,
  SystemState, RegistryBundle, PluginItem, RoleDef,
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

  // 角色管理（DC / SYSADMIN）
  addRole: (token: string, role: string, label: string): Promise<ApiResult<{ saved: boolean }>> =>
    callPost('addRole', { token, role, label }),
  updateRole: (token: string, role: string, label: string): Promise<ApiResult<{ saved: boolean }>> =>
    callPost('updateRole', { token, role, label }),
  deleteRole: (token: string, role: string): Promise<ApiResult<{ deleted: boolean }>> =>
    callPost('deleteRole', { token, role }),

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
};
