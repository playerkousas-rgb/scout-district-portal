import { teamupEmbedUrl } from '@/lib/teamupEmbed';

/** 直接顯示成員系統同一個公開 Teamup 日曆（iframe 不會輸出私人 API Token）。 */
export default function TeamupCalendarEmbed({
  url, view, date, title,
}: { url: string; view: 'm' | 'w'; date: string; title: string }) {
  const src = teamupEmbedUrl(url, view, date);
  if (!src) return <p className="fps-notice">Teamup 公開日曆網址無效；請勿將資料缺失當作空置。</p>;
  return (
    <section className="info-card teamup-panel">
      <div className="section-head">
        <div>
          <h3>🗓 {title}</h3>
          <p>與成員系統相同的 Teamup 公開日曆；原版可同時查看申請中與已批借用。下方佔用時段／今日總覽只計紅色已批事件。</p>
        </div>
        <a className="mini-btn ghost" href={url} target="_blank" rel="noopener noreferrer">新視窗開啟 ↗</a>
      </div>
      <iframe className="teamup-frame" src={src} title="筲箕灣區總部場地借用行事曆" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
    </section>
  );
}
