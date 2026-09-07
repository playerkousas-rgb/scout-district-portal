'use client';
/**
 * 每張卡片頁統一嘅「← 返回主控台」按鈕。
 * 同時提供 <BackBar/>：頁尾再放一粒，長頁面唔使捲返上去。
 */
import { useRouter } from 'next/navigation';
import { useDistrict } from '@/lib/useDistrict';

export default function BackLink({ to = '/', label = '← 返回主控台', style }: { to?: string; label?: string; style?: React.CSSProperties }) {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  return (
    <span className="backlink" role="link" tabIndex={0} style={style}
      onClick={() => router.push(withDistrict(to))}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') router.push(withDistrict(to)); }}>
      {label}
    </span>
  );
}

export function BackBar() {
  return (
    <div className="back-bar">
      <BackLink style={{ margin: 0 }} />
    </div>
  );
}
