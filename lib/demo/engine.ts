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
  freshDemoDb, demoUserFor, demoRoomEvents, demoBudget, demoCourseProfile,
  demoCourseSetup, demoCourseSheetRaw,
  DEMO_ORG_GROUPS, DEMO_STAFF_ROWS, DEMO_HKSA_COUNCIL, DEMO_HKSA_DEPTS,
  DEMO_TOKEN, type DemoDb, type DemoUser,
} from './seed.ts';

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
      if (raw) { db = JSON.parse(raw) as DemoDb; return db; }
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

function visibleCards(u: DemoUser): AnyObj[] {
  const d = loadDb();
  // 🎭 示範版權限全開：全部卡片（連隱藏咗嘅都照列，enabled=false 做標示）、一律 edit。
  // 唯一例外：成人獎勵提名（awards）唔喺示範範圍 — 正式系統先用到。
  if (u.mockAdmin) {
    return d.cards
      .filter(c => c.cardId !== 'awards')
      .map((c): AnyObj => ({ ...c, access: 'edit' as const }))
      .sort((a, b) => a.order - b.order);
  }
  return d.cards
    .filter(c => c.enabled || u.isSuper)
    .filter(c => {
      const access = (d.matrix[c.cardId] || {})[u.role] || '';
      return access !== '' || u.isSuper || u.level <= 1;
    })
    .map((c): AnyObj => {
      const access = (d.matrix[c.cardId] || {})[u.role] || '';
      return { ...c, access: u.level <= 1 ? (access || 'view') : access };
    })
    .sort((a, b) => a.order - b.order);
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
    case 'health': return ok({ ok: true, version: '4.9.0-demo' });
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
    case 'getPerms': {
      const r = requireUser(token, 1); if (isErr(r)) return r;
      return ok({ cards: d.cards.slice().sort((a, b) => a.order - b.order), roles: d.roles, matrix: d.matrix });
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
    case 'getVisitBoard': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      const from = String(payload.from || '') || today();
      const to = String(payload.to || '') || today();
      const y = new Date().getFullYear();
      return ok({
        from, to, today: today(),
        districtName: '筲箕灣區',
        units: d.units, visits: d.visits,
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
      // 一日一個旅一次（v4.8.1）
      const dup = d.visits.find(x => x.troop === troop && x.visitDate === visitDate);
      let id: string;
      if (dup) {
        if (dup.visitorEmail && dup.visitorEmail !== u.email) {
          // 另一位幹部同日探同一旅：照實際系統留兩筆（各自名下）
          id = genId('vs');
          d.visits.push(newVisit(id, v, u, visitDate));
        } else {
          ['note', 'section', 'followUp', 'leaderMet', 'method', 'support'].forEach(k => {
            if (v[k] !== undefined) dup[k] = v[k];
          });
          if (v.officerCount !== undefined) {
            const oc = Number(v.officerCount);
            dup.officerCount = oc > 0 ? Math.floor(oc) : 1;
          }
          dup.updatedAt = nowIso();
          id = dup.id;
        }
      } else {
        id = genId('vs');
        d.visits.push(newVisit(id, v, u, visitDate));
      }
      persistDb();
      return ok({ saved: true, id, troop, visitDate });
    }
    case 'deleteVisit': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      d.visits = d.visits.filter(x => x.id !== payload.id);
      persistDb(); return ok({ deleted: true, id: payload.id });
    }
    case 'saveUnits': {
      if (!u) return fail('未登入或登入已過期（示範版）。');
      d.units = ((payload.units || []) as AnyObj[]).map(x => ({ ...x }));
      persistDb(); return ok({ saved: true, count: d.units.length });
    }

    // ── 聯絡簿（v4.9.0 姓名自訂） ──
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
      row.passcode = pwd;
      persistDb(); return ok({ saved: true, password: pwd, warn: '示範版：唔會真係寄電郵俾申請人。' });
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
      persistDb(); return ok({ saved: true });
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
      let row = v.venueId ? d.venues.find(x => x.venueId === v.venueId) : undefined;
      if (row) Object.assign(row, v);
      else d.venues.push({ venueId: genId('v'), name: v.name || '新場地', location: v.location || '', capacity: v.capacity || '', note: v.note || '', active: 'TRUE' });
      persistDb(); return ok({ saved: true });
    }
    case 'deleteVenue': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      d.venues = d.venues.filter(x => x.venueId !== payload.venueId);
      persistDb(); return ok({ deleted: true });
    }
    case 'getLockList': {
      const r = requireUser(token, 2); if (isErr(r)) return r;
      return ok({ apiBase: 'demo://lock-service', configuredLockId: '', locks: [{ id: 900001, name: '（示範）1704 室大門', battery: 87 }, { id: 900002, name: '（示範）物資房', battery: 64 }] });
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
      return ok(demoCourseSheetRaw());
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
      const from = Number(params.from || Date.now());
      const days = Number(params.days || 14);
      const ids = params.room ? [String(params.room)] : ROOM_IDS;
      const map = demoRoomEvents(ids, from, days);
      const rooms = ids.map(id => ({ id, ok: true, events: map[id] || [] }));
      return ok({ ...meta, from, to: from + days * 86400000, days, rooms });
    }
    default: return fail(`示範版未支援嘅外部資料：${kind}`);
  }
}
