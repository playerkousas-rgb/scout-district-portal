# 🧭 童軍區管理平台（scout-district-portal）

區職員端嘅統一管理平台。**借場 / 借物資 / 活動知會 / 訓練班目錄 + 報名批核** 全部由一份
`gs/Code.gs`（Google Apps Script 後台）＋ 呢個 Next.js 前端 ＋ 一個 `/api/proxy` ＋ 一個 API Key 完成。

> 公開報名端（申請人填表嗰邊）係另一個 repo：**member-portal**。呢邊只做「區職員審批」。

---

## 🏛 借場系統 — 起動步驟（最常要做，照住做就得）

架構：**申請人（member-portal）填表 → 寫入 Google Sheet（pending）＋ Teamup「申請中」事件 →
區職員喺 `/venue-regs` 批准（Teamup 轉色）。** TTLock 一鍵密碼稍後再接。

對接合約見 [`docs/member-gs-handshake.md`](docs/member-gs-handshake.md)。

> `services/skw-booking/` 係**選用**嘅舊獨立方案，主流程唔使理佢。

### 第 1 步：起後台（Google Sheet + Apps Script）
1. 開一張 Google Sheet（或沿用你已有嗰張）→ **擴充功能 → Apps Script**。
2. 將 `gs/Code.gs`（最新版 4.0.1）**全部內容覆蓋貼上** → 儲存。
3. 函數選單揀 **`setupSheets`** → 執行（首次要授權：Review permissions → Advanced → Allow）。
   - 自動建齊所有工作表（Config / Users / Venues / VenueBookings / CourseLinks …）。
   - ★ 係「**補建唔清空**」：重跑唔會洗走你已有資料。
   - 彈窗會顯示 **API Key（只顯示一次）→ 即刻複製**。
4. 改安全設定（喺 `Code.gs` 頂部）：`TOKEN_SECRET`、`MASTER_EMAIL`、`MASTER_PW`、`DEFAULT_PASSWORD`。
5. **部署 → 新增部署 → 網頁應用程式**（執行身分：我自己；存取：**任何人**）→ 攞 `/exec` 網址。

### 第 2 步：填 Config 金鑰（喺「Config」工作表）

> **簡潔版設定表：** 請先看 [`docs/config-simple.md`](docs/config-simple.md)。電郵只需填 `NOTIFY_STAFF_EMAIL`；`notifyFrom` 只是顯示名稱，`approverEmail` 現行不用填。
| 區塊 | 欄位 | 備註 |
|---|---|---|
| Teamup | `TEAMUP_API_KEY` | 兼容舊欄名 `teamupApiKey` |
| Teamup | `TEAMUP_CALENDAR_KEY` | 分享金鑰，形如 `ks...`（唔係 `c/` 開頭） |
| Teamup | `TEAMUP_APPROVED_SUBCAL_ID` | 「確認借用區總部」子日曆 ID |
| Teamup | `TEAMUP_REJECTED_SUBCAL_ID` | 選填（拒絕子日曆） |
| TTLock | `ttlockClientId` / `ttlockClientSecret` | 通通鎖開發者應用 |
| TTLock | `ttlockUsername` / `ttlockPassword` | TTLock App 登入帳密 |
| TTLock | `ttlockLockId` | 大門鎖 Lock ID |
| TTLock | `ttlockApiBase` | 預設 `https://api.ttlock.com`（eu/cn 先改） |
| TTLock | `ttlockDisabled` | **未就緒先填 `TRUE`**（改用隨機密碼，其餘流程照跑） |
| 電郵 | `notifyFrom` | 寄件人名稱（預設用區名） |

> 唔記得 Key 喺邊度攞 → 睇 [`docs/keys-checklist.md`](docs/keys-checklist.md) 逐條倒返出嚟＋驗證。
> ℹ️ 借場/借物資規則（VENUE_RULES_URL / VENUE_TERMS_URL / STOCK_RULES_URL）已改由成員系統內建，後台唔使再填。

