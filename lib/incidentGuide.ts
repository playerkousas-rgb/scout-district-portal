/**
 * 意外／應變 — 參考資料（全部取自香港童軍總會官方通告，來源連結見 OFFICIAL_DOCS）
 * ──────────────────────────────────────────────────────────────────────────
 * 重要：本檔只係方便領袖喺現場快速查閱嘅摘要；正式規定以總會最新通告為準。
 * 各區升級時如總會更新通告，只需更新此檔。
 */

export type Step = { t: string; d?: string; hot?: boolean };
export type Scenario = {
  id: string;
  icon: string;
  title: string;
  summary: string;
  source: string;               // 對應通告
  steps: Step[];
  reportItems?: string[];       // 電話通報要講嘅資料
  deadlines?: string[];
};

/** 電話通報總監時必講嘅資料（活動指引通告 02/2021 意外通報指引） */
export const PHONE_REPORT_ITEMS = [
  '所屬童軍單位（旅團／區／地域）',
  '活動地點及性質',
  '傷者姓名、年齡、性別',
  '傷者情況（傷勢、清醒程度）及送往醫院名稱',
  '意外經過（簡述時間、原因）',
  '有否通知傷者家人／監護人',
  '領袖姓名及現場聯絡電話',
];

export const HOTLINES = [
  { name: '緊急救援（警察／救護／消防）', tel: '999', note: '山野無網絡時可試 112' },
  { name: '天文台天氣查詢（打電話問天氣）', tel: '1878 200', note: '或 18503 自動語音' },
  { name: '環保署空氣質素健康指數（AQHI）', tel: '2827 8541', note: 'aqhi.gov.hk' },
  { name: '總會公共關係執行幹事（傳媒查詢，經總監）', tel: '2957 6361', note: '手提 9537 7635' },
  { name: '總會總幹事辦公室（保護童軍成員免受傷害政策查詢）', tel: '2957 6327', note: '政策通告 06/2025' },
  { name: '保險公司 24 小時熱線（團體人身意外，Allied World）', tel: '2968 3221', note: 'hk_claims@awac.com · 保單 BDCPG25000081' },
];

