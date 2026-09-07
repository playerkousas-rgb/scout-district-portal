'use client';
/**
 * 主控台繽紛日橫額：顯示下一次籌備會議，按入去睇詳情＋執行手冊（/fun-day）。
 * 冇即將舉行嘅會議（全部已過期／未定日期）就自動收埋。
 */
import { useMemo } from 'react';
import { meetingTitle, nextFunDayMeeting } from '@/lib/funDay';

export default function FunDayBanner({ onOpen }: { onOpen: () => void }) {
  const next = useMemo(() => nextFunDayMeeting(), []);
  if (!next) return null;
  return (
    <button type="button" className="fund-banner" onClick={onOpen}>
      <span className="wx-ico">🎪</span>
      <span className="wx-text">
        <b>{meetingTitle(next)}</b>
        {next.dateLabel} · {next.timeLabel} · {next.venue}
      </span>
      <span className="wx-go">會議＋執行手冊 →</span>
    </button>
  );
}
