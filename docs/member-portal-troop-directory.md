# 成員系統「區內旅團」名錄合約

## 資料來源及管理方式

- 唯一資料來源：區管理系統 Apps Script 的 `Units` 分頁；初始筲箕灣區 28 個旅團沿用現有名單及主辦機構，依據[港島地域官方筲箕灣區旅團列表](https://www.hkirscout.org.hk/tc/districts_groups/groups/skw/index.html)（檢視日期 2026-03-31）。
- 管理介面：區管理系統 `/visit` →「⚙️ 旅團名單」。區方可編輯主辦機構、集會時間、Instagram、Facebook、旅團網頁及是否在成員系統公開顯示。
- 社交／網頁欄位可留空；空白代表不顯示該項。只接受 `http://` 或 `https://` 網址。未勾選公開顯示的旅團不會出現在公開 API。
- 不新增第二張旅團資料表，也不由成員端編輯資料。

## 公開 API

新增 Apps Script GET action：`listDistrictTroops`。成員系統應經自己的 server-side proxy 呼叫此 action，並在 proxy GET action allowlist 加入 `listDistrictTroops`。Apps Script API Key 必須只留在 server-side Vercel 環境變數，不能傳給瀏覽器。

```json
{
  "ok": true,
  "data": {
    "districtCode": "SKW",
    "districtName": "筲箕灣區",
    "troops": [
      {
        "troop": "17",
        "label": "港島第17旅",
        "organizer": "慈幼中學",
        "meetingTime": "",
        "instagramUrl": "",
        "facebookUrl": "",
        "websiteUrl": ""
      }
    ]
  }
}
```

`troops` 只包括 `active=TRUE`（或舊資料空白）且 `publicVisible=TRUE`（或舊資料空白）的旅團。`publicVisible` 是獨立的公開顯示開關，不會更改旅團啟用狀態。沒有填的可選資料會回傳空字串；成員系統應只顯示非空欄位。點擊旅團後以彈窗／抽屜顯示旅團名稱、主辦機構及已填公開資料；社交／網頁連結以新分頁開啟，設定 `rel="noopener noreferrer"`。

## 需要在 member-portal repo 完成的前端工作

本 repo 不包含 `member-portal` 前端。該 repo 需新增「區內旅團」卡片／頁面：載入 `listDistrictTroops`、呈現旅團列表、點擊後顯示公開資料詳情，並隱藏空欄。API 合約及管理端資料欄位已在本 repo 定義；member-portal proxy 的 GET action allowlist 及 UI 欄位白名單亦需同步更新。此功能未算完整上線，直至 member-portal 前端改動完成並部署。
