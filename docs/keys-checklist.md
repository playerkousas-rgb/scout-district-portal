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
| A1 | `TEAMUP_API_KEY` | `teamupApiKey` | Teamup API Token | `get-ids.js` 預設值：`4032acf1e6d917809aeb334a16dd0bca82297e8f0f65cd6ec32e0d92bc37bbd2`（你話冇改過，可直接重用） | 見下面「驗證 Teamup」 |
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

## B. 通通鎖 TTLock（共 5 條）
| # | Config 欄位 | 係咩 | 去邊度攞 | 點驗證 |
|---|---|---|---|---|
| B1 | `ttlockClientId` | 開發者 App ID | Vercel env `TTLOCK_CLIENT_ID` | 見「驗證 TTLock」 |
| B2 | `ttlockClientSecret` | 開發者 App Secret | Vercel env `TTLOCK_CLIENT_SECRET` | 見「驗證 TTLock」 |
| B3 | `ttlockUsername` | TTLock 登入帳號（lock2） | Vercel env `TTLOCK_USERNAME` | 見「驗證 TTLock」 |
| B4 | `ttlockPassword` | TTLock 登入密碼 | Vercel env `TTLOCK_PASSWORD` | 見「驗證 TTLock」 |
| B5 | `ttlockLockId` | 大門鎖 Lock ID | Vercel env `TTLOCK_LOCK_ID`（或重跑 `get-lock-id.js`） | 見「驗證 TTLock」 |
| — | `ttlockApiBase` | 區域 server | 唔填就用預設 `https://api.ttlock.com` | — |

### 驗證 TTLock
```bash
cd services/skw-booking
node get-lock-id.js
# 輸入 B1~B4 → 若登入成功會列出你嘅鎖 + Lock ID + 有冇網關
# 對返 B5 係咪你要嗰個鎖，而且「已連接網關」= 是（先可遠端建密碼）
```

> ⚠️ TTLock 區域：`get-ids.js` / `get-lock-id.js` 寫死 `https://api.ttlock.com`（global server）。
> 如果你帳號註冊喺歐洲/中國 server，要用 `ttlockApiBase` 指返啱嗰個（eu / cn）。

---

## C. 其他（可選）
| Config 欄位 | 說明 |
|---|---|
| `notifyFrom` | 電郵寄件人名稱（唔填就預設用區名） |
| `ttlockDisabled` | 留空。想先跳過 TTLock 先跑其餘流程就填 `TRUE` |

---

## 填咗點知 Work？
1. 後台 Apps Script 貼上新 `gs/Code.gs`（v4.0）→ 執行一次 `setupSheets()`（補建唔清空）。
2. 喺 **Config** 頁填晒 A1–A3、B1–B5。
3. `Venues` 表加一個場地。
4. 成員系統申請 → 審批頁「✅ 批准」（`approveVenueBooking`）→ 如果 Teamup 出現「確認借用」事件、申請人收到密碼電郵，就代表全部 Key 啱。

## 最緊要：唔好喺 Chat 貼 Key
呢啲係你系統秘密，唔好貼喺對話度。自己喺 Config 頁填就得，程式已經自動讀取。
