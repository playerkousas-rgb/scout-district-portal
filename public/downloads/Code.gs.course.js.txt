/**
 * 🎓 訓練班工作簿 Script — 標準模板（每個訓練班 1 份）
 * ================================================================
 * 流程（CL 只填一次）：
 *   1. ADC 喺區管理平台「🎓 訓練班管理」下載本模版，交畀班領導人（CL，未必係區幹部）。
 *   2. CL（或 ADC 代勞）開一張全新空白 Google Sheet → 擴充功能 → Apps Script →
 *      將本檔案整份貼上 → 儲存 → 執行 setupCourseSheet()（只限全新空白表！重跑會清空）。
 *      → 起出同區會開班文件同一格式嘅工作簿：Input01 預算 / Input02 資料 /
 *        Input03 時間表 / Input04 支出表 + 12 張 Print 輸出 + 表格回應 + 參數 + 使用說明
 *      → 產生 API Key（只顯示一次）＋ 自動建立「入數紙」Drive 資料夾。
 *   3. 部署 → 網頁應用程式（執行身分：我自己；存取：所有人）→ 攞 /exec 網址；將
 *      /exec＋API Key＋入數紙資料夾 ID 交返 ADC。
 *   4. CL 喺呢本工作簿填訓練班資料（Input01→Input02→Input03→Input04），檢查
 *      Print_通告（自動由 Input 帶入大半，只需補參加資格／費用說明／服裝／備註等），
 *      交區總監審批。
 *   5. 批核後兩邊走：① PDF（列印 Print_通告）交網頁管理員上載區網（或交總會／地域，
 *      通告圖書館自動收錄）；② ADC 喺區管理平台開班登記＋通告記錄，全部由呢度
 *      自動讀取（getCourseProfile），ADC 唔使再人手重打收費／名額／截止等。
 *   6. 報名經成員系統內置表 → 主系統轉發嚟呢度 addReg_ → 寫入「表格回應」＋入數紙
 *      存入本班 Drive 資料夾；批核後各張 Print 名單自動生成。
 *
 * 格式說明：分頁名／欄位／標籤行位跟足區會開班文件實物，方便 CL 沿用舊習慣，
 * 日後其他系統接入都認得。公式係等效寫法（原表公式睇唔到，只抄到數值版式）：
 * 看板見到 #N/A／#VALUE! 嘅位一律改用 IFERROR 收起，唔再嚇親 CL。
 * 另加兩格全黃「自動帶入」儲存格（Input02 B1/B4/B5/B6）同 ✓上通告 剔格、
 * 參數 W/X 區會常數（成員系統網址／FPS／區網），方便 CL，唔影響原有欄位。
 *
 * ⚠️ 安全：入數紙一律存入 folder（folder 層權限），唔會 setSharing ANYONE_WITH_LINK。
 */

var RESP_SHEET = '表格回應';
var PARAM_SHEET = '參數';
var IN1 = 'Input01 訓練班預算';
var IN2 = 'Input02 訓練班資料';
var IN3 = 'Input03 時間表';
var IN4 = 'Input04_Print支出表';

// ===================== 表格回應欄位（跟實物 36 欄，另加尾欄作批核及輔助） =====================
var RESP_HEADERS = [
  '時間戳記', '電郵地址', '中文姓名', '英文姓名', '聯絡電話', '性別', '出生日期',
  '所屬童軍區', '旅團', '童軍成員編號（ScoutID）', '童軍職位',
  '附加資料(有助訓練班取錄之原因)',
  '家長／監護人同意參與有關活動。', '家長/監護人姓名', '與申請人關係',
  '家長/監護人聯絡電郵', '家長/監護人聯絡電話',
  '所屬童軍旅領袖同意參與有關活動。', '領袖姓名（中文全名）', '領袖職位', '領袖聯絡電郵',
  '付款方式', '付款人姓名', '付款帳戶',
  '已繳付訓練班費用截圖', '已填妥之表格截圖(上課時需交回正本)', '是否需要收據', '備註',
  '接納', '旅號', 'Region flag', 'Troop flag', 'Seq in group', 'Sequence Ref', '學員編號', '分組',
  // 以下為批核/輔助欄位（尾欄，不影響上面公式）
  '審批狀態', '批核人', '批核時間', '_courseId', '_courseTitle', '_section', '_badgeCode', '_ref',
];

// 狀態清單（同區管理平台一致）
var STATUS = ['pending', 'approved', 'rejected', 'cancelled'];

// ===================== 區會常數（寫入參數 W/X，通告公式引用；轉區用改呢度） =====================
var DISTRICT_PORTAL_URL = 'https://member-portal-sigma-swart.vercel.app/training';
var DISTRICT_FPS_ID = '102866183';
var DISTRICT_FPS_NAME = 'SCOUT ASSOCIATION OF HONG KONG - SHAU KEI WAN DISTRICT';
var DISTRICT_WEB_URL = 'www.skwscout.org.hk';

// ===================== 參數（跟實物：A–V 共 22 欄） =====================
var PARAM_HEADERS = ['進度性獎章', 'Progressive Badge', '',
  '專科徽章組別及名稱', '專章全稱', '專科徽章', 'Proficiency Badges', '組別', 'Group', '訓練班編號',
  '舉辦單位', '區會', 'Districs', '地域', 'Regions', '職位', '關係', '接納與否', '組別', '類型', '插件', '屆別'];

// A/B：獎章（[行號, 中文, 英文]，行號跟實物）
var PARAM_AWARDS = [
  [2, '探索獎章', 'Pathfinder Award'],
  [3, '毅行獎章', 'Voyager Award'],
  [4, '挑戰獎章', 'Challenger Award'],
  [5, '總領袖獎章', "Chief Scout's Award"],
  [7, '專章組別', 'Group'],
  [8, '興趣', 'Interest'],
  [9, '技能', 'Pursuit'],
  [10, '服務', 'Service'],
  [11, '教導', 'Instructor'],
  [13, '其他獎章及徽章', 'Other Awards and Badges'],
  [14, '服務獎章', 'Service Flash'],
  [15, '領導才獎章', 'Leadership Award'],
  [17, '宗教章', 'Religious Badge'],
];

// D–J：專科徽章（[組別-名稱, 全稱, 徽章, 英文, 組別, Group, 代碼]，共 110 項，日期列 2–111）
var PARAM_BADGES = [
  ['興趣 - 釣魚', '釣魚（興趣組）專章', '釣魚', 'Angler', '興趣', 'Interest', 'SAL'],
  ['興趣 - 愛護動物', '愛護動物（興趣組）專章', '愛護動物', 'Animal Care', '興趣', 'Interest', 'SAC'],
  ['興趣 - 射箭', '射箭（興趣組）專章', '射箭', 'Archery', '興趣', 'Interest', 'SAR'],
  ['興趣 - 藝術', '藝術（興趣組）專章', '藝術', 'Artist', '興趣', 'Interest', 'SAI'],
  ['興趣 - 運動', '運動（興趣組）專章', '運動', 'Athlete', '興趣', 'Interest', 'SAT'],
  ['興趣 - 營地烹飪', '營地烹飪（興趣組）專章', '營地烹飪', 'Camp Cook', '興趣', 'Interest', 'SCK'],
  ['興趣 - 獨木舟', '獨木舟（興趣組）專章', '獨木舟', 'Canoeist', '興趣', 'Interest', 'SCN'],
  ['興趣 - 搜集', '搜集（興趣組）專章', '搜集', 'Collector', '興趣', 'Interest', 'SCT'],
  ['興趣 - 電腦', '電腦（興趣組）專章', '電腦', 'Computer', '興趣', 'Interest', 'SCO'],
  ['興趣 - 單車', '單車（興趣組）專章', '單車', 'Cyclist', '興趣', 'Interest', 'SCL'],
  ['興趣 - 龍舟', '龍舟（興趣組）專章', '龍舟', 'Dragon Boatman', '興趣', 'Interest', 'SDB'],
  ['興趣 - 步操', '步操（興趣組）專章', '步操', 'Footdrill', '興趣', 'Interest', 'SFD'],
  ['興趣 - 地質', '地質（興趣組）專章', '地質', 'Geologist', '興趣', 'Interest', 'SGL'],
  ['興趣 - 騎術', '騎術（興趣組）專章', '騎術', 'Horseman', '興趣', 'Interest', 'SHM'],
  ['興趣 - 風箏', '風箏（興趣組）專章', '風箏', 'Kite Flyer', '興趣', 'Interest', 'SKF'],
  ['興趣 - 圖書管理', '圖書管理（興趣組）專章', '圖書管理', 'Librarian', '興趣', 'Interest', 'SLR'],
  ['興趣 - 氣象', '氣象（興趣組）專章', '氣象', 'Meteorologist', '興趣', 'Interest', 'SML'],
  ['興趣 - 模型製作', '模型製作（興趣組）專章', '模型製作', 'Model Maker', '興趣', 'Interest', 'SMO'],
  ['興趣 - 音樂', '音樂（興趣組）專章', '音樂', 'Musician', '興趣', 'Interest', 'SMS'],
  ['興趣 - 自然', '自然（興趣組）專章', '自然', 'Naturalist', '興趣', 'Interest', 'SNR'],
  ['興趣 - 公園定向', '公園定向（興趣組）專章', '公園定向', 'Park Orienteer', '興趣', 'Interest', 'SPO'],
  ['興趣 - 攝影', '攝影（興趣組）專章', '攝影', 'Photographer', '興趣', 'Interest', 'SPG'],
  ['興趣 - 划艇', '划艇（興趣組）專章', '划艇', 'Rowing Boatman', '興趣', 'Interest', 'SRB'],
  ['興趣 - 風帆', '風帆（興趣組）專章', '風帆', 'Sailor', '興趣', 'Interest', 'SSL'],
  ['興趣 - 農務', '農務（興趣組）專章', '農務', 'Smallholder', '興趣', 'Interest', 'SSH'],
  ['興趣 - 游泳', '游泳（興趣組）專章', '游泳', 'Swimmer', '興趣', 'Interest', 'SSW'],
  ['興趣 - 旅遊', '旅遊（興趣組）專章', '旅遊', 'Tourism', '興趣', 'Interest', 'STI'],
  ['興趣 - 滑浪風帆', '滑浪風帆（興趣組）專章', '滑浪風帆', 'Windsurfer', '興趣', 'Interest', 'SWS'],
  ['技能 - 射箭', '射箭（技能組）專章', '射箭', 'Archery', '技能', 'Pursuit', 'SARP'],
  ['技能 - 天象', '天象（技能組）專章', '天象', 'Astronomer', '技能', 'Pursuit', 'SAM'],
  ['技能 - 航空領航', '航空領航（技能組）專章', '航空領航', 'Aviation Navigator', '技能', 'Pursuit', 'SAN'],
  ['技能 - 原野烹飪', '原野烹飪（技能組）專章', '原野烹飪', 'Backwoods Cook', '技能', 'Pursuit', 'SBC'],
  ['技能 - 露營', '露營（技能組）專章', '露營', 'Camper', '技能', 'Pursuit', 'SCP'],
  ['技能 - 獨木舟水球', '獨木舟水球（技能組）專章', '獨木舟水球', 'Canoe Polo', '技能', 'Pursuit', 'SCNP'],
  ['技能 - 獨木舟', '獨木舟（技能組）專章', '獨木舟', 'Canoeist', '技能', 'Pursuit', 'SCNT'],
  ['技能 - 通訊', '通訊（技能組）專章', '通訊', 'Communicator', '技能', 'Pursuit', 'SCC'],
  ['技能 - 烹飪（中式）', '烹飪（中式）（技能組）專章', '烹飪（中式）', 'Cook (Chinese Dishes)', '技能', 'Pursuit', 'SCD'],
  ['技能 - 手藝', '手藝（技能組）專章', '手藝', 'Craftsman', '技能', 'Pursuit', 'SCM'],
  ['技能 - 電子', '電子（技能組）專章', '電子', 'Electronics', '技能', 'Pursuit', 'SET'],
  ['技能 - 探險', '探險（技能組）專章', '探險', 'Explorer', '技能', 'Pursuit', 'SEC'],
  ['技能 - 模擬飛行', '模擬飛行（技能組）專章', '模擬飛行', 'Flight Simulator', '技能', 'Pursuit', 'SFS'],
  ['技能 - 步操', '步操（技能組）專章', '步操', 'Foot Drill', '技能', 'Pursuit', 'SFDP'],
  ['技能 - 獨木舟國際賽艇', '獨木舟國際賽艇（技能組）專章', '獨木舟國際賽艇', 'International Canoe Sprint', '技能', 'Pursuit', 'SICS'],
  ['技能 - 地圖繪製', '地圖繪製（技能組）專章', '地圖繪製', 'Map Maker', '技能', 'Pursuit', 'SMM'],
  ['技能 - 地圖閱讀', '地圖閱讀（技能組）專章', '地圖閱讀', 'Map Reader', '技能', 'Pursuit', 'SMR'],
  ['技能 - 射擊', '射擊（技能組）專章', '射擊', 'Marksman', '技能', 'Pursuit', 'SMC'],
  ['技能 - 技擊', '技擊（技能組）專章', '技擊', 'Master-at-arms', '技能', 'Pursuit', 'SMA'],
  ['技能 - 機械', '機械（技能組）專章', '機械', 'Mechanic', '技能', 'Pursuit', 'SMI'],
  ['技能 - 氣象', '氣象（技能組）專章', '氣象', 'Meteorologist', '技能', 'Pursuit', 'SMLP'],
  ['技能 - 多媒體創作', '多媒體創作（技能組）專章', '多媒體創作', 'Multimedia Designer', '技能', 'Pursuit', 'SMD'],
  ['技能 - 領航', '領航（技能組）專章', '領航', 'Navigator', '技能', 'Pursuit', 'SNG'],
  ['技能 - 觀察', '觀察（技能組）專章', '觀察', 'Observer', '技能', 'Pursuit', 'SOS'],
  ['技能 - 野外定向', '野外定向（技能組）專章', '野外定向', 'Orienteer', '技能', 'Pursuit', 'SOT'],
  ['技能 - 先鋒工程', '先鋒工程（技能組）專章', '先鋒工程', 'Pioneer', '技能', 'Pursuit', 'SPC'],
  ['技能 - 編程', '編程（技能組）專章', '編程', 'Programmer', '技能', 'Pursuit', 'SPR'],
  ['技能 - 風帆賽艇舵手', '風帆賽艇舵手（技能組）專章', '風帆賽艇舵手', 'Race Helmsman', '技能', 'Pursuit', 'SRH'],
  ['技能 - 風帆', '風帆（技能組）專章', '風帆', 'Sailor', '技能', 'Pursuit', 'SSLP'],
  ['技能 - 徒手潛水', '徒手潛水（技能組）專章', '徒手潛水', 'Skin Diver', '技能', 'Pursuit', 'SSD'],
  ['技能 - 艇長', '艇長（技能組）專章', '艇長', 'Skipper', '技能', 'Pursuit', 'SSP'],
  ['技能 - 體育', '體育（技能組）專章', '體育', 'Sportsman', '技能', 'Pursuit', 'SSM'],
  ['技能 - 樹木護理', '樹木護理（技能組）專章', '樹木護理', 'Tree Carer', '技能', 'Pursuit', 'STC'],
  ['技能 - 國際友誼', '國際友誼（技能組）專章', '國際友誼', 'World Friendship', '技能', 'Pursuit', 'SWF'],
  ['服務 - 營地管理', '營地管理（服務組）專章', '營地管理', 'Camp Warden', '服務', 'Service', 'SCW'],
  ['服務 - 獨木舟救生', '獨木舟救生（服務組）專章', '獨木舟救生', 'Canoe Rescuer', '服務', 'Service', 'SCR'],
  ['服務 - 公民', '公民（服務組）專章', '公民', 'Civics', '服務', 'Service', 'SCI'],
  ['服務 - 護養', '護養（服務組）專章', '護養', 'Conservator', '服務', 'Service', 'SCS'],
  ['服務 - 共融', '共融（服務組）專章', '共融', 'Disability Awareness', '服務', 'Service', 'SDA'],
  ['服務 - 消防', '消防（服務組）專章', '消防', 'Fireman', '服務', 'Service', 'SFM'],
  ['服務 - 急救', '急救（服務組）專章', '急救', 'First Aider', '服務', 'Service', 'SFA'],
  ['服務 - 指引', '指引（服務組）專章', '指引', 'Guide', '服務', 'Service', 'SGC'],
  ['服務 - 語言', '語言（服務組）專章', '語言', 'Interpreter', '服務', 'Service', 'SIP'],
  ['服務 - 工藝', '工藝（服務組）專章', '工藝', 'Jobman', '服務', 'Service', 'SJM'],
  ['服務 - 拯溺', '拯溺（服務組）專章', '拯溺', 'Lifesaver', '服務', 'Service', 'SLS'],
  ['服務 - 精神健康', '精神健康（服務組）專章', '精神健康', 'Mental Health Ambassador', '服務', 'Service', 'SMH'],
  ['服務 - 食物營養', '食物營養（服務組）專章', '食物營養', 'Nutritionist', '服務', 'Service', 'SNT'],
  ['服務 - 領港', '領港（服務組）專章', '領港', 'Pilot', '服務', 'Service', 'SPL'],
  ['服務 - 公共衛生', '公共衛生（服務組）專章', '公共衛生', 'Public Health Ambassador', '服務', 'Service', 'SPH'],
  ['服務 - 物資管理', '物資管理（服務組）專章', '物資管理', 'Quartermaster', '服務', 'Service', 'SQM'],
  ['服務 - 秘書', '秘書（服務組）專章', '秘書', 'Secretary', '服務', 'Service', 'SST'],
  ['教導 - 單車', '單車（教導組）專章', '單車', 'Cyclist', '教導', 'Instructor', 'SCLI'],
  ['教導 - 攝影', '攝影（教導組）專章', '攝影', 'Photographer', '教導', 'Instructor', 'SPGI'],
  ['教導 - 風帆', '風帆（教導組）專章', '風帆', 'Sailor', '教導', 'Instructor', 'SSLI'],
  ['教導 - 游泳', '游泳（教導組）專章', '游泳', 'Swimmer', '教導', 'Instructor', 'SSWI'],
  ['教導 - 天象', '天象（教導組）專章', '天象', 'Astronomer', '教導', 'Instructor', 'SAMI'],
  ['教導 - 原野烹飪', '原野烹飪（教導組）專章', '原野烹飪', 'Backwoods Cook', '教導', 'Instructor', 'SBCI'],
  ['教導 - 露營', '露營（教導組）專章', '露營', 'Camper', '教導', 'Instructor', 'SCPI'],
  ['教導 - 通訊', '通訊（教導組）專章', '通訊', 'Communicator', '教導', 'Instructor', 'SCCI'],
  ['教導 - 烹飪（中式）', '烹飪（中式）（教導組）專章', '烹飪（中式）', 'Cook (Chinese Dishes)', '教導', 'Instructor', 'SCDI'],
  ['教導 - 模擬飛行', '模擬飛行（教導組）專章', '模擬飛行', 'Flight Simulator', '教導', 'Instructor', 'SFSI'],
  ['教導 - 地圖繪製', '地圖繪製（教導組）專章', '地圖繪製', 'Map Maker', '教導', 'Instructor', 'SMMI'],
  ['教導 - 機械', '機械（教導組）專章', '機械', 'Mechanic', '教導', 'Instructor', 'SMII'],
  ['教導 - 氣象', '氣象（教導組）專章', '氣象', 'Meteorologist', '教導', 'Instructor', 'SMLI'],
  ['教導 - 多媒體創作', '多媒體創作（教導組）專章', '多媒體創作', 'Multimedia Designer', '教導', 'Instructor', 'SMDI'],
  ['教導 - 觀察', '觀察（教導組）專章', '觀察', 'Observer', '教導', 'Instructor', 'SOSI'],
  ['教導 - 野外定向', '野外定向（教導組）專章', '野外定向', 'Orienteer', '教導', 'Instructor', 'SOTI'],
  ['教導 - 先鋒工程', '先鋒工程（教導組）專章', '先鋒工程', 'Pioneer', '教導', 'Instructor', 'SPCI'],
  ['教導 - 樹木護理', '樹木護理（教導組）專章', '樹木護理', 'Tree Carer', '教導', 'Instructor', 'STCI'],
  ['教導 - 護養', '護養（教導組）專章', '護養', 'Conservator', '教導', 'Instructor', 'SCVI'],
  ['教導 - 拯溺', '拯溺（教導組）專章', '拯溺', 'Lifesaver', '教導', 'Instructor', 'SLSI'],
  ['領導才', '領導才', '領導才', 'Leadership Training', '', '', 'SLTC'],
  ['繩結', '繩結', '繩結', 'Knotting', '', '', 'SKC'],
  ['艇工', '艇工', '艇工', 'Oarsman', '', '', 'SOM'],
  ['水手', '水手', '水手', 'Boatman', '', '', 'SBM'],
  ['水手長', '水手長', '水手長', 'Boatswain', '', '', 'SBS'],
  ['初級航空活動章', '初級航空活動章', '初級航空活動章', 'Basic Air Activity', '', '', 'SBAA'],
  ['中級航空活動章', '中級航空活動章', '中級航空活動章', 'Intermediate Air Activity', '', '', 'SIAA'],
  ['高級航空活動章', '高級航空活動章', '高級航空活動章', 'Advanced Air Activity', '', '', 'SAAA'],
  ['社區參與章', '社區參與章', '社區參與章', 'Community Involvement Badge', '', '', 'SCOM'],
  ['維護自然世界', '維護自然世界', '維護自然世界', 'World Conservation Badge', '', '', 'SWC'],
  ['世界童軍環境章', '世界童軍環境章', '世界童軍環境章', 'World Scout Environment Badge', '', '', 'SENV'],
];

