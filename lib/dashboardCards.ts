import type { CardDef, UserSession } from './types';

export const YMIS_LOGIN_URL = 'https://ymis.scout.org.hk/#/Login';
const SHORTCUT_IDS = new Set(['troopDirectoryShortcut']);
const TROOP_SUB_IDS = ['visit', 'troopDirectory', 'troopRequests', 'activity'];

/** 本機導覽捷徑不是 Sheet 卡片，不可呼叫 setCardEnabled 修改它們。 */
export function isDashboardShortcut(card: CardDef): boolean {
  return SHORTCUT_IDS.has(card.cardId);
}

function bestAccess(cards: CardDef[]): CardDef['access'] {
  if (cards.some(c => c.access === 'edit')) return 'edit';
  if (cards.some(c => c.access === 'view')) return 'view';
  return '';
}

/**
 * 只在已成功取得後台卡片後使用；不參與 API 權限判斷。
 *
 * v4.32.0 起「旅團」是一張入口卡（troop）：主控台只渲染入口卡，
 * 子分頁權限偽卡（subPerm）一律過濾走。舊 GS（v4.31.0 或以前）未升級時
 * 後台仍會回 visit／troopDirectory／activity 獨立卡 —— 此處幫手合成一張「旅團」卡
 * 連去 /troop，令前端先部署、GS 後升級期間主控台都正常（access 取各卡最高級）。
 * YMIS 必須進入內頁，卡片不帶帳密；不自行補造後台未授權的 YMIS 卡片。
 */
export function dashboardCards(cards: CardDef[], _session: UserSession): CardDef[] {
  const visible = cards.filter(c => !isDashboardShortcut(c) && !c.subPerm && c.type !== 'subperm');
  const troop = visible.find(c => c.cardId === 'troop');
  const legacyTroopCards = visible.filter(c => TROOP_SUB_IDS.includes(c.cardId));

  let result = visible.filter(c => !TROOP_SUB_IDS.includes(c.cardId));
  if (troop) {
    result = result.map(c => (c.cardId === 'troop' ? { ...c, type: 'builtin' as const, url: '/troop', embed: false } : c));
  } else if (legacyTroopCards.length) {
    // 舊 GS 相容：合成入口卡（不修改後台原陣列）
    const first = legacyTroopCards.slice().sort((a, b) => a.order - b.order)[0];
    result.push({
      ...first,
      cardId: 'troop',
      title: '旅團',
      icon: '🏕',
      type: 'builtin',
      url: '/troop',
      description: '旅團探訪 · 旅團資料 · 活動知會',
      access: bestAccess(legacyTroopCards),
      embed: false,
    });
  }

  return result
    .map(c => (c.cardId === 'ymis' ? { ...c, type: 'builtin' as const, url: '/ymis', embed: false } : c))
    .sort((a, b) => a.order - b.order);
}
