/**
 * /api/external — 外部公開資料同步（v4.5.0）
 * ─────────────────────────────────────────────────────────────────────
 * 由 Vercel 伺服器端代抓（瀏覽器直接抓會撞 CORS），全部都係公開資料：
 *   kind=regionStaff   港島地域職員直線電話（hkirscout.org.hk 專業領袖及受薪職員）
 *   kind=regionOrg     港島地域總監架構（hkirscout.org.hk 總監架構）
 *   kind=hksaCouncil   總會香港總監諮議會（scout.org.hk）
 *   kind=hksaDepts     總會 11 個署聯絡（scout.org.hk 總部各署頁）
 *   kind=budget        區年度預算 Google Sheet（gviz CSV；&sheet=<Sheet 網址> 可覆蓋）
 *   kind=rooms         地域房間日曆（公開 ICS）；&room=<房號> &from=YYYY-MM-DD &days=1..60
 * 上游原文喺同一 serverless instance 內快取（網頁 6 小時、預算 10 分鐘、日曆 3 分鐘）；
 * 上游失敗時用最後一次成功嘅原文（stale=true），再唔得先由前端用靜態備援。
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  parseBudgetCsv, parseHkirCommissioners, parseHkirStaff, parseHksaCouncil, parseHksaDept,
  type DeptContact,
} from '@/lib/externalParsers';
import { HKSA_DEPTS, SOURCES, budgetCsvUrl, budgetEditUrl, hksaDeptUrl, parseSheetUrl } from '@/lib/externalSources';
import { ROOMS, calendarIcsUrl, roomById } from '@/lib/roomsDirectory';
import { hkDayStart, hkStartOfDay, parseIcsEvents } from '@/lib/ics';

export const runtime = 'nodejs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const TTL_MS = { page: 6 * 3600_000, budget: 10 * 60_000, ics: 3 * 60_000 };
const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

interface TextEntry { at: number; text: string }
/** 上游原文快取（url → 最後一次成功結果） */
const memo = new Map<string, TextEntry>();