// K：舉辦單位（行 2–12）
var PARAM_UNITS = ['小童軍', '幼童軍', '童軍', '深資童軍', '樂行童軍', '筲箕灣區',
  '小童軍支部', '幼童軍支部', '童軍支部', '深資童軍支部', '樂行童軍支部'];

// L/M：區會簡稱＋代碼（行 2–43；代碼多數留空，跟實物）
var PARAM_DISTRICTS = [
  ['筲箕灣', 'SKW'], ['柴灣', 'CHW'], ['港島北', 'HKN'], ['港島南', 'HKS'], ['灣仔', 'WCH'],
  ['維城', 'VIC'], ['港島西', 'HKW'], ['深水埗西', ''], ['深水埗東', ''], ['九龍塘', ''],
  ['九龍城', ''], ['深旺', ''], ['旺角', ''], ['油尖', ''], ['紅磡', ''], ['何文田', ''],
  ['秀茂坪', ''], ['將軍澳', ''], ['西貢', ''], ['鯉魚門', ''], ['觀塘', ''], ['九龍灣', ''],
  ['黃大仙', ''], ['慈雲山', ''], ['大埔南', ''], ['大埔北', ''], ['雙魚', ''], ['壁峰', ''],
  ['沙田西', ''], ['沙田南', ''], ['沙田東', ''], ['沙田北', ''], ['元朗西', ''], ['元朗東', ''],
  ['十八鄉', ''], ['北葵涌', ''], ['南葵涌', ''], ['青衣', ''], ['荃灣', ''], ['離島', ''],
  ['屯門東', ''], ['屯門西', ''],
];

// N/O：地域（行 2–6）
var PARAM_REGIONS = [['港島', 'HKIR'], ['九龍', 'KR'], ['東九龍', 'EKR'], ['新界東', 'NTE'], ['新界', 'NT']];
var PARAM_POSITIONS = ['隊長', '副隊長', '隊員', '團隊長'];
var PARAM_RELATIONS = ['父子', '父女', '母子', '母女'];
var PARAM_ACCEPT = ['Y', 'N'];
var PARAM_GROUPS = ['第一組', '第二組', '第三組', '第四組', '第五組', '第六組', '第七組', '第八組'];
var PARAM_TYPES = ['工作坊', '訓練班', '會議', '聚會', '比賽'];
var PARAM_PLUGINS = ['技能', '領袖'];
var PARAM_EDITIONS = ['次', '屆'];


// ===================== 一鍵建表（只限全新空白 Sheet！重跑會清空） =====================

function setupCourseSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  buildResponseSheet_(ss);
  buildInput01_(ss);
  buildInput02_(ss);
  buildInput03_(ss);
  buildInput04_(ss);
  buildParametersSheet_(ss);
  buildPrintNotice_(ss);
  buildPrintAdmit_(ss, 'Print_取錄名單', '取錄名單');
  buildPrintAdmit_(ss, 'Print_合格名單', '合格名單');
  buildPrintStudent_(ss);
  buildPrintAttend_(ss);
  buildPrintAccept_(ss);
  buildPrintBalance_(ss);
  buildPrintStaff_(ss);
  buildPrintSubsidy_(ss);
  buildPrintDone_(ss);
  buildPrintBudget_(ss);
  buildPrintCert_(ss);
  buildReadmeSheet_(ss);

  var key = 'ck_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  PropertiesService.getScriptProperties().setProperty('API_KEY_HASH', sha256_(key));
  var folder = ensureReceiptFolder_();
  SpreadsheetApp.getUi().alert(
    '✅ 訓練班工作簿已建立',
    '🔑 API Key（只顯示一次，請即複製）：\n────────────────\n' + key + '\n────────────────\n\n'
    + '📁 入數紙資料夾（folder 權限，只有職員睇到）：\n'
    + (folder ? '網址：' + folder.getUrl() + '\nID：' + folder.getId() : '（未能建立，請手動設定）') + '\n\n'
    + '已建立分頁：使用說明 / 參數 / 表格回應 / Input01–04 / 12 張 Print。\n\n'
    + '跟住做：\n'
    + '1. 將 /exec 網址＋API Key＋入數紙資料夾 ID 交返 ADC。\n'
    + '2. 部署 → 網頁應用程式（執行身分：我自己；存取：所有人）。\n'
    + '3. 照「使用說明」分頁填 Input01→Input02→Input03，檢查 Print_通告，交區總監審批。\n\n'
    + '⚠️ 呢個一鍵建表只可以用喺全新空白表，重跑會清空所有分頁！'
  );
}

// ===================== API Key（獨立產生，唔掂表格） =====================
// 區系統自動複製出嚟嘅表：Script 碼會跟住嚟，但 API Key 唔會（存喺 Script Properties，複製唔帶）。
// 喺呢個表按 🎓 訓練班選單 → 🔑 產生 API Key（或喺編輯器執行本函數），即出新 key，表格資料唔郁。
// 之後部署做 Web App，將 /exec＋key 交返 ADC 貼入開班登記，即可收報名。
// 舊 key 即時作廢（唔影響已收嘅報名資料）。
function rotateCourseApiKey() {
  var key = 'ck_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  PropertiesService.getScriptProperties().setProperty('API_KEY_HASH', sha256_(key));
  try {
    SpreadsheetApp.getUi().alert(
      '🔑 新 API Key（只顯示一次，請即刻複製）',
      key + '\n\n下一步（收報名用）：\n'
      + '1. 部署 → 新增部署 → 網頁應用程式（執行身分：我；存取：任何人）\n'
      + '2. 複製 /exec 網址\n'
      + '3. 將 /exec 網址＋上面個 key 交返 ADC，貼入區管理平台開班登記'
    );
  } catch (e) { /* 冇 UI 照出 key（return 值） */ }
  return key;
}

// ===================== 建表小工具 =====================

/** 拎分頁（冇就開），捐窿捐罅用同一個 */
function setupSheet_(ss, name, tabColor) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  if (tabColor) sh.setTabColor(tabColor);
  return sh;
}
/** 逐格寫值：[['A1', v], ...]（v 係 = 開頭就當公式） */
function setupCells_(sh, cells) {
  cells.forEach(function (kv) {
    var v = kv[1];
    if (v == null || v === '') return;
    if (typeof v === 'string' && v.charAt(0) === '=') sh.getRange(kv[0]).setFormula(v);
    else sh.getRange(kv[0]).setValue(v);
  });
}
/** 整列寫（labels: [[行號, A, B, C...], ...]，$=留空） */
function setupRows_(sh, rows) {
  rows.forEach(function (r) {
    var rn = r[0];
    for (var i = 1; i < r.length; i++) {
      if (r[i] !== '' && r[i] != null) sh.getRange(rn, i).setValue(r[i]);
    }
  });
}
function setupNote_(sh, a1, note) { sh.getRange(a1).setNote(note); }
function setupYellow_(sh, a1) { sh.getRange(a1).setBackground('#fff9c4'); }
function setupMoney_(sh, a1) { sh.getRange(a1).setNumberFormat('"$"#,##0.00'); }
function setupDateFmt_(sh, a1) { sh.getRange(a1).setNumberFormat('d/m/yyyy'); }
function setupCheckbox_(sh, a1) {
  sh.getRange(a1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
}
function setupDropdown_(sh, a1, paramRangeA1) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getRange(PARAM_SHEET + '!' + paramRangeA1), true)
    .setAllowInvalid(true).build();
  sh.getRange(a1).setDataValidation(rule);
}
function setupList_(sh, a1, values) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true).setAllowInvalid(true).build();
  sh.getRange(a1).setDataValidation(rule);
}
/** VLOOKUP 班領導人欄（Input02 職員區 A23:G42 第 n 欄） */
function setupLeaderCol_(n) {
  return 'VLOOKUP("班領導人",\'' + IN2 + '\'!A23:G42,' + n + ',FALSE)';
}
var SETUP_LEADER_NAME = null; // lazy
function leaderName_() {
  if (!SETUP_LEADER_NAME) SETUP_LEADER_NAME = setupLeaderCol_(2);
  return SETUP_LEADER_NAME;
}
function leaderPhone_() { return setupLeaderCol_(6); }
function leaderEmail_() { return setupLeaderCol_(7); }
/** 查詢句（通告版：與班領導人聯絡；名單版：與本人聯絡） */
function setupEnquiry_(who) {
  return '=IFERROR("如在"&TEXT(\'' + IN2 + '\'!B19,"yyyy年m月d日（aaaa）")'
    + '&"前尚未接獲通知者或有任何查詢，請電郵至 "&' + leaderEmail_()
    + '&" 或致電 "&' + leaderPhone_() + '&" ' + who + '。","")';
}

// ===================== 表格回應分頁 =====================
function buildResponseSheet_(ss) {
  var sh = setupSheet_(ss, RESP_SHEET, '#e91e63');
  sh.getRange(1, 1, 1, RESP_HEADERS.length).setValues([RESP_HEADERS]);
  sh.getRange(1, 1, 1, RESP_HEADERS.length).setFontWeight('bold').setBackground('#e3f2fd');
  sh.setFrozenRows(1);
  setupNote_(sh, 'AD1', '旅號：新報名自動由旅團抽取數字；可人手改。');
  setupNote_(sh, 'AI1', '學員編號：接納（✔）後自動順序編號。');
  setupNote_(sh, 'AJ1', '分組：職員人手填（第一組…），Print 名單會自動帶過去。');
  setupNote_(sh, 'AK1', '審批狀態：pending／approved／rejected／cancelled（區管理平台批核會自動寫）。');
}

