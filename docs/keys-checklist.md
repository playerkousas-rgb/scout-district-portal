# 🔑 借場一條龍 — API Key 找回 + 驗證 Checklist（統一後台 v4.0）

> 你唔記得啲 Key 邊度嚟，好正常 — 因為佢哋收埋喺 **Vercel**（booking 專案）嘅環境變數，
> 同你 **booking 系統 code** 入面嘅預設值。以下教你逐個倒返出嚟 + 驗證，唔使靠記憶。
>
> v4.0 統一後台 Config 主用 **`TEAMUP_*`** 欄名；舊欄名（`teamupApiKey` 等）仍然讀到（自動 fallback），
> 舊 Config 冇搬都照行。

## 邊度搵 Key（3 個來源）
1. **Vercel**：`skw-booking` 專案 → **Settings → Environment Variables**（大部分 Key 喺度）
2. **booking code 預設值**：`services/skw-booking/get-ids.js`（Teamup API Key 喺度有現成）
3. **重新跑工具**：用 `get-ids.js` / `get-lock-id.js` 重新登入撈返（如果上面搵唔到）

---

## A. Teamup（共 3 條）
| # | Config 欄位（v4.0） | 舊欄名（仍兼容） | 係咩 | 去邊度攞 | 點驗證 |
|---|---|---|---|---|---|
| A1 | `TEAMUP_API_KEY` | `teamupApiKey` | Teamup API Token | Teamup 管理帳戶或受限 Config | 見下面「驗證 Teamup」 |
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

## B. 通通鎖 TTLock（共用後台 Config）
| # | Config 欄位 | 係咩 | 點驗證 |
|---|---|---|---|
| B1 | `SCIENER_CLIENT_ID` | 開放平台 App ID | 見「驗證 TTLock」 |
| B2 | `SCIENER_CLIENT_SECRET` | 同一 App 的 Secret | 見「驗證 TTLock」 |
| B3 | `SCIENER_USERNAME` | TTLock 登入帳號（lock2 / App） | 見「驗證 TTLock」 |
| B4 | `SCIENER_PASSWORD` | TTLock 帳戶密碼 | 見「驗證 TTLock」 |
| B5 | `SCIENER_LOCK_ID` | 大門鎖 Lock ID | 用「讀取鎖列表」或 `get-lock-id.js` 核對 |
| B6 | `SCIENER_API_BASE` | 固定 `https://api.sciener.com` | 不要填 `open.sciener.com` 網站 |
| B7 | `SCIENER_SLOT_NAMES` | 可重用的預置「限時N」密碼格名稱 | 只會重用清單中已過期的格 |

### 驗證 TTLock
```bash
cd services/skw-booking
node get-lock-id.js
# 輸入 B1~B4 → 若登入成功會列出你嘅鎖 + Lock ID + 有冇網關
# 對返 B5 係咪你要嗰個鎖，而且「已連接網關」= 是（先可遠端修改既有密碼格）
```

> ⚠️ TTLock 區域：`get-ids.js` / `get-lock-id.js` 寫死 `https://api.ttlock.com`（global server）。
> 如果你帳號註冊喺歐洲/中國 server，要用 `ttlockApiBase` 指返啱嗰個（eu / cn）。

---

## C. 其他（可選）
| Config 欄位 | 說明 |
|---|---|
| `NOTIFY_STAFF_EMAIL` | 新申請通知收件人（可多個，以逗號分隔） |
| `notifyFrom` | 選填：電郵寄件人顯示名稱（唔填就預設用區名，不是 Gmail 地址） |
| `approverEmail` | 不用填；現行 Code.gs 沒有使用 |
| `ttlockDisabled` | 日常一鍵批准請留空。填 `TRUE` 只供模擬模式；一鍵批准會安全地保持 pending，不會寄假密碼。 |

---

## 填咗點知 Work？
1. 後台 Apps Script 貼上新 `gs/Code.gs`（v4.0）→ 執行一次 `setupSheets()`（補建唔清空）。
2. 喺 **Config** 頁填 Teamup A1–A3 及 TTLock B1–B7，並保持 `ttlockDisabled` 空白。
3. `Venues` 表加一個場地。
4. 用已過期的白名單「限時N」格做測試申請 → 審批頁「⚡ 一鍵批准（Phase 2）」；確認只有該已過期格被修改、Teamup 轉色、申請人收到密碼電郵。

## 最緊要：唔好喺 Chat 貼 Key
呢啲係你系統秘密，唔好貼喺對話度。自己喺 Config 頁填就得，程式已經自動讀取。
