# 🏛 區總部借場 — 一條龍流程（統一後台 v4.0）

**申請人喺成員系統 (member-portal) 填表（唔使跳去 Teamup）→ GS 寫入 VenueBookings 並喺 Teamup「申請中」建事件 → 管理系統審批轉色。**

而家先測呢一步。TTLock 一鍵密碼 + 電郵申請人（`approveVenueBooking`）留低稍後再接。

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
| `TEAMUP_PENDING_SUBCAL_ID` | （選填）藍色（申請中）子日曆 |
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
- **Vercel 新環境變數預設毋須加。**無 `TEAMUP_APPROVED_SUB_ID` 時，只讀公開 combined ICS，按 `CATEGORIES:確認借用區總部` 篩選；如無法確認紅色子日曆存在（例如來源沒紅色事件／關閉 ICS），只顯示**資料不可用**，決不當成空置。想指定紅色 feed／確認空日曆，喺此區系統的 Vercel 專案設 **`TEAMUP_APPROVED_SUB_ID` = 原有後台 Config `TEAMUP_APPROVED_SUBCAL_ID`（或舊 `teamupApprovedSubId`）實際數字**，然後重部署。文件嘅 `12139000` 僅係例子，唔好照抄；亦可在 Teamup 公開連結 → Preferences → iCalendar Feeds 查紅色日曆專屬 `.ics` URL 最後一段數字。已存在的 `PORTAL_SKW_APIKEY` 用來讀公開設定，不用新增或更動；`TEAMUP_API_KEY` 不須複製到 Vercel。注意公開分享金鑰須具有合適唯讀權限，來源 iCalendar 可能有同步延遲；Teamup ICS 只涵蓋過去約 6 個月至未來約 12 個月，超出範圍頁面會顯示不可用而非空置。
- `/api/rooms/hq` 上游固定 `ics.teamup.com`，禁跳轉並限制檔案大小；不接受訪客提供 URL，亦不返回原始 ICS／Token／名稱／電話／備註／入場密碼／Teamup UID，只回匿名時段。區系統前端收到舊版已知預設卡名時，僅在顯示層改成「區總部及地域房間使用情況」；**不改 Cards 表自訂名稱或原有儲存格**。舊後台 `getCards_` 若因個別帳戶 `cards` 白名單漏掉 `rooms`，前端只於成功登入、SKW 區補出查閱卡；借場審批 `venueReg` 仍受原 `canVenue` 限制。
- 前端月曆以紅色顯示區總部已確認時段，可揀「全部地點／區總部／各樓層」；「逐個地點」及今日總覽並列。來源失敗顯示不可用，不把缺資料說成空置。「地域原版日曆」仍只顯示地域房間。🎭 示範模式使用獨立匿名模擬事件。
- **驗證與部署**：只部署此 Next.js/Vercel 改動；**不要因房間功能貼上本倉 v4.19.1 `gs/Code.gs`**（該版本會強制 `PORTAL_TOKEN_SECRET`，未設時堵塞正式 v4.18.0 全部登入）。在 Teamup 直接加一個紅色確認事件，另加一個藍色申請事件，待 iCalendar 同步後核對月曆只出紅色；如紅色資料不可用再填上述 Vercel 子日曆 ID。測試：`node --experimental-strip-types scripts/test-teamup-hq-ics.ts`、`node --experimental-strip-types scripts/test-room-card-compat.ts`、`node --experimental-strip-types scripts/test-district-hq-calendar.ts`、`node --experimental-strip-types scripts/test-demo-engine.ts`、`npm run build`。未有正式 Teamup 回應前不可聲稱端到端核對完成。

## 成員系統 (member-portal) 要接嘅 action
申請表呼叫後台公開 `submitVenueRequest`（經 `/api/proxy` 帶 API Key），欄位：
`venueId, name, phone, email, troop, position, purpose, startDate, endDate, agreeRules, teamupEventId`。
電郵選填，但**有填先會收到批准/拒絕通知同入場密碼**。

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
