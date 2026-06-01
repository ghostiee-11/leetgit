"""Generate LeetGit PNG icons (16/48/128) with no third-party deps.

A rounded square with a purple->cyan diagonal gradient and a white code slash.
Run: python generate_icons.py
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

ACCENT = (124, 92, 255)   # purple
ACCENT_2 = (56, 189, 248)  # cyan
WHITE = (245, 245, 250)


def _lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def _write_png(path: Path, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    height = len(pixels)
    width = len(pixels[0])
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0
        for r, g, b, a in row:
            raw.extend((r, g, b, a))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += _png_chunk(b"IHDR", ihdr)
    png += _png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += _png_chunk(b"IEND", b"")
    path.write_bytes(png)


def _make(size: int) -> list[list[tuple[int, int, int, int]]]:
    radius = size * 0.24
    stroke = max(1.4, size * 0.085)
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            # Diagonal gradient factor.
            t = (x + y) / (2 * (size - 1))
            r = _lerp(ACCENT[0], ACCENT_2[0], t)
            g = _lerp(ACCENT[1], ACCENT_2[1], t)
            b = _lerp(ACCENT[2], ACCENT_2[2], t)
            alpha = 255

            # Rounded corners.
            cx = min(max(x + 0.5, radius), size - radius)
            cy = min(max(y + 0.5, radius), size - radius)
            dist = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5
            if dist > radius:
                alpha = max(0, int(255 * (1 - (dist - radius))))

            # White code slash (anti-diagonal) through the middle.
            band = abs((x + 0.5) + (y + 0.5) - size)
            if band < stroke and size * 0.2 < x < size * 0.8:
                r, g, b = WHITE

            row.append((r, g, b, alpha))
        rows.append(row)
    return rows


def main() -> None:
    out_dir = Path(__file__).parent
    for size in (16, 48, 128):
        _write_png(out_dir / f"icon{size}.png", _make(size))
        print(f"wrote icon{size}.png")


if __name__ == "__main__":
    main()
