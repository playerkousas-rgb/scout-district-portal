# 區後台 GS：只追加升級（v4.29.1）

**完整程式：[`gs/Code.gs`](../gs/Code.gs)**；網站下載的 [`Code.gs.txt`](../public/downloads/Code.gs.txt) 及本版 [`Code-v4.29.1.gs`](../gs/releases/Code-v4.29.1.gs) 必須與它完全相同。本分支已整合 member-portal MAIN `9dbe876`（PR #22）保存的 v4.29.0 快照及管理端配套；原始快照保留不改，現行 v4.29.1 增加隱藏團及輸入驗證修補，公開 v1.3 格式不變。**尚未由區方部署至正式 Apps Script，亦未在真實 Apps Script／Sheet／外部服務上驗證。** 本地 mock 測試不能代替正式驗收；區方須先備份，按下列步驟更新原有專案。

## 先備份與安全遷移

1. 在原有 Google Sheet「檔案 → 建立副本」留還原點；在 Apps Script 記下原有程式版本及 Web App `/exec` 網址。有自行修改的 GS 應先私下備份及比對。不要把金鑰、個人資料或 Sheet 內容貼到 Git／對話。
2. `PORTAL_TOKEN_SECRET` 與 `PORTAL_MASTER_PROXY_SECRET` 只從 Apps Script **Script Properties** 讀取；新版 `setupSheets()` 會在缺少有效值時自動建立。前者簽署登入 token；後者只作 Vercel→Apps Script 機器橋接，需複製到 Vercel `PORTAL_{區碼}_MASTER_BRIDGE_SECRET`。sheep 密碼只存在 Vercel `PORTAL_{區碼}_MASTER_PASSWORD`，長度不設最低值；短密碼較易被猜中，且目前沒有跨 Vercel instance 的分散式限速。更新 env 並重新部署後，新的密碼用於之後登入；舊 sheep session 最多仍有效 12 小時。舊 `PORTAL_MASTER_PASSWORD` Script Property 不再讀取，`setupSheets()` 會將它移除。更換 token 簽署密鑰會令舊登入 token 及未使用重設連結失效。
3. 區方應按正式程序輪換曾披露的 YMIS 共用密碼，以及仍在使用共享初始密碼的 Users／Staff 帳戶。新版本拒絕 `1234`／`scout1234`。YMIS 憑據只可由合資格、啟用的 Users 帳戶在卡片獲授權時，經 POST 明確要求取得；`mustChangePassword=TRUE` 時拒絕。YMIS 另要求該欄明確為 `FALSE`，所以舊行空白也拒絕讀取；改密碼流程完成後會明確寫成 `FALSE`。YMIS 帳密只放在 Script Properties，不得放 Code.gs、Sheet Config 或前端。

## 更新原有後台（只新增，不修改原有格）

1. 把完整 `gs/Code.gs` 貼入**與原有 Sheet 綁定的同一個 Apps Script 專案**，替換原有 `Code.gs` 程式檔。保留自行維護的其他 Script 檔；不要新建 Sheet，不要執行 `setupCourseSheet()`／`resetAllPasswords()`。
2. 在 Apps Script 執行一次 **`setupSheets()`** 並授權。對**已存在的表**只追加缺少的表頭／欄、缺少的 Config／Cards／Perms 行及缺少的整張表；既有行、儲存格、權限矩陣、舊獎勵規則、Users 密碼及工作表保護／編輯者不會被升級程序清空或改寫。重跑不重複新增。v4.28.0 會在既有 `Units` 表尾追加 `meetingTime`、`instagramUrl`、`facebookUrl`、`websiteUrl`、`publicVisible` 五欄，不覆寫原旅團資料；亦新增公開 GET action `listDistrictTroops`。v4.29.1 另補建空白 `UnitSections` 表（10 欄），保留既有 Units／Visits 及所有現有 UnitSections 儲存格；不要自行清空或重建資料表。新增的 YMIS 卡及權限行屬新增資料；舊 `Perms` 格可能仍保留寬鬆舊值，但 YMIS 會另外受角色及 API 層級的硬門禁限制。
3. **不會在既有系統補建預設帳戶**，包括 Users 只有表頭、或部分舊系統缺 Users 表的情況；由有權管理員明確建立帳戶。只有整本全新空白試算表才按藍圖種初始帳戶，密碼為隨機且不顯示的臨時值，無法以公開共用密碼登入；管理員須另行重設並完成首次改密碼。
4. **API Key**：已有非空 `API_KEY_HASH` 原樣保留。舊 Config 缺少該行時，`setupSheets()` 只追加一行新雜湊並顯示新 Key 一次，須私下同步前端 `PORTAL_{區碼}_APIKEY` 及成員端 `MEMBER_{區碼}_APIKEY`。若該行已存在但 value 空白，setup 會保持空白並 fail-closed；須由區方明確使用「重新生成 API Key」功能並同步兩端環境變數。**不要把空 hash 當作可通過，也不要在未確認兩邊 Key 一致前使用。** setup 不會改動 Vercel 環境變數。
5. `rooms` 仍按原卡片及範圍規則提供唯讀日曆；管理平台卡片按角色限制可見，DC API 保留後端角色檢查。YMIS 只允許 DC、DDC、各 ADC 及 STAFF 的 Users 帳戶查看，並且只讀；SYSADMIN、DL、LEADER、AL 不可見／讀取。此為應用層/API 限制，不是 Google Sheet 閱讀隔離：有主試算表檢視權限的人仍可能直接讀取 `DCConfidential` 分頁。
6. 只有在備份、檢查 Script Properties、API Key 同步及測試帳戶準備完成後，才由區方編輯**原有** Web App deployment → New version → Deploy，以沿用 `/exec`。健康檢查應回傳 `version: "4.29.1"`、正確區碼、`apiKeySet: true` 及 `tokenSecretSet: true`。在此之前**不要部署**；本地測試不能替代 Apps Script 執行、Sheet ACL、Teamup、TTLock、郵件及正式 YMIS 驗證。

> 「只追加」只指自動升級函式 `setupSheets()`，不代表業務操作永遠不會依權限寫入資料。本倉測試使用虛構資料驗證升級保留、角色門禁與模擬借場流程；沒有存取或測試區方真實 Google Sheet／YMIS／Teamup／TTLock。先備份，合併與部署狀態以實際 GitHub／Apps Script 為準。
