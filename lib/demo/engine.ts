/**
 * 🎭 模擬示範版 — 本地引擎（v4.9.0）
 * ================================================================
 * 喺 lib/api.ts 呢一層攔截：demo 模式開著時，所有 API 呼叫行呢個引擎，
 * 100% 喺瀏覽器入面完成（never 打去 /api/proxy 或任何後端）。
 * 改動存 sessionStorage（關咗個 tab 就冇，重新整理都保留），
 * 有「↺ 重設示範資料」一鍵還原。
 *
 * 純邏輯：可以用 node 測試（唔 depend 瀏覽器，storage 缺席就咩都唔 persist）。
 */

import {
  freshDemoDb, demoUserFor, demoRoomEvents, demoDistrictHqEvents, demoBudget, demoCourseProfile,
  demoCourseSetup, demoCourseSheetRaw, demoDefaultMatrix, demoDebitNotes,
  DEMO_CARDS, DEMO_SUB_PERMS, DEMO_ORG_GROUPS, DEMO_STAFF_ROWS, DEMO_HKSA_COUNCIL, DEMO_HKSA_DEPTS,
  demoTroopContacts, demoVisitRequests, demoLinks, demoKeyDates, demoPasscodes,
  DEMO_TOKEN, type DemoDb, type DemoUser,
} from './seed.ts';
import {
  normalizeDebitNoteAmount, normalizeDebitNoteDate, normalizeDebitNoteReminder, validateDebitNote,
  type DebitNoteDraft, type DebitNoteRecord,
} from '../debitNote.ts';
import { parseSingleKeyDate } from '../keyDates.ts';

type AnyObj = Record<string, any>;
type ApiResultLike = { ok: boolean; data?: any; error?: string };

const SNAPSHOT_KEY = 'portal_demo_state_v1';
const ROOM_IDS = ['1702', '1704A', '1704B', '1704', '1705', '1704+1705', '1802', '1803', '1806', '1808', '1906'];

let db: DemoDb | null = null;

function loadDb(): DemoDb {
  if (db) return db;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(SNAPSHOT_KEY);
      if (raw) {
        db = JSON.parse(raw) as DemoDb;
        // v1 快照缺 YMIS 卡：只補首次升級，往後仍容許管理員移除／自訂卡片。
        if (!db.schemaVersion || db.schemaVersion < 2) {
          const card = DEMO_CARDS.find(c => c.cardId === 'ymis');
          if (card && !db.cards.some(c => c.cardId === 'ymis')) {
            db.cards.push({ ...card });
            db.matrix.ymis = { ...demoDefaultMatrix().ymis };
          }
          db.schemaVersion = 2;
          persistDb();
        }
        // v3：補 DEBIT NOTE 卡；既有示範分頁毋須手動重設都見到新功能。
        if ((db.schemaVersion || 0) < 3) {
          const card = DEMO_CARDS.find(c => c.cardId === 'debitNote');
          if (card && !db.cards.some(c => c.cardId === 'debitNote')) {
            db.cards.push({ ...card });
            db.matrix.debitNote = { ...demoDefaultMatrix().debitNote };
          }
          db.schemaVersion = 3;
          persistDb();
        }
        // v4：DEBIT NOTE 由純 CSV 工具升級成可保存、翻查及匯出的示範帳簿。
        if ((db.schemaVersion || 0) < 4) {
          db.debitNotes = demoDebitNotes();
          db.schemaVersion = 4;
          persistDb();
        }
        if ((db.schemaVersion || 0) < 5) {
          db.matrix.troopDirectory = { ...demoDefaultMatrix().troopDirectory };
          db.matrix.visit = { ...demoDefaultMatrix().visit };
          db.schemaVersion = 5;
          persistDb();
        }
        // v6（GS v4.32.0）：兩張旅團卡合併為一張「旅團」卡 + 子權限行 + 聯絡／申請示範資料
        if ((db.schemaVersion || 0) < 6) {
          db.cards = db.cards.filter(c => c.cardId !== 'visit' && c.cardId !== 'troopDirectory');
          const card = DEMO_CARDS.find(c => c.cardId === 'troop');
          if (card && !db.cards.some(c => c.cardId === 'troop')) db.cards.push({ ...card });
          const defaults = demoDefaultMatrix();
          const matrix = db.matrix;
          DEMO_SUB_PERMS.forEach(sp => { if (!matrix[sp.id]) matrix[sp.id] = { ...defaults[sp.id] }; });
          if (!Array.isArray(db.troopContacts)) db.troopContacts = demoTroopContacts();
          if (!Array.isArray(db.visitRequests)) db.visitRequests = demoVisitRequests();
          db.schemaVersion = 6;
          persistDb();
        }
        // v7（GS v4.32.0 架構調整）：刪 unit／activity 主卡；activity 改做子權限並保留既有矩陣。
        if ((db.schemaVersion || 0) < 7) {
          db.cards = db.cards.filter(c => c.cardId !== 'unit' && c.cardId !== 'activity');
          if (!db.matrix.activity) db.matrix.activity = { ...demoDefaultMatrix().activity };
          delete db.matrix.unit;
          const troopCard = db.cards.find(c => c.cardId === 'troop');
          if (troopCard && troopCard.description === '旅團探訪 · 旅團資料 · 聯絡 · 申請邀請') {
            troopCard.description = '旅團探訪 · 旅團資料 · 活動知會 · 申請邀請';
          }
          db.schemaVersion = 7;
          persistDb();
        }
        // v8（GS v4.33.0）：🔗 常用連結 / 📅 重要日期 / 🔢 實體密碼三張新卡
        if ((db.schemaVersion || 0) < 8) {
          const defaults = demoDefaultMatrix();
          (['links', 'keyDates', 'passcodes'] as const).forEach(id => {
            const card = DEMO_CARDS.find(c => c.cardId === id);
            if (card && !db!.cards.some(c => c.cardId === id)) db!.cards.push({ ...card });
            if (!db!.matrix[id]) db!.matrix[id] = { ...defaults[id] };
          });
          if (!Array.isArray(db.links)) db.links = demoLinks();
          if (!Array.isArray(db.keyDates)) db.keyDates = demoKeyDates();
          if (!Array.isArray(db.passcodes)) db.passcodes = demoPasscodes();
          db.schemaVersion = 8;
          persistDb();
        }
        return db;
      }
    }
  } catch { /* ignore */ }
  db = freshDemoDb();
  persistDb();
  return db;
}

function persistDb() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage && db) {
      window.sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(db));
    }
  } catch { /* ignore */ }
}

/** 一鍵還原出廠示範資料 */
export function resetDemoData() {
  db = freshDemoDb();
  persistDb();
}

function ok(data?: any): ApiResultLike { return { ok: true, data: data ?? {} }; }
function fail(error: string): ApiResultLike { return { ok: false, error }; }

function nowIso(): string { return new Date().toISOString(); }
function today(): string { return nowIso().slice(0, 10); }
function genId(prefix: string): string {
  const d = loadDb();
  d.seq = (d.seq || 1000) + 1;
  return `${prefix}-${d.seq}`;
}

/** token → 示範身份（一律係 ADC·權限全開）；唔係示範 token 就 null */
function userForToken(token: string): DemoUser | null {
  const t = String(token || '');
  if (t.indexOf('demo-') !== 0) return null;
  return demoUserFor();
}

function requireUser(token: string, minLevel = 99): DemoUser | ApiResultLike {
  const u = userForToken(token);
  if (!u) return fail('未登入或登入已過期（示範版）。');
  if (u.mockAdmin) return u; // 🎭 示範版權限全開
  if (u.level > minLevel) {
    if (minLevel === 3) return fail('只有 ADC（助理區總監）或以上可以管理消息（示範版權限模擬）。');
    return fail(`權限不足：此功能只限第 ${minLevel} 級或以上（示範版權限模擬）。`);
  }
  return u;
}

function isErr(r: ApiResultLike | DemoUser): r is ApiResultLike {
  return (r as ApiResultLike).ok === false;
}

// ───────────────────────── 帳戶／系統 ─────────────────────────

function sessionPayload(u: DemoUser): AnyObj {
  return {
    email: u.email, displayName: u.displayName, role: u.role, roleLabel: u.roleLabel,
    isAdmin: u.isAdmin, isDC: u.isDC, canManageAccounts: u.canManageAccounts,
    scopes: u.scopes, level: u.level, levelLabel: u.levelLabel, isSuper: u.isSuper,
    mockAdmin: u.mockAdmin,
    token: `demo-${u.email.replace('demo-', '').replace('@demo', '')}`,
  };
}

function canEditVisits(u: DemoUser): boolean {
  return !!u.mockAdmin || u.role === 'SYSADMIN' || u.role === 'DC' || /^DDC(_|$)/.test(u.role);
}
function canEditDirectory(u: DemoUser): boolean {
  return canEditVisits(u) || /^ADC(_|$)/.test(u.role);
}

function troopScopeDemo(role: string): string {
  const map: Record<string, string> = { ADC_GH: 'gh', ADC_CUBS: 'cub', ADC_SCOUT: 'scout', ADC_VENTURE: 'venture', ADC_ROVER: 'rover' };
  return map[String(role || '').toUpperCase()] || '';
}

function filterDemoContacts(rows: AnyObj[], scope: string): AnyObj[] {
  if (!scope) return rows.slice();
  const active = rows.filter(c => c.active !== false);
  const troops = Array.from(new Set(active.map(c => String(c.troop))));
  const out: AnyObj[] = [];
  troops.forEach(troop => {
    const list = active.filter(c => String(c.troop) === troop);
    const mine = list.filter(c => c.section === scope);
    if (mine.some(c => c.contactRole === 'leader')) out.push(...mine);
    else out.push(...list.filter(c => c.contactRole === 'gsl'));
  });
  return out;
}

const TROOP_SUB_IDS_DEMO = DEMO_SUB_PERMS.filter(sp => sp.parentId === 'troop').map(sp => sp.id);

function demoSubAccess(u: DemoUser, id: string): 'edit' | 'view' | '' {
  if (u.mockAdmin || u.isSuper) return 'edit';
  if (id === 'visit') return canEditVisits(u) ? 'edit' : 'view';
  if (id === 'troopDirectory') return canEditDirectory(u) ? 'edit' : 'view';
  const matrix = loadDb().matrix;
  return ((matrix[id] || {})[u.role] || '') as 'edit' | 'view' | '';
}

