/**
 * 🏢 總會季度匯報（v4.10.0）— 「區職員探訪區內旅團匯報」Excel 生成器。
 *
 * · 格式跟香港童軍總會張官方表格：標題兩行 → 區會／旅團總數 → 八欄資料
 * · 一筆探訪記錄 = 一行（官方樣本同旅同日都可以有幾行，例如電話 + Email 各一筆）
 * · 幹部努力統計（邊個探咗幾多）係內部嘢，唔會出現喺呢份檔
 */
import type { Visit } from './types';
import { officialReport, hqPeriodLabel, troopTotal, SECTION_HQ_LABEL } from './visits.ts';
import { buildXlsx, downloadXlsx, type XlsxSheet, type XlsxStyle } from './xlsx.ts';

export const HQ_REPORT_TITLE = '香 港 童 軍 總 會';
export const HQ_REPORT_SUBTITLE = '區職員探訪區內旅團匯報';

export const HQ_HEADERS = [
  '旅號',
  '支部',
  '與旅領袖會面\n(如︰旅長、支部團長 / 副團長)',
  '探訪日期',
  '探訪方式\n(面談/透過電話/其他)',
  '區職員\n探訪人數',
  '區已經提供之支援之項目',
  '地域/總會\n需要跟進之項目',
];

export interface HqWorkbookOpts {
  visits: Visit[];
  from: string;                 // yyyy-MM-dd
  to: string;                   // yyyy-MM-dd
  districtName?: string;        // 區會（例如 筲箕灣區）
  unitsTotal?: number;          // 旅團總數；唔傳就用 units
  units?: { active?: boolean; troop: string }[];
}

const BORDER_CENTER: XlsxStyle = { border: true, align: 'center', valign: 'top', wrap: true };
const BORDER_LEFT: XlsxStyle = { border: true, align: 'left', valign: 'top', wrap: true };
const HEADER_STYLE: XlsxStyle = { bold: true, fill: 'fde9c8', border: true, align: 'center', valign: 'middle', wrap: true };
const LABEL_STYLE: XlsxStyle = { bold: true, border: true };

/** 匯報檔名：區職員探訪區內旅團匯報_2026年1月-3月.xlsx */
export function hqReportFilename(from: string, to: string): string {
  const period = hqPeriodLabel(from, to) || `${from}_${to}`;
  return `${HQ_REPORT_SUBTITLE}_${period}.xlsx`;
}

/** 組裝總會格式工作表（XlsxSheet 定義，可以交俾 downloadXlsx／buildXlsx） */
export function buildHqSheets(opts: HqWorkbookOpts) {
  const period = hqPeriodLabel(opts.from, opts.to) || `${opts.from} 至 ${opts.to}`;
  const total = opts.unitsTotal ?? troopTotal((opts.units || []) as never);
  const rows = officialReport(opts.visits);

  const header = {
    cells: HQ_HEADERS.map(t => ({ v: t, s: HEADER_STYLE })),
    height: 44,
  };
  const dataRows = rows.map(r => ({
    cells: [
      { v: r.troop, s: BORDER_CENTER },
      { v: r.sectionLabel, s: BORDER_CENTER },
      { v: r.leaderMet, s: BORDER_CENTER },
      { v: r.dateText, s: BORDER_CENTER },
      { v: r.method, s: BORDER_CENTER },
      { v: r.officerCount, s: BORDER_CENTER },
      { v: r.support, s: BORDER_LEFT },
      { v: r.followUp, s: BORDER_LEFT },
    ],
  }));

  const sheet: XlsxSheet = {
    name: '區職員探訪匯報',
    widths: [8, 13, 22, 12, 15, 10, 30, 26],
    merges: ['A2:H2', 'A3:H3', 'B4:H4', 'B5:H5'],
    rows: [
      { cells: [] },
      { cells: [{ v: HQ_REPORT_TITLE, s: { bold: true, size: 16, align: 'center' } }], height: 26 },
      { cells: [{ v: `${HQ_REPORT_SUBTITLE} (${period})`, s: { bold: true, size: 13, align: 'center' } }], height: 22 },
      { cells: [{ v: '區會', s: LABEL_STYLE }, { v: opts.districtName || '', s: { border: true, align: 'left' } }], height: 20 },
      { cells: [{ v: '旅團總數', s: LABEL_STYLE }, { v: total, s: { border: true, align: 'left' } }], height: 20 },
      header,
      ...dataRows,
    ],
  };
  return [sheet];
}

/** 生成總會格式嘅 .xlsx（Uint8Array） */
export function buildHqWorkbook(opts: HqWorkbookOpts): Uint8Array {
  return buildXlsx(buildHqSheets(opts));
}

/** 瀏覽器下載總會格式 Excel（client-side） */
export function downloadHqXlsx(opts: HqWorkbookOpts): void {
  downloadXlsx(buildHqSheets(opts), hqReportFilename(opts.from, opts.to));
}

/** 匯報入面「支部」欄嘅寫法（測試用） */
export function hqSectionLabel(section: string | undefined | null): string {
  return SECTION_HQ_LABEL[(section || '') as never] || '全旅';
}
