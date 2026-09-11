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

## ⭐ 最簡版：要做嘅嘢（睇呢段就得）

想象一個郵箱：

```
申請人寫信 → 📬 班信箱（XXX@skwscout.org.hk）
                 ↓ 自動影印一份
              👨‍👩‍👧 班職員自己個 email（平日點睇信就點睇，唔使學任何嘢）

申請人撳回覆 → 都係去班信箱 → 又影印 → 班職員自己個 email
班職員撳回覆 → 直接覆到申請人 ✓
```

**要做嘅嘢＝3 步（每開一個班一次，5 分鐘）：**

1. 寄存商 panel 撳「新增信箱」——開個班信箱（例 `blt2601@skwscout.org.hk`），設個密碼
2. 同一個 panel 撳「轉寄」——填班職員嘅個人 email（有幾個填幾個）
3. portal 批核嗰頁「訓練班電郵」——打埋個班地址

做完。班職員要做嘅嘢＝零。

**班職員點回覆（零設定，臨場揀一種）：**
- 日常答一兩句 → 用**自己 email** 覆（收到轉寄信直接撳回覆）——申請人見到職員個人地址，冇問題
- 想用班地址出 → 開 **webmail**（`webmail.skwscout.org.hk` 登入班信箱覆）——申請人見到班地址

**其他全部唔使做：**
- ~~send-as~~（教個人 Gmail 扮班地址出信）：每班做一次＋要班信箱密碼——**開頭唔好做**；
  CL 用落覺得日日開 webmail 麻煩先做（見三之四）。
- `Refund.gs`／`RegNotice.gs` 係升級配件（App 內寄通知書／退款經 Script）——portal 已全部做到，唔急。

下面係詳細版（做先進階設定先睇）。


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

## 三之二、收生通知（v4.17.1 區系統版＋v4.17.2 分工更正）

> **分工定案（重要）**：**接納／唔接納由 CL 決定**（喺訓練班 App roster 批）；管理層只理錢
> （收款核對＋退款 tick）。寄通知書嘅**正路**係 CL 喺 App 按「發出接納及不接納通知書」掣
> ——後端模組 `RegNotice.gs` 已寫好（`course.git` repo `apps-script/RegNotice.gs`，貼入班 Script＋
> doPost 加 `case 'sendRegNotice'` 一行＋roster 頁加掣就得）。
> 區系統 portal「📬 收生通知」分頁保留做**管理層代寄後備**（CL 個 App 未上掣之前頂住用）。

**CL 喺 App 按「發出接納及不接納通知書」之後會發生（RegNotice.gs 流程）**：
1. 前端 POST 班 Script `{action:'sendRegNotice', apiKey, ids:[時間戳記…]}`（留空 ids＝全部已決定而未寄嘅報名）。
2. 班 Script 讀**自己**班 Sheet：Input02 B1 班名＋9–16 節次（H 欄 FALSE 唔出）＋Print_接納通知書
   人手格（報到 23／物品 30／其他 32／備註 34）＋職員表 23–42 班領導人署名。
3. 逐個 MailApp 寄：**ReplyTo＝班信箱**（參數「訓練班電郵」）——申請人撳回覆就去班信箱；
   接納版＝節次＋報到＋物品＋其他＋備註＋「直接回覆本電郵」；不接納版＝客氣（名額所限＋退款安排＋歡迎再報名）。
4. 寫紀錄入班 Sheet「表格回應」AZ/BA（通知書 accepted/rejected＋時間）——再撳唔會重複寄，CL／管理層都查到。
5. ⚠️ 寄信 quota 計**班 Script 部署帳戶**（免費 Gmail 100/日、Workspace 1500/日）——大班分批寄。

（區系統代寄後備版：portal「📬 收生通知」分頁，ReplyTo 班信箱＋副本 CC 班領導人，紀錄寫 CourseLinks.regNotices。）

## 三之三、已退款 tick（v4.17.2——管理層理錢，CL 個 APP 見到）

- 班 Sheet「表格回應」**AX「已退款」✔＋AY「退款核對人」**——管理層退咗錢俾未獲接納／取消嘅申請人之後，
  喺 portal「💰 收款核對」逐筆 tick「↩ 已退款」（可取消重 tick）。
- 直接寫入班 Sheet（direct）或經班 Script `setCourseRefund` action（模組 `Refund.gs` 已寫好——
  `course.git` repo `apps-script/Refund.gs`，同 PaymentCheck.gs 同構：identity 對行、唔 bump rev、自動補表頭）。
