/**
 * 🎭 模擬示範版 — 示範資料（v4.9.0）
 * ================================================================
 * 参考 event 系統「模擬示範版」做法：完整示範資料、100% 本地沙盒。
 * 所有資料屬虛構示範用途，改動只存喺你自己瀏覽器（sessionStorage），
 * 唔會寫入任何區方 Google Sheet / Apps Script 後台。
 *
 * 純資料模組：唔可以 import 任何嘢（方便 node 測試直接 require）。
 */

export interface DemoUser {
  email: string;
  displayName: string;
  role: string;
  roleLabel: string;
  isAdmin: boolean;
  isDC: boolean;
  canManageAccounts: boolean;
  scopes: string[];
  level: number;
  levelLabel: string;
  isSuper: boolean;
  /** 🎭 示範版權限全開（對照 event 系統 mock_admin）：所有管理功能任試 */
  mockAdmin: boolean;
  password: string; // 示範版：任何密碼都入到，呢個只係提示用
}

/**
 * 一鍵示範身份 — 只得一個：助理區總監（ADC）。
 * 管理系統大部分日常嘢都係 ADC 處理，示範版就以此身份權限全開（mock_admin，
 * 對照 event 系統「MOCK 示範登入已開放全部管理權限」），唔搞多重權限。
 */
export const DEMO_IDENTITIES: { key: string; label: string; icon: string; desc: string; color: string }[] = [
  { key: 'adc', label: '助理區總監（ADC）', icon: '🧑‍🏫', desc: '示範版權限全開：試晒所有管理功能', color: '#0d9488' },
];

const SESSION_BASE = {
  scopes: [] as string[],
  isSuper: false,
};

export const DEMO_USERS: Record<string, DemoUser> = {
  adc: {
    email: 'demo-adc@demo', displayName: '黃志強', role: 'ADC_SCOUT', roleLabel: '助理區總監（童軍）',
    isAdmin: true, isDC: false, canManageAccounts: true, level: 3, levelLabel: '助理區總監',
    ...SESSION_BASE, mockAdmin: true, password: '任何密碼',
  },
};

export function demoUserFor(_email?: string): DemoUser {
  return DEMO_USERS.adc;
}

export const DEMO_TOKEN = 'demo-session-token';

// ───────────────────────── 卡片（照後台 Cards 表，冇 news） ─────────────────────────

export const DEMO_CARDS: Record<string, any>[] = [
  { cardId: 'visit', title: '旅團探訪', icon: '🏕', type: 'builtin', url: '/visit', description: '一撳登記探訪 · 未探旅團紅燈 · 季度報告', order: 1, enabled: true, embed: false, source: 'core', category: 'done' },
  { cardId: 'contacts', title: '聯絡簿', icon: '📇', type: 'builtin', url: '/contacts', description: '聯絡電話：旅團 · 港島地域 · 總會（職員姓名區方可改）', order: 2, enabled: true, embed: false, source: 'core', category: 'done' },
  { cardId: 'awards', title: '獎勵提名', icon: '🎖', type: 'builtin', url: '/awards', description: '獎勵名冊 · 自動計夠期可提名 · 年期自訂', order: 3, enabled: true, embed: false, source: 'core', category: 'done' },
  { cardId: 'budget', title: '區年度預算', icon: '📑', type: 'builtin', url: '/budget', description: '直讀區方預算 Sheet · 按月／支部 · 資助合計', order: 5, enabled: true, embed: false, source: 'core', category: 'done' },
  { cardId: 'committee', title: '委任系統', icon: '🗂', type: 'builtin', url: '/committee', description: '委任 · 續任 · R02', order: 7, enabled: true, embed: false, source: 'core', category: 'todo' },
  { cardId: 'unit', title: '旅團管理系統', icon: '🧭', type: 'builtin', url: '/unit', description: '旅名冊 · 人數統計', order: 8, enabled: true, embed: false, source: 'core', category: 'todo' },
  { cardId: 'venueReg', title: '場地借用審批', icon: '🏛', type: 'builtin', url: '/venue-regs', description: '借場申請批核 · 場地清單', order: 9, enabled: true, embed: false, source: 'core', category: 'done' },
  { cardId: 'stockReg', title: '物資借用審批', icon: '📦', type: 'builtin', url: '/stock-regs', description: '借物資批核 · 庫存管理', order: 10, enabled: true, embed: false, source: 'core', category: 'done' },
  { cardId: 'activity', title: '活動知會', icon: '🗓', type: 'builtin', url: '/activity-notices', description: '旅團活動知會記錄', order: 11, enabled: true, embed: false, source: 'core', category: 'done' },
  { cardId: 'incident', title: '意外 / 應變', icon: '🚨', type: 'builtin', url: '/incident', description: '天氣決策 · 即時應變 · 總會指引 · 意外報告', order: 12, enabled: true, embed: false, source: 'core', category: 'done' },
  { cardId: 'training', title: '訓練班管理', icon: '🎓', type: 'builtin', url: '/training', description: '開班登記 · 區會目錄', order: 13, enabled: true, embed: false, source: 'core', category: 'done' },
  { cardId: 'fps', title: 'FPS QR 製作', icon: '💳', type: 'builtin', url: '/fps', description: '轉數快 QR 碼：綁區會戶口，填銀碼即生成', order: 14, enabled: true, embed: false, source: 'core', category: 'done' },
  { cardId: 'rooms', title: '地域房間使用情況', icon: '🏢', type: 'builtin', url: '/rooms', description: '17／18／19 樓逐間房睇用途時段 · 今日總覽', order: 15, enabled: true, embed: false, source: 'core', category: 'done' },
  { cardId: 'orgchart', title: '地域及總會架構', icon: '🏛', type: 'builtin', url: '/orgchart', description: '港島地域總監架構 · 總會領導層，自動跟官網更新', order: 16, enabled: true, embed: false, source: 'core', category: 'done' },
];

