"""Generate three original, short Navo notification tones (no third-party audio).

Mono PCM16 at 16 kHz keeps all three files together under 150 KiB.
Run: python scripts/generate-additional-alarm-tones.py
"""
from pathlib import Path
import math
import struct
import wave

RATE = 16_000
ROOT = Path(__file__).resolve().parents[1] / "assets" / "sounds"
TONES = {
    "navo_clear_signal.wav": [(0, .20, 784), (.27, .20, 988), (.54, .30, 1175)],
    "navo_gentle_rise.wav": [(0, .42, 523), (.38, .50, 659)],
    "navo_steady_beacon.wav": [(0, .32, 440), (.48, .38, 440)],
}

ROOT.mkdir(parents=True, exist_ok=True)
for name, notes in TONES.items():
    length = max(start + duration for start, duration, _ in notes) + .12
    samples = []
    for index in range(round(length * RATE)):
        time = index / RATE
        value = 0.0
        for start, duration, frequency in notes:
            elapsed = time - start
            if 0 <= elapsed <= duration:
                envelope = min(1, elapsed / .015) * min(1, (duration - elapsed) / .045)
                envelope *= math.exp(-2.0 * elapsed / duration)
                value += .45 * envelope * (math.sin(math.tau * frequency * elapsed) + .12 * math.sin(math.tau * frequency * 2 * elapsed))
        samples.append(round(max(-.95, min(.95, value)) * 32767))
    with wave.open(str(ROOT / name), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(struct.pack("<" + "h" * len(samples), *samples))
    print(f"{name}: {(ROOT / name).stat().st_size} bytes")
