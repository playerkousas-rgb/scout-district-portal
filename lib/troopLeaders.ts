/**
 * 🏕 本區旅團聯絡名單（聯絡簿 › 旅團）— 純函數，方便測試。
 *
 * 旅號／主辦機構／支部由全區旅團名單（Units）自動帶出；旅長姓名、電話、電郵
 * 存於 TroopContacts 表（contactRole = gsl，section = ''），即係同「🔒 旅團聯絡（私隱）」
 * 共用同一份資料，只經 troopContacts 權限行讀寫，成員系統睇唔到。
 *
 * 貼上格式（每行一旅，次序唔拘，Tab／逗號／空格都得）：
 *   旅號 · 旅長姓名 · 電話 · 電郵
 *   例：206 張國強 9123 4567 gsl206@example.com
 *   例：港島第17旅	林志傑	9456 7890	gsl17@example.com
 * 電話同電郵靠內容辨認（有 @ 就係電郵，有連續數字就係電話），所以唔使理次序。
 */
import type { TroopContact, VisitSection } from './types.ts';

export const LEADER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface LeaderFields {
  name: string;
  phone: string;
  email: string;
}

export interface LeaderEntry extends LeaderFields {
  troop: string; // 規範化旅號，例如 "206"
  line: number;  // 第幾行（由 1 起）
}

export interface LeaderParse {
  entries: LeaderEntry[];
  errors: string[];
}

/** 由 「港島第206旅」「206」「第 206 旅」等寫法攞出旅號（規範化，去除前導零）。冇就回 ''。 */
export function troopKey(raw: string): string {
  const s = String(raw || '').trim();
  const m = s.match(/第?\s*(\d{1,4})\s*旅/) || s.match(/^(\d{1,4})$/);
  return m ? String(Number(m[1])) : '';
}

