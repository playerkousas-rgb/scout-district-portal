/**
 * 🎓 訓練班收表 Script — 標準模板（每個訓練班 1 份）
 * ================================================================
 * 安裝步驟（每班 1 次）：
 *   1. 為呢個訓練班開一張新 Google Sheet。
 *   2. 擴充功能 → Apps Script → 將本檔案整份貼上 → 儲存。
 *   3. 執行 setupCourseSheet()（首次授權：Review permissions → Advanced → Allow）。
 *      → 自動建立齊「筲箕灣區 訓練班參考表」格式嘅多個分頁
 *        （Input01 預算 / Input02 資料 / Input03 時間表 / Input04 支出表
 *         + 多張 Print 報告分頁 + 「表格回應」報名數據 + 參數 + 使用說明）
 *      → 產生 API Key（只顯示一次，請即複製）
 *      → 自動喺 Drive 建立「入數紙」資料夾（folder 權限，只有職員睇到）
 *   4. 部署 → 新增部署 → 網頁應用程式（執行身分：我自己；存取：所有人）→ 攞 /exec 網址。
 *   5. 將「courseId + 課程名 + /exec 網址 + API Key + Drive 資料夾 ID」
 *      交畀區管理平台管理員，喺「訓練班管理」開班登記。
 *
 * 之後：
 *   - 公開端報名 → 主系統 submitCourseReg_ → 轉發嚟呢度 addReg_
 *     → 寫入本表「表格回應」（跟參考格式）+ 入數紙存入本班 Drive 資料夾。
 *   - 區職員喺區管理平台「訓練班報名審批」→ 主系統轉發 listRegs_ / setRegStatus_
 *     → 讀取「表格回應」／改批核狀態。
 *
 * ⚠️ 安全：入數紙一律存入 folder（folder 層權限），唔會 setSharing ANYONE_WITH_LINK。
 */

var RESP_SHEET = '表格回應';
var PARAM_SHEET = '參數';

// ===================== 表格回應欄位（跟參考格式） =====================
// 參考「表格回應 1」36 欄，另加尾欄作批核及輔助（不影響原有欄位公式）。
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

// ===================== 參數（參考）資料 =====================
var PARAM_SECTIONS = ['小童軍', '幼童軍', '童軍', '深資童軍', '樂行童軍'];
var PARAM_REGIONS = ['港島地域', '九龍地域', '東九龍地域', '新界地域', '新界東地域'];
var PARAM_DISTRICTS = [
  '銀禧區',
  '港島西區', '維多利亞城區', '灣仔區', '港島北區', '筲箕灣區', '柴灣區', '港島南區',
  '深水埗西區', '深水埗東區', '九龍塘區', '九龍城區', '何文田區', '紅磡區', '油尖區', '旺角區', '深旺區',
  '慈雲山區', '黃大仙區', '九龍灣區', '觀塘區', '鯉魚門區', '將軍澳區', '秀茂坪區', '西貢區',
  '元朗西區', '元朗東區', '十八鄉區', '北葵涌區', '南葵涌區', '青衣區', '荃灣區', '離島區', '大嶼山區', '屯門東區', '屯門西區',
  '壁峰區', '沙田西區', '沙田南區', '沙田東區', '沙田北區', '大埔南區', '大埔北區', '雙魚區',
];
var PARAM_POSITIONS = ['隊長', '副隊長', '隊員', '團隊長'];
var PARAM_RELATIONS = ['父子', '父女', '母子', '母女'];
var PARAM_GROUPS = ['第一組', '第二組', '第三組', '第四組', '第五組', '第六組', '第七組', '第八組'];
var PARAM_TYPES = ['工作坊', '訓練班', '會議', '聚會', '比賽'];
var PARAM_PLUGINS = ['技能', '領袖'];
var PARAM_EDITIONS = ['次', '屆'];
var PARAM_BADGE_GROUPS = ['興趣', '技能', '服務', '教導'];
var PARAM_AWARDS = ['探索獎章', '毅行獎章', '挑戰獎章', '總領袖獎章'];

// ===================== 一鍵建表 =====================

function setupCourseSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 表格回應（報名數據，跟參考格式）
  buildResponseSheet_(ss);

  // 全部 Input / Print 分頁（班職員後台管理用）
  buildInputSheets_(ss);
  buildPrintSheets_(ss);

  // 參數 + 使用說明
  buildParametersSheet_(ss);
  buildReadmeSheet_(ss);

  // API Key（只存 hash）
  var key = 'ck_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  PropertiesService.getScriptProperties().setProperty('API_KEY_HASH', sha256_(key));

  // 入數紙資料夾
  var folder = ensureReceiptFolder_();

  SpreadsheetApp.getUi().alert(
    '✅ 訓練班收表表已建立',
    '🔑 API Key（只顯示一次，請即複製）：\n────────────────\n' + key + '\n────────────────\n\n'
    + '📁 入數紙資料夾（folder 權限，只有職員睇到）：\n' + (folder ? folder.getUrl() : '（未能建立，請手動設定）') + '\n\n'
    + '已建立分頁：表格回應 / Input01 預算 / Input02 資料 / Input03 時間表 / Input04 支出表\n'
    + '＋ 多張 Print 報告 + 參數 + 使用說明。\n\n'
    + '1. 部署 → 網頁應用程式（執行身分：我自己；存取：所有人）。\n'
    + '2. 將「courseId + 課程名 + /exec 網址 + API Key + Drive 資料夾 ID」交畀區管理平台管理員。'
  );
}

// ===================== 表格回應分頁 =====================
function buildResponseSheet_(ss) {
  var sh = ss.getSheetByName(RESP_SHEET);
  if (!sh) sh = ss.insertSheet(RESP_SHEET, 0);
  sh.clear();
  sh.getRange(1, 1, 1, RESP_HEADERS.length).setValues([RESP_HEADERS]);
  sh.getRange(1, 1, 1, RESP_HEADERS.length).setFontWeight('bold').setBackground('#e3f2fd');
  sh.setFrozenRows(1);
  sh.setTabColor('#e91e63');
}

// ===================== Input 分頁 =====================
function buildInputSheets_(ss) {
  // Input01 訓練班預算（名稱/屆別/名額/收費/職員/日期場地/膳食人均/支出分類）
  var s1 = ss.getSheetByName('Input01 訓練班預算');
  if (!s1) s1 = ss.insertSheet('Input01 訓練班預算');
  s1.clear();
  var r1 = [
    ['活動/訓練班名稱', ''], ['屆別', ''], ['支部', ''], ['專章', ''],
    ['名額', ''], ['預計收費', ''], ['職員人數', ''],
    ['活動日期及場地', '日期', '橫跨至下一日?', '時間', '場地'],
    ['截止報名日期', ''], ['最遲公佈取錄名單日', ''],
    ['膳食人均預算', '早餐', '午餐', '晚餐', '茶點'],
    ['支出分類（可加行）', '類別', '數量', '單位', '單價', '小計'],
  ];
  s1.getRange(1, 1, r1.length, r1[0].length).setValues(r1);
  s1.getRange(1, 1, 1, r1[0].length).setFontWeight('bold').setBackground('#fff3e0');
  s1.setFrozenRows(1); s1.setTabColor('#f9a825');

  // Input02 訓練班資料（基本 + 職員名單）
  var s2 = ss.getSheetByName('Input02 訓練班資料');
  if (!s2) s2 = ss.insertSheet('Input02 訓練班資料');
  s2.clear();
  var r2 = [
    ['活動/訓練班名稱', ''], ['名額', ''], ['預計收費', ''], ['職員人數', ''],
    ['活動日期及場地', '日期', '橫跨至下一日?', '時間', '場地', '通告顯示日期', '通告顯示時間', '通告顯示地點'],
    ['截止報名日期', ''], ['最遲公佈取錄名單日', ''],
    ['職員名單', '職位', '姓名', '稱謂', '所屬單位 / 職銜', '電話', '電郵'],
  ];
  s2.getRange(1, 1, r2.length, r2[0].length).setValues(r2);
  s2.getRange(1, 1, 1, r2[0].length).setFontWeight('bold').setBackground('#e0f7fa');
  s2.setFrozenRows(1); s2.setTabColor('#00acc1');

  // Input03 時間表（每節）
  var s3 = ss.getSheetByName('Input03 時間表');
  if (!s3) s3 = ss.insertSheet('Input03 時間表');
  s3.clear();
  var r3 = [
    ['日期', '地點', '時間', '服裝'],
    ['日期：', '地點：', '時間：', '服裝：'],
    ['時 間', '分鐘', '項 目', '負 責 人'],
  ];
  s3.getRange(1, 1, r3.length, r3[0].length).setValues(r3);
  s3.getRange(1, 1, 1, r3[0].length).setFontWeight('bold').setBackground('#e8f5e9');
  s3.setFrozenRows(1); s3.setTabColor('#43a047');

  // Input04_Print支出表（每筆支出）
  var s4 = ss.getSheetByName('Input04_Print支出表');
  if (!s4) s4 = ss.insertSheet('Input04_Print支出表');
  s4.clear();
  var r4 = [
    ['活動支出', '收據編號', '類別', '茶點', '膳食津貼', '職員膳食', '住宿', '交通', '行政', '講義及快勞', '其他', '設備', '備註'],
  ];
  s4.getRange(1, 1, 1, r4[0].length).setValues(r4);
  s4.getRange(1, 1, 1, r4[0].length).setFontWeight('bold').setBackground('#e3f2fd');
  s4.setFrozenRows(1); s4.setTabColor('#5e35b1');
}

