/**
 * 出文件用樣板圖（開發用）
 * ───────────────────────────────────────────────
 *   npm i --no-save tsx @napi-rs/canvas
 *   npx tsx scripts/make-art-qr-samples.ts
 *
 * 會將四個主題樣板寫入 public/samples/art-qr/，畀 docs/art-qr.md 引用。
 * 內容用區會靜態 FPS 收款 payload（同 /fps 出嘅一模一樣）。
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { drawArtQr, type ArtQrOptions } from '../lib/artQr';
import { buildFpsPayload } from '../lib/fps';

// 有 CJK 字型就先註冊，否則用系統字型
for (const path of [
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/System/Library/Fonts/PingFang.ttc',
]) {
  try { GlobalFonts.registerFromPath(path, 'Noto Sans CJK TC'); } catch { /* 冇都照行 */ }
}

const outDir = join(process.cwd(), 'public', 'samples', 'art-qr');
mkdirSync(outDir, { recursive: true });

const shared: ArtQrOptions = {
  text: buildFpsPayload('102866183', '', 'SKW'),
  brandZh: '香港童軍總會 · 筲箕灣區',
  brandEn: 'SHAU KEI WAN DISTRICT · HONG KONG SCOUTS',
  caption: '掃碼付款 · SCAN TO PAY',
  template: 'lighthouse',
  palette: 'harbour',
  moduleStyle: 'rounded',
  emblem: 'auto',
  logoScale: 0.2,
  artStrength: 0.7,
};

const variants: [string, Partial<ArtQrOptions>][] = [
  ['lighthouse', {}],
  ['badge', { template: 'badge', palette: 'scout' }],
  ['fleur', { template: 'fleur', palette: 'sunset' }],
  ['minimal', { template: 'minimal', palette: 'ink' }],
];

for (const [name, patch] of variants) {
  const canvas = createCanvas(1000, 1000);
  drawArtQr(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, 1000, { ...shared, ...patch });
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, canvas.toBuffer('image/png'));
  console.log('wrote', file);
}
