# 區管理平台 — 卡片 + 角色權限矩陣規劃（v1）

> 用途：統一規劃 `scout-district-portal`（區職員用）嘅成個卡片／功能同角色權限，
> 令之後對接 `member-portal`（公開報名端）同 Google Sheet／Apps Script 後台時有單一依據。

---

## 0. 兩邊分工（最終定案）

| 系統 | 使用者 | 角色 | 資料寫入 |
|---|---|---|---|
| **member-portal**（公開門戶） | 區內成員／旅團／公眾 | 無登入，純 intake | 報名寫入主 Sheet / 訓練班專屬 Sheet |
| **scout-district-portal**（區管理平台） | 區職員 | 登入後按角色 | 讀取＋批核＋管理（讀寫同一批 Sheet 嘅 status） |

- 訓練班 GS 開班／登記 Script／Drive／通告／批核 **全部喺 scout-district-portal 呢邊做**。
- member-portal 只負責公開報名寫入，**唔再做批核**（會剷走佢嘅 staffLogin／批核 code）。

---

## 1. 角色定義（建議）

用返現有「受保護角色」框架，按你講嘅職級對應：

| 角色碼 | 職稱 | 定位 |
|---|---|---|
| `DC` | 區總監 | 全管（唯一可改受保護角色 / 超管） |
| `SYSADMIN` | 系統管理員（超管 / sheep） | 全管（平台設定），但不能改 DC 及受保護角色 |
| `DDC_ADMIN` | 副區總監（行政） | 行政／營運批核 |
| `DDC_TRAINING` | 副區總監（訓練） | 訓練班條線全管 |
| `ADC_*` | 助理區總監（各支部） | 各自支部嘅訓練／報名／獎勵 |
| `DL`（區長） | 區長（分部／範疇負責人） | 管理指定範疇 |
| `LEADER`（職領袖） | 旅／單位領袖 | 主要 view + 自己旅嘅申請 |

> 註：`區長`、`職領袖` 係你新提出嘅職級，現有 setupSheets 未有。下面矩陣先列佢哋，
> 確認後再加入 Roles 表。

---

## 2. 完整卡片清單 + 權限矩陣

表格：`✏️`=可管理（edit） `👁`=可看（view） `—`=不可見。

### 2.1 系統類（非卡片、恆顯示畀管理員）
`帳戶管理 /users`、`權限·角色 /admin`、`外掛市集 /plugins` → 只限 **DC + SYSADMIN**。

### 2.2 區政／行政

| cardId | 卡片 | 型態 | 資料來源 | DC | SYS | DDC_ADMIN | DDC_TRAIN | ADC | DL | LEADER |
|---|---|---|---|---|---|---|---|---|---|---|
| contacts | 旅團聯絡簿 | builtin | 原 Excel／Sheet | ✏️ | ✏️ | ✏️ | ✏️ | 👁 | 👁 | 👁 |
| annual | 週年會議文件 | builtin | 文件庫 | ✏️ | ✏️ | ✏️ | 👁 | 👁 | 👁 | — |
| budget | 區年度預算 | builtin | 原 Excel | ✏️ | ✏️ | ✏️ | 👁 | 👁 | 👁 | — |
| meeting | 會議行事曆 | jump | TeamUp | ✏️ | ✏️ | ✏️ | 👁 | 👁 | 👁 | — |
| committee | 委任系統 | jump | 委任表 | ✏️ | ✏️ | ✏️ | 👁 | 👁 | — | — |
| unit | 旅團管理系統 | jump | 旅名冊 | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | 👁 |

### 2.3 營運／審批

| cardId | 卡片 | 型態 | 資料來源 | DC | SYS | DDC_ADMIN | DDC_TRAIN | ADC | DL | LEADER |
|---|---|---|---|---|---|---|---|---|---|---|
| visit | 旅團探訪 | builtin | 探訪表 | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | 👁 |
| awards | 獎勵提名 | builtin | 獲獎 Excel | ✏️ | ✏️ | 👁 | ✏️ | ✏️(該支部) | 👁 | 👁 |
| venue | 場地借用審批 | builtin | member `VenueBookings` | ✏️ | ✏️ | ✏️ | 👁 | 👁 | 👁 | 👁 |
| stock | 物資借用審批 | builtin | member `StockRequests` | ✏️ | ✏️ | ✏️ | 👁 | 👁 | 👁 | 👁 |
| activity | 活動知會審批 | builtin | member `ActivityNotices` | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | 👁 |
| incident | 意外／應變 | resource | 總會指引 | ✏️ | ✏️ | 👁 | 👁 | 👁 | 👁 | 👁 |

### 2.4 訓練班條線（本輪重點）