export const SCENARIOS: Scenario[] = [
  {
    id: 'injury',
    icon: '🩹',
    title: '有人受傷／送院',
    summary: '先處理傷者，再即時電話通報總監，7 個工作天內交意外報告。',
    source: '活動指引通告 02/2021 意外通報指引；行政通告 07/2025 保險',
    steps: [
      { t: '確保現場安全，急救、安撫傷者；情況嚴重即召 999 救護車', hot: true },
      { t: '安排一位領袖陪同傷者往醫院／診所（記低陪同者姓名、電話、單位、職位）' },
      { t: '傷者未滿 18 歲：即時通知家長／監護人', hot: true },
      { t: '妥善處理傷者後，活動負責領袖即時致電所屬單位負責總監（區總監／助理香港總監）', d: '請把總監電話存入手機，出發前確認可致電。', hot: true },
      { t: '記低：救護車召喚時間、到達時間、送抵醫院名稱、警署及報案編號（如有）' },
      { t: '目擊者：記低姓名、電話、性別、地址、單位、職位' },
      { t: '不可承認責任、不可代第三者填寫索償、不可向傷者／外界發放報告副本', d: '保險條款：未獲總會及保險公司同意前不得發放，以免影響索償權益。' },
      { t: '回到本頁「意外報告」分頁填寫並提交，列印正本連活動通告經單位主管轉交總會行政署' },
    ],
    reportItems: PHONE_REPORT_ITEMS,
    deadlines: [
      '嚴重傷亡：3 個工作天內通知總會行政署',
      '一般意外：事發後 7 個工作天內將意外報告正本（夾附活動通告）經所屬童軍單位主管轉交總會行政署',
      '團體人身意外保險索償：受傷成員經地域／單位於 7 個工作天內通知行政署；醫療費索償 2 年內有效',
    ],
  },
  {
    id: 'serious',
    icon: '🚨',
    title: '嚴重傷亡／死亡／集體事故',
    summary: '救人第一 → 999 → 即時電話總監 → 保留現場 → 不接受傳媒查詢。',
    source: '活動指引通告 02/2021；政策通告 05/2021（傳媒）',
    steps: [
      { t: '即召 999；分工：一人指揮、一人急救、一人照顧其他參加者、一人聯絡', hot: true },
      { t: '點齊人數，把其他參加者帶離危險範圍，安排安全地點等候' },
      { t: '即時致電所屬單位負責總監；總監會決定是否通知公共關係執行幹事（2957 6361／9537 7635）', hot: true },
      { t: '通知傷者家長／監護人；如需要，由總會統一安排家屬支援' },
      { t: '保留現場及涉事器材（例如繩結、爐具），不要清理；拍照記錄' },
      { t: '所有領袖及參加者不得向傳媒發言、不要在社交媒體發佈；傳媒查詢一律交總會公共關係處理', hot: true },
      { t: '記錄時序：每個時間點做過咩（「意外報告」第二頁「意外詳情」直接用到）' },
      { t: '3 個工作天內通知總會行政署；7 個工作天內交意外報告正本' },
    ],
    reportItems: PHONE_REPORT_ITEMS,
    deadlines: ['3 個工作天內通知總會行政署（嚴重傷亡）', '7 個工作天內交意外報告正本'],
  },
  {
    id: 'weather',
    icon: '🌧️',
    title: '惡劣天氣：暴雨／熱帶氣旋／雷暴',
    summary: '活動開始前 3 小時起計；按表決定戶內／戶外／海上活動照常、暫避或取消。',
    source: '活動指引通告 04/2018 惡劣天氣及空氣污染下舉行活動指引（表一：青少年活動）',
    steps: [
      { t: '出發前 3 小時及活動期間持續留意天文台警告（1878 200／HKO App）' },
      { t: '對照下方「天氣警告對照表」決定：如常／戶內暫避／延期或取消', hot: true },
      { t: '取消而未能通知所有參加者：領袖仍須到集合地點，安排已到者安全返家', hot: true },
      { t: '黑雨／8 號或以上：所有活動取消；已在途中或現場者留在安全地方，直至警告解除才離開' },
      { t: '雷暴：立即離開開闊地、山頂、水邊、高大孤立樹木及金屬物；到建築物或車廂內暫避' },
      { t: '山泥傾瀉警告：戶外活動密切留意，遠離斜坡、河道，必要時暫避或離開' },
      { t: '露營：熱帶氣旋或雷暴警告生效期間不可紮營；紅色火災危險警告下食乾糧、煲滾水、通知附近警署' },
      { t: '只有成人參加嘅活動可由負責人酌情處理，但仍須以安全為首要' },
    ],
  },
  {
    id: 'heat',
    icon: '🌡️',
    title: '酷熱／寒冷／空氣污染',
    summary: '酷熱補水避曬、寒冷保暖，必要時改戶內；AQHI 7 減少、8–10 盡量減少、10+ 中止。',
    source: '活動指引通告 04/2018',
    steps: [
      { t: '酷熱天氣警告：多休息、多補水、避免長時間曝曬；必要時改為戶內或縮短體力活動', hot: true },
      { t: '留意中暑徵狀（頭暈、頭痛、噁心、皮膚乾熱、神志不清）：移到陰涼處、降溫、補水，嚴重即 999' },
      { t: '寒冷／霜凍警告：多穿保暖衣物、避免長時間逗留戶外；必要時改為戶內' },
      { t: 'AQHI 7（甚高）：減少戶外體力消耗，勸喻心臟病／呼吸系統病患者勿參加' },
      { t: 'AQHI 8–10（甚高）：盡量減少戶外體力消耗及逗留時間' },
      { t: 'AQHI 10+（嚴重）：中止／取消戶外活動', hot: true },
    ],
  },
  {
    id: 'hike',
    icon: '🥾',
    title: '遠足：迷路／失蹤／需要求援',
    summary: '停下、點齊人、求援訊號 6 短響／分鐘；最少 2 人帶書面訊息落山求援。',
    source: '活動指引通告 05/2018 戶外活動安全要則',
    steps: [
      { t: '全隊停下，點齊人數，留在原地安全位置；切勿分散', hot: true },
      { t: '致電 999（無網絡試 112）；報告最近標距柱／地標編號、人數、傷勢' },
      { t: '國際求救訊號：每分鐘 6 下哨聲／電筒閃光，停 1 分鐘再重複（回應為每分鐘 3 下）' },
      { t: '需派人求援：最少 2 人同行，帶備書面訊息（地點、人數、傷勢、時間、聯絡電話）' },
      { t: '有人失蹤：記低最後見到嘅時間地點、衣著；先於附近有系統搜索，同時報警' },
      { t: '通知主辦單位／留守人員（出發前已留低路線及預計時間；逾時未返即啟動求援）' },
      { t: '致電所屬單位負責總監通報' },
    ],
    reportItems: PHONE_REPORT_ITEMS,
  },
  {
    id: 'water',
    icon: '🌊',
    title: '海上／水上活動事故',
    summary: '救生衣、哨子、點人數；強烈季候風或 1 號風球以上、雷暴、紅黑雨一律取消。',
    source: '活動指引通告 07/2018 海上活動安全；青少年活動通告 19/2015 海上活動中心旗號',
    steps: [
      { t: '有人墮水：拋救生圈／繩，切勿貿然下水；即召 999 及通知活動中心／救生員', hot: true },
      { t: '即時點齊人數，所有人上岸／上艇，穿妥救生衣' },
      { t: '遵守海上活動中心旗號指示；紅旗＝停止一切水上活動' },
      { t: '天氣：強烈季候風信號、1 號或以上熱帶氣旋、雷暴、紅雨／黑雨 → 海上活動取消' },
      { t: '參加者須有有效游泳測試證明（穿衣游 50 米）、穿救生衣及包趾鞋，帶哨子及防水電話' },
      { t: '致電所屬單位負責總監通報' },
    ],
    reportItems: PHONE_REPORT_ITEMS,
  },
  {
    id: 'safeguard',
    icon: '🛡️',
    title: '懷疑虐待／欺凌／不當行為',
    summary: '先確保青少年安全，即時經旅長→區總監通報，涉刑事即報警；不自行調查。',
    source: '政策通告 06/2025 保護童軍成員免受傷害政策；政策通告 01/2021 行為守則',
    steps: [
      { t: '確保受影響青少年安全，與懷疑涉事者分開；認真聆聽、不加意見、不承諾保密', hot: true },
      { t: '涉及刑事（身體／性侵犯）即時報警 999，並保留證據，不要盤問青少年' },
      { t: '即時通知旅長；旅長以「事件報告表格」（政策通告 06/2025 附件）呈報區總監（或助理香港總監）' },
      { t: '總會總幹事為保護主任（查詢 2957 6327）；不得自行調查或對質' },
      { t: '資料保密，只限有需要知道嘅人；不得於社交媒體討論' },
    ],
  },
  {
    id: 'media',
    icon: '📰',
    title: '傳媒查詢／社交媒體',
    summary: '現場領袖一律不回應，交由總監及總會公共關係處理。',
    source: '政策通告 05/2021 傳媒查詢處理；活動指引通告 02/2021',
    steps: [
      { t: '禮貌回覆「請聯絡香港童軍總會公共關係」，不確認、不否認、不透露傷者資料', hot: true },
      { t: '提醒所有領袖、參加者及家長勿於社交媒體發佈現場相片／評論' },
      { t: '即時通知所屬單位負責總監；由總監聯絡公共關係執行幹事（2957 6361／9537 7635）' },
    ],
  },
];

