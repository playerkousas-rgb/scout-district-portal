/**
 * 場景 QR — 將整個 QR 融進區章／燈塔畫面（v4.20.0）
 * ═══════════════════════════════════════════════════════════════
 * 概念同 ICQR 一樣：唔再係「中間擺個 logo」，而係
 *   1. 揀一張底圖（刺繡區章、燈塔插畫，或者自己上傳）；
 *   2. 喺 8 個 QR mask 之中揀最夾嗰個（深色模組盡量落喺圖嘅深色位）；
 *   3. 逐格用「深色墨／淺色紙」半透明疊上去，深淺跟返原圖光度調節，
 *      令模組好似本身就係圖案一部分（刺繡針腳、金屬浮雕）；
 *   4. 定位眼、時序線強制全對比，保證掃描器一定搵到；
 *   5. 可以加浮雕（emboss）令每個模組似凸起金屬塊，
 *      再用 CSS 3D 睇，或者直接出 STL 去 3D 打印。
 */
import QRCodeCore from 'qrcode/lib/core/qrcode';

export type SceneStyle = 'badge' | 'poster' | 'solid';
export type ModuleShape = 'square' | 'stitch' | 'round';

export interface SceneQrOptions {
  text: string;
  /** 底圖；null = 純色底 */
  image?: CanvasImageSource | null;
  style: SceneStyle;
  /** 融合強度 0.45–1：1 = 最深對比（最易掃），越細越似原圖 */
  blend: number;
  /** 浮雕強度 0–1（0 = 平） */
  emboss: number;
  /** 模組形狀：方塊／刺繡針腳／圓角 */
  moduleShape: ModuleShape;
  ink: string;
  paper: string;
  /** 靜區（模組數），最少 2 */
  quiet: number;
  /** 圖框（金色細框 + 四角菱形） */
  frame: boolean;
  /** 圓角（0–1，相對邊長） */
  corner: number;
  titleZh: string;
  titleEn: string;
  caption: string;
  /** 指定 mask 0–7；'auto' = 自動揀最夾嗰個 */
  mask?: number | 'auto';
}

export const SCENE_STYLES: { id: SceneStyle; name: string; hint: string }[] = [
  { id: 'badge', name: '刺繡區章', hint: '模組化成金線針腳' },
  { id: 'poster', name: '燈塔插畫', hint: '模組融入畫面明暗' },
  { id: 'solid', name: '純色浮雕', hint: '乾淨底，最易掃' },
];

export const MODULE_SHAPES: { id: ModuleShape; name: string }[] = [
  { id: 'square', name: '方塊' },
  { id: 'stitch', name: '刺繡針腳' },
  { id: 'round', name: '圓角' },
];

interface QrModuleMatrix {
  size: number;
  data: Uint8Array;
  maskPattern: number;
  version: number;
}

// qrcode 套件係 CJS + 型別唔完整，呢邊集中處理
interface QrCoreModule {
  create: (text: string, opts?: { errorCorrectionLevel?: string; maskPattern?: number }) => {
    modules: { size: number; data: Uint8Array };
    maskPattern: number;
    version: number;
  };
}
const QRCore = QRCodeCore as unknown as QrCoreModule;

export function makeSceneQr(text: string, mask?: number): QrModuleMatrix {
  const qr = QRCore.create(text, {
    errorCorrectionLevel: 'H',
    ...(typeof mask === 'number' ? { maskPattern: mask } : {}),
  });
  return {
    size: qr.modules.size,
    data: qr.modules.data,
    maskPattern: qr.maskPattern,
    version: qr.version,
  };
}

// ── 圖像光度分析 ────────────────────────────────────────────────
const LUM_SIZE = 256;

