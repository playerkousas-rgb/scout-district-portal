/**
 * 港島地域房間（灣仔 香港童軍百周年紀念大樓 17／18／19 樓）— v4.5.0
 * ─────────────────────────────────────────────────────────────────────
 * 來源：https://sites.google.com/hkirscout.org.hk/hkir-rooms（每間房一個公開 Google 日曆）
 * 房間清單／容量／用途整理自該站；日曆內容由 /api/external?kind=room&room=… 即時拉取（公開 ICS）。
 */

export interface RoomDef {
  id: string;            // 房號（亦係 URL 參數）
  floor: '17' | '18' | '19';
  name: string;          // 顯示名
  calendarId: string;    // <id>@group.calendar.google.com 前半
  capacity?: string;     // 建議人數
  use?: string;          // 用途／限制
  combo?: string[];      // 打通房：包含哪幾間（用嚟提示「連同 XXXX 一齊睇」）
}

export const ROOMS: RoomDef[] = [
  // ── 17 樓 ──
  { id: '1702', floor: '17', name: '1702 室（Board Room）', calendarId: 'hsmh5r107v4nfe4a0tkvo9hpuk', capacity: '約 16 人', use: '會議' },
  { id: '1704A', floor: '17', name: '1704A 室', calendarId: 'j23thg6e9ijhng29jqpim7dorc', use: '活動／訓練（1704 一半）', combo: ['1704', '1704+1705'] },
  { id: '1704B', floor: '17', name: '1704B 室', calendarId: '00gqghukfg15ar9o9jfiroqc7o', use: '活動／訓練（1704 一半）', combo: ['1704', '1704+1705'] },
  { id: '1704', floor: '17', name: '1704 室（A+B 打通）', calendarId: 'l7fdleb2uu7oma7l7iac966eac', capacity: '講座約 140 人', use: '活動／訓練／講座', combo: ['1704A', '1704B', '1704+1705'] },
  { id: '1705', floor: '17', name: '1705 室', calendarId: '2gvjgjasj85cd0dup1anafmdco', capacity: '講座約 90 人', use: '活動／訓練／講座', combo: ['1704+1705'] },
  { id: '1704+1705', floor: '17', name: '1704 + 1705（全層打通）', calendarId: '3qdpu4kgnsovdr5ckc354tkm4k', capacity: '講座約 240 人', use: '大型講座／典禮', combo: ['1704', '1704A', '1704B', '1705'] },
  // ── 18 樓 ──
  { id: '1802', floor: '18', name: '1802 室（區務室）', calendarId: 'ui98s3qil0ena454ncu1et378k', capacity: '約 6–8 人', use: '只限會議' },
  { id: '1803', floor: '18', name: '1803 室（青少年活動部）', calendarId: 'emno370dd21ea0gv0dsslc7gt0', use: '只限會議' },
  { id: '1806', floor: '18', name: '1806 室（青少年活動空間）', calendarId: 'u6uvhsqop810rtdlivmj4peefo', capacity: '約 30 人', use: '活動／訓練' },
  { id: '1808', floor: '18', name: '1808 室', calendarId: '6q6bppojhefcjj5dqo7amlskf8', capacity: '約 6–8 人', use: '只限會議' },
  // ── 19 樓 ──
  { id: '1906', floor: '19', name: '1906 室', calendarId: 'nku7vi9768e1et30ia1de6gn58', capacity: '約 12 人', use: '會議' },
];

export const FLOORS: { id: RoomDef['floor']; label: string }[] = [
  { id: '17', label: '17 樓' },
  { id: '18', label: '18 樓' },
  { id: '19', label: '19 樓' },
];

export function roomById(id: string | null | undefined): RoomDef | undefined {
  return ROOMS.find(r => r.id === id);
}

export function calendarEmail(r: RoomDef): string {
  return `${r.calendarId}@group.calendar.google.com`;
}

/** 公開 ICS（伺服器端拉取用） */
export function calendarIcsUrl(r: RoomDef): string {
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarEmail(r))}/public/basic.ics`;
}

/** Google 日曆嵌入（週視圖；用戶想睇原版時用） */
export function calendarEmbedUrl(r: RoomDef, mode: 'WEEK' | 'MONTH' | 'AGENDA' = 'WEEK'): string {
  return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarEmail(r))}&ctz=Asia%2FHong_Kong&mode=${mode}&showTitle=0&showPrint=0&showTabs=1&showCalendars=0&showTz=0`;
}

/** 房間預約規則摘要（來自 hkir-rooms 網站） */
export const ROOM_NOTES = [
  '日曆事件標題格式：<參考編號>_<活動>_<單位>_<人數>（<聯絡人 電話>）。',
  '1704A／1704B 打通即係 1704；1704 + 1705 打通為全層，三者互相影響——借其中一款請同時參考另外幾個日曆。',
  '1802／1803／1808 只限會議用途。',
  '借用申請請經地域辦事處 2574 4296 / hkir@scout.org.hk（本頁只供查閱使用情況）。',
];
