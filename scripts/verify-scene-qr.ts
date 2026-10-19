/**
 * 場景 QR 掃描驗證（開發用）
 * ─────────────────────────────────────────────────────────────
 *   npm i --no-save tsx @napi-rs/canvas jsqr pngjs @zxing/library
 *   npx tsx scripts/verify-scene-qr.ts
 *
 * 會用內建兩張圖 × 3 種模組 × 4 個融圖強度 × 3 個靜區，逐張解碼。
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';
import { drawSceneQr, type ModuleShape, type SceneQrOptions } from '../lib/sceneQr';
import { buildFpsPayload } from '../lib/fps';

// imageLuminance() 用 document.createElement('canvas')；喺 Node 用 @napi-rs/canvas 代替
(globalThis as unknown as { document: { createElement: () => unknown } }).document = {
  createElement: () => createCanvas(256, 256),
};

function decodeZxing(png: Buffer): string | null {
  const img = PNG.sync.read(png);
  const rgba = new Uint8ClampedArray(img.data);
  const gray = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (rgba[i * 4] * 306 + rgba[i * 4 + 1] * 601 + rgba[i * 4 + 2] * 117) >> 10;
  }
  try {
    return new QRCodeReader()
      .decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, img.width, img.height))))
      .getText();
  } catch { return null; }
}

function decodeJs(png: Buffer): string | null {
  const img = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(img.data), img.width, img.height)?.data ?? null;
}

async function main() {
  const payload = buildFpsPayload('102866183', '', 'SKW');
  const images = [
    { name: 'badge', file: 'public/art/badge-lighthouse.jpg' },
    { name: 'poster', file: 'public/art/lighthouse-dusk.jpg' },
  ].filter(i => existsSync(join(process.cwd(), i.file)));

  const base: SceneQrOptions = {
    text: payload, image: null, style: 'badge', blend: 0.85, emboss: 0.6,
    moduleShape: 'stitch', ink: '#0a2a47', paper: '#f7f0dd', quiet: 3,
    frame: true, corner: 0.1, titleZh: '', titleEn: '', caption: '', mask: 'auto',
  };

  let total = 0, zxFails = 0, jsFails = 0;
  const fails: string[] = [];

  for (const entry of images) {
    const img = await loadImage(readFileSync(join(process.cwd(), entry.file)));
    for (const moduleShape of ['square', 'stitch', 'round'] as ModuleShape[]) {
      for (const blend of [0.6, 0.75, 0.85, 1]) {
        for (const quiet of [2, 3, 4]) {
          const canvas = createCanvas(900, 900);
          drawSceneQr(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, 900,
            { ...base, image: img, moduleShape, blend, quiet });
          const png = canvas.toBuffer('image/png');
          const label = `${entry.name}/${moduleShape}/blend=${blend}/quiet=${quiet}`;
          total++;
          if (decodeZxing(png) !== payload) { zxFails++; fails.push(`ZXing ${label}`); writeFileSync(`/tmp/sceneqr-fail-${total}.png`, png); }
          if (decodeJs(png) !== payload) { jsFails++; fails.push(`jsQR  ${label}`); }
        }
      }
    }
  }
  console.log(`ZXing：${total - zxFails}/${total} 通過`);
  console.log(`jsQR：${total - jsFails}/${total} 通過`);
  if (fails.length) console.log(fails.slice(0, 20).join('\n'));
  process.exitCode = zxFails === 0 ? 0 : 1;
}

main();
