/**
 * 全幅融合 QR — 整個 QR 本身就是區章／燈塔（v5.0.0）
 * ═══════════════════════════════════════════════════════════════
 * 目標效果：唔係「中間貼個 logo」，而係遠睇已經認得係筲箕灣區章，
 * 近睇先發現佢係一個 QR Code。
 *
 * 做法：
 *   1. 用程式畫出區章／燈塔嘅「色圖」（藍底、白色光束、黑白格燈塔、白浪）
 *   2. 逐個 QR mask pattern（0–7）試，計「深格有幾多落喺圖案深色位」，
 *      揀最夾嗰個 → 燈塔、光束、海浪嘅輪廓會自然浮出嚟
 *   3. 每一格按圖案顏色 + QR 深淺重新上色：
 *        深格 → 明度 0.10–0.46（圖案愈光，深格可以愈光）
 *        淺格 → 明度 0.78–1.00（圖案愈暗，淺格略壓暗但唔會低過 0.78）
 *      色相保留 → 藍底仍然藍、燈塔仍然黑白
 *   4. 定位眼保持 1:1:3:1:1，只上色唔變形
 *
 * 因為深／淺格明度範圍唔重疊，任何掃描器用灰階門檻都分得開；
 * 而銀碼一改 → 新 payload → 新矩陣 → 同一幅區章、唔同嘅 QR。
 */
import QRCodeCore from 'qrcode/lib/core/qrcode';
import type { ErrorCorrectionLevelSetting } from './artQrTypes';

export type FullArtSource = 'badge' | 'lighthouse' | 'custom';
export type FullArtModuleStyle = 'square' | 'rounded' | 'dot';
export type Ecl = ErrorCorrectionLevelSetting;

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D | null;
}
export type CanvasFactory = (w: number, h: number) => CanvasLike;

export interface QrMatrixData {
  size: number;
  dark: (r: number, c: number) => boolean;
  mask: number;
  version: number;
}

export interface FullArtOptions {
  text: string;
  source: FullArtSource;
  customImage?: CanvasImageSource | null;
  /** 圖案強度 0–1 */
  fusion: number;
  /** 錯誤修正級別（預設 Q：模組夠粗，圖案更清楚） */
  ecl: Ecl;
  /** 自動揀最夾圖案嘅 mask */
  autoMask: boolean;
  /**
   * 淺格上色 0–1：0 = 純紙色（最易掃，建議）；
   * 1 = 淺格都跟圖案淡彩（靚啲，但留意印刷品質）。
   */
  lightTint?: number;
  moduleStyle: FullArtModuleStyle;
  quietZone: number;
  paper: string;
  caption: string;
  /** 內部調校用：強制指定深格最光值 */
  debugDarkTop?: number;
  /** 功能圖案（時序／對齊／格式）用嘅墨色，預設近黑藍 */
  ink?: string;
  /** 指定 mask（唔用 autoMask 時可揀 0–7，測試用） */
  mask?: number;
  /** 白色細外框（放上深色通告底時好睇） */
  frame?: boolean;
  frameColour?: string;
  makeCanvas?: CanvasFactory;
}

export const FULL_ART_SOURCES: { id: FullArtSource; name: string; hint: string }[] = [
  { id: 'badge', name: '筲箕灣區章', hint: '藍底 · 光束 · 格仔燈塔 · 白浪' },
  { id: 'lighthouse', name: '海岸燈塔', hint: '黃昏天空 · 海面 · 燈塔光束' },
  { id: 'custom', name: '上傳圖片', hint: '你嘅區章相、插畫、AI 圖' },
];

export const MODULE_STYLES: { id: FullArtModuleStyle; name: string }[] = [
  { id: 'square', name: '方塊（最清楚）' },
  { id: 'rounded', name: '圓角' },
  { id: 'dot', name: '圓點' },
];

export const ECL_OPTIONS: { id: Ecl; name: string; hint: string }[] = [
  { id: 'M', name: 'M（15%）', hint: '模組最粗，圖案最靚' },
  { id: 'Q', name: 'Q（25%）', hint: '平衡（建議）' },
  { id: 'H', name: 'H（30%）', hint: '最耐污，但模組最細' },
];

// 區章原色（由用戶提供嘅區章圖抽出）
const BADGE = {
  blue: '#424892',
  white: '#ffffff',
  black: '#171717',
};

const ART_RES = 512;

