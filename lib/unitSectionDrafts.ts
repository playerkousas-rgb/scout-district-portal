import type { ScoutUnit, UnitSection, VisitSection } from './types';
const SECTIONS: VisitSection[] = ['gh', 'cub', 'scout', 'venture', 'rover'];

export function blankUnitSection(troop: string, section: VisitSection | '' = '', unitCode = ''): UnitSection {
  return { troop, section, unitCode, meetingTime: '', location: '', instagramUrl: '', facebookUrl: '', websiteUrl: '', active: true, publicVisible: true };
}

/** 保留已維護／隱藏的團，按旅的支部清單補齊尚未設定的支部，不複製旅層資料。 */
export function unitSectionDrafts(troop: ScoutUnit | undefined, maintained: UnitSection[]): UnitSection[] {
  if (!troop) return [];
  const rows = maintained.filter(r => r.troop === troop.troop).map(r => ({ ...r }));
  SECTIONS.forEach(section => {
    const tokens = String(troop.sections[section] || '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    const codes: string[] = [];
    let regular = 0;
    tokens.forEach(token => {
      if (/^\d{1,2}$/.test(token)) regular = Math.min(9, regular + Number(token));
      else if (/^[AS]\d{1,2}$/.test(token) && !codes.includes(token)) codes.push(token);
    });
    // 多個常規團以 1／2 分開維護；舊版單一常規團空代號仍保留。
    const existingRegular = rows.some(r => r.section === section && r.unitCode === '');
    const regularCodes = regular === 1 || existingRegular ? [''] : Array.from({ length: regular }, (_, i) => String(i + 1));
    if (regular === 0) regularCodes.length = 0;
    [...regularCodes, ...codes].slice(0, 9).forEach(code => {
      if (!rows.some(r => r.section === section && r.unitCode === code)) rows.push(blankUnitSection(troop.troop, section, code));
    });
  });
  return rows;
}
