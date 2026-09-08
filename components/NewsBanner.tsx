'use client';
/**
 * 置頂消息橫額（v4.6.0）
 *
 * 同成員系統 member-portal 首頁嗰條一模一樣嘅資料來源：
 *   每次載入 fetch 一次公開 action `listAnnouncements`（pinnedOnly）→ 有就顯示，冇就隱藏。
 * 純拉取、冇推送；喺 /news 刪咗或下架，下次載入就即刻消失。
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Announcement } from '@/lib/types';

const MAX_SHOWN = 3;

export default function NewsBanner({ onManage, canManage }: { onManage?: () => void; canManage?: boolean }) {
  const [items, setItems] = useState<Announcement[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await api.listAnnouncements({ pinnedOnly: true, limit: 10 });
      if (!live) return;
      // 後台未升級（未知的 action）→ 靜靜哋當冇消息，唔好嘈住主控台
      if (r.ok && Array.isArray(r.data)) setItems(r.data);
    })().catch(() => { /* ignore */ });
    return () => { live = false; };
  }, []);

  if (!items.length) return null;

  return (
    <section className="news-banner" aria-label="置頂消息">
      <div className="news-banner-head">
        <b>📢 置頂消息</b>
        <span>成員系統首頁同步顯示緊呢 {items.length} 則</span>
        {canManage && onManage && (
          <button type="button" className="mini-btn" onClick={onManage}>管理消息 →</button>
        )}
      </div>
      {items.slice(0, MAX_SHOWN).map(n => (
        <article key={n.id} className={`news-pin lv-${n.level || 'info'}`}>
          <div className="news-pin-top">
            <b>{n.title}</b>
            {n.date && <small>{n.date}</small>}
          </div>
          <p>{n.body}</p>
          {n.link && (
            <a href={n.link} target="_blank" rel="noopener noreferrer">{n.linkLabel || '查看詳情'} ↗</a>
          )}
        </article>
      ))}
      {items.length > MAX_SHOWN && (
        <p className="news-more">另有 {items.length - MAX_SHOWN} 則置頂消息，喺「📢 消息發佈」查看。</p>
      )}
    </section>
  );
}
