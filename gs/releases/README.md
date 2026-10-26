# GS 版本化快照（Apps Script 同步專用區）

呢個資料夾係**貼去 Apps Script 嘅正式 GS 檔案庫**，每個後台版本一個不可變快照，方便日後同步管理系統同追溯。

## 存放約定

| 位置 | 角色 | 可唔可以改 |
|---|---|---|
| `gs/Code.gs` | 唯一開發源（single source of truth），PR 改呢份 | ✅ 開發中改 |
| `gs/releases/Code-v<版本>.gs` | 該版本嘅**只讀快照**，部署 Apps Script 時貼呢份 | ❌ 版本一出版本號即凍結，唔再改 |
| `public/downloads/Code.gs.txt` | 管理系統 `/setup`、`/updates` 頁嘅「最新版」下載連結，永遠同 `gs/Code.gs` 同步 | 跟源同步 |

## 出新版本流程

1. 喺 `gs/Code.gs` 改邏輯，更新檔頭同 `getHealthCheck_` 嘅版本號（例如 `4.29.0` → `4.30.0`）。
2. 跑晒 `scripts/test-*-gs.js` 同 `npx tsc --noEmit`、`npm run build`。
3. 複製快照：`cp gs/Code.gs gs/releases/Code-v4.30.0.gs`，並同步 `cp gs/Code.gs public/downloads/Code.gs.txt`。
4. `scripts/test-upgrade-gs.js` 會強制檢查 `gs/Code.gs` 同 `public/downloads/Code.gs.txt` 一致，唔同步會 fail。
5. 開 PR 合併後，區方下載對應快照（或 `/downloads/Code.gs.txt`）貼入 Apps Script → 執行 `setupSheets()` → 重新部署 Web App。

## 對齊來源

`Code-v4.29.0.gs` 原封取自 member-portal MAIN `9dbe876`（PR #22）的 `backend/gs-releases/Code-v4.29.0.gs`。配套管理端 patch 已整合；不是另建獨立後台。現行 v4.29.1 保持同一公開 v1.3 合約，原始快照不改。

## 現有快照

- `Code-v4.29.1.gs` — 現行下載版：全隱藏團不重生骨架、公開網址清洗、不完整列拒絕；全表清空要求前端確認。
- `Code-v4.29.0.gs` — 旅→團階層名錄（UnitSections 表、`saveUnitSections`、團級集會時間／地點／社交帳戶）

> 歷史版本（v4.28.1 或之前）喺 Git history 入面可以搵返；由 v4.29.0 起先有獨立快照檔。
