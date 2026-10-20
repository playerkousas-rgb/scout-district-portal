import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { DISTRICTS } from '@/lib/district';
import { hkDayStart, hkStartOfDay, hkYmd } from '@/lib/ics';
import { approvedTeamupSlots, memberTeamupLinkFromSource, teamupFeedUrl, teamupPublicKey, withinTeamupIcsWindow } from '@/lib/teamupHqIcs';

/**
 * SKW 區總部只讀日曆：Vercel 抓 Teamup 公開 ICS，絕不使用舊 GS 4.18 沒有的 action。
 * 優先使用共用 GS getPublicInfo.TEAMUP_BOOKING_URL；留空時從成員系統公開程式按需取得其後備連結。
 * 可選 TEAMUP_APPROVED_SUB_ID = Config.TEAMUP_APPROVED_SUBCAL_ID（指定紅色 feed，空 feed 也可確認來源）。
 * 如公開後備來源失效而 Config 沒網址，另可選 TEAMUP_PUBLIC_BOOKING_URL = 成員系統公開 Teamup 連結。
 * 未設時僅從公開 combined ICS 選「確認借用區總部」類別，未能驗證類別則顯示不可用。
 * 即使 Teamup 上游含電話／密碼，回應亦僅輸出匿名時段，並不快取原始 ICS。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 公開設定 + 成員系統後備網址 + Teamup ICS 最多三個唯讀上游

// 公開後備連結只從成員系統公開原始碼按需取得，唔好複製 ks 分享金鑰入本 repo。
const MEMBER_PUBLIC_LINK_SOURCE = 'https://api.github.com/repos/playerkousas-rgb/member-portal/contents/components/TeamupCalendar.tsx?ref=main';
const MAX_ICS_BYTES = 8_000_000;
const TTL_MS = 3 * 60_000;
const NO_STORE = { headers: { 'Cache-Control': 'private, no-store, max-age=0' } };

type Result = { configured: true; events: ReturnType<typeof approvedTeamupSlots>; fetchedAt: string };
const memo = new Map<string, { at: number; data: Result }>();
let publicKeyMemo: { at: number; key: string; ttl: number } | null = null;

function bad(error: string, status = 502) {
  return NextResponse.json({ ok: false, error }, { status, ...NO_STORE });
}

/** 成員系統已有公佈後備網址；只取該固定公開檔案，無需新增環境變數或複製 ks 金鑰到此倉庫。 */
async function memberPublicTeamupLink(): Promise<string> {
  const response = await fetch(MEMBER_PUBLIC_LINK_SOURCE, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'scout-district-portal' },
    next: { revalidate: 600 }, // 只快取公開原始碼，減少 GitHub API 呼叫；Teamup ICS 絕不快取原文。
    redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('成員系統公開 Teamup 連結暫時無法讀取');
  const body = await response.json() as { content?: string; encoding?: string; size?: number };
  if (body.encoding !== 'base64' || !body.content || (body.size || 0) > 50_000) {
    throw new Error('成員系統公開 Teamup 連結格式不正確');
  }
  const source = Buffer.from(body.content, 'base64').toString('utf8');
  const link = memberTeamupLinkFromSource(source);
  if (!link) throw new Error('成員系統未提供公開 Teamup 後備連結');
  return link;
}

async function publicTeamupKey(): Promise<string> {
  if (publicKeyMemo && Date.now() - publicKeyMemo.at < publicKeyMemo.ttl) return publicKeyMemo.key;
  const apiKey = process.env.PORTAL_SKW_APIKEY;
  if (!apiKey) throw new Error('區系統 Vercel 原有 PORTAL_SKW_APIKEY 未設定');
  const url = new URL(DISTRICTS.SKW.apiBase);
  url.searchParams.set('action', 'getPublicInfo');
  url.searchParams.set('apiKey', apiKey);
  // 此處的 Apps Script URL 是倉庫固定值，不由瀏覽器參數指定。
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error('區系統公開設定暫時無法讀取');
  const body = await response.json() as { ok?: boolean; data?: { teamupBookingUrl?: string } };
  if (!body.ok || !body.data) throw new Error('區系統公開設定暫時無法讀取');
  const configuredLink = String(body.data.teamupBookingUrl || '').trim();
  const envLink = String(process.env.TEAMUP_PUBLIC_BOOKING_URL || '').trim();
  const link = configuredLink || envLink || await memberPublicTeamupLink();
  const key = teamupPublicKey(link);
  if (!key) throw new Error('公開 Teamup 分享連結格式不正確；請核對區系統 TEAMUP_BOOKING_URL／Vercel TEAMUP_PUBLIC_BOOKING_URL');
  publicKeyMemo = { at: Date.now(), key, ttl: configuredLink ? 2 * 60_000 : 10 * 60_000 };
  return key;
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
    const key = await publicTeamupKey();
    const approvedSubId = String(process.env.TEAMUP_APPROVED_SUB_ID || '').trim();
    // 指定 ID 時才會讀取該子日曆；無 ID 時讀已公開的 combined feed，嚴格按類別過濾。
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