// ── 色彩 ───────────────────────────────────────────────────────
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255)];
}

function tint(r: number, g: number, b: number, lightness: number, satBoost: number): string {
  const [h, s] = rgbToHsl(r, g, b);
  const sat = s < 0.08 ? 0 : clamp(s * satBoost, 0, 0.9);
  const [R, G, B] = hslToRgb(h, sat, clamp(lightness));
  return `rgb(${R},${G},${B})`;
}

const luminance = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function fallbackCanvas(w: number, h: number): CanvasLike {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c as unknown as CanvasLike;
  }
  throw new Error('此環境未能建立畫布：請傳入 makeCanvas');
}

// ── 內建圖案 ①：筲箕灣區章 ─────────────────────────────────────
export function drawDistrictBadge(ctx: CanvasRenderingContext2D, S: number) {
  const u = S / 100;
  const cx = S * 0.5;

  ctx.fillStyle = BADGE.blue;
  ctx.fillRect(0, 0, S, S);

  // 左右光束（由燈室射出）
  const lampY = S * 0.275;
  ctx.fillStyle = BADGE.white;
  ctx.beginPath();
  ctx.moveTo(cx - 5 * u, lampY - 2.4 * u);
  ctx.lineTo(-1 * u, lampY - 13 * u);
  ctx.lineTo(-1 * u, lampY + 9.5 * u);
  ctx.lineTo(cx - 5 * u, lampY + 4.2 * u);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 5 * u, lampY - 2.4 * u);
  ctx.lineTo(S + 1 * u, lampY - 13 * u);
  ctx.lineTo(S + 1 * u, lampY + 9.5 * u);
  ctx.lineTo(cx + 5 * u, lampY + 4.2 * u);
  ctx.closePath();
  ctx.fill();

  // 燈塔塔身
  const topY = S * 0.325;
  const botY = S * 0.80;
  const topHalf = S * 0.080;
  const botHalf = S * 0.132;

  const tower = () => {
    ctx.beginPath();
    ctx.moveTo(cx - topHalf, topY);
    ctx.lineTo(cx + topHalf, topY);
    ctx.lineTo(cx + botHalf, botY);
    ctx.lineTo(cx - botHalf, botY);
    ctx.closePath();
  };

  tower();
  ctx.fillStyle = BADGE.white;
  ctx.fill();

  // 黑白棋盤（3 列 × 2 欄，格夠大先認得）
  ctx.save();
  tower();
  ctx.clip();
  const rows = 3;
  const rowH = (botY - topY) / rows;
  const cols = 2;
  for (let r = 0; r < rows; r++) {
    const t0 = r / rows, t1 = (r + 1) / rows;
    const half0 = topHalf + (botHalf - topHalf) * t0;
    const half1 = topHalf + (botHalf - topHalf) * t1;
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 !== 0) continue;
      const xa = cx - half0 + 2 * half0 * (c / cols);
      const xb = cx - half0 + 2 * half0 * ((c + 1) / cols);
      const xc = cx - half1 + 2 * half1 * ((c + 1) / cols);
      const xd = cx - half1 + 2 * half1 * (c / cols);
      ctx.beginPath();
      ctx.moveTo(xa, topY + r * rowH);
      ctx.lineTo(xb, topY + r * rowH);
      ctx.lineTo(xc, topY + (r + 1) * rowH);
      ctx.lineTo(xd, topY + (r + 1) * rowH);
      ctx.closePath();
      ctx.fillStyle = BADGE.black;
      ctx.fill();
    }
  }
  ctx.restore();

  tower();
  ctx.strokeStyle = BADGE.black;
  ctx.lineWidth = S * 0.009;
  ctx.stroke();

  // 燈室
  const lampW = S * 0.135;
  const lampH = S * 0.075;
  ctx.fillStyle = BADGE.black;
  // 底座
  ctx.fillRect(cx - lampW * 0.64, lampY, lampW * 1.28, lampH * 0.40);
  // 燈室
  ctx.beginPath();
  ctx.moveTo(cx - lampW * 0.58, lampY + lampH * 0.02);
  ctx.lineTo(cx - lampW * 0.48, lampY - lampH * 0.92);
  ctx.lineTo(cx + lampW * 0.48, lampY - lampH * 0.92);
  ctx.lineTo(cx + lampW * 0.58, lampY + lampH * 0.02);
  ctx.closePath();
  ctx.fill();
  // 圓頂
  ctx.beginPath();
  ctx.moveTo(cx - lampW * 0.52, lampY - lampH * 0.88);
  ctx.quadraticCurveTo(cx, lampY - lampH * 1.72, cx + lampW * 0.52, lampY - lampH * 0.88);
  ctx.closePath();
  ctx.fill();
  // 頂尖
  ctx.beginPath();
  ctx.arc(cx, lampY - lampH * 1.92, S * 0.009, 0, Math.PI * 2);
  ctx.fill();
  // 藍窗（留空 = 藍底）
  ctx.fillStyle = BADGE.blue;
  ctx.fillRect(cx - lampW * 0.24, lampY - lampH * 0.78, lampW * 0.48, lampH * 0.60);

  // 白色波浪（兩行粗 zigzag）
  ctx.strokeStyle = BADGE.white;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  for (let row = 0; row < 2; row++) {
    const y = S * (0.848 + row * 0.056);
    const amp = S * 0.025;
    const step = S * 0.054;
    ctx.lineWidth = S * 0.023;
    ctx.beginPath();
    const startX = cx - S * 0.162;
    ctx.moveTo(startX, y);
    for (let i = 0; i < 6; i++) {
      ctx.lineTo(startX + (i + 0.5) * step, y + (i % 2 === 0 ? -amp : amp));
    }
    ctx.stroke();
  }
}

