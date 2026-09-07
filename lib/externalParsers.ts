/**
 * 外部網頁／CSV 解析器（純函數，無 Node／瀏覽器依賴；可用 node 直接測）
 * ─────────────────────────────────────────────────────────────────────
 * - parseHkirStaff          港島地域「專業領袖及受薪職員」表（hkirscout.org.hk /about_us/organization/prof）
 * - parseHkirCommissioners  港島地域「總監架構」（hkirscout.org.hk /about_us/organization/commissioner）
 * - parseHksaCouncil        總會「香港總監諮議會」（scout.org.hk /scouting/chief-commissioners-council.html）
 * - parseHksaDept           總會各署頁（scout.org.hk /scout-units/association-headquarters/index.html?id=N）
 * - parseBudgetCsv          區年度預算 Google Sheet（gviz tqx=out:csv）
 * 全部都係「防守式」：抓唔到就回傳空陣列，由呼叫者決定用靜態備援。
 */

export interface StaffRow { post: string; name: string; tel: string }
export interface OrgMember { post: string; scope?: string; name: string; photo?: string }
export interface OrgGroup { id: string; title: string; members: OrgMember[] }
export interface DeptContact { id: number; name: string; address?: string; tel?: string; fax?: string; email?: string; hours?: string }

export interface BudgetRow {
  month: string;        // YYYY-MM
  section: string;      // 支部（小童軍／幼童軍／童軍／深資童軍／樂行童軍／領袖／跨支部）
  activity: string;     // 活動名稱（空白 = 該月該支部無活動）
  fee: string;          // 原收費（顯示用原字串）
  headcount: number | null;
  subsidy: number | null;   // 區資助金額
  ccSubmission: string;     // CC submission（顯示用）
  typeCode: string;         // T/M/A/S/Y
  sectionCode: string;      // G/C/S/V/R/A
  status: string;           // completed / not happened / in progress / X / ''
  notes: string;
  links: string[];
}
export interface BudgetSummary { label: string; amount: number }

/* ───────────────────────── 通用 ───────────────────────── */

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  mdash: '—', ndash: '–', hellip: '…', copy: '©', middot: '·',
};

export function decodeEntities(s: string): string {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n: string) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m));
}
function safeChar(code: number): string {
  try { return String.fromCodePoint(code); } catch { return ''; }
}

/** 去 script/style/註解 */
export function stripNoise(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/** HTML → 純文字（block 邊界變換行），每行 trim，去空行 */
export function htmlToLines(html: string): string[] {
  const t = stripNoise(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|td|th|dt|dd|section|article|ul|ol|table|span)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(t)
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map(l => l.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter(Boolean);
}

/** 單一段 HTML → 一行文字 */
export function textOf(html: string): string {
  return htmlToLines(html).join(' ').replace(/\s+/g, ' ').trim();
}

/** hkirscout.org.hk 每頁 head 都有 revisionDate_Year / Month / Day */
export function parseRevisionDate(html: string): string {
  const m = /revisionDate_Year\s*=\s*['"]?(\d{4})['"]?[\s\S]{0,120}?revisionDate_Month\s*=\s*['"]?(\d{1,2})['"]?[\s\S]{0,120}?revisionDate_Day\s*=\s*['"]?(\d{1,2})['"]?/.exec(html || '');
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

export function absUrl(src: string, base: string): string {
  try { return new URL(src, base).href; } catch { return src; }
}

/* ───────────────────── 港島地域：職員表 ───────────────────── */

export function parseHkirStaff(html: string): { rows: StaffRow[]; updated: string } {
  const updated = parseRevisionDate(html);
  const body = stripNoise(html);
  const tableM = /<table[^>]*class="[^"]*styleTable[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(body)
    || /<table[^>]*>([\s\S]*?)<\/table>/i.exec(body);
  if (!tableM) return { rows: [], updated };
  const rows: StaffRow[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(tableM[1]))) {
    const cells: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let td: RegExpExecArray | null;
    while ((td = tdRe.exec(tr[1]))) cells.push(textOf(td[1]));
    if (cells.length < 3) continue;
    const post = cells[0], name = cells[1], tel = cells[2].replace(/[^\d\s/／+,、-]/g, '').replace(/\s+/g, ' ').trim();
    if (!post && !name) continue;
    rows.push({ post, name, tel });
  }
  return { rows, updated };
}

/* ───────────────────── 港島地域：總監架構 ───────────────────── */

function splitPost(raw: string): { post: string; scope?: string } {
  const t = raw.replace(/\s+/g, ' ').trim();
  const m = /^(.*?)\s*[（(]([^（）()]+)[）)]\s*$/.exec(t);
  if (m && m[1]) return { post: m[1].trim(), scope: m[2].trim() };
  return { post: t };
}

export function parseHkirCommissioners(html: string, base = 'https://www.hkirscout.org.hk/'): { groups: OrgGroup[]; updated: string } {
  const updated = parseRevisionDate(html);
  const body = stripNoise(html);
  const members: OrgMember[] = [];
  const itemRe = /<div class="item"[^>]*>([\s\S]*?)<div class="info">([\s\S]*?)<\/div>/gi;
  let it: RegExpExecArray | null;
  while ((it = itemRe.exec(body))) {
    const spans: string[] = [];
    const spanRe = /<span[^>]*>([\s\S]*?)<\/span>/gi;
    let sp: RegExpExecArray | null;
    while ((sp = spanRe.exec(it[2]))) spans.push(textOf(sp[1]));
    let postRaw = spans[0] || '', name = spans[1] || '';
    if (!postRaw || !name) {
      // 後備：img alt = "職位 - 姓名"
      const alt = /alt="([^"]*)"/i.exec(it[1]);
      if (alt) {
        const parts = decodeEntities(alt[1]).split(/\s*[-–]\s*/);
        if (parts.length >= 2) { postRaw = postRaw || parts[0].trim(); name = name || parts.slice(1).join('-').trim(); }
      }
    }
    if (!postRaw || !name) continue;
    const { post, scope } = splitPost(postRaw);
    const srcM = /<img[^>]*src="([^"]+)"/i.exec(it[1]);
    let photo: string | undefined;
    if (srcM && !/null\.(jpg|png|gif)$/i.test(srcM[1])) photo = absUrl(decodeEntities(srcM[1]).trim(), base);
    members.push({ post, scope, name: name.replace(/\s+/g, ''), photo });
  }
  return { groups: groupByRank(members), updated };
}

