// 帳戶層級（v4.4.0）：0 超管（隱藏、最高）／1 區總監／2 副區總監／3 助理區總監／4 區職員／5 區長、領袖及自訂角色
import type { UserSession } from './types';

export const LEVEL_SUPER = 0;
export const LEVEL_DC = 1;
export const LEVEL_DDC = 2;
export const LEVEL_ADC = 3;
export const LEVEL_STAFF = 4;
export const LEVEL_OTHER = 5;

export const LEVEL_LABELS: Record<number, string> = {
  0: '超管', 1: '區總監', 2: '副區總監', 3: '助理區總監', 4: '區職員', 5: '區長／領袖',
};

/** 舊 session（未升級後台）冇 level 時由角色推斷，避免前端誤判 */
export function levelOf(s: Pick<UserSession, 'role' | 'level'> | null | undefined): number {
  if (!s) return LEVEL_OTHER;
  if (typeof s.level === 'number' && s.level >= 0) return s.level;
  const r = String(s.role || '').toUpperCase();
  if (r === 'SYSADMIN') return LEVEL_SUPER;
  if (r === 'DC') return LEVEL_DC;
  if (r.startsWith('DDC')) return LEVEL_DDC;
  if (r.startsWith('ADC')) return LEVEL_ADC;
  if (r === 'STAFF') return LEVEL_STAFF;
  return LEVEL_OTHER;
}

export function levelLabel(lv: number): string { return LEVEL_LABELS[lv] || `第 ${lv} 級`; }

export function isSuper(s: UserSession | null | undefined): boolean {
  return !!s && (s.isSuper === true || levelOf(s) === LEVEL_SUPER);
}

/** 可以授權／收回：層級 0–4（STAFF 以下已冇人可授） */
export function canDelegate(s: UserSession | null | undefined): boolean {
  return !!s && levelOf(s) <= LEVEL_STAFF;
}
