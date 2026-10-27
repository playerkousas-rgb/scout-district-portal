#!/usr/bin/env node
/** 主控台卡片（v4.32.0 旅團合併卡）：node scripts/test-dashboard-cards.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', file + '.ts'), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(id => load(id.replace('./', '')), mod, mod.exports);
  return mod.exports;
}
const { dashboardCards, isDashboardShortcut, YMIS_LOGIN_URL } = load('dashboardCards');
const superUser = { role: 'SYSADMIN', level: 0 };
const dc = { role: 'DC', level: 1 };

// ── 新 GS：troop 入口卡 + 子權限偽卡 ──
const troop = {
  cardId: 'troop', title: '旅團', icon: '🏕', type: 'builtin', url: '/troop',
  order: 1, enabled: true, access: 'edit', category: 'done',
};
const subVisit = { ...troop, cardId: 'visit', type: 'subperm', subPerm: true, parentId: 'troop', access: 'view', url: '', order: 999 };
const subDirectory = { ...subVisit, cardId: 'troopDirectory', access: 'edit' };
const merged = dashboardCards([troop, subVisit, subDirectory], superUser);
assert.equal(merged.length, 1, '主控台只顯示一張旅團入口卡');
assert.equal(merged[0].cardId, 'troop');
assert.equal(merged[0].url, '/troop');
assert.ok(!merged.some(c => c.subPerm), '子權限偽卡不可在主控台出現');
console.log('✓ 新 GS：入口卡保留、子分頁偽卡過濾');

// ── 舊 GS 相容：visit／troopDirectory 兩張獨立卡合成一張 ──
const visit = {
  cardId: 'visit', title: '旅團探訪', icon: '🏕', type: 'builtin', url: '/visit',
  order: 1, enabled: true, access: 'edit', category: 'done',
};
const directorySource = { ...visit, cardId: 'troopDirectory', title: '旅團資料', access: 'view', url: '/troop-directory', order: 1.1 };
const original = JSON.stringify([visit, directorySource]);
const legacy = dashboardCards([visit, directorySource], superUser);
assert.equal(JSON.stringify([visit, directorySource]), original, '不修改後台回應');
assert.equal(legacy.length, 1, '舊兩卡合成一張旅團卡');
assert.equal(legacy[0].cardId, 'troop');
assert.equal(legacy[0].url, '/troop');
assert.equal(legacy[0].access, 'edit', '入口卡取兩卡最高級權限');
const directoryOnly = dashboardCards([directorySource], dc);
assert.equal(directoryOnly.length, 1);
assert.equal(directoryOnly[0].access, 'view', '只有資料唯讀權時入口卡亦唯讀');
assert.ok(!legacy.some(c => c.cardId === 'troopDirectory' || c.cardId === 'visit'));
console.log('✓ 舊 GS：兩卡合成旅團入口卡，唔改原陣列');

// ── 舊 GS 相容：獨立 activity 卡一併併入旅團 ──
const activitySource = { ...visit, cardId: 'activity', title: '活動知會', access: 'edit', url: '/activity-notices', order: 2 };
const withActivity = dashboardCards([directorySource, activitySource], superUser);
assert.equal(withActivity.length, 1, '舊 activity 卡併入旅團入口卡');
assert.equal(withActivity[0].cardId, 'troop');
assert.equal(withActivity[0].access, 'edit', '入口卡取舊卡最高級權限');
assert.equal(withActivity[0].description, '旅團探訪 · 旅團資料 · 活動知會');
assert.ok(!withActivity.some(c => c.cardId === 'activity'));
console.log('✓ 舊 GS：activity 獨立卡合成旅團入口卡');

// ── YMIS：照舊回內頁，唔偽造 ──
const ymis = { ...visit, cardId: 'ymis', url: '/ymis', order: 6, access: 'view' };
assert.ok(!legacy.some(c => c.cardId === 'ymisWebsiteShortcut'), '不再新增直接外連 YMIS 卡');
assert.ok(!legacy.some(c => c.cardId === 'ymis'), '不偽造後台未授權的卡片');
assert.deepEqual(dashboardCards(legacy, superUser), legacy, '重跑結果不變');
const actualYmis = dashboardCards([{ ...ymis, type: 'jump', url: YMIS_LOGIN_URL }], superUser)[0];
assert.equal(actualYmis.type, 'builtin');
assert.equal(actualYmis.url, '/ymis', '既有 YMIS 卡必須開舊版帳密內頁');
assert.equal(actualYmis.access, 'view');
console.log('✓ 移除官方網站捷徑；已獲授權的 YMIS 卡回到既有帳密內頁');

assert.ok(!dashboardCards([], dc).some(c => c.cardId === 'troopDirectoryShortcut'));
assert.ok(!dashboardCards([{ ...visit, enabled: false }], superUser).some(c => c.cardId === 'troopDirectoryShortcut'));
assert.equal(isDashboardShortcut(legacy[0]), false, '合成入口卡唔係舊捷徑卡');
console.log('✓ 不繞過角色、隱藏狀態或存取權，保留後台 YMIS 卡');

// ── 接線：/troop 主頁 + 舊網址轉向 ──
const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'app/page.tsx'), 'utf8');
const visitPage = fs.readFileSync(path.join(root, 'app/visit/page.tsx'), 'utf8');
const directoryPage = fs.readFileSync(path.join(root, 'app/troop-directory/page.tsx'), 'utf8');
const troopPage = fs.readFileSync(path.join(root, 'app/troop/page.tsx'), 'utf8');
const cardItem = fs.readFileSync(path.join(root, 'components/CardItem.tsx'), 'utf8');
const activityRedirectPage = fs.readFileSync(path.join(root, 'app/activity-notices/page.tsx'), 'utf8');
const contactsPage = fs.readFileSync(path.join(root, 'app/contacts/page.tsx'), 'utf8');
const directoryPanel = fs.readFileSync(path.join(root, 'components/TroopDirectoryPanel.tsx'), 'utf8');
assert.ok(home.includes('const defaults = dashboardCards(r.data, s)'));
assert.ok(home.includes('canToggle={superUser && !isDashboardShortcut(c)}'));
assert.ok(troopPage.includes('VisitPanel') && troopPage.includes('TroopDirectoryPanel') && troopPage.includes('ActivityNoticesPanel'), '旅團頁包含探訪、公開資料及活動知會三大分頁');
assert.ok(!troopPage.includes('showContacts'), '私隱聯絡不再經旅團頁顯示');
assert.ok(activityRedirectPage.includes("query.set('tab', 'activity')"), '舊 /activity-notices 轉去旅團活動分頁');
assert.ok(contactsPage.includes('TroopContactsPanel') && contactsPage.includes("checkCardAccess(session.token, 'troopContacts')"), '聯絡簿按子權限顯示私隱聯絡');
assert.ok(!directoryPanel.includes('TroopContactsPanel'), '公開旅團資料面板不再混入私隱聯絡');
assert.ok(!fs.existsSync(path.join(root, 'app/unit/page.tsx')), '旅團管理系統佔位頁已刪');
assert.ok(troopPage.includes("checkCardAccess(s.token, id)"), '旅團頁按子權限逐項檢查');
assert.ok(visitPage.includes('/troop?'), '舊 /visit 轉去 /troop');
assert.ok(visitPage.includes("tab === 'units'"), '舊 tab=units 轉去資料分頁');
assert.ok(directoryPage.includes("query.set('tab', 'directory')"), '舊 /troop-directory 轉去資料分頁');
assert.ok(cardItem.includes('if (isDashboardShortcut(card)) return card.url;'), '官方 hash route 不得附加角色或區碼');
console.log('✓ 主控台接線、旅團合併頁及舊網址轉向均已接上');
