# 📬 訓練班電郵與檔案架構（v4.17.0 新版流程）

> 實況（用戶提供）：區有自己 domain `skwscout.org.hk`，**每班開一個班信箱 `XXX@skwscout.org.hk`
> ——但呢啲信箱唔係 Gmail**（區自己嘅寄存郵箱）。訓練班 GS／Script 機房＋教材 Drive 喺
> `skw@hkirscout.org.hk`（區大資料庫，唔方便俾班職員掂）；區管理系統後台係 `skddbs@gmail.com`。
>
> **核心原則：機房信箱零班務信；班信箱係班嘅唯一對外窗口；班職員唔會掂到機房信箱／機房帳戶。**
>
> ⚠️ 「如果班信箱係 Gmail 就連 Sheet 都放喺度一次過解決」——唔得，但**其實唔使**：
> 職員掂班資料係經**訓練班 App（每班共用密碼）**，唔使 Google 帳戶；GS 正本留喺機房帳戶歸檔。
> 班信箱唯一要做嘅嘢＝**收信＋可以代班回信**，下面第三節有非 Gmail 嘅做法。

---

## 一、三個帳戶嘅角色分工

| 帳戶 | 角色 | 收咩信 | 班職員會唔會掂 |
|---|---|---|---|
| `skw@hkirscout.org.hk` | **機房**：CourseFactory＋逐班 GS／Script＋教材 Drive folder（share 俾 CL） | ❌ 零班務信（只係「寄件人地址」顯示佢） | ❌ 永遠唔會 |
| `XXX@skwscout.org.hk`（每班一個，非 Gmail） | **班信箱**：通告查詢行印嘅地址＋系統通知嘅 ReplyTo | ✅ 全部班務信（查詢＋CL 回覆） | ✅ webmail／IMAP 收發 |
| `skddbs@gmail.com` | **區管理系統後台**（開班登記＋批核指揮台＋寄通知） | 系統通知寄出（借場嗰啲照舊） | ❌ |

## 二、郵件流向（程式已寫死）

```
系統通知（批准 ✔／掛載 📢／收款核對 💰）
  From:    部署帳戶（skddbs@gmail.com）— 寄件人顯示名「筲箕灣區·班名」
  ReplyTo: XXX@skwscout.org.hk        ← 班信箱（批核分頁「訓練班電郵」格）
  → CL／家長撳「回覆」去班信箱，機房 inbox 一封都唔會多
  → ★ ReplyTo 對任何有效 email 都生效，班信箱唔使係 Gmail（Apps Script MailApp 無需驗證）

查詢信（家長／其他區人士）
  → 通告印 XXX@skwscout.org.hk → 直入班信箱
```

**寄件人（From）兩個可選升級**（Config，留空＝上圖預設）：

| Config | 效果 | 前提 |
|---|---|---|
| `COURSE_EMAIL_FROM` | 所有訓練班通知用同一個 alias 寄（例 `courses@skwscout.org.hk`） | 喺部署帳戶 Gmail「用這個地址傳送郵件」驗證一次 |
| `COURSE_EMAIL_FROM_MODE` = `course` | **寄件人直接用該班班信箱**（連 ReplyTo 都唔使睇——整封郵件都係「班」出） | 每班一次：部署帳戶 Gmail 加 send-as＋班信箱 SMTP；未驗證會自動 fallback 返預設＋出 warning |

## 三、班信箱管理（非 Gmail 版）——點俾班職員用

> 建議組合：**A 做核心＋B 做通知**。C 係零成本升級位；D 係日後真想「一戶過」嘅代價表。

### 點樣 5 分鐘查到 A／B 做唔做到（問寄存商或自己試）

1. **Webmail**：瀏覽器開 `webmail.skwscout.org.hk`（cPanel 寄存通常係呢個；唔係就問寄存商網址）→ 登入班信箱見到收件匣＝有 webmail（A 成立）。
2. **IMAP／SMTP**：手機郵件 App 加戶口——收件伺服器 IMAP `mail.skwscout.org.hk`（或 imap.）port 993 SSL；SMTP `mail.skwscout.org.hk` port 465／587——收發到＝A 成立。
3. **轉寄**：寄存控制台（cPanel → Email → Forwarders／電郵轉寄）見到轉寄設定＝B 成立。
4. 懶得試就直接問寄存商一句：「`@skwscout.org.hk` 嘅信箱支唔支援 (1) webmail (2) IMAP/POP3 (3) 自動轉寄（保留副本）？」——三樣通常最少有兩樣。
5. 若果**連 webmail 都冇**（淨係轉寄戶口）：A 冇、B 就係佢全部功能 → 直接行 C。