export const DEMO_ROLES: Record<string, any>[] = [
  { role: 'DC', label: '區總監', protected: true, level: 1 },
  { role: 'DDC_ADMIN', label: '副區總監（行政）', protected: true, level: 2 },
  { role: 'DDC_TRAINING', label: '副區總監（訓練）', protected: true, level: 2 },
  { role: 'ADC_GH', label: '助理區總監（小童軍）', protected: true, level: 3 },
  { role: 'ADC_CUBS', label: '助理區總監（幼童軍）', protected: true, level: 3 },
  { role: 'ADC_SCOUT', label: '助理區總監（童軍）', protected: true, level: 3 },
  { role: 'ADC_VENTURE', label: '助理區總監（深資童軍）', protected: true, level: 3 },
  { role: 'ADC_ROVER', label: '助理區總監（樂行童軍）', protected: true, level: 3 },
  { role: 'STAFF', label: '區職員（受薪）', protected: true, level: 4 },
];

/**
 * 權限矩陣（v4.9.0 語義）：
 * - awards：只有 level ≤ 2（DC／DDC）有 view／edit
 * - visit：DC／DDC／ADC edit，STAFF view
 * - 其餘：DC／DDC edit，ADC／STAFF view
 */
export function demoDefaultMatrix(): Record<string, Record<string, 'edit' | 'view' | ''>> {
  const m: Record<string, Record<string, 'edit' | 'view' | ''>> = {};
  const roleLevel: Record<string, number> = { DC: 1, DDC_ADMIN: 2, DDC_TRAINING: 2, ADC_GH: 3, ADC_CUBS: 3, ADC_SCOUT: 3, ADC_VENTURE: 3, ADC_ROVER: 3, STAFF: 4 };
  DEMO_CARDS.forEach(c => {
    m[c.cardId] = {};
    Object.keys(roleLevel).forEach(role => {
      const lv = roleLevel[role];
      if (c.cardId === 'awards') m[c.cardId][role] = lv <= 2 ? 'edit' : '';
      else if (c.cardId === 'visit') m[c.cardId][role] = lv <= 3 ? 'edit' : 'view';
      else m[c.cardId][role] = lv <= 2 ? 'edit' : 'view';
    });
  });
  return m;
}

// ───────────────────────── 獎勵名冊（示範：LAY 階梯＋冇資格＋自行申請） ─────────────────────────

