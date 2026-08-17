'use client';
export default function UpdatesPage() {
  return (
    <>
      <h1 className="page-title">📢 更新 / 下載</h1>
      <p className="page-sub">平台版本與後台程式碼下載。</p>
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
