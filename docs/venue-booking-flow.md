# 🏛 區總部借場 — 一條龍流程（統一後台 v4.0）

**申請人喺成員系統 (member-portal) 填表（唔使跳去 Teamup）→ GS 必須先喺 Teamup 藍色「申請中」子日曆建立事件，再寫入 VenueBookings → 區管理系統一鍵批核時寫入 TTLock、將 Teamup 轉紅、電郵密碼並回傳記錄。**

成員端只負責提交申請資料；Teamup event ID 由 GS 建立後回傳，唔使用成員端傳入嘅 ID。Teamup 未能建立藍色事件時，提交會回傳失敗，不會假裝收件成功或只寫入表格。舊 Config 的 `VENUE_SCRIPT_URL` 轉發欄已不再用於借場提交；此流程固定由共用 GS 建事件及寫入 VenueBookings。

借場**寫入與審批**仍由同一個 Apps Script 後台（管理系統 + 成員系統共用）完成；
下方房間**唯讀查閱**獨立由現有 Vercel 前端的 `/api/rooms/hq` 讀公開 iCalendar，毋須另起部署或更動正式 GS v4.18.0。

## 流程
```
申請人（member-portal）填借用申請表
      │  公開 action：submitVenueRequest
      │  → 寫入 VenueBookings（status=pending）
      │  → Teamup「申請中」子日曆建【申請】事件（寫入 teamupEventId）
      ▼
區職員登入管理系統 → 場地借用審批 (/venue-regs)
      │  點「✅ 批准」→ 前端 call confirmVenueBooking
      ▼
後台 confirmVenueBooking_（status=approved）：
   Teamup 轉色：有 teamupEventId → 搬去「確認借用」子日曆；冇就新建

（稍後）approveVenueBooking_ = 上面 + TTLock 限時密碼 + 電郵密碼

拒絕 / 取消（setVenueBookingStatus_ status=rejected/cancelled）：
   → 喺「拒絕」子日曆建事件（選填子日曆）+ 電郵通知申請人
```

## Config 金鑰設定（Config 工作表）
| key | 說明 |
|---|---|
| `TEAMUP_API_KEY` | Teamup API Token（兼容舊欄名 `teamupApiKey`） |
| `TEAMUP_CALENDAR_KEY` | Teamup 分享金鑰（形如 `ks...`，唔係 c/ 開頭）（兼容舊 `teamupCalendarId`） |
| `TEAMUP_APPROVED_SUBCAL_ID` | 「確認借用區總部」子日曆 ID（批准後建事件／轉色）（兼容舊 `teamupApprovedSubId`） |
| `TEAMUP_REJECTED_SUBCAL_ID` | （選填）拒絕子日曆 ID（兼容舊 `teamupRejectedSubId`） |
| `TEAMUP_PENDING_SUBCAL_ID` | 藍色（申請中）子日曆 |
| `TEAMUP_FIELD_ATTENDEE_KEY` | 參加人數 custom field key；此日曆事件 JSON 顯示為 `"1"`，Config 填 `1` |
| `ttlockClientId` / `ttlockClientSecret` | 通通鎖 TTLock 開發者應用 |
| `ttlockUsername` / `ttlockPassword` | TTLock App 登入帳密 |
| `ttlockLockId` | 大門鎖 Lock ID |
| `ttlockApiBase` | TTLock 區域 server（`https://api.ttlock.com` / eu / cn） |
| `ttlockDisabled` | `TRUE` = 跳過 TTLock，改用隨機密碼（先用嚟聯調其餘流程） |
| `notifyFrom` | 電郵寄件人名稱（預設用區名） |

> 攞子日曆 ID：可喺 `services/skw-booking/get-ids.js` 輸入 API Key + Calendar ID 查（係選用工具）。
> 舊 Config 用緊 `teamupApiKey` 等舊欄名都可以繼續用，程式會自動 fallback。

## 區總部及地域房間使用情況（`/rooms` 月曆；正式後台維持 v4.18.0）