/** 將圖縮到 256×256 計光度（0 = 黑，1 = 白） */
export function imageLuminance(image: CanvasImageSource | null | undefined, paper: string): Float32Array {
  const lum = new Float32Array(LUM_SIZE * LUM_SIZE);
  if (!image) {
    // 冇圖 = 純紙色：光度全部用紙色
    const v = luminanceOfHex(paper);
    lum.fill(v);
    return lum;
  }
  const canvas = document.createElement('canvas');
  canvas.width = LUM_SIZE;
  canvas.height = LUM_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return lum;
  drawCover(ctx, image, LUM_SIZE, LUM_SIZE);
  const { data } = ctx.getImageData(0, 0, LUM_SIZE, LUM_SIZE);
  const base = luminanceOfHex(paper);
  for (let i = 0; i < lum.length; i++) {
    const a = data[i * 4 + 3] / 255;
    const l = (data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722) / 255;
    lum[i] = a * l + (1 - a) * base;
  }
  return lum;
}

function luminanceOfHex(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return (((n >> 16) & 255) * 0.2126 + ((n >> 8) & 255) * 0.7152 + (n & 255) * 0.0722) / 255;
}

/** 每格模組嘅平均光度 */
function cellLuminance(lum: Float32Array, count: number): Float32Array {
  const out = new Float32Array(count * count);
  const per = LUM_SIZE / count;
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      let sum = 0;
      let n = 0;
      const y0 = Math.floor(r * per), y1 = Math.max(y0 + 1, Math.floor((r + 1) * per));
      const x0 = Math.floor(c * per), x1 = Math.max(x0 + 1, Math.floor((c + 1) * per));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) { sum += lum[y * LUM_SIZE + x]; n++; }
      }
      out[r * count + c] = sum / Math.max(1, n);
    }
  }
  return out;
}

/** 揀最夾底圖嘅 mask：深色模組要落喺深色位，淺色模組要落喺淺色位 */
export function pickBestMask(text: string, cells: Float32Array, count: number): { mask: number; score: number; ranked: number[] } {
  const scores: { mask: number; score: number }[] = [];
  for (let mask = 0; mask < 8; mask++) {
    let qr: QrModuleMatrix;
    try { qr = makeSceneQr(text, mask); } catch { continue; }
    if (qr.size !== count) continue;
    let cost = 0;
    for (let i = 0; i < count * count; i++) {
      const dark = qr.data[i] === 1;
      const l = cells[i];
      cost += dark ? l : 1 - l;
    }
    scores.push({ mask, score: 1 - cost / (count * count) });
  }
  scores.sort((a, b) => b.score - a.score);
  return { mask: scores[0]?.mask ?? 0, score: scores[0]?.score ?? 0, ranked: scores.map(s => s.mask) };
}

// ── 繪圖 ────────────────────────────────────────────────────────
export interface SceneLayout {
  /** 每格像素 */
  cell: number;
  /** 靜區像素 */
  margin: number;
  /** QR 左上有圖區域嘅起點（模組 0,0 嘅位置） */
  originX: number;
  originY: number;
  /** 連靜區嘅總邊長 */
  boardSize: number;
}

export function sceneLayout(px: number, count: number, quiet: number): SceneLayout {
  const total = count + quiet * 2;
  const cell = px / total;
  return { cell, margin: cell * quiet, originX: cell * quiet, originY: cell * quiet, boardSize: px };
}

function drawCover(
  ctx: CanvasRenderingContext2D, image: CanvasImageSource, w: number, h: number,
  offsetX = 0, offsetY = 0, zoom = 1,
) {
  const iw = Number((image as { naturalWidth?: number }).naturalWidth) || Number((image as { width?: number }).width) || w;
  const ih = Number((image as { naturalHeight?: number }).naturalHeight) || Number((image as { height?: number }).height) || h;
  const scale = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(image, offsetX + (w - dw) / 2, offsetY + (h - dh) / 2, dw, dh);
}

function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

/** 三大定位眼 + 分隔線（7×7 連白邊 = 8×8） */
function isFinderZone(r: number, c: number, count: number): boolean {
  const inBox = (r0: number, c0: number) => r >= r0 && r < r0 + 8 && c >= c0 && c < c0 + 8;
  return inBox(0, 0) || inBox(0, count - 8) || inBox(count - 8, 0);
}