### 第 3 步：加場地
- 「Venues」工作表加一行（`venueId` 代碼 + `name` 名稱），或直接喺平台 `/venue-regs` 頁底「＋ 新增場地」。

### 第 4 步：接上平台（區目錄 + API Key）
- `lib/district.ts` 已註冊 **SKW（筲箕灣區）** 嘅 `apiBase`。換區先要加一筆。
- Vercel → Settings → Environment Variables 設 **`PORTAL_{區碼}_APIKEY`**（例：`PORTAL_SKW_APIKEY=ak_...`）。
- 驗證：瀏覽器開 `https://你嘅網址/api/proxy?districtCode=SKW&action=getHealthCheck` 見到 `ok: true` 同 `version: "4.8.0"` 即通。

### 第 5 步：member-portal 申請表（另一個 repo）
- member-portal 嘅借場表接公開 action **`submitVenueRequest`**（經佢個 proxy 帶 API Key），欄位：
  `venueId, name, phone, email, troop, position, purpose, startDate, endDate, agreeRules, teamupEventId`。
- ⚠️ `email` 選填，但**冇填就收唔到批准密碼電郵**。

### 第 6 步：端到端測試
1. 用申請人身份喺 member-portal 交表 → 後台「VenueBookings」出現 **pending**。
2. 登入管理平台 → `/venue-regs` → 點「✅ 批准」。
3. 睇結果：頁面顯示 🔑 密碼、Teamup 出現「確認借用」事件、申請人收到密碼電郵。

### 驗證新版已上線
- 部署後開 `?action=getHealthCheck`（免 API Key）→ 見 `version: "4.8.0"` 即代表用緊最新後台。

---

## 💳 FPS QR 製作（v4.1.0 新卡片）

收款戶口已內建預設：**SCOUT ASSOCIATION OF HONG KONG - SHAU KEI WAN DISTRICT**（FPS ID `102866183`），唔填 Config 都用到。
要換戶口先喺 Google Sheet 嘅 Config 表改：
- `FPS_ACCOUNT_NAME`：區會轉數快戶口名（顯示用）
- `FPS_ACCOUNT_NUMBER`：轉數快收款 FPS ID（7 或 9 位數；本區為 `102866183`）

登入平台 → 主控台「💳 FPS QR Code 製作」卡片 → 輸入銀碼（可選參考編號）→ **QR 即時生成** → 直接複製 QR 圖片、用手機系統分享，或下載 PNG 貼落通告；毋須再開外部產生器。
- 製作者如不設定銀碼，可按「製作靜態 QR」製作供掃碼付款人自行填銀碼的 QR；有銀碼 = 固定銀碼 QR。
- QR 內容跟香港 Common QR Code 規格（FPS），商戶名按 FPS 規格用 `NA`，收款識別靠 `FPS_ACCOUNT_NUMBER`。
- Apps Script 可能把純數字 FPS ID 回傳為數字；前端已兼容數字／文字格式，`102866183` 可直接正常生成。
- 要令舊後台出現呢張新卡片：貼新 `gs/Code.gs` → 執行 `setupSheets()`（自動補建缺失卡片＋權限，唔會洗資料）。

---

## 🏕 旅團探訪（v4.8.0）

`/visit` — 幹部撳一下旅團格仔就登記探訪；DC 揀日期範圍即出報告。

| 分頁 | 做咩 |
|---|---|
| 🗺 探訪登記 | 全區旅團一格格排開，**未探過紅框、探過綠框**（顯示最近日期、次數、邊個探）。撳一下 → 日期預設今日、幹部預設你自己 → 儲存就完 |
| 📊 探訪報告 | 揀「由幾月到幾月」（有本季／全年／上下半年／9 月–8 月童軍年度快捷掣）→ 探訪 list ＋ **邊個幹部探咗幾多次、探過邊啲旅** ＋ 仲有邊幾旅未探 → 一鍵匯出 CSV 交總會 |
| ⚙️ 旅團名單 | 全區 28 個旅（旅號、主辦機構、五個支部團數），可直接改或者由官網／Excel 貼上；改完會順手同步 `Config TROOP_LIST`，「活動知會」「聯結簿」一齊更新 |