| cardId | 卡片 | 型態 | 資料來源 | DC | SYS | DDC_ADMIN | DDC_TRAIN | ADC | DL | LEADER |
|---|---|---|---|---|---|---|---|---|---|---|
| training | 訓練班管理（開班登記） | builtin | 主 Sheet `CourseLinks` | ✏️ | ✏️ | 👁 | ✏️ | ✏️(該支部) | 👁 | 👁 |
| courseRegs | 訓練班報名審批 | builtin | 各班專屬 Sheet `Regs` | ✏️ | ✏️ | 👁 | ✏️ | ✏️(該支部) | 👁 | — |

### 2.5 對外／通告

| cardId | 卡片 | 型態 | 資料來源 | DC | SYS | DDC_ADMIN | DDC_TRAIN | ADC | DL | LEADER |
|---|---|---|---|---|---|---|---|---|---|---|
| notices | 通告庫 | builtin | 通告連結表 | ✏️ | ✏️ | ✏️ | ✏️ | 👁 | 👁 | 👁 |

---

## 3. 訓練班條線：完整流程（intake → 批核 → output）

```
管理員（DDC_TRAINING / ADC）喺 scout-district-portal「訓練班管理」
  登記：課程名 / 支部 / 通告連結 / 收費 / 名額 / deadline
       ＋ 指派該班 Script(/exec) 位置 ＋ Drive 資料夾位置
       → 寫入主 Sheet「CourseLinks」
                 │
公開：member-portal /training 顯示「開放班」（deadline未過 + active=TRUE）
                 │  用戶填表 + 上傳入數紙（入該班指定 Drive）
                 ▼
        POST /api/proxy → 主後台 submitCourseReg_ 查 CourseLinks
                 │  按班轉發去該班專屬 Script /exec
                 ▼
        寫入該班專屬 Sheet「Regs」+ 入數紙存入該班 Drive
                 │
區職員：scout-district-portal「訓練班報名審批」
        檢視名單＋入數紙 → 批核 status（pending/approved/rejected）→ output
```

### 3.1 訓練班專屬表建議欄位（`Regs` 加 status）
```
id | refCode | submittedAt | courseId | courseTitle |
…(報名資料)… | receiptUrl | needReceipt | note |
status(pending/approved/rejected) | reviewer | reviewedAt   ← 新增
```

> **更新（對齊參考表）**：每班報名數據統一寫入「表格回應」分頁（參考 36 欄），
> 批核欄位＝「接納」（✔/✗）＋「審批狀態 / 批核人 / 批核時間」。
> 運作重心（不能改）：master GS 檔 → 負責人複製 → run script → 標準多分頁原始檔 → 改內容
> → 交 member app（報名）＋ 區管理系統（批核）。

### 3.2 主 Sheet `CourseLinks` 建議欄位（單一資料來源）
```
courseId | districtCode | title | badgeName | section | courseNo |
sessionsText | eligibility | fee | originalFee | subsidyNote |
deadline | quota | filled | venue | noticeUrl | contact |
scriptExecUrl | scriptApiKeyHash | driveFolderId | active | createdAt
```

---

## 3.3 卡片開關 + 卡片門禁（最終定案）

- **卡片開關**（DC / SYSADMIN 超管可控）：`setCardEnabled` 改 `Cards.enabled`，
  關閉後前端主控台唔顯示（Perms 保留，重開即恢復）。admin 頁權限矩陣最右「開關」欄。
- **權限控制模型（跟用戶其他系統一致）**：靠「帳戶睇到邊張卡」嚟控制。
  Perms 矩陣決定每個角色對每張卡有冇 view/edit；後台寫入仍用角色（`canManageCourses_`/`canOps_`）粗粒度檢查，
  唔再另加卡片寫入權限層。
- **前端卡片門禁**：`lib/cardAccess.ts` 提供 `useRequireCard(cardId)`，每個功能頁 check 該角色對該卡有冇 access；
  就算直接打 URL，睇唔到張卡都會 redirect 返主控台 → 真正做到「睇唔到 = 做唔到」。
- 所有計劃中卡片（meeting/committee/unit/incident）已設為 builtin 佔位頁 + 可開關。

## 4. 對接所需要嘅改造（兩邊）

### member-portal（公開端，純 intake）
1. **剷走** `staffLogin`／批核／Staff 相關 code（`saveStaff`/`deleteStaff`/`setStockRequestStatus`/`setCourseRegStatus`…）。
2. 保留：公開 submit（venue/stock/activity/course）+ `getPublicInfo`/`listItems`/`listCourses`/`listVenues`。
3. **入數紙權限**：`saveReceipt_` 唔再 `setSharing(ANYONE_WITH_LINK)`；改為存入管理員指定嘅 Drive folder（folder 層權限，只畀職員）。
4. `REG_HEADERS` 加 `status / reviewer / reviewedAt` 欄。

