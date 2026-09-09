/**
 * 聯絡簿 — 港島地域 / 總會 聯絡資料（v4.5.0；v4.9.0 改名＋姓名區方可編輯）
 * ─────────────────────────────────────────────────────────────────────
 * v4.5.0 起：港島地域分頁只放「職員直線電話」（搵人解決問題用），總監架構搬去 /orgchart。
 * v4.9.0：電話唔變但人會轉 — 地域職員姓名可以由區方自行改（存後台 ContactNames 表，全區同步）。
 * 職員表及總會各署電話會由 /api/external 即時讀官方網頁；呢份係讀唔到時嘅備援（會標明）。
 * 來源（2026-09 查閱）：
 *   港島地域：https://www.hkirscout.org.hk/tc/about_us/organization/prof/index.html（專業領袖及受薪職員，2026-07-16 更新）
 *             https://www.hkirscout.org.hk/tc/facilities/hkir_hq/index.html（地域辦事處）
 *   總會各署：https://www.scout.org.hk/tc/scout-units/association-headquarters/index.html（各署頁）
 * 地域職員只公開一般電郵，個人電郵未有公佈；如區方掌握可於 Config 或日後 Sheet 補充。
 */

export interface ContactRow {
  post: string;      // 職位
  name?: string;     // 姓名（可空）
  tel?: string;      // 直線電話
  fax?: string;
  email?: string;
  note?: string;
  // v4.9.0 姓名自訂（套用 applyContactNames 之後先有）
  nameKey?: string;    // 存後台用嘅 key：「職位|電話|第幾個」
  nameCustom?: boolean; // TRUE = 而家顯示緊區方自訂名
}
export interface ContactGroup {
  id: string;
  title: string;
  icon: string;
  intro?: string;
  rows: ContactRow[];
}

/** 姓名自訂 key：同一個「職位+電話」出現幾多次就第幾個（重複職位都用唔同 key） */
export function contactNameKey(post: string, tel: string | undefined, occurrence: number): string {
  return `${post}|${tel || ''}|${occurrence}`;
}

/**
 * 將區方自訂姓名蓋上同步／備援名單（電話唔變、人會轉 — 蓋完電話仍然跟官方同步）。
 * 每行都會攞返自己嘅 nameKey（冇自訂都有，方便直接儲存）。
 */
export function applyContactNames<T extends ContactRow>(rows: T[], names: Record<string, string>): (T & { nameKey: string; nameCustom: boolean })[] {
  const seen: Record<string, number> = {};
  return rows.map((r) => {
    const base = `${r.post}|${r.tel || ''}`;
    const n = seen[base] || 0;
    seen[base] = n + 1;
    const key = contactNameKey(r.post, r.tel, n);
    const override = names[key];
    if (override) return { ...r, name: override, nameKey: key, nameCustom: true };
    return { ...r, nameKey: key, nameCustom: false };
  });
}

export const REGION_OFFICE = {
  name: '香港童軍總會 港島地域（Hong Kong Island Region）',
  address: '香港灣仔日善街23號香港童軍百周年紀念大樓19樓',
  tel: '2574 4296',
  fax: '2835 7777',
  email: 'hkir@scout.org.hk',
  web: 'https://www.hkirscout.org.hk',
  hours: '星期一、二、四、五 09:00–18:00；星期三 09:00–20:00；星期六 09:00–17:00（午膳 13:00–14:00）；星期日及公眾假期休息',
  updated: '2026-07-16',
};

/** 職員表由官方網頁即時同步時，各職位對應嘅電郵（網頁只有電話）；預設 hkir@scout.org.hk */
export function staffEmailFor(post: string): string {
  return /區務文書|DCST/i.test(post) ? 'dcst@scout.org.hk' : /工人/.test(post) ? '' : 'hkir@scout.org.hk';
}

export const REGION_GROUPS: ContactGroup[] = [
  {
    id: 'staff', title: '專業領袖及受薪職員（地域辦事處）', icon: '🏢',
    intro: '直線電話 2835 77xx；電郵一律用地域總機 hkir@scout.org.hk（網站未公佈個人電郵）。',
    rows: [
      { post: '執行幹事', name: '譚健祥先生（Figo）', tel: '2835 7711', email: 'hkir@scout.org.hk' },
      { post: '助理執行幹事', name: '何家耀先生（Oscar）', tel: '2835 7712', email: 'hkir@scout.org.hk' },
      { post: '活動幹事', name: '陸詠德女士（Fiona）', tel: '2835 7713', email: 'hkir@scout.org.hk' },
      { post: '發展幹事', name: '鄧倩姸女士（Cindy）', tel: '2835 7714', email: 'hkir@scout.org.hk' },
      { post: '訓練幹事', name: '曾凱瑩女士（Sandy）', tel: '2835 7715', email: 'hkir@scout.org.hk' },
      { post: '二級文員', name: '古玉月女士（Wallis）', tel: '2835 7717', email: 'hkir@scout.org.hk' },
      { post: '助理文員', name: '王美怡女士（Mimi）', tel: '2835 7719', email: 'hkir@scout.org.hk' },
      { post: '助理文員', name: '施芳怡女士（Katy）', tel: '2835 7716', email: 'hkir@scout.org.hk' },
      { post: '助理文員（區務文書支援組 DCST）', name: '待定', tel: '2835 7718', email: 'dcst@scout.org.hk', note: '區務文書支援組總機 2957 6390' },
      { post: '二級工人', name: '張煒菁女士（Eva）', tel: '2835 7723' },
      { post: '二級工人', name: '胡廣雄先生', tel: '2835 7723' },
    ],
  },
];