// ===================== Print 分頁（由「表格回應」自動生成） =====================
// 凡係由報名數據嚟嘅名單（取錄/合格/學員名單/出席/完成報告/領取證書/總會資助），
// 都用公式自動由「表格回應」拉，唔使人手抄，減少出錯。
// 「表格回應」欄位對照：C=中文姓名, D=英文姓名, E=電話, F=性別, H=所屬童軍區,
//   I=旅團, Q=家長電話, B=電郵, AC=接納, AK=審批狀態

function buildPrintSheets_(ss) {
  // 財政預算 / 通告 / 班職員名單 / 接納通知書 / 收支紀錄：主要由 Input 填寫驅動，保留為輸入殼
  buildPrintShell_(ss, 'Print_財政預算', ['項目', '預算 Estimated', '修訂 Revised']);
  buildPrintShell_(ss, 'Print_通告', ['通告標題', '日期', '時間', '地點', '內容']);
  buildPrintShell_(ss, 'Print_班職員名單', ['職位', '姓名', '稱謂', '所屬單位 / 職銜', '電話', '電郵']);
  buildPrintShell_(ss, 'Print_接納通知書', ['致', '日期', '報到時間', '地點', '服裝', '攜帶物品', '其他']);
  buildPrintShell_(ss, 'Print_收支紀錄', ['支出項目', '金額', '收入項目', '金額']);

  // 自動由「表格回應」生成：取錄名單（審批狀態 = approved）
  var sAdmit = buildPrintShell_(ss, 'Print_取錄名單', ['編號', '姓名', '旅別']);
  setPrintFormula_(sAdmit, 'A', seqApproved_());
  setPrintFormula_(sAdmit, 'B', '=IFERROR(FILTER(\'表格回應\'!C2:C,\'表格回應\'!AK2:AK="approved"),"")');
  setPrintFormula_(sAdmit, 'C', '=IFERROR(FILTER(\'表格回應\'!I2:I,\'表格回應\'!AK2:AK="approved"),"")');

  // 學員名單
  var sStud = buildPrintShell_(ss, 'Print_學員名單', ['分組', '學員編號', '中文姓名', '性別', '旅團', '聯絡電話', '家長/監護人聯絡電話', '電郵地址']);
  setPrintFormula_(sStud, 'B', seqApproved_());
  setPrintFormula_(sStud, 'C', '=IFERROR(FILTER(\'表格回應\'!C2:C,\'表格回應\'!AK2:AK="approved"),"")');
  setPrintFormula_(sStud, 'D', '=IFERROR(FILTER(\'表格回應\'!F2:F,\'表格回應\'!AK2:AK="approved"),"")');
  setPrintFormula_(sStud, 'E', '=IFERROR(FILTER(\'表格回應\'!I2:I,\'表格回應\'!AK2:AK="approved"),"")');
  setPrintFormula_(sStud, 'F', '=IFERROR(FILTER(\'表格回應\'!E2:E,\'表格回應\'!AK2:AK="approved"),"")');
  setPrintFormula_(sStud, 'G', '=IFERROR(FILTER(\'表格回應\'!Q2:Q,\'表格回應\'!AK2:AK="approved"),"")');
  setPrintFormula_(sStud, 'H', '=IFERROR(FILTER(\'表格回應\'!B2:B,\'表格回應\'!AK2:AK="approved"),"")');

  // 學員出席紀錄
  var sAtt = buildPrintShell_(ss, 'Print_學員出席紀錄', ['分組', '學員編號', '中文姓名', '英文姓名']);
  setPrintFormula_(sAtt, 'B', seqApproved_());
  setPrintFormula_(sAtt, 'C', '=IFERROR(FILTER(\'表格回應\'!C2:C,\'表格回應\'!AK2:AK="approved"),"")');
  setPrintFormula_(sAtt, 'D', '=IFERROR(FILTER(\'表格回應\'!D2:D,\'表格回應\'!AK2:AK="approved"),"")');

  // 訓練班完成報告
  var sDone = buildPrintShell_(ss, 'Print_訓練班完成報告', ['學員編號', '中文姓名', '旅號', '證書編號']);
  setPrintFormula_(sDone, 'A', seqApproved_());
  setPrintFormula_(sDone, 'B', '=IFERROR(FILTER(\'表格回應\'!C2:C,\'表格回應\'!AK2:AK="approved"),"")');
  setPrintFormula_(sDone, 'C', '=IFERROR(FILTER(\'表格回應\'!I2:I,\'表格回應\'!AK2:AK="approved"),"")');

  // 領取證書紀錄
  var sCert = buildPrintShell_(ss, 'Print_領取證書紀錄', ['學員編號', '中文姓名', '旅號', '證書編號', '領取日期', '簽收']);
  setPrintFormula_(sCert, 'A', seqApproved_());
  setPrintFormula_(sCert, 'B', '=IFERROR(FILTER(\'表格回應\'!C2:C,\'表格回應\'!AK2:AK="approved"),"")');
  setPrintFormula_(sCert, 'C', '=IFERROR(FILTER(\'表格回應\'!I2:I,\'表格回應\'!AK2:AK="approved"),"")');

  // 總會資助計劃
  var sSub = buildPrintShell_(ss, 'Print_總會資助計劃', ['姓名', '區會', '旅號', '資助額']);
  setPrintFormula_(sSub, 'A', '=IFERROR(FILTER(\'表格回應\'!C2:C,\'表格回應\'!AK2:AK="approved"),"")');
  setPrintFormula_(sSub, 'B', '=IFERROR(FILTER(\'表格回應\'!H2:H,\'表格回應\'!AK2:AK="approved"),"")');
  setPrintFormula_(sSub, 'C', '=IFERROR(FILTER(\'表格回應\'!I2:I,\'表格回應\'!AK2:AK="approved"),"")');

  // 合格名單（同取錄名單）
  var sPass = buildPrintShell_(ss, 'Print_合格名單', ['編號', '姓名', '旅別']);
  setPrintFormula_(sPass, 'A', seqApproved_());
  setPrintFormula_(sPass, 'B', '=IFERROR(FILTER(\'表格回應\'!C2:C,\'表格回應\'!AK2:AK="approved"),"")');
  setPrintFormula_(sPass, 'C', '=IFERROR(FILTER(\'表格回應\'!I2:I,\'表格回應\'!AK2:AK="approved"),"")');
}

