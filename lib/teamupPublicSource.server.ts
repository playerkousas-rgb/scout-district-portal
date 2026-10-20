import { DISTRICTS } from './district';
import { memberTeamupLinkFromSource, teamupPublicKey } from './teamupHqIcs';

/** 共用後台 v4.18.0 的公開日曆網址；與成員系統 TeamupCalendar 同一來源。 */
const MEMBER_PUBLIC_LINK_SOURCE = 'https://api.github.com/repos/playerkousas-rgb/member-portal/contents/components/TeamupCalendar.tsx?ref=main';
let publicLinkMemo: { at: number; url: string; ttl: number } | null = null;

/** 成員系統 Config 留空時，取其公開程式原有後備網址；不把 ks 金鑰重複寫進本倉庫。 */
async function memberPublicTeamupLink(): Promise<string> {
  const response = await fetch(MEMBER_PUBLIC_LINK_SOURCE, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'scout-district-portal' },
    next: { revalidate: 600 }, // 只快取公開原始碼；絕不快取 Teamup 原始事件。
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

/** 優先讀同一 Sheet 的公開欄，留空時照成員系統後備連結；只接受 teamup.com 分享連結。 */
export async function publicTeamupLink(): Promise<string> {
  if (publicLinkMemo && Date.now() - publicLinkMemo.at < publicLinkMemo.ttl) return publicLinkMemo.url;
  const apiKey = process.env.PORTAL_SKW_APIKEY;
  if (!apiKey) throw new Error('區系統 Vercel 原有 PORTAL_SKW_APIKEY 未設定');
  const url = new URL(DISTRICTS.SKW.apiBase);
  url.searchParams.set('action', 'getPublicInfo');
  url.searchParams.set('apiKey', apiKey);
  // Apps Script 目標係固定區目錄的網址，不會接收瀏覽器提供的上游 URL。
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error('區系統公開設定暫時無法讀取');
  const body = await response.json() as { ok?: boolean; data?: { teamupBookingUrl?: string } };
  if (!body.ok || !body.data) throw new Error('區系統公開設定暫時無法讀取');
  const configuredLink = String(body.data.teamupBookingUrl || '').trim();
  const envLink = String(process.env.TEAMUP_PUBLIC_BOOKING_URL || '').trim();
  const link = configuredLink || envLink || await memberPublicTeamupLink();
  const key = teamupPublicKey(link);
  if (!key) throw new Error('公開 Teamup 分享連結格式不正確；請核對區系統 TEAMUP_BOOKING_URL／Vercel TEAMUP_PUBLIC_BOOKING_URL');
  const openUrl = `https://teamup.com/${key}`;
  publicLinkMemo = { at: Date.now(), url: openUrl, ttl: configuredLink ? 2 * 60_000 : 10 * 60_000 };
  return openUrl;
}
