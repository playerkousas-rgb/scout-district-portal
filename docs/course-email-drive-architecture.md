# 📬 訓練班電郵與檔案架構（v4.17.0 新版流程）

> 2026-09-11 同用戶夾好嘅實際情況：
> 區有自己 domain `skwscout.org.hk`（Workspace），**每班會開班信箱** `XXX@skwscout.org.hk`；
> 訓練班 GS／Script 機房同教材 Drive folder 放 `skw@hkirscout.org.hk`（區大資料庫帳戶，好多嘢要處理）；
> 以往班信會轉寄去 CL 個人電郵——想取消，改到班職員自己方便管理。
> **核心原則：機房信箱零班務信；班信箱係班嘅唯一對外窗口；班職員唔會掂到機房信箱。**

---

## 一、三個帳戶嘅角色分工

| 帳戶 | 角色 | 收咩信 | 班職員會唔會掂 |
|---|---|---|---|
| `skw@hkirscout.org.hk` | **機房**：CourseFactory＋逐班 GS／Script＋教材 Drive folder（share 俾 CL） | ❌ 零班務信（只係「寄件人地址」顯示佢） | ❌ 永遠唔會 delegate 俾職員 |
| `XXX@skwscout.org.hk`（每班一個） | **班信箱**：通告查詢行印嘅地址＋系統通知嘅 ReplyTo | ✅ 全部班務信（查詢＋CL 回覆） | ✅ delegate／group 管理 |
| `skddbs@gmail.com` | **區管理系統後台**（CourseLinks 開班登記＋批核指揮台） | 區系統通知（借場嗰啲，照舊） | ❌ |

## 二、郵件流向（系統已按呢個寫死）

```
系統通知（批准 ✔／掛載 📢／收款核對 💰）
  From:    skw@hkirscout.org.hk        ← 機房帳戶 MailApp 天然；寄件人顯示名 = 「筲箕灣區·班名」
  ReplyTo: XXX@skwscout.org.hk        ← 班信箱（CourseLink「訓練班電郵」格）
  → CL 撳「回覆」去班信箱，機房 inbox 一封都唔會多
  → （選配）Config COURSE_EMAIL_FROM 設 verified alias 可以連 From 都換走

查詢信（家長／其他區人士）
  → 通告印 XXX@skwscout.org.hk → 直入班信箱
```

技術位：Apps Script `MailApp.sendEmail({ from?, replyTo, name })`——`replyTo` 只要係有效地址就
唔使任何 Gmail 驗證（唔同 send-as alias，零設定）。所以呢個架構唔使喺 Workspace admin 做任何嘢。

## 三、班信箱點俾班職員管理（取代轉寄去 CL 個人 email）

**建議：①＋② 夾用。**

### ① Gmail 委派存取（核心：CL＋副 CL）
1. 登入班信箱 → ⚙️ 設定 →「帳戶」→「授予存取權限予您的帳戶」→ 加職員嘅 Workspace 電郵。
2. 對方收邀請確認後，喺自己 Gmail 右上角頭像**切換**入班信箱。
3. 可以讀晒全部信＋**代班身份回信**（From 顯示班地址）；唔使俾密碼。
4. 人事變動：收返委派一撳就得；信永久留喺班信箱做紀錄。

### ② Google Group（全體班職員通知組）
1. Workspace admin（或自派服務）開 group，例 `blt2601-crew@skwscout.org.hk`。
2. 班信箱設定「轉寄」去 group（班信箱登入一次 set 好）。
3. 有新查詢全體職員即時見到；CL 加減 group 成員就完成交接。
4. 各人回信用自己身份（想代班回就 delegate 嘅人回）。

### 課程完結
- Group 收掉；班信箱**唔使刪**——留低就係嗰班完整 email 檔案，同 Drive folder 歸檔同一道理。
- 每班一個信箱嘅好處正正係呢度：歸檔乾淨，唔會同其他班／區務撈埋一齊。

## 四、Drive 歸檔（照用戶計劃）

- 教材／開班文件 folder 喺 `skw@hkirscout.org.hk` Drive，share 俾 CL，CL 再分俾班職員。
- 班 GS 本身都喺機房帳戶（CourseFactory copy 出嚟）——天然已經歸晒檔，唔使搬。
- ⚠️ 區管理系統後台（`skddbs@gmail.com`）想**直接寫班 GS**（批核寫入唔經 /exec），
  班 GS 要 share **Editor** 俾 `skddbs@gmail.com`。兩個方法：
  - **CourseFactory 自動做（建議）**：`CourseFactory.gs` 嘅 `createCourse` 加一行
    `file.addEditor(OPS_EMAIL)`（Script Properties 加 `OPS_EMAIL=skddbs@gmail.com`）——
    起每一班都自動分享，零人手。呢個係 course repo 嘅改動（幾行），可以交返訓練班系統嗰邊做。
  - **人手 share**：每次 CL 交網址嗰陣，管理層喺班 GS「共用」加 skddbs@gmail.com。
- 冇 share 亦唔會壞：區系統會自動 fallback 經該班 `/exec`（saveCourseBatch）寫入；
  唯一分別係「區會批准」格嗰下要人手開 GS tick（系統會出提示）。

## 五、設定清單（區管理系統 Config 表）

| Config | 填咩 | 說明 |
|---|---|---|
| `COURSE_FACTORY_URL` | CourseFactory /exec | CL 開班用；開班指引自動帶出 |
| `COURSE_FACTORY_CODE` | 開班碼 | 只交俾 CL，季度更換 |
| `COURSE_EMAIL_FROM` | （選填）留空 | 留空＝From 機房地址＋ReplyTo 班信箱（建議）；想換 From 先設 verified alias |
| `notifyFrom` | 筲箕灣區 | 寄件人顯示名 |

每班嘅「訓練班電郵」（班信箱地址）喺**批核分頁**填，寫入班 GS 參數分頁「訓練班電郵」格——
訓練班 App 通告查詢行會自動用佢；區系統寄通知 ReplyTo 亦自動用佢。

## 六、Course repo 建議改動清單（交返訓練班系統嗰邊，可遲啲做）

1. **CourseFactory.gs**：`createCourse` 加 `file.addEditor(OPS_EMAIL)`（Script Properties `OPS_EMAIL`）
   —— 區後台直接寫班 GS 批核（唔使逐班人手 share）。
2. **coursev5 加 `setParamLabel` action**（label 對位寫參數分頁一格）——
   冇 share 嘅班都可以經 Script tick「區會批准」／寫「訓練班電郵」，
   唔使靠「saveCourseBatch 要死 row」。
3. （可選）`getCourseSummary` 已回 `courseEmail`／`approved`——夠用，唔使改。
