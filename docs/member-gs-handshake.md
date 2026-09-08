# member-portal ↔ 統一後台（GS）對接合約 v4.6.1

兩邊共用同一份 `gs/Code.gs`、同一張 Sheet、同一個 `/exec` + API Key。

> ## ⭐ 唯一後台原則（2026-09-08 定案）
> **`scout-district-portal/gs/Code.gs` 係唯一後台來源**：所有 Sheet 結構、action、權限、電郵、庫存邏輯一律喺呢邊改，
> member-portal **唔會**、亦**唔應該**自己養一份 Code.gs 或者自己 patch Sheet。
> 成員系統嗰邊只做三件事：① 揀區 ② 經自己 proxy 用**公開 action** 讀選項 ③ 提交表格。
> 佢個 proxy 嘅 action allowlist ／ 欄位白名單係**安全邊界**，唔係業務邏輯——後台加咗新 action，
> 成員端唔加白名單就淨係「用唔到」，唔會出錯。
>
> 例外：成員系統首頁連去嘅**通告圖書館**係外接系統（`scout-circulars.vercel.app`），
> 唔經 Sheet、唔經 GS，同本合約無關。
>
> **對齊檢查（每次成員系統更新後跑一次）：**
> ```bash
> node scripts/check-member-alignment.js               # 自動 clone 最新 member-portal
> node scripts/check-member-alignment.js ../member-portal
> ```
> 會列出：① 成員端叫緊但後台冇嘅 action（＝佢會收到「未知的 action」）② proxy GET 白名單對唔對得上
> ③ 有冇不小心放行咗需要登入／批核嘅 action。

> 2026-09-07 已直接讀過 `https://github.com/playerkousas-rgb/member-portal.git`（HEAD `149f910`，Next 16 / React 19）核對：
> 借場、借物資、活動知會、訓練班報名嘅欄名同呢邊 GS 一致。member-portal 自己嘅合約文件係 `docs/integration-contract.md`。

## 📦 一次過借多款物資 `submitStockBatchRequest`（v4.6.1 補上）

成員系統一張表揀幾款物資時會**先叫呢個 action**；舊版後台冇 → 佢要 fallback 逐件 POST
（N 次來回、可能寫一半、申請人收 N 封信）。而家統一由本檔處理，fallback 唔會再行到。

```
member-portal 一張表揀 3 款
   POST submitStockBatchRequest
   { name, phone, email, troop, position, purpose, borrowDate, returnDate, agreeRules,
     items: [{itemId, qty}, …], batchRef?（成員端自己生成亦可，格式 [A-Za-z0-9_-]{1,40}） }
        │
        ├─ 先**全部核對**（物資存在／數量>0／夠貨）——任何一款唔掂 → 成批唔寫
        ├─ 同一款物資揀兩次 → 自動合併數量
        └─ 每款寫一行 StockRequests（status=pending），**共用同一個 `batchRef`**
        │
        ▼
{ "ok": true, "refCode": "SB-…", "refCodes": ["SR-…","SR-…"], "data": { "batchRef": "SB-…",
  "submittedCount": 2, "requestedCount": 2 } }
```

- 只寄**一封**通知俾區職員（列晒全部物資），唔會逐件洗版。
- 提交唔扣庫存（同單件一樣，**批准先扣**）。
- 管理系統 `/stock-regs` 會將同一 `batchRef` 嘅行合成「🧾 一張申請 · N 款物資」，
  可以 `setStockBatchStatus`（POST `{token, batchRef, status}`，需 `canStock`）
  一次過批准／拒絕／歸還：庫存逐行加減（重複批唔會重複扣），申請人只收一封信。
- `StockRequests` 新增 `batchRef` 欄（`setupSheets()` 會自動補，唔清空）；舊資料留空 = 單件申請，行為完全不變。
- 單件 `submitStockRequest` 一切照舊；佢亦接受 `batchRef` 透傳。

## 📢 消息發佈（v4.6.0 新增）— 管理系統發，成員系統首頁置頂顯示

做法＝**方案 2「一直置頂」（pull on open + pinned display）**：冇推送、冇 Service Worker、冇 badge。
member-portal 每次載入首頁 fetch 一次公開 action，有置頂消息就顯示，冇就隱藏。

```
管理系統 /news「＋ 發佈消息」→ saveAnnouncement（需 Perms 矩陣 news = edit）
        │
        ▼
主 Sheet 新工作表 News（setupSheets() 自動補建，唔清空）
        │
        ▼
GET listAnnouncements?pinnedOnly=1&limit=10   ← 公開、免登入、no-store
        │
        ▼
member-portal 首頁 <NewsBanner /> 頂部置頂顯示
        │
管理系統刪除／下架／過咗自動落架日 → 呢邊下次載入即刻消失
```

