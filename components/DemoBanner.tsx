'use client';
/**
 * 🎭 模擬示範版橫額（v4.9.0）
 * ─────────────────────────
 * demo 模式開著時顯示喺每一頁頂：
 *  - 明確標示「示範資料、唔會影響正式系統」（示範身份固定：助理區總監 ADC·權限全開）
 *  - ↺ 重設示範資料 ／ ✕ 離開示範版
 * 另外支援 URL `?demo=1`（進入示範）／`?demo=0`（離開）——方便直接分享示範連結。
 */
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isDemoMode, enterDemoRole, exitDemo } from '@/lib/demo/session';
import { resetDemoData } from '@/lib/demo/engine';
import { loadSession } from '@/lib/session';

export default function DemoBanner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [on, setOn] = useState(false);
  const [who, setWho] = useState('');

  useEffect(() => {
    const q = searchParams.get('demo');
    if (q === '1') {
      const existing = loadSession();
      if (!existing || String(existing.email).indexOf('@demo') < 0) enterDemoRole('adc');
      // 頂走 URL 參數，避免再分享時重複觸發
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('demo');
        window.history.replaceState(null, '', url.toString());
      } catch { /* ignore */ }
      router.refresh();
    } else if (q === '0') {
      exitDemo();
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('demo');
        window.history.replaceState(null, '', url.toString());
      } catch { /* ignore */ }
      window.location.reload();
      return;
    }
    const tick = () => {
      setOn(isDemoMode());
      const s = loadSession();
      setWho(s && String(s.email).indexOf('@demo') >= 0 ? `${s.displayName}（${s.roleLabel}）` : '訪客（未登入）');
    };
    tick();
    const t = window.setInterval(tick, 1200);
    return () => window.clearInterval(t);
  }, [router, searchParams]);

  if (!on) return null;

  function resetData() {
    resetDemoData();
    window.location.reload();
  }
  function leave() {
    exitDemo();
    window.location.assign('/');
  }

  return (
    <div className="demo-banner" role="region" aria-label="模擬示範版">
      <div className="demo-banner-inner">
        <span className="demo-badge">🎭 模擬示範版</span>
        <span className="demo-who">示範身份：{who}</span>
        <span className="demo-note">全部資料屬<b>虛構示範</b>，改動只存喺你嘅瀏覽器，唔會影響任何正式系統（示範版<b>權限全開</b>；成人獎勵提名唔喺示範範圍）</span>
        <span className="demo-actions">
          <button type="button" className="demo-chip" onClick={resetData} title="還原出廠示範資料">↺ 重設示範資料</button>
          <button type="button" className="demo-chip demo-exit" onClick={leave}>✕ 離開示範版</button>
        </span>
      </div>
    </div>
  );
}
