/**
 * 🎪 港島童軍繽紛日 2026 — 籌備會議 + 執行手冊資料
 * ─────────────────────────────────────────────────────────────────────
 * 呢個檔係「繽紛日專頁（/fun-day）」嘅單一資料來源：
 *   - 之後開第 6、7…次會議，或者會議文件齊咗，直接喺 FUN_DAY_MEETINGS 加／改
 *   - 執行手冊有新文件（例如大會急救計劃 PDF 上載咗），喺 FUN_DAY_MANUAL 填 url
 * 改完 push，Vercel 自動部署，前端即時更新（唔使改 Apps Script 後台）。
 */

export const FUN_DAY_NAME = '港島童軍繽紛日2026';

export interface FunDayDoc {
  title: string;
  /** 有連結填 url；未有文件留空 url 並設 pending，頁面會顯示「⏳ 待上載」 */
  url?: string;
  ref?: string;
  note?: string;
  pending?: boolean;
}

export interface FunDayMeeting {
  no: number;
  /** 展示用日期（例如「2026年9月14日（星期一）」）；未定填「日期待定」 */
  dateLabel: string;
  /** ISO 日期（YYYY-MM-DD），用嚟判斷「下一次會議」；未定留空字串 */
  dateISO: string;
  timeLabel: string;
  venue: string;
  /** 對應地域房間編號（例如 '1704'），有就自動出現「查房間使用情況」連結 */
  venueRoomId?: string;
  /** ICS 日曆檔用（+08:00 香港時間）；未定留空 */
  startISO?: string;
  endISO?: string;
  endNote?: string;
  /** 會議文件未齊時嘅提示（例如「會議文件稍後附上」） */
  docsNote?: string;
  docs: FunDayDoc[];
}

export const FUN_DAY_MEETINGS: FunDayMeeting[] = [
  {
    no: 1,
    dateLabel: '日期待補',
    dateISO: '',
    timeLabel: '時間待補',
    venue: '地點待補',
    docsNote: '第 1 次籌備會議資料待補（如有會議記錄連結可加到呢度）。',
    docs: [],
  },
  {
    no: 2,
    dateLabel: '日期待補',
    dateISO: '',
    timeLabel: '時間待補',
    venue: '地點待補',
    docsNote: '第 2 次籌備會議資料待補。',
    docs: [],
  },
  {
    no: 3,
    dateLabel: '日期待補',
    dateISO: '',
    timeLabel: '時間待補',
    venue: '地點待補',
    docsNote: '第 3 次籌備會議資料待補。',
    docs: [],
  },
  {
    no: 4,
    dateLabel: '日期待補',
    dateISO: '',
    timeLabel: '時間待補',
    venue: '地點待補',
    docsNote: '第 4 次籌備會議資料待補。',
    docs: [],
  },
  {
    no: 5,
    dateLabel: '2026年9月14日（星期一）',
    dateISO: '2026-09-14',
    timeLabel: '19:15 開始',
    venue: '百周年大樓1704室',
    venueRoomId: '1704',
    startISO: '2026-09-14T19:15:00+08:00',
    endISO: '2026-09-14T21:15:00+08:00',
    endNote: '結束時間暫定約 21:15，以大會通知為準',
    docsNote: '🙏🏻 敬請各位預留時間出席。會議文件稍後附上。',
    docs: [],
  },
];

/** 搵「下一次」籌備會議（有日期＋未過期嗰次，愈近愈先） */
export function nextFunDayMeeting(now = Date.now()): FunDayMeeting | null {
  const upcoming = FUN_DAY_MEETINGS
    .filter((m) => m.dateISO && new Date(`${m.dateISO}T23:59:59+08:00`).getTime() >= now)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  return upcoming[0] || null;
}

export function meetingTitle(m: FunDayMeeting): string {
  return `${FUN_DAY_NAME} — 第${m.no}次籌備會議`;
}

