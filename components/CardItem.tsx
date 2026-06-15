'use client';
import { useRouter } from 'next/navigation';
import { useDistrict } from '@/lib/useDistrict';
import type { CardDef } from '@/lib/types';

const typeLabel: Record<string, string> = { builtin: '內建', jump: '跳轉', resource: '資源' };

export default function CardItem({ card, role }: { card: CardDef; role: string }) {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const isView = card.access === 'view';

  function handleClick() {
    if (card.type === 'builtin') {
      router.push(withDistrict(`${card.url}`));
    } else if (card.embed) {
      router.push(withDistrict(`/embed?card=${encodeURIComponent(card.cardId)}`));
    } else {
      const sep = card.url.includes('?') ? '&' : '?';
      window.open(`${card.url}${sep}role=${encodeURIComponent(role)}&from=portal`, '_blank', 'noopener');
    }
  }

  return (
    <div className={`card t-${card.type}`} onClick={handleClick} role="button" tabIndex={0}>
      <span className={`pill ${card.type}`}>{typeLabel[card.type] || card.type}</span>
      <div className="ico">{card.icon}</div>
      {card.source === 'plugin' && <span className="plugin-tag">🧩 外掛</span>}
      <h3>{card.title}</h3>
      <div className="desc">{card.description}</div>
      <span className={`access ${isView ? 'view' : 'edit'}`}>
        {isView ? '👁 可看' : '✏️ 可管理'}{card.embed && card.type !== 'builtin' ? ' · 無感' : ''}
      </span>
    </div>
  );
}