// ===================== 參數分頁 =====================
function buildParametersSheet_(ss) {
  var sh = setupSheet_(ss, PARAM_SHEET, '#1e88e5');
  sh.getRange(1, 1, 1, PARAM_HEADERS.length).setValues([PARAM_HEADERS]);
  sh.getRange(1, 1, 1, PARAM_HEADERS.length).setFontWeight('bold').setBackground('#e3f2fd');
  sh.setFrozenRows(1);
  PARAM_AWARDS.forEach(function (a) {
    sh.getRange(a[0], 1).setValue(a[1]);
    sh.getRange(a[0], 2).setValue(a[2]);
  });
  if (PARAM_BADGES.length) sh.getRange(2, 4, PARAM_BADGES.length, 7).setValues(PARAM_BADGES);
  PARAM_UNITS.forEach(function (v, i) { sh.getRange(2 + i, 11).setValue(v); });
  PARAM_DISTRICTS.forEach(function (d, i) {
    sh.getRange(2 + i, 12).setValue(d[0]);
    if (d[1]) sh.getRange(2 + i, 13).setValue(d[1]);
  });
  PARAM_REGIONS.forEach(function (d, i) {
    sh.getRange(2 + i, 14).setValue(d[0]);
    sh.getRange(2 + i, 15).setValue(d[1]);
  });
  PARAM_POSITIONS.forEach(function (v, i) { sh.getRange(2 + i, 16).setValue(v); });
  PARAM_RELATIONS.forEach(function (v, i) { sh.getRange(2 + i, 17).setValue(v); });
  PARAM_ACCEPT.forEach(function (v, i) { sh.getRange(2 + i, 18).setValue(v); });
  PARAM_GROUPS.forEach(function (v, i) { sh.getRange(2 + i, 19).setValue(v); });
  PARAM_TYPES.forEach(function (v, i) { sh.getRange(2 + i, 20).setValue(v); });
  PARAM_PLUGINS.forEach(function (v, i) { sh.getRange(2 + i, 21).setValue(v); });
  PARAM_EDITIONS.forEach(function (v, i) { sh.getRange(2 + i, 22).setValue(v); });
  // W/X：區會常數（新增欄，A–V 原封不動；通告公式引用呢度，轉區只改呢幾個格）
  setupCells_(sh, [
    ['W1', '區會常數（唔好改名）'],
    ['W2', '成員系統報名網址'], ['X2', DISTRICT_PORTAL_URL],
    ['W3', 'FPS 識別碼'], ['X3', DISTRICT_FPS_ID],
    ['W4', 'FPS 戶口名稱'], ['X4', DISTRICT_FPS_NAME],
    ['W5', '區會網址'], ['X5', DISTRICT_WEB_URL],
  ]);
  sh.getRange('W1:X1').setFontWeight('bold').setBackground('#fff3e0');
  sh.getRange('W2:W5').setBackground('#fff8e1');
}

// ===================== 使用說明分頁（CL 版） =====================
function buildReadmeSheet_(ss) {
  var sh = setupSheet_(ss, '使用說明', '#1565c0');
  var rows = [
    ['🎓 訓練班工作簿 — CL 使用說明', ''],
    ['', ''],
    ['流程（你只填一次）', ''],
    ['1', '填 Input01 訓練班預算：名稱／屆別／支部／專章／形式、預計收生／收費／職員、活動日期、8 大開支分類（如不適用用 Backspace 清除）。'],
    ['2', '填 Input02 訓練班資料：名稱／名額／收費／職員（黃格自動由預算帶入，可覆蓋）→ 活動日期（每節一行，✓上通告 剔要出通告嘅節次）→ 截止／公佈日 → 職員資料（職位已預填，補姓名電話電郵）。'],
    ['3', '填 Input03 時間表：每節一組（日期地點時間服裝＋節目流程）；唔夠位複製 10 行一組。'],
    ['4', '檢查 Print_通告：標題／節數／班領導人／名額／截止／報名辦法／查詢已自動帶入；補參加資格／費用說明／服裝／備註（已有標準 6 項，可改），貼上 FPS QR 圖片，交區總監審批。'],
    ['5', '批核後：列印 Print_通告 做 PDF 交網頁管理員上載；通知 ADC 喺區管理平台開班（資料自動讀取，你唔使再填）。'],
    ['6', '開班後：報名自動寫入「表格回應」；批核後取錄／學員／出席／完成報告／資助等 Print 自動生成。實際支出記入 Input04。'],
    ['🔑 自動建表', '如果呢本表係區系統自動起嘅：資料已經喺度，唔使跑一鍵建表！要收報名：按上面 🎓 訓練班選單 → 🔑 產生 API Key → 部署做 Web App（執行身分：我；存取：任何人）→ 將 /exec＋key 交返 ADC 貼入開班登記。'],
    ['', ''],
    ['黃色格', '自動由其他分頁帶入嘅數（例如 Input02 名額）。一般唔使改；真係要覆蓋可以直接打字（會蓋掉公式）。'],
    ['✓上通告', 'Input02 每節一行：剔咗＋有「通告顯示日期」嗰節先會出現在 Print_通告（跨日節次：第二日唔剔，喺第一日通告顯示日期寫「8月10至11日」噉）。'],
    ['通告編號', '檔案編號（Print_通告右上角）由區會編，等 ADC 話你知先填。'],
    ['報名辦法', '已預設成員系統網上報名（唔用 Google Form）；網址喺參數 W/X，如區會轉網址改嗰度就得。'],
    ['信頭', 'Print 信紙本身冇信頭圖：列印前喺第 1–11 行位置插入區會信頭圖片（浮動圖片），或列印喺印好信頭嘅紙上。'],
    ['入數紙', '自動存入本班 Drive 資料夾（開表時建立，只有職員睇到）。'],
    ['', ''],
    ['⚠️', '唔好改分頁名！區管理平台＋日後其他系統靠分頁名讀數。唔好重跑一鍵建表（會清空）。'],
  ];
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange('A1:B1').merge().setBackground('#1565c0').setFontColor('white').setFontWeight('bold').setFontSize(14);
  sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 640);
  sh.getRange('A3:B3').setFontWeight('bold').setBackground('#e3f2fd');
  sh.getRange(1, 1, rows.length, 2).setVerticalAlignment('top');
}


// ===================== Input01 訓練班預算（跟實物 105 行） =====================
function buildInput01_(ss) {
  var sh = setupSheet_(ss, IN1, '#f9a825');
  // 頭段＋日期（行 1–27）
  setupRows_(sh, [
    [1, '活動/訓練班名稱'],
    [3, '(如不適用, 請以Backspace 清除)'],
    [4, '屆別', '', '屆'],
    [5, '支部'],
    [6, '專章'],
    [7, '自定義名稱'],
    [8, '形式-1'],
    [9, '形式-2'],
    [11, '預計收生人數', '', '名'],
    [12, '預計收費', '', '元'],
    [13, '職員人數', '', '人 (不計算講師)'],
    [15, '', 'dd/mm/yyyy', '0000 - 2359', '', '場地'],
    [16, '活動日期及場地'],
    [25, '財政預算'],
    [26, '項目批准總預算\nBudget Approved'],
    [27, '是次活動申請津貼\nSubsidy Required', '', '負數代表訓練班有盈餘,\n需審視預計收費及支出'],
  ]);
  setupCells_(sh, [
    ['B26', "='Print_財政預算'!B95"],
    ['B27', "='Print_財政預算'!D95"],
  ]);
  setupNote_(sh, 'B26', '自動由 Print_財政預算 帶入（嗰邊先係正本，有修訂欄）。');
  setupNote_(sh, 'B27', '自動由 Print_財政預算 帶入：總支出 − 總收入。');
  setupMoney_(sh, 'B26:B27');
  // 下拉：支部／專章／形式（參數）
  setupDropdown_(sh, 'B5', 'K2:K6');
  setupDropdown_(sh, 'B6', 'D2:D111');
  setupDropdown_(sh, 'B8', 'T2:T6');
  setupDropdown_(sh, 'B9', 'T2:T6');
  setupDateFmt_(sh, 'B16:B24');
  // 1. 膳食（行 29–42）
  setupRows_(sh, [
    [29, '1. 膳食 Catering', '', '', '', '人均預算', '', '職員/學員?'],
    [30, '', '日期', '時間', '', '早餐', '午餐', '晚餐', '茶點', '飲用水', '', '總人數', '總數'],
    [31, '', '', '', '區指引預算', '25', '55', '65', '10', 'N/A'],
    [40, '', '', 'Average'],
    [41, '', '', 'Average 人數'],
    [42, '', '', '次數 / 餐數'],
  ]);
  var mealCols = ['E', 'F', 'G', 'H', 'I'];
  for (var r = 32; r <= 39; r++) {
    setupList_(sh, 'J' + r, ['職員', '學員']);
    setupCells_(sh, [
      ['K' + r, '=IF(J' + r + '="","",IF(J' + r + '="職員",$B$13,$B$11))'],
      ['L' + r, '=IF(K' + r + '="","",SUM(E' + r + ':I' + r + ')*K' + r + ')'],
    ]);
  }
  mealCols.forEach(function (c) {
    setupCells_(sh, [
      [c + '40', '=IFERROR(AVERAGE(' + c + '32:' + c + '39),"")'],
      [c + '41', '=IFERROR(AVERAGE($K$32:$K$39),"")'],
      [c + '42', '=COUNT(' + c + '32:' + c + '39)'],
    ]);
  });
  setupMoney_(sh, 'E32:M42');
  // 2. 租金（行 44–66）
  setupRows_(sh, [
    [44, '2. 租金Rent', '', '', '', '', '數量', '單位', '單價', '', '', '', '', '總數'],
    [45, '2.1', '場租Venue Charge'],
    [46, '', '地點', '租用時段'],
    [48, '', '其他收費'],
    [52, '2.2', '露營 Camp', '', '', '', '日/晚數', '人數', '價格'],
    [53, '', '地點', '營期'],
    [58, '', '', '', '', '', 'Ttl', 'Avg', 'Avg'],
    [60, '2.3', '住宿 Lodging', '', '', '', '晚數', '房數', '價格'],
    [61, '', '地點', '營期'],
    [66, '', '', '', '', '', 'Ttl', 'Avg', 'Avg'],
  ]);
  setupCells_(sh, [
    ['M47', '=IFERROR(F47*H47,"")'],
    ['M48', '=IF(H48="","",H48)'],
    ['M49', '=IF(H49="","",H49)'],
    ['M50', '=SUM(M47:M49)'],
    ['M54', '=IFERROR(F54*G54*H54,"")'],
    ['M55', '=IF(H55="","",H55)'],
    ['M56', '=IF(H56="","",H56)'],
    ['F57', '=SUM(F54:F56)'],
    ['G57', '=IFERROR(AVERAGE(G54:G56),"")'],
    ['H57', '=IFERROR(AVERAGE(H54:H56),"")'],
    ['M57', '=SUM(M54:M56)'],
    ['M62', '=IFERROR(F62*G62*H62,"")'],
    ['M63', '=IF(H63="","",H63)'],
    ['M64', '=IF(H64="","",H64)'],
    ['F65', '=SUM(F62:F64)'],
    ['G65', '=IFERROR(AVERAGE(G62:G64),"")'],
    ['H65', '=IFERROR(AVERAGE(H62:H64),"")'],
    ['M65', '=SUM(M62:M64)'],
  ]);
  setupMoney_(sh, 'H44:M66');
  // 3. 交通（行 67–75）
  setupRows_(sh, [
    [67, '3. 交通/運輸Transportation'],
    [68, '', '', '日期 / 路線 / 車種', '', '', '', '', '預算'],
    [69, '3.1', '器材Equipment'],
    [71, '3.2', '職員Staff'],
    [73, '3.3', '學員Candidate'],
    [75, '', 'Count / Average'],
  ]);
  setupCells_(sh, [
    ['M69', '=IFERROR(H69+H70,"")'],
    ['M71', '=IFERROR(H71+H72,"")'],
    ['M73', '=IFERROR(H73+H74,"")'],
    ['C75', '=COUNTA(C69:C74)'],
    ['M75', '=SUM(M69,M71,M73)'],
  ]);
  setupMoney_(sh, 'H67:M75');
  // 4. 講義（行 78–82）
  setupRows_(sh, [
    [78, '4. 講義/場刊 Handouts/Leaflets', '', '', '', '', '數量', '', '單價'],
    [79, '4.1', '影印 Photocopy', '', '', '', '', 'X'],
    [80, '4.2', '光碟 CD Rom', '', '', '', '', 'X'],
    [81, '4.3', '快勞 File', '', '', '', '', 'X'],
  ]);
  ['79', '80', '81'].forEach(function (r) {
    setupCells_(sh, [['M' + r, '=IFERROR(G' + r + '*H' + r + ',"")']]);
  });
  setupCells_(sh, [['M82', '=SUM(M79:M81)']]);
  setupMoney_(sh, 'H78:M82');
  // 5. 節目（行 84–88）
  setupRows_(sh, [
    [84, '5. 節目開支 Programme Expenses', '', '', '', '', '數量', '', '單價'],
    [85, '5.1', '', '', '', '', '', 'X'],
    [86, '5.2', '', '', '', '', '', 'X'],
    [87, '5.3', '', '', '', '', '', 'X'],
  ]);
  ['85', '86', '87'].forEach(function (r) {
    setupCells_(sh, [['M' + r, '=IFERROR(G' + r + '*H' + r + ',"")']]);
  });
  setupCells_(sh, [['M88', '=SUM(M85:M87)']]);
  setupMoney_(sh, 'H84:M88');
  // 6. 行政（行 90–94）
  setupRows_(sh, [
    [90, '6. 行政Administration', '', '', '', '', '數量', '', '價格'],
    [91, '6.1', '攝影Photo', '', '', '', '', 'X'],
    [92, '6.2', '印刷及郵費 Printing & Postage', '', '', '', '', 'X'],
    [93, '6.3', '文具Stationery', '', '', '', '', 'X'],
  ]);
  ['91', '92', '93'].forEach(function (r) {
    setupCells_(sh, [['M' + r, '=IFERROR(G' + r + '*H' + r + ',"")']]);
  });
  setupCells_(sh, [['M94', '=SUM(M91:M93)']]);
  setupMoney_(sh, 'H90:M94');
  // 7. 紀念品（行 96–99）
  setupRows_(sh, [
    [96, '7. 紀念品/獎品 Souvenir/Prize', '', '', '', '', '數量', '', '價格'],
    [97, '7.1', '紀念品 Souvenir', '**需填寫<Print_財政預算>申請訂造紀念品', '', '', '', 'X'],
    [98, '7.2', '獎品 Prize', '', '', '', '', 'X'],
  ]);
  setupCells_(sh, [
    ['M97', '=IFERROR(G97*H97,"")'],
    ['M98', '=IFERROR(G98*H98,"")'],
    ['M99', '=SUM(M97:M98)'],
  ]);
  setupMoney_(sh, 'H96:M99');
  // 8. 其他（行 101–105）
  setupRows_(sh, [
    [101, '8. 其他 Miscelleous (請註明 Please specify)', '', '', '', '', '', '', '價格'],
  ]);
  setupCells_(sh, [
    ['J102', '=IF(E102="","",E102)'],
    ['J103', '=IF(E103="","",E103)'],
    ['J104', '=IF(E104="","",E104)'],
    ['M105', '=SUM(J102:J104)'],
  ]);
  setupNote_(sh, 'B102', '註明其他支出項目，金額填 E 欄。');
  setupMoney_(sh, 'E101:M105');
  // 版式
  sh.getRange('A26:A27').setWrap(true);
  sh.setColumnWidth(1, 220); sh.setColumnWidth(2, 150);
}


