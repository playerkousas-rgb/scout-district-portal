# 訓練班工作簿 → 開班登記 → 區通告 PDF（v4.13.0 舊制＋v4.14.0 新制）

> 舊制：CL 喺工作簿填一次（資料＋通告）→ 區總監審批 → PDF 上載區網
> ＋ ADC 喺管理系統開班＋通告記錄（全部自動讀取，唔使重打）。
> 新制（試驗）：ADC 喺區系統填晒成份設定 → 自動建班 Sheet → 12 張列印喺網頁出。
> **PDF only：冇公開通告頁、冇 feed。** member-portal 唔使改。

## 🆕 新制直入（v4.14.0 試驗；同舊制並存）

| 步驟 | 邊度做 | 做咩 |
|---|---|---|
| 0. 設總模版（一次過） | 區 Sheet＋Config | 開空白 Sheet 跑訓練班模版 `setupCourseSheet()` → 試算表 ID 填 `COURSE_TEMPLATE_ID`（新班資料夾選填 `COURSE_FOLDER_ID`） |
| 1. 填設定 | 管理系統 `/training`「新制直入」 | 成份表：基本＋8 項預算（即時小計）＋班資料（8 節次＋20 職員）＋時間表＋通告內文＋接納＋財政 |
| 2. 建表＋開班 | 同上 | 撳「🏗 建立班 Sheet＋開班登記」→ 區後台複製總模版＋寫入設定＋開班登記＋分享畀 CL 電郵 |
| 2b. 收報名（CL 做） | 班 Sheet | 🎓 選單 → 🔑 產生 API Key（獨立功能，唔影響表格；唔好跑一鍵建表！）→ 部署 Web App → /exec＋key 交 ADC 貼入開班登記。掛班上架靠開班登記＋啟用；報名經 /exec 直接寫入 SHEET |
| 3. 雙向同步 | 兩邊 | 區系統改 →「⬆ 寫入」同步返 Sheet；職員喺 Sheet 改 →「⬇ 重讀」即時睇返（列印數據一併更新） |
| 4. 列印 | 同上「列印預覽」 | 12 張：通告／取錄／合格／學員／出席／接納／班職員／收支／財政預算／資助／完成報告／領取證書，直接印 PDF |
| 5. 舊班 | 同上 | 人手建嘅班睇得＋印得（經 /exec 讀），唔寫返 Sheet；可「只儲存草稿」 |

API（全部需 `canCourse`）：`createCourseSheet {link, setup, cells, clEmail}`／
`pushCourseSetup {courseId, setup, cells}`／`pullCourseSheetRaw {courseId}｜{scriptExecUrl, scriptApiKey}`
（有 /exec 行訓練班 Script `getCourseSheetRaw`，冇就行 direct `openById`，同一形狀）／
`getCourseSetup {courseId}`（攞 setupJson）。寫入座標跟 v4.13.0 模版，見 `lib/course-setup.ts`。
收表唔變（照舊經每班 /exec；自動建嘅表自帶 Script 碼，但 key 要 CL 獨立產生——見 2b，唔好跑一鍵建表）。

## 流程總覽（CL 填一次）

