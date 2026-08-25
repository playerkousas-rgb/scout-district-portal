# Config 簡潔填寫版

主後台 Google Sheet 的 `Config` 分頁係「一列一個 key」；只需要填以下項目。**不要刪除或改 key 名稱**，只填右邊 `value` 欄。

## 必填（先令兩個網站接通）

| key | value 填什麼 |
|---|---|
| `districtName` | 區名，例如 `筲箕灣區` |
| `districtCode` | 區碼，例如 `SKW` |
| `API_KEY_HASH` | 不用手填；執行 `setupSheets()` 後由系統產生 API Key，然後放到兩個 Vercel 環境變數 |

## 如果開放借場

| key | value 填什麼 |
|---|---|
| `TEAMUP_API_KEY` | Teamup API Token |
| `TEAMUP_CALENDAR_KEY` | Teamup Calendar 分享金鑰（`ks...`） |
| `TEAMUP_PENDING_SUBCAL_ID` | Teamup「申請中」子日曆 ID |
| `TEAMUP_APPROVED_SUBCAL_ID` | Teamup「已批准」子日曆 ID |

如未接電子鎖，`ttlockDisabled` 填 `TRUE`；系統會用模擬密碼，借場其他流程仍可測試。接電子鎖時才需要填 `SCIENER_CLIENT_ID`、`SCIENER_CLIENT_SECRET`、`SCIENER_USERNAME`、`SCIENER_PASSWORD`、`SCIENER_LOCK_ID`。

## 電郵：只需理解這三個名稱

| key | 是否需要填 | 用途 |
|---|---:|---|
| `NOTIFY_STAFF_EMAIL` | 建議填 | 收到新借場／物資／訓練班／活動知會通知的職員 Gmail。多人可用逗號分隔。 |
| `notifyFrom` | 選填 | 電郵顯示的寄件人名稱，例如 `筲箕灣區管理系統`；**不是 Gmail 地址**。留空會自動用區名。 |
| `approverEmail` | 不用填 | 舊版本留下的名稱，現行 `Code.gs` 沒有使用；新版 setup 已不再新增。 |

### Gmail 帳戶怎樣用？

三個 key **不需要全部填同一個 Gmail**：

- Apps Script 寄信會使用「部署 Web App 的執行身分」之 Google 帳戶的 Gmail 配額／寄件權限。
- `NOTIFY_STAFF_EMAIL` 只是收件人，可以是任何可收信地址。
- `notifyFrom` 只是名稱，不是帳戶；它不會改變實際寄件 Gmail。
- `approverEmail` 不使用，所以留空。

## 兩個 Vercel 環境變數

同一個 API Key 放在：

- 管理系統：`PORTAL_SKW_APIKEY`
- 成員系統：`MEMBER_SKW_APIKEY`

兩者的值必須完全相同。Google Sheet 的 `Config` 不需要填 Gmail 密碼或 SMTP 密碼。
