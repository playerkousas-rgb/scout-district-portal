/**
 * 🆕 新制直入核心庫（v4.14.0）— 開班設定預設值／寫入座標／班 Sheet 解析／預算計算。
 * 座標跟足 v4.13.0 工作簿模版；人手舊班只讀唔寫。
 */
import type {
  CourseLink, CourseProfileStaff, CourseSetup, CourseSheetRaw, CoursePrintData,
  PrintRosterRow, PrintCompletionRow, PrintCertRow,
  SetupBudgetDate, SetupMealLine, SetupRentLine, SetupTransportLine,
  SetupQtyPriceLine, SetupMiscLine, SetupExpenses, SetupSession, SetupFlow,
  SetupTimetable, SetupCell, SheetMatrix,
} from './types.ts';

// ===================== 預設值 =====================

/** Input02 職位預設（行 23–42，共 20 行） */
export const SETUP_ROLE_PRESETS = [
  '班領導人', '副班領導人', '副班領導人', '助理班領導人',
  '小隊導師', '小隊導師', '小隊導師', '小隊導師',
  '團隊長', '團隊長', '班務行政', '物資管理', '物資管理',
  '講師', '講師', '講師', '講師', '講師', '講師', '講師',
];

/** Print_通告標準備註 6 項（C32–C37） */
export const SETUP_REMARK_DEFAULTS = [
  '1. 報名前須獲得家長及旅團領袖同意並於網上表格提供有關資料包括其姓名及電郵等；',
  '2. 報名前須先以轉數快繳付有關費用並截圖紀錄；',
  '3. 取錄與否，一概以電郵通知及公佈於筲箕灣區網頁（www.skwscout.org.hk）；',
  '4. 學員必須全期出席訓練班，不得遲到或早退，並完成指定事工，始獲考慮頒發證書；',
  '5. 筲箕灣區合資格學員可獲「章」有進步訓練班資助計劃資助，詳情請參考本區通告（ ）號；',
  '6. 有經濟需要之青少年成員可根據「學生隊員訓練資助計劃」申請資助參加本訓練班，詳情請參閱總會行政通告第（ ）號。',
];

/** Input01 交通分組標籤（行 69–74，每組 2 行） */
export const SETUP_TRANSPORT_GROUPS = ['3.1 器材', '3.1 器材', '3.2 職員', '3.2 職員', '3.3 學員', '3.3 學員'];

const blankStaff = (role: string): CourseProfileStaff =>
  ({ role, name: '', title: '', unit: '', qualification: '', phone: '', email: '' });
const blankMeal = (): SetupMealLine =>
  ({ date: '', time: '', breakfast: '', lunch: '', dinner: '', snack: '', water: '', who: '' });
const blankRent = (place = ''): SetupRentLine => ({ place, period: '', qty: '', qty2: '', price: '' });
const blankTransport = (): SetupTransportLine => ({ route: '', budget: '' });
const blankQP = (item = ''): SetupQtyPriceLine => ({ item, qty: '', price: '' });
const blankMisc = (): SetupMiscLine => ({ item: '', amount: '' });
const blankSession = (): SetupSession =>
  ({ date: '', spanNext: false, time: '', venue: '', displayDate: '', displayTime: '', displayVenue: '', show: true });
const blankFlow = (): SetupFlow => ({ mins: '', item: '', owner: '' });
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** 空白開班設定（同模版預設一致） */
export function emptySetup(): CourseSetup {
  return {
    courseId: '', courseName: '', edition: '', section: '', badge: '', customName: '', form1: '', form2: '',
    expectedIntake: '', expectedFee: '', expectedStaff: '',
    budgetDates: [{ date: '', time: '', venue: '' }],
    expenses: {
      meals: range(8).map(blankMeal),
      venue: [blankRent(), blankRent('其他收費'), blankRent()],
      camp: range(3).map(() => blankRent()),
      lodging: range(3).map(() => blankRent()),
      transport: range(6).map(blankTransport),
      handouts: ['影印 Photocopy', '光碟 CD Rom', '快勞 File'].map(blankQP),
      program: range(3).map(() => blankQP()),
      admin: ['攝影Photo', '印刷及郵費 Printing & Postage', '文具Stationery'].map(blankQP),
      souvenir: ['紀念品 Souvenir', '獎品 Prize'].map(blankQP),
      misc: range(3).map(blankMisc),
    },
    quota: '', fee: '', staffCount: '',
    sessions: range(8).map(blankSession),
    deadline: '', publishDate: '',
    staff: SETUP_ROLE_PRESETS.map(blankStaff),
    residentStaff: '',
    timetable: range(3).map(() => ({ clothing: '', flows: range(5).map(blankFlow) })),
    eligibility: '', feeNote: '', uniform: '', remarks: [...SETUP_REMARK_DEFAULTS],
    fileNo: '', issueDate: '', signer: '', deputy: '',
    acceptCheckin: '', acceptItems: '', acceptOthers: '', acceptNote: '',
    financeApproved: '', financeHqSubsidy: '', subsidyOrigFee: '',
    clEmail: '',
  };
}

