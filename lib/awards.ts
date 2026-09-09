/**
 * 🎖 獎勵提名推算（v4.7.2）— 純函數，唔掂網絡，方便測試。
 *
 * 規則來源：AwardTypes 表（可喺 /awards「年期設定」改），每個獎項有
 *   prevCode  上一級獎（空 = 入門級）
 *   minYears  距上一級最少年數
 *   round     提名期：founder 創辦人紀念日／rally 大會操（童軍獎勵）／other 自行申請
 *
 * 提名截止（香港童軍總會 ACR 20/2024）：
 *   創辦人紀念日獎勵（優良／優異服務獎章、感謝狀）：區部 10/31 → 總會 11/30（頒獎年之前一年）
 *   童軍獎勵（功績榮譽獎章／十字章、龍獅勳章）：區部 4/30 → 總會 5/31（同年）
 */
import type { AwardMember, AwardRound, AwardType } from './types';

export const ROUND_LABEL: Record<AwardRound, string> = {
  founder: '創辦人紀念日獎勵',
  rally: '童軍獎勵（大會操）',
  hab: '民青局局長嘉許',
  other: '自行申請／其他',
};
export const ROUND_HINT: Record<AwardRound, string> = {
  founder: '優良服務獎章 · 優異服務獎章（表格 DA1／DA2）',
  rally: '功績榮譽獎章 · 功績榮譽十字章 · 龍獅勳章（獎勵委員會批准）',
  hab: '民政及青年事務局局長嘉許 — 自行申請＋有提名期（總會每年初收集，2 月初交民青局）',
  other: '長期服務獎章／獎狀、總監嘉許／高級嘉許、感謝狀等 — 自行申請，唔會自動推算',
};

export const STATUS_LABEL: Record<string, string> = {
  active: '現役',
  noNomination: '沒有提名資格',
  noAppointment: '沒有委任',
  notInDistrict: '不在本區任期內',
  applying: '申請中',
  left: '已離任',
};

