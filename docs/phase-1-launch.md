# 筲箕灣區系統：Phase 1 即時開通指引

> **目標：不接電子鎖、不寄入場密碼，先開通借場及借物資。**
>
> 此階段毋須新增 Sciener／TTLock 金鑰，毋須修改或重新部署 Apps Script；只需在現有主後台 Google Sheet 加資料。現有 Teamup 設定會繼續用於「申請中」→「確認借用」轉色。

## 唯一硬阻塞：新增場地

在主後台 Google Sheet 的 **`Venues`** 分頁新增以下一行：

| venueId | districtCode | name | location | capacity | scienerLockId | note | active |
|---|---|---|---|---|---|---|---|
| `skw-hq` | `SKW` | `筲箕灣區總部` | （填會址；暫時可留空） | （填人數；暫時可留空） | **留空** | （任意） | **`TRUE`** |

**`active` 必須明確填寫 `TRUE`。** 成員端只應展示已啟用的場地。新增後重新開啟 member-portal 的借場頁即可看到；毋須發布 Apps Script 新版本。

也可由管理端 `/venue-regs` 底部「場地清單」新增：場地代碼填 `skw-hq`、名稱填 `筲箕灣區總部`；此介面新增時會把場地設為 `TRUE`。如直接改 Sheet，請以本表欄位順序填寫。

## 同步開通借物資

在 **`Items`** 分頁逐項新增可借物資。表頭如下：

| itemId | districtCode | category | name | totalQty | availableQty | unit | note | location | active |
|---|---|---|---|---:|---:|---|---|---|---|

每項的 `active` 同樣明確填 **`TRUE`**；`availableQty` 應填現時可借數量。新增後成員端借物資頁即時可見，不須 Apps Script 發版。

## Phase 1 審批操作（重要）

在 `/venue-regs` 對每宗待批借場申請按：

> **✅ 確認（唔設鎖）**

此操作會：

1. 將申請狀態改為 `approved`；
2. 將 Teamup 事件由「申請中」移至「確認借用」（即轉色）；
3. **不會**寫入電子鎖密碼；
4. **不會**向申請人寄出密碼電郵。

### Phase 1 禁止使用

**不要按「⚡ 一鍵批准（Phase 2）」。** 未完成門鎖驗收時，它可能在建碼失敗後使用後備隨機密碼並嘗試寄給申請人；申請人會誤以為該密碼已可開門。

管理端已把「✅ 確認（唔設鎖）」保留給所有有借場審批權限的職員（包括 DDC 或以上），並把一鍵批准標明為 Phase 2。

## Config：可選、即改即生效

以下 key 都有本地後備；留空不會令 Phase 1 壞掉。直接修改 **`Config`** 分頁的 `value` 欄即可，毋須重新部署 Apps Script。

| key | 用途 | 留空時 |
|---|---|---|
| `VENUE_RULES` | 借場規則文字 | 使用內建 7 條守則 |
| `STOCK_RULES` | 借物資規則文字 | 使用內建守則 |
| `TROOP_LIST` | 旅團清單（逗號分隔） | 使用本地後備／Units 名單 |
| `TEAMUP_BOOKING_URL` | 成員端顯示的借場日曆連結 | 使用現有連結／不顯示覆蓋值 |
| `CCTV_URL` | 會址閉路電視連結 | 不顯示連結 |
| `NOTIFY_STAFF_EMAIL` | 收到借場、物資、訓練班或活動知會申請時通知職員 | 不寄職員通知；**建議填寫** |

`NOTIFY_STAFF_EMAIL` 可用逗號分隔多個收件地址。它只通知職員；不會改變 Phase 1「確認」不向申請人寄密碼的行為。

## Phase 2：只在要自動寄可開門密碼時才做

當電子鎖準備好，才按以下順序處理：

1. 在 Config 填入五個 `SCIENER_*` 設定；
2. 套用雙位制補丁：[`docs/backend-venue-passcode.patch`](https://github.com/playerkousas-rgb/member-portal/blob/main/docs/backend-venue-passcode.patch)；
3. Apps Script **部署 → 管理部署 → 編輯 → 選「新版本」→ 部署**（網址保持不變）；
4. 以測試申請驗證「⚡ 一鍵批准（Phase 2）」：TTLock 建碼成功、Teamup 轉色、申請人收到密碼電郵、密碼可真正開門；
5. 驗收成功後，才可把一鍵批准用於日常申請。

> 只改 `Code.gs` 而沒有發佈 Apps Script 新版本，不會影響正在使用的 `/exec` 網址。

## 日常驗收提示

- **訓練班**：管理系統開班後，member-portal `/training` 會自動出現；第一班應完成一次真實報名 E2E。
- **活動知會**：成員提交後，公開列表即時出現；領袖姓名、電話和電郵不會公開。
- **規則／旅團清單**：只需改 Config，不用重新發布。

## Scout Admin（可選）

如需把「未登記來源」顯示為正式的「成員系統」膠囊，在 `scout-admin` 的 `widget.js` `SOURCE_ALIASES` 及 `index.html` `SOURCE_APPS` 各新增一行「成員系統」，然後重新部署 scout-admin。這項不影響 Phase 1 借場或借物資開通。
