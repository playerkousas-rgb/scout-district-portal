/**
 * 驗證「藝術 QR」：162 個組合（3 圖案 × M/Q/H × square/rounded/dot × 3 金額 × 600/1200px）
 *
 * 重要：ZXing 嘅 JS 版對部份「完全正確」嘅 QR 都會偵測失敗（例如 M/版本4/mask 6，
 * 純黑白都掃唔到 —— 係佢 calculateModuleSize 嘅問題，唔關圖案事）。
 * 所以每個組合都會另外畫一個「純黑白對照組」：
 *   · 對照組都掃唔到 → 算 ZXing 本身嘅限制，唔計入我哋嘅失誤
 *   · 對照組掃到、藝術版掃唔到 → 真正由圖案造成嘅失誤（呢個數要係 0）
 *
 * 用法：
 *   npx tsx scripts/verify-fps-art.ts
 *   DUMP=1 npx tsx scripts/verify-fps-art.ts   # 失敗個案寫去 /tmp/zf-*.png
 */
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import jsQR from 'jsqr';
import {
  QRCodeReader, BinaryBitmap, HybridBinarizer, RGBLuminanceSource,
} from '@zxing/library';
import { drawFullArtQr, makeMatrix, type FullArtOptions, type FullArtSource, type Ecl, type FullArtModuleStyle } from '../lib/artQrFull';
import { buildFpsPayload } from '../lib/fps';

const reader = new QRCodeReader();

function decodeCanvas(canvas: any): { zx: string | null; js: string | null } {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const rgba = ctx.getImageData(0, 0, width, height).data as Uint8ClampedArray;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114) | 0;
  }
  let zxing: string | null = null;
  try {
    zxing = reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, width, height)))).getText();
  } catch { zxing = null; }
  const js = jsQR(rgba, width, height)?.data ?? null;
  return { zxing, js };
}

/** 純黑白對照組：同一個 matrix、同一 mask、同一版面，但只用黑／白。 */
function plainCanvas(text: string, ecl: Ecl, mask: number, px: number, quiet: number) {
  const m = makeMatrix(text, ecl, mask);
  const n = m.size;
  const cell = Math.max(1, Math.floor(px / (n + quiet * 2)));
  const qrSize = n * cell;
  const x0 = Math.round((px - qrSize) / 2);
  const canvas = createCanvas(px, px);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (m.dark(r, c)) ctx.fillRect(x0 + c * cell, x0 + r * cell, cell, cell);
    }
  }
  return canvas;
}

const amounts: [string, string][] = [
  ['', ''],
  ['100', 'CAMP-2026'],
  ['1250.50', 'SKW-2026-ACTIVITY'],
];
const sources: FullArtSource[] = ['badge', 'lighthouse', 'custom'];
const ecls: Ecl[] = ['M', 'Q', 'H'];
const styles: FullArtModuleStyle[] = ['square', 'rounded', 'dot'];

let total = 0;
let zxRaw = 0;      // ZXing 原始通過數
let zxBase = 0;     // 對照組通過數（ZXing 有能力掃到嘅上限）
let zxArt = 0;      // 藝術版通過數
let jsArt = 0;
let jsBase = 0;
const artFailures: string[] = [];
const baseFailures: string[] = [];

for (const source of sources) {
  for (const ecl of ecls) {
    for (const moduleStyle of styles) {
      for (const [amount, reference] of amounts) {
        const text = buildFpsPayload('102866183', amount, reference);
        for (const px of [600, 1200]) {
          const canvas = createCanvas(px, px);
          const opts: FullArtOptions = {
            text, source, fusion: 0.9, ecl, autoMask: true, moduleStyle,
            quietZone: 4, paper: '#ffffff', caption: '',
            makeCanvas: (w, h) => createCanvas(w, h) as never,
          };
          const res = drawFullArtQr(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, px, opts);
          const r = decodeCanvas(canvas);

          const base = decodeCanvas(plainCanvas(text, ecl, res.mask, px, 4));

          total++;
          const label = `${source}/${ecl}/${moduleStyle}/${px}/${amount || 'static'}`;

          if (r.zxing === text) { zxRaw++; zxArt++; }
          if (r.js === text) jsArt++;
          if (base.zxing === text) zxBase++;
          if (base.js === text) jsBase++;

          const baseOkZx = base.zxing === text;
          const baseOkJs = base.js === text;

          if (baseOkZx && r.zxing !== text) {
            artFailures.push(`ZXing  ${label}`);
            if (process.env.DUMP) writeFileSync(`/tmp/zf-${source}-${ecl}-${moduleStyle}-${px}-${amount || 'static'}.png`, canvas.toBuffer('image/png'));
          }
          if (!baseOkZx) baseFailures.push(`ZXing  ${label}`);
          if (baseOkJs && r.js !== text) artFailures.push(`jsQR   ${label}`);
        }
      }
    }
  }
}

console.log(`總共 ${total} 個組合`);
console.log(`ZXing 原始： ${zxRaw}/${total}`);
console.log(`ZXing 對照組（純黑白）可以掃到嘅： ${zxBase}/${total}`);
console.log(`ZXing 藝術版： ${zxArt}/${total}`);
console.log(`jsQR 對照組： ${jsBase}/${total}　藝術版： ${jsArt}/${total}`);
console.log('');
console.log(`★ 由圖案造成嘅失誤： ${artFailures.length}`);
if (artFailures.length) console.log(artFailures.join('\n'));
console.log(`（ZXing 自己掃唔到純黑白 QR 嘅組合： ${baseFailures.length}，唔計入失誤）`);
process.exitCode = artFailures.length === 0 ? 0 : 1;
