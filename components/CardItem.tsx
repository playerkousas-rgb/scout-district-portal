'use client';
import { useRouter } from 'next/navigation';
import { useDistrict } from '@/lib/useDistrict';
import type { CardDef } from '@/lib/types';

const typeLabel: Record<string, string> = { builtin: '內建', jump: '跳轉', resource: '資源' };

export default function CardItem({
  card, role, canToggle = false, toggling = false, onToggle,
}: {
  card: CardDef; role: string;
  /** 超管：顯示「開啟／隱藏」開關 */
  canToggle?: boolean;
  toggling?: boolean;
  onToggle?: () => void;
}) {
  const router = useRouter();
  const { withDistrict, districtCode } = useDistrict();
  const isView = card.access === 'view';
  const hidden = card.enabled === false;

  /** 組出帶區碼 + 角色的外部網址 */
  function buildExternalUrl(): string {
    const sep = card.url.includes('?') ? '&' : '?';
    const params = new URLSearchParams();
    params.set('role', role);
    params.set('from', 'portal');
    // 自動把目前所選區碼帶給子系統（無感跳轉的關鍵）
    if (districtCode) params.set('d', districtCode);
    return `${card.url}${sep}${params.toString()}`;
  }

  function handleClick() {
    if (card.type === 'builtin') {
      router.push(withDistrict(`${card.url}`));
    } else if (card.embed) {
      router.push(withDistrict(`/embed?card=${encodeURIComponent(card.cardId)}`));
    } else {
      window.open(buildExternalUrl(), '_blank', 'noopener');
    }
  }

  const title = hidden ? '已隱藏：其他人睇唔到，只有超管可進入' : card.category === 'todo' ? '加入中：功能仍在開發' : '已完成：功能已上線';

  return (
    <div
      className={`card t-${card.type} ${card.category === 'todo' ? 'todo' : 'done'} ${hidden ? 'hidden-card' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
      title={title}
    >
      <span className={`pill ${card.type}`}>{typeLabel[card.type] || card.type}</span>
      {card.category === 'todo' && <span className="plugin-tag">🚧 加入中</span>}
      <div className="ico">{card.icon}</div>
      {card.source === 'plugin' && <span className="plugin-tag">🧩 外掛</span>}
      <h3>{card.title}</h3>
      <div className="desc">{card.description}</div>
      <span className={`access ${isView ? 'view' : 'edit'}`}>
        {isView ? '👁 可看' : '✏️ 可管理'}{card.embed && card.type !== 'builtin' ? ' · 無感' : ''}
      </span>
      {hidden && <span className="hidden-tag">🙈 已隱藏</span>}
      {canToggle && (
        <button
          type="button"
          className={`card-toggle ${hidden ? 'off' : 'on'}`}
          disabled={toggling}
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          title={hidden ? '點擊開啟：所有有權限嘅人都見到' : '點擊隱藏：只有超管見到'}
          aria-label={hidden ? '開啟卡片' : '隱藏卡片'}
        >
          {toggling ? '…' : hidden ? '隱藏中 · 開啟' : '開啟中 · 隱藏'}
        </button>
      )}
    </div>
  );
}