// ===================== Input02 訓練班資料（跟實物 46 行） =====================
function buildInput02_(ss) {
  var sh = setupSheet_(ss, IN2, '#00acc1');
  setupRows_(sh, [
    [1, '活動/訓練班名稱'],
    [3, '(以下自動套用預算資料, 如有更新可以在黃色方格覆蓋, 但不要改動預算階段資料。預算變動應反映於財政預算修訂一欄。如區會資助需要上調, 需經EC批准。)'],
    [4, '名額', '', '', '名'],
    [5, '預計收費', '', '', '元'],
    [6, '職員人數', '', '', '人 (不計算講師)'],
    [8, '', 'dd/mm/yyyy', '橫跨至下一日?', '0000 - 2359', '場地', '', '（自動）', '✓上通告', '通告顯示日期', '通告顯示時間', '通告顯示地點'],
    [9, '活動日期及場地'],
    [18, '截止報名日期'],
    [19, '最遲公佈取錄名單日'],
    [21, '職員資料'],
    [22, '職位', '姓名', '稱謂', '所屬單位 / 職銜', '資格標註', '電話', '電郵'],
    [23, '班領導人'],
    [24, '副班領導人'],
    [25, '副班領導人'],
    [26, '助理班領導人'],
    [27, '小隊導師'],
    [28, '小隊導師'],
    [29, '小隊導師'],
    [30, '小隊導師'],
    [31, '團隊長'],
    [32, '團隊長'],
    [33, '班務行政'],
    [34, '物資管理'],
    [35, '物資管理'],
    [36, '講師'],
    [37, '講師'],
    [38, '講師'],
    [39, '講師'],
    [40, '講師'],
    [41, '講師'],
    [42, '講師'],
    [45, '班職員總人數'],
    [46, '常駐班職員人數'],
  ]);
  // 黃格：自動由預算帶入（可覆蓋）
  setupCells_(sh, [
    ['B1', "='" + IN1 + "'!B1"],
    ['B4', "='" + IN1 + "'!B11"],
    ['B5', "='" + IN1 + "'!B12"],
    ['B6', "='" + IN1 + "'!B13"],
    ['B45', '=COUNTA(B23:B42)'],
  ]);
  ['B1', 'B4', 'B5', 'B6'].forEach(function (a1) {
    setupYellow_(sh, a1);
    setupNote_(sh, a1, '自動由預算帶入；真係要改可以直接打字（會蓋掉公式）。');
  });
  setupNote_(sh, 'B45', '自動數職員姓名；常駐人數（B46）人手填。');
  setupNote_(sh, 'G8', '自動中文日期（=B 欄），唔使填。');
  setupNote_(sh, 'H8', '剔咗＋有通告顯示日期嗰節先上 Print_通告。');
  // 節次行（9–16）：C 橫跨剔格、G 自動中文日期、H 上通告剔格、I 預設中文日期（可改，例如合併跨日寫法）
  for (var r = 9; r <= 16; r++) {
    setupCheckbox_(sh, 'C' + r);
    setupCheckbox_(sh, 'H' + r);
    setupCells_(sh, [
      ['G' + r, '=IF(B' + r + '="","",TEXT(B' + r + ',"yyyy年m月d日（aaaa）"))'],
      ['I' + r, '=IF($G' + r + '="","",$G' + r + ')'],
    ]);
  }
  setupDateFmt_(sh, 'B9:B16');
  setupDateFmt_(sh, 'B18:B19');
  sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 150);
  sh.getRange('A3:K3').setWrap(true);
}

// ===================== Input03 時間表（跟實物：每節 10 行一組，共 3 組） =====================
function buildInput03_(ss) {
  var sh = setupSheet_(ss, IN3, '#43a047');
  var in2rows = [9, 10, 11]; // 對應 Input02 節次行
  [2, 12, 22].forEach(function (top, bi) {
    var sr = in2rows[bi];
    setupRows_(sh, [
      [top, '', '日期：', '', '地點：'],
      [top + 1, '', '時間：', '', '服裝：'],
      [top + 3, '', '時 間', '需時（分鐘）', '項目', '負責人'],
    ]);
    setupCells_(sh, [
      ['C' + top, "='" + IN2 + "'!B" + sr],
      ['E' + top, "='" + IN2 + "'!E" + sr],
      ['C' + (top + 1), "='" + IN2 + "'!D" + sr],
      // 節目時間：第一行取時段頭 4 位，之後每行＝上一行＋需時（分鐘）
      ['B' + (top + 4), '=IFERROR(VALUE(LEFT(C' + (top + 1) + ',4)),"")'],
    ]);
    for (var r = top + 5; r <= top + 8; r++) {
      setupCells_(sh, [
        ['B' + r, '=IF(OR(B' + (r - 1) + '="",C' + r + '=""),"",B' + (r - 1) + '+C' + r + ')'],
      ]);
    }
    setupDateFmt_(sh, 'C' + top);
  });
  setupRows_(sh, [[31, '（唔夠節次？複製上面 10 行一組，改 C/E 欄公式對應 Input02 行號就得）']]);
  sh.setColumnWidth(1, 30); sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 120); sh.setColumnWidth(4, 200); sh.setColumnWidth(5, 130);
}

// ===================== Input04 支出表（跟實物 46 行） =====================
function buildInput04_(ss) {
  var sh = setupSheet_(ss, IN4, '#5e35b1');
  setupRows_(sh, [
    [1, '筲箕灣童軍區會'],
    [2, '活動支出'],
    [3, ''],
    [6, '類別', '茶　點', '膳食津貼', '職員膳食', '住　宿', '交通', '行　政', '講義及快勞', '其　他', '設　備', '備註'],
    [7, '收據編號'],
    [43, '小計：'],
    [44, '總支出：'],
    [46, '', '', '', '', '', '', '', '', '', '預算尚餘', '', 'Please hide before printing'],
  ]);
  setupCells_(sh, [['A3', "='" + IN1 + "'!B1"]]);
  for (var r = 8; r <= 42; r++) sh.getRange(r, 1).setValue(r - 7); // 收據 1–35
  var cols = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  cols.forEach(function (c) {
    setupCells_(sh, [[c + '43', '=SUM(' + c + '8:' + c + '42)']]);
  });
  setupCells_(sh, [
    ['J44', '=SUM(B43:J43)'],
    ['K46', "='Print_財政預算'!B83-'Print_財政預算'!B93-'Print_財政預算'!B95"],
  ]);
  setupNote_(sh, 'K46', '總支出 − 總收入 − 批准總預算（隱藏欄，列印前隱藏）。');
  setupMoney_(sh, 'B8:K46');
  sh.setColumnWidth(1, 90);
}


// ===================== Print_通告（跟實物：A–G，標題／節數／內文／署名） =====================
function buildPrintNotice_(ss) {
  var sh = setupSheet_(ss, 'Print_通告', '#c62828');
  setupRows_(sh, [
    [12, '', '', '', '', '', '', '檔案編號: 26XX'],
    [17, '', '日期', '時間', '地點'],
    [22, '', '班領導人：'],
    [23, '', '參加資格：'],
    [24, '', '費 用：'],
    [28, '', '名 額：'],
    [29, '', '截止日期：'],
    [30, '', '報名辦法：'],
    [31, '', '服 裝：'],
    [32, '', '備 註：'],
    [39, '', '查 詢：'],
    [42, '', '掃描付款', '', '', '區總監'],
    [44, '', 'QR Code'],
    [45, '', '', '', '', '（　　　　代行）'],
  ]);
  setupCells_(sh, [
    // R4 輔助格：最後一節日期／時間
    ['E4', "=IFERROR(MAX('" + IN2 + "'!B9:B16),\"\")"],
    ['D4', "=IF($E4=\"\",\"\",IFERROR(INDEX('" + IN2 + "'!D9:D16,MATCH($E4,'" + IN2 + "'!B9:B16,0)),\"\"))"],
    // 標題＋節數（只取 ✓上通告＋有通告顯示日期）
    ['A15', "='" + IN2 + "'!B1"],
    ['B18', "=IF(AND('" + IN2 + "'!H9=TRUE,'" + IN2 + "'!I9<>\"\"),'" + IN2 + "'!I9,\"\")"],
    ['C18', "=IF($B18=\"\",\"\",'" + IN2 + "'!J9)"],
    ['D18', "=IF($B18=\"\",\"\",'" + IN2 + "'!K9)"],
    ['B19', "=IF(AND('" + IN2 + "'!H10=TRUE,'" + IN2 + "'!I10<>\"\"),'" + IN2 + "'!I10,\"\")"],
    ['C19', "=IF($B19=\"\",\"\",'" + IN2 + "'!J10)"],
    ['D19', "=IF($B19=\"\",\"\",'" + IN2 + "'!K10)"],
    ['B20', "=IF(AND('" + IN2 + "'!H11=TRUE,'" + IN2 + "'!I11<>\"\"),'" + IN2 + "'!I11,\"\")"],
    ['C20', "=IF($B20=\"\",\"\",'" + IN2 + "'!J11)"],
    ['D20', "=IF($B20=\"\",\"\",'" + IN2 + "'!K11)"],
    ['B21', "=IF(AND('" + IN2 + "'!H12=TRUE,'" + IN2 + "'!I12<>\"\"),'" + IN2 + "'!I12,\"\")"],
    ['C21', "=IF($B21=\"\",\"\",'" + IN2 + "'!J12)"],
    ['D21', "=IF($B21=\"\",\"\",'" + IN2 + "'!K12)"],
    // 班領導人：姓名＋稱謂（＋資格）
    ['C22', '=IFERROR(' + leaderName_() + '&VLOOKUP("班領導人",\'' + IN2 + '\'!A23:G42,3,FALSE)'
      + '&IF(VLOOKUP("班領導人",\'' + IN2 + '\'!A23:G42,5,FALSE)="","",("（"&VLOOKUP("班領導人",\'' + IN2 + '\'!A23:G42,5,FALSE)&"）")),"")'],
    // C25 FPS 段見下面 setFormula（要嵌班名公式）
    ['C28', "=IF('" + IN2 + "'!B4=\"\",\"\",'" + IN2 + "'!B4&\"人\")"],
    ['C29', "=IF('" + IN2 + "'!B18=\"\",\"\",TEXT('" + IN2 + "'!B18,\"yyyy年m月d日（aaaa）\"))"],
    // 報名辦法：成員系統（唔用 Google Form）
    ['C30', '="請於筲箕灣區成員系統訓練班版面填妥網上報名表（網址："&\'' + PARAM_SHEET + '\'!X2&"）"'],
    // 標準備註 6 項（可改；括號位按實際填）
    ['C32', '1. 報名前須獲得家長及旅團領袖同意並於網上表格提供有關資料包括其姓名及電郵等；'],
    ['C33', '2. 報名前須先以轉數快繳付有關費用並截圖紀錄；'],
    ['C34', '3. 取錄與否，一概以電郵通知及公佈於筲箕灣區網頁（www.skwscout.org.hk）；'],
    ['C35', '4. 學員必須全期出席訓練班，不得遲到或早退，並完成指定事工，始獲考慮頒發證書；'],
    ['C36', '5. 筲箕灣區合資格學員可獲「章」有進步訓練班資助計劃資助，詳情請參考本區通告（ ）號；'],
    ['C37', '6. 有經濟需要之青少年成員可根據「學生隊員訓練資助計劃」申請資助參加本訓練班，詳情請參閱總會行政通告第（ ）號。'],
    ['C39', setupEnquiry_('與班領導人聯絡')],
  ]);
  // C25 公式要嵌班名：上面用了佔位 otherwise，呢度修正返
  sh.getRange('C25').setFormula('="報名費用必須以轉數快繳付。帳戶識別碼 "&\'' + PARAM_SHEET + '\'!X3&" "&\''
    + PARAM_SHEET + '\'!X4&"（可掃瞄通告下方QR Code，備註欄請註明【"&\''
    + IN2 + '\'!B1&"】及【參加者姓名】）。（如未能取錄，報名費用將會悉數退回）"');
  setupNote_(sh, 'G12', '區通告編號由區會編（跨類別共用），等 ADC 話你知先填，唔好自己作。');
  setupNote_(sh, 'G13', '填發出日期（例如 2025年7月1日）。');
  setupNote_(sh, 'C23', '如：已宣誓及持有有效紀錄冊之支部成員（港島地域成員將獲優先取錄）。');
  setupNote_(sh, 'C24', '費用說明：金額＋包括咩＋原價／資助（如有）。例：活動費用港幣25元正（包括行政、茶點等）。');
  setupNote_(sh, 'C31', '如：整齊童軍制服。');
  setupNote_(sh, 'B42', '列印前喺呢度貼上 FPS QR Code 圖片（浮動圖片）。');
  setupNote_(sh, 'E43', '區總監簽署／姓名。');
  // 版式
  sh.getRange('A15:G15').merge();
  ['22', '23', '24', '25', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '39'].forEach(function (r) {
    sh.getRange('C' + r + ':G' + r).merge();
  });
  sh.getRange('A15:G45').setWrap(true).setVerticalAlignment('top');
  sh.setColumnWidth(1, 40); sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 150); sh.setColumnWidth(4, 150); sh.setColumnWidth(5, 120);
  sh.setColumnWidth(6, 60); sh.setColumnWidth(7, 140);
}

// ===================== Print_取錄名單／合格名單（同一版式，雙欄名單） =====================
function buildPrintAdmit_(ss, tabName, listTitle) {
  var sh = setupSheet_(ss, tabName, '#7e57c2');
  setupRows_(sh, [
    [16, listTitle],
    [18, '', '', '編號', '姓名', '旅別', '', '編號', '姓名', '旅別'],
    [41, '', '', '', '', '', '', '', '', '班領導人'],
  ]);
  setupCells_(sh, [
    ['D4', "=IFERROR(MAX('" + IN2 + "'!B9:B16),\"\")"],
    ['C4', "=IF($D4=\"\",\"\",IFERROR(INDEX('" + IN2 + "'!D9:D16,MATCH($D4,'" + IN2 + "'!B9:B16,0)),\"\"))"],
    ['J12', '=TEXT(TODAY(),"yyyy年m月d日")'],
    ['A14', "='" + IN2 + "'!B1"],
    ['I43', '=IFERROR(' + leaderName_() + ',"")'],
  ]);
  // 雙欄：左 1–17，右 18–34（approved 順序）
  var filtC = "FILTER('" + RESP_SHEET + "'!C2:C,'" + RESP_SHEET + "'!AK2:AK=\"approved\")";
  var filtI = "FILTER('" + RESP_SHEET + "'!I2:I,'" + RESP_SHEET + "'!AK2:AK=\"approved\")";
  for (var r = 19; r <= 35; r++) {
    var kL = r - 18, kR = r - 1;
    setupCells_(sh, [
      ['D' + r, '=IFERROR(INDEX(' + filtC + ',' + kL + '),"")'],
      ['C' + r, '=IF(D' + r + '="","",' + kL + ')'],
      ['E' + r, '=IFERROR(INDEX(' + filtI + ',' + kL + '),"")'],
      ['H' + r, '=IFERROR(INDEX(' + filtC + ',' + kR + '),"")'],
      ['G' + r, '=IF(H' + r + '="","",' + kR + ')'],
      ['I' + r, '=IFERROR(INDEX(' + filtI + ',' + kR + '),"")'],
    ]);
  }
  if (listTitle === '取錄名單') {
    setupCells_(sh, [
      ['B36', '=IFERROR("請獲接納之學員按接納通知書上指示，準時到訓練班場地報到。如名單上沒有閣下之姓名，'
        + '表示該申請未獲接納，本區會即時辦理退款並銷毀個人資料。如有任何疑問，請電郵至 "&' + leaderEmail_()
        + '&" 或致電 "&' + leaderPhone_() + '&" 與本人聯絡。","")'],
    ]);
  } else {
    setupCells_(sh, [
      ['B36', '尚未領取證書之學員，可於區會辦公時間前往區總部領取證書。區會辦公時間請參閱www.skwscout.org.hk。'],
    ]);
  }
  sh.getRange('A14:L14').merge();
  sh.getRange('A16:L16').merge();
  sh.getRange('B36:J36').merge().setWrap(true).setVerticalAlignment('top');
}

