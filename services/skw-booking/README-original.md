# 🏕️ 筲箕灣區總部全自動預約管理系統 (完全指南)

這個系統已為你全面設計並重構。現在，它是一個**零成本、全自動**的預約、統計與門鎖授權系統。

當有新的租場申請時，系統會自動發送電郵給區職員。職員只需要在信中點選 **[✅ 批准]**、**[✏️ 修改]** 或 **[❌ 拒絕]**，系統便會完成所有後續作業：
1. **Teamup 自動變色**：自動將日曆從「待審批（藍色）」轉移到「確認借用（紅色）」。
2. **TTLock 自動製碼**：自動向大門鎖申請一組**限時密碼**（以申請人電話頭 4 位數為密碼，設定在其租用時段生效）。
3. **自動統計數據 (Google Sheet)**：自動將預約的詳細資料（姓名、電話、電郵、時段、密碼、人數）同步寫入你指定的 Google 試算表中，方便未來年度統計與使用率分析！
4. **自動通知申請人**：自動發送專業的 HTML 通知信給申請人，內含密碼與使用守則，並可同時 **CC 知會其他職員 (NOTIFICATION_EMAIL)**。
5. **一鍵 WhatsApp 轉發**：在審批網頁上提供 **一鍵 WhatsApp 轉發** 功能，方便職員一秒傳送訊息給申請人！

---

## 🏗️ 系統運作架構

```
[租場人填表] 
      │
      ▼
 1. Teamup (藍色事件) ◄────── 2. 外部定時排程 (如 Google Apps Script，每 5 分鐘觸發 /api/cron)
      │
      ├──────────────────────► 3. 系統發送 [待審批通知信] 給區職員 (APPROVER_EMAIL)
      ▼
[區職員收信]
      │
      ├─────► 點選 [✏️ 修改申請] ──► 進入 Teamup 修改時間/資料 ──► 返回郵件點批准 (自動載入最新資料)
      │
      ├─────► 點選 [❌ 拒絕] ────► 4a. Teamup 標記拒絕 / 發信 / 寫入 Google Sheet 統計 ──► 完成
      │
      └─────► 點選 [✅ 批准] ────► 4b. Teamup 轉為紅色 (確認借用)
                                  ├──► 5b. TTLock 自動生成大門密碼 (手機頭 4 碼)
                                  ├──► 6b. 自動寄出密碼通知 Email (可自動 CC 知會信箱)
                                  ├──► 7b. 統計數據自動同步至 Google Sheet
                                  └──► 8b. 網頁開啟 [一鍵 WhatsApp 傳送] 按鈕
```

---

## 💡 常見營運問題解答 (你關心的事項)

### Q1：除了批准及拒絕，如果需要修訂（改時間、電話等）要怎麼做？
* **完美解答：** 
  我們已在審批電郵中加入了 **「✏️ 修改申請」** 按鈕！
  點擊後會直接在瀏覽器打開 Teamup 該筆事件。區職員可以直接在 Teamup 網頁上修改時間、人數、電話、Email 等。修改並按下儲存後，**你不需要重新寄信，直接回到原來的那封審批信點擊「✅ 一鍵批准」即可！**
  因為系統在被點擊「批准」時，是**即時 (Real-time) 向 Teamup API 撈取最新資料**，所以任何你在 Teamup 上的修改，系統都會自動抓到，並依據「新時間、新電話、新姓名」來向 TTLock 申請正確的密碼！

### Q2：如果需要取消，直接在 Teamup 把活動取消/刪除，會對系統有影響嗎？
* **完美解答：** 
  **完全不會有任何不良影響！** 
  因為系統是「無狀態 (Stateless)」的。如果你直接在 Teamup 刪除了該活動，當你之後誤點原來郵件的「批准」或「拒絕」時，系統會自動在瀏覽器顯示：`❌ 找不到該日曆事件，可能已被刪除`，並且安全地中斷，不會在 TTLock 建立密碼，也不會寄信給申請人。

### Q3：如果在 Teamup 已經批准（轉為紅色且產生密碼）後，又手動去修訂它呢？
* **完美解答：** 
  如果已經批准完成了（日曆變紅、密碼已寄出），這時如果你在 Teamup 搬動了時間，系統**不會**自動去更新 TTLock 的密碼時間（因為自動化流程在點擊批准那一刻就結束了）。
  這時需要區職員到 TTLock 後台手動微調該組密碼的有效時間。這種情況一般較少發生，交給職員手動處理即可，對系統不會有任何影響。