/** 照後台 awardTypeSeed_ 18 個獎項（v4.9.0 規則） */
export const DEMO_AWARD_TYPES: Record<string, any>[] = [
  { code: 'GSA', label: '優良服務獎章', short: 'GSA', category: '功績榮譽', prevCode: '', minYears: 7, round: 'founder', note: 'Good Service Award；由服務開始年份起計 7 年', enabled: true },
  { code: 'DSA', label: '優異服務獎章', short: 'DSA', category: '功績榮譽', prevCode: 'GSA', minYears: 5, round: 'founder', note: 'Dedicated Service Award', enabled: true },
  { code: 'DSM', label: '功績榮譽獎章', short: 'DSM', category: '功績榮譽', prevCode: 'DSA', minYears: 7, round: 'rally', note: 'Distinguished Service Medal；獎勵委員會批准', enabled: true },
  { code: 'DSC', label: '功績榮譽十字章', short: 'DSC', category: '功績榮譽', prevCode: 'DSM', minYears: 5, round: 'rally', note: 'Distinguished Service Cross；成年成員最高功績獎勵', enabled: true },
  { code: 'BRL', label: '銅獅勳章', short: '銅獅', category: '獅勳章', prevCode: 'DSC', minYears: null, round: 'rally', note: 'Bronze Lion；冇固定年期規定', enabled: true },
  { code: 'SVL', label: '銀獅勳章', short: '銀獅', category: '獅勳章', prevCode: 'BRL', minYears: null, round: 'rally', note: 'Silver Lion；冇固定年期規定', enabled: true },
  { code: 'GDL', label: '金獅勳章', short: '金獅', category: '獅勳章', prevCode: 'SVL', minYears: null, round: 'rally', note: 'Gold Lion；制服成年成員最高功績獎勵', enabled: true },
  { code: 'FIVE', label: '五年長期服務獎狀', short: '五年', category: '長期服務', prevCode: '', minYears: 5, round: 'other', note: '會務委員（LAY）階梯第一級；由服務開始年份起計 5 年', enabled: true },
  { code: 'TEN', label: '十年長期服務獎狀', short: '十年', category: '長期服務', prevCode: 'FIVE', minYears: 5, round: 'other', note: '會務委員（LAY）；五年獎狀後 5 年（共 10 年）', enabled: true },
  { code: 'LSM', label: '長期服務獎章', short: 'LSM', category: '長期服務', prevCode: '', minYears: 15, round: 'other', note: '服務滿 15 年（由服務開始年份起計）', enabled: true },
  { code: 'LSM1', label: '長期服務一星獎章', short: 'LSM*', category: '長期服務', prevCode: 'LSM', minYears: 10, round: 'other', note: '再服務滿 10 年（共 25 年）', enabled: true },
  { code: 'LSM2', label: '長期服務二星獎章', short: 'LSM**', category: '長期服務', prevCode: 'LSM1', minYears: 10, round: 'other', note: '共 35 年', enabled: true },
  { code: 'LSM3', label: '長期服務三星獎章', short: 'LSM***', category: '長期服務', prevCode: 'LSM2', minYears: 10, round: 'other', note: '共 45 年', enabled: true },
  { code: 'LSM4', label: '長期服務四星獎章', short: 'LSM****', category: '長期服務', prevCode: 'LSM3', minYears: 10, round: 'other', note: '共 55 年', enabled: true },
  { code: 'CCM', label: '香港總監嘉許', short: '總監嘉許', category: '嘉許', prevCode: '', minYears: null, round: 'other', note: '黃色笛繩；自行申請，唔會自動推算', enabled: true },
  { code: 'CCH', label: '香港總監高級嘉許', short: '高級嘉許', category: '嘉許', prevCode: '', minYears: null, round: 'other', note: '黃紫綠笛繩；自行申請，唔可以由總監嘉許年份推算', enabled: true },
  { code: 'HAB', label: '民政及青年事務局局長嘉許', short: '民青局', category: '外部嘉許', prevCode: '', minYears: null, round: 'hab', note: '自行申請＋有提名期（死線可喺年期設定改）', enabled: true },
  { code: 'THANKS', label: '感謝狀', short: '感謝狀', category: '其他', prevCode: '', minYears: null, round: 'other', note: '表格 DA2；自行申請，唔會自動推算', enabled: true },
];

/** 示範名冊：涵蓋 LAY 階梯、冇提名資格、自行申請、夠期可提名等情況 */
export const DEMO_AWARD_MEMBERS: Record<string, any>[] = [
  { id: 'am-01', name: '張國強', troop: '206', position: 'GSL', serviceStart: '2005', status: 'active', note: '', awards: { GSA: '2012', DSA: '2018', LSM: '2020', LSM1: '2030' } },
  { id: 'am-02', name: '黃淑儀', troop: '82', position: 'GSL', serviceStart: '2012', status: 'active', note: '', awards: { GSA: '2019', FIVE: '2017', TEN: '2022' } },
  { id: 'am-03', name: '林志傑', troop: '17', position: 'SL', serviceStart: '2015', status: 'active', note: '', awards: {} },
  { id: 'am-04', name: '陳美寶', troop: '1745', position: 'SL', serviceStart: '2008', status: 'active', note: '', awards: { GSA: '2015', LSM: '2023' } },
  { id: 'am-05', name: '周家豪', troop: '242', position: 'CSL', serviceStart: '2019', status: 'active', note: '', awards: {} },
  { id: 'am-06', name: '何詠恩', troop: '206', position: 'ACSL', serviceStart: '2021', status: 'active', note: '', awards: {} },
  { id: 'am-07', name: '鄭偉明', troop: '', position: 'LAY', serviceStart: '1998', status: 'active', note: '區會計；長期服務階梯示範', awards: { FIVE: '2003', TEN: '2008', LSM: '2013', LSM1: '2023' } },
  { id: 'am-08', name: '梁雅文', troop: '', position: 'LAY', serviceStart: '2004', status: 'active', note: '', awards: { FIVE: '2009', TEN: '2014' } },
  { id: 'am-09', name: '劉志成', troop: '1222', position: 'GSL', serviceStart: '2001', status: 'noNomination', note: '已 request 本年度唔提名', awards: { GSA: '2008', DSA: '2016' } },
  { id: 'am-10', name: '許鳳儀', troop: '33', position: 'SL', serviceStart: '2010', status: 'active', note: '', awards: { CCM: '2022' } },
  { id: 'am-11', name: '馮國樑', troop: '60', position: 'GSL', serviceStart: '1995', status: 'active', note: '', awards: { GSA: '2003', DSA: '2010', DSM: '2018', CCM: '2015', CCH: '2021' } },
  { id: 'am-12', name: '盧慧敏', troop: '206', position: 'BL', serviceStart: '2016', status: 'applying', note: '2026 民青局局長嘉許自行申請中', awards: { HAB: '2025' } },
  { id: 'am-13', name: '謝永康', troop: '17', position: 'ASL', serviceStart: '2022', status: 'active', note: '', awards: { THANKS: '2024' } },
  { id: 'am-14', name: '鄧麗珍', troop: '82', position: 'AKSL', serviceStart: '2013', status: 'left', note: '已離區', awards: { GSA: '2020' } },
  { id: 'am-15', name: '楊啟業', troop: '242', position: 'SL', serviceStart: '2011', status: 'active', note: '', awards: { GSA: '2018' } },
  { id: 'am-16', name: '鍾慧賢', troop: '1745', position: 'CSL', serviceStart: '2014', status: 'active', note: '', awards: {} },
];

