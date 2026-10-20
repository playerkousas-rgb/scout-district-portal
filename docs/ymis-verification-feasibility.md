# YMIS 會員核實卡：人工登入方案及部署指引（2026-10-20）

## 最新決定

- **不做 YMIS SSO 或自動查會員**。DC／DDC／ADC（總監級）及 STAFF（區職員）登入區系統後，可開「🪪 YMIS 會員核實」卡，另開 [YMIS 官方登入頁](https://ymis.scout.org.hk/#/Login)，由使用者自行輸入區方獲發的核實帳戶資料。
- 區系統卡片頁有「顯示帳密（60 秒）」掣：使用者按掣後才從 Apps Script *Script Properties* 讀取，60 秒後在頁面上隱藏；換區／換帳戶／離頁亦清除頁面狀態。示範模式只顯示明確標示、無法登入的虛構字串。
- 區方說明此帳戶供會員及旅團隸屬核實、可跨區搜尋；不等同一般旅團個人帳戶。[官方 FAQ](https://service.scouting.org.hk/ymis/faq_en.html) 的一般權限說明不能取代此帳戶的實際授權。
- **沒有免二次登入**：區系統 token 不會成為 YMIS session；本功能不讀取或同步 YMIS 的會員資料。

## 權限與安全界線

- `ymis` 預設 `Perms` 只給 DC、DDC_ADMIN、DDC_TRAINING、各 ADC、STAFF `view`；**SYSADMIN（包括維護帳號）、DL、LEADER、AL 均不可見或取得憑據**。STAFF 也須用 `Users` 表中的區系統帳戶**從區系統登入**；由舊 `/staff` 登入簽發的 token 即使與 Users 同電郵也不可取 YMIS 帳密。後台還核對有效 token、帳戶仍啟用、目前角色、卡片啟用狀態、個別 `cards` 範圍及 `Users.mustChangePassword` 已明確為 `FALSE`（舊行空白也拒絕）。即使權限矩陣誤授予其他角色，後台也拒絕，儲存矩陣時亦會移除無效授權。
- 登入及重設密碼 token 的簽署密鑰 `PORTAL_TOKEN_SECRET` **必須**由區方以每區獨立、至少 32 字元的高熵值放入 Apps Script *Script Properties*。未設定時區系統拒絕發出／核實 token，而非退回原始碼中的公開預設值。維護帳號只接受私下設定的 `PORTAL_MASTER_PASSWORD`（至少 12 字元）；不設定就不能使用維護登入，公開舊示範密碼已失效。切換 token 密鑰會令現有登入及尚未使用的重設連結失效，須安排重新登入。
- YMIS 帳密**不**放入程式碼、Git、前端 bundle、Google Sheet `Config`、URL 或示範種子。Apps Script 只在獲授權者明確呼叫 `POST getYmisCredentials` 時讀取；GET 不能取，代理回應標示 `Cache-Control: private, no-store`。頁面只在目前分頁記憶體保留帳密，不寫 localStorage／sessionStorage。*Script Properties 仍可被該 Apps Script 專案的編輯者查閱，請管控專案編輯權。*
- **剩餘風險**：只要獲授權的人能看到／輸入共用密碼，就能抄錄、截圖，或在瀏覽器開發工具查看該次回應；60 秒後隱藏無法收回已複製資料。離任、改職或疑似洩漏時須輪換 YMIS 密碼及撤除區系統權限；只在可信裝置上使用。
- 對話曾披露的憑據**沒有用於登入測試、沒有寫入程式或回顯**。上線前應由區方按正式程序先更換已披露密碼；不要在聊天中重傳。

## 正式啟用（區方管理員自行操作）

1. 安排切換時間，先在 YMIS 按總會程序**輪換**曾披露的共用密碼；核對帳戶核實用途的授權。請勿將新帳密貼到聊天或原始碼。
2. 在區方的 Apps Script 專案 → **Project Settings／專案設定 → Script Properties／指令碼屬性**設定 `PORTAL_TOKEN_SECRET`：每區獨立、隨機、至少 32 字元；只由可信的專案編輯者保存。若需要維護帳號，另設 `PORTAL_MASTER_PASSWORD`（長而獨立，至少 12 字元）；否則維護登入保持停用。原始碼內 `MASTER_EMAIL` 只係帳號名稱，區方可私下更改；**絕不可把上述私密值加入 Git、Config、Vercel 公開環境變數或對話**。
3. 先備份原有 Google Sheet 及 Apps Script 程式版本，將新 `gs/Code.gs` 貼入**原有**區方專案，再執行 `setupSheets()`（補缺欄／卡片，按舊預設調整權限；保留所有現有工作表和業務記錄，舊內建卡片只隱藏不刪除）。到 **Deploy → Manage deployments／管理部署 → 編輯原有 Web App → 新版本 → 部署**，不要建立新 Sheet 或換 `/exec` 網址。檢查公開 `getHealthCheck` 回傳 `version: "4.19.0"`，現有區方 API Key 和前端 `PORTAL_{區碼}_APIKEY` 仍配對。切換 `PORTAL_TOKEN_SECRET` 會令舊 session／重設連結失效，請通知職員重新登入。詳細順序見[無損更新步驟](gs-upgrade-no-data-loss.md)。
4. **先**更換原本公開或初始的區系統帳戶密碼（包括預設 DC／DDC／ADC／STAFF 和任何舊 Staff 登入），確認 `Users.mustChangePassword` 經改密碼流程明確寫成 `FALSE`（舊資料留空會拒絕），停用不再使用的帳戶，再設定 YMIS 帳密。預設初始密碼絕不適合保護共用核實帳戶。
5. 在同一專案 Script Properties 新增 `YMIS_VERIFY_USERNAME`（區方核實帳戶）和 `YMIS_VERIFY_PASSWORD`（**輪換後**的新密碼）。如未設齊，頁面會提示「後台尚未設定」，不會回傳空白登入資料。部署新版前端。
6. 用**測試人員帳戶**驗證：DC／DDC／ADC／STAFF 能看卡並按掣；SYSADMIN、DL／LEADER／AL、已停用或仍需改初始密碼的帳戶均不能取得帳密；在官方網站由區方自行驗證新 YMIS 帳密可登入。**本工作環境沒有用真實帳密登入 YMIS，亦未替區方部署。**

## 日後如要「登入一次直接核實」

須由總會提供或批准官方 SSO／唯讀查核介面及相應私隱／稽核規格。本卡只處理**人工登入**，不逆向未公開端點、不自動化登入或繞過 MFA；也可向[香港童軍總會資訊科技部](https://www.scout.org.hk/en/scout-units/association-headquarters/index.html?id=3)查詢官方整合選項。