function isTiming(r: number, c: number, count: number): boolean {
  return (r === 6 && c >= 8 && c < count - 8) || (c === 6 && r >= 8 && r < count - 8);
}

export interface SceneQrResult {
  count: number;
  mask: number;
  score: number;
}

/** 主繪圖：將 QR 融進底圖 */
export function drawSceneQr(
  ctx: CanvasRenderingContext2D, px: number, o: SceneQrOptions,
  image?: CanvasImageSource | null,
): SceneQrResult {
  const img = image ?? o.image ?? null;
  const lum = imageLuminance(img, o.paper);
  let qr: QrModuleMatrix;
  try {
    qr = makeSceneQr(o.text, typeof o.mask === 'number' ? o.mask : undefined);
  } catch {
    ctx.fillStyle = o.paper;
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = o.ink;
    ctx.font = `600 ${Math.round(px * 0.04)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('內容太長，未能生成 QR', px / 2, px / 2);
    return { count: 0, mask: 0, score: 0 };
  }

  const cells = cellLuminance(lum, qr.size);
  let mask = qr.maskPattern;
  let score = 0;
  if (o.mask === 'auto' || o.mask === undefined) {
    const best = pickBestMask(o.text, cells, qr.size);
    if (best.mask !== qr.maskPattern) {
      qr = makeSceneQr(o.text, best.mask);
      mask = best.mask;
      score = best.score;
    } else {
      mask = best.mask;
      score = best.score;
    }
  }

  const L = sceneLayout(px, qr.size, Math.max(2, o.quiet));
  const { cell } = L;
  const blend = Math.max(0.35, Math.min(1, o.blend));
  const emboss = Math.max(0, Math.min(1, o.emboss));
  const radius = px * Math.max(0, Math.min(0.5, o.corner));
  ctx.save();
  ctx.clearRect(0, 0, px, px);

  // 1. 底紙 + 圖
  rr(ctx, 0, 0, px, px, radius);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = o.paper;
  ctx.fillRect(0, 0, px, px);
  if (img) {
    drawCover(ctx, img, px, px);
    // 輕微壓暗四角，令 QR 邊緣更清楚
    const vignette = ctx.createRadialGradient(px / 2, px / 2, px * 0.28, px / 2, px / 2, px * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${0.06 + 0.12 * (1 - blend)})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, px, px);

  }
  ctx.restore();

  // 2. 逐像素重映射：保留原圖色相／紋理，只係把亮度「推」去深／淺兩極
  //    dark 模組 → 亮度壓入 0.04–0.30；light 模組 → 亮度推上 0.72–1.0
  //    色彩按比例縮放，所以刺繡金線、海面綠浪、夜空深藍全部保留。
  if (img) {
    remapImage(ctx, px, qr, L, o, blend);
  } else {
    // 純色底：直接用墨／紙色畫模組
    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        if (isFinderZone(r, c, qr.size) || isTiming(r, c, qr.size)) continue;
        const dark = qr.data[r * qr.size + c] === 1;
        ctx.fillStyle = alpha(dark ? o.ink : o.paper, Math.min(1, 0.35 + 0.75 * blend));
        drawModule(ctx, o.moduleShape, L.originX + c * cell, L.originY + r * cell, cell, r, c);
      }
    }
  }

  // 3. 定位眼 + 時序線：全對比，唔可以被圖食掉
  //    先鋪返乾淨紙底（分隔線一定要淺色，否則同深色背景黐埋一齊就搵唔到定位眼）
  ctx.fillStyle = alpha(o.paper, 0.99);
  const finderOrigins: [number, number][] = [[0, 0], [0, qr.size - 8], [qr.size - 8, 0]];
  finderOrigins.forEach(([r, c]) => {
    ctx.fillRect(L.originX + c * cell, L.originY + r * cell, cell * 8.02, cell * 8.02);
  });
  ctx.fillRect(L.originX + 8 * cell, L.originY + 6 * cell, cell * (qr.size - 16), cell);
  ctx.fillRect(L.originX + 6 * cell, L.originY + 8 * cell, cell, cell * (qr.size - 16));

  drawFinders(ctx, L, qr, o, cell);
  drawTiming(ctx, L, qr, o, cell);

  // 4. 靜區：用紙色畫一個乾淨邊框（保證掃描器有白邊）
  const qz = L.margin;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, px, px);
  ctx.rect(qz, qz, px - qz * 2, px - qz * 2);
  ctx.fillStyle = alpha(o.paper, 0.985);
  ctx.fill('evenodd');
  ctx.restore();

  // 5. 浮雕：每個深色模組加高光／陰影
  if (emboss > 0.02) drawEmboss(ctx, L, qr, o, cell, emboss);

  // 6. 外框
  if (o.frame) drawFrame(ctx, px, o, radius);

  // 7. 文字（放喺靜區外？靜區唔可以寫字，所以文字只可以喺圖框外面）
  drawSceneText(ctx, px, o, radius);

  ctx.restore();
  return { count: qr.size, mask, score };
}

/**
 * 將底圖逐像素重映射：每個 pixel 按佢落喺邊個模組，將亮度推向深／淺兩極，
 * 色相同飽和度保留（色彩按亮度比例縮放），所以圖案仍然認得出。
 */
function remapImage(
  ctx: CanvasRenderingContext2D, px: number, qr: QrModuleMatrix,
  L: SceneLayout, o: SceneQrOptions, blend: number,
) {
  const source = ctx.getImageData(0, 0, px, px);
  const data = source.data;
  const strength = Math.max(0.35, Math.min(1, blend));
  const inkRgb = hexToRgb(o.ink);
  const paperRgb = hexToRgb(o.paper);
  const n = qr.size;
  const shape = o.moduleShape;
  const gap = shape === 'stitch' ? 0.06 : shape === 'round' ? 0.09 : 0.01;

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (isFinderZone(r, c, n) || isTiming(r, c, n)) continue;
      const dark = qr.data[r * n + c] === 1;
      const x0 = Math.max(0, Math.floor(L.originX + (c + gap) * L.cell));
      const x1 = Math.min(px, Math.ceil(L.originX + (c + 1 - gap) * L.cell));
      const y0 = Math.max(0, Math.floor(L.originY + (r + gap) * L.cell));
      const y1 = Math.min(px, Math.ceil(L.originY + (r + 1 - gap) * L.cell));

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * px + x) * 4;
          if (data[i + 3] < 8) continue;
          const lr = data[i] / 255, lg = data[i + 1] / 255, lb = data[i + 2] / 255;
          const lum = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;

          // 目標：深模組 0.10–0.24，淺模組 0.85–0.99
          const aimDark = 0.10 + 0.14 * lum;
          const aimLight = 0.85 + 0.14 * lum;
          const aim = dark ? aimDark : aimLight;

          // 「需要改幾多」：離目標越遠，改得越多；已經啱色就唔郁（保留刺繡紋理）
          const dist = Math.abs(lum - aim);
          // blend 低 = 只改極端偏差嘅位置（圖案保留最多）；
          // blend 高 = 全部推向目標（對比最強）
          const need = Math.min(1, Math.pow(dist / 0.5, 0.75) * strength + 0.12 * strength);
          const wanted = lum * (1 - need) + aim * need;

          // 顏色：保留色相，只縮放亮度；淺色模組額外「去色」少少，避免藍色 QR
          const k = lum > 0.01 ? wanted / lum : (dark ? 0.18 : 4);
          let outR = lr * k, outG = lg * k, outB = lb * k;

          if (!dark) {
            // 淺色模組：以紙色為主（米白），只保留少少原圖色相當刺繡紋理。
            // 咁樣深藍底唔會變「淺藍雜訊」，成個章仍然濃郁。
            const hueKeep = 0.22 + 0.26 * (1 - strength);
            const grey = wanted;
            const nr = outR * hueKeep + grey * (1 - hueKeep);
            const ng = outG * hueKeep + grey * (1 - hueKeep);
            const nb = outB * hueKeep + grey * (1 - hueKeep);
            const paperMix = 0.42;
            outR = nr * (1 - paperMix) + (paperRgb[0] / 255) * paperMix;
            outG = ng * (1 - paperMix) + (paperRgb[1] / 255) * paperMix;
            outB = nb * (1 - paperMix) + (paperRgb[2] / 255) * paperMix;
          } else {
            // 深色模組：保留色相，只把亮度壓低
            const tint = 0.08;
            outR = outR * (1 - tint) + (inkRgb[0] / 255) * tint;
            outG = outG * (1 - tint) + (inkRgb[1] / 255) * tint;
            outB = outB * (1 - tint) + (inkRgb[2] / 255) * tint;
          }

          // 軟剪裁
          const maxc = Math.max(outR, outG, outB);
          if (maxc > 1) {
            const inv = 1 / maxc;
            outR *= inv; outG *= inv; outB *= inv;
          }

          data[i] = Math.round(Math.max(0, Math.min(1, outR)) * 255);
          data[i + 1] = Math.round(Math.max(0, Math.min(1, outG)) * 255);
          data[i + 2] = Math.round(Math.max(0, Math.min(1, outB)) * 255);
          data[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(source, 0, 0);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function drawModule(
  ctx: CanvasRenderingContext2D, shape: ModuleShape,
  x: number, y: number, cell: number, r: number, c: number,
) {
  if (shape === 'stitch') {
    // 斜向金線針腳：每格一條 45° 粗線，留少少邊
    const inset = cell * 0.06;
    const grad = ctx.createLinearGradient(x, y + cell, x + cell, y);
    grad.addColorStop(0, ctx.fillStyle as string);
    grad.addColorStop(1, ctx.fillStyle as string);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);
    ctx.clip();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1.2, cell * 0.72);
    ctx.lineCap = 'round';
    const dir = (r + c) % 2 === 0 ? 1 : 1; // 統一斜度，似同一方向落針
    ctx.beginPath();
    ctx.moveTo(x + cell * 0.5 - dir * cell * 0.62, y + cell * 0.62);
    ctx.lineTo(x + cell * 0.5 + dir * cell * 0.62, y + cell * 0.38);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (shape === 'round') {
    const pad = cell * 0.04;
    rr(ctx, x + pad, y + pad, cell - pad * 2, cell - pad * 2, cell * 0.28);
    ctx.fill();
    return;
  }
  ctx.fillRect(x, y, cell + 0.4, cell + 0.4);
}

function drawFinders(
  ctx: CanvasRenderingContext2D, L: SceneLayout, qr: QrModuleMatrix, o: SceneQrOptions, cell: number,
) {
  const n = qr.size;
  const positions: [number, number][] = [[0, 0], [0, n - 7], [n - 7, 0]];
  ctx.fillStyle = o.ink;
  ctx.strokeStyle = o.ink;
  ctx.lineWidth = cell;
  positions.forEach(([r, c]) => {
    const x = L.originX + c * cell;
    const y = L.originY + r * cell;
    // 外 7×7 環
    rr(ctx, x + cell / 2, y + cell / 2, cell * 6, cell * 6, cell * 1.85);
    ctx.stroke();
    // 中央 3×3
    rr(ctx, x + cell * 2, y + cell * 2, cell * 3, cell * 3, cell * 0.85);
    ctx.fill();
  });
}

function drawTiming(ctx: CanvasRenderingContext2D, L: SceneLayout, qr: QrModuleMatrix, o: SceneQrOptions, cell: number) {
  ctx.fillStyle = o.ink;
  for (let i = 8; i < qr.size - 8; i++) {
    if (qr.data[6 * qr.size + i] === 1) {
      ctx.fillRect(L.originX + i * cell, L.originY + 6 * cell, cell + 0.3, cell + 0.3);
    }
    if (qr.data[i * qr.size + 6] === 1) {
      ctx.fillRect(L.originX + 6 * cell, L.originY + i * cell, cell + 0.3, cell + 0.3);
    }
  }
}

function drawEmboss(
  ctx: CanvasRenderingContext2D, L: SceneLayout, qr: QrModuleMatrix,
  o: SceneQrOptions, cell: number, emboss: number,
) {
  const h = Math.max(1, cell * 0.13 * emboss);
  ctx.save();
  ctx.lineCap = 'round';
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      const dark = qr.data[r * qr.size + c] === 1;
      if (!dark) continue;
      if (isFinderZone(r, c, qr.size) || isTiming(r, c, qr.size)) continue;
      const x = L.originX + c * cell;
      const y = L.originY + r * cell;
      // 左上高光
      ctx.strokeStyle = alpha('#ffffff', 0.42 * emboss);
      ctx.lineWidth = h;
      ctx.beginPath();
      ctx.moveTo(x + h * 0.4, y + cell - h * 0.2);
      ctx.lineTo(x + h * 0.4, y + h * 0.4);
      ctx.lineTo(x + cell - h * 0.2, y + h * 0.4);
      ctx.stroke();
      // 右下陰影
      ctx.strokeStyle = alpha('#000000', 0.32 * emboss);
      ctx.beginPath();
      ctx.moveTo(x + cell - h * 0.4, y + h * 0.2);
      ctx.lineTo(x + cell - h * 0.4, y + cell - h * 0.4);
      ctx.lineTo(x + h * 0.2, y + cell - h * 0.4);
      ctx.stroke();
    }
  }
  ctx.restore();

  // 定位眼都加立體感：內圈高光
  const positions: [number, number][] = [[0, 0], [0, qr.size - 7], [qr.size - 7, 0]];
  positions.forEach(([r, c]) => {
    const x = L.originX + c * cell;
    const y = L.originY + r * cell;
    const g = ctx.createLinearGradient(x, y, x + cell * 7, y + cell * 7);
    g.addColorStop(0, alpha('#ffffff', 0.28 * emboss));
    g.addColorStop(0.5, alpha('#ffffff', 0));
    g.addColorStop(1, alpha('#000000', 0.22 * emboss));
    ctx.fillStyle = g;
    rr(ctx, x + cell * 2, y + cell * 2, cell * 3, cell * 3, cell * 0.85);
    ctx.fill();
  });
}

function drawFrame(ctx: CanvasRenderingContext2D, px: number, o: SceneQrOptions, radius: number) {
  const gold = o.ink === '#0a2a47' ? '#c9a24a' : '#cbb26a';
  ctx.save();
  rr(ctx, px * 0.012, px * 0.012, px * 0.976, px * 0.976, radius * 0.96);
  ctx.strokeStyle = alpha(gold, 0.9);
  ctx.lineWidth = px * 0.004;
  ctx.stroke();
  rr(ctx, px * 0.024, px * 0.024, px * 0.952, px * 0.952, radius * 0.93);
  ctx.strokeStyle = alpha(gold, 0.45);
  ctx.lineWidth = px * 0.0016;
  ctx.stroke();
  ctx.restore();
}

function drawSceneText(ctx: CanvasRenderingContext2D, px: number, o: SceneQrOptions, radius: number) {
  const zh = (o.titleZh || '').trim();
  const en = (o.titleEn || '').trim();
  const cap = (o.caption || '').trim();
  if (!zh && !en && !cap) return;
  // 文字放喺最底部靜區以外；靜區一定要保持乾淨，所以只喺有 frame 時畫喺框內邊
  const size = px * 0.026;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const bg = alpha(o.paper, 0.94);
  const y = px - px * 0.045;
  const w = px * 0.8;
  ctx.fillStyle = bg;
  rr(ctx, (px - w) / 2, y - size * 1.15, w, size * 2.3, size);
  ctx.fill();
  ctx.fillStyle = o.ink;
  ctx.font = `700 ${size}px "PingFang HK","Microsoft JhengHei","Noto Sans CJK TC",system-ui,sans-serif`;
  const line = [zh, en].filter(Boolean).join(' · ');
  ctx.fillText(truncate(ctx, line || cap, w * 0.9), px / 2, y);
  ctx.restore();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** 快速分析：回傳自動 mask、夾圖分數（0–1，越高 = 深淺越對位） */
export function analyzeScene(text: string, image: CanvasImageSource | null, paper: string) {
  const lum = imageLuminance(image, paper);
  const qr = makeSceneQr(text);
  const cells = cellLuminance(lum, qr.size);
  const best = pickBestMask(text, cells, qr.size);
  return { count: qr.size, version: qr.version, mask: best.mask, score: best.score };
}

// ── STL（3D 打印）────────────────────────────────────────────────
/**
 * 出一個立體 QR 掛牌：底板 + 深色模組凸起。
 * 單位 mm。預設 100mm × 100mm × 3mm 底板，模組高 1.6mm。
 */
export function buildSceneStl(o: SceneQrOptions, opts?: {
  sizeMm?: number; baseMm?: number; reliefMm?: number; rimMm?: number;
}): ArrayBuffer {
  const qr = makeSceneQr(o.text, typeof o.mask === 'number' ? o.mask : undefined);
  const sizeMm = opts?.sizeMm ?? 100;
  const baseMm = opts?.baseMm ?? 3;
  const reliefMm = opts?.reliefMm ?? 1.6;
  const rimMm = opts?.rimMm ?? 2.2;
  const quiet = Math.max(2, o.quiet);
  const total = qr.size + quiet * 2;
  const cell = sizeMm / total;

  const tris: number[][] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    tris.push([...a, ...b, ...c], [...a, ...c, ...d]);
  };
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    // 底面
    quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]);
    // 頂面
    quad([x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]);
    // 四面
    quad([x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]);
    quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]);
    quad([x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [x0, y1, z0]);
    quad([x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]);
  };

  const half = sizeMm / 2;
  // 底板
  box(-half, -half, 0, half, half, baseMm);
  // 外圈圍邊（方便掛繩）
  if (rimMm > 0) {
    const w = Math.max(cell * 0.9, 1.6);
    const inner = half - w;
    box(-half, -half, baseMm, half, -inner, baseMm + rimMm);
    box(-half, inner, baseMm, half, half, baseMm + rimMm);
    box(-half, -inner, baseMm, -inner, inner, baseMm + rimMm);
    box(inner, -inner, baseMm, half, inner, baseMm + rimMm);
  }
  // 深色模組
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.data[r * qr.size + c] !== 1) continue;
      const x0 = -half + (c + quiet) * cell;
      const y0 = -half + (r + quiet) * cell;
      box(x0, y0, baseMm, x0 + cell, y0 + cell, baseMm + reliefMm);
    }
  }
  // 頂部吊孔位置留空（由使用者自行鑽孔）；輸出前加一個小缺口
  const holeR = sizeMm * 0.035;
  void holeR;

  // 寫 binary STL
  const n = tris.length;
  const buffer = new ArrayBuffer(84 + n * 50);
  const view = new DataView(buffer);
  const encoder = new TextEncoder();
  const header = encoder.encode('Scout district artistic QR - SKWSCOUT');
  new Uint8Array(buffer, 0, 80).set(header.slice(0, 80));
  view.setUint32(80, n, true);
  let offset = 84;
  const normal = (a: number[], b: number[], c: number[]) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  };
  for (const t of tris) {
    const a = [t[0], t[1], t[2]];
    const b = [t[3], t[4], t[5]];
    const c = [t[6], t[7], t[8]];
    const nv = normal(a, b, c);
    [nv[0], nv[1], nv[2]].forEach(v => { view.setFloat32(offset, v, true); offset += 4; });
    [a, b, c].forEach(p => p.forEach(v => { view.setFloat32(offset, v, true); offset += 4; }));
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return buffer;
}
