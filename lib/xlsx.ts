/**
 * 📄 迷你 XLSX 產生器（零依賴，v4.10.0）
 *
 * · 目的：俾「總會格式」嘅 區職員探訪區內旅團匯報 直接生成 Excel 檔交總會，唔使加任何 package
 * · 只做基本嘢：文字／數字、合併格、欄寬、粗體／字色／底色／框線／對齊／換行、凍結行
 * · ZIP 用 stored（唔壓縮）＋ 自計 CRC32 — 產出係標準 OOXML，Excel／Google Sheets 都開得
 */

export type XlsxValue = string | number | null | undefined;

export interface XlsxStyle {
  bold?: boolean;
  size?: number;         // 字號（預設 11）
  color?: string;        // 字色 hex（唔使 #）
  fill?: string;         // 底色 hex（唔使 #）
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  wrap?: boolean;        // 自動換行
  border?: boolean;      // 四邊細框
}

export type XlsxCell = XlsxValue | { v: XlsxValue; s?: XlsxStyle };

export interface XlsxRow { cells: XlsxCell[]; height?: number }

export interface XlsxSheet {
  name: string;
  widths?: number[];       // 每欄字元寬度
  rows: XlsxRow[];
  merges?: string[];       // 例如 ['A2:H2']
  freezeRows?: number;     // 凍結首 N 行（可选）
}

// ───────────────────────── 基本工具 ─────────────────────────

/** 1 → A、27 → AA */
export function colLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    // 控制字元 XML 唔收
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

// ───────────────────────── 樣式收集 ─────────────────────────

interface Xf { font: number; fill: number; border: number; alignId: number }
interface FontSpec { bold: boolean; size: number; color: string }
interface AlignSpec { align: string; valign: string; wrap: boolean }

const DEFAULT_STYLE: Required<Pick<XlsxStyle, 'size'>> = { size: 11 };

function styleKey(s?: XlsxStyle): string {
  const st = s || {};
  return JSON.stringify([
    !!st.bold, st.size || DEFAULT_STYLE.size, (st.color || '').toLowerCase(),
    (st.fill || '').toLowerCase(), st.align || '', st.valign || '', !!st.wrap, !!st.border,
  ]);
}