// ───────────────────────── 旅團＋探訪（照 28 旅格式） ─────────────────────────

export const DEMO_UNITS: Record<string, any>[] = [
  { troop: '17', label: '港島第17旅', org: '聖公會聖十架堂', sections: { gh: '', cub: '1', scout: '2', venture: '', rover: '' } },
  { troop: '33', label: '港島第33旅', org: '筲箕灣官立小學', sections: { gh: '1', cub: '1', scout: '1', venture: '', rover: '' } },
  { troop: '60', label: '港島第60旅', org: '慈幼學校', sections: { gh: '1', cub: '2', scout: '2', venture: '1', rover: '1' } },
  { troop: '82', label: '港島第82旅', org: '聖十字架堂', sections: { gh: '', cub: '1', scout: '1', venture: '', rover: '' } },
  { troop: '86', label: '港島第86旅', org: '香港童軍總會', sections: { gh: '', cub: '', scout: '1', venture: '', rover: '' } },
  { troop: '206', label: '港島第206旅', org: '番禺會所學校（香港）', sections: { gh: '1', cub: '2', scout: '2', venture: '1', rover: '' } },
  { troop: '242', label: '港島第242旅', org: '東華三院香港華都扶輪社天翎平田長者地區中心', sections: { gh: '1', cub: '1', scout: '1', venture: '', rover: '' } },
  { troop: '1222', label: '港島第1222旅', org: '香港聖公會麥理浩夫人中心', sections: { gh: '', cub: '1', scout: '1', venture: '', rover: '' } },
  { troop: '1745', label: '港島第1745旅', org: '明愛柴灣馬登基金中學', sections: { gh: '', cub: '', scout: '1', venture: '1', rover: '1' } },
];

// ───────────────────────── 消息（含一條軟刪除留底示範） ─────────────────────────

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
}
function dateOnly(daysAgo: number): string {
  return iso(daysAgo).slice(0, 10);
}

export function demoAnnouncements(): Record<string, any>[] {
  return [
    {
      id: 'an-01', title: '2026 年度民青局局長嘉許計劃 — 開始接受自行申請',
      body: '民政及青年事務局局長嘉許計劃 2026 年度開始接受申請。服務滿指定年期嘅制服團體義工可以自行申請，表格（附件 II）須由單位主管簽署加蓋印章，2026 年 2 月 3 日前交民青局。典禮暫定 2026 年年中舉行。有意申請請聯絡區秘書處。',
      date: dateOnly(3), pinned: true, level: 'info', link: '', linkLabel: '', notify: false,
      active: true, expiresAt: '', publishedAt: iso(3), publishedBy: '李小明', updatedAt: iso(3),
      deleted: false, deletedAt: '', deletedBy: '',
    },
    {
      id: 'an-02', title: '周日大會操集合時間更改',
      body: '本周日大會操集合時間由 08:30 更改為 09:00，地點不變（愛秩序灣公園）。請各旅團通知成員。',
      date: dateOnly(7), pinned: false, level: 'warning', link: '', linkLabel: '', notify: true,
      active: true, expiresAt: dateOnly(-14), publishedAt: iso(7), publishedBy: '陳大文', updatedAt: iso(7),
      deleted: false, deletedAt: '', deletedBy: '',
    },
    {
      id: 'an-03', title: '區慶祝活動籌備會議紀錄已上載',
      body: '多謝各位出席。會議紀錄及分工表已電郵各旅團領袖，跟進事項請於兩星期內回覆。',
      date: dateOnly(14), pinned: false, level: 'info', link: '', linkLabel: '', notify: false,
      active: true, expiresAt: '', publishedAt: iso(14), publishedBy: '區小花', updatedAt: iso(14),
      deleted: false, deletedAt: '', deletedBy: '',
    },
    {
      id: 'an-04', title: '（已刪除示範）舊版集合地點通知',
      body: '呢條消息示範咗 v4.9.0 軟刪除：刪咗都留底（deleted=TRUE），可以喺「完整紀錄」還原，成員端就永遠見唔到。',
      date: dateOnly(21), pinned: false, level: 'info', link: '', linkLabel: '', notify: false,
      active: true, expiresAt: '', publishedAt: iso(21), publishedBy: '陳大文', updatedAt: iso(2),
      deleted: true, deletedAt: iso(2), deletedBy: '陳大文',
    },
  ];
}

// ───────────────────────── 借場 / 借物資 / 知會 / 意外 / 訓練班 ─────────────────────────

export const DEMO_VENUES: Record<string, any>[] = [
  { venueId: 'v-01', name: '區總部 1704 室', location: '香港童軍百周年紀念大樓 17 樓', capacity: '約 140 人', note: '有投影機＋音響', active: 'TRUE' },
  { venueId: 'v-02', name: '愛秩序灣活動室', location: '愛秩序灣社區會堂', capacity: '約 60 人', note: '', active: 'TRUE' },
  { venueId: 'v-03', name: '柴灣公眾騎術學校草地', location: '柴灣', capacity: '戶外', note: '要自行申請許可', active: 'TRUE' },
];