- **區總部資料來源係 Teamup 紅色「確認借用區總部」子日曆**，**唔係**借場申請表 `VenueBookings.status=approved`：人手直接喺 Teamup 建立嘅確認事件亦會見到；藍色「申請中」及拒絕事件唔顯示。地域 17／18／19 樓房間繼續由公開 Google ICS 讀取。
- **今次毋須改 Apps Script、Sheet、Users 或原有密碼。**正式共用後台 v4.18.0 無 `getDistrictHqBookings` action；前端改由 Vercel `/api/rooms/hq` 唯讀 Teamup 公開 iCalendar feed，而唔係要求重新部署 `gs/Code.gs`。JSON REST API 仍需要 `Teamup-Token`；公開 ICS 唔需要。成員系統原有公開分享 URL 優先讀 v4.18.0 `getPublicInfo.teamupBookingUrl`（Config `TEAMUP_BOOKING_URL`），留空則從成員系統 GitHub 公開元件取得 `TEAMUP_OPEN_URL` 後備連結（本倉不硬編碼分享金鑰）。若公開程式暫時取不到且 Config 未設網址，可選 Vercel `TEAMUP_PUBLIC_BOOKING_URL` = 成員系統 `TEAMUP_OPEN_URL` 全個公開網址。
- **Vercel 新環境變數預設毋須加。**用戶已確認現有 Config：`TEAMUP_APPROVED_SUBCAL_ID=11188257` 為紅色已批，`TEAMUP_PENDING_SUBCAL_ID=11188256` 為藍色申請中（公開子日曆 ID，**非**私人 Token）。程式使用已核對的紅色 ID 預設值，直接讀紅色專屬 ICS，並再次核對紅色 `CATEGORIES`／日曆名稱，避免用錯藍色 ID 時將其誤作空置；空的紅色 feed 亦可正確顯示未見借用。**日後**紅色 ID 改變，才可選 Vercel `TEAMUP_APPROVED_SUB_ID` 覆蓋。已存在的 `PORTAL_SKW_APIKEY` 用來讀 `getPublicInfo.teamupBookingUrl`，不新增／更動；`TEAMUP_API_KEY` 不須複製到 Vercel，公開分享網址亦不寫入倉庫。公開分享連結應有合適查閱權限；來源 iCalendar 可能有同步延遲，只涵蓋過去約 6 個月至未來約 12 個月，超出範圍會標示不可用。
- `/api/rooms/hq` 上游固定 `ics.teamup.com`，禁跳轉並限制檔案大小；不接受訪客提供 URL，亦不返回原始 ICS／Token／名稱／電話／備註／入場密碼／Teamup UID，只回匿名時段。區系統前端收到舊版已知預設卡名時，僅在顯示層改成「區總部及地域房間使用情況」；**不改 Cards 表自訂名稱或原有儲存格**。舊後台 `getCards_` 若因個別帳戶 `cards` 白名單漏掉 `rooms`，前端只於成功登入、SKW 區補出查閱卡；借場審批 `venueReg` 仍受原 `canVenue` 限制。
- 「月曆」及「逐個地點」保留原有地域房間與區總部已批時段格仔／逐日清單，**不額外嵌入 Teamup 月曆窗或另設新視窗按鈕**；「今日總覽」只用紅色 ICS 判斷區總部有冇已 BOOK，唔計藍色申請中。來源失敗顯示不可用，不把缺資料說成空置。「地域原版日曆」維持只顯示地域房間。🎭 示範模式使用獨立匿名模擬事件。
- **驗證與部署**：只部署此 Next.js/Vercel 改動；**不要因房間功能貼上本倉 v4.25.0 `gs/Code.gs`**（該版本會強制 `PORTAL_TOKEN_SECRET`，未設時堵塞正式 v4.18.0 全部登入）。2026-10-20 已從用戶提供的公開網址取得紅色 11188257 ICS，核對名稱及已批事件；其中存在 `RRULE:FREQ=MONTHLY;BYDAY=1FR`，故已補足 parser 的每月第 N 個星期重複規則及匿名樣本測試。測試：`node --experimental-strip-types scripts/test-teamup-hq-ics.ts`、`node --experimental-strip-types scripts/test-room-card-compat.ts`、`node --experimental-strip-types scripts/test-district-hq-calendar.ts`、`node --experimental-strip-types scripts/test-demo-engine.ts`、`npm run build`。**Vercel PR 預覽有登入保護，仍要在部署後核對正式頁面的真實 Teamup 事件與今日狀態，未驗收不可聲稱正式畫面已讀通。**

## 成員系統 (member-portal) 要接嘅 action
申請表呼叫後台公開 `submitVenueRequest`（經 `/api/proxy` 帶 API Key），欄位：
`venueId, name, phone, email, troop, position, purpose, activityName, attendeeCount, startDate, endDate, agreeRules`。
`activityName` 必填（最多 120 字）；`attendeeCount` 必須為 1–9999 正整數；`agreeRules` 必須為 `true`。GS 會儲存兩欄，並將姓名＋職位寫入 Teamup 內建 `who` 欄位、參加人數寫入 `custom["1"]`。Config 的 `TEAMUP_FIELD_ATTENDEE_KEY` 填 `1`；**不可把 `TEAMUP_API_KEY` 傳給成員系統**。
`teamupEventId` 由 GS 建立藍色事件後回傳，成員端不應自行指定。電郵選填，但**有填先會收到批准/拒絕通知同入場密碼**。

## 呢個 repo 檔案
| 檔案 | 作用 |
|---|---|
| `gs/Code.gs` → `approveVenueBooking_` | 批核入口（一條龍）：TTLock + Teamup + 電郵 |
| `gs/Code.gs` → `setVenueBookingStatus_` | 簡單改狀態（拒絕/取消 + 通知） |
| `gs/Code.gs` → `createTtlockPasscode_` | TTLock 限時密碼 |
| `gs/Code.gs` → `teamupMoveToApproved_` / `createTeamupEvent_` / `teamupOnReject_` | Teamup 轉色/建事件 |
| `gs/Code.gs` → `sendVenueApprovalEmail_` / `sendVenueRejectionEmail_` | 電郵申請人 |
| `app/venue-regs/page.tsx` | 審批頁（批准 → `approveVenueBooking`，顯示密碼） |

## 設定步驟
1. 後台 Apps Script 貼上新 `gs/Code.gs`（v4.0 統一後台），執行 `setupSheets()`。
   - ★ setup 係「補建唔清空」：已有資料嘅 Sheet 只會補缺失欄位（含 `VenueBookings.passcode`），唔會洗資料。
2. 填 Config 嘅 TEAMUP_* / ttlock* 金鑰。
3. 喺 `Venues` 表加可借用場地。
4. 部署為 Web App（執行身分：我自己；存取：所有人）— 電郵用呢個 GAS 帳號寄出。
5. member-portal 申請表接到 `submitVenueRequest`。

## 備註
- 申請人電郵建議必填，否則批核時無法寄密碼（後台會跳過通知，照樣批核）。
- TTLock 未就緒時可先設 `ttlockDisabled=TRUE`，其餘流程照跑。
- 拒絕／取消電郵同 Teamup 事件只係輔助，失敗唔會影響狀態更新。
