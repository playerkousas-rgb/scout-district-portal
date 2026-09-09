/**
 * ⚡ 舊制快速上架（pure helpers，可用 node 直接測）。
 *
 * CL 交嚟兩行（班 /exec 網址＋API Key）→ ADC 貼上 → 讀取自動填好開班登記，
 * 唔使再逐格填（profile → CourseLink 對應同智能貼上集中喺呢度，方便測）。
 */
import type { CourseLink, CourseProfile } from './types.ts';

export interface QuickConn {
  scriptExecUrl: string;
  scriptApiKey: string;
  driveFolderId?: string;
}

/** 上通告節次：有 ✓上通告（showOnCircular）優先用嗰批，否則用全部節次 */
export function publishSessions(p: CourseProfile): { date: string; time: string; venue: string }[] {
  const all = p.sessions || [];
  const flagged = all.filter(s => s.showOnCircular);
  const use = flagged.length ? flagged : all;
  return use
    .map(s => ({
      date: (s.displayDate || s.date || '').trim(),
      time: (s.displayTime || s.time || '').trim(),
      venue: (s.displayVenue || s.venue || '').trim(),
    }))
    .filter(s => s.date || s.time || s.venue);
}

/** 班領導人一行情（姓名＋稱謂＋資格），例如「陳大文先生（領袖木章）」 */
export function leaderLineOf(p: CourseProfile): string {
  const l = p.leader;
  if (!l) return '';
  return `${l.name || ''}${l.title || ''}${l.qualification ? `（${l.qualification}）` : ''}`.trim();
}

/** 聯絡一行情（訓練班目錄 contact 欄用） */
export function contactOf(p: CourseProfile): string {
  const l = p.leader || (p.staff || [])[0];
  if (!l) return '';
  const who = `${(l.name || '') + (l.title || '')}`.trim() + (l.role ? `（${l.role}）` : '');
  return [who, l.phone || '', l.email || ''].filter(x => x.trim()).join(' ');
}

/**
 * profile → 開班登記欄。
 * courseId 留空＝由後台自動編（`cl_xxx`）；active 預設 TRUE＝儲存即掛上成員系統。
 */
export function profileToLink(p: CourseProfile, conn: QuickConn): CourseLink {
  const sess = publishSessions(p);
  const sessionsText = sess.map(s => [s.date, s.time, s.venue].filter(Boolean).join(' ').trim()).filter(Boolean).join('；');
  const venue = Array.from(new Set(sess.map(s => s.venue).filter(Boolean))).join('、');
  const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
  return {
    courseId: '',
    title: (p.courseName || '').trim(),
    badgeName: (p.badge || '').trim(),
    section: (p.section || '').trim(),
    courseNo: '',
    sessionsText,
    eligibility: (p.circular?.eligibility || '').trim(),
    fee: str(p.fee).trim(),
    originalFee: '',
    subsidyNote: '',
    deadline: (p.deadline || '').trim(),
    quota: str(p.quota).trim(),
    filled: '',
    venue,
    noticeUrl: '',
    contact: contactOf(p),
    scriptExecUrl: (conn.scriptExecUrl || '').trim(),
    scriptApiKey: (conn.scriptApiKey || '').trim(),
    driveFolderId: (conn.driveFolderId || '').trim(),
    active: 'TRUE',
    createdAt: '',
  };
}

/**
 * 智能貼上：CL 交嚟嗰兩行（/exec 網址＋Key）一次過貼入同一個格都分得開。
 * 回傳搵到嘅 exec＋key（搵唔到就空字串，唔會掉失原本輸入）。
 */
export function parseQuickPaste(text: string): { exec: string; key: string } {
  const out = { exec: '', key: '' };
  const tokens = String(text || '').split(/[\s]+/).map(t => t.trim()).filter(Boolean);
  for (const t of tokens) {
    if (!out.exec && /^https?:\/\/\S+$/.test(t)) {
      // 有 /exec 嗰條優先，否則第一條 URL 都當係
      if (t.includes('/exec') || !tokens.some(x => x !== t && x.includes('/exec'))) out.exec = t;
      continue;
    }
  }
  if (!out.exec) {
    const anyUrl = tokens.find(t => /^https?:\/\/\S+$/.test(t));
    if (anyUrl) out.exec = anyUrl;
  }
  const keyTok = tokens.find(t => /^ck_[A-Za-z0-9]+$/.test(t))
    || tokens.find(t => t !== out.exec && !/^https?:\/\//.test(t) && t.length >= 8 && /^[A-Za-z0-9_-]+$/.test(t));
  if (keyTok) out.key = keyTok;
  return out;
}