function visibleCards(u: DemoUser): AnyObj[] {
  const d = loadDb();
  const subCards: AnyObj[] = DEMO_SUB_PERMS.flatMap(sp => {
    const access = demoSubAccess(u, sp.id);
    return access ? [{
      cardId: sp.id, title: sp.title, icon: sp.icon, type: 'subperm', url: '', description: '',
      order: 999, enabled: true, embed: false, source: 'core', category: 'done',
      access, subPerm: true, parentId: sp.parentId,
    }] : [];
  });
  // 🎭 示範版權限全開：全部卡片（連隱藏咗嘅都照列，enabled=false 做標示）、一律 edit。
  // 唯一例外：成人獎勵提名（awards）唔喺示範範圍 — 正式系統先用到。
  if (u.mockAdmin) {
    return d.cards
      .filter(c => c.cardId !== 'awards')
      .map((c): AnyObj => ({ ...c, access: 'edit' as const }))
      .sort((a, b) => a.order - b.order)
      .concat(subCards);
  }
  const mainCards = d.cards
    .filter(c => c.enabled || u.isSuper)
    .filter(c => {
      if (c.cardId === 'troop') return TROOP_SUB_IDS_DEMO.some(id => demoSubAccess(u, id) !== '');
      const access = (d.matrix[c.cardId] || {})[u.role] || '';
      return access !== '' || u.isSuper || u.level <= 1;
    })
    .map((c): AnyObj => {
      const access = (d.matrix[c.cardId] || {})[u.role] || '';
      if (c.cardId === 'troop') {
        const best = TROOP_SUB_IDS_DEMO.some(id => demoSubAccess(u, id) === 'edit') ? 'edit' : 'view';
        return { ...c, access: best };
      }
      return { ...c, access: u.level <= 1 ? (access || 'view') : access };
    })
    .sort((a, b) => a.order - b.order);
  return mainCards.concat(subCards);
}

// ───────────────────────── DEBIT NOTE 示範帳簿 ─────────────────────────

function requireDemoDebitNote(token: string, allowView = false): DemoUser | ApiResultLike {
  const u = userForToken(token);
  if (!u) return fail('未登入或登入已過期（示範版）。');
  if (u.mockAdmin || u.isSuper) return u;
  const access = (loadDb().matrix.debitNote || {})[u.role] || '';
  if (access === 'edit' || (allowView && access === 'view')) return u;
  return fail('你沒有此功能嘅權限。');
}

function checkDemoDebitNote(raw: AnyObj): { data?: DebitNoteDraft; error?: string } {
  const candidate: DebitNoteDraft = {
    to: String(raw?.to || '').trim(), attention: String(raw?.attention || '').trim(),
    date: String(raw?.date || '').trim(), ref: String(raw?.ref || '').trim(),
    amount: String(raw?.amount || '').trim(), particulars: String(raw?.particulars || '').trim(),
    status: String(raw?.status || '').trim(), remarks: String(raw?.remarks || '').trim(),
    reminder: normalizeDebitNoteReminder(raw?.reminder),
  };
  const validation = validateDebitNote(candidate);
  const firstError = Object.values(validation)[0];
  if (firstError) return { error: firstError };
  if (candidate.to.length > 140 || candidate.attention.length > 100) return { error: 'TO／Attention 太長。' };
  if (candidate.particulars.length > 500 || candidate.remarks.length > 500 || candidate.status.length > 80) {
    return { error: '款項內容／狀態／備註太長。' };
  }
  candidate.date = normalizeDebitNoteDate(candidate.date);
  candidate.amount = normalizeDebitNoteAmount(candidate.amount);
  return { data: candidate };
}

function demoDebitNoteRecord(draft: DebitNoteDraft, id: string, u: DemoUser, previous?: AnyObj): DebitNoteRecord {
  const d = loadDb();
  const now = nowIso();
  return {
    ...draft, id, districtCode: 'DEMO',
    fpsAccountName: String(d.config.fpsAccountName || '筲箕灣區童軍會（示範戶口）'),
    fpsAccountNumber: String(d.config.fpsAccountNumber || '123456-789（示範）'),
    fpsQrPayload: `DEMO-FPS-QR|${draft.ref}|${draft.amount}`,
    createdAt: String(previous?.createdAt || now), createdBy: String(previous?.createdBy || u.email),
    updatedAt: now, updatedBy: u.email,
  };
}

// ───────────────────────── v4.33.0 常用連結 / 重要日期 / 實體密碼 ─────────────────────────

/** 該帳戶對某張卡嘅示範權限（示範身份權限全開；其餘跟 matrix） */
function demoCardAccess(u: DemoUser, cardId: string): 'edit' | 'view' | '' {
  if (u.mockAdmin || u.isSuper) return 'edit';
  return ((loadDb().matrix[cardId] || {})[u.role] || '') as 'edit' | 'view' | '';
}

/** 需要 ✏️ 權限先做得（新增／修改／刪除） */
function requireDemoCard(token: string, cardId: string): DemoUser | ApiResultLike {
  const u = userForToken(token);
  if (!u) return fail('未登入或登入已過期（示範版）。');
  return demoCardAccess(u, cardId) === 'edit' ? u : fail('你沒有此功能嘅權限（示範版權限模擬）。');
}

/** 👁 或 ✏️ 都睇得；回應形狀同後台 getLinks／getKeyDates／getPasscodes 一致 */
function demoBoard(token: string, cardId: string, rows: AnyObj[]): ApiResultLike {
  const u = userForToken(token);
  if (!u) return fail('未登入或登入已過期（示範版）。');
  const access = demoCardAccess(u, cardId);
  if (access !== 'edit' && access !== 'view') return fail('你沒有此功能嘅權限（示範版權限模擬）。');
  const items = rows.map(x => ({ ...x }));
  if (cardId === 'links') {
    items.sort((a, b) => String(a.category || '').localeCompare(String(b.category || ''))
      || (Number(a.order) || 0) - (Number(b.order) || 0)
      || String(a.title || '').localeCompare(String(b.title || '')));
  } else if (cardId === 'keyDates') {
    items.sort((a, b) => String(a.startDate || '9999-99-99').localeCompare(String(b.startDate || '9999-99-99'))
      || String(a.title || '').localeCompare(String(b.title || '')));
  } else {
    items.sort((a, b) => String(a.location || '').localeCompare(String(b.location || ''))
      || (Number(a.order) || 0) - (Number(b.order) || 0)
      || String(a.name || '').localeCompare(String(b.name || '')));
  }
  return ok({ access, items });
}

/**
 * 🎭 示範版：成人獎勵提名（awards）不設示範 — 全部動作擋。
 * （正常情況下 /awards 已被卡片門禁 redirect 返主控台，呢個訊息只係後備。）
 */
function awardsNotInDemo(): ApiResultLike {
  return fail('此功能不設示範。');
}

// ───────────────────────── 主入口 ─────────────────────────

