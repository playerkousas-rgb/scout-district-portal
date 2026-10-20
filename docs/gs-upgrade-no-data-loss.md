# 區後台 GS 安全更新：沿用原有資料（v4.19.0）

**完整 Apps Script：[`gs/Code.gs`](../gs/Code.gs)**（同網站「更新／下載」提供嘅 [`Code.gs.txt`](../public/downloads/Code.gs.txt) 內容一致）。呢份係取代原有 *Code.gs 程式檔* 嘅全本更新，**唔係**新建一張試算表，亦唔係執行 `setupCourseSheet`／`resetAllPasswords`。我哋冇存取或改動你線上 Google Sheet／Apps Script；以下操作必須由區方喺**原有專案**完成。

## 更新前：留底同安全設定

1. 在原有 Google Sheet 選「檔案 → 建立副本」作還原點；在原有 Apps Script「專案紀錄／部署」記下舊版本與現有 Web App `/exec` 網址。如果你曾在原有 Code.gs 自己改功能或金鑰，先私下保存／比對，唔好將機密程式或資料貼到 Git、聊天。
2. Apps Script → **專案設定 → Script Properties** 必設每區獨立、至少 32 字元的隨機 `PORTAL_TOKEN_SECRET`。新後台**不再使用程式碼中舊的公開預設簽署密鑰**；未設密鑰會拒絕登入。更新後所有舊登入 token、尚未使用的重設密碼連結都會失效，通知職員重新登入。如果需要維護帳號，額外設私密長密碼 `PORTAL_MASTER_PASSWORD`（至少 12 字元）；不設則維護登入停用。**唔好將值寫入原始碼或發給我。**
3. 如要啟用 YMIS，先按正式程序輪換曾披露的 YMIS 密碼、已知預設的區系統 Users／Staff 密碼，檢查 DC／DDC／ADC／STAFF 在 `Users` 的 `mustChangePassword` 經改密碼流程變成 `FALSE`，才在**同一個** Script Properties 設 `YMIS_VERIFY_USERNAME`、`YMIS_VERIFY_PASSWORD`；唔好放在 Sheet `Config`。可以待後台部署及其他功能測試完成後先填入 YMIS 兩項，未填時頁面會提示未設定。

## 更新原有專案，唔開新表

1. 從本 repo `gs/Code.gs` 複製**全份**原始碼，替換**原有試算表所綁定的同一個 Apps Script 專案**內的 `Code.gs`，儲存；其他你自行維護的 Script 檔案唔好刪。已自訂過嘅 Code.gs 請先比對、合併自訂功能。唔好建立新 Google Sheet 或將舊資料複製去空白模板。
2. 喺 Apps Script 函數選單**只執行一次 `setupSheets()`** 並授權。此函數對原有 Sheet 補缺欄／新卡片／預設值；**唔刪原有工作表、借場申請、消息、帳戶或其他業務記錄**，亦唔覆蓋現有 `API_KEY_HASH`。舊內建 `news`／`meeting`／`annual` 卡片只設 `enabled=FALSE`，原本 Cards／Perms 行保留；自訂卡片不停用。`rooms` 權限更新為全員查閱，舊預設借場審批權限會按新規則收窄，舊預設獎勵設定會升級，**自訂**名稱／獎勵設定／審批權限照舊保留。已有 Users 帳戶時，唔會再加新嘅預設管理員帳戶。
3. 到 **Deploy → Manage deployments → 選現有 Web App → Edit → New version → Deploy**。**編輯原部署，唔好另開一個新 Web App**，讓既有 `/exec` URL 及前端環境變數沿用。若 `API_KEY_HASH` 原本是空白，`setupSheets()` 會首次產生 API Key，須按畫面私下設定前端 `PORTAL_{區碼}_APIKEY` 及成員端 `MEMBER_{區碼}_APIKEY`；已設定過則不變。
4. 訪問原本 `/exec?action=getHealthCheck`（唔使 API Key）：核對 `ok: true`、`version: "4.19.0"`、正確區碼；再以測試帳戶重新登入區系統。核對舊 `VenueBookings`／`News`／`Users` 行仍在、Teamup 紅色「確認借用區總部」子日曆設定仍可讀、房間月曆同 YMIS 權限如預期。**不可把帳密或 Sheet 資料貼畀我測試。**

> 如沿用其他部署方式，或 Code.gs 被人手大幅改過，請先比對原有程式及原表，再操作。前端合併到 `main` **不等於**自動更新你嘅 Apps Script；只有原專案儲存新版、執行 `setupSheets()` 並重新部署 Web App，後端才會更新。測試係以**虛構的舊表資料**模擬升級，並非已經喺你真實 Sheet 上測過；請務必先做備份。
