/**
 * 🆕 新制直入解析測試（v4.14.0）
 * 行法：node --experimental-strip-types scripts/test-course-setup-parse.ts
 * 涵蓋：lib/course-setup.ts — parseRawToSetup／parseRawToPrints／setupToCells／
 *      budgetTotals／setupToLinkSummary／日期數字工具（用 demo seed 做 fixture）。
 */
import assert from 'node:assert';
import { demoCourseSetup, demoCourseSheetRaw } from '../lib/demo/seed.ts';
import {
  budgetTotals, circularSessions, emptySetup, money, normalizeSetup, normDate,
  parseRawToPrints, parseRawToSetup, setupToCells, setupToLinkSummary, toNum, zhDate,
} from '../lib/course-setup.ts';
import type { CourseSheetRaw, CourseSetup } from '../lib/types.ts';

let pass = 0;
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`); process.exitCode = 1; }
}

console.log('新制直入解析（parse／cells／預算／列印數據）測試');

const raw = demoCourseSheetRaw() as unknown as CourseSheetRaw;
const exp = demoCourseSetup() as unknown as CourseSetup;
const s = parseRawToSetup(raw, 'cl-demo');

check('parse：基本＋預算頭段同 seed 一致', () => {
  assert.strictEqual(s.courseName, exp.courseName);
  assert.strictEqual(s.edition, '1');
  assert.strictEqual(s.section, '童軍');
  assert.strictEqual(s.badge, '急救');
  assert.strictEqual(s.form2, '工作坊');
  assert.strictEqual(s.expectedIntake, '22');
  assert.strictEqual(s.expectedFee, '25');
  assert.strictEqual(s.expectedStaff, '4');
  assert.strictEqual(s.budgetDates.length, 2);
  assert.strictEqual(s.quota, '22');
  assert.strictEqual(s.fee, '25');
});

check('parse：預算行（膳食／場租／交通／數量單價）座標啱', () => {
  assert.strictEqual(s.expenses.meals[0].lunch, '55');
  assert.strictEqual(s.expenses.meals[0].who, '學員');
  assert.strictEqual(s.expenses.meals[1].dinner, '65');
  assert.strictEqual(s.expenses.venue[0].place, '區總部 1704 室');
  assert.strictEqual(s.expenses.venue[0].qty, '2');
  assert.strictEqual(s.expenses.venue[0].price, '100');
  assert.strictEqual(s.expenses.transport[0].budget, '600');
  assert.strictEqual(s.expenses.handouts[0].qty, '25');
  assert.strictEqual(s.expenses.program[0].item, '急救耗材包');
  assert.strictEqual(s.expenses.admin[2].price, '80');
  assert.strictEqual(s.expenses.souvenir[0].qty, '22');
  assert.strictEqual(s.expenses.misc[0].amount, '200');
});

check('parse：節次＋職員＋時間表', () => {
  assert.strictEqual(s.sessions.length, 8);
  assert.strictEqual(s.sessions[0].show, true);
  assert.strictEqual(s.sessions[0].displayDate, '2026年10月9日（星期五）');
  assert.strictEqual(s.staff.length, 20);
  assert.strictEqual(s.staff[0].name, '陳大文');
  assert.strictEqual(s.staff[0].email, 'demo@demo');
  assert.strictEqual(s.staff[2].role, '副班領導人');
  assert.strictEqual(s.residentStaff, '2');
  assert.strictEqual(s.timetable[0].clothing, '整齊制服');
  assert.strictEqual(s.timetable[0].flows[0].item, '開班禮＋課程簡介');
  assert.strictEqual(s.timetable[0].flows[1].mins, '120');
});

check('parse：通告＋接納＋財政人手格', () => {
  assert.strictEqual(s.eligibility, exp.eligibility);
  assert.strictEqual(s.feeNote, exp.feeNote);
  assert.strictEqual(s.uniform, '整齊童軍制服');
  assert.strictEqual(s.remarks.length, 2);
  assert.strictEqual(s.fileNo, '2613');
  assert.strictEqual(s.issueDate, '2026年9月1日');
  assert.strictEqual(s.signer, '陳大文');
  assert.strictEqual(s.acceptCheckin, '晚上6時45分');
  assert.strictEqual(s.acceptItems, '書寫用品及筆記簿');
  assert.strictEqual(s.financeApproved, '500');
  assert.strictEqual(s.financeHqSubsidy, '0');
  assert.strictEqual(s.subsidyOrigFee, '25');
});

check('parse：clEmail 唔存喺 Sheet（申請時保留舊值）', () => {
  assert.strictEqual(s.clEmail, '');
});

check('setupToCells：關鍵座標＋檔案編號／代行格式', () => {
  const cells = setupToCells(exp);
  assert.ok(cells.length > 400, `cells太少：${cells.length}`);
  const find = (tab: string, row: number, col: number) =>
    cells.filter(c => c.tab === tab && c.row === row && c.col === col).map(c => c.value);
  assert.deepStrictEqual(find('Input01 訓練班預算', 1, 2), [exp.courseName]);
  assert.deepStrictEqual(find('Input01 訓練班預算', 12, 2), ['25']);
  assert.deepStrictEqual(find('Input01 訓練班預算', 32, 6), ['55']);
  assert.deepStrictEqual(find('Input02 訓練班資料', 4, 2), ['22']);
  assert.deepStrictEqual(find('Input02 訓練班資料', 9, 8), [true]);
  assert.deepStrictEqual(find('Input02 訓練班資料', 23, 2), ['陳大文']);
  assert.deepStrictEqual(find('Input03 時間表', 3, 5), ['整齊制服']);
  assert.deepStrictEqual(find('Print_通告', 23, 3), [exp.eligibility]);
  assert.deepStrictEqual(find('Print_通告', 12, 7), ['檔案編號: 2613']);
  assert.deepStrictEqual(find('Print_接納通知書', 23, 4), ['晚上6時45分']);
  assert.deepStrictEqual(find('Print_財政預算', 95, 2), ['500']);
  assert.deepStrictEqual(find('Print_總會資助計劃', 11, 17), ['25']);
});

check('budgetTotals：demo 數（同工作簿公式一致）', () => {
  const t = budgetTotals(exp);
  assert.strictEqual(t.meals, 2640);   // 午55×1×22＋晚65×1×22
  assert.strictEqual(t.venue, 200);    // 2×100
  assert.strictEqual(t.transport, 800);
  assert.strictEqual(t.handouts, 50);
  assert.strictEqual(t.program, 110);
  assert.strictEqual(t.admin, 80);
  assert.strictEqual(t.souvenir, 220);
  assert.strictEqual(t.misc, 200);
  assert.strictEqual(t.total, 4300);
  assert.strictEqual(t.income, 550);   // 25×22＋0
  assert.strictEqual(t.subsidy, 3750);
});

check('parseRawToPrints：名單＋人數＋實際＋修訂＋W/X', () => {
  const p = parseRawToPrints(raw, s);
  assert.strictEqual(p.roster.length, 2);
  assert.strictEqual(p.roster[0].name, '陳小文');
  assert.strictEqual(p.roster[0].code, 'SFA-01');
  assert.strictEqual(p.roster[1].district, '南區');
  assert.deepStrictEqual(p.counts, {
    appliedHome: 2, appliedOther: 1, admittedHome: 1,
    admittedOther: 1, admittedTotal: 2, completed: 2, passed: 1,
  });
  assert.strictEqual(p.actualTotal, 2350);
  assert.deepStrictEqual(p.revised, { '87': '550' });
  assert.strictEqual(p.completion.length, 2);
  assert.strictEqual(p.completion[1].failReason, '缺席第二節');
  assert.strictEqual(p.certRows.length, 1);
  assert.strictEqual(p.fpsId, '102866183');
  assert.ok(p.portalUrl.includes('/training'));
  assert.strictEqual(p.webUrl, 'www.skwscout.org.hk');
});

check('setupToLinkSummary：標題／節數／場地／聯絡', () => {
  const l = setupToLinkSummary(exp);
  assert.strictEqual(l.title, exp.courseName);
  assert.ok((l.sessionsText || '').includes('2026年10月9日'));
  assert.strictEqual(l.venue, '區總部');
  assert.ok((l.contact || '').includes('陳大文'));
  assert.ok((l.contact || '').includes('班領導人'));
});

check('circularSessions：冇 ✓ 就 fallback 全部有日期節次', () => {
  const shown = circularSessions(exp.sessions);
  assert.strictEqual(shown.length, 2);
  const none = circularSessions(exp.sessions.map(x => ({ ...x, show: false, displayDate: '' })));
  assert.strictEqual(none.length, 2);
});

check('工具：normDate／toNum／money／zhDate', () => {
  assert.strictEqual(normDate(new Date(2025, 6, 25)), '2025-07-25');
  assert.strictEqual(normDate('2026-09-09T00:00:00.000Z'), '2026-09-09');
  assert.strictEqual(normDate('25/7/2025'), '2025-07-25');
  assert.strictEqual(normDate('2025年7月25日（星期五）'), '2025-07-25');
  assert.strictEqual(normDate(''), '');
  assert.strictEqual(toNum('$1,234.5'), 1234.5);
  assert.strictEqual(toNum('abc'), 0);
  assert.strictEqual(money(1234.5), '1,234.5');
  assert.strictEqual(money(''), '');
  assert.strictEqual(zhDate('2026-09-09'), '2026年9月9日');
});

check('emptySetup／normalizeSetup：行數齊（防 undefined）', () => {
  const e = emptySetup();
  assert.strictEqual(e.staff.length, 20);
  assert.strictEqual(e.sessions.length, 8);
  assert.strictEqual(e.expenses.meals.length, 8);
  assert.strictEqual(e.remarks.length, 6);
  assert.strictEqual(e.expenses.venue[1].place, '其他收費');
  const n = normalizeSetup(null);
  assert.strictEqual(n.staff.length, 20);
  const p = normalizeSetup({ courseName: 'x' } as CourseSetup);
  assert.strictEqual(p.courseName, 'x');
  assert.strictEqual(p.timetable.length, 3);
});

console.log(`\n全部通過（${pass} 項）✓`);