export function demoCall(action: string, payload: AnyObj, method: 'GET' | 'POST' | 'EXT'): ApiResultLike {
  const d = loadDb();
  const token = String(payload.token || '');
  const u = userForToken(token);

  switch (action) {

    // ── 帳戶 ──
    case 'login': {
      // 🎭 示範版：任何帳號密碼都入到同一個 ADC 示範身份（權限全開）
      return ok(sessionPayload(demoUserFor()));
    }
    case 'verify': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      const p = sessionPayload(u); delete p.token;
      return ok(p);
    }
    case 'health':
    case 'getHealthCheck':
      return ok({ ok: true, status: 'ok', version: '4.24.0-demo', teamupConfigured: true, ttlockConfigured: true, lockIdSet: true, ttlockDisabled: false });
    case 'getConfig': return ok(d.config);
    case 'getPublicInfo': return ok({ districtName: d.config.districtName, districtCode: 'SKW', troopList: d.units.map(x => x.troop), locked: d.system.locked });
    case 'getSystem': return ok(d.system);
    case 'setLock': {
      const r = requireUser(token, 1); if (isErr(r)) return r;
      d.system = { locked: !!payload.locked, lockMessage: String(payload.lockMessage || '') };
      persistDb(); return ok({ saved: true });
    }
    case 'changePassword': return ok({ saved: true });
    case 'requestPasswordReset': return ok({ sent: true, note: '示範版：唔會真係寄電郵。' });
    case 'resetPassword': return ok({ saved: true });

    // ── 卡片／權限 ──
    case 'getCards': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      return ok(visibleCards(u));
    }
    case 'listDebitNotes': {
      const r = requireDemoDebitNote(token, true); if (isErr(r)) return r;
      return ok((d.debitNotes || []).map(x => ({ ...x })).sort((a, b) => {
        const byDate = String(b.date || '').localeCompare(String(a.date || ''));
        return byDate || String(b.ref || '').localeCompare(String(a.ref || ''), 'en', { numeric: true });
      }));
    }
    case 'saveDebitNote': {
      const r = requireDemoDebitNote(token); if (isErr(r)) return r;
      const raw = (payload.note || {}) as AnyObj;
      const checked = checkDemoDebitNote(raw); if (checked.error || !checked.data) return fail(checked.error || '記錄無效。');
      const id = String(raw.id || '').trim();
      const existingIndex = id ? d.debitNotes.findIndex(x => x.id === id) : -1;
      if (id && existingIndex < 0) return fail('找不到這張 DEBIT NOTE。');
      const duplicate = d.debitNotes.find(x => String(x.ref).toLowerCase() === checked.data!.ref.toLowerCase() && x.id !== id);
      if (duplicate) return fail(`Ref No.「${checked.data.ref}」已存在。`);
      const record = demoDebitNoteRecord(checked.data, id || genId('dn'), r as DemoUser, existingIndex >= 0 ? d.debitNotes[existingIndex] : undefined);
      if (existingIndex >= 0) d.debitNotes[existingIndex] = record;
      else d.debitNotes.push(record);
      persistDb();
      return ok({ saved: true, record: { ...record } });
    }
    case 'importDebitNotes': {
      const r = requireDemoDebitNote(token); if (isErr(r)) return r;
      const rows = payload.rows;
      if (!Array.isArray(rows) || !rows.length) return fail('沒有可匯入的 DEBIT NOTE。');
      if (rows.length > 500) return fail('每次最多匯入 500 筆。');
      const valid: Array<{ data: DebitNoteDraft; sourceRow: number }> = [];
      const errors: Array<{ row: number; ref: string; error: string }> = [];
      rows.forEach((raw, index) => {
        const checked = checkDemoDebitNote(raw);
        const sourceRow = Number(raw?.sourceRow) || index + 2;
        if (checked.error || !checked.data) errors.push({ row: sourceRow, ref: String(raw?.ref || ''), error: checked.error || '記錄無效。' });
        else valid.push({ data: checked.data, sourceRow });
      });
      if (errors.length) return ok({ imported: 0, duplicates: 0, duplicateRefs: [], errors, aborted: true });
      const seen = new Set(d.debitNotes.map(x => String(x.ref || '').toLowerCase()));
      const duplicateRefs: string[] = [];
      valid.forEach(item => {
        const key = item.data.ref.toLowerCase();
        if (seen.has(key)) { duplicateRefs.push(item.data.ref); return; }
        seen.add(key);
        d.debitNotes.push(demoDebitNoteRecord(item.data, genId('dn'), r as DemoUser));
      });
      persistDb();
      return ok({ imported: valid.length - duplicateRefs.length, duplicates: duplicateRefs.length, duplicateRefs: duplicateRefs.slice(0, 30), errors: [], aborted: false });
    }
    case 'getYmisCredentials': {
      if (method !== 'POST' || !u || !visibleCards(u).some(c => c.cardId === 'ymis')) return fail('沒有 YMIS 帳戶查閱權限（示範版）。');
      // 純虛構、無法登入的字串；示範版絕不向正式後台讀取或保存任何帳密。
      return ok({ configured: true, username: 'DEMO-ACCOUNT-NOT-REAL', password: 'DEMO-NOT-A-REAL-PASSWORD' });
    }
    case 'getDistrictHqBookings': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      if (!visibleCards(u).some(c => c.cardId === 'rooms')) return fail('沒有房間日曆權限');
      const from = String(payload.from || ''), days = Number(payload.days);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isInteger(days) || days < 1 || days > 60) return fail('日曆日期或範圍不正確');
      const start = Date.parse(`${from}T00:00:00+08:00`);
      if (!Number.isFinite(start) || new Date(start + 8 * 3600000).toISOString().slice(0, 10) !== from) return fail('日曆日期不正確');
      return ok({ configured: true, events: demoDistrictHqEvents(start, days), fetchedAt: nowIso() });
    }
    case 'getPerms': {
      const r = requireUser(token, 1); if (isErr(r)) return r;
      return ok({ cards: d.cards.slice().sort((a, b) => a.order - b.order), roles: d.roles, matrix: d.matrix, subPerms: DEMO_SUB_PERMS });
    }
    case 'setBudgetSheetUrl': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      d.config.budgetSheetUrl = String(payload.budgetSheetUrl || '').trim();
      return ok({ saved: true, budgetSheetUrl: d.config.budgetSheetUrl });
    }
    case 'savePerms': {
      const r = requireUser(token, 1); if (isErr(r)) return r;
      const inMatrix = (payload.matrix || {}) as AnyObj;
      Object.keys(inMatrix).forEach(cardId => {
        d.matrix[cardId] = d.matrix[cardId] || {};
        const row = inMatrix[cardId] || {};
        Object.keys(row).forEach(role => { d.matrix[cardId][role] = row[role]; });
      });
      persistDb(); return ok({ saved: true });
    }
    case 'setCardEnabled': {
      const r = requireUser(token, 0); if (isErr(r)) return r;
      const c = d.cards.find(x => x.cardId === payload.cardId);
      if (!c) return fail('找不到卡片');
      c.enabled = !!payload.enabled;
      persistDb(); return ok({ saved: true });
    }
    case 'setCategoryEnabled': {
      const r = requireUser(token, 0); if (isErr(r)) return r;
      const cat = String(payload.category || '');
      let n = 0;
      d.cards.forEach(c => { if ((c.category || '') === cat) { c.enabled = !!payload.enabled; n++; } });
      d.categoryEnabled[cat] = !!payload.enabled;
      persistDb(); return ok({ saved: true, count: n });
    }
    case 'addRole': {
      const r = requireUser(token, 1); if (isErr(r)) return r;
      const role = String(payload.role || '').trim();
      if (!role) return fail('role 必填');
      if (d.roles.some(x => x.role === role)) return fail('角色已存在');
      d.roles.push({ role, label: String(payload.label || role), protected: false, level: Number(payload.level ?? 5) });
      persistDb(); return ok({ saved: true });
    }
    case 'updateRole': {
      const r = requireUser(token, 1); if (isErr(r)) return r;
      const role = d.roles.find(x => x.role === payload.role);
      if (!role) return fail('找不到角色');
      if (role.protected && payload.label !== undefined) role.label = String(payload.label);
      if (!role.protected && payload.level !== undefined) role.level = Number(payload.level);
      persistDb(); return ok({ saved: true });
    }
    case 'deleteRole': {
      const r = requireUser(token, 1); if (isErr(r)) return r;
      const role = d.roles.find(x => x.role === payload.role);
      if (!role) return fail('找不到角色');
      if (role.protected) return fail('受保護角色不可刪除（示範版）');
      d.roles = d.roles.filter(x => x.role !== payload.role);
      persistDb(); return ok({ deleted: true });
    }

    // ── 帳戶管理 ──
    case 'getUsers': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      return ok(d.users);
    }
    case 'updateUser': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const row = d.users.find(x => x.email === payload.email);
      if (!row) return fail('找不到帳戶');
      Object.assign(row, payload.patch || {});
      persistDb(); return ok({ saved: true });
    }
    case 'deleteUser': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      if (String(payload.email).indexOf('@demo') < 0) return fail('示範版：示範帳戶不可刪');
      d.users = d.users.filter(x => x.email !== payload.email);
      persistDb(); return ok({ deleted: true });
    }
    case 'batchCreateUsers': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const rows = (payload.users || []) as AnyObj[];
      let created = 0; const rejected: AnyObj[] = [];
      rows.forEach((row, i) => {
        const email = String(row.email || '').trim();
        if (!email || d.users.some(x => x.email === email)) { rejected.push({ row: i + 1, email, reason: '電郵重複或無效' }); return; }
        d.users.push({ email, displayName: row.displayName || email, role: row.role || 'AL', scopes: row.scopes || '', cards: row.cards || '', active: 'TRUE', mustChangePassword: true });
        created++;
      });
      persistDb(); return ok({ created, skipped: rejected.length, rejected });
    }

    // ── 授權 ──
    case 'getDelegation': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      return ok({
        me: { email: u.email, role: u.role, level: u.level, levelLabel: u.levelLabel },
        myAccess: Object.fromEntries(d.cards.map(c => [c.cardId, (d.matrix[c.cardId] || {})[u.role] || ''])),
        roles: d.roles.filter(x => x.level > u.level).map(x => ({ role: x.role, label: x.label, level: x.level })),
        cards: d.cards.filter(c => c.enabled).map(c => ({ cardId: c.cardId, title: c.title, icon: c.icon, enabled: c.enabled })),
        matrix: d.matrix,
      });
    }
    case 'delegatePerms': {
      const r = requireUser(token, 4); if (isErr(r)) return r;
      const grants = (payload.grants || {}) as AnyObj;
      const target = String(payload.targetRole || '');
      const targetRole = d.roles.find(x => x.role === target);
      let applied = 0; const rejected: string[] = [];
      if (!targetRole) return fail('找不到目標角色');
      d.cards.forEach(c => {
        const g = grants[c.cardId];
        if (g === undefined) return;
        d.matrix[c.cardId] = d.matrix[c.cardId] || {};
        d.matrix[c.cardId][target] = g;
        applied++;
      });
      persistDb(); return ok({ applied, rejected });
    }
    case 'revokePerms': {
      const r = requireUser(token, 4); if (isErr(r)) return r;
      const target = String(payload.targetRole || '');
      d.cards.forEach(c => { if (d.matrix[c.cardId]) delete d.matrix[c.cardId][target]; });
      persistDb(); return ok({ revoked: true });
    }

    // ── 消息（v4.9.0 軟刪除） ──
    case 'getAnnouncements': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      const list = d.announcements.map(a => decorate(a));
      return ok(list);
    }
    case 'listAnnouncements': {
      // 公開（成員端）：已刪／已下架／未到日／過期 一律不出現
      const pinnedOnly = payload.pinnedOnly === '1' || payload.pinnedOnly === true;
      const since = String(payload.since || '');
      let list = d.announcements
        .filter(a => !a.deleted && a.active !== false)
        .filter(a => !a.date || a.date <= today())
        .filter(a => !a.expiresAt || a.expiresAt >= today())
        .filter(a => !pinnedOnly || a.pinned);
      if (since) list = list.filter(a => (a.updatedAt || a.publishedAt || '') > since);
      list = list.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const limit = Number(payload.limit || 0);
      if (limit > 0) list = list.slice(0, limit);
      return ok(list.map(a => ({
        id: a.id, title: a.title, content: a.body, body: a.body, date: a.date,
        pinned: a.pinned, level: a.level, link: a.link || '', linkLabel: a.linkLabel || '',
      })));
    }
    case 'saveAnnouncement': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      const a = (payload.announcement || {}) as AnyObj;
      let row: AnyObj | undefined;
      if (a.id) row = d.announcements.find(x => x.id === a.id);
      if (row) {
        Object.assign(row, a, { updatedAt: nowIso() });
        persistDb(); return ok({ saved: true, id: row.id, created: false });
      }
      const id = genId('an');
      d.announcements.unshift({
        id, title: a.title || '(無題)', body: a.body || '', date: a.date || today(),
        pinned: !!a.pinned, level: a.level || 'info', link: a.link || '', linkLabel: a.linkLabel || '',
        notify: !!a.notify, active: a.active !== false, expiresAt: a.expiresAt || '',
        publishedAt: nowIso(), publishedBy: (r as DemoUser).displayName, updatedAt: nowIso(),
        deleted: false, deletedAt: '', deletedBy: '',
      });
      persistDb(); return ok({ saved: true, id, created: true });
    }
    case 'deleteAnnouncement': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      const row = d.announcements.find(x => x.id === payload.id);
      if (!row) return fail('找不到消息');
      row.deleted = true; row.deletedAt = nowIso(); row.deletedBy = (r as DemoUser).displayName;
      row.updatedAt = nowIso();
      persistDb(); return ok({ deleted: true, id: payload.id });
    }
    case 'restoreAnnouncement': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      const row = d.announcements.find(x => x.id === payload.id);
      if (!row) return fail('找不到消息');
      row.deleted = false; row.deletedAt = ''; row.deletedBy = ''; row.updatedAt = nowIso();
      persistDb(); return ok({ restored: true, id: payload.id });
    }
    case 'setAnnouncementPinned': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      const row = d.announcements.find(x => x.id === payload.id);
      if (!row) return fail('找不到消息');
      row.pinned = !!payload.pinned; row.updatedAt = nowIso();
      persistDb(); return ok({ saved: true, id: payload.id, pinned: row.pinned });
    }
    case 'setAnnouncementActive': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      const row = d.announcements.find(x => x.id === payload.id);
      if (!row) return fail('找不到消息');
      row.active = !!payload.active; row.updatedAt = nowIso();
      persistDb(); return ok({ saved: true, id: payload.id, active: row.active });
    }

    // ── 獎勵（v4.9.0）— 🎭 唔喺示範範圍 ──
    case 'getAwardsBoard': return awardsNotInDemo();
    case 'saveAwardMember': return awardsNotInDemo();
    case 'deleteAwardMember': return awardsNotInDemo();
    case 'importAwardMembers': return awardsNotInDemo();
    case 'saveAwardTypes': return awardsNotInDemo();
    case 'saveAwardDeadlines': return awardsNotInDemo();

    // ── 旅團探訪 ──
    case 'getTroopDirectoryBoard': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      return ok({ units: d.units, unitSections: d.unitSections || [], publicTroopFieldsReady: true,
        unitSectionsReady: true, unitSectionsScopedSave: true, canEdit: canEditDirectory(u), permissionsVersion: 1 });
    }
    case 'getVisitBoard': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      const from = String(payload.from || '') || today();
      const to = String(payload.to || '') || today();
      const y = new Date().getFullYear();
      return ok({
        from, to, today: today(),
        permissions: { version: 1, canRegister: true, canEditRecords: canEditVisits(u) },
        districtName: '筲箕灣區',
        units: d.units,
        unitSectionsReady: true,
        unitSectionsScopedSave: true,
        unitSections: d.unitSections || [],
        visits: d.visits,
        years: [y - 2, y - 1, y, y + 1],
        sections: [
          { key: 'gh', label: '小童軍' }, { key: 'cub', label: '幼童軍' }, { key: 'scout', label: '童軍' },
          { key: 'venture', label: '深資童軍' }, { key: 'rover', label: '樂行童軍' },
        ],
        me: {
          email: u.email, role: u.role, name: u.displayName,
          defaultSection: u.role === 'ADC_GH' ? 'gh' : u.role === 'ADC_CUBS' ? 'cub' : u.role === 'ADC_SCOUT' ? 'scout' : u.role === 'ADC_VENTURE' ? 'venture' : u.role === 'ADC_ROVER' ? 'rover' : '',
        },
      });
    }
    case 'saveVisit': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      const v = (payload.visit || {}) as AnyObj;
      const troop = String(v.troop || '');
      const visitDate = String(v.visitDate || today());
      if (!troop) return fail('旅團必填');
      const existing = v.id ? d.visits.find(x => x.id === v.id) : undefined;
      if (v.id && !canEditVisits(u)) return fail('只有「旅團探訪」✏️ 權限可以修改探訪紀錄');
      if (v.id && !existing) return fail('找不到該探訪記錄');
      const email = existing?.visitorEmail || u.email;
      const dup = d.visits.find(x => x.id !== v.id && x.troop === troop && x.visitDate === visitDate && x.visitorEmail === email);
      if (dup) return fail('同一幹部同日已登記此旅');
      const id = existing?.id || genId('vs');
      if (existing) {
        ['troop', 'visitDate', 'note', 'section', 'followUp', 'leaderMet', 'method', 'support', 'visitorName'].forEach(k => {
          if (v[k] !== undefined) existing[k] = v[k];
        });
        if (v.officerCount !== undefined) existing.officerCount = Number(v.officerCount) > 0 ? Math.floor(Number(v.officerCount)) : 1;
        existing.year = Number(visitDate.slice(0, 4));
        existing.quarter = Math.floor((Number(visitDate.slice(5, 7)) - 1) / 3) + 1;
        existing.updatedAt = nowIso();
      } else d.visits.push(newVisit(id, v, u, visitDate));
      persistDb();
      return ok({ saved: true, id, troop, visitDate });
    }
    case 'deleteVisit': {
      if (u && !canEditVisits(u)) return fail('只有「旅團探訪」✏️ 權限可以刪除探訪紀錄');
      if (!u) return fail('未登入或登入已過期（示範版）。');
      d.visits = d.visits.filter(x => x.id !== payload.id);
      persistDb(); return ok({ deleted: true, id: payload.id });
    }
    case 'saveUnits': {
      if (u && !canEditDirectory(u)) return fail('只有「旅團資料」✏️ 權限可以修改旅團資料');
      if (!u) return fail('未登入或登入已過期（示範版）。');
      d.units = ((payload.units || []) as AnyObj[]).map(x => ({ ...x }));
      persistDb(); return ok({ saved: true, count: d.units.length });
    }
    case 'saveUnitSections': {
      if (u && !canEditDirectory(u)) return fail('只有「旅團資料」✏️ 權限可以修改旅團資料');
      if (!u) return fail('未登入或登入已過期（示範版）。');
      const incoming = ((payload.rows || payload.unitSections || []) as AnyObj[]).map(x => ({ ...x }));
      if (payload.troop !== undefined && incoming.some(x => x.troop !== payload.troop)) return fail('只可儲存所選旅的團資料');
      d.unitSections = payload.troop !== undefined
        ? [...(d.unitSections || []).filter(x => x.troop !== payload.troop), ...incoming] : incoming;
      persistDb(); return ok({ saved: true, count: incoming.length });
    }

    // ── 🔒 旅團聯絡／📨 聯絡區會（v4.32.0） ──
    case 'getTroopContacts': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      if (!u.mockAdmin && demoSubAccess(u, 'troopContacts') === '') return fail('你沒有此功能嘅權限');
      const scope = u.mockAdmin || u.isSuper ? '' : troopScopeDemo(u.role);
      const rows = (d.troopContacts || []) as AnyObj[];
      return ok({
        contacts: filterDemoContacts(rows, scope),
        canEdit: demoSubAccess(u, 'troopContacts') === 'edit',
        scopeSection: scope, permissionsVersion: 2, units: d.units,
      });
    }
    case 'saveTroopContact': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      if (demoSubAccess(u, 'troopContacts') !== 'edit') return fail('你沒有此功能嘅權限');
      const c = (payload.contact || {}) as AnyObj;
      if (!String(c.troop || '').trim()) return fail('請揀旅團');
      if (!String(c.name || '').trim()) return fail('請填姓名');
      if (!String(c.phone || '').trim() && !String(c.email || '').trim()) return fail('請填電話或電郵（至少一樣）');
      const scope = u.mockAdmin || u.isSuper ? '' : troopScopeDemo(u.role);
      const section = c.contactRole === 'gsl' ? '' : String(c.section || '');
      if (scope && section !== scope) return fail('你只可以修改自己支部的聯絡資料');
      d.troopContacts = d.troopContacts || [];
      const existing = c.id ? d.troopContacts.find(x => x.id === c.id) : undefined;
      const record = {
        id: existing?.id || genId('tc'), troop: String(c.troop), section,
        unitCode: String(c.unitCode || '').toUpperCase(), contactRole: String(c.contactRole || 'other'),
        name: String(c.name), phone: String(c.phone || ''), email: String(c.email || ''),
        note: String(c.note || ''), active: c.active !== false,
        createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso(), updatedBy: u.displayName,
      };
      if (existing) Object.assign(existing, record); else d.troopContacts.push(record);
      persistDb(); return ok({ saved: true, id: record.id });
    }
    case 'deleteTroopContact': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      if (demoSubAccess(u, 'troopContacts') !== 'edit') return fail('你沒有此功能嘅權限');
      d.troopContacts = (d.troopContacts || []).filter(x => x.id !== payload.id);
      persistDb(); return ok({ deleted: true, id: payload.id });
    }
    case 'submitVisitRequest': {
      const type = String(payload.type || '').toLowerCase();
      if (type !== 'visit' && type !== 'invite') return fail('申請類別不正確（請求探訪／邀請出席）');
      const troop = String(payload.troop || '').trim();
      if (!troop || !d.units.some(x => x.troop === troop && x.active !== false)) return fail('找不到該旅團');
      const purpose = String(payload.purpose || '').trim();
      if (purpose.length < 5 || purpose.length > 2000) return fail('請簡單說明目的（5 至 2000 字）');
      const wantReply = payload.wantReply === true || String(payload.wantReply).toLowerCase() === 'true';
      if (wantReply && (!['phone', 'email', 'ig', 'fb'].includes(String(payload.contactType || '').toLowerCase()) || !String(payload.contact || '').trim())) {
        return fail('選擇需要回覆時，請提供有效的聯絡方式及帳號');
      }
      const id = genId('vrq');
      const refCode = `TR-${today().replace(/-/g, '')}-${id.slice(-4)}`;
      d.visitRequests = d.visitRequests || [];
      d.visitRequests.unshift({
        id, refCode, districtCode: 'DEMO', createdAt: nowIso(), type, troop,
        section: String(payload.section || ''), activityName: String(payload.activityName || ''),
        preferredDate: String(payload.preferredDate || ''), preferredTime: String(payload.preferredTime || ''),
        location: String(payload.location || ''), purpose,
        attendeeCount: Number(payload.attendeeCount) > 0 ? Math.floor(Number(payload.attendeeCount)) : '',
        wantReply, contactName: wantReply ? String(payload.contactName || '') : '',
        contactType: wantReply ? String(payload.contactType || '').toLowerCase() : '',
        contact: wantReply ? String(payload.contact || '') : '',
        status: 'new', assignedTo: '', districtNote: '', updatedBy: '', updatedAt: '',
      });
      persistDb(); return ok({ id, refCode });
    }
    case 'getVisitRequests': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      if (!u.mockAdmin && demoSubAccess(u, 'troopRequests') === '') return fail('你沒有此功能嘅權限');
      const scope = u.mockAdmin || u.isSuper ? '' : troopScopeDemo(u.role);
      const rows = ((d.visitRequests || []) as AnyObj[])
        .filter(x => !scope || x.section === scope || x.section === '')
        .slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return ok({ requests: rows, canEdit: demoSubAccess(u, 'troopRequests') === 'edit', scopeSection: scope, permissionsVersion: 2, units: d.units });
    }
    case 'setVisitRequestStatus': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      if (demoSubAccess(u, 'troopRequests') !== 'edit') return fail('你沒有此功能嘅權限');
      const row = (d.visitRequests || []).find(x => x.id === payload.id);
      if (!row) return fail('找不到該申請');
      const patch = (payload.patch || payload) as AnyObj;
      if (patch.status !== undefined) {
        if (!['new', 'accepted', 'declined', 'done', 'cancelled'].includes(String(patch.status))) return fail('狀態不正確');
        row.status = String(patch.status);
      }
      if (patch.assignedTo !== undefined) row.assignedTo = String(patch.assignedTo);
      if (patch.districtNote !== undefined) row.districtNote = String(patch.districtNote);
      row.updatedBy = u.displayName; row.updatedAt = nowIso();
      persistDb(); return ok({ saved: true, id: row.id });
    }

    // ── 聯絡簿（v4.9.0 姓名自訂） ──
    // ── 🔗 常用連結 / 📅 重要日期 / 🔢 實體密碼（v4.33.0）──
    case 'getLinks': return demoBoard(token, 'links', d.links);
    case 'saveLink': {
      const r = requireDemoCard(token, 'links'); if (isErr(r)) return r;
      const raw = (payload.link || payload) as AnyObj;
      const title = String(raw.title || '').trim();
      const url = String(raw.url || '').trim();
      if (!title) return fail('名稱必填');
      if (!/^https?:\/\/\S+$/i.test(url)) return fail('網址必須以 http:// 或 https:// 開頭，且不可含空白');
      const now = nowIso();
      const fields = {
        title, url, category: String(raw.category || '').trim(), note: String(raw.note || '').trim(),
        order: Number(raw.order) || 0, active: true, updatedAt: now, updatedBy: r.email,
      };
      const id = String(raw.id || '').trim();
      if (id) {
        const found = d.links.find(x => x.id === id);
        if (!found) return fail('找不到該連結');
        Object.assign(found, fields);
        persistDb(); return ok({ saved: true, id, created: false });
      }
      const newId = genId('lk');
      d.links.push({ id: newId, districtCode: 'DEMO', createdAt: now, createdBy: r.email, ...fields });
      persistDb(); return ok({ saved: true, id: newId, created: true });
    }
    case 'deleteLink': {
      const r = requireDemoCard(token, 'links'); if (isErr(r)) return r;
      const id = String(payload.id || '').trim();
      const before = d.links.length;
      d.links = d.links.filter(x => x.id !== id);
      if (d.links.length === before) return fail('找不到該連結');
      persistDb(); return ok({ deleted: true, id });
    }

    case 'getKeyDates': return demoBoard(token, 'keyDates', d.keyDates);
    case 'saveKeyDate': {
      const r = requireDemoCard(token, 'keyDates'); if (isErr(r)) return r;
      const raw = (payload.keyDate || payload) as AnyObj;
      const title = String(raw.title || '').trim();
      const dateText = String(raw.dateText ?? raw.date ?? '').trim();
      if (!title) return fail('活動名稱必填');
      if (!dateText) return fail('日期必填（例如 9Nov2026、17-18Apr2027、2027，未定就寫「待定」）');
      const parsed = parseSingleKeyDate(dateText);
      const now = nowIso();
      const fields = {
        title, dateText: parsed.text || dateText,
        startDate: parsed.start, endDate: parsed.end, precision: parsed.precision,
        active: true, updatedAt: now, updatedBy: r.email,
      };
      const id = String(raw.id || '').trim();
      if (id) {
        const found = d.keyDates.find(x => x.id === id);
        if (!found) return fail('找不到該紀錄');
        Object.assign(found, fields);
        persistDb(); return ok({ saved: true, id, created: false });
      }
      const newId = genId('kd');
      d.keyDates.push({ id: newId, districtCode: 'DEMO', createdAt: now, createdBy: r.email, ...fields });
      persistDb(); return ok({ saved: true, id: newId, created: true });
    }
    case 'deleteKeyDate': {
      const r = requireDemoCard(token, 'keyDates'); if (isErr(r)) return r;
      const id = String(payload.id || '').trim();
      const before = d.keyDates.length;
      d.keyDates = d.keyDates.filter(x => x.id !== id);
      if (d.keyDates.length === before) return fail('找不到該紀錄');
      persistDb(); return ok({ deleted: true, id });
    }

    case 'getPasscodes': return demoBoard(token, 'passcodes', d.passcodes);
    case 'savePasscode': {
      const r = requireDemoCard(token, 'passcodes'); if (isErr(r)) return r;
      const raw = (payload.passcode || payload) as AnyObj;
      const name = String(raw.name || '').trim();
      const code = String(raw.code || '').trim();
      if (!name) return fail('名稱必填（例如 1802 房門）');
      if (!code) return fail('密碼必填');
      if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(code) || /^https?:\/\//i.test(code)) {
        return fail('實體密碼卡只放房門／影印機等實體密碼，唔可以存電郵帳戶或網站登入資料');
      }
      const now = nowIso();
      const fields = {
        name, code, location: String(raw.location || '').trim(), note: String(raw.note || '').trim(),
        order: Number(raw.order) || 0, active: true, updatedAt: now, updatedBy: r.email,
      };
      const id = String(raw.id || '').trim();
      if (id) {
        const found = d.passcodes.find(x => x.id === id);
        if (!found) return fail('找不到該密碼紀錄');
        Object.assign(found, fields);
        persistDb(); return ok({ saved: true, id, created: false });
      }
      const newId = genId('pc');
      d.passcodes.push({ id: newId, districtCode: 'DEMO', createdAt: now, createdBy: r.email, ...fields });
      persistDb(); return ok({ saved: true, id: newId, created: true });
    }
    case 'deletePasscode': {
      const r = requireDemoCard(token, 'passcodes'); if (isErr(r)) return r;
      const id = String(payload.id || '').trim();
      const before = d.passcodes.length;
      d.passcodes = d.passcodes.filter(x => x.id !== id);
      if (d.passcodes.length === before) return fail('找不到該密碼紀錄');
      persistDb(); return ok({ deleted: true, id });
    }

    case 'getContactNames': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      return ok({ names: { ...d.contactNames } });
    }
    case 'saveContactName': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      const key = String(payload.key || '');
      if (!key) return fail('key 必填');
      const name = String(payload.name || '').trim();
      if (name === '') delete d.contactNames[key];
      else d.contactNames[key] = name;
      persistDb(); return ok({ saved: true, key, name });
    }

    // ── 借場 ──
    case 'listVenues': return ok(d.venues.filter(v => v.active !== 'FALSE'));
    case 'getVenueBookings': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      return ok(d.venueBookings);
    }
    case 'setVenueBookingStatus': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const row = d.venueBookings.find(x => x.id === payload.id);
      if (!row) return fail('找不到申請');
      row.status = String(payload.status || row.status);
      row.reviewer = (r as DemoUser).displayName; row.reviewedAt = nowIso();
      persistDb(); return ok({ saved: true });
    }
    case 'approveVenueBooking': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const row = d.venueBookings.find(x => x.id === payload.id);
      if (!row) return fail('找不到申請');
      row.status = 'approved'; row.reviewer = (r as DemoUser).displayName; row.reviewedAt = nowIso();
      const pwd = String(Math.floor(100000 + Math.random() * 900000));
      const pwdRef = `DEMO-${Math.floor(10000 + Math.random() * 90000)}`;
      row.passcode = pwd;
      row.pwdRef = pwdRef;
      if (!row.teamupEventId) row.teamupEventId = `tup-demo-${row.id}`;
      persistDb();
      return ok({
        saved: true,
        id: row.id,
        status: 'approved',
        password: pwd,
        passcode: pwd,
        pwdRef,
        lockWritten: true,
        simulated: true,
        apiBase: 'demo://lock-service',
        lockId: String(d.config.scienerLockId || '900001'),
        teamupEventId: row.teamupEventId,
        teamupSynced: true,
        emailSent: false,
        emailTo: row.email || '',
        reviewedAt: row.reviewedAt,
        reviewer: row.reviewer,
        warn: '示範版：已模擬寫入電子鎖匙並回傳狀態，唔會真係寄電郵俾申請人。',
      });
    }
    case 'rejectVenueBooking': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const row = d.venueBookings.find(x => x.id === payload.id);
      if (!row) return fail('找不到申請');
      row.status = 'rejected'; row.reviewer = (r as DemoUser).displayName; row.reviewedAt = nowIso();
      persistDb(); return ok({ saved: true, warn: '示範版：唔會真係寄電郵。' });
    }
    case 'confirmVenueBooking': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const row = d.venueBookings.find(x => x.id === payload.id);
      if (!row) return fail('找不到申請');
      row.status = 'confirmed'; row.reviewer = (r as DemoUser).displayName; row.reviewedAt = nowIso();
      if (!row.teamupEventId) row.teamupEventId = `tup-demo-${row.id}`;
      persistDb(); return ok({ saved: true, teamupEventId: row.teamupEventId, warn: '' });
    }
    case 'updateVenueBooking': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const row = d.venueBookings.find(x => x.id === payload.id);
      if (!row) return fail('找不到申請');
      Object.assign(row, payload.patch || {});
      persistDb(); return ok({ saved: true });
    }
    case 'submitVenueRequest': {
      const id = genId('vb');
      const b = payload as AnyObj;
      const venue = d.venues.find(v => v.venueId === b.venueId);
      d.venueBookings.push({
        id, refCode: `VB-${String(d.seq)}${String(d.venueBookings.length + 1).padStart(2, '0')}`,
        submittedAt: nowIso(), venueId: b.venueId, venueName: venue ? venue.name : String(b.venueName || ''),
        purpose: b.purpose || '', startDate: b.startDate || '', endDate: b.endDate || b.startDate || '',
        name: b.name || '', phone: b.phone || '', email: b.email || '', troop: b.troop || '',
        position: b.position || '', status: 'pending', agreeRules: b.agreeRules || '',
      });
      persistDb();
      return ok({ refCode: `VB-${d.seq}`, id, teamupEventId: undefined, warn: '示範版：申請只存喺你嘅瀏覽器。' });
    }
    case 'saveVenue': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const v = (payload.venue || {}) as AnyObj;
      const row = v.venueId ? d.venues.find(x => x.venueId === v.venueId) : undefined;
      if (row) Object.assign(row, v);
      else d.venues.push({ venueId: genId('v'), name: v.name || '新場地', location: v.location || '', capacity: v.capacity || '', note: v.note || '', scienerLockId: v.scienerLockId || '', active: 'TRUE' });
      persistDb(); return ok({ saved: true });
    }
    case 'deleteVenue': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      d.venues = d.venues.filter(x => x.venueId !== payload.venueId);
      persistDb(); return ok({ deleted: true });
    }
    case 'getLockList': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      return ok({
        apiBase: 'demo://lock-service',
        configuredLockId: String(d.config.scienerLockId || '900001'),
        locks: [
          { lockId: 900001, name: '（示範）1704 室大門', mac: 'AA:BB:CC:17:04:01', hasGateway: true, electricQuantity: 87 },
          { lockId: 900002, name: '（示範）物資房', mac: 'AA:BB:CC:17:04:02', hasGateway: false, electricQuantity: 64 },
        ],
      });
    }
    case 'getVenueLockConfig': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const activeVenues = d.venues.filter(v => v.active !== 'FALSE');
      const venuesWithLock = activeVenues.filter(v => !!String(v.scienerLockId || '').trim());
      const lockId = String(d.config.scienerLockId || '900001');
      return ok({
        version: '4.24.0-demo',
        clientId: String(d.config.scienerClientId || 'demo-app-id'),
        clientIdSet: true,
        clientSecretSet: true,
        username: String(d.config.scienerUsername || '85290000000'),
        usernameMasked: '852***00',
        usernameSet: true,
        passwordSet: true,
        lockId,
        lockIdSet: !!(lockId || venuesWithLock.length),
        apiBase: String(d.config.scienerApiBase || ''),
        resolvedApiBase: String(d.config.scienerApiBase || 'demo://lock-service'),
        pwdMode: String(d.config.pwdMode || 'phone4'),
        ttlockDisabled: !!d.config.ttlockDisabled,
        ttlockReady: true,
        teamupApiKeySet: true,
        teamupCalendarKey: String(d.config.teamupCalendarKey || 'ksdemo123'),
        teamupPendingSub: String(d.config.teamupPendingSub || '1001'),
        teamupApprovedSub: String(d.config.teamupApprovedSub || '1002'),
        teamupRejectedSub: String(d.config.teamupRejectedSub || '1003'),
        teamupReady: true,
        notifyStaffEmail: String(d.config.notifyStaffEmail || ''),
        venueCount: activeVenues.length,
        venuesWithLockCount: venuesWithLock.length,
        sheetHasPasscodeCol: true,
        sheetHasPwdRefCol: true,
      });
    }
    case 'saveVenueLockConfig': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const cfg = (payload.config || payload || {}) as AnyObj;
      if (cfg.clientId !== undefined) d.config.scienerClientId = String(cfg.clientId).trim();
      if (cfg.username !== undefined) d.config.scienerUsername = String(cfg.username).trim();
      if (cfg.lockId !== undefined) d.config.scienerLockId = String(cfg.lockId).trim();
      if (cfg.apiBase !== undefined) d.config.scienerApiBase = String(cfg.apiBase).trim();
      if (cfg.pwdMode !== undefined) d.config.pwdMode = String(cfg.pwdMode).trim() || 'phone4';
      if (cfg.ttlockDisabled !== undefined) d.config.ttlockDisabled = cfg.ttlockDisabled === true || String(cfg.ttlockDisabled).toUpperCase() === 'TRUE';
      if (cfg.teamupCalendarKey !== undefined) d.config.teamupCalendarKey = String(cfg.teamupCalendarKey).trim();
      if (cfg.teamupPendingSub !== undefined) d.config.teamupPendingSub = String(cfg.teamupPendingSub).trim();
      if (cfg.teamupApprovedSub !== undefined) d.config.teamupApprovedSub = String(cfg.teamupApprovedSub).trim();
      if (cfg.teamupRejectedSub !== undefined) d.config.teamupRejectedSub = String(cfg.teamupRejectedSub).trim();
      if (cfg.notifyStaffEmail !== undefined) d.config.notifyStaffEmail = String(cfg.notifyStaffEmail).trim();
      let boundVenues = 0;
      const targetLock = String(cfg.lockId !== undefined ? cfg.lockId : d.config.scienerLockId || '').trim();
      if (cfg.bindLockToVenues && targetLock) {
        d.venues.forEach(v => {
          if (v.active !== 'FALSE') { v.scienerLockId = targetLock; boundVenues++; }
        });
      }
      persistDb();
      const status = demoCall('getVenueLockConfig', { token }, 'POST');
      return ok({ ...(status as any).data, saved: true, boundVenues });
    }

    // ── 借物資 ──
    case 'listItems': return ok(d.stockItems.filter(i => i.active !== 'FALSE'));
    case 'getStockRequests': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      return ok(d.stockRequests);
    }
    case 'setStockRequestStatus': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const row = d.stockRequests.find(x => x.id === payload.id);
      if (!row) return fail('找不到申請');
      row.status = String(payload.status || row.status);
      row.reviewer = (r as DemoUser).displayName; row.reviewedAt = nowIso();
      persistDb(); return ok({ saved: true });
    }
    case 'setStockBatchStatus': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const batchRef = String(payload.batchRef || '');
      let n = 0;
      d.stockRequests.forEach(x => {
        if (x.batchRef === batchRef) { x.status = String(payload.status || x.status); x.reviewer = (r as DemoUser).displayName; x.reviewedAt = nowIso(); n++; }
      });
      persistDb(); return ok({ saved: true, count: n });
    }
    case 'saveItem': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const it = (payload.item || {}) as AnyObj;
      let row = it.itemId ? d.stockItems.find(x => x.itemId === it.itemId) : undefined;
      if (row) Object.assign(row, it);
      else d.stockItems.push({ itemId: genId('st'), name: it.name || '新物資', category: it.category || '', totalQty: it.totalQty || '0', availableQty: it.availableQty || it.totalQty || '0', unit: it.unit || '', note: it.note || '', active: 'TRUE' });
      persistDb(); return ok({ saved: true });
    }
    case 'deleteItem': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      d.stockItems = d.stockItems.filter(x => x.itemId !== payload.itemId);
      persistDb(); return ok({ deleted: true });
    }

    // ── 活動知會 ──
    case 'listActivityNotices': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      return ok(d.activityNotices);
    }
    case 'submitActivityNotice': {
      const id = genId('ac');
      const b = payload as AnyObj;
      d.activityNotices.unshift({
        id, refCode: `AN-${nowIso().slice(2, 10).replace(/-/g, '')}${d.activityNotices.length + 1}`,
        submittedAt: nowIso(), year: b.year || String(new Date().getFullYear()), section: b.section || '',
        nature: b.nature || '', troop: b.troop || '', activityName: b.activityName || '',
        startDateTime: b.startDateTime || '', endDateTime: b.endDateTime || '', location: b.location || '',
        membersCount: b.membersCount || '', leadersCount: b.leadersCount || '', parentsCount: b.parentsCount || '',
        leaderName: b.leaderName || '', leaderPhone: b.leaderPhone || '', leaderEmail: b.leaderEmail || '',
        note: b.note || '', districtCode: 'DEMO',
      });
      persistDb();
      return ok({ refCode: `AN-${d.seq}` });
    }
    case 'deleteActivityNotice': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      d.activityNotices = d.activityNotices.filter(x => x.id !== payload.id);
      persistDb(); return ok({ deleted: true });
    }

    // ── 意外報告 ──
    case 'listIncidentReports': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      return ok(d.incidentReports);
    }
    case 'submitIncidentReport': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      const id = genId('ir');
      const rep = { ...(payload.report || {}) as AnyObj, id, refCode: `ACC-${nowIso().slice(2, 10).replace(/-/g, '')}`, status: 'submitted', submittedAt: nowIso(), submittedBy: (r as DemoUser).email, createdAt: nowIso() };
      d.incidentReports.unshift(rep);
      persistDb();
      return ok({ refCode: rep.refCode, id });
    }
    case 'updateIncidentReport': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      const row = d.incidentReports.find(x => x.id === payload.id);
      if (!row) return fail('找不到報告');
      Object.assign(row, payload.patch || {});
      persistDb(); return ok({ saved: true });
    }
    case 'deleteIncidentReport': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      d.incidentReports = d.incidentReports.filter(x => x.id !== payload.id);
      persistDb(); return ok({ deleted: true });
    }

    // ── 訓練班 ──
    case 'getCourseLinks': return ok(d.courseLinks.filter(c => c.active !== 'FALSE'));
    case 'saveCourseLink': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const link = (payload.link || {}) as AnyObj;
      let row = link.courseId ? d.courseLinks.find(x => x.courseId === link.courseId) : undefined;
      if (row) { Object.assign(row, link, { fpsUpdatedAt: link.fpsPayload ? nowIso() : row.fpsUpdatedAt }); }
      else {
        const id = genId('cl');
        d.courseLinks.unshift({ ...link, courseId: id, active: 'TRUE', createdAt: nowIso() });
      }
      persistDb(); return ok({ saved: true, courseId: row ? row.courseId : String(payload.link?.courseId || d.courseLinks[0].courseId) });
    }
    case 'deleteCourseLink': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      d.courseLinks = d.courseLinks.filter(x => x.courseId !== payload.courseId);
      persistDb(); return ok({ deleted: true });
    }
    case 'pullCourseProfile': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const execUrl = String(payload.scriptExecUrl || payload.apiBase || '').trim();
      if (!execUrl && !payload.courseId) return fail('缺少訓練班 Script 網址（scriptExecUrl）');
      return ok(demoCourseProfile());
    }
    // ── 新制直入（v4.14.0） ──
    case 'createCourseSheet': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const setup = (payload.setup || {}) as AnyObj;
      const link = (payload.link || {}) as AnyObj;
      const title = String(setup.courseName || link.title || '').trim();
      if (!title) return fail('課程名稱（courseName）必填');
      const id = String(link.courseId || setup.courseId || '').trim() || genId('cl');
      const sheetId = 'demo-sheet-' + id;
      const row: AnyObj = {
        ...link, courseId: id, title: link.title || title, sheetId,
        setupJson: JSON.stringify(setup), active: 'TRUE', createdAt: nowIso(),
      };
      const ix = d.courseLinks.findIndex(x => x.courseId === id);
      if (ix >= 0) d.courseLinks[ix] = { ...d.courseLinks[ix], ...row };
      else d.courseLinks.unshift(row);
      persistDb();
      return ok({
        created: true, courseId: id, sheetId,
        sheetUrl: 'https://docs.google.com/spreadsheets/d/' + sheetId,
        cellsApplied: Array.isArray(payload.cells) ? payload.cells.length : 0,
        skippedTabs: [], sharedTo: String(payload.clEmail || setup.clEmail || ''), shareWarning: '',
      });
    }
    case 'pushCourseSetup': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const row = d.courseLinks.find(x => x.courseId === payload.courseId);
      if (!row) return fail('找不到此訓練班（courseId）');
      if (!row.sheetId) return fail('呢班係人手建表，冇後端 Sheet ID（新制推送只限區系統自動建嘅班）');
      if (payload.setup) row.setupJson = JSON.stringify(payload.setup);
      persistDb();
      return ok({
        pushed: true, courseId: row.courseId, sheetId: row.sheetId,
        cellsApplied: Array.isArray(payload.cells) ? payload.cells.length : 0, skippedTabs: [],
      });
    }
    case 'pullCourseSheetRaw': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const execUrl = String(payload.scriptExecUrl || payload.apiBase || '').trim();
      if (!execUrl && !payload.courseId) return fail('缺少訓練班 Script 網址（scriptExecUrl）');
      const raw = demoCourseSheetRaw();
      // v4.17.0 收款核對：將示範版 tick 過嘅「已核對收款」套返入表格回應（col 45–47）
      const checks = (d as AnyObj).coursePayChecks as Record<string, AnyObj> | undefined;
      if (checks && Array.isArray(raw.resp) && raw.resp.length > 1) {
        const resp = raw.resp as any[][];
        for (let i = 1; i < resp.length; i++) {
          const id = String(resp[i]?.[0] ?? '').trim();
          const hit = checks[id];
          if (!hit) continue;
          while (resp[i].length < 47) resp[i].push('');
          resp[i][44] = hit.verified ? '✔' : '';
          resp[i][45] = hit.verified ? String(hit.by || '') : '';
          resp[i][46] = hit.verified ? String(hit.at || '') : '';
        }
      }
      return ok(raw);
    }
    // ── 新版流程（v4.17.0）：批核／修訂／收款核對／CL 電郵／開班指引 ──
    case 'pullCourseSummary': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const row = d.courseLinks.find(x => x.courseId === payload.courseId);
      if (!row && !payload.scriptExecUrl) return fail('呢班未有訓練班 Script 網址（新版流程班請貼 CL 交嚟嘅網址）');
      const S = demoCourseSetup();
      return ok({
        courseName: S.courseName, edition: S.edition, section: S.section, badge: S.badge,
        customName: S.customName, type1: S.form1, type2: S.form2,
        intake: Number(S.expectedIntake) || 0, fee: Number(S.fee) || 0, quota: Number(S.quota) || 0,
        staffCount: (S.staff || []).filter((x: AnyObj) => String(x.name || '').trim()).length,
        deadline: S.deadline, publish: S.publishDate,
        sessions: (S.sessions || []).filter((x: AnyObj) => x.date || x.time),
        leader: (S.staff || []).find((x: AnyObj) => String(x.role || '').includes('班領導人')) || null,
        staff: (S.staff || []).filter((x: AnyObj) => String(x.name || '').trim()).map((x: AnyObj) => ({ role: x.role, name: x.name, title: x.title })),
        budget: { sections: [], total: 0 },
        notice: { fileNo: S.fileNo, issueDate: S.issueDate, eligibility: S.eligibility, feeNote: S.feeNote, uniform: S.uniform },
        courseEmail: 'blt2601@skwscout.org.hk',
        approved: String(row?.approval || '') === 'APPROVED',
        regCount: 3, pulledAt: nowIso(),
      });
    }
    case 'saveCourseApproval': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const row = d.courseLinks.find(x => x.courseId === payload.courseId);
      if (!row) return fail('找不到此訓練班（courseId）');
      const by = String(payload.by || '區管理系統');
      const appr = String(payload.approval || '').trim().toUpperCase();
      if (appr === 'APPROVED') { row.approval = 'APPROVED'; row.approvedAt = nowIso(); row.approvedBy = by; }
      else if (appr === 'PENDING') { row.approval = 'PENDING'; row.approvedAt = ''; row.approvedBy = ''; }
      const prev: AnyObj[] = (() => { try { return JSON.parse(String(row.revisions || '') || '[]') || []; } catch { return []; } })();
      if ((Array.isArray(payload.changes) && payload.changes.length) || appr) {
        prev.unshift({
          at: nowIso(), by, approval: appr === 'APPROVED' ? 'APPROVED' : (appr === 'PENDING' ? 'PENDING' : ''),
          changes: payload.changes || [], note: String(payload.revisionNote || ''),
          cellsApplied: Array.isArray(payload.cells) ? payload.cells.length : 0, path: 'demo',
        });
        row.revisions = JSON.stringify(prev.slice(0, 30));
      }
      if (payload.link) Object.assign(row, payload.link);
      persistDb();
      return ok({
        saved: true, courseId: row.courseId, path: 'demo',
        approvalDone: appr === 'APPROVED' || appr === 'PENDING',
        cellsApplied: Array.isArray(payload.cells) ? payload.cells.length : 0, skippedTabs: [],
        warnings: [], revisions: JSON.parse(String(row.revisions || '[]')),
      });
    }
    case 'setCoursePaymentCheck': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const checks = ((d as AnyObj).coursePayChecks as Record<string, AnyObj> || {}) as Record<string, AnyObj>;
      const results: AnyObj[] = [];
      (Array.isArray(payload.checks) ? payload.checks : []).forEach((c: AnyObj) => {
        const id = String(c.id || '').trim();
        if (!id) { results.push({ id, ok: false, error: 'missing id' }); return; }
        const verified = c.verified !== false;
        checks[id] = { verified, by: String(payload.by || ''), at: nowIso() };
        results.push({ id, ok: true, verified });
      });
      (d as AnyObj).coursePayChecks = checks;
      persistDb();
      return ok({ saved: results.every(x => x.ok), results, path: 'demo' });
    }
    case 'setCourseRefund': { // 🎭 demo：已退款 tick（寫 demo db，唔真寫班 Sheet）
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const refunds = ((d as AnyObj).courseRefunds as Record<string, AnyObj> || {}) as Record<string, AnyObj>;
      const results: AnyObj[] = [];
      (Array.isArray(payload.refunds) ? payload.refunds : []).forEach((c: AnyObj) => {
        const id = String(c.id || '').trim();
        if (!id) { results.push({ id, ok: false, error: 'missing id' }); return; }
        const refunded = c.refunded !== false;
        refunds[id] = { refunded, by: String(payload.by || ''), at: nowIso() };
        results.push({ id, ok: true, refunded });
      });
      (d as AnyObj).courseRefunds = refunds;
      persistDb();
      return ok({ saved: results.every(x => x.ok), results, path: 'demo' });
    }
    case 'sendCourseEmail': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const to = String(payload.to || '').trim();
      if (!to || !to.includes('@')) return fail('缺少收件人電郵（to——通常係班領導人 email）');
      return ok({ sent: true, to, cc: String(payload.cc || ''), fromUsed: 'demo@skwscout.org.hk', warning: '🎭 示範版：唔會真係寄電郵。', subject: '[示範] ' + String(payload.kind || 'custom') });
    }
    case 'sendCourseRegNotice': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const row = d.courseLinks.find(x => x.courseId === payload.courseId);
      if (!row) return fail('找不到此訓練班（courseId）');
      const items = Array.isArray(payload.notices) ? payload.notices : [];
      const recs: AnyObj = (() => { try { return JSON.parse(String(row.regNotices || '') || '{}') || {}; } catch { return {}; } })();
      const results: AnyObj[] = [];
      let sent = 0;
      items.forEach((it: AnyObj) => {
        const id = String(it.id || '').trim();
        if (!id) { results.push({ id, ok: false, error: 'missing id' }); return; }
        recs[id] = { kind: String(it.kind || 'approved'), at: nowIso(), by: String(payload.by || '') };
        results.push({ id, ok: true });
        sent++;
      });
      row.regNotices = JSON.stringify(recs);
      persistDb();
      return ok({ sent, results, regNotices: recs, replyTo: String(payload.replyTo || ''), warning: '🎭 示範版：唔會真係寄電郵。' });
    }
    case 'getCourseOpsInfo': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      return ok({
        districtName: d.config.districtName,
        factoryUrl: 'https://script.google.com/macros/s/AKfycbDemoCourseFactory/exec',
        factoryCode: 'SKW-DEMO-2627',
        emailFrom: 'skw@hkirscout.org.hk',
        memberPortalUrl: String(d.config.memberPortalUrl || ''),
        notifyFrom: '',
        hubUrl: String(d.config.courseHubUrl || ''),
        opsKeySet: !!d.config.courseOpsKeySet,
      });
    }
    case 'listHubCourses': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const hubUrl = String(d.config.courseHubUrl || '');
      if (!hubUrl) return fail('未設定 COURSE_HUB_URL（新制訓練班 CourseHub /exec）');
      // 🎭 示範：用 demo course links 組班列表（唔打真 hub）
      return ok({
        hubUrl,
        hubVersion: '6.2.1',
        hubReady: true,
        courses: d.courseLinks.filter(c => String(c.gsUrl || '')).map(c => ({
          courseId: c.courseId,
          publicCourseId: String(c.publicCourseId || ''),
          name: String(c.title || ''),
          status: 'active',
          cl: String(c.leader || ''),
        })),
      });
    }
    case 'getCourseSetup': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      const row = d.courseLinks.find(x => x.courseId === payload.courseId);
      if (!row) return fail('找不到此訓練班（courseId）');
      let setup: AnyObj | null = null;
      try { setup = row.setupJson ? JSON.parse(row.setupJson) : null; } catch { setup = null; }
      return ok({ courseId: row.courseId, sheetId: row.sheetId || '', setup });
    }

    // ── 區通告 ──
    case 'getCirculars': {
      const r = requireUser(token); if (isErr(r)) return r;
      const list = d.circulars.filter(n => n.id).map((n): AnyObj => {
        const link = n.courseId ? d.courseLinks.find(x => x.courseId === n.courseId) : undefined;
        const dl = String(n.deadline || '').trim();
        return {
          ...n,
          isOpen: n.status === 'published' && (!dl || dl >= today()),
          course: link ? {
            courseId: link.courseId, title: link.title, fee: link.fee ?? '', deadline: link.deadline ?? '',
            quota: link.quota ?? '', filled: link.filled ?? '', noticeUrl: link.noticeUrl || '',
          } : null,
        };
      }).sort((a, b) => String(b.issueDate || '').localeCompare(String(a.issueDate || '')));
      let maxNo = 0;
      d.circulars.forEach(n => {
        const m = String(n.circularNo || '').trim().match(/^(\d{1,6})$/);
        if (m) maxNo = Math.max(maxNo, Number(m[1]));
      });
      return ok({ items: list, suggestedNo: maxNo > 0 ? String(maxNo + 1) : '' });
    }
    case 'saveCircular': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      const c = (payload.circular || {}) as AnyObj;
      const no = String(c.circularNo || '').trim();
      const title = String(c.title || '').trim();
      if (!no) return fail('通告編號必填');
      if (!title) return fail('標題必填');
      const dup = d.circulars.find(x => String(x.circularNo) === no && x.id !== c.id);
      if (dup) return fail(`通告編號「${no}」已經用咗（${dup.title || dup.id}）`);
      const row = c.id ? d.circulars.find(x => x.id === c.id) : undefined;
      if (row) {
        Object.assign(row, c, { id: row.id, districtCode: row.districtCode, createdAt: row.createdAt, updatedAt: nowIso() });
        if ((row.status === 'published' || row.status === 'closed') && !row.publishedAt) {
          row.publishedAt = nowIso(); row.publishedBy = (r as DemoUser).displayName;
        }
        persistDb(); return ok({ saved: true, id: row.id, created: false });
      }
      const id = genId('cr');
      const now = nowIso();
      const st = c.status || 'draft';
      d.circulars.unshift({
        id, districtCode: 'DEMO', ...c, circularNo: no, title, status: st,
        publishedAt: (st === 'published' || st === 'closed') ? now : '',
        publishedBy: (st === 'published' || st === 'closed') ? (r as DemoUser).displayName : '',
        updatedAt: now, createdAt: now,
      });
      persistDb(); return ok({ saved: true, id, created: true });
    }
    case 'deleteCircular': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      const row = d.circulars.find(x => x.id === payload.id);
      if (!row) return fail('找不到該通告');
      d.circulars = d.circulars.filter(x => x.id !== payload.id);
      persistDb(); return ok({ deleted: true, id: payload.id });
    }
    case 'setCircularStatus': {
      const r = requireUser(token, 3); if (isErr(r)) return r;
      const st = String(payload.status || '').toLowerCase();
      if (['draft', 'published', 'closed', 'archived'].indexOf(st) < 0) return fail('狀態不正確');
      const row = d.circulars.find(x => x.id === payload.id);
      if (!row) return fail('找不到該通告');
      row.status = st; row.updatedAt = nowIso();
      if ((st === 'published' || st === 'closed') && !row.publishedAt) {
        row.publishedAt = nowIso(); row.publishedBy = (r as DemoUser).displayName;
      }
      persistDb(); return ok({ saved: true, id: payload.id, status: st });
    }

    // ── 外掛 ──
    case 'getRegistry': {
      return ok({
        plugins: [
          { id: 'plg-weather', title: '天氣決策助手', icon: '🌦', url: '/incident?tab=weather', description: '3 小時暴雨／颱風指標，一鍵建議改期（內建）', version: '4.9.0', embed: false, type: 'builtin', installed: true, needsDistrictBackend: false },
          { id: 'plg-fps', title: '訓練班 FPS QR', icon: '💳', url: '/training', description: '每班收費 QR（內建）', version: '4.3.0', embed: false, type: 'builtin', installed: true, needsDistrictBackend: false },
          { id: 'plg-sample', title: '（示範）外掛樣板', icon: '🧩', url: '/embed?src=sample', description: '示範用外掛樣板，安裝後會出現喺主控台', version: '1.0.0', embed: true, type: 'jump', installed: d.installedPlugins.indexOf('plg-sample') >= 0, needsDistrictBackend: false },
        ],
        registryUrl: 'demo://registry',
      });
    }
    case 'installPlugin': {
      const r = requireUser(token, 1); if (isErr(r)) return r;
      if (d.installedPlugins.indexOf(String(payload.cardId)) < 0) d.installedPlugins.push(String(payload.cardId));
      persistDb(); return ok({ installed: true });
    }
    case 'uninstallPlugin': {
      const r = requireUser(token, 1); if (isErr(r)) return r;
      d.installedPlugins = d.installedPlugins.filter(x => x !== payload.cardId);
      persistDb(); return ok({ uninstalled: true });
    }

    // ── 待處理收件箱 ──
    case 'getPendingInbox': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      const venue = d.venueBookings.filter(b => b.status === 'pending').map(b => ({
        id: b.id, type: 'venue', refCode: b.refCode || '', title: b.venueName || '', name: b.name || '',
        startDate: b.startDate || '', endDate: b.endDate || '', purpose: b.purpose || '',
      }));
      const stock = d.stockRequests.filter(s => s.status === 'pending').map(s => ({
        id: s.id, type: 'stock', refCode: s.refCode || '', title: s.itemName || '', name: s.name || '',
        startDate: s.borrowDate || '', endDate: s.returnDate || '', purpose: s.purpose || '',
      }));
      return ok({ venue, stock });
    }

    // ── 外部資料（原本經 /api/external 抓真網站；示範版用內建資料） ──
    default: return fail(`示範版未支援嘅動作：${action}`);
  }
}

