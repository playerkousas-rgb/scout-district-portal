# 🔑 借場一條龍 — API Key 找回 + 驗證 Checklist（統一後台 v4.0）

> **版本提示（2026-10）**：現時正式共用後台係已恢復登入的 **4.18.0**。本頁 Script Properties／貼上新版 GS 等步驟**只適用於日後另行決定升級 4.19.1**，唔係維持 4.18.0 或開啟房間卡的必要條件。今次房間查閱只改 Vercel，已按現有 Config 的紅色子日曆 ID 設定預設值，**毋須新增環境變數／Teamup API Token**；`TEAMUP_APPROVED_SUB_ID` 僅於 ID 日後變更時選用，詳見[房間使用情況](venue-booking-flow.md)。**唔好照本頁先升級 GS 而斷登入。**
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

## 登入及 YMIS 保障（僅日後決定部署 v4.19.1 才適用）

- **目前正式 4.18.0 毋須設定** `PORTAL_TOKEN_SECRET`；只有另行決定部署本倉 v4.19.1 GS 時才必設每區獨立、至少 32 字元亂碼。v4.19.1 未設／太短會令全部帳戶在密碼核對前被拒；切換簽署金鑰亦會令舊登入／重設連結失效。**今次房間修正不需要走此步。**
- **選設** `PORTAL_MASTER_PASSWORD`：至少 12 字元長密碼，未設則維護帳號不能登入；舊原始碼示範密碼已不能使用。
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
