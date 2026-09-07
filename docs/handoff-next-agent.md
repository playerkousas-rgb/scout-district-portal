# 下一手 Agent 交接備忘（v4.5.0）

> 2026-09-07（第四輪）🎪 繽紛日 2026 專頁：`app/fun-day/page.tsx`（籌備會議＋執行手冊兩分頁，只要求登入、唔經 Cards／Perms，唔使改後台）＋ `lib/funDay.ts`（單一資料來源：第 5 次 9/14(一)1915 百周年大樓1704室已填，1–4 次待補；執行手冊含 FAT/01／ACC-RPT／保險通告連結＋大會文件待上載位）＋ `components/FunDayBanner.tsx`（主控台紫色橫額，自動顯示下一次會議，冇就收埋）＋ CSS `.fund-*`／全站 `.rcode`。更新方法見 `docs/hkir-fun-day-2026.md`。

> 2026-09-07（第三輪）v4.5.0：**外部資料全部由 Vercel `app/api/external/route.ts` 代抓**（sandbox 對外連線被封，只能用 fixture 測；`PORTAL_DEV_EXTERNAL_BASE` 指向 mock `/upstream?u=`）。解析器 `lib/externalParsers.ts`（職員表／總監架構／諮議會／各署／預算 CSV，純函數）、`lib/ics.ts`（ICS + RRULE 展開，香港時間）、`lib/roomsDirectory.ts`（11 間房日曆 ID、打通關係 `combo`）、`lib/orgDirectory.ts`（架構靜態備援）、`lib/externalSources.ts`（來源網址）。頁面：`/budget`（`api.extBudget`，Config `BUDGET_SHEET_URL` 覆蓋 Sheet）、`/rooms`（逐間房逐日／今日總覽／原版 iframe）、`/orgchart`（地域＋總會）、`/contacts` 港島地域只剩 `staff` 組並即時同步，`rc/dc/hq/ahq` 組已刪（搬去 orgchart 備援）。後台 Code.gs 4.5.0：Cards +`rooms`／`orgchart`（ALL_VIEW）、`budget` done、Config `BUDGET_SHEET_URL`、`getConfig` 回 `budgetSheetUrl`；**刪 `annual` 週年會議文件卡**（`removeIds` 內，`app/annual-docs` 已刪；刪 route 後記得 `rm -rf .next/types/app/annual-docs` 先過 tsc）。mock：`/tmp/mockgs/gas-emu.js`（Apps Script 模擬器）+ `server.js`（GS `/exec` + 上游 fixture `/upstream`）+ `test45.js`（33 assertions，包括 v4.4.0→4.5.0 升級路徑）——sandbox 重置會冇咗，要用時照 README 描述重寫。
> ⚠️ 真實網頁解析未經真機驗證（sandbox 出唔到網）：部署後請開 `/api/external?kind=regionStaff`／`regionOrg`／`hksaCouncil`／`hksaDepts`／`budget`／`rooms` 逐個睇 `ok:true`；scout.org.hk 對非瀏覽器 UA 可能 403（route 已帶 Chrome UA），如仍失敗前端會自動用內建備援並標「⚪ 官方網頁暫時讀唔到」。
>
> 2026-09-07（第二輪）v4.4.0：天氣決策（`lib/weatherDecision.ts` + `components/WeatherDecisionPanel.tsx` + `components/WeatherDecisionBanner.tsx`，天文台 warnsum 由瀏覽器直接拉；sandbox 無法對外連線，只能 mock JSON 測邏輯）、聯結簿三分頁（`lib/contactsDirectory.ts`；旅團資料待用戶提供，格式見 `TroopRow`）、刪除 meeting 卡（`patchCardRows_` 移除舊行）、`components/BackLink.tsx`（每頁頂＋`BackBar` 頁尾）、帳戶層級 `level`（`lib/levels.ts`；後台 `levelOfRole_`/`levelOfUser_`）、`PRESET_USERS` 密碼 1234 + `mustChangePassword`、`requestPasswordReset`/`resetPassword`（token = base64(reset|email|exp|sig)，sig 含舊 passwordHash → 單次有效）、`/delegate` 授權／收回（`getDelegation`/`delegatePerms`/`revokePerms` 寫 Perms 表）、隱藏卡片只有 level 0 見（`getCards_`）。mock 後台 `/tmp/mockgs/server.js` seed 登入改用 `dc@skwscout.org.hk` / `1234`；emulator 測試 `/tmp/gstest/run44.js`（56 assertions）。
>
> 2026-09-07 更新：v4.3.0 加咗「意外／應變」三分頁（`app/incident/page.tsx`、`lib/incidentGuide.ts`、`lib/incidentPrint.ts`）、訓練班每班收費 FPS QR（`components/CourseFpsBlock.tsx`、`lib/fps.ts`）、主控台完成標示（藍框 done／虛線 todo）、GS `IncidentReports` 表 + 4 個 action、CourseLinks 6 個 FPS 欄。
> member-portal（`playerkousas-rgb/member-portal`）**而家讀得到**；佢個 proxy 有公開欄位白名單，要顯示課程 QR 就要照 `docs/member-gs-handshake.md` 改嗰 4 個檔。
> 意外報告草稿只存 localStorage（key `portal_incident_draft_{區碼}`），按「確定提交」先 POST，唔好改做逐鍵 autosave。列印格式以總會 ACC-RPT (2019/07) 為準，唔好照抄 event repo 嘅 AR-1 mock。
> 舊卡片 `incident` 由 todo 轉 done：`setupSheets()` 內 `patchCardRows_` 只改「仍係舊預設值」嘅行；如用家改過描述就要自己喺 Cards 表改 `category=done`。

