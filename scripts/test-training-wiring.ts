/**
 * 🎯 開班登記精簡 — 接線 regression 測試
 * 行法：node --experimental-strip-types scripts/test-training-wiring.ts
 *
 * 防返之前嗰單 regression：「📥 由通告網址讀取」個 handler（readFromNotice）仲喺度，
 * 但表單個掣唔見咗（淨返教學字眼），用戶永遠撳唔到。
 * 呢度直接讀 app/training/page.tsx 原始碼驗接線，再驗
 * 「課程代碼留空＝自動編」喺三層都通：前端表單／示範引擎／GS 後台。
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

let pass = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`); process.exitCode = 1; }
  })();
}

const page = read('app/training/page.tsx');

// ── 兩個讀取掣都要喺度而且駁住個 handler（防「handler 仲喺、掣唔見咗」） ──
await check('「📥 由通告網址讀取」掣存在，駁住 readFromNotice（regression 主角）', () => {
  assert.ok(page.includes('onClick={readFromNotice}'), '表單要有 onClick={readFromNotice} 嘅掣');
  assert.ok(page.includes("{noticing ? '讀取中…' : '📥 由通告網址讀取'}"), '掣字眼要喺 JSX 按鈕度，唔淨止教學文字');
});

await check('「📥 由訓練班 Sheet 讀取」掣存在，駁住 pullFromSheet', () => {
  assert.ok(page.includes('onClick={pullFromSheet}'), '表單要有 onClick={pullFromSheet} 嘅掣');
  assert.ok(page.includes("{pulling ? '讀取中…' : '📥 由訓練班 Sheet 讀取'}"));
});

// ── 精簡版表單：三樣常駐喺 showAuto 區塊之前，自動填好嘅欄收埋喺區塊之後 ──
await check('常駐三樣：① 收表 Script ② Drive 資料夾 ③ 通告連結（收埋區之前）', () => {
  const autoIdx = page.indexOf('{showAuto && (');
  assert.ok(autoIdx > 0, '要有 {showAuto && (} 收埋區');
  for (const [name, marker] of [
    ['① 收表 Script', 'placeholder="① 收表 Script /exec 網址'],
    ['② Drive 資料夾', 'placeholder="② 入數紙 Drive 資料夾 ID"'],
    ['③ 通告連結', 'placeholder="③ 通告連結 noticeUrl'],
  ] as const) {
    const i = page.indexOf(marker);
    assert.ok(i > 0 && i < autoIdx, `${name} 要喺常駐區（收埋區之前）搵到`);
  }
});

await check('自動填好嘅欄（名稱／徽章／費用／截止⋯）收埋喺「🔍 自動填好嘅資料」區塊入面', () => {
  const autoIdx = page.indexOf('{showAuto && (');
  const endIdx = page.indexOf('自動展開俾你檢查', autoIdx);
  assert.ok(endIdx > autoIdx, '收埋區後面要有提示字眼（搵到區塊結尾）');
  for (const marker of ['placeholder="課程名稱 *"', 'placeholder="徽章名稱 badgeName"', 'placeholder="費用 fee"', 'placeholder="截止 deadline"', 'placeholder="節數 sessionsText']) {
    const i = page.indexOf(marker);
    assert.ok(i > autoIdx && i < endIdx, `${marker} 要收埋喺 showAuto 區塊入面`);
  }
  assert.ok(page.includes('🔍 自動填好嘅資料'), '要有「🔍 自動填好嘅資料」開關');
});

await check('v4.16.0 通告全文欄：班領導人／服裝／備註／報名辦法／費用全文 有得填（收埋區）', () => {
  const autoIdx = page.indexOf('{showAuto && (');
  const endIdx = page.indexOf('自動展開俾你檢查', autoIdx);
  for (const marker of [
    'placeholder="班領導人 leader"',
    'placeholder="服裝 uniform',
    'placeholder="報名辦法 signupText',
    'placeholder="費用全文 feeNote',
    'placeholder="備註 remarks',
  ] as const) {
    const i = page.indexOf(marker);
    assert.ok(i > autoIdx && i < endIdx, `${marker} 要喺 showAuto 區塊入面`);
  }
});

await check('readFromNotice 填晒通告全文欄（leader／uniform／remarks／signupText／feeNote／subsidyNote／badgeName／section）', () => {
  const i = page.indexOf('async function readFromNotice');
  const body = page.slice(i, page.indexOf('async function save()', i));
  for (const k of ['leader:', 'uniform:', 'remarks:', 'signupText:', 'feeNote:', 'subsidyNote:', 'badgeName:', 'section:'] as const) {
    assert.ok(body.includes(k), `readFromNotice 要填 ${k}`);
  }
  assert.ok(body.includes('f.badges.join'), '徽章要由 badges 串埋');
});

await check('讀取成功／編輯舊班都會自動展開收埋區（setShowAuto(true) ≥ 3 處）', () => {
  const n = page.split('setShowAuto(true)').length - 1;
  assert.ok(n >= 3, `setShowAuto(true) 應該起碼 3 處（Sheet 讀取／通告讀取／編輯），而家 ${n}`);
});

// ── 課程代碼留空＝自動編（前端唔再迫填） ──
await check('儲存唔再迫填課程代碼：舊驗證「課程代碼與名稱必填」要清咗佢', () => {
  assert.ok(!page.includes('課程代碼與名稱必填'), '舊必填驗證要移除');
  assert.ok(page.includes('課程名稱必填'), '改名稱做唯一必填');
  assert.ok(page.includes('留空＝自動編'), '表單要有「留空＝自動編」提示');
});

// ── 純 helpers 照常運作（lib/course-publish.ts） ──
const { parseQuickPaste, profileToLink } = await import('../lib/course-publish.ts');

await check('profileToLink：courseId 出場留空（交由後台自動編）＋帶齊班料', () => {
  const link = profileToLink({
    courseName: 'scratch_測試班', badge: '露營章', section: '童軍', fee: 250, quota: 24,
    deadline: '2026-10-01', leader: { name: '陳大文', title: '先生' }, staff: [], sessions: [],
    circular: { eligibility: '11 歲以上' },
  } as any, { scriptExecUrl: 'https://script.google.com/macros/x/exec', scriptApiKey: 'ck_demo123' });
  assert.strictEqual(link.courseId, '', 'courseId 留空＝後台自動編');
  assert.strictEqual(link.title, 'scratch_測試班');
  assert.strictEqual(link.contact.indexOf('陳大文'), 0);
  assert.strictEqual(link.eligibility, '11 歲以上');
  assert.strictEqual(link.scriptExecUrl, 'https://script.google.com/macros/x/exec');
});

await check('parseQuickPaste：/exec＋Key 兩行一次過貼都分得開', () => {
  const q = parseQuickPaste('https://script.google.com/macros/s/AKfycb.../exec\nck_Abc123XYZ');
  assert.strictEqual(q.exec, 'https://script.google.com/macros/s/AKfycb.../exec');
  assert.strictEqual(q.key, 'ck_Abc123XYZ');
});

// ── 後端兩層都撐「留空自動編 cl_…」 ──
await check('GS 後台 saveCourseLink_：courseId 留空 → genId_(\'cl\')', () => {
  const gs = read('gs/Code.gs');
  const i = gs.indexOf('function saveCourseLink_');
  assert.ok(i > 0, '搵到 saveCourseLink_');
  const body = gs.slice(i, i + 800);
  assert.ok(body.includes("genId_('cl')"), 'saveCourseLink_ 要有 genId_(\'cl\') 後備自動編號');
});

await check('示範引擎 saveCourseLink：courseId 留空 → genId(\'cl\')', () => {
  const eng = read('lib/demo/engine.ts');
  const i = eng.indexOf("case 'saveCourseLink'");
  assert.ok(i > 0, '搵到 saveCourseLink case');
  const body = eng.slice(i, i + 500);
  assert.ok(body.includes("genId('cl')"), '示範引擎都要自動編號');
});

console.log(`\n${pass} 項全過 ✓${process.exitCode ? '（有失敗）' : ''}`);
