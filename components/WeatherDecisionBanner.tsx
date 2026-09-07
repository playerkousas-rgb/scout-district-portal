'use client';
/**
 * 主控台天氣決策橫額：每 10 分鐘拉一次天文台 warnsum，
 * 有警告即顯示「戶內／戶外／海上」一句結論，按入去睇詳細（意外／應變 → 天氣決策分頁）。
 */
import { useEffect, useState } from 'react';
import { fetchWarnsum, matchRules, summarize, type MatchedWarning } from '@/lib/weatherDecision';

export default function WeatherDecisionBanner({ districtCode, onOpen }: { districtCode: string; onOpen: () => void }) {
  const [matched, setMatched] = useState<MatchedWarning[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [at, setAt] = useState('');

  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    async function load() {
      try {
        const w = await fetchWarnsum(ctrl.signal);
        if (!live) return;
        setMatched(matchRules(w)); setFailed(false);
        const d = new Date();
        setAt(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      } catch {
        if (live) setFailed(true);
      }
    }
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => { live = false; ctrl.abort(); clearInterval(id); };
  }, [districtCode]);

  if (failed) {
    return (
      <button type="button" className="wx-banner unknown" onClick={onOpen}>
        <span className="wx-ico">🌦</span>
        <span className="wx-text"><b>天氣決策</b> 未能連接天文台，按此開啟對照表自行判斷</span>
        <span className="wx-go">開啟 →</span>
      </button>
    );
  }
  if (!matched) return null;
  const s = summarize(matched);
  return (
    <button type="button" className={`wx-banner ${s.verdict}`} onClick={onOpen}>
      <span className="wx-ico">{s.verdict === 'cancel' ? '⛔' : s.verdict === 'caution' ? '⚠️' : '🌤'}</span>
      <span className="wx-text">
        <b>天氣決策</b> {s.text}
        {at && <small> · 天文台 {at} 更新</small>}
      </span>
      <span className="wx-go">{matched.length ? '要唔要取消？→' : '對照表 →'}</span>
    </button>
  );
}
