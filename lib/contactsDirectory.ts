/**
 * 聯結簿 — 港島地域 / 總會 聯絡資料（v4.4.0）
 * ─────────────────────────────────────────────────────────────────────
 * 來源（2026-09 查閱）：
 *   港島地域：https://www.hkirscout.org.hk/tc/about_us/organization/prof/index.html（專業領袖及受薪職員，2026-07-16 更新）
 *             https://www.hkirscout.org.hk/tc/about_us/organization/commissioner/index.html（總監架構，2026-08-13 更新）
 *             https://www.hkirscout.org.hk/tc/facilities/hkir_hq/index.html（地域辦事處）
 *   總會各署：https://www.scout.org.hk/tc/scout-units/association-headquarters/index.html（各署頁）
 * 地域職員及總監只公開一般電郵，個人電郵未有公佈；如區方掌握可於 Config 或日後 Sheet 補充。
 */

export interface ContactRow {
  post: string;      // 職位
  name?: string;     // 姓名（可空）
  tel?: string;      // 直線電話
  fax?: string;
  email?: string;
  note?: string;
}
export interface ContactGroup {
  id: string;
  title: string;
  icon: string;
  intro?: string;
  rows: ContactRow[];
}

export const REGION_OFFICE = {
  name: '香港童軍總會 港島地域（Hong Kong Island Region）',
  address: '香港灣仔日善街23號香港童軍百周年紀念大樓19樓',
  tel: '2574 4296',
  fax: '2835 7777',
  email: 'hkir@scout.org.hk',
  web: 'https://www.hkirscout.org.hk',
  hours: '星期一、二、四、五 09:00–18:00；星期三 09:00–20:00；星期六 09:00–17:00（午膳 13:00–14:00）；星期日及公眾假期休息',
  updated: '2026-08',
};

