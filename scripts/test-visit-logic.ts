/**
 * 🏕 旅團探訪推算／報告邏輯測試（純函數）
 *   node --experimental-strip-types scripts/test-visit-logic.ts
 */
import assert from 'node:assert';
import {
  troopStats, coverage, visitorStats, unitsOfSection, sortUnits,
  quarterOf, yearOf, rangePresets, parseUnitPaste, toCsv, SECTION_LABEL, KIND_LABEL,
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

console.log(`\n全部通過（${pass} 項）✓`);
