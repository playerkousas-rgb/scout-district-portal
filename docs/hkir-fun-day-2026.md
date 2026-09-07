# 🎪 港島童軍繽紛日 2026 專頁（/fun-day）

> 前端獨立頁：**唔經後台 Cards／Perms**，唔使改 Apps Script；登入後經主控台紫色橫額進入。
> 網址：`https://你嘅網址/fun-day?d=SKW`

## 內容

| 分頁 | 內容 |
|---|---|
| 🗓 籌備會議 | 每次會議：日期／時間／地點／文件＋「📋 複製開會通知」＋「📅 加入日曆（.ics）」；1704室會議自動有「查房間使用情況」連結（去 `/rooms`） |
| 📖 執行手冊 | ⛑️ 急救文件（總會 FAT/01、ACC-RPT、保險通告＋大會文件待上載位）、🌦 惡劣天氣安排、📋 大會流程及崗位分工（待上載位） |

## 日常更新（全部只改 `lib/funDay.ts`）

- **加第 6 次會議**：喺 `FUN_DAY_MEETINGS` 加一筆（`no: 6`，填 `dateLabel`／`dateISO`／`timeLabel`／`venue`；有開始時間就填埋 `startISO`／`endISO` 做 .ics）。
- **會議文件齊咗**：喺該次會議嘅 `docs` 加 `{ title, url }`，改埋 `docsNote`。
- **執行手冊文件上載咗**：喺 `FUN_DAY_MANUAL` 對應章節，將該文件嘅 `url` 填上、刪走 `pending: true`。
- **第 1–4 次會議詳情**：而家係「待補」佔位，有日期／文件話 agent 知，格式同第 5 次一樣。
- 主控台橫額會自動顯示「下一次」會議（`nextFunDayMeeting()` 用 `dateISO` 判斷）；冇即將舉行嘅會議會自動收埋。

## 注意

- 結束時間：開會通知只寫開始（1915），.ics 暫定 19:15–21:15，頁面已註明「結束時間暫定約 21:15，以大會通知為準」。
- 跨頁連結用 `withDistrict()` 帶區碼（`/rooms?room=1704`、`/incident?tab=weather` 等）。