### News 表欄位

| 欄 | 說明 |
|---|---|
| `id` | `nw_xxx`，後台自動生成 |
| `districtCode` | 自動填 |
| `title` / `body` | 標題／內容（必填） |
| `date` | `yyyy-MM-dd` 顯示日期；**填將來日期＝到嗰日先出現（排期）** |
| `pinned` | `TRUE` = 成員系統首頁頂部一直顯示 |
| `level` | `info`（藍）／`warn`（黃）／`urgent`（紅） |
| `link` / `linkLabel` | 選填「查看詳情」連結（member proxy 只放行 http(s)） |
| `notify` | 允許成員端彈系統通知（純顯示版可以唔理；升級做方案 1 先用） |
| `active` | `FALSE` = 下架（記錄仍在，成員端即刻唔見） |
| `expiresAt` | `yyyy-MM-dd` 自動落架日，過咗自動消失（留空 = 一直顯示） |
| `publishedAt` / `publishedBy` / `updatedAt` / `createdAt` | 系統自動 |

### Actions

| action | 方式 | 權限 | 用途 |
|---|---|---|---|
| `listAnnouncements` | GET | **公開** | 成員系統讀；參數 `pinnedOnly=1`／`limit`（≤50）／`since=ISO`（只回之後更新過嘅，用嚟做「有新消息」判斷） |
| `getAnnouncements` | GET `token` | 登入 | 管理系統列表：連已下架／已過期／排期中都回，另加 `expired` / `scheduled` / `live` |
| `saveAnnouncement` | POST `{token, announcement}` | `news` = edit | `announcement.id` 留空 = 新增；`id`／`publishedAt`／`publishedBy` 鎖欄唔改得 |
| `deleteAnnouncement` | POST `{token, id}` | `news` = edit | |
| `setAnnouncementPinned` | POST `{token, id, pinned}` | `news` = edit | |
| `setAnnouncementActive` | POST `{token, id, active}` | `news` = edit | 上架／下架 |

`listAnnouncements` 公開回應**唔會**有 `active` / `publishedBy`；已下架、已過期、未到日期嘅一律唔會出現。
未建 News 表（舊後台）→ 回空陣列，member-portal 唔會爆。

### member-portal 要改嘅 6 個位

| 檔案 | 改法 |
|---|---|
| `app/api/proxy/route.ts` | `GET_ACTIONS` 加 `listAnnouncements`；加 `GET_PARAMS`（只放行 `pinnedOnly` / `limit`）；加 `publicAnnouncement()` 欄位白名單；`sanitizeGet` 加分支 |
| `lib/types.ts` | 加 `Announcement` |
| `lib/api.ts` | 加 `mapAnnouncement` + `api.listAnnouncements(pinnedOnly)` |
| `components/NewsBanner.tsx` | 新元件：載入時拉一次；冇消息／後台未升級就 `return null` |
| `app/page.tsx` | hero 下面加 `<NewsBanner />` |
| `app/globals.css` | `.news-pins` / `.news-pin`（info 藍 / warn 黃 / urgent 紅） |

**現成 patch：** [`docs/member-portal-news-banner.patch`](member-portal-news-banner.patch)
（已對 member-portal HEAD `149f910` 做過 `git am` + `tsc` + `next build` 驗證）：

```bash
git am path/to/member-portal-news-banner.patch   # 或 git apply
```

想升級做**方案 1（開 app 彈系統通知）**：唔使再改後台，`NewsBanner.tsx` 檔頭註釋已寫好嗰十行——
比較 `items[0].updatedAt` 同 `localStorage.news_seen`，新過就 `Notification.requestPermission()`。

## 訓練班收費 FPS QR（v4.3.0 新增）

```
管理系統 /training（訓練班管理）
   按該班「💳 收費 QR」→ 用 Config FPS 戶口 + fee + 課程編號即時生成
   → 「儲存 QR 到此班」= saveCourseLink（帶 fpsQrPayload 等 6 欄）
        │
        ▼
CourseLinks 多咗 6 欄：
   fpsQrPayload      已計好 CRC 嘅 FPS QR 字串（成員系統只需畫 QR）
   fpsAmount         固定銀碼（= 學費）
   fpsReference      參考編號（預設課程編號 courseNo）
   fpsAccountName    生成當刻嘅戶口名
   fpsAccountNumber  生成當刻嘅 FPS ID
   fpsUpdatedAt      ISO 時間
        │
        ▼
member-portal  GET listCourseLinks  → 每個 course 都會多呢 6 個 key（未生成 = 空字串）
```

