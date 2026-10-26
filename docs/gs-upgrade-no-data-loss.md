# 區後台 GS：只追加升級（v4.31.0）

**完整程式：[`gs/Code.gs`](../gs/Code.gs)**；網站下載的 [`Code.gs.txt`](../public/downloads/Code.gs.txt) 及本版 [`Code-v4.31.0.gs`](../gs/releases/Code-v4.31.0.gs) 必須與它完全相同。本分支已整合 member-portal MAIN `9dbe876`（PR #22）保存的 v4.29.0 快照及管理端配套；原始快照保留不改，現行 v4.29.1 增加隱藏團及輸入驗證修補，公開 v1.3 格式不變。**尚未由區方部署至正式 Apps Script，亦未在真實 Apps Script／Sheet／外部服務上驗證。** 本地 mock 測試不能代替正式驗收；區方須先備份，按下列步驟更新原有專案。

## 先備份與安全遷移

1. 在原有 Google Sheet「檔案 → 建立副本」留還原點；在 Apps Script 記下原有程式版本及 Web App `/exec` 網址。有自行修改的 GS 應先私下備份及比對。不要把金鑰、個人資料或 Sheet 內容貼到 Git／對話。
2. `PORTAL_TOKEN_SECRET` 與 `PORTAL_MASTER_PROXY_SECRET` 只從 Apps Script **Script Properties** 讀取；新版 `setupSheets()` 會在缺少有效值時自動建立。前者簽署登入 token；後者只作 Vercel→Apps Script 機器橋接，需複製到 Vercel `PORTAL_{區碼}_MASTER_BRIDGE_SECRET`。sheep 密碼只存在 Vercel `PORTAL_{區碼}_MASTER_PASSWORD`，長度不設最低值；短密碼較易被猜中，且目前沒有跨 Vercel instance 的分散式限速。更新 env 並重新部署後，新的密碼用於之後登入；舊 sheep session 最多仍有效 12 小時。舊 `PORTAL_MASTER_PASSWORD` Script Property 不再讀取，`setupSheets()` 會將它移除。更換 token 簽署密鑰會令舊登入 token 及未使用重設連結失效。
3. 區方應按正式程序輪換曾披露的 YMIS 共用密碼，以及仍在使用共享初始密碼的 Users／Staff 帳戶。新版本拒絕 `1234`／`scout1234`。YMIS 憑據只可由合資格、啟用的 Users 帳戶在卡片獲授權時，經 POST 明確要求取得；`mustChangePassword=TRUE` 時拒絕。YMIS 另要求該欄明確為 `FALSE`，所以舊行空白也拒絕讀取；改密碼流程完成後會明確寫成 `FALSE`。YMIS 帳密只放在 Script Properties，不得放 Code.gs、Sheet Config 或前端。

## 更新原有後台（只新增，不修改原有格）

1. 把完整 `gs/Code.gs` 貼入**與原有 Sheet 綁定的同一個 Apps Script 專案**，替換原有 `Code.gs` 程式檔。保留自行維護的其他 Script 檔；不要新建 Sheet，不要執行 `setupCourseSheet()`／`resetAllPasswords()`。
2. 在 Apps Script 執行一次 **`setupSheets()`** 並授權。對**已存在的表**只追加缺少的表頭／欄、缺少的 Config／Cards／Perms 行及缺少的整張表；既有行、儲存格、權限矩陣、舊獎勵規則、Users 密碼及工作表保護／編輯者不會被升級程序清空或改寫。重跑不重複新增。v4.28.0 會在既有 `Units` 表尾追加 `meetingTime`、`instagramUrl`、`facebookUrl`、`websiteUrl`、`publicVisible` 五欄，不覆寫原旅團資料；亦新增公開 GET action `listDistrictTroops`。v4.29.1 另補建空白 `UnitSections` 表（10 欄），保留既有 Units／Visits 及所有現有 UnitSections 儲存格；不要自行清空或重建資料表。新增的 YMIS 卡及權限行屬新增資料；舊 `Perms` 格可能仍保留寬鬆舊值，但 YMIS 會另外受角色及 API 層級的硬門禁限制。
3. **不會在既有系統補建預設帳戶**，包括 Users 只有表頭、或部分舊系統缺 Users 表的情況；由有權管理員明確建立帳戶。只有整本全新空白試算表才按藍圖種初始帳戶，密碼為隨機且不顯示的臨時值，無法以公開共用密碼登入；管理員須另行重設並完成首次改密碼。
4. **API Key**：已有非空 `API_KEY_HASH` 原樣保留。舊 Config 缺少該行時，`setupSheets()` 只追加一行新雜湊並顯示新 Key 一次，須私下同步前端 `PORTAL_{區碼}_APIKEY` 及成員端 `MEMBER_{區碼}_APIKEY`。若該行已存在但 value 空白，setup 會保持空白並 fail-closed；須由區方明確使用「重新生成 API Key」功能並同步兩端環境變數。**不要把空 hash 當作可通過，也不要在未確認兩邊 Key 一致前使用。** setup 不會改動 Vercel 環境變數。
5. `rooms` 仍按原卡片及範圍規則提供唯讀日曆；管理平台卡片按角色限制可見，DC API 保留後端角色檢查。YMIS 允許 DC、DDC、各 ADC、STAFF 及 SYSADMIN 的有效 Users 帳戶查看；已驗證伺服器簽署的維護超管亦可使用。DL、LEADER、AL 及舊 Staff token 仍不可讀取。此為應用層/API 限制，不是 Google Sheet 閱讀隔離：有主試算表檢視權限的人仍可能直接讀取 `DCConfidential` 分頁。
6. 只有在備份、檢查 Script Properties、API Key 同步及測試帳戶準備完成後，才由區方編輯**原有** Web App deployment → New version → Deploy，以沿用 `/exec`。健康檢查應回傳 `version: "4.31.0"`、正確區碼、`apiKeySet: true` 及 `tokenSecretSet: true`。在此之前**不要部署**；本地測試不能替代 Apps Script 執行、Sheet ACL、Teamup、TTLock、郵件及正式 YMIS 驗證。

