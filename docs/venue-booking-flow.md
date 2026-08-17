# 🏛 區總部借場 — 一條龍流程

**申請人喺成員系統 (member-portal) 填表（唔使跳去 Teamup）→ 管理系統審批 → 批准時自動完成：**
**① 通通鎖(TTLock) 設定限時密碼 → ② Teamup 建立「確認借用」事件（轉顏色）→ ③ 電郵密碼俾申請人。**

全部由同一個 Apps Script 後台 (`gs/Code.gs`) 完成，唔需要另起 Vercel service。

## 流程
```
申請人（member-portal）填借用申請表
      │  後台公開 action：submitVenueRequest → 寫入 VenueBookings（status=pending）
      ▼
區職員登入管理系統 → 場地借用審批 (/venue-regs)
      │  點「✅ 批准」
      ▼
後台 setVenueBookingStatus_（status=approved）自動：
   1. TTLock 建立限時密碼（提前/延後 15 分鐘；撞碼自動 +1 重試）
   2. Teamup 建立「確認借用區總部」子日曆事件（標題標「已批准」→ 顯示為確認色）
   3. 電郵「已批准 + 入場密碼」俾申請人（MailApp）
      （拒絕 / 取消 → 建「拒絕」Teamup 事件 + 電郵通知）
```

## Config 金鑰設定（Config 工作表）
| key | 說明 |
|---|---|
| `teamupApiKey` | Teamup API Key |
| `teamupCalendarId` | Teamup 分享金鑰（形如 `ks...`，唔係 c/ 開頭） |
| `teamupApprovedSubId` | 「確認借用區總部」子日曆 ID（批准後建事件／轉色） |
| `teamupRejectedSubId` | （選填）拒絕子日曆 ID |
| `ttlockClientId` / `ttlockClientSecret` | TTLock 開發者應用 |
| `ttlockUsername` / `ttlockPassword` | TTLock App 登入帳密 |
| `ttlockLockId` | 大門鎖 Lock ID |
| `ttlockApiBase` | TTLock 區域 server（`https://api.ttlock.com` / eu / cn） |
| `ttlockDisabled` | `TRUE` = 跳過 TTLock，改用隨機密碼（先用嚟聯調其餘流程） |
| `notifyFrom` | 電郵寄件人名稱 |

> 攞子日曆 ID：可喺 `services/skw-booking/get-ids.js` 輸入 API Key + Calendar ID 查（係選用工具）。

## 成員系統 (member-portal) 要接嘅 action
申請表呼叫後台公開 `submitVenueRequest`（經 `/api/proxy` 帶 API Key），欄位：`venueId, name, phone, email, troop, purpose, startDate, endDate`。電郵必填（批准後要寄密碼）。

## 呢個 repo 檔案
| 檔案 | 作用 |
|---|---|
| `gs/Code.gs` → `setVenueBookingStatus_` | 批核入口：TTLock + Teamup + 電郵 |
| `gs/Code.gs` → `createTtlockPasscode_` | TTLock 限時密碼 |
| `gs/Code.gs` → `teamupOnApprove_` / `teamupOnReject_` | Teamup 建「確認/拒絕」事件 |
| `gs/Code.gs` → `sendVenueApprovalEmail_` | 電郵密碼俾申請人 |
| `app/venue-regs/page.tsx` | 審批頁 |

## 設定步驟
1. 後台 Apps Script 貼上新 `gs/Code.gs`，重新執行 `setupSheets()`（會加 Config 金鑰行 + `passcode` 欄）。
2. 填 Config 嘅 Teamup / TTLock 金鑰。
3. 喺 `Venues` 表加可借用場地。
4. 部署為 Web App（執行身分：我自己；存取：所有人）— 電郵用呢個 GAS 帳號寄出。
5. member-portal 申請表接到 `submitVenueRequest`。

## 備註
- 申請人電郵必填，否則批核時無法寄密碼（後台會阻止）。
- TTLock 未就緒時可先設 `ttlockDisabled=TRUE`，其餘流程照跑。