export function demoVenueBookings(): Record<string, any>[] {
  return [
    { id: 'vb-01', refCode: 'VB-26090101', submittedAt: iso(2), venueId: 'v-01', venueName: '區總部 1704 室', purpose: '旅團領袖會議', startDate: dateOnly(-4), endDate: dateOnly(-4), name: '張國強', phone: '9123 4567', email: 'demo@demo', troop: '206', position: 'GSL', status: 'pending', agreeRules: 'TRUE' },
    { id: 'vb-02', refCode: 'VB-26082702', submittedAt: iso(9), venueId: 'v-02', venueName: '愛秩序灣活動室', purpose: '幼童軍集會', startDate: dateOnly(-12), endDate: dateOnly(-12), name: '周家豪', phone: '9234 5678', email: 'demo2@demo', troop: '242', position: 'CSL', status: 'approved', reviewer: '李小明', reviewedAt: iso(8), passcode: '482913', agreeRules: 'TRUE' },
    { id: 'vb-03', refCode: 'VB-26082003', submittedAt: iso(16), venueId: 'v-03', venueName: '柴灣公眾騎術學校草地', purpose: '深資童軍野外定向', startDate: dateOnly(9), endDate: dateOnly(9), name: '林志傑', phone: '9345 6789', email: 'demo3@demo', troop: '17', position: 'SL', status: 'rejected', reviewer: '陳大文', reviewedAt: iso(15), agreeRules: 'TRUE' },
  ];
}

export const DEMO_STOCK_ITEMS: Record<string, any>[] = [
  { itemId: 'st-01', name: '露營帳篷（6 人用）', category: '露營', totalQty: '12', availableQty: '9', unit: '個', note: '', active: 'TRUE' },
  { itemId: 'st-02', name: '後備發電機', category: '器材', totalQty: '2', availableQty: '2', unit: '部', note: '要自備電油', active: 'TRUE' },
  { itemId: 'st-03', name: '擴音機連咪', category: '音響', totalQty: '4', availableQty: '3', unit: '套', note: '', active: 'TRUE' },
  { itemId: 'st-04', name: '旗桿（連底座）', category: '儀式', totalQty: '8', availableQty: '8', unit: '支', note: '', active: 'TRUE' },
  { itemId: 'st-05', name: '煮食爐具套裝', category: '露營', totalQty: '10', availableQty: '7', unit: '套', note: '', active: 'TRUE' },
  { itemId: 'st-06', name: '急救背囊', category: '安全', totalQty: '6', availableQty: '6', unit: '個', note: '', active: 'TRUE' },
];

export function demoStockRequests(): Record<string, any>[] {
  return [
    { id: 'sr-01', refCode: 'SR-26090201', batchRef: 'B-26090201', submittedAt: iso(1), itemId: 'st-01', itemName: '露營帳篷（6 人用）', qty: 3, purpose: '秋季大露營', borrowDate: dateOnly(10), returnDate: dateOnly(13), name: '林志傑', phone: '9345 6789', troop: '17', position: 'SL', status: 'pending' },
    { id: 'sr-02', refCode: 'SR-26090201', batchRef: 'B-26090201', submittedAt: iso(1), itemId: 'st-05', itemName: '煮食爐具套裝', qty: 2, purpose: '秋季大露營', borrowDate: dateOnly(10), returnDate: dateOnly(13), name: '林志傑', phone: '9345 6789', troop: '17', position: 'SL', status: 'pending' },
    { id: 'sr-03', refCode: 'SR-26082802', batchRef: '', submittedAt: iso(8), itemId: 'st-03', itemName: '擴音機連咪', qty: 1, purpose: '區慶祝活動', borrowDate: dateOnly(-5), returnDate: dateOnly(-4), name: '區小花', phone: '9456 7890', troop: '', position: 'STAFF', status: 'returned', reviewer: '李小明', reviewedAt: iso(7) },
  ];
}

export function demoActivityNotices(): Record<string, any>[] {
  return [
    { id: 'ac-01', refCode: 'AN-260901', submittedAt: iso(2), year: String(new Date().getFullYear()), section: 'scout', nature: '露營', troop: '206', activityName: '秋季大露營籌備日', startDateTime: `${dateOnly(20)} 09:00`, endDateTime: `${dateOnly(20)} 17:00`, location: '西貢灣仔營地', membersCount: '45', leadersCount: '8', parentsCount: '0', leaderName: '張國強', leaderPhone: '9123 4567', leaderEmail: 'demo@demo', note: '' },
    { id: 'ac-02', refCode: 'AN-260828', submittedAt: iso(9), year: String(new Date().getFullYear()), section: 'cub', nature: '參觀', troop: '242', activityName: '參觀消防局', startDateTime: `${dateOnly(6)} 14:00`, endDateTime: `${dateOnly(6)} 16:00`, location: '柴灣消防局', membersCount: '24', leadersCount: '5', parentsCount: '6', leaderName: '周家豪', leaderPhone: '9234 5678', leaderEmail: 'demo2@demo', note: '' },
    { id: 'ac-03', refCode: 'AN-260815', submittedAt: iso(22), year: String(new Date().getFullYear()), section: 'venture', nature: '服務', troop: '1745', activityName: '賣旗日服務', startDateTime: `${dateOnly(-16)} 07:00`, endDateTime: `${dateOnly(-16)} 12:30`, location: '筲箕灣', membersCount: '18', leadersCount: '3', parentsCount: '0', leaderName: '林志傑', leaderPhone: '9345 6789', leaderEmail: 'demo3@demo', note: '' },
  ];
}