| 步驟 | 邊個做 | 做咩 |
|---|---|---|
| 1. 下載＋交 CL | ADC（管理系統 `/training`） | 下載收表 Script 模版，交畀班領導人（CL，未必係區幹部，入唔到管理系統唔緊要） |
| 2. 開工作簿 | CL（或 ADC 代勞） | 開全新空白 Sheet → 貼模版 → 執行 `setupCourseSheet()`（起出同開班文件一樣嘅分頁＋API Key＋入數紙資料夾）→ 部署，攞 `/exec` |
| 3. 填一次＋做通告 | CL（工作簿） | 填 Input01→Input02→Input03（大半自動帶入）→ 檢查 `Print_通告`（標題／節數／名額／截止／報名辦法／查詢自動帶入，補參加資格／費用／服裝／備註）→ 交**區總監審批** |
| 4a. 上載 | CL／網頁管理員 | 列印 `Print_通告` 做 PDF 上載區網（或交總會／地域；圖書館自動收錄） |
| 4b. 開班登記 | ADC（管理系統 `/training`） | 貼上 `/exec`＋API Key＋資料夾 ID →「📥 由訓練班 Sheet 讀取」→ 名稱／名額／收費／日期場地／截止／聯絡自動帶入 → 儲存（啟用）→ 即時掛上成員系統（內置報名表，唔用 Google Form） |
| 5. 通告記錄 | ADC（管理系統 `/circulars`） | 開新通告 → 掛接訓練班 →「⬇ 從訓練班帶入資料」即時 pull 通告內文預填（資格／費用說明／服裝／備註／查詢／報名辦法／署名／編號／發出日期，只填空欄）→ 補通告編號（人手，跨類別共用）→ 發佈 |
| 6. 回填 | ADC（`/circulars`） | 區網 PDF 連結「↗ 回填訓練班」寫入 `noticeUrl` → 成員系統該班即跳轉睇真通告 |

## 工作簿結構（v4.13.0 模版起出嚟就係噉）

分頁名／欄位／行位跟足區會開班文件實物（第 1 屆工作坊式），方便 CL 沿用舊習慣，
日後其他系統接入都認得。公式係**等效寫法**（原表公式睇唔到，只抄到數值版式），
`#N/A`／`#VALUE!` 一律用 `IFERROR` 收起。

| 分頁 | 內容摘要 |
|---|---|
| `Input01 訓練班預算` | 名稱／屆別／支部／專章／形式、預計收生／收費／職員、活動日期、財政預算（批准總預算／申請津貼自動由 `Print_財政預算` 帶入）、8 大開支分類（膳食／租金／交通／講義／節目／行政／紀念品／其他，全部有小計公式） |
| `Input02 訓練班資料` | 黃格自動套用預算（B1／B4／B5／B6，可覆蓋）、活動日期（✓上通告剔格＋通告顯示三欄）、截止／公佈日、職員資料（20 個預設職位：班領導人／副／助理／導師／團隊長／班務／物資／講師）、總人數（自動數）／常駐人數 |
| `Input03 時間表` | 每節 10 行一組 ×3（日期地點時間服裝自動由 Input02 帶入＋節目流程，時間自動累加） |
| `Input04_Print支出表` | 35 個收據行 ×9 開支類別，小計＋總支出＋預算尚餘公式 |
| `Print_通告` | 通告全文版式（見下表） |
| `Print_取錄名單`／`Print_合格名單` | 雙欄名單（approved 自動列出，左 1–17 右 18–34）＋班領導人署名 |
| `Print_學員名單`／`Print_學員出席紀錄` | approved 自動列出（分組／學員編號／姓名／電話；出席日期欄自動由 Input02 帶入） |
| `Print_接納通知書` | 書信版式（日期／地點／查詢自動帶入） |
| `Print_收支紀錄` | 總會收支計算表（支出自動由 Input04 小計帶入；班費＝收費×接納人數；津貼／總會津貼自動帶入） |
| `Print_班職員名單` | 職位／姓名／稱謂／單位自動由 Input02 帶入 |
| `Print_總會資助計劃` | 總會附件 2 版式（項目／日期／負責人／完成人數自動帶入，學員列人手填） |
| `Print_訓練班完成報告` | 本區／他區報班／接納／完成／合格人數自動計＋學員列 |
| `Print_財政預算` | 總會預算表（預算欄自動由 Input01 帶入；修訂欄人手填；申請津貼＝總支出−總收入；B95／D95 帶返 Input01） |
| `Print_領取證書紀錄` | 學員編號／姓名／旅號自動列出，證書編號編號／領取日期人手填 |
| `表格回應` | 36 欄（跟實物）＋尾欄批核／輔助；新報名自動寫旅號／學員編號公式 |
| `參數` | 22 欄（A–V：獎章／110 項專章／舉辦單位／區會／地域／職位／關係／Y-N／組別／類型／插件／屆別）＋ **W/X 區會常數**（成員系統網址／FPS 識別碼／FPS 戶名／區網，通告公式引用） |
| `使用說明` | CL 版流程說明（模版新增，實物冇） |

