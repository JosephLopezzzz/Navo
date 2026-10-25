import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const mark = await readFile(path.join(root, 'assets/navo-mark.svg'));
const monochrome = await readFile(path.join(root, 'assets/navo-monogram.svg'));
const tile = (size, radius = 0) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#07182F"/></svg>`);

async function renderBrandedIcon(size, outputPath, radius = 0) {
  const background = tile(size, radius);
  const logo = await sharp(mark).resize(size, size).png().toBuffer();
  await sharp(background).composite([{ input: logo }]).png().toFile(outputPath);
}

await renderBrandedIcon(1024, path.join(root, 'assets/icon.png'));
await renderBrandedIcon(196, path.join(root, 'assets/splash-icon.png'), 42);
await renderBrandedIcon(192, path.join(root, 'assets/favicon.png'), 40);
await sharp(mark)
  .resize(460, 460, { fit: 'contain' })
  .extend({ top: 26, bottom: 26, left: 26, right: 26, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(root, 'assets/android-icon-foreground.png'));
await sharp(monochrome).resize(96, 96).png().toFile(path.join(root, 'assets/notification-icon.png'));
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#07182F' } })
  .png().toFile(path.join(root, 'assets/android-icon-background.png'));
