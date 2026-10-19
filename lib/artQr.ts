/**
 * 藝術 QR 工作室 — 向量繪圖引擎（v4.19.0）
 * ═══════════════════════════════════════════════════════════════
 * 將普通 QR 變成「區章／燈塔」風格：
 *   - QR 用 H 級錯誤修正（30% 容錯），中央徽章最多蓋住約 5% 面積
 *   - 找尋圖案（三個角）用圓角「眼」重畫，保留 1:1:3:1:1 比例
 *   - 背景加光束、海浪、羅盤、百合花水印（全部淺色，不影響黑白對比）
 *   - 中央徽章：燈塔／百合花／羅盤／錨
 *   - 外框：香港童軍總會 · 區名 + 英文區名 + 底部 caption
 *
 * 全部用 Canvas 2D 畫，1600px 或 3200px 輸出都清晰；
 * 同一個 function 亦可以喺 Node（@napi-rs/canvas）行，方便出樣板。
 */
import qrcode from 'qrcode-generator';

// qrcode-generator 預設用 latin-1；轉做 UTF-8，中文網址／文字先唔會爛。
type QrFactory = typeof qrcode & {
  stringToBytesFuncs?: Record<string, (s: string) => number[]>;
  stringToBytes?: (s: string) => number[];
};
const qrFactory = qrcode as QrFactory;
if (qrFactory.stringToBytesFuncs && qrFactory.stringToBytesFuncs['UTF-8']) {
  qrFactory.stringToBytes = qrFactory.stringToBytesFuncs['UTF-8'];
}

export type ArtQrTemplate = 'lighthouse' | 'badge' | 'fleur' | 'minimal';
export type ArtQrPalette = 'harbour' | 'scout' | 'sunset' | 'ink';
export type ArtQrModuleStyle = 'rounded' | 'dot' | 'diamond' | 'square';
export type ArtQrEmblem = 'auto' | 'lighthouse' | 'fleur' | 'compass' | 'anchor';

export interface ArtQrOptions {
  text: string;
  brandZh: string;
  brandEn: string;
  caption: string;
  template: ArtQrTemplate;
  palette: ArtQrPalette;
  moduleStyle: ArtQrModuleStyle;
  emblem: ArtQrEmblem;
  /** 中央徽章直徑 ÷ QR 邊長，建議 0.14–0.24 */
  logoScale: number;
  /** 自訂徽章圖（例如區章 PNG／JPG／SVG）。有圖時會蓋過 emblem 選擇。 */
  logoImage?: CanvasImageSource | null;
  /** 背景圖案強度 0–1 */
  artStrength: number;
}

interface Palette {
  paper: string;
  paper2: string;
  plate: string;
  ink: string;
  ink2: string;
  accent: string;
  accentText: string;
  sea: string;
  soft: string;
}

export const ART_PALETTES: Record<ArtQrPalette, Palette> = {
  harbour: {
    paper: '#f7f0dd', paper2: '#efe4c9', plate: '#fffdf7',
    ink: '#0a2a47', ink2: '#124568',
    accent: '#c9a24a', accentText: '#7d5a12', sea: '#6fa8bd', soft: '#dfe7e5',
  },
  scout: {
    paper: '#f4f0df', paper2: '#e9e2c8', plate: '#fffef8',
    ink: '#153d25', ink2: '#245c34',
    accent: '#b8892f', accentText: '#6d4f12', sea: '#7fa586', soft: '#dfe6d8',
  },
  sunset: {
    paper: '#fbeadb', paper2: '#f4dcc6', plate: '#fffdf9',
    ink: '#3c1d2b', ink2: '#5d2f36',
    accent: '#cf8a3e', accentText: '#7a4a12', sea: '#c47a58', soft: '#eed9c9',
  },
  ink: {
    paper: '#ffffff', paper2: '#f4f4f4', plate: '#ffffff',
    ink: '#111111', ink2: '#2b2b2b',
    accent: '#5b5b5b', accentText: '#333333', sea: '#8a8a8a', soft: '#e5e5e5',
  },
};

