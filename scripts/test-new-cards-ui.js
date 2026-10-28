/**
 * v4.33.0 三張新卡真 TSX 渲染測試（唔使開瀏覽器）— node scripts/test-new-cards-ui.js
 * 驗證：👁 只讀用戶冇編輯掣、✏️ 用戶先有；重要日期自動分將來／已過去；
 *       實體密碼有警告橫額；三頁都係跟後台回傳嘅 access 而唔係本機卡片清單。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup: render } = require('react-dom/server');

const root = path.join(__dirname, '..');

/** 用 React 嘅 hook 行為跑一次 render：useEffect 唔會喺 SSR 行，所以用預載狀態代替 */
function makeLoader(stubs) {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    function dependency(id) {
      if (stubs[id]) return stubs[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(path.dirname(file), id);
        const resolved = [base, base + '.ts', base + '.tsx'].find(f => fs.existsSync(f) && fs.statSync(f).isFile());
        return load(resolved);
      }
      return require(id);
    }
    new Function('require', 'module', 'exports', js)(dependency, mod, mod.exports);
    return mod.exports;
  };
}

/**
 * render 一頁：用「排好隊嘅 useState 初值」扮載入完嘅狀態。
 * queue 入面係逐個 useState 要覆寫嘅初值（undefined = 用原本預設）。
 */
function renderPage(file, queue, extraStubs = {}) {
  let i = 0;
  const reactStub = {
    ...React,
    useState: (initial) => {
      const override = queue[i++];
      const value = override === undefined
        ? (typeof initial === 'function' ? initial() : initial)
        : override;
      return [value, () => {}];
    },
    useEffect: () => {},
  };
  const stubs = {
    react: reactStub,
    'next/navigation': { useRouter: () => ({ replace() {}, push() {} }), useSearchParams: () => new URLSearchParams() },
    '@/lib/api': { api: {} },
    '@/components/BackLink': { __esModule: true, default: () => null, BackBar: () => null },
    ...extraStubs,
  };
  const load = makeLoader(stubs);
  const Page = load(path.join(root, file)).default;
  return render(React.createElement(Page));
}

const session = { token: 'tok', email: 'me@x.org', role: 'DDC_ADMIN', level: 2 };
const cardStub = { '@/lib/cardAccess': { useRequireCard: () => session } };

let pass = 0;
function check(name, fn) { fn(); pass++; console.log('  ✓ ' + name); }

console.log('v4.33.0 三張新卡畫面測試');

// ── 🔗 常用連結 ──
const LINKS = [
  { id: 'lk-1', title: 'HKIR 停車場登記', url: 'http://bit.ly/HKIRCarPark', category: '港島地域', note: '活動前一日截止' },
  { id: 'lk-2', title: '區會報銷表', url: 'https://example.org/claim', category: '' },
];
// useState 次序：items, access, loading, error, msg, busy, draft, …（search 喺最後或中間都好，照 queue 填）
const linksView = renderPage('app/links/page.tsx', [LINKS, 'view', false], cardStub);
const linksEdit = renderPage('app/links/page.tsx', [LINKS, 'edit', false], cardStub);

check('連結：兩個身份都睇到標題、網址同分類分組', () => {
  [linksView, linksEdit].forEach(html => {
    assert.ok(html.includes('HKIR 停車場登記'));
    assert.ok(html.includes('http://bit.ly/HKIRCarPark'));
    assert.ok(html.includes('港島地域'), '有分類要分組顯示');
    assert.ok(html.includes('一般'), '冇分類嘅歸「一般」');
    assert.ok(html.includes('活動前一日截止'));
  });
});

check('連結：👁 冇加／✏️／🗑 掣，✏️ 身份先有', () => {
  assert.ok(!linksView.includes('＋ 加連結'), '只讀用戶唔應該見到新增掣');
  assert.ok(!/<button[^>]*>(✏️|🗑)<\/button>/.test(linksView), '只讀用戶唔應該見到改／刪掣');
  assert.ok(linksEdit.includes('＋ 加連結'));
  assert.ok(linksEdit.includes('>✏️</button>') && linksEdit.includes('>🗑</button>'));
});

check('連結：兩個身份都有「複製網址」，而且連結係新分頁＋noreferrer', () => {
  assert.ok(linksView.includes('複製'));
  assert.ok(linksView.includes('target="_blank"'));
  assert.ok(linksView.includes('noreferrer'), '出外連結要 rel=noreferrer');
});

