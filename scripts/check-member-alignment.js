#!/usr/bin/env node
/**
 * 成員系統 ↔ 統一後台 對齊檢查
 *
 *   node scripts/check-member-alignment.js                 # 自動 clone member-portal（要有 gh / git）
 *   node scripts/check-member-alignment.js /path/to/member-portal
 *
 * 呢個 repo 嘅 gs/Code.gs 係**唯一後台**（見 docs/member-gs-handshake.md）。
 * 檢查三樣嘢：
 *   1. 成員系統程式碼入面叫緊嘅 action，後台有冇？（缺 = 佢一定收到「未知的 action」）
 *   2. 成員系統 proxy 嘅 GET allowlist，同後台公開 action 對唔對得上？
 *   3. 成員系統 proxy 有冇不小心放行咗需要登入／批核嘅 action？（安全邊界）
 * 淨係讀檔＋regex，唔會改任何嘢。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CODE_GS = path.join(ROOT, 'gs', 'Code.gs');
const REPO = 'https://github.com/playerkousas-rgb/member-portal.git';

// ── 後台：doGet / doPost 有嘅 action ──────────────────────
function backendActions() {
  const src = fs.readFileSync(CODE_GS, 'utf8');
  const iGet = src.indexOf('function doGet('), iPost = src.indexOf('function doPost(');
  const iEnd = src.indexOf('// ===================== 基礎工具');
  const getSrc = src.slice(iGet, iPost);
  const postSrc = src.slice(iPost, iEnd > 0 ? iEnd : undefined);
  const grab = (s) => [...s.matchAll(/case '([A-Za-z0-9_]+)'/g)].map(m => m[1]);
  // 「公開」＝ doGet/doPost 入面公開段落（唔使 token）嘅 action
  const publicMark = (s) => {
    const out = new Set();
    s.split('\n').forEach(line => {
      const m = line.match(/case '([A-Za-z0-9_]+)'/);
      if (!m) return;
      if (/token/.test(line)) return;                 // 有 token = 要登入
      out.add(m[1]);
    });
    return out;
  };
  const version = (src.match(/version: '([\d.]+)'/) || [])[1] || '?';
  return {
    version,
    get: new Set(grab(getSrc)),
    post: new Set(grab(postSrc)),
    all: new Set([...grab(getSrc), ...grab(postSrc)]),
    publicish: new Set([...publicMark(getSrc), ...publicMark(postSrc)]),
  };
}

// ── 成員系統：叫緊咩 action ───────────────────────────────
function memberInfo(dir) {
  const files = [];
  (function walk(d) {
    for (const name of fs.readdirSync(d)) {
      if (['node_modules', '.git', '.next', 'out'].includes(name)) continue;
      const full = path.join(d, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx)$/.test(name)) files.push(full);
    }
  })(dir);

  const called = new Map();   // action → [檔案]
  const proxy = path.join(dir, 'app', 'api', 'proxy', 'route.ts');
  let getAllow = [], postAllow = [];
  if (fs.existsSync(proxy)) {
    const src = fs.readFileSync(proxy, 'utf8');
    const getBlock = (src.match(/GET_ACTIONS\s*=\s*new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '';
    getAllow = [...getBlock.matchAll(/'([A-Za-z0-9_]+)'/g)].map(m => m[1]);
    const postBlock = (src.match(/POST_FIELDS[^=]*=\s*\{([\s\S]*?)\n\};/) || [])[1] || '';
    postAllow = [...postBlock.matchAll(/^\s{2}([A-Za-z0-9_]+):/gm)].map(m => m[1]);
  }

  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/'((?:get|list|submit|add|save|set|delete)[A-Z][A-Za-z0-9_]*)'/g)) {
      const rel = path.relative(dir, f);
      if (!called.has(m[1])) called.set(m[1], new Set());
      called.get(m[1]).add(rel);
    }
  }
  return { called, getAllow, postAllow };
}

function main() {
  let dir = process.argv[2];
  if (!dir) {
    dir = '/tmp/member-portal-align';
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('→ clone member-portal…');
    execSync(`git clone --depth 1 ${REPO} ${dir}`, { stdio: 'ignore' });
  }
  if (!fs.existsSync(dir)) { console.error('搵唔到 member-portal：' + dir); process.exit(1); }

  const be = backendActions();
  const me = memberInfo(dir);
  let head = '';
  try { head = execSync('git log --oneline -1', { cwd: dir }).toString().trim(); } catch {}

  console.log('\n══ 成員系統 ↔ 統一後台 對齊檢查 ══');
  console.log('後台 gs/Code.gs   version ' + be.version + '（' + be.all.size + ' 個 action）');
  console.log('成員系統          ' + dir + (head ? '  @ ' + head : ''));

  let problems = 0;

  console.log('\n[1] 成員系統叫緊、後台有冇？');
  const calls = [...me.called.keys()].sort();
  if (!calls.length) console.log('  （搵唔到任何 action 字串，檢查一下路徑）');
  for (const a of calls) {
    const has = be.all.has(a);
    if (!has) problems++;
    console.log(`  ${has ? '✅' : '❌ 缺'} ${a.padEnd(26)} ${[...me.called.get(a)].slice(0, 3).join(', ')}`);
  }

  console.log('\n[2] 成員系統 proxy GET allowlist');
  if (!me.getAllow.length) console.log('  （讀唔到 GET_ACTIONS）');
  for (const a of me.getAllow) {
    const has = be.get.has(a);
    if (!has) problems++;
    console.log(`  ${has ? '✅' : '❌ 後台冇'} ${a}`);
  }
  const missingAllow = [...be.publicish].filter(a => /^(list|get)/.test(a) && be.get.has(a) && !me.getAllow.includes(a));
  if (missingAllow.length) {
    console.log('  ℹ️ 後台有、成員端未放行（想用就要加白名單，唔加唔會出錯）：');
    missingAllow.forEach(a => console.log('     · ' + a));
  }

  console.log('\n[3] 安全邊界：成員 proxy 有冇放行需要登入／批核嘅 action？');
  const risky = [...me.getAllow, ...me.postAllow].filter(a => be.all.has(a) && !be.publicish.has(a));
  if (risky.length) { problems += risky.length; risky.forEach(a => console.log('  ⛔ ' + a + '（後台要 token）')); }
  else console.log('  ✅ 冇');

  console.log('\n' + (problems ? `⚠️ 有 ${problems} 項要處理` : '🎉 完全對齊'));
  process.exit(problems ? 1 : 0);
}

main();
