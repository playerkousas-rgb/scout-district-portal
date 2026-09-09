# 訓練班 Sheet → 開班登記 → 區通告 PDF（v4.12.0）

> ADC 喺訓練班 Sheet 填一次 → 管理系統自動讀取開班 → 通告草稿自動預填 →
> 列印傳統格式 PDF → 上載區網／交總會（通告圖書館自動收錄）→ 回填連結。
> **PDF only：冇公開通告頁、冇 feed。** member-portal 唔使改。

## 流程總覽

| 步驟 | 邊度做 | 做咩 |
|---|---|---|
| 1. 填 Sheet | 訓練班專屬 Sheet | ADC 填好 `Input01 訓練班預算`／`Input02 訓練班資料`／`Input03 時間表`（同以前一樣，一次搞掂） |
| 2. 開班登記 | 管理系統 `/training` | 貼上該班收表 Script `/exec`＋API Key＋Drive 資料夾 ID → 撳「📥 由訓練班 Sheet 讀取」→ 名稱／名額／收費／日期場地／截止／聯絡自動帶入 → 儲存（啟用） |
| 3. 掛上成員系統 | 自動 | `active=TRUE`＋未過截止 → 成員系統即時顯示該班，成員用**內置報名表**報名（唔再用 Google Form） |
| 4. 通告草稿 | 管理系統 `/circulars` | 開新通告 → 掛接訓練班 →「⬇ 從訓練班帶入資料」預填節數／收費／名額／截止 → 補參加資格／備註等內文 |
| 5. 列印 PDF | `/circulars` | 撳「🖨 列印 PDF」→ 瀏覽器列印存成傳統格式 PDF（節數表／費用＋FPS QR／報名辦法／署名） |
| 6. 上載＋回填 | 區網＋`/circulars` | PDF 交網站管理員上載區網（或交總會／地域網站；圖書館自動收錄）→ 將區網 PDF 連結貼入「↗ 回填訓練班」→ 成員系統該班即跳轉睇真通告 |

## 訓練班 Sheet 結構（讀取用）

`getCourseProfile` 用 **A 欄 label 對位**（唔寫死行號），容忍 template 版同實填版差異。
實填版（例「第1屆工作坊」）以 `gs/Code.gs.course.js` 註解為準，重點：

- `Input02 訓練班資料`：B1 名稱／`名額`／`預計收費`／`職員人數`／`活動日期及場地`
  （表頭行喺 label 上面一行；label 行本身就係第一節資料）／`截止報名日期`／
  `最遲公佈取錄名單日`／職員表（`職位`＋`姓名`表頭行之後，直到`班職員總人數`：
  職位／姓名／稱謂／所屬單位／資格標註／電話／電郵）。
- **上通告規則**：節次有「通告顯示日期」先上通告（`showOnCircular`）。
  對應 portal：`/training` 節數同通告節數表都優先用通告顯示三欄（中文寫法）。
- `Input01 訓練班預算`：屆別／支部／專章／自定義名稱／形式-1／形式-2、
  預計收生／收費／職員、預算日期（B 日期／C 時間／E 場地）、
  批准總預算／申請津貼。冇呢頁都唔會報錯（budget 欄留空）。
- 日期接受 Date 物件／`d/m/yyyy` 字串／ISO，全部正規化做 `yyyy-MM-dd`。

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
`budgetApproved`／`subsidyRequired`／`pulledAt`。

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
`saveCircular`（`circular` 物件；id 留空＝新增 draft；編號區內唔重複）／
`deleteCircular`／`setCircularStatus`（draft／published／closed／archived 互相轉；
首次發佈先設 `publishedAt`）。

## 欄位對應（Sheet → CourseLink → Circular）

| Sheet | CourseLink（`/training`） | Circular（`/circulars` 從訓練班帶入） |
|---|---|---|
| Input02 名稱 | `title` |（手填：通告標題） |
| Input02 名額／預計收費 | `quota`／`fee` | `quota`／`fee` |
| Input02 截止報名日期 | `deadline` | `deadline` |
| 通告顯示三欄（有顯示先計） | `sessionsText`（`；`分隔）、`venue`（去重 `、`分隔） | `sessions[]`（逐節拆返） |
| 班領導人（姓名＋稱謂＋電話＋電郵） | `contact` | `contactName`（全文） |
| Input01 支部／專章 | `section`／`badgeName` | — |
| — | — | 參加資格／資助說明／服裝／備註／查詢補充（手填，Sheet 冇） |
| — | `noticeUrl`（區網 PDF，上載後回填） | 報名連結 `signupUrl`（預設成員系統 `/training`，Config `MEMBER_PORTAL_URL`） |

## 權限

- `circulars` 卡：DC／SYSADMIN／DDC_ADMIN／DDC_TRAINING／全部 ADC／STAFF 可編輯，
  DL／LEADER／AL 只可查閱（`circularsEdit()`）。
- `pullCourseProfile`：`canCourse`（同開班登記一樣）。
- 通告編號**人手輸入**（跨類別共用，區內唔重複）；`suggestedNo` 只係建議（最大純數字＋1）。

## 部署

1. 主後台：`gs/Code.gs`（v4.12.0）全部覆蓋 → 跑 `setupSheets()`（自動補 `Circulars`
   表＋`circulars` 卡＋權限＋`MEMBER_PORTAL_URL` Config）→ 重新部署。
   驗證：`?action=getHealthCheck` 見 `version: "4.12.0"`。
2. Config 填 `MEMBER_PORTAL_URL`（成員系統網址，通告「報名辦法」用）。
3. 訓練班 Script 模版：`gs/Code.gs.course.js` 已加 `getCourseProfile`。
   **舊班要將新模版覆蓋貼上**（唔使重跑 setup，唔影響已有資料），「由 Sheet 讀取」先用到。
   改完模版記得 `cp gs/Code.gs.course.js public/downloads/Code.gs.course.js.txt`。
4. member-portal：**唔使改**（`noticeUrl` 照舊指向區網 PDF；報名用現有內置表）。

## 測試

| 指令 | 覆蓋 |
|---|---|
| `node scripts/test-circulars-gs.js` | 主後台：通告 CRUD＋權限＋上限＋snapshot／isOpen＋pull＋router（23 項） |
| `node scripts/test-course-profile-gs.js` | 訓練班 Script：實填版＋template 版＋auth＋日期變體（12 項） |
| `node --experimental-strip-types scripts/test-demo-engine.ts` | 示範引擎：14 卡＋通告＋pull mock（19 項） |
| `./node_modules/.bin/tsc --noEmit` | 前端 type-check |
