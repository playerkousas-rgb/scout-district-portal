import { NextResponse } from 'next/server';
import { publicTeamupLink } from '@/lib/teamupPublicSource.server';

/** Returns only the already-public Teamup share URL; never exposes the Teamup API token. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const url = await publicTeamupLink();
    return NextResponse.json(
      { ok: true, data: { url } },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  } catch {
    // Do not leak upstream URLs, Teamup keys, or request diagnostics in the response.
    return NextResponse.json(
      { ok: false, error: 'Teamup 公開日曆暫時未能載入；請核實區系統的 TEAMUP_BOOKING_URL 設定。' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  }
}
