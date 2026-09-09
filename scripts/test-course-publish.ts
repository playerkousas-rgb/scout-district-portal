/**
 * ⚡ 舊制快速上架測試
 * 行法：node --experimental-strip-types scripts/test-course-publish.ts
 * 涵蓋：lib/course-publish.ts — 節次揀選／班領導人行／開班登記對應／
 *      智能貼上（用 demo seed 做 fixture）。
 */
import assert from 'node:assert';
import { demoCourseProfile } from '../lib/demo/seed.ts';
import {
  contactOf, leaderLineOf, parseQuickPaste, profileToLink, publishSessions,
} from '../lib/course-publish.ts';
import type { CourseProfile } from '../lib/types.ts';

let pass = 0;
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`); process.exitCode = 1; }
}

console.log('舊制快速上架（profile→開班登記→通告草稿）測試');

const p = demoCourseProfile() as unknown as CourseProfile;

check('節次：✓上通告嗰兩節先計，通告顯示中文優先', () => {
  const s = publishSessions(p);
  assert.strictEqual(s.length, 2);
  assert.ok(s[0].date.includes('年') && s[0].date.includes('月'));
  assert.strictEqual(s[0].time, '晚上7時至晚上10時');
  assert.strictEqual(s[0].venue, '區總部');
});

check('節次：一節都冇剔就用全部（唔會吉）', () => {
  const q = { ...p, sessions: p.sessions.map(x => ({ ...x, showOnCircular: false, displayDate: '', displayTime: '', displayVenue: '' })) };
  const s = publishSessions(q);
  assert.strictEqual(s.length, 3);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(s[0].date));
});

check('班領導人行＋聯絡行', () => {
  assert.strictEqual(leaderLineOf(p), '陳大文先生（急救教練員）');
  assert.strictEqual(contactOf(p), '陳大文先生（班領導人） 9123 4567 demo@demo');
});

check('開班登記：名稱／收費／名額／截止／場地／節數自動填', () => {
  const link = profileToLink(p, { scriptExecUrl: 'https://script.google.com/macros/s/ABC/exec', scriptApiKey: 'ck_test123' });
  assert.strictEqual(link.courseId, '');
  assert.strictEqual(link.title, '第1屆急救工作坊（示範）');
  assert.strictEqual(link.fee, '25');
  assert.strictEqual(link.quota, '22');
  assert.strictEqual(link.deadline, p.deadline);
  assert.strictEqual(link.venue, '區總部');
  assert.ok((link.sessionsText || '').includes('；'));
  assert.strictEqual(link.badgeName, '急救');
  assert.strictEqual(link.section, '童軍');
  assert.strictEqual(link.active, 'TRUE');
  assert.strictEqual(link.scriptExecUrl, 'https://script.google.com/macros/s/ABC/exec');
  assert.strictEqual(link.scriptApiKey, 'ck_test123');
  assert.strictEqual(link.eligibility, '已宣誓及持有有效紀錄冊之童軍支部成員。');
});

check('智能貼上：兩行一次過貼得分開', () => {
  const r = parseQuickPaste('https://script.google.com/macros/s/ABC123/exec\nck_m1234abcd5678');
  assert.strictEqual(r.exec, 'https://script.google.com/macros/s/ABC123/exec');
  assert.strictEqual(r.key, 'ck_m1234abcd5678');
});

check('智能貼上：調轉次序／夾雜文字都認得', () => {
  const r = parseQuickPaste('Key: ck_xyz789 exec: https://script.google.com/macros/s/ZZZ/exec 多謝');
  assert.strictEqual(r.exec, 'https://script.google.com/macros/s/ZZZ/exec');
  assert.strictEqual(r.key, 'ck_xyz789');
});

check('智能貼上：得一條 URL 就只回 URL（唔亂估 Key）', () => {
  const r = parseQuickPaste('https://script.google.com/macros/s/ABC/exec');
  assert.strictEqual(r.exec, 'https://script.google.com/macros/s/ABC/exec');
  assert.strictEqual(r.key, '');
});

console.log(`\n共 ${pass} 項通過${process.exitCode ? '（有失敗）' : ''}`);
