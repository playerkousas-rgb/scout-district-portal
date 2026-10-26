# v4.26.0「你講我聽」意見箱後端

## 成員端合約

公開 `POST` action 為 `submitDistrictFeedback`，欄位如下：

- `category`: `opinion` 或 `support`
- `message`: 10–2000 字
- `wantReply`: boolean
- `contactName`, `contactType`（`phone` / `email` / `ig` / `fb`）, `contact`
- `dcOnly`: boolean

不需要回覆時，後端會忽略並清空所有聯絡欄位；需要回覆時必須提供有效聯絡類型及帳號。留言會回傳 `id`、`refCode` 及 `dcOnly`。

## 儲存位置與平台權限

兩個資料分頁都在同一份主試算表：

| 類別 | 分頁 | 管理頁 | 管理平台／API 權限 |
|---|---|---|---|
| 一般意見／支援 | `DistrictFeedback` | `/feedback-inbox` | `feedback` 卡片 Perms `view` / `edit` |
| DC 留言 | `DCConfidential` | `/dc-feedback` | 卡片只授權 DC／SYSADMIN；後端列表 API 另直接驗證目前有效的 DC／超管身份 |

這個限制針對**管理平台與 API**。Google Sheets 不提供分頁級閱讀權限，所以任何有主試算表檢視權的人仍能直接打開 `DCConfidential`。分頁保護只限制編輯，不限制閱讀。如果要禁止主試算表其他檢視者讀到留言，必須改用獨立試算表或收緊整份主試算表的分享權限。

`setupSheets()` 只補建分頁及表頭，不清除或覆寫既有留言。若 Config 留有舊版 `DC_CONFIDENTIAL_SHEET_ID`，新版不再使用該設定；setup 不會為遵守只追加原則而自動刪除它。若舊獨立檔案內已有留言，請先人工確認／遷移，勿直接刪檔。

## 設定與升級

1. 先備份現有主試算表及 Apps Script，並確認 v4.26.0 所需的 Script Properties／token 遷移已完成；不要直接覆蓋未遷移的正式後端。
2. 將 `gs/Code.gs` 貼入區方 Apps Script 專案，執行 `setupSheets()`。它會在主試算表補建 `DistrictFeedback` 和 `DCConfidential`（已存在的分頁及資料保留）。
3. 在 `Users` 確認 DC 帳戶的 `email` 正確、`role` 為 `DC` 且帳戶啟用。卡片預設只授權 DC／SYSADMIN；需按區方需要確認 `Perms`。
4. 可選擇在 Config 設定 `DC_NOTIFY_EMAIL`。留空時不寄通知，但留言仍會正常儲存；通知電郵只含參考編號，不含留言內容或聯絡資料。
5. 驗證 `getHealthCheck` 回傳 `version: "4.26.0"`、`feedbackReady: true`、`dcFeedbackReady: true`。測試一般及 DC 留言分別寫入兩個分頁；以非 DC 帳戶呼叫 `getDCFeedback`，應回覆無權限。注意，這項 API 測試不會限制主試算表檢視者直接閱讀分頁。
6. **正式部署由區方自行執行。** 助手不會代部署或覆蓋正式 Apps Script。
