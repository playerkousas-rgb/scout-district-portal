'use client';
export default function SetupPage() {
  return (
    <>
      <h1 className="page-title">🧩 區接入教學（小白版）</h1>
      <p className="page-sub">本平台採「統一前端 + 各區獨立 Google Sheet / Apps Script 後台」。你這區不用寫程式，照步驟建立自己的後台，再把 Web App /exec 網址交給平台管理員即可。</p>

      <div className="info-card">
        <h3>你需要先準備</h3>
        <ul>
          <li>Google 帳號 1 個（建議用區的公用帳號）</li>
          <li>空白 Google Sheet 1 張</li>
          <li>區碼（例如 CHW）、區名（例如 柴灣區）</li>
          <li>區聯絡 Email、總監級帳號名單</li>
        </ul>
      </div>

      <div className="info-card">
        <h3>詳細步驟</h3>
        <ol>
          <li>到「更新 / 下載」取得後台程式碼 <code>Code.gs</code>。</li>
          <li>建立一張全新的 Google Sheet。</li>
          <li>選單：擴充功能 → Apps Script，把 <code>Code.gs</code> 整份貼上、儲存。</li>
          <li>函數選 <code>setupSheets</code> → 執行（首次需授權：Review permissions → 你的帳戶 → Advanced → Allow）。</li>
          <li>回到 Sheet，填 <code>Config</code> 分頁：區名等；在 <code>Users</code> 分頁設定帳號密碼。</li>
          <li>部署 → 新增部署 → 網頁應用程式（執行身分：我自己；存取：所有人）。</li>
          <li>複製 <code>/exec</code> 網址。</li>
          <li>把「區碼 + 區名 + /exec 網址」交給平台管理員登記。</li>
        </ol>
      </div>

      <div className="info-card">
        <h3>完成後怎麼用</h3>
        <ul>
          <li>管理員登記後永久生效。</li>
          <li>你區任何人：打開平台 → 第一重選你的區 → 第二重登入帳戶。</li>
          <li>資料全在你自己的 Sheet，別區與平台作者都看不到。</li>
        </ul>
      </div>
    </>
  );
}
