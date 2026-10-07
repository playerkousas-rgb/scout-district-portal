# 🏛 區總部借場 — 一條龍流程（統一後台 v4.0）

**申請人喺成員系統 (member-portal) 填表（唔使跳去 Teamup）→ GS 寫入 VenueBookings 並喺 Teamup「申請中」建事件 → 管理系統審批轉色。**

## Phase 1（現行）

在 `/venue-regs` 請按 **「✅ 確認（唔設鎖）」**：只改狀態和把 Teamup 轉去「確認借用」，**不寫電子鎖、不寄密碼電郵**。即使是 DDC 或以上亦可使用這個安全按鈕。

**電子鎖未完成真機驗收前，不要按「⚡ 一鍵批准（Phase 2）」。** 現行後台在建碼失敗、模擬模式或沒有申請人電郵時會安全地保持 `pending`；日常 Phase 1 仍應使用「✅ 確認（唔設鎖）」。

完整 Phase 1 開通資料行、Config 選填項及 Phase 2 驗收次序見 [`phase-1-launch.md`](phase-1-launch.md)。

全部由同一個 Apps Script 後台（`gs/Code.gs` 統一後台：管理系統 + 成員系統共用）完成，唔需要另起 Vercel service。

## 流程

```text
申請人（member-portal）填借用申請表
      │  公開 action：submitVenueRequest
      │  → 寫入 VenueBookings（status=pending）
      │  → Teamup「申請中」子日曆建【申請】事件（寫入 teamupEventId）
      ▼
區職員登入管理系統 → 場地借用審批 (/venue-regs)
      │  點「✅ 確認（唔設鎖）」→ 前端 call confirmVenueBooking
      ▼
後台 confirmVenueBooking_（status=approved）：
   Teamup 轉色：有 teamupEventId → 搬去「確認借用」子日曆；冇就新建

Phase 2：approveVenueBooking_ = 成功寫 TTLock 限時密碼 + Teamup 轉色 + 電郵密碼

拒絕 / 取消（setVenueBookingStatus_ status=rejected/cancelled）：
   → 喺「拒絕」子日曆建事件（選填子日曆）+ 電郵通知申請人
```

## Config 金鑰設定（Config 工作表）

| key | 說明 |
|---|---|
| `TEAMUP_API_KEY` | Teamup API Token（兼容舊欄名 `teamupApiKey`） |
| `TEAMUP_CALENDAR_KEY` | Teamup 分享金鑰（形如 `ks...`，不是 `c/` 開頭）（兼容舊 `teamupCalendarId`） |
| `TEAMUP_APPROVED_SUBCAL_ID` | 「確認借用區總部」子日曆 ID（批准後建事件／轉色）（兼容舊 `teamupApprovedSubId`） |
| `TEAMUP_REJECTED_SUBCAL_ID` | （選填）拒絕子日曆 ID（兼容舊 `teamupRejectedSubId`） |
| `TEAMUP_PENDING_SUBCAL_ID` | （選填）藍色（申請中）子日曆 |
| `SCIENER_CLIENT_ID` / `SCIENER_CLIENT_SECRET` | TTLock / Sciener 開放平台 App ID / Secret（主用名稱） |
| `SCIENER_USERNAME` / `SCIENER_PASSWORD` | 有權管理大門鎖的 TTLock 帳戶 |
| `SCIENER_LOCK_ID` | 筲箕灣區總部唯一大門鎖的數字 Lock ID（填 Config，不填場地行） |
| `SCIENER_API_BASE` | `https://api.sciener.com`（不要填 `open.sciener.com` 網站） |
| `SCIENER_SLOT_NAMES` | 可重用的 TTLock 預置「限時N」格名稱；只會修改清單中已過期的格 |
| `PWD_MODE` | `random`，每宗產生獨立 6 位數密碼 |
| `ttlockDisabled` | 日常一鍵批准必須留空；`TRUE` 是模擬模式，一鍵批准會安全地拒絕執行 |
| `notifyFrom` | 電郵寄件人名稱（預設用區名） |

> 攞子日曆 ID：可喺 `services/skw-booking/get-ids.js` 輸入 API Key + Calendar ID 查（選用工具）。舊 Config 用緊 `teamupApiKey` 等舊欄名都可以繼續用，程式會自動 fallback。

## 成員系統 (member-portal) 要接嘅 action

申請表呼叫後台公開 `submitVenueRequest`（經 `/api/proxy` 帶 API Key），欄位：
`venueId, name, phone, email, troop, position, purpose, startDate, endDate, agreeRules, teamupEventId`。

要用「⚡ 一鍵批准（Phase 2）」時，申請人電郵實際上是必填；沒有電郵時後台會保持 `pending`，避免寫鎖後無法交付密碼。

## 呢個 repo 檔案

| 檔案 | 作用 |
|---|---|
| `gs/Code.gs` → `approveVenueBooking_` | 批核入口（一條龍）：TTLock + Teamup + 電郵 |
| `gs/Code.gs` → `setVenueBookingStatus_` | 簡單改狀態（拒絕/取消 + 通知） |
| `gs/Code.gs` → `createTtlockPasscode_` | TTLock 限時密碼 |
| `gs/Code.gs` → `teamupMoveToApproved_` / `createTeamupEvent_` / `teamupOnReject_` | Teamup 轉色/建事件 |
| `gs/Code.gs` → `sendVenueApprovalEmail_` / `sendVenueRejectionEmail_` | 電郵申請人 |
| `app/venue-regs/page.tsx` | 審批頁（批准 → `approveVenueBooking`，顯示密碼） |

## 設定步驟

1. 後台 Apps Script 貼上新 `gs/Code.gs`，執行 `setupSheets()`。
   - setup 只補缺失欄位（含 `VenueBookings.passcode`），不會清除已有資料。
2. 填 Config 的 `TEAMUP_*` 及 Phase 2 所需 `SCIENER_*` 金鑰。
3. 在 `Venues` 表加可借用場地。
4. 部署為 Web App（執行身分：我自己；存取：所有人）；電郵由此 GAS 帳戶寄出。
5. member-portal 申請表接到 `submitVenueRequest`。

## 備註

- TTLock 未就緒時，繼續使用「✅ 確認（唔設鎖）」；不要使用一鍵批准。
- 鎖 API、Gateway 或電郵資料不完整時，一鍵批准會保持申請 `pending`，不會寄出不可用密碼。
- 拒絕／取消電郵同 Teamup 事件只係輔助，失敗不會影響狀態更新。
