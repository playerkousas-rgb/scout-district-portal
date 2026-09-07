/**
 * 天氣決策（v4.4.0）— 「而家有咩警告 → 活動應唔應該取消？」
 * ─────────────────────────────────────────────────────────────────────
 * 資料來源：香港天文台開放數據 API（warnsum = 現正生效嘅警告一覽）
 *   https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc
 * 規則來源：香港童軍總會 活動指引通告 04/2018「惡劣天氣及空氣污染應變措施」表一（青少年活動）
 *   適用時段：活動開始前 3 小時 → 活動完結；只有成年成員嘅活動可由負責領袖酌情。
 *
 * 三類活動：戶內 / 戶外（不包括海上）/ 海上（船艇、游泳、潛水）。
 * 三個結論：go（如常進行）/ caution（如常但要留意／暫避／改戶內）/ cancel（延期或取消）。
 */

export type ActivityKind = 'indoor' | 'outdoor' | 'sea';
export type Verdict = 'go' | 'caution' | 'cancel';

export const ACTIVITY_KINDS: { id: ActivityKind; label: string; hint: string }[] = [
  { id: 'indoor', label: '戶內活動', hint: '集會、訓練班、室內營舍（仍須跟場地惡劣天氣安排）' },
  { id: 'outdoor', label: '戶外活動', hint: '遠足、露營、野外定向、岸上船藝訓練等（不包括海上）' },
  { id: 'sea', label: '海上活動', hint: '船艇、獨木舟、風帆、游泳、潛水' },
];

/** 一個生效中嘅警告（由 warnsum 正規化） */
export interface ActiveWarning {
  key: string;          // HKO statement code：WRAIN / WTCSGNL / WTS / WL / WMSGNL / WHOT / WCOLD / WFROST / WFIRE / WFNTSA / WTMW
  code: string;         // 子代碼：WRAINA / TC3 / TC8NE / WFIRER …
  name: string;         // 天文台中文名稱（rule 對唔到時 fallback 顯示）
  issueTime?: string;
  updateTime?: string;
  actionCode?: string;
}

export interface WeatherRule {
  id: string;
  label: string;                 // 對照表左欄
  short: string;                 // 徽章用短名
  emoji: string;
  severity: number;              // 排序用：大＝嚴重
  verdict: Record<ActivityKind, Verdict>;
  note: Record<ActivityKind, string>;   // 表一原文精簡
  match: (w: ActiveWarning) => boolean;
  demo: ActiveWarning;           // 模擬用（無警告時可試按）
}

const V = (indoor: Verdict, outdoor: Verdict, sea: Verdict) => ({ indoor, outdoor, sea });

const STAY = '確保參加者留在安全地方，直至警告解除';

