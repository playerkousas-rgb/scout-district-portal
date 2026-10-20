import type { CardDef } from './types.ts';

export const ROOMS_CARD_TITLE = '區總部及地域房間使用情況';

/** 只轉換內建 rooms 卡的已知舊版預設標題；絕不寫入 Cards 表或覆蓋自訂名稱。 */
const LEGACY_TITLES = new Set(['地域房間使用情況', '地域房間及區總部使用情況']);

export function displayRoomCardTitle<T extends { cardId: string; title: string }>(card: T): T {
  if (card.cardId !== 'rooms' || !LEGACY_TITLES.has(card.title)) return card;
  return { ...card, title: ROOMS_CARD_TITLE };
}

export function displayRoomCards(cards: CardDef[]): CardDef[] {
  return cards.map(displayRoomCardTitle);
}

/**
 * 舊 4.18 getCards_ 會套 Users.cards 白名單／Perms；rooms 雖然預設 ALL_VIEW，
 * 個別舊帳戶的卡片白名單可能冇 rooms。此卡係公開場地狀況，補本機查閱卡，
 * 但只喺有效登入 getCards 成功之後、SKW 區且後台冇回傳 rooms 時補。
 * 已回傳嘅卡片（包括自訂標題）一律保留，不寫 Sheet、不影響 venueReg 審批。
 */
export function ensureSkwRoomsCard(cards: CardDef[], districtCode: string): CardDef[] {
  const displayed = displayRoomCards(cards);
  if (districtCode !== 'SKW' || displayed.some(c => c.cardId === 'rooms')) return displayed;
  return [...displayed, {
    cardId: 'rooms', title: ROOMS_CARD_TITLE, icon: '🏢', type: 'builtin', url: '/rooms',
    description: '區總部確認借用（紅色）及地域 17／18／19 樓房間 · 月曆',
    order: 15, enabled: true, access: 'view', embed: false, source: 'core', category: 'done',
  }];
}
