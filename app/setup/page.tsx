'use client';
export default function SetupPage() {
  return (
    <>
      <h1 className="page-title">🧩 區接入教學</h1>
      <p className="page-sub">本平台採「統一前端 + 各區獨立 Google Sheet / Apps Script 後台」。你這區不用寫程式，照步驟建立自己的後台，再把 Web App /exec 網址和 API Key 交給平台管理員即可。</p>

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
          <li>🔑 Setup 彈窗會顯示你的 <b>API Key</b>（只顯示一次！）。請即複製。</li>
          <li>回到 Sheet，填 <code>Config</code> 分頁：區名等；在 <code>Users</code> 分頁設定帳號密碼。</li>
          <li>部署 → 新增部署 → 網頁應用程式（執行身分：我自己；存取：所有人）。</li>
          <li>複製 <code>/exec</code> 網址。</li>
          <li>把「區碼 + 區名 + /exec 網址 + API Key」交給平台管理員登記。</li>
        </ol>
      </div>

      <div className="info-card">
        <h3>🔑 API Key 是甚麼？</h3>
        <p>API Key 是你區後台與前端之間的通訊密鑰。前端每次呼叫你的後台時，都會附帶這把 Key 來證明身份。沒有這把 Key，任何人都無法讀取或修改你的資料。</p>
        <ul>
          <li>Setup 時自動生成，只顯示一次</li>
          <li>忘記了？到 Apps Script 選單 → 🔑 重新生成 API Key</li>
          <li>懷疑洩漏？重新生成即可，舊 Key 即刻失效</li>
          <li>Config 表只存雜湊值，連管理員也無法還原</li>
        </ul>
      </div>

      <div className="info-card">
        <h3>🛡️ 你的資料有多安全？</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={{ padding: '6px 12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>資料存放在哪？</td><td style={{ padding: '6px 12px' }}>Google 伺服器（Google Sheet），不是某台不知名的電腦。</td></tr>
            <tr><td style={{ padding: '6px 12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>API Key 存放在哪？</td><td style={{ padding: '6px 12px' }}>Vercel 伺服器環境變數，不出現在任何前端代碼。</td></tr>
            <tr><td style={{ padding: '6px 12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Sheet 存了甚麼？</td><td style={{ padding: '6px 12px' }}>只有 API Key 的 SHA-256 雜湊值（API_KEY_HASH），連管理員也無法還原。</td></tr>
            <tr><td style={{ padding: '6px 12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>攻擊門檻</td><td style={{ padding: '6px 12px' }}>要取得你的資料，攻擊者要麼攻破 Google 伺服器，要麼攻破 Vercel 伺服器。比存在自己家裡的電腦更安全。</td></tr>
          </tbody>
        </table>
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