const PHONE_RE = /\+?\(?\d[\d\s\-()/]{5,}\d/;

/** 解析一行（已確定有數字）。回傳 null＝唔似旅團行。 */
function parseLine(raw: string): { troop: string; name: string; phone: string; email: string; emailBad: boolean } | null {
  let rest = raw.trim();
  // 1. 電郵：第一段含 @ 嘅字串
  let email = '';
  let emailBad = false;
  const mail = rest.match(/[^\s\t,，|｜;；]*@[^\s\t,，|｜;；]*/);
  if (mail) {
    email = mail[0].trim();
    emailBad = !LEADER_EMAIL_RE.test(email);
    rest = rest.replace(mail[0], ' ');
  }
  // 2. 旅號：第一個 token（Tab／逗號／空格分開）
  const first = rest.split(/\t|,|，|\||｜|;|；|\s+/).find(t => t.trim()) || '';
  const troop = troopKey(first);
  if (!troop || !(/旅/.test(first) || /^\d{1,4}$/.test(first.trim()))) return null;
  rest = rest.slice(rest.indexOf(first) + first.length);
  // 3. 電話：第一組夠長嘅數字
  let phone = '';
  const ph = rest.match(PHONE_RE);
  if (ph && ph[0].replace(/\D/g, '').length >= 7) {
    phone = ph[0].replace(/\s+/g, ' ').trim();
    rest = rest.replace(ph[0], ' ');
  }
  // 4. 其餘文字 = 旅長姓名
  const name = rest.split(/\t|,|，|\||｜|;|；/).map(s => s.trim()).filter(Boolean).join(' ');
  return { troop, name, phone, email, emailBad };
}

/** 貼上文字 → 逐行解析。空行及冇數字嘅行（例如表頭）會略過。 */
export function parseLeaderPaste(text: string): LeaderParse {
  const entries: LeaderEntry[] = [];
  const errors: string[] = [];
  String(text || '').replace(/\r/g, '').split('\n').forEach((line, i) => {
    const raw = line.trim();
    if (!raw || !/\d/.test(raw)) return;
    const n = i + 1;
    const parsed = parseLine(raw);
    if (!parsed) { errors.push(`第 ${n} 行：找不到旅號（每行第一格要有旅號，例如 206）`); return; }
    if (parsed.emailBad) { errors.push(`第 ${n} 行（第 ${parsed.troop} 旅）：電郵格式不正確`); return; }
    entries.push({ troop: parsed.troop, name: parsed.name, phone: parsed.phone, email: parsed.email, line: n });
  });
  return { entries, errors };
}

/** 揀某旅嘅旅長聯絡（contactRole = gsl、全旅）；有多筆就揀啟用中嘅第一筆。 */
export function pickLeader(contacts: TroopContact[], troop: string): TroopContact | undefined {
  const list = contacts.filter(c => c.troop === troop && c.contactRole === 'gsl' && !c.section);
  return list.find(c => c.active !== false) || list[0];
}

export interface LeaderUnit {
  troop: string;
  label?: string;
  org?: string;
  active?: boolean;
  sections: Record<VisitSection, string>;
}

export interface LeaderRow {
  troop: string;
  label: string;
  org: string;
  sections: VisitSection[];   // 已開設支部（由團數推算）
  unitActive: boolean;
  contactId: string;          // 空 = 未有旅長紀錄（儲存時新增）
  note: string;
  recordActive: boolean;
  saved: LeaderFields;        // 伺服器上嘅現值
  value: LeaderFields;        // 畫面上嘅值（未儲存）
}

/** 由旅團名單 + 聯絡資料組成列表（按旅號排序）。sectionsOf 由呼叫方提供（避免純函數依賴 UI 模組）。 */
export function buildLeaderRows(
  units: LeaderUnit[],
  contacts: TroopContact[],
  sectionsOf: (u: LeaderUnit) => VisitSection[],
  sortKey: (troop: string) => number = (t) => Number(String(t).match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER),
): LeaderRow[] {
  return [...units]
    .sort((a, b) => sortKey(a.troop) - sortKey(b.troop) || a.troop.localeCompare(b.troop))
    .map(u => {
      const c = pickLeader(contacts, u.troop);
      const saved = { name: c?.name || '', phone: c?.phone || '', email: c?.email || '' };
      return {
        troop: u.troop,
        label: u.label || `第 ${u.troop} 旅`,
        org: u.org || '',
        sections: sectionsOf(u),
        unitActive: u.active !== false,
        contactId: c?.id || '',
        note: c?.note || '',
        recordActive: c ? c.active !== false : true,
        saved,
        value: { ...saved },
      };
    });
}

/** 將貼上解析結果套到列表（整筆覆寫該旅旅長資料）。回傳新列表及錯誤訊息。 */
export function applyLeaderEntries(rows: LeaderRow[], entries: LeaderEntry[]): { rows: LeaderRow[]; errors: string[]; applied: number } {
  const errors: string[] = [];
  const latest = new Map<string, LeaderEntry>();
  entries.forEach(e => {
    if (latest.has(e.troop)) errors.push(`第 ${e.troop} 旅出現多次，以最後一行為準`);
    latest.set(e.troop, e);
  });
  const known = new Set(rows.map(r => r.troop));
  latest.forEach((_, troop) => { if (!known.has(troop)) errors.push(`找不到旅團：第 ${troop} 旅（請先確認旅團名單）`); });
  let applied = 0;
  const next = rows.map(r => {
    const e = latest.get(r.troop);
    if (!e) return r;
    applied++;
    return { ...r, value: { name: e.name, phone: e.phone, email: e.email } };
  });
  return { rows: next, errors, applied };
}

export function trimFields(f: LeaderFields): LeaderFields {
  return { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() };
}

export function isRowDirty(r: LeaderRow): boolean {
  const a = trimFields(r.value);
  const b = trimFields(r.saved);
  return a.name !== b.name || a.phone !== b.phone || a.email !== b.email;
}

/**
 * 儲存前檢查：
 *   'clear'   — 三樣都清空：有紀錄就刪除，冇就唔使做
 *   'ok'      — 姓名 + （電話或電郵）齊全
 *   'noName' / 'noContact' / 'badEmail' — 唔可以儲存（同後台 saveTroopContact 規則一致）
 */
export function leaderProblem(f: LeaderFields): 'clear' | 'ok' | 'noName' | 'noContact' | 'badEmail' {
  const v = trimFields(f);
  if (!v.name && !v.phone && !v.email) return 'clear';
  if (!v.name) return 'noName';
  if (!v.phone && !v.email) return 'noContact';
  if (v.email && !LEADER_EMAIL_RE.test(v.email)) return 'badEmail';
  return 'ok';
}

export const LEADER_PROBLEM_LABEL: Record<string, string> = {
  noName: '缺旅長姓名',
  noContact: '需要電話或電郵（至少一樣）',
  badEmail: '電郵格式不正確',
};

/** 電話撥號連結：取第一組號碼、去除空格 */
export function telLink(phone: string): string {
  return `tel:${phone.split(/[/／]/)[0].replace(/[\s()-]/g, '')}`;
}
