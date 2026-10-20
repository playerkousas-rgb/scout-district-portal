# 🏛 區總部借場 — 一條龍流程（統一後台 v4.0）

**申請人喺成員系統 (member-portal) 填表（唔使跳去 Teamup）→ GS 寫入 VenueBookings 並喺 Teamup「申請中」建事件 → 管理系統審批轉色。**

而家先測呢一步。TTLock 一鍵密碼 + 電郵申請人（`approveVenueBooking`）留低稍後再接。

全部由同一個 Apps Script 後台（`gs/Code.gs` v4.0 統一後台：管理系統 + 成員系統共用）完成，
唔需要另起 Vercel service。

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

## 地域房間及區總部使用情況（`/rooms` 月曆）

- **區總部資料來源係 Teamup 紅色「確認借用區總部」子日曆**（上表 `TEAMUP_APPROVED_SUBCAL_ID`），**唔係**借場申請表 `VenueBookings.status=approved`：人手直接喺 Teamup 建立嘅事件同重複事件實例都要見到；藍色「申請中」及拒絕事件唔顯示。地域 17／18／19 樓房間繼續由公開 Google ICS 讀取。
- 新增管理後台 `POST getDistrictHqBookings`（`token`, `from: YYYY-MM-DD`, `days: 1..60`）。先用現有 `getCards_` 檢查登入及 `rooms` 卡查閱權限，再用 Teamup API `GET /{calendar}/events?startDate=...&endDate=...&subcalendarId[]=...&tz=Asia/Hong_Kong` 讀指定子日曆，並再次核對每個事件嘅 `subcalendar_ids`。只回傳匿名 `{uid, summary: '已確認借用', start, end, allDay}`（epoch 毫秒、香港時間解讀），**唔回傳** Teamup ID、title、notes、聯絡資料或入場密碼。未填 Key／日曆／紅色子日曆時 `configured=false`；讀取失敗回錯誤，前端顯示提示，唔會誤稱空置。
- `rooms` 查閱卡畀**全部已登入人士**，不受個別 `cards` 白名單限制；借場審批 `venueReg` 係另一張卡，須獲 `canVenue` 授權，預設只 DC／SYSADMIN／DDC_ADMIN／DDC_TRAINING／STAFF 可見。升級**不會清除**舊 Perms 賦畀 ADC／領袖的 view 格，實時 `canVenue` 門禁仍會阻止未授權者睇審批卡或待批借場資料。
- 前端月曆以紅色顯示區總部已確認時段，可揀「全部地點／區總部／各樓層」；「逐個地點」用 17／18／19 樓＋區總部作同一樓層清單顯示逐日時段；今日總覽同樣用區總部卡顯示當天確認借用，按卡可進詳情。「地域原版日曆」仍只顯示地域房間。🎭 示範模式使用獨立嘅匿名 Teamup 模擬事件，唔會打真後台。
- **升級現有部署**：先按[GS 只追加升級步驟](gs-upgrade-no-data-loss.md)備份，更新原有 `gs/Code.gs` → 執行 `setupSheets()`（只在最右／最底補缺欄／行，不改任何舊 `rooms`／`venueReg` 格；舊預設房間卡新名只在 API 顯示，全員查閱及審批限制在讀取／操作時生效）→ **更新 Apps Script 原有 Web App 部署版本**。前端功能已合併 `main`，唔使另建 Sheet。核對 `TEAMUP_API_KEY`、`TEAMUP_CALENDAR_KEY`、`TEAMUP_APPROVED_SUBCAL_ID` 係**同一個** Teamup 日曆，且後台 Token 可讀紅色子日曆；到月曆測試一個直接喺 Teamup 建立嘅確認事件同一個「申請中」事件。未完成後台部署前，前端會提示區總部資料不可用。
- 無需／不可把 Teamup Token 設喺前端或把 Teamup 原始事件直接傳到瀏覽器。程式測試：`node scripts/test-district-hq-gs.js`、`node --experimental-strip-types scripts/test-district-hq-calendar.ts`、`node scripts/test-upgrade-gs.js`、`node --experimental-strip-types scripts/test-demo-engine.ts`。

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
