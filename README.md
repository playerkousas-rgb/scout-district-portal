# 🧭 童軍區管理平台（scout-district-portal）

區職員端嘅統一管理平台。**借場 / 借物資 / 活動知會 / 訓練班目錄 + 報名批核** 全部由一份
`gs/Code.gs`（Google Apps Script 後台）＋ 呢個 Next.js 前端 ＋ 一個 `/api/proxy` ＋ 一個 API Key 完成。

> 公開報名端（申請人填表嗰邊）係另一個 repo：**member-portal**。呢邊只做「區職員審批」。

---

## 🏛 借場系統 — 起動步驟（最常要做，照住做就得）

架構：**申請人（member-portal）填表 → 寫入 Google Sheet（pending）＋ Teamup「申請中」事件 →
區職員喺 `/venue-regs` 批准（Teamup 轉色）。** TTLock 一鍵密碼稍後再接。

對接合約見 [`docs/member-gs-handshake.md`](docs/member-gs-handshake.md)。

> `services/skw-booking/` 係**選用**嘅舊獨立方案，主流程唔使理佢。

### 第 1 步：起後台（Google Sheet + Apps Script）
1. 開一張 Google Sheet（或沿用你已有嗰張）→ **擴充功能 → Apps Script**。
2. 將 `gs/Code.gs`（最新版 4.0.1）**全部內容覆蓋貼上** → 儲存。
3. 函數選單揀 **`setupSheets`** → 執行（首次要授權：Review permissions → Advanced → Allow）。
   - 自動建齊所有工作表（Config / Users / Venues / VenueBookings / CourseLinks …）。
   - ★ 係「**補建唔清空**」：重跑唔會洗走你已有資料。
   - 彈窗會顯示 **API Key（只顯示一次）→ 即刻複製**。
4. 改安全設定（喺 `Code.gs` 頂部）：`TOKEN_SECRET`、`MASTER_EMAIL`、`MASTER_PW`、`DEFAULT_PASSWORD`。
5. **部署 → 新增部署 → 網頁應用程式**（執行身分：我自己；存取：**任何人**）→ 攞 `/exec` 網址。

### 第 2 步：填 Config 金鑰（喺「Config」工作表）

> **簡潔版設定表：** 請先看 [`docs/config-simple.md`](docs/config-simple.md)。電郵只需填 `NOTIFY_STAFF_EMAIL`；`notifyFrom` 只是顯示名稱，`approverEmail` 現行不用填。
| 區塊 | 欄位 | 備註 |
|---|---|---|
| Teamup | `TEAMUP_API_KEY` | 兼容舊欄名 `teamupApiKey` |
| Teamup | `TEAMUP_CALENDAR_KEY` | 分享金鑰，形如 `ks...`（唔係 `c/` 開頭） |
| Teamup | `TEAMUP_APPROVED_SUBCAL_ID` | 「確認借用區總部」子日曆 ID |
| Teamup | `TEAMUP_REJECTED_SUBCAL_ID` | 選填（拒絕子日曆） |
| TTLock | `ttlockClientId` / `ttlockClientSecret` | 通通鎖開發者應用 |
| TTLock | `ttlockUsername` / `ttlockPassword` | TTLock App 登入帳密 |
| TTLock | `ttlockLockId` | 大門鎖 Lock ID |
| TTLock | `ttlockApiBase` | 預設 `https://api.ttlock.com`（eu/cn 先改） |
| TTLock | `ttlockDisabled` | **未就緒先填 `TRUE`**（改用隨機密碼，其餘流程照跑） |
| 電郵 | `notifyFrom` | 寄件人名稱（預設用區名） |

> 唔記得 Key 喺邊度攞 → 睇 [`docs/keys-checklist.md`](docs/keys-checklist.md) 逐條倒返出嚟＋驗證。
> ℹ️ 借場/借物資規則（VENUE_RULES_URL / VENUE_TERMS_URL / STOCK_RULES_URL）已改由成員系統內建，後台唔使再填。

### 第 3 步：加場地
- 「Venues」工作表加一行（`venueId` 代碼 + `name` 名稱），或直接喺平台 `/venue-regs` 頁底「＋ 新增場地」。

