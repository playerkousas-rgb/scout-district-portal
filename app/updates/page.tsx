'use client';
export default function UpdatesPage() {
  return (
    <>
      <h1 className="page-title">📢 更新 / 下載</h1>
      <p className="page-sub">平台版本與後台程式碼下載。</p>
      <div className="info-card">
        <h3>v4.1.1 — FPS 戶口內建 + 清理規則 URL</h3>
        <ul>
          <li>FPS QR 卡片內建區會戶口（SCOUT ASSOCIATION OF HONG KONG - SHAU KEI WAN DISTRICT / 102866183），Config 可覆蓋</li>
          <li>移除後台 VENUE_RULES_URL / VENUE_TERMS_URL / STOCK_RULES_URL（成員系統已內建，後台唔使再轉發）</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.1.0 — FPS QR 製作卡片</h3>
        <ul>
          <li>新增「💳 FPS QR 製作」卡片：綁定區會轉數快戶口（Config 的 FPS_ACCOUNT_NAME / FPS_ACCOUNT_NUMBER），填銀碼即生成收款 QR，可下載 PNG／複製內容</li>
          <li>setupSheets() 而家會自動「補建缺失卡片同權限行」，升級後重跑一次 setup 就會出現新卡片（唔會洗走資料）</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.0.1 — 訓練班報名修正</h3>
        <ul>
          <li>轉發報名 payload 補回「附加資料」欄（extra），每班收表 Script 現在會如常收到</li>
          <li>報名時後端重新檢查截止日期（deadline）：截止後直接 POST 亦會被拒絕，唔再淨係靠前端過濾</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.0 — 統一後台</h3>
        <ul>
          <li>管理系統 + 成員系統共用一張 Sheet、一份 Code.gs、一個 /exec、一個 API Key</li>
          <li>統一前端 + 各區獨立後台（區目錄 mapping）</li>
          <li>借場一條龍：批准自動 TTLock 限時密碼 → Teamup 轉色 → 電郵申請人</li>
          <li>系統管理員角色 + 前端增改角色 / 權限、外掛市集、維護鎖定</li>
          <li>setup 補建唔清空：重跑唔會洗走已有資料</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>後台程式碼</h3>
        <p style={{ fontSize: 13.5 }}>各區接入所需的 <code>Code.gs</code> 由平台管理員提供（見 apps-script/Code.gs）。日後可在此提供下載連結。</p>
      </div>
    </>
  );
}
