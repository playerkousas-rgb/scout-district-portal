/**
 * 融合 QR 掃描驗證（開發用）
 * ───────────────────────────────────────────────
 *   npm i --no-save tsx @napi-rs/canvas jsqr pngjs @zxing/library
 *   npx tsx scripts/verify-art-qr-fusion.ts
 *
 * 逐個「內容 × 主題 × 模組形狀 × 融合強度 × 尺寸」渲染，再用
 *   - ZXing（銀行／掃碼 App 常用引擎）→ 必須 100% 通過
 *   - jsQR（較舊、較嚴格嘅開源解碼器）→ 同時報告通過率
 * 有任何 ZXing 失敗即 exit code 1。
 */
import { createCanvas } from '@napi-rs/canvas';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { RGBLuminanceSource, BinaryBitmap, HybridBinarizer, QRCodeReader } from '@zxing/library';
import {
  drawFusionQr, FUSION_THEMES,
  type FusionModuleStyle, type FusionOptions, type FusionTemplate,
} from '../lib/artQrFusion';
import { buildFpsPayload } from '../lib/fps';

function zxingText(png: Buffer): string | null {
  const img = PNG.sync.read(png);
  const gray = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (img.data[i * 4] * 306 + img.data[i * 4 + 1] * 601 + img.data[i * 4 + 2] * 117) >> 10;
  }
  try {
    return new QRCodeReader()
      .decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, img.width, img.height))))
      .getText();
  } catch { return null; }
}

function jsqrText(png: Buffer): string | null {
  const img = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(img.data), img.width, img.height)?.data ?? null;
}

const payloads = [
  buildFpsPayload('102866183', '', 'SKW'),
  buildFpsPayload('102866183', '100', 'CAMP-2026'),
  buildFpsPayload('102866183', '2380.5', 'SKW-CAMP-2026'),
  buildFpsPayload('102866183', '88888.88', 'SHAU-KEI-WAN-DISTRICT-SCOUTS'),
];
const templates = FUSION_THEMES.map(t => t.id) as FusionTemplate[];
const styles: FusionModuleStyle[] = ['square', 'soft'];

let zxPass = 0, jsPass = 0, total = 0;
for (const text of payloads) {
  for (const template of templates) {
    for (const moduleStyle of styles) {
      for (const fusion of [60, 80, 100]) {
        for (const px of [1600, 2000]) {
          total++;
          const opts: FusionOptions = {
            text, template, moduleStyle, fusion,
            brandZh: '筲箕灣區', brandEn: 'SKW', caption: 'HK$100',
          };
          const canvas = createCanvas(px, px);
          drawFusionQr(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, px, opts);
          const png = canvas.toBuffer('image/png');
          const zx = zxingText(png) === text;
          const js = jsqrText(png) === text;
          if (zx) zxPass++;
          if (js) jsPass++;
          if (!zx) console.log(`FAIL zxing: ${template}/${moduleStyle}/f${fusion}/${px}/len${text.length}`);
        }
      }
    }
  }
}

console.log(`ZXing: ${zxPass}/${total} (${((zxPass / total) * 100).toFixed(1)}%)`);
console.log(`jsQR : ${jsPass}/${total} (${((jsPass / total) * 100).toFixed(1)}%)`);
if (zxPass !== total) process.exit(1);