### scout-district-portal（區職員端，讀＋批核）
1. 新增卡片 `training`、`courseRegs`、`venue`、`stock`、`activity`、`notices`（見矩陣）。
2. 呢啲卡片後台要能透過另一組 env key（`MEMBER_{區碼}_APIKEY`）或直接讀 member Sheet，攞到報名資料做批核。
3. `lib/api.ts` 加相應 action（`listCourses`、`listCourseRegs`、`setCourseRegStatus`、`saveCourseLink`…）。

### 兩邊都要
1. **後門清除**：`MASTER_EMAIL/MASTER_PW`、`TOKEN_SECRET='CHANGE_ME_*'` 一律移除或改每區隨機。
2. **API Key**：每區 Code.gs 自動隨機生成（唔寫死），存 Vercel env + App 內登記。
3. **防濫用**：重複報名檢查（email+course）、honeypot／reCAPTCHA、Apps Script quota 注意。

---

## 5. 建議實作順序

1. ✅ 確認角色清單同卡片矩陣（已定：加入 `DL` 區長、`LEADER` 職領袖）。
2. 🔜 落 member-portal：入數紙權限修復 + `Regs` 加 status + 剷批核 code。
3. ✅ 落 scout-district-portal：Roles 表加 `DL`/`LEADER`，Cards 表加 `training`/`courseRegs`/`notices`。
4. ✅ 起「訓練班管理」後台（登記 Script/Drive/通告）→ 寫 `CourseLinks`。
5. ✅ 起「訓練班報名審批」後台（檢視＋批核 status）。
6. 🔜 接入 member-portal 公開報名對接 + 防濫用。
7. 🔜 上線後逐區改後門／密鑰。

---

## 7. 已實作（第一步：區管理 APP 架構）

> 呢一期只做「區管理 APP」呢邊嘅 Script + 大架構，member-portal 另一邊未郁。

### gs/Code.gs（主後台）
- 角色：`Roles` 表新增 `DL`（區長）、`LEADER`（職領袖）。
- 卡片：`Cards` 表新增 `training`（/training）、`courseRegs`（/course-regs）、`notices`（/notices）。
- 權限：新增 `training`、`courseRegs`（DDC_TRAINING 起可 edit）、`notices`（行政 edit）。
- 新表 `CourseLinks`（單一資料來源，含 `scriptExecUrl`/`scriptApiKey`/`driveFolderId`），受保護工作表。
- 新 action：
  - `getCourseLinks`（列訓練班）
  - `saveCourseLink` / `deleteCourseLink`（開班／刪班，限 DC/SYS/DDC_TRAINING）
  - `listCourseRegs` / `setCourseRegStatus`（轉發去該班專屬 Script 讀名單／改 status）
- 通用 helper：`sheetHeadersBySheet_`、`rowIndexByCol_`。

### gs/Code.gs.course.js（每班標準收表 Script 模板）
- `setupCourseSheet()`：一開就建立**齊參考表格式**嘅多分頁：
  - **表格回應**（報名數據，跟參考 36 欄：時間戳/電郵/中英姓名/性別/出生日期/所屬童軍區/旅團/ScoutID/童軍職位/附加資料/家長+領袖同意與聯絡/付款/入數紙截圖/接納…＋尾欄審批狀態/批核人/批核時間）。
  - **Input01 訓練班預算 / Input02 訓練班資料 / Input03 時間表 / Input04_Print支出表**（班職員後台填寫）。
  - **多張 Print 報告**（財政預算/通告/班職員名單/取錄名單/學員名單/出席紀錄/接納通知書/完成報告/領取證書紀錄/收支紀錄/總會資助計劃/合格名單）。
  - **參數 + 使用說明**。
- `addReg`：intake 寫入「表格回應」，防重複報名（email+非已取消）；入數紙存入 folder（**唔開 ANYONE_WITH_LINK**）。
- `listRegs` / `setRegStatus`：讀取「表格回應」／改批核狀態（寫「接納」✔/✗ + 審批狀態/批核人/批核時間）。

### 前端
- `lib/types.ts`：`CourseLink`、`CourseReg` + 一次性服務型別（`Venue`/`VenueBooking`/`StockItem`/`StockRequest`/`ActivityNotice`）。
- `lib/api.ts`：課程 5 個 + 一次性服務 11 個 api 方法。
- `app/training`：訓練班管理（開班登記表單 + 課程列表 + 編輯/刪除）。
- `app/course-regs`：報名審批（揀課程 → 名單 → 批/拒/取消）。
- `app/notices`：通告庫（佔位）。

