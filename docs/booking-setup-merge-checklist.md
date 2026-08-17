# ✅ Merge 後操作清單 — 區總部借場一條龍

> 呢份係**你 merge PR 入 main 之後**，由「攞到新 `gs/Code.gs`」到「借場一條龍跑通」嘅逐步操作。
> 每一步照住做就得，唔使記。

---

## 第 0 步：Merge PR
1. 去 PR（`arena/01a00f3c-scout-district-portal` → `main`）撳 **Merge pull request**。
2. Merge 完 → 你 GitHub 上 `main` 就有最新 `gs/Code.gs` 同 `docs/`。

---

## 第 1 步：更新 Apps Script（最重要）
1. 打開你個 Google Sheet → **擴充功能 → Apps Script**。
2. 將 `gs/Code.gs` 全部內容覆蓋貼上（GitHub 上 `main` 嗰份）。
3. 儲存（Cmd/Ctrl + S）。
4. 喺函數選單揀 **`setupSheets`** → 執行。
   - 第一次會要求授權（Review permissions → Advanced → Allow → 揀你自己帳號）。
   - 完成後會自動：
     - 喺 **Config** 頁加齊借場金鑰行（見下表）
     - 喺 `VenueBookings` 加 `passcode` 欄
     - （若舊 Config 冇呢啲行，會補上；唔會剷走你現有資料）

> 💡 已經跑過 setup 嘅區，再跑一次係安全嘅（只補缺嘅行，唔清空）。

---

## 第 2 步：填 Config 頁嘅 Key

打開 **Config** 工作表，逐行填 Value 欄。張表照住填：

| Config Key | 填乜 | 由邊度攞 |
|---|---|---|
| `teamupApiKey` | Teamup API Token | `services/skw-booking/get-ids.js` 預設值（`4032acf1...`）或 Vercel env `TEAMUP_API_KEY` |
| `teamupCalendarId` | 日曆金鑰 `ks...` | Vercel env `TEAMUP_CALENDAR_ID` |
| `teamupApprovedSubId` | 「確認借用區總部」子日曆 ID | Vercel env `TEAMUP_APPROVED_SUB_ID`，或用 `get-ids.js` 列出核對 |
| `teamupRejectedSubId` | （可選）拒絕子日曆 ID | Vercel env `TEAMUP_REJECTED_SUB_ID` |
| `ttlockClientId` | 開發者 App ID | Vercel env `TTLOCK_CLIENT_ID` |
| `ttlockClientSecret` | 開發者 App Secret | Vercel env `TTLOCK_CLIENT_SECRET` |
| `ttlockUsername` | TTLock 登入帳號 | Vercel env `TTLOCK_USERNAME` |
| `ttlockPassword` | TTLock 登入密碼 | Vercel env `TTLOCK_PASSWORD` |
| `ttlockLockId` | 大門鎖 Lock ID | Vercel env `TTLOCK_LOCK_ID` 或 `get-lock-id.js` |
| `ttlockApiBase` | 區域 server | 唔填就用預設 `https://api.ttlock.com`；歐洲/中國先改 |
| `ttlockDisabled` | 想先跳過 TTLock 就填 `TRUE` | 測試用 |
| `notifyFrom` | （可選）電郵寄件人名稱 | 自己填 |

> 📍 **Vercel 攞 Key**：Vercel → `skw-booking` 專案 → Settings → Environment Variables → 抄 `Value`。
> 唔好喺 chat 貼出嚟，自己填落 Config 就得。

---

## 第 3 步：加場地（可選，申請表需要）
1. 打開 **`Venues`** 表。
2. 加一行，例如：`HQ | 區總部 | 筲箕灣區總部 | 100 | | TRUE`
   - 欄位順序：`venueId, name, location, capacity, note, active`

---

## 第 4 步：部署 Web App（若未部署過）
1. Apps Script 右上角 → **部署 → 新部署 → 網頁應用程式**。
2. 執行身分：**我自己**；誰可以存取：**任何人**。
3. 複製 `/exec` 網址（如果唔係第一次，揀「管理部署」攞返舊網址）。

> 呢個 /exec 係前端 `/api/proxy` 指向嗰個。若你已經有，可唔使再部署。

---

## 第 5 步：驗證 Key 啱唔啱（推薦先做）
去 `services/skw-booking/` 跑：
```bash
node get-ids.js       # Teamup：輸入 API Key + Calendar ID → 列子日曆核對
node get-lock-id.js   # TTLock：輸入 Client ID/Secret/帳密 → 列出鎖 + Lock ID + 網關
```
- TTLock 個鎖必須「已連接網關 = 是」，先可以遠端建密碼。
- 對返 Config 填嘅 ID 係咪呢啲。

---

## 第 6 步：端到端測試（一條龍）
1. 用 member 系統（或暫時直接叫 `submitVenueRequest`）提交一張申請 → 狀態 `pending`。
2. 登入管理系統 → **場地借用審批 `/venue-regs`** → 見到申請 → 撳 **✅ 批准**。
3. 檢查：
   - Teamup 出現「確認借用區總部」事件（顯示確認色）
   - 申請人收到密碼電郵
   - 審批頁該行顯示「🔑 密碼 xxxxxx」

> ⚠️ 如果 TTLock 未掂（例如網關未接），批准時密碼唔會入鎖 → 可先設 `ttlockDisabled=TRUE`
> 再批一次，先確認 Teamup + 電郵嗰段 Work，之後先補真鎖。

---

## 快速排錯
| 現象 | 原因 |
|---|---|
| 審批頁顯示錯誤「Teamup 尚未設定」 | Config 未填 `teamupApiKey / teamupCalendarId / teamupApprovedSubId` |
| 錯誤「TTLock 建碼多次失敗」 | TTLock Key 錯／網關離線／`ttlockLockId` 錯；或設 `ttlockDisabled=TRUE` 先跳過 |
| 冇收到電郵 | 申請人電郵必填；或用緊嘅 GAS 帳號有冇權限寄 MailApp |
| Teamup 冇事件 | Calendar ID / 子日曆 ID 錯；用 `get-ids.js` 核對 |

---

## 呢份文件對應嘅其他文件
- `docs/keys-checklist.md` — 逐條 Key「邊度搵 + 點驗證」
- `docs/venue-booking-flow.md` — 一條龍流程架構
