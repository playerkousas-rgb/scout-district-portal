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
- member-portal 只負責公開報名寫入，**唔做批核**。
- ★ 後台實行 **統一後台 v4.0**：兩邊共用同一張 Sheet + 同一份 Code.gs + 同一個 /exec + 同一個 API Key
  （Vercel 設兩個環境變數名 `PORTAL_{區碼}_APIKEY` / `MEMBER_{區碼}_APIKEY`，同一個 Key 值）。
  `staffLogin`／Staff 表保留喺共用後台（供舊 /staff 頁用），member-portal 前端只用公開 action。

---

## 1. 角色定義（已定案，對齊香港童軍總會 POR）

用返「受保護角色」框架，對齊 POR 區會職級 + 獨立受薪區職員：

| 角色碼 | 職稱 | 定位 |
|---|---|---|
| `SYSADMIN` | 系統管理員（超管，隱藏） | 平台最高，非 POR 公開職級 |
| `DC` | 區總監 | 區內最高，直屬地域，全管 |
| `DDC_ADMIN` | 副區總監（行政） | 行政／營運批核，直屬 DC |
| `DDC_TRAINING` | 副區總監（訓練） | 訓練班條線全管，直屬 DC |
| `ADC_*` | 助理區總監（各支部） | 協助 DC 處理支部事務 |
| `DL` | 區長（各支部） | 分支部，直屬 ADC |
| `LEADER` | 區領袖 | 直屬 DC，負責特定/一般職務 |
| `AL` | 助理區領袖 | 直屬區領袖／DC |
| `STAFF` | 區職員（受薪） | **特別獨立**，預設可處理行政類卡片（借場/借物資/知會/通告），其餘 view，上級可調 |

> 另有區專章秘書、區設備管理員等特設職位，非主層級。
> **Scope 委派**：每帳戶 `cards` 欄可限制一般卡片（上級設定下級睇到邊啲卡片）；留空 = 用角色矩陣。`rooms`「地域房間及區總部使用情況」例外：凡已登入都可 view，唔受 `cards` 白名單限制；`venueReg` 審批必須有實際 `canVenue` 權限，舊 Perms 嘅 view 唔會令未獲授權者見到卡。
> 登入後可自行改密碼（`changePassword`）；後台/Sheet 亦可直接改（換人時唔使知舊密碼）。

---

## 2. 完整卡片清單 + 權限矩陣

表格：`✏️`=可管理（edit） `👁`=可看（view） `—`=不可見。

### 2.1 系統類（非卡片、恆顯示畀管理員）
`帳戶管理 /users`、`權限·角色 /admin`、`外掛市集 /plugins` → 只限 **DC + SYSADMIN**。

> 下表矩陣預設列 DC/SYS/DDC/ADC/DL/LEADER；新增 `AL`（助理區領袖）預設同 LEADER（主要 view +
> 自己範圍）、`STAFF`（區職員受薪）預設行政類卡 edit（借場/借物資/知會/通告）、其餘 view。
> 一般卡片可由 DC／超管喺權限矩陣或「卡片範圍」微調；`ymis` 另有不可繞過的角色上限，不能授予 SYSADMIN／領袖。

### 2.1 卡片分類（done 已實作 / todo 加入中）— 最終定案
- **已實作（done，4 張）**：
  - `venueReg` 借場審批、`stockReg` 借物資審批、`activity` 活動知會（v4.32.0 起改為「旅團」子分頁）、`training` 訓練班管理（區會目錄）。
- **加入中（todo）**：awards / committee（`visit` 已改為子權限；`unit` 已於 v4.32.0 刪除）。（v4.4.0：contacts 聯結簿、incident 已完成；meeting 已刪除。v4.5.0：budget 已完成、rooms／orgchart 新增（全員 👁）；annual 已刪除。v4.6.0：news 消息發佈新增——DC／SYS／DDC_ADMIN／DDC_TRAINING／STAFF ✏️，其餘 👁）
- **已刪除**：`courseRegs` 報名審批（批核由訓練班負責領袖喺各班自己嘅 Sheet 做）、
  `notices` 通告庫（通告由通告圖書館提供，區無需管理）。
