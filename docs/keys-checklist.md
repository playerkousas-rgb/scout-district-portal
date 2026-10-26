# 🔑 借場一條龍 — API Key 找回 + 驗證 Checklist（統一後台 v4.0）

> **版本提示（2026-10）**：現時正式共用後台係已恢復登入的 **4.18.0**。本頁 Script Properties／貼上新版 GS 等步驟**只適用於日後另行決定升級本倉 v4.28.1**，唔係維持 4.18.0 或開啟房間卡的必要條件。今次房間查閱只改 Vercel，已按現有 Config 的紅色子日曆 ID 設定預設值，**毋須新增環境變數／Teamup API Token**；`TEAMUP_APPROVED_SUB_ID` 僅於 ID 日後變更時選用，詳見[房間使用情況](venue-booking-flow.md)。**唔好照本頁先升級 GS 而斷登入。**
>
> 你唔記得啲 Key 邊度嚟，好正常 — 安全嘅 Key 應該存喺 **Vercel**（booking 專案）嘅環境變數或區後台受保護 Config；
> 唔好寫入 Git。以下教你核對設定；舊版 Teamup Token 曾被寫入 repo，請先輪換。
>
> v4.0 統一後台 Config 主用 **`TEAMUP_*`** 欄名；舊欄名（`teamupApiKey` 等）仍然讀到（自動 fallback），
> 舊 Config 冇搬都照行。

## 邊度搵 Key（3 個來源）
1. **Vercel**：`skw-booking` 專案 → **Settings → Environment Variables**（大部分 Key 喺度）
2. **區後台 Config**：確認 `TEAMUP_API_KEY`／`TEAMUP_CALENDAR_KEY`／`TEAMUP_APPROVED_SUBCAL_ID` 設定（唔好貼 Key 入 Git／訊息）
3. **重新跑工具**：用 `get-ids.js` / `get-lock-id.js` 重新登入撈返（如果上面搵唔到）

---

## 登入及 YMIS 保障（僅日後決定部署本倉 v4.28.1 才適用）

- **目前正式 4.18.0 毋須設定** `PORTAL_TOKEN_SECRET`；本倉 v4.26.1 安全修補與 v4.27.0 Vercel-only sheep 密碼流程已合併 MAIN；v4.28.0 旅團名錄後端已由 PR #49 合併；v4.28.1 DC 卡片說明修正待合併；正式 GS 尚未部署，更新後均須由區方自行部署；不要未備份、未核對 API Key 與 Script Properties 就直接覆蓋正式 GS。v4.28.1 的 `setupSheets()` 在缺少有效（至少 32 字元）值時會自動建立每專案獨立密鑰；管理員亦可先私下設定。首次建立／更換會令舊登入／重設連結失效。**房間卡更新本身不要求更新 GS。**
- **Vercel（維護密碼）** `PORTAL_{區碼}_MASTER_PASSWORD`（筲箕灣例：`PORTAL_SKW_MASTER_PASSWORD`）。密碼長度由區方自行選擇；空值／未設定會停用維護登入，短密碼較易被猜中，登入流程亦沒有跨 Vercel instance 的分散式限速，建議使用長 passphrase。Apps Script 不儲存或讀取這個密碼；更新 Vercel env 後需重新部署。已簽發的 sheep session 最多仍有效 12 小時；改密碼只影響之後登入，不會立即撤銷現有 session。
- **Vercel（機器橋接）** `PORTAL_{區碼}_MASTER_BRIDGE_SECRET`（例：`PORTAL_SKW_MASTER_BRIDGE_SECRET`），值由 Apps Script 試算表選單「🔐 顯示 Vercel 維護橋接密鑰」複製；Script Properties 對應名稱為 `PORTAL_MASTER_PROXY_SECRET`。將顯示的密鑰複製到 Vercel 對應環境變數。`setupSheets()` 會移除舊 `PORTAL_MASTER_PASSWORD` Script Property。
- **YMIS 卡啟用時**，先輪換先前披露的 YMIS 密碼及全部預設 DC／DDC／ADC／STAFF 區系統登入密碼，再私密設定 `YMIS_VERIFY_USERNAME`、`YMIS_VERIFY_PASSWORD`。詳見 [`YMIS 人工登入卡部署指引`](ymis-verification-feasibility.md)。勿將上述私密值交到 Git、Google Sheet、對話或公開環境變數。

---

## A. Teamup（共 3 條）
| # | Config 欄位（v4.0） | 舊欄名（仍兼容） | 係咩 | 去邊度攞 | 點驗證 |
|---|---|---|---|---|---|
| A1 | `TEAMUP_API_KEY` | `teamupApiKey` | Teamup API Token | 從區後台受保護嘅 Config／Teamup 後台取得；`get-ids.js` 已移除寫死嘅 Token，請用 `TEAMUP_API_KEY` 環境變數或執行時輸入。舊 Token 曾進入 Git 紀錄，應於 Teamup 輪換後更新 Config | 見下面「驗證 Teamup」 |
| A2 | `TEAMUP_CALENDAR_KEY` | `teamupCalendarId` | 日曆金鑰 `ks...` | Vercel env `TEAMUP_CALENDAR_ID` | 見下面「驗證 Teamup」 |
| A3 | `TEAMUP_APPROVED_SUBCAL_ID` | `teamupApprovedSubId` | 「確認借用區總部」子日曆 ID | Vercel env `TEAMUP_APPROVED_SUB_ID` | 用 `get-ids.js` 列出子日曆核對 |