export const ART_TEMPLATES: { id: ArtQrTemplate; name: string; hint: string }[] = [
  { id: 'lighthouse', name: '海岸燈塔', hint: '光束 × 海浪 × 燈塔徽章' },
  { id: 'badge', name: '區章', hint: '羅盤線 × 縫線圈 × 羅盤徽章' },
  { id: 'fleur', name: '百合花', hint: '童軍百合花水印 × 星點' },
  { id: 'minimal', name: '簡約', hint: '乾淨底 × 細徽章，最易掃' },
];

export const ART_PALETTE_LIST: { id: ArtQrPalette; name: string; dots: string[] }[] = [
  { id: 'harbour', name: '海港藍金', dots: ['#0a2a47', '#c9a24a', '#f7f0dd'] },
  { id: 'scout', name: '童軍綠', dots: ['#153d25', '#b8892f', '#f4f0df'] },
  { id: 'sunset', name: '日落紅', dots: ['#3c1d2b', '#cf8a3e', '#fbeadb'] },
  { id: 'ink', name: '單色印刷', dots: ['#111111', '#5b5b5b', '#ffffff'] },
];

export const ART_MODULE_STYLES: { id: ArtQrModuleStyle; name: string }[] = [
  { id: 'rounded', name: '圓角方塊' },
  { id: 'dot', name: '圓點' },
  { id: 'diamond', name: '菱形' },
  { id: 'square', name: '實心方塊' },
];

export const ART_EMBLEMS: { id: ArtQrEmblem; name: string }[] = [
  { id: 'auto', name: '跟主題' },
  { id: 'lighthouse', name: '燈塔' },
  { id: 'fleur', name: '百合花' },
  { id: 'compass', name: '羅盤' },
  { id: 'anchor', name: '船錨' },
];

export function defaultEmblemFor(template: ArtQrTemplate): Exclude<ArtQrEmblem, 'auto'> {
  if (template === 'lighthouse') return 'lighthouse';
  if (template === 'badge') return 'compass';
  return 'fleur';
}

// ── 版面常數（以 1000 × 1000 設計單位畫，再整體縮放）────────────────
const D = 1000;
const PLATE_X = 120;
const PLATE_Y = 130;
const PLATE_SIZE = 760;
const QR_X = 180;
const QR_Y = 190;
const QR_SIZE = 640;
const CX = QR_X + QR_SIZE / 2;
const CY = QR_Y + QR_SIZE / 2;
const CAPTION_Y = 928;
const FOOTER_Y = 966;

const FONT_ZH = '"PingFang HK", "Microsoft JhengHei", "Noto Sans TC", "Noto Sans CJK TC", system-ui, sans-serif';
const FONT_EN = '"Avenir Next", "Helvetica Neue", Arial, "PingFang HK", "Microsoft JhengHei", system-ui, sans-serif';

// ── 小工具 ───────────────────────────────────────────────────────
function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

function appendRR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function rrPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  appendRR(ctx, x, y, w, h, r);
}

function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

function trackedText(
  ctx: CanvasRenderingContext2D, text: string, cx: number, y: number,
  spacing: number, font: string, color: string,
) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const chars = Array.from(text);
  const widths = chars.map(c => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  let x = cx - total / 2;
  chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + spacing; });
}

function fitFont(
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number,
  build: (px: number) => string, startPx: number, minPx: number,
): string {
  let px = startPx;
  while (px > minPx) {
    ctx.font = build(px);
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 1;
  }
  return build(px);
}

// ── QR 矩陣 ─────────────────────────────────────────────────────
export interface QrMatrix {
  count: number;
  isDark: (row: number, col: number) => boolean;
}

export function buildQrMatrix(text: string): QrMatrix {
  const qr = qrcode(0, 'H'); // H = 30% 容錯，夠位放中央徽章
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  return { count, isDark: (row, col) => qr.isDark(row, col) };
}

// ── 主繪圖函式 ──────────────────────────────────────────────────
export function drawArtQr(ctx: CanvasRenderingContext2D, px: number, opts: ArtQrOptions) {
  const pal = ART_PALETTES[opts.palette] || ART_PALETTES.harbour;
  const scale = px / D;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawBackground(ctx, pal);
  drawHeader(ctx, pal, opts);
  drawPlate(ctx, pal, opts);
  drawBackdrop(ctx, pal, opts);
  drawQr(ctx, pal, opts);
  drawMedallion(ctx, pal, opts);
  drawCaption(ctx, pal, opts);

  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, pal: Palette) {
  const g = ctx.createLinearGradient(0, 0, 0, D);
  g.addColorStop(0, pal.paper);
  g.addColorStop(0.55, pal.paper);
  g.addColorStop(1, pal.paper2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, D, D);

  // 四角細金線，似證書／布章底
  const g2 = ctx.createRadialGradient(CX, CY, 180, CX, CY, 620);
  g2.addColorStop(0, alpha(pal.accent, 0.055));
  g2.addColorStop(1, alpha(pal.accent, 0));
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, D, D);
}