**GS 行為：** `saveCourseLink` 只有 body 帶 `fpsQrPayload` 先會掂呢 6 欄（`undefined` = 保留舊值；空字串 = 移除 QR）。
舊版 member-portal 完全唔受影響（多咗 key 唔會 crash）。

### member-portal 要改嘅位（先可以喺報名頁顯示 QR）

member-portal 個 proxy 有 **公開欄位白名單**，新欄位會被剝走，所以要改 4 個檔：

| 檔案 | 改法 |
|---|---|
| `app/api/proxy/route.ts` → `publicCourse()` | 白名單加 `fpsQrPayload, fpsAmount, fpsReference, fpsAccountName, fpsAccountNumber` |
| `lib/types.ts` → `CourseLink` | 加同名 5 個 optional string |
| `lib/api.ts` → `mapCourse()` | 一併 map 過去 |
| `app/training/page.tsx` 付款區 | 有 `fpsQrPayload` 就用 `qrcode.react` 畫 QR（`npm i qrcode.react`），旁邊顯示 `fpsAccountName`、`fpsAccountNumber`、`HK$ fpsAmount`、`fpsReference`；冇就維持現有文字 |

顯示建議：報名成功頁 + 「未交費」提示都放同一個 QR 區塊，等申請人一眼搵到「掃邊個 QR、入邊個戶口、交幾多錢」。
`fpsQrPayload` 係 HKICL Common QR 標準字串，直接 `<QRCodeCanvas value={fpsQrPayload} />` 就掃得。

**現成 patch：** [`docs/member-portal-fps-qr.patch`](member-portal-fps-qr.patch)（已對 member-portal HEAD `149f910` 做過 `tsc` 通過）。
喺 member-portal repo 入面：

```bash
git am path/to/member-portal-fps-qr.patch   # 或 git apply
npm install                                  # 會裝 qrcode.react
```

包含：proxy 白名單、`CourseLink` 型別、`mapCourse`、新元件 `components/CourseFpsQr.tsx`（繳費區 + 報名成功頁）、CSS、`docs/integration-contract.md` 一段。

## 活動知會（已核對雙向打通）

```
member-portal /activity 填表
   POST action=submitActivityNotice
   { year, section, nature, troop, activityName, startDateTime, endDateTime, location,
     membersCount, leadersCount, parentsCount, leaderName, leaderPhone, leaderEmail, note }
        │
        ▼
GS submitActivityNotice_ → ActivityNotices 新增一行（refCode AN-yyyyMMdd-nnnn）
   + AllRecords 一筆 + NOTIFY_STAFF_EMAIL 電郵
        │
        ▼
管理系統 /activity-notices → listActivityNotices（年份／支部／性質過濾、DDC+ 可刪）
```

必填：`troop, activityName, leaderName, leaderPhone`。
⚠️ 如 Config 有填 `ACTIVITY_SCRIPT_URL`，GS 會轉發去外部 Script 而**唔寫本表**，管理系統就會睇唔到；要雙向就留空。
member-portal 個 proxy 讀 `listActivityNotices` 時會剝走 `leaderName / leaderPhone / leaderEmail / note`（公開端唔顯示個人資料）；管理系統經自己 proxy 讀就係全欄。

## 意外／應變：意外報告（v4.3.0，管理系統專用）

`IncidentReports` 表 = 香港童軍總會行政署「意外報告」(ACC-RPT 2019/07) 兩頁全部欄位（camelCase），
另加 `id, districtCode, refCode(IR-…), status(submitted/reviewed), submittedAt, submittedBy, serious, createdAt`。
`details` / `followUps` 係 JSON 字串 `[{when, text}]`。

| action | 權限 | 用途 |
|---|---|---|
| `submitIncidentReport` (POST `{token, report}`) | 登入 | 前端按「確定提交」先呼叫；草稿只存本機 localStorage |
| `listIncidentReports` (GET `token`) | 登入 | 最新在前 |
| `updateIncidentReport` (POST `{token, id, patch}`) | canVenue | 單位主管省閱、補跟進；`id/refCode/submittedAt` 等鎖欄唔改得 |
| `deleteIncidentReport` (POST `{token, id}`) | canVenue | |

`IncidentReports` 已加入 `protectSensitiveSheets_`（個人資料）。member-portal **唔應該**接呢組 action。

## 借物資（而家打通）

