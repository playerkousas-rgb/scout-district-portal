# 下一手 Agent 交接備忘（v4.8.1）

> 2026-09-11（第九輪）v4.17.0：**⭐ 訓練班新版流程（訓練班系統先行）**。用戶拍板：全部由
> [course repo（訓練班系統）](https://github.com/playerkousas-rgb/course)開始——CL 喺 App 開班
> （CourseFactory 即起真 GS）＋填晒文件 → 交「GS＋SCRIPT 網址」→ 區系統批核（**話事權喺區會**）。
> 改動：
> - **「🆕 新制直入」tab 改造成「⭐ 新版流程」指揮台**（`components/CourseOpsTab.tsx` 新寫；
>   原直入版搬去 `CourseSetupLegacy.tsx` 收埋做後備 tab，`CourseSetupTab.tsx` 變切換 wrapper；
>   外面「📋 開班登記（舊制 Sheet 先行）」原封不動）。五個子分頁：🔎批核／📢通告＋掛載／💰收款核對／🎓完成／🔗連結。
> - 後台 5 個新 action（全部 `canCourse`）：`pullCourseSummary`（經該班 /exec 拉 coursev5
>   `getCourseSummary`）、`saveCourseApproval`（cells＋「區會批准」tick＋「訓練班電郵」＋「區會修訂」行
>   一次過寫班 Sheet，首選 direct `openById`（gsUrl/sheetId）→ fallback `/exec saveCourseBatch`，
>   bump rev，同步 CourseLinks `approval/approvedAt/approvedBy/revisions`（JSON 近 30 筆））、
>   `setCoursePaymentCheck`（批量時間戳記 tick AS–AU；direct 首選→exec fallback；照 PaymentCheck.gs
>   語義唔 bump rev）、`sendCourseEmail`（kind=approved/mounted/payment/custom；**ReplyTo＝班信箱**）、
>   `getCourseOpsInfo`（CourseFactory 網址＋開班碼＋email alias 現狀）。
> - CourseLinks 加 5 欄：`gsUrl/approval/approvedAt/approvedBy/revisions`（setupSheets 自動補）；
>   Config 加 `COURSE_EMAIL_FROM`（選填 alias；留空＝部署帳戶地址＋ReplyTo 班信箱）、
>   `COURSE_FACTORY_URL`、`COURSE_FACTORY_CODE`。`getConfig` 回 `courseEmailFrom/courseFactoryUrl`。
> - 批核改核心資料＝`lib/course-setup.ts` 新 `setupCellsWithLabels`（每格有人類可讀 label）＋
>   `diffSetups`（原值→新值，俾 email／修訂紀錄「標亮」用）＋`parseRawToPaymentRows`
>   （表格回應 header 名對位做收款核對列）。`CourseSetupForm` 加 `hide` props（批核時鎖職員表＋時間表）。
> - **電郵架構定案（用戶提供實況）**：區 domain `skwscout.org.hk`，**每班開班信箱
>   `XXX@skwscout.org.hk`**；機房（班 GS/Script）＋教材 Drive 喺 `skw@hkirscout.org.hk`（唔可以
>   俾班職員掂）。所以通知 From=機房帳戶、**ReplyTo=班信箱**（CL 回覆去班信箱，機房 inbox 零班務信）；
>   班信箱管理＝Gmail 委派存取（核心）＋Google Group（全體），唔再轉寄 CL 個人 email。
>   全部寫晒喺 **`docs/course-email-drive-architecture.md`**（含 CourseFactory 建議改動清單：
>   `addEditor(OPS_EMAIL)` 自動 share 班 GS 俾區後台＋coursev5 `setParamLabel` action）。
> - 測試：新 `scripts/test-course-ops-gs.js`（15 項，vm emulator 覆蓋 5 個新 action＋direct/exec
>   兩條路＋「普通 saveCourseLink 唔會洗走 approval/revisions」）。全套（course-links 10／
>   demo-engine 22／news 38／visit 27／awards 27…）全綠；`tsc`＋`next build` 過。
> - ⚠️ 部署：換 `Code.gs` 4.17.0 → `setupSheets()` → 重新部署；Config 填 CourseFactory 網址＋開班碼。
>   未做（等用戶叫）：course repo 嗰邊嘅 CourseFactory share＋setParamLabel；deep link 報名
>   （用戶話唔使 patch——通告印成員系統 `/training` 公開報名表已夠，掛載列表係畀已用開系統嘅人）。
> - **更正（同日）：班信箱 `XXX@skwscout.org.hk` 唔係 Gmail**（區自己 domain 嘅寄存郵箱）——
>   Gmail 委派存取／同 domain Google Group 都行唔通。定案：ReplyTo 照樣有效（MailApp replyTo
>   唔使 Gmail）；班信箱管理＝webmail／IMAP＋共用密碼（同 App 同文化，課程完換密碼歸檔）＋
>   個人 Gmail send-as（SMTP 班信箱）做代班回覆；零成本升級位＝免費 Gmail POP3 拉信；
>   Workspace 每班一授權太貴唔建議。新增 Config `COURSE_EMAIL_FROM_MODE=course`
>   （寄件人直接用班信箱，須部署帳戶 Gmail send-as 驗證；未驗證自動 fallback）。
>   Sheet 唔使搬去班信箱：職員經 App（共用密碼）存取，GS 留機房歸檔。全部見
>   `docs/course-email-drive-architecture.md`（已重寫非 Gmail 版）。測試 16 項。
>

> 2026-09-09（第八輪）v4.16.0：**📋 訓練班通告全文欄**（用戶問：PDF 定網頁擇要用邊個＋系統格式同區通告唔同、有項目冇）。
> 答咗用戶：**2607.pdf 已驗證係「文字版」**（pdf-parse 抽到全文，fixture `scripts/notice-2607-a.txt` 就係咁嚟）；
> 網頁管理員嘅帖文係**刪減擇要**（冇名額／班領導人／服裝／備註／查詢），所以 **PDF 係正本**。改動：
> - `lib/notice-parse.ts`：`NoticeFields` 加 `subsidyNote`（費用段「原價…資助」句）／`badges[]`（標題拆章）／`section`（參加資格推支部）；
>   `parseNoticeHtml` 加 `tags[]`（/tag/ 標籤）；新 `mergePageExtras`（帖文頁補徽章／支部，唔覆蓋 PDF 料）；
>   擇要版讀唔到名額／班領導人／服裝／備註會出警告叫人貼 PDF。
> - `app/api/notice/route.ts`：網頁→PDF 路徑同純網頁路徑都行 `mergePageExtras`。
> - `CourseLink`（types/GS/demo）加 5 欄：**`leader`／`uniform`／`remarks`／`signupText`／`feeNote`**；
>   GS `courseLinkPublic_`＋`saveCourseLink_`＋藍圖欄（`setupSheets()` 舊表自動補喺表尾）。
> - `/training`：「由通告網址讀取」填晒晒（subsidyNote／badges→badgeName／section／leader／uniform／remarks／signupText／feeNote），
>   收埋區加 5 個欄位輸入；「由訓練班 Sheet 讀取」都會由 Print_通告（`CourseProfileCircular`）填同一批欄。
> - member-portal：**`docs/member-portal-course-fields.patch`**（取代舊 `member-portal-fps-qr.patch`，一份過包含 FPS QR＋通告全文欄；
>   對 HEAD `7c5f013` `git apply` 得＋`tsc` 過＋`check-member-alignment.js` 27 欄完全對齊）。proxy 白名單＋型別＋mapCourse＋`/training` 顯示。
> - 多班同掛證實冇問題：`scripts/test-course-links-gs.js`（10 項）——三班兩 Script，`submitCourseReg_` 按 courseId 對號轉發（apiKey/folder 各自歸屬），filled 各自+1，滿額/過截止/停用被擋。
> - 測試：notice-parse 13→**19**、training-wiring 10→**12**、新 course-links-gs **10**；全套（含 circulars/upgrade/news/demo 等）全綠；`tsc`＋`next build` 過。
> - ⚠️ 部署：換 `Code.gs` 4.16.0 → `setupSheets()`（補欄唔清空）→ 重新部署；成員端套 patch 先見到新欄（唔套唔會壞）。
>
> 2026-09-08（第七輪）v4.7.0：**🎖 獎勵提名**（用戶指定「一站式，全部喺 app 入面睇同改」）。
> 後台加 `Awards`（一人一行，每個獎一欄＝獲獎年份，值可以係 `2015` / `2015?` / `無`）同 `AwardTypes`（年期規則）兩張表，
> action：`getAwardsBoard`（一 call 攞晒名冊＋規則）／`saveAwardMember`／`deleteAwardMember`／`importAwardMembers`（merge／replace）／`saveAwardTypes`；
> 權限卡片 `awards` = edit。**加新獎項會由 `ensureAwardColumns_` 自動喺 Awards 表補欄**，唔會清舊資料。
> 前端 `app/awards/page.tsx` 四個分頁（提名建議／名冊／年期設定／匯入），推算邏輯全部喺純函數 `lib/awards.ts`（好測）。
> **v4.7.1（同日修訂，用戶親口更正年期）**：
> 入門級唔跟上一級，而係跟**服務開始年份**——所以 `Awards` 表加咗 `serviceStart` 欄（`awardServiceStart_` 會由 `2004`／`2004-01-15`／Date／`86th since 2004/01/15` 抽 4 位年份）。
> 正確年期：服務 **7 年** → GSA → **5** → DSA → **7** → DSM → **5** → DSC → 銅獅（**冇固定年期**，`minYears` 留空＝有上一級就列出並標 `noRule`）；LSM 服務 **15 年**，其後每 **10** 年一星。
> `eligibilityFor` 三分支：① 有 `prevCode` ② 冇 prevCode 但有 minYears → `serviceStart + minYears`（`fromService: true`；冇服務年份就略過，靠 `missingServiceStart()` 喺提名頁提示）③ 兩樣都冇 → 唔推算。
> `getAwardsBoard` 多回 `defaults`（＝`awardTypeSeed_()`），前端「⚙️ 年期設定 → ↺ 套用建議年期」用嚟一鍵還原。
> **v4.7.2（同日再修）**：用戶要求「一撳入成人獎勵就要提示同標亮邊個可以被提名」。
> 前端加 `AlertBanner`（用 `upcomingRounds()` 搵返每個提名期死線仲未過嗰屆 → `nominationBoard` 數人 → 🔥 chips），
> 名冊用 `readyByMember()` 標亮成行（`.aw-hot-row`）＋「只睇夠期可提名」篩選＋標亮年份選擇器＋CSV 多一欄。
> seed 再改：**LSM 第一個 minYears 留空**（用戶話第一個佢自己入），LSM1–4 維持 10；HAB／FIVE 亦留空免雜訊。
> **v4.7.3**：提名建議每行加剔格 →「✅ 登記 N 項獲獎」→ 按人合併 `saveAwardMember({id,name,awards:{CODE:year}})`。
> 配合改咗 `awardWriteFields_(sh,row,a,types,isNew)`：**只寫 payload 有嘅欄**（isNew 例外，寫齊做預設），
> 所以局部更新唔會清走 troop／position／serviceStart／note。`importAwardMembers_` 兩個 call site 已跟住傳 isNew。
> **v4.8.1 🏕 旅團探訪**（用戶自己諗掂點做）：幹部撳一下旅團格仔就登記，DC 揀日期範圍出報告。
> 後台加 `Units`（旅團名單，seed = 港島地域官網筲箕灣區 28 旅，連五個支部團數）同 `Visits`（一次探訪一行，有 `section` 欄）；
> action `getVisitBoard(token, from, to)`／`saveVisit`／`deleteVisit`／`saveUnits`（會同步 `Config TROOP_LIST`）；卡片 `visit` = edit。
> 角色 → 預設支部：`VISIT_ROLE_SECTION`（ADC_GH/ADC_CUBS/ADC_SCOUT），前端仲會用 localStorage `skw.visit.section` 記住揀擇。
> 純邏輯喺 `lib/visits.ts`（`troopStats`／`coverage`／`visitorStats`／`rangePresets`／`parseUnitPaste`）。
> ⚠️ vm 測試提醒：`v instanceof Date` 跨 realm 會 false，所以 `visitDate_` 改用 `Object.prototype.toString.call(v)`。
> 🧪 本機預覽用 `node scripts/mock-gs-server.js`（in-repo，sandbox 重置都唔會冇；apiKey 固定 `dev`，登入 sheep/0728）。
> 🛑 **委任系統／旅團管理系統暫時 hold**：用戶話委任資料難搞；旅團管理佢自己另有一套系統，日後先接，仲要處理私隱。
> ⏭ **用戶未來想要**：全區領袖「委任年期 list」——有新委任就登記入去，令「無 → GSA（服務滿 7 年）」呢級真正計得準。
> 而家係靠 `Awards.serviceStart` 逐個人填；下一步可以考慮同 Staff／成員系統委任資料對接，或者做一張 `Appointments` 表。
> 用戶自己喺「年期設定」改得，所以千祈唔好 hardcode 返落程式。
> 提名截止（總會 ACR 20/2024）：創辦人紀念日 區部 10/31 → 總會 11/30（頒獎年前一年）；童軍獎勵（大會操）區部 4/30 → 總會 5/31（同年）。
> 縮寫對照：CCM 香港總監嘉許（黃笛繩）／CCH 香港總監高級嘉許／HAB 民政及青年事務局局長嘉許（前稱民政事務局）／THANKS 感謝狀（DA2）／FIVE・TEN 五年十年長期服務獎狀（會務委員）。
> 🔒 **用戶份真實獎勵 Excel（100+ 真名）冇 commit 落 repo，亦唔應該 commit**；要試就用 `/tmp/mockgs/server.js` 入面嘅假名 seed。
> 順手補咗 `app/visit/page.tsx`（之前主控台「旅團探訪」卡撳落去 404）。測試：`node scripts/test-awards-gs.js`（21）＋ `node --experimental-strip-types scripts/test-awards-logic.ts`（24）。
>
> 2026-09-08（第六輪）v4.6.2：**欄位對齊成員系統**。member-portal 上咗自己嗰版消息功能（`bb44fe6`：`AnnouncementBanner` + Web Push），
> 佢個 proxy `publicAnnouncement()` 白名單讀 `{ id, title, content, date, pinned, level }` 而且 `level` 只認 `info|warning|important`
> —— 我哋以前回 `body` + `warn/urgent`，結果**內容空白兼全部藍色，兩邊都唔會報錯**。修正：`newsPublic_` 多回 `content`（＝`body`）、
> `NEWS_LEVELS` 改 `info|warning|important` 並用 `NEWS_LEVEL_ALIAS` 自動對應舊 `warn|urgent`（Sheet 舊資料唔使改）、
> `saveAnnouncement_` 接受 `content` 別名、`courseLinkPublic_` 補回 `active`。前端 `NewsLevel` 同 `/news` 選項改新詞彙，CSS 保留舊 class 做別名。
> **`scripts/check-member-alignment.js` 加咗第 [4] 欄位名對齊同第 [5] level 值域檢查**（就係為咗自動捉呢類「唔報錯但顯示錯」問題）——
> 以後成員系統一更新，跑呢個 script 就夠。member-portal 嘅 Web Push 用 Supabase + VAPID，**唔經 GS**，後台唔使加嘢。
> 已刪 `docs/member-portal-news-banner.patch`（成員端已有自己實作，個 patch 會誤導；要睇就翻 git 歷史）。測試 32 → **35 項**。
>
> 2026-09-08（第五輪）v4.6.1：用戶定案 **`gs/Code.gs` 係兩邊唯一後台**（member-portal 由另一個 agent 負責，只讀＋提交，唔會養第二份 GS；首頁通告圖書館係外接系統，同 Sheet／GS 無關）。
> 對數發現唯一缺口 `submitStockBatchRequest`（member-portal proxy 一直有叫，之前 fallback 逐件 POST）→ 已補：全部夠貨先寫、同款合併數量、共用 `batchRef`、只寄一封通知；
> `StockRequests` 加 `batchRef` 欄；新 `setStockBatchStatus`（batch 批核，庫存逐行加減、只寄一封）；重構出 `resolveStockLines_` / `writeStockRow_` / `applyStockStatusRow_`（單件同批次共用，庫存永遠只加減一次）。
> `/stock-regs` 前端按 `batchRef` 分組顯示「🧾 一張申請 · N 款」＋整批掣。測試 `node scripts/test-news-gs.js` 由 19 → **32 項**。
> ⚠️ 加新 action 之後記得同步：`docs/member-gs-handshake.md`（合約）＋ health check `version`（而家 4.6.1）＋ README／updates 頁。
>
> 2026-09-08（第四輪）v4.6.0：**消息發佈 News**——管理系統 `/news` 發 → 成員系統 member-portal 首頁置頂顯示（方案 2「一直置頂」，pull on open，冇推送）。
> 後台 `gs/Code.gs` 4.6.0：新 `News` 表（`title/body/date/pinned/level/link/linkLabel/notify/active/expiresAt/publishedAt/publishedBy/updatedAt`）、
> 公開 `listAnnouncements`（參數 `pinnedOnly`／`limit`≤50／`since`；已下架、`expiresAt` 過期、`date` 喺將來嘅一律唔回；公開版剝走 `active`／`publishedBy`）、
> 登入 `getAnnouncements`（加 `expired`／`scheduled`／`live`）、`saveAnnouncement`／`deleteAnnouncement`／`setAnnouncementPinned`／`setAnnouncementActive`。
> 權限用**新 helper `requireCardEdit_(token, cardId)`**（直接讀 Perms 矩陣，唔再加 `canXxx` 欄；level 0 超管永遠可）——之後新卡片照跟呢個做法。
> 前端：卡片 `news`（order 4，opsEdit）、`app/news/page.tsx`（發佈／編輯／置頂／下架／刪除＋成員端預覽）、`components/NewsBanner.tsx`（主控台頂部，同成員睇到同一份資料）、`lib/types.ts` `Announcement`、`lib/api.ts` 6 個 wrapper、`app/globals.css` `.news-*`。
> 測試：`node scripts/test-news-gs.js`（vm stub Apps Script，19 項，唔使開 GAS）。本機預覽：`/tmp/mockgs/server.js`（載入真 Code.gs + 記憶體 Sheet + seed 3 則消息）＋ `PORTAL_DEV_APIBASE=http://127.0.0.1:8788/exec npx next dev`，登入 `sheep` / `0728`（MASTER）。
> member-portal 嗰邊後來自己實作咗（`bb44fe6`），原本嘅 patch 已刪（見第六輪）。
>
> 2026-09-07（第三輪）v4.5.0：**外部資料全部由 Vercel `app/api/external/route.ts` 代抓**（sandbox 對外連線被封，只能用 fixture 測；`PORTAL_DEV_EXTERNAL_BASE` 指向 mock `/upstream?u=`）。解析器 `lib/externalParsers.ts`（職員表／總監架構／諮議會／各署／預算 CSV，純函數）、`lib/ics.ts`（ICS + RRULE 展開，香港時間）、`lib/roomsDirectory.ts`（11 間房日曆 ID、打通關係 `combo`）、`lib/orgDirectory.ts`（架構靜態備援）、`lib/externalSources.ts`（來源網址）。頁面：`/budget`（`api.extBudget`，Config `BUDGET_SHEET_URL` 覆蓋 Sheet）、`/rooms`（逐間房逐日／今日總覽／原版 iframe）、`/orgchart`（地域＋總會）、`/contacts` 港島地域只剩 `staff` 組並即時同步，`rc/dc/hq/ahq` 組已刪（搬去 orgchart 備援）。後台 Code.gs 4.5.0：Cards +`rooms`／`orgchart`（ALL_VIEW）、`budget` done、Config `BUDGET_SHEET_URL`、`getConfig` 回 `budgetSheetUrl`；**刪 `annual` 週年會議文件卡**（`removeIds` 內，`app/annual-docs` 已刪；刪 route 後記得 `rm -rf .next/types/app/annual-docs` 先過 tsc）。mock：`/tmp/mockgs/gas-emu.js`（Apps Script 模擬器）+ `server.js`（GS `/exec` + 上游 fixture `/upstream`）+ `test45.js`（33 assertions，包括 v4.4.0→4.5.0 升級路徑）——sandbox 重置會冇咗，要用時照 README 描述重寫。
> ⚠️ 真實網頁解析未經真機驗證（sandbox 出唔到網）：部署後請開 `/api/external?kind=regionStaff`／`regionOrg`／`hksaCouncil`／`hksaDepts`／`budget`／`rooms` 逐個睇 `ok:true`；scout.org.hk 對非瀏覽器 UA 可能 403（route 已帶 Chrome UA），如仍失敗前端會自動用內建備援並標「⚪ 官方網頁暫時讀唔到」。
>
> 2026-09-07（第二輪）v4.4.0：天氣決策（`lib/weatherDecision.ts` + `components/WeatherDecisionPanel.tsx` + `components/WeatherDecisionBanner.tsx`，天文台 warnsum 由瀏覽器直接拉；sandbox 無法對外連線，只能 mock JSON 測邏輯）、聯結簿三分頁（`lib/contactsDirectory.ts`；旅團資料待用戶提供，格式見 `TroopRow`）、刪除 meeting 卡（`patchCardRows_` 移除舊行）、`components/BackLink.tsx`（每頁頂＋`BackBar` 頁尾）、帳戶層級 `level`（`lib/levels.ts`；後台 `levelOfRole_`/`levelOfUser_`）、`PRESET_USERS` 密碼 1234 + `mustChangePassword`、`requestPasswordReset`/`resetPassword`（token = base64(reset|email|exp|sig)，sig 含舊 passwordHash → 單次有效）、`/delegate` 授權／收回（`getDelegation`/`delegatePerms`/`revokePerms` 寫 Perms 表）、隱藏卡片只有 level 0 見（`getCards_`）。mock 後台 `/tmp/mockgs/server.js` seed 登入改用 `dc@skwscout.org.hk` / `1234`；emulator 測試 `/tmp/gstest/run44.js`（56 assertions）。
>
> 2026-09-07 更新：v4.3.0 加咗「意外／應變」三分頁（`app/incident/page.tsx`、`lib/incidentGuide.ts`、`lib/incidentPrint.ts`）、訓練班每班收費 FPS QR（`components/CourseFpsBlock.tsx`、`lib/fps.ts`）、主控台完成標示（藍框 done／虛線 todo）、GS `IncidentReports` 表 + 4 個 action、CourseLinks 6 個 FPS 欄。
> member-portal（`playerkousas-rgb/member-portal`）**而家讀得到**；佢個 proxy 有公開欄位白名單，要顯示課程 QR 就要照 `docs/member-gs-handshake.md` 改嗰 4 個檔。
> 意外報告草稿只存 localStorage（key `portal_incident_draft_{區碼}`），按「確定提交」先 POST，唔好改做逐鍵 autosave。列印格式以總會 ACC-RPT (2019/07) 為準，唔好照抄 event repo 嘅 AR-1 mock。
> 舊卡片 `incident` 由 todo 轉 done：`setupSheets()` 內 `patchCardRows_` 只改「仍係舊預設值」嘅行；如用家改過描述就要自己喺 Cards 表改 `category=done`。

> 日期：2026-08-25  
> 用家語言：香港中文  
> 狀態：**呢輪功能已合併 main**。用家會自己下載 GS、貼去 Apps Script、執行 `setupSheets()` 測試。**測試完先同新 agent 研究下一步。**  
> 本檔唔寫、唔問、唔貼任何 Secret（Client Secret、鎖密碼、Lock 密碼、API Key 明文）。

---

## 用家而家要做（測試）

1. 下載 `public/downloads/Code.gs.txt`（= `gs/Code.gs` v4.2.3）。
2. Apps Script **全部覆蓋貼上** → 儲存。
3. Sheet 選單「🧭 區統一後台」→「🧱 補建缺失表（不清空資料）」。
4. **新部署／更新現有 Web App**（執行身分：我自己；存取：任何人）。`/exec` 唔好換就得。
5. 健康檢查（免 Key）：  
   `{apiBase}?action=getHealthCheck`  
   要見到 `"version":"4.2.3"`。
6. DDC 或以上登入管理系統，睇主控台 HERO 走馬燈 + `/venue-regs` 四掣。

`setupSheets()` **只補唔洗**：已有表唔 `clear()`、已有 Config key 唔覆寫 value、`API_KEY_HASH` 已有就唔再生成。

---

## 已完成（已喺 main）

| 項目 | 說明 |
|---|---|
| GS 4.2.3 | `getPendingInbox`、`updateVenueBooking`、一鍵 `approveVenueBooking` |
| setup 安全 | 補缺失表／欄／Config 列；已填格保留 |
| Sciener 別名 | Config 主用 `SCIENER_*`，兼容 `ttlock*` |
| API 主機 | `open.sciener.com` 自動改 `https://api.sciener.com` |
| 密碼模式 | `PWD_MODE=phone4`（電話頭 4 位）。**唔好改做強制 6 位** |
| Lock ID | **唔係欄名**。Config 一列 `SCIENER_LOCK_ID`（舊名 `ttlockLockId`），或場地 `scienerLockId` |
| 開戶 | 只有 DDC+（DC / SYSADMIN / DDC_ADMIN / DDC_TRAINING）；只准開 DL / LEADER / AL |
| 前端 DDC+ | `/venue-regs`：⚡一鍵批准、＋借用、✎編輯、✕拒絕；鎖列表可讀可填 |
| 非 DDC 有 venueReg | ✅確認（唔設鎖）+ 編輯 + 拒絕 |
| 走馬燈 | 登入後主控台 HERO 大紅黃走馬燈；舊 GS 會 fallback `getVenueBookings` / `getStockRequests` |
| 借物資批核 | `/stock-regs` 已打通（批准先扣庫存） |
| 借場填表 | `submitVenueRequest` 寫 Sheet + Teamup「申請中」 |

**分支／PR：** 工作喺 `arena/01a01678-scout-district-portal`，PR #7 合併入 `main`。  
**SKW apiBase：** `lib/district.ts` 現有 `/exec`。  
**member-portal：** `https://github.com/playerkousas-rgb/member-portal.git`（2026-09-07 已可讀，HEAD `149f910`）。

---

## 未完成 / 測試後先做（優先序）

### 1. Sciener／TTLock 真接通（用家測完先搞）

前端一鍵批准已接 `approveVenueBooking`。鎖未通會 **fallback 密碼**，單仍然批得。

下一手要同用家對：

- Config 已填：`SCIENER_CLIENT_ID` / `SCIENER_USERNAME` / `SCIENER_LOCK_ID` / `PWD_MODE=phone4`
- `SCIENER_API_BASE` 必須係 **`https://api.sciener.com`**，唔好留 `open.sciener.com`（網站）
- Gateway 用家話一定有；審批頁「讀取鎖列表」可核對 `hasGateway`
- **唔好問、唔好叫用家貼** Client Secret、管鎖密碼
- 一鍵失敗常見原因：未更新 Web App 部署、Lock ID 空、OAuth 失敗、鎖離線

### 2. member-portal 聯調

- member-portal repo 已可讀；活動知會、借場、借物資欄名已核對一致
- 合約見 `docs/member-gs-handshake.md`（v4.3.0：含訓練班 FPS QR 白名單改法）
- 測：成員填表 → Teamup 申請中 → 管理端走馬燈 → 一鍵／拒絕

### 3. 編輯申請後未同步 Teamup

`updateVenueBooking_` 只改 Sheet，**唔改 Teamup 事件時間／標題**。職員改完時段，日曆可能仲係舊時間。

### 4. 職員「借用」未自動一鍵批

`＋ 借用` 而家係 `submitVenueRequest` → **pending**。用家若想「職員代借即批＋出密碼」，要加第二步或新 action。

### 5. 走馬燈未喺其他頁出現

淨係主控台 HERO。`DistrictShell` 未掛。若用家想每個內頁都見到，再加。

### 6. 物資頁未做走馬燈／職員代借

`/stock-regs` 仍係舊批准／拒絕／歸還。物資未有「代借／編輯申請」。

### 7. 文件過時位

- `docs/keys-checklist.md` 仍寫 TTLock 舊欄名為主（GS 已兼容，但新標準係 `SCIENER_*`）
- `docs/member-gs-handshake.md` 舊句「批准掣唔會行 approveVenueBooking」**已唔準**（4.2.3 已行）
- `app/updates/page.tsx` 已有 4.2.3 說明

### 8. 其他已知限制

| 項目 | 說明 |
|---|---|
| `savePerms_` | 儲存權限矩陣仍 `clear()` Perms 表（管理員手動儲存先會，唔係 setup） |
| `TOKEN_SECRET` / `MASTER_*` | GS 頂部示範值，部署前應改；**唔好寫入 chat** |
| Rebase | 複製 `Code.gs.txt` 一定要喺 `Code.gs` **無衝突標記之後** `cp` |
| 密碼 | 用家堅持 **phone4** 得；唔好改 random 6 位做預設 |
| 開戶角色 | 唔好開放 DC / DDC / ADC / STAFF 批量開戶 |

---

## 下一手唔好做

- **唔好** `clear()` 有資料嘅 Sheet
- **唔好** 覆寫已填 Config value
- **唔好** 問／貼 Secret
- **唔好** 改 `PWD_MODE` 預設離開 `phone4`
- **唔好** 當 `open.sciener.com` 係 API
- **唔好** 當 Lock ID 係表頭欄；佢係 Config **一列 key**
- Arena session 若綁死某條 `arena/…` 分支：只推嗰條，用 PR 入 main，唔好本地 checkout 第條分支做正工

---

## 建議測試清單（用家測 GS）

- [ ] `getHealthCheck` → `4.2.3`
- [ ] 重跑 setup 後，自己填過嘅 Config／申請／Users **仲喺度**
- [ ] DDC+ 登入 → HERO 有待批就出現大紅走馬燈
- [ ] `/venue-regs`：一鍵批准、借用、編輯、拒絕
- [ ] 一鍵時鎖未通：單已批 + 有 `warn` + 仍有密碼
- [ ] 拒絕：狀態 rejected + 申請人有電郵（有填 email 先）
- [ ] 「讀取鎖列表」：有鎖就出 Lock ID；無帳密就顯示錯誤，唔崩潰
- [ ] `/stock-regs` 批准／拒絕仍然正常

測完先決定：鎖聯調、Teamup 改期同步、職員代借即批、定其他。