function drawHeader(ctx: CanvasRenderingContext2D, pal: Palette, o: ArtQrOptions) {
  const title = o.brandZh || '筲箕灣區';
  const sub = o.brandEn || 'SHAU KEI WAN DISTRICT · HONG KONG SCOUTS';

  const titleFont = fitFont(ctx, title, 560, px => `800 ${px}px ${FONT_ZH}`, 34, 22);
  ctx.font = titleFont;
  ctx.fillStyle = pal.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, CX, 62);

  const half = ctx.measureText(title).width / 2;
  // 兩側細線 + 小菱形
  ctx.strokeStyle = alpha(pal.accent, 0.65);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(CX - half - 62, 62); ctx.lineTo(CX - half - 24, 62);
  ctx.moveTo(CX + half + 24, 62); ctx.lineTo(CX + half + 62, 62);
  ctx.stroke();
  ctx.fillStyle = pal.accent;
  diamondPath(ctx, CX - half - 16, 62, 4); ctx.fill();
  diamondPath(ctx, CX + half + 16, 62, 4); ctx.fill();

  trackedText(ctx, sub, CX, 96, 3.1, `600 11.5px ${FONT_EN}`, pal.accentText);
}

function drawPlate(ctx: CanvasRenderingContext2D, pal: Palette, o: ArtQrOptions) {
  // 外細框
  rrPath(ctx, PLATE_X - 14, PLATE_Y - 14, PLATE_SIZE + 28, PLATE_SIZE + 28, 60);
  ctx.strokeStyle = alpha(pal.accent, 0.55);
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // 四角金菱形
  const corners: [number, number][] = [
    [PLATE_X - 14, PLATE_Y - 14], [PLATE_X + PLATE_SIZE + 14, PLATE_Y - 14],
    [PLATE_X - 14, PLATE_Y + PLATE_SIZE + 14], [PLATE_X + PLATE_SIZE + 14, PLATE_Y + PLATE_SIZE + 14],
  ];
  ctx.fillStyle = pal.accent;
  corners.forEach(([x, y]) => { diamondPath(ctx, x, y, 5.5); ctx.fill(); });

  // 主底版
  rrPath(ctx, PLATE_X, PLATE_Y, PLATE_SIZE, PLATE_SIZE, 46);
  ctx.fillStyle = pal.plate;
  ctx.fill();
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // 內框線
  rrPath(ctx, PLATE_X + 9, PLATE_Y + 9, PLATE_SIZE - 18, PLATE_SIZE - 18, 39);
  ctx.strokeStyle = alpha(pal.accent, 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();

  // 簡約版：四邊細刻度
  if (o.template === 'minimal') {
    ctx.strokeStyle = alpha(pal.ink, 0.22);
    ctx.lineWidth = 1;
    const tick = 6;
    [[CX, PLATE_Y + 9], [CX, PLATE_Y + PLATE_SIZE - 9]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.moveTo(x - tick, y); ctx.lineTo(x + tick, y); ctx.stroke();
    });
    [[PLATE_X + 9, CY], [PLATE_X + PLATE_SIZE - 9, CY]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.moveTo(x, y - tick); ctx.lineTo(x, y + tick); ctx.stroke();
    });
  }
}

