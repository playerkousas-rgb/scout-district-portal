/**
 * 🏕 本區旅團聯絡名單（旅長貼上／列表）純函數測試
 *   node --experimental-strip-types scripts/test-troop-leaders.ts
 */
import assert from 'node:assert';
import {
  troopKey, parseLeaderPaste, pickLeader, buildLeaderRows, applyLeaderEntries,
  isRowDirty, leaderProblem, telLink, type LeaderRow,
} from '../lib/troopLeaders.ts';
import type { TroopContact, VisitSection } from '../lib/types.ts';

let pass = 0;
function check(label: string, fn: () => void) { fn(); pass++; console.log('  ✓ ' + label); }

const sectionsOf = (u: { sections: Record<VisitSection, string> }) =>
  (['gh', 'cub', 'scout', 'venture', 'rover'] as VisitSection[]).filter(k => u.sections[k]);

check('troopKey：各種寫法攞到旅號', () => {
  assert.equal(troopKey('206'), '206');
  assert.equal(troopKey('港島第206旅'), '206');
  assert.equal(troopKey('第 17 旅'), '17');
  assert.equal(troopKey('0017'), '17');
  assert.equal(troopKey('91234567'), '');
  assert.equal(troopKey('張三'), '');
});

check('parseLeaderPaste：Tab 分隔（Excel 貼上）', () => {
  const r = parseLeaderPaste('港島第17旅\t林志傑\t9456 7890\tgsl17@example.com\n206\t張國強\t9123 4567\tgsl206@example.com');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.entries.map(e => [e.troop, e.name, e.phone, e.email]), [
    ['17', '林志傑', '9456 7890', 'gsl17@example.com'],
    ['206', '張國強', '9123 4567', 'gsl206@example.com'],
  ]);
});

check('parseLeaderPaste：空格分隔、電話有空格、次序亂都得', () => {
  const r = parseLeaderPaste('206 張國強 gsl206@example.com 9123 4567\n港島第82旅 李小芬 9345 6789');
  assert.deepEqual(r.errors, []);
  assert.equal(r.entries[0].name, '張國強');
  assert.equal(r.entries[0].phone, '9123 4567');
  assert.equal(r.entries[0].email, 'gsl206@example.com');
  assert.equal(r.entries[1].troop, '82');
  assert.equal(r.entries[1].name, '李小芬');
  assert.equal(r.entries[1].phone, '9345 6789');
  assert.equal(r.entries[1].email, '');
});

check('parseLeaderPaste：逗號分隔、只有電郵冇電話', () => {
  const r = parseLeaderPaste('1095, 陳大文, , chan@example.com');
  assert.deepEqual(r.errors, []);
  assert.deepEqual([r.entries[0].troop, r.entries[0].name, r.entries[0].phone, r.entries[0].email],
    ['1095', '陳大文', '', 'chan@example.com']);
});

check('parseLeaderPaste：表頭、空行略過；壞行有錯誤訊息', () => {
  const r = parseLeaderPaste('旅號\t旅長\t電話\t電郵\n\n206\t張國強\t9123 4567\tbad@\nxyz 沒有旅號 91234567');
  assert.equal(r.entries.length, 0);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /第 3 行.*電郵格式/);
  assert.match(r.errors[1], /第 4 行.*找不到旅號/);
});

const units = [
  { troop: '206', label: '港島第206旅', org: '太古城物業管理聯絡議會', sections: { gh: '1', cub: '1', scout: '1', venture: '1', rover: '' }, active: true },
  { troop: '17', label: '港島第17旅', org: '慈幼中學', sections: { gh: '', cub: '', scout: '', venture: '1', rover: '' }, active: true },
  { troop: '82', label: '港島第82旅', org: '香港小童群益會康山兒童中心', sections: { gh: '1', cub: '1', scout: '1', venture: '1', rover: '1' }, active: true },
];

