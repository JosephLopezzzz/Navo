"""Encode the generator's SVG-rendered frames with a single stable GIF palette."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

frames_root, output = map(Path, sys.argv[1:3])
render = json.loads((frames_root / 'render.json').read_text(encoding='utf-8'))
report = {key: render[key] for key in ('source', 'sourceSha256', 'background')}
report['variants'] = []
sheet = Image.new('RGB', (1024, 610), '#EDF3F9')
draw = ImageDraw.Draw(sheet)

for row, variant in enumerate(render['variants']):
    frames = [Image.open(frames_root / variant['name'] / f'{index:03d}.png').convert('RGB')
              for index in range(variant['frameCount'])]
    samples = Image.new('RGB', (128 * len(frames), 128))
    for index, frame in enumerate(frames):
        samples.paste(frame.resize((128, 128), Image.Resampling.LANCZOS), (index * 128, 0))
    palette = samples.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    # A fixed ordered pattern smooths gradients without error diffusion making
    # stationary logo pixels shimmer when the pin or route highlight moves.
    bayer = (0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5)
    size = variant['size']
    noise = Image.frombytes('L', (size, size), bytes(
        128 + round((bayer[(y % 4) * 4 + x % 4] - 7.5) * .8)
        for y in range(size) for x in range(size))).convert('RGB')
    background = Image.new('RGB', (size, size), render['background'])
    quantized = []
    for frame in frames:
        shifted = ImageChops.add(frame, noise, scale=1, offset=-128)
        red, green, blue = frame.split()
        nonwhite = ImageChops.darker(ImageChops.darker(red, green), blue).point(lambda value: 0 if value > 240 else 255)
        nonbackground = ImageChops.difference(frame, background).convert('L').point(lambda value: 255 if value else 0)
        dithered = Image.composite(shifted, frame, ImageChops.multiply(nonwhite, nonbackground))
        quantized.append(dithered.quantize(palette=palette, dither=Image.Dither.NONE))
    filename = f"navo-{variant['name']}.gif"
    gif_path = output / filename
    options = {'loop': 0} if variant['name'] == 'loader' else {}
    quantized[0].save(gif_path, save_all=True, append_images=quantized[1:],
                      duration=variant['delayMs'], disposal=1, optimize=False, **options)

    with Image.open(gif_path) as gif:
        actual_frames = []
        frame_durations = []
        duration = 0
        for index in range(gif.n_frames):
            gif.seek(index)
            duration += gif.info.get('duration', 0)
            frame_durations.append(gif.info.get('duration', 0))
            actual_frames.append(gif.convert('RGB').copy())
        loop = gif.info.get('loop')
        expected_duration = variant['frameCount'] * variant['delayMs']
        if duration != expected_duration:
            raise RuntimeError(f'{filename}: timing mismatch {duration} != {expected_duration}')
        if (variant['name'] == 'intro' and loop is not None) or (variant['name'] == 'loader' and loop != 0):
            raise RuntimeError(f'{filename}: unexpected loop metadata {loop}')
        seam_difference = ImageChops.difference(actual_frames[0], actual_frames[-1]).getbbox()
        if seam_difference is not None:
            raise RuntimeError(f'{filename}: first and final decoded frames differ')
        body_box = tuple(round(value * variant['size'] / 512) for value in (100, 190, 150, 280))
        settled_body = actual_frames[0].crop(body_box)
        if any(ImageChops.difference(settled_body, frame.crop(body_box)).getbbox() for frame in actual_frames):
            raise RuntimeError(f'{filename}: stationary body pixels shimmer')
        if gif_path.stat().st_size > variant['maxBytes']:
            raise RuntimeError(f'{filename}: exceeds size budget')
        delta_pixels = [frame.width * frame.height - ImageChops.difference(actual_frames[0], frame).convert('L').histogram()[0]
                        for frame in actual_frames]
        report['variants'].append({
            'file': filename, 'width': gif.width, 'height': gif.height,
            'renderedFrames': len(frames), 'encodedFrames': gif.n_frames,
            'durationMs': duration, 'loop': loop, 'bytes': gif_path.stat().st_size,
            'firstAndLastDecodedFramesMatch': True,
            'stationaryBodyPixelsStable': True,
            'maxChangedPixelsFromSettledFrame': max(delta_pixels),
            'maxBytes': variant['maxBytes'],
            'palette': 'shared 256 colors, fixed ordered dither',
        })

    def decoded_at(progress):
        target = progress * (duration - 1)
        elapsed = 0
        for frame, frame_duration in zip(actual_frames, frame_durations):
            elapsed += frame_duration
            if elapsed > target:
                return frame
        return actual_frames[-1]

    y = 24 + row * 260
    draw.text((16, y), f"{variant['name'].upper()} — {duration} ms, {gif_path.stat().st_size // 1024} KiB", fill='#07182F')
    review_stages = (0, .25, .5, .7 if variant['name'] == 'intro' else .78, 1)
    for column, progress in enumerate(review_stages):
        frame = decoded_at(progress)
        sheet.paste(frame.resize((180, 180), Image.Resampling.LANCZOS), (16 + column * 202, y + 26))
        draw.text((16 + column * 202, y + 210), f'{progress * 100:.0f}%', fill='#07182F')

    if variant['name'] == 'loader':
        for column, progress in enumerate(review_stages):
            frame = decoded_at(progress)
            sheet.paste(frame.resize((48, 48), Image.Resampling.LANCZOS), (16 + column * 202, 554))
        draw.text((80, 570), '48 px', fill='#41546C')

sheet.save(output / 'contact-sheet.png')
(output / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))
