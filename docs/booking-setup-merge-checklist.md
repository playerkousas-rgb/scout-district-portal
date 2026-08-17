# ✅ 更新操作清單 — 統一後台 v4.0（借場一條龍：TTLock + Teamup + 電郵）

> 呢份係你將後台升去 **v4.0 統一後台**（管理系統 + 成員系統共用一份 Code.gs）之後，
> 由「攞到新 `gs/Code.gs`」到「借場一條龍跑通」嘅逐步操作。每一步照住做就得，唔使記。

---

## 第 0 步：攞到新 Code.gs
1. GitHub `main`（或本 repo `gs/Code.gs`）攞最新 **v4.0 統一後台**版本。
2. 由 v3.0 升上嚟嘅區：唔使重新開 Sheet，直接更新 Script 就得（表頭按需補欄）。

---

## 第 1 步：更新 Apps Script（最重要）
1. 打開你個 Google Sheet → **擴充功能 → Apps Script**。
2. 將 `gs/Code.gs` 全部內容覆蓋貼上。
3. 儲存（Cmd/Ctrl + S）。
4. 喺函數選單揀 **`setupSheets`** → 執行。
   - ★ v4.0 嘅 setup 係**「補建唔清空」**：已存在嘅表只會補缺失欄位，
     例如 `VenueBookings` 補 `passcode` 欄、`Config` 補 `TEAMUP_*` 同 `ttlock*` 金鑰行；
     **唔會**剷走你現有資料（同 v3.0 唔同！）。
   - API Key 冇變（Config 嘅 API_KEY_HASH 照舊），唔使重新登記，除非你重新生成。

---

## 第 2 步：填 Config 借場金鑰
| 區塊 | 欄位 | 備註 |
|---|---|---|
| Teamup | `TEAMUP_API_KEY` | 兼容舊欄名 `teamupApiKey`（舊有值照讀） |
| Teamup | `TEAMUP_CALENDAR_KEY` | 兼容舊 `teamupCalendarId` |
| Teamup | `TEAMUP_APPROVED_SUBCAL_ID` | 「確認借用區總部」子日曆 ID；兼容舊 `teamupApprovedSubId` |
| Teamup | `TEAMUP_REJECTED_SUBCAL_ID` | 選填；兼容舊 `teamupRejectedSubId` |
| TTLock | `ttlockClientId` / `ttlockClientSecret` | 通通鎖開發者應用 |
| TTLock | `ttlockUsername` / `ttlockPassword` | App 登入帳密 |
| TTLock | `ttlockLockId` | 大門鎖 Lock ID |
| TTLock | `ttlockApiBase` | 預設 `https://api.ttlock.com` |
| TTLock | `ttlockDisabled` | 未就緒先填 `TRUE`（改用隨機密碼，其餘流程照跑） |
| 電郵 | `notifyFrom` | 寄件人名稱（預設用區名） |

> 由 v3.0 升上嚟嘅區：舊 `teamup*` 欄名照用，程式自動 fallback，唔使搬。

---

## 第 3 步：批核入口（改咗 action）
- 管理系統 `/venue-regs` 點「✅ 批准」→ 後台 **`approveVenueBooking`**（一條龍）。
- 點「✕ 拒絕」/「↩ 取消」→ `setVenueBookingStatus`（狀態 + 電郵 + 選填 Teamup 拒絕事件）。
- 批准後密碼會寫入 `VenueBookings.passcode`，審批頁可翻查。

---

## 第 4 步：驗證（照 docs/venue-booking-flow.md）
1. `Venues` 表加一個場地。
2. member-portal 填表 → 後台 `submitVenueRequest` → `VenueBookings` 出現 pending。
3. 審批頁批准 → Teamup 出現「確認借用」事件（或原有事件轉色）、申請人收到密碼電郵。
4. 唔通就查 `docs/keys-checklist.md` 逐條 Key 驗證。

---

## 常見問題
| 現象 | 原因 | 處理 |
|---|---|---|
| 批准後冇密碼顯示 | TTLock 建碼失敗（金鑰/Lock ID 錯、冇網關） | 檢查 `ttlock*`；先設 `ttlockDisabled=TRUE` 聯調 |
| Teamup 冇事件 | `TEAMUP_*` 金鑰錯 / 子日曆 ID 錯 | 用 `get-ids.js` 核對 |
| 申請人收唔到電郵 | 申請冇填電郵 / GAS 帳號 MailApp 問題 | 電郵選填，冇填就唔會寄 |
| setup 之後資料冇咗？ | 你行咗 v3.0 舊 code | v4.0 setup 唔清空；確認 Apps Script 已覆蓋為 v4.0 |