export const WEATHER_RULES: WeatherRule[] = [
  {
    id: 'tc8', label: '8 號烈風／暴風或更高信號', short: '8 號或以上', emoji: '🌀', severity: 100,
    verdict: V('cancel', 'cancel', 'cancel'),
    note: { indoor: `延期或取消；${STAY}`, outdoor: `延期或取消；${STAY}`, sea: `延期或取消；${STAY}` },
    match: w => w.key === 'WTCSGNL' && /^TC(8|9|10)/i.test(w.code),
    demo: { key: 'WTCSGNL', code: 'TC8NE', name: '八號東北烈風或暴風信號' },
  },
  {
    id: 'rainBlack', label: '黑色暴雨警告', short: '黑雨', emoji: '⚫', severity: 95,
    verdict: V('cancel', 'cancel', 'cancel'),
    note: { indoor: `延期或取消；${STAY}`, outdoor: `延期或取消；${STAY}`, sea: `延期或取消；${STAY}` },
    match: w => w.key === 'WRAIN' && /B$/i.test(w.code),
    demo: { key: 'WRAIN', code: 'WRAINB', name: '黑色暴雨警告信號' },
  },
  {
    id: 'tsunami', label: '海嘯警告', short: '海嘯', emoji: '🌊', severity: 94,
    verdict: V('caution', 'cancel', 'cancel'),
    note: { indoor: '遠離岸邊低窪地區；留意天文台指示', outdoor: '遠離海岸；沿岸活動取消', sea: '立即取消，上岸到高地' },
    match: w => w.key === 'WTMW',
    demo: { key: 'WTMW', code: 'WTMW', name: '海嘯警告' },
  },
  {
    id: 'tc3', label: '3 號強風信號', short: '3 號風球', emoji: '🌀', severity: 80,
    verdict: V('go', 'cancel', 'cancel'),
    note: { indoor: '如常進行', outdoor: '延期或取消', sea: '延期或取消' },
    match: w => w.key === 'WTCSGNL' && /^TC3/i.test(w.code),
    demo: { key: 'WTCSGNL', code: 'TC3', name: '三號強風信號' },
  },
  {
    id: 'rainRed', label: '紅色暴雨警告', short: '紅雨', emoji: '🔴', severity: 75,
    verdict: V('go', 'cancel', 'cancel'),
    note: { indoor: `如常進行；${STAY}`, outdoor: `延期或取消；${STAY}`, sea: `延期或取消；${STAY}` },
    match: w => w.key === 'WRAIN' && /R$/i.test(w.code),
    demo: { key: 'WRAIN', code: 'WRAINR', name: '紅色暴雨警告信號' },
  },
  {
    id: 'thunder', label: '雷暴警告', short: '雷暴', emoji: '⛈️', severity: 70,
    verdict: V('go', 'cancel', 'cancel'),
    note: { indoor: '如常進行', outdoor: `延期或取消；${STAY}（離開開闊地、山頂、水邊、高樹及金屬物）`, sea: `延期或取消；${STAY}` },
    match: w => w.key === 'WTS',
    demo: { key: 'WTS', code: 'WTS', name: '雷暴警告' },
  },
  {
    id: 'rainAmber', label: '黃色暴雨警告', short: '黃雨', emoji: '🟡', severity: 55,
    verdict: V('go', 'caution', 'cancel'),
    note: { indoor: '如常進行', outdoor: '可繼續，但領袖應安排參加者於戶內暫避；情況轉壞即改期', sea: `延期或取消；${STAY}` },
    match: w => w.key === 'WRAIN' && /A$/i.test(w.code),
    demo: { key: 'WRAIN', code: 'WRAINA', name: '黃色暴雨警告信號' },
  },
  {
    id: 'landslip', label: '山泥傾瀉警告', short: '山泥傾瀉', emoji: '⛰️', severity: 50,
    verdict: V('go', 'caution', 'caution'),
    note: { indoor: '如常進行', outdoor: '密切留意活動地點安全，遠離斜坡、河道；如有需要於戶內暫避或離開', sea: '留意岸邊斜坡；如有需要暫避或離開' },
    match: w => w.key === 'WL',
    demo: { key: 'WL', code: 'WL', name: '山泥傾瀉警告' },
  },
  {
    id: 'tc1', label: '1 號戒備信號', short: '1 號風球', emoji: '🌀', severity: 45,
    verdict: V('go', 'caution', 'cancel'),
    note: { indoor: '如常進行', outdoor: '如常進行；密切留意天氣變化，如有需要安排參加者於戶內暫避', sea: '延期或取消' },
    match: w => w.key === 'WTCSGNL' && /^TC1\b/i.test(w.code),
    demo: { key: 'WTCSGNL', code: 'TC1', name: '一號戒備信號' },
  },
  {
    id: 'monsoon', label: '強烈季候風信號', short: '強烈季候風', emoji: '💨', severity: 44,
    verdict: V('go', 'caution', 'cancel'),
    note: { indoor: '如常進行', outdoor: '如常進行；密切留意天氣變化，如有需要安排參加者於戶內暫避', sea: '延期或取消' },
    match: w => w.key === 'WMSGNL',
    demo: { key: 'WMSGNL', code: 'WMSGNL', name: '強烈季候風信號' },
  },
  {
    id: 'flood', label: '新界北部水浸特別報告', short: '新界北水浸', emoji: '🌊', severity: 40,
    verdict: V('go', 'caution', 'caution'),
    note: { indoor: '如常進行', outdoor: '新界北部低窪地區活動：遠離河道，如有需要暫避或改期', sea: '留意河口水流，如有需要取消' },
    match: w => w.key === 'WFNTSA',
    demo: { key: 'WFNTSA', code: 'WFNTSA', name: '新界北部水浸特別報告' },
  },
  {
    id: 'hot', label: '酷熱天氣警告', short: '酷熱', emoji: '🌡️', severity: 30,
    verdict: V('go', 'caution', 'caution'),
    note: { indoor: '如常進行', outdoor: '提醒多補充水份、避免曝曬；如有需要改於戶內進行', sea: '多補水、避曬、留意中暑徵狀' },
    match: w => w.key === 'WHOT',
    demo: { key: 'WHOT', code: 'WHOT', name: '酷熱天氣警告' },
  },
  {
    id: 'cold', label: '寒冷天氣警告', short: '寒冷', emoji: '🥶', severity: 28,
    verdict: V('go', 'caution', 'caution'),
    note: { indoor: '如常進行', outdoor: '確保有足夠保暖衣物；如有需要改於戶內進行', sea: '保暖、避免長時間落水；如有需要取消' },
    match: w => w.key === 'WCOLD',
    demo: { key: 'WCOLD', code: 'WCOLD', name: '寒冷天氣警告' },
  },
  {
    id: 'frost', label: '霜凍警告', short: '霜凍', emoji: '❄️', severity: 27,
    verdict: V('go', 'caution', 'caution'),
    note: { indoor: '如常進行', outdoor: '確保有足夠保暖衣物；如有需要改於戶內進行', sea: '保暖；如有需要取消' },
    match: w => w.key === 'WFROST',
    demo: { key: 'WFROST', code: 'WFROST', name: '霜凍警告' },
  },
  {
    id: 'fireRed', label: '紅色火災危險警告', short: '紅色火警', emoji: '🔥', severity: 26,
    verdict: V('go', 'caution', 'go'),
    note: { indoor: '如常進行', outdoor: '露營／野炊：食乾糧、煲滾水，不可生明火；通知附近警署（露營指引）', sea: '如常進行' },
    match: w => w.key === 'WFIRE' && /R$/i.test(w.code),
    demo: { key: 'WFIRE', code: 'WFIRER', name: '紅色火災危險警告' },
  },
  {
    id: 'fireYellow', label: '黃色火災危險警告', short: '黃色火警', emoji: '🔥', severity: 20,
    verdict: V('go', 'caution', 'go'),
    note: { indoor: '如常進行', outdoor: '生火煮食格外小心，備妥滅火用水；留意營地規定', sea: '如常進行' },
    match: w => w.key === 'WFIRE' && /Y$/i.test(w.code),
    demo: { key: 'WFIRE', code: 'WFIREY', name: '黃色火災危險警告' },
  },
];

