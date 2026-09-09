/**
 * 📥 通告 URL 自動讀料測試
 * 行法：node --experimental-strip-types scripts/test-notice-parse.ts
 * 涵蓋：lib/notice-parse.ts — 真通告 2607（兩種排版變體結果一致）／
 *      標題／收費原價／名額／截止／資格／節次／聯絡／署名／HTML 帖文頁。
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractBadges, extractSubsidyNote, hkTodayISO, inferSection, mergePageExtras, parseNoticeHtml, parseNoticeText, pickPdfUrl, zhDateToISO,
} from '../lib/notice-parse.ts';

let pass = 0;
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`); process.exitCode = 1; }
}

console.log('通告 URL 自動讀料（parser）測試');

const here = dirname(fileURLToPath(import.meta.url));
const textA = readFileSync(join(here, 'notice-2607-a.txt'), 'utf8');
const textHead = readFileSync(join(here, 'notice-2607-head.txt'), 'utf8');
// 變體 B：逐字隔開（模擬 pdf-parse 最散嘅排版）
const textB = textA.replace(/([^\n])/g, '$1 ').replace(/ +/g, ' ');

const URL_2607 = 'https://www.skwscout.org.hk/wp-content/uploads/2026/05/2607.pdf';
const f = parseNoticeText(textA, { url: URL_2607, today: '2026-06-01' });
const head = parseNoticeText(textHead, { url: URL_2607, today: '2026-06-01' });

check('標題＝訓練班名', () => {
  assert.strictEqual(f.title, '社區參與章、公民章暨積極公民獎章系列訓練班');
});

check('真 PDF 通告頭之後仍揀到標題（唔會將會名當標題）', () => {
  assert.strictEqual(head.title, '社區參與章、公民章暨積極公民獎章系列訓練班');
});

check('真 PDF 通告頭之後仍讀到 5 節（header label 唔會截走節次表）', () => {
  assert.strictEqual(head.sessions.length, 5);
  assert.strictEqual(head.sessions[4]?.dateISO, '2026-09-16');
});

check('通告頭文字讀到檔案編號 2607＋發出日期 2026-05-22', () => {
  assert.strictEqual(head.fileNo, '2607');
  assert.strictEqual(head.fileNoFrom, 'text');
  assert.strictEqual(head.issueDate, '2026-05-22');
});

check('檔案編號／發出日期冇冒號都認，但唔誤認普通內文', () => {
  const noColon = textHead.replace('檔案編號：2607', '檔案編號2607').replace('發出日期：2026年5月22日', '發出日期2026年5月22日');
  const g = parseNoticeText(noColon, { url: URL_2607, today: '2026-06-01' });
  assert.strictEqual(g.fileNo, '2607');
  assert.strictEqual(g.fileNoFrom, 'text');
  assert.strictEqual(g.issueDate, '2026-05-22');
  assert.deepStrictEqual(g.warnings, []);
});

check('帶通告頭 2607 fixture 零警告', () => {
  assert.deepStrictEqual(head.warnings, []);
});

check('收費 100＋原價 200＋費用段全文', () => {
  assert.strictEqual(f.fee, '100');
  assert.strictEqual(f.originalFee, '200');
  assert.ok(f.feeText.includes('轉數快'));
});

check('資助說明：費用段「原價…資助」嗰句抽得出（v4.16.0）', () => {
  assert.ok(f.subsidyNote.startsWith('本活動原價港幣200元'), `應由「本活動原價」開始（而家：「${f.subsidyNote.slice(0, 20)}…」）`);
  assert.ok(f.subsidyNote.includes('青少年成員及童軍領袖訓練資助計劃'));
  assert.ok(f.subsidyNote.includes('減半'));
});

check('標題拆徽章：三個章齊（v4.16.0）', () => {
  assert.deepStrictEqual(f.badges, ['社區參與章', '公民章', '積極公民獎章']);
  assert.deepStrictEqual(extractBadges('第1屆急救工作坊'), []);
  assert.deepStrictEqual(extractBadges('公民章訓練班'), ['公民章']);
});

check('支部推斷：參加資格「童軍支部成員」→ 童軍（v4.16.0）', () => {
  assert.strictEqual(f.section, '童軍');
  assert.strictEqual(inferSection('深資童軍支部成員'), '深資童軍');
  assert.strictEqual(inferSection('任何樂行童軍'), '樂行童軍');
  assert.strictEqual(inferSection('中學生'), '');
});

check('名額 30＋截止 2026-07-08', () => {
  assert.strictEqual(f.quota, '30');
  assert.strictEqual(f.deadline, '2026-07-08');
});

check('參加資格全文（兩項齊）', () => {
  assert.ok(f.eligibility.includes('已宣誓及持有有效紀錄冊之童軍支部成員'));
  assert.ok(f.eligibility.includes('服務獎章'));
});

check('節次 5 節：日期＋時間＋地點拆得開', () => {
  assert.strictEqual(f.sessions.length, 5);
  assert.strictEqual(f.sessions[0]?.dateISO, '2026-07-20');
  assert.strictEqual(f.sessions[0]?.time, '下午七時至十時');
  assert.strictEqual(f.sessions[0]?.venue, '香港童軍百周年紀念大樓');
  assert.strictEqual(f.sessions[1]?.time, '上午九時半至下午五時');
  assert.strictEqual(f.sessions[1]?.venue, '筲箕灣區總部及公民教育資源中心');
  assert.ok((f.sessionsText.match(/；/g) || []).length === 4);
  assert.ok(f.venue.includes('香港童軍百周年紀念大樓'));
});

check('班領導人＋查詢聯絡（名／職位／電話／電郵）', () => {
  assert.strictEqual(f.leader, '楊德銘先生');
  assert.strictEqual(f.contactDetail.name, '胡凱雯小姐');
  assert.strictEqual(f.contactDetail.role, '副班領導人');
  assert.strictEqual(f.contactDetail.phone, '5721 1100');
  assert.strictEqual(f.contactDetail.email, 'civics@skwscout.org.hk');
  assert.strictEqual(f.contact, '胡凱雯小姐（副班領導人） 5721 1100 civics@skwscout.org.hk');
});

check('服裝／備註／報名辦法／署名代行', () => {
  assert.strictEqual(f.uniform, '整齊童軍制服');
  assert.ok(f.remarks.includes('全期出席'));
  assert.ok(f.signupText.includes('forms.gle/8AieRgzp5CE52zCZ7'));
  assert.strictEqual(f.signer, '袁可秀');
  assert.strictEqual(f.deputy, '楊德銘');
});

check('通告編號由檔名估到 2607（內文冇編號都得）', () => {
  assert.strictEqual(f.fileNo, '2607');
  assert.strictEqual(f.fileNoFrom, 'url');
});

check('排版變體 B（逐字隔開）結果同 A 一致', () => {
  const g = parseNoticeText(textB, { url: URL_2607, today: '2026-06-01' });
  for (const k of ['title', 'fee', 'originalFee', 'quota', 'deadline', 'leader', 'contact', 'fileNo'] as const) {
    assert.strictEqual(g[k], f[k], `欄 ${k} 不一致`);
  }
  assert.strictEqual(g.sessions.length, 5);
  assert.strictEqual(g.sessions[0]?.venue, '香港童軍百周年紀念大樓');
  assert.deepStrictEqual(g.warnings, f.warnings);
});

check('warnings：2607 零警告', () => {
  assert.deepStrictEqual(f.warnings, []);
});

check(' HH短日期截止：已過就推下一年', () => {
  assert.strictEqual(zhDateToISO('', '7', '8', '2026-06-01'), '2026-07-08');
  assert.strictEqual(zhDateToISO('', '7', '8', '2026-08-01'), '2027-07-08');
  assert.strictEqual(zhDateToISO('2026', '7', '8', '2026-08-01'), '2026-07-08');
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(hkTodayISO()));
});

check('空文字／掃瞄圖 PDF 有警告唔爆', () => {
  const e = parseNoticeText('   ', { today: '2026-06-01' });
  assert.strictEqual(e.title, '');
  assert.ok(e.warnings.length > 0);
});

check('HTML 帖文頁：og:title＋PDF 連結＋揀 uploads 嗰條', () => {
  const html = `<html><head><meta property="og:title" content="社區參與章訓練班"><title>後備標題</title></head>
  <body><a href="https://other.com/x.pdf">外站</a>
  <a href="/wp-content/uploads/2026/05/2607.pdf">通告PDF</a></body></html>`;
  const p = parseNoticeHtml(html);
  assert.strictEqual(p.title, '社區參與章訓練班');
  assert.strictEqual(p.pdfUrls.length, 2);
  assert.strictEqual(
    pickPdfUrl('https://www.skwscout.org.hk/2026/05/abc/', p.pdfUrls),
    'https://www.skwscout.org.hk/wp-content/uploads/2026/05/2607.pdf',
  );
});

check('帖文頁標籤：/tag/ 連結抽得出（percent-encoded 中文名都解到）', () => {
  const html = `<body>Tags:
  <a href="https://www.skwscout.org.hk/tag/%e5%85%ac%e6%b0%91%e7%ab%a0/">公民章</a>
  <a href="https://www.skwscout.org.hk/tag/%e7%ab%a5%e8%bb%8d%e6%94%af%e9%83%a8/">童軍支部</a>
  <a href="https://www.skwscout.org.hk/tag/%e8%a8%93%e7%b7%b4%e7%8f%ad/">訓練班</a></body>`;
  const p = parseNoticeHtml(html);
  assert.deepStrictEqual(p.tags, ['公民章', '童軍支部', '訓練班']);
});

check('mergePageExtras：標籤補徽章＋支部，唔覆蓋 PDF 讀到嘅料（v4.16.0）', () => {
  const pdfFields = parseNoticeText(textA, { url: URL_2607, today: '2026-06-01' });
  const page = parseNoticeHtml(`<body>
    <a href="/tag/%e7%a4%be%e5%8d%80%e5%8f%83%e8%88%87%e7%ab%a0/">社區參與章</a>
    <a href="/tag/%e5%85%ac%e6%b0%91%e7%ab%a0/">公民章</a>
    <a href="/tag/%e7%a9%8d%e6%a5%b5%e5%85%ac%e6%b0%91%e7%8d%8e%e7%ab%a0/">積極公民獎章</a>
    <a href="/tag/%e7%ab%a5%e8%bb%8d%e6%94%af%e9%83%a8/">童軍支部</a>
    <a href="/tag/%e8%a8%93%e7%b7%b4%e7%8f%ad/">訓練班</a></body>`);
  const m = mergePageExtras({ ...pdfFields, badges: [], section: '' }, page);
  assert.deepStrictEqual(m.badges, ['社區參與章', '公民章', '積極公民獎章']);
  assert.strictEqual(m.section, '童軍');
  // PDF 已讀到嘅嘢標籤唔會掂
  assert.strictEqual(m.title, pdfFields.title);
  assert.strictEqual(m.quota, pdfFields.quota);
  // 標籤「訓練班」唔會當徽章
  assert.ok(!m.badges.includes('訓練班'));
});

check('網頁擇要版（冇名額／班領導人／服裝／備註）→ 有警告提示貼 PDF', () => {
  const web = `社區參與章、公民章暨積極公民獎章系列訓練班
日期 時間 地點
2026年7月20日（星期一） 下午七時至十時 香港童軍百周年紀念大樓
參加資格：已宣誓及持有有效紀錄冊之童軍支部成員（港島地域成員將獲優先取錄）。
費用：活動費用港幣 100 元正
截止日期：2026年7月8日（星期三）
報名辦法：成員須填妥網上表格（網址：https://forms.gle/8AieRgzp5CE52zCZ7）`;
  const w = parseNoticeText(web, { url: 'https://www.skwscout.org.hk/2026/05/post/', today: '2026-06-01' });
  assert.strictEqual(w.fee, '100');
  assert.strictEqual(w.deadline, '2026-07-08');
  assert.strictEqual(w.section, '童軍');
  assert.ok(w.warnings.some(x => x.includes('名額')));
  assert.ok(w.warnings.some(x => x.includes('班領導人／服裝／備註')));
  assert.strictEqual(w.quota, '');
});

console.log(`\n共 ${pass} 項通過${process.exitCode ? '（有失敗）' : ''}`);