export function demoIncidentReports(): Record<string, any>[] {
  return [
    { id: 'ir-01', refCode: 'ACC-260830', status: 'submitted', submittedAt: iso(6), submittedBy: 'demo-adc@demo', accidentDate: dateOnly(6), accidentTime: '15:20', activityName: '童軍團步操練習', place: '愛秩序灣公園', organiser: '港島第17旅', injuryPart: '左腳踝', injuryType: '扭傷', injuredNameZh: '（示範）黃同學', injuredNameEn: 'Demo Scout', scoutId: 'D000001', hkid: '', age: '11', sex: '男', phone: '9567 8901', email: '', address: '', unit: '港島第17旅', position: '童軍', guardianName: '黃先生', guardianRelation: '父親', guardianPhone: '9567 8901', guardianEmail: '', ambulanceCalled: '沒有', hospital: '無需送院', hospitalStay: '當日出院', escortName: '林志傑', escortPhone: '9345 6789', policeReported: '否', hasWitness: '有', witnessName: '陳美寶', witnessPhone: '9456 1234', details: JSON.stringify([{ when: '15:20', text: '步操時踩到石級邊扭傷' }]), followUps: JSON.stringify([{ when: '15:40', text: '家長接回，建議休息' }]), reporterName: '林志傑', reporterPosition: 'SL', reporterUnit: '港島第17旅', serious: '', createdAt: iso(6) },
  ];
}

export function demoCourseLinks(): Record<string, any>[] {
  return [
    { courseId: 'cl-01', title: '初級領袖訓練班（BLT）2026 年 10 月班', badgeName: '領袖委任', section: '領袖', courseNo: 'BLT-2610', sessionsText: '10 月 3、10、17 日（週六）09:00–17:00', eligibility: '18 歲以上完成中五', fee: '850', deadline: `${dateOnly(15)} `, quota: '36', filled: '22', venue: '區總部 1704 室', contact: '訓練組 ddc.training@demo', active: 'TRUE', createdAt: iso(30) },
    { courseId: 'cl-02', title: '遠足導師班（HWC）2026 年 11 月班', badgeName: '遠足', section: '領袖', courseNo: 'HWC-2611', sessionsText: '11 月 7、14 日（週六）全天', eligibility: '持有初級領袖訓練班證書', fee: '680', originalFee: '760', subsidyNote: '區方資助 $80／人', deadline: `${dateOnly(40)} `, quota: '24', filled: '9', venue: '香港童軍中心', contact: '訓練組 ddc.training@demo', active: 'TRUE', createdAt: iso(20) },
    { courseId: 'cl-03', title: '急救證書課程（SFA）2027 年 1 月班', badgeName: '急救', section: '跨支部', courseNo: 'SFA-2701', sessionsText: '1 月 9、16、23、30 日（週六）晚間', eligibility: '12 歲以上', fee: '1200', deadline: `${dateOnly(90)} `, quota: '30', filled: '30', venue: '聖十字架堂禮堂', contact: '區秘書處', active: 'TRUE', createdAt: iso(10) },
  ];
}

// ───────────────────────── 帳戶 ─────────────────────────

export const DEMO_PORTAL_USERS: Record<string, any>[] = Object.values(DEMO_USERS).map(u => ({
  email: u.email, displayName: u.displayName, role: u.role, scopes: '', cards: '', active: 'TRUE',
  level: u.level, levelLabel: u.levelLabel, mustChangePassword: false,
})).concat([
  { email: 'demo-dc@demo', displayName: '陳大文（區總監）', role: 'DC', scopes: '', cards: '', active: 'TRUE', level: 1, levelLabel: '區總監', mustChangePassword: false },
  { email: 'demo-ddc@demo', displayName: '李小明（副區總監·行政）', role: 'DDC_ADMIN', scopes: '', cards: '', active: 'TRUE', level: 2, levelLabel: '副區總監', mustChangePassword: false },
  { email: 'demo-gsl-206@demo', displayName: '張國強（206團長）', role: 'AL', scopes: 'visit,activity,contacts', cards: '', active: 'TRUE', level: 5, levelLabel: '區長／領袖', mustChangePassword: true },
  { email: 'demo-gsl-17@demo', displayName: '林志傑（17團長）', role: 'AL', scopes: 'visit,activity,contacts', cards: '', active: 'TRUE', level: 5, levelLabel: '區長／領袖', mustChangePassword: true },
]);

// ───────────────────────── 外部資料（orgchart / contacts / budget） ─────────────────────────