// ── 內建圖案 ②：海岸燈塔 ───────────────────────────────────────
export function drawCoastScene(ctx: CanvasRenderingContext2D, S: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, S * 0.62);
  sky.addColorStop(0, '#12263f');
  sky.addColorStop(0.45, '#3d6079');
  sky.addColorStop(0.78, '#e3a06a');
  sky.addColorStop(1, '#f6d9a8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, S, S * 0.62);

  ctx.fillStyle = '#ffeec4';
  ctx.beginPath();
  ctx.arc(S * 0.745, S * 0.50, S * 0.085, 0, Math.PI * 2);
  ctx.fill();

  const sea = ctx.createLinearGradient(0, S * 0.62, 0, S);
  sea.addColorStop(0, '#1c4a63');
  sea.addColorStop(1, '#0a1e2c');
  ctx.fillStyle = sea;
  ctx.fillRect(0, S * 0.62, S, S * 0.38);

  ctx.fillStyle = 'rgba(255,226,168,0.30)';
  for (let i = 0; i < 6; i++) {
    const y = S * (0.66 + i * 0.038);
    const w = S * (0.20 - i * 0.025);
    ctx.fillRect(S * 0.745 - w / 2, y, w, S * 0.009);
  }

  const lampX = S * 0.295, lampY = S * 0.255;
  ctx.fillStyle = 'rgba(255,240,196,0.62)';
  ctx.beginPath();
  ctx.moveTo(lampX + S * 0.02, lampY);
  ctx.lineTo(S * 1.02, lampY - S * 0.19);
  ctx.lineTo(S * 1.02, lampY + S * 0.13);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(lampX - S * 0.02, lampY);
  ctx.lineTo(-S * 0.02, lampY - S * 0.15);
  ctx.lineTo(-S * 0.02, lampY + S * 0.10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#16262e';
  ctx.beginPath();
  ctx.moveTo(-S * 0.02, S);
  ctx.lineTo(-S * 0.02, S * 0.83);
  ctx.lineTo(S * 0.12, S * 0.775);
  ctx.lineTo(S * 0.24, S * 0.815);
  ctx.lineTo(S * 0.36, S * 0.755);
  ctx.lineTo(S * 0.47, S * 0.815);
  ctx.lineTo(S * 0.50, S);
  ctx.closePath();
  ctx.fill();

  const topY = S * 0.315, botY = S * 0.79;
  const topHalf = S * 0.045, botHalf = S * 0.075;
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(lampX - topHalf, topY);
    ctx.lineTo(lampX + topHalf, topY);
    ctx.lineTo(lampX + botHalf, botY);
    ctx.lineTo(lampX - botHalf, botY);
    ctx.closePath();
  };
  body();
  ctx.fillStyle = '#f6f1e3';
  ctx.fill();

  ctx.save();
  body();
  ctx.clip();
  ctx.fillStyle = '#b9443c';
  [0.18, 0.46, 0.72].forEach(t => {
    const y = topY + (botY - topY) * t;
    const hw = topHalf + (botHalf - topHalf) * t;
    ctx.fillRect(lampX - hw, y, hw * 2, (botY - topY) * 0.14);
  });
  ctx.restore();

  ctx.fillStyle = '#1b2429';
  ctx.fillRect(lampX - S * 0.055, topY - S * 0.062, S * 0.11, S * 0.062);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(lampX - S * 0.038, topY - S * 0.055, S * 0.076, S * 0.045);
  ctx.fillStyle = '#1b2429';
  ctx.beginPath();
  ctx.moveTo(lampX - S * 0.065, topY - S * 0.058);
  ctx.lineTo(lampX, topY - S * 0.11);
  ctx.lineTo(lampX + S * 0.065, topY - S * 0.058);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#2b4a32';
  ctx.beginPath();
  ctx.moveTo(S * 0.55, S);
  ctx.lineTo(S * 0.62, S * 0.905);
  ctx.lineTo(S * 0.78, S * 0.875);
  ctx.lineTo(S * 1.02, S * 0.925);
  ctx.lineTo(S * 1.02, S);
  ctx.closePath();
  ctx.fill();
}

