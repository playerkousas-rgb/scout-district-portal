'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import DistrictPicker from '@/components/DistrictPicker';
import DistrictUnavailableNotice from '@/components/DistrictUnavailableNotice';
import {
  DISTRICT_LIST, PLATFORM_COPYRIGHT, PLATFORM_NAME,
  clearStoredDistrictCode, getDistrictLockMessage, getDistrictStatusLabel,
  isDistrictAvailable, isDistrictCode, setStoredDistrictCode,
} from '@/lib/district';
import { useDistrict } from '@/lib/useDistrict';

// 不需選區即可瀏覽的公開頁
const PUBLIC_PATHS = ['/', '/setup', '/onboard', '/districts', '/updates'];

const navItems = [
  { href: '/', label: '🏠 主控台' },
  { href: '/setup', label: '🧩 區接入' },
  { href: '/districts', label: '🌏 使用地區' },
  { href: '/updates', label: '📢 更新' },
];

export default function DistrictShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { district, districtCode, hasDistrict, withDistrict } = useDistrict();

  const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/embed');
  const districtDisabled = !!districtCode && !isDistrictAvailable(districtCode);
  const title = district ? `${district.name}管理系統` : PLATFORM_NAME;
  const currentQuery = useMemo(() => searchParams.toString(), [searchParams]);

  function changeDistrict(code: string) {
    if (!isDistrictCode(code)) return;
    setStoredDistrictCode(code);
    const params = new URLSearchParams(currentQuery);
    params.set('d', code);
    router.push(`${pathname}?${params.toString()}`);
  }
  function clearDistrict() {
    clearStoredDistrictCode();
    const params = new URLSearchParams(currentQuery);
    params.delete('d');
    const q = params.toString();
    router.push(`${pathname}${q ? `?${q}` : ''}`);
  }

  const gateNeeded = !hasDistrict && !isPublic;

  // /embed 走全螢幕，不套外殼
  if (pathname.startsWith('/embed')) return <>{children}</>;

  return (
    <>
      <header className="shell-head">
        <div className="top">
          <div>
            <Link href={withDistrict('/')} className="brand" style={{ color: '#fff' }}>
              🧭 {title}
            </Link>
            <div className="sub">
              {district
                ? `目前地區：${district.name}（${district.code}）· ${getDistrictStatusLabel(district.status)}`
                : '未選擇地區'}
            </div>
          </div>
          <div className="ctrls">
            <select value={districtCode || ''} onChange={(e) => changeDistrict(e.target.value)}>
              <option value="">選擇地區…</option>
              {DISTRICT_LIST.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}（{d.code}）{d.status === 'disabled' ? '·暫停' : d.status === 'testing' ? '·測試' : ''}
                </option>
              ))}
            </select>
            {districtCode && <button className="ghost" onClick={clearDistrict}>清除地區</button>}
          </div>
        </div>
        <nav className="shell-nav">
          {navItems.map((it) => (
            <Link key={it.href} href={withDistrict(it.href)} className={pathname === it.href ? 'active' : ''}>
              {it.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="shell-main">
        {districtDisabled ? (
          <DistrictUnavailableNotice districtName={district?.name} message={getDistrictLockMessage(districtCode)} />
        ) : gateNeeded ? (
          <DistrictPicker
            title="這個功能需要先選擇地區"
            description="每個地區都有自己獨立的 Google Sheet / Apps Script 後台。請先選擇你所屬地區，再繼續使用。"
          />
        ) : (
          children
        )}
      </main>

      <footer className="shell-foot">
        <div>{PLATFORM_COPYRIGHT}</div>
        <div style={{ marginTop: 6 }}>Multi-district platform powered by SKWSCOUT SYSTEM</div>
      </footer>
    </>
  );
}
