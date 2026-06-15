'use client';
export default function UpdatesPage() {
  return (
    <>
      <h1 className="page-title">📢 更新 / 下載</h1>
      <p className="page-sub">平台版本與後台程式碼下載。</p>
      <div className="info-card">
        <h3>v3.0 — 多區架構</h3>
        <ul>
          <li>統一前端 + 各區獨立後台（區目錄 mapping）</li>
          <li>兩重登入：選區 → 帳戶</li>
          <li>系統管理員角色 + 前端增改角色 / 權限</li>
          <li>外掛市集（轉駁器）+ 無感內嵌 + 系統維護鎖定</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>後台程式碼</h3>
        <p style={{ fontSize: 13.5 }}>各區接入所需的 <code>Code.gs</code> 由平台管理員提供（見 apps-script/Code.gs）。日後可在此提供下載連結。</p>
      </div>
    </>
  );
}