- **一入去只睇自己支部**：跟角色自動揀（`ADC_GH` → 小童軍、`ADC_CUBS` → 幼童軍、`ADC_SCOUT` → 童軍），DC 等其他角色 = 全部支部；頂部隨時切換，揀完會記住（localStorage）。
- **支部分開計**：探咗 17 旅童軍團，唔會當幼童軍團都探咗；冇填支部嘅記錄當「全旅」，邊個支部都計入。
- 內建旅團名單跟港島地域官網「筲箕灣區旅團一覽表」（覆檢日期 2026-03-31），`101` 旅嗰啲 `1+A1+S1`（空童軍團／海童軍團）寫法照樣保留。
- 後台 4.8.0：新增 `Units`（旅團名單）同 `Visits`（探訪記錄）兩張表 + `getVisitBoard`／`saveVisit`／`deleteVisit`／`saveUnits`；權限用卡片 `visit` = ✏️。
- 測試：`node scripts/test-visit-gs.js`（15 項後台）、`node --experimental-strip-types scripts/test-visit-logic.ts`（14 項報告邏輯）。

## 🎖 獎勵提名（v4.7.3）

`/awards` 一站式：**名冊 + 自動計「今年邊個夠期可以提名下一級」+ 年期自己改**。
一入頁最上面就有 **🔔 提示橫額**（而家有幾多人夠期、跟邊個提名期、距區部死線幾多日、🔥 逐個名列出），
「📋 獎勵名冊」入面夠期嗰啲人會**成行標亮 + 🔥 可提名**並排最前，仲有「🔥 只睇夠期可提名」篩選。

| 分頁 | 做咩 |
|---|---|
| 🏅 提名建議 | **頒完獎打勾一次過登記獲獎**（寫返落名冊，自動跳去下一級）；揀頒獎年份 → 自動分「創辦人紀念日獎勵」「童軍獎勵（大會操）」「自行申請」三組，列出夠期人選（等最耐排最前）、顯示提名截止日同倒數、一鍵匯出 CSV 名單 |
| 📋 獎勵名冊 | 全區獎勵記錄，搜尋／按狀態／按已有獎項篩選；新增、編輯、刪除；匯出 CSV |
| ⚙️ 年期設定 | 每個獎項嘅**上一級**同**相隔年數**、分類、提名期、啟用與否，全部喺網頁改，唔使改程式；亦可以自己加新獎項（會自動喺 Sheet 補一欄） |
| ⬆️ 首次匯入 | **開檔一次過用**：由 Excel 直接複製貼上（支援 `GSA1985`／`LSM*2005`／`CCM2025?` 或「表頭 + 淨係年份」兩種寫法，亦識讀「86th since 2004/01/15」做服務開始年份），可合併更新或清空重寫 |

- **點計夠期**（三種情況）：
  1. **有上一級**（例：DSA 跟 GSA）→ 上一級年份 ＋ 設定年期 ≤ 頒獎年份。
  2. **入門級**（優良服務獎章、長期服務獎章）→ **服務開始年份 ＋ 設定年期** ≤ 頒獎年份；所以名冊有「服務開始」一欄，未填會喺提名頁出提示。
  3. 冇上一級又冇年期（例：感謝狀、**第一個長期服務獎章**）→ 唔自動推算，自己入紀錄（長期服務**一星之後**就會自動每 10 年提你）。年期留空但有上一級（例：銅獅勳章跟功績榮譽十字章）→ 一有上一級就列出，標「冇年期規定」。
