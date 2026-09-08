/**
 * 🎭 模擬示範版引擎測試（v4.9.0）
 * 行法：node --experimental-strip-types scripts/test-demo-engine.ts
 * 示範身份統一：助理區總監（ADC）· 權限全開（mockAdmin）— 驗證
 * demoCall／demoExternal 同真後台語義一致（軟刪除、一日一旅一次、死線儲存…）。
 */
import assert from 'node:assert';
import { demoCall, demoExternal, resetDemoData } from '../lib/demo/engine.ts';
import { DEMO_TOKEN } from '../lib/demo/seed.ts';

let pass = 0;
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`); process.exitCode = 1; }
}

const T = { adc: 'demo-adc', bad: 'nope' };

resetDemoData();

// ── 1. 登入 ──
check('login：任何電郵密碼都入到同一個 ADC 示範身份（權限全開）', () => {
  const r = demoCall('login', { email: 'whatever@x', password: '' }, 'POST');
  assert.ok(r.ok);
  assert.strictEqual(r.data.role, 'ADC_SCOUT');
  assert.strictEqual(r.data.level, 3);
  assert.strictEqual(r.data.mockAdmin, true);
  assert.strictEqual(r.data.isAdmin, true);
  assert.strictEqual(r.data.canManageAccounts, true);
  assert.strictEqual(r.data.token, 'demo-adc');
});

// ── 2. 卡片 ──
check('getCards：權限全開 — 14 張卡全部 edit；有 awards；冇 news；壞 token 被擋', () => {
  const r = demoCall('getCards', { token: T.adc }, 'GET');
  assert.ok(r.ok);
  const ids = r.data.map((c: any) => c.cardId);
  assert.strictEqual(ids.length, 14);
  assert.ok(r.data.every((c: any) => c.access === 'edit'));
  assert.ok(ids.indexOf('awards') >= 0);
  assert.strictEqual(ids.indexOf('news'), -1, 'news 卡已移除（消息喺主控台頂）');
  const bad = demoCall('getCards', { token: T.bad }, 'GET');
  assert.strictEqual(bad.ok, false);
});

// ── 3. 消息：軟刪除＋公開過濾 ──
check('消息：發佈 → 軟刪除留底 → 還原；公開 list 永遠冇已刪／未到期', () => {
  const created = demoCall('saveAnnouncement', { token: T.adc, announcement: { title: '測試消息', body: '內容', date: '2099-01-01', pinned: false, level: 'info' } }, 'POST');
  assert.ok(created.ok && created.data.created);
  const id = created.data.id;

  const pub1 = demoCall('listAnnouncements', {}, 'GET');
  assert.strictEqual(pub1.data.some((a: any) => a.id === id), false, '將來日期唔應該出現喺公開 list');

  const del = demoCall('deleteAnnouncement', { token: T.adc, id }, 'POST');
  assert.ok(del.ok && del.data.deleted);
  const admin = demoCall('getAnnouncements', { token: T.adc }, 'GET');
  const row = admin.data.find((a: any) => a.id === id);
  assert.ok(row && row.deleted === true && row.deletedBy, '軟刪除要留底');

  const res = demoCall('restoreAnnouncement', { token: T.adc, id }, 'POST');
  assert.ok(res.ok && res.data.restored);
  const admin2 = demoCall('getAnnouncements', { token: T.adc }, 'GET');
  assert.strictEqual(admin2.data.find((a: any) => a.id === id).deleted, false);
});
check('消息：預設有一條已刪除示範行（an-04）；公開 list 過濾正確', () => {
  const admin = demoCall('getAnnouncements', { token: T.adc }, 'GET');
  const del = admin.data.find((a: any) => a.id === 'an-04');
  assert.ok(del && del.deleted === true && del.deletedAt && del.deletedBy);
  const pub = demoCall('listAnnouncements', {}, 'GET');
  assert.strictEqual(pub.data.some((a: any) => a.id === 'an-04'), false, '已刪消息唔可以出現喺公開 list');
  assert.ok(pub.data.some((a: any) => a.id === 'an-01' && a.pinned === true));
  const pinnedOnly = demoCall('listAnnouncements', { pinnedOnly: '1' }, 'GET');
  assert.ok(pinnedOnly.data.every((a: any) => a.pinned === true));
});
check('消息：未登入（壞 token）管理被擋', () => {
  const r = demoCall('saveAnnouncement', { token: T.bad, announcement: { title: 'x', body: 'y' } }, 'POST');
  assert.strictEqual(r.ok, false);
});

// ── 4. 獎勵（v4.9.0） ──
check('getAwardsBoard：18 類型＋deadlineCfg 預設＋counts 正確（ADC 權限全開攞到）', () => {
  const r = demoCall('getAwardsBoard', { token: T.adc }, 'GET');
  assert.ok(r.ok);
  assert.strictEqual(r.data.types.length, 18);
  assert.deepStrictEqual(r.data.deadlineCfg, { habDistrict: '01-15', habHq: '02-03' });
  assert.strictEqual(r.data.total, 16);
  assert.strictEqual(r.data.counts.LSM, 3, 'LSM 應該有 3 人（am-01/04/07）');
});
check('saveAwardDeadlines：收 YYYY-MM-DD 同 MM-DD；垃圾值保留原設定', () => {
  const r1 = demoCall('saveAwardDeadlines', { token: T.adc, habDistrict: '2026-01-20', habHq: '02-05' }, 'POST');
  assert.deepStrictEqual(r1.data.deadlineCfg, { habDistrict: '01-20', habHq: '02-05' });
  const r2 = demoCall('saveAwardDeadlines', { token: T.adc, habDistrict: 'garbage', habHq: '' }, 'POST');
  assert.deepStrictEqual(r2.data.deadlineCfg, { habDistrict: '01-20', habHq: '02-05' }, '垃圾值唔應該改');
  demoCall('saveAwardDeadlines', { token: T.adc, habDistrict: '01-15', habHq: '02-03' }, 'POST');
});
check('saveAwardMember：新增＋更新；LAY 階梯示範成員在冊', () => {
  const c = demoCall('saveAwardMember', { token: T.adc, member: { name: '測試新成員', troop: '999', position: 'SL', serviceStart: '2010', status: 'active', awards: {} } }, 'POST');
  assert.ok(c.ok && c.data.created);
  const u = demoCall('saveAwardMember', { token: T.adc, member: { id: c.data.id, awards: { FIVE: '2015' } } }, 'POST');
  assert.ok(u.ok && !u.data.created);
  const board = demoCall('getAwardsBoard', { token: T.adc }, 'GET');
  const m = board.data.members.find((x: any) => x.id === c.data.id);
  assert.strictEqual(m.awards.FIVE, '2015');
  assert.strictEqual(m.name, '測試新成員', '更新 awards 唔應該清走名字');
  const lay = board.data.members.find((x: any) => x.id === 'am-07');
  assert.deepStrictEqual([lay.awards.FIVE, lay.awards.TEN, lay.awards.LSM, lay.awards.LSM1], ['2003', '2008', '2013', '2023']);
  const del = demoCall('deleteAwardMember', { token: T.adc, id: c.data.id }, 'POST');
  assert.ok(del.ok);
});
check('saveAwardTypes：整表覆寫（用戶自訂年期喺示範版即改即生效）', () => {
  const board = demoCall('getAwardsBoard', { token: T.adc }, 'GET');
  const types = board.data.types.map((t: any) => t.code === 'GSA' ? { ...t, minYears: 9 } : t);
  const r = demoCall('saveAwardTypes', { token: T.adc, types }, 'POST');
  assert.ok(r.ok);
  const board2 = demoCall('getAwardsBoard', { token: T.adc }, 'GET');
  assert.strictEqual(board2.data.types.find((t: any) => t.code === 'GSA').minYears, 9);
  assert.strictEqual(board2.data.defaults.find((t: any) => t.code === 'GSA').minYears, 7, 'defaults 應該保留內建建議');
});

// ── 5. 旅團探訪 ──
check('saveVisit：一日一個旅一次（同人）→ 唔會重複；第二位幹部就加一筆', () => {
  const before = demoCall('getVisitBoard', { token: T.adc }, 'GET').data.visits.length;
  const v = { troop: '60', section: 'scout', visitDate: '2026-10-01', kind: 'section', note: '首次' };
  const r1 = demoCall('saveVisit', { token: T.adc, visit: v }, 'POST');
  assert.ok(r1.ok);
  const after1 = demoCall('getVisitBoard', { token: T.adc }, 'GET').data.visits.length;
  assert.strictEqual(after1, before + 1);
  demoCall('saveVisit', { token: T.adc, visit: { ...v, note: '再探' } }, 'POST');
  const after2 = demoCall('getVisitBoard', { token: T.adc }, 'GET').data.visits.length;
  assert.strictEqual(after2, after1, '同一日同一旅再儲 → 合併，唔加筆');
  // 第二位幹部：另一個示範 token（照樣 map 做 ADC 身份，但 visitorEmail 同）→ 模擬唔到；
  // 引擎用 session 身份判斷，示範版一律同一人 → 合併（語義：同一示範用戶）
  demoCall('saveVisit', { token: 'demo-adc2', visit: v }, 'POST');
  const after3 = demoCall('getVisitBoard', { token: T.adc }, 'GET').data.visits.length;
  assert.strictEqual(after3, after2, '示範版只有一個身份：同日同旅再儲照合併');
});
check('getVisitBoard：ADC_SCOUT defaultSection=scout；旅在冊＋五支部', () => {
  const b = demoCall('getVisitBoard', { token: T.adc }, 'GET');
  assert.strictEqual(b.data.me.defaultSection, 'scout');
  assert.ok(b.data.units.length >= 9);
  assert.ok(b.data.sections.length === 5);
});

// ── 6. 聯絡簿 ──
check('聯絡簿：改姓名 → round-trip；留空還原', () => {
  const s1 = demoCall('saveContactName', { token: T.adc, key: '地域秘書|2882 7001|0', name: '測試姓名' }, 'POST');
  assert.ok(s1.ok);
  const g1 = demoCall('getContactNames', { token: T.adc }, 'GET');
  assert.strictEqual(g1.data.names['地域秘書|2882 7001|0'], '測試姓名');
  demoCall('saveContactName', { token: T.adc, key: '地域秘書|2882 7001|0', name: '' }, 'POST');
  const g2 = demoCall('getContactNames', { token: T.adc }, 'GET');
  assert.strictEqual(g2.data.names['地域秘書|2882 7001|0'], undefined, '留空 = 還原同步名');
});

// ── 7. 帳戶／借場／借物資／收件箱 ──
check('帳戶管理：權限全開 — getUsers／batchCreateUsers 行到', () => {
  const g = demoCall('getUsers', { token: T.adc }, 'GET');
  assert.ok(g.ok && g.data.length >= 5);
  const c = demoCall('batchCreateUsers', { token: T.adc, users: [{ email: 'new1@demo', displayName: '新幹部', role: 'AL' }] }, 'POST');
  assert.ok(c.ok && c.data.created === 1);
});
check('借場：approve 出入場密碼；公開申請入 pending inbox', () => {
  const a = demoCall('approveVenueBooking', { token: T.adc, id: 'vb-01' }, 'POST');
  assert.ok(a.ok && /^\d{6}$/.test(a.data.password));
  const sub = demoCall('submitVenueRequest', { venueId: 'v-02', purpose: '測試借用', startDate: '2026-12-01', name: '測試人', phone: '9xxx', troop: '60' }, 'POST');
  assert.ok(sub.ok && sub.data.refCode);
  const inbox = demoCall('getPendingInbox', { token: T.adc }, 'GET');
  assert.ok(inbox.data.venue.some((v: any) => v.id === sub.data.id));
});
check('借物資：批次狀態一次過更新兩筆（同一 batchRef）', () => {
  const r = demoCall('setStockBatchStatus', { token: T.adc, batchRef: 'B-26090201', status: 'approved' }, 'POST');
  assert.ok(r.ok && r.data.count === 2);
  const reqs = demoCall('getStockRequests', { token: T.adc }, 'GET');
  assert.ok(reqs.data.filter((x: any) => x.batchRef === 'B-26090201').every((x: any) => x.status === 'approved'));
});

// ── 8. 外部資料 ──
check('extRegionStaff／extRegionOrg：示範資料形狀正確', () => {
  const st = demoExternal('regionStaff', {});
  assert.strictEqual(st.data.rows.length, 5);
  assert.ok(st.data.rows[0].post && st.data.rows[0].name && st.data.rows[0].tel);
  const org = demoExternal('regionOrg', {});
  assert.strictEqual(org.data.groups.length, 3);
  const dcGroup = org.data.groups.find((g: any) => g.id === 'reg-dc');
  assert.strictEqual(dcGroup.members.length, 7, '7 區總監合一大格嘅資料源');
});
check('extRooms：11 間房、每房 3 個示範事件（今日有嘢睇）', () => {
  const r = demoExternal('rooms', { from: String(Date.now()), days: '14' });
  assert.strictEqual(r.data.rooms.length, 11);
  r.data.rooms.forEach((room: any) => {
    assert.ok(room.ok && room.events.length >= 3);
  });
});
check('extBudget：rows＋summary', () => {
  const b = demoExternal('budget', {});
  assert.ok(b.data.rows.length >= 5 && b.data.summary.length >= 3);
});

// ── 9. 重設 ──
check('resetDemoData：加完成員重設返 16 人', () => {
  demoCall('saveAwardMember', { token: T.adc, member: { name: '臨時成員', awards: {} } }, 'POST');
  resetDemoData();
  const board = demoCall('getAwardsBoard', { token: T.adc }, 'GET');
  assert.strictEqual(board.data.total, 16);
});

console.log(process.exitCode ? '\n部分測試失敗 ✗' : `\n全部通過（${pass} 項）✓`);