- 成員系統（member app）唔登入，純讀主 Sheet + 提交；所有登入事務（開班登記/批核借場借物資/權限/scope/改密碼/卡開關）都喺呢邊。
- Cards 表加 `category` 欄；admin 頁可**一鍵隱藏／顯示全部「加入中」**（`setCategoryEnabled`）。
- 主控台「加入中」卡片會顯示「🚧 加入中」標籤。

### 2.2 區政／行政

| cardId | 卡片 | 型態 | 資料來源 | DC | SYS | DDC_ADMIN | DDC_TRAIN | ADC | DL | LEADER |
|---|---|---|---|---|---|---|---|---|---|---|
| contacts | 聯結簿（旅團／港島地域／總會） | builtin | 內建目錄 + 旅團 Sheet | ✏️ | ✏️ | ✏️ | ✏️ | 👁 | 👁 | 👁 |
| budget | 區年度預算 | builtin | 原 Excel | ✏️ | ✏️ | ✏️ | 👁 | 👁 | 👁 | — |
| ymis | YMIS 會員核實（人工登入） | builtin | 區方 Script Properties → 官方 YMIS 登入頁 | 👁 | — | 👁 | 👁 | 👁 | — | — |
| committee | 委任系統 | jump | 委任表 | ✏️ | ✏️ | ✏️ | 👁 | 👁 | — | — |
| links | 常用外部連結 | builtin | 主 Sheet `Links` | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | 👁 | 👁 |
| keyDates | 重要日期／大型活動 | builtin | 主 Sheet `KeyDates` | ✏️ | ✏️ | ✏️ | ✏️ | 👁 | 👁 | 👁 |
| passcodes | 實體密碼（房門／影印機） | builtin | 主 Sheet `Passcodes` | ✏️ | ✏️ | ✏️ | ✏️ | 👁 | 👁 | 👁 |

> v4.33.0 三張卡：表外 STAFF／AL 一律 👁 —— 「全部人可看」＝**全部已登入區職員**，唔會經成員系統或公開 `doGet` 路由漏出去。`links` ADC 或以上 ✏️；`keyDates`／`passcodes` DDC 或以上 ✏️。`keyDates` 只得「活動」同「日期」兩格，日期自由文字由後台解析做排序欄。`passcodes` 只准放要人喺現場先用得着嘅實體密碼（後台擋電郵／網址格式），所以 `Passcodes` 表刻意唔列入 `protectSensitiveSheets_`。三行都寫入 `Perms`，可以喺權限矩陣再調。

> `ymis`：表外 STAFF／區職員亦有 👁；SYSADMIN／維護帳號、AL／助理區領袖冇。卡片同後台動作雙重核對當前角色，只有 DC／DDC／ADC／STAFF 可見；登入資料只喺按掣後從 Script Properties 取用，詳見 [`YMIS 人工登入卡部署指引`](ymis-verification-feasibility.md)。

### 2.3 營運／審批

| cardId | 卡片 | 型態 | 資料來源 | DC | SYS | DDC_ADMIN | DDC_TRAIN | ADC | DL | LEADER |
|---|---|---|---|---|---|---|---|---|---|---|
| visit | 旅團探訪 | builtin | 探訪表 | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | 👁 |
| awards | 獎勵提名 | builtin | 獲獎 Excel | ✏️ | ✏️ | 👁 | ✏️ | ✏️(該支部) | 👁 | 👁 |
| venueReg | 場地借用審批 | builtin | member `VenueBookings` | ✏️ | ✏️ | ✏️ | ✏️ | — | — | — |
| rooms | 地域房間及區總部使用情況 | builtin | 地域房間 ICS + Teamup 紅色確認子日曆 | 👁 | 👁 | 👁 | 👁 | 👁 | 👁 | 👁 |
| stock | 物資借用審批 | builtin | member `StockRequests` | ✏️ | ✏️ | ✏️ | 👁 | 👁 | 👁 | 👁 |
| activity（子權限） | 旅團 → 活動知會 | subperm | member `ActivityNotices` | ✏️ | ✏️ | ✏️ | ✏️ | 👁 | 👁 | 👁 |
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

- **卡片開關**（DC / SYSADMIN 超管可控）：`setCardEnabled` 改 `Cards.enabled`；關閉後前端主控台唔顯示（Perms 保留，重開即恢復）。
  唯 `ymis` 不因超管身分而繞過角色限制。admin 頁權限矩陣最右「開關」欄。