- **內建 18 個獎項**：GSA 優良服務獎章、DSA 優異服務獎章、DSM 功績榮譽獎章、DSC 功績榮譽十字章、銅／銀／金獅勳章、LSM 長期服務獎章及一至四星、香港總監嘉許／高級嘉許、民政及青年事務局局長嘉許、五年／十年長期服務獎狀、感謝狀。**預設年期**（用戶提供）：服務滿 **7 年**→優良服務獎章、之後 **5 年**→優異服務獎章、**7 年**→功績榮譽獎章、**5 年**→功績榮譽十字章、獅勳章**冇固定年期**；長期服務獎章**第一個由區會自己入**（預設唔自動推算，想自動就喺年期設定填 15），**一星之後**每 **10 年**自動提示。唔啱就自己喺「年期設定」改（有「↺ 套用建議年期」一鍵還原內建建議）。
- **提名截止**（總會 ACR 20/2024）：創辦人紀念日獎勵 區部 10/31 → 總會 11/30（頒獎年前一年）；童軍獎勵 區部 4/30 → 總會 5/31（同年）。
- 後台 4.7.3：新增 `Awards`（一人一行、每個獎一欄）同 `AwardTypes`（年期規則）兩張表 + `getAwardsBoard`／`saveAwardMember`／`deleteAwardMember`／`importAwardMembers`／`saveAwardTypes`；權限用卡片 `awards` = ✏️。
- **日常流程（每次通常只有幾個人）**：①「🏅 提名建議」打勾 →「✅ 登記 N 項獲獎」（頒完獎用，最快）；②「📋 獎勵名冊 → ＋ 新增成員」加新委任領袖；③ 名冊「編輯」補返舊獎年份。
  「⬆️ 首次匯入」淨係第一次開檔用，之後唔使再入去。
- `saveAwardMember` **只會寫 payload 有帶嘅欄**，所以淨係更新一個獎年份唔會清走旅團／職位／服務開始年份。
- 測試：`node scripts/test-awards-gs.js`（21 項後台）、`node --experimental-strip-types scripts/test-awards-logic.ts`（24 項推算／匯入解析）。

## 📦 一次過借多款物資（v4.6.1）

`gs/Code.gs` 補上 **`submitStockBatchRequest`**（成員系統一張表揀幾款物資時會叫，舊版冇 → 佢要逐件 POST）：

- **全部夠貨先寫**：任何一款唔夠／唔存在 → 成批唔寫，唔會出現「寫咗一半」
- 同一款揀兩次自動合併數量；只寄一封通知俾區職員
- 每款仍然係 `StockRequests` 一行（批核／庫存邏輯完全唔變），但共用 **`batchRef`**
- `/stock-regs` 會合成「🧾 一張申請 · N 款物資」，可 **一次過批准／拒絕／歸還**（`setStockBatchStatus`）：庫存逐款加減、重複批唔會重複扣、申請人只收一封信
- `StockRequests` 加 `batchRef` 欄，`setupSheets()` 自動補；舊資料留空 = 單件，行為不變

> 🧭 **唯一後台**：`gs/Code.gs` 係兩邊唯一後台來源，成員系統唔會自己養一份。詳見 [`docs/member-gs-handshake.md`](docs/member-gs-handshake.md) 開頭「唯一後台原則」。

## 📢 消息發佈 → 成員系統首頁置頂（v4.6.0，欄位對齊 v4.6.2）

管理系統「📢 消息發佈」（`/news`）發一則消息 → 成員系統 **member-portal 首頁頂部一直置頂顯示**；
呢邊一刪／一下架，嗰邊下次載入即刻消失。**純粹「讀同顯示」：冇推送、冇 Service Worker、冇 badge。**

```
/news 發佈 → 主 Sheet「News」表 → GET listAnnouncements（公開免登入）→ member-portal 首頁 banner
```

