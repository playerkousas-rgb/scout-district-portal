'use client';
export default function UpdatesPage() {
  return (
    <>
      <h1 className="page-title">📢 更新 / 下載</h1>
      <p className="page-sub">平台版本與後台程式碼下載。</p>
      <div className="info-card">
        <h3>v4.5.0 — 區年度預算 + 地域房間使用情況 + 聯結簿自動同步 + 地域及總會架構</h3>
        <ul>
          <li>📑 <b>區年度預算</b>完成：直接讀區方 Google Sheet「2025-26 Year Plan」（月份／支部／活動／原收費／人數／區資助／CC 申報／狀態），按月份／按支部／全部活動三種睇法，頂部有全年資助、已完成金額、按類別／支部小計；DC 照舊喺 Sheet 改，10 分鐘內自動同步。換另一張表：Config <code>BUDGET_SHEET_URL</code></li>
          <li>🏢 新卡片 <b>地域房間使用情況</b>（/rooms）：17／18／19 樓逐間房揀，即見「現在使用中／空置」、未來 7／14／30 日逐日時段（活動、單位、人數、聯絡人由事件標題自動拆出）；打通房（1704A／B／1704／1704+1705）互相計入；另有「今日總覽」一頁睇晒 11 間房及「原版日曆」</li>
          <li>📇 <b>聯結簿・港島地域</b>分頁只剩職員直線電話（搵人解決問題用），並<b>自動由港島地域網頁同步</b>職員姓名／電話；<b>總會</b>各署電話電郵亦自動由總會網頁同步。頁尾顯示網頁更新日期及同步時間，讀唔到時自動用內建備援（會標明）</li>
          <li>🏛 新卡片 <b>地域及總會架構</b>（/orgchart）：港島地域總監架構（地域總監→副／助理地域總監→區總監→地域總部總監→助理地域總部總監）及總會（香港總監諮議會＋執行委員會主要職位），職位換人自動跟官網更新；有搜尋</li>
          <li>後台 4.5.0：Cards 補 <code>rooms</code>／<code>orgchart</code>（全員可看）、<code>budget</code> 由 todo 改 done、Config 補 <code>BUDGET_SHEET_URL</code>；外部網頁／Sheet／日曆全部由 Vercel <code>/api/external</code> 代抓，Apps Script 唔使改權限</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.4.0 — 天氣決策 + 聯結簿 + 帳戶層級／授權 + 隱藏卡片</h3>
        <ul>
          <li>🌦 <b>天氣決策</b>（意外／應變第一個分頁 + 主控台橫額）：自動拉天文台「現正生效警告」，揀戶內／戶外／海上即刻見到 ✅ 如常／⚠️ 留意／⛔ 取消同原因（活動指引通告 04/2018 表一）；可模擬「如果掛黃雨／3 號…」預先睇；AQHI 人手揀</li>
          <li>📇「旅團聯絡簿」改名 <b>聯結簿</b>，分 <b>旅團／港島地域／總會</b> 三個分頁：地域職員直線電話、總監架構、各區區總監、總會 11 個署電話電郵、五個地域辦事處、緊急通報電話；按電話即撥。旅團資料待區方提供後匯入</li>
          <li>🗑 刪除「會議行事曆」卡片（<code>setupSheets()</code> 會同步移除 Cards／Perms 舊行）</li>
          <li>↩️ 每張卡片頁頂及頁尾都有「← 返回主控台」</li>
          <li>👤 <b>帳戶層級</b>：L0 超管（隱藏）→ L1 區總監 → L2 副區總監 → L3 助理區總監 → L4 區職員 → L5 區長／領袖。預設 9 個 @skwscout.org.hk 帳戶（info／dc／ddc.admin／ddc.training／adc.gh／adc.cub／adc.scout／adc.venture／adc.rover），密碼 <code>1234</code>，<b>首次登入必須改密碼</b></li>
          <li>🔑 忘記密碼：寄重設連結去該帳戶登記電郵（24 小時有效、用一次即失效）；登入頁「記住我」；上級可把下級密碼重設回 1234</li>
          <li>🤝 <b>授權／收回</b>：上級把自己現有嘅卡片權限授予層級較低嘅角色協助處理；一鍵收回某角色或全部下級權限</li>
          <li>🙈 <b>卡片開啟／隱藏</b>：超管喺主控台每張卡直接切換；隱藏後其他人一律睇唔到，超管仍可進入（方便私下加功能／升級）</li>
          <li>後台新增 action：<code>requestPasswordReset</code>／<code>resetPassword</code>／<code>getDelegation</code>／<code>delegatePerms</code>／<code>revokePerms</code>；Users 表補 <code>level</code>／<code>mustChangePassword</code>／<code>delegatedBy</code>，Roles 表補 <code>level</code>（只補唔洗）</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.3.0 — 意外／應變完成 + 訓練班收費 QR + 主控台完成標示</h3>
        <ul>
          <li>🚨「意外／應變」卡片完成：<b>即時應變</b>（情境卡＋電話通報清單＋天氣警告對照表＋熱線，全部依總會通告）、<b>完整指引</b>（總會官方 PDF 全部連結）、<b>意外報告</b>（手機直接填，草稿只存本機，按「確定提交」先入後台 <code>IncidentReports</code>）</li>
          <li>意外報告列印／PDF 完全依總會行政署「意外報告」(ACC-RPT 2019/07) 兩頁版面，不適用選項自動加刪除線</li>
          <li>🎓 訓練班管理每班可生成收費 FPS QR（區會戶口＋學費＋課程編號），儲存到 <code>CourseLinks</code>；成員系統 <code>listCourseLinks</code> 會帶 <code>fpsQrPayload</code> 等欄位（member-portal 要改白名單先顯示，見 <code>docs/member-gs-handshake.md</code>）</li>
          <li>主控台卡片：<b>藍色實線框＝已完成</b>、灰色虛線框＝🚧 加入中，一眼睇到改進方向</li>
          <li>已核對活動知會雙向打通：成員系統填 → <code>ActivityNotices</code> → 管理系統 /activity-notices 即見</li>
          <li><code>setupSheets()</code> 會補 <code>IncidentReports</code> 表、CourseLinks 6 個 FPS 欄，並把意外卡片由 todo 改 done（只改仍是舊預設值嘅行）</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.2.4 — FPS QR 即時生成 + 圖片分享</h3>
        <ul>
          <li>主控台「💳 FPS QR Code 製作」：輸入銀碼後即時產生收款 QR，不用再前往外部產生器</li>
          <li>指定預設 FPS ID <code>102866183</code>；兼容 Google Sheet 將純數字帳戶回傳為數字的情況</li>
          <li>可直接複製 QR 圖片、手機系統分享、下載 PNG，並保留複製付款資料作備用</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.2.3 — 補建唔洗資料 + DDC 一鍵批場 + 主控台走馬燈</h3>
        <ul>
          <li><code>setupSheets()</code> 只補缺失表／欄／Config 列，唔清空、唔覆寫你已填嘅格</li>
          <li>DDC 或以上：一鍵批准（試寫鎖＋電郵，失敗自動改密碼）、職員代借、編輯、拒絕</li>
          <li>有權限登入後，主控台 HERO 有好明顯嘅待批走馬燈</li>
        </ul>
      </div>
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
        <p style={{ fontSize: 13.5 }}>貼上呢份 <a href="/downloads/Code.gs.txt" download="Code.gs.txt">Code.gs v4.4.0</a> 到 Apps Script，再執行選單「🧱 補建缺失表（不清空資料）」。只補唔洗，已填 Config／申請會保留。</p>
      </div>
    </>
  );
}
