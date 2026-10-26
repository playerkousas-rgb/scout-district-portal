#!/usr/bin/env node
/** Execute our GS public response through the actual member-portal v1.3 sanitizer. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function checkMemberTroopContract(memberDir) {
  const file = path.join(memberDir, 'lib/troops.ts');
  assert.ok(fs.existsSync(file), 'member-portal 缺少 lib/troops.ts，無法確認名錄合約');
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(source.includes('sectionCounts') && source.includes('sanitizeUnit'), '成員端不是 v1.3 旅→團合約');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(id => {
    throw new Error(`成員端 sanitizer 新增了 runtime 依賴，請先審查：${id}`);
  }, mod, mod.exports);

  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../gs/Code.gs'), 'utf8'), ctx);
  // Only storage is mocked: exercise the real GS normalizers, parser and public allowlist.
  const troops = [
    { troop: '101', label: '港島第101旅', org: '測試主辦機構', sections: { scout: '1+A1', venture: '1+A1+S1' }, active: true, publicVisible: true },
    { troop: '206', label: '港島第206旅', org: '測試機構', sections: { cub: '2', scout: '1' }, active: true, publicVisible: true },
    { troop: '50', label: '已停用', sections: { scout: '1' }, active: false, publicVisible: true },
    { troop: '51', label: '非公開', sections: { scout: '1' }, active: true, publicVisible: false },
  ];
  let rows = [
    { troop: '101', section: 'scout', unitCode: '', meetingTime: '星期六 14:00', location: '校本部', instagramUrl: 'https://example.org/ig/', active: 'TRUE', publicVisible: 'TRUE', note: 'private' },
    { troop: '101', section: 'scout', unitCode: 'A1', active: 'TRUE', publicVisible: 'FALSE', location: 'private-location' },
  ];
  ctx.visitUnits_ = () => troops;
  ctx.readSheet_ = name => name === 'UnitSections' ? rows : [];
  ctx.districtCode_ = () => 'SKW';
  ctx.getConfigValue_ = () => '筲箕灣區';
  const payload = JSON.parse(JSON.stringify(ctx.listDistrictTroops_().data));
  const sanitized = mod.exports.sanitizeTroopsDirectory(payload);
  assert.deepEqual(sanitized, payload, '成員端 sanitizer 丟失／改寫 GS 公開資料，合約未對齊');
  assert.equal(payload.troops.length, 2);
  assert.equal(payload.troops[0].units.length, 1);
  assert.equal(payload.troops[0].units[0].location, '校本部');
  assert.equal(payload.troops[1].units.length, 3, '未維護旅沿用支部團數生成骨架');
  assert.ok(!JSON.stringify(payload).includes('private'));
  rows = rows.map(r => ({ ...r, publicVisible: 'FALSE' }));
  assert.equal(ctx.listDistrictTroops_().data.troops[0].units.length, 0, '全隱藏不可重新合成團');
  console.log('  ✅ 實際 GS 回應 → 成員端 v1.3 sanitizer：sectionCounts、units、location、舊欄位完整保留');
}

module.exports = { checkMemberTroopContract };
if (require.main === module) {
  if (!process.argv[2]) throw new Error('用法：node scripts/test-member-troop-contract.js /path/to/member-portal');
  checkMemberTroopContract(process.argv[2]);
}