### A. Webmail／IMAP＋共用密碼（核心，建議）
- 職員用寄存商嘅 **webmail**（例 `webmail.skwscout.org.hk`）或手機／電腦郵件 App（**IMAP＋SMTP**）登入班信箱。
- 密碼班職員內部分享——**同訓練班 App「每班共用密碼」完全同一套文化**，冇新增負擔。
- 收發都係班地址（From 天然係班信箱）；信永久留喺班信箱。
- **交接＝換密碼**：課程完換一次密碼，個信箱留低做嗰班完整 email 檔案（同 Drive 歸檔同一道理）。

### B. 轉寄副本（通知用，可選）
- 寄存商（cPanel 類）通常有「**轉寄並保留副本**」：班信箱照收，副本推去 CL／職員個人信箱——純粹當通知鐘。
- 要代班回覆先入 webmail；或者行 B+：喺自己 Gmail「設定→帳戶→**用這個地址傳送郵件**」加班地址（SMTP 填班信箱登入資料）——回覆即刻係班地址，唔露個人 email。
- 注意：經個人 Gmail send-as 寄嘅信**唔會**自動落班信箱「已傳送」——重要信用 webmail 寄。

### C. Gmail POP3 收件（零成本「偽 Gmail」）
- 免費開一個 Gmail（例 `skw.course.ops@gmail.com` 一個就夠，唔使每班一個），
  設定「**透過 POP3 檢查郵件**」拉晒所有班信箱，再逐個加班地址做 send-as。
- 想再進一步：每班一個免費 Gmail（`blt2601.skw@gmail.com`）＋POP3 拉班信箱＋send-as——
  就得到接近「Gmail 委派存取」嘅效果（Gmail 對委派存取支援最順）。
- 代價：信箱身份係 gmail.com、免費戶口無 admin 管理、要搞 2FA——**區控制力弱**，想清楚先行。

### D. 一次過上 Google Workspace（`skwscout.org.hk` 成個搬上去）
- 每個班信箱＝一個授權（每月約 US$7/戶）——每班一戶長期開就貴；只開一兩個「當值」授權輪流用又失去每班獨立歸檔。
- 換嚟嘅係：真 Gmail＋委派存取＋Drive／Sheet 同戶（用戶嘅「一戶過」夢想成真）。
- **現階段唔建議即刻做**——A+B 已經解決九成；等真係痛到先諗。

## 三之二、收生通知（v4.17.1 已內建喺區系統）

> 核心需求：**發接納／不接納通知**。CL 喺訓練班 App 批完收生（接納／拒絕）之後，
> 管理層喺 portal「⭐ 新版流程 → 📬 收生通知」一撳就寄——**唔使等 course repo 改**。

- **接納通知**：上課節次（Input02 上通告嗰啲）＋報到時間／攜帶物品／其他／備註（Print_接納通知書人手格）自動組版，班領導人署名。
- **不接納通知**：客氣版（名額所限，歡迎日後再報名）。
- **ReplyTo＝班信箱**（批核分頁填嘅「訓練班電郵」> 班 Sheet 參數格 > 班領導人電郵）——申請人回覆直接去班職員度；**副本 CC 班領導人**（就算班信箱未設定好，CL 都一定收到副本）。
- 每筆有**通知紀錄**（CourseLinks `regNotices`：邊個幾時寄邊種），有「✉ 寄晒未寄（N）」一鍵批量＋逐筆重寄。
- ⚠️ 郵件限額：免費 Gmail（skddbs）每日約 100 封（連副本每人約計兩封）——大班分批寄；上 Workspace／alias 限額高好多。
- （course repo 嗰邊日後可以整埋 App 內「寄通知」掣直接叫同一個 GAS action——見第六節。）

## 四、Sheet 點解唔使搬去班信箱