function drawBackdrop(ctx: CanvasRenderingContext2D, pal: Palette, o: ArtQrOptions) {
  const s = Math.max(0, Math.min(1, o.artStrength));
  if (s <= 0.01) return;

  ctx.save();
  rrPath(ctx, PLATE_X, PLATE_Y, PLATE_SIZE, PLATE_SIZE, 46);
  ctx.clip();

  // 所有主題都有一層柔光
  const glow = ctx.createRadialGradient(CX, CY - 70, 20, CX, CY - 70, 340);
  glow.addColorStop(0, alpha(pal.accent, 0.13 * s));
  glow.addColorStop(1, alpha(pal.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(PLATE_X, PLATE_Y, PLATE_SIZE, PLATE_SIZE);

  if (o.template === 'lighthouse') {
    drawBeams(ctx, pal, s, 0.24);
    drawWaves(ctx, pal, s);
    drawStars(ctx, pal, s, 0.45);
  } else if (o.template === 'badge') {
    drawCompassBackdrop(ctx, pal, s);
    drawRopeRing(ctx, pal, s);
    drawStars(ctx, pal, s, 0.35);
  } else if (o.template === 'fleur') {
    // 大百合花水印（只佔 QR 底層，唔影響深色模組）
    ctx.save();
    ctx.globalAlpha = 0.055 * s;
    drawEmblem(ctx, 'fleur', pal, CX, CY + 10, 590);
    ctx.restore();
    drawStars(ctx, pal, s, 0.65);
  } else {
    drawStars(ctx, pal, s, 0.14);
  }

  // QR 靜區加一層薄白紗：背景圖案變得更淡，但保留質感
  ctx.fillStyle = alpha(pal.plate, 0.45);
  ctx.fillRect(QR_X - 26, QR_Y - 26, QR_SIZE + 52, QR_SIZE + 52);

  ctx.restore();
}

function drawBeams(ctx: CanvasRenderingContext2D, pal: Palette, s: number, strength: number) {
  const beams: [number, number][] = [[-2.62, 0.20], [-0.52, 0.20]];
  beams.forEach(([angle, spread]) => {
    const len = 640;
    const x1 = CX + Math.cos(angle - spread) * len;
    const y1 = CY + Math.sin(angle - spread) * len;
    const x2 = CX + Math.cos(angle + spread) * len;
    const y2 = CY + Math.sin(angle + spread) * len;
    const g = ctx.createLinearGradient(CX, CY, CX + Math.cos(angle) * len, CY + Math.sin(angle) * len);
    g.addColorStop(0, alpha(pal.accent, 0.34 * s * strength / 0.24));
    g.addColorStop(0.55, alpha(pal.accent, 0.12 * s * strength / 0.24));
    g.addColorStop(1, alpha(pal.accent, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fill();
  });
}

function drawWaves(ctx: CanvasRenderingContext2D, pal: Palette, s: number) {
  for (let i = 0; i < 3; i++) {
    const y = 792 + i * 30;
    ctx.beginPath();
    ctx.moveTo(PLATE_X, y + 18);
    for (let x = PLATE_X; x <= PLATE_X + PLATE_SIZE; x += 60) {
      const wy = y + Math.sin((x + i * 47) / 58) * 9;
      ctx.lineTo(x, wy);
    }
    ctx.lineTo(PLATE_X + PLATE_SIZE, PLATE_Y + PLATE_SIZE);
    ctx.lineTo(PLATE_X, PLATE_Y + PLATE_SIZE);
    ctx.closePath();
    ctx.fillStyle = alpha(pal.sea, (0.10 + i * 0.055) * s);
    ctx.fill();
  }

  // 海平線
  ctx.strokeStyle = alpha(pal.sea, 0.4 * s);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(PLATE_X, 792);
  ctx.lineTo(PLATE_X + PLATE_SIZE, 792);
  ctx.stroke();
}

function drawCompassBackdrop(ctx: CanvasRenderingContext2D, pal: Palette, s: number) {
  const rings = [236, 292, 336];
  rings.forEach((r, i) => {
    ctx.strokeStyle = alpha(pal.ink, (i === 1 ? 0.075 : 0.045) * s);
    ctx.lineWidth = i === 1 ? 1.4 : 1;
    ctx.beginPath(); ctx.arc(CX, CY, r, 0, Math.PI * 2); ctx.stroke();
  });

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const inner = i % 4 === 0 ? 258 : 306;
    const outer = 336;
    ctx.strokeStyle = alpha(pal.ink, (i % 4 === 0 ? 0.13 : 0.06) * s);
    ctx.lineWidth = i % 4 === 0 ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * inner, CY + Math.sin(a) * inner);
    ctx.lineTo(CX + Math.cos(a) * outer, CY + Math.sin(a) * outer);
    ctx.stroke();
  }

  ctx.fillStyle = alpha(pal.accent, 0.75 * s);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
    diamondPath(ctx, CX + Math.cos(a) * 348, CY + Math.sin(a) * 348, 4.5);
    ctx.fill();
  }
}

function drawRopeRing(ctx: CanvasRenderingContext2D, pal: Palette, s: number) {
  ctx.save();
  ctx.strokeStyle = alpha(pal.accent, 0.5 * s);
  ctx.lineWidth = 2.2;
  ctx.setLineDash([2.5, 9]);
  ctx.beginPath();
  ctx.arc(CX, CY, 362, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 上下左右小結
  ctx.fillStyle = alpha(pal.accent, 0.8 * s);
  [[CX, CY - 362], [CX, CY + 362], [CX - 362, CY], [CX + 362, CY]].forEach(([x, y]) => {
    ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill();
  });
}

function drawStars(ctx: CanvasRenderingContext2D, pal: Palette, s: number, strength: number) {
  // 固定位置，輸出穩定（唔會每次 random 唔同）
  const stars: [number, number, number][] = [
    [206, 214, 4], [794, 206, 3], [194, 788, 3.4], [806, 806, 4.6],
    [236, 300, 2.4], [770, 300, 2.2], [300, 760, 2.6], [706, 742, 2.8],
    [176, 500, 2.2], [826, 520, 2.6], [500, 168, 2.4], [500, 852, 2.2],
  ];
  ctx.save();
  ctx.fillStyle = alpha(pal.accent, Math.min(1, 0.55 * s * (strength / 0.5)));
  stars.forEach(([x, y, r]) => {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.9);
    ctx.quadraticCurveTo(x, y, x + r * 1.9, y);
    ctx.quadraticCurveTo(x, y, x, y + r * 1.9);
    ctx.quadraticCurveTo(x, y, x - r * 1.9, y);
    ctx.quadraticCurveTo(x, y, x, y - r * 1.9);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

// ── QR 模組 ─────────────────────────────────────────────────────
function isFinderZone(r: number, c: number, count: number) {
  return (r < 7 && c < 7) || (r < 7 && c >= count - 7) || (r >= count - 7 && c < 7);
}

function drawQr(ctx: CanvasRenderingContext2D, pal: Palette, o: ArtQrOptions) {
  let matrix: QrMatrix;
  try {
    matrix = buildQrMatrix(o.text);
  } catch {
    // 內容太長：畫一個提示框，頁面亦會顯示錯誤
    ctx.fillStyle = alpha(pal.ink, 0.06);
    ctx.fillRect(QR_X, QR_Y, QR_SIZE, QR_SIZE);
    ctx.fillStyle = pal.ink;
    ctx.font = `700 26px ${FONT_ZH}`;
    ctx.textAlign = 'center';
    ctx.fillText('內容太長，未能生成 QR', CX, CY);
    return;
  }

  const { count } = matrix;
  const m = QR_SIZE / count;
  const medR = (QR_SIZE * o.logoScale) / 2;
  const style = o.moduleStyle;

  const grad = ctx.createLinearGradient(0, QR_Y, 0, QR_Y + QR_SIZE);
  grad.addColorStop(0, pal.ink);
  grad.addColorStop(0.55, pal.ink);
  grad.addColorStop(1, pal.ink2);

  // 一個 path 畫晒所有模組，fill 一次（快 + 邊緣一致）
  ctx.beginPath();
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!matrix.isDark(r, c)) continue;
      if (isFinderZone(r, c, count)) continue;
      const x = QR_X + c * m;
      const y = QR_Y + r * m;
      const centerX = x + m / 2;
      const centerY = y + m / 2;
      const dx = centerX - CX;
      const dy = centerY - CY;
      if (dx * dx + dy * dy < (medR + m * 0.55) ** 2) continue; // 中央徽章位留白

      const isTiming = (r === 6 || c === 6);
      if (isTiming || style === 'square') {
        ctx.rect(x, y, m, m);
      } else if (style === 'dot') {
        ctx.moveTo(centerX + m * 0.5, centerY);
        ctx.arc(centerX, centerY, m * 0.5, 0, Math.PI * 2);
        // 圓點之間補橋，令同一色塊保持連通（掃描器最重視連通性）
        if (r + 1 < count && matrix.isDark(r + 1, c) && !isFinderZone(r + 1, c, count)) {
          ctx.rect(centerX - m * 0.28, y + m * 0.5, m * 0.56, m);
        }
        if (c + 1 < count && matrix.isDark(r, c + 1) && !isFinderZone(r, c + 1, count)) {
          ctx.rect(x + m * 0.5, centerY - m * 0.28, m, m * 0.56);
        }
      } else if (style === 'diamond') {
        const inset = m * 0.02;
        ctx.moveTo(centerX, y + inset);
        ctx.lineTo(x + m - inset, centerY);
        ctx.lineTo(centerX, y + m - inset);
        ctx.lineTo(x + inset, centerY);
        ctx.closePath();
        if (r + 1 < count && matrix.isDark(r + 1, c) && !isFinderZone(r + 1, c, count)) {
          ctx.rect(centerX - m * 0.3, y + m * 0.5, m * 0.6, m);
        }
        if (c + 1 < count && matrix.isDark(r, c + 1) && !isFinderZone(r, c + 1, count)) {
          ctx.rect(x + m * 0.5, centerY - m * 0.3, m, m * 0.6);
        }
      } else {
        // rounded：留 4% 白邊，視覺上更透氣
        const inset = m * 0.045;
        appendRR(ctx, x + inset, y + inset, m - inset * 2, m - inset * 2, m * 0.3);
      }
    }
  }
  ctx.fillStyle = grad;
  ctx.fill();

  // 三個定位眼：圓角但保持 1:1:3:1:1
  const finders: [number, number][] = [[0, 0], [count - 7, 0], [0, count - 7]];
  ctx.strokeStyle = grad;
  ctx.fillStyle = grad;
  finders.forEach(([r, c]) => {
    const x = QR_X + c * m;
    const y = QR_Y + r * m;
    const radius = 2.15 * m;
    ctx.lineWidth = m;
    rrPath(ctx, x + m / 2, y + m / 2, m * 6, m * 6, radius);
    ctx.stroke();
    rrPath(ctx, x + m * 2, y + m * 2, m * 3, m * 3, m * 0.95);
    ctx.fill();
  });
}

// ── 中央徽章 ───────────────────────────────────────────────────
function drawMedallion(ctx: CanvasRenderingContext2D, pal: Palette, o: ArtQrOptions) {
  const medR = (QR_SIZE * o.logoScale) / 2;
  if (medR < 8) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, medR, 0, Math.PI * 2);
  ctx.fillStyle = pal.plate;
  ctx.fill();

  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = Math.max(2.4, medR * 0.055);
  ctx.beginPath();
  ctx.arc(CX, CY, medR - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = alpha(pal.ink, 0.22);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(CX, CY, medR * 0.86, 0, Math.PI * 2);
  ctx.stroke();

  if (o.logoImage) {
    drawLogoImage(ctx, o.logoImage, CX, CY, medR);
  } else {
    const emblem = o.emblem === 'auto' ? defaultEmblemFor(o.template) : o.emblem;
    drawEmblem(ctx, emblem, pal, CX, CY, medR * 1.32);
  }
  ctx.restore();
}

/** 自訂徽章：等比縮放放入圓形安全區，圓形以外裁走 */
function drawLogoImage(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource, cx: number, cy: number, medR: number,
) {
  const w = Number((img as { width?: number }).width) || medR * 2;
  const h = Number((img as { height?: number }).height) || medR * 2;
  const inner = medR * 1.52; // 直徑 = 0.76 × 徽章直徑
  const scale = Math.min(inner / w, inner / h);
  const dw = w * scale;
  const dh = h * scale;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, medR * 0.84, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.restore();
}

// ── 徽章圖案（全部以 100 × 100 盒為準，中心 0,0）───────────────
function drawEmblem(
  ctx: CanvasRenderingContext2D, kind: Exclude<ArtQrEmblem, 'auto'>,
  pal: Palette, cx: number, cy: number, size: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 100, size / 100);
  if (kind === 'lighthouse') drawLighthouse(ctx, pal);
  else if (kind === 'fleur') drawFleur(ctx, pal);
  else if (kind === 'compass') drawCompass(ctx, pal);
  else drawAnchor(ctx, pal);
  ctx.restore();
}