### 第 4 步：接上平台（區目錄 + API Key）
- `lib/district.ts` 已註冊 **SKW（筲箕灣區）** 嘅 `apiBase`。換區先要加一筆。
- Vercel → Settings → Environment Variables 設 **`PORTAL_{區碼}_APIKEY`**（例：`PORTAL_SKW_APIKEY=ak_...`）。
- 驗證：瀏覽器開 `https://你嘅網址/api/proxy?districtCode=SKW&action=getHealthCheck` 見到 `ok: true` 同 `version: "4.2.0"` 即通。

### 第 5 步：member-portal 申請表（另一個 repo）
- member-portal 嘅借場表接公開 action **`submitVenueRequest`**（經佢個 proxy 帶 API Key），欄位：
  `venueId, name, phone, email, troop, position, purpose, startDate, endDate, agreeRules, teamupEventId`。
- ⚠️ `email` 選填，但**冇填就收唔到批准密碼電郵**。

### 第 6 步：端到端測試
1. 用申請人身份喺 member-portal 交表 → 後台「VenueBookings」出現 **pending**。
2. 登入管理平台 → `/venue-regs` → 點「✅ 批准」。
3. 睇結果：頁面顯示 🔑 密碼、Teamup 出現「確認借用」事件、申請人收到密碼電郵。

### 驗證新版已上線
- 部署後開 `?action=getHealthCheck`（免 API Key）→ 見 `version: "4.1.0"` 即代表用緊最新後台。

---

## 💳 FPS QR 製作（v4.1.0 新卡片）

收款戶口已內建預設：**SCOUT ASSOCIATION OF HONG KONG - SHAU KEI WAN DISTRICT**（FPS ID `102866183`），唔填 Config 都用到。
要換戶口先喺 Google Sheet 嘅 Config 表改：
- `FPS_ACCOUNT_NAME`：區會轉數快戶口名（顯示用）
- `FPS_ACCOUNT_NUMBER`：轉數快收款 FPS ID（7 或 9 位數；本區為 `102866183`）

登入平台 → 主控台「💳 FPS QR Code 製作」卡片 → 輸入銀碼（可選參考編號）→ **QR 即時生成** → 直接複製 QR 圖片、用手機系統分享，或下載 PNG 貼落通告；毋須再開外部產生器。
- 製作者如不設定銀碼，可按「製作靜態 QR」製作供掃碼付款人自行填銀碼的 QR；有銀碼 = 固定銀碼 QR。
- QR 內容跟香港 Common QR Code 規格（FPS），商戶名按 FPS 規格用 `NA`，收款識別靠 `FPS_ACCOUNT_NUMBER`。
- Apps Script 可能把純數字 FPS ID 回傳為數字；前端已兼容數字／文字格式，`102866183` 可直接正常生成。
- 要令舊後台出現呢張新卡片：貼新 `gs/Code.gs` → 執行 `setupSheets()`（自動補建缺失卡片＋權限，唔會洗資料）。

---

## 📚 文件索引

| 文件 | 內容 |
|---|---|
| `docs/member-gs-handshake.md` | **member-portal ↔ GS 合約**（借物資打通；借場填表→Teamup→批核） |
| `docs/venue-booking-flow.md` | 借場流程（而家：填表+Teamup+批核；密碼稍後） |
| `docs/booking-setup-merge-checklist.md` | 貼 Code.gs → setup → 填 Key → 驗證 → 測試 嘅逐步操作 |
| `docs/keys-checklist.md` | **找回 + 驗證 Teamup / TTLock API Key**（你唔記得 Key 睇呢份） |
| `docs/setup-guide.md` | 全平台部署及使用指南（區職員端） |
| `docs/skw-booking-setup.md` | 選用：實體門鎖自動化獨立方案（可略過） |
| `docs/card-permission-plan.md` | 卡片＋角色權限矩陣 |
| `docs/venue-booking-flow.md` 同 `app/venue-regs/page.tsx` | 審批頁實作 |

## 🧩 主要檔案

| 檔案 | 用途 |
|---|---|
| `gs/Code.gs` | 統一後台（登入/角色/權限/借場一條龍/訓練班/借物資/知會） |
| `gs/Code.gs.course.js` | 每個訓練班嘅收表 Script 模板 |
| `app/api/proxy/route.ts` | 前端 → Apps Script 嘅代理（API Key 唔出前端） |
| `lib/district.ts` | 區目錄（區碼 → apiBase 對照） |
| `app/venue-regs/` | 場地借用審批頁 |
