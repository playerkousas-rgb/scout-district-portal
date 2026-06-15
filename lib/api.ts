/**
 * API 封裝：呼叫「目前所選區」的 Apps Script Web App。
 * API_BASE 不再寫死，改用 district.ts 的 getApiBase()（多區）。
 */
import { getApiBase } from './district';
import type {
  ApiResult, UserSession, CardDef, DistrictConfig, PermsBundle, AccessLevel,
  SystemState, RegistryBundle, PluginItem, RoleDef,
} from './types';

async function callGet(action: string, params: Record<string, string> = {}) {
  const API_BASE = getApiBase();
  const url = new URL(API_BASE);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

async function callPost(action: string, body: Record<string, unknown> = {}) {
  const API_BASE = getApiBase();
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body }),
  });
  return res.json();
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
