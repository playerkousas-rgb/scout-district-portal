# 🏛 區總部借場 — 一條龍流程（統一後台 v4.0）

**申請人喺成員系統 (member-portal) 填表（唔使跳去 Teamup）→ 管理系統審批 → 批准時自動完成：**
**① 通通鎖(TTLock) 設定限時密碼 → ② Teamup 轉色（建「確認借用」事件）→ ③ 電郵密碼俾申請人。**

全部由同一個 Apps Script 後台（`gs/Code.gs` v4.0 統一後台：管理系統 + 成員系統共用）完成，
唔需要另起 Vercel service。

## 流程
```
申請人（member-portal）填借用申請表
      │  公開 action：submitVenueRequest → 寫入 VenueBookings（status=pending）
      ▼
區職員登入管理系統 → 場地借用審批 (/venue-regs)
      │  點「✅ 批准」→ 前端 call approveVenueBooking
      ▼
後台 approveVenueBooking_（status=approved）自動：
   1. TTLock 建立限時密碼（提前/延後 15 分鐘；撞碼自動 +1 重試；
      TTLock 未設定 / ttlockDisabled=TRUE → 改用隨機 6 位密碼，其餘流程照跑）
   2. Teamup 轉色：
      - 申請有 pending 事件（teamupEventId）→ 搬去「確認借用」子日曆（藍→紅）
      - 冇 → 喺「確認借用」子日曆新建事件（標題標「已批准」+ 密碼）
   3. 電郵「已批准 + 入場密碼」俾申請人（MailApp，HTML）
      密碼同時寫入 VenueBookings.passcode，審批頁可翻查

拒絕 / 取消（setVenueBookingStatus_ status=rejected/cancelled）：
   → 喺「拒絕」子日曆建事件（選填子日曆）+ 電郵通知申請人
```

## Config 金鑰設定（Config 工作表）
| key | 說明 |
|---|---|
| `TEAMUP_API_KEY` | Teamup API Token（兼容舊欄名 `teamupApiKey`） |
| `TEAMUP_CALENDAR_KEY` | Teamup 分享金鑰（形如 `ks...`，唔係 c/ 開頭）（兼容舊 `teamupCalendarId`） |
| `TEAMUP_APPROVED_SUBCAL_ID` | 「確認借用區總部」子日曆 ID（批准後建事件／轉色）（兼容舊 `teamupApprovedSubId`） |
| `TEAMUP_REJECTED_SUBCAL_ID` | （選填）拒絕子日曆 ID（兼容舊 `teamupRejectedSubId`） |
| `TEAMUP_PENDING_SUBCAL_ID` | （選填）藍色（申請中）子日曆 |
| `ttlockClientId` / `ttlockClientSecret` | 通通鎖 TTLock 開發者應用 |
| `ttlockUsername` / `ttlockPassword` | TTLock App 登入帳密 |
| `ttlockLockId` | 大門鎖 Lock ID |
| `ttlockApiBase` | TTLock 區域 server（`https://api.ttlock.com` / eu / cn） |
| `ttlockDisabled` | `TRUE` = 跳過 TTLock，改用隨機密碼（先用嚟聯調其餘流程） |
| `notifyFrom` | 電郵寄件人名稱（預設用區名） |

> 攞子日曆 ID：可喺 `services/skw-booking/get-ids.js` 輸入 API Key + Calendar ID 查（係選用工具）。
> 舊 Config 用緊 `teamupApiKey` 等舊欄名都可以繼續用，程式會自動 fallback。

## 成員系統 (member-portal) 要接嘅 action
申請表呼叫後台公開 `submitVenueRequest`（經 `/api/proxy` 帶 API Key），欄位：
`venueId, name, phone, email, troop, position, purpose, startDate, endDate, agreeRules, teamupEventId`。
電郵選填，但**有填先會收到批准/拒絕通知同入場密碼**。

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
1. 後台 Apps Script 貼上新 `gs/Code.gs`（v4.0 統一後台），執行 `setupSheets()`。
   - ★ setup 係「補建唔清空」：已有資料嘅 Sheet 只會補缺失欄位（含 `VenueBookings.passcode`），唔會洗資料。
2. 填 Config 嘅 TEAMUP_* / ttlock* 金鑰。
3. 喺 `Venues` 表加可借用場地。
4. 部署為 Web App（執行身分：我自己；存取：所有人）— 電郵用呢個 GAS 帳號寄出。
5. member-portal 申請表接到 `submitVenueRequest`。

## 備註
- 申請人電郵建議必填，否則批核時無法寄密碼（後台會跳過通知，照樣批核）。
- TTLock 未就緒時可先設 `ttlockDisabled=TRUE`，其餘流程照跑。
- 拒絕／取消電郵同 Teamup 事件只係輔助，失敗唔會影響狀態更新。