function drawLighthouse(ctx: CanvasRenderingContext2D, pal: Palette) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 旋轉光束（四道，由燈室射出）
  ctx.fillStyle = alpha(pal.accent, 0.42);
  [[-0.42, -1], [Math.PI + 0.42, 1], [-0.08, -1], [Math.PI + 0.08, 1]].forEach(([a, dir]) => {
    ctx.save();
    ctx.translate(0, -19);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(58 * dir, -9);
    ctx.lineTo(58 * dir, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  // 岩石底座
  ctx.fillStyle = alpha(pal.ink, 0.9);
  ctx.beginPath();
  ctx.moveTo(-26, 36);
  ctx.lineTo(-18, 30);
  ctx.lineTo(-8, 33);
  ctx.lineTo(2, 29);
  ctx.lineTo(13, 33);
  ctx.lineTo(24, 30);
  ctx.lineTo(29, 36);
  ctx.closePath();
  ctx.fill();

  // 塔身（上窄下闊）
  const tower = () => {
    ctx.beginPath();
    ctx.moveTo(-11, -10);
    ctx.lineTo(11, -10);
    ctx.lineTo(21, 31);
    ctx.lineTo(-21, 31);
    ctx.closePath();
  };
  tower();
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 2.8;
  ctx.stroke();

  // 塔身色帶（兩條粗金帶）
  ctx.save();
  tower();
  ctx.clip();
  ctx.fillStyle = pal.accent;
  ctx.beginPath();
  ctx.moveTo(-30, 1); ctx.lineTo(30, 1); ctx.lineTo(30, 9); ctx.lineTo(-30, 9); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-30, 17); ctx.lineTo(30, 17); ctx.lineTo(30, 24); ctx.lineTo(-30, 24); ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 觀景台圍欄
  ctx.fillStyle = pal.ink;
  ctx.fillRect(-15, -14.5, 30, 3.4);
  for (let x = -12; x <= 12; x += 6) ctx.fillRect(x - 0.9, -10, 1.8, 5);

  // 燈室
  ctx.fillStyle = '#f7dc93';
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-9, -26);
  ctx.lineTo(9, -26);
  ctx.lineTo(11, -14.5);
  ctx.lineTo(-11, -14.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = alpha(pal.ink, 0.7);
  ctx.lineWidth = 1.4;
  [-4, 4].forEach(x => { ctx.beginPath(); ctx.moveTo(x, -26); ctx.lineTo(x * 1.15, -14.5); ctx.stroke(); });

  // 圓頂 + 尖頂
  ctx.fillStyle = pal.ink;
  ctx.beginPath();
  ctx.moveTo(-11, -26);
  ctx.quadraticCurveTo(0, -38, 11, -26);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = pal.ink;
  ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, -42); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -43.5, 2.2, 0, Math.PI * 2); ctx.fill();

  // 門
  ctx.fillStyle = pal.ink;
  ctx.beginPath();
  ctx.moveTo(-4.5, 31); ctx.lineTo(-4.5, 22); ctx.quadraticCurveTo(0, 17.5, 4.5, 22); ctx.lineTo(4.5, 31);
  ctx.closePath(); ctx.fill();

  // 海浪
  ctx.strokeStyle = pal.sea;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(-45, 41);
  ctx.quadraticCurveTo(-34, 35, -23, 41);
  ctx.quadraticCurveTo(-12, 47, -1, 41);
  ctx.quadraticCurveTo(10, 35, 21, 41);
  ctx.quadraticCurveTo(32, 47, 43, 41);
  ctx.stroke();
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  rrPath(ctx, x, y, w, h, r);
}