/** 依職級分組（出現次序）；「署理XX」歸入 XX 組 */
export function groupByRank(members: OrgMember[]): OrgGroup[] {
  const groups: OrgGroup[] = [];
  const idx: Record<string, OrgGroup> = {};
  members.forEach((m, i) => {
    const rank = m.post.replace(/^署理/, '').trim() || '其他';
    if (!idx[rank]) { idx[rank] = { id: `g${groups.length + 1}`, title: rank, members: [] }; groups.push(idx[rank]); }
    idx[rank].members.push(m);
    void i;
  });
  return groups;
}

/* ───────────────────── 總會：香港總監諮議會 ───────────────────── */

const COUNCIL_POST = /^(署理)?(副|助理)?香港總監$|^總幹事$|^副總幹事$/;

export function parseHksaCouncil(html: string, base = 'https://www.scout.org.hk/'): OrgMember[] {
  const body = stripNoise(html);
  const out: OrgMember[] = [];
  const imgRe = /<img\b[^>]*>/gi;
  const imgs: { idx: number; end: number; tag: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(body))) imgs.push({ idx: m.index, end: m.index + m[0].length, tag: m[0] });
  for (let i = 0; i < imgs.length; i++) {
    const seg = body.slice(imgs[i].end, i + 1 < imgs.length ? imgs[i + 1].idx : imgs[i].end + 4000);
    const lines = htmlToLines(seg).slice(0, 6);
    if (!lines.length) continue;
    const post = lines[0].replace(/\s+/g, '');
    if (!COUNCIL_POST.test(post)) continue;
    let scope: string | undefined;
    let name = '';
    for (const l of lines.slice(1)) {
      const s = /^[（(]\s*(.+?)\s*[）)]$/.exec(l);
      if (s && !scope) { scope = s[1]; continue; }
      if (!name && l.length <= 20 && !/總監|總幹事/.test(l)) { name = l; break; }
    }
    if (!name) {
      const alt = /alt="([^"]*)"/i.exec(imgs[i].tag);
      if (alt) name = decodeEntities(alt[1]);
    }
    if (!name) continue;
    const srcM = /src="([^"]+)"/i.exec(imgs[i].tag);
    out.push({
      post, scope, name: name.replace(/\s+/g, ''),
      photo: srcM ? absUrl(decodeEntities(srcM[1]).trim(), base) : undefined,
    });
  }
  return out;
}

/* ───────────────────── 總會：各署聯絡 ───────────────────── */

