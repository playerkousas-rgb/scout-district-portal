// 前端 session（localStorage，依區碼分開儲存，避免換區混淆）
// 🎭 v4.9.0：模擬示範版開著時，全部改行示範 session（portal_demo_session），
//    真正帳戶嘅 session 原封不動留喺度，離開示範版即時還原。
import type { UserSession } from './types.ts';
import { resolveDistrictCode } from './district.ts';
import { isDemoMode, loadDemoSession, saveDemoSession, clearDemoSession } from './demo/session.ts';

function key() {
  const code = resolveDistrictCode() || 'NONE';
  return `portal_session_${code}`;
}

export function saveSession(s: UserSession) {
  if (typeof window === 'undefined') return;
  if (isDemoMode()) { saveDemoSession(s); return; }
  localStorage.setItem(key(), JSON.stringify(s));
}
export function loadSession(): UserSession | null {
  if (typeof window === 'undefined') return null;
  if (isDemoMode()) return loadDemoSession();
  const raw = localStorage.getItem(key());
  if (!raw) return null;
  try { return JSON.parse(raw) as UserSession; } catch { return null; }
}
export function clearSession() {
  if (typeof window === 'undefined') return;
  if (isDemoMode()) { clearDemoSession(); return; }
  localStorage.removeItem(key());
}
