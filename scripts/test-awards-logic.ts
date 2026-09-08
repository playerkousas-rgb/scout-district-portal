/**
 * 🎖 提名推算 / 匯入解析邏輯測試（純函數）。
 *   node --experimental-strip-types scripts/test-awards-logic.ts
 */
import assert from 'node:assert';
import {
  awardYear, isUncertain, eligibilityFor, nominationBoard, deadlines, parseAwardPaste, toCsv,
  missingServiceStart, upcomingRounds, readyByMember,
} from '../lib/awards.ts';
import type { AwardMember, AwardType } from '../lib/types.ts';

const types: AwardType[] = [
  { code: 'GSA', label: '優良服務獎章', short: 'GSA', category: '功績榮譽', prevCode: '', minYears: 7, round: 'founder' },
  { code: 'DSA', label: '優異服務獎章', short: 'DSA', category: '功績榮譽', prevCode: 'GSA', minYears: 5, round: 'founder' },
  { code: 'DSM', label: '功績榮譽獎章', short: 'DSM', category: '功績榮譽', prevCode: 'DSA', minYears: 7, round: 'rally' },
  { code: 'DSC', label: '功績榮譽十字章', short: 'DSC', category: '功績榮譽', prevCode: 'DSM', minYears: 7, round: 'rally' },
  { code: 'LSM', label: '長期服務獎章', short: 'LSM', category: '長期服務', prevCode: '', minYears: 15, round: 'other' },
  { code: 'BRL', label: '銅獅勳章', short: '銅獅', category: '獅勳章', prevCode: 'DSC', minYears: null, round: 'rally' },
  { code: 'THANKS', label: '感謝狀', short: '感謝狀', category: '其他', prevCode: '', minYears: null, round: 'founder' },
  { code: 'LSM1', label: '長期服務一星獎章', short: 'LSM*', category: '長期服務', prevCode: 'LSM', minYears: 10, round: 'other' },
  { code: 'OFF', label: '停用咗嘅獎', short: 'OFF', category: '其他', prevCode: 'GSA', minYears: 1, round: 'other', enabled: false },
];

const member = (name: string, awards: Record<string, string>, extra: Partial<AwardMember> = {}): AwardMember =>
  ({ id: 'id-' + name, name, troop: '206', position: 'GSL', status: 'active', awards, ...extra });

let pass = 0;
function check(label: string, fn: () => void) { fn(); pass++; console.log('  ✓ ' + label); }

console.log('獎勵提名推算邏輯測試');

check('年份解析：2015 / 2015? / 無 / 空', () => {
  assert.strictEqual(awardYear('2015'), 2015);
  assert.strictEqual(awardYear('2015?'), 2015);
  assert.strictEqual(awardYear('無'), null);
  assert.strictEqual(awardYear(''), null);
  assert.strictEqual(awardYear(undefined), null);
  assert.strictEqual(isUncertain('2015?'), true);
  assert.strictEqual(isUncertain('2015'), false);
});

check('夠期：GSA 2015 + 5 年 → 2020 年可提名 DSA', () => {
  const e = eligibilityFor(member('甲', { GSA: '2015' }), types, 2020);
  const dsa = e.find(x => x.type.code === 'DSA')!;
  assert.strictEqual(dsa.eligibleYear, 2020);
  assert.strictEqual(dsa.ready, true);
  assert.strictEqual(dsa.waited, 0);
});

check('未夠期：2019 年未到', () => {
  const dsa = eligibilityFor(member('甲', { GSA: '2015' }), types, 2019).find(x => x.type.code === 'DSA')!;
  assert.strictEqual(dsa.ready, false);
  assert.strictEqual(dsa.waited, -1);
});

check('已經有嗰個獎就唔會再提', () => {
  const e = eligibilityFor(member('甲', { GSA: '2015', DSA: '2020' }), types, 2030);
  assert.strictEqual(e.some(x => x.type.code === 'DSA'), false);
  assert.strictEqual(e.some(x => x.type.code === 'DSM'), true);   // 跳到下一級
});

check('未有上一級 → 唔會出現；冇服務年份嘅入門級都唔會推算', () => {
  const e = eligibilityFor(member('乙', {}), types, 2030);
  assert.strictEqual(e.length, 0);
});