export const DEMO_ORG_GROUPS: Record<string, any>[] = [
  {
    id: 'reg-head', title: '地域領導層', members: [
      { post: '港島地域總監', name: '（示範）劉志遠' },
      { post: '副地域總監（行政）', name: '（示範）何守信' },
      { post: '助理地域總監（青少年活動）', name: '（示範）吳美琪' },
    ],
  },
  {
    id: 'reg-dc', title: '區總監', members: [
      { post: '區總監', scope: '灣仔區', name: '（示範）鄭錦棠' },
      { post: '區總監', scope: '東區', name: '（示範）霍偉良' },
      { post: '區總監', scope: '筲箕灣區', name: '（示範）陳大文' },
      { post: '區總監', scope: '柴灣區', name: '（示範）馬俊文' },
      { post: '區總監', scope: '香港島南區', name: '（示範）葉笑蘭' },
      { post: '區總監', scope: '離島區', name: '（示範）區偉業' },
      { post: '區總監', scope: '太平山區', name: '（示範）方國安' },
    ],
  },
  {
    id: 'reg-staff', title: '地域職員', members: [
      { post: '地域秘書', name: '（示範）馮詠珊' },
      { post: '地域司庫', name: '（示範）關志忠' },
      { post: '地域訓練專員', name: '（示範）梁慧莊' },
    ],
  },
];

export const DEMO_STAFF_ROWS: Record<string, any>[] = [
  { post: '地域秘書', name: '（示範）馮詠珊', tel: '2882 7001' },
  { post: '地域司庫', name: '（示範）關志忠', tel: '2882 7002' },
  { post: '地域訓練專員', name: '（示範）梁慧莊', tel: '2882 7003' },
  { post: '地域青少年活動專員', name: '（示範）吳美琪', tel: '2882 7004' },
  { post: '地域總部經理', name: '（示範）譚國雄', tel: '2882 7005' },
];

export const DEMO_HKSA_COUNCIL: Record<string, any>[] = [
  { post: '香港總監', name: '（示範）黎偉生' },
  { post: '副香港總監（計劃及發展）', name: '（示範）伍兆鏗' },
  { post: '副香港總監（支援）', name: '（示範）施德萬' },
];

export const DEMO_HKSA_DEPTS: Record<string, any>[] = [
  { id: 1, name: '行政署', address: '香港灣仔軒尼詩道一號（示範）', tel: '2377 3300', fax: '', email: 'admin@demo', hours: '星期一至五 09:00–17:30', ok: true },
  { id: 2, name: '青少年活動署', address: '香港灣仔軒尼詩道一號（示範）', tel: '2377 3311', fax: '', email: 'programme@demo', hours: '星期一至五 09:00–17:30', ok: true },
];

export function demoBudget(): { rows: Record<string, any>[]; summary: Record<string, any>[] } {
  const y = new Date().getFullYear();
  const m = (mm: number) => `${y}-${String(mm).padStart(2, '0')}`;
  const rows = [
    { month: m(1), section: '童軍', activity: '新春大會操', fee: '$80', headcount: 320, subsidy: 8000, ccSubmission: 'Y', typeCode: 'A', sectionCode: 'S', status: 'completed', notes: '示範資料', links: [] },
    { month: m(2), section: '幼童軍', activity: '幼童軍同樂日', fee: '$60', headcount: 150, subsidy: 4500, ccSubmission: 'Y', typeCode: 'A', sectionCode: 'C', status: 'completed', notes: '', links: [] },
    { month: m(3), section: '小童軍', activity: '小童軍家庭日', fee: '$100', headcount: 120, subsidy: 6000, ccSubmission: '', typeCode: 'A', sectionCode: 'G', status: 'completed', notes: '', links: [] },
    { month: m(4), section: '深資童軍', activity: '野外定向練習', fee: '$150', headcount: 40, subsidy: 2000, ccSubmission: 'M', typeCode: 'M', sectionCode: 'V', status: 'in progress', notes: '', links: [] },
    { month: m(5), section: '樂行童軍', activity: '區慶祝活動服務', fee: '', headcount: 30, subsidy: 1500, ccSubmission: '', typeCode: 'S', sectionCode: 'R', status: 'in progress', notes: '', links: [] },
    { month: m(11), section: '跨支部', activity: '區周年大會暨嘉許禮', fee: '', headcount: 500, subsidy: 20000, ccSubmission: '', typeCode: 'T', sectionCode: 'A', status: '', notes: '待批', links: [] },
  ];
  const summary = [
    { label: '全年資助總額（示範）', amount: 42000 },
    { label: '已批核', amount: 18500 },
    { label: '處理中', amount: 3500 },
  ];
  return { rows, summary };
}