| 功能 | 做法 |
|---|---|
| 置頂 | `pinned=TRUE`；成員首頁頂部一直顯示（可同時多則） |
| 類別 | `info` 藍／`warning` 黃／`important` 紅（舊資料 `warn`／`urgent` 自動對應） |
| 排期出街 | `date` 填將來日期 → 到嗰日先出現 |
| 自動落架 | `expiresAt` 到期自動消失，唔使記得返嚟刪 |
| 暫時收起 | 「下架」（`active=FALSE`）→ 成員即刻唔見，記錄仍在，可重新上架 |
| 詳情連結 | `link` / `linkLabel`（成員端 proxy 只放行 http(s)） |
| 通知（選用） | `notify=TRUE` 俾成員端日後可以用 Notification API（方案 1），後台唔使再改 |

- 權限：卡片 `news` 喺權限矩陣 = `edit` 先可以發佈／刪除（預設 DC／SYSADMIN／DDC_ADMIN／DDC_TRAINING／STAFF；其餘 `view`）；層級 0 超管永遠可。
- 主控台頂部亦有同一條「置頂消息」橫額（同成員睇到嘅係同一份資料，方便核對）。
- 後台 4.6.0：新增 `News` 工作表、公開 action `listAnnouncements`，另 `getAnnouncements` / `saveAnnouncement` / `deleteAnnouncement` / `setAnnouncementPinned` / `setAnnouncementActive`（需登入 + 卡片 edit 權）；Cards 補 `news` 卡片。貼新 `gs/Code.gs` → 執行 `setupSheets()`（補建唔清空）即可。
- **成員系統已上線**（`AnnouncementBanner`，commit `bb44fe6`）：佢讀 `{ id, title, content, date, pinned, level }`，
  所以後台 v4.6.2 公開回應除咗 `body` 會**多回一個 `content`**，`level` 亦統一用 `info` / `warning` / `important`
  （之前回 `warn`／`urgent` + 淨係 `body`，成員端會內容空白兼全部藍色）。詳見 [`docs/member-gs-handshake.md`](docs/member-gs-handshake.md)。
- 成員系統嘅 🔔 通告圖書館推送（Web Push）行 Supabase + VAPID，**唔經本後台**，GS 唔使加嘢。
- 後台邏輯測試（唔使開 Apps Script）：`node scripts/test-news-gs.js`（35 項）。
- 對齊檢查：`node scripts/check-member-alignment.js`（action／欄位名／`level` 值域／proxy 安全邊界）。

## 📑 區年度預算 / 🏢 地域房間 / 📇 聯結簿自動同步 / 🏛 架構（v4.5.0）

外部公開資料一律由 Vercel **`app/api/external/route.ts`** 伺服器端代抓（瀏覽器直接抓會撞 CORS；Apps Script 唔使改），
解析器係純函數 `lib/externalParsers.ts`（可用 `node` 直接測）；同一 instance 內快取（網頁 6 小時、預算 10 分鐘、日曆 3 分鐘），
上游失敗回傳最後一次成功結果（`stale=true`），再唔得先由前端用內建備援並標明。

| kind | 來源 | 用喺 |
|---|---|---|
| `budget` | 區方 Google Sheet gviz CSV（預設 `1dvrBDIcmk1zXHXb02qPFrDv46UvPDmfd` gid `308655146`；Config `BUDGET_SHEET_URL` 可覆蓋；Sheet 要「知道連結可查看」） | `/budget` 按月／按支部／全部活動 + 合計 |
| `rooms` | hkir-rooms 11 個公開 Google 日曆 ICS（`lib/roomsDirectory.ts`；`lib/ics.ts` 展開 RRULE） | `/rooms` 逐間房逐日時段、今日總覽、原版日曆 |
| `regionStaff` | hkirscout.org.hk 專業領袖及受薪職員表 | 聯結簿・港島地域（只放職員直線電話） |
| `hksaDepts` | scout.org.hk 總部各署頁（11 個 `?id=`） | 聯結簿・總會 |
| `regionOrg` | hkirscout.org.hk 總監架構 | `/orgchart` 港島地域 |
| `hksaCouncil` | scout.org.hk 香港總監諮議會 | `/orgchart` 總會（執行委員會主要職位為內建名單） |