function decodeBody(buf: ArrayBuffer, contentType: string): string {
  const utf8 = new TextDecoder('utf-8').decode(buf);
  const m = /charset=["']?([\w-]+)/i.exec(contentType) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(utf8.slice(0, 4000));
  const cs = (m ? m[1] : 'utf-8').toLowerCase();
  if (cs && cs !== 'utf-8' && cs !== 'utf8') {
    try { return new TextDecoder(cs).decode(buf); } catch { /* fall through */ }
  }
  return utf8;
}

/** 開發用：PORTAL_DEV_EXTERNAL_BASE 設定後，所有上游改經該 base（?u=原網址）— 同 /api/proxy 嘅 PORTAL_DEV_APIBASE 一樣只喺非 production 生效 */
function upstream(url: string): string {
  const base = process.env.PORTAL_DEV_EXTERNAL_BASE;
  if (process.env.NODE_ENV !== 'production' && base) return `${base}?u=${encodeURIComponent(url)}`;
  return url;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(upstream(url), {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,text/calendar,text/csv,*/*;q=0.8',
      'Accept-Language': 'zh-HK,zh-TW;q=0.9,zh;q=0.8,en;q=0.7',
    },
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return decodeBody(await res.arrayBuffer(), res.headers.get('content-type') || '');
}

interface Got { text: string; at: number; stale: boolean; reason?: string }

/** 先讀快取；過期就重抓；重抓失敗就回舊原文（stale） */
async function getText(url: string, ttl: number, validate?: (t: string) => string | null): Promise<Got> {
  const hit = memo.get(url);
  if (hit && Date.now() - hit.at < ttl) return { text: hit.text, at: hit.at, stale: false };
  try {
    const text = await fetchText(url);
    const bad = validate ? validate(text) : null;
    if (bad) throw new Error(bad);
    const at = Date.now();
    memo.set(url, { at, text });
    return { text, at, stale: false };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (hit) return { text: hit.text, at: hit.at, stale: true, reason };
    throw new Error(reason);
  }
}

type Payload = Record<string, unknown>;
function meta(gots: Got[]): Payload {
  const at = Math.max(...gots.map(g => g.at));
  const st = gots.filter(g => g.stale);
  return {
    fetchedAt: new Date(Number.isFinite(at) ? at : Date.now()).toISOString(),
    stale: st.length > 0 || undefined,
    staleReason: st.length ? st.map(g => g.reason).filter(Boolean)[0] : undefined,
  };
}
function good(data: Payload) { return NextResponse.json({ ok: true, data }, NO_STORE); }
function bad(msg: string, status = 400) { return NextResponse.json({ ok: false, error: msg }, { status, ...NO_STORE }); }

const notHtml = (what: string) => (t: string) => (/<html/i.test(t.slice(0, 600)) ? `${what}（收到網頁而非資料）` : null);

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const kind = sp.get('kind') || '';

  try {
    switch (kind) {
      case 'regionStaff': {
        const g = await getText(SOURCES.hkirStaff, TTL_MS.page);
        const r = parseHkirStaff(g.text);
        if (!r.rows.length) throw new Error('未能辨識職員表格式');
        return good({ ...r, source: SOURCES.hkirStaff, ...meta([g]) });
      }

      case 'regionOrg': {
        const g = await getText(SOURCES.hkirCommissioner, TTL_MS.page);
        const r = parseHkirCommissioners(g.text);
        if (!r.groups.length) throw new Error('未能辨識總監架構格式');
        return good({ ...r, source: SOURCES.hkirCommissioner, ...meta([g]) });
      }

      case 'hksaCouncil': {
        const g = await getText(SOURCES.hksaCouncil, TTL_MS.page);
        const members = parseHksaCouncil(g.text);
        if (!members.length) throw new Error('未能辨識諮議會格式');
        return good({ members, source: SOURCES.hksaCouncil, ...meta([g]) });
      }

      case 'hksaDepts': {
        const gots: Got[] = [];
        const depts = await Promise.all(HKSA_DEPTS.map(async (d): Promise<DeptContact & { ok: boolean }> => {
          try {
            const g = await getText(hksaDeptUrl(d.id), TTL_MS.page);
            gots.push(g);
            const p = parseHksaDept(g.text);
            return { id: d.id, name: p.name || d.name, address: p.address, tel: p.tel, fax: p.fax, email: p.email, hours: p.hours, ok: !!(p.tel || p.email) };
          } catch {
            return { id: d.id, name: d.name, ok: false };
          }
        }));
        if (!depts.some(r => r.ok)) throw new Error('總會各署頁面全部無法讀取');
        return good({ depts, source: SOURCES.hksaHq, ...meta(gots) });
      }

      case 'budget': {
        const ref = parseSheetUrl(sp.get('sheet') || SOURCES.budgetSheet);
        if (!ref) return bad('Google Sheet 網址格式不正確');
        const g = await getText(budgetCsvUrl(ref.id, ref.gid), TTL_MS.budget, notHtml('Sheet 未公開，請設定「知道連結的任何人可查看」'));
        const r = parseBudgetCsv(g.text);
        if (!r.rows.length) throw new Error('讀到嘅表格冇任何月份／支部資料');
        return good({ ...r, sheetUrl: budgetEditUrl(ref.id, ref.gid), ...meta([g]) });
      }

      case 'rooms': {
        const roomParam = sp.get('room') || '';
        if (roomParam && !roomById(roomParam)) return bad('找不到該房間');
        const list = roomParam ? ROOMS.filter(r => r.id === roomParam) : ROOMS;
        const days = Math.min(60, Math.max(1, parseInt(sp.get('days') || '14', 10) || 14));
        const fromParam = sp.get('from') || '';
        let from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? hkDayStart(fromParam) : NaN;
        if (!Number.isFinite(from)) from = hkStartOfDay(Date.now());
        const to = from + days * 86_400_000;
        const gots: Got[] = [];
        const rooms = await Promise.all(list.map(async (r) => {
          try {
            const g = await getText(calendarIcsUrl(r), TTL_MS.ics, t => (/BEGIN:VCALENDAR/i.test(t.slice(0, 300)) ? null : '唔係有效日曆'));
            gots.push(g);
            return { id: r.id, ok: true, events: parseIcsEvents(g.text, from, to) };
          } catch (e) {
            return { id: r.id, ok: false, error: e instanceof Error ? e.message : String(e), events: [] };
          }
        }));
        if (!rooms.some(r => r.ok)) throw new Error('所有房間日曆都無法讀取');
        return good({ from, to, days, rooms, ...meta(gots) });
      }

      default:
        return bad('未知的 kind');
    }
  } catch (e) {
    return bad(`外部資料暫時無法讀取：${e instanceof Error ? e.message : String(e)}`, 502);
  }
}