/** 空氣質素健康指數（AQHI）— 04/2018 表一（環保署 aqhi.gov.hk；HKO API 冇提供，需人手選） */
export const AQHI_RULES: { id: string; label: string; verdict: Record<ActivityKind, Verdict>; note: string }[] = [
  { id: 'aqhi7', label: 'AQHI 7（高）', verdict: V('go', 'caution', 'caution'), note: '減少體力消耗及戶外活動；勸喻心臟病／呼吸系統病患者不要參加' },
  { id: 'aqhi8', label: 'AQHI 8–10（甚高）', verdict: V('go', 'caution', 'caution'), note: '盡量減少體力消耗及戶外活動；勸喻敏感人士不要參加' },
  { id: 'aqhi10', label: 'AQHI 10+（嚴重）', verdict: V('go', 'cancel', 'cancel'), note: '在空氣污染地區進行嘅活動應中止、取消或延期' },
];

export const VERDICT_LABEL: Record<Verdict, string> = { go: '如常進行', caution: '可進行 · 要留意', cancel: '延期／取消' };
export const VERDICT_EMOJI: Record<Verdict, string> = { go: '✅', caution: '⚠️', cancel: '⛔' };
const RANK: Record<Verdict, number> = { go: 0, caution: 1, cancel: 2 };

export function worst(a: Verdict, b: Verdict): Verdict { return RANK[a] >= RANK[b] ? a : b; }

/** warnsum JSON → ActiveWarning[]（已取消／未知結構會略過） */
export function parseWarnsum(raw: unknown): ActiveWarning[] {
  if (!raw || typeof raw !== 'object') return [];
  const out: ActiveWarning[] = [];
  Object.entries(raw as Record<string, unknown>).forEach(([key, val]) => {
    if (!val || typeof val !== 'object') return;
    const v = val as Record<string, unknown>;
    const action = String(v.actionCode || '').toUpperCase();
    if (action === 'CANCEL') return;
    out.push({
      key: key.toUpperCase(),
      code: String(v.code || key).toUpperCase(),
      name: String(v.name || key),
      issueTime: v.issueTime ? String(v.issueTime) : undefined,
      updateTime: v.updateTime ? String(v.updateTime) : undefined,
      actionCode: action || undefined,
    });
  });
  return out;
}

