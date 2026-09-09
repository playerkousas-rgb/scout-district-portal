/**
 * 🏕 旅團探訪推算／報告邏輯測試（純函數）
 *   node --experimental-strip-types scripts/test-visit-logic.ts
 */
import assert from 'node:assert';
import {
  troopStats, coverage, visitorStats, unitsOfSection, sortUnits,
  quarterOf, yearOf, rangePresets, parseUnitPaste, toCsv, SECTION_LABEL, KIND_LABEL, hasVisitOn, visitsOn,
} from '../lib/visits.ts';
import type { ScoutUnit, Visit, VisitSection } from '../lib/types.ts';

let pass = 0;
function check(label: string, fn: () => void) { fn(); pass++; console.log('  ✓ ' + label); }

function unit(troop: string, sections: Partial<Record<VisitSection, string>>, org = ''): ScoutUnit {
  return {
    troop, label: `港島第${troop}旅`, org,
    sections: { gh: '', cub: '', scout: '', venture: '', rover: '', ...sections },
    active: true,
  };
}
function visit(troop: string, date: string, section: VisitSection | '' = '', who = '陳ADC'): Visit {
  return { id: `v-${troop}-${date}-${section}`, troop, section, visitDate: date, kind: 'general', visitorName: who };
}

const units: ScoutUnit[] = [
  unit('17', { cub: '1', scout: '1', venture: '1' }, '慈幼中學'),
  unit('82', { gh: '1', cub: '1', scout: '1', venture: '1', rover: '1' }),
  unit('206', { gh: '1', cub: '1', scout: '1', venture: '1' }),
  unit('1222', { gh: '3' }, '維多利亞幼稚園'),
  unit('1745', { scout: '1' }),
];

console.log('旅團探訪（Visits）邏輯測試');

check('揀支部：只列有開嗰個支部嘅旅團', () => {
  assert.deepStrictEqual(unitsOfSection(units, 'gh').map(u => u.troop), ['82', '206', '1222']);
  assert.deepStrictEqual(unitsOfSection(units, 'rover').map(u => u.troop), ['82']);
  assert.strictEqual(unitsOfSection(units, '').length, 5);   // 全部支部
});

check('小童軍 ADC：探咗 206 就得一格綠，1222／82 仲係紅', () => {
  const visits = [visit('206', '2026-03-08', 'gh')];
  const stats = troopStats(units, visits, 'gh');
  assert.strictEqual(stats.length, 3);
  const s206 = stats.find(s => s.unit.troop === '206')!;
  assert.strictEqual(s206.visited, true);
  assert.strictEqual(s206.last, '2026-03-08');
  assert.strictEqual(stats.find(s => s.unit.troop === '1222')!.visited, false);
  const cov = coverage(stats);
  assert.deepStrictEqual([cov.visited, cov.total, cov.percent], [1, 3, 33]);
});

check('支部分開計：探咗 17 旅童軍，唔會當幼童軍都探咗', () => {
  const visits = [visit('17', '2026-04-02', 'scout')];
  assert.strictEqual(troopStats(units, visits, 'scout').find(s => s.unit.troop === '17')!.visited, true);
  assert.strictEqual(troopStats(units, visits, 'cub').find(s => s.unit.troop === '17')!.visited, false);
});

check('冇填支部嘅記錄當「全旅」，邊個支部都計入', () => {
  const visits = [visit('17', '2026-05-05', '')];
  assert.strictEqual(troopStats(units, visits, 'cub').find(s => s.unit.troop === '17')!.visited, true);
  assert.strictEqual(troopStats(units, visits, 'scout').find(s => s.unit.troop === '17')!.visited, true);
});

check('每格顯示最近日期同次數（新到舊）', () => {
  const visits = [visit('82', '2026-02-01', 'gh'), visit('82', '2026-06-20', 'gh'), visit('82', '2026-04-10', 'gh')];
  const st = troopStats(units, visits, 'gh').find(s => s.unit.troop === '82')!;
  assert.strictEqual(st.count, 3);
  assert.strictEqual(st.last, '2026-06-20');
  assert.deepStrictEqual(st.visits.map(v => v.visitDate), ['2026-06-20', '2026-04-10', '2026-02-01']);
});

check('邊個幹部最勤力：按次數排，睇到探過邊啲旅', () => {
  const visits = [
    visit('206', '2026-03-08', 'gh', '李ADC'),
    visit('82', '2026-04-08', 'gh', '李ADC'),
    visit('1222', '2026-05-08', 'gh', '李ADC'),
    visit('17', '2026-03-20', 'scout', '陳DC'),
  ];
  const people = visitorStats(visits);
  assert.strictEqual(people[0].name, '李ADC');
  assert.strictEqual(people[0].count, 3);
  assert.deepStrictEqual(people[0].troops, ['1222', '82', '206']);   // 由新到舊
  assert.strictEqual(people[0].last, '2026-05-08');
  assert.strictEqual(people[1].name, '陳DC');
  assert.deepStrictEqual(people[1].sections, ['scout']);
});

