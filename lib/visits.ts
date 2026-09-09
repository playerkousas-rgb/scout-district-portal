/**
 * 🏕 旅團探訪（v4.8.1）— 純函數，方便測試。
 *
 * · 幹部一入去預設只睇自己支部（跟角色），可以切換其他支部
 * · DC 出報告：揀「幾月到幾月」→ 探訪 list + 邊個幹部探咗幾多次／邊啲旅
 */
import type { ScoutUnit, Visit, VisitKind, VisitSection } from './types';

export const SECTIONS: VisitSection[] = ['gh', 'cub', 'scout', 'venture', 'rover'];
export const SECTION_LABEL: Record<VisitSection, string> = {
  gh: '小童軍', cub: '幼童軍', scout: '童軍', venture: '深資童軍', rover: '樂行童軍',
};
export const SECTION_EMOJI: Record<VisitSection, string> = {
  gh: '🐣', cub: '🐺', scout: '⚜️', venture: '🧭', rover: '🎒',
};
/** 角色 → 預設支部（同後台 VISIT_ROLE_SECTION 一致） */
export const ROLE_SECTION: Record<string, VisitSection> = {
  ADC_GH: 'gh', ADC_CUBS: 'cub', ADC_SCOUT: 'scout',
};

export const VISIT_KINDS: VisitKind[] = ['general', 'inspection', 'meeting', 'section', 'event', 'other'];
export const KIND_LABEL: Record<VisitKind, string> = {
  general: '一般探訪',
  inspection: '周年檢閱',
  meeting: '旅務會議',
  section: '支部集會',
  event: '旅團活動',
  other: '其他',
};

