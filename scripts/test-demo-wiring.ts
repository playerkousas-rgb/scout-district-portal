/**
 * 🎭 示範版駁線測試：lib/session.ts 路由 + lib/api.ts 攔截（v4.9.0）
 * 行法：node --experimental-strip-types scripts/test-demo-wiring.ts
 * 喺 Node 度 stub 埋 window/localStorage，驗證 demo 開著時 API 全行本地引擎。
 */
import assert from 'node:assert';

// ── 先 stub window（喺 import lib 模組之前定義都唔遲，啲函數係 call 時先讀） ──
const store = new Map<string, string>();
const storageStub = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
};
(globalThis as any).window = {
  localStorage: storageStub,
  sessionStorage: storageStub,
  location: { origin: 'http://demo.local' },
  history: { replaceState: () => {} },
  setInterval: () => 0,
  clearInterval: () => {},
};
(globalThis as any).localStorage = storageStub;
(globalThis as any).sessionStorage = storageStub;

let pass = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`); process.exitCode = 1; }
  })();
}

const { enterDemoRole, exitDemo, isDemoMode } = await import('../lib/demo/session.ts');
const { loadSession, saveSession, clearSession } = await import('../lib/session.ts');
const { api } = await import('../lib/api.ts');

await check('enterDemoRole(ddc)：mode 開著 + loadSession 行示範 session（level 2）', async () => {
  enterDemoRole('ddc');
  assert.strictEqual(isDemoMode(), true);
  const s = loadSession();
  assert.ok(s && s.level === 2 && String(s.email).indexOf('@demo') >= 0);
});

await check('api.getCards：demo 模式下唔打網絡，直接回示範卡片（有 awards，冇 news）', async () => {
  const s = loadSession()!;
  const r = await api.getCards(s.token);
  assert.ok(r.ok);
  const ids = (r.data || []).map(c => c.cardId);
  assert.ok(ids.indexOf('awards') >= 0);
  assert.strictEqual(ids.indexOf('news'), -1);
});

await check('api.getAwardsBoard：18 類型＋deadlineCfg（經 callGet 攔截）', async () => {
  const s = loadSession()!;
  const r = await api.getAwardsBoard(s.token);
  assert.ok(r.ok);
  assert.strictEqual((r.data as any).types.length, 18);
  assert.deepStrictEqual((r.data as any).deadlineCfg, { habDistrict: '01-15', habHq: '02-03' });
});

await check('api.extRegionStaff：外部資料都行示範版', async () => {
  const r = await api.extRegionStaff();
  assert.ok(r.ok && (r.data as any).rows.length === 5);
});

await check('saveSession／clearSession：demo 模式下行示範儲存（唔會掂真 session key）', async () => {
  const s = loadSession()!;
  saveSession({ ...s, displayName: '改名測試' });
  assert.strictEqual(loadSession()!.displayName, '改名測試');
  assert.strictEqual(store.has('portal_session_SKW'), false, '真 session key 唔應該被寫');
  clearSession();
  assert.strictEqual(loadSession(), null);
});

await check('exitDemo：mode 關掉 + loadSession 回 null + 借來嘅區都清走', async () => {
  enterDemoRole('adc'); // 之前 clear 咗，入多次
  assert.strictEqual(isDemoMode(), true);
  exitDemo();
  assert.strictEqual(isDemoMode(), false);
  assert.strictEqual(loadSession(), null);
  assert.strictEqual(store.get('portal_selected_district'), undefined, '進示範前冇揀區 → 離開時清走');
});

await check('exitDemo 後 api 唔會再行 demo（改行網絡路徑 → 連線失敗）', async () => {
  const r = await api.getAwardsBoard('demo-dc');
  assert.strictEqual(r.ok, false, '唔係 demo 引擎回應');
});

console.log(process.exitCode ? '\n部分測試失敗 ✗' : `\n全部通過（${pass} 項）✓`);