function buildPrintShell_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  if (headers && headers.length) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#ede7f6');
    sh.setFrozenRows(1);
  }
  sh.setTabColor('#7e57c2');
  return sh;
}

/** 喺指定儲存格寫公式 */
function setPrintFormula_(sh, colLetter, formula) {
  sh.getRange(colLetter + '2').setFormula(formula);
}

/** 自動編號（由審批狀態=approved 嘅人數生成 1..N） */
function seqApproved_() {
  return '=ARRAYFORMULA(IF(FILTER(\'表格回應\'!C2:C,\'表格回應\'!AK2:AK="approved")="","",'
    + 'SEQUENCE(ROWS(FILTER(\'表格回應\'!C2:C,\'表格回應\'!AK2:AK="approved")))))';
}

// ===================== 使用說明分頁 =====================
function buildReadmeSheet_(ss) {
  var name = '使用說明';
  var sh = ss.getSheetByName(name) || ss.insertSheet(name, 0);
  sh.clear();
  var rows = [
    ['🎓 訓練班收表表 — 使用說明', ''],
    ['', ''],
    ['呢張表點用（照順序）', ''],
    ['1', '已有分頁：表格回應（報名＋批核）、Input01 預算 / Input02 資料 / Input03 時間表 / Input04 支出表、多張 Print 報告、參數、使用說明。'],
    ['2', 'Input 分頁：班職員填課程資料／預算／時間表／支出。'],
    ['3', '報名經公開端寫入「表格回應」；區職員喺區管理平台「訓練班報名審批」批核（接納/拒絕）。'],
    ['4', 'Print 名單分頁（取錄/合格/學員名單/出席/完成報告/領取證書/總會資助）已用公式自動由「表格回應」審批狀態=approved 嘅學員生成，唔使人手抄。'],
    ['5', '需要更多分頁 → 選單「🎓 訓練班 → 🎓 新增分頁」。'],
    ['6', '入數紙自動存入本班 Drive 資料夾（folder 權限，只有職員睇到）。'],
    ['', ''],
    ['表格回應 欄位', ''],
    ['批核欄位', '接納：✔/✗；審批狀態：pending/approved/rejected/cancelled；批核人；批核時間'],
    ['申請人欄位', '中/英文姓名、性別、出生日期、電話、電郵、所屬童軍區、旅團、ScoutID、童軍職位、附加資料'],
    ['監護人/領袖', '同意、姓名、關係/職位、電郵、電話'],
    ['付款', '付款方式、付款人姓名、付款帳戶、入數紙截圖、是否需要收據'],
    ['', ''],
    ['🔑 安全', '入數紙唔會 setSharing ANYONE_WITH_LINK，只存入 folder。'],
  ];
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange('A1:B1').merge().setBackground('#1565c0').setFontColor('white').setFontWeight('bold').setFontSize(14);
  sh.setColumnWidth(1, 120); sh.setColumnWidth(2, 620);
  sh.setFrozenRows(1); sh.setTabColor('#1565c0');
}