- **權限控制模型（跟用戶其他系統一致）**：靠「帳戶睇到邊張卡」嚟控制。
  Perms 矩陣決定每個角色對每張卡有冇 view/edit；後台寫入仍用角色（`canManageCourses_`/`canOps_`）粗粒度檢查，
  唔再另加卡片寫入權限層。
- **前端卡片門禁**：`lib/cardAccess.ts` 提供 `useRequireCard(cardId)`，每個功能頁 check 該角色對該卡有冇 access；
  就算直接打 URL，睇唔到張卡都會 redirect 返主控台 → 真正做到「睇唔到 = 做唔到」。
- 計劃中卡片（如 committee）可設為 builtin 佔位頁 + 可開關；v4.4.0 起「關」＝隱藏，只有 L0 超管見到。`unit` 已於 v4.32.0 刪除，不再保留佔位頁／Cards／Perms 行。

## 4. 對接所需要嘅改造（兩邊）

### member-portal（公開端，純 intake）
1. 前端只用公開 action：公開 submit（venue/stock/activity/course）+ `getPublicInfo`/`listItems`/`listCourses`/`listVenues`/`listCourseLinks`/`listActivityNotices`。
   （共用後台嘅 `staffLogin`／批核 action 保留但 member-portal 唔用。）
2. **入數紙權限**：`saveReceipt_` 唔再 `setSharing(ANYONE_WITH_LINK)`；改為存入管理員指定嘅 Drive folder（folder 層權限，只畀職員）。
3. `REG_HEADERS` 加 `status / reviewer / reviewedAt` 欄。

### scout-district-portal（區職員端，讀＋批核）
1. 新增卡片 `training`、`courseRegs`、`venue`、`stock`、`activity`、`notices`（見矩陣）。
2. 統一後台直接讀同一張 Sheet 嘅報名資料做批核，唔使另一組 env key（`MEMBER_{區碼}_APIKEY` 只係 member-portal 專案用嘅變數名，值同 `PORTAL_*` 一樣）。
3. `lib/api.ts` 加相應 action（`listCourses`、`listCourseRegs`、`setCourseRegStatus`、`saveCourseLink`…）。
4. 借場批核行 **`approveVenueBooking`**（TTLock 限時密碼 → Teamup 轉色 → 電郵），拒絕/取消行 `setVenueBookingStatus`。

### 兩邊都要
1. **簽署密鑰／維護帳號**：每區 Apps Script Script Properties 有私密 `PORTAL_TOKEN_SECRET`（≥32 字元）與機器橋接 `PORTAL_MASTER_PROXY_SECRET`；`setupSheets()` 缺值時自動建立。sheep 密碼只放 Vercel `PORTAL_{區碼}_MASTER_PASSWORD`（無最低長度門檻，短密碼較易被猜中）；Vercel `PORTAL_{區碼}_MASTER_BRIDGE_SECRET` 與 Apps Script 橋接值配對。`setupSheets()` 會移除舊 `PORTAL_MASTER_PASSWORD` Script Property。
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
- 新卡片（取代舊 venue/stock 跳轉佔位）：`venueReg`（/venue-regs）、`stockReg`（/stock-regs）、`activity`（當時為 /activity-notices；v4.32.0 起改入 /troop?tab=activity）。
- 權限（更新）：新建 `venueReg` 預設只畀 DC/SYS/DDC_ADMIN/DDC_TRAINING/STAFF edit；舊表的 view 格**不會**由 `setupSheets()` 修改，實時 `getCards_`／審批動作檢查 `canVenue`，未授權的 ADC／DL／LEADER／AL 仍不可見／不可批核。`stockReg`／`activity` 繼續用原有矩陣。查閱 `rooms` 卡對所有已登入者 view，與審批卡完全分開。
- 動作：
  - **借場**：`submitVenueRequest`（公開 intake）／`getVenueBookings`／`setVenueBookingStatus`／`saveVenue`/`deleteVenue`（維運）。
  - **借物資**：`submitStockRequest`（intake）／`getStockRequests`／`setStockRequestStatus`（**批准扣庫存、拒絕/取消歸還**）／`saveItem`/`deleteItem`。
  - **知會**：`submitActivityNotice`（記錄）／`listActivityNotices`（**按年份→日期排序 + year/section/nature 過濾**）／`deleteActivityNotice`。