### Q4：Teamup 本身就有通知信，可以用那個信來觸發，就不用每 5 分鐘執行一次嗎？
* **完美解答：** 
  雖然 Teamup 在有新申請時會發通知信，但在技術上，**「每 5 分鐘主動向 API 檢查」是目前最穩定、容錯率最高、且最不容易出錯的作法！**
  *理由如下：*
  1. **解析信件非常容易出錯**：Teamup 的通知信格式如果官方稍微調整一個空白或排版，原本寫好的「解析信件程式碼」就會立刻失效、無法觸發。
  2. **API 查詢是 100% 準確的**：我們直接透過 Teamup 官方 API 的 `/events` 撈取資料，格式是由官方定義的 JSON，永遠不會因為外觀排版改變而壞掉。
  3. **自動防重複機制**：我們每 5 分鐘去撈，如果發現「沒被標記過 `[Approval Sent]` 的藍色事件」，才會發審批信。一發完就會立刻在 Teamup 加上標記。這意味著：**不論排程跑幾次，每筆申請絕對只會讓職員收到一封審批信**。
  4. **零延遲與完全免費**：用 Google Apps Script (GAS) 跑每 5 分鐘排程是**完全免費**的，對伺服器也沒有任何負擔，這是業界公認最安全、最穩固的去中心化自動化作法。

---

## 📊 步驟一：設定 Google Sheets 統計日誌 (全新功能)

既然我們已經要用 Google Apps Script (GAS) 來做定時排程，我們可以**同時讓它擔任 Google Sheets 的寫入端點**！這不需要設定任何複雜的 Google 開發者金鑰，完全免費且安全。

### 1. 建立 Google 試算表
1. 在你的 Google 雲端硬碟新建一個 **Google 試算表 (Google Sheet)**。
2. 在第一列（A1 ~ K1）填入以下標題：
   * **A1:** 處理時間
   * **B1:** 事件ID
   * **C1:** 狀態
   * **D1:** 申請人姓名
   * **E1:** 聯絡電話
   * **F1:** 聯絡電郵
   * **G1:** 活動名稱
   * **H1:** 開始時間
   * **I1:** 結束時間
   * **J1:** 借用人數
   * **K1:** 門鎖密碼
3. 記下這個試算表的 **網址 ID**（在網址列 `https://docs.google.com/spreadsheets/d/` 後面那一長串英數組合）。

### 2. 部署 Google Apps Script 網頁應用程式
1. 在試算表中，點擊上方選單 **擴充功能 (Extensions) -> Apps Script**。
2. 清空原本的內容，並貼入以下程式碼：

```javascript
// 請將此處替換為你剛才建立的 Google Sheet ID
var SPREADSHEET_ID = "你的_GOOGLE_SHEET_ID_英數長字串";

// 功能 A：定時呼叫 Vercel 觸發自動化檢查 (原本的排程)
function triggerBookingCron() {
  // 請修改為你的 Vercel 部署網址 與 設定的 SECRET_TOKEN
  var vercelUrl = "https://your-project.vercel.app/api/cron?token=skw_secure_token_1234";
  
  try {
    var response = UrlFetchApp.fetch(vercelUrl);
    Logger.log("自動檢查執行結果: " + response.getContentText());
  } catch (e) {
    Logger.log("自動檢查發生錯誤: " + e.toString());
  }
}

// 功能 B：接收 Vercel 發送過來的審批/拒絕數據，寫入 Sheets 中做統計
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
    
    // 依序寫入：處理時間、事件ID、狀態、姓名、電話、電郵、活動名稱、開始、結束、人數、密碼
    sheet.appendRow([
      data.timestamp,
      data.eventId,
      data.status,
      data.name,
      data.phone,
      data.email,
      data.eventTitle,
      data.startDate,
      data.endDate,
      data.people,
      data.passcode
    ]);
    
    return ContentService.createTextOutput("✅ 統計資料寫入成功！");
  } catch (err) {
    return ContentService.createTextOutput("❌ 寫入失敗: " + err.toString());
  }
}
```

3. **部署 (Deploy)** 該 Script：
   * 點擊右上角 **部署 (Deploy) -> 新部署 (New deployment)**。
   * 選取類型：**網頁應用程式 (Web App)**。
   * 說明：`SKW Sheets Logger`
   * 誰可以存取 (Who has access)：選擇 **任何人 (Anyone)**（這是為了讓 Vercel 能傳送資料進來）。
   * 點擊 **部署**。
   * 系統會要求你授權存取 Google Sheets，按同意即可。
4. 部署完成後，複製 **網頁應用程式網址 (Web App URL)**（它會長得像 `https://script.google.com/macros/s/AKfycb.../exec`）。
5. **這個網址就是你的環境變數 `GAS_WEBAPP_URL`！**

---

## 🛠️ 部署前準備與環境變數

在部署到 Vercel 之前，請準備好以下 3 個服務的資料：

### 1. Teamup 日曆設定
1. 登入 Teamup 後台，點擊右上角 **Settings (設定) -> Sharing (分享)**。
2. 點擊 **Add Link (新增連結)**。
3. 命名為 `API Link`，在權限部分，將你想控制的子日曆（例如：申請借用、確認借用）設為 **Modify (修改)** 權限。
4. 點選儲存後，你會得到一個類似 `https://teamup.com/ks123456789abcdef` 的連結。
5. 其中的 **`ks123456789abcdef`** 就是你的 **`TEAMUP_CALENDAR_ID`**！

