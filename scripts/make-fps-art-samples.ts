/**
 * 出 FPS 融合 QR 樣板（開發用）
 *   npm i --no-save tsx @napi-rs/canvas
 *   npx tsx scripts/make-fps-art-samples.ts
 *
 * 會喺 public/samples/fps-art/ 出三張：
 *   區章（靜態）、區章（HK$100）、燈塔
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { drawFullArtQr, type FullArtOptions } from '../lib/artQrFull';
import { buildFpsPayload } from '../lib/fps';

/** 有 CJK 字型先好用中文標語，否則 node canvas 會出豆腐格。 */
let hasCjk = false;
for (const path of [
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/System/Library/Fonts/PingFang.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
]) {
  try { hasCjk = GlobalFonts.registerFromPath(path, 'Noto Sans CJK TC') > 0; } catch { /* 冇都照行 */ }
  if (hasCjk) break;
}

const out = join(process.cwd(), 'public', 'samples', 'fps-art');
mkdirSync(out, { recursive: true });

const base: Omit<FullArtOptions, 'text' | 'source'> = {
  fusion: 0.9, ecl: 'Q', autoMask: true, moduleStyle: 'square',
  quietZone: 4, paper: '#ffffff',
  caption: hasCjk ? '掃碼付款 · SCAN TO PAY' : 'SKW SCOUT · SCAN TO PAY',
};

const samples: [string, string, Partial<FullArtOptions>][] = [
  ['district-badge', buildFpsPayload('102866183', '', 'SKW'), { source: 'badge' }],
  ['district-badge-hk100', buildFpsPayload('102866183', '100', 'CAMP-2026'), { source: 'badge' }],
  ['lighthouse', buildFpsPayload('102866183', '', 'SKW'), { source: 'lighthouse' }],
];

for (const [name, text, patch] of samples) {
  const size = 1200;
  const canvas = createCanvas(size, size);
  drawFullArtQr(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, size, {
    ...base, text, source: 'badge', ...patch,
    makeCanvas: (w, h) => createCanvas(w, h) as unknown as { width: number; height: number; getContext(t: '2d'): CanvasRenderingContext2D | null },
  });
  writeFileSync(join(out, `${name}.png`), canvas.toBuffer('image/png'));
  console.log('wrote', name);
}