export interface MatchedWarning { warning: ActiveWarning; rule: WeatherRule | null }

/** 對照規則；同一類（如 WTCSGNL）只會有一個生效碼 */
export function matchRules(warnings: ActiveWarning[]): MatchedWarning[] {
  return warnings
    .map(w => ({ warning: w, rule: WEATHER_RULES.find(r => r.match(w)) || null }))
    .sort((a, b) => (b.rule?.severity || 0) - (a.rule?.severity || 0));
}

export interface Decision {
  verdict: Verdict;
  headline: string;         // 一句話結論
  reasons: { emoji: string; label: string; note: string; verdict: Verdict }[];
  unknown: ActiveWarning[]; // 對唔到規則嘅警告（照列出嚟）
}

/** 對某類活動嘅最終結論 = 所有生效警告中最嚴重嘅一個 */
export function decide(matched: MatchedWarning[], kind: ActivityKind, aqhiId?: string): Decision {
  let verdict: Verdict = 'go';
  const reasons: Decision['reasons'] = [];
  const unknown: ActiveWarning[] = [];
  matched.forEach(({ warning, rule }) => {
    if (!rule) { unknown.push(warning); return; }
    const v = rule.verdict[kind];
    verdict = worst(verdict, v);
    reasons.push({ emoji: rule.emoji, label: rule.label, note: rule.note[kind], verdict: v });
  });
  const aq = AQHI_RULES.find(a => a.id === aqhiId);
  if (aq) {
    const v = aq.verdict[kind];
    verdict = worst(verdict, v);
    reasons.push({ emoji: '😷', label: aq.label, note: kind === 'indoor' ? '如常進行' : aq.note, verdict: v });
  }
  reasons.sort((a, b) => RANK[b.verdict] - RANK[a.verdict]);
  const kindLabel = ACTIVITY_KINDS.find(k => k.id === kind)?.label || '';
  const headline =
    verdict === 'cancel' ? `${kindLabel}：應延期或取消` :
    verdict === 'caution' ? `${kindLabel}：可以進行，但要按下列要求處理` :
    matched.length || aq ? `${kindLabel}：如常進行` : `${kindLabel}：現時冇警告生效，如常進行`;
  return { verdict, headline, reasons, unknown };
}

export const HKO_WARNSUM_URL = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc';
export const HKO_WARNING_PAGE = 'https://www.hko.gov.hk/tc/wxinfo/dailywx/warning.htm';
export const AQHI_PAGE = 'https://www.aqhi.gov.hk/tc.html';

/** 由瀏覽器直接取天文台開放數據（公開、允許跨域）；失敗會 throw */
export async function fetchWarnsum(signal?: AbortSignal): Promise<ActiveWarning[]> {
  const res = await fetch(`${HKO_WARNSUM_URL}&_=${Date.now()}`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`HKO ${res.status}`);
  return parseWarnsum(await res.json());
}

/** 主控台橫額用：一句總結（以最嚴重規則計；戶外為準） */
export function summarize(matched: MatchedWarning[]): { verdict: Verdict; text: string } {
  const top = matched.find(m => m.rule);
  if (!top || !top.rule) {
    return matched.length
      ? { verdict: 'caution', text: `天文台現有 ${matched.length} 項警告生效，請查看詳情` }
      : { verdict: 'go', text: '天文台現時冇警告生效' };
  }
  const outdoor = decide(matched, 'outdoor');
  const sea = decide(matched, 'sea');
  const parts = [`戶外${VERDICT_EMOJI[outdoor.verdict]}${VERDICT_LABEL[outdoor.verdict]}`, `海上${VERDICT_EMOJI[sea.verdict]}${VERDICT_LABEL[sea.verdict]}`];
  const indoor = decide(matched, 'indoor');
  if (indoor.verdict !== 'go') parts.unshift(`戶內${VERDICT_EMOJI[indoor.verdict]}${VERDICT_LABEL[indoor.verdict]}`);
  return { verdict: worst(outdoor.verdict, indoor.verdict), text: `${top.rule.emoji} ${top.rule.short}生效 → ${parts.join('　')}` };
}
