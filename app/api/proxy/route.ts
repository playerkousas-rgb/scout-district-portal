import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DISTRICTS } from '@/lib/district';

/**
 * 童軍區管理平台 — API Proxy
 * 
 * 前端不直接呼叫 Google Apps Script，而是經此代理。
 * API Key 存在 Vercel 環境變數，不會出現在前端 JS。
 * 
 * 環境變數命名：PORTAL_{區碼}_APIKEY
 * 例如：PORTAL_SKW_APIKEY=ak_xxxxxxxx
 * 
 * GET: /api/proxy?districtCode=SKW&action=xxx&...
 * POST: /api/proxy (body: { districtCode, action, ... })
 * Debug: /api/proxy?districtCode=SKW&action=proxyDebug
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStoreJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

function constantTimeTextEqual(a: string, b: string) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** 本機開發用：設 PORTAL_DEV_APIBASE 可把所有區指向本機模擬後台（production 一律忽略） */
function apiBaseFor(district: { apiBase: string }): string {
  if (process.env.NODE_ENV !== 'production' && process.env.PORTAL_DEV_APIBASE) return process.env.PORTAL_DEV_APIBASE;
  return district.apiBase;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const districtCode = searchParams.get('districtCode');
  const action = searchParams.get('action') || 'getHealthCheck';

  // 共用帳密與電子鎖金鑰設定只可經 POST；不可將 token/金鑰放在可記錄的 GET URL。
  if (action === 'login' || action === 'proxyMasterLogin' || action === 'getYmisCredentials' || action === 'getVenueLockConfig' || action === 'saveVenueLockConfig') {
    return NextResponse.json({ ok: false, error: 'Method not allowed' }, {
      status: 405, headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }

  if (!districtCode) {
    return NextResponse.json({ ok: false, error: 'Missing districtCode' }, { status: 400 });
  }

  const district = DISTRICTS[districtCode as keyof typeof DISTRICTS];
  if (!district) {
    return NextResponse.json({ ok: false, error: 'Unknown district' }, { status: 400 });
  }

  const envVarName = `PORTAL_${districtCode}_APIKEY`;
  const apiKey = process.env[envVarName] || '';

  if (action === 'proxyDebug') {
    return NextResponse.json({
      ok: true, debug: true,
      districtCode, districtName: district.name,
      envVarName, apiKeyFound: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 6) + '...' : '(empty)',
      apiKeyLength: apiKey.length,
      allEnvKeys: Object.keys(process.env).filter(k => k.startsWith('PORTAL_') && !/MASTER_(PASSWORD|BRIDGE_SECRET)$/.test(k)),
      apiBase: apiBaseFor(district),
    });
  }

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: `District API Key not set (need env var ${envVarName}), please contact platform admin`,
    }, { status: 500 });
  }

  // Build target URL for GET
  const url = new URL(apiBaseFor(district));
  url.searchParams.set('action', action);
  url.searchParams.set('apiKey', apiKey);
  searchParams.forEach((value, key) => {
    if (key !== 'districtCode' && key !== 'action') {
      url.searchParams.set(key, value);
    }
  });

  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    const text = await res.text();
    if (/<!doctype html|<html/i.test(text)) {
      return NextResponse.json({ ok: false, error: 'Apps Script not public (Deploy → Anyone): ' + text.slice(0, 100) }, { status: 502 });
    }
    try {
      return NextResponse.json(JSON.parse(text));
    } catch (e) {
      return NextResponse.json({ ok: false, error: 'Apps Script returned non-JSON: ' + text.slice(0, 200) }, { status: 502 });
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: 'Proxy POST error: ' + (err.message || String(err)) }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { districtCode, action, ...rest } = body;
  // The browser must never override the server-side district API key.
  delete rest.apiKey;

  if (!districtCode) {
    return NextResponse.json({ ok: false, error: 'Missing districtCode' }, { status: 400 });
  }

  const district = DISTRICTS[districtCode as keyof typeof DISTRICTS];
  if (!district) {
    return NextResponse.json({ ok: false, error: 'Unknown district' }, { status: 400 });
  }
  if (action === 'proxyMasterLogin') {
    return noStoreJson({ ok: false, error: 'Method not allowed' }, 405);
  }

  const envVarName = `PORTAL_${districtCode}_APIKEY`;
  const apiKey = process.env[envVarName] || '';

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: `District API Key not set (need env var ${envVarName}), please contact platform admin`,
    }, { status: 500 });
  }

  // sheep 密碼只由 Vercel runtime 驗證。Apps Script 只收到短效、一次性的 HMAC 授權，
  // 共用 API Key 仍不足以自行簽發維護 token（成員系統亦持有此 API Key）。
  if (action === 'login' && String(rest.email || '').trim().toLowerCase() === 'sheep') {
    const passwordEnvName = `PORTAL_${districtCode}_MASTER_PASSWORD`;
    const bridgeEnvName = `PORTAL_${districtCode}_MASTER_BRIDGE_SECRET`;
    const configuredPassword = process.env[passwordEnvName] || '';
    const bridgeSecret = process.env[bridgeEnvName] || '';
    const suppliedPassword = typeof rest.password === 'string' ? rest.password : '';
    if (!configuredPassword) {
      return noStoreJson({ ok: false, error: `維護密碼未設定（Vercel env: ${passwordEnvName}）` }, 503);
    }
    if (!bridgeSecret) {
      return noStoreJson({ ok: false, error: `維護登入橋接未設定（Vercel env: ${bridgeEnvName}）` }, 503);
    }
    if (!suppliedPassword || !constantTimeTextEqual(suppliedPassword, configuredPassword)) {
      return noStoreJson({ ok: false, error: '帳號或密碼不正確' }, 401);
    }

    const assertion = JSON.stringify({
      email: 'sheep',
      exp: Date.now() + 30_000,
      nonce: randomBytes(16).toString('hex'),
    });
    const signature = createHmac('sha256', bridgeSecret).update(assertion, 'utf8').digest('hex');
    try {
      const res = await fetch(apiBaseFor(district), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'proxyMasterLogin', apiKey, assertion, signature }),
        cache: 'no-store',
      });
      const text = await res.text();
      if (/<!doctype html|<html/i.test(text)) {
        return noStoreJson({ ok: false, error: 'Apps Script not public (Deploy → Anyone): ' + text.slice(0, 100) }, 502);
      }
      try {
        return noStoreJson(JSON.parse(text), res.ok ? 200 : 502);
      } catch {
        return noStoreJson({ ok: false, error: 'Apps Script returned non-JSON: ' + text.slice(0, 200) }, 502);
      }
    } catch (err: any) {
      return noStoreJson({ ok: false, error: 'Proxy POST error: ' + (err.message || String(err)) }, 502);
    }
  }

  // POST to Apps Script with apiKey in body
  const postBody = { action, apiKey, ...rest };

  try {
    const res = await fetch(apiBaseFor(district), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(postBody),
      cache: 'no-store',
    });
    const text = await res.text();
    if (/<!doctype html|<html/i.test(text)) {
      return NextResponse.json({ ok: false, error: 'Apps Script not public (Deploy → Anyone): ' + text.slice(0, 100) }, { status: 502 });
    }
    let parsedJson;
    try {
      parsedJson = JSON.parse(text);
    } catch (e) {
      return NextResponse.json({ ok: false, error: 'Apps Script returned non-JSON: ' + text.slice(0, 200) }, { status: 502 });
    }
    const response = NextResponse.json(parsedJson);
    // 敏感帳密與電子鎖設定絕不可喺 CDN／瀏覽器快取。
    if (action === 'login' || action === 'proxyMasterLogin' || action === 'getYmisCredentials' || action === 'getVenueLockConfig' || action === 'saveVenueLockConfig') {
      response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    }
    return response;
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: 'Proxy POST error: ' + (err.message || String(err)) }, { status: 502 });
  }
}