> 日期：2026-08-25  
> 用家語言：香港中文  
> 狀態：**呢輪功能已合併 main**。用家會自己下載 GS、貼去 Apps Script、執行 `setupSheets()` 測試。**測試完先同新 agent 研究下一步。**  
> 本檔唔寫、唔問、唔貼任何 Secret（Client Secret、鎖密碼、Lock 密碼、API Key 明文）。

---

## 用家而家要做（測試）

1. 下載 `public/downloads/Code.gs.txt`（= `gs/Code.gs` v4.2.3）。
2. Apps Script **全部覆蓋貼上** → 儲存。
3. Sheet 選單「🧭 區統一後台」→「🧱 補建缺失表（不清空資料）」。
4. **新部署／更新現有 Web App**（執行身分：我自己；存取：任何人）。`/exec` 唔好換就得。
5. 健康檢查（免 Key）：  
   `{apiBase}?action=getHealthCheck`  
   要見到 `"version":"4.2.3"`。
6. DDC 或以上登入管理系統，睇主控台 HERO 走馬燈 + `/venue-regs` 四掣。

`setupSheets()` **只補唔洗**：已有表唔 `clear()`、已有 Config key 唔覆寫 value、`API_KEY_HASH` 已有就唔再生成。

---

## 已完成（已喺 main）

| 項目 | 說明 |
|---|---|
| GS 4.2.3 | `getPendingInbox`、`updateVenueBooking`、一鍵 `approveVenueBooking` |
| setup 安全 | 補缺失表／欄／Config 列；已填格保留 |
| Sciener 別名 | Config 主用 `SCIENER_*`，兼容 `ttlock*` |
| API 主機 | `open.sciener.com` 自動改 `https://api.sciener.com` |
| 密碼模式 | `PWD_MODE=phone4`（電話頭 4 位）。**唔好改做強制 6 位** |
| Lock ID | **唔係欄名**。Config 一列 `SCIENER_LOCK_ID`（舊名 `ttlockLockId`），或場地 `scienerLockId` |
| 開戶 | 只有 DDC+（DC / SYSADMIN / DDC_ADMIN / DDC_TRAINING）；只准開 DL / LEADER / AL |
| 前端 DDC+ | `/venue-regs`：⚡一鍵批准、＋借用、✎編輯、✕拒絕；鎖列表可讀可填 |
| 非 DDC 有 venueReg | ✅確認（唔設鎖）+ 編輯 + 拒絕 |
| 走馬燈 | 登入後主控台 HERO 大紅黃走馬燈；舊 GS 會 fallback `getVenueBookings` / `getStockRequests` |
| 借物資批核 | `/stock-regs` 已打通（批准先扣庫存） |
| 借場填表 | `submitVenueRequest` 寫 Sheet + Teamup「申請中」 |

**分支／PR：** 工作喺 `arena/01a01678-scout-district-portal`，PR #7 合併入 `main`。  
**SKW apiBase：** `lib/district.ts` 現有 `/exec`。  
**member-portal：** `https://github.com/playerkousas-rgb/member-portal.git`（2026-09-07 已可讀，HEAD `149f910`）。

