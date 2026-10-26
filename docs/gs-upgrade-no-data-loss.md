# 區後台 GS：只追加升級（v4.26.1）

**完整程式：[`gs/Code.gs`](../gs/Code.gs)**；網站提供下載的 [`Code.gs.txt`](../public/downloads/Code.gs.txt) 必須與它完全相同。這份修補目前仍在未合併分支，**尚未合併 MAIN、未部署，亦未在真實 Apps Script／Sheet／外部服務上驗證**。本地 Node mock 測試通過不代表正式環境已驗證。正式 GS 更新由區方管理員在合併及自行檢查後操作；本文件不是部署已完成的聲明。

## 先備份與安全遷移

1. 在原有 Google Sheet「檔案 → 建立副本」留還原點；在 Apps Script 記下原有程式版本及 Web App `/exec` 網址。有自行修改的 GS 應先私下備份及比對。不要把金鑰、個人資料或 Sheet 內容貼到 Git／對話。
2. `PORTAL_TOKEN_SECRET` 只從 Apps Script **Script Properties** 讀取。新版 `setupSheets()` 若找不到至少 32 字元的有效值，會建立每個專案獨立的高熵密鑰；已有有效值保留。亦可由管理員先私下設定每區獨立、至少 32 字元的值再執行 setup。首次建立／更換密鑰會令舊登入 token 及未使用的重設連結失效，須安排重新登入。需要維護帳號時，另在 Script Properties 設置獨立 `PORTAL_MASTER_PASSWORD`（至少 12 字元）；不設就停用維護登入。
3. 區方應按正式程序輪換曾披露的 YMIS 共用密碼，以及仍在使用共享初始密碼的 Users／Staff 帳戶。新版本拒絕 `1234`／`scout1234`。YMIS 憑據只可由合資格、啟用的 Users 帳戶在卡片獲授權時，經 POST 明確要求取得；`mustChangePassword=TRUE` 時拒絕。YMIS 另要求該欄明確為 `FALSE`，所以舊行空白也拒絕讀取；改密碼流程完成後會明確寫成 `FALSE`。YMIS 帳密只放在 Script Properties，不得放 Code.gs、Sheet Config 或前端。

## 更新原有後台（只新增，不修改原有格）

1. 把完整 `gs/Code.gs` 貼入**與原有 Sheet 綁定的同一個 Apps Script 專案**，替換原有 `Code.gs` 程式檔。保留自行維護的其他 Script 檔；不要新建 Sheet，不要執行 `setupCourseSheet()`／`resetAllPasswords()`。
2. 在 Apps Script 執行一次 **`setupSheets()`** 並授權。對**已存在的表**只追加缺少的表頭／欄、缺少的 Config／Cards／Perms 行及缺少的整張表；既有行、儲存格、權限矩陣、舊獎勵規則、Users 密碼及工作表保護／編輯者不會被升級程序清空或改寫。重跑不重複新增。新增的 YMIS 卡及權限行屬新增資料；舊 `Perms` 格可能仍保留寬鬆舊值，但 YMIS 會另外受角色及 API 層級的硬門禁限制。
3. **不會在既有系統補建預設帳戶**，包括 Users 只有表頭、或部分舊系統缺 Users 表的情況；由有權管理員明確建立帳戶。只有整本全新空白試算表才按藍圖種初始帳戶，密碼為隨機且不顯示的臨時值，無法以公開共用密碼登入；管理員須另行重設並完成首次改密碼。
4. **API Key**：已有非空 `API_KEY_HASH` 原樣保留。舊 Config 缺少該行時，`setupSheets()` 只追加一行新雜湊並顯示新 Key 一次，須私下同步前端 `PORTAL_{區碼}_APIKEY` 及成員端 `MEMBER_{區碼}_APIKEY`。若該行已存在但 value 空白，setup 會保持空白並 fail-closed；須由區方明確使用「重新生成 API Key」功能並同步兩端環境變數。**不要把空 hash 當作可通過，也不要在未確認兩邊 Key 一致前使用。** setup 不會改動 Vercel 環境變數。
5. `rooms` 仍按原卡片及範圍規則提供唯讀日曆；管理平台卡片按角色限制可見，DC API 保留後端角色檢查。YMIS 只允許 DC、DDC、各 ADC 及 STAFF 的 Users 帳戶查看，並且只讀；SYSADMIN、DL、LEADER、AL 不可見／讀取。此為應用層/API 限制，不是 Google Sheet 閱讀隔離：有主試算表檢視權限的人仍可能直接讀取 `DCConfidential` 分頁。
6. 只有在備份、檢查 Script Properties、API Key 同步及測試帳戶準備完成後，才由區方編輯**原有** Web App deployment → New version → Deploy，以沿用 `/exec`。健康檢查應回傳 `version: "4.26.1"`、正確區碼、`apiKeySet: true` 及 `tokenSecretSet: true`。在此之前**不要部署**；本地測試不能替代 Apps Script 執行、Sheet ACL、Teamup、TTLock、郵件及正式 YMIS 驗證。

> 「只追加」只指自動升級函式 `setupSheets()`，不代表業務操作永遠不會依權限寫入資料。本倉測試使用虛構資料驗證升級保留、角色門禁與模擬借場流程；沒有存取或測試區方真實 Google Sheet／YMIS／Teamup／TTLock。先備份，合併與部署狀態以實際 GitHub／Apps Script 為準。