/** 舊草稿／parse 結果補齊欄位（防 undefined） */
export function normalizeSetup(s: Partial<CourseSetup> | null | undefined): CourseSetup {
  const e = emptySetup();
  if (!s) return e;
  const arr = <T,>(v: T[] | undefined, fb: T[]): T[] => (Array.isArray(v) && v.length ? v : fb);
  return {
    ...e, ...s,
    budgetDates: arr(s.budgetDates, e.budgetDates),
    expenses: { ...e.expenses, ...(s.expenses || {}) },
    sessions: arr(s.sessions, e.sessions),
    staff: arr(s.staff, e.staff),
    timetable: arr(s.timetable, e.timetable),
    remarks: arr(s.remarks, e.remarks),
  };
}

// ===================== 數字／日期工具 =====================

/** 轉數字（去 $ , 空格；解唔到回 0） */
export function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

/** 有冇填咗數（空字串／null 唔計） */
export function hasNum(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return !isNaN(v);
  if (typeof v === 'boolean') return true;
  const s = String(v).replace(/[$,\s]/g, '');
  return s !== '' && !isNaN(Number(s));
}

/** 日期正規化 → yyyy-MM-dd（Date／ISO／d/m/yyyy／中文都收；失敗回原文 trim 頭 20 字） */
export function normDate(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN((v as Date).getTime())) {
    const d = v as Date;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  const s = String(v).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    let y = Number(m[3]); if (y < 100) y += 2000;
    const mo = Number(m[2]); const d = Number(m[1]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return s.slice(0, 20);
}

/** yyyy-MM-dd → 中文（2025年7月25日） */
export function zhDate(iso: string): string {
  const m = String(iso || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return String(iso || '');
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

/** 銀碼顯示（1,234.5；空回 ''） */
export function money(v: unknown): string {
  if (!hasNum(v)) return '';
  return toNum(v).toLocaleString('en-HK', { maximumFractionDigits: 2 });
}

const cell = (m: SheetMatrix, r: number, c: number): string => {
  if (!Array.isArray(m) || r < 0 || r >= m.length) return '';
  const row = m[r];
  if (!Array.isArray(row) || c < 0 || c >= row.length) return '';
  const v = row[c];
  return v === null || v === undefined ? '' : String(v).trim();
};
const rawCell = (m: SheetMatrix, r: number, c: number): unknown => {
  if (!Array.isArray(m) || r < 0 || r >= m.length) return '';
  const row = m[r];
  if (!Array.isArray(row) || c < 0 || c >= row.length) return '';
  return row[c] ?? '';
};

// ===================== 預算計算（鏡射工作簿公式） =====================

export interface BudgetTotals {
  meals: number;      // 膳食小計（平均數寫法，同財政預算 H13）
  venue: number;      // 場租 M50
  camp: number;       // 露營 M57
  lodging: number;    // 住宿 M65
  rent: number;       // 租金小計 H20
  transport: number;  // 交通 M75
  handouts: number;   // 講義 M82
  program: number;    // 節目 M88
  admin: number;      // 行政 M94
  souvenir: number;   // 紀念品 M99
  misc: number;       // 其他 M105
  total: number;      // 總支出 B83
  income: number;     // 總收入 B93（收費×收生＋總會津貼）
  subsidy: number;    // 申請津貼 D95（總支出−總收入）
}

/** 膳食：每餐（平均單價 × 餐數 × 平均人數），飲用水無餐數（同 H6–H11 寫法） */
function mealsSubtotal(meals: SetupMealLine[], intake: number, staffN: number): number {
  const cols: (keyof SetupMealLine)[] = ['breakfast', 'lunch', 'dinner', 'snack', 'water'];
  let total = 0;
  cols.forEach((k, ci) => {
    const prices = meals.map(l => l[k]).filter(hasNum).map(toNum);
    if (!prices.length) return;
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const heads = meals.map(l => {
      if (!hasNum(l[k])) return 0;
      return l.who === '職員' ? staffN : l.who === '學員' ? intake : 0;
    }).filter(h => h > 0);
    const avgHead = heads.length ? heads.reduce((a, b) => a + b, 0) / heads.length : 0;
    if (!avgHead) return;
    total += ci < 4 ? avg * prices.length * avgHead : avg * avgHead;
  });
  return total;
}

/** 租金三組小計（M50／M57／M65 寫法） */
export function rentSubtotals(e: SetupExpenses): { venue: number; camp: number; lodging: number } {
  const line3 = (lines: SetupRentLine[], triple: boolean): number => {
    let t = 0;
    lines.forEach((l, i) => {
      if (i === 0) t += triple ? toNum(l.qty) * toNum(l.qty2) * toNum(l.price) : toNum(l.qty) * toNum(l.price);
      else t += toNum(l.price);
    });
    return t;
  };
  return { venue: line3(e.venue, false), camp: line3(e.camp, true), lodging: line3(e.lodging, true) };
}

export function qpSubtotal(lines: SetupQtyPriceLine[]): number {
  return lines.reduce((a, l) => a + toNum(l.qty) * toNum(l.price), 0);
}

/** 成份預算小計＋總額（同 Input01／Print_財政預算公式一致） */
export function budgetTotals(s: CourseSetup): BudgetTotals {
  const intake = toNum(s.expectedIntake);
  const staffN = toNum(s.expectedStaff);
  const meals = mealsSubtotal(s.expenses.meals, intake, staffN);
  const rent = rentSubtotals(s.expenses);
  const transport = s.expenses.transport.reduce((a, l) => a + toNum(l.budget), 0);
  const handouts = qpSubtotal(s.expenses.handouts);
  const program = qpSubtotal(s.expenses.program);
  const admin = qpSubtotal(s.expenses.admin);
  const souvenir = qpSubtotal(s.expenses.souvenir);
  const misc = s.expenses.misc.reduce((a, l) => a + toNum(l.amount), 0);
  const total = meals + rent.venue + rent.camp + rent.lodging + transport + handouts + program + admin + souvenir + misc;
  const income = toNum(s.expectedFee) * intake + toNum(s.financeHqSubsidy);
  return {
    meals, venue: rent.venue, camp: rent.camp, lodging: rent.lodging,
    rent: rent.venue + rent.camp + rent.lodging,
    transport, handouts, program, admin, souvenir, misc, total, income,
    subsidy: total - income,
  };
}

// ===================== setup → 寫入格（1-based 座標） =====================

const IN1 = 'Input01 訓練班預算';
const IN2 = 'Input02 訓練班資料';
const IN3 = 'Input03 時間表';

/** 成份設定轉寫入格清單（後台照單寫入；空值都寫，確保覆蓋舊值） */
export function setupToCells(s: CourseSetup): SetupCell[] {
  const out: SetupCell[] = [];
  const put = (tab: string, row: number, col: number, value: string | boolean) => {
    out.push({ tab, row, col, value: typeof value === 'boolean' ? value : String(value ?? '').trim() });
  };
  // ── Input01 頭段 ──
  put(IN1, 1, 2, s.courseName); put(IN1, 4, 2, s.edition); put(IN1, 5, 2, s.section);
  put(IN1, 6, 2, s.badge); put(IN1, 7, 2, s.customName); put(IN1, 8, 2, s.form1); put(IN1, 9, 2, s.form2);
  put(IN1, 11, 2, s.expectedIntake); put(IN1, 12, 2, s.expectedFee); put(IN1, 13, 2, s.expectedStaff);
  for (let i = 0; i < 9; i++) {
    const d = s.budgetDates[i] || { date: '', time: '', venue: '' };
    put(IN1, 16 + i, 2, d.date); put(IN1, 16 + i, 3, d.time); put(IN1, 16 + i, 5, d.venue);
  }
  // ── Input01 膳食 32–39 ──
  s.expenses.meals.forEach((l, i) => {
    const r = 32 + i;
    put(IN1, r, 2, l.date); put(IN1, r, 3, l.time);
    put(IN1, r, 5, l.breakfast); put(IN1, r, 6, l.lunch); put(IN1, r, 7, l.dinner);
    put(IN1, r, 8, l.snack); put(IN1, r, 9, l.water); put(IN1, r, 10, l.who);
  });
  // ── Input01 租金：場租 47–49／露營 54–56／住宿 62–64 ──
  const rentBlock = (lines: SetupRentLine[], rows: number[]) => {
    lines.forEach((l, i) => {
      const r = rows[i];
      put(IN1, r, 2, l.place); put(IN1, r, 3, l.period);
      put(IN1, r, 6, l.qty); put(IN1, r, 7, l.qty2); put(IN1, r, 8, l.price);
    });
  };
  rentBlock(s.expenses.venue, [47, 48, 49]);
  rentBlock(s.expenses.camp, [54, 55, 56]);
  rentBlock(s.expenses.lodging, [62, 63, 64]);
  // ── Input01 交通 69–74／講義 79–81／節目 85–87／行政 91–93／紀念品 97–98／其他 102–104 ──
  s.expenses.transport.forEach((l, i) => { put(IN1, 69 + i, 3, l.route); put(IN1, 69 + i, 8, l.budget); });
  const qpBlock = (lines: SetupQtyPriceLine[], start: number) => {
    lines.forEach((l, i) => { put(IN1, start + i, 2, l.item); put(IN1, start + i, 7, l.qty); put(IN1, start + i, 8, l.price); });
  };
  qpBlock(s.expenses.handouts, 79); qpBlock(s.expenses.program, 85);
  qpBlock(s.expenses.admin, 91); qpBlock(s.expenses.souvenir, 97);
  s.expenses.misc.forEach((l, i) => { put(IN1, 102 + i, 2, l.item); put(IN1, 102 + i, 5, l.amount); });
  // ── Input02 ──
  put(IN2, 1, 2, s.courseName);
  put(IN2, 4, 2, s.quota); put(IN2, 5, 2, s.fee); put(IN2, 6, 2, s.staffCount);
  s.sessions.forEach((sess, i) => {
    const r = 9 + i;
    put(IN2, r, 2, sess.date); put(IN2, r, 3, sess.spanNext);
    put(IN2, r, 4, sess.time); put(IN2, r, 5, sess.venue);
    put(IN2, r, 8, sess.show);
    put(IN2, r, 9, sess.displayDate); put(IN2, r, 10, sess.displayTime); put(IN2, r, 11, sess.displayVenue);
  });
  put(IN2, 18, 2, s.deadline); put(IN2, 19, 2, s.publishDate);
  s.staff.forEach((st, i) => {
    const r = 23 + i;
    put(IN2, r, 1, st.role); put(IN2, r, 2, st.name); put(IN2, r, 3, st.title);
    put(IN2, r, 4, st.unit); put(IN2, r, 5, st.qualification);
    put(IN2, r, 6, st.phone); put(IN2, r, 7, st.email);
  });
  put(IN2, 46, 2, s.residentStaff);
  // ── Input03（3 組：top 2／12／22；E 服裝＋5 行流程 C 需時／D 項目／E 負責人） ──
  s.timetable.forEach((g, gi) => {
    const top = [2, 12, 22][gi];
    put(IN3, top + 1, 5, g.clothing);
    g.flows.forEach((f, i) => {
      const r = top + 4 + i;
      put(IN3, r, 3, f.mins); put(IN3, r, 4, f.item); put(IN3, r, 5, f.owner);
    });
  });
  // ── Print_通告人手格 ──
  const PN = 'Print_通告';
  put(PN, 23, 3, s.eligibility); put(PN, 24, 3, s.feeNote); put(PN, 31, 3, s.uniform);
  for (let i = 0; i < 6; i++) put(PN, 32 + i, 3, s.remarks[i] || '');
  put(PN, 12, 7, s.fileNo ? `檔案編號: ${s.fileNo}` : '');
  put(PN, 13, 7, s.issueDate);
  put(PN, 43, 5, s.signer);
  put(PN, 45, 5, s.deputy ? `（${s.deputy}代行）` : '');
  // ── Print_接納通知書人手格 ──
  const PA = 'Print_接納通知書';
  put(PA, 23, 4, s.acceptCheckin); put(PA, 30, 4, s.acceptItems);
  put(PA, 32, 4, s.acceptOthers); put(PA, 34, 4, s.acceptNote);
  // ── Print_財政預算＋資助人手格 ──
  put('Print_財政預算', 95, 2, s.financeApproved);
  put('Print_財政預算', 90, 8, s.financeHqSubsidy);
  put('Print_總會資助計劃', 11, 17, s.subsidyOrigFee);
  return out;
}

// ===================== setup → CourseLink 摘要（開班登記自動填） =====================

/** 由設定砌 CourseLink 摘要欄（同 pullFromSheet 口徑一致） */
export function setupToLinkSummary(s: CourseSetup): Partial<CourseLink> {
  const shown = s.sessions.filter(x => x.show && (x.displayDate || x.date));
  const sess = shown.length ? shown : s.sessions.filter(x => x.date || x.displayDate);
  const sessionsText = sess
    .map(x => [(x.displayDate || x.date), (x.displayTime || x.time), (x.displayVenue || x.venue)].filter(Boolean).join(' ').trim())
    .filter(Boolean).join('；');
  const venue = Array.from(new Set(sess.map(x => (x.displayVenue || x.venue || '').trim()).filter(Boolean))).join('、');
  const leader = s.staff.find(x => (x.role || '').includes('班領導人')) || s.staff.find(x => x.name);
  const contact = leader
    ? [((leader.name || '') + (leader.title || '')).trim() + (leader.role ? `（${leader.role}）` : ''), leader.phone || '', leader.email || ''].filter(x => x.trim()).join(' ')
    : '';
  return {
    title: s.courseName, badgeName: s.badge, section: s.section,
    fee: s.fee, quota: s.quota, deadline: s.deadline,
    venue, sessionsText, contact, eligibility: s.eligibility,
  };
}

// ===================== 班 Sheet raw → setup（讀返嚟改／列印） =====================

function valByLabel(m: SheetMatrix, label: string, col: number): string {
  if (!Array.isArray(m)) return '';
  for (const row of m) {
    if (Array.isArray(row) && String(row[0] ?? '').trim() === label) {
      return String(row[col] ?? '').trim();
    }
  }
  return '';
}
function rowOf(m: SheetMatrix, label: string): number {
  if (!Array.isArray(m)) return -1;
  for (let i = 0; i < m.length; i++) {
    if (Array.isArray(m[i]) && String(m[i][0] ?? '').trim() === label) return i;
  }
  return -1;
}

/** Input02 節次（label 對位；表頭自動對欄；同訓練班 Script 口徑一致） */
function parseSessions(v2: SheetMatrix): SetupSession[] {
  const out: SetupSession[] = [];
  const start = rowOf(v2, '活動日期及場地');
  if (start < 0) return out;
  let end = rowOf(v2, '截止報名日期');
  if (end < 0) end = v2.length;
  const isHdr = (r: number): boolean => Array.isArray(v2[r]) && /日期|時間|場地|通告顯示|dd\/mm/i.test(v2[r].join(' '));
  let hdr = -1;
  for (let r = Math.max(0, start - 4); r < start; r++) { if (isHdr(r)) { hdr = r; break; } }
  if (hdr < 0) { for (let r = start; r < end && r < start + 3; r++) { if (isHdr(r)) { hdr = r; break; } } }
  let dateC = 1, timeC = 3, venueC = 4, ddC = -1, dtC = -1, dvC = -1, crossC = -1, showC = -1;
  if (hdr >= 0 && Array.isArray(v2[hdr])) {
    v2[hdr].forEach((hv, c) => {
      const h = String(hv ?? '');
      if (h.includes('通告顯示日期')) ddC = c;
      else if (h.includes('通告顯示時間')) dtC = c;
      else if (h.includes('通告顯示地點')) dvC = c;
      else if (h === '日期' || /dd\/mm/i.test(h)) dateC = c;
      else if (h.includes('時間') && !h.includes('通告') && !h.includes('需時')) timeC = c;
      else if ((h.includes('場地') || h === '地點') && !h.includes('通告')) venueC = c;
      else if (h.includes('橫跨')) crossC = c;
      else if (h.includes('上通告')) showC = c;
    });
  }
  if (showC < 0 && ddC > 0) showC = ddC - 1;
  const isOff = (v: unknown): boolean => v === false || String(v ?? '').trim().toUpperCase() === 'FALSE';
  const isOn = (v: unknown): boolean => v === true || String(v ?? '').trim().toUpperCase() === 'TRUE';
  for (let i = start; i < end && out.length < 8; i++) {
    if (i === hdr || !Array.isArray(v2[i])) continue;
    const rawD = rawCell(v2, i, dateC);
    if (rawD === '' || rawD === null || rawD === undefined) continue;
    if (/日期|dd\/mm/i.test(String(rawD))) continue;
    out.push({
      date: normDate(rawD),
      spanNext: crossC >= 0 ? isOn(rawCell(v2, i, crossC)) : false,
      time: cell(v2, i, timeC), venue: cell(v2, i, venueC),
      displayDate: cell(v2, i, ddC), displayTime: cell(v2, i, dtC), displayVenue: cell(v2, i, dvC),
      show: showC >= 0 ? !isOff(rawCell(v2, i, showC)) : true,
    });
  }
  while (out.length < 8) out.push(blankSession());
  return out;
}

/** Input02 職員（職位＋姓名表頭之後，直到總人數行） */
function parseStaff(v2: SheetMatrix): CourseProfileStaff[] {
  const out: CourseProfileStaff[] = [];
  if (!Array.isArray(v2)) return out;
  let end = v2.length;
  v2.forEach((row) => {
    if (!Array.isArray(row)) return;
  });
  for (let r = 0; r < v2.length; r++) {
    const a = cell(v2, r, 0);
    if (a === '班職員總人數' || a === '常駐班職員人數') end = Math.min(end, r);
  }
  let hdr = -1;
  for (let i = 0; i < end; i++) {
    if (!Array.isArray(v2[i])) continue;
    const joined = v2[i].join(' ');
    if (joined.includes('職位') && joined.includes('姓名')) { hdr = i; break; }
  }
  if (hdr < 0) return out;
  let roleC = 0, nameC = 1, titleC = 2, unitC = 3, qualC = -1, phoneC = 4, emailC = 5;
  (v2[hdr] as unknown[]).forEach((hv, c) => {
    const h = String(hv ?? '');
    if (!h) return;
    if (h.includes('職位')) roleC = c;
    else if (h.includes('姓名')) nameC = c;
    else if (h.includes('稱謂')) titleC = c;
    else if (h.includes('資格')) qualC = c;
    else if (h.includes('單位') || h.includes('職銜')) unitC = c;
    else if (h.includes('電話')) phoneC = c;
    else if (h.includes('電郵') || h.toLowerCase().includes('email')) emailC = c;
  });
  for (let j = hdr + 1; j < end && out.length < 20; j++) {
    const role = cell(v2, j, roleC), name = cell(v2, j, nameC);
    if (!role && !name) continue;
    out.push({
      role, name, title: cell(v2, j, titleC), unit: cell(v2, j, unitC),
      qualification: qualC >= 0 ? cell(v2, j, qualC) : '',
      phone: cell(v2, j, phoneC), email: cell(v2, j, emailC),
    });
  }
  return out;
}

/** Input01 預算日期（B／C／E 欄） */
function parseBudgetDates(v1: SheetMatrix): SetupBudgetDate[] {
  const out: SetupBudgetDate[] = [];
  const start = rowOf(v1, '活動日期及場地');
  if (start < 0) return out;
  let end = v1.length;
  ['財政預算', '支出分類', '截止報名日期'].forEach(label => {
    const r = rowOf(v1, label);
    if (r > start) end = Math.min(end, r);
  });
  for (let i = start; i < end && out.length < 9; i++) {
    const rawD = rawCell(v1, i, 1);
    if (rawD === '' || rawD === null || rawD === undefined) continue;
    if (/日期|dd\/mm/i.test(String(rawD))) continue;
    out.push({ date: normDate(rawD), time: cell(v1, i, 2), venue: cell(v1, i, 4) });
  }
  return out;
}

/** Print_通告內文（B 欄 label 對位；同訓練班 Script 口徑一致） */
function parseNotice(v: SheetMatrix): Partial<CourseSetup> {
  const out: Partial<CourseSetup> = {};
  if (!Array.isArray(v) || !v.length) return out;
  const norm = (x: unknown): string => String(x ?? '').replace(/[\s　:：]/g, '');
  const findB = (kw: string): number => {
    for (let r = 0; r < v.length; r++) {
      if (Array.isArray(v[r]) && norm(v[r][1]).includes(kw)) return r;
    }
    return -1;
  };
  const rElig = findB('參加資格'), rFee = findB('費用'), rSignup = findB('報名辦法'),
    rUniform = findB('服裝'), rRemark = findB('備註'), rEnq = findB('查詢');
  out.eligibility = rElig >= 0 ? cell(v, rElig, 2) : '';
  out.feeNote = rFee >= 0 ? cell(v, rFee, 2) : '';
  out.uniform = rUniform >= 0 ? cell(v, rUniform, 2) : '';
  const remarks: string[] = [];
  if (rRemark >= 0) {
    const rEnd = rEnq >= 0 ? rEnq : v.length;
    for (let i = rRemark; i < rEnd && i < rRemark + 12; i++) {
      const t = cell(v, i, 2);
      if (t) remarks.push(t);
    }
  }
  if (remarks.length) out.remarks = remarks;
  const fileRaw = cell(v, 11, 6);
  out.fileNo = fileRaw.replace(/.*檔案編號\s*:?\s*/i, '').replace(/.*編號\s*:?\s*/, '').trim();
  out.issueDate = cell(v, 12, 6);
  out.signer = cell(v, 42, 4);
  out.deputy = cell(v, 44, 4).replace(/[（）()\s]/g, '').replace(/代行/g, '');
  return out;
}

/** 成份 raw → setup（讀返嚟改／列印用） */
export function parseRawToSetup(raw: CourseSheetRaw, courseId = ''): CourseSetup {
  const s = emptySetup();
  s.courseId = courseId;
  const v1 = raw.input01 || [], v2 = raw.input02 || [], v3 = raw.input03 || [];
  // Input02
  s.courseName = valByLabel(v2, '活動/訓練班名稱', 1);
  s.quota = valByLabel(v2, '名額', 1);
  s.fee = valByLabel(v2, '預計收費', 1);
  s.staffCount = valByLabel(v2, '職員人數', 1);
  s.deadline = normDate(rawCell(v2, rowOf(v2, '截止報名日期'), 1));
  s.publishDate = normDate(rawCell(v2, rowOf(v2, '最遲公佈取錄名單日'), 1));
  s.sessions = parseSessions(v2);
  const staff = parseStaff(v2);
  if (staff.length) {
    s.staff = SETUP_ROLE_PRESETS.map((role, i) => staff[i] || blankStaff(role));
  }
  s.residentStaff = valByLabel(v2, '常駐班職員人數', 1);
  // Input01
  if (!s.courseName) s.courseName = valByLabel(v1, '活動/訓練班名稱', 1);
  s.edition = valByLabel(v1, '屆別', 1);
  s.section = valByLabel(v1, '支部', 1);
  s.badge = valByLabel(v1, '專章', 1);
  s.customName = valByLabel(v1, '自定義名稱', 1);
  s.form1 = valByLabel(v1, '形式-1', 1);
  s.form2 = valByLabel(v1, '形式-2', 1);
  s.expectedIntake = valByLabel(v1, '預計收生人數', 1);
  s.expectedFee = valByLabel(v1, '預計收費', 1);
  s.expectedStaff = valByLabel(v1, '職員人數', 1);
  const bd = parseBudgetDates(v1);
  if (bd.length) s.budgetDates = bd;
  // Input01 預算行（固定座標）
  s.expenses.meals = range(8).map(i => {
    const r = 31 + i;
    return {
      date: normDate(rawCell(v1, r, 1)), time: cell(v1, r, 2),
      breakfast: cell(v1, r, 4), lunch: cell(v1, r, 5), dinner: cell(v1, r, 6),
      snack: cell(v1, r, 7), water: cell(v1, r, 8), who: cell(v1, r, 9),
    };
  });
  const rentRows = (rows: number[]): SetupRentLine[] => rows.map(r => ({
    place: cell(v1, r - 1, 1), period: cell(v1, r - 1, 2),
    qty: cell(v1, r - 1, 5), qty2: cell(v1, r - 1, 6), price: cell(v1, r - 1, 7),
  }));
  s.expenses.venue = rentRows([47, 48, 49]);
  s.expenses.camp = rentRows([54, 55, 56]);
  s.expenses.lodging = rentRows([62, 63, 64]);
  s.expenses.transport = range(6).map(i => ({ route: cell(v1, 68 + i, 2), budget: cell(v1, 68 + i, 7) }));
  const qpRows = (start: number, n: number): SetupQtyPriceLine[] => range(n).map(i => ({
    item: cell(v1, start - 1 + i, 1), qty: cell(v1, start - 1 + i, 6), price: cell(v1, start - 1 + i, 7),
  }));
  s.expenses.handouts = qpRows(79, 3); s.expenses.program = qpRows(85, 3);
  s.expenses.admin = qpRows(91, 3); s.expenses.souvenir = qpRows(97, 2);
  s.expenses.misc = range(3).map(i => ({ item: cell(v1, 101 + i, 1), amount: cell(v1, 101 + i, 4) }));
  // Input03（固定座標：top 2／12／22）
  s.timetable = [2, 12, 22].map(top => ({
    clothing: cell(v3, top, 4),
    flows: range(5).map(i => ({
      mins: cell(v3, top + 3 + i, 2), item: cell(v3, top + 3 + i, 3), owner: cell(v3, top + 3 + i, 4),
    })),
  }));
  // Print_通告／接納通知書／財政預算／資助
  Object.assign(s, parseNotice(raw.notice || []));
  const va = raw.accept || [];
  s.acceptCheckin = cell(va, 22, 3); s.acceptItems = cell(va, 29, 3);
  s.acceptOthers = cell(va, 31, 3); s.acceptNote = cell(va, 33, 3);
  const vf = raw.finance || [];
  s.financeApproved = cell(vf, 94, 1); s.financeHqSubsidy = cell(vf, 89, 7);
  s.subsidyOrigFee = cell(raw.subsidy || [], 10, 16);
  return s;
}

// ===================== raw → 列印數據 =====================

/** 表格回應欄位（0-based）：B1 C2 E4 F5 H7 I8 J9 K10 Q16 AD29 AI34 AJ35 AK36 */
const RC = { email: 1, name: 2, nameEn: 3, phone: 4, gender: 5, district: 7, troop: 8, scoutId: 9, position: 10, parentPhone: 16, troopNo: 29, code: 34, group: 35, status: 36 };

function isApproved(v: unknown): boolean {
  return String(v ?? '').trim().toLowerCase() === 'approved';
}

/** raw → 12 張列印總數據 */
export function parseRawToPrints(raw: CourseSheetRaw, setup: CourseSetup): CoursePrintData {
  const resp = Array.isArray(raw.resp) ? raw.resp : [];
  const rows = resp.length > 1 ? resp.slice(1) : [];
  const nonEmpty = rows.filter(r => Array.isArray(r) && String(r[0] ?? '').trim() !== '');
  const approved = nonEmpty.filter(r => isApproved(r[RC.status]));
  const isHome = (r: unknown[]): boolean => String(r[RC.district] ?? '').includes('筲箕灣');
  const roster: PrintRosterRow[] = approved.map((r, i) => ({
    seq: i + 1,
    group: String(r[RC.group] ?? '').trim(), code: String(r[RC.code] ?? '').trim(),
    name: String(r[RC.name] ?? '').trim(), nameEn: String(r[RC.nameEn] ?? '').trim(),
    gender: String(r[RC.gender] ?? '').trim(), troop: String(r[RC.troop] ?? '').trim(),
    district: String(r[RC.district] ?? '').trim(), phone: String(r[RC.phone] ?? '').trim(),
    parentPhone: String(r[RC.parentPhone] ?? '').trim(), email: String(r[RC.email] ?? '').trim(),
    scoutId: String(r[RC.scoutId] ?? '').trim(), position: String(r[RC.position] ?? '').trim(),
    troopNo: String(r[RC.troopNo] ?? '').trim(),
  }));
  // 完成報告 D–F（人手）：rows 10–31 → 0-based 9–30
  const vc = Array.isArray(raw.completion) ? raw.completion : [];
  const completion: PrintCompletionRow[] = [];
  for (let i = 9; i <= 30; i++) {
    const code = cell(vc, i, 0), name = cell(vc, i, 1);
    if (!code && !name) continue;
    completion.push({
      code, name, troopNo: cell(vc, i, 2), certNo: cell(vc, i, 3),
      pass: cell(vc, i, 4), failReason: cell(vc, i, 5),
    });
  }
  // 領取證書 E–G（人手）：rows 7–29 → 0-based 6–28，B–G = cols 1–6
  const vct = Array.isArray(raw.cert) ? raw.cert : [];
  const certRows: PrintCertRow[] = [];
  for (let i = 6; i <= 28; i++) {
    const code = cell(vct, i, 1), name = cell(vct, i, 2);
    if (!code && !name) continue;
    certRows.push({
      code, name, troopNo: cell(vct, i, 3), certNo: cell(vct, i, 4),
      pickupDate: cell(vct, i, 5), signed: cell(vct, i, 6),
    });
  }
  // Input04 實際小計 B43:J43 → row 42，cols 1–9
  const v4 = Array.isArray(raw.input04) ? raw.input04 : [];
  const actuals = range(9).map(i => toNum(rawCell(v4, 42, 1 + i)));
  // 財政預算修訂欄 C（0-based col 2）
  const vf = Array.isArray(raw.finance) ? raw.finance : [];
  const revised: Record<string, string> = {};
  for (let r = 0; r < vf.length; r++) {
    const t = cell(vf, r, 2);
    if (t) revised[String(r + 1)] = t;
  }
  // 資助學員列 rows 22–51 → 0-based 21–50
  const vs = Array.isArray(raw.subsidy) ? raw.subsidy : [];
  const subsidyRows = vs.slice(21, 51);
  // 參數 W1:X5 → X = col 1
  const wx = Array.isArray(raw.paramsWX) ? raw.paramsWX : [];
  const admittedHome = approved.filter(isHome).length;
  return {
    setup,
    roster,
    counts: {
      appliedHome: nonEmpty.filter(isHome).length,
      appliedOther: nonEmpty.length - nonEmpty.filter(isHome).length,
      admittedHome, admittedOther: approved.length - admittedHome, admittedTotal: approved.length,
      completed: completion.filter(c => c.pass !== '').length,
      passed: completion.filter(c => c.pass === '合格').length,
    },
    actuals,
    actualTotal: actuals.reduce((a, b) => a + b, 0),
    revised, completion, certRows, subsidyRows,
    portalUrl: cell(wx, 1, 1), fpsId: cell(wx, 2, 1), fpsName: cell(wx, 3, 1), webUrl: cell(wx, 4, 1),
    pulledAt: raw.pulledAt || '',
  };
}

/** 列印用：節次中文日期行（Input02 B9:B16 → dd/m/yyyy 串起，同工作簿 TEXTJOIN 口徑） */
export function sessionDateLine(sessions: SetupSession[]): string {
  return sessions
    .filter(x => x.date)
    .map(x => {
      const m = x.date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : x.date;
    })
    .join(', ');
}

/** 列印用：上通告節次（✓＋有顯示日期先計） */
export function circularSessions(sessions: SetupSession[]): SetupSession[] {
  const shown = sessions.filter(x => x.show && x.displayDate);
  return shown.length ? shown : sessions.filter(x => x.date || x.displayDate);
}

/** 班領導人（職員表第一個含「班領導人」職位） */
export function courseLeader(staff: CourseProfileStaff[]): CourseProfileStaff | null {
  return staff.find(x => (x.role || '').includes('班領導人')) || staff.find(x => x.name) || null;
}
