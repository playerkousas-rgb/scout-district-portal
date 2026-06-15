'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  DISTRICT_LIST, setStoredDistrictCode, isDistrictCode, getDistrictStatusLabel,
} from '@/lib/district';

export default function DistrictPicker({
  title = '請選擇你的童軍區',
  description = '本平台採「統一前端 + 各區獨立後台」。選擇你所屬地區後，系統會連接該區的資料，並會記住你的選擇。',
}: {
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function pick(code: string) {
    if (!isDistrictCode(code)) return;
    setStoredDistrictCode(code);
    const params = new URLSearchParams(searchParams.toString());
    params.set('d', code);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="center-bg">
      <div className="panel">
        <div className="logo">🧭</div>
        <h1>{title}</h1>
        <p className="sub">{description}</p>
        <div className="field">
          <label>童軍區</label>
          <select defaultValue="" onChange={(e) => pick(e.target.value)}>
            <option value="" disabled>— 請選擇 —</option>
            {DISTRICT_LIST.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}（{d.code}）· {getDistrictStatusLabel(d.status)}
              </option>
            ))}
          </select>
        </div>
        <p className="hint">選錯了？登入後可在頂部「清除地區」重新選擇。</p>
      </div>
    </div>
  );
}
