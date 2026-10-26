#!/usr/bin/env node
/** 主控台捷徑：node scripts/test-dashboard-cards.js */
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
const visit = {
  cardId: 'visit', title: '旅團探訪', icon: '🏕', type: 'builtin', url: '/visit',
  order: 1, enabled: true, access: 'edit', category: 'done',
};
const ymis = { ...visit, cardId: 'ymis', url: '/ymis', order: 6, access: 'view' };
const original = JSON.stringify([visit]);
const result = dashboardCards([visit], superUser);
assert.equal(JSON.stringify([visit]), original, '不修改後台回應');
assert.ok(!result.some(c => c.cardId === 'troopDirectory'), '不再從 visit 偽造資料卡');
const directorySource = { ...visit, cardId: 'troopDirectory', title: '旅團資料', access: 'view', url: '/troop-directory' };
const directory = dashboardCards([directorySource, { ...visit, access: 'edit' }], superUser).find(c => c.cardId === 'troopDirectory');
assert.equal(directory.access, 'view', '獨立卡不繼承探訪的 edit');
assert.equal(directory.url, '/troop-directory');
assert.equal(isDashboardShortcut(directory), false, '是真實 Sheet 卡片');
assert.deepEqual(dashboardCards([directorySource], dc), [{ ...directorySource, embed: false }], 'visit 卡不存在也能有獨立資料卡');
assert.ok(!result.some(c => c.cardId === 'ymisWebsiteShortcut'), '不再新增直接外連 YMIS 卡');
assert.ok(!result.some(c => c.cardId === 'ymis'), '不偽造後台未授權的卡片');
assert.deepEqual(dashboardCards(result, superUser), result);
const actualYmis = dashboardCards([{ ...ymis, type: 'jump', url: YMIS_LOGIN_URL }], superUser)[0];
assert.equal(actualYmis.type, 'builtin');
assert.equal(actualYmis.url, '/ymis', '既有 YMIS 卡必須開舊版帳密內頁');
assert.equal(actualYmis.access, 'view');
console.log('✓ 移除官方網站捷徑；已獲授權的 YMIS 卡回到既有帳密內頁');

assert.ok(!dashboardCards([], dc).some(c => c.cardId === 'troopDirectoryShortcut'));
assert.ok(!dashboardCards([{ ...visit, enabled: false }], superUser).some(c => c.cardId === 'troopDirectoryShortcut'));
assert.equal(dashboardCards([{ ...visit, access: 'view' }], dc).some(c => isDashboardShortcut(c)), false);
console.log('✓ 不繞過角色、隱藏狀態或 visit 存取權，保留後台 YMIS 卡');

const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'app/page.tsx'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app/visit/page.tsx'), 'utf8');
const cardItem = fs.readFileSync(path.join(root, 'components/CardItem.tsx'), 'utf8');
assert.ok(home.includes('const defaults = dashboardCards(r.data, s)'));
assert.ok(home.includes('canToggle={superUser && !isDashboardShortcut(c)}'));
assert.ok(page.includes("requestedTab === 'units'"));
assert.ok(page.includes("withDistrict('/troop-directory'"));
const directoryPage = fs.readFileSync(path.join(root, 'app/troop-directory/page.tsx'), 'utf8');
assert.ok(directoryPage.includes("useRequireCard('troopDirectory')"));
assert.ok(directoryPage.includes('api.getTroopDirectoryBoard'));
assert.ok(!directoryPage.includes("useRequireCard('visit')"));
assert.ok(cardItem.includes('if (isDashboardShortcut(card)) return card.url;'), '官方 hash route 不得附加角色或區碼');
console.log('✓ 主控台接線、旅團資料深層連結及官方網址均已接上');
