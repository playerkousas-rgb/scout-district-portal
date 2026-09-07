/**
 * 意外報告列印／匯出 — 完全依照香港童軍總會行政署「意外報告」(ACC-RPT 2019/07) 兩頁版面。
 * 官方原稿：https://www.scout.org.hk/article_attach/631/ACC-RPT201907c.pdf
 *
 * 做法：開新視窗寫入 A4 直向 HTML（@page A4），用瀏覽器「列印／儲存為 PDF」輸出。
 * 「*請將不適用者刪去」嘅選項：已選 → 保留；不適用 → 加刪除線（同手填正本一致）。
 */
import type { IncidentReport, IncidentTimelineRow } from './types';

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function parseRows(v: unknown): IncidentTimelineRow[] {
  if (Array.isArray(v)) return v as IncidentTimelineRow[];
  const s = String(v ?? '').trim();
  if (!s) return [];
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; }
}

/** yyyy-mm-dd → {y,m,d}；其他格式原樣放喺年欄 */
function splitDate(s: string | undefined) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
  if (!m) return { y: String(s || ''), m: '', d: '' };
  return { y: m[1], m: String(Number(m[2])), d: String(Number(m[3])) };
}
/** HH:mm（24 小時）→ 上午／下午 + 12 小時制 */
function splitTime(s: string | undefined) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return { ampm: '', h: String(s || ''), min: '' };
  const h24 = Number(m[1]);
  const ampm = h24 < 12 ? '上午' : '下午';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { ampm, h: String(h12), min: m[2] };
}

const fill = (v: unknown, w = '') => `<span class="fill"${w ? ` style="min-width:${w}"` : ''}>${esc(v)}</span>`;
const line = (label: string, v: unknown, cls = '') => `<div class="line ${cls}"><span class="lbl">${label}</span>${fill(v)}</div>`;

/** 「*甲／乙」：選咗甲 → 乙加刪除線；未選 → 兩個都保留 */
function choice(options: string[], selected: string | undefined, sep = '／') {
  const sel = String(selected || '').trim();
  return '*' + options.map(o => {
    const on = sel && (o === sel || sel.indexOf(o) === 0);
    const off = sel && !on;
    return `<span class="opt${on ? ' on' : ''}${off ? ' x' : ''}">${esc(o)}</span>`;
  }).join(sep);
}
function timeLine(label: string, t: string | undefined) {
  const p = splitTime(t);
  return `<span class="lbl">${label}</span>${choice(['上午', '下午'], p.ampm)}${fill(p.h, '9mm')}時${fill(p.min, '9mm')}分`;
}

function rowsTable(rows: IncidentTimelineRow[], head2: string, minRows: number) {
  const list = rows.filter(r => (r.when || r.text));
  const total = Math.max(minRows, list.length);
  let html = `<table class="tl"><thead><tr><th style="width:26%">日期／時間</th><th>${head2}</th></tr></thead><tbody>`;
  for (let i = 0; i < total; i++) {
    const r = list[i];
    html += `<tr><td>${esc(r?.when || '')}</td><td>${esc(r?.text || '')}</td></tr>`;
  }
  return html + '</tbody></table>';
}

