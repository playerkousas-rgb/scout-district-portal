# 🏕️ 實體門鎖自動化（skw-booking-system）— 選用參考

> **非必要。** 主流程（申請人於 member-portal 填表 → 管理系統審批 → 自動生成密碼並電郵）已由
> portal 內建 `venue-regs`（Google Sheet 後台，統一後台 v4.0 嘅 `approveVenueBooking`）完成，
> 見 `docs/venue-booking-flow.md`。v4.0 統一後台內建 **TTLock 限時密碼 + Teamup 轉色 + 電郵** 一條龍，
> 唔使另起 Vercel service。
>
> 呢份係舊有獨立服務嘅選用參考。`services/skw-booking/` 係原先獨立 repo，保留在此作為可選方案，
> `lib/ttlock.js` 已修好你之前卡住的「TTLock 設定密碼」步驟。

---

## 一、系統運作架構

```
[租場人填表 → Teamup 待審批(藍色)]
        │  (外部 GAS 每 5 分鐘觸發)
        ▼
/api/cron ──► 撈未寄信申請 → 寄 [待審批信] 給職員 (APPROVER_EMAIL)
        │
[職員收信]
   ├─ ✏️ 修改申請 → Teamup 改完 → 回信點批准
   ├─ ❌ 拒絕 → /api/reject → Teamup 標記 / 寄通知 / 寫 Sheet
   └─ ✅ 批准 → /api/approve
            ├─ TTLock 產生限時大門密碼（修好的步驟）
            ├─ Teamup 藍轉紅（確認借用）
            ├─ 寄密碼信給申請人（可 CC NOTIFICATION_EMAIL）
            └─ 寫入 Google Sheet 統計
```

---

## 二、TTLock 設定密碼（已修好 — 你卡住的步驟）

之前卡住的原因與修正，`services/skw-booking/lib/ttlock.js` 已處理：

| # | 舊問題 | 修正 |
|---|---|---|
| 1 | 密碼只有 **4 位**（電話頭 4 碼）→ TTLock 時段密碼需 6–8 位 | 預設生成 **6 位**（`TTLOCK_PASSCODE_LENGTH`） |
| 2 | API 寫死 `https://api.ttlock.com` | 用 `TTLOCK_API_BASE` 選區域：`global` / `eu` / `cn` 或自訂網址 |
| 3 | 電話頭碼撞碼 → TTLock 拒重複密碼 | 自動 `+1` 遞增重試（`TTLOCK_RETRY`） |
| 4 | TTLock 一失敗整條審批中斷 | `TTLOCK_DISABLED=1` 可先跳過 TTLock，其餘流程照跑 |