/** 房間日曆示範事件：以「今日」為基準生成，保證今日／本月有嘢睇 */
export function demoRoomEvents(roomIds: string[], fromMs: number, days: number): Record<string, Record<string, any>[]> {
  const map: Record<string, Record<string, any>[]> = {};
  const day0 = new Date(fromMs); day0.setHours(0, 0, 0, 0);
  const H = 3600000;
  roomIds.forEach((rid, ri) => {
    const evs: Record<string, any>[] = [];
    // 今日一個上午活動 + 後日會議＋本月一個全日活動（確定示範有嘢睇）
    const t9 = day0.getTime() + (9 + (ri % 3)) * H;
    evs.push({ uid: `dm-${rid}-t1`, summary: `（示範）${['旅團領袖會議', '訓練班', '委員會會議', '活動籌備'][ri % 4]}`, start: t9, end: t9 + 3 * H, allDay: false, location: `${rid} 室`, description: '模擬示範版資料' });
    const t2 = day0.getTime() + (2 + (ri % 5)) * 86400000 + 14 * H;
    evs.push({ uid: `dm-${rid}-t2`, summary: `（示範）${['支部會議', '獎勵委員會', '急救班', '親子活動'][ri % 4]}`, start: t2, end: t2 + 2 * H, allDay: false, location: `${rid} 室`, description: '' });
    const t3 = day0.getTime() + (8 + (ri % 10)) * 86400000;
    evs.push({ uid: `dm-${rid}-t3`, summary: '（示範）全日活動 — 區慶祝活動綵排', start: t3, end: t3 + 86400000 - 1, allDay: true, location: `${rid} 室`, description: '' });
    map[rid] = evs;
  });
  return map;
}

// ───────────────────────── 完整示範資料庫 ─────────────────────────

export interface DemoDb {
  config: Record<string, any>;
  system: { locked: boolean; lockMessage: string };
  cards: Record<string, any>[];
  roles: Record<string, any>[];
  matrix: Record<string, Record<string, 'edit' | 'view' | ''>>;
  categoryEnabled: Record<string, boolean>;
  users: Record<string, any>[];
  announcements: Record<string, any>[];
  awardTypes: Record<string, any>[];
  awardMembers: Record<string, any>[];
  deadlineCfg: { habDistrict: string; habHq: string };
  units: Record<string, any>[];
  visits: Record<string, any>[];
  contactNames: Record<string, string>;
  venues: Record<string, any>[];
  venueBookings: Record<string, any>[];
  stockItems: Record<string, any>[];
  stockRequests: Record<string, any>[];
  activityNotices: Record<string, any>[];
  incidentReports: Record<string, any>[];
  courseLinks: Record<string, any>[];
  installedPlugins: string[];
  seq: number;
}

export function freshDemoDb(): DemoDb {
  return {
    config: {
      districtName: '筲箕灣區（示範）',
      theme: '',
      logoText: '🎭 示範',
      fpsAccountName: '筲箕灣區童軍會（示範戶口）',
      fpsAccountNumber: '123456-789（示範）',
      budgetSheetUrl: '',
    },
    system: { locked: false, lockMessage: '' },
    cards: JSON.parse(JSON.stringify(DEMO_CARDS)),
    roles: JSON.parse(JSON.stringify(DEMO_ROLES)),
    matrix: demoDefaultMatrix(),
    categoryEnabled: {},
    users: JSON.parse(JSON.stringify(DEMO_PORTAL_USERS)),
    announcements: demoAnnouncements(),
    awardTypes: JSON.parse(JSON.stringify(DEMO_AWARD_TYPES)),
    awardMembers: JSON.parse(JSON.stringify(DEMO_AWARD_MEMBERS)),
    deadlineCfg: { habDistrict: '01-15', habHq: '02-03' },
    units: JSON.parse(JSON.stringify(DEMO_UNITS)),
    visits: [
      { id: 'vs-01', districtCode: 'DEMO', troop: '206', section: 'gh', visitDate: dateOnly(30), year: new Date().getFullYear(), kind: 'section', visitorName: '黃志強', visitorEmail: 'demo-adc@demo', note: '集會人數 22', followUp: '', createdAt: iso(30) },
      { id: 'vs-02', districtCode: 'DEMO', troop: '82', section: 'gh', visitDate: dateOnly(20), year: new Date().getFullYear(), kind: 'section', visitorName: '黃志強', visitorEmail: 'demo-adc@demo', note: '', followUp: '', createdAt: iso(20) },
      { id: 'vs-03', districtCode: 'DEMO', troop: '17', section: 'scout', visitDate: dateOnly(12), year: new Date().getFullYear(), kind: 'inspection', visitorName: '陳大文', visitorEmail: 'demo-dc@demo', note: '周年檢閱籌備', followUp: '', createdAt: iso(12) },
      { id: 'vs-04', districtCode: 'DEMO', troop: '242', section: 'cub', visitDate: dateOnly(5), year: new Date().getFullYear(), kind: 'section', visitorName: '黃志強', visitorEmail: 'demo-adc@demo', note: '需要協助招募領袖', followUp: '跟進招募', createdAt: iso(5) },
    ],
    contactNames: { '地域秘書|2882 7001|0': '（示範）馮詠珊' },
    venues: JSON.parse(JSON.stringify(DEMO_VENUES)),
    venueBookings: demoVenueBookings(),
    stockItems: JSON.parse(JSON.stringify(DEMO_STOCK_ITEMS)),
    stockRequests: demoStockRequests(),
    activityNotices: demoActivityNotices(),
    incidentReports: demoIncidentReports(),
    courseLinks: demoCourseLinks(),
    installedPlugins: [],
    seq: 1000,
  };
}
