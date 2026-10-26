# 成員系統「區內旅團」名錄合約

## 資料來源及管理方式

- 唯一後台來源：區管理系統 Apps Script 的 `Units`（旅）及 `UnitSections`（團）分頁；初始筲箕灣區 28 個旅團沿用現有名單及主辦機構，依據[港島地域官方筲箕灣區旅團列表](https://www.hkirscout.org.hk/tc/districts_groups/groups/skw/index.html)（檢視日期 2026-03-31）。
- 管理介面：區管理系統 「旅團資料」卡 → `/visit?tab=units`。區方可編輯主辦機構、集會時間、Instagram、Facebook、旅團網頁及是否在成員系統公開顯示。
- 社交／網頁欄位可留空；空白代表不顯示該項。只接受 `http://` 或 `https://` 網址。未勾選公開顯示的旅團不會出現在公開 API。
- `Units` 沿用原旅資料；`UnitSections` 僅存各支部團詳情，成員端不提供編輯功能。

## 公開 API

新增 Apps Script GET action：`listDistrictTroops`。成員系統應經自己的 server-side proxy 呼叫此 action，並在 proxy GET action allowlist 加入 `listDistrictTroops`。Apps Script API Key 必須只留在 server-side Vercel 環境變數，不能傳給瀏覽器。

```json
{
  "ok": true,
  "data": {
    "districtCode": "SKW",
    "districtName": "筲箕灣區",
    "troops": [
      {
        "troop": "17",
        "label": "港島第17旅",
        "organizer": "慈幼中學",
        "meetingTime": "",
        "instagramUrl": "",
        "facebookUrl": "",
        "websiteUrl": ""
      }
    ]
  }
}
```

`troops` 只包括 `active=TRUE`（或舊資料空白）且 `publicVisible=TRUE`（或舊資料空白）的旅團。`publicVisible` 是獨立的公開顯示開關，不會更改旅團啟用狀態。沒有填的可選資料會回傳空字串；成員系統應只顯示非空欄位。點擊旅團後以彈窗／抽屜顯示旅團名稱、主辦機構及已填公開資料；社交／網頁連結以新分頁開啟，設定 `rel="noopener noreferrer"`。

## v4.29.x 旅→團階層合約（成員端 v1.3）

v4.29.0 將名錄由「每旅一張卡」升級為對齊[港島總會筲箕灣區旅團表](https://www.hkirscout.org.hk/tc/districts_groups/groups/skw/index.html)嘅旅→團兩層結構。

### 資料表

- `Units`（沿用）：旅層級，每行一個旅，含五支部團數字串（`gh/cub/scout/venture/rover`，例如 `1+A1`、`2`、`1+A1+S1`）。
- `UnitSections`（v4.29.0 新建，10 欄）：`troop, section, unitCode, meetingTime, location, instagramUrl, facebookUrl, websiteUrl, active, publicVisible`。每個團（支部單位）一行；`unitCode` 常規團留空，`A1`＝空童軍團、`S1`＝海童軍團。`setupSheets()` 只追加補建，唔清舊資料。

### 公開回應 shape（`listDistrictTroops`，GET 無須登入）

```json
{
  "ok": true,
  "data": {
    "districtCode": "SKW",
    "districtName": "筲箕灣區",
    "troops": [
      {
        "troop": "101",
        "label": "港島第101旅",
        "organizer": "筲箕灣東官立中學",
        "meetingTime": "",
        "instagramUrl": "",
        "facebookUrl": "",
        "websiteUrl": "",
        "sectionCounts": { "scout": "1+A1", "venture": "1+A1+S1", "rover": "1+A1" },
        "units": [
          { "section": "scout", "unitCode": "", "label": "童軍團",
            "meetingTime": "逢星期六 14:00", "location": "校本部",
            "instagramUrl": "https://...", "facebookUrl": "", "websiteUrl": "" },
          { "section": "scout", "unitCode": "A1", "label": "空童軍團",
            "meetingTime": "", "location": "",
            "instagramUrl": "", "facebookUrl": "", "websiteUrl": "" }
        ]
      }
    ]
  }
}
```

- 每個團淨係 8 個公開欄位；`note`、`active`、`publicVisible` 唔喺公開回應出現。
- 骨架回落：某旅喺 `UnitSections` 完全冇維護列時，後台按 `Units` 團數字串自動拆出 `units`（純數字＝常規團，每支部 cap 9；`A`／`S` 前綴＝變體；無法辨識嘅代號丟棄），詳情全部空白，由成員端回落旅層級資料並標示。
- 維護覆蓋：一旅有任何維護列，公開名錄只回該旅啟用＋公開的維護列（全部隱藏時 `units: []`，不重生骨架）（停用／非公開嘅團唔出現）。

### 管理 action：`saveUnitSections`（POST，需 visit 卡 edit 權限）

- Payload：`{ token, rows: UnitSection[] }`（相容別名 `unitSections`，最多 1000 團），全表覆寫（同 `saveUnits` 模式）；空陣列＝清空，公開名錄回落骨架。
- 伺服器端驗證：`troop`＋`section` 必填、`unitCode` 須為空或 `A1`／`S1` 格式、dup key（`troop|section|unitCode`）拒絕、網址須為 `http(s)` 且無空白。
- `getVisitBoard` 一併回傳 `unitSectionsReady`（表是否已補建）同 `unitSections`（管理端看全部列，含停用／非公開）。

### 成員端責任（member-portal，已於 PR #21 完成）

- Proxy 欄位白名單覆蓋巢狀 `units`（旅 9 欄／團 8 欄），`safePublicUrl` 只放行 `http(s)`；外連統一 `target="_blank" rel="noopener noreferrer"`；空欄不渲染。
- UI：每旅一列（五支部團數 chips）→ 點旅展開各團 → 點團開彈窗睇獨立集會時間／地點／社交帳戶；團無資料時回落旅層級並標示。
- 向後相容：舊版 GS 只回旅層級 7 欄時，前端合成單一團条目，唔會壞版。

## 同步來源與版本

- 已比對成員系統 MAIN `9dbe876ad4d4dc09eccfa68d3563def6b81cdf39`（PR #22，2026-10-26）。該次新增後台快照及管理端 patch，公開名錄仍沿用 PR #21 的 v1.3 合約。
- `gs/releases/Code-v4.29.0.gs` 原封保存對方 `backend/gs-releases/Code-v4.29.0.gs`；管理端整合其 `UnitSectionsEditor`、型別、API 及示範配套，保留本分支旅團資料／YMIS 快捷卡。
- 現行 **v4.29.1** 不改 action 或 payload，補上全隱藏團不重生骨架、Sheet 直接輸入網址的公開清洗、不完整列或錯誤旅號整筆拒絕，避免全表儲存時靜默丟資料。清空所有團須在編輯器再次確認。
- `saveUnitSections` 是明確的全表覆寫業務操作，空陣列會清空所有旅的維護列並回落骨架；不是只追加升級。單純執行 `setupSheets()` 不會清空既有列。
- 執行 `node scripts/check-member-alignment.js /path/to/member-portal`，現在同時以真正 GS 回應經成員端 sanitizer 驗證巢狀欄位；舊版只檢查 action 存在並不足以保證資料同步。
- 此同步未代部署 Apps Script 或兩邊 Vercel，亦未存取正式旅團資料。成員端實際線上狀態由區方驗收。

## 本地驗證（2026-10-26）

- `npm run build`：通過（含 TypeScript 檢查）。
- `node scripts/check-member-alignment.js /path/to/member-portal`：對照 MAIN `9dbe876` 通過，含實際回應的 v1.3 巢狀 sanitizer 檢查。
- `node scripts/test-unit-sections-gs.js`：12 項通過；`node scripts/test-upgrade-gs.js`：32 項通過，包含既有 UnitSections／自訂欄保留及下載／快照一致。
- `node --experimental-strip-types scripts/test-demo-engine.ts`：28 項通過。
- `scripts/test-*-gs.js` 共 14 組，13 組通過；唯一失敗為原有 `test-district-hq-gs.js:62`（舊 getDistrictHqBookings route 測試）。以變更前 `HEAD:gs/Code.gs` 重跑亦重現相同失敗，非本次名錄同步新增；未改動該月曆功能或掩蓋該測試。
- 旅團資料／YMIS 快捷卡及卡片門禁測試通過。未執行真實部署或外部服務驗證。