check('入門級由服務開始年份計：2004 + 7 → 2011 年可提名優良服務獎章', () => {
  const m = member('丙', {}, { serviceStart: '2004' });
  const e2011 = eligibilityFor(m, types, 2011).find(x => x.type.code === 'GSA')!;
  assert.strictEqual(e2011.fromService, true);
  assert.strictEqual(e2011.prevYear, 2004);
  assert.strictEqual(e2011.eligibleYear, 2011);
  assert.strictEqual(e2011.ready, true);
  const e2010 = eligibilityFor(m, types, 2010).find(x => x.type.code === 'GSA')!;
  assert.strictEqual(e2010.ready, false);
});

check('長期服務獎章：服務 2004 + 15 → 2019 年；攞咗之後跳去一星（+10）', () => {
  const m = member('丁', {}, { serviceStart: '2004' });
  const lsm = eligibilityFor(m, types, 2019).find(x => x.type.code === 'LSM')!;
  assert.strictEqual(lsm.eligibleYear, 2019);
  assert.strictEqual(lsm.ready, true);
  const got = member('丁', { LSM: '2019' }, { serviceStart: '2004' });
  const star = eligibilityFor(got, types, 2029).find(x => x.type.code === 'LSM1')!;
  assert.strictEqual(star.eligibleYear, 2029);
  assert.strictEqual(star.fromService, false);
});

check('感謝狀（冇上一級又冇年期）唔會自動推算', () => {
  const e = eligibilityFor(member('戊', {}, { serviceStart: '1990' }), types, 2030);
  assert.strictEqual(e.some(x => x.type.code === 'THANKS'), false);
});

check('冇年期規定嘅獎（銅獅）：有上一級就列出，標 noRule', () => {
  const brl = eligibilityFor(member('己', { DSC: '2020' }), types, 2020).find(x => x.type.code === 'BRL')!;
  assert.strictEqual(brl.noRule, true);
  assert.strictEqual(brl.ready, true);
  assert.strictEqual(brl.eligibleYear, 2020);
});

check('未填服務開始年份 → missingServiceStart 提示（已攞晒入門級就唔算）', () => {
  const list = missingServiceStart([
    member('冇年份', {}),
    member('有年份', {}, { serviceStart: '2004' }),
    member('已攞晒', { GSA: '2010', LSM: '2018' }),
    member('離任', {}, { status: 'left' }),
  ], types);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, '冇年份');
});

check('停用咗嘅獎項唔會計', () => {
  const e = eligibilityFor(member('甲', { GSA: '2015' }), types, 2030);
  assert.strictEqual(e.some(x => x.type.code === 'OFF'), false);
});

check('上一級年份標咗「?」會標示出嚟', () => {
  const dsa = eligibilityFor(member('甲', { GSA: '2015?' }), types, 2025).find(x => x.type.code === 'DSA')!;
  assert.strictEqual(dsa.uncertain, true);
  assert.strictEqual(dsa.ready, true);
});

check('全區推算：分提名期、等最耐排最前', () => {
  const members = [
    member('等好耐', { GSA: '2000' }),          // DSA 2005 起夠期 → 等咗 20 年
    member('啱啱夠', { GSA: '2020' }),          // DSA 2025
    member('大會操組', { GSA: '2000', DSA: '2008' }),  // DSM 2015 起
    member('未夠', { GSA: '2022' }),            // DSA 2027 → 兩年內會夠（soon）
    member('非現役', { GSA: '2000' }, { status: 'notInDistrict' }),
  ];
  const board = nominationBoard(members, types, 2025);
  const founder = board.find(b => b.round === 'founder')!;
  assert.strictEqual(founder.ready.length, 2);
  assert.strictEqual(founder.ready[0].member.name, '等好耐');
  assert.strictEqual(founder.ready[0].waited, 20);
  assert.strictEqual(founder.soon.length, 1);
  assert.strictEqual(founder.soon[0].member.name, '未夠');
  const rally = board.find(b => b.round === 'rally')!;
  assert.strictEqual(rally.ready.length, 1);
  assert.strictEqual(rally.ready[0].member.name, '大會操組');
});

check('非現役預設唔計，開咗掣就計', () => {
  const members = [member('非現役', { GSA: '2000' }, { status: 'notInDistrict' })];
  assert.strictEqual(nominationBoard(members, types, 2025)[0].ready.length, 0);
  assert.strictEqual(nominationBoard(members, types, 2025, { includeInactive: true })[0].ready.length, 1);
});