export function buildIncidentPrintHtml(r: IncidentReport, opts: { districtName?: string } = {}): string {
  const d = splitDate(r.accidentDate);
  const details = parseRows(r.details);
  const follow = parseRows(r.followUps);
  const stayDays = r.hospitalStay === '留院' ? r.hospitalDays : '';
  const title = `意外報告${r.refCode ? ` ${r.refCode}` : ''}`;

  const page1 = `
<section class="page">
  <div class="office">總會專用 Office Use Only<br>檔案編號 Ref. No.：<span class="fill" style="min-width:34mm"></span></div>
  <h1>香港童軍總會</h1>
  <h2>意外報告</h2>
  <div class="notes">
    <div class="notes-h">填表須知：</div>
    <ol>
      <li>此報告必須由活動負責人／導師／本會有關單位職員填寫，並必須於事發後 <b>7</b> 個工作天內將此報告的正本夾附活動通告（如適用）經由所屬童軍單位主管轉交總會行政署。如意外涉及嚴重傷亡，活動負責人／導師必須於 <b>3</b> 個工作天內通知總會行政署。</li>
      <li>意外報告所載資料均保密處理，只供內部使用。</li>
      <li>按保險條款的索償程序，在未獲得總會及保險公司的同意前，此報告或報告之副本不得發放予上述人士以外之其他童軍成員或外界人士（包括傷者），以免影響索償權益。</li>
    </ol>
  </div>

  <div class="line"><span class="lbl">意外發生日期：</span>${fill(d.y, '14mm')}年${fill(d.m, '9mm')}月${fill(d.d, '9mm')}日
    <span class="gap"></span>${timeLine('時間：', r.accidentTime)}</div>
  ${line('活動名稱：', r.activityName)}
  ${line('意外地點：', r.place)}
  ${line('舉辦單位：(中文)', r.organiser)}
  <div class="line"><span class="lbl">受傷部位（如：右腳等）：</span>${fill(r.injuryPart)}<span class="gap"></span><span class="lbl">傷勢（如：骨折等）：</span>${fill(r.injuryType)}<span class="small">(可選多於一項)</span></div>

  <div class="sec-h">傷者個人資料：</div>
  <table class="box"><tbody>
    <tr><td>
      <div class="line"><span class="lbl">姓名：(中文)</span>${fill(r.injuredNameZh)}<span class="lbl">(英文)</span>${fill(r.injuredNameEn)}</div>
      ${line('童軍成員編號／委任證或委任書編號：', r.scoutId)}
      <div class="line"><span class="lbl">身份証／護照號碼：</span>${fill(r.hkid)}<span class="small">(非童軍人士適用)</span>
        <span class="lbl">年齡：</span>${fill(r.age, '12mm')}<span class="lbl">${choice(['男', '女'], r.sex).replace('*', '*性別：')}</span></div>
      <div class="line"><span class="lbl">聯絡電話：</span>${fill(r.phone)}<span class="lbl">電子郵件：</span>${fill(r.email)}</div>
      ${line('住址：(中文)', r.address)}
      <div class="line"><span class="lbl">所屬單位／童軍旅：</span>${fill(r.unit)}<span class="lbl">職位：</span>${fill(r.position)}</div>
    </td></tr>
    <tr><td>
      <div class="sub-h">如傷者未滿 18 歲，請填寫以下資料：</div>
      <div class="line"><span class="lbl">家長／監護人姓名：(中文)</span>${fill(r.guardianName)}<span class="lbl">與傷者關係：</span>${fill(r.guardianRelation)}</div>
      <div class="line"><span class="lbl">聯絡電話：</span>${fill(r.guardianPhone)}<span class="lbl">電子郵件：</span>${fill(r.guardianEmail)}</div>
    </td></tr>
    <tr><td class="q">上述意外有否召救護車？ ${choice(['沒有', '有'], r.ambulanceCalled)}（如有，請填寫以下資料）</td></tr>
    <tr><td>
      <div class="line"><span class="lbl">召救護車者姓名：</span>${fill(r.ambCallerName)}<span class="lbl">聯絡電話：</span>${fill(r.ambCallerPhone)}</div>
      <div class="line"><span class="lbl">所屬單位／童軍旅：</span>${fill(r.ambCallerUnit)}<span class="lbl">職位：</span>${fill(r.ambCallerPosition)}</div>
      <div class="line">${timeLine('召救護車時間：', r.ambCallTime)}<span class="gap"></span>${timeLine('救護車到達時間：', r.ambArriveTime)}</div>
    </td></tr>
    <tr><td>
      <div class="line"><span class="lbl">送抵醫院／診所名稱：</span>${fill(r.hospital)}<span class="lbl">住院情況：</span>${choice(['當日出院', '留院'], r.hospitalStay)}(${fill(stayDays, '12mm')}天)</div>
      <div class="line"><span class="lbl">陪同往醫院／診所者姓名：</span>${fill(r.escortName)}<span class="lbl">聯絡電話：</span>${fill(r.escortPhone)}</div>
      <div class="line"><span class="lbl">所屬單位／童軍旅：</span>${fill(r.escortUnit)}<span class="lbl">職位：</span>${fill(r.escortPosition)}</div>
    </td></tr>
    <tr><td class="q">上述意外是否已報案？ ${choice(['否', '是'], r.policeReported)}（如是，請填寫以下資料）</td></tr>
    <tr><td><div class="line"><span class="lbl">負責辦理之警署</span>${fill(r.policeStation)}<span class="lbl">報案編號</span>${fill(r.policeCaseNo)}</div></td></tr>
    <tr><td class="q">上述意外有否目擊者？ ${choice(['沒有', '有'], r.hasWitness)}（如有，請填寫以下資料）</td></tr>
    ${[
      { n: r.witnessName, p: r.witnessPhone, s: r.witnessSex, a: r.witnessAddress, u: r.witnessUnit, po: r.witnessPosition },
      { n: r.witness2Name, p: r.witness2Phone, s: r.witness2Sex, a: r.witness2Address, u: r.witness2Unit, po: r.witness2Position },
    ].map(w => `<tr><td>
      <div class="line"><span class="lbl">目擊者姓名：(中文)</span>${fill(w.n)}<span class="lbl">聯絡電話：</span>${fill(w.p)}<span class="lbl">${choice(['男', '女'], w.s).replace('*', '性別：*')}</span></div>
      ${line('地址：(中文)', w.a)}
      <div class="line"><span class="lbl">所屬單位／童軍旅：</span>${fill(w.u)}<span class="lbl">職位：</span>${fill(w.po)}</div>
      <div class="small">（註：如有其他目擊者，請另紙填寫資料。）</div>
    </td></tr>`).join('')}
  </tbody></table>
  <div class="foot">${esc(opts.districtName || '')}${r.refCode ? ` · 系統編號 ${esc(r.refCode)}` : ''}<span class="right">ACC-RPT (2019/07)　第一頁</span></div>
</section>`;

  const page2 = `
<section class="page last">
  <div class="pnum">（第二頁）</div>
  <div class="sec-h">意外詳情：</div>
  ${rowsTable(details, '意外經過', 10)}
  <div class="small">（註：如此欄不敷應用，請另紙填寫。）</div>

  <div class="sec-h" style="margin-top:4mm">事發後之跟進工作：</div>
  ${rowsTable(follow, '跟進工作', 9)}
  <div class="small">（註：如此欄不敷應用，請另紙填寫。）</div>

  <div class="sign">
    <div class="sign-col">
      <div class="sub-h">*活動負責人／導師／本會有關單位職員</div>
      ${line('姓名 (中文)：', r.reporterName, 'sg')}
      ${line('職位：', r.reporterPosition, 'sg')}
      ${line('所屬單位／童軍旅：', r.reporterUnit, 'sg')}
      ${line('簽署：', '', 'sg tall')}
      ${line('日期：', r.reporterDate, 'sg')}
      ${line('聯絡電話：', r.reporterPhone, 'sg')}
      ${line('電子郵件：', r.reporterEmail, 'sg')}
    </div>
    <div class="sign-col boxed">
      <div class="sub-h">童軍單位主管專用</div>
      ${line('收到意外報告日期：', r.supervisorReceivedDate, 'sg')}
      <div class="stmt">本人已省閱上述意外報告。</div>
      ${line('所屬單位：', r.supervisorUnit, 'sg')}
      ${line('日期：', r.supervisorDate, 'sg')}
      ${line('單位主管簽署：', '', 'sg tall')}
      ${line('姓名：', r.supervisorName, 'sg')}
      ${line('備註：', r.supervisorRemark, 'sg')}
    </div>
  </div>
  <div class="del">*請將不適用者刪去</div>
  <div class="foot">${esc(opts.districtName || '')}${r.refCode ? ` · 系統編號 ${esc(r.refCode)}` : ''}<span class="right">ACC-RPT (2019/07)　第二頁</span></div>
</section>`;

  return `<!DOCTYPE html><html lang="zh-Hant-HK"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  @page{size:A4 portrait;margin:11mm 13mm;}
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;background:#e5e7eb;}
  body{font-family:"PMingLiU","MingLiU","Noto Serif TC","Songti TC","Times New Roman",serif;font-size:10.2pt;line-height:1.38;color:#000;}
  .bar{position:sticky;top:0;z-index:9;background:#003366;color:#fff;padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-family:system-ui,-apple-system,"PingFang HK",sans-serif;font-size:13px;}
  .bar button{background:#fff;color:#003366;border:0;border-radius:8px;padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer;}
  .bar .tip{opacity:.85;}
  .page{background:#fff;width:210mm;min-height:297mm;margin:12px auto;padding:11mm 13mm;position:relative;page-break-after:always;}
  .page.last{page-break-after:auto;}
  h1{font-size:15pt;text-align:center;margin:0;letter-spacing:.3em;}
  h2{font-size:14pt;text-align:center;margin:1mm 0 2mm;letter-spacing:.5em;text-decoration:underline;}
  .office{position:absolute;right:13mm;top:9mm;border:1px solid #000;font-size:8pt;padding:1.5mm 2mm;line-height:1.5;}
  .notes{margin:0 0 2.5mm;}
  .notes-h{font-weight:bold;text-decoration:underline;}
  .notes ol{margin:0;padding-left:5.5mm;font-size:9.4pt;}
  .notes li{margin:0 0 .6mm;}
  .line{display:flex;align-items:flex-end;flex-wrap:wrap;gap:0 1.5mm;margin:1.1mm 0;min-height:5.2mm;}
  .lbl{white-space:nowrap;}
  .fill{flex:1;min-width:18mm;border-bottom:1px solid #000;padding:0 1.5mm;min-height:4.6mm;line-height:1.3;word-break:break-all;}
  .gap{width:4mm;flex:0 0 4mm;}
  .small{font-size:8.4pt;white-space:nowrap;}
  .sec-h{font-weight:bold;text-decoration:underline;margin:2.2mm 0 1mm;}
  .sub-h{font-weight:bold;margin:0 0 .5mm;}
  table.box{width:100%;border-collapse:collapse;}
  table.box td{border:1px solid #000;padding:1.2mm 2mm;vertical-align:top;}
  table.box td.q{font-weight:bold;background:#f3f4f6;}
  .opt.x{text-decoration:line-through;}
  .opt.on{font-weight:bold;}
  table.tl{width:100%;border-collapse:collapse;}
  table.tl th,table.tl td{border:1px solid #000;padding:1.2mm 2mm;vertical-align:top;text-align:left;}
  table.tl th{font-weight:bold;text-align:center;background:#f3f4f6;}
  table.tl td{height:7.2mm;word-break:break-word;white-space:pre-wrap;}
  .sign{display:flex;gap:6mm;margin-top:5mm;}
  .sign-col{flex:1;}
  .sign-col.boxed{border:1px solid #000;padding:2mm 3mm;}
  .line.sg{margin:1.6mm 0;}
  .line.tall .fill{min-height:9mm;}
  .stmt{margin:2mm 0 1mm;}
  .del{margin-top:4mm;font-size:9pt;}
  .foot{position:absolute;left:13mm;right:13mm;bottom:6mm;font-size:7.5pt;color:#444;display:flex;justify-content:space-between;}
  .pnum{text-align:right;font-size:9pt;}
  @media print{
    html,body{background:#fff;}
    .bar{display:none!important;}
    .page{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none;}
    .page.last{page-break-after:auto;}
    .foot{position:fixed;bottom:0;}
  }
  @media screen and (max-width:820px){
    .page{width:auto;min-height:auto;margin:8px;padding:6mm;}
    .office{position:static;display:inline-block;margin-bottom:2mm;}
    .foot{position:static;margin-top:4mm;}
  }
</style></head><body>
<div class="bar">
  <button onclick="window.print()">🖨 列印／儲存為 PDF</button>
  <span class="tip">A4 直向兩頁 · 版面依總會行政署「意外報告」(2019/07) · 列印後由活動負責人簽署，經單位主管轉交行政署</span>
  <button onclick="window.close()" style="margin-left:auto;background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5)">關閉</button>
</div>
${page1}
${page2}
</body></html>`;
}

/** 開新視窗顯示可列印版本（需由使用者點擊事件同步呼叫，避免被瀏覽器攔截） */
export function openIncidentPrint(r: IncidentReport, opts: { districtName?: string } = {}): boolean {
  const html = buildIncidentPrintHtml(r, opts);
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

/** 下載 HTML 檔（彈出視窗被攔截時嘅後備；用瀏覽器開啟後再列印） */
export function downloadIncidentHtml(r: IncidentReport, opts: { districtName?: string } = {}) {
  const blob = new Blob([buildIncidentPrintHtml(r, opts)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `意外報告-${r.refCode || r.accidentDate || 'draft'}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
