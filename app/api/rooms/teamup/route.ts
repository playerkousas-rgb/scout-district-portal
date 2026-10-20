import { NextRequest, NextResponse } from 'next/server';
import { publicTeamupLink } from '@/lib/teamupPublicSource.server';

/** 成員系統同一條公開日曆連結，供登入後房間頁嵌入原版 Teamup；不提供私人 Teamup API Token。 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const NO_STORE = { headers: { 'Cache-Control': 'private, no-store, max-age=0' } };

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('districtCode') !== 'SKW') {
    return NextResponse.json({ ok: false, error: '此區暫未設定區總部公開日曆' }, { status: 404, ...NO_STORE });
  }
  try {
    return NextResponse.json({ ok: true, data: { url: await publicTeamupLink() } }, NO_STORE);
  } catch {
    // fetch 錯誤可能夾雜完整網址或分享金鑰，不能向瀏覽器輸出。
    return NextResponse.json({ ok: false, error: '成員系統公開 Teamup 日曆暫時無法載入' }, { status: 502, ...NO_STORE });
  }
}