check('提名截止日：創辦人前一年 10/31、大會操同年 4/30', () => {
  assert.deepStrictEqual(
    { ...deadlines('founder', 2026) },
    { district: '2025-10-31', hq: '2025-11-30', note: '區部提名須於前一年 10 月 31 日前送地域，總會截止 11 月 30 日' },
  );
  assert.strictEqual(deadlines('rally', 2026)!.district, '2026-04-30');
  assert.strictEqual(deadlines('rally', 2026)!.hq, '2026-05-31');
  assert.strictEqual(deadlines('other', 2026), null);
});

console.log('\n匯入解析測試');

check('匯入：「86th since 2004/01/15」會讀成服務開始年份', () => {
  const r = parseAwardPaste('陳大文\t206\tGSL\tGSA2001\t86th since 2004/01/15', types);
  assert.strictEqual(r.rows[0].serviceStart, '2004');
  assert.strictEqual(r.rows[0].awards!.GSA, '2001');
});

check('匯入：表頭有「服務開始」欄都讀到', () => {
  const r = parseAwardPaste('姓名\t旅團\t職位\t服務開始\tGSA\n陳大文\t206\tGSL\t2004\t2011', types);
  assert.strictEqual(r.rows[0].serviceStart, '2004');
  assert.strictEqual(r.rows[0].awards!.GSA, '2011');
});

check('Excel 貼上：格入面連代號（GSA1985 / LSM*2005 / CCM2025?）', () => {
  const text = [
    '陳大文\t206\tGSL\tGSA2001\tDSA2008\tLSM*2005',
    '李小明\t86\tASL\tGSA2019',
  ].join('\n');
  const r = parseAwardPaste(text, types);
  assert.strictEqual(r.rows.length, 2);
  assert.strictEqual(r.rows[0].name, '陳大文');
  assert.strictEqual(r.rows[0].troop, '206');
  assert.strictEqual(r.rows[0].position, 'GSL');
  assert.strictEqual(r.rows[0].awards!.GSA, '2001');
  assert.strictEqual(r.rows[0].awards!.DSA, '2008');
  assert.strictEqual(r.rows[0].awards!.LSM1, '2005');   // LSM* → LSM1
});

check('有表頭 + 淨係年份都讀到，問號會保留', () => {
  const text = [
    '姓名\t旅團\t職位\tGSA\tDSA',
    '陳大文\t206\tGSL\t2001\t2008?',
  ].join('\n');
  const r = parseAwardPaste(text, types);
  assert.strictEqual(r.rows.length, 1);
  assert.strictEqual(r.rows[0].awards!.GSA, '2001');
  assert.strictEqual(r.rows[0].awards!.DSA, '2008?');
});

check('CSV（逗號）都食到；合計行會略過', () => {
  const r = parseAwardPaste('陳大文,206,GSL,GSA2001\n合計,,,112', types);
  assert.strictEqual(r.rows.length, 1);
  assert.strictEqual(r.skipped, 1);
});

check('認唔到嘅代號會報返出嚟，唔會靜靜哋吞咗', () => {
  const r = parseAwardPaste('陳大文\t206\tGSL\tXYZ2001', types);
  assert.deepStrictEqual(r.unknown, ['XYZ']);
  assert.strictEqual(Object.keys(r.rows[0].awards!).length, 0);
});

check('CSV 匯出會處理逗號同引號', () => {
  assert.strictEqual(toCsv([['a', 'b,c'], ['d"e', 1]]), 'a,"b,c"\n"d""e",1');
});


check('upcomingRounds：跟今日搵返「死線仲未過」嗰屆（連 hab 民青局）', () => {
  // 2026-09-08：創辦人 2027 屆區部死線 2026-10-31 未過；大會操 2026 屆 2026-04-30 已過 → 2027
  const ups = upcomingRounds(undefined, new Date('2026-09-08T12:00:00+08:00'));
  const founder = ups.find(u => u.round === 'founder')!;
  const rally = ups.find(u => u.round === 'rally')!;
  assert.strictEqual(founder.year, 2027);
  assert.strictEqual(founder.district, '2026-10-31');
  assert.strictEqual(rally.year, 2027);
  assert.strictEqual(rally.district, '2027-04-30');
  // hab（民青局嘉許）：死線喺同一年（2027-01-15）→ 2026-09-08 未過 = 2027 年度
  const hab = ups.find(u => u.round === 'hab')!;
  assert.strictEqual(hab.year, 2027);
  assert.strictEqual(hab.district, '2027-01-15');
  assert.strictEqual(hab.hq, '2027-02-03');
  // 11 月 15 日：創辦人區部死線已過 → 跳去下一屆
  const later = upcomingRounds(undefined, new Date('2026-11-15T12:00:00+08:00')).find(u => u.round === 'founder')!;
  assert.strictEqual(later.year, 2028);
});

