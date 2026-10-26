import type { CardDef, UserSession } from './types';

export const YMIS_LOGIN_URL = 'https://ymis.scout.org.hk/#/Login';
const SHORTCUT_IDS = new Set(['troopDirectoryShortcut']);

/** 本機導覽捷徑不是 Sheet 卡片，不可呼叫 setCardEnabled 修改它們。 */
export function isDashboardShortcut(card: CardDef): boolean {
  return SHORTCUT_IDS.has(card.cardId);
}

/**
 * 只在已成功取得後台卡片後使用；不參與 API 權限判斷。
 * 旅團資料沿用 visit 權限；YMIS 必須進入內頁，卡片不帶帳密。
 * 不自行補造後台未授權的 YMIS 卡片。
 */
export function dashboardCards(cards: CardDef[], _session: UserSession): CardDef[] {
  const result = cards.map(c => c.cardId === 'ymis'
    ? { ...c, type: 'builtin' as const, url: '/ymis', embed: false } : c);
  const visit = cards.find(c => c.cardId === 'visit');
  if (visit?.enabled && !result.some(c => c.cardId === 'troopDirectoryShortcut')) {
    result.push({
      ...visit,
      cardId: 'troopDirectoryShortcut', title: '旅團資料', icon: '🧭',
      type: 'builtin', url: '/visit?tab=units', embed: false, source: 'core', category: 'done',
      description: '旅團名單 · 集會時間 · 社交平台及網站 · 成員名錄公開設定',
      order: visit.order + 0.1,
    });
  }
  return result.sort((a, b) => a.order - b.order);
}
