import type { UserSession } from './types';

/** 批量／前端開戶只准開呢三個（可多人）。DC / DDC / ADC / STAFF 係專用預設位。 */
export const CREATABLE_ROLES = [
  { role: 'DL', label: '區長' },
  { role: 'LEADER', label: '區領袖' },
  { role: 'AL', label: '助理區領袖' },
] as const;

export const ACCOUNT_MANAGER_ROLES = ['DC', 'SYSADMIN', 'DDC_ADMIN', 'DDC_TRAINING'] as const;

export function canManageAccounts(s: UserSession | null | undefined): boolean {
  if (!s) return false;
  if (s.canManageAccounts) return true;
  if (s.isAdmin) return true;
  return (ACCOUNT_MANAGER_ROLES as readonly string[]).includes(s.role);
}

/** DDC 或以上：可一鍵批區總部借場 */
export function canApproveHq(s: UserSession | null | undefined): boolean {
  return canManageAccounts(s);
}

export function isCreatableRole(role: string): boolean {
  const u = String(role || '').trim().toUpperCase();
  return CREATABLE_ROLES.some(r => r.role === u);
}

export function normalizeCreatableRole(raw: string): string {
  const s = String(raw || '').trim();
  const u = s.toUpperCase();
  if (CREATABLE_ROLES.some(r => r.role === u)) return u;
  if (s === '區長' || s === '區長（各支部）') return 'DL';
  if (s === '區領袖' || s === '職領袖') return 'LEADER';
  if (s === '助理區領袖' || s === '助領') return 'AL';
  return u;
}

export const ACCOUNT_TEMPLATE_ROWS = [
  { displayName: '陳一鳴', email: 'dl.scout1@example.com', role: 'DL', password: 'ChangeMe2026', scopes: 'scout', cards: '' },
  { displayName: '李二華', email: 'leader.cubs@example.com', role: 'LEADER', password: 'ChangeMe2026', scopes: 'cubs', cards: '' },
  { displayName: '黃三', email: 'al.example@example.com', role: 'AL', password: 'ChangeMe2026', scopes: '', cards: '' },
];

export const ACCOUNT_CSV_HEADER = '顯示名稱,電郵,角色,初始密碼,支部範圍,卡片範圍';

type AccountRow = {
  displayName: string;
  email: string;
  role: string;
  password: string;
  scopes?: string;
  cards?: string;
};

export function accountsToCsv(rows: AccountRow[] = ACCOUNT_TEMPLATE_ROWS): string {
  const body = rows.map(r =>
    [r.displayName, r.email, r.role, r.password, r.scopes || '', r.cards || '']
      .map(v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
      .join(',')
  ).join('\n');
  return `${ACCOUNT_CSV_HEADER}\n${body}\n`;
}

export function accountsToJson(rows: AccountRow[] = ACCOUNT_TEMPLATE_ROWS): string {
  return JSON.stringify(rows.map(r => ({
    displayName: r.displayName,
    email: r.email,
    role: r.role,
    password: r.password,
    scopes: r.scopes || '',
    cards: r.cards || '',
  })), null, 2) + '\n';
}
