#!/usr/bin/env node
/**
 * 卡片門禁結果分類測試：明確無卡與 transient API／連線錯誤不可混為一談。
 *   node scripts/test-card-access.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cardAccess.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
const stubs = {
  react: { useCallback: fn => fn, useEffect: () => {}, useState: () => [] },
  'next/navigation': { useRouter: () => ({}) },
  './api': { api: { getCards: async () => ({ ok: false, error: '測試應注入 getCards' }) } },
  './session': { loadSession: () => null },
  './useDistrict': { useDistrict: () => ({ withDistrict: value => value }) },
};
new Function('require', 'module', 'exports', js)(id => {
  if (stubs[id]) return stubs[id];
  throw new Error(`未處理的 module: ${id}`);
}, mod, mod.exports);

const { checkCardAccess } = mod.exports;
const card = { cardId: 'debitNote', title: 'DEBIT NOTE 生成' };

(async () => {
  const allowed = await checkCardAccess('token', 'debitNote', async () => ({ ok: true, data: [card] }));
  assert.deepEqual(allowed, { status: 'allowed' });
  console.log('  ✓ 成功回應且有卡 = allowed');

  const denied = await checkCardAccess('token', 'debitNote', async () => ({ ok: true, data: [] }));
  assert.deepEqual(denied, { status: 'denied' });
  console.log('  ✓ 成功回應且明確無卡 = denied');

  const apiError = await checkCardAccess('token', 'debitNote', async () => ({ ok: false, error: 'Apps Script 暫時失敗' }));
  assert.equal(apiError.status, 'error');
  assert.equal(apiError.error, 'Apps Script 暫時失敗');
  assert.notEqual(apiError.status, 'denied', 'API 錯誤不可當無權限');
  console.log('  ✓ API 錯誤保留 error，不會冒充 denied');

  const malformed = await checkCardAccess('token', 'debitNote', async () => ({ ok: true }));
  assert.equal(malformed.status, 'error');
  console.log('  ✓ 缺卡片陣列的異常回應不會當無權限');

  const offline = await checkCardAccess('token', 'debitNote', async () => { throw new Error('offline'); });
  assert.equal(offline.status, 'error');
  assert.match(offline.error, /offline/);
  console.log('  ✓ 連線例外保留可重試錯誤');

  console.log('\n全部卡片門禁分類測試通過 ✓');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
