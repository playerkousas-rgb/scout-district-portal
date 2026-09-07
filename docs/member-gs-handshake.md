# member-portal ↔ 統一後台（GS）對接合約 v4.3.0

兩邊共用同一份 `gs/Code.gs`、同一張 Sheet、同一個 `/exec` + API Key。

> 2026-09-07 已直接讀過 `https://github.com/playerkousas-rgb/member-portal.git`（HEAD `149f910`，Next 16 / React 19）核對：
> 借場、借物資、活動知會、訓練班報名嘅欄名同呢邊 GS 一致。member-portal 自己嘅合約文件係 `docs/integration-contract.md`。

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
{ "version": "4.3.0", "teamupReady": true, "teamupPendingSet": true, "teamupApprovedSet": true }
```

`version` 要係 `4.3.0` 先代表呢版 GS 已貼上線。

## 部署

1. 將本 repo `gs/Code.gs` **全部覆蓋**貼去 Apps Script → 儲存。
2. 執行 `setupSheets()`（補建唔清空）。
3. Config 填齊 TEAMUP_*（至少 API Key、日曆、pending、approved 四個）。
4. **部署 → 新部署**（或「管理部署」更新現有 Web App）。
5. `Venues` / `Items` 表要有資料，member-portal 下拉先有得揀。
6. 兩邊 Vercel 用同一個 `/exec` + 同一個 API Key。