- 房間打通關係：1704A／1704B ⊂ 1704 ⊂ 1704+1705；睇任何一間都會自動計入相關日曆（標「經 XXXX 打通預約」）。
- 開發／測試：`PORTAL_DEV_EXTERNAL_BASE=http://127.0.0.1:8787/upstream` 可把全部上游改經本機 fixture（同 `PORTAL_DEV_APIBASE` 一樣只喺非 production 生效）。
- 後台 4.5.0：Cards 補 `rooms`／`orgchart`（全員 view）、`budget` todo→done（只改仍係舊預設值嘅行）、Config 補 `BUDGET_SHEET_URL`；刪除 `annual` 週年會議文件卡片（`patchCardRows_` 移除舊行，`app/annual-docs` 已刪）。

## 🌦 天氣決策 / 📇 聯結簿 / 👤 層級授權 / 🙈 隱藏卡片（v4.4.0）

- **天氣決策**（`lib/weatherDecision.ts`、`components/WeatherDecisionPanel.tsx`、主控台 `WeatherDecisionBanner`）：瀏覽器直接拉天文台開放數據 `warnsum`（公開、可跨域），對照活動指引通告 04/2018 表一，戶內／戶外／海上各自一個結論（✅／⚠️／⛔）＋原因；可模擬；AQHI 天文台 API 冇提供，人手揀。
- **聯結簿**（`app/contacts/page.tsx`、`lib/contactsDirectory.ts`）：旅團（待區方資料）／港島地域／總會三分頁，來源及日期寫喺檔頭。v4.5.0 起港島地域只放職員電話並自動同步，總監架構搬去 `/orgchart`。
- **帳戶層級**：`level` 0 超管 → 1 DC → 2 DDC → 3 ADC → 4 STAFF → 5 其他。`Users` 表新增 `level` / `mustChangePassword` / `delegatedBy`；`Roles` 表新增 `level`。預設帳戶（`PRESET_USERS`）密碼 `1234`、首次登入必改；`setupSheets()` 只補缺，唔改已有帳戶。
- **忘記密碼**：`requestPasswordReset`（公開，寄去帳戶電郵，前端帶 `resetUrlBase` 即 `/?d=區碼`，連結 `&reset=TOKEN`）→ `resetPassword`。Token 綁定舊密碼雜湊，24 小時有效、用一次即失效。
- **授權／收回**（`/delegate`）：`getDelegation` / `delegatePerms` / `revokePerms`，直接寫 `Perms` 表；只可授出自己擁有嘅權限、只可授俾層級較低嘅角色。
- **隱藏卡片**：`Cards.enabled=FALSE` → `getCards` 只回傳俾 level 0（超管）；主控台超管每張卡有開關。
- 已刪除「會議行事曆」卡片（`patchCardRows_` 會移除舊行）。

## 🚨 意外／應變（v4.3.0 完成）

主控台「🚨 意外／應變」卡片三個分頁，全部依香港童軍總會官方通告整理（來源連結喺「完整指引」分頁）：

| 分頁 | 內容 |
|---|---|
| 即時應變 | 活動出事時打開即用：受傷送院／嚴重傷亡／惡劣天氣／酷熱寒冷空氣污染／遠足失蹤／海上事故／保護童軍成員／傳媒查詢 8 張情境卡，每張有步驟、致電總監要講齊嘅資料（活動指引通告 02/2021）、限期（嚴重 3 個工作天、報告 7 個工作天）；另有 04/2018 天氣警告對照表、緊急熱線、出發前檢查 |
| 完整指引 | 總會表格／政策通告／行政通告／活動指引通告全部官方 PDF 連結 |
| 意外報告 | 手機直接填總會行政署「意外報告」(ACC-RPT 2019/07) 全部欄位；**草稿只存本機，按「確定提交」先入後台 `IncidentReports`**；列印／PDF 完全依官方兩頁版面；DDC+ 可記錄「單位主管已省閱」及刪除 |