export const REGION_GROUPS: ContactGroup[] = [
  {
    id: 'staff', title: '專業領袖及受薪職員（地域辦事處）', icon: '🏢',
    intro: '直線電話 2835 77xx；電郵一律用地域總機 hkir@scout.org.hk（網站未公佈個人電郵）。',
    rows: [
      { post: '執行幹事', name: '譚健祥 Figo', tel: '2835 7711', email: 'hkir@scout.org.hk' },
      { post: '助理執行幹事', name: '何家耀 Oscar', tel: '2835 7712', email: 'hkir@scout.org.hk' },
      { post: '活動幹事', name: '陸詠德 Fiona', tel: '2835 7713', email: 'hkir@scout.org.hk' },
      { post: '發展幹事', name: '鄧倩姸 Cindy', tel: '2835 7714', email: 'hkir@scout.org.hk' },
      { post: '訓練幹事', name: '曾凱瑩 Sandy', tel: '2835 7715', email: 'hkir@scout.org.hk' },
      { post: '助理文員', name: '施芳怡 Katy', tel: '2835 7716', email: 'hkir@scout.org.hk' },
      { post: '二級文員', name: '古玉月 Wallis', tel: '2835 7717', email: 'hkir@scout.org.hk' },
      { post: '助理文員（區務文書支援組）', name: '（待定）', tel: '2835 7718', email: 'dcst@scout.org.hk', note: '區務文書支援組總機 2957 6390' },
      { post: '助理文員', name: '王美怡 Mimi', tel: '2835 7719', email: 'hkir@scout.org.hk' },
      { post: '二級工人', name: '張煒菁 Eva／胡廣雄', tel: '2835 7723' },
    ],
  },
  {
    id: 'rc', title: '地域總監及副／助理地域總監', icon: '🎖',
    intro: '義務總監；聯絡請經地域辦事處 2574 4296 / hkir@scout.org.hk 轉介。',
    rows: [
      { post: '地域總監', name: '楊國光博士' },
      { post: '副地域總監（行政）', name: '鍾震宇' },
      { post: '副地域總監（常務）', name: '伍尚國' },
      { post: '副地域總監（活動與訓練）', name: '黃偉安' },
      { post: '助理地域總監（行政）', name: '張瑞怡' },
      { post: '助理地域總監（公共關係）', name: '曾麗珊博士' },
      { post: '助理地域總監（國際及內地事務）', name: '羅永林' },
      { post: '助理地域總監（大潭童軍中心）', name: '張進益' },
      { post: '助理地域總監（專責）', name: '朱家聰' },
      { post: '助理地域總監（區務）', name: '歐陽秀菁' },
      { post: '助理地域總監（發展）', name: '羅永杰' },
      { post: '助理地域總監（支部）', name: '關浩然' },
      { post: '助理地域總監（活動）', name: '何家騏' },
      { post: '助理地域總監（訓練）', name: '何家騏（署理兼任）' },
    ],
  },
  {
    id: 'dc', title: '港島地域各區區總監', icon: '🧭',
    rows: [
      { post: '柴灣區', name: '林志明', tel: '9106 7134' },
      { post: '港島北區', name: '陳世青' },
      { post: '港島南區', name: '謝宏駿', tel: '9232 1875' },
      { post: '港島西區', name: '林仲岷' },
      { post: '筲箕灣區', name: '袁可秀', note: '區總部：愛東邨愛旭樓地下22號（二 16:00–19:00／四 18:30–21:30／六 10:30–13:30）' },
      { post: '維多利亞城區', name: '李家文' },
      { post: '灣仔區', name: '楊國榮博士', tel: '2574 9311', note: '區總部另有 6233 4556；傳真 3011 5215' },
    ],
  },
  {
    id: 'hq', title: '地域總部總監（按職能）', icon: '📌',
    rows: [
      { post: '資訊科技', name: '梁家榮' },
      { post: '設備管理', name: '黃嘉恩' },
      { post: '公共關係', name: '張嘉政、黃培芳' },
      { post: '國際及內地事務', name: '郭沛民' },
      { post: '大潭童軍中心', name: '李健、黎蕊萍' },
      { post: '專責', name: '李曉筠' },
      { post: '發展', name: '李國文' },
      { post: '社區參與及服務', name: '李卓琪' },
      { post: '小童軍', name: '梁佩珊' },
      { post: '幼童軍', name: '黃志升' },
      { post: '童軍', name: '蔡振輝' },
      { post: '深資童軍', name: '黎栢輝' },
      { post: '樂行童軍', name: '鄧皓駿' },
      { post: '海童軍', name: '楊樹豪' },
      { post: '空童軍', name: '崔文豪' },
      { post: '海上活動', name: '鄭鴻基' },
      { post: '航空活動', name: '李穎羲' },
      { post: '活動', name: '周恒晉' },
      { post: '屬會', name: '鍾偉志' },
      { post: '樂隊', name: '陳志良' },
      { post: '領袖訓練', name: '黃曉峰' },
      { post: '訓練支援', name: '鍾兆生（署理）' },
      { post: '訓練行政', name: '黃凱威（署理兼任）' },
    ],
  },
  {
    id: 'ahq', title: '助理地域總部總監（按職能）', icon: '📎',
    rows: [
      { post: '行政', name: '陳沛欣' },
      { post: '公共關係', name: '朱浩銘、張敬浩' },
      { post: '國際及內地事務', name: '黃秀雯' },
      { post: '大潭童軍中心', name: '何倩羚、陳志雄' },
      { post: '產業', name: '馮卓賢' },
      { post: '區務', name: '蕭凱傑' },
      { post: '發展', name: '黎仲豪' },
      { post: '社區參與及服務', name: '黎姵伶' },
      { post: '小童軍', name: '張惠敏' },
      { post: '童軍', name: '張家倫' },
      { post: '深資童軍', name: '聶嘉威（署理）' },
      { post: '樂行童軍', name: '曾紫蕙' },
      { post: '海童軍', name: '葉子良' },
      { post: '空童軍', name: '何芷晴' },
      { post: '海上活動', name: '曾璟珩' },
      { post: '航空活動', name: '陳紀君' },
      { post: '屬會', name: '李潤泰' },
      { post: '樂隊', name: '溫文輝' },
      { post: '領袖訓練', name: '彭沛雄' },
      { post: '訓練行政', name: '黃凱威' },
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