/** 活動指引通告 04/2018 表一：青少年活動（由活動開始前 3 小時起至活動結束） */
export type WeatherRow = { warning: string; indoor: string; outdoor: string; sea: string };
export const WEATHER_TABLE: WeatherRow[] = [
  { warning: '黃色暴雨', indoor: '如常', outdoor: '戶內暫避／留意', sea: '延期／取消' },
  { warning: '紅色暴雨', indoor: '如常（留在安全地方）', outdoor: '延期／取消', sea: '延期／取消' },
  { warning: '黑色暴雨', indoor: '延期／取消*', outdoor: '延期／取消*', sea: '延期／取消*' },
  { warning: '強烈季候風信號', indoor: '如常', outdoor: '如常（留意，必要時暫避）', sea: '取消' },
  { warning: '1 號戒備信號', indoor: '如常', outdoor: '如常（留意，必要時暫避）', sea: '取消' },
  { warning: '3 號強風信號', indoor: '如常', outdoor: '取消', sea: '取消' },
  { warning: '8 號或以上', indoor: '取消*', outdoor: '取消*', sea: '取消*' },
  { warning: '雷暴警告', indoor: '如常', outdoor: '取消／暫避', sea: '取消' },
  { warning: '山泥傾瀉警告', indoor: '如常', outdoor: '密切留意，必要時暫避／離開', sea: '—' },
  { warning: '霜凍／寒冷天氣警告', indoor: '如常', outdoor: '保暖，必要時改戶內', sea: '保暖，必要時取消' },
  { warning: '酷熱天氣警告', indoor: '如常', outdoor: '補水避曬，必要時改戶內', sea: '補水避曬' },
  { warning: 'AQHI 7', indoor: '如常', outdoor: '減少戶外體力消耗', sea: '減少體力消耗' },
  { warning: 'AQHI 8–10', indoor: '如常', outdoor: '盡量減少', sea: '盡量減少' },
  { warning: 'AQHI 10+', indoor: '如常', outdoor: '中止／取消', sea: '中止／取消' },
];
export const WEATHER_NOTE = '* 警告生效期間已在途中或現場嘅參加者，須留在安全地方直至警告解除。活動取消但未能通知所有人時，領袖仍須到集合地點。以上為青少年活動；只有成人參加嘅活動可由負責人酌情處理。';

