# v4.26.0「你講我聽」意見箱後端

## 成員端合約

公開 `POST` action 為 `submitDistrictFeedback`，欄位如下：

- `category`: `opinion` 或 `support`
- `message`: 10–2000 字
- `wantReply`: boolean
- `contactName`, `contactType`（`phone` / `email` / `ig` / `fb`）, `contact`
- `dcOnly`: boolean

不需要回覆時，後端會忽略並清空所有聯絡欄位；需要回覆時必須提供有效聯絡類型及帳號。留言會回傳 `id`、`refCode` 及 `dcOnly`。

## 儲存與讀取隔離

| 類別 | 儲存位置 | 管理頁 | 後端權限 |
|---|---|---|---|
| 一般意見／支援 | 主試算表 `DistrictFeedback` | `/feedback-inbox` | `feedback` 卡片的 Perms `view` / `edit` |
| DC 保密 | 獨立 Google 試算表中的 `DCConfidential` | `/dc-feedback` | 僅目前啟用的 DC 角色或超級管理員；後端直接驗證，不依賴前端隱藏 |

Google Sheets 的工作表保護只限制編輯，不能限制其他試算表讀者查看分頁內容。因此保密留言不會存入主試算表。DC 私密檔案在 setup 時設為私人分享，移除非 DC 的編輯者及檢視者，只新增 Users 表內有效 DC 的檢視權限。Drive 檔案擁有者無法從自己的檔案權限中移除，因此 owner 必須是 Users 表內啟用的 DC／SYSADMIN；若不是，健康檢查會將 `dcFeedbackReady` 標為 `false`，私密留言提交也會 fail closed。DC 私密分頁另加編輯保護。

## 設定與升級

1. 先備份現有主試算表及 Apps Script，並確認 v4.26.0 所需的 Script Properties／token 遷移已完成；不要直接覆蓋未遷移的正式後端。
2. 將 `gs/Code.gs` 貼入區方 Apps Script 專案，執行 `setupSheets()` 並授權 Sheets、Drive 及電郵（若使用通知）存取。
3. 確認 Config `DC_CONFIDENTIAL_SHEET_ID` 已填入建立的獨立試算表 ID；檢查檔案分享名單只有有效 DC 帳戶及執行 Apps Script 的擁有者。若 DC Users 帳戶有增減，重新執行 `setupSheets()` 同步分享名單。
4. 可選擇在 Config 設定 `DC_NOTIFY_EMAIL`。留空時不寄通知，但保密留言仍會正常儲存；通知電郵只含參考編號，不含留言內容或聯絡資料。
5. 驗證 `getHealthCheck` 回傳 `version: "4.26.0"`、`feedbackReady: true`、`dcFeedbackReady: true`。以一般留言及 DC 保密留言各測試一次；確認前者只出現在主表、後者只出現在獨立檔案。另以非 DC 帳戶呼叫 `getDCFeedback`，必須回覆無權限。
6. **正式部署由區方自行執行。** 助手只提供程式碼及測試，不會部署或覆蓋正式 Apps Script。

`setupSheets()` 僅補建缺失表／欄／Config 列並保留既有資料；重跑時會沿用同一個 `DC_CONFIDENTIAL_SHEET_ID`，不會建立新檔或清空留言。
