import { PNG } from 'pngjs'; import { readFileSync } from 'fs';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';
import jsQR from 'jsqr';
for (const f of process.argv.slice(2)) {
  const img = PNG.sync.read(readFileSync(f)); const rgba = new Uint8ClampedArray(img.data);
  const gray = new Uint8ClampedArray(img.width*img.height);
  for (let i=0;i<gray.length;i++) gray[i]=(rgba[i*4]*306+rgba[i*4+1]*601+rgba[i*4+2]*117)>>10;
  let z='FAIL'; try { z = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray,img.width,img.height)))).getText().slice(0,30); } catch {}
  console.log(f.split('/').pop(), '| ZX:', z, '| js:', jsQR(rgba,img.width,img.height)?.data?.slice(0,30) ?? 'FAIL');
}
