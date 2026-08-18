# member-portal ↔ 統一後台（GS）對接合約 v4.2

兩邊共用同一份 `gs/Code.gs`、同一張 Sheet、同一個 `/exec` + API Key。

> `https://github.com/playerkousas-rgb/member-portal.git` 喺呢次環境係 **404 / 讀唔到**。
> 呢份合約按「那邊表單已對準 SHEET、呢邊負責批核」嚟寫。若 member-portal 有額外欄名，GS 已收一批別名。

## 借物資（而家打通）

```
member-portal 填表
   POST action=submitStockRequest（別名 addStockRequest）
        │
        ▼
StockRequests 新增一行 status=pending
   （Items.availableQty 此時唔扣）
        │
        ▼
區職員 /stock-regs → setStockRequestStatus
   approved  → 扣庫存 + 電郵申請人
   rejected / cancelled / returned → 回補（如之前已扣）+ 電郵
```

### 提交欄位

| 主欄名 | 兼容別名 | 必填 |
|---|---|---|
| `itemId` | `item_id` / `item` | ✅（或 `items[]`） |
| `qty` | `quantity` / `amount` / `count` | ✅ |
| `name` | `applicant` / `who` | ✅ |
| `phone` | `tel` / `mobile` | ✅ |
| `email` | `mail` | 建議（有先收到批核信） |
| `troop` | `unit` / `group` | |
| `position` | `rank` / `title` | |
| `purpose` | `reason` / `note` / `remarks` | |
| `borrowDate` | `startDate` / `start` / `date` | |
| `returnDate` | `endDate` / `end` | |
| `agreeRules` | `agree` / `accepted` | |
| `items` / `cart` / `lines` | `[{itemId, qty}, …]` | 一次借多件 |

公開讀物資：`GET listItems`（回 `itemId, name, category, totalQty, availableQty, unit, note, location`）。

成功回應兩邊都讀到：

```json
{ "ok": true, "refCode": "SR-20260818-1234", "data": { "refCode": "SR-20260818-1234", "refCodes": ["SR-…"] } }
```

## 借場（而家測試：填表 → Teamup 登記 → 呢邊批核）

```
member-portal 填表
   POST action=submitVenueRequest（別名 addVenueRequest）
        │
        ├─ VenueBookings 新增一行 status=pending
        └─ Teamup「申請中」子日曆建【申請】事件，寫入 teamupEventId
             （Teamup 失敗唔擋收表，warn 會回傳）
        │
        ▼
區職員 /venue-regs → confirmVenueBooking
   狀態 → approved
   Teamup 事件搬去「確認借用」子日曆（轉色）
```

**未做（你話稍後）**：`approveVenueBooking` 一鍵 TTLock 限時密碼 + 電郵密碼俾申請人。函式留低，而家批准掣唔會行呢條。

### 提交欄位

| 主欄名 | 兼容別名 | 必填 |
|---|---|---|
| `venueId` | `venue_id` / `venue`（可用場地名稱） | ✅ |
| `name` | `applicant` / `who` | ✅ |
| `phone` | `tel` / `mobile` | ✅ |
| `startDate` | `start` / `from` / `date` + 可選 `startTime` | ✅ |
| `endDate` | `end` / `to` + 可選 `endTime` | ✅ |
| `email` | `mail` | 建議 |
| `troop` / `position` / `purpose` / `agreeRules` | 同上 | |
| `teamupEventId` | `eventId` | 有就沿用，唔再新建 |

成功：

```json
{ "ok": true, "refCode": "VR-…", "teamupEventId": "1234567890", "warn": "", "data": { … } }
```

### Teamup Config（測試借場必填）

| Config key | 用途 |
|---|---|
| `TEAMUP_API_KEY` | Teamup API Token |
| `TEAMUP_CALENDAR_KEY` | 分享金鑰 `ks…` |
| `TEAMUP_PENDING_SUBCAL_ID` | **申請中**子日曆（填表建事件） |
| `TEAMUP_APPROVED_SUBCAL_ID` | **確認借用**子日曆（批准轉色） |
| `TEAMUP_REJECTED_SUBCAL_ID` | 選填：拒絕／取消 |

健康檢查 `?action=getHealthCheck`（免 Key）會回：

```json
{ "version": "4.2.0", "teamupReady": true, "teamupPendingSet": true, "teamupApprovedSet": true }
```

`version` 要係 `4.2.0` 先代表呢版 GS 已貼上線。

## 部署

1. 將本 repo `gs/Code.gs` **全部覆蓋**貼去 Apps Script → 儲存。
2. 執行 `setupSheets()`（補建唔清空）。
3. Config 填齊 TEAMUP_*（至少 API Key、日曆、pending、approved 四個）。
4. **部署 → 新部署**（或「管理部署」更新現有 Web App）。
5. `Venues` / `Items` 表要有資料，member-portal 下拉先有得揀。
6. 兩邊 Vercel 用同一個 `/exec` + 同一個 API Key。