check('冇填幹部名 → 歸「（未填）」，唔會靜靜咁跌咗', () => {
  const v = { ...visit('17', '2026-01-01'), visitorName: '' };
  const people = visitorStats([v]);
  assert.strictEqual(people[0].name, '（未填）');
});

check('一日一個旅一次：同一日同一個旅已登記就認得出（唔分支部）', () => {
  const visits = [visit('206', '2026-03-08', 'gh')];
  assert.strictEqual(hasVisitOn(visits, '206', '2026-03-08'), true);
  assert.strictEqual(hasVisitOn(visits, '206', '2026-03-08', '陳ADC'), true);
  assert.strictEqual(hasVisitOn(visits, '206', '2026-03-08', '李ADC'), false); // 第二位幹部有自己嗰筆
  assert.strictEqual(hasVisitOn(visits, '206', '2026-03-09'), false);          // 第二日 = 新一日，清零
  assert.strictEqual(hasVisitOn(visits, '82', '2026-03-08'), false);
});

check('一日一個旅一次：轉支部都當同一次（206 早上小童軍、下午童軍 = 同一日探咗 206）', () => {
  const visits = [visit('206', '2026-03-08', 'gh')];
  assert.strictEqual(hasVisitOn(visits, '206', '2026-03-08', '陳ADC'), true);
  assert.strictEqual(visitsOn(visits, '206', '2026-03-08').length, 1);
});

check('同一日可以探 X／Y／Z 幾個旅', () => {
  const visits = [visit('206', '2026-03-08'), visit('1222', '2026-03-08'), visit('1544', '2026-03-08')];
  ['206', '1222', '1544'].forEach(t => assert.strictEqual(hasVisitOn(visits, t, '2026-03-08', '陳ADC'), true));
  assert.strictEqual(visitorStats(visits)[0].count, 3);
});

check('同一旅一年可以探幾次（今月一次、下月再一次都記得晒）', () => {
  const visits = [visit('206', '2026-03-08', 'gh'), visit('206', '2026-04-19', 'gh')];
  const st = troopStats(units, visits, 'gh').find(s => s.unit.troop === '206')!;
  assert.strictEqual(st.count, 2);
  assert.strictEqual(st.last, '2026-04-19');
  assert.strictEqual(hasVisitOn(visits, '206', '2026-04-19', '陳ADC'), true);
});

check('季度／年份：由日期計', () => {
  assert.strictEqual(quarterOf('2026-01-31'), 1);
  assert.strictEqual(quarterOf('2026-10-01'), 4);
  assert.strictEqual(quarterOf(''), 0);
  assert.strictEqual(yearOf('2026-10-01'), 2026);
});

check('報告日期範圍快捷掣：本季／全年／上下半年／童軍年度', () => {
  const p = rangePresets(new Date('2026-09-08T12:00:00+08:00'));
  const q = p.find(x => x.id === 'thisQuarter')!;
  assert.strictEqual(q.from, '2026-07-01');
  assert.strictEqual(q.to, '2026-09-30');
  assert.strictEqual(p.find(x => x.id === 'thisYear')!.from, '2026-01-01');
  assert.strictEqual(p.find(x => x.id === 'h2')!.from, '2026-07-01');
  assert.strictEqual(p.find(x => x.id === 'scoutYear')!.from, '2025-09-01');
  assert.strictEqual(p.find(x => x.id === 'scoutYear')!.to, '2026-08-31');
});

check('旅號排序：86 → 206 → 1745', () => {
  assert.deepStrictEqual(
    sortUnits([unit('1745', {}), unit('206', {}), unit('86', {})]).map(u => u.troop),
    ['86', '206', '1745'],
  );
});

check('貼上名單：官網嗰種「港島第206旅 主辦機構 各支部團數」', () => {
  const rows = parseUnitPaste('港島第206旅\t太古城物業管理聯絡議會\t1\t1\t1\t1\t\n港島第1745旅\t港島民生書院\t\t\t1\t\t');
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].troop, '206');
  assert.strictEqual(rows[0].label, '港島第206旅');
  assert.strictEqual(rows[0].org, '太古城物業管理聯絡議會');
  assert.strictEqual(rows[0].sections.gh, '1');
  assert.strictEqual(rows[0].sections.rover, '');
  assert.strictEqual(rows[1].sections.scout, '1');
  assert.strictEqual(rows[1].sections.cub, '');
});

check('貼上名單：淨係旅號都得，原有資料唔會冇咗', () => {
  const rows = parseUnitPaste('206\n17', units);
  assert.strictEqual(rows[0].label, '港島第206旅');
  assert.strictEqual(rows[0].sections.scout, '1');   // 沿用原本支部設定
  assert.strictEqual(rows[1].troop, '17');
});