### Print_通告自動帶入一覽

| 通告位 | 來源 | CL 要做 |
|---|---|---|
| 標題（A15） | Input02 班名 | 唔使 |
| 節數表（18–21 行） | Input02 ✓上通告＋通告顯示三欄（最多 4 節） | 剔 ✓＋填通告顯示 |
| 班領導人 | Input02 職員（姓名＋稱謂＋資格） | 唔使 |
| 參加資格 | — | 人手填 |
| 費用（C24） | — | 人手填（金額＋包括咩＋原價／資助） |
| FPS 段（C25） | 參數 W/X＋班名自動砌 | 唔使（仲要貼 QR 圖） |
| 名額／截止日期 | Input02 名額／截止（中文日期自動轉） | 唔使 |
| 報名辦法（C30） | 參數成員系統網址自動砌（唔用 Google Form） | 唔使 |
| 服裝 | — | 人手填 |
| 備註（6 項） | 預設標準 6 項 | 改括號位／增刪 |
| 查詢 | Input02 公佈日＋班領導人電郵電話自動砌 | 唔使 |
| 檔案編號／發出日期／署名 | — | 等區會編號＋填日期＋簽署 |

### 同實物有出入嘅位（有意為之）

- `✓上通告`（Input02 H 欄）＋`（自動）`（G 欄中文日期）：實物 H 係冇標題嘅 TRUE/FALSE，模版加咗標題＋checkbox，CL 睇得明。pull 規則：有通告顯示日期 **而且** H 唔係 FALSE 先上通告。
- `Print_通告` 報名辦法預設成員系統（實物係 Google Form）。
- 參數 W/X 區會常數：實物冇，通告公式集中引用，轉區／轉網址只改呢度。
- 所有原會出 `#N/A`／`#VALUE!` 嘅公式都包咗 `IFERROR`（空白代替）。
- 信頭圖片要 CL 自己貼（浮動圖，公式抄唔到）。
- `使用說明` 分頁係模版新增。

## 訓練班 Sheet 結構（讀取用，舊讀法兼容）

`getCourseProfile` 用 **A 欄 label 對位**（唔寫死行號），容忍 template 版同實填版差異。
實填版（例「第 1 屆工作坊」）以 `gs/Code.gs.course.js` 註解為準，重點：

- `Input02 訓練班資料`：B1 名稱／`名額`／`預計收費`／`職員人數`／`活動日期及場地`
  （表頭行喺 label 上面一行；label 行本身就係第一節資料）／`截止報名日期`／
  `最遲公佈取錄名單日`／職員表（`職位`＋`姓名`表頭行之後，直到`班職員總人數`：
  職位／姓名／稱謂／所屬單位／資格標註／電話／電郵）。
- **上通告規則**：節次有「通告顯示日期」先上通告（`showOnCircular`），
  而且 H 欄唔係 FALSE。對應 portal：`/training` 節數同通告節數表都優先用通告顯示三欄（中文寫法）。
- `Input01 訓練班預算`：屆別／支部／專章／自定義名稱／形式-1／形式-2、
  預計收生／收費／職員、預算日期（B 日期／C 時間／E 場地）、
  批准總預算／申請津貼。冇呢頁都唔會報錯（budget 欄留空）。
- `Print_通告`：label 對位讀全文（標題／`主辦分區`／`對象`／`班領導人`／`參加資格`／
  `費用`、`繳費方法`／`名額`／`截止日期`、報名辦法、查詢／`制服`／`備註`／`檔案編號`／
  `發出日期`／署名／代行）。冇呢頁 → `circular: null`，前端提示 CL 更新模版。