/** 「2015」「2015?」「無」→ 年份數字；無／空白／讀唔到 → null */
export function awardYear(cell: string | undefined | null): number | null {
  if (!cell) return null;
  const t = String(cell).trim();
  if (!t || t === '無') return null;
  const m = t.match(/(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1900 && y <= 2200 ? y : null;
}
/** 格入面有「?」= 未確定 */
export function isUncertain(cell: string | undefined | null): boolean {
  return !!cell && String(cell).includes('?');
}
/** 已獲得（包括未確定，但「無」唔算） */
export function hasAward(member: AwardMember, code: string): boolean {
  return awardYear(member.awards?.[code]) !== null;
}

export function typeByCode(types: AwardType[], code: string): AwardType | undefined {
  return types.find(t => t.code === code);
}

/** 該獎項嘅顯示名（短名優先，畀表格用） */
export function shortLabel(t: AwardType): string {
  return t.short || t.code;
}

export type Eligibility = {
  member: AwardMember;
  type: AwardType;
  prevType?: AwardType;
  prevYear: number | null;      // 上一級獲獎年份（入門級 = 服務開始年份）
  eligibleYear: number | null;  // 最快可提名年份
  waited: number;               // 距合資格已經幾多年（正數 = 已超過）
  ready: boolean;               // targetYear 已夠期
  uncertain: boolean;           // 上一級年份標咗「?」
  fromService: boolean;         // true = 入門級，由服務開始年份起計
  noRule: boolean;              // true = 冇設年期規定（例如獅勳章），只要有上一級就列出
};

/** 服務開始（委任）年份 */
export function serviceStartYear(member: AwardMember): number | null {
  return awardYear(member.serviceStart);
}

/**
 * 計某一位成員喺 targetYear 有咩獎「夠期可提名」。
 *
 * ① 有上一級（prevCode）→ 上一級獲獎年份 + minYears ≤ targetYear
 *    minYears 留空 = 冇固定年期規定（例如獅勳章）：有上一級就列出，標示「冇年期規定」
 * ② 入門級（冇 prevCode）但有 minYears → 由**服務開始年份** + minYears 計
 *    （例如優良服務獎章 7 年、長期服務獎章 15 年）；未填服務開始年份就計唔到，會被略過
 * ③ 入門級又冇 minYears（例如感謝狀）→ 唔自動推算
 */
export function eligibilityFor(member: AwardMember, types: AwardType[], targetYear: number): Eligibility[] {
  const out: Eligibility[] = [];
  const start = serviceStartYear(member);
  for (const type of types) {
    if (type.enabled === false) continue;
    if (hasAward(member, type.code)) continue;          // 已經有
    const min = type.minYears == null ? null : (Number(type.minYears) || 0);

    if (!type.prevCode) {
      if (min === null) continue;                        // 感謝狀之類：人手判斷
      if (start === null) continue;                      // 冇服務開始年份，計唔到
      const eligibleYear = start + min;
      out.push({
        member, type, prevType: undefined, prevYear: start, eligibleYear,
        waited: targetYear - eligibleYear,
        ready: eligibleYear <= targetYear,
        uncertain: isUncertain(member.serviceStart),
        fromService: true, noRule: false,
      });
      continue;
    }

    const prevType = typeByCode(types, type.prevCode);
    const prevCell = member.awards?.[type.prevCode];
    const prevYear = awardYear(prevCell);
    if (prevYear === null) continue;                     // 未有上一級 = 未輪到
    const eligibleYear = prevYear + (min ?? 0);
    out.push({
      member, type, prevType, prevYear, eligibleYear,
      waited: targetYear - eligibleYear,
      ready: eligibleYear <= targetYear,
      uncertain: isUncertain(prevCell),
      fromService: false, noRule: min === null,
    });
  }
  return out;
}

/** 邊啲人未填服務開始年份 → 計唔到入門級獎項（優良服務獎章／長期服務獎章） */
export function missingServiceStart(members: AwardMember[], types: AwardType[]): AwardMember[] {
  const entryCodes = types.filter(t => t.enabled !== false && !t.prevCode && t.minYears != null).map(t => t.code);
  if (!entryCodes.length) return [];
  return members.filter(m => {
    if (m.status && m.status !== 'active' && m.status !== 'applying') return false;
    if (serviceStartYear(m) !== null) return false;
    return entryCodes.some(code => !hasAward(m, code));   // 仲有入門級未攞
  });
}

export type RoundBucket = {
  round: AwardRound;
  ready: Eligibility[];      // 今年夠期
  soon: Eligibility[];       // 未夠期，但 2 年內會夠
};

/**
 * 提名建議篩選（v4.9.0）：
 * · 狀態 = noNomination「沒有提名資格」→ 無論如何都唔會出現喺提名建議
 * · 其他非現役狀態（沒有委任／已離任…）→ 預設唔計，剔「連沒有委任都計埋」先計
 */
export function isNominationBlocked(m: AwardMember, includeInactive?: boolean): boolean {
  if (m.status === 'noNomination') return true;
  if (!includeInactive && m.status && m.status !== 'active' && m.status !== 'applying') return true;
  return false;
}

/** 全區推算，按提名期分組；ready 由「等得最耐」排先 */
export function nominationBoard(members: AwardMember[], types: AwardType[], targetYear: number, opts?: { includeInactive?: boolean }): RoundBucket[] {
  const rounds: AwardRound[] = ['founder', 'rally', 'hab', 'other'];
  const buckets: Record<AwardRound, RoundBucket> = {
    founder: { round: 'founder', ready: [], soon: [] },
    rally: { round: 'rally', ready: [], soon: [] },
    hab: { round: 'hab', ready: [], soon: [] },
    other: { round: 'other', ready: [], soon: [] },
  };
  for (const m of members) {
    if (isNominationBlocked(m, opts?.includeInactive)) continue;
    for (const e of eligibilityFor(m, types, targetYear)) {
      const b = buckets[e.type.round] || buckets.other;
      if (e.ready) b.ready.push(e);
      else if (e.eligibleYear !== null && e.eligibleYear - targetYear <= 2) b.soon.push(e);
    }
  }
  const byWait = (a: Eligibility, b: Eligibility) => (b.waited - a.waited) || a.member.name.localeCompare(b.member.name);
  const bySoon = (a: Eligibility, b: Eligibility) => ((a.eligibleYear || 0) - (b.eligibleYear || 0)) || a.member.name.localeCompare(b.member.name);
  rounds.forEach(r => { buckets[r].ready.sort(byWait); buckets[r].soon.sort(bySoon); });
  return rounds.map(r => buckets[r]);
}

/** 民青局嘉許死線設定（MM-DD；由 AwardsBoard.deadlineCfg 帶入） */
export type DeadlineCfg = { habDistrict?: string; habHq?: string };

/** 提名截止日：頒獎年份 targetYear → 區部 / 總會 死線 */
export function deadlines(round: AwardRound, targetYear: number, cfg?: DeadlineCfg): { district: string; hq: string; note: string } | null {
  if (round === 'founder') {
    return {
      district: `${targetYear - 1}-10-31`,
      hq: `${targetYear - 1}-11-30`,
      note: '區部提名須於前一年 10 月 31 日前送地域，總會截止 11 月 30 日',
    };
  }
  if (round === 'rally') {
    return {
      district: `${targetYear}-04-30`,
      hq: `${targetYear}-05-31`,
      note: '區部提名須於同年 4 月 30 日前送地域，總會截止 5 月 31 日',
    };
  }
  if (round === 'hab') {
    // 民青局局長嘉許：總會每年初發通告收集（例：2026 年度須於 2026-02-03 前交民青局）。
    // 死線可在「年期設定」改（Config AWARD_HAB_DL_*）；日期以總會當年通告為準。
    const mmdd = (v?: string, fallback = '') => (/^\d{2}-\d{2}$/.test(String(v || '').trim()) ? String(v).trim() : fallback);
    const d = mmdd(cfg?.habDistrict, '01-15');
    const h = mmdd(cfg?.habHq, '02-03');
    return {
      district: `${targetYear}-${d}`,
      hq: `${targetYear}-${h}`,
      note: `${targetYear} 年度：區部提名須於 ${targetYear}-${d} 前送總會，總會 ${targetYear}-${h} 前交民青局。` +
        '總會每年底／年初另行通告；死線可喺「⚙️ 年期設定」按當年通告更新。',
    };
  }
  return null;
}

/** 距死線幾多日（負數 = 已過期） */
export function daysUntil(dateStr: string, today = new Date()): number {
  const d = new Date(dateStr + 'T23:59:59');
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

/**
 * 而家最應該處理緊嘅提名期：
 * 由今日計，搵返每個提名期「區部死線仲未過」嘅最近一屆頒獎年份。
 * other（自行申請）冇死線，用今年；hab 用 deadlineCfg（民青局嘉許）。
 */
export type UpcomingRound = {
  round: AwardRound;
  year: number;              // 頒獎年份
  district: string | null;   // 區部死線
  hq: string | null;         // 總會死線
  days: number | null;       // 距區部死線幾多日
};
export function upcomingRounds(cfg?: DeadlineCfg, today = new Date()): UpcomingRound[] {
  const y = today.getFullYear();
  const pick = (round: AwardRound): UpcomingRound => {
    for (let target = y; target <= y + 3; target++) {
      const dl = deadlines(round, target, cfg);
      if (!dl) break;
      const days = daysUntil(dl.district, today);
      if (days >= 0) return { round, year: target, district: dl.district, hq: dl.hq, days };
    }
    const nextDl = deadlines(round, y + 1, cfg);
    return { round, year: y + 1, district: nextDl?.district || null, hq: nextDl?.hq || null, days: null };
  };
  return [pick('founder'), pick('rally'), pick('hab'), { round: 'other', year: y, district: null, hq: null, days: null }];
}

/** 逐個人喺 targetYear 夠期可提名嘅獎（畀名冊標亮用）；key = member.id */
export function readyByMember(
  members: AwardMember[], types: AwardType[], targetYear: number, opts?: { includeInactive?: boolean },
): Record<string, Eligibility[]> {
  const map: Record<string, Eligibility[]> = {};
  for (const m of members) {
    if (isNominationBlocked(m, opts?.includeInactive)) continue;
    const ready = eligibilityFor(m, types, targetYear).filter(e => e.ready);
    if (ready.length) map[m.id] = ready;
  }
  return map;
}

// ───────────────────────── 匯入：由 Excel 貼上 ─────────────────────────

/** 「LSM*」→ LSM1 咁樣嘅寫法轉返代號 */
function normalizeToken(raw: string, types: AwardType[]): string | null {
  const t = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!t) return null;
  // 直接代號
  const direct = types.find(x => x.code.toUpperCase() === t);
  if (direct) return direct.code;
  // 短名（LSM*、LSM**…）
  const short = types.find(x => (x.short || '').toUpperCase().replace(/\s+/g, '') === t);
  if (short) return short.code;
  // 星號寫法：LSM*** → LSM3
  const star = t.match(/^([A-Z]+)(\*+)$/);
  if (star) {
    const cand = star[1] + String(star[2].length);
    const hit = types.find(x => x.code.toUpperCase() === cand);
    if (hit) return hit.code;
  }
  // 常見縮寫
  const alias: Record<string, string> = { THK: 'THANKS', THANK: 'THANKS', BRONLION: 'BRL', BRONZELION: 'BRL', LION: 'BRL', SILVERLION: 'SVL', GOLDLION: 'GDL' };
  const a = alias[t];
  if (a && types.some(x => x.code === a)) return a;
  return null;
}

export type ParsedImport = {
  rows: Partial<AwardMember>[];
  headerCodes: (string | null)[];
  unknown: string[];      // 認唔到嘅代號（提提用家）
  skipped: number;
};

const SERVICE_HEADERS = ['服務開始', '服務開始年份', '服務年份', '委任年份', '入會年份', '加入年份', 'servicestart', 'since'];

/**
 * 解析由 Excel／Google Sheet 複製出嚟嘅內容（Tab 分隔，冇 Tab 就試逗號）。
 * 支援兩種寫法：
 *   ① 格入面連代號：GSA1985 / LSM*2005 / CCM2025?
 *   ② 淨係年份：靠第一行表頭（GSA、DSA…）知道係邊個獎
 * 首三欄固定當作 姓名 / 旅團 / 職位。
 */
export function parseAwardPaste(text: string, types: AwardType[]): ParsedImport {
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  const sep = lines.some(l => l.includes('\t')) ? '\t' : ',';
  const table = lines.map(l => l.split(sep).map(c => c.trim()));
  const unknown = new Set<string>();
  let headerCodes: (string | null)[] = [];
  let start = 0;

  // 第一行冇年份 + 至少一格認得出代號 → 當表頭
  const first = table[0] || [];
  const firstHasYear = first.some(c => /\d{4}/.test(c));
  const firstCodes = first.map(c => (c ? normalizeToken(c.replace(/[（(].*$/, ''), types) : null));
  let serviceCol = -1;
  const headerLooksLikeHeader = !firstHasYear && (firstCodes.some(Boolean) || first.some(c => SERVICE_HEADERS.includes(c.trim().toLowerCase())));
  if (headerLooksLikeHeader) {
    headerCodes = firstCodes;
    serviceCol = first.findIndex(c => SERVICE_HEADERS.includes(c.trim().toLowerCase()));
    start = 1;
  }

  const rows: Partial<AwardMember>[] = [];
  let skipped = 0;
  for (let i = start; i < table.length; i++) {
    const cells = table[i];
    const name = (cells[0] || '').trim();
    if (!name || /^(合計|總數|統計)/.test(name)) { skipped++; continue; }
    // 一行淨係得個名同註腳（例如顏色說明）就跳過
    const awards: Record<string, string> = {};
    let serviceStart = '';
    for (let c = 1; c < cells.length; c++) {
      const cell = (cells[c] || '').trim();
      if (!cell) continue;
      // 服務開始年份：靠表頭指定，或者「86th since 2004/01/15」呢類寫法
      if (c === serviceCol) {
        const sy = cell.match(/(19|20)\d{2}/);
        if (sy) { serviceStart = sy[0]; continue; }
      }
      const since = cell.match(/since\s*((?:19|20)\d{2})/i);
      if (since) { serviceStart = since[1]; continue; }
      const m = cell.match(/^([A-Za-z*\s]+?)\s*(\d{4})\s*(\?)?$/);
      if (m) {
        const code = normalizeToken(m[1], types);
        if (code) { awards[code] = m[2] + (m[3] ? '?' : ''); continue; }
        unknown.add(m[1].trim());
        continue;
      }
      // 淨係年份 → 睇表頭
      const y = cell.match(/^(\d{4})\s*(\?)?$/);
      if (y && headerCodes[c]) { awards[headerCodes[c] as string] = y[1] + (y[2] ? '?' : ''); continue; }
      if (/^(無|冇)$/.test(cell) && headerCodes[c]) { awards[headerCodes[c] as string] = '無'; }
    }
    rows.push({
      name,
      troop: (cells[1] || '').trim(),
      position: (cells[2] || '').trim(),
      ...(serviceStart ? { serviceStart } : {}),
      awards,
    });
  }
  return { rows, headerCodes, unknown: [...unknown], skipped };
}

/** 匯出 CSV（提名名單／名冊都用） */
export function toCsv(rows: (string | number)[][]): string {
  return rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}