> 「只追加」只指自動升級函式 `setupSheets()`，不代表業務操作永遠不會依權限寫入資料。本倉測試使用虛構資料驗證升級保留、角色門禁與模擬借場流程；沒有存取或測試區方真實 Google Sheet／YMIS／Teamup／TTLock。先備份，合併與部署狀態以實際 GitHub／Apps Script 為準。

## v4.31.0 獨立權限及支部顯示

- 更新完整 GS → 執行 `setupSheets()` → 更新原有部署。新增 `troopDirectory` 卡及 Perms 行，只追加、不改舊 `visit` 權限儲存格；實際讀寫由即時固定政策決定。
- 「旅團資料」：所有有效管理端 Users 均可讀，ADC（含各支部 ADC）／DDC／DC／SYSADMIN 可寫。入口 `/troop-directory` 及 `getTroopDirectoryBoard` 不依賴 visit，亦不回傳探訪紀錄。可獨立開關兩張卡。
- 「旅團探訪」：全部有效登入者可新增；只有 DDC／DC／SYSADMIN 能按 id 修改或刪除任何既有紀錄，包括自己的。非 DDC 新增不能冒認其他幹部。停用／刪帳戶／降職會即時失去相應權限。
- 兩卡不受舊 Perms／個人 cards 範圍誤授權或誤封鎖；矩陣顯示固定政策、不可轉授。探訪的 view 仍有新增權，並非禁止登記。卡片 enabled 繼續獨立控制主控台入口。
- 名錄及探訪方塊只顯示 Units 真正有團數的支部，空白／0 不顯示。1745 內建及示範名單均只有童軍；不覆寫真實 Units 表。若現有 Sheet 填了錯誤團數，ADC+ 須核對後自行修正。
- 關閉支部的 UnitSections 歷史列保留在讀取及儲存 payload，但介面與公開名錄不顯示，重新開設後可取回資料；不刪舊紀錄、不批量重寫實際名單。
- 新前端要求探訪 `permissions` 及獨立名錄接口。**必須先更新 GS**；舊 GS 不會假裝支援新政策。`/visit?tab=units` 舊連結保留旅號／區碼導向獨立新頁。
- 維護超管、YMIS 點擊揭示 60 秒、個人排序及 v4.30.0 按旅鎖定儲存機制保持不變。這次沒有代替區方部署。

## v4.30.0 注意事項

- YMIS 內頁沿用歷史 `46197e7` 的已完成實作：按掣顯示 60 秒，另開官方網站自行登入。不把整份 GS 降版；保留 token 簽署、有效帳戶、密碼設定及 POST-only 安全檢查。
- `YMIS_VERIFY_USERNAME`／`YMIS_VERIFY_PASSWORD` 仍放 Script Properties，無須改名／搬到 Sheet。更新值後下一次按「顯示帳密」會直接讀取新值，不用改前端或通知每個人。
- 新旅團編輯器先檢查 `unitSectionsScopedSave: true`，只有部署 v4.30.0 後才開放按旅儲存，避免新前端配舊 GS 造成全表覆寫。
- 個人卡片位置只寫 localStorage（區碼＋帳戶），不寫 GS，不會改其他人的排列。