// ===================== Print_接納通知書（跟實物書信版式） =====================
function buildPrintAccept_(ss) {
  var sh = setupSheet_(ss, 'Print_接納通知書', '#7e57c2');
  setupRows_(sh, [
    [13, '', '', '由：班領導人'],
    [14, '', '', '致：各申請者'],
    [15, '', '', '知會：訓練班職員'],
    [19, '閣下申請參加上述之訓練班，現已被接納，請屆時準時出席為荷！'],
    [21, '', '', '日期：'],
    [23, '', '', '報到時間：'],
    [25, '', '', '地點：'],
    [27, '', '', '服裝：', '', '整齊制服', '', '旅巾／領帶'],
    [28, '', '', '', '短褲／長褲（男）', '', '裙褲／長褲／裙（女）'],
    [30, '', '', '攜帶物品：'],
    [32, '', '', '其他：'],
    [34, '', '', '備註：'],
    [44, '', '', '', '', '', '', '', '', '班領導人'],
  ]);
  setupCells_(sh, [
    ['D4', "=IFERROR(MAX('" + IN2 + "'!B9:B16),\"\")"],
    ['C4', "=IF($D4=\"\",\"\",IFERROR(INDEX('" + IN2 + "'!D9:D16,MATCH($D4,'" + IN2 + "'!B9:B16,0)),\"\"))"],
    ['J12', '=TEXT(TODAY(),"yyyy年m月d日")'],
    ['A17', "='" + IN2 + "'!B1"],
    ['D21', "=IF('" + IN2 + "'!I9=\"\",\"\",'" + IN2 + "'!I9)"],
    ['D25', "=IF('" + IN2 + "'!K9=\"\",\"\",'" + IN2 + "'!K9)"],
    ['C39', '=IFERROR("如有任何疑問，請電郵至 "&' + leaderEmail_() + '&" 或致電 "&' + leaderPhone_() + '&" 與本人聯絡。","")'],
    ['I46', '=IFERROR(' + leaderName_() + ',"")'],
  ]);
  setupNote_(sh, 'D23', '如：晚上7時（第一節報到時間）。');
  setupNote_(sh, 'D30', '如：書寫用品及電腦或平版電腦。');
  setupNote_(sh, 'D32', '如出席要求。');
  sh.getRange('A17:L17').merge();
  sh.getRange('A19:L19').merge();
  sh.getRange('C39:J39').merge().setWrap(true);
}


