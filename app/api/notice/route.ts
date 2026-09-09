/**
 * /api/notice — 通告 URL 自動讀料（舊制開班登記用）
 * ─────────────────────────────────────────────────────────────────────
 * GET ?url=<區網通告 PDF／帖文頁>
 *   PDF → pdf-parse 抽文字 → parseNoticeText 讀出通告名／收費／名額／
 *   截止／參加資格／節次／場地／聯絡 → 開班登記表單一次過填好。
 *   帖文頁（HTML）→ 搵第一條 PDF 跟一跳；冇 PDF 就用可見文字＋標題盡讀。
 *
 * 由 Vercel 伺服器端代抓（瀏覽器直接抓會撞 CORS，而且瀏覽器冇 PDF 解析）。
 * 安全：只跟 http(s) 公開網址（擋內網／本機／IP literal v6）；8MB／20s 上限；
 * 只回解析後欄位＋截斷原文（唔係 raw proxy）。
 * 開發：PORTAL_DEV_NOTICE_TEXT 有值＋非 production → 跳過抓取直接解析該文字。
 */
import { NextRequest, NextResponse } from 'next/server';
// 直入內層 lib：pdf-parse v1 嘅 index.js 有 debug 副作用（!module.parent 時讀 ./test/…），打包後會炸
import pdf from 'pdf-parse/lib/pdf-parse.js';
import {
  parseNoticeHtml, parseNoticeText, pickPdfUrl,
} from '@/lib/notice-parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };
const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

function good(data: Record<string, unknown>) {
  return NextResponse.json({ ok: true, data }, NO_STORE);
}
function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status, ...NO_STORE });
}

/** 擋 SSRF：內網／本機／metadata 一律唔跟 */
function hostBlocked(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.+$/, '');
  if (!h || h === 'localhost' || h === '::1' || h === '::ffff:127.0.0.1') return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(h)) return true;
  const m172 = /^172\.(\d+)\./.exec(h);
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
  if (h.includes(':')) return true; // 其餘 IP literal（v6）唔跟
  return false;
}

function checkUrl(raw: string): { url?: URL; error?: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { error: '網址格式唔啱' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: '只支援 http(s) 網址' };
  if (hostBlocked(u.hostname)) return { error: '唔支援內網／本機網址' };
  return { url: u };
}

interface Fetched { finalUrl: string; contentType: string; buf: ArrayBuffer }

async function fetchCapped(url: string): Promise<Fetched> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/pdf,text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'zh-HK,zh-TW;q=0.9,zh;q=0.8,en;q=0.7',
    },
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`抓唔到通告（HTTP ${res.status}）`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error('檔案太大（超過 8MB）');
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new Error('檔案太大（超過 8MB）');
  return { finalUrl: res.url || url, contentType: res.headers.get('content-type') || '', buf };
}

function decodeHtml(buf: ArrayBuffer, contentType: string): string {
  const bytes = new Uint8Array(buf);
  let head = '';
  try {
    head = new TextDecoder('utf-8').decode(bytes.slice(0, 4000));
  } catch { /* ignore */ }
  const m = /charset=["']?([\w-]+)/i.exec(contentType) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  const cs = (m ? m[1] : 'utf-8').toLowerCase();
  try {
    return new TextDecoder(cs === 'utf8' ? 'utf-8' : cs).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

export async function GET(request: NextRequest) {
  const raw = (request.nextUrl.searchParams.get('url') || '').trim();
  if (!raw) return bad('缺少 url 參數');
  const checked = checkUrl(raw);
  if (!checked.url) return bad(checked.error || '網址唔啱');

  // 開發夾具：sandbox／本機冇外網都測到解析鏈
  const devText = process.env.PORTAL_DEV_NOTICE_TEXT;
  if (process.env.NODE_ENV !== 'production' && devText) {
    const fields = parseNoticeText(devText, { url: checked.url.toString() });
    return good({
      fields,
      source: { url: checked.url.toString(), kind: 'dev-fixture', pages: 0 },
      text: devText.slice(0, 8000),
    });
  }

  try {
    const first = await fetchCapped(checked.url.toString());
    const ct = first.contentType.toLowerCase();
    const looksPdf = /\.pdf(\?|#|$)/i.test(first.finalUrl) || ct.includes('pdf');

    if (looksPdf) {
      let text = '', pages = 0;
      try {
        const data = await pdf(Buffer.from(first.buf));
        text = data.text || '';
        pages = data.numpages || 0;
      } catch {
        return bad('PDF 讀唔到（可能已加密／已損壞），請檢查連結');
      }
      const fields = parseNoticeText(text, { url: first.finalUrl });
      return good({
        fields,
        source: { url: first.finalUrl, kind: 'pdf', pages },
        text: text.slice(0, 8000),
      });
    }

    if (ct.includes('html') || ct.includes('text/') || ct === '') {
      const html = decodeHtml(first.buf, first.contentType);
      const page = parseNoticeHtml(html);
      const pdfUrl = pickPdfUrl(first.finalUrl, page.pdfUrls);
      if (pdfUrl) {
        const hop = checkUrl(pdfUrl);
        if (!hop.url) return bad('帖文入面條 PDF 連結唔支援');
        try {
          const second = await fetchCapped(hop.url.toString());
          let text = '', pages = 0;
          try {
            const data = await pdf(Buffer.from(second.buf));
            text = data.text || '';
            pages = data.numpages || 0;
          } catch {
            return bad('帖文條 PDF 讀唔到（可能已加密／已損壞）');
          }
          const fields = parseNoticeText(text, { url: second.finalUrl });
          if (!fields.title && page.title) fields.title = page.title;
          return good({
            fields,
            source: { url: second.finalUrl, kind: 'pdf', pages, via: first.finalUrl },
            text: text.slice(0, 8000),
          });
        } catch (e) {
          return bad(e instanceof Error ? e.message : 'PDF 抓取失敗');
        }
      }
      // 冇 PDF：用可見文字＋標題盡讀
      const fields = parseNoticeText(page.text, { url: first.finalUrl });
      if (!fields.title && page.title) fields.title = page.title;
      return good({
        fields,
        source: { url: first.finalUrl, kind: 'html' },
        text: page.text.slice(0, 8000),
      });
    }

    return bad(`唔支援呢種檔案（${first.contentType || '未知'}），請貼通告 PDF 或帖文頁連結`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timeout|aborted/i.test(msg)) return bad('抓取逾時（20 秒），請稍後再試');
    return bad(msg);
  }
}