function drawFleur(ctx: CanvasRenderingContext2D, pal: Palette) {
  // 三塊相同花瓣，以底座為中心左右張開
  const petal = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-5, -14, -10, -22, -10, -33);
    ctx.bezierCurveTo(-10, -46, -5, -55, 0, -60);
    ctx.bezierCurveTo(5, -55, 10, -46, 10, -33);
    ctx.bezierCurveTo(10, -22, 5, -14, 0, 0);
    ctx.closePath();
  };

  ctx.save();
  ctx.translate(0, 20);
  ctx.fillStyle = pal.ink;
  [-58, 0, 58].forEach(deg => {
    ctx.save();
    ctx.rotate((deg * Math.PI) / 180);
    petal();
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();

  // 金色橫帶
  ctx.fillStyle = pal.accent;
  rr(ctx, -16, 10, 32, 8.5, 3.6);
  ctx.fill();
  ctx.strokeStyle = alpha(pal.ink, 0.45);
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // 花尾
  ctx.fillStyle = pal.ink;
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.bezierCurveTo(-5, 27, -5, 36, 0, 45);
  ctx.bezierCurveTo(5, 36, 5, 27, 0, 18);
  ctx.closePath();
  ctx.fill();
}

function drawCompass(ctx: CanvasRenderingContext2D, pal: Palette) {
  // 外圈
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.arc(0, 0, 43, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.stroke();

  // 四個長針（N/E/S/W）
  const longPoint = (angle: number) => {
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = pal.ink;
    ctx.beginPath();
    ctx.moveTo(0, -37);
    ctx.lineTo(-7, 0);
    ctx.lineTo(7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].forEach(longPoint);

  // 四個短針
  const shortPoint = (angle: number) => {
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.moveTo(0, -21);
    ctx.lineTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4].forEach(shortPoint);

  // 中心
  ctx.fillStyle = pal.plate;
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = pal.accent;
  ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
}

function drawAnchor(ctx: CanvasRenderingContext2D, pal: Palette) {
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, -36, 6.5, 0, Math.PI * 2); ctx.stroke();

  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(0, 31); ctx.stroke();

  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-18, -20); ctx.lineTo(18, -20); ctx.stroke();

  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(-26, 6);
  ctx.bezierCurveTo(-24, 24, -12, 34, 0, 34);
  ctx.bezierCurveTo(12, 34, 24, 24, 26, 6);
  ctx.stroke();

  // 錨爪
  ctx.fillStyle = pal.ink;
  ctx.beginPath();
  ctx.moveTo(-27, 3); ctx.lineTo(-35, -4); ctx.lineTo(-22, 12); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(27, 3); ctx.lineTo(35, -4); ctx.lineTo(22, 12); ctx.closePath(); ctx.fill();

  // 金色頂環
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -36, 11, 0, Math.PI * 2); ctx.stroke();
}

