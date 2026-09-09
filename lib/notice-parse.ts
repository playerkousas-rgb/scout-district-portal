/**
 * 📥 通告 URL 自動讀料（pure，可用 node 直接測）。
 *
 * 舊制開班登記：ADC 貼上區網通告 PDF 連結（或通告帖文頁）→
 * 伺服器抓 PDF → pdf-parse 抽文字 → 呢度按 Print_通告固定 label 讀出
 * 通告名／收費／原價／名額／截止／參加資格／節次／場地／聯絡等，一次過填好表單。
 *
 * 容忍度設計：pdf-parse 吐出嚟嘅空格排版唔穩定（run 相連定逐字隔開都試過），
 * 所以全部匹配都喺「去晒空白」嘅 flat 流上面做 label 錨點＋regex，唔靠行結構。
 */
import type { NoticeContact, NoticeFields, NoticeSession } from './types.ts';

/** 通告內文 label（Print_通告 B 欄；冒號先算錨點，內文提到同名唔會誤判） */
const LABELS = [
  '班領導人', '參加資格', '費用', '名額', '截止日期',
  '報名辦法', '服裝', '備註', '查詢', '檔案編號', '發出日期',
] as const;

const TIME_CHARS = '上下午晚早中凌晨清晨至到和半時分正點0123456789一二三四五六七八九十兩-－—～~：:';

/** 去晒所有空白（pdf-parse 排版唔穩定，匹配唔靠空格） */
function flat(s: string): string {
  return String(s || '').replace(/\s+/g, '');
}