> A4 `TEAMUP_REJECTED_SUBCAL_ID`（舊 `teamupRejectedSubId`，拒絕子日曆）— **可選**，冇都行。

### 驗證 Teamup
```bash
cd services/skw-booking
node get-ids.js
# 輸入 A1 API Key + A2 Calendar ID
# 會列出所有子日曆 → 對返 A3 係咪「確認借用區總部」嗰個
```

---

## B. 通通鎖 TTLock（先打通呢 4 項 + 1 個自動讀出嘅 Lock ID）

> 💡 **點解喺手機「通通鎖 App」入面搵唔到「API Key」？**
> 因為通通鎖 API 將授權分開兩邊：
> 1. **應用金鑰（`App ID` + `App Secret`）** → 要用電腦去 **通通鎖開放平台 `https://open.ttlock.com`** 免費註冊「開發者帳號」並創建應用先攞到；
> 2. **管鎖帳密（`Username` + `Password`）** → 就係你平時**手機開「TTLock 通通鎖 App」管理區總部把鎖嗰個登入帳號同密碼**（唔係開放平台網站密碼！）。

| 順序 | Config 欄位（主名） | 舊相容名 | 係咩 | 去邊度攞（逐步位置） |
|---|---|---|---|---|
| ① | `SCIENER_CLIENT_ID` | `ttlockClientId` | 開放平台 `App ID`（`client_id`） | 電腦開 **`https://open.ttlock.com`** → 右上角 **Register** 註冊開發者帳號 → 登入後入 **Console（控制台）→ App Management（應用管理）→ Create Application（創建應用）** → 審核通過（Approved）後點入應用詳情複製 **`App ID`** |
| ② | `SCIENER_CLIENT_SECRET` | `ttlockClientSecret` | 開放平台 `App Secret`（`client_secret`） | 同上，喺 **`https://open.ttlock.com`** 應用詳情頁複製 **`App Secret`** |
| ③ | `SCIENER_USERNAME` | `ttlockUsername` | **手機「通通鎖 App」**登入帳號 | 打開手機 **TTLock 通通鎖 App**（管住區總部大門鎖嗰個帳號）：如用香港電話註冊填 `852` + 8位電話（例 `85291234567`）；如用電郵註冊填電郵。**切勿填開放平台網站帳號！** |
| ④ | `SCIENER_PASSWORD` | `ttlockPassword` | **手機「通通鎖 App」**登入密碼 | 上述手機 TTLock App 嘅明文登入密碼（後台會自動幫你做 MD5 加密；如手機 App 只綁咗 Apple/Google 第三方登入，請先喺 App「設定 → 帳號與安全」設返密碼） |
| ⑤ | `SCIENER_LOCK_ID` | `ttlockLockId` | 大門鎖數字 `Lock ID` | **唔使自己搵！** 喺平台 `/venue-regs` 填好 ①～④ 點 **「🚀 儲存並即刻測試通通鎖連線＆讀取門鎖」**，系統會自動撈出門鎖清單同 Gateway 狀態，點 **「⚡ 一鍵設為預設門鎖」** 即自動綁定 |
| — | `SCIENER_API_BASE` | `ttlockApiBase` | 伺服器區域 | **留空即可**（`v4.24.0` 自動跨區探測 `euapi.ttlock.com` / `api.ttlock.com` / `api.sciener.com`） |

### 硬件必查：WiFi 網關（Gateway G2/G3）
- 通通鎖本身行藍牙；要喺網頁一鍵遠端寫入「申請人電話頭 4 位」密碼，區總部必須插住 **通通鎖 WiFi 網關（Gateway）** 並連緊 WiFi。
- 打開手機 **TTLock App → 左上角選單 → 網關（Gateway）**，確認網關顯示 **在線（Online）** 且關聯咗區總部把門鎖。
- 喺 `/venue-regs` 讀鎖時見到 **`🟢 已接 WiFi Gateway（可遠端寫鎖）`** 就代表通通鎖 100% 打通！

---

## C. 其他（可選）
| Config 欄位 | 說明 |
|---|---|
| `NOTIFY_STAFF_EMAIL` | 新申請通知收件人（可多個，以逗號分隔） |
| `notifyFrom` | 選填：電郵寄件人顯示名稱（唔填就預設用區名，不是 Gmail 地址） |
| `approverEmail` | 不用填；現行 Code.gs 沒有使用 |
| `ttlockDisabled` | 留空。想先跳過 TTLock 先跑其餘流程就填 `TRUE` |

---

## 填咗點知 Work？
1. 後台 Apps Script 貼上新 `gs/Code.gs`（v4.0）→ 執行一次 `setupSheets()`（補建唔清空）。
2. 喺 **Config** 頁填晒 A1–A3、B1–B5。
3. `Venues` 表加一個場地。
4. 成員系統申請 → 審批頁「✅ 批准」（`approveVenueBooking`）→ 如果 Teamup 出現「確認借用」事件、申請人收到密碼電郵，就代表全部 Key 啱。

## 最緊要：唔好喺 Chat 貼 Key
呢啲係你系統秘密，唔好貼喺對話度。自己喺 Config 頁填就得，程式已經自動讀取。
