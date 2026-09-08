/**
 * 🎭 模擬示範版引擎測試（v4.9.0）
 * 行法：node --experimental-strip-types scripts/test-demo-engine.ts
 * 驗證 demoCall／demoExternal 同真後台語義一致（權限閘、軟刪除、一日一旅一次、死線儲存…）。
 */
import assert from 'node:assert';
import { demoCall, demoExternal, resetDemoData } from '../lib/demo/engine.ts';
import { DEMO_TOKEN } from '../lib/demo/seed.ts';

let pass = 0;
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`); process.exitCode = 1; }
}

const T = {
  dc: `${DEMO_TOKEN === 'demo-session-token' ? 'demo-dc' : DEMO_TOKEN}`,
  ddc: 'demo-ddc', adc: 'demo-adc', staff: 'demo-staff', bad: 'nope',
};

resetDemoData();

// ── 1. 登入 ──
check('login：任何電郵都入到；ddc 對應 DDC（level 2）', () => {
  const r = demoCall('login', { email: 'whatever-ddc@x', password: 'x' }, 'POST');
  assert.ok(r.ok);
  assert.strictEqual(r.data.role, 'DDC_ADMIN');
  assert.strictEqual(r.data.level, 2);
  assert.strictEqual(r.data.token, 'demo-ddc');
});
check('login：預設對應 DC（level 1，isAdmin）', () => {
  const r = demoCall('login', { email: 'foo@bar', password: '' }, 'POST');
  assert.strictEqual(r.data.level, 1);
  assert.strictEqual(r.data.isAdmin, true);
  assert.ok(String(r.data.token).startsWith('demo-'));
});

// ── 2. 卡片權限閘 ──
check('getCards：DC 見到 awards（edit）；ADC／STAFF 完全冇 awards；無人見到 news', () => {
  const dc = demoCall('getCards', { token: T.dc }, 'GET');
  const adc = demoCall('getCards', { token: T.adc }, 'GET');
  const staff = demoCall('getCards', { token: T.staff }, 'GET');
  assert.ok(dc.ok && adc.ok && staff.ok);
  const ids = (r: any) => r.data.map((c: any) => c.cardId);
  assert.ok(ids(dc).indexOf('awards') >= 0);
  assert.strictEqual(ids(dc).find((c: string) => c === 'awards' && true) && dc.data.find((c: any) => c.cardId === 'awards').access, 'edit');
  assert.strictEqual(ids(adc).indexOf('awards'), -1, 'ADC 唔應該見到 awards 卡');
  assert.strictEqual(ids(staff).indexOf('awards'), -1, 'STAFF 唔應該見到 awards 卡');
  [dc, adc, staff].forEach(r => assert.strictEqual(r.data.some((c: any) => c.cardId === 'news'), false, 'news 卡已移除'));
  assert.strictEqual(ids(adc).indexOf('visit') >= 0, true);
});
check('getCards：壞 token → 錯誤', () => {
  const r = demoCall('getCards', { token: T.bad }, 'GET');
  assert.strictEqual(r.ok, false);
});

// ── 3. 消息：軟刪除＋公開過濾＋ADC 閘 ──
check('消息：ADC 發佈 → 軟刪除留底 → 還原；公開 list 永遠冇已刪／未到期', () => {
  const created = demoCall('saveAnnouncement', { token: T.adc, announcement: { title: '測試消息', body: '內容', date: '2099-01-01', pinned: false, level: 'info' } }, 'POST');
  assert.ok(created.ok && created.data.created, 'ADC 應該可以發佈');
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
check('消息：STAFF 被擋（ADC 以上先可以管理）', () => {
  const r = demoCall('saveAnnouncement', { token: T.staff, announcement: { title: 'x', body: 'y' } }, 'POST');
  assert.strictEqual(r.ok, false);
  assert.ok(String(r.error).indexOf('ADC') >= 0);
});
check('消息：預設有一條已刪除示範行（an-04）＋公開 list 5 過濾', () => {
  const admin = demoCall('getAnnouncements', { token: T.adc }, 'GET');
  const del = admin.data.find((a: any) => a.id === 'an-04');
  assert.ok(del && del.deleted === true && del.deletedAt && del.deletedBy);
  const pub = demoCall('listAnnouncements', {}, 'GET');
  assert.strictEqual(pub.data.some((a: any) => a.id === 'an-04'), false, '已刪消息唔可以出現喺公開 list');
  assert.ok(pub.data.some((a: any) => a.id === 'an-01' && a.pinned === true));
  const pinnedOnly = demoCall('listAnnouncements', { pinnedOnly: '1' }, 'GET');
  assert.ok(pinnedOnly.data.every((a: any) => a.pinned === true));
});

// ── 4. 獎勵（v4.9.0） ──
check('getAwardsBoard：18 類型＋deadlineCfg 預設＋counts 正確；ADC／STAFF 被擋', () => {
  const dc = demoCall('getAwardsBoard', { token: T.dc }, 'GET');
  assert.ok(dc.ok);
  assert.strictEqual(dc.data.types.length, 18);
  assert.deepStrictEqual(dc.data.deadlineCfg, { habDistrict: '01-15', habHq: '02-03' });
  assert.strictEqual(dc.data.total, 16);
  assert.strictEqual(dc.data.counts.LSM, 3, 'LSM 應該有 3 人（am-01/04/07）');
  assert.strictEqual(dc.data.counts.noNomination === undefined || typeof dc.data.counts.noNomination === 'number', true);
  const adc = demoCall('getAwardsBoard', { token: T.adc }, 'GET');
  assert.strictEqual(adc.ok, false, 'ADC 唔可以攞 awards board（ddcUp）');
  const staff = demoCall('getAwardsBoard', { token: T.staff }, 'GET');
  assert.strictEqual(staff.ok, false);
});
check('saveAwardDeadlines：收 YYYY-MM-DD 同 MM-DD；垃圾值保留原設定', () => {
  const r1 = demoCall('saveAwardDeadlines', { token: T.dc, habDistrict: '2026-01-20', habHq: '02-05' }, 'POST');
  assert.deepStrictEqual(r1.data.deadlineCfg, { habDistrict: '01-20', habHq: '02-05' });
  const r2 = demoCall('saveAwardDeadlines', { token: T.dc, habDistrict: 'garbage', habHq: '' }, 'POST');
  assert.deepStrictEqual(r2.data.deadlineCfg, { habDistrict: '01-20', habHq: '02-05' }, '垃圾值唔應該改');
  const r3 = demoCall('saveAwardDeadlines', { token: T.adc, habDistrict: '03-03', habHq: '03-04' }, 'POST');
  assert.strictEqual(r3.ok, false, 'ADC 唔可以改死線');
  // 還原預設
  demoCall('saveAwardDeadlines', { token: T.dc, habDistrict: '01-15', habHq: '02-03' }, 'POST');
});
check('saveAwardMember：新增＋更新；LAY 階梯示範成員在冊', () => {
  const c = demoCall('saveAwardMember', { token: T.ddc, member: { name: '測試新成員', troop: '999', position: 'SL', serviceStart: '2010', status: 'active', awards: {} } }, 'POST');
  assert.ok(c.ok && c.data.created);
  const u = demoCall('saveAwardMember', { token: T.ddc, member: { id: c.data.id, awards: { FIVE: '2015' } } }, 'POST');
  assert.ok(u.ok && !u.data.created);
  const board = demoCall('getAwardsBoard', { token: T.ddc }, 'GET');
  const m = board.data.members.find((x: any) => x.id === c.data.id);
  assert.strictEqual(m.awards.FIVE, '2015');
  assert.strictEqual(m.name, '測試新成員', '更新 awards 唔應該清走名字');
  const lay = board.data.members.find((x: any) => x.id === 'am-07');
  assert.deepStrictEqual([lay.awards.FIVE, lay.awards.TEN, lay.awards.LSM, lay.awards.LSM1], ['2003', '2008', '2013', '2023']);
  const del = demoCall('deleteAwardMember', { token: T.ddc, id: c.data.id }, 'POST');
  assert.ok(del.ok);
});
check('saveAwardTypes：整表覆寫（用戶自訂年期喺示範版即改即生效）', () => {
  const board = demoCall('getAwardsBoard', { token: T.dc }, 'GET');
  const types = board.data.types.map((t: any) => t.code === 'GSA' ? { ...t, minYears: 9 } : t);
  const r = demoCall('saveAwardTypes', { token: T.dc, types }, 'POST');
  assert.ok(r.ok);
  const board2 = demoCall('getAwardsBoard', { token: T.dc }, 'GET');
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
  demoCall('saveVisit', { token: T.dc, visit: v }, 'POST');
  const after3 = demoCall('getVisitBoard', { token: T.dc }, 'GET').data.visits.length;
  assert.strictEqual(after3, after2 + 1, '第二位幹部同日探同一旅 → 各自一筆');
});
check('getVisitBoard：ADC_SCOUT defaultSection=scout；28/9 旅在冊', () => {
  const b = demoCall('getVisitBoard', { token: T.adc }, 'GET');
  assert.strictEqual(b.data.me.defaultSection, 'scout');
  assert.ok(b.data.units.length >= 9);
  assert.ok(b.data.sections.length === 5);
});

// ── 6. 聯絡簿 ──
check('聯絡簿：ADC+ 改姓名 → round-trip；留空還原；STAFF 被擋', () => {
  const s1 = demoCall('saveContactName', { token: T.adc, key: '地域秘書|2882 7001|0', name: '測試姓名' }, 'POST');
  assert.ok(s1.ok);
  const g1 = demoCall('getContactNames', { token: T.adc }, 'GET');
  assert.strictEqual(g1.data.names['地域秘書|2882 7001|0'], '測試姓名');
  demoCall('saveContactName', { token: T.adc, key: '地域秘書|2882 7001|0', name: '' }, 'POST');
  const g2 = demoCall('getContactNames', { token: T.adc }, 'GET');
  assert.strictEqual(g2.data.names['地域秘書|2882 7001|0'], undefined, '留空 = 還原同步名');
  const s2 = demoCall('saveContactName', { token: T.staff, key: 'k', name: 'x' }, 'POST');
  assert.strictEqual(s2.ok, false);
});

// ── 7. 借場／借物資／收件箱 ──
check('借場：approve 出入場密碼；公開申請入 pending inbox', () => {
  const a = demoCall('approveVenueBooking', { token: T.ddc, id: 'vb-01' }, 'POST');
  assert.ok(a.ok && /^\d{6}$/.test(a.data.password));
  const sub = demoCall('submitVenueRequest', { venueId: 'v-02', purpose: '測試借用', startDate: '2026-12-01', name: '測試人', phone: '9xxx', troop: '60' }, 'POST');
  assert.ok(sub.ok && sub.data.refCode);
  const inbox = demoCall('getPendingInbox', { token: T.ddc }, 'GET');
  assert.ok(inbox.data.venue.some((v: any) => v.id === sub.data.id));
});
check('借物資：批次狀態一次過更新兩筆（同一 batchRef）', () => {
  const r = demoCall('setStockBatchStatus', { token: T.ddc, batchRef: 'B-26090201', status: 'approved' }, 'POST');
  assert.ok(r.ok && r.data.count === 2);
  const reqs = demoCall('getStockRequests', { token: T.ddc }, 'GET');
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
  demoCall('saveAwardMember', { token: T.dc, member: { name: '臨時成員', awards: {} } }, 'POST');
  resetDemoData();
  const board = demoCall('getAwardsBoard', { token: T.dc }, 'GET');
  assert.strictEqual(board.data.total, 16);
});

console.log(process.exitCode ? '\n部分測試失敗 ✗' : `\n全部通過（${pass} 項）✓`);
