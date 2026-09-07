/**
 * 外部資料來源（v4.5.0）
 * ─────────────────────────────────────────────────────────────────────
 * 區年度預算（Google Sheet）、港島地域職員／總監架構（hkirscout.org.hk）、
 * 總會各署及香港總監諮議會（scout.org.hk）、地域房間日曆（Google Calendar）。
 * 真正抓取由 /api/external（Vercel 伺服器端）負責，前端只帶 kind。
 */

export const SOURCES = {
  hkirStaff: 'https://www.hkirscout.org.hk/tc/about_us/organization/prof/index.html',
  hkirCommissioner: 'https://www.hkirscout.org.hk/tc/about_us/organization/commissioner/index.html',
  hkirOffice: 'https://www.hkirscout.org.hk/tc/facilities/hkir_hq/index.html',
  hksaCouncil: 'https://www.scout.org.hk/tc/scouting/chief-commissioners-council.html',
  hksaEc: 'https://www.scout.org.hk/tc/scouting/ahq-executive-committee.html',
  hksaHq: 'https://www.scout.org.hk/tc/scout-units/association-headquarters/index.html',
  roomsSite: 'https://sites.google.com/hkirscout.org.hk/hkir-rooms',
  /** 預設：筲箕灣區 2025-26 Year Plan（Config BUDGET_SHEET_URL 可覆蓋） */
  budgetSheet: 'https://docs.google.com/spreadsheets/d/1dvrBDIcmk1zXHXb02qPFrDv46UvPDmfd/edit?gid=308655146',
};

/** 總會 11 個署（scout.org.hk 總部頁 ?id=） */
export const HKSA_DEPTS: { id: number; name: string }[] = [
  { id: 6, name: '青少年活動署' },
  { id: 7, name: '訓練署' },
  { id: 8, name: '發展署' },
  { id: 9, name: '傳訊及公共事務署' },
  { id: 10, name: '國際署' },
  { id: 11, name: '內地事務署' },
  { id: 1, name: '行政署' },
  { id: 4, name: '產業署' },
  { id: 5, name: '財務署' },
  { id: 3, name: '資訊科技署' },
  { id: 28, name: '領袖資源署' },
];

export function hksaDeptUrl(id: number): string {
  return `${SOURCES.hksaHq}?id=${id}`;
}

/** 由 Google Sheet 網址抽出 id / gid（支援 /edit?gid=、#gid=、/d/{id}/） */
export function parseSheetUrl(url: string): { id: string; gid: string } | null {
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(url || '');
  if (!m) return null;
  const g = /[?#&]gid=(\d+)/.exec(url);
  return { id: m[1], gid: g ? g[1] : '0' };
}

export function budgetCsvUrl(id: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

export function budgetEditUrl(id: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit?gid=${gid}#gid=${gid}`;
}
