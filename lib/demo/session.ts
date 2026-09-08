/**
 * 🎭 模擬示範版 — 模式開關＋示範身份（v4.9.0）
 * ================================================================
 * 開關存 localStorage（`portal_demo_mode`），示範 session 存
 * `portal_demo_session`。開著時：
 *   - lib/session.ts 嘅 load/save/clear 全部改行示範儲存
 *   - lib/api.ts 全部呼叫改行本地引擎（lib/demo/engine.ts）
 * 亦可由 URL `?demo=1`（開）／`?demo=0`（離開）控制 — 方便直接分享示範連結。
 */

import type { UserSession } from '../types.ts';
import { DEMO_USERS, DEMO_TOKEN, type DemoUser } from './seed.ts';
import { clearStoredDistrictCode, getStoredDistrictCode, isDistrictCode, setStoredDistrictCode, DISTRICT_STORAGE_KEY } from '../district.ts';

export const DEMO_FLAG_KEY = 'portal_demo_mode';
export const DEMO_SESSION_KEY = 'portal_demo_session';
const DEMO_PREV_DISTRICT_KEY = 'portal_demo_prev_district';

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(DEMO_FLAG_KEY) === '1'; } catch { return false; }
}

export function setDemoMode(on: boolean) {
  try {
    if (on) window.localStorage.setItem(DEMO_FLAG_KEY, '1');
    else window.localStorage.removeItem(DEMO_FLAG_KEY);
  } catch { /* ignore */ }
}

export function loadDemoSession(): UserSession | null {
  if (!isDemoMode()) return null;
  try {
    const raw = window.localStorage.getItem(DEMO_SESSION_KEY);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  } catch { return null; }
}

export function saveDemoSession(s: UserSession) {
  try { window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function clearDemoSession() {
  try { window.localStorage.removeItem(DEMO_SESSION_KEY); } catch { /* ignore */ }
}

function tokenFor(u: DemoUser): string {
  return `demo-${u.email.replace('demo-', '').replace('@demo', '')}`;
}

/** 一鍵以某示範身份進入模擬示範版（未登入演示用） */
export function enterDemoRole(key: string): UserSession {
  const u = (DEMO_USERS[key] || DEMO_USERS.dc) as DemoUser;
  // 記低進示範前嘅區選擇（離開時還原）；未選區就借用 SKW（純標示用，demo 模式下所有 API 都係本地）
  try {
    if (window.localStorage.getItem(DEMO_PREV_DISTRICT_KEY) === null) {
      window.localStorage.setItem(DEMO_PREV_DISTRICT_KEY, getStoredDistrictCode() || '');
    }
    if (!getStoredDistrictCode()) setStoredDistrictCode('SKW');
  } catch { /* ignore */ }
  const session: UserSession = {
    email: u.email, displayName: u.displayName, role: u.role, roleLabel: u.roleLabel,
    isAdmin: u.isAdmin, isDC: u.isDC, canManageAccounts: u.canManageAccounts,
    scopes: u.scopes, token: tokenFor(u), level: u.level, levelLabel: u.levelLabel, isSuper: u.isSuper,
    mustChangePassword: false,
  };
  setDemoMode(true);
  saveDemoSession(session);
  return session;
}

/** 轉換示範身份（唔離開示範版） */
export function switchDemoRole(key: string): UserSession {
  return enterDemoRole(key);
}

/** 離開示範版：清 flag＋示範 session；還原進示範前嘅區選擇 */
export function exitDemo() {
  clearDemoSession();
  setDemoMode(false);
  try {
    const prev = window.localStorage.getItem(DEMO_PREV_DISTRICT_KEY);
    window.localStorage.removeItem(DEMO_PREV_DISTRICT_KEY);
    if (isDistrictCode(prev)) setStoredDistrictCode(prev);
    else clearStoredDistrictCode();
  } catch { /* ignore */ }
}

export { DEMO_TOKEN };