export function parseHksaDept(html: string): Partial<DeptContact> {
  const body = stripNoise(html);
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(body);
  const text = htmlToLines(body).join('\n');
  const grab = (label: string, re: string) => {
    const r = new RegExp(`${label}\\s*[：:]\\s*(${re})`, 'u').exec(text);
    return r ? r[1].replace(/\s+/g, ' ').trim() : '';
  };
  const tel = grab('電話', '[\\d][\\d\\s/／,、()（）-]{6,40}');
  const fax = grab('傳真', '[\\d][\\d\\s/／,、-]{6,30}');
  const email = grab('電郵', '[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}');
  const address = grab('地址', '[^\\n]{4,80}');
  // 辦公時間：由「辦公時間」到「聯絡資料」之間（可能係表格）
  let hours = '';
  const hm = /辦公時間\s*\n([\s\S]{0,400}?)(?:\n聯絡資料|\n地址|$)/.exec(text);
  if (hm) hours = hm[1].split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8).join('；');
  return {
    name: h1 ? textOf(h1[1]) : '',
    tel: tel || undefined, fax: fax || undefined, email: email || undefined,
    address: address || undefined, hours: hours || undefined,
  };
}

/* ───────────────────── 區年度預算 CSV ───────────────────── */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', inQ = false;
  const s = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function parseMoney(v: string): number | null {
  const t = String(v || '').replace(/[,$\s]/g, '').replace(/^HKD?/i, '');
  if (!t || t === '-' || t === '—') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const STATUS_RE = /^(completed|done|not happened|didn'?t happen|did not happen|in progress|ongoing|cancelled|canceled|x|完成|已完成|未舉行|取消|進行中)\b/i;

export function normalizeMonth(v: string): string {
  const t = String(v || '').trim();
  let m = /^(\d{4})[-/.](\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = /^(\d{1,2})[-/](\d{4})$/.exec(t);          // 04/2025
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})年\s*(\d{1,2})月/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  return t;
}

export function parseBudgetCsv(text: string): { rows: BudgetRow[]; summary: BudgetSummary[] } {
  const raw = parseCsv(text);
  const rows: BudgetRow[] = [];
  const summary: BudgetSummary[] = [];
  raw.forEach((r) => {
    const c = (i: number) => String(r[i] ?? '').trim();
    const a = c(0), b = c(1), act = c(2);
    if (!a && !b && !act) {
      // 合計列：D 標籤 + F 金額（或只有 F）
      const amt = parseMoney(c(5));
      if (amt !== null) summary.push({ label: c(3) || '總計', amount: amt });
      return;
    }
    if (/月份/.test(a) || /支部/.test(b) && /活動/.test(act)) return; // 表頭
    if (!/\d{4}/.test(a)) return;                                   // 唔似月份
    const extras = r.slice(9).map(x => String(x ?? '').trim()).filter(Boolean);
    let status = '';
    const notes: string[] = [];
    const links: string[] = [];
    extras.forEach((x) => {
      if (/^https?:\/\//i.test(x)) { links.push(x); return; }
      if (!status && STATUS_RE.test(x)) { status = x; return; }
      notes.push(x);
    });
    const hc = parseMoney(c(4));
    rows.push({
      month: normalizeMonth(a), section: b, activity: act, fee: c(3),
      headcount: hc, subsidy: parseMoney(c(5)), ccSubmission: c(6),
      typeCode: c(7).toUpperCase(), sectionCode: c(8).toUpperCase(),
      status, notes: notes.join('；'), links,
    });
  });
  return { rows, summary };
}

export const BUDGET_TYPE_LABEL: Record<string, string> = { T: '訓練', M: '會議', A: '活動', S: '社區服務', Y: '儀式典禮' };
export const BUDGET_SECTION_LABEL: Record<string, string> = { G: '小童軍', C: '幼童軍', S: '童軍', V: '深資童軍', R: '樂行童軍', A: '跨支部／領袖' };

export function budgetStatusKind(s: string): 'done' | 'no' | 'progress' | 'cancel' | '' {
  const t = String(s || '').toLowerCase();
  if (!t) return '';
  if (/^(completed|done|完成|已完成)/.test(t)) return 'done';
  if (/in progress|ongoing|進行中/.test(t)) return 'progress';
  if (/^x$|cancel|取消/.test(t)) return 'cancel';
  if (/not happened|didn|did not|未舉行/.test(t)) return 'no';
  return '';
}
