#!/usr/bin/env node
/**
 * DEBIT NOTE 後台門禁整合測試（使用即開即刪的本機 mock，不接觸正式 Sheet）。
 *   node scripts/test-debit-note-gs.js
 */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const ts = require('typescript');

// 直接執行前端 lib/fps.ts，核對 GS 另行實作的 payload 沒有漂移。
function frontendFpsPayload(fpsId, amount, ref) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'fps.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(require, mod, mod.exports);
  return mod.exports.buildFpsPayload(fpsId, amount, ref);
}

const port = 18000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${port}/exec`;
const child = spawn(process.execPath, [path.join(__dirname, 'mock-gs-server.js')], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

async function post(body) {
  const response = await fetch(base, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ apiKey: 'dev', ...body }),
  });
  return response.json();
}
async function get(action, params = {}) {
  const url = new URL(base);
  url.searchParams.set('apiKey', 'dev'); url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return (await fetch(url)).json();
}
async function waitUntilReady() {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`mock server 提早退出：${output}`);
    try { await get('getHealthCheck'); return; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error(`mock server 啟動逾時：${output}`);
}
async function loginWithPassword(email, password) {
  let result;
  if (email === 'sheep') {
    // 模擬 Vercel：明文密碼不送至 Apps Script，只送橋接 HMAC 簽署的短效授權。
    const bridgeSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const assertion = JSON.stringify({ email: 'sheep', exp: Date.now() + 30_000, nonce: crypto.randomBytes(16).toString('hex') });
    const signature = crypto.createHmac('sha256', bridgeSecret).update(assertion).digest('hex');
    result = await post({ action: 'proxyMasterLogin', assertion, signature });
  } else {
    result = await post({ action: 'login', email, password });
  }
  assert.equal(result.ok, true, `${email}: ${result.error || '登入失敗'}`);
  return result.data;
}
async function login(email) {
  return loginWithPassword(email, 'LOCAL_MOCK_USER_PASSWORD_NOT_FOR_REAL_USE');
}

(async () => {
  await waitUntilReady();
  const cases = [
    ['dc@skwscout.org.hk', 'DC', true],
    ['ddc.admin@skwscout.org.hk', 'DDC_ADMIN', true],
    ['info@skwscout.org.hk', 'STAFF', true],
    ['ddc.training@skwscout.org.hk', 'DDC_TRAINING', false],
    ['adc.scout@skwscout.org.hk', 'ADC_SCOUT', false],
    ['sysadmin@skwscout.org.hk', 'SYSADMIN', true],
  ];
  for (const [email, role, expected] of cases) {
    const session = await login(email);
    const result = await get('getCards', { token: session.token });
    assert.equal(result.ok, true);
    const card = result.data.find(item => item.cardId === 'debitNote');
    assert.equal(!!card, expected, `${role} 卡片可見性`);
    if (expected) assert.equal(card.access, 'edit');
    console.log(`  ✓ ${role.padEnd(12)} ${expected ? '可使用 DEBIT NOTE' : '不能進入 DEBIT NOTE'}`);
  }

  // Script 維護超管刻意不在 Users 表；卡片及資料 API 都不能因此誤擋最高權限。
  const maintenance = await loginWithPassword('sheep', 'LOCAL_MOCK_LOGIN_NOT_FOR_REAL_USE');
  assert.equal(maintenance.role, 'SYSADMIN');
  assert.equal(maintenance.level, 0);
  const users = await get('getUsers', { token: maintenance.token });
  assert.equal(users.ok, true, users.error);
  assert.ok(!users.data.some(user => String(user.email).toLowerCase() === maintenance.email.toLowerCase()), '測試必須覆蓋 Users 無列的維護超管');
  const maintenanceCards = await get('getCards', { token: maintenance.token });
  assert.equal(maintenanceCards.ok, true, maintenanceCards.error);
  const maintenanceCard = maintenanceCards.data.find(item => item.cardId === 'debitNote');
  assert.ok(maintenanceCard, 'Users 無列的 Script 維護超管必須看到 DEBIT NOTE');
  assert.equal(maintenanceCard.access, 'edit');
  assert.equal((await get('listDebitNotes', { token: maintenance.token })).ok, true, '維護超管可讀帳簿');
  console.log('  ✓ Script 維護超管無 Users 列仍可見卡片及讀取帳簿');

  // 預設未授權角色（ADC_SCOUT = ''）：list／save／import API 均拒絕。
  const dc = await login('dc@skwscout.org.hk');
  const adc = await login('adc.scout@skwscout.org.hk');
  for (const action of ['saveDebitNote', 'importDebitNotes']) {
    const denied = await post({ action, token: adc.token, note: {}, rows: [] });
    assert.equal(denied.ok, false, `未授權 ADC ${action} 必須被擋`);
  }
  assert.equal((await get('listDebitNotes', { token: adc.token })).ok, false);
  const sysadmin = await login('sysadmin@skwscout.org.hk');
  assert.equal((await get('listDebitNotes', { token: sysadmin.token })).ok, true);
  console.log('  ✓ 預設未授權 ADC 被擋；SYSADMIN 可讀帳簿');

  // 一般卡片 Perms 由管理員設定；YMIS 始終按明確角色白名單維持只讀。
  const bundle = await get('getPerms', { token: dc.token });
  assert.equal(bundle.ok, true);
  bundle.data.matrix.debitNote.ADC_SCOUT = 'view';
  bundle.data.matrix.ymis.ADC_SCOUT = 'edit';
  const savedPerms = await post({ action: 'savePerms', token: dc.token, matrix: bundle.data.matrix });
  assert.equal(savedPerms.ok, true);
  const after = await get('getPerms', { token: dc.token });
  assert.equal(after.data.matrix.debitNote.ADC_SCOUT, 'view');
  assert.equal(after.data.matrix.ymis.ADC_SCOUT, 'view');
  const adcCards = await get('getCards', { token: adc.token });
  assert.equal(adcCards.data.find(item => item.cardId === 'debitNote')?.access, 'view');
  assert.equal((await get('listDebitNotes', { token: adc.token })).ok, true, '👁 view 應可查閱帳簿');
  assert.equal((await post({ action: 'saveDebitNote', token: adc.token, note: {} })).ok, false, '👁 view 不可寫入帳簿');
  // 還原預設
  bundle.data.matrix.debitNote.ADC_SCOUT = '';
  bundle.data.matrix.ymis.ADC_SCOUT = 'view';
  await post({ action: 'savePerms', token: dc.token, matrix: bundle.data.matrix });
  console.log('  ✓ 管理員可自由切換 — / 👁 / ✏️ 並即時生效（不再硬鎖角色）');

  const note = {
    ref: '26-900', to: '整合測試收款人', attention: '測試先生', date: '2026-10-19',
    amount: '4,950.00', particulars: '後端帳簿整合測試', status: 'Pending payment', remarks: '本機 mock，不接觸正式資料', reminder: true,
  };
  const saved = await post({ action: 'saveDebitNote', token: dc.token, note });
  assert.equal(saved.ok, true, saved.error);
  assert.equal(saved.data.saved, true);
  assert.ok(saved.data.record.id);
  assert.equal(saved.data.record.amount, '4950.00');
  assert.equal(saved.data.record.reminder, true);
  assert.equal(saved.data.record.createdBy, dc.email);
  assert.equal(saved.data.record.fpsQrPayload, frontendFpsPayload('102866183', '4950.00', '26-900'));
  assert.equal((await post({ action: 'saveDebitNote', token: dc.token, note })).ok, false, '重複 Ref 不可另開新單');
  console.log('  ✓ 新增後端記錄、金額標準化、Ref 唯一性及 FPS payload 全通過');

  const maintenanceSaved = await post({ action: 'saveDebitNote', token: maintenance.token, note: {
    ...note, ref: '26-899', date: '2026-10-18', amount: '25', particulars: '維護超管保存測試',
  } });
  assert.equal(maintenanceSaved.ok, true, maintenanceSaved.error);
  assert.equal(maintenanceSaved.data.record.createdBy, maintenance.email);
  const maintenanceImported = await post({ action: 'importDebitNotes', token: maintenance.token, rows: [
    { ...note, ref: '26-898', date: '2026-10-17', amount: '30', particulars: '維護超管匯入測試' },
  ] });
  assert.equal(maintenanceImported.ok, true, maintenanceImported.error);
  assert.equal(maintenanceImported.data.imported, 1);
  assert.equal((await get('listDebitNotes', { token: maintenance.token })).data.length, 3);
  console.log('  ✓ Script 維護超管可實際 save／import，審計建立者正確');

  const staff = await login('info@skwscout.org.hk');
  const ddc = await login('ddc.admin@skwscout.org.hk');
  const staffList = await get('listDebitNotes', { token: staff.token });
  assert.equal(staffList.ok, true);
  assert.equal(staffList.data.length, 3);
  const updated = await post({ action: 'saveDebitNote', token: ddc.token, note: { ...note, id: saved.data.record.id, amount: '5000.50', status: 'Paid', reminder: false } });
  assert.equal(updated.ok, true, updated.error);
  assert.equal(updated.data.record.createdBy, dc.email, '更新不可改建立者');
  assert.equal(updated.data.record.updatedBy, ddc.email);
  assert.equal(updated.data.record.status, 'Paid');
  assert.equal(updated.data.record.reminder, false);
  assert.equal(updated.data.record.fpsQrPayload, frontendFpsPayload('102866183', '5000.50', '26-900'));
  console.log('  ✓ 四種角色共享帳簿；舊單更新保留建立者並更新 QR／審計欄');

  const importRows = [
    { ...note, ref: '26-901', amount: '100', date: '2026-10-20' },
    { ...note, ref: '26-900', amount: '999', date: '2026-10-20' },
    { ...note, ref: '26-902', amount: '200', date: '2026-10-21', reminder: false },
    { ...note, ref: '26-902', amount: '201', date: '2026-10-21' },
  ];
  const imported = await post({ action: 'importDebitNotes', token: sysadmin.token, rows: importRows });
  assert.equal(imported.ok, true, imported.error);
  assert.equal(imported.data.imported, 2);
  assert.equal(imported.data.duplicates, 2);
  assert.equal(imported.data.aborted, false);
  const afterImport = await get('listDebitNotes', { token: dc.token });
  assert.equal(afterImport.data.length, 5);
  assert.equal(afterImport.data[0].ref, '26-902', '列表應按日期新至舊');
  assert.equal(afterImport.data.find(row => row.ref === '26-901').reminder, true);
  assert.equal(afterImport.data.find(row => row.ref === '26-902').reminder, false);
  console.log('  ✓ CSV 整批匯入會略過現有及批內重複 Ref，不覆蓋舊單');

  const invalidBatch = await post({ action: 'importDebitNotes', token: staff.token, rows: [
    { ...note, ref: '26-903', amount: '300' },
    { ...note, ref: '26-904', amount: '0', sourceRow: 99 },
  ] });
  assert.equal(invalidBatch.ok, true);
  assert.equal(invalidBatch.data.aborted, true);
  assert.equal(invalidBatch.data.imported, 0);
  assert.equal(invalidBatch.data.errors[0].row, 99);
  assert.equal((await get('listDebitNotes', { token: dc.token })).data.length, 5, '有錯時整批不可寫一半');
  assert.equal((await post({ action: 'saveDebitNote', token: dc.token, note: { ...note, ref: '中文編號' } })).ok, false);
  console.log('  ✓ 無效批次整批 rollback；後端自行驗證金額及 Ref，唔信 client');

  const health = await get('getHealthCheck');
  assert.equal(health.data.version, '4.30.0');
  console.log('  ✓ setupSheets 補卡及 DebitNotes 帳簿成功，健康檢查版本 4.30.0');
  console.log('\n全部後台門禁及帳簿整合測試通過 ✓');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  child.kill('SIGTERM');
});