- 日期接受 Date 物件／`d/m/yyyy` 字串／ISO／中文（`2025年7月25日（星期五）`），全部正規化做 `yyyy-MM-dd`。

## API

### 訓練班 Script：`getCourseProfile`（POST，apiKey 認證）

```json
// 送去該班 /exec
{ "action": "getCourseProfile", "apiKey": "ck_..." }
```

回傳 `data`（即前端 `CourseProfile`）：`courseName`／`quota`／`fee`／`staffCount`／
`deadline`／`publishDate`／`totalStaff`／`residentStaff`／
`sessions[]`（`date`／`time`／`venue`／`displayDate`／`displayTime`／`displayVenue`／`showOnCircular`）／
`staff[]`（`role`／`name`／`title`／`unit`／`qualification`／`phone`／`email`）／
`leader`（班領導人）／`edition`／`section`／`badge`／`customName`／`form1`／`form2`／
`expectedIntake`／`expectedFee`／`expectedStaff`／`budgetDates[]`／
`budgetApproved`／`subsidyRequired`／`pulledAt`／`circular`（見下）。

`circular`（`Print_通告` 全文；冇呢頁就 `null`）：`title`／`host`／`target`／
`leaderLine`／`eligibility`／`feeText`／`payText`／`quota`／`deadline`／`signup`／
`uniform`／`remarks`／`enquiry`／`fileNo`／`fileNoRaw`／`issueDate`／`issueDateISO`／
`signer`（署名＋職銜）／`deputy`／`deputyRaw`。

### 訓練班 Script：寫入 API（職員前端基本合約，跟班 Sheet 寫）

全部 POST 去該班 `/exec`，要 `apiKey`；座標跟 v4.13.0 模版（人手舊表唔保證啱位）。
同 `getCourseSheetRaw` 一齊組成職員前端契約：**讀全文 → 改 → 寫返班 Sheet**。
將來職員只用前端，唔再開 Google Sheet；班務三件套（記帳／事工／簽到）到時都做埋班 Sheet 分頁＋Script API——**唔放區系統，兩者唔混**。

```json
// 通用寫格（上限 1000 格；唔識／冇嗰頁 skip，列喺 skippedTabs；座標錯即報錯）
{ "action": "setCourseCells", "apiKey": "ck_...",
  "cells": [{ "tab": "Input02 訓練班資料", "row": 18, "col": 2, "value": "2026-10-01" }] }
// → { "ok": true, "data": { "updated": 1, "skippedTabs": [] } }

// 完成報告學員列：code（學員編號）優先，冇先用 name（中文姓名）；淨寫有帶嘅欄
{ "action": "setCompletionRow", "apiKey": "ck_...", "code": "S01",
  "certNo": "C-001", "pass": "合格", "failReason": "" }
// → { "ok": true, "data": { "updated": true, "row": 10 } }
// （寫 Print_訓練班完成報告 rows 10–31：D 證書／E 合格與否／F 不合格原因）

// 領取證書：同上對位
{ "action": "setCertRow", "apiKey": "ck_...", "name": "陳小文",
  "certNo": "C-001", "pickupDate": "2026-11-01", "signed": "已簽收" }
// （寫 Print_領取證書紀錄 rows 7–29：E 證書編號／F 領取日期／G 簽收）

// 實際支出：自動搵 Input04 第一個空收據行（rows 8–42）寫入
{ "action": "addExpenseRow", "apiKey": "ck_...",
  "amounts": { "B": "500", "D": "120" }, "note": "營費＋車費" }
// → { "ok": true, "data": { "added": true, "receiptNo": "3", "row": 10 } }
// （amounts key = B–J 開支類別欄，note → K 欄；乜都冇填／35 行爆滿會報錯）
```

