# 部署瘦身、防呆與 Scout Admin 回報

## 1. Vercel 部署瘦身（防 Storage 爆）

`.vercelignore` 是部署黑名單；它不會刪除 Git 內的檔案，只是不把不影響線上運行的檔案上傳至 Vercel build/deployment bundle。

忽略項目：

- `.git`、`.github`、`node_modules`、`.next`、`out`、`build`、`coverage`；
- 本機 `.env*`、暫存／備份／log 檔；
- `docs/`、`scripts/`、`gs/`、`services/`：它們是文件、測試或 Apps Script 原始碼，Next.js runtime 不會 import。

**不可忽略 `public/downloads/`**：訓練班頁會直接提供 Apps Script 模板下載，該資料夾屬於正式線上資產。

守則：新加大檔前，先確認是否由 `app/`、`components/` 或 `public/` 線上引用；未引用的靜態資產不要提交。新測試輸出、備份或開發檔應補進 `.vercelignore`。

## 2. 後台寫入防呆

共用模組：`lib/useFormGuard.ts`。

已接入的低風險後台表單：

| 頁面 | 草稿 | 離開提示 | 提交前摘要 | 防雙擊／重複寫入 |
|---|---|---|---|---|
| `/venue-regs` 場地設定 | ✓ | ✓ | ✓ | ✓ |
| `/venue-regs` 職員代借／Phase 1 確認 | — | — | ✓ | ✓ |
| `/stock-regs` 物資設定及批核 | ✓ | ✓ | ✓ | ✓ |
| `/activity-notices` 手動補錄 | ✓ | ✓ | ✓ | ✓ |

草稿只保存於操作員目前瀏覽器的 `localStorage`，未提交前不會寫入 Google Sheet；成功保存後會即時清除。草稿模組會在儲存空間不足時剔除超大字串，避免整份草稿失效。

**不可放進草稿 snapshot：** 密碼、API Key、Sciener secret、完整附件／收據 data URL。這些資料不應留在瀏覽器 localStorage。

物資批核另有三層防呆：

1. 批准前顯示庫存會扣減、歸還前顯示庫存會回補；
2. 單件只會顯示符合目前狀態的動作；整批「一次過批准／拒絕／歸還」只在整批狀態一致時出現，避免把已批准／已歸還行誤轉回其他狀態；
3. `gs/Code.gs` 在**批准當刻**再次核對即時 `availableQty`。兩張 pending 申請即使提交時各自都有貨，先批准的一張扣貨後，後一張若不足會被擋；批次會先聚合同款數量 preflight，任何一項不足便整批維持 pending，絕不半批扣貨。

## 3. Scout Admin 統一回報／意見回饋

根 layout 已載入 Scout Admin widget：

```html
<script src="https://scout-admin-blue.vercel.app/widget.js" data-app="區系統"></script>
```

效果：所有區管理平台頁面的右下角都有 **「🐛💬 回報 · 意見」**。

- 問題回報與意見回饋直接送去 Scout Admin 自己的 Apps Script；**不經本區 `gs/Code.gs`、不需本區 API Key、亦不要求登入**；
- `data-app="區系統"` 是 Scout Admin v2.4 已登記的正式來源，後台 TICK 看板會以「區系統」膠囊分流及計算未閱數；
- 使用者送出後會立即看到提交提示；Scout Admin 管理員在問題回報／意見回饋看板閱覽、篩選及標記已閱；
- 回報資料原本儲存在 Scout Admin 的 Google Sheet，並不混入借場、借物資、活動知會或訓練班的主後台 Sheet。

Scout Admin 的提交端是獨立、容錯的統一 payload；因此 widget 暫時不可讀取管理端處理進度或向提交者寄回覆。若下一期要做「可追蹤的正式回執」，需在 Scout Admin 的接收端增加回報編號／查詢 token／回覆通知，不能只在區系統前端假裝已收到。
