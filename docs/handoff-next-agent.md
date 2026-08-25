# 下一手 Agent 交接備忘（v4.2.3 已入 main）

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
**member-portal：** `https://github.com/playerkousas-rgb/member-portal.git` 呢邊環境 **404**。

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

- 呢邊讀唔到 member-portal repo
- 合約見 `docs/member-gs-handshake.md`（請當 4.2.3：一鍵批准已接前端）
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