export function todayStr(today = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
}
export function yearOf(d: string | undefined | null): number {
  const m = String(d || '').match(/^(\d{4})/);
  return m ? Number(m[1]) : 0;
}
export function quarterOf(d: string | undefined | null): number {
  const m = String(d || '').match(/^\d{4}-(\d{2})/);
  if (!m) return 0;
  const mo = Number(m[1]);
  return mo >= 1 && mo <= 12 ? Math.floor((mo - 1) / 3) + 1 : 0;
}
/** 常用日期範圍（DC 出報告揀）：今年、上半年、下半年、逐季、上年度 */
export function rangePresets(today = new Date()): { id: string; label: string; from: string; to: string }[] {
  const y = today.getFullYear();
  const q = Math.floor(today.getMonth() / 3) + 1;
  const qFrom = `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
  const qToMonth = q * 3;
  const qTo = `${y}-${String(qToMonth).padStart(2, '0')}-${qToMonth === 3 || qToMonth === 12 ? '31' : '30'}`;
  return [
    { id: 'thisQuarter', label: `本季（第 ${q} 季）`, from: qFrom, to: qTo },
    { id: 'thisYear', label: `${y} 年全年`, from: `${y}-01-01`, to: `${y}-12-31` },
    { id: 'h1', label: `${y} 上半年`, from: `${y}-01-01`, to: `${y}-06-30` },
    { id: 'h2', label: `${y} 下半年`, from: `${y}-07-01`, to: `${y}-12-31` },
    { id: 'scoutYear', label: `${y - 1}/${String(y).slice(2)} 年度（9 月–8 月）`, from: `${y - 1}-09-01`, to: `${y}-08-31` },
    { id: 'lastYear', label: `${y - 1} 年全年`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  ];
}

/** 有開嗰個支部嘅旅團（sections 該欄唔係空白） */
export function unitsOfSection(units: ScoutUnit[], section: VisitSection | ''): ScoutUnit[] {
  const list = units.filter(u => u.active !== false);
  if (!section) return list;
  return list.filter(u => String(u.sections?.[section] || '').trim() !== '');
}

export type TroopStat = {
  unit: ScoutUnit;
  visits: Visit[];        // 由新到舊
  count: number;
  last: string;
  visitors: string[];     // 探過嘅幹部
  visited: boolean;
};

/**
 * 每旅一格。section 有值時，只計嗰個支部嘅探訪
 * （冇填支部嘅舊記錄當「全旅」，一律計入）。
 */
export function troopStats(units: ScoutUnit[], visits: Visit[], section: VisitSection | ''): TroopStat[] {
  return unitsOfSection(units, section).map(unit => {
    const list = visits
      .filter(v => String(v.troop).trim() === unit.troop)
      .filter(v => !section || !v.section || v.section === section)
      .sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || ''));
    return {
      unit, visits: list, count: list.length,
      last: list[0]?.visitDate || '',
      visitors: [...new Set(list.map(v => v.visitorName || '').filter(Boolean))],
      visited: list.length > 0,
    };
  });
}

export function coverage(stats: TroopStat[]): { visited: number; total: number; percent: number } {
  const total = stats.length;
  const visited = stats.filter(s => s.visited).length;
  return { visited, total, percent: total ? Math.round((visited / total) * 100) : 0 };
}

export type VisitorStat = {
  name: string;
  count: number;
  troops: string[];       // 探過邊啲旅（旅號）
  sections: VisitSection[];
  last: string;
  visits: Visit[];
};

/** 邊個幹部探咗幾多次、探過邊啲旅（多到少排） */
export function visitorStats(visits: Visit[]): VisitorStat[] {
  const map = new Map<string, Visit[]>();
  visits.forEach(v => {
    const key = (v.visitorName || '（未填）').trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(v);
  });
  const out: VisitorStat[] = [];
  map.forEach((list, name) => {
    const sorted = [...list].sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || ''));
    out.push({
      name, count: sorted.length,
      troops: [...new Set(sorted.map(v => v.troop))],
      sections: [...new Set(sorted.map(v => v.section).filter(Boolean))] as VisitSection[],
      last: sorted[0]?.visitDate || '',
      visits: sorted,
    });
  });
  return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * 嗰日對住嗰個旅嘅登記記錄。
 * 一日一個旅一次 —— 同一日探同一個旅唔會登記兩次（唔分支部）。
 * 傳 visitor 就淨係計嗰位幹部自己嘅記錄（第二個幹部同日去，可以有佢自己嗰筆）。
 */
export function visitsOn(
  visits: Visit[], troop: string, date: string, visitor = '',
): Visit[] {
  const t = String(troop).trim();
  const who = String(visitor).trim().toLowerCase();
  return visits.filter(v =>
    String(v.troop).trim() === t &&
    v.visitDate === date &&
    (!who || String(v.visitorName || '').trim().toLowerCase() === who));
}

/** 嗰日已經登記過未（同一個旅；傳 visitor = 淨係睇自己嗰啲） */
export function hasVisitOn(
  visits: Visit[], troop: string, date: string, visitor = '',
): boolean {
  return visitsOn(visits, troop, date, visitor).length > 0;
}

/** 旅號排序：數字細到大 */
export function sortUnits(units: ScoutUnit[]): ScoutUnit[] {
  const num = (t: string) => {
    const m = String(t).match(/\d+/);
    return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
  };
  return [...units].sort((a, b) => num(a.troop) - num(b.troop) || a.troop.localeCompare(b.troop));
}

/** 貼上旅團名單（每行：旅號 [tab/逗號] 主辦機構 [tab] 支部…）→ ScoutUnit[] */
export function parseUnitPaste(text: string, existing: ScoutUnit[] = []): ScoutUnit[] {
  const byTroop = new Map(existing.map(u => [u.troop, u]));
  const out: ScoutUnit[] = [];
  String(text || '').replace(/\r/g, '').split('\n').forEach(line => {
    const raw = line.trim();
    if (!raw) return;
    const cells = raw.split(/\t|,|，/).map(c => c.trim());
    const m = cells[0].match(/\d+/);
    if (!m) return;
    const troop = m[0];
    const prev = byTroop.get(troop);
    const sections: Record<VisitSection, string> = prev
      ? { ...prev.sections }
      : { gh: '', cub: '', scout: '', venture: '', rover: '' };
    // 第 3 欄之後（如果有）當作五個支部團數
    if (cells.length >= 4) {
      SECTIONS.forEach((k, i) => { sections[k] = (cells[2 + i] || '').trim(); });
    }
    out.push({
      troop,
      label: /旅/.test(cells[0]) ? cells[0] : (prev?.label || `港島第${troop}旅`),
      org: cells[1] || prev?.org || '',
      sections,
      active: true,
      note: prev?.note || '',
    });
  });
  return out;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

// ───────────────────────── 🏢 總會季度匯報（v4.10.0） ─────────────────────────
// 「區職員探訪區內旅團匯報」八欄：旅號／支部／與旅領袖會面／探訪日期／探訪方式／
// 區職員探訪人數／區已經提供之支援之項目／地域-總會需要跟進之項目。
// 幹部努力統計（visitorStats）係內部嘢，唔會擺入匯報。

/** 探訪方式常用值（總會表：面談/透過電話/其他） */
export const HQ_METHODS = ['面談', '電話', 'WhatsApp', 'Email', '其他'];
/** 與旅領袖會面常用值 */
export const HQ_LEADERS = ['旅長', '副團長', '支部團長', '旅長及支部領袖'];

/** 匯報「支部」欄寫法：童軍 → 童軍支部；冇填支部 = 全旅 */
export const SECTION_HQ_LABEL: Record<VisitSection | '', string> = {
  gh: '小童軍支部', cub: '幼童軍支部', scout: '童軍支部', venture: '深資童軍支部', rover: '樂行童軍支部',
  '': '全旅',
};

/** '2026-01-18' → '18.1.2026'（總會表嘅日期寫法） */
export function hqDate(d: string | undefined | null): string {
  const m = String(d || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : '';
}

/** '2026-01-01'～'2026-03-31' → '2026年1月-3月'；跨年 → '2025年12月-2026年1月' */
export function hqPeriodLabel(from: string | undefined | null, to: string | undefined | null): string {
  const f = String(from || '').match(/^(\d{4})-(\d{1,2})/);
  const t = String(to || '').match(/^(\d{4})-(\d{1,2})/);
  if (!f || !t) return '';
  const fy = Number(f[1]), fm = Number(f[2]), ty = Number(t[1]), tm = Number(t[2]);
  return fy === ty ? `${fy}年${fm}月-${tm}月` : `${fy}年${fm}月-${ty}年${tm}月`;
}

/** 旅團總數（匯報表頭用）— 只計仲運作緊嘅旅 */
export function troopTotal(units: ScoutUnit[]): number {
  return units.filter(u => u.active !== false && String(u.troop || '').trim()).length;
}

function troopNumberOf(troop: string): number {
  const m = String(troop).match(/\d+/);
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
}

export interface HqRow {
  troop: string;
  sectionLabel: string;    // 童軍支部／全旅…
  leaderMet: string;       // 與旅領袖會面
  visitDate: string;       // yyyy-MM-dd（排序用）
  dateText: string;        // 18.1.2026
  method: string;          // 探訪方式
  officerCount: number;    // 冇填 = 1
  support: string;         // 區已經提供之支援之項目
  followUp: string;        // 地域/總會需要跟進之項目（冇 = NA）
}

/**
 * 一筆探訪記錄 = 匯報一行（官方樣本：同旅同日都可以有幾行，例如電話一筆 Email 一筆）。
 * 排序：旅號細到大，同旅就舊到新。
 */
export function officialReport(visits: Visit[]): HqRow[] {
  return visits
    .filter(v => String(v.troop || '').trim() && String(v.visitDate || '').trim())
    .map(v => ({
      troop: String(v.troop).trim(),
      sectionLabel: SECTION_HQ_LABEL[(v.section || '') as VisitSection | ''] || '全旅',
      leaderMet: String(v.leaderMet || '').trim(),
      visitDate: String(v.visitDate),
      dateText: hqDate(v.visitDate),
      method: String(v.method || '').trim(),
      officerCount: Number(v.officerCount) > 0 ? Math.floor(Number(v.officerCount)) : 1,
      support: String(v.support || '').trim(),
      followUp: String(v.followUp || '').trim() || 'NA',
    }))
    .sort((a, b) =>
      troopNumberOf(a.troop) - troopNumberOf(b.troop) ||
      a.visitDate.localeCompare(b.visitDate) ||
      a.troop.localeCompare(b.troop));
}