/** 出發前檢查（05/2018 戶外活動安全要則、P4/2014 幼童軍戶外活動、03/2021 先鋒工程） */
export const PRE_TRIP_CHECKLIST = [
  '已取得家長同意書及健康申報；已把總監、單位主管電話存入手機',
  '露營／遠足：最少 30 日前通知區總監及旅長（幼童軍）；已向附近警署備案及留低路線予留守人員',
  '領袖比例足夠（游泳 1:10；先鋒工程 1:8）；隊中最少一名持勞工處認可 30 小時急救證書者',
  '急救箱、名單（連緊急聯絡）、電話（充足電）、地圖、指南針、電筒、哨子、食水、乾糧',
  '已查天文台預報及 AQHI；已定後備戶內方案及撤離路線',
  '海上活動：救生衣、包趾鞋、有效游泳測試證明；先鋒工程：頭盔、2 米以上作業設保護繩',
  '已核對保險：總會認可活動（含直接往返途中）受團體人身意外保險保障',
];

export type DocLink = { group: string; title: string; ref: string; url: string; note?: string };
export const OFFICIAL_DOCS: DocLink[] = [
  // 表格
  { group: '表格', title: '意外報告（行政署，2019 年 7 月版）— 中文', ref: 'ACC-RPT 2019/07', url: 'https://www.scout.org.hk/article_attach/631/ACC-RPT201907c.pdf', note: '本系統「意外報告」分頁及列印格式以此為準' },
  { group: '表格', title: 'Accident Report (English)', ref: 'ACC-RPT 2019/07', url: 'https://www.scout.org.hk/article_attach/6272/ACC-RPT201907e.pdf' },
  { group: '表格', title: '急救服務申請表', ref: 'FAT/01 (2025/03)', url: 'https://www.scout.org.hk/uploads/tc/forms/12001/FAT01_FirstAidServiceForm_202503.pdf' },
  // 政策
  { group: '政策通告', title: '保護童軍成員免受傷害政策（附事件報告表格）', ref: '政策通告 06/2025', url: 'https://www.scout.org.hk/uploads/editor/department_page/pc062025c_safe-from-harm-policy_c.pdf' },
  { group: '政策通告', title: '青少年活動政策', ref: '政策通告 02/2022', url: 'https://www.scout.org.hk/uploads/editor/department_page/PCR022022C.pdf' },
  { group: '政策通告', title: '行為守則', ref: '政策通告 01/2021', url: 'https://www.scout.org.hk/uploads/tc/circulars/5815/pc012021c_%E8%A1%8C%E7%82%BA%E5%AE%88%E5%89%87.pdf' },
  // 行政
  { group: '行政通告', title: '公眾責任保險及團體人身意外保險（2025/26）', ref: '行政通告 07/2025', url: 'https://www.scout.org.hk/uploads/editor/department_page/acr072025c_%E5%85%AC%E7%9C%BE%E8%B2%AC%E4%BB%BB%E4%BF%9D%E9%9A%AA%E5%8F%8A%E5%9C%98%E9%AB%94%E4%BA%BA%E8%BA%AB%E6%84%8F%E5%A4%96%E4%BF%9D%E9%9A%AA.pdf', note: '索償程序、保額、7 個工作天通知期' },
  // 活動指引
  { group: '活動指引通告', title: '意外通報指引', ref: '活動指引通告 02/2021', url: 'https://www.scout.org.hk/uploads/editor/department_page/AG022021C.pdf', note: '電話通報流程及內容' },
  { group: '活動指引通告', title: '惡劣天氣及空氣污染下舉行活動指引', ref: '活動指引通告 04/2018', url: 'https://www.scout.org.hk/article_attach/29308/AG042018C.pdf', note: '天氣警告對照表出處' },
  { group: '活動指引通告', title: '戶外活動安全要則', ref: '活動指引通告 05/2018', url: 'https://www.scout.org.hk/article_attach/29310/AG052018C.pdf' },
  { group: '活動指引通告', title: '海上活動安全指引', ref: '活動指引通告 07/2018', url: 'https://www.scout.org.hk/article_attach/29315/AG072018C.pdf' },
  { group: '活動指引通告', title: '先鋒工程安全措施', ref: '活動指引通告 03/2021', url: 'https://www.scout.org.hk/uploads/editor/department_page/C_Safety_Precaution_in_Scout_Pioneering.pdf' },
  { group: '活動指引通告', title: '使用酒精燃料安全指引', ref: '活動指引通告 03/2018', url: 'https://www.scout.org.hk/article_attach/29307/AG032018C.pdf' },
  { group: '活動指引通告', title: '預防禽流感', ref: '活動指引通告 08/2018', url: 'https://www.scout.org.hk/uploads/editor/department_page/AG082018C.pdf' },
  { group: '活動指引通告', title: '預防流感', ref: '活動指引通告 09/2018', url: 'https://www.scout.org.hk/uploads/editor/department_page/AG092018C.pdf' },
  { group: '活動指引通告', title: '預防蚊患', ref: '活動指引通告 10/2018', url: 'https://www.scout.org.hk/article_attach/29302/AG102018C.pdf' },
  { group: '活動指引通告', title: '預防肺炎及呼吸道傳染病', ref: '活動指引通告 01/2020', url: 'https://www.scout.org.hk/article_attach/33354/AG012020C.pdf' },
  { group: '活動指引通告', title: '預防肺炎及呼吸道傳染病（二）', ref: '活動指引通告 02/2020', url: 'https://www.scout.org.hk/uploads/editor/department_page/AG022020C.pdf' },
  { group: '活動指引通告', title: '幼童軍戶外活動指引', ref: '青少年活動通告 4/2014', url: 'https://www.scout.org.hk/article_attach/21193/P004-14.pdf' },
  { group: '活動指引通告', title: '海上活動中心旗號', ref: '青少年活動通告 19/2015', url: 'https://www.scout.org.hk/article_attach/23428/P019-15.pdf' },
  { group: '總會目錄', title: '保護童軍成員免受傷害政策及活動安全指引通告（總會目錄頁，最新版以此為準）', ref: 'scout.org.hk', url: 'https://www.scout.org.hk/tc/scout-units/association-headquarters/index.html?id=12' },
];
