"""Generate LeetGit PNG icons (16/48/128) with no third-party deps.

Design: a git branch-merge graphic (two purple nodes joined by a branch to a
cyan node) on a dark navy rounded square. Run: python generate_icons.py
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

PURPLE = (124, 92, 255)
CYAN = (56, 189, 248)
NAVY_A = (40, 38, 70)
NAVY_B = (22, 21, 40)


def _lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _corner_alpha(x, y, size, radius):
    cx = min(max(x + 0.5, radius), size - radius)
    cy = min(max(y + 0.5, radius), size - radius)
    d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
    if d > radius:
        return max(0, int(255 * (1 - (d - radius))))
    return 255


def _png_chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def _write_png(path: Path, px) -> None:
    h, w = len(px), len(px[0])
    raw = bytearray()
    for row in px:
        raw.append(0)
        for r, g, b, a in row:
            raw.extend((r, g, b, a))
    png = b"\x89PNG\r\n\x1a\n"
    png += _png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += _png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += _png_chunk(b"IEND", b"")
    path.write_bytes(png)


def _make(size: int):
    s = size
    radius = s * 0.24
    stroke = max(1.0, s * 0.055)
    node_r = max(1.6, s * 0.095)
    top = (0.32 * s, 0.30 * s)
    bottom = (0.32 * s, 0.70 * s)
    right = (0.68 * s, 0.50 * s)
    nodes = [(top, PURPLE), (bottom, PURPLE), (right, CYAN)]

    rows = []
    for y in range(s):
        row = []
        for x in range(s):
            t = (x + y) / (2 * (s - 1))
            col = list(_lerp(NAVY_A, NAVY_B, t))
            alpha = _corner_alpha(x, y, s, radius)

            px, py = x + 0.5, y + 0.5
            d_line = _seg_dist(px, py, *top, *bottom)
            d_branch = _seg_dist(px, py, *bottom, *right)
            if min(d_line, d_branch) < stroke:
                col = list(CYAN)
            for (nx, ny), ncol in nodes:
                if math.hypot(px - nx, py - ny) < node_r:
                    col = list(ncol)

            row.append((col[0], col[1], col[2], alpha))
        rows.append(row)
    return rows


def main() -> None:
    out_dir = Path(__file__).parent
    for size in (16, 48, 128):
        _write_png(out_dir / f"icon{size}.png", _make(size))
        print(f"wrote icon{size}.png")


if __name__ == "__main__":
    main()