可寫分頁白名單（`COURSE_WRITABLE_TABS`）：Input01／02／03／04、表格回應、參數、
Print_通告／接納通知書／財政預算／訓練班完成報告／領取證書紀錄／總會資助計劃／
取錄名單／合格名單／學員名單／學員出席紀錄／收支紀錄／班職員名單。座標範圍：行 1–500、欄 1–30。

### 🛡 防呆：rev 樂觀鎖＋一次過儲存（v4.15.0）

十個職員同時看＋改唔撞爛，靠四樣（全部做喺班 Script，職員前端照跟）：

1. **改完一次過存**：`saveCourseBatch` 一個 call 存晒（唔好逐格 auto-save，每格打一次後端）。
2. **先驗證、後執行**：成批有錯就乜都唔寫（唔會寫一半）。
3. **ScriptLock 排隊**：同時撳儲存會排住嚟；真係等唔到就回 `locked: true`，叫職員再撳一次。
4. **rev 樂觀鎖**：班 Sheet 隱藏 `_Sync` 分頁（A1 rev／B1 savedAt／C1 by）。讀全文帶 `rev`／`revSavedAt`／`revBy`；
   儲存帶 `baseRev`（讀返嚟嗰個）；有人快咗一步就回 `conflict: true`＋邊個幾時改過，今次乜都冇寫入。
   成功先 bump rev＋回新 `rev`／`savedAt`——**存儲先確認**。支出係 append-only（唔同職員自動唔同行），
   所以 `addExpenseRow`／純支出 batch 唔對 `baseRev`、唔 bump rev。區系統推送都會 bump rev。

```json
// 一次過儲存（cells＋完成報告＋證書＋支出，一個確認）
{ "action": "saveCourseBatch", "apiKey": "ck_...", "baseRev": 7, "by": "李職員",
  "cells": [{ "tab": "Input02 訓練班資料", "row": 18, "col": 2, "value": "2026-10-01" }],
  "completion": [{ "code": "S01", "pass": "合格" }],
  "cert": [{ "code": "S01", "pickupDate": "2026-11-01" }],
  "expenses": [{ "amounts": { "B": "500" }, "note": "營費" }] }
// → { "ok": true, "data": { "saved": true, "rev": 8, "savedAt": "2026-09-09T…",
//     "details": { "cellsUpdated": 1, "skippedTabs": [], "completionRows": [10],
//                  "certRows": [7], "expenses": [{ "row": 10, "receiptNo": "3" }] } } }

// 有人快咗一步（HTTP 照 200，ok:false＋conflict:true，乜都冇寫入）
// → { "ok": false, "conflict": true, "rev": 8, "savedAt": "…", "by": "陳職員",
//     "error": "有人快咗一步改過（陳職員，…），請重讀最新再儲存（你今次乜都冇寫入）" }
```

職員前端食譜（抄得）：本地 draft＋dirty 提示 → 㩒［儲存］先打後端 → 成功 show 伺服器時間＋新 rev；
見 `conflict: true` 就 banner「邊個幾時改過，請重讀再存」＋［重新讀取］掣；儲存緊 disable 個掣；唔做 auto-save。


### 🛡 防呆：rev 樂觀鎖＋一次過儲存（v4.15.0）

十個職員同時看＋改唔撞爛，靠四樣（全部做喺班 Script，職員前端照跟）：

1. **改完一次過存**：`saveCourseBatch` 一個 call 存晒（唔好逐格 auto-save，每格打一次後端）。
2. **先驗證、後執行**：成批有錯就乜都唔寫（唔會寫一半）。
3. **ScriptLock 排隊**：同時撳儲存會排住嚟；真係等唔到就回 `locked: true`，叫職員再撳一次。
4. **rev 樂觀鎖**：班 Sheet 隱藏 `_Sync` 分頁（A1 rev／B1 savedAt／C1 by）。讀全文帶 `rev`／`revSavedAt`／`revBy`；
   儲存帶 `baseRev`（讀返嚟嗰個）；有人快咗一步就回 `conflict: true`＋邊個幾時改過，今次乜都冇寫入。
   成功先 bump rev＋回新 `rev`／`savedAt`——**存儲先確認**。支出係 append-only（唔同職員自動唔同行），
   所以 `addExpenseRow`／純支出 batch 唔對 `baseRev`、唔 bump rev。區系統推送都會 bump rev。