---

## 未完成 / 測試後先做（優先序）

### 1. Sciener／TTLock 真接通（用家測完先搞）

前端一鍵批准已接 `approveVenueBooking`。鎖未通會 **fallback 密碼**，單仍然批得。

下一手要同用家對：

- Config 已填：`SCIENER_CLIENT_ID` / `SCIENER_USERNAME` / `SCIENER_LOCK_ID` / `PWD_MODE=phone4`
- `SCIENER_API_BASE` 必須係 **`https://api.sciener.com`**，唔好留 `open.sciener.com`（網站）
- Gateway 用家話一定有；審批頁「讀取鎖列表」可核對 `hasGateway`
- **唔好問、唔好叫用家貼** Client Secret、管鎖密碼
- 一鍵失敗常見原因：未更新 Web App 部署、Lock ID 空、OAuth 失敗、鎖離線

### 2. member-portal 聯調

- member-portal repo 已可讀；活動知會、借場、借物資欄名已核對一致
- 合約見 `docs/member-gs-handshake.md`（v4.3.0：含訓練班 FPS QR 白名單改法）
- 測：成員填表 → Teamup 申請中 → 管理端走馬燈 → 一鍵／拒絕

### 3. 編輯申請後未同步 Teamup

`updateVenueBooking_` 只改 Sheet，**唔改 Teamup 事件時間／標題**。職員改完時段，日曆可能仲係舊時間。

### 4. 職員「借用」未自動一鍵批

`＋ 借用` 而家係 `submitVenueRequest` → **pending**。用家若想「職員代借即批＋出密碼」，要加第二步或新 action。

### 5. 走馬燈未喺其他頁出現

淨係主控台 HERO。`DistrictShell` 未掛。若用家想每個內頁都見到，再加。

### 6. 物資頁未做走馬燈／職員代借

`/stock-regs` 仍係舊批准／拒絕／歸還。物資未有「代借／編輯申請」。

### 7. 文件過時位

- `docs/keys-checklist.md` 仍寫 TTLock 舊欄名為主（GS 已兼容，但新標準係 `SCIENER_*`）
- `docs/member-gs-handshake.md` 舊句「批准掣唔會行 approveVenueBooking」**已唔準**（4.2.3 已行）
- `app/updates/page.tsx` 已有 4.2.3 說明

### 8. 其他已知限制

| 項目 | 說明 |
|---|---|
| `savePerms_` | 儲存權限矩陣仍 `clear()` Perms 表（管理員手動儲存先會，唔係 setup） |
| `TOKEN_SECRET` / `MASTER_*` | GS 頂部示範值，部署前應改；**唔好寫入 chat** |
| Rebase | 複製 `Code.gs.txt` 一定要喺 `Code.gs` **無衝突標記之後** `cp` |
| 密碼 | 用家堅持 **phone4** 得；唔好改 random 6 位做預設 |
| 開戶角色 | 唔好開放 DC / DDC / ADC / STAFF 批量開戶 |

---

## 下一手唔好做

- **唔好** `clear()` 有資料嘅 Sheet
- **唔好** 覆寫已填 Config value
- **唔好** 問／貼 Secret
- **唔好** 改 `PWD_MODE` 預設離開 `phone4`
- **唔好** 當 `open.sciener.com` 係 API
- **唔好** 當 Lock ID 係表頭欄；佢係 Config **一列 key**
- Arena session 若綁死某條 `arena/…` 分支：只推嗰條，用 PR 入 main，唔好本地 checkout 第條分支做正工

---

## 建議測試清單（用家測 GS）

- [ ] `getHealthCheck` → `4.2.3`
- [ ] 重跑 setup 後，自己填過嘅 Config／申請／Users **仲喺度**
- [ ] DDC+ 登入 → HERO 有待批就出現大紅走馬燈
- [ ] `/venue-regs`：一鍵批准、借用、編輯、拒絕
- [ ] 一鍵時鎖未通：單已批 + 有 `warn` + 仍有密碼
- [ ] 拒絕：狀態 rejected + 申請人有電郵（有填 email 先）
- [ ] 「讀取鎖列表」：有鎖就出 Lock ID；無帳密就顯示錯誤，唔崩潰
- [ ] `/stock-regs` 批准／拒絕仍然正常

測完先決定：鎖聯調、Teamup 改期同步、職員代借即批、定其他。