- CL 個 APP roster／intake 顯示（course repo 待辦）：見到 ↩ 就知區會已退錢俾嗰位申請人。

## 三之四、查詢信點樣到 CL／職員（**完全唔使登入班信箱**）

有人電郵到 `XXX@skwscout.org.hk`，CL 想喺自己平時開住嘅個人 email 見到——用 **B 案「轉寄副本」**：

1. 寄存商控制台（cPanel 類 → Email → **Forwarders／轉寄**）設 `XXX@skwscout.org.hk` 自動轉寄副本去
   **CL 個人 email（＋管理層 email，逗號分隔可以多個）**——建議「保留副本」，班信箱本身仲留底。
2. 之後查詢信會**即時 copy 去每個轉寄目標**——CL 日日開自己 email 就見到，乜都唔使登入。
3. 如果寄存商冇轉寄功能 → 行 C 案（免費 Gmail POP3 拉信，見五之二）——CL 開嗰個 Gmail 就見到，一樣唔使碰班信箱。

**申請人回覆通知書電郵又會點？**

1. 通知書 ReplyTo＝班信箱 → 申請人撳「回覆」，收件人自動係 `XXX@skwscout.org.hk`（唔會散去 CL 個人信箱）。
2. 回覆信落班信箱 → 經 B 案轉寄副本 → CL／管理層個人 email 即時見到（同一封，未讀狀態照跟）。
3. CL 喺自己 email 直接撳回覆 → 覆到申請人（寄件人顯示 CL 個人地址）。想**顯示班地址**就照下面「send-as 一次設定」做。
4. 貼士：轉寄信第一次可能入垃圾匣——喺 Gmail 撳「唔係垃圾郵件」＋把寄件人加入聯絡人就得。

### 回覆顯示班 EMAIL 地址（send-as 一次設定——想用班地址答信嘅職員先做）

1. 個人 Gmail ⚙ →「查看所有設定」→「帳戶和匯入」→ **用這個地址傳送郵件：新增另一個電郵地址**。
2. 電郵地址填 `XXX@skwscout.org.hk`，✅「視為別名」。
3. SMTP 伺服器＝寄存商嗰個（通常 `mail.skwscout.org.hk`）、port 465（SSL）或 587（TLS）、
   使用者名稱＝**成個班地址**、密碼＝班信箱密碼。
4. Gmail 寄封確認信去班信箱——經 webmail（或轉寄副本）收，撳連結／填確認碼。
5. 完成。之後回覆時「寄件人」揀班地址——申請人見到嘅寄件人就係 `XXX@skwscout.org.hk`
   （行寄存商 SMTP 出信，唔會有「透過 gmail.com」字樣）。
6. ⚠️ 呢個設定要用班信箱密碼——唔好個個職員都加；只俾指定答信嘅職員（例如 CL）加，
   其他職員齋收轉寄副本，或者用共享 webmail（A 案）入班信箱答（天然顯示班地址）。

### 轉寄目標多加幾個班職員又如何？

- **完全冇問題**：一個班地址可以轉去多個目標，每人即刻收到查詢信同申請人嘅回覆（回覆都落班信箱→全數轉發）。
- 某個職員信箱滿咗／退信**唔影響**其他人（各目標獨立）。
- 貼士：目標 2–4 個就夠；邊個答信內部講好——冇 send-as 嘅人回覆會顯示個人地址。
- 所有人第一次收轉寄信記得撳「唔係垃圾郵件」。


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

> 兩個後端模組**已寫好**，喺 `course.git` repo working tree（未 commit）：`apps-script/Refund.gs`＋`apps-script/RegNotice.gs`。

1. **Refund.gs**（退款 tick）：貼入班 Script＋doPost 加 `case 'setCourseRefund'`——區系統「↩ 已退款」即刻運作。
2. **RegNotice.gs**（CL 喺 App 寄通知書）：貼入班 Script＋doPost 加 `case 'sendRegNotice'`＋roster 頁加
   「發出接納及不接納通知書」掣（POST `{action:'sendRegNotice', apiKey, ids, by}`；留空 ids＝全部未寄嘅已決定報名）。
3. **roster／intake 顯示**（加顯示，唔改邏輯）：報名行加「💰✔ 已核對收款」「↩ 已退款」「✉ 通知書已寄（accepted/rejected＋時間）」
   ——「表格回應」AX/AY/AZ/BA 四欄照 header 名讀。
4. CourseFactory `file.addEditor(OPS_EMAIL)`、coursev5 setParamLabel（舊有待辦）。
5. （可選）`getCourseSummary` 已回 `courseEmail`／`approved`——夠用，唔使改。