const contacts: TroopContact[] = [
  { id: 'tc-01', troop: '206', section: '', unitCode: '', contactRole: 'gsl', name: '張國強', phone: '9123 4567', email: 'a@b.co', note: '備註', active: true },
  { id: 'tc-02', troop: '206', section: 'scout', unitCode: '', contactRole: 'leader', name: '陳小明', phone: '9234 5678', email: '', active: true },
  { id: 'tc-09', troop: '17', section: '', unitCode: '', contactRole: 'gsl', name: '舊紀錄', phone: '', email: 'old@b.co', active: false },
  { id: 'tc-10', troop: '17', section: '', unitCode: '', contactRole: 'gsl', name: '新旅長', phone: '9456 7890', email: '', active: true },
];

check('pickLeader：只揀全旅旅長（gsl），跳過支部團長；多筆揀啟用中', () => {
  assert.equal(pickLeader(contacts, '206')?.id, 'tc-01');
  assert.equal(pickLeader(contacts, '17')?.id, 'tc-10');
  assert.equal(pickLeader(contacts, '82'), undefined);
});

let rows: LeaderRow[] = [];
check('buildLeaderRows：按旅號排序，帶出旅團名、主辦機構、支部，並配上旅長', () => {
  rows = buildLeaderRows(units, contacts, sectionsOf);
  assert.deepEqual(rows.map(r => r.troop), ['17', '82', '206']);
  const r206 = rows.find(r => r.troop === '206')!;
  assert.equal(r206.org, '太古城物業管理聯絡議會');
  assert.deepEqual(r206.sections, ['gh', 'cub', 'scout', 'venture']);
  assert.equal(r206.contactId, 'tc-01');
  assert.equal(r206.note, '備註');
  assert.equal(r206.value.name, '張國強');
  const r82 = rows.find(r => r.troop === '82')!;
  assert.equal(r82.contactId, '');
  assert.equal(r82.recordActive, true);
  assert.equal(isRowDirty(r82), false);
});

check('applyLeaderEntries：套用到對應旅，標示未儲存；未知旅報錯', () => {
  const parsed = parseLeaderPaste('82 李小芬 9345 6789 li@example.com\n999 無名 9999 9999\n17 新旅長 9456 7890');
  const res = applyLeaderEntries(rows, parsed.entries);
  assert.equal(res.applied, 2);
  assert.match(res.errors.join('|'), /找不到旅團：第 999 旅/);
  const r82 = res.rows.find(r => r.troop === '82')!;
  assert.deepEqual(r82.value, { name: '李小芬', phone: '9345 6789', email: 'li@example.com' });
  assert.equal(isRowDirty(r82), true);
  assert.equal(isRowDirty(res.rows.find(r => r.troop === '206')!), false);
  assert.equal(isRowDirty(res.rows.find(r => r.troop === '17')!), false, '同樣內容唔算改動');
});

check('applyLeaderEntries：同一旅貼兩次，以最後一行為準', () => {
  const res = applyLeaderEntries(rows, parseLeaderPaste('82 甲 9111 1111\n82 乙 9222 2222').entries);
  assert.match(res.errors.join('|'), /第 82 旅出現多次/);
  assert.equal(res.rows.find(r => r.troop === '82')!.value.name, '乙');
});

check('leaderProblem：同後台 saveTroopContact 規則一致', () => {
  assert.equal(leaderProblem({ name: '', phone: '', email: '' }), 'clear');
  assert.equal(leaderProblem({ name: '', phone: '9123 4567', email: '' }), 'noName');
  assert.equal(leaderProblem({ name: '張', phone: '', email: '' }), 'noContact');
  assert.equal(leaderProblem({ name: '張', phone: '', email: 'x@y' }), 'badEmail');
  assert.equal(leaderProblem({ name: '張', phone: '9123 4567', email: '' }), 'ok');
  assert.equal(leaderProblem({ name: ' 張 ', phone: '', email: 'a@b.co' }), 'ok');
});

check('telLink：去除空格，取第一組號碼', () => {
  assert.equal(telLink('9123 4567'), 'tel:91234567');
  assert.equal(telLink('2957 6411 / 2957 6417'), 'tel:29576411');
});

console.log(`\n${pass} 項測試全部通過`);