### 對接預留
- 下一步先落 member-portal：收表 Script 收緊入數紙權限、加 status、剷 staffLogin 批核 code；再接通公開報名 → CourseLinks → 各班 Script。

---

## 8. 已實作（第二步：一次性服務 — 借場 / 借物資 / 知會）

> 借場、借物資、知會每區「開一次」，放喺主 Code.gs；只有訓練班先不停開。

### gs/Code.gs（一次性服務後台）
- 新表：`Venues` / `VenueBookings`（借場）、`Items` / `StockRequests`（借物資）、`ActivityNotices`（知會）。
- 新卡片（取代舊 venue/stock 跳轉佔位）：`venueReg`（/venue-regs）、`stockReg`（/stock-regs）、`activity`（/activity-notices）。
- 權限：`venueReg`/`stockReg`/`activity` 用 `opsEdit`（DC/SYS/DDC_ADMIN/DDC_TRAINING 可 edit，其餘 view）。
- 動作：
  - **借場**：`submitVenueRequest`（公開 intake）／`getVenueBookings`／`setVenueBookingStatus`／`saveVenue`/`deleteVenue`（維運）。
  - **借物資**：`submitStockRequest`（intake）／`getStockRequests`／`setStockRequestStatus`（**批准扣庫存、拒絕/取消歸還**）／`saveItem`/`deleteItem`。
  - **知會**：`submitActivityNotice`（記錄）／`listActivityNotices`（**按年份→日期排序 + year/section/nature 過濾**）／`deleteActivityNotice`。

### 前端
- `app/venue-regs`：申請審批 + 場地清單維運。
- `app/stock-regs`：申請審批（自動扣/還庫存）+ 物資清單維運。
- `app/activity-notices`：知會瀏覽，**可篩選年份/支部/活動性質 + 排序**；admin 可手動新增/刪除。

### 一次開 vs 訓練班分界
- 借場/借物資/知會/通告 = 主後台一次過開（一個 Sheet 多分頁），改 code 一次過生效。
- 訓練班 = 每班獨立 Sheet + 標準 Script（`gs/Code.gs.course.js`）+ Drive，一開就係參考表嘅多分頁格式（表格回應/Input/Print），班職員後台管理。

---

## 10. 已實作（第三步：訓練班模板對齊參考表多分頁格式）

> 按你嘅參考表（18 個分頁：Input01-04、多張 Print、表格回應、參數）重新設計每班模板，
> 令 `setupCourseSheet()` 一開就建立齊呢啲分頁，報名數據寫入「表格回應」（跟足參考 36 欄）。

- **表格回應**：報名 intake 直接寫入「表格回應」分頁（時間戳/電郵/中英姓名/性別/出生日期/所屬童軍區/旅團/ScoutID/童軍職位/附加資料/家長+領袖同意與聯絡/付款/入數紙截圖/是否需要收據/備註/接納）。
- **批核**：`setRegStatus` 寫「審批狀態」+「批核人」+「批核時間」＋更新「接納」（✔=approved / ✗=rejected/cancelled），同區管理平台前端 status 一致。
- **Input 分頁**：預算 / 資料 / 時間表 / 支出表（班職員填寫後台）。
- **Print 分頁**：12 張報告殼（財政預算/通告/班職員名單/取錄名單/學員名單/出席紀錄/接納通知書/完成報告/領取證書紀錄/收支紀錄/總會資助計劃/合格名單）。
- **參數 / 使用說明**：跟參考格式 + 指引。
- 入數紙仍存入 folder（folder 層權限，唔開 link）。

---

## 9. 已實作（收尾：通告庫 + 訓練班模板多分頁 + 指南）

- **通告庫**：新表 `Notices` + `listNotices`/`saveNotice`/`deleteNotice`；`app/notices` 由佔位改為可用（發佈/啟停/刪除/外連）。
- **訓練班模板**：`Code.gs.course.js` 加 `使用說明` 分頁、`ensureTab_` helper、選單「🎓 新增分頁」（可擴充多分頁）。
- **指南**：新增 `docs/setup-guide.md`（主後台＋每班 Script 部署、區職員使用流程、庫存邏輯、防濫用、安全、檔案對照）。

---

## 6. 待你確認問題

1. 角色：`區長(DL)`、`職領袖(LEADER)` 嘅確實職稱同「受保護」與否？
2. 卡片 `unit` 你已經有自己嘅旅團管理系統（jump）定係想喺呢邊內建？
3. `venue`/`stock` 批核要唔要喺呢一期做，定淨係先做訓練班條線？
4. 入數紙係「只睇」定係「批核後先睇」？
