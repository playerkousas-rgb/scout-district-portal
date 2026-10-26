'use client';
export default function SetupPage() {
  return (
    <>
      <h1 className="page-title">🧩 區接入教學</h1>
      <p className="page-sub">本平台採「統一前端 + 各區獨立 Google Sheet / Apps Script 後台」。下方新區接入教學只供從零開始；已有區資料請沿用原本後台。</p>

      <div className="info-card">
        <h3>🔄 已有 Google Sheet？請更新，唔好重建</h3>
        <p>先備份現有 Sheet 同 Apps Script；下載 <a href="/downloads/Code.gs.txt" download="Code.gs.txt">完整 Code.gs v4.29.1</a> 貼到<strong>原有</strong> Apps Script 專案，再喺 Script Properties 設定每區獨立嘅 <code>PORTAL_TOKEN_SECRET</code>（至少 32 字元）。執行 <code>setupSheets()</code> 只追加缺表／缺欄／缺行，不改舊格，然後<strong>編輯原有 Web App 部署</strong>選新版本。原有 <code>API_KEY_HASH</code> 若為空白，須由區方另外明確生成 Key 並同步前端，部署前核對 <code>apiKeySet: true</code>；舊 session 需要重新登入。唔好將真實帳密貼入程式碼／Sheet。</p>
        <p>詳細步驟（包括備份、API Key、YMIS 帳密輪換及驗證）：<a href="https://github.com/playerkousas-rgb/scout-district-portal/blob/main/docs/gs-upgrade-no-data-loss.md" target="_blank" rel="noopener noreferrer">只追加升級指引 ↗</a>。唔好執行只供獨立訓練班工作簿使用嘅 <code>setupCourseSheet()</code>。</p>
      </div>

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
        <h3>全新地區接入步驟（已有資料請依上方升級指引）</h3>
        <ol>
          <li>到「更新 / 下載」取得後台程式碼 <code>Code.gs</code>。</li>
          <li>建立一張全新的 Google Sheet。</li>
          <li>選單：擴充功能 → Apps Script，把 <code>Code.gs</code> 整份貼上、儲存。</li>
          <li>函數選 <code>setupSheets</code> → 執行（首次需授權：Review permissions → 你的帳戶 → Advanced → Allow）。</li>
          <li>🔑 Setup 彈窗會顯示你的 <b>API Key</b>（只顯示一次！）。請即複製。</li>
          <li>回到 Sheet，填 <code>Config</code> 分頁：區名等；在 <code>Users</code> 分頁設定帳號，立即更改／停用初始密碼帳戶。</li>
          <li>喺 Apps Script 專案設定 → Script Properties 新增每區獨立 <code>PORTAL_TOKEN_SECRET</code>（至少 32 字元亂碼；唔好貼喺 Sheet／原始碼），否則無法登入。</li>
          <li>部署 → 新增部署 → 網頁應用程式（執行身分：我自己；存取：所有人）。</li>
          <li>複製 <code>/exec</code> 網址。</li>
          <li>把「區碼 + 區名 + /exec 網址 + API Key」交給平台管理員登記。</li>
          <li>★ 統一後台：同一個後台同時服務<b>管理系統</b>同<b>成員系統（member-portal）</b>。同一個 API Key 會設定去兩個 Vercel 環境變數：<code>PORTAL_{'{'}區碼{'}'}_APIKEY</code> 同 <code>MEMBER_{'{'}區碼{'}'}_APIKEY</code>。</li>
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