// ── 📅 重要日期 ──
const KEY_DATES = [
  { id: 'kd-1', title: '青少年委員會會議', dateText: '9Nov2026', startDate: '2026-11-09', endDate: '2026-11-09', precision: 'day' },
  { id: 'kd-2', title: 'HKIR Retreat', dateText: '17-18Apr2027', startDate: '2027-04-17', endDate: '2027-04-18', precision: 'day' },
  { id: 'kd-3', title: '區大露營', dateText: '2027', startDate: '2027-01-01', endDate: '2027-12-31', precision: 'year' },
  { id: 'kd-4', title: '地域執委會會議', dateText: '25Aug2020', startDate: '2020-08-25', endDate: '2020-08-25', precision: 'day' },
  { id: 'kd-5', title: '區執委會會議', dateText: '待定', startDate: '', endDate: '', precision: 'none' },
];
const kdView = renderPage('app/key-dates/page.tsx', [KEY_DATES, 'view', false], cardStub);
const kdEdit = renderPage('app/key-dates/page.tsx', [KEY_DATES, 'edit', false], cardStub);

check('重要日期：將來同未定日期顯示，過咗期嘅收埋（撳「已過去」先展開）', () => {
  assert.ok(kdView.includes('青少年委員會會議'));
  assert.ok(kdView.includes('HKIR Retreat'));
  assert.ok(kdView.includes('區大露營'));
  assert.ok(kdView.includes('區執委會會議'), '未定日期要照顯示（唔好靜雞雞唔見咗）');
  assert.ok(!kdView.includes('地域執委會會議'), '2020 年嘅會議應收喺「已過去」未展開');
  assert.ok(/已過去/.test(kdView), '要有「已過去」入口');
});

check('重要日期：日期顯示返人睇得明嘅格式（含跨日範圍同年份）', () => {
  assert.ok(/2026/.test(kdView) && /2027/.test(kdView));
  assert.ok(kdView.includes('17') && kdView.includes('18'), '17-18Apr2027 要顯示到兩日');
  assert.ok(/待定|未定/.test(kdView), '未定日期要有提示');
});

check('重要日期：👁 冇加／✏️／🗑 掣，✏️ 先有；兩者都有複製清單同下載 .ics', () => {
  assert.ok(!kdView.includes('＋ 加日期'), '只讀用戶唔應該見到新增掣');
  assert.ok(!/<button[^>]*>(✏️|🗑)<\/button>/.test(kdView), '只讀用戶唔應該見到改／刪掣');
  assert.ok(kdEdit.includes('＋ 加日期'));
  assert.ok(kdEdit.includes('>✏️</button>') && kdEdit.includes('>🗑</button>'));
  assert.ok(kdView.includes('📋 複製清單') && kdEdit.includes('📋 複製清單'));
  assert.ok(/ics|日曆/i.test(kdView), '要有匯入日曆（.ics）出口');
});

// ── 🔢 實體密碼 ──
const PASSCODES = [
  { id: 'pc-1', name: '1802 房門', code: '1802#', location: '地域總部 18 樓', note: '夜晚 10 點後會自動鎖' },
  { id: 'pc-2', name: '影印機', code: '2468', location: '' },
];
const pcView = renderPage('app/passcodes/page.tsx', [PASSCODES, 'view', false], cardStub);
const pcEdit = renderPage('app/passcodes/page.tsx', [PASSCODES, 'edit', false], cardStub);

check('實體密碼：密碼同位置顯示到，冇位置歸「其他」', () => {
  [pcView, pcEdit].forEach(html => {
    assert.ok(html.includes('1802 房門') && html.includes('1802#'));
    assert.ok(html.includes('影印機') && html.includes('2468'));
    assert.ok(html.includes('地域總部 18 樓'));
    assert.ok(html.includes('其他'), '冇位置歸「其他」');
    assert.ok(html.includes('夜晚 10 點後會自動鎖'));
  });
});

check('實體密碼：頁頂有「唔准放網上帳戶密碼」警告', () => {
  [pcView, pcEdit].forEach(html => {
    assert.ok(/實體/.test(html) && /帳戶|登入|網上/.test(html), '要有實體密碼專用警告');
  });
});

check('實體密碼：👁 冇加／✏️／🗑 掣，✏️ 先有；兩者都可以複製', () => {
  assert.ok(!pcView.includes('＋ 加密碼'), '只讀用戶唔應該見到新增掣');
  assert.ok(!/<button[^>]*>(✏️|🗑)<\/button>/.test(pcView), '只讀用戶唔應該見到改／刪掣');
  assert.ok(pcEdit.includes('＋ 加密碼'));
  assert.ok(pcEdit.includes('>✏️</button>') && pcEdit.includes('>🗑</button>'));
  assert.ok(pcView.includes('📋 複製'));
});

// ── 共通 ──
check('三頁都靠後台 access 決定編輯權（本機卡片清單改唔到）', () => {
  ['app/links/page.tsx', 'app/key-dates/page.tsx', 'app/passcodes/page.tsx'].forEach(f => {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(/access === 'edit'/.test(src), `${f} 應該用後台 access 判斷`);
    assert.ok(/useRequireCard\('/.test(src), `${f} 應該有卡片門禁`);
  });
});

console.log(`\n全部通過（${pass} 項）✓\n`);
