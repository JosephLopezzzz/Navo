import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const mark = await readFile(path.join(root, 'assets/navo-mark.svg'));
const monochrome = await readFile(path.join(root, 'assets/navo-monogram.svg'));

await sharp(mark).resize(1024, 1024).png().toFile(path.join(root, 'assets/icon.png'));
await sharp(mark).resize(196, 196).png().toFile(path.join(root, 'assets/splash-icon.png'));
await sharp(mark).resize(192, 192).png().toFile(path.join(root, 'assets/favicon.png'));
await sharp(monochrome).resize(512, 512).png().toFile(path.join(root, 'assets/android-icon-foreground.png'));
await sharp(monochrome).resize(96, 96).png().toFile(path.join(root, 'assets/notification-icon.png'));
await sharp(monochrome).resize(432, 432).png().toFile(path.join(root, 'assets/android-icon-monochrome.png'));
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#2478E6' } })
  .png().toFile(path.join(root, 'assets/android-icon-background.png'));
