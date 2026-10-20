# 區後台 GS：只追加升級（v4.19.1）

**完整程式：[`gs/Code.gs`](../gs/Code.gs)**；網站「更新／下載」提供的 [`Code.gs.txt`](../public/downloads/Code.gs.txt) 必須與它完全相同。這是更新**原有 Apps Script 專案的程式**，不是新建 Sheet，也不是刪走舊資料。前端已在上一輪合併；本次只修正後端升級路徑及相關下載／部署說明。

## 先備份，勿提供真實金鑰

1. 在原有 Google Sheet「檔案 → 建立副本」留還原點；在 Apps Script 記下原有程式版本及 Web App `/exec` 網址。有自行修改的 GS 應先私下備份及比對。不要把金鑰、個人資料或 Sheet 內容貼到 Git／對話。
2. Apps Script → 專案設定 → **Script Properties** 設定每區獨立、至少 32 字元隨機的 `PORTAL_TOKEN_SECRET`；新版不再使用程式碼的公開預設簽署密鑰。切換後原有登入 session／尚未使用的重設密碼連結都會失效，職員需要重新登入。若需要維護帳號，才另設最少 12 字元的私密 `PORTAL_MASTER_PASSWORD`。
3. YMIS 帳戶須先由區方按正式程序輪換曾披露的密碼及區系統預設 Users／Staff 密碼；由 Users 帳戶完成改密碼流程、`mustChangePassword=FALSE` 之後，才將輪換後的 `YMIS_VERIFY_USERNAME`／`YMIS_VERIFY_PASSWORD` 設於同一個 **Script Properties**。不可存於 Code.gs、Sheet Config 或前端；未設則 YMIS 頁提示未設定。

## 更新原有後台（只新增，不修改原有格）

1. 把完整 `gs/Code.gs` 貼入**與原有 Sheet 綁定的同一個 Apps Script 專案**，替換原有 `Code.gs` 程式檔。保留你自行維護的其他 Script 檔；不要新建 Sheet，不要執行 `setupCourseSheet()`／`resetAllPasswords()`。
2. 在 Apps Script 執行一次 **`setupSheets()`** 並授權。它對**已存在的表**只做以下追加：在**最右邊**新增缺少的欄／表頭、在**最底**新增缺少的 Config／Cards／Perms 行；缺少的整張表才建立。**原有行、原有儲存格（包括空白值）、權限矩陣、舊獎勵規則、Users 帳戶／密碼、工作表保護及編輯者不會被清空或改寫。**重跑亦不重複新增。
3. 特別注意：舊 `news`／`meeting`／`annual` 卡片的 `enabled` 原值會保留，**不會被自動停用或移除**；如需隱藏，由有權限的人日後自行決定。舊 `Awards` 年期／提名規則原樣保留，不會默默套用新版預設。權限規則在**讀取／操作時**執行：`rooms` 所有已登入者可查、`venueReg` 必須有 `canVenue`、YMIS 只限合資格 Users、獎勵提名只限 DDC 或以上；這不會改動舊 Perms 格。舊預設房間卡名可在 API 顯示新名稱，但 Sheets 裏的舊名稱不變；自訂名稱原樣顯示。
4. **API Key**：已有非空 `API_KEY_HASH` 原樣保留。舊 Config **缺少整行**時，`setupSheets()` 只追加一行新雜湊，並當場顯示新 Key 一次，請私下同步前端 `PORTAL_{區碼}_APIKEY` 及成員端 `MEMBER_{區碼}_APIKEY`。舊行**已存在但 value 空白**也不會改；這種情況必須由區方另行、**明確選擇**「重新生成 API Key」（會寫入該空白格），並同步兩端環境變數，**未完成前不要部署／使用**。已有 Users 表即使只有表頭亦不會新增公開初始密碼帳戶；**已有資料但缺 Users 表**時只建空表頭，帳戶須由區方自行建立。只有整本**全新空白試算表**才會種藍圖初始帳戶，必須盡快改密碼／停用。
5. **Deploy → Manage deployments → 選原有 Web App → Edit → New version → Deploy**。請編輯**原部署**以沿用原 `/exec` 網址；切勿另開新 Web App。開 `/exec?action=getHealthCheck` 核對 `ok: true`、`version: "4.19.1"`、正確區碼及 `apiKeySet: true`。再以測試帳戶登入、核對原有 `VenueBookings`／`News`／`Users` 記錄、Teamup 紅色確認子日曆及 YMIS 門禁。

> 「只追加」**只指自動升級函數 `setupSheets()`**，不是禁止職員日常登入、改密碼、批核、儲存或刪除功能按授權正常寫入。若你希望**連一般操作**都不得修改／刪除舊資料，需要另行改寫業務流程，不能單靠本升級保證。這份測試使用虛構的舊表資料，已驗證原有儲存格、格式及保護不被升級觸及；我們**沒有存取或測試你的真實 Google Sheet／YMIS／Teamup**。先備份，再在原有專案操作；前端合併 `main` 不等於 Apps Script 已部署。
