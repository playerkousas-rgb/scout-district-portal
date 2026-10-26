import type { CardDef, UserSession } from './types';
import { isSuper } from './levels';

export const YMIS_LOGIN_URL = 'https://ymis.scout.org.hk/#/Login';
const SHORTCUT_IDS = new Set(['troopDirectoryShortcut', 'ymisWebsiteShortcut']);

/** 本機導覽捷徑不是 Sheet 卡片，不可呼叫 setCardEnabled 修改它們。 */
export function isDashboardShortcut(card: CardDef): boolean {
  return SHORTCUT_IDS.has(card.cardId);
}

/**
 * 只在已成功取得後台卡片後使用；不參與 API 權限判斷。
 * 旅團資料沿用 visit 的可見性／權限；超管 YMIS 捷徑只連官方網站，
 * 不新增 ymis 權限、不讀取核實帳密，也不繞過受保護頁面的門禁。
 */
export function dashboardCards(cards: CardDef[], session: UserSession): CardDef[] {
  const result = cards.slice();
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
  if (isSuper(session) && !result.some(c => c.cardId === 'ymis' || c.cardId === 'ymisWebsiteShortcut')) {
    result.push({
      cardId: 'ymisWebsiteShortcut', title: 'YMIS 會員核實', icon: '🪪',
      type: 'jump', url: YMIS_LOGIN_URL, embed: false, source: 'core', category: 'done',
      description: '開啟 YMIS 官方網站；區方共用帳密只供獲授權的 DC／DDC／ADC／區職員查閱',
      order: 6, enabled: true, access: 'view',
    });
  }
  return result.sort((a, b) => a.order - b.order);
}
