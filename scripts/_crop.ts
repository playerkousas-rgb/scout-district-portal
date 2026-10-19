import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
(async () => {
  const [f, out, sx, sy, sw, sh, scale] = process.argv.slice(2);
  const img = await loadImage(f);
  const s = Number(scale || 2);
  const c = createCanvas(Number(sw) * s, Number(sh) * s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Number(sx), Number(sy), Number(sw), Number(sh), 0, 0, Number(sw) * s, Number(sh) * s);
  writeFileSync(out, c.toBuffer('image/png'));
})();
