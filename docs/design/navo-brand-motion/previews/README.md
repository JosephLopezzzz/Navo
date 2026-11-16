# Navo brand motion previews

Preview assets only. These files are not wired into app startup or loading states.

- `navo-intro.gif`: 512 x 512, one-shot, 1.2 seconds. No GIF loop extension.
- `navo-loader.gif`: 192 x 192, infinite loop, 1.4 seconds.
- `navo-static.png`: settled logo fallback, 512 x 512.
- `*-keyframe.svg`: editable sample frames retaining the original paths.
- `contact-sheet.png`: decoded GIF stages and a 48-pixel loader review (including actual palette encoding).
- `manifest.json`: measured bytes, decoded GIF timing, loop metadata, frame and seam checks.

Run `node scripts/generate-brand-motion.mjs` from the repository root. Requires the existing Sharp dependency and Python with Pillow. Rendering frames live in the ignored `.expo/navo-brand-motion` directory. Animation timing, route tint, and pin movement are editable in the generator. Every frame uses the original SVG paths and gradients. GIFs have a navy matte; rounded display clipping belongs to the eventual app component.

The first and final source frames are identical. The white route remains present while a pale cyan light passes through its original filled shape. Pin motion is anchored around its tip. The animation contains no text or audio.

## Review before integration

Check the animation at 150 logical pixels for launch and 48 logical pixels for a loader; review gradient banding, the pin hole, tint visibility, and the pause between cycles. Confirm the actual one-shot and looping playback in the target renderer. Keep the native static splash and show a static PNG for Reduce Motion. App readiness, failures, and urgent alarm navigation must never wait for GIF completion.