### 前端
- `app/venue-regs`：申請審批 + 場地清單維運。
- `app/stock-regs`：申請審批（自動扣/還庫存）+ 物資清單維運。
- `components/ActivityNoticesPanel.tsx`（由 `app/troop` 承載；`app/activity-notices` 只作舊網址轉向）：知會瀏覽，**可篩選年份/支部/活動性質 + 排序**；Perms `activity` ✏️／管理員可手動新增/刪除。

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
2. ~~卡片 `unit`~~ 已定案刪除：不再保留旅團管理系統佔位卡、頁面或 Perms 行。
3. `venue`/`stock` 批核要唔要喺呢一期做，定淨係先做訓練班條線？
4. 入數紙係「只睇」定係「批核後先睇」？

---

## 11. v4.32.0 子分頁權限 — Perms 表統管

原 `visit`＋`troopDirectory`＋`activity` 三張卡合併為一張入口卡 `troop`（`/troop`，三個大分頁：旅團探訪／旅團資料（公開）／活動知會；申請邀請是探訪內的小分頁）。`troopContacts` 歸 `contacts`，顯示喺「聯絡簿 → 旅團」；`unit` 已刪除。
旅團入口卡本身**唔佔 Perms 行**；五行子權限各自有一行 Perms，超管喺 `/admin` 逐行撳 👁／✏️。
`getCards` 會將已授權子分頁以 `type:'subperm'` 偽卡形式附帶回傳，並帶各自 `parentId`（主控台會過濾，只顯示真正入口卡）；
旅團入口卡 `access` 只取 parent=`troop` 四行之中最高級，**不計** `troopContacts`，避免只有聯絡權限也誤開旅團卡。`getPerms` 回傳 `subPerms` 清單俾管理頁按 parent 畫子行；`savePerms` 照單保存五行（唔寫 `troop`／`unit` 行）。

| 子分頁 Perms id | Parent | 內容／位置 | 後端 actions | 預設 |
|---|---|---|---|---|
| `visit` | `troop` | 探訪登記／報告（👁＝可登記，✏️＝可改／刪紀錄） | `getVisitBoard`（view）、`saveVisit`（新增 view／改 edit）、`deleteVisit`（edit） | 全員 👁；DC／DDC／SYSADMIN ✏️ |
| `troopDirectory` | `troop` | 旅團公開資料（Units＋UnitSections） | `getTroopDirectoryBoard`（view）、`saveUnits`／`saveUnitSections`（edit） | 全員 👁；DC／DDC／各 ADC ✏️ |
| `troopRequests` | `troop` | 📨 旅團探訪內的申請／邀請收件箱（支部 ADC 只見自己支部＋全旅申請） | `getVisitRequests`（view）、`setVisitRequestStatus`（edit）；公開 `submitVisitRequest` 供成員端提交 | 各 ADC／DC／DDC／STAFF ✏️；其餘 — |
| `activity` | `troop` | 🗓 旅團活動知會 | `submitActivityNotice`（公開提交）、`listActivityNotices`、`deleteActivityNotice`；管理面板按此行 👁／✏️ 顯示操作 | 全員 👁；DC／SYSADMIN／DDC／STAFF ✏️ |
| `troopContacts` | `contacts` | 🔒 聯絡簿 → 旅團的私隠聯絡（旅長／團長電話電郵；支部 ADC 只見自己支部，自己支部冇團長就只見旅長） | `getTroopContacts`（view）、`saveTroopContact`／`deleteTroopContact`（edit） | 各 ADC 👁；DC／DDC／STAFF ✏️；其餘 — |

- 取代 v4.31.0 嘅固定政策（`districtFeatureAccess_` 已刪除）：以後調整權限只改 Perms 表，唔使改程式。
- `Users.cards` 個人範圍按實際子分頁 id 逐項適用；私隠聯絡在前端另須先通過 `contacts` 卡門禁，所以自訂白名單帳戶要同時有 `contacts` 與 `troopContacts`。
- 私隠聯絡資料只存 `TroopContacts` 表，永不寫落 `Units`／`UnitSections`，公開 `listDistrictTroops` 絕不包含（已加測試把關）。
- 明知限制：任何人有主試算表檢視權限都可直接開 `TroopContacts` 分頁（同其他敏感表一樣，已列入保護清單但唔係閱讀隔離）— 區方已確認接受。
