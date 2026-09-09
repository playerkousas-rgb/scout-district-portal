'use client';
/**
 * 卡片次序（v4.9.0）— 各用戶可以自己排列主控台卡片，次序存瀏覽器 localStorage
 *（鍵值連區碼＋帳號，唔同帳號／唔同區各自記住）。
 * 純函數放呢度方便測試。
 */

export type CardOrderMap = Record<string, number>;   // cardId → 次序（越小越前）

export function cardOrderKey(districtCode: string, email: string): string {
  return `portal_card_order_${(districtCode || 'NA').toUpperCase()}_${String(email || 'anon').toLowerCase()}`;
}

export function loadCardOrder(districtCode: string, email: string): CardOrderMap {
  try {
    const raw = localStorage.getItem(cardOrderKey(districtCode, email));
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    const out: CardOrderMap = {};
    Object.entries(obj).forEach(([k, v]) => { if (typeof v === 'number' && Number.isFinite(v)) out[k] = v; });
    return out;
  } catch { return {}; }
}

export function saveCardOrder(districtCode: string, email: string, order: CardOrderMap): void {
  try { localStorage.setItem(cardOrderKey(districtCode, email), JSON.stringify(order)); } catch { /* ignore */ }
}

export function clearCardOrder(districtCode: string, email: string): void {
  try { localStorage.removeItem(cardOrderKey(districtCode, email)); } catch { /* ignore */ }
}

/**
 * 套用自訂次序：有自訂嘅按數值排最前（之後維持相對次序），
 * 冇自訂嘅跟返原本 default 順序排喺後面 —— 新卡片一定見到。
 */
export function applyCardOrder<T extends { cardId: string }>(cards: T[], order: CardOrderMap): T[] {
  if (!Object.keys(order).length) return cards;
  const withIdx = cards.map((c, i) => ({ card: c, i, o: Object.prototype.hasOwnProperty.call(order, c.cardId) ? order[c.cardId] : Number.MAX_SAFE_INTEGER + i }));
  withIdx.sort((a, b) => (a.o !== b.o ? a.o - b.o : a.i - b.i));
  return withIdx.map(x => x.card);
}

/** 移動一位：由 from 到 to（-1 = 上移一格 / +1 = 下移一格之類，用 index 計） */
export function moveInList<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** 由已排好嘅 list 生成 order map（只記有需要嘅位 — 次序同 default 唔同先記） */
export function orderFromList(cardIds: string[], defaultIds: string[]): CardOrderMap {
  const order: CardOrderMap = {};
  let changed = false;
  cardIds.forEach((id, i) => {
    if (defaultIds[i] !== id) changed = true;
    order[id] = i;
  });
  return changed ? order : {};
}
