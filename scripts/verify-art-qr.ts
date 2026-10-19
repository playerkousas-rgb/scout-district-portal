/**
 * 藝術 QR 掃描驗證（開發用，唔會打包入網站）
 * ═══════════════════════════════════════════════════════════════
 * 用真 QR 解碼器逐一試：4 個主題 × 4 個配色 × 4 種方塊 × 3 個徽章大小，
 * 再加 ZXing（大部分手機掃描器核心）覆核。
 *
 * 行法（唔想加落 devDependencies，用 --no-save 臨時裝）：
 *   npm i --no-save tsx @napi-rs/canvas jsqr pngjs @zxing/library
 *   npx tsx scripts/verify-art-qr.ts
 *
 * 會將失敗樣本寫入 /tmp/artqr-fail-*.png，方便打開睇邊度出事。
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';
import {
  drawArtQr, type ArtQrModuleStyle, type ArtQrOptions, type ArtQrPalette, type ArtQrTemplate,
} from '../lib/artQr';
import { buildFpsPayload } from '../lib/fps';

// 如要睇中文排版，可以自己放一個 CJK 字型落 /tmp 再開呢行：
// GlobalFonts.registerFromPath('/path/to/NotoSansCJK.ttc', 'Noto Sans CJK TC');

const texts = [
  buildFpsPayload('102866183', '', 'SKW'),
  buildFpsPayload('102866183', '100', 'CAMP-2026'),
  'https://www.skwscout.org.hk',
];
const templates: ArtQrTemplate[] = ['lighthouse', 'badge', 'fleur', 'minimal'];
const palettes: ArtQrPalette[] = ['harbour', 'scout', 'sunset', 'ink'];
const styles: ArtQrModuleStyle[] = ['rounded', 'dot', 'diamond', 'square'];

function decodeJs(png: Buffer): string | null {
  const img = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(img.data), img.width, img.height)?.data ?? null;
}

function decodeZxing(png: Buffer): string | null {
  const img = PNG.sync.read(png);
  const rgba = new Uint8ClampedArray(img.data);
  const gray = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (rgba[i * 4] * 306 + rgba[i * 4 + 1] * 601 + rgba[i * 4 + 2] * 117) >> 10;
  }
  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, img.width, img.height)));
    return new QRCodeReader().decode(bitmap).getText();
  } catch {
    return null;
  }
}

let total = 0;
let jsFails = 0;
let zxFails = 0;
const failures: string[] = [];

for (const text of texts) {
  for (const template of templates) {
    for (const palette of palettes) {
      for (const moduleStyle of styles) {
        for (const logoScale of [0.18, 0.2, 0.24]) {
          const opts: ArtQrOptions = {
            text, template, palette, moduleStyle, logoScale, emblem: 'auto', artStrength: 0.7,
            brandZh: '香港童軍總會 · 筲箕灣區',
            brandEn: 'SHAU KEI WAN DISTRICT · HONG KONG SCOUTS',
            caption: '掃碼付款 · SCAN TO PAY',
          };
          const canvas = createCanvas(800, 800);
          drawArtQr(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, 800, opts);
          const png = canvas.toBuffer('image/png');
          const label = `${text.slice(0, 12)}… ${template}/${palette}/${moduleStyle}/${logoScale}`;
          total++;
          if (decodeZxing(png) !== text) { zxFails++; failures.push(`ZXing  ${label}`); writeFileSync(`/tmp/artqr-fail-${total}.png`, png); }
          if (decodeJs(png) !== text) { jsFails++; failures.push(`jsQR   ${label}`); }
        }
      }
    }
  }
}

console.log(`ZXing（手機掃描器核心）：${total - zxFails}/${total} 通過`);
console.log(`jsQR（較嚴格嘅參考解碼器）：${total - jsFails}/${total} 通過`);
if (failures.length) console.log(failures.slice(0, 40).join('\n'));
process.exitCode = zxFails === 0 ? 0 : 1;