function newVisit(id: string, v: AnyObj, u: DemoUser, visitDate: string): AnyObj {
  const dt = new Date(visitDate);
  return {
    id, districtCode: 'DEMO', troop: String(v.troop || ''), section: v.section || '',
    visitDate, year: dt.getFullYear(), quarter: Math.floor(dt.getMonth() / 3) + 1,
    kind: v.kind || 'general', visitorName: u.displayName, visitorEmail: u.email,
    note: v.note || '', followUp: v.followUp || '',
    // 總會匯報欄（v4.10.0）
    leaderMet: v.leaderMet || '', method: v.method || '面談',
    officerCount: Number(v.officerCount) > 0 ? Math.floor(Number(v.officerCount)) : 1,
    support: v.support || '',
    createdAt: nowIso(), updatedAt: nowIso(),
  };
}

function decorate(a: AnyObj): AnyObj {
  const t = today();
  const expired = !!a.expiresAt && a.expiresAt < t;
  const scheduled = !!a.date && a.date > t;
  return { ...a, expired, scheduled, live: !a.deleted && a.active !== false && !expired && !scheduled };
}

function freshDemoTypesForDefaults(): AnyObj[] {
  const f = freshDemoDb();
  return f.awardTypes;
}

/** /api/external 攔截（kind 對應 extRegionStaff / extRegionOrg / …） */
export function demoExternal(kind: string, params: AnyObj): ApiResultLike {
  const meta = { fetchedAt: nowIso(), cached: false, source: 'demo' };
  switch (kind) {
    case 'regionStaff': return ok({ ...meta, rows: JSON.parse(JSON.stringify(DEMO_STAFF_ROWS)), updated: today() });
    case 'regionOrg': return ok({ ...meta, groups: JSON.parse(JSON.stringify(DEMO_ORG_GROUPS)), updated: today() });
    case 'hksaCouncil': return ok({ ...meta, members: JSON.parse(JSON.stringify(DEMO_HKSA_COUNCIL)) });
    case 'hksaDepts': return ok({ ...meta, depts: JSON.parse(JSON.stringify(DEMO_HKSA_DEPTS)) });
    case 'budget': {
      const { rows, summary } = demoBudget();
      return ok({ ...meta, rows, summary, sheetUrl: '' });
    }
    case 'rooms': {
      const rawFrom = String(params.from || '');
      const from = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? Date.parse(`${rawFrom}T00:00:00+08:00`) : Number(rawFrom || Date.now());
      const days = Number(params.days || 14);
      const ids = params.room ? [String(params.room)] : ROOM_IDS;
      const map = demoRoomEvents(ids, from, days);
      const rooms = ids.map(id => ({ id, ok: true, events: map[id] || [] }));
      return ok({ ...meta, from, to: from + days * 86400000, days, rooms });
    }
    default: return fail(`示範版未支援嘅外部資料：${kind}`);
  }
}