export const HQ_OFFICE = {
  name: '香港童軍總會 總部（Scout Association of Hong Kong）',
  address: '九龍尖沙咀柯士甸道童軍徑香港童軍中心（Hong Kong Scout Centre）',
  tel: '2377 3300',
  fax: '2302 1001',
  web: 'https://www.scout.org.hk',
  updated: '2026-09',
};

export const HQ_GROUPS: ContactGroup[] = [
  {
    id: 'depts', title: '總會各署', icon: '🏛',
    intro: '電郵一律 @scout.org.hk；辦公時間一般為星期一至五 09:30–18:30（各署或有不同）。',
    rows: [
      { post: '行政署', tel: '2957 6333', fax: '2302 1001', email: 'administration@scout.org.hk', note: '10 樓 1012 室 · 意外通報／嚴重傷亡 3 個工作天內通知' },
      { post: '青少年活動署', tel: '2957 6411 / 2957 6417', fax: '3011 3183', email: 'prog@scout.org.hk', note: '9 樓 907 室' },
      { post: '訓練署', tel: '2957 6477', email: 'trg@scout.org.hk', note: '9 樓 908 室' },
      { post: '發展署', tel: '2957 6377', fax: '3010 8502', email: 'dev@scout.org.hk', note: '10 樓 1020 室' },
      { post: '傳訊及公共事務署', tel: '2957 6366', fax: '2302 1087', email: 'cpa@scout.org.hk', note: '10 樓 1027 室 · 傳媒查詢一律轉介' },
      { post: '國際署', tel: '2957 6400', email: 'il@scout.org.hk', note: '10 樓 1017 室' },
      { post: '內地事務署', tel: '2957 6400', email: 'il@scout.org.hk', note: '10 樓 1017 室' },
      { post: '產業署（場地借用）', tel: '2957 6388', email: 'estate@scout.org.hk', note: '童軍中心 9–11 樓場地；百周年紀念大樓場地 2957 6384；網上申請 booking.scout.org.hk' },
      { post: '財務署', tel: '2957 6422', fax: '2302 1001', email: 'finance@scout.org.hk', note: '10 樓 1015 室' },
      { post: '資訊科技署', tel: '2957 6433', email: 'it@scout.org.hk', note: '10 樓 1002 室' },
      { post: '領袖資源署', tel: '2835 7736', fax: '3974 1092', email: 'lti@scout.org.hk', note: '灣仔百周年紀念大樓 10 樓 1008 室 · 領袖招募／急救訓練' },
    ],
  },
  {
    id: 'units', title: '其他總部單位', icon: '📍',
    rows: [
      { post: '領袖訓練學院', tel: '2835 7738', email: 'lti@scout.org.hk' },
      { post: '王兆生領袖訓練中心', tel: '2791 7678', fax: '2791 7719', email: 'lti@scout.org.hk', note: '西貢白沙灣沙咀 DD211' },
      { post: '區務文書支援組', tel: '2957 6390', email: 'dcst@scout.org.hk' },
      { post: '童軍物品供應社', tel: '2957 6444', email: 'scoutshop@scout.org.hk' },
      { post: '貝登堡聯誼會', tel: '2957 6322', email: 'bpcco@scout.org.hk' },
      { post: '總監俱樂部', tel: '2957 6455' },
    ],
  },
  {
    id: 'regions', title: '五個地域辦事處', icon: '🗺',
    rows: [
      { post: '港島地域', tel: '2574 4296 / 2835 7712', fax: '2835 7777', email: 'hkir@scout.org.hk' },
      { post: '九龍地域', tel: '2957 6488', email: 'kr@scout.org.hk' },
      { post: '東九龍地域', tel: '2957 6466', email: 'ekr@scout.org.hk' },
      { post: '新界地域', tel: '2425 5999', email: 'ntrto@scout.org.hk' },
      { post: '新界東地域', tel: '2667 9100', email: 'nter@scout.org.hk' },
    ],
  },
  {
    id: 'emergency', title: '緊急／通報用', icon: '🚨',
    rows: [
      { post: '緊急服務（警察／救護／消防）', tel: '999' },
      { post: '總會公共關係執行幹事（傳媒事宜）', tel: '2957 6361', note: '24 小時 9537 7635' },
      { post: '天文台天氣查詢', tel: '1878 200', note: '或 18503 自動語音' },
      { post: '環保署 AQHI 熱線', tel: '2827 8541', note: 'aqhi.gov.hk' },
    ],
  },
];

/** 旅團分頁：暫時只提供結構；資料由區方稍後提供（可放 Config TROOP_LIST 或另建 Sheet） */
export interface TroopRow {
  troop: string;        // 旅號，例如「港島第 123 旅」
  sponsor?: string;     // 主辦機構
  sections?: string;    // 支部（小／幼／童／深／樂）
  leader?: string;      // 旅長／團長
  phone?: string;
  email?: string;
  meet?: string;        // 集會時間地點
}
export const TROOP_ROWS: TroopRow[] = [];
