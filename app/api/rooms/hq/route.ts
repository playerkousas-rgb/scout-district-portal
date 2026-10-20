import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { publicTeamupLink } from '@/lib/teamupPublicSource.server';
import { hkDayStart, hkStartOfDay, hkYmd } from '@/lib/ics';
import { approvedTeamupSlots, SKW_APPROVED_SUBCAL_ID, teamupFeedUrl, teamupPublicKey, withinTeamupIcsWindow } from '@/lib/teamupHqIcs';

/**
 * SKW 區總部只讀日曆：Vercel 抓 Teamup 公開 ICS，絕不使用舊 GS 4.18 沒有的 action。
 * 優先使用共用 GS getPublicInfo.TEAMUP_BOOKING_URL；留空時從成員系統公開程式按需取得其後備連結。
 * 紅色子日曆 ID 經用戶核對，沿用既有 Config 編號；可選 TEAMUP_APPROVED_SUB_ID 僅在日後改 ID 時覆蓋。
 * 如公開後備來源失效而 Config 沒網址，另可選 TEAMUP_PUBLIC_BOOKING_URL = 成員系統公開 Teamup 連結。
 * 即使只讀紅色 feed，仍核對「確認借用區總部」類別／日曆名稱，讀錯來源不能當空置。
 * 即使 Teamup 上游含電話／密碼，回應亦僅輸出匿名時段，並不快取原始 ICS。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 公開設定 + 成員系統後備網址 + Teamup ICS 最多三個唯讀上游

const MAX_ICS_BYTES = 8_000_000;
const TTL_MS = 3 * 60_000;
const NO_STORE = { headers: { 'Cache-Control': 'private, no-store, max-age=0' } };

type Result = { configured: true; events: ReturnType<typeof approvedTeamupSlots>; fetchedAt: string };
const memo = new Map<string, { at: number; data: Result }>();

function bad(error: string, status = 502) {
  return NextResponse.json({ ok: false, error }, { status, ...NO_STORE });
}

async function fetchIcs(url: string): Promise<string> {
  // url 只由 teamupFeedUrl(已驗證 ks 金鑰、數字子日曆 ID) 組裝；禁止跟隨跳轉至其他主機。
  const response = await fetch(url, {
    headers: { Accept: 'text/calendar' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Teamup 公開 iCalendar 讀取失敗（HTTP ${response.status}）`);
  if (Number(response.headers.get('content-length') || 0) > MAX_ICS_BYTES) throw new Error('Teamup 公開日曆過大，請指定紅色子日曆 ID');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Teamup 公開 iCalendar 回應沒有內容');
  let size = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks: string[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ICS_BYTES) {
      await reader.cancel();
      throw new Error('Teamup 公開日曆過大，請指定紅色子日曆 ID');
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return chunks.join('');
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  if (sp.get('districtCode') !== 'SKW') return bad('此區暫未設定區總部公開日曆', 404);
  const fromText = sp.get('from') || hkYmd(hkStartOfDay(Date.now()));
  const from = hkDayStart(fromText);
  const daysText = sp.get('days') || '14';
  const days = Number(daysText);
  if (!Number.isFinite(from) || hkYmd(from) !== fromText || !Number.isInteger(days) || days < 1 || days > 60) {
    return bad('請提供有效日期及 1–60 天的查詢範圍', 400);
  }
  if (!withinTeamupIcsWindow(from, days, Date.now())) {
    return bad('Teamup 公開日曆只提供近半年至未來一年嘅事件；此日期範圍唔能夠確認區總部有冇預約', 422);
  }

  try {
    const key = teamupPublicKey(await publicTeamupLink())!;
    const approvedSubId = String(process.env.TEAMUP_APPROVED_SUB_ID || SKW_APPROVED_SUBCAL_ID).trim();
    // 直接讀已核對的紅色子日曆；毋須新增 Vercel env，亦不會取藍色「申請中」。
    const icsUrl = teamupFeedUrl(key, approvedSubId || undefined);
    const cacheKey = `${createHash('sha256').update(key).digest('hex')}:${approvedSubId}:${fromText}:${days}`;
    const hit = memo.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ ok: true, data: hit.data }, NO_STORE);

    const ics = await fetchIcs(icsUrl);
    const events = approvedTeamupSlots(ics, from, days, approvedSubId || undefined);
    const at = Date.now();
    const data: Result = { configured: true, events, fetchedAt: new Date(at).toISOString() };
    // 僅快取匿名結果，絕不儲存 Teamup ICS 原文或不同子日曆事件。
    if (memo.size > 80) memo.clear();
    memo.set(cacheKey, { at, data });
    return NextResponse.json({ ok: true, data }, NO_STORE);
  } catch (e) {
    // fetch/network 錯誤可能含公開金鑰及原始網址；永遠唔把佢哋回傳或寫入日誌。
    const msg = e instanceof Error && /^(?:Teamup |公開|區系統 )/.test(e.message)
      ? e.message : 'Teamup 公開日曆暫時無法讀取';
    return bad(msg);
  }
}