// ===================== Print_學員名單（approved 自動列出） =====================
function buildPrintStudent_(ss) {
  var sh = setupSheet_(ss, 'Print_學員名單', '#7e57c2');
  setupRows_(sh, [
    [2, '學員名單'],
    [4, '分組', '學員編號', '中文姓名', '性別', '旅團', '聯絡電話', '家長/監護人聯絡電話', '電郵地址'],
  ]);
  setupCells_(sh, [
    ['A1', "='" + IN2 + "'!B1"],
    ['A5', "=IFERROR(FILTER('" + RESP_SHEET + "'!AJ2:AJ,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['B5', "=IFERROR(FILTER('" + RESP_SHEET + "'!AI2:AI,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['C5', "=IFERROR(FILTER('" + RESP_SHEET + "'!C2:C,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['D5', "=IFERROR(FILTER('" + RESP_SHEET + "'!F2:F,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['E5', "=IFERROR(FILTER('" + RESP_SHEET + "'!I2:I,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['F5', "=IFERROR(FILTER('" + RESP_SHEET + "'!E2:E,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['G5', "=IFERROR(FILTER('" + RESP_SHEET + "'!Q2:Q,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['H5', "=IFERROR(FILTER('" + RESP_SHEET + "'!B2:B,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
  ]);
  sh.getRange('A1:H1').merge();
  sh.getRange('A2:H2').merge();
}

// ===================== Print_學員出席紀錄（日期欄自動由 Input02 帶入） =====================
function buildPrintAttend_(ss) {
  var sh = setupSheet_(ss, 'Print_學員出席紀錄', '#7e57c2');
  setupRows_(sh, [
    [2, '出席紀錄'],
    [5, '分組', '學員編號', '中文姓名', '英文姓名'],
  ]);
  setupCells_(sh, [
    ['A1', "='" + IN2 + "'!B1"],
    ['E4', "=IF('" + IN2 + "'!B9=\"\",\"\",'" + IN2 + "'!B9)"],
    ['F4', "=IF('" + IN2 + "'!B10=\"\",\"\",'" + IN2 + "'!B10)"],
    ['G4', "=IF('" + IN2 + "'!B11=\"\",\"\",'" + IN2 + "'!B11)"],
    ['H4', "=IF('" + IN2 + "'!B12=\"\",\"\",'" + IN2 + "'!B12)"],
    ['I4', "=IF('" + IN2 + "'!B13=\"\",\"\",'" + IN2 + "'!B13)"],
    ['J4', "=IF('" + IN2 + "'!B14=\"\",\"\",'" + IN2 + "'!B14)"],
    ['K4', "=IF('" + IN2 + "'!B15=\"\",\"\",'" + IN2 + "'!B15)"],
    ['L4', "=IF('" + IN2 + "'!B16=\"\",\"\",'" + IN2 + "'!B16)"],
    ['A6', "=IFERROR(FILTER('" + RESP_SHEET + "'!AJ2:AJ,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['B6', "=IFERROR(FILTER('" + RESP_SHEET + "'!AI2:AI,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['C6', "=IFERROR(FILTER('" + RESP_SHEET + "'!C2:C,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['D6', "=IFERROR(FILTER('" + RESP_SHEET + "'!D2:D,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
  ]);
  setupDateFmt_(sh, 'E4:L4');
  sh.getRange('A1:L1').merge();
  sh.getRange('A2:L2').merge();
}

// ===================== Print_班職員名單（由 Input02 職員區帶入） =====================
function buildPrintStaff_(ss) {
  var sh = setupSheet_(ss, 'Print_班職員名單', '#7e57c2');
  setupRows_(sh, [
    [1, '香港童軍總會　筲箕灣區'],
    [5, '班職員名單'],
    [7, '職位', '姓名', '稱謂', '所屬單位 / 職銜'],
  ]);
  setupCells_(sh, [
    ['A2', "='" + IN2 + "'!B1"],
    ['A3', '=TEXTJOIN(", ",TRUE,ARRAYFORMULA(IF(\'' + IN2 + '\'!B9:B16="","",TEXT(\'' + IN2 + '\'!B9:B16,"dd/m/yyyy"))))'],
  ]);
  for (var r = 8; r <= 21; r++) {
    var sr = r + 15; // Input02 行 23–36
    setupCells_(sh, [
      ['A' + r, "=IF('" + IN2 + "'!A" + sr + "=\"\",\"\",'" + IN2 + "'!A" + sr + ")"],
      ['B' + r, "=IF('" + IN2 + "'!B" + sr + "=\"\",\"\",'" + IN2 + "'!B" + sr + ")"],
      ['C' + r, "=IF('" + IN2 + "'!C" + sr + "=\"\",\"\",'" + IN2 + "'!C" + sr + ")"],
      ['D' + r, "=IF('" + IN2 + "'!D" + sr + "=\"\",\"\",'" + IN2 + "'!D" + sr + ")"],
    ]);
  }
}

// ===================== Print_領取證書紀錄（B–G 版式） =====================
function buildPrintCert_(ss) {
  var sh = setupSheet_(ss, 'Print_領取證書紀錄', '#7e57c2');
  setupRows_(sh, [
    [1, '', '領取證書紀錄'],
    [3, '', '', '', '舉辦日期：'],
    [4, '', '', '', '班領導人：'],
    [6, '', '學員編號', '中文姓名', '旅號', '證書編號', '領取日期', '簽收'],
  ]);
  setupCells_(sh, [
    ['G3', '=TEXTJOIN(", ",TRUE,ARRAYFORMULA(IF(\'' + IN2 + '\'!B9:B16="","",TEXT(\'' + IN2 + '\'!B9:B16,"dd/m/yyyy"))))'],
    ['G4', '=IFERROR(' + leaderName_() + ',"")'],
    ['B7', "=IFERROR(FILTER('" + RESP_SHEET + "'!AI2:AI,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['C7', "=IFERROR(FILTER('" + RESP_SHEET + "'!C2:C,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['D7', "=IFERROR(FILTER('" + RESP_SHEET + "'!AD2:AD,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
  ]);
  setupNote_(sh, 'E7', '證書編號人手填。');
  setupNote_(sh, 'F7', '領取日期人手填。');
}

// ===================== Print_訓練班完成報告（人數自動計） =====================
function buildPrintDone_(ss) {
  var sh = setupSheet_(ss, 'Print_訓練班完成報告', '#7e57c2');
  setupRows_(sh, [
    [2, '訓練班完成報告'],
    [4, '舉　辦　日　期　：'],
    [5, '報班人數（本區）：', '', '', '', '報班人數（他區）：'],
    [6, '接納人數（本區）：', '', '', '', '接納人數（他區）：'],
    [7, '完　成　人　數　：', '', '', '', '合　格　人　數　：'],
    [9, '學員編號', '中文姓名', '旅號', '證書編號', '合格與否', '不合格原因'],
  ]);
  setupCells_(sh, [
    ['A1', "='" + IN2 + "'!B1"],
    ['C4', '=TEXTJOIN(", ",TRUE,ARRAYFORMULA(IF(\'' + IN2 + '\'!B9:B16="","",TEXT(\'' + IN2 + '\'!B9:B16,"d/m/yyyy"))))'],
    ['C5', "=COUNTIF('" + RESP_SHEET + "'!H2:H,\"*筲箕灣*\")"],
    ['F5', "=COUNTA('" + RESP_SHEET + "'!A2:A)-C5"],
    ['C6', "=COUNTIFS('" + RESP_SHEET + "'!H2:H,\"*筲箕灣*\",'" + RESP_SHEET + "'!AK2:AK,\"approved\")"],
    ['F6', "=COUNTIF('" + RESP_SHEET + "'!AK2:AK,\"approved\")-C6"],
    ['C7', '=COUNTA(E10:E31)'],
    ['F7', '=COUNTIF(E10:E31,"合格")'],
    ['A10', "=IFERROR(FILTER('" + RESP_SHEET + "'!AI2:AI,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['B10', "=IFERROR(FILTER('" + RESP_SHEET + "'!C2:C,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
    ['C10', "=IFERROR(FILTER('" + RESP_SHEET + "'!AD2:AD,'" + RESP_SHEET + "'!AK2:AK=\"approved\"),\"\")"],
  ]);
  setupNote_(sh, 'E10', '合格與否：填「合格」或不合格原因；上面完成／合格人數自動計。');
  sh.getRange('A1:F1').merge();
  sh.getRange('A2:F2').merge();
}

// ===================== Print_收支紀錄（總會收支計算表版式） =====================
function buildPrintBalance_(ss) {
  var sh = setupSheet_(ss, 'Print_收支紀錄', '#7e57c2');
  setupRows_(sh, [
    [1, 'THE SCOUT ASSOCIATION OF HONG KONG – Shau Kei Wan District'],
    [2, '香　港　童　軍　總　會　－　筲　箕　灣　區'],
    [3, 'STATEMENT OF INCOME AND EXPENDITURE FOR TRAINING COURSE'],
    [4, '訓　練　班　收　支　計　算　表'],
    [5, 'Course Name 訓練班名稱'],
    [6, 'Date 班 期'],
    [7, 'Venue 地 點'],
    [8, 'No. of Staff 班職員人數', '', 'No. of Candidates 學員人數'],
    [10, 'EXPENDITURE (支 出)', 'INCOME (收 入)'],
    [11, '', 'i. Revenue Expenditure:', '', '', '', '', '', '', '', 'i. Course Fee', '班 費'],
    [12, '', '', '', '', '', '', '', 'Staff', 'Candidates', 'Amount', 'ii. Subsidy', '津 貼'],
    [13, '', '1. Catering', '', '', '', '', '膳 食', '', '', '', 'iii. Others', '其 他'],
    [14, '', '2. Lodging/Venue Charges', '', '', '住宿/租場費'],
    [15, '', '3. Transportation', '', '', '交 通'],
    [16, '', '4. Administration', '', '', '行 政'],
    [17, '', '(Printing, Postage & Stationery 印刷,郵費及文具)'],
    [18, '', '5. Handouts & File Jackets', '', '', '講義及快勞'],
    [19, '', '6. Others', '', '', '', '', '其 他'],
    [21, '', 'Sub-total'],
    [22, '', 'ii. Capital Expenditure:'],
    [23, '', '7. Equipment', '', '', '', '', '設 備'],
    [24, '', '(See Overleaf)', '', '', '', '', '(見背頁)'],
    [25, '', 'Total', '', '', '', '', '', '', '總支出 $', '', 'Total', '總收入'],
    [26, '', 'Surplus/(Deficit)', '', '', '', '', '(尚餘/欠)'],
    [28, '*', 'Please delete whichever is impossible (請將不適者刪去)'],
    [30, '', 'Advanced Cash', '-', 'Cash Expenses', '= ', 'Surplus/(Deficit)*'],
    [31, '', '預支款項', '', '支出現金', '', '盈餘/ (不敷)'],
    [32, '', '', '-', '', '= '],
    [33, '*', 'Reimbursement paid to', '', 'on', '', 'Received by'],
    [34, '', '交還欠款予', '', '', '在', '', '', '簽收'],
    [35, '*', 'Surplus returned to', '', 'on', '', 'Received by'],
    [36, '', '餘款交還予', '', '', '', '', '在', '', '', '簽收'],
    [38, '', 'Prepared by', '', '(計算)', '', '(簽署)', 'Certified by', '(核對)', '', '(簽署)'],
    [39, '', 'Name in full', '', '(姓名)', '', '', 'Name in full', '(姓名)'],
    [40, '', 'Course Duty', '', '(職銜)', '', '', 'Course Duty', '(職銜)'],
    [41, '', 'Date', '', '(日期)', '', '', 'Date', '(日期)'],
    [43, '', 'Approved by', '', '(認可)', '', '(簽署)', 'Name in full', '(姓名)'],
    [44, '', 'Rank', '', '(職銜)', '', '', 'Date', '(日期)'],
    [46, '', 'Approved by', '', '(認可)', '', '(簽署)', 'Name in full', '(姓名)'],
    [47, '', 'Rank', '', '(職銜)', '', '', 'Date', '(日期)'],
    [49, '', 'Approved by', '', '(認可)', '', '(簽署)', 'Name in full', '(姓名)'],
    [50, '', 'Rank', '', '(職銜)', '', '', 'Date', '(日期)'],
  ]);
  var in4 = "'" + IN4 + "'!";
  setupCells_(sh, [
    ['B5', "='" + IN2 + "'!B1"],
    ['B6', '=TEXTJOIN(", ",TRUE,ARRAYFORMULA(IF(\'' + IN2 + '\'!B9:B16="","",TEXT(\'' + IN2 + '\'!B9:B16,"d/m/yyyy"))))'],
    ['B7', '=TEXTJOIN(", ",TRUE,\'' + IN2 + '\'!E9:E16)'],
    ['B8', "='" + IN2 + "'!B45"],
    ['D8', "=COUNTIF('" + RESP_SHEET + "'!AK2:AK,\"approved\")"],
    // 支出：自動由 Input04 小計帶入
    ['J13', '=' + in4 + 'B43'],
    ['H13', '=' + in4 + 'D43'],
    ['I13', '=' + in4 + 'C43'],
    ['J14', '=' + in4 + 'E43'],
    ['J15', '=' + in4 + 'F43'],
    ['J16', '=' + in4 + 'G43'],
    ['J18', '=' + in4 + 'H43'],
    ['J19', '=' + in4 + 'I43'],
    ['J21', '=SUM(H13:I13,J13:J19)'],
    ['J23', '=' + in4 + 'J43'],
    ['J25', '=J21+J23'],
    // 收入
    ['L11', "=IFERROR('" + IN2 + "'!B5*D8,\"\")"],
    ['M12', "='Print_財政預算'!B95"],
    ['M13', "='Print_財政預算'!H90"],
    ['M25', '=L11+M12+M13'],
    ['M26', '=M25-J25'],
    ['I39', '=IFERROR(' + leaderName_() + ',"")'],
  ]);
  setupNote_(sh, 'H13', '職員膳食（Input04 小計）。');
  setupNote_(sh, 'I13', '膳食津貼（Input04 小計）。');
  setupNote_(sh, 'I39', '核對人預設班領導人，可改。');
  setupNote_(sh, 'E40', '填計算人職銜（例如班務行政）。');
  setupNote_(sh, 'I40', '填核對人職銜（例如班領導人）。');
  setupMoney_(sh, 'J11:M26');
}


// ===================== Print_財政預算（總會預算表版式，預算欄自動由 Input01 帶入） =====================
function buildPrintBudget_(ss) {
  var sh = setupSheet_(ss, 'Print_財政預算', '#c62828');
  var in1 = "'" + IN1 + "'!";
  setupRows_(sh, [
    [2, '財政預算BUDGET'],
    [4, '支出Expenditure', '預算\nEstimated', '修訂\nRevised'],
    [5, '1.膳食Catering'],
    [6, '1.1', '早餐Breakfast', '', 'X'],
    [7, '1.2', '午餐Lunch', '', 'X'],
    [8, '1.3', '晚餐Dinner', '', 'X'],
    [9, '1.4', '茶點Snack', '', 'X'],
    [10, '', '', '(每餐\nper meal)', '', '(餐數\n# of meals)', '', '(人數\n# of participants)'],
    [11, '1.5', '飲用水 Water'],
    [12, '', '', '(單價unit price)', '', '(人數 # of participants)'],
    [13, '', '', '', '', '', '', '小計Sub total'],
    [15, '2. 租金Rent'],
    [16, '2.1', '場租Venue Charge (地點Location :', '', '', '', '）'],
    [17, '2.2', '露營 Camp', '', 'X'],
    [18, '2.3', '住宿 Lodging', '', 'X'],
    [19, '', '', '(每晚\nper night)', '', '(晚數\n# of nights)', '', '(人數\n# of participants)'],
    [20, '', '', '', '', '', '', '小計Sub total'],
    [22, '3. 交通/運輸Transportation'],
    [23, '3.1', '器材Equipment'],
    [24, '3.2', '職員Staff'],
    [25, '3.3', '學員Candidate'],
    [26, '', '', '', '', '', '', '小計Sub total'],
    [28, '4. 講義/場刊 Handouts/Leaflets'],
    [29, '4.1', '影印 Photocopy', '', 'X'],
    [30, '4.2', '光碟 CD Rom', '', 'X'],
    [31, '4.3', '快勞 File', '', 'X'],
    [32, '', '', '(單價unit price)', '', '(數量 quantity)'],
    [33, '', '', '', '', '', '', '小計Sub total'],
    [35, '5. 節目開支 Programme Expenses'],
    [36, '（非消耗品必須歸還區會，並填寫清單）'],
    [37, '', '', '', '', '', '', '小計Sub total'],
    [39, '6. 行政Administration'],
    [40, '6.1', '攝影Photo'],
    [41, '6.2', '印刷及郵費 Printing & Postage'],
    [42, '6.3', '文具Stationery'],
    [43, '', '', '', '', '', '', '小計Sub total'],
    [45, '7. 紀念品/獎品 Souvenir/Prize'],
    [46, '7.1', '紀念品 Souvenir'],
    [47, '', '(請同時填寫下面「申請訂造紀念品」部分'],
    [48, '', 'Pls also fill in the part "Application for Ordering Souvenir" below)'],
    [49, '7.2', '獎品 Prize'],
    [51, '', '', '', '', '', '', '小計Sub total'],
    [53, '申請訂造紀念品Application for Ordering Souvenir'],
    [55, '紀念品類別：'],
    [56, 'Type of souvenir', '', '(如紀念章、鎖匙扣等e.g. badge, key ring etc.)'],
    [58, '請在下列適當方格內加上ü號Please tick as appropriate'],
    [59, '設計 Design :', '', '', '□', '已夾附As attached'],
    [60, '', '', '', '□', '仍在進行中，將於 __________(日期) 遞交\nIn progress, will be submitted on __________(Date)'],
    [62, '用途 Purpose :', '', '', '□', '只當作紀念品，不會佩戴於制服上 For souvenirs only'],
    [63, '', '', '', '□', '由至期間內可佩戴於制服上。\n（申請 *已獲批核/正在批核）'],
    [64, '', '', '', 'Will be worn on uniform from __________ to __________.\n (Application *Approved / In progress )'],
    [66, '分派方法 Distribution Method :', '', '', '□', '免費派發予各參加者，或/及\nFree for participants and/or'],
    [67, '', '', '', '□', '每個售價為港幣元\nTo be sold at HK$ __________each'],
    [69, '製作數量 Quantity :', '', '', '', '', '件'],
    [71, '製作費用Production Cost :', '', '', 'HK$____________________ (每件HK$____________ each X 數量Quantity ____________ )'],
    [73, '', '', '', '% 由參加者支付by participants'],
    [74, '', '', '% 由區總部支付by District Headquarters'],
    [75, '', '', '', '% 由________________捐助'],
    [76, '', '', '', '（Donated by ________________ 捐助）'],
    [77, '*請刪去不適用者Please delete where inapplicable'],
    [79, '8. 其他 Miscelleous (請註明 Pls specify)'],
    [81, '', '', '', '', '', '', '小計Sub total'],
    [83, '總支出Total Expenditure'],
    [85, '收入Income', '預算Estimated', '修訂Revised'],
    [87, '1', '參加費用Participation Fee', '', '', '', 'X'],
    [88, '', '', '', '', '(單價unit price)', '', '(數目 Number)'],
    [89, '2', '其他收入Other income （請註明 Pls specify）'],
    [90, '2.1', '總會津貼'],
    [91, '2.2'],
    [93, '總收入Total Income'],
    [95, '項目批准總預算\nBudget Approved', '', '是次活動申請津貼\nSubsidy Required'],
    [97, '如須申請額外津貼，請填寫下面有關部份，並由副區總監審批。'],
    [98, 'Please fill in “Application for Supplementary Subsidy” below for DDC’s approval if required.'],
    [100, '申請額外津貼 Application for Supplementary Subsidy'],
    [101, '申請額外津貼', '', '原因\nReason'],
    [102, 'Supplementary Subsidy Requested'],
    [105, '每位/每隊費用以項目計算如下', '', '', '', '', '', '活動負責人簽署\nSignature of Person-in-charge'],
    [106, 'Break down of participation fee per unit'],
    [107, '1.', '膳食 Catering', '', '$'],
    [108, '2.', '場租Venue Charge', '', '$'],
    [109, '3.', '住宿 Lodging', '', '$', '', '', '', '正楷姓名 Name in Block Letters'],
    [110, '4.', '交通/運輸 Transportation', '', '$'],
    [111, '5.', '講義 Handout', '', '$', '', '', '', '職位 Rank'],
    [112, '6.', '節目開支\nProgramme Expenses', '$'],
    [113, '7.', '行政 Administration', '', '$', '', '', '', '日期Date'],
    [114, '8.', '紀念品 Souvenir', '', '$'],
    [115, '9.', '獎品 Prize', '', '$', '', '', '', '備註\nRemarks'],
    [116, '10.', '其他 Others', '', '$'],
    [117, '', '', '合計Total', '$'],
    [119, '認許RECOGNITION'],
    [120, '審核 Checked by', '批准 Approved by'],
    [122, '正楷姓名 Name in Block Letters', '正楷姓名 Name in Block Letters'],
    [124, '職位 Rank ：', '', '助理區總監（）', '', '', '職位 Rank：', '', '副區總監（ ）'],
    [125, '', '', 'ADC ( )', '', '', '', '', 'DDC ( )'],
    [126, '日期 Date ：', '', '', '', '', '日期 Date ：'],
    [129, '額外津貼認許RECOGNITION FOR SUPPLEMENTARY SUBSIDY'],
    [130, '□', '批准金額HK$____________ approved .'],
    [131, '□', '不批准。Not approved.'],
    [132, '', '原因 reasons：'],
    [133, '副區總監簽署', '', '', '', '', '日期Date ：'],
    [134, 'Signature of Deputy District Commissioner'],
    [138, '以下由筲箕灣童軍區會填寫For Office Use Only'],
    [139, '收表日期Date Received', '', '', '', '', '通告編號Circular Number'],
  ]);
  setupCells_(sh, [
    ['A1', "='" + IN1 + "'!B1"],
    // 1. 膳食（單價／餐數／人數由 Input01 平均數帶入）
    ['C6', '=' + in1 + 'E40'], ['E6', '=' + in1 + 'E42'], ['G6', '=' + in1 + 'E41'],
    ['H6', '=IFERROR(C6*E6*G6,"")'],
    ['C7', '=' + in1 + 'F40'], ['E7', '=' + in1 + 'F42'], ['G7', '=' + in1 + 'F41'],
    ['H7', '=IFERROR(C7*E7*G7,"")'],
    ['C8', '=' + in1 + 'G40'], ['E8', '=' + in1 + 'G42'], ['G8', '=' + in1 + 'G41'],
    ['H8', '=IFERROR(C8*E8*G8,"")'],
    ['C9', '=' + in1 + 'H40'], ['E9', '=' + in1 + 'H42'], ['G9', '=' + in1 + 'H41'],
    ['H9', '=IFERROR(C9*E9*G9,"")'],
    ['C11', '=' + in1 + 'I40'], ['E11', '=' + in1 + 'I41'],
    ['H11', '=IFERROR(C11*E11,"")'],
    ['H13', '=SUM(H6:H9,H11)'],
    // 2. 租金
    ['H16', '=' + in1 + 'M50'],
    ['C17', '=' + in1 + 'H57'], ['E17', '=' + in1 + 'F57'], ['G17', '=' + in1 + 'G57'],
    ['H17', '=' + in1 + 'M57'],
    ['C18', '=' + in1 + 'H65'], ['E18', '=' + in1 + 'F65'], ['G18', '=' + in1 + 'G65'],
    ['H18', '=' + in1 + 'M65'],
    ['H20', '=SUM(H16:H18)'],
    // 3. 交通
    ['H23', '=' + in1 + 'M69'],
    ['H24', '=' + in1 + 'M71'],
    ['H25', '=' + in1 + 'M73'],
    ['H26', '=SUM(H23:H25)'],
    // 4. 講義
    ['C29', '=' + in1 + 'H79'], ['E29', '=' + in1 + 'G79'], ['H29', '=' + in1 + 'M79'],
    ['C30', '=' + in1 + 'H80'], ['E30', '=' + in1 + 'G80'], ['H30', '=' + in1 + 'M80'],
    ['C31', '=' + in1 + 'H81'], ['E31', '=' + in1 + 'G81'], ['H31', '=' + in1 + 'M81'],
    ['H33', '=SUM(H29:H31)'],
    // 5–8
    ['B35', '=' + in1 + 'M88'],
    ['H37', '=IF(B35="","",B35)'],
    ['H40', '=' + in1 + 'M91'],
    ['H41', '=' + in1 + 'M92'],
    ['H42', '=' + in1 + 'M93'],
    ['H43', '=SUM(H40:H42)'],
    ['H46', '=' + in1 + 'M97'],
    ['H49', '=' + in1 + 'M98'],
    ['H51', '=SUM(H46,H49)'],
    ['B79', '=' + in1 + 'M105'],
    ['H81', '=IF(B79="","",B79)'],
    ['B83', '=SUM(H13,H20,H26,H33,H37,H43,H51,H81)'],
    // 收入
    ['E87', '=' + in1 + 'B12'],
    ['G87', '=' + in1 + 'B11'],
    ['H87', '=IFERROR(E87*G87,"")'],
    ['B93', '=SUM(H87,H90)'],
    // 總額：B95 批准總預算（人手填，區會批）；D95 申請津貼＝總支出−總收入
    ['D95', '=IFERROR(B83-B93,"")'],
    // 每位費用 breakdown（各項小計 ÷ 人數）
    ['E107', '=IFERROR(H13/G87,"")'],
    ['E108', '=IFERROR(H16/G87,"")'],
    ['E109', '=IFERROR((H17+H18)/G87,"")'],
    ['E110', '=IFERROR(H26/G87,"")'],
    ['E111', '=IFERROR(H33/G87,"")'],
    ['E112', '=IFERROR(H37/G87,"")'],
    ['E113', '=IFERROR(H43/G87,"")'],
    ['E114', '=IFERROR(H46/G87,"")'],
    ['E115', '=IFERROR(H49/G87,"")'],
    ['E116', '=IFERROR(H81/G87,"")'],
    ['E117', '=SUM(E107:E116)'],
    ['E118', '=IFERROR(E117-E87,"")'],
  ]);
  setupNote_(sh, 'B95', '批准總預算：區會批核後填。D95 申請津貼＝總支出(B83) − 總收入(B93)，自動計。');
  setupNote_(sh, 'H90', '總會津貼：獲批後填（Print_總會資助計劃嗰邊嘅數）。');
  setupNote_(sh, 'C83', '修訂欄：預算有變動填呢度（唔好改 Input01 原預算）。');
  setupMoney_(sh, 'B6:I118');
  sh.getRange('A4:I4').setWrap(true);
  sh.getRange('A95:I95').setWrap(true);
  sh.getRange('A101:I102').setWrap(true);
  sh.getRange('A105:I106').setWrap(true);
  sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 150);
}


// ===================== Print_總會資助計劃（總會 App. 附件2 版式） =====================
function buildPrintSubsidy_(ss) {
  var sh = setupSheet_(ss, 'Print_總會資助計劃', '#7e57c2');
  setupRows_(sh, [
    [1, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'App. 附件2'],
    [2, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '(03/2025)'],
    [3, 'Scout Association of Hong Kong 香港童軍總會'],
    [4, 'Subsidy Scheme for Scout Training 青少年成員及童軍領袖訓練資助計劃 (2025-26)'],
    [5, 'Result Sheet of Approved Subsidized Item 獲資助項目成績總表'],
    [6, '（for Youth Members & Leaders 青少年成員及領袖適用）'],
    [8, '', 'Name of the Approved Subsidized Item', '', '', '', '', '', '', '', '', '', 'Organizing Unit'],
    [9, '', '獲資助項目名稱', '', '', '', '', '', '', '', '', '', '舉辦單位'],
    [11, 'Venue', '', '', '', 'Start Date', '', '', 'End Date', '', '', '', 'No. of Days', '', '', '', 'Fee of Participation (before Subsidy)'],
    [12, '舉辦地點', '', '開始日期', '', '完成日期', '', '', '日數', '', '', '參加費用（原本費用）'],
    [14, '', 'Name of In-charge of \nthe Approved Subsidized Item', '', '', '', 'Training Rank', '', '', '', 'No. of Participants Completed the Subsidized Item'],
    [15, '', '獲資助項目負責人姓名', '', '', '訓練職銜', '', '', '', '', '', '完成人數'],
    [18, 'No.\n編號', 'Name\n姓名', 'Region / Branch\n地域／署', 'District\n區', 'Group No.\n旅號', 'Scout Position\n童軍職位', 'Age of \nYouth Member \n青少年成員年齡\n(if applicable 如適用)', 'Certificate No.\n學員修業證書編號\n (if any 如適用)', 'Amount of Subsidy\n資助額', 'Remarks\n備註*'],
    [20, '', 'English\n英文', 'Chinese\n中文', '', '', '', '', '', 'Half\n半額', 'Full\n全額'],
    [53, '* If candidate did not complete the approved subsidized item, please provide reason in the Remarks column, eg "absent" or "failed".'],
    [54, '如學員未能完成獲資助項目，請於備註欄填寫原因，例如︰「缺席」或「不合格」。'],
    [58, 'Date', '', '', '', 'Signature of In-charge of the Approved Subsidized Item'],
    [59, '日期', '', '', '', '獲資助項目負責人簽署'],
  ]);
  setupCells_(sh, [
    ['D8', "='" + IN2 + "'!B1"],
    ['N8', '筲箕灣區'],
    ['B11', '=TEXTJOIN(", ",TRUE,\'' + IN2 + '\'!E9:E16)'],
    ['F11', "=IFERROR(MIN('" + IN2 + "'!B9:B16),\"\")"],
    ['I11', "=IFERROR(MAX('" + IN2 + "'!B9:B16),\"\")"],
    ['M11', "=COUNTA('" + IN2 + "'!B9:B16)"],
    ['C14', '=IFERROR(' + leaderName_() + ',"")'],
    ['G14', '=IFERROR(VLOOKUP("班領導人",\'' + IN2 + '\'!A23:G42,4,FALSE),"")'],
    ['L14', "=COUNTIF('Print_訓練班完成報告'!E10:E31,\"合格\")"],
    ['Q53', 'Sub total 小計（HK$）：'], ['R53', '－'], ['S53', '－'],
    ['Q54', 'Total 總計（HK$）：'], ['R54', '－'],
  ]);
  for (var r = 22; r <= 51; r++) sh.getRange(r, 1).setValue(r - 21); // 編號 1–30
  setupNote_(sh, 'Q11', '原本費用（資助前）：人手填。');
  setupNote_(sh, 'A22', '學員列人手填（總會表格）；完成人數（L14）自動由完成報告計。');
  setupDateFmt_(sh, 'F11');
  setupDateFmt_(sh, 'I11');
  setupMoney_(sh, 'Q11');
  sh.getRange('A18:J18').setWrap(true).setVerticalAlignment('top');
  sh.getRange('A20:J20').setWrap(true);
}

// ===================== HTTP 入口 =====================

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (x) {}
  var action = (body.action || '').toString();
  switch (action) {
    case 'addReg':        return json(addReg_(body));
    case 'listRegs':      return json(listRegs_(body));
    case 'setRegStatus':  return json(setRegStatus_(body));
    case 'getCourseProfile': return json(getCourseProfile_(body));
    case 'getCourseSheetRaw': return json(getCourseSheetRaw_(body));
    default:              return json(err('未知的 action: ' + action));
  }
}

function doGet(e) {
  var p = e.parameter;
  if (!authKey_(p.apiKey)) return json(err('Unauthorized: invalid or missing apiKey'));
  if ((p.action || '') === 'stats') return json(ok({ count: countRegs_() }));
  return json(err('未知的 action'));
}

// ===================== Sheet Raw（新制直入＋網頁列印：成份 raw 數據） =====================
// 區管理平台「新制直入」讀返班 Sheet 資料＋12 張列印用（經區後台 pullCourseSheetRaw）。
// 唔喺度 parse：等訓練班 Script 同區後台 direct-read 回傳同一形狀，前端統一 parse。
function getCourseSheetRaw_(b) {
  if (!authKey_(b.apiKey)) return err('Unauthorized: invalid or missing apiKey');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dump = function (name) {
    var sh = ss.getSheetByName(name);
    return sh ? sh.getDataRange().getValues() : [];
  };
  var pw = [];
  var ps = ss.getSheetByName(PARAM_SHEET);
  if (ps) {
    try { pw = ps.getRange('W1:X5').getValues(); } catch (e) { pw = []; }
  }
  return ok({
    input01: dump(IN1), input02: dump(IN2), input03: dump(IN3), input04: dump(IN4),
    resp: dump(RESP_SHEET), paramsWX: pw,
    notice: dump('Print_通告'), accept: dump('Print_接納通知書'),
    finance: dump('Print_財政預算'), completion: dump('Print_訓練班完成報告'),
    cert: dump('Print_領取證書紀錄'), subsidy: dump('Print_總會資助計劃'),
    pulledAt: new Date().toISOString(),
  });
}

// ===================== Course Profile（開班自動填表＋通告預填） =====================
// 讀 Input01 訓練班預算＋Input02 訓練班資料＋Print_通告 → 結構化 JSON。
// circular 由 Print_通告 B 欄 label 讀（參加資格／費用／名額／截止／報名辦法／
// 服裝／備註／查詢＋G12 檔案編號／G13 發出日期／E43 署名／E45 代行），
// 冇 Print_通告就回 null，供區管理平台通告記錄一鍵預填，ADC 唔使再打。
// 全部用 A 欄 label 對位（唔寫死行號），容忍 template 版同實填版行號差異：
//   實填版 Input02：B1 名稱／B4 名額／B5 收費／B6 職員／第 8 行表頭＋第 9 行起節次／
//     B18 截止／B19 公佈／第 22 行職員表頭＋第 23 行起職員（A–G：職位／姓名／稱謂／
//     單位／資格／電話／電郵）／B45 總人數／B46 常駐人數。

function getCourseProfile_(b) {
  if (!authKey_(b.apiKey)) return err('Unauthorized: invalid or missing apiKey');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s2 = ss.getSheetByName('Input02 訓練班資料');
  if (!s2) return err('找不到「Input02 訓練班資料」分頁（請先執行 setupCourseSheet）');
  var s1 = ss.getSheetByName('Input01 訓練班預算');

  var v2 = s2.getDataRange().getValues();
  var profile = {
    courseName: profileValByLabel_(v2, '活動/訓練班名稱', 1),
    quota: profileValByLabel_(v2, '名額', 1),
    fee: profileValByLabel_(v2, '預計收費', 1),
    staffCount: profileValByLabel_(v2, '職員人數', 1),
    deadline: profileDateByLabel_(v2, '截止報名日期', 1),
    publishDate: profileDateByLabel_(v2, '最遲公佈取錄名單日', 1),
    totalStaff: profileValByLabel_(v2, '班職員總人數', 1),
    residentStaff: profileValByLabel_(v2, '常駐班職員人數', 1),
    sessions: profileSessions_(v2),
    staff: profileStaff_(v2),
    // Input01（預算；冇呢頁就留空，唔報錯）
    edition: '', section: '', badge: '', customName: '', form1: '', form2: '',
    expectedIntake: '', expectedFee: '', expectedStaff: '',
    budgetDates: [], budgetApproved: '', subsidyRequired: '',
  };
  if (s1) {
    var v1 = s1.getDataRange().getValues();
    if (!profile.courseName) profile.courseName = profileValByLabel_(v1, '活動/訓練班名稱', 1);
    profile.edition = profileValByLabel_(v1, '屆別', 1);
    profile.section = profileValByLabel_(v1, '支部', 1);
    profile.badge = profileValByLabel_(v1, '專章', 1);
    profile.customName = profileValByLabel_(v1, '自定義名稱', 1);
    profile.form1 = profileValByLabel_(v1, '形式-1', 1);
    profile.form2 = profileValByLabel_(v1, '形式-2', 1);
    profile.expectedIntake = profileValByLabel_(v1, '預計收生人數', 1);
    profile.expectedFee = profileValByLabel_(v1, '預計收費', 1);
    profile.expectedStaff = profileValByLabel_(v1, '職員人數', 1);
    profile.budgetDates = profileBudgetDates_(v1);
    profile.budgetApproved = profileValContains_(v1, '批准總預算', 1);
    profile.subsidyRequired = profileValContains_(v1, '申請津貼', 1);
  }
  // 通告內文（Print_通告；冇就 null）
  profile.circular = profileCircular_(ss);
  // 班領導人 = 職位含「班領導人」嘅第一行（prefer 正職）
  profile.leader = null;
  for (var i = 0; i < profile.staff.length; i++) {
    if (String(profile.staff[i].role || '').indexOf('班領導人') >= 0) { profile.leader = profile.staff[i]; break; }
  }
  profile.pulledAt = new Date().toISOString();
  return ok(profile);
}

/** A 欄 label 完全相符 → 回該行第 colIndex 欄（0-based）trim 後字串 */
function profileValByLabel_(values, label, colIndex) {
  for (var r = 0; r < values.length; r++) {
    if (String(values[r][0] == null ? '' : values[r][0]).trim() === label) {
      return String(values[r][colIndex] == null ? '' : values[r][colIndex]).trim();
    }
  }
  return '';
}

/** A 欄包含關鍵字 → 回該行第 colIndex 欄（預算總額嗰類 label 用） */
function profileValContains_(values, keyword, colIndex) {
  for (var r = 0; r < values.length; r++) {
    if (String(values[r][0] == null ? '' : values[r][0]).indexOf(keyword) >= 0) {
      return String(values[r][colIndex] == null ? '' : values[r][colIndex]).trim();
    }
  }
  return '';
}

/** A 欄 label → 該格 raw 值正規化做日期（Date 物件／字串都收） */
function profileDateByLabel_(values, label, colIndex) {
  for (var r = 0; r < values.length; r++) {
    if (String(values[r][0] == null ? '' : values[r][0]).trim() === label) {
      return profileDate_(values[r][colIndex]);
    }
  }
  return '';
}

/** A 欄 label 完全相符 → 回行號（0-based），搵唔到回 -1 */
function profileRowOf_(values, label) {
  for (var r = 0; r < values.length; r++) {
    if (String(values[r][0] == null ? '' : values[r][0]).trim() === label) return r;
  }
  return -1;
}

/** 日期正規化 → yyyy-MM-dd（Date 物件／d/m/yyyy 字串／本身 ISO 都收；失敗回原文 trim） */
function profileDate_(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var zh = s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (zh) return zh[1] + '-' + ('0' + zh[2]).slice(-2) + '-' + ('0' + zh[3]).slice(-2);
  var m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    var d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
    }
  }
  return s.slice(0, 20);
}

/** Input02 節次：活動日期及場地 → 截止報名日期 之間；表頭行自動對欄。
 *  實填版：表頭行喺 label 上面一行，且 label 行本身就係第一節資料；
 *  template 版：label 行本身就係表頭。所以表頭由上而下搵，資料由 label 行開始讀。 */
function profileSessions_(v) {
  var start = profileRowOf_(v, '活動日期及場地');
  var end = profileRowOf_(v, '截止報名日期');
  if (start < 0) return [];
  if (end < 0) end = v.length;
  // 表頭行：先掃 label 上面 4 行，再掃 label 行起 3 行（template 版 label 行即表頭）
  var hdr = -1, dateC = 1, timeC = 3, venueC = 4, ddC = -1, dtC = -1, dvC = -1;
  var isHdr = function (r) { return /日期|時間|場地|通告顯示|dd\/mm/i.test(v[r].join(' ')); };
  for (var r = Math.max(0, start - 4); r < start; r++) {
    if (isHdr(r)) { hdr = r; break; }
  }
  if (hdr < 0) {
    for (var r2 = start; r2 < end && r2 < start + 3; r2++) {
      if (isHdr(r2)) { hdr = r2; break; }
    }
  }
  if (hdr >= 0) {
    for (var c = 0; c < v[hdr].length; c++) {
      var h = String(v[hdr][c] == null ? '' : v[hdr][c]);
      if (h.indexOf('通告顯示日期') >= 0) ddC = c;
      else if (h.indexOf('通告顯示時間') >= 0) dtC = c;
      else if (h.indexOf('通告顯示地點') >= 0) dvC = c;
      else if (h === '日期' || h.indexOf('dd/mm') >= 0 || h.indexOf('dd/MM') >= 0) dateC = c;
      else if (h.indexOf('時間') >= 0 && h.indexOf('通告') < 0 && h.indexOf('需時') < 0) timeC = c;
      else if ((h.indexOf('場地') >= 0 || h === '地點') && h.indexOf('通告') < 0) venueC = c;
    }
  }
  var out = [];
  var cell = function (row, c) { return c < 0 ? '' : String(row[c] == null ? '' : row[c]).trim(); };
  for (var i = start; i < end; i++) {
    if (i === hdr) continue;
    var rawCell = dateC < 0 ? '' : v[i][dateC];
    if (rawCell === '' || rawCell == null) continue;
    if (/日期|dd\/mm/i.test(String(rawCell))) continue;
    var dd = cell(v[i], ddC);
    var flag = ddC > 0 ? v[i][ddC - 1] : '';
    var flagOff = (flag === false || String(flag).trim().toUpperCase() === 'FALSE');
    out.push({
      date: profileDate_(rawCell),
      time: cell(v[i], timeC),
      venue: cell(v[i], venueC),
      displayDate: dd, displayTime: cell(v[i], dtC), displayVenue: cell(v[i], dvC),
      showOnCircular: !!dd && !flagOff,
    });
    if (out.length >= 60) break;
  }
  return out;
  function c0(row, c) { return c < 0 ? '' : String(row[c] == null ? '' : row[c]).trim(); }
}

/** Input02 職員：含「職位＋姓名」嘅表頭行之後，直到總人數行／表尾 */
function profileStaff_(v) {
  var hdr = -1;
  var end = v.length;
  for (var r = 0; r < v.length; r++) {
    var a = String(v[r][0] == null ? '' : v[r][0]).trim();
    if (a === '班職員總人數' || a === '常駐班職員人數') { end = Math.min(end, r); }
  }
  for (var i = 0; i < end; i++) {
    var joined = v[i].join(' ');
    if (joined.indexOf('職位') >= 0 && joined.indexOf('姓名') >= 0) { hdr = i; break; }
  }
  if (hdr < 0) return [];
  var roleC = 0, nameC = 1, titleC = 2, unitC = 3, qualC = -1, phoneC = 4, emailC = 5;
  for (var c = 0; c < v[hdr].length; c++) {
    var h = String(v[hdr][c] == null ? '' : v[hdr][c]);
    if (!h) continue;
    if (h.indexOf('職位') >= 0) roleC = c;
    else if (h.indexOf('姓名') >= 0) nameC = c;
    else if (h.indexOf('稱謂') >= 0) titleC = c;
    else if (h.indexOf('資格') >= 0) qualC = c;
    else if (h.indexOf('單位') >= 0 || h.indexOf('職銜') >= 0) unitC = c;
    else if (h.indexOf('電話') >= 0) phoneC = c;
    else if (h.indexOf('電郵') >= 0 || h.toLowerCase().indexOf('email') >= 0) emailC = c;
  }
  var out = [];
  var cell = function (row, x) { return x < 0 ? '' : String(row[x] == null ? '' : row[x]).trim(); };
  for (var j = hdr + 1; j < end; j++) {
    var role = cell(v[j], roleC), name = cell(v[j], nameC);
    if (!role && !name) continue;
    out.push({
      role: role, name: name, title: cell(v[j], titleC), unit: cell(v[j], unitC),
      qualification: cell(v[j], qualC), phone: cell(v[j], phoneC), email: cell(v[j], emailC),
    });
    if (out.length >= 60) break;
  }
  return out;
}


/** Print_通告 → circular（B 欄 label 對位；冇呢頁回 null）
 * 讀：參加資格／費用(C24)＋FPS 段(C25)／名額／截止／報名辦法／服裝／
 * 備註（備註行起直到查詢行）／查詢／A15 標題／G12 檔案編號／G13 發出日期／E43 署名／E45 代行 */
function profileCircular_(ss) {
  var sh = ss.getSheetByName('Print_通告');
  if (!sh) return null;
  var v = sh.getDataRange().getValues();
  var norm = function (x) { return String(x == null ? '' : x).replace(/[\s　:：]/g, ''); };
  var c = function (r, col) {
    if (r < 0 || r >= v.length || col >= v[r].length) return '';
    return String(v[r][col] == null ? '' : v[r][col]).trim();
  };
  var findB = function (kw) {
    for (var r = 0; r < v.length; r++) {
      if (norm(v[r][1]).indexOf(kw) >= 0) return r;
    }
    return -1;
  };
  var rLeader = findB('班領導人'), rElig = findB('參加資格'), rFee = findB('費用'),
      rQuota = findB('名額'), rDead = findB('截止'), rSignup = findB('報名辦法'),
      rUniform = findB('服裝'), rRemark = findB('備註'), rEnq = findB('查詢');
  var remarks = [];
  if (rRemark >= 0) {
    var rEnd = rEnq >= 0 ? rEnq : v.length;
    for (var i = rRemark; i < rEnd && i < rRemark + 12; i++) {
      var t = c(i, 2);
      if (t) remarks.push(t);
    }
  }
  var fileRaw = c(11, 6);
  var fileNo = fileRaw.replace(/.*檔案編號\s*:?\s*/i, '').replace(/.*編號\s*:?\s*/, '').trim();
  if (fileNo === fileRaw.trim()) fileNo = /[0-9Xx]{2,}/.test(fileNo) ? fileNo : '';
  var issueRaw = c(12, 6);
  var deputyRaw = c(44, 4);
  return {
    title: c(14, 0),
    fileNo: fileNo, fileNoRaw: fileRaw.trim(),
    issueDate: issueRaw.trim(), issueDateISO: profileDate_(issueRaw),
    leaderText: rLeader >= 0 ? c(rLeader, 2) : '',
    eligibility: rElig >= 0 ? c(rElig, 2) : '',
    feeText: rFee >= 0 ? c(rFee, 2) : '',
    payText: (rFee >= 0 && norm(v[rFee + 1] ? v[rFee + 1][1] : '') === '') ? c(rFee + 1, 2) : '',
    quotaText: rQuota >= 0 ? c(rQuota, 2) : '',
    deadlineText: rDead >= 0 ? c(rDead, 2) : '',
    signupText: rSignup >= 0 ? c(rSignup, 2) : '',
    uniform: rUniform >= 0 ? c(rUniform, 2) : '',
    remarks: remarks,
    enquiry: rEnq >= 0 ? c(rEnq, 2) : '',
    signer: c(42, 4),
    deputy: deputyRaw.replace(/[（）()\s]/g, '').replace(/代行/g, ''),
    deputyRaw: deputyRaw.trim(),
  };
}

/** Input01 預算日期：活動日期及場地 → 財政預算／支出分類／截止報名日期 之間（B 日期／C 時間／E 場地） */
function profileBudgetDates_(v) {
  var start = profileRowOf_(v, '活動日期及場地');
  if (start < 0) return [];
  var end = v.length;
  ['財政預算', '支出分類', '截止報名日期'].forEach(function (label) {
    var r = profileRowOf_(v, label);
    if (r > start) end = Math.min(end, r);
  });
  var out = [];
  for (var i = start; i < end; i++) {
    var rawCell = v[i][1];
    if (rawCell === '' || rawCell == null) continue;
    if (/日期|dd\/mm/i.test(String(rawCell))) continue;
    out.push({
      date: profileDate_(rawCell),
      time: String(v[i][2] == null ? '' : v[i][2]).trim(),
      venue: String(v[i][4] == null ? '' : v[i][4]).trim(),
    });
    if (out.length >= 60) break;
  }
  return out;
}

// ===================== 收表（intake）寫入「表格回應」 =====================

function addReg_(b) {
  if (!authKey_(b.apiKey)) return err('Unauthorized: invalid or missing apiKey');
  if (!b.nameZh || !b.phone || !b.email) return err('資料不完整');
  if (!b.receiptDataUrl) return err('請上傳入數紙截圖。未繳費將不獲處理申請');
  // 防重複：同一電郵 + 非已取消 只准一次
  var dupe = readRespRows_().filter(function (r) {
    return String(r['電郵地址']).trim().toLowerCase() === String(b.email).trim().toLowerCase()
      && String(r['審批狀態']).toLowerCase() !== 'cancelled';
  });
  if (dupe.length) return err('此電郵已報名，請勿重複提交。');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(RESP_SHEET);
  if (!sh) return err('尚未執行 setupCourseSheet()');

  var submittedAt = new Date().toISOString();
  var ref = 'CRS-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + Math.floor(Math.random() * 9000 + 1000);

  // 入數紙存入本班 Drive 資料夾（folder 權限，唔開 link）
  var receiptUrl = saveReceipt_(b.receiptDataUrl, b.receiptFileName || '入數紙', b.receiptMimeType || 'image/jpeg');
  if (!receiptUrl) return err('入數紙儲存失敗（未設定入數紙資料夾）。請聯絡負責職員。');

  var newRow = sh.getLastRow() + 1; // appendRow 會寫入呢行；公式用佢做行號
  var row = {};
  RESP_HEADERS.forEach(function (h) { row[h] = ''; });
  row['旅號'] = '=IF(I' + newRow + '="","",IFERROR(REGEXEXTRACT(TO_TEXT(I' + newRow + '),"\\d+"),""))';
  row['學員編號'] = '=IF(AC' + newRow + '<>"✔","",COUNTIF(AC$2:AC' + newRow + ',"✔"))';
  row['時間戳記'] = submittedAt;
  row['電郵地址'] = b.email;
  row['中文姓名'] = b.nameZh;
  row['英文姓名'] = b.nameEn || '';
  row['聯絡電話'] = b.phone;
  row['性別'] = b.gender || '';
  row['出生日期'] = b.dob || '';
  row['所屬童軍區'] = b.scoutDistrict || '';
  row['旅團'] = b.troop || '';
  row['童軍成員編號（ScoutID）'] = b.scoutId || '';
  row['童軍職位'] = b.scoutPosition || '';
  row['附加資料(有助訓練班取錄之原因)'] = b.extra || '';
  row['家長／監護人同意參與有關活動。'] = b.guardianConsent || '';
  row['家長/監護人姓名'] = b.guardianName || '';
  row['與申請人關係'] = b.guardianRelation || '';
  row['家長/監護人聯絡電郵'] = b.guardianEmail || '';
  row['家長/監護人聯絡電話'] = b.guardianPhone || '';
  row['所屬童軍旅領袖同意參與有關活動。'] = b.leaderConsent || '';
  row['領袖姓名（中文全名）'] = b.leaderName || '';
  row['領袖職位'] = b.leaderPosition || '';
  row['領袖聯絡電郵'] = b.leaderEmail || '';
  row['付款方式'] = b.payMethod || 'FPS';
  row['付款人姓名'] = b.payerName || '';
  row['付款帳戶'] = b.payAccount || '';
  row['已繳付訓練班費用截圖'] = receiptUrl;
  row['已填妥之表格截圖(上課時需交回正本)'] = b.formUrl || '';
  row['是否需要收據'] = b.needReceipt || '';
  row['備註'] = b.note || '';
  row['接納'] = '';
  row['審批狀態'] = 'pending';
  row['批核人'] = '';
  row['批核時間'] = '';
  row['_courseId'] = b.courseId || '';
  row['_courseTitle'] = b.courseTitle || '';
  row['_section'] = b.section || '';
  row['_badgeCode'] = b.badgeCode || '';
  row['_ref'] = ref;
  appendRowObj_(sh, row);
  return { ok: true, refCode: ref };
}

// ===================== 批核（list + set status） =====================

function listRegs_(b) {
  if (!authKey_(b.apiKey)) return err('Unauthorized: invalid or missing apiKey');
  var rows = readRespRows_().map(toRegObj_).reverse();
  return ok(rows);
}

function setRegStatus_(b) {
  if (!authKey_(b.apiKey)) return err('Unauthorized: invalid or missing apiKey');
  var status = String(b.status || '').toLowerCase();
  if (STATUS.indexOf(status) < 0) return err('狀態不正確');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(RESP_SHEET);
  var idx = rowIndexByCol_(sh, '時間戳記', String(b.id).trim());
  if (idx < 0) return err('找不到該報名');
  setCellByHeader_(sh, idx, '審批狀態', status);
  setCellByHeader_(sh, idx, '批核人', b.reviewer || '');
  setCellByHeader_(sh, idx, '批核時間', new Date().toISOString());
  // 「接納」欄：✔=approved，✗=rejected/cancelled，空=pending
  setCellByHeader_(sh, idx, '接納', status === 'approved' ? '✔' : (['rejected', 'cancelled'].indexOf(status) >= 0 ? '✗' : ''));
  return ok({ saved: true, id: b.id, status: status });
}

// 把「表格回應」列轉做前端要嘅物件
function toRegObj_(r) {
  var status = String(r['審批狀態'] || '').toLowerCase();
  if (!status) {
    status = r['接納'] === '✔' ? 'approved' : (r['接納'] === '✗' ? 'rejected' : 'pending');
  }
  return {
    id: r['時間戳記'],
    refCode: r['_ref'] || '',
    submittedAt: r['時間戳記'],
    courseId: r['_courseId'] || '',
    courseTitle: r['_courseTitle'] || '',
    nameZh: r['中文姓名'], nameEn: r['英文姓名'],
    gender: r['性別'], dob: r['出生日期'], phone: r['聯絡電話'], email: r['電郵地址'],
    section: r['_section'] || '', badgeCode: r['_badgeCode'] || '',
    scoutDistrict: r['所屬童軍區'], region: '', troop: r['旅團'], scoutId: r['童軍成員編號（ScoutID）'], scoutPosition: r['童軍職位'],
    guardianConsent: r['家長／監護人同意參與有關活動。'], guardianName: r['家長/監護人姓名'],
    guardianRelation: r['與申請人關係'], guardianEmail: r['家長/監護人聯絡電郵'], guardianPhone: r['家長/監護人聯絡電話'],
    leaderConsent: r['所屬童軍旅領袖同意參與有關活動。'], leaderName: r['領袖姓名（中文全名）'],
    leaderPosition: r['領袖職位'], leaderEmail: r['領袖聯絡電郵'],
    payMethod: r['付款方式'], payerName: r['付款人姓名'], payAccount: r['付款帳戶'],
    receiptUrl: r['已繳付訓練班費用截圖'], needReceipt: r['是否需要收據'], note: r['備註'],
    status: status, reviewer: r['批核人'] || '', reviewedAt: r['批核時間'] || '',
  };
}

// ===================== 入數紙（Drive，folder 權限） =====================

function getReceiptFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('RECEIPT_FOLDER_ID') || '';
  if (!id) return null;
  try { return DriveApp.getFolderById(id); } catch (e) { return null; }
}

function ensureReceiptFolder_() {
  var folder = getReceiptFolder_();
  if (folder) return folder;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    folder = DriveApp.createFolder('入數紙 — ' + ss.getName());
    PropertiesService.getScriptProperties().setProperty('RECEIPT_FOLDER_ID', folder.getId());
    return folder;
  } catch (e) { return null; }
}

function setReceiptFolderMenu() {
  var ui = SpreadsheetApp.getUi();
  var cur = getReceiptFolder_();
  var promptText = '輸入入數紙資料夾嘅 Google Drive 資料夾 ID：';
  if (cur) promptText = '現時資料夾：' + cur.getName() + '\n' + cur.getUrl() + '\n\n輸入新資料夾 ID 取代（留空 = 自動建立）：';
  var resp = ui.prompt('📁 設定入數紙資料夾', promptText, ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var id = resp.getResponseText().trim();
  if (!id) { ensureReceiptFolder_(); ui.alert('已自動建立資料夾。'); return; }
  try {
    var f = DriveApp.getFolderById(id);
    PropertiesService.getScriptProperties().setProperty('RECEIPT_FOLDER_ID', f.getId());
    ui.alert('已設定資料夾：' + f.getUrl());
  } catch (e) { ui.alert('找不到該資料夾 ID，請檢查。'); }
}

// 將 base64 dataURL 存入資料夾；folder 本身已限職員權限，唔再逐張開 link
function saveReceipt_(dataUrl, fileName, mimeType) {
  var folder = getReceiptFolder_();
  if (!folder) return '';
  try {
    var base64 = String(dataUrl).split(',')[1] || String(dataUrl);
    var bytes = Utilities.base64Decode(base64);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = folder.createFile(blob);
    return file.getUrl();
  } catch (e) { return ''; }
}

// ===================== 工具 =====================

function readRespRows_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESP_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return readSheetAsArray_(sh);
}
function countRegs_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESP_SHEET);
  if (!sh) return 0;
  var last = sh.getLastRow();
  return last > 1 ? last - 1 : 0;
}
function readSheetAsArray_(sh) {
  var v = sh.getDataRange().getValues();
  var headers = v[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (v[i].join('') === '') continue;
    var obj = {}; headers.forEach(function (h, j) { obj[h] = v[i][j]; }); out.push(obj);
  }
  return out;
}
function sheetHeaders_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
}
function rowIndexByCol_(sh, colHeader, value) {
  if (!sh) return -1;
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return -1;
  var head = v[0].map(function (h) { return String(h).trim(); });
  var ci = head.indexOf(colHeader);
  if (ci < 0) return -1;
  for (var i = 1; i < v.length; i++) if (String(v[i][ci]).trim() === String(value).trim()) return i + 1;
  return -1;
}
function setCellByHeader_(sh, rowIdx, colHeader, value) {
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var ci = head.indexOf(colHeader);
  if (ci >= 0) sh.getRange(rowIdx, ci + 1).setValue(value);
}
function appendRowObj_(sh, obj) {
  var headers = sheetHeaders_(sh);
  var arr = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  sh.appendRow(arr);
}
function ensureTab_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e3f2fd');
      sh.setFrozenRows(1);
    }
    sh.setTabColor('#43a047');
  }
  return sh;
}
function addTabMenu() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('🎓 新增分頁', '輸入新分頁名稱：', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var name = resp.getResponseText().trim();
  if (!name) return;
  ensureTab_(SpreadsheetApp.getActiveSpreadsheet(), name, null);
  ui.alert('已建立分頁：' + name);
}
function authKey_(key) {
  var stored = PropertiesService.getScriptProperties().getProperty('API_KEY_HASH') || '';
  if (!stored) return false;
  return sha256_(String(key || '')) === stored;
}
function ok(data)  { return { ok: true, data: data }; }
function err(msg)  { return { ok: false, error: msg }; }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function sha256_(str) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)
    .map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🎓 訓練班')
    .addItem('🚀 一鍵建表（只限全新空白表）', 'setupCourseSheet')
    .addItem('🔑 產生 API Key（唔影響表格）', 'rotateCourseApiKey')
    .addItem('🎓 新增分頁', 'addTabMenu')
    .addItem('📁 設定入數紙資料夾', 'setReceiptFolderMenu')
    .addToUi();
}
