# skw-booking-system（區總部全自動借場）

原先的獨立 repo，現收進本區管理平台作為 sub-project。部署與設定請見
[`docs/skw-booking-setup.md`](../../docs/skw-booking-setup.md)。

## 本次重要修正：TTLock 設定密碼
`lib/ttlock.js` 已修好你卡住的「設定密碼」步驟：

1. **時段密碼改 6 位**（`TTLOCK_PASSCODE_LENGTH`，預設 6；4 位會被 TTLock 拒）。
2. **區域伺服器可設**（`TTLOCK_API_BASE`：`global`/`eu`/`cn` 或自訂網址）。
3. **撞碼自動重試**（`TTLOCK_RETRY`，電話頭碼在香港極易相撞）。
4. **`TTLOCK_DISABLED=1` 可先跳過 TTLock**，Teamup/Email/Sheet 照常跑，方便先聯調。

## 部署
```bash
cd services/skw-booking
npm install
# 於 Vercel 建專案，設定環境變數（見 docs/skw-booking-setup.md）
# 查子日曆 / 鎖 ID
node get-ids.js
node get-lock-id.js
```

## 環境變數總覽
見 [`docs/skw-booking-setup.md`](../../docs/skw-booking-setup.md) 第四節表格。
