# 區管理平台 — 部署及使用指南（scout-district-portal）

> 呢份係「區職員端」嘅完整指南。公開報名端（member-portal）另行對接。
> 原則：**借場/借物資/知會/通告每區開一次；訓練班每班由負責人開一份標準 Script**。

---

## 〇、訓練班運作模式（不能改的重心）

> 以往：俾一份模版 EXCEL 訓練班負責人，佢改成呢個班嘅內容。
> 而家：負責人自己下載 master GS 檔 → RUN 一次 Script → 即生到一份**標準 EXCEL 原始檔**
> （所有分頁都一樣）→ 佢直接改 → 保證每班嘅 EXCEL 原始版本一致 → 完成後將 Script 交
> **member app**（公開報名）＋ **區管理系統**（批核）登記。

```
master GS 檔（已附標準 Script，只有區會存）
   │  負責人下載／複製一份（File → 建立副本 → Script 一併複製）
   ▼
負責人 RUN setupCourseSheet()  ← 一鍵生到標準多分頁原始檔
   │  （表格回應 / Input01-04 / 12 張 Print / 參數 / 使用說明）
   ▼
負責人改內容（填課程資料、預算、時間表、職員…）
   │
   ├─► 交 Script 資料（courseId + /exec + API Key + Drive）→ 區管理系統「訓練班管理」開班
   └─► 同時登記落 member app（公開報名）→ 報名寫入「表格回應」
   ▼
區職員喺區管理平台「訓練班報名審批」批核 → 寫回「表格回應」接納/審批狀態
```

**重點**：所有班都用同一個 master GS 檔生出嚟，原始版本 100% 一致；負責人只係改「內容」，
唔會郁到 Script 結構。Script 係批次（每班獨立），但都由同一份 `gs/Code.gs.course.js` 出。

---

## 一、起後台（Google Sheet + Apps Script）

### 1. 主後台（每區一份）
1. 新開一張 Google Sheet → 擴充功能 → Apps Script。
2. 貼上 `gs/Code.gs` → 儲存。
3. 執行一次 `setupSheets()`（首次授權：Review permissions → Advanced → Allow）。
   - 會自動建：`Config / System / Roles / Cards / Perms / Users`
   - ＋ 一次性服務表：`Venues / VenueBookings / Items / StockRequests / ActivityNotices`
   - ＋ 訓練班目錄：`CourseLinks`
   - ＋ `README_新手必看`
4. 彈窗會顯示 **API Key**（只顯示一次！）→ 即複製。
5. 部署 → 新增部署 → 網頁應用程式（執行身分：我自己；存取：所有人）→ 攞 `/exec` 網址。
6. 將「區碼 + 區名 + /exec 網址 + API Key」交平台管理員登記到前端 `lib/district.ts` + Vercel env `PORTAL_{區碼}_APIKEY`。

### 2. 訓練班 master GS 檔（區會準備一次）
1. 區會開一張「master」Google Sheet → Apps Script → 貼上 `gs/Code.gs.course.js` → 儲存。
2. 呢張就係 master 檔；以後每個訓練班負責人都係複製呢張嚟用（Script 會一併複製）。
3. 唔好喺 master 檔 RUN setup，等負責人自己複製副本後 RUN。

### 3. 訓練班負責人（每班一次）
1. 複製 master GS 檔（File → 建立副本）。
2. RUN `setupCourseSheet()`：
   - 一鍵生到標準多分頁原始檔：**表格回應**（報名 36 欄）／**Input01 預算**／**Input02 資料**／**Input03 時間表**／**Input04 支出表**／**12 張 Print 報告**／**參數**／**使用說明**
   - 產生 API Key（只顯示一次）＋ 自動建 Drive 入數紙資料夾
3. 改內容（課程資料、預算、時間表、職員、通告等）。
4. 部署為 Web App（執行身分：我自己；存取：所有人）→ 攞 `/exec` 網址。
5. 將「courseId + 課程名 + /exec 網址 + API Key + Drive 資料夾 ID」交：
   - **區管理系統**：「訓練班管理」開班登記（批核用）
   - **member app**：公開報名連結（報名用）
6. 需要更多分頁 → 選單「🎓 新增分頁」。

---

## 二、區職員使用流程

### 登入
- 揀區 → 用帳戶登入（帳號密碼由該區 Users 表控制）。
- 角色：DC / SYSADMIN（全管）、DDC_ADMIN / DDC_TRAINING、ADC_*、DL（區長）、LEADER（職領袖）。

### 卡片對照
| 卡片 | 路徑 | 用途 | 開一次? |
|---|---|---|---|
| 區總部借場 | `/venue-regs` | 借場申請批核；**批准自動 TTLock 密碼 + Teamup 轉色 + 電郵申請人**（申請人喺 member-portal 填表） | ✅ |
| 物資借用審批 | `/stock-regs` | 借物資批核＋庫存管理 | ✅ |
| 活動知會 | `/activity-notices` | 知會記錄＋查閱（可排序/篩選） | ✅ |
| 訓練班管理 | `/training` | 開班登記（Script/Drive/通告） | 每班 |
| 訓練班報名審批 | `/course-regs` | 揀班 → 名單 → 批/拒/取消 | 每班 |
| 通告庫 | `/notices` | 通告管理 | ✅ |

### 借物資庫存邏輯
- 提交申請後 status = pending。
- **批准**：自動扣 `availableQty`。
- **拒絕／取消**：自動歸還 `availableQty`。

### 知會排序／篩選
- 可按**年份、支部（section）、活動性質（nature）**篩選，並按**年份/日期/支部**排序。

---

## 三、防濫用
- 訓練班報名：同一 email + 同一課程 + 非已取消 → 拒絕重複。
- 入數紙：存入 Drive folder（folder 權限），**唔開 ANYONE_WITH_LINK**。
- （建議）公開端再加 honeypot / reCAPTCHA；注意 Apps Script 每日配額。

---

## 四、安全注意
- 逐區改：`MASTER_EMAIL / MASTER_PW`（後門）、`TOKEN_SECRET='CHANGE_ME_*'` 一定要改每區不同，或移除後門。
- API Key：每區自動隨機生成，存 Vercel env，唔出現喺前端。
- 受保護工作表：Config / Users / Staff / CourseLinks（含每班 key）。

---

## 五、檔案對照
| 檔案 | 用途 |
|---|---|
| `gs/Code.gs` | 主後台（統一後台 v4.0：登入/角色/權限/一次性服務/訓練班目錄/批核轉發/借場一條龍） |
| `gs/Code.gs.course.js` | 每班標準收表 Script（表格回應/Input/Print 多分頁） |
| `app/training` | 訓練班管理頁 |
| `app/course-regs` | 訓練班報名審批頁 |
| `app/venue-regs` | 場地借用審批頁（批准→approveVenueBooking：TTLock 密碼＋Teamup 轉色＋電郵） |
| `app/stock-regs` | 物資借用審批頁 |
| `app/activity-notices` | 活動知會頁 |
| `docs/venue-booking-flow.md` | 借場一條龍流程（申請→審批→TTLock+Teamup+電郵） |
| `docs/keys-checklist.md` | **找回＋驗證 Teamup/TTLock API Key 嘅 checklist** |
| `docs/booking-setup-merge-checklist.md` | **Merge 後逐步操作：貼 Code.gs→setup→填 Key→驗證→測試** |
| `services/skw-booking/` | 選用：實體門鎖 TTLock 自動化（可選，非必要） |
| `docs/skw-booking-setup.md` | 選用：實體門鎖整合參考 |
| `docs/card-permission-plan.md` | 卡片＋角色權限矩陣規劃 |
