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
| TTLock / Sciener | `SCIENER_SLOT_NAMES` | 可重用的既有「限時N」格名稱；系統只改已過期白名單格 |
| TTLock / Sciener | `ttlockDisabled` | 日常一鍵批准留空；`TRUE` 是模擬模式，一鍵批准會保持 pending |
| 電郵 | `NOTIFY_STAFF_EMAIL` | 新申請通知收件人（可多個，以逗號分隔） |
| 電郵 | `notifyFrom` | 選填：寄件人顯示名稱，不是 Gmail 地址 |
| 電郵 | `approverEmail` | 不用填；現行 Code.gs 沒有使用 |

> 由 v3.0 升上嚟嘅區：舊 `teamup*` 欄名照用，程式自動 fallback，唔使搬。

---

## 第 3 步：批核入口
- 管理系統 `/venue-regs` 點「✅ 批准」→ 後台 **`confirmVenueBooking`**（狀態 + Teamup 轉色，唔掂鎖）。
- 點「✕ 拒絕」/「↩ 取消」→ `setVenueBookingStatus`（狀態 + 電郵 + Teamup 拒絕事件）。
- `approveVenueBooking`（TTLock 密碼 + 電郵）留低，稍後先接。
- 借物資 `/stock-regs` → `setStockRequestStatus`（批准先扣庫存）。

---

## 第 4 步：驗證（照 docs/venue-booking-flow.md）
1. `Venues` 表加一個場地。
2. member-portal 填表 → 後台 `submitVenueRequest` → `VenueBookings` 出現 pending。
3. Phase 1 按「✅ 確認（唔設鎖）」→ Teamup 出現「確認借用」事件（或原有事件轉色），不寄密碼；完成真機驗收後才用一鍵批准測試 TTLock 密碼和電郵。
4. 唔通就查 `docs/keys-checklist.md` 逐條 Key 驗證。

---

## 常見問題
| 現象 | 原因 | 處理 |
|---|---|---|
| 一鍵批准保持 pending | TTLock 建碼失敗（金鑰／Lock ID 錯、冇 Gateway、模擬模式） | 檢查 `SCIENER_*`、Lock ID、Gateway 及 `ttlockDisabled` 必須留空；不要寄出模擬密碼 |
| Teamup 冇事件 | `TEAMUP_*` 金鑰錯 / 子日曆 ID 錯 | 用 `get-ids.js` 核對 |
| 一鍵批准提示未有電郵 | 申請沒有電郵 | 先在審批頁補回有效電郵；為免寫鎖後無法交付密碼，申請會保持 pending |
| setup 之後資料冇咗？ | 你行咗 v3.0 舊 code | v4.0 setup 唔清空；確認 Apps Script 已覆蓋為 v4.0 |