/** 8 位數字電話 → 4-4 顯示 */
function fmtPhone(digits: string): string {
  const d = String(digits || '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 4)} ${d.slice(4)}` : d;
}

/** 香港今日 yyyy-MM-dd（伺服器 UTC 都啱） */
export function hkTodayISO(today?: string): string {
  if (today && /^\d{4}-\d{2}-\d{2}$/.test(today)) return today;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const g = (t: string): string => parts.find(p => p.type === t)?.value || '';
    return `${g('year')}-${g('month')}-${g('day')}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 中文日期 → ISO（冇年份就按「截止日係未來」推：過咗就下一年） */
export function zhDateToISO(y: string, m: string, d: string, todayISO: string): string {
  const year = y ? Number(y) : Number(todayISO.slice(0, 4));
  const iso = `${year}-${pad2(Number(m))}-${pad2(Number(d))}`;
  if (!y && iso < todayISO) return `${year + 1}-${pad2(Number(m))}-${pad2(Number(d))}`;
  return iso;
}

interface LabelHit { label: string; at: number; end: number }

/** 檔案編號／發出日期有時係 PDF 表格字，抽出後冇冒號；冇冒號時要見到值形先認。 */
function metadataValueWithoutColon(f: string, valueAt: number): boolean {
  const next = f.slice(valueAt, valueAt + 1);
  if (/[0-9０-９]/u.test(next)) return true;
  if (next === '（' || next === '(') {
    return /[0-9０-９]/u.test(f.slice(valueAt + 1, valueAt + 10));
  }
  return false;
}

/** 喺 flat 流搵 label 錨點（label＋冒號；檔案頭兩個 label 容忍冇冒號） */
function findLabels(f: string): LabelHit[] {
  const hits: LabelHit[] = [];
  const metadataLabels = new Set<string>(['檔案編號', '發出日期']);
  LABELS.forEach(label => {
    let from = 0;
    for (;;) {
      const at = f.indexOf(label, from);
      if (at < 0) break;
      const after = f.slice(at + label.length, at + label.length + 1);
      from = at + 1;
      const hasColon = after === '：' || after === ':';
      // 一般內文 label 必須有冒號；通告頭嘅檔案編號／發出日期，
      // pdf-parse 有機會將冒號漏掉，所以只接受「下一字似值」嘅變體。
      if (!hasColon && (!metadataLabels.has(label) || !metadataValueWithoutColon(f, at + label.length))) continue;
      // 同一 label 只取第一個錨點
      if (hits.some(h => h.label === label)) break;
      hits.push({ label, at, end: at + label.length + (hasColon ? 1 : 0) });
      break;
    }
  });
  hits.sort((a, b) => a.at - b.at);
  return hits;
}

/** 節次表頭（日期／時間／地點，中間咩分隔都得） */
function tableHeadMatch(f: string): RegExpExecArray | null {
  return /日期.{0,3}時間.{0,3}地點/.exec(f);
}

function tableHeadAt(f: string): number {
  const m = tableHeadMatch(f);
  return m ? (m.index ?? -1) : -1;
}

/** 回傳通告頭 metadata 值嘅尾端，方便由「信頭＋值」之後開始搵標題。 */
function metadataValueEnd(f: string, hit: LabelHit): number {
  const tail = f.slice(hit.end, hit.end + 48);
  const value = hit.label === '檔案編號'
    ? /[（(]?([0-9０-９]{1,6})/.exec(tail)
    : /[（(]?(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(tail);
  if (!value || value.index === undefined) return hit.end;
  let end = hit.end + value.index + value[0].length;
  // header 有時會將值包喺全形／半形括號內；唔好令右括號黐咗標題。
  if (f[end] === '）' || f[end] === ')') end++;
  return end;
}

/** 通告頭嘅所有 label＋值完結位置（只睇表頭之前，免得正文重提時影響標題）。 */
function noticeHeaderEnd(f: string, hits: LabelHit[], titleBoundary: number): number {
  let end = 0;
  for (const hit of hits) {
    if (hit.at >= titleBoundary) break;
    if (hit.label !== '檔案編號' && hit.label !== '發出日期') continue;
    end = Math.max(end, metadataValueEnd(f, hit));
  }
  return end;
}

const TITLE_HINT = /訓練班|課程|獎章|章/u;

/**
 * 標題區可能仲有 logo／會名等信頭碎料；剔走常見信頭後，揀含標題關鍵字而且最長嘅一嚿。
 * flat() 已經移除換行，所以唔依賴 PDF 原本嘅行結構。
 */
function pickTitle(titleZone: string): string {
  const chunks = String(titleZone || '')
    .split(/香港童軍總會|港島地域|筲箕灣區|活動通告|通告/u)
    .map(s => s.trim())
    .filter(Boolean);
  const marked = chunks.filter(s => TITLE_HINT.test(s));
  const candidates = marked.length ? marked : chunks;
  return candidates.sort((a, b) => b.length - a.length)[0] || '';
}

/** 由節次 chunk 拆 time／venue（time 係時間字集最長前綴＋以時半分結尾） */
function splitTimeVenue(rest: string): { time: string; venue: string } {
  let i = 0;
  while (i < rest.length && TIME_CHARS.includes(rest[i] as string)) i++;
  let time = rest.slice(0, i);
  let venue = rest.slice(i);
  // 修剪：time 尾唔係時半分就逐字褪返去 venue（防 venue 頭字撞入時間字集）
  while (time && !/[時半分]$/.test(time)) {
    venue = time.slice(-1) + venue;
    time = time.slice(0, -1);
  }
  // time 太短／venue 吉＝拆唔開，成嚿當 display
  if (!time || !venue) return { time: '', venue: rest };
  return { time, venue };
}

function parseSessions(f: string, hits: LabelHit[], todayISO: string): NoticeSession[] {
  const head = tableHeadMatch(f);
  const headAt = head?.index ?? -1;
  if (headAt < 0) return [];
  const headEnd = headAt + (head?.[0].length || 6);
  // 檔案頭嘅「檔案編號／發出日期」都係 hits，但唔可以用佢哋截走節次表。
  // 只由表頭之後第一個正文 label 結束節次區。
  const bodyLabel = hits.filter(h => h.at > headEnd)[0];
  const nextLabel = bodyLabel?.at ?? f.length;
  const zone = f.slice(headEnd, Math.max(headEnd, nextLabel));
  const chunks = zone.split(/(?=\d{4}年\d{1,2}月\d{1,2}日)/).map(s => s.trim()).filter(Boolean);
  const out: NoticeSession[] = [];
  chunks.forEach(ch => {
    const m = /^(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(ch);
    if (!m) return;
    const dateISO = `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`;
    let rest = ch.slice(m[0].length);
    let weekday = '';
    const w = /^（(.{1,6}?)）/.exec(rest);
    if (w) { weekday = w[1] || ''; rest = rest.slice(w[0].length); }
    const { time, venue } = splitTimeVenue(rest);
    const dateZh = `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日${weekday ? `（${weekday}）` : ''}`;
    out.push({
      date: dateZh, dateISO, weekday, time, venue,
      display: time && venue ? `${dateZh} ${time} ${venue}` : `${dateZh}${rest ? ` ${rest}` : ''}`,
    });
  });
  return out;
}

/** 由 flat 查詢段抽聯絡（名／職位／電話／電郵） */
function parseContact(f: string, enquiry: string): NoticeContact {
  const c: NoticeContact = { name: '', role: '', phone: '', email: '' };
  const em = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.exec(enquiry);
  if (em) c.email = em[0];
  const ph = /(?:^|[^\d])(\d{8})(?:[^\d]|$)/.exec(enquiry);
  if (ph) c.phone = fmtPhone(ph[1] || '');
  const who = /與(.{2,16}?)(查詢|聯絡|聯繫|查詢者)/.exec(enquiry);
  if (who) {
    const full = who[1] || '';
    const rm = /(副班領導人|助理班領導人|班領導人|班務行政|訓練幹事|區秘書|區總監)?(.*)/.exec(full);
    if (rm) {
      c.role = rm[1] || '';
      c.name = (rm[2] || '').trim();
      if (!c.name) { c.name = full; c.role = ''; }
    } else c.name = full;
  }
  void f;
  return c;
}

export interface ParseNoticeOpts {
  /** 來源 URL（用嚟由檔名推通告編號） */
  url?: string;
  /** 今日（yyyy-MM-dd；測試用，真跑用香港今日） */
  today?: string;
}

const EMPTY_CONTACT: NoticeContact = { name: '', role: '', phone: '', email: '' };

/** 支部推斷：參加資格／標題提到邊個支部（長詞先行，避免「童軍」食咗「深資童軍」） */
const SECTION_KEYWORDS: [RegExp, string][] = [
  [/小童軍/, '小童軍'],
  [/幼童軍/, '幼童軍'],
  [/深資童軍/, '深資童軍'],
  [/樂行童軍/, '樂行童軍'],
  [/童軍支部/, '童軍'],
  [/領袖訓練|領袖支部|成人領袖/, '領袖'],
];

/** 由參加資格／標題推支部（推唔到回 ''，唔亂估） */
export function inferSection(...texts: string[]): string {
  const t = texts.filter(Boolean).join(' ');
  if (!t) return '';
  for (const [re, name] of SECTION_KEYWORDS) if (re.test(t)) return name;
  return '';
}

/** 標題拆徽章／章別：「社區參與章、公民章暨積極公民獎章系列訓練班」→ 三個章 */
export function extractBadges(title: string): string[] {
  const t = String(title || '')
    .replace(/(系列)?(訓練班|工作坊|課程|訓練)$/u, '')
    .trim();
  if (!t) return [];
  const seen = new Set<string>();
  return t
    .split(/[、，,暨及]/)   // 唔用「與／和」做分隔（「參與章」會被拆爛）
    .map(s => s.replace(/系列$/u, '').trim())
    .filter(s => s.length >= 2 && /[章]$/.test(s))
    .filter(s => { if (seen.has(s)) return false; seen.add(s); return true; });
}

/** 費用段抽資助說明：「本活動原價港幣 200 元，因獲「…」資助，費用因此獲得減半。」嗰句 */
export function extractSubsidyNote(feeSec: string): string {
  // 「原價」前面最多 12 個字（本活動／是次活動等前綴；唔准跨括號，免得由「（包括行政…）」食起）；
  // 尾段貪婪——句內「…訓練資助計劃」都仲有個「資助」，貪婪先會食到句尾
  const m = /(?:（|^)([^。；;，（）]{0,12}原價[^。；;]*(?:資助|津貼|減免)[^。；;]*)[。；;]?[）)]?/.exec(String(feeSec || ''));
  if (!m) return '';
  return (m[1] || '').trim();
}

/** 主入口：PDF／網頁文字 → 報班必備欄位 */
export function parseNoticeText(rawText: string, opts: ParseNoticeOpts = {}): NoticeFields {
  const todayISO = hkTodayISO(opts.today);
  const f = flat(rawText);
  const empty: NoticeFields = {
    title: '', fee: '', originalFee: '', feeText: '', subsidyNote: '', badges: [], section: '', freeFee: false,
    quota: '', deadline: '', eligibility: '',
    sessions: [], sessionsText: '', venue: '',
    leader: '', contact: '', contactDetail: { ...EMPTY_CONTACT },
    uniform: '', remarks: '', enquiry: '', signupText: '',
    fileNo: '', fileNoFrom: '', issueDate: '',
    signer: '', deputy: '',
    warnings: [],
  };
  if (!f) { empty.warnings.push('通告文字係空嘅（PDF 可能係掃瞄圖，讀唔到字）'); return empty; }

  const hits = findLabels(f);
  const sec = (label: string): string => {
    const i = hits.findIndex(h => h.label === label);
    if (i < 0) return '';
    const h = hits[i] as LabelHit;
    const end = i + 1 < hits.length ? (hits[i + 1]?.at ?? f.length) : f.length;
    return f.slice(h.end, end);
  };

  // ── 標題：剔走通告頭，再由標題區揀最長嘅關鍵字嚿 ──
  const headAt = tableHeadAt(f);
  const firstBodyLabel = hits.find(h => h.label !== '檔案編號' && h.label !== '發出日期');
  // 有節次表就以表頭做邊界；冇表時沿用「第一個正文 label 之前」嘅後備。
  const titleBoundary = headAt >= 0 ? headAt : (firstBodyLabel?.at ?? f.length);
  const headerEnd = noticeHeaderEnd(f, hits, titleBoundary);
  const titleStart = headerEnd > 0 && headerEnd < titleBoundary ? headerEnd : 0;
  const titleZone = f.slice(titleStart, Math.max(titleStart, titleBoundary));
  empty.title = pickTitle(titleZone);
  if (!empty.title) empty.warnings.push('讀唔到通告標題');

  // ── 節次 ──
  empty.sessions = parseSessions(f, hits, todayISO);
  if (empty.sessions.length) {
    empty.sessionsText = empty.sessions.map(s => s.display).join('；');
    empty.venue = Array.from(new Set(empty.sessions.map(s => s.venue).filter(Boolean))).join('、');
  } else {
    empty.warnings.push('讀唔到節次表（睇下通告有冇「日期／時間／地點」表）');
  }

  // ── 班領導人／參加資格 ──
  empty.leader = sec('班領導人');
  empty.eligibility = sec('參加資格');
  if (!empty.eligibility) empty.warnings.push('讀唔到參加資格');
  // 支部推斷（參加資格行先；推唔到唔亂填）
  empty.section = inferSection(empty.eligibility, empty.title);

  // ── 費用 ──
  const feeSec = sec('費用');
  empty.feeText = feeSec ? `費用：${feeSec}` : '';
  const feeM = /港幣([\d,]+)元/.exec(feeSec);
  if (feeM) empty.fee = (feeM[1] || '').replace(/,/g, '');
  const origM = /原價港幣([\d,]+)元/.exec(feeSec);
  if (origM) empty.originalFee = (origM[1] || '').replace(/,/g, '');
  empty.subsidyNote = extractSubsidyNote(feeSec);
  if (!feeM && /免費|全免|豁免收費/.test(feeSec)) empty.freeFee = true;
  if (!feeM && !empty.freeFee && feeSec) empty.warnings.push('費用段冇銀碼（唔係「港幣X元」寫法）');
  if (!feeSec) empty.warnings.push('讀唔到費用');

  // ── 名額／截止 ──
  const quotaSec = sec('名額');
  const quotaM = /(\d+)\s*(人|名|位)/.exec(quotaSec) || /(\d+)/.exec(quotaSec);
  if (quotaM) empty.quota = quotaM[1] || '';
  else if (quotaSec) empty.warnings.push('名額段冇數字');
  else empty.warnings.push('讀唔到名額（網頁擇要版多數冇呢段，貼 PDF 試下）');
  const dlSec = sec('截止日期');
  const dlFull = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(dlSec);
  const dlShort = dlFull ? null : /(\d{1,2})月(\d{1,2})日/.exec(dlSec);
  if (dlFull) empty.deadline = zhDateToISO(dlFull[1] || '', dlFull[2] || '', dlFull[3] || '', todayISO);
  else if (dlShort) empty.deadline = zhDateToISO('', dlShort[1] || '', dlShort[2] || '', todayISO);
  else if (dlSec) empty.warnings.push('截止段冇日期');
  else empty.warnings.push('讀唔到截止日期');

  // ── 報名辦法／服裝／備註／查詢 ──
  empty.signupText = sec('報名辦法');
  empty.uniform = sec('服裝');
  empty.remarks = sec('備註');
  // 網頁擇要版常見：有資格有截止，但冇晒班領導人／服裝／備註
  if (!empty.leader && !empty.uniform && !empty.remarks) {
    empty.warnings.push('唔見班領導人／服裝／備註段（網頁擇要版常見；貼 PDF 通告連結會讀得晒）');
  }
  // 徽章／章別：標題拆（網頁標籤會喺 route 層再補）
  empty.badges = extractBadges(empty.title);
  const enquiry = sec('查詢');
  empty.enquiry = enquiry;
  const contact = parseContact(f, enquiry);
  empty.contactDetail = contact;
  const who = [contact.name, contact.role ? `（${contact.role}）` : ''].join('');
  empty.contact = [who, contact.phone, contact.email].filter(x => x && x.trim()).join(' ').trim();

  // ── 檔案編號／發出日期 ──
  const fileSec = sec('檔案編號');
  const fileM = /(\d{1,6})/.exec(fileSec);
  if (fileM) { empty.fileNo = fileM[1] || ''; empty.fileNoFrom = 'text'; }
  const issSec = sec('發出日期');
  const issM = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(issSec);
  if (issM) empty.issueDate = `${issM[1]}-${pad2(Number(issM[2]))}-${pad2(Number(issM[3]))}`;
  // 檔名後備：2607.pdf → 2607
  if (!empty.fileNo && opts.url) {
    const um = /\/(\d{3,6})\.pdf(\?|#|$)/i.exec(opts.url);
    if (um) { empty.fileNo = um[1] || ''; empty.fileNoFrom = 'url'; }
  }

  // ── 署名（查詢段之後：區總監XXX（YYY代行）） ──
  const qi = hits.findIndex(h => h.label === '查詢');
  const tail = qi >= 0 ? f.slice((hits[qi] as LabelHit).end) : '';
  const signM = /區總監\d*([^（（]{1,8})/.exec(tail);
  if (signM) empty.signer = (signM[1] || '').trim();
  const depM = /[（(]([^（）()]+?)代行[）)]/.exec(tail);
  if (depM) empty.deputy = (depM[1] || '').trim();

  return empty;
}

// ===================== HTML（通告帖文頁） =====================

export interface NoticeHtml {
  title: string;
  pdfUrls: string[];
  text: string;
  /** 帖文標籤（/tag/… 連結；網頁管理員擇要版獨有，PDF 冇） */
  tags: string[];
}

/** 輕量抽帖文頁：og:title／PDF 連結／標籤／可見文字（唔引入 cheerio） */
export function parseNoticeHtml(html: string): NoticeHtml {
  const h = String(html || '');
  const out: NoticeHtml = { title: '', pdfUrls: [], text: '', tags: [] };
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(h)
    || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(h);
  const tt = /<title[^>]*>([^<]*)<\/title>/i.exec(h);
  out.title = (og?.[1] || tt?.[1] || '').replace(/\s+/g, ' ').trim();
  const seen = new Set<string>();
  const re = /<a[^>]+href=["']([^"']+\.pdf(?:[?#][^"']*)?)["']/gi;
  for (;;) {
    const m = re.exec(h);
    if (!m) break;
    const u = (m[1] || '').trim();
    if (u && !seen.has(u)) { seen.add(u); out.pdfUrls.push(u); }
  }
  // 標籤：/tag/… 連結文字（percent-encoded 中文名要 decode）
  const tagSeen = new Set<string>();
  const tagRe = /<a[^>]+href=["'][^"']*\/tag\/[^"']*["'][^>]*>([^<]{1,30})<\/a>/gi;
  for (;;) {
    const m = tagRe.exec(h);
    if (!m) break;
    let tag = (m[1] || '').trim();
    try { tag = decodeURIComponent(tag); } catch { /* keep raw */ }
    if (tag && !tagSeen.has(tag)) { tagSeen.add(tag); out.tags.push(tag); }
  }
  const body = h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  out.text = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
  return out;
}

/** 標籤 → 支部（「童軍支部」→ 童軍；對唔上唔理） */
function tagToSection(tag: string): string {
  const t = String(tag || '');
  if (/小童軍/.test(t)) return '小童軍';
  if (/幼童軍/.test(t)) return '幼童軍';
  if (/深資童軍/.test(t)) return '深資童軍';
  if (/樂行童軍/.test(t)) return '樂行童軍';
  if (/童軍/.test(t) && !/跨/.test(t)) return '童軍';
  if (/領袖/.test(t)) return '領袖';
  return '';
}

/**
 * 網頁帖文頁補料（PDF 讀完之後叫）：
 * - 標籤 → 徽章（PDF 標題拆唔到嗰啲都有標籤兜底）＋支部
 * - og:title → 標題後備
 * 網頁管理員擇要版係刪減內容，所以只補「PDF 冇嘅料」，唔會覆蓋 PDF 讀到嘅嘢。
 */
export function mergePageExtras(fields: NoticeFields, page: Pick<NoticeHtml, 'title' | 'tags'>): NoticeFields {
  const out: NoticeFields = { ...fields, badges: [...fields.badges] };
  const badges = new Set(out.badges);
  (page.tags || []).forEach(tag => {
    if (/[章]$/.test(tag) && !/支部|訓練班/.test(tag)) badges.add(tag);
  });
  out.badges = [...badges];
  if (!out.section) {
    for (const tag of page.tags || []) {
      const s = tagToSection(tag);
      if (s) { out.section = s; break; }
    }
  }
  if (!out.title && page.title) out.title = page.title;
  return out;
}

/** 揀跟邊條 PDF：同網域／uploads 優先 */
export function pickPdfUrl(pageUrl: string, hrefs: string[]): string {
  if (!hrefs.length) return '';
  let pageHost = '';
  try { pageHost = new URL(pageUrl).hostname; } catch { /* ignore */ }
  const abs = hrefs.map(href => {
    try { return new URL(href, pageUrl).toString(); }
    catch { return ''; }
  }).filter(Boolean);
  return abs.find(u => { try { return new URL(u).hostname === pageHost && u.includes('/uploads/'); } catch { return false; } })
    || abs.find(u => { try { return new URL(u).hostname === pageHost; } catch { return false; } })
    || abs[0] || '';
}

/** 🎭 示範版固定回應（同 demoCourseProfile 同一番內容） */
export function demoNoticeFields(): NoticeFields {
  const t = hkTodayISO();
  const dl = new Date(`${t}T00:00:00Z`);
  dl.setUTCDate(dl.getUTCDate() + 30);
  const deadline = dl.toISOString().slice(0, 10);
  const sessions: NoticeSession[] = [
    { date: '2026年10月9日（星期五）', dateISO: '2026-10-09', weekday: '星期五', time: '晚上7時至晚上10時', venue: '區總部', display: '2026年10月9日（星期五） 晚上7時至晚上10時 區總部' },
    { date: '2026年10月11日（星期日）', dateISO: '2026-10-11', weekday: '星期日', time: '上午9時至下午5時', venue: '區總部', display: '2026年10月11日（星期日） 上午9時至下午5時 區總部' },
  ];
  return {
    title: '第1屆急救工作坊（示範）', fee: '25', originalFee: '', feeText: '費用：活動費用港幣25元正。',
    subsidyNote: '', badges: ['急救'], section: '童軍', freeFee: false,
    quota: '22', deadline, eligibility: '已宣誓及持有有效紀錄冊之童軍支部成員。',
    sessions, sessionsText: sessions.map(s => s.display).join('；'), venue: '區總部',
    leader: '陳大文先生', contact: '陳大文先生（班領導人） 9123 4567 demo@demo',
    contactDetail: { name: '陳大文先生', role: '班領導人', phone: '9123 4567', email: 'demo@demo' },
    uniform: '整齊童軍制服', remarks: '1.學員必須全期出席，不得遲到或早退。',
    enquiry: '如有查詢請與班領導人陳大文先生聯絡。', signupText: '請於成員系統訓練班版面填妥網上報名表。',
    fileNo: '2613', fileNoFrom: 'text', issueDate: '', signer: '陳大文', deputy: '', warnings: [],
  };
}
