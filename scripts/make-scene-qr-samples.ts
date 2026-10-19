/**
 * 出文件用場景 QR 樣板（開發用）
 *   npm i --no-save tsx @napi-rs/canvas
 *   npx tsx scripts/make-scene-qr-samples.ts
 * 寫入 public/samples/scene-qr/，畀 docs/art-qr.md 引用。
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { drawSceneQr, type SceneQrOptions } from '../lib/sceneQr';
import { buildFpsPayload } from '../lib/fps';

(globalThis as unknown as { document: { createElement: () => unknown } }).document = {
  createElement: () => createCanvas(256, 256),
};

async function main() {
  const outDir = join(process.cwd(), 'public', 'samples', 'scene-qr');
  mkdirSync(outDir, { recursive: true });
  const text = buildFpsPayload('102866183', '', 'SKW');
  const base: SceneQrOptions = {
    text, image: null, style: 'badge', blend: 0.85, emboss: 0.65,
    moduleShape: 'stitch', ink: '#0a2a47', paper: '#f7f0dd', quiet: 3,
    frame: true, corner: 0.1, titleZh: '', titleEn: '', caption: '', mask: 'auto',
  };
  const variants: [string, string, Partial<SceneQrOptions>][] = [
    ['badge-stitch', 'public/art/badge-lighthouse.jpg', { moduleShape: 'stitch', blend: 0.85, emboss: 0.65 }],
    ['badge-flat', 'public/art/badge-lighthouse.jpg', { moduleShape: 'square', blend: 0.9, emboss: 0 }],
    ['poster', 'public/art/lighthouse-dusk.jpg', { moduleShape: 'square', blend: 0.92, emboss: 0.3 }],
  ];
  for (const [name, file, patch] of variants) {
    const img = await loadImage(readFileSync(join(process.cwd(), file)));
    const canvas = createCanvas(1200, 1200);
    drawSceneQr(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, 1200,
      { ...base, ...patch, image: img });
    writeFileSync(join(outDir, `${name}.png`), canvas.toBuffer('image/png'));
    console.log('wrote', name);
  }
}

main();