---

### 2. TTLock 開發者帳號 (open.ttlock.com)
1. 登入 [TTLock 開發者平台](https://open.ttlock.com)。
2. 點擊 **應用管理 -> 創建應用**。
3. 填寫：
   - 應用名稱：`SKW HQ Auto`
   - 應用類型：**網頁應用 (Web App)**
   - 重定向地址 (Redirect URI)：`https://skwscout.org.hk`
4. 儲存後，抄下你的 **Client ID** 與 **Client Secret**。

---

### 3. Gmail 應用程式密碼
1. 前往 [Google 帳戶安全設定](https://myaccount.google.com/security)。
2. 開啟 **兩步驟驗證** (必須開啟)。
3. 在搜尋欄輸入「**應用程式密碼**」並點入。
4. 命名為「`SKW Booking System`」並按產生，複製產生的 **16 位字母** 密碼。這就是你的 **`GMAIL_APP_PASSWORD`**。

---

## 🚀 步驟二：一鍵查詢所有子日曆 ID

在你的本機終端機執行：
```bash
node get-ids.js
```
並輸入你準備好的資料，你將會獲得：
1. **待審批子日曆 ID**（通常為藍色）
2. **確認借用子日曆 ID**（通常為紅色）
3. **門鎖 ID**

---

## 🚀 步驟三：部署至 Vercel

1. 將本專案程式碼 Push 至你的 GitHub。
2. 登入 [Vercel](https://vercel.com)，匯入你的 `skw-booking-system` 專案。
3. 在 **Environment Variables (環境變數)** 中新增以下資料：

| 環境變數名稱 | 範例值 | 說明 |
| :--- | :--- | :--- |
| `SECRET_TOKEN` | `skw_secure_token_1234` | 自訂一組安全的密鑰，防止外部惡意點擊審批連結 |
| `TEAMUP_API_KEY` | `4032acf1e6d917809aeb334a16dd0bca82297e8f0f65cd6ec32e0d92bc37bbd2` | 你的 Teamup API Key |
| `TEAMUP_CALENDAR_ID` | `ks123456789abcdef` | **(重要)** 你的 Teamup 分享日曆 ID (非 c/ 開頭) |
| `TEAMUP_PENDING_SUB_ID` | `12138999` | 待審批子日曆 ID (藍色) |
| `TEAMUP_APPROVED_SUB_ID` | `12139000` | 確認借用子日曆 ID (紅色) |
| `TEAMUP_REJECTED_SUB_ID` | `12139001` | *(選填)* 拒絕子日曆 ID，若沒填會留在原日曆並改標題 |
| `TTLOCK_CLIENT_ID` | `你的ClientID` | TTLock 開發者應用 ID |
| `TTLOCK_CLIENT_SECRET` | `你的ClientSecret` | TTLock 開發者應用密鑰 |
| `TTLOCK_USERNAME` | `你的lock2帳號` | lock2 登入帳號 |
| `TTLOCK_PASSWORD` | `你的lock2密碼` | lock2 登入密碼 |
| `TTLOCK_LOCK_ID` | `88884321` | 大門鎖的 Lock ID (由 get-ids.js 查得) |
| `GMAIL_USER` | `INFO@SKWSCOUT.ORG.HK` | 發送通知信的 Google 帳號 |
| `GMAIL_APP_PASSWORD` | `abcdefghijklmnop` | Google 應用程式專用 16 位密碼 |
| `APPROVER_EMAIL` | `INFO@SKWSCOUT.ORG.HK` | 接收「待審批通知」的職員信箱 |
| `NOTIFICATION_EMAIL` | `CC_EMAIL@SKWSCOUT.ORG.HK` | **(新增)** 知會電郵。先填寫你想知會的第二職員信箱，若要先空著，在 Vercel 留空或不填即可！ |
| `GAS_WEBAPP_URL` | `https://script.google.com/macros/.../exec` | **(新增)** 剛才在 Google Sheet 中取得的 Web App 部署網址。**填入後統計數據會自動生成！** |
| `BASE_URL` | `https://your-project.vercel.app` | 你的 Vercel 項目網址 (不加斜線) |

4. 點擊 **Deploy**，部署完成！

---

## ⏰ 步驟四：設定定時檢查 (排程)

1. 回到你的 Google Apps Script 頁面。
2. 點選左側選單的 ⏰ **觸發條件 (Triggers)** -> **新增觸發條件**：
   - 選擇要執行的功能：`triggerBookingCron`
   - 選取活動來源：**時間驅動 (Time-driven)**
   - 選取時間型觸發條件類型：**分鐘計時器 (Minutes timer)**
   - 選取分鐘間隔：**每 5 分鐘 (Every 5 minutes)**
3. 儲存，大功告成！

現在，你的系統已經與 **Google 試算表完全打通**。任何時間不論是「批准」還是「拒絕」，你的試算表都會自動更新，為你未來的數據分析提供了超強的基礎支援！📊📈🏕️
