/**
 * 區目錄（多區連接核心）— 採 DBS 3.0 模式
 * ================================================================
 * 「統一前端 + 各區獨立 Google Sheet / Apps Script 後台」。
 * 區碼 → apiBase 對照寫在這裡；接新區只需加一筆再 push。
 *
 * 三態 status：
 *   live     已開通（正常使用）
 *   testing  測試中（可進，但標示測試）
 *   disabled 暫停服務（顯示維護訊息，不可進）
 */

export const PLATFORM_NAME = '童軍區管理平台';
export const PLATFORM_COPYRIGHT = '© 2026 SKWSCOUT SYSTEM';
export const DISTRICT_STORAGE_KEY = 'portal_selected_district';
export const DEFAULT_DISABLED_MESSAGE = '此區服務現正暫停。請留意區方通知，或稍後再試。';

export type DistrictStatus = 'live' | 'testing' | 'disabled';

export interface DistrictInfo {
  code: string;
  name: string;
  apiBase: string;
  status: DistrictStatus;
  note?: string;
  maintenanceMessage?: string;
}

// ★ 區目錄：接新區在此加一筆（區碼大寫）
export const DISTRICTS = {
  SKW: {
    code: 'SKW',
    name: '筲箕灣區',
    apiBase: 'https://script.google.com/macros/s/REPLACE_SKW_DEPLOYMENT_ID/exec',
    status: 'live',
    note: '模板區 / 首個接入區。',
  },
  // 範例：接入柴灣區時打開並填入該區自己的 exec 網址
  // CHW: {
  //   code: 'CHW',
  //   name: '柴灣區',
  //   apiBase: 'https://script.google.com/macros/s/.../exec',
  //   status: 'testing',
  //   note: '測試中。',
  // },
} as const satisfies Record<string, DistrictInfo>;

export type DistrictCode = keyof typeof DISTRICTS;
export const DISTRICT_LIST: DistrictInfo[] = Object.values(DISTRICTS);

export function isDistrictCode(value: string | null | undefined): value is DistrictCode {
  return !!value && value in DISTRICTS;
}

export function getDistrictInfo(code: string | null | undefined): DistrictInfo | null {
  if (!isDistrictCode(code)) return null;
  return DISTRICTS[code];
}

export function isDistrictAvailable(code: string | null | undefined) {
  const d = getDistrictInfo(code);
  return !!d && d.status !== 'disabled';
}

export function getDistrictLockMessage(code: string | null | undefined) {
  const d = getDistrictInfo(code);
  if (!d) return DEFAULT_DISABLED_MESSAGE;
  return d.maintenanceMessage || `${d.name}現正暫停使用本平台。請留意區方通知或聯絡平台管理員。`;
}

export function getLiveDistricts() { return DISTRICT_LIST.filter(d => d.status === 'live'); }
export function getTestingDistricts() { return DISTRICT_LIST.filter(d => d.status === 'testing'); }
export function getDisabledDistricts() { return DISTRICT_LIST.filter(d => d.status === 'disabled'); }

export function getStoredDistrictCode(): DistrictCode | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(DISTRICT_STORAGE_KEY);
  return isDistrictCode(v) ? v : null;
}
export function setStoredDistrictCode(code: DistrictCode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DISTRICT_STORAGE_KEY, code);
}
export function clearStoredDistrictCode() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DISTRICT_STORAGE_KEY);
}

export function resolveDistrictCode(): DistrictCode | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('d');
  if (isDistrictCode(fromQuery)) {
    setStoredDistrictCode(fromQuery);
    return fromQuery;
  }
  return getStoredDistrictCode();
}

export function getApiBase(): string {
  const code = resolveDistrictCode();
  if (!code) throw new Error('DISTRICT_NOT_SELECTED');
  if (!isDistrictAvailable(code)) throw new Error('DISTRICT_DISABLED');
  return DISTRICTS[code].apiBase;
}

export function withDistrictParam(path: string, code: string | null | undefined): string {
  if (!path || !code) return path;
  const hashIndex = path.indexOf('#');
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : '';
  const base = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  try {
    const url = new URL(base, 'https://placeholder.local');
    url.searchParams.set('d', code);
    return `${url.pathname}${url.search}${hash}`;
  } catch {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}d=${encodeURIComponent(code)}${hash}`;
  }
}

export function getDistrictStatusLabel(status: DistrictStatus) {
  if (status === 'live') return '已開通';
  if (status === 'testing') return '測試中';
  return '暫停服務';
}
export function getDistrictStatusColor(status: DistrictStatus) {
  if (status === 'live') return '#16a34a';
  if (status === 'testing') return '#d97706';
  return '#dc2626';
}