check('標籤：支部同探訪形式都有中文', () => {
  assert.strictEqual(SECTION_LABEL.venture, '深資童軍');
  assert.strictEqual(KIND_LABEL.inspection, '周年檢閱');
});

check('CSV 會處理逗號同引號', () => {
  assert.strictEqual(toCsv([['旅團', '備註'], ['206', '人數 24, 好']]), '旅團,備註\n206,"人數 24, 好"');
});

// ───────────────────────── 🏢 總會季度匯報（v4.10.0） ─────────────────────────

import {
  officialReport, hqDate, hqPeriodLabel, troopTotal,
  SECTION_HQ_LABEL, HQ_METHODS, HQ_LEADERS,
} from '../lib/visits.ts';

check('總會日期寫法：18.1.2026（唔補零）', () => {
  assert.strictEqual(hqDate('2026-01-18'), '18.1.2026');
  assert.strictEqual(hqDate('2026-03-08'), '8.3.2026');
  assert.strictEqual(hqDate('2026-12-31'), '31.12.2026');
  assert.strictEqual(hqDate(''), '');
  assert.strictEqual(hqDate('唔係日期'), '');
});

check('總會期間標題：2026年1月-3月；跨年出兩個年份', () => {
  assert.strictEqual(hqPeriodLabel('2026-01-01', '2026-03-31'), '2026年1月-3月');
  assert.strictEqual(hqPeriodLabel('2026-04-01', '2026-06-30'), '2026年4月-6月');
  assert.strictEqual(hqPeriodLabel('2025-12-01', '2026-01-31'), '2025年12月-2026年1月');
  assert.strictEqual(hqPeriodLabel('', ''), '');
});

check('旅團總數：只計仲運作嘅旅', () => {
  assert.strictEqual(troopTotal(units), 5);
  const withInactive: ScoutUnit[] = [...units, { ...unit('999', {}), active: false }];
  assert.strictEqual(troopTotal(withInactive), 5);
});

check('匯報支部欄：童軍 → 童軍支部、冇填 → 全旅', () => {
  assert.strictEqual(SECTION_HQ_LABEL.scout, '童軍支部');
  assert.strictEqual(SECTION_HQ_LABEL.gh, '小童軍支部');
  assert.strictEqual(SECTION_HQ_LABEL[''], '全旅');
  assert.deepStrictEqual(HQ_METHODS, ['面談', '電話', 'WhatsApp', 'Email', '其他']);
  assert.ok(HQ_LEADERS.includes('旅長及支部領袖'));
});

check('總會匯報：一筆記錄 = 一行，冇填人數當 1、冇跟進出 NA', () => {
  const rows = officialReport([
    { ...visit('206', '2026-01-18', 'scout'), leaderMet: '支部團長', method: '面談', support: '旅團發展方向' },
    { ...visit('17', '2026-02-08', ''), leaderMet: '旅長及支部領袖', method: '電話', officerCount: 4, support: '增長人數', followUp: 'Form Submission' },
    { ...visit('50', '2026-01-18', 'venture'), method: 'WhatsApp' },
  ]);
  assert.strictEqual(rows.length, 3);
  // 排序：旅號細到大（17 → 50 → 206）
  assert.deepStrictEqual(rows.map(r => r.troop), ['17', '50', '206']);
  const r17 = rows[0];
  assert.strictEqual(r17.sectionLabel, '全旅');
  assert.strictEqual(r17.dateText, '8.2.2026');
  assert.strictEqual(r17.officerCount, 4);
  assert.strictEqual(r17.followUp, 'Form Submission');
  const r50 = rows[1];
  assert.strictEqual(r50.leaderMet, '');            // 冇填就空（唔會作嘢）
  assert.strictEqual(r50.officerCount, 1);          // 冇填人數 = 1
  assert.strictEqual(r50.followUp, 'NA');           // 冇跟進 = NA
  assert.strictEqual(r50.sectionLabel, '深資童軍支部');
  const r206 = rows[2];
  assert.strictEqual(r206.method, '面談');
  assert.strictEqual(r206.support, '旅團發展方向');
  assert.strictEqual(r206.followUp, 'NA');
});

check('總會匯報：同旅同日可以有幾行（電話一筆 Email 一筆，跟官方樣本）', () => {
  const rows = officialReport([
    { ...visit('180', '2026-01-18', 'cub'), method: '電話', support: 'Census', followUp: '支部領袖人數未達最低要求' },
    { ...visit('180', '2026-01-18', 'cub'), method: 'Email', support: '幼童軍年齡降低' },
  ]);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].method, '電話');
  assert.strictEqual(rows[1].method, 'Email');
  assert.strictEqual(rows[1].followUp, 'NA');
});

check('總會匯報：壞記錄（冇旅號／冇日期）唔會出', () => {
  const rows = officialReport([
    visit('', '2026-01-01'),
    { ...visit('206', '') },
    visit('206', '2026-01-01'),
  ]);
  assert.strictEqual(rows.length, 1);
});

console.log(`\n全部通過（${pass} 項）✓`);