### 2.1 建立 TTLock 開發者應用
1. 登入 [TTLock 開放平台](https://open.ttlock.com)。
2. 應用管理 → 建立應用 → 應用類型選**網頁應用 (Web App)**。
3. 記下 **Client ID** 與 **Client Secret**。

### 2.2 準備鎖資料
1. `TTLOCK_USERNAME` / `TTLOCK_PASSWORD`：用你 **lock2 / TTLock App 的登入帳密**（程式會把密碼 MD5 後送）。
2. `TTLOCK_LOCK_ID`：大門鎖的 Lock ID。
3. **確認網關 (Gateway) 在線**：`addType=2` 是經網關遠端寫碼，網關離線即失敗。先在 TTLock App 確認網關與鎖都上線。
4. 跑 `node get-ids.js` 或 `node get-lock-id.js` 取得 Lock ID。

### 2.3 區域伺服器（容易忽略）
TTLock 分區，`TTLOCK_API_BASE` 要對應你帳號/鎖註冊的 server：
- `global` → `https://api.ttlock.com`
- `eu` → `https://euapi.ttlock.com`
- `cn` → `https://cnopen.ttlock.com`
- 或直接填完整網址（自訂）。

### 2.4 密碼長度
- 時段密碼（有起止）預設 **6 位**。如需 8 位，設 `TTLOCK_PASSCODE_LENGTH=8`（勿低於 6）。

---

## 三、三個外部服務準備

### Teamup 日曆
1. 後台 → Settings → Sharing → 新增 Link，把要控制的子日曆設為 **Modify**。
2. 取得分享金鑰（形如 `ks123456789abcdef`）→ 即 `TEAMUP_CALENDAR_ID`。
3. 用 `node get-ids.js` 查「待審批/確認借用/拒絕」子日曆 ID。

### Gmail 應用程式密碼
1. Google 帳戶 → 安全 → 開啟兩步驟驗證。
2. 搜尋「應用程式密碼」→ 命名 `SKW Booking` → 複製 16 位密碼。

### Google Sheet 統計
見 `README-original.md` 步驟一（建立試算表 + 部署 Apps Script Web App），取得 `GAS_WEBAPP_URL`。

---

## 四、部署至 Vercel + 環境變數

把 `services/skw-booking/` 部署為獨立 Vercel 專案，設以下環境變數：

| 變數 | 範例 | 說明 |
|---|---|---|
| `SECRET_TOKEN` | `skw_secure_token_1234` | 審批連結密鑰（改掉！） |
| `TEAMUP_API_KEY` | `40...` | Teamup API Key |
| `TEAMUP_CALENDAR_ID` | `ks...` | Teamup 分享金鑰 |
| `TEAMUP_PENDING_SUB_ID` | `12138999` | 待審批子日曆 ID |
| `TEAMUP_APPROVED_SUB_ID` | `12139000` | 確認借用子日曆 ID |
| `TEAMUP_REJECTED_SUB_ID` | `12139001` | (選填) 拒絕子日曆 |
| `TTLOCK_CLIENT_ID` | | TTLock 應用 Client ID |
| `TTLOCK_CLIENT_SECRET` | | TTLock 應用 Client Secret |
| `TTLOCK_USERNAME` | | TTLock App 登入帳號 |
| `TTLOCK_PASSWORD` | | TTLock App 登入密碼 |
| `TTLOCK_LOCK_ID` | `88884321` | 大門鎖 Lock ID |
| `TTLOCK_API_BASE` | `global` | 區域 server（`global`/`eu`/`cn`/網址） |
| `TTLOCK_PASSCODE_LENGTH` | `6` | 時段密碼位數（6–8） |
| `TTLOCK_RETRY` | `8` | 撞碼重試次數 |
| `TTLOCK_DISABLED` | (留空) | `1` = 跳過 TTLock 先跑其餘流程 |
| `GMAIL_USER` | `INFO@SKWSCOUT.ORG.HK` | 寄信帳號 |
| `GMAIL_APP_PASSWORD` | `16位` | Google 應用程式密碼 |
| `APPROVER_EMAIL` | `INFO@...` | 收待審批信職員 |
| `NOTIFICATION_EMAIL` | (選填) | 知會 CC 信箱 |
| `GAS_WEBAPP_URL` | `https://script.google.com/...` | 統計寫入端點 |
| `BASE_URL` | `https://your-booking.vercel.app` | 部署網址（審批連結用） |

> **先聯調其餘流程的秘訣**：先把 `TTLOCK_DISABLED=1` 設好 → 批准時 Teamup/Email/Sheet 都會正常跑，密碼用模擬 6 位；TTLock 準備好後把 `TTLOCK_DISABLED` 移除即可，不用改任何代碼。

---

## 五、定時檢查（cron）
在 Google Apps Script 加時間觸發器，每 5 分鐘呼叫：
`https://your-booking.vercel.app/api/cron?token=skw_secure_token_1234`
（`triggerBookingCron` 範例在 `README-original.md` 步驟一。）

---

## 六、與區管理系統嘅關係

- **主流程唔需要呢個系統**：區管理系統 (`venue-regs`) 已能做到「申請→審批→自動密碼→電郵」。
- `services/skw-booking/` 係**選用**，只當你需要「把密碼寫入實體 TTLock 門鎖」時，再獨立部署到 Vercel，
  並用 Teamup 收申請。佢唔係 portal 卡片，兩者二擇一。

### 檔案對照
| 檔案 | 用途 |
|---|---|
| `services/skw-booking/` | 實體門鎖自動化（可選） |
| `services/skw-booking/lib/ttlock.js` | 修好的 TTLock 建碼（本指南第二步） |
| `docs/skw-booking-setup.md` | 本指南 |
| `docs/venue-booking-flow.md` | **主流程**：申請→審批→自動密碼→電郵 |