- Google Sheet 一定要住喺某個 Google 帳戶——班信箱唔係 Google 戶口，放唔到入去（除非行 C/D）。
- **而家嘅設計已經解決咗存取**：職員喺訓練班 App 用每班共用密碼（1234→自設）讀寫班 GS，
  全程唔使 Google 登入；CL 會有 GS 嘅 edit share（部署／檢查用）；管理層經區系統批核。
- GS／Script 全部由 **CourseFactory 喺機房帳戶 copy 出嚟**——天然集中歸檔，唔會散。
- ⚠️ 區後台（skddbs）想**直接寫班 GS**（批核寫入唔經 /exec），班 GS 要 share Editor 俾 skddbs：
  **CourseFactory 加一行 `file.addEditor(OPS_EMAIL)`**（Script Properties `OPS_EMAIL=skddbs@gmail.com`）
  ——起每一班自動分享，零人手。冇 share 亦唔會壞：區系統自動 fallback 經 `/exec` 寫，
  唯一「區會批准」格要人手開 GS tick（系統會出提示）。

## 五、設定清單（區管理系統 Config 表）

| Config | 填咩 | 說明 |
|---|---|---|
| `COURSE_FACTORY_URL` | CourseFactory /exec | CL 開班用；開班指引自動帶出 |
| `COURSE_FACTORY_CODE` | 開班碼 | 只交俾 CL，季度更換 |
| `COURSE_EMAIL_FROM` | （選填）留空 | 統一 alias；留空＝部署帳戶地址＋ReplyTo 班信箱 |
| `COURSE_EMAIL_FROM_MODE` | （選填）`course` | 寄件人直接用班信箱（要先喺部署帳戶 Gmail 做 send-as 驗證） |
| `notifyFrom` | 筲箕灣區 | 寄件人顯示名 |

每班嘅「訓練班電郵」（班信箱地址）喺**批核分頁**填，寫入班 GS 參數分頁「訓練班電郵」格——
訓練班 App 通告查詢行會自動用佢；區系統寄通知 ReplyTo（mode=course 時連 From）亦自動用佢。

## 五之二、C 案（免費 Gmail POP3）逐步（~15 分鐘）

1. 開一個**免費 Gmail 做營運中樞**，例 `skw.course.ops@gmail.com`（一個夠，用 label 分班；想每班完全獨立就每班開一個 `blt2601.skw@gmail.com`）。
2. Gmail ⚙ →「查看所有設定」→「帳戶和匯入」→ **「查看其他帳戶的郵件」→ 新增郵件帳戶**：
   - 填班信箱地址 → 揀「透過 POP3 匯入郵件」；
   - POP 伺服器／port／使用者名稱／密碼：問寄存商（通常 `mail.skwscout.org.hk`，port 995 SSL）；
   - ✅「在伺服器上保留其他帳戶郵件副本」；✅「標籤收到的郵件」填班名。
3. 同一頁 **「用這個地址傳送郵件」→ 新增另一個電郵地址**：填同一個班地址 → SMTP 伺服器＋port＋班信箱登入 → Gmail 寄一封驗證信去班信箱 → 去 webmail（或等步驟 2 拉入嚟）撳驗證連結。
4. 完成。職員開呢個 Gmail：班信自動入嚟（有 label），回信揀班地址寄出——**查詢信 CL／職員一定收到**；仲可以喺呢個 Gmail 加**委派存取**俾多個職員（唔使共享密碼）。
5. 每班加一條 POP3＋一個 send-as（新班約 5 分鐘）。

## 六、Course repo 建議改動清單（交返訓練班系統嗰邊，可遲啲做）

1. **CourseFactory.gs**：`createCourse` 加 `file.addEditor(OPS_EMAIL)`（Script Properties `OPS_EMAIL`）
   —— 區後台直接寫班 GS 批核（唔使逐班人手 share）。
2. **coursev5 加 `setParamLabel` action**（label 對位寫參數分頁一格）——
   冇 share 嘅班都可以經 Script tick「區會批准」／寫「訓練班電郵」。
3. （可選）`getCourseSummary` 已回 `courseEmail`／`approved`——夠用，唔使改。
4. （可選）收生通知而家由區系統寄（見三之二）；如果想 CL 喺 App 批完即場寄，可以喺 coursev5
   加 `sendRegNotice` action（同樣 MailApp＋ReplyTo 班信箱）＋ intake 頁加掣——同區系統版二選一就得。