```
member-portal 填表
   POST action=submitStockRequest（別名 addStockRequest）
        │
        ▼
StockRequests 新增一行 status=pending
   （Items.availableQty 此時唔扣）
        │
        ▼
區職員 /stock-regs → setStockRequestStatus
   approved  → 扣庫存 + 電郵申請人
   rejected / cancelled / returned → 回補（如之前已扣）+ 電郵
```

### 提交欄位

| 主欄名 | 兼容別名 | 必填 |
|---|---|---|
| `itemId` | `item_id` / `item` | ✅（或 `items[]`） |
| `qty` | `quantity` / `amount` / `count` | ✅ |
| `name` | `applicant` / `who` | ✅ |
| `phone` | `tel` / `mobile` | ✅ |
| `email` | `mail` | 建議（有先收到批核信） |
| `troop` | `unit` / `group` | |
| `position` | `rank` / `title` | |
| `purpose` | `reason` / `note` / `remarks` | |
| `borrowDate` | `startDate` / `start` / `date` | |
| `returnDate` | `endDate` / `end` | |
| `agreeRules` | `agree` / `accepted` | |
| `items` / `cart` / `lines` | `[{itemId, qty}, …]` | 一次借多件 |

公開讀物資：`GET listItems`（回 `itemId, name, category, totalQty, availableQty, unit, note, location`）。

成功回應兩邊都讀到：

```json
{ "ok": true, "refCode": "SR-20260818-1234", "data": { "refCode": "SR-20260818-1234", "refCodes": ["SR-…"] } }
```

## 借場（而家測試：填表 → Teamup 登記 → 呢邊批核）

```
member-portal 填表
   POST action=submitVenueRequest（別名 addVenueRequest）
        │
        ├─ VenueBookings 新增一行 status=pending
        └─ Teamup「申請中」子日曆建【申請】事件，寫入 teamupEventId
             （Teamup 失敗唔擋收表，warn 會回傳）
        │
        ▼
區職員 /venue-regs
   DDC+ → approveVenueBooking（一鍵：鎖密碼 + Teamup 轉色 + 電郵；鎖失敗 fallback 密碼）
   其他有權限 → confirmVenueBooking（狀態 + Teamup，唔掂鎖）
   拒絕 → rejectVenueBooking
   編輯內容 → updateVenueBooking（而家只改 Sheet，未同步 Teamup 時段）
```

**已接前端（4.2.3）**：DDC+「⚡ 一鍵批准」行 `approveVenueBooking`。鎖未通唔擋批核。

### 提交欄位

| 主欄名 | 兼容別名 | 必填 |
|---|---|---|
| `venueId` | `venue_id` / `venue`（可用場地名稱） | ✅ |
| `name` | `applicant` / `who` | ✅ |
| `phone` | `tel` / `mobile` | ✅ |
| `startDate` | `start` / `from` / `date` + 可選 `startTime` | ✅ |
| `endDate` | `end` / `to` + 可選 `endTime` | ✅ |
| `email` | `mail` | 建議 |
| `troop` / `position` / `purpose` / `agreeRules` | 同上 | |
| `teamupEventId` | `eventId` | 有就沿用，唔再新建 |

成功：

```json
{ "ok": true, "refCode": "VR-…", "teamupEventId": "1234567890", "warn": "", "data": { … } }
```

### Teamup Config（測試借場必填）

| Config key | 用途 |
|---|---|
| `TEAMUP_API_KEY` | Teamup API Token |
| `TEAMUP_CALENDAR_KEY` | 分享金鑰 `ks…` |
| `TEAMUP_PENDING_SUBCAL_ID` | **申請中**子日曆（填表建事件） |
| `TEAMUP_APPROVED_SUBCAL_ID` | **確認借用**子日曆（批准轉色） |
| `TEAMUP_REJECTED_SUBCAL_ID` | 選填：拒絕／取消 |

健康檢查 `?action=getHealthCheck`（免 Key）會回：

```json
{ "version": "4.6.1", "teamupReady": true, "teamupPendingSet": true, "teamupApprovedSet": true }
```

`version` 要係 `4.6.1` 先代表呢版 GS 已貼上線。

## 部署

1. 將本 repo `gs/Code.gs` **全部覆蓋**貼去 Apps Script → 儲存。
2. 執行 `setupSheets()`（補建唔清空）。
3. Config 填齊 TEAMUP_*（至少 API Key、日曆、pending、approved 四個）。
4. **部署 → 新部署**（或「管理部署」更新現有 Web App）。
5. `Venues` / `Items` 表要有資料，member-portal 下拉先有得揀。
6. 兩邊 Vercel 用同一個 `/exec` + 同一個 API Key。
