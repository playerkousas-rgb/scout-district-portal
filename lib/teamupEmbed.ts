import { teamupPublicKey } from './teamupHqIcs.ts';

/** 沿用成員系統 TeamupCalendar 的 iframe 參數；月曆用月檢視，逐個地點用原有週檢視。 */
export function teamupEmbedUrl(openUrl: string, view: 'm' | 'w', date?: string): string | null {
  const key = teamupPublicKey(openUrl);
  if (!key || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) return null;
  const url = new URL(`https://teamup.com/${key}`);
  url.searchParams.set('view', view);
  for (const [name, value] of Object.entries({
    showHeader: '0', showProfileAndInfo: '0', showSidepanel: '1', disableSidepanel: '1',
    showViewSelector: '0', showMenu: '0', showViewHeader: '1', showDateControls: '1',
  })) url.searchParams.set(name, value);
  if (date) url.searchParams.set('date', date);
  return url.toString();
}