check('v4.9.0 hab 死線可以用 deadlineCfg 覆蓋（MM-DD）', () => {
  const dl = deadlines('hab', 2026, { habDistrict: '01-31', habHq: '02-28' });
  assert.strictEqual(dl!.district, '2026-01-31');
  assert.strictEqual(dl!.hq, '2026-02-28');
  const fallback = deadlines('hab', 2026, {});
  assert.strictEqual(fallback!.district, '2026-01-15');
  assert.strictEqual(fallback!.hq, '2026-02-03');
});

check('readyByMember：邊個要標亮（key = member.id，只計夠期嗰啲）', () => {
  const a = member('甲', { GSA: '2015' });          // 2020 夠期攞 DSA
  const b = member('乙', {}, { serviceStart: '2019' });  // 2026 先夠期攞 GSA
  const c = member('丙', {}, { status: 'left' });
  const map = readyByMember([a, b, c], types, 2021);
  assert.strictEqual(Object.keys(map).length, 1);
  assert.strictEqual(map[a.id][0].type.code, 'DSA');
  assert.strictEqual(map[b.id], undefined);
});

check('v4.9.0 LAY 階梯：五年(5)→十年(+5)→LSM(15)→一星(+10)，由服務開始年份自動計', () => {
  const lay: AwardType[] = [
    { code: 'FIVE', label: '五年長期服務獎狀', prevCode: '', minYears: 5, round: 'other' },
    { code: 'TEN', label: '十年長期服務獎狀', prevCode: 'FIVE', minYears: 5, round: 'other' },
    { code: 'LSM', label: '長期服務獎章', prevCode: '', minYears: 15, round: 'other' },
    { code: 'LSM1', label: '長期服務一星獎章', prevCode: 'LSM', minYears: 10, round: 'other' },
  ];
  const layman = member('會務', {}, { position: 'LAY', serviceStart: '2010' });
  const e2025 = eligibilityFor(layman, lay, 2025);
  // 2010+5=2015 五年夠期；+15=2025 長期服務獎章都夠（兩級獨立由服務年份計）
  assert.ok(e2025.find(x => x.type.code === 'FIVE')!.ready);
  assert.ok(e2025.find(x => x.type.code === 'LSM')!.ready);
  // 十年獎狀要登記咗五年獎狀先會接住計（有上一級先列出）
  assert.strictEqual(e2025.find(x => x.type.code === 'TEN'), undefined);
  const gotFive = member('會務', { FIVE: '2015' }, { position: 'LAY', serviceStart: '2010' });
  const e2022 = eligibilityFor(gotFive, lay, 2022);
  assert.ok(e2022.find(x => x.type.code === 'TEN')!.ready);   // 2015+5=2020
  // 一星要 LSM 攞咗先會計：呢度未攞 → 唔出現
  assert.strictEqual(e2022.find(x => x.type.code === 'LSM1'), undefined);
  const got = member('會務2', { FIVE: '2015', TEN: '2020', LSM: '2025' }, { position: 'LAY' });
  const e2035 = eligibilityFor(got, lay, 2035);
  assert.ok(e2035.find(x => x.type.code === 'LSM1')!.ready);   // 2025+10=2035
});

check('v4.9.0 沒有提名資格（noNomination）：連「連沒有委任都計埋」都唔會出現', () => {
  const a = member('甲', { GSA: '2015' });
  const b = member('乙', { GSA: '2015' }, { status: 'noNomination' });
  const c = member('丙', { GSA: '2015' }, { status: 'left' });
  const board = nominationBoard([a, b, c], types, 2021, { includeInactive: true });
  const founder = board.find(x => x.round === 'founder')!;
  assert.ok(founder.ready.some(e => e.member.id === a.id));
  assert.strictEqual(founder.ready.some(e => e.member.id === b.id), false);
  assert.ok(founder.ready.some(e => e.member.id === c.id));   // left + includeInactive = 照計
  const map = readyByMember([a, b, c], types, 2021, { includeInactive: true });
  assert.strictEqual(map[b.id], undefined);
});

console.log(`\n全部通過（${pass} 項）✓`);