```json
// 一次過儲存（cells＋完成報告＋證書＋支出，一個確認）
{ "action": "saveCourseBatch", "apiKey": "ck_...", "baseRev": 7, "by": "李職員",
  "cells": [{ "tab": "Input02 訓練班資料", "row": 18, "col": 2, "value": "2026-10-01" }],
  "completion": [{ "code": "S01", "pass": "合格" }],
  "cert": [{ "code": "S01", "pickupDate": "2026-11-01" }],
  "expenses": [{ "amounts": { "B": "500" }, "note": "營費" }] }
// → { "ok": true, "data": { "saved": true, "rev": 8, "savedAt": "2026-09-09T…",
//     "details": { "cellsUpdated": 1, "skippedTabs": [], "completionRows": [10],
//                  "certRows": [7], "expenses": [{ "row": 10, "receiptNo": "3" }] } } }

// 有人快咗一步（HTTP 照 200，ok:false＋conflict:true，乜都冇寫入）
// → { "ok": false, "conflict": true, "rev": 8, "savedAt": "…", "by": "陳職員",
//     "error": "有人快咗一步改過（陳職員，…），請重讀最新再儲存（你今次乜都冇寫入）" }
```

職員前端食譜（抄得）：本地 draft＋dirty 提示 → 㩒［儲存］先打後端 → 成功 show 伺服器時間＋新 rev；
見 `conflict: true` 就 banner「邊個幾時改過，請重讀再存」＋［重新讀取］掣；儲存緊 disable 個掣；唔做 auto-save。

### 主後台：`pullCourseProfile`（POST，需 `canCourse`）

```json
// 未開班登記：直接帶 URL＋Key
{ "action": "pullCourseProfile", "token": "…", "scriptExecUrl": "https://…/exec", "scriptApiKey": "ck_…" }
// 已開班：帶 courseId，用已存嘅 URL＋Key 重讀
{ "action": "pullCourseProfile", "token": "…", "courseId": "cl-01" }
```

主後台經 `UrlFetchApp` POST 去該班 Script，課程端報錯會原樣傳返嚟
（例如 key 錯 → `Unauthorized: invalid or missing apiKey`）。

### 通告 actions（職員專用，需登入；寫入要 `circulars` 卡 edit 權）

`getCirculars`（全部狀態＋`isOpen`＋`course` snapshot＋`suggestedNo`）／
`saveCircular`（`circular` 物件；id 留空＝新增 draft；編號區內唔重複；
v4.13.0 新增 `feeNote`／`signupNote` 欄，舊表自動補）／
`deleteCircular`／`setCircularStatus`（draft／published／closed／archived 互相轉；
首次發佈先設 `publishedAt`）。

## 欄位對應（Sheet → CourseLink → Circular）