// ===================== 參數分頁 =====================
function buildParametersSheet_(ss) {
  var sh = ss.getSheetByName(PARAM_SHEET);
  if (!sh) sh = ss.insertSheet(PARAM_SHEET, 0);
  sh.clear();
  var headers = ['進度性獎章', '專章組別', '徽章組別及名稱', '徽章代碼', '訓練班編號',
                 '舉辦單位', '區會', '地域', '職位', '關係', '接納與否', '組別', '類型', '插件', '屆別'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e3f2fd');
  sh.setFrozenRows(1);
  var rows = [];
  PARAM_AWARDS.forEach(function (v, i) { rows.push([v, '', '', '', '', '', '', '', '', '', '', '', '', '', '']); });
  rows.push(['', '專章組別', PARAM_BADGE_GROUPS.join(' / '), '', '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['', '', '支部', PARAM_SECTIONS.join(' / '), '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['', '', '地域', PARAM_REGIONS.join(' / '), '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['', '', '區會', PARAM_DISTRICTS.join(' / '), '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['', '', '職位', PARAM_POSITIONS.join(' / '), '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['', '', '關係', PARAM_RELATIONS.join(' / '), '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['', '', '組別', PARAM_GROUPS.join(' / '), '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['', '', '類型', PARAM_TYPES.join(' / '), '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['', '', '插件', PARAM_PLUGINS.join(' / '), '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['', '', '屆別', PARAM_EDITIONS.join(' / '), '', '', '', '', '', '', '', '', '', '', '']);
  if (rows.length) { sh.getRange(2, 1, rows.length, headers.length).setValues(rows); }
  sh.setTabColor('#1e88e5');
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
    default:              return json(err('未知的 action: ' + action));
  }
}

function doGet(e) {
  var p = e.parameter;
  if (!authKey_(p.apiKey)) return json(err('Unauthorized: invalid or missing apiKey'));
  if ((p.action || '') === 'stats') return json(ok({ count: countRegs_() }));
  return json(err('未知的 action'));
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

  var row = {};
  RESP_HEADERS.forEach(function (h) { row[h] = ''; });
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
    .addItem('一鍵建表（setupCourseSheet）', 'setupCourseSheet')
    .addItem('🎓 新增分頁', 'addTabMenu')
    .addItem('📁 設定入數紙資料夾', 'setReceiptFolderMenu')
    .addToUi();
}