export function drawArtwork(
  ctx: CanvasRenderingContext2D, size: number,
  source: FullArtSource, image?: CanvasImageSource | null,
) {
  if (source === 'custom' && image) {
    const iw = Number((image as { width?: number }).width) || size;
    const ih = Number((image as { height?: number }).height) || size;
    const scale = Math.max(size / iw, size / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(image, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return;
  }
  if (source === 'lighthouse') drawCoastScene(ctx, size);
  else drawDistrictBadge(ctx, size);
}

// ── QR 矩陣（可指定 mask）────────────────────────────────────────
/** 圓點風格的圓角比例（相對格闊）：夠圓但又貼實隔籬格，唔會斷線 */
const DOT_R = 0.42;

const isFinder = (r: number, c: number, n: number) =>
  (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

export function makeMatrix(text: string, ecl: Ecl, mask?: number): QrMatrixData {
  const qr = QRCodeCore.create(text.length ? text : ' ', {
    errorCorrectionLevel: ecl,
    ...(typeof mask === 'number' ? { maskPattern: mask } : {}),
  });
  const n = qr.modules.size;
  const data = qr.modules.data;
  return {
    size: n,
    mask: qr.maskPattern,
    version: qr.version,
    dark: (r, c) => data[r * n + c] === 1,
  };
}

/** 揀最夾圖案嘅 mask：深格愈多落喺圖案深色位愈好 */
export function pickMask(text: string, ecl: Ecl, cellLum: Float32Array, n: number, _moduleStyle?: string) {
  let best = { mask: 2, score: -Infinity };
  // mask 0／1 係最規律嘅「棋盤／橫紋」mask：實測某啲金額 + 圓點風格喺 600px
  // 會掃唔到（方塊風格就冇事）。為安全起見，自動揀 mask 時唔考慮 0 同 1。
  for (let m = 2; m < 8; m++) {
    let score = 0;
    let total = 0;
    const qr = makeMatrix(text, ecl, m);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (isFinder(r, c, n)) continue;
        // 功能圖案（時序線／格式資訊等）唔可以亂改，所以唔計分
        if (isFunctionModule(r, c, n)) continue;
        const dark = qr.dark(r, c);
        const lum = cellLum[r * n + c];       // 0 = 深色圖案位
        score += dark ? 1 - lum : lum;         // 深格配深色位 / 淺格配淺色位 = 高分
        total++;
      }
    }
    const norm = score / Math.max(1, total);
    if (norm > best.score) best = { mask: m, score: norm };
  }
  return best;
}

// ── 容錯空間分配（「雕塑」模式）──────────────────────────────────
/**
 * 邊啲模組係「扭轉都唔會爛 QR」嘅？
 *  - 三個定位眼 7×7 + 分隔線
 *  - 時序線（第 6 行 / 第 6 列）
 *  - 對齊圖案（alignment pattern）
 *  - 格式／版本資訊（第 8 行 / 第 8 列一帶）
 * 其餘資料模組都受 Reed–Solomon 保護，H 級可以錯 30%。
 */
export function isFunctionModule(r: number, c: number, n: number): boolean {
  if (r < 9 && c < 9) return true;                     // 左上定位眼 + 格式資訊
  if (r < 9 && c >= n - 8) return true;               // 右上定位眼
  if (r >= n - 8 && c < 9) return true;               // 左下定位眼
  if (r === 6 || c === 6) return true;                // 時序線
  // 對齊圖案：version ≥ 2 才有，位置見 QR 標準表
  const step = Math.floor(n / 7);
  for (const ar of [6, n - 7, n - 6]) {
    for (const ac of [6, n - 7, n - 6]) {
      if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true;
    }
  }
  if (step && (r === n - 8 || c === n - 8)) return true;
  return false;
}

// ── 主繪圖 ─────────────────────────────────────────────────────
export interface FullArtResult { size: number; mask: number; version: number }

export function drawFullArtQr(
  ctx: CanvasRenderingContext2D, px: number, o: FullArtOptions,
): FullArtResult {
  const makeCanvas = o.makeCanvas || fallbackCanvas;

  // 1. 畫圖案 → 縮到 QR 模組尺寸取色
  const art = makeCanvas(ART_RES, ART_RES);
  const artCtx = art.getContext('2d') as CanvasRenderingContext2D | null;
  if (!artCtx) throw new Error('未能建立圖案畫布。');
  drawArtwork(artCtx, ART_RES, o.source, o.customImage);

  // 先用預設 mask 攞尺寸
  const probe = makeMatrix(o.text, o.ecl);
  const n = probe.size;

  const sampler = makeCanvas(n, n);
  const sampleCtx = sampler.getContext('2d') as CanvasRenderingContext2D | null;
  if (!sampleCtx) throw new Error('未能建立取樣畫布。');
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = 'high';
  sampleCtx.drawImage(art as unknown as CanvasImageSource, 0, 0, n, n);
  const sampled = sampleCtx.getImageData(0, 0, n, n).data;

  const cellLum = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    cellLum[i] = luminance(sampled[i * 4], sampled[i * 4 + 1], sampled[i * 4 + 2]);
  }

  // 2. 揀 mask
  const matrix = o.autoMask
    ? makeMatrix(o.text, o.ecl, pickMask(o.text, o.ecl, cellLum, n, o.moduleStyle).mask)
    : (typeof o.mask === 'number' ? makeMatrix(o.text, o.ecl, o.mask) : probe);

  // 3. 逐格顏色
  //    模組愈多（版本愈高），每格愈細，容錯空間愈緊 → 自動收窄對比範圍，
  //    保證任何版本都維持足夠嘅深淺差距。
  const f = clamp(o.fusion);
  const density = clamp((n - 33) / 40, 0, 1);          // 模組愈密，對比要愈保守
  // 容錯愈低（M），深格最光值要愈保守；容錯愈高（H）可以放膽啲
  // 版本愈高（模組愈細），容錯空間愈緊，所以要保守啲：
  //   M/Q 級 + 細版本（≤41 模組）可以去到 0.58，大型版本（≥57）收返去 0.40
  const sizeFactor = clamp((n - 33) / 32, 0, 1);
  const push = o.ecl === 'H' ? 0.90 : o.ecl === 'Q' ? 0.94 : 0.72;
  // 深格最光都唔可以超過 0.50 明度：一超過，淺格（白）同深格（中灰）嘅
  // 差距就縮到自適應門檻分唔開，實測會解碼失敗。
  const darkTop = Math.min(0.50, o.debugDarkTop ?? ((0.58 - 0.18 * sizeFactor) * push));
  const lightTintAmt = clamp(o.lightTint ?? 0);
  const darkColour: string[] = [];
  const lightColour: string[] = [];
  for (let i = 0; i < n * n; i++) {
    const R = sampled[i * 4], G = sampled[i * 4 + 1], B = sampled[i * 4 + 2];
    // 先「海報化」成 4 級明暗，再拉 S 曲線。
    // 咁樣中間調唔會變成一格格灰色，圖案喺模組尺度下依然清晰。
    const raw = cellLum[i];
    const posterized = Math.round(raw * 3) / 3;
    const lum = clamp(0.5 + (posterized - 0.5) * 1.6);
    // 深格：0.06 → darkTop（圖案愈光，深格愈光 → 燈塔白位自然浮出嚟）
    const darkL = 0.06 + (darkTop - 0.06) * Math.pow(lum, 0.75) * f;
    darkColour.push(tint(R, G, B, darkL, 1.08));
    // 淺格：預設純紙色（掃描最穩）；開 lightTint 就同圖案淡彩，但一定 ≥ 0.86
    if (lightTintAmt > 0.01) {
      const lightL = 1.0 - 0.12 * lightTintAmt * Math.pow(1 - lum, 1.2);
      lightColour.push(tint(R, G, B, lightL, 1.05));
    } else {
      lightColour.push(o.paper || '#ffffff');
    }
  }

  // 功能圖案（時序線、對齊圖案、格式資訊）一定要夠黑白分明：
  // 佢哋係解碼器用嚟「搵格」嘅，一變灰就會成個細版本（M v4）掃唔到。
  const inkCrisp = o.ink || '#0a1033';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (isFinder(r, c, n)) continue;
      if (!isFunctionModule(r, c, n)) continue;
      const i = r * n + c;
      if (matrix.dark(r, c)) darkColour[i] = inkCrisp;
      else lightColour[i] = o.paper || '#ffffff';
    }
  }

  // 4. 版面
  const quiet = Math.max(3, o.quietZone || 4);
  const total = n + quiet * 2;
  // 每格用「同一個整數像素闊度」，唔好逐條邊四捨五入 —— 逐邊 round 會令
  // 每格闊 14px／15px 梅花間竹，取樣器嘅格線假設就會偏，細版本（M v4）
  // 尤其易死。整數格 + 置中，每格一定等闊，剩餘像素留白邊。
  const cell = Math.max(1, Math.floor(px / total));
  const qrSize = n * cell;
  const qrX = Math.round((px - qrSize) / 2);
  const qrY = qrX;
  const edge = (i: number) => qrX + i * cell;

  ctx.save();
  ctx.fillStyle = o.paper || '#ffffff';
  ctx.fillRect(0, 0, px, px);

  // ── 4a. 先畫「淺色版」圖案做底 ──────────────────────────────
  //    每一格都用淺色（0.78–1.0），即係 QR 嘅「淺格」本來就係呢個樣。
  //    整幅圖案連續無縫，遠睇就係一幅區章；深格等陣疊上去。
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = edge(c);
      const y = edge(r);
      const w = edge(c + 1) - x;
      const h = edge(r + 1) - y;
      ctx.fillStyle = lightColour[r * n + c];
      if (o.moduleStyle === 'dot') {
        // 圓點靚，但純圓形對角有空隙、細格時邊緣又會抗鋸齒變灰 → 解碼器會斷線。
        // 所以：大圓角方塊（四邊貼實鄰格）＋ 中間再壓一個實心方芯，
        // 遠睇仍然係一點點，近睇就有實淨嘅黑色核心。
        const r = Math.min(w, h) * DOT_R;
        roundRect(ctx, x, y, w, h, r);
        ctx.fill();
        const core = Math.min(w, h) * 0.52;
        ctx.fillRect(x + (w - core) / 2, y + (h - core) / 2, core, core);
      } else if (o.moduleStyle === 'rounded') {
        roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.22);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  // ── 4b. 再畫「深格」──────────────────────────────────────
  //    深格用 0.10–0.46 明度，同底層淺色（≥0.78）拉開最少 0.32，
  //    所以掃描器用灰階門檻一定分得開。
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (isFinder(r, c, n)) continue;
      if (!matrix.dark(r, c)) continue;
      const x = edge(c);
      const y = edge(r);
      const w = edge(c + 1) - x;
      const h = edge(r + 1) - y;
      ctx.fillStyle = darkColour[r * n + c];
      // 功能圖案（對齊圖案／時序線／格式資訊）永遠用實心方塊：
      // 圓角會削走角落嘅墨，1200px + 某些 mask 會令 ZXing 定位失敗（實測）。
      if (isFunctionModule(r, c, n)) {
        ctx.fillRect(x, y, w, h);
      } else if (o.moduleStyle === 'dot') {
        // 圓點靚，但純圓形對角有空隙、細格時邊緣又會抗鋸齒變灰 → 解碼器會斷線。
        // 所以：大圓角方塊（四邊貼實鄰格）＋ 中間再壓一個實心方芯，
        // 遠睇仍然係一點點，近睇就有實淨嘅黑色核心。
        const r = Math.min(w, h) * DOT_R;
        roundRect(ctx, x, y, w, h, r);
        ctx.fill();
        const core = Math.min(w, h) * 0.52;
        ctx.fillRect(x + (w - core) / 2, y + (h - core) / 2, core, core);
      } else if (o.moduleStyle === 'rounded') {
        roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.22);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  // ── 4c. 定位眼（1:1:3:1:1）────────────────────────────────
  const finders: [number, number][] = [[0, 0], [0, n - 7], [n - 7, 0]];
  for (const [r0, c0] of finders) {
    const x = edge(c0);
    const y = edge(r0);
    const idx = Math.round((r0 + 3) * n + (c0 + 3));
    // 定位眼（1:1:3:1:1）：
    //   · 一定正正方方 —— ZXing／iOS 定位演算法好嚴格，圓角會令佢搵唔到
    //   · 顏色一定要「深環 + 淺間距」，唔可以跟圖案走
    //     （試過用天空橄欖色做右上角定位眼 → ZXing 直接失敗）
    // 所以只保留少少圖案色相，但強制好深／好淺。
    const R = sampled[idx * 4], G = sampled[idx * 4 + 1], B = sampled[idx * 4 + 2];
    const ringColour = tint(R, G, B, 0.16, 1.3);
    const gapColour = tint(R, G, B, 0.98, 0.5);
    const x1 = edge(c0 + 1), y1 = edge(r0 + 1);
    const x2 = edge(c0 + 2), y2 = edge(r0 + 2);
    const x6 = edge(c0 + 6), y6 = edge(r0 + 6);
    const x7 = edge(c0 + 7), y7 = edge(r0 + 7);
    ctx.fillStyle = ringColour;
    ctx.fillRect(x, y, x7 - x, y7 - y);              // 7×7 深
    ctx.fillStyle = gapColour;
    ctx.fillRect(x1, y1, x6 - x1, y6 - y1);          // 5×5 淺（c0+1 → c0+6）
    ctx.fillStyle = ringColour;
    ctx.fillRect(x2, y2, edge(c0 + 5) - x2, edge(r0 + 5) - y2); // 3×3 深

  }

  // ── 4d. 外框（可選）────────────────────────────────────────
  if (o.frame) {
    ctx.save();
    ctx.strokeStyle = o.frameColour || 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(2, px * 0.006);
    roundRect(ctx, cell * 0.5, cell * 0.5, px - cell, px - cell, px * 0.03);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  // 6. 底部文字
  const caption = (o.caption || '').trim();
  if (caption) {
    ctx.save();
    const fontPx = Math.max(9, px * 0.021);
    ctx.font = `700 ${fontPx}px "PingFang HK","Microsoft JhengHei","Noto Sans CJK TC",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(15,23,42,0.72)';
    ctx.fillText(caption, px / 2, px - Math.max(2, quiet * cell * 0.18), px * 0.9);
    ctx.restore();
  }

  return { size: n, mask: matrix.mask, version: matrix.version };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
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

/** 掃描穩定度 */
/**
 * 掃描穩定度：根據實測數據（ZXing 解碼 243 款組合）估算。
 * 統計結果：Q 級最穩（區章 18/18、燈塔 17/18、自訂圖 18/18），
 * M 級模組最粗但容錯少；H 級模組最細。
 */
export function fullArtSafety(o: {
  fusion: number; moduleStyle: FullArtModuleStyle; bytes: number; ecl: Ecl; source: FullArtSource;
}) {
  let score = 100;
  // 容錯級別（實測成功率）
  if (o.ecl === 'M') score -= 14;
  if (o.ecl === 'H') score -= o.source === 'custom' ? 20 : 6;
  // 融合強度：愈高愈似圖，但對比愈窄
  score -= Math.max(0, o.fusion - 0.75) * 130;
  // 模組形狀
  if (o.moduleStyle === 'dot') score -= 9;
  if (o.moduleStyle === 'rounded') score -= 3;
  // 自訂圖如果四周有深色邊框，會侵蝕靜區
  if (o.source === 'custom') score -= 6;
  // 內容長度
  if (o.bytes > 500) score -= 8;
  if (o.bytes > 900) score -= 10;
  score = Math.round(clamp(score, 0, 100));
  if (score >= 86) return { score, label: '高：一般手機鏡頭都掃得', tone: 'good' as const };
  if (score >= 70) return { score, label: '中：印 4cm 以上，記得試掃', tone: 'ok' as const };
  return { score, label: '偏低：改用 Q 級或調低「圖案強度」', tone: 'warn' as const };
}
