// 前端 session（localStorage，依區碼分開儲存，避免換區混淆）
import type { UserSession } from './types';
import { resolveDistrictCode } from './district';

function key() {
  const code = resolveDistrictCode() || 'NONE';
  return `portal_session_${code}`;
}

export function saveSession(s: UserSession) {
  if (typeof window !== 'undefined') localStorage.setItem(key(), JSON.stringify(s));
}
export function loadSession(): UserSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(key());
  if (!raw) return null;
  try { return JSON.parse(raw) as UserSession; } catch { return null; }
}
export function clearSession() {
  if (typeof window !== 'undefined') localStorage.removeItem(key());
}