| Sheet | CourseLink（`/training`） | Circular（`/circulars`「⬇ 從訓練班帶入資料」，只填空欄） |
|---|---|---|
| Input02 名稱 | `title` | （手填：通告標題） |
| Input02 名額／預計收費 | `quota`／`fee` | `quota`／`fee` |
| Input02 截止報名日期 | `deadline` | `deadline` |
| 通告顯示三欄（有顯示＋✓上通告先計） | `sessionsText`（`；`分隔）、`venue`（去重 `、`分隔） | `sessions[]`（逐節拆返） |
| 班領導人（姓名＋稱謂＋電話＋電郵） | `contact` | `contactName`（全文） |
| Input01 支部／專章 | `section`／`badgeName` | — |
| Print_通告 參加資格 | — | `eligibility` |
| Print_通告 費用 | — | `feeNote`（列印費用行，原 composed 行唔出） |
| Print_通告 報名辦法 | — | `signupNote`（列印用；唔帶就預設成員系統行） |
| Print_通告 制服／備註／查詢 | — | `uniform`／`remarks`／`enquiryExtra` |
| Print_通告 署名／代行 | — | `signerName`（＋職銜）／`deputyName` |
| Print_通告 檔案編號（純數字先） | — | `circularNo` |
| Print_通告 發出日期 | — | `issueDate` |
| — | `noticeUrl`（區網 PDF，上載後回填） | 報名連結 `signupUrl`（預設成員系統 `/training`，Config `MEMBER_PORTAL_URL`） |

## 權限

- `circulars` 卡：DC／SYSADMIN／DDC_ADMIN／DDC_TRAINING／全部 ADC／STAFF 可編輯，
  DL／LEADER／AL 只可查閱（`circularsEdit()`）。
- `pullCourseProfile`：`canCourse`（同開班登記一樣）。
- 通告編號**人手輸入**（跨類別共用，區內唔重複）；`suggestedNo` 只係建議（最大純數字＋1）。

## 部署

1. 主後台：`gs/Code.gs`（v4.15.0）全部覆蓋 → 跑 `setupSheets()`（自動補 `CourseLinks`
   `sheetId`／`setupJson` 兩欄＋`COURSE_TEMPLATE_ID`／`COURSE_FOLDER_ID` Config）→ 重新部署。
   驗證：`?action=getHealthCheck` 見 `version: "4.15.0"`。（v4.15.0 唔使跑 setupSheets，冇新表。）
2. 新制總模版：開空白 Sheet → 貼訓練班模版 → 跑 `setupCourseSheet()` → 試算表 ID
   填 Config `COURSE_TEMPLATE_ID`（`/training` 新分頁會顯示設好未）。
3. Config 填 `MEMBER_PORTAL_URL`（成員系統網址，通告「報名辦法」用）。
4. 訓練班 Script 模版：`gs/Code.gs.course.js`（v4.14.0 加 `getCourseSheetRaw`＋`🔑 產生 API Key`＋寫入 API；v4.15.0 加 `saveCourseBatch`＋rev 防呆＋`_Sync` 版本號）。**新開班**用新模版一鍵建表；
   **舊班要將新模版覆蓋貼上**（千祈唔好重跑 setup，會清空！），pull 通告全文先用到。
   改完記得同步下載檔：`cp gs/Code.gs.course.js public/downloads/Code.gs.course.js.txt`（主後台都改埋就一併 `cp gs/Code.gs public/downloads/Code.gs.txt`）。
5. member-portal：**唔使改**（`noticeUrl` 照舊指向區網 PDF；報名用現有內置表）。

## 測試

| 指令 | 覆蓋 |
|---|---|
| `node scripts/test-circulars-gs.js` | 主後台：通告 CRUD＋`feeNote`/`signupNote`＋權限＋上限＋snapshot／isOpen＋pull＋router（23 項） |
| `node scripts/test-course-profile-gs.js` | 訓練班 Script：實填版＋template 版＋auth＋日期變體＋通告全文＋getCourseSheetRaw（18 項） |
| `node scripts/test-course-setup-gs.js` | 主後台：新制 create／push／pull-raw／getSetup＋欄位保留（16 項） |
| `node --experimental-strip-types scripts/test-course-setup-parse.ts` | 解析：parse／cells 座標／預算公式／列印數據（12 項） |
| `node --experimental-strip-types scripts/test-demo-engine.ts` | 示範引擎：14 卡＋通告＋pull mock＋新制 4 action（22 項） |
| `./node_modules/.bin/tsc --noEmit` | 前端 type-check |