// ── 底部文字 ───────────────────────────────────────────────────
function drawCaption(ctx: CanvasRenderingContext2D, pal: Palette, o: ArtQrOptions) {
  const caption = (o.caption || '').trim();
  if (caption) {
    const font = fitFont(ctx, caption, 620, px => `700 ${px}px ${FONT_ZH}`, 21, 13);
    ctx.font = font;
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(caption, CX, CAPTION_Y);

    ctx.fillStyle = pal.accent;
    diamondPath(ctx, CX - 20 - ctx.measureText(caption).width / 2, CAPTION_Y, 3.6); ctx.fill();
    diamondPath(ctx, CX + 20 + ctx.measureText(caption).width / 2, CAPTION_Y, 3.6); ctx.fill();
  }

  trackedText(ctx, 'SKWSCOUT.ORG.HK', CX, FOOTER_Y, 2.2, `600 9.5px ${FONT_EN}`, alpha(pal.ink, 0.55));
}

/** 方便頁面預覽：回傳建議安全分數（0–100） */
export function qrSafetyHint(o: ArtQrOptions, bytes: number): { score: number; label: string; tone: 'good' | 'ok' | 'warn' } {
  // 分數根據實測：ZXing（大部分手機掃描器核心）對 18–24% 徽章全部過關；
  // 細過 3cm 印刷、菱形／圓點、超大徽章就要保守啲。
  let score = 100;
  if (o.logoScale > 0.24) score -= (o.logoScale - 0.24) * 900;
  if (o.moduleStyle === 'dot') score -= 4;
  if (o.moduleStyle === 'diamond') score -= 8;
  if (o.template === 'minimal') score += 2;
  if (bytes > 500) score -= 10;
  if (bytes > 900) score -= 15;
  score = Math.max(0, Math.min(100, Math.round(score)));
  if (score >= 85) return { score, label: '高：手機鏡頭一般都掃得（記得試掃）', tone: 'good' };
  if (score >= 65) return { score, label: '中：印刷時請放大到 4cm 以上', tone: 'ok' };
  return { score, label: '偏低：建議縮細徽章，或改用「圓角方塊」', tone: 'warn' };
}