/** 收集成個 workbook 用過嘅 fonts / fills / borders / cellXfs，整 styles.xml */
function buildStyles(used: XlsxStyle[]): string {
  const fonts: FontSpec[] = [{ bold: false, size: 11, color: '' }];
  const fills: string[] = ['', 'D9D9D9'.toLowerCase()];   // 0 = 無、1 = 灰（OOXML 慣例要 gray125）
  const borders = [false];
  const aligns: AlignSpec[] = [{ align: 'left', valign: 'bottom', wrap: false }];
  const xfs: Xf[] = [];

  const fontId = (f: FontSpec): number => {
    const i = fonts.findIndex(x => x.bold === f.bold && x.size === f.size && x.color === f.color);
    if (i >= 0) return i;
    fonts.push(f);
    return fonts.length - 1;
  };
  const fillId = (hex: string): number => {
    const i = fills.indexOf(hex);
    if (i >= 0) return i;
    fills.push(hex);
    return fills.length - 1;
  };
  const borderId = (b: boolean): number => {
    const i = borders.indexOf(b);
    if (i >= 0) return i;
    borders.push(b);
    return borders.length - 1;
  };
  const alignId = (a: AlignSpec): number => {
    const i = aligns.findIndex(x => x.align === a.align && x.valign === a.valign && x.wrap === a.wrap);
    if (i >= 0) return i;
    aligns.push(a);
    return aligns.length - 1;
  };

  used.forEach(s => {
    const st = s || {};
    xfs.push({
      font: fontId({ bold: !!st.bold, size: st.size || DEFAULT_STYLE.size, color: (st.color || '').toLowerCase() }),
      fill: fillId((st.fill || '').toLowerCase()),
      border: borderId(!!st.border),
      alignId: alignId({ align: st.align || 'left', valign: st.valign || 'bottom', wrap: !!st.wrap }),
    });
  });

  const fontXml = fonts.map(f => {
    const sz = `<sz val="${f.size}"/>`;
    const color = f.color ? `<color rgb="FF${f.color.toUpperCase()}"/>` : '<color theme="1"/>';
    const bold = f.bold ? '<b/>' : '';
    return `<font>${bold}${sz}${color}</font>`;
  }).join('');

  const fillXml = fills.map((hex, i) => i === 0
    ? '<fill><patternFill patternType="none"/></fill>'
    : `<fill><patternFill patternType="solid"><fgColor rgb="FF${hex.toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`,
  ).join('');

  const borderXml = borders.map(b => b
    ? '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>'
    : '<border><left/><right/><top/><bottom/><diagonal/></border>',
  ).join('');

  const xfXml = xfs.map(x => {
    const a = aligns[x.alignId];
    const alignment = (a.align !== 'left' || a.valign !== 'bottom' || a.wrap)
      ? ` applyAlignment="1"><alignment horizontal="${a.align}" vertical="${a.valign}"${a.wrap ? ' wrapText="1"' : ''}/></xf>`
      : '/>';
    return `<xf numFmtId="0" fontId="${x.font}" fillId="${x.fill}" borderId="${x.border}" xfId="0"${x.font ? ' applyFont="1"' : ''}${x.fill > 1 ? ' applyFill="1"' : ''}${x.border ? ' applyBorder="1"' : ''}${alignment}`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<fonts count="${fonts.length}">${fontXml}</fonts>`
    + `<fills count="${fills.length}">${fillXml}</fills>`
    + `<borders count="${borders.length}">${borderXml}</borders>`
    + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
    + `<cellXfs count="${xfs.length}">${xfXml}</cellXfs>`
    + `</styleSheet>`;
}

// ───────────────────────── 工作表 XML ─────────────────────────

function sheetXml(sheet: XlsxSheet, styleIndexOf: (s?: XlsxStyle) => number): string {
  const cols = sheet.widths && sheet.widths.length
    ? `<cols>${sheet.widths.map((w, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';

  const pane = sheet.freezeRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '';

  const body = sheet.rows.map((row, ri) => {
    const ht = row.height ? ` ht="${row.height}" customHeight="1"` : '';
    const cells = row.cells.map((c, ci) => {
      const ref = `${colLetter(ci + 1)}${ri + 1}`;
      const raw = (c && typeof c === 'object' && !Array.isArray(c)) ? (c as { v: XlsxValue; s?: XlsxStyle }) : { v: c as XlsxValue };
      const s = styleIndexOf(raw.s);
      const sAttr = ` s="${s}"`;
      const v = raw.v;
      if (v === null || v === undefined || v === '') return `<c r="${ref}"${sAttr}/>`;
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
      const wrap = /[\n\r]/.test(String(v)) ? ' xml:space="preserve"' : '';
      return `<c r="${ref}"${sAttr} t="inlineStr"><is><t${wrap}>${esc(String(v))}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}"${ht}>${cells}</row>`;
  }).join('');

  const merges = sheet.merges && sheet.merges.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `${pane}${cols}<sheetData>${body}</sheetData>${merges}`
    + `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>`
    + `</worksheet>`;
}

// 樣式 key 對照（buildXlsx 收集完先傳入 sheetXml）
function styleIndexOfFactory(used: XlsxStyle[]): (s?: XlsxStyle) => number {
  const keys = used.map(styleKey);
  return (s?: XlsxStyle): number => {
    const k = styleKey(s);
    const i = keys.indexOf(k);
    return i >= 0 ? i : 0;
  };
}

// ───────────────────────── ZIP（stored） ─────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(d = new Date()): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = (((d.getFullYear() - 1980) & 0x7F) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  files.forEach(f => {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);          // version needed
    lv.setUint16(6, 0, true);           // flags
    lv.setUint16(8, 0, true);           // method = stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);
    locals.push(lh, f.data);

    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);
    centrals.push(ch);

    offset += lh.length + f.data.length;
  });

  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const total = locals.reduce((n, p) => n + p.length, 0) + cdSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  [...locals, ...centrals, eocd].forEach(part => { out.set(part, pos); pos += part.length; });
  return out;
}

// ───────────────────────── 產生 .xlsx ─────────────────────────

/** 由 sheet 定義生成 .xlsx 二進位（Uint8Array，可以包 Blob 下載） */
export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  const safeName = (n: string, i: number): string =>
    String(n || `Sheet${i + 1}`).replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || `Sheet${i + 1}`;

  const usedStyles: XlsxStyle[] = [];
  sheets.forEach(sh => sh.rows.forEach(r => r.cells.forEach(c => {
    const s = (c && typeof c === 'object' && !Array.isArray(c)) ? (c as { s?: XlsxStyle }).s : undefined;
    if (s && !usedStyles.some(u => styleKey(u) === styleKey(s))) usedStyles.push(s);
  })));

  const sheetXmls = sheets.map(sh => sheetXml(sh, styleIndexOfFactory(usedStyles)));
  const files: { name: string; data: Uint8Array }[] = [];
  const enc = new TextEncoder();
  const add = (name: string, xml: string) => files.push({ name, data: enc.encode(xml) });

  add('[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + sheets.map((_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
    + `</Types>`);

  add('_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`);

  add('xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets>${sheets.map((s, i) =>
      `<sheet name="${esc(safeName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
    + `</workbook>`);

  add('xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + sheets.map((_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + `</Relationships>`);

  add('xl/styles.xml', buildStyles(usedStyles));
  sheetXmls.forEach((xml, i) => add(`xl/worksheets/sheet${i + 1}.xml`, xml));

  return zipStore(files);
}

/** 生成 + 觸發瀏覽器下載 */
export function downloadXlsx(sheets: XlsxSheet[], filename: string): void {
  const blob = new Blob([buildXlsx(sheets) as unknown as BlobPart],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
