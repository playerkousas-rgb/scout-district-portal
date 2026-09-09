'use client';
export default function UpdatesPage() {
  return (
    <>
      <h1 className="page-title">📢 更新 / 下載</h1>
      <p className="page-sub">平台版本與後台程式碼下載。</p>
      <div className="info-card">
        <h3>v4.15.0 — 🛡 寫入防呆：rev 樂觀鎖＋一次過儲存</h3>
        <ul>
          <li>🛡 <b>十個職員同時改都唔撞爛</b>：班 Sheet 加隱藏 <code>_Sync</code> 版本號；讀全文帶 <code>rev</code>，儲存帶返 <code>baseRev</code>——有人快咗一步就唔寫，直接話你邊個幾時改過，叫你重讀再存</li>
          <li>💾 <b>改完一次過存</b>：新 <code>saveCourseBatch</code> 一個 call 存晒（設定格＋完成報告＋證書＋支出）；成批驗證，有錯就乜都唔寫。唔好逐格 auto-save，每格打一次後端</li>
          <li>🔒 全部寫入加鎖排隊，唔會交錯寫爛；支出係 append-only（唔同職員自動唔同行）；區系統推送都會 bump rev</li>
          <li>⚠️ 要換新 <code>Code.gs</code>（v4.15.0）→ 重新部署（唔使跑 setupSheets，冇新表）；訓練班模版覆蓋貼上（新開班用新模版一鍵建表，舊班覆蓋唔好重跑 setup）。member-portal <b>唔使改</b></li>
        </ul>
      </div>
      <div className="info-card">
        <h3>📝 訓練班模版更新 — ✍️ 寫入 API（職員前端基本合約）</h3>
        <ul>
          <li>✍️ <b>每班 Script 加 4 個寫入 API</b>（全部要該班 API Key）：<code>setCourseCells</code> 通用寫格（上限 1000 格，唔識嘅頁自動 skip）／<code>setCompletionRow</code> 完成報告學員列（D 證書／E 合格與否／F 原因）／<code>setCertRow</code> 領取證書（E 證書編號／F 領取日期／G 簽收）／<code>addExpenseRow</code> 實際支出（自動搵下一個空收據行）。對位用學員編號優先、中文姓名後備</li>
          <li>🔄 <b>讀寫合約齊晒</b>：<code>getCourseSheetRaw</code> 讀全文 → 改 → 寫返班 Sheet。將來職員前端（每班獨立，唔入區系統）就係靠呢套；職員以後唔使再開 Google Sheet，班 Sheet 純做每班獨立數據庫</li>
          <li>ℹ️ 純訓練班模版更新，<b>唔使換主後台 Code.gs</b>（health check 維持 v4.14.0）。<b>新開班</b>用新模版一鍵建表；<b>舊班</b>要寫入功能先將新模版覆蓋貼上（千祈唔好重跑 setup，會清空）。member-portal <b>唔使改</b></li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.14.0 — 🆕 新制直入試驗：區系統填設定＋自動建班 Sheet＋12 張網頁列印</h3>
        <ul>
          <li>🆕 <b>訓練班管理加「新制直入」分頁</b>（同舊制並存）：成份開班設定（Input01／02／03＋通告人手格）喺區系統填，撳掣即由<b>總模版自動複製</b>班 Sheet＋寫入＋開班登記，仲可以自動分享畀班領導人——<b>連建表都慳返</b></li>
          <li>🔄 <b>雙向同步</b>：呢邊改 → 寫入返班 Sheet；職員喺 Sheet 改（名單／實支／證書）→ 呢邊「由班 Sheet 重讀」即時睇返。舊制人手班睇得＋印得（只讀）</li>
          <li>🖨 <b>12 張列印全部網頁版</b>：通告（複用傳統版式＋FPS QR）／取錄／合格／學員／出席／接納通知書／班職員／收支／財政預算／總會資助／完成報告／領取證書——直接列印 PDF，唔使開 Sheet</li>
          <li>⚠️ 要換新 <code>Code.gs</code>（v4.14.0）→ <code>setupSheets()</code>（自動補 CourseLinks 兩欄＋總模版 Config）→ 重新部署；另開一張空白 Sheet 跑訓練班模版 <code>setupCourseSheet()</code> 做<b>總模版</b>，ID 填入 Config <code>COURSE_TEMPLATE_ID</code>。收報名：CL 喺班 Sheet 用 🎓 選單「🔑 產生 API Key」→ 部署 → 貼返 <code>/exec</code>＋key（唔好跑一鍵建表，會清空）。member-portal <b>唔使改</b></li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.13.0 — 📘 訓練班工作簿跟足開班文件格式＋ CL 填一次</h3>
        <ul>
          <li>📘 <b>收表 Script 模版重寫做足全本工作簿</b>：Input01 預算（8 大開支分類＋公式）、Input02 資料（黃格自動帶入＋✓上通告剔格＋20 個預設職位）、Input03 時間表、Input04 支出表、12 張 Print（通告／取錄／合格／學員／出席／接納／收支／班職員／資助／完成報告／財政預算／領取證書，全部自動由 Input／報名數據帶入）、表格回應 36 欄、參數 22 欄（110 項專章＋區會＋地域＋職位等）—— 分頁名／欄位／行位跟足實物，日後其他系統接入都認得</li>
          <li>✍️ <b>CL 填一次流程</b>：ADC 下載模版交 CL → CL 填 Input＋執 Print_通告（標題／節數／名額／截止／報名辦法／查詢自動帶入，只補參加資格／費用／服裝／備註）→ 交區總監審批 → PDF 交網頁管理員上載 ＋ ADC 喺平台開班登記，收費／名額／截止<b>唔使重打</b></li>
          <li>📜 <b>「從訓練班帶入資料」升級</b>：即時由該班 Sheet pull 通告內文（參加資格／費用說明／服裝／備註／查詢／報名辦法／署名代行／檔案編號／發出日期），只填空欄；報名辦法預設成員系統（唔用 Google Form）。通告加兩個欄 <code>feeNote</code>／<code>signupNote</code></li>
          <li>⚠️ 要換新 <code>Code.gs</code>（v4.13.0）→ <code>setupSheets()</code>（自動補兩欄）→ 重新部署；訓練班模版要更新：<b>新開班</b>用新模版一鍵建表，<b>舊班</b>將新模版覆蓋貼上就得（千祈唔好重跑 setup，會清空）。member-portal <b>唔使改</b></li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.12.0 — 📥 開班自動讀 Sheet + 📜 區通告列印 PDF</h3>
        <ul>
          <li>📥 <b>「🎓 訓練班管理」新增「由訓練班 Sheet 讀取」</b>：貼上該班收表 Script <code>/exec</code>＋API Key 一撳，名稱／名額／收費／日期場地／截止／班領導人聯絡等由 <code>Input01</code>／<code>Input02</code> 自動帶入，ADC 唔使再人手重打；已開班都可以用 <code>courseId</code> 重讀。主後台 <code>pullCourseProfile</code> → 該班 Script <code>getCourseProfile</code>（label 對位，容忍實填版同模版版行號差異）</li>
          <li>📜 <b>新卡片「區通告」</b>（職員專用，PDF only）：開新通告 → 掛接訓練班 →「⬇ 從訓練班帶入資料」預填節數／收費／名額／截止 → 補參加資格／備註 →「🖨 列印 PDF」出傳統通告格式（節數表／費用＋FPS QR／報名辦法／署名）→ 上載區網／交總會（圖書館自動收錄）→「↗ 回填訓練班」將區網 PDF 連結寫入 <code>noticeUrl</code>，成員系統該班即跳轉睇真通告</li>
          <li>🔢 <b>通告編號人手輸入</b>（跨類別共用，區內唔重複；只係建議下一個號碼）；報名辦法預設成員系統訓練班頁（Config <code>MEMBER_PORTAL_URL</code>），成員用內置報名表報名，唔再用 Google Form</li>
          <li>⚠️ 要換新 <code>Code.gs</code>（v4.12.0）→ <code>setupSheets()</code>（自動補 <code>Circulars</code> 表＋卡片＋權限）→ 重新部署；舊訓練班要將新收表模版覆蓋貼上先用到自動讀取（唔使重跑 setup）。member-portal <b>唔使改</b></li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.11.0 — 🎓 訓練班開班教學 + 收表 Script 模版下載</h3>
        <ul>
          <li>📥 <b>「🎓 訓練班管理」頁頂新增「開班前：下載收表 Script 模版 + 教學」</b>：一撳下載該班專用收表 Script（<code>Code.gs.course.js</code>），照住 7 步做 — 下載 → 開空白 Sheet → 貼上 → RUN SETUP（<code>setupCourseSheet()</code>）→ 部署 → 返嚟貼上 <code>/exec</code> 網址 + API Key + Drive 資料夾 ID → 儲存即完成</li>
          <li>📢 <b>儲存（啟用）即自動掛通告上成員系統</b>：<code>active=TRUE</code> 且未過截止日，成員系統 <code>listCourseLinks</code> 即刻顯示該班（連通告連結），成員即可報名；截止日一過自動收埋</li>
          <li>📁 <b>收表 Script 模版加強</b>：<code>setupCourseSheet()</code> 彈窗而家除咗顯示入數紙資料夾網址，仲會一併顯示<b>資料夾 ID</b>，方便直接貼落「入數紙 Drive 資料夾 ID」欄</li>
          <li>ℹ️ 純前端 + 模版更新，<b>唔使換主後台 Code.gs</b>（後台 health check 版本維持不變）；改咗模版後用 <code>cp gs/Code.gs.course.js public/downloads/Code.gs.course.js.txt</code> 同步下載檔</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.10.0 — 🏢 旅團探訪報告改做總會格式（一鍵出 Excel 交總會）</h3>
        <ul>
          <li>🏢 <b>「📊 探訪報告」頂頂新增「總會季度匯報」</b>：跟香港童軍總會官方「<b>區職員探訪區內旅團匯報</b>」表格 — 標題、期間（例如 2026年1月-3月）、區會、旅團總數 + 八欄（旅號／支部／與旅領袖會面／探訪日期／探訪方式／區職員探訪人數／區已經提供之支援之項目／地域-總會需要跟進之項目），<b>一鍵匯出 .xlsx 就可以直接交總會</b>，唔使再逐格抄</li>
          <li>✍️ <b>總會匯報欄</b>：與旅領袖會面（旅長／副團長／支部團長，有建議值揀）、探訪方式（面談／電話／WhatsApp／Email／其他）、區職員探訪人數、區已經提供之支援之項目 — 快速撳方塊<b>自動填「面談、1 人」</b>（最大機會，唔啱先改）；面見邊個／支援／跟進事後喺「最近登記 → 編輯」先補都得</li>
          <li>📏 匯報格式全自動：日期出「18.1.2026」、冇跟進出「NA」、冇填人數當 1、旅號細到大排好；一筆記錄 = 一行（同旅同日電話一筆 Email 一筆都照分行，跟總會樣本）</li>
          <li>👥 <b>幹部努力統計照舊有</b>（邊個探咗幾多次、探過邊啲旅、未探名單）— 標明係<b>內部</b>，唔會出現喺交總會嗰份 Excel；內部詳細 CSV 都保留</li>
          <li>⚙️ 後台 <code>Visits</code> 表自動加 <code>leaderMet</code>／<code>method</code>／<code>officerCount</code>／<code>support</code> 四欄；<code>getVisitBoard</code> 回傳區會名做表頭。冇升級嘅舊後台都唔會壞（新欄自動略過）</li>
          <li>⚠️ 要換新 <code>Code.gs</code>（v4.10.0）→ 跑一次 <code>setupSheets()</code>（舊 <code>Visits</code> 表自動補四欄，舊資料全部保留）→ 重新部署</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.9.0 — 🎖 獎勵規則修訂 · 消息搬主控台頂 · 聯絡簿改姓名 · 月曆 · 卡片自排</h3>
        <ul>
          <li>🎖 <b>獎勵規則（用戶提供）</b>：長期服務改成 LAY 階梯 — <b>五年獎狀（服務 5 年）→ 十年獎狀（＋5）→ 長期服務獎章（共 15 年）→ 一／二／三星（每 10 年）</b>全部自動推算；<b>香港總監嘉許、高級嘉許、民青局局長嘉許、感謝狀</b>全部改為<b>自行申請，唔會自動推算</b>（高級嘉許唔再由總監嘉許年份計）。貼新 <code>Code.gs</code> → <code>setupSheets()</code> 會自動升級舊設定（你自己改過嘅數值唔會被掂，想套用新預設就喺年期設定撳「↺ 套用建議年期」）</li>
          <li>🗓 <b>民青局局長嘉許有提名期</b>：新提名期「hab」— 區→總會 01-15、總會→民青局 02-03（2026 年度實例 2/3 前交）— 喺「⚙️ 年期設定」可以改，提名頁同提示橫額會倒數</li>
          <li>🚫 名冊狀態新增「<b>沒有提名資格</b>」— 揀咗嘅人無論如何都唔會出現喺提名建議</li>
          <li>🔒 <b>獎勵提名只限 DDC 或以上</b>進入（超管／DC／DDC）；ADC／區職員／區長領袖由 v4.9.0 起睇唔到張卡</li>
          <li>📢 <b>消息發佈搬咗去主控台最頂</b>：一入管理系統就編到（<b>ADC 層級 3 或以上</b>直接新增／編輯／刪除／置頂／下架），唔使再搵卡片 — news 卡片已移除。刪除改為<b>軟刪除</b>：Sheet 留底曾經出現過嘅消息（deleted=TRUE），仲可以一撳還原；/news 變成「完整紀錄」頁</li>
          <li>📇 <b>「聯結簿」改名「聯絡簿」</b>；地域職員<b>姓名可以由 ADC+ 直接改</b>（電話唔變但人會轉）— 改完全區同步，留空即還原官方同步名（存後台 <code>ContactNames</code> 表）</li>
          <li>🏛 <b>地域架構</b>：7 區區總監合併做一個大格，一眼睇晒邊個區邊個做區總監</li>
          <li>🏢 <b>地域房間</b>：預設改為「<b>📅 月曆</b>」模式 — 成個月格仔逐日列晒邊個房邊段時間有人用（可以篩樓層、點日子睇詳情）；逐間房／今日總覽／原版日曆照舊</li>
          <li>🧩 <b>主控台卡片可以自己排次序</b>：拖拽或者 ▲▼ 掣，次序存喺瀏覽器（各用戶各自記住），有「↺ 還原預設次序」；手機版卡片加大更好撳</li>
          <li>🎭 <b>模擬示範版</b>：未登入都可以試晒成個系統 — 登入頁／「🌏 使用地區」有「🎭 模擬示範版」入口（或直接開 <code>?demo=1</code> 連結），一鍵以助理區總監（ADC）身份示範（管理系統大部分都係 ADC 處理），示範版權限全開，咩功能都試到。全部資料屬虛構示範、<b>只存喺你嘅瀏覽器</b>，絕對唔會寫入任何區方後台</li>
          <li>⚠️ 要換新 <code>Code.gs</code>（v4.9.0）→ <code>setupSheets()</code>（自動補 <code>ContactNames</code> 表同 News 新欄，舊資料全部保留）→ 重新部署</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.8.1 — 🏕 旅團探訪（揀方塊 → 儲存 · 一日一個旅一次）</h3>
        <ul>
          <li>🔒 <b>一日一個旅淨係一次</b>：同一日撳返同一個旅（就算轉支部）唔會再入多一筆 —— 方塊會鎖住兼標「呢日已登記」，後台都會擋。同一日探 X、Y、Z 幾個旅照樣得；下個月再探返同一個旅亦都得</li>
          <li>🗺 <b>探訪登記</b>：全區 28 個旅排成<b>方塊磚</b>，未探紅框、探過綠框。撳方塊 = 揀咗（藍色 ✔），一次過可以揀幾個旅，撳「💾 儲存登記」先會入數 —— <b>未撳 Save 唔會寫後台</b></li>
          <li>📆 日期預設今日，<b>Save 嗰日就係探訪日期</b>；聽日入返嚟就係新一日，方塊自動清零，同一個旅今個月探完下個月再探，再撳過就得</li>
          <li>🛡 防呆：揀咗未儲存想離開會提你、儲存前列清單畀你確認、寫唔入嗰啲會留返喺度再試；第二位幹部同一日探同一個旅會問清楚先加佢名下嗰筆</li>
          <li>🎯 <b>一入去只睇自己支部</b>：小童軍 ADC 就淨係見有小童軍團嘅旅，幼童軍／童軍同理；想睇其他支部頂部㩒一下就轉，會記住你嘅揀擇</li>
          <li>📊 <b>DC 報告</b>：揀「由幾月到幾月」（有本季／全年／上下半年／童軍年度快捷掣）→ 即刻有探訪 list、<b>邊個幹部探咗幾多次同探過邊啲旅</b>、仲有邊幾旅未探，一鍵匯出 CSV 交總會</li>
          <li>⚙️ <b>旅團名單</b>：預設已經入咗港島地域官網嘅筲箕灣區 28 個旅（連主辦機構、五個支部團數），可以自己改或者貼上；改完「活動知會」「聯絡簿」嘅旅號清單一齊更新</li>
          <li>⚠️ 要換新 <code>Code.gs</code>（v4.8.1）→ <code>setupSheets()</code>（會建立 <code>Units</code>／<code>Visits</code> 兩張表）→ 重新部署</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.7.3 — ✅ 頒完獎，打勾就登記到新獲獎人</h3>
        <ul>
          <li>✅ 「🏅 提名建議」每行前面多咗一個剔格：頒完獎打勾 → 撳「<b>登記 N 項獲獎</b>」，即刻寫返落名冊（獲獎年份 = 你揀嗰個頒獎年份），佢哋跟住自動跳去計下一級</li>
          <li>🧷 同一個人一次過攞多過一個獎都得，會合併一次過寫</li>
          <li>🛡 後台改為<b>只更新你有改嘅欄</b>：淨係登記獎項年份，唔會清走旅團／職位／服務開始年份／備註</li>
          <li>➕ 加新獲獎領袖仍然有齊三條路：提名建議打勾登記、名冊「＋ 新增成員／編輯」、「⬆️ 匯入名單」貼 Excel</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.7.2 — 🔔 一入獎勵頁就話你知邊個可以被提名</h3>
        <ul>
          <li>🔔 <b>提示橫額</b>：一撳入「🎖 獎勵提名」，最頂即刻話你「而家有 X 位領袖夠期，可以提名」，分開創辦人紀念日／大會操，仲會顯示<b>距區部死線幾多日</b>，🔥 逐個名列埋出嚟</li>
          <li>🔥 <b>名冊標亮</b>：夠期嗰啲人喺「📋 獎勵名冊」會<b>成行標紅</b>、掛住「🔥 可提名」牌，自動排最前；有「只睇夠期可提名」篩選，可以揀標亮邊一年；匯出 CSV 都有「可提名」一欄</li>
          <li>🎖 <b>長期服務獎章</b>：第一個（15 年）唔再自動推算，由你自己入紀錄；<b>一星之後</b>系統照樣每 10 年提你</li>
          <li>📆 「無 → 優良服務獎章」呢一級照設定住（服務滿 7 年），但要慢慢儲返全區領袖嘅<b>委任／服務開始年份</b>先計得到，未填嘅頁面會提你</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.7.1 — 🎖 獎勵年期修訂（跟返實際規則）</h3>
        <ul>
          <li>📆 名冊新增「<b>服務開始</b>」一欄（開始服務／首次委任年份）。<b>優良服務獎章</b>同<b>長期服務獎章</b>係由呢個年份計起，唔係跟上一級</li>
          <li>⏱ 年期跟返實際規則：服務滿 <b>7 年</b> → 優良服務獎章 → <b>5 年</b> → 優異服務獎章 → <b>7 年</b> → 功績榮譽獎章 → <b>5 年</b> → 功績榮譽十字章；獅勳章<b>冇固定年期</b>（有十字章就會列出，標「冇年期規定」）；長期服務獎章 <b>15 年</b>，其後每 <b>10 年</b>加一星</li>
          <li>⚠️ 提名頁會提你「<b>X 人未填服務開始年份</b>」——未填就計唔到入門級嘅獎</li>
          <li>↺ 年期設定加「<b>套用建議年期</b>」掣，一撳還原內建建議（要撳儲存先生效）</li>
          <li>⬆️ 匯入識讀「<code>86th since 2004/01/15</code>」呢類轉會註記做服務開始年份；表頭寫「服務開始」都得</li>
          <li>⚠️ 要換新 <code>Code.gs</code> → <code>setupSheets()</code>（自動補「服務開始」欄）→ 重新部署 → 再喺「⚙️ 年期設定」撳「↺ 套用建議年期」→ 儲存</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.7.0 — 🎖 獎勵提名（名冊 · 自動計夠期 · 年期自己改）</h3>
        <ul>
          <li>🏅 <b>提名建議</b>：揀年份，即刻列出邊個夠期可以提名下一級，分「創辦人紀念日獎勵」「童軍獎勵（大會操）」「自行申請」三組，等最耐嘅排最前，仲有提名截止日倒數同一鍵匯出名單</li>
          <li>📋 <b>獎勵名冊</b>：全區記錄一頁睇晒，可搜尋、按狀態／已有獎項篩選，新增編輯刪除；未確定年份可以寫「2025?」</li>
          <li>⚙️ <b>年期設定</b>：每個獎跟邊個、要相隔幾多年、屬邊個提名期，全部喺網頁改，改完即刻生效；仲可以自己加新獎項（Sheet 會自動補欄）</li>
          <li>⬆️ <b>匯入名單</b>：由你原本份 Excel 直接複製貼上，識得讀 <code>GSA1985</code>、<code>LSM*2005</code>、<code>CCM2025?</code>，亦支援「表頭 + 淨係年份」；可合併更新或清空重寫</li>
          <li>內建 18 個獎項（優良／優異服務獎章、功績榮譽獎章／十字章、銅銀金獅、長期服務獎章及一至四星、香港總監嘉許／高級嘉許、民政及青年事務局局長嘉許、五年／十年獎狀、感謝狀）</li>
          <li>後台 4.7.0：新增 <code>Awards</code> 同 <code>AwardTypes</code> 兩張表；貼新 <code>Code.gs</code> → <code>setupSheets()</code>（補建唔清空）→ 重新部署</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.6.2 — 消息欄位對齊成員系統（要換新 Code.gs）</h3>
        <ul>
          <li>📢 成員系統首頁「最新消息」而家<b>睇到內容同顏色</b>：佢嗰邊讀 <code>content</code> 同 <code>level = info / warning / important</code>，舊後台回嘅係 <code>body</code> 同 <code>warn / urgent</code> ——兩邊都唔會報錯，但成員只會見到<b>空白內容、全部藍色</b>。後台 4.6.2 已對齊</li>
          <li>🎨 <code>/news</code> 類別維持三揀一（🔵 一般／🟡 請留意／🔴 緊急），Sheet 舊資料唔使改，讀寫時自動對應</li>
          <li>🔔 成員系統新加嘅「通告圖書館推送」行 Supabase + Web Push，<b>唔經本後台</b>，區職員唔使做嘢</li>
          <li>🧪 新增 <code>node scripts/check-member-alignment.js</code>：成員系統每次更新後一跑，就知有冇 action 缺漏、欄位名對唔上、或者 proxy 放行咗唔應該公開嘅 action</li>
          <li>⚠️ 請下載新 <code>Code.gs</code> 貼上去 → 執行 <code>setupSheets()</code> → 重新部署，健康檢查應顯示 <code>version 4.6.2</code></li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.6.1 — 一次過借多款物資（一張申請一次批）</h3>
        <ul>
          <li>📦 成員系統一張表揀幾款物資，而家後台原生收（<code>submitStockBatchRequest</code>）：<b>全部夠貨先寫入</b>，任何一款唔夠貨就成批唔寫，唔會出現「寫咗一半」；同一款揀兩次自動合併數量</li>
          <li>🧾 <b>物資借用審批</b>頁面：同一張申請嘅幾款物資合成一組顯示，可以「✅ 一次過批准」「📥 整批歸還」「✕ 整批拒絕」——庫存逐款加減，申請人只收一封通知（唔會收 N 封）</li>
          <li>📨 區職員都只會收到一封「新借物資申請（N 款）」通知</li>
          <li>後台 4.6.1：<code>StockRequests</code> 加 <code>batchRef</code> 欄（<code>setupSheets()</code> 自動補，唔清空）、新增 <code>setStockBatchStatus</code>；單件申請一切照舊</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.6.0 — 消息發佈（成員系統首頁置頂）</h3>
        <ul>
          <li>📢 新卡片 <b>消息發佈</b>（/news）：寫標題＋內容就發到<b>成員系統 member-portal 首頁頂部置頂顯示</b>；呢邊一刪／一下架，嗰邊下次載入即刻消失（純拉取顯示，冇推送）</li>
          <li>🗓 可揀日期（填將來日期＝到嗰日先出現）、<b>自動落架日</b>（過咗自動消失）、類別（🔵 一般／🟡 請留意／🔴 緊急）、詳情連結</li>
          <li>👀 主控台頂部同樣顯示置頂消息，同成員睇到嘅係同一份資料，發完即刻核對到</li>
          <li>🔐 權限：卡片 <code>news</code> = ✏️ 先可以發佈／刪除（預設 DC／SYSADMIN／副區總監（行政・訓練）／區職員），其餘只可睇</li>
          <li>後台 4.6.0：新增 <code>News</code> 工作表 + 公開 action <code>listAnnouncements</code>（成員系統用），另 <code>getAnnouncements</code>／<code>saveAnnouncement</code>／<code>deleteAnnouncement</code>／<code>setAnnouncementPinned</code>／<code>setAnnouncementActive</code>；貼新 <code>Code.gs</code> → 執行 <code>setupSheets()</code>（補建唔清空）即可</li>
        </ul>
      </div>
      <div className="info-card">
        <h3>v4.5.0 — 區年度預算 + 地域房間使用情況 + 聯結簿自動同步 + 地域及總會架構</h3>
        <ul>
          <li>📑 <b>區年度預算</b>完成：直接讀區方 Google Sheet「2025-26 Year Plan」（月份／支部／活動／原收費／人數／區資助／CC 申報／狀態），按月份／按支部／全部活動三種睇法，頂部有全年資助、已完成金額、按類別／支部小計；DC 照舊喺 Sheet 改，10 分鐘內自動同步。換另一張表：Config <code>BUDGET_SHEET_URL</code></li>
          <li>🏢 新卡片 <b>地域房間使用情況</b>（/rooms）：17／18／19 樓逐間房揀，即見「現在使用中／空置」、未來 7／14／30 日逐日時段（活動、單位、人數、聯絡人由事件標題自動拆出）；打通房（1704A／B／1704／1704+1705）互相計入；另有「今日總覽」一頁睇晒 11 間房及「原版日曆」</li>
          <li>📇 <b>聯結簿・港島地域</b>分頁只剩職員直線電話（搵人解決問題用），並<b>自動由港島地域網頁同步</b>職員姓名／電話；<b>總會</b>各署電話電郵亦自動由總會網頁同步。頁尾顯示網頁更新日期及同步時間，讀唔到時自動用內建備援（會標明）</li>
          <li>🏛 新卡片 <b>地域及總會架構</b>（/orgchart）：港島地域總監架構（地域總監→副／助理地域總監→區總監→地域總部總監→助理地域總部總監）及總會（香港總監諮議會＋執行委員會主要職位），職位換人自動跟官網更新；有搜尋</li>
          <li>🗑 刪除「週年會議文件」卡片（<code>setupSheets()</code> 會同步移除 Cards／Perms 舊行）</li>
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
        <p style={{ fontSize: 13.5 }}>貼上呢份 <a href="/downloads/Code.gs.txt" download="Code.gs.txt">Code.gs v4.15.0</a> 到 Apps Script，再執行選單「🧱 補建缺失表（不清空資料）」。只補唔洗，已填 Config／申請會保留。</p>
      </div>
    </>
  );
}
