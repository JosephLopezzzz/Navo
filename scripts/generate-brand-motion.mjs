import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const root = process.cwd();
const output = path.join(root, 'docs/design/navo-brand-motion/previews');
const framesRoot = path.join(root, '.expo/navo-brand-motion');
const source = await readFile(path.join(root, 'assets/navo-mark.svg'), 'utf8');
const defs = source.match(/<defs>([\s\S]*?)<\/defs>/)?.[1];
const paths = [...source.matchAll(/<path\b[^>]*\/>/g)].map((match) => match[0]);
if (!defs || paths.length !== 4) throw new Error('Expected the original body, depth, pin, and white route paths.');
const [body, depth, pin, route] = paths;
const routeGeometry = route.match(/\bd="([^"]+)"/)?.[1];
if (!routeGeometry) throw new Error('The route path is missing.');
await mkdir(output, { recursive: true });
await mkdir(framesRoot, { recursive: true });

const clamp = (value) => Math.max(0, Math.min(1, value));
const settle = (progress) => {
  if (progress <= 0 || progress >= 1) return 0;
  return Math.sin(progress * Math.PI * 2) * Math.sin(progress * Math.PI) ** 2 * (1 - progress * 0.35);
};

function scene(kind, progress) {
  const lightProgress = (progress - 0.08) / 0.66;
  const lightVisible = lightProgress > 0 && lightProgress < 1;
  const lightX = 144 + clamp(lightProgress) * 282;
  const lightOpacity = lightVisible ? Math.sin(lightProgress * Math.PI) ** 2 : 0;
  const pulseProgress = (progress - (kind === 'intro' ? 0.55 : 0.66)) / (kind === 'intro' ? 0.41 : 0.32);
  const pulse = settle(pulseProgress);
  const scaleX = 1 + pulse * (kind === 'intro' ? 0.036 : 0.10);
  const scaleY = 1 - pulse * (kind === 'intro' ? 0.045 : 0.12);
  const lightTint = kind === 'intro' ? '#8CF6F1' : '#39E7DF';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>${defs}
      <clipPath id="motion-route"><path d="${routeGeometry}"/></clipPath>
      <linearGradient id="motion-light" gradientUnits="userSpaceOnUse" x1="${(lightX - 46).toFixed(4)}" y1="0" x2="${(lightX + 46).toFixed(4)}" y2="0">
        <stop offset="0" stop-color="${lightTint}" stop-opacity="0"/>
        <stop offset="0.36" stop-color="${lightTint}" stop-opacity="0.9"/>
        <stop offset="0.62" stop-color="#FFFFFF" stop-opacity="0.45"/>
        <stop offset="1" stop-color="${lightTint}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" fill="#07182F"/>
    ${body}${depth}
    <g transform="translate(386.25 213.13) scale(${scaleX.toFixed(6)} ${scaleY.toFixed(6)}) translate(-386.25 -213.13)">${pin}</g>
    ${route}
    <rect width="512" height="512" clip-path="url(#motion-route)" fill="url(#motion-light)" opacity="${lightOpacity.toFixed(6)}"/>
  </svg>`;
}

const variants = [
  { name: 'intro', size: 512, frameCount: 24, delayMs: 50, maxBytes: 600 * 1024 },
  { name: 'loader', size: 192, frameCount: 28, delayMs: 50, maxBytes: 200 * 1024 },
];
for (const variant of variants) {
  const directory = path.join(framesRoot, variant.name);
  await mkdir(directory, { recursive: true });
  for (let index = 0; index < variant.frameCount; index += 1) {
    const svg = scene(variant.name, index / (variant.frameCount - 1));
    await sharp(Buffer.from(svg)).resize(variant.size, variant.size).png().toFile(path.join(directory, `${String(index).padStart(3, '0')}.png`));
    if (index === Math.floor(variant.frameCount / 2)) {
      await writeFile(path.join(output, `navo-${variant.name}-keyframe.svg`), svg);
    }
  }
}
await sharp(Buffer.from(scene('intro', 0))).png().toFile(path.join(output, 'navo-static.png'));
await writeFile(path.join(framesRoot, 'render.json'), JSON.stringify({
  source: 'assets/navo-mark.svg',
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  background: '#07182F',
  variants,
}, null, 2));

const encoded = spawnSync('python', [path.join(root, 'scripts/encode-brand-motion.py'), framesRoot, output], { stdio: 'inherit' });
if (encoded.error) throw encoded.error;
if (encoded.status !== 0) throw new Error(`GIF encoding failed (${encoded.status}).`);

const readme = `# Navo brand motion previews

Preview assets only. These files are not wired into app startup or loading states.

- \`navo-intro.gif\`: 512 x 512, one-shot, 1.2 seconds. No GIF loop extension.
- \`navo-loader.gif\`: 192 x 192, infinite loop, 1.4 seconds.
- \`navo-static.png\`: settled logo fallback, 512 x 512.
- \`*-keyframe.svg\`: editable sample frames retaining the original paths.
- \`contact-sheet.png\`: decoded GIF stages and a 48-pixel loader review (including actual palette encoding).
- \`manifest.json\`: measured bytes, decoded GIF timing, loop metadata, frame and seam checks.

Run \`node scripts/generate-brand-motion.mjs\` from the repository root. Requires the existing Sharp dependency and Python with Pillow. Rendering frames live in the ignored \`.expo/navo-brand-motion\` directory. Animation timing, route tint, and pin movement are editable in the generator. Every frame uses the original SVG paths and gradients. GIFs have a navy matte; rounded display clipping belongs to the eventual app component.

The first and final source frames are identical. The white route remains present while a pale cyan light passes through its original filled shape. Pin motion is anchored around its tip. The animation contains no text or audio.

## Review before integration

Check the animation at 150 logical pixels for launch and 48 logical pixels for a loader; review gradient banding, the pin hole, tint visibility, and the pause between cycles. Confirm the actual one-shot and looping playback in the target renderer. Keep the native static splash and show a static PNG for Reduce Motion. App readiness, failures, and urgent alarm navigation must never wait for GIF completion.
`;
await writeFile(path.join(output, 'README.md'), readme);
