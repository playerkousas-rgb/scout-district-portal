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
const directory = result.find(c => c.cardId === 'troopDirectoryShortcut');
assert.equal(directory.title, '旅團資料');
assert.equal(directory.url, '/visit?tab=units');
assert.equal(directory.access, 'edit');
assert.equal(isDashboardShortcut(directory), true, '捷徑不能使用 Sheet 卡片顯示開關');
const official = result.find(c => c.cardId === 'ymisWebsiteShortcut');
assert.equal(official.type, 'jump');
assert.equal(official.url, YMIS_LOGIN_URL);
assert.equal(official.access, 'view');
assert.ok(!result.some(c => c.cardId === 'ymis'), '不能偽造 YMIS 帳密權限');
assert.equal(isDashboardShortcut(official), true);
assert.deepEqual(result.map(c => c.cardId), ['visit', 'troopDirectoryShortcut', 'ymisWebsiteShortcut']);
assert.deepEqual(dashboardCards(result, superUser), result, '不重複加入捷徑');
console.log('✓ 超管看見旅團資料及官方 YMIS 入口，不會新增帳密權限');

for (const session of [dc, { role: 'STAFF', level: 4 }, { role: 'LEADER', level: 5 }]) {
  assert.ok(!dashboardCards([visit], session).some(c => c.cardId === 'ymisWebsiteShortcut'));
}
assert.equal(dashboardCards([ymis], superUser).length, 1, '已有真正 YMIS 卡時保留後台結果');
assert.equal(dashboardCards([ymis], superUser)[0], ymis);
assert.ok(!dashboardCards([], dc).some(c => c.cardId === 'troopDirectoryShortcut'));
assert.ok(!dashboardCards([{ ...visit, enabled: false }], superUser).some(c => c.cardId === 'troopDirectoryShortcut'));
const readonly = dashboardCards([{ ...visit, access: 'view' }], dc).find(c => isDashboardShortcut(c));
assert.equal(readonly.access, 'view', '旅團資料不得升級來源卡片的權限');
console.log('✓ 不繞過角色、隱藏狀態或 visit 存取權，保留後台 YMIS 卡');

const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'app/page.tsx'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app/visit/page.tsx'), 'utf8');
const cardItem = fs.readFileSync(path.join(root, 'components/CardItem.tsx'), 'utf8');
assert.ok(home.includes('const defaults = dashboardCards(r.data, s)'));
assert.ok(home.includes('canToggle={superUser && !isDashboardShortcut(c)}'));
assert.ok(page.includes("requestedTab === 'units'"));
assert.ok(page.includes("label: '⚙️ 旅團資料'"));
assert.ok(cardItem.includes('if (isDashboardShortcut(card)) return card.url;'), '官方 hash route 不得附加角色或區碼');
console.log('✓ 主控台接線、旅團資料深層連結及官方網址均已接上');