後台：`submitIncidentReport`（登入）、`listIncidentReports`（登入）、`updateIncidentReport` / `deleteIncidentReport`（canVenue）。提交會寄 `NOTIFY_STAFF_EMAIL`，嚴重傷亡會加註。

## 🎓 訓練班收費 FPS QR（v4.3.0）

`/training` 每班一個「💳 收費 QR」掣：用區會 FPS 戶口 + 學費 + 課程編號即時生成 → 「儲存 QR 到此班」寫入 `CourseLinks`（`fpsQrPayload` 等 6 欄）→ 成員系統 `listCourseLinks` 就攞到，未交費嘅申請人可以直接掃。
member-portal 嗰邊要開白名單同畫 QR，改法見 [`docs/member-gs-handshake.md`](docs/member-gs-handshake.md)。

## 📚 文件索引

| 文件 | 內容 |
|---|---|
| `docs/member-gs-handshake.md` | **member-portal ↔ GS 合約**（消息發佈置頂；借物資打通；借場填表→Teamup→批核） |
| `docs/venue-booking-flow.md` | 借場流程（而家：填表+Teamup+批核；密碼稍後） |
| `docs/booking-setup-merge-checklist.md` | 貼 Code.gs → setup → 填 Key → 驗證 → 測試 嘅逐步操作 |
| `docs/keys-checklist.md` | **找回 + 驗證 Teamup / TTLock API Key**（你唔記得 Key 睇呢份） |
| `docs/setup-guide.md` | 全平台部署及使用指南（區職員端） |
| `docs/skw-booking-setup.md` | 選用：實體門鎖自動化獨立方案（可略過） |
| `docs/card-permission-plan.md` | 卡片＋角色權限矩陣 |
| `docs/venue-booking-flow.md` 同 `app/venue-regs/page.tsx` | 審批頁實作 |

## 🧩 主要檔案

| 檔案 | 用途 |
|---|---|
| `gs/Code.gs` | 統一後台（登入/角色/權限/借場一條龍/訓練班/借物資/知會） |
| `gs/Code.gs.course.js` | 每個訓練班嘅收表 Script 模板 |
| `app/api/proxy/route.ts` | 前端 → Apps Script 嘅代理（API Key 唔出前端） |
| `lib/district.ts` | 區目錄（區碼 → apiBase 對照） |
| `app/venue-regs/` | 場地借用審批頁 |
| `app/news/` | 消息發佈（發去成員系統首頁置頂） |
| `app/awards/` | 獎勵提名（名冊 · 夠期推算 · 年期設定 · Excel 匯入） |
| `scripts/test-news-gs.js` | 後台邏輯測試：消息發佈 + 批次借物資（node 直接跑，35 項） |
| `scripts/test-awards-gs.js` | 獎勵提名後台測試（21 項） |
| `scripts/test-visit-gs.js` | 旅團探訪後台測試（15 項） |
| `scripts/test-visit-logic.ts` | 探訪報告／支部篩選測試（14 項，`node --experimental-strip-types`） |
| `scripts/mock-gs-server.js` | 本機模擬 Apps Script 後台（`node scripts/mock-gs-server.js` → `PORTAL_DEV_APIBASE=http://127.0.0.1:8788/exec PORTAL_SKW_APIKEY=dev npx next dev`，登入 `sheep`／`0728`） |
| `scripts/test-awards-logic.ts` | 獎勵夠期推算／Excel 匯入解析測試（24 項，`node --experimental-strip-types`） |
| `scripts/check-member-alignment.js` | 成員系統 ↔ 後台對齊檢查（action 缺漏 / proxy 白名單 / 安全邊界） |