/** 會議詳情文字（「複製開會通知」用） */
export function meetingNoticeText(m: FunDayMeeting): string {
  const lines = [
    '溫馨提示：',
    '',
    meetingTitle(m),
    '',
    `日期：${m.dateLabel}`,
    `時間：${m.timeLabel}`,
    `地點：${m.venue}`,
    '',
    m.docsNote || '',
  ];
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function icsDate(iso: string): string {
  // '2026-09-14T19:15:00+08:00' → '20260914T111500Z'
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`
  );
}

const icsEscape = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** 產生單次會議嘅 .ics 日曆檔內容（下載後手機／Outlook 可直接加入行事曆） */
export function meetingIcs(m: FunDayMeeting): string | null {
  if (!m.startISO || !m.endISO) return null;
  const now = icsDate(new Date().toISOString());
  const desc = [m.docsNote, m.endNote].filter(Boolean).join('\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SKWSCOUT//FunDay2026//HK',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:funday2026-meeting${m.no}@skwscout`,
    `DTSTAMP:${now}`,
    `DTSTART:${icsDate(m.startISO)}`,
    `DTEND:${icsDate(m.endISO)}`,
    `SUMMARY:${icsEscape(meetingTitle(m))}`,
    `LOCATION:${icsEscape(m.venue)}`,
    ...(desc ? [`DESCRIPTION:${icsEscape(desc)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

// ───────────────────────── 執行手冊 ─────────────────────────

export interface ManualSection {
  id: string;
  icon: string;
  title: string;
  desc?: string;
  docs: FunDayDoc[];
  /** 站內連結（例如連去意外／應變、房間頁） */
  link?: { label: string; href: string };
}

export const FUN_DAY_MANUAL: ManualSection[] = [
  {
    id: 'firstaid',
    icon: '⛑️',
    title: '急救文件',
    desc: '大會急救安排相關文件：總會表格＋大會當日急救計劃（大會文件齊咗會陸續上載）。',
    docs: [
      {
        title: '急救服務申請表',
        ref: 'FAT/01 (2025/03)',
        url: 'https://www.scout.org.hk/uploads/tc/forms/12001/FAT01_FirstAidServiceForm_202503.pdf',
        note: '總會官方表格：向總會／有關單位申請急救服務用',
      },
      {
        title: '大會急救站位置圖及當值安排',
        note: '大會文件：急救站位置、當值人員及聯絡方法',
        pending: true,
      },
      {
        title: '大會當日急救及送院流程',
        note: '大會文件：由召喚急救 → 陪同送院 → 通報嘅分工流程',
        pending: true,
      },
      {
        title: '意外報告（行政署，2019 年 7 月版）— 中文',
        ref: 'ACC-RPT 2019/07',
        url: 'https://www.scout.org.hk/article_attach/631/ACC-RPT201907c.pdf',
        note: '如活動期間發生意外，7 個工作天內經單位主管交總會行政署；本平台可直接填寫',
      },
      {
        title: '公眾責任保險及團體人身意外保險（2025/26）',
        ref: '行政通告 07/2025',
        url: 'https://www.scout.org.hk/uploads/editor/department_page/acr072025c_%E5%85%AC%E7%9C%BE%E8%B2%AC%E4%BB%BB%E4%BF%9D%E9%9A%AA%E5%8F%8A%E5%9C%98%E9%AB%94%E4%BA%BA%E8%BA%AB%E6%84%8F%E5%A4%96%E4%BF%9D%E9%9A%AA.pdf',
        note: '索償程序、保額、7 個工作天通知期',
      },
    ],
    link: { label: '🚨 開啟「意外／應變」即時應變卡', href: '/incident?tab=now' },
  },
  {
    id: 'weather',
    icon: '🌦',
    title: '惡劣天氣安排',
    desc: '活動當日如遇惡劣天氣，按活動指引通告 04/2018 決定照常／暫避／取消。',
    docs: [
      {
        title: '惡劣天氣及空氣污染下舉行活動指引',
        ref: '活動指引通告 04/2018',
        url: 'https://www.scout.org.hk/article_attach/29308/AG042018C.pdf',
        note: '天氣警告對照表出處',
      },
    ],
    link: { label: '🌦 開啟天氣決策（即時警告）', href: '/incident?tab=weather' },
  },
  {
    id: 'ops',
    icon: '📋',
    title: '大會流程及崗位分工',
    desc: '大會當日流程、崗位表、場地圖等，文件齊咗會陸續上載。',
    docs: [
      { title: '大會流程及時間表', note: '大會文件', pending: true },
      { title: '崗位分工及聯絡表', note: '大會文件', pending: true },
      { title: '場地平面圖', note: '大會文件', pending: true },
    ],
  },
];
