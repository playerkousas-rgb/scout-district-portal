/** Render the real TSX without a browser: readonly staff can create, but not edit old visits. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup: render } = require('react-dom/server');
const root = path.join(__dirname, '..');
const cache = new Map();
let memberHooks = 0;
const memberDir = process.argv[2];
const memberDirectory = { districtName: '測試區', troops: [{ troop: '1745', label: '第1745旅', organizer: '測試', sectionCounts: { scout: '1', cub: '0' }, units: [{ section: 'scout', label: '童軍團', unitCode: '' }] }] };
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  let source = fs.readFileSync(file, 'utf8');
  if (file.endsWith('/app/visit/page.tsx')) source += '\nexport { BoardTab, VisitModal };';
  const js = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  function dependency(id) {
    if (file.endsWith('/app/troops/page.tsx')) {
      if (id === 'react') return { ...React, useState: () => [[memberDirectory, false, '', null, null][memberHooks++], () => {}] };
      if (id === 'next/link') return { __esModule: true, default: ({ children, href }) => React.createElement('a', { href }, children) };
      if (id === '@/components/TroopDialog') return { __esModule: true, default: () => null };
      if (id === '@/lib/troops') return load(path.join(memberDir, 'lib/troops.ts'));
    }
    if (id === 'next/navigation') return { useRouter: () => ({ replace() {}, push() {} }), useSearchParams: () => new URLSearchParams('troop=1745') };
    if (id === '@/lib/api') return { api: {} };
    if (id === '@/lib/cardAccess') return { useRequireCard: () => null };
    if (id === '@/lib/useDistrict') return { useDistrict: () => ({ withDistrict: p => p }) };
    if (id === '@/lib/hqReport') return { downloadHqXlsx() {} };
    if (id === '@/components/BackLink') return { __esModule: true, default: () => null, BackBar: () => null };
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(path.dirname(file), id);
      const resolved = [base, base + '.ts', base + '.tsx'].find(f => fs.existsSync(f) && fs.statSync(f).isFile());
      return load(resolved);
    }
    return require(id);
  }
  new Function('require', 'module', 'exports', js)(dependency, mod, mod.exports);
  return mod.exports;
}
const troop = { troop: '1745', label: '第1745旅', org: '測試', sections: { gh: '', cub: '0', scout: '1', venture: '', rover: '' }, active: true };
const visit = { id: 'old', troop: '1745', section: 'scout', visitDate: '2026-10-25', kind: 'general', visitorName: '職員', visitorEmail: 'staff@example.org' };
const board = { units: [troop], visits: [visit], today: '2026-10-26', from: '2026-01-01', to: '2026-12-31', me: { name: '職員', email: 'staff@example.org' },
  unitSectionsReady: true, unitSectionsScopedSave: true, publicTroopFieldsReady: true,
  unitSections: [{ troop: '1745', section: 'venture', unitCode: '', meetingTime: '舊深資資料' }],
  permissions: { version: 1, canRegister: true, canEditRecords: false }, canEdit: false, permissionsVersion: 1 };
const props = { board, token: 'test', reload: async () => {}, flash() {}, setError() {} };
const { BoardTab, VisitModal } = load(path.join(root, 'app/visit/page.tsx'));
const html = render(React.createElement(BoardTab, { ...props, section: '', canEdit: false, canRegister: true }));
assert.ok(html.includes('儲存登記') && html.includes('✎ 詳細'), 'view users can open new detail form and register');
assert.ok(!html.includes('>編輯<') && !html.includes('>刪除<'), 'existing own record not editable');
assert.equal((html.match(/class="vs-chip/g) || []).length, 1, '1745 one chip, no disabled sections');
const ddc = render(React.createElement(BoardTab, { ...props, section: '', canEdit: true, canRegister: true }));
assert.ok(ddc.includes('>編輯<') && ddc.includes('>刪除<'));
const unavailable = render(React.createElement(BoardTab, { ...props, section: '', canEdit: false, canRegister: false }));
assert.ok(!unavailable.includes('✎ 詳細') && !unavailable.includes('class="vs-savebar'));
const modal = render(React.createElement(VisitModal, { ...props, draft: { troop: '1745' }, onClose() {}, onSaved() {} }));
const sectionSelect = modal.match(/<select[^>]*>([\s\S]*?)<\/select>/)[1];
assert.equal((sectionSelect.match(/<option/g) || []).length, 2, 'all troop + Scout, not five sections');
assert.ok(modal.includes('readonly=""'), 'staff identity is not editable');
const Directory = load(path.join(root, 'components/TroopDirectoryEditor.tsx')).default;
const directory = render(React.createElement(Directory, { ...props, canEdit: false }));
assert.ok(directory.includes('童軍') && !directory.includes('舊深資資料'));
assert.equal((directory.match(/<fieldset/g) || []).length, 1, 'only operated Scout section card');
assert.ok(!directory.includes('>儲存第') && !directory.includes('編輯旅團名單／'), 'staff cannot edit directory');
assert.ok(!directory.includes('小童軍') && !directory.includes('幼童軍') && !directory.includes('深資童軍') && !directory.includes('樂行童軍'));
console.log('✓ Real TSX render: view users create visits, DDC+ edit/delete, 1745 one chip and one section card, preserve closed data without displaying it');

if (memberDir) {
  const { execFileSync } = require('node:child_process');
  const os = require('node:os');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'member-section-test-'));
  try {
    const original = path.join(memberDir, 'app/troops/page.tsx');
    const patched = path.join(temp, 'app/troops/page.tsx');
    fs.mkdirSync(path.dirname(patched), { recursive: true });
    fs.copyFileSync(original, patched);
    execFileSync('git', ['apply', path.join(root, 'docs/patches/member-portal-v4.31.0-open-sections.patch')], { cwd: temp });
    memberHooks = 0;
    const before = render(React.createElement(load(original).default));
    assert.equal((before.match(/class="section-chip/g) || []).length, 5, 'reproduce latest member MAIN hard-coded 5 chips');
    memberHooks = 0;
    const after = render(React.createElement(load(patched).default));
    assert.equal((after.match(/class="section-chip/g) || []).length, 1, 'patched actual member TSX displays only Scout, skips empty/0');
    console.log('✓ Member handoff patch applies to latest source and real TSX render changes 1745 from 5 chips to 1');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
