"""Generate candidate LeetGit icon designs for review (128px previews).

Produces variant_*.png in ./previews. Pure stdlib, no image deps.
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
WHITE = (245, 245, 250)
EASY = (0, 184, 163)
MEDIUM = (255, 161, 22)
HARD = (239, 71, 67)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def png_chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path, px):
    h = len(px)
    w = len(px[0])
    raw = bytearray()
    for row in px:
        raw.append(0)
        for r, g, b, a in row:
            raw.extend((r, g, b, a))
    png = b"\x89PNG\r\n\x1a\n"
    png += png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += png_chunk(b"IEND", b"")
    path.write_bytes(png)


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def corner_alpha(x, y, size, radius):
    cx = min(max(x + 0.5, radius), size - radius)
    cy = min(max(y + 0.5, radius), size - radius)
    d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
    if d > radius:
        return max(0, int(255 * (1 - (d - radius))))
    return 255


def base_grid(size, kind="gradient"):
    grid = []
    for y in range(size):
        row = []
        for x in range(size):
            if kind == "gradient":
                t = (x + y) / (2 * (size - 1))
                col = lerp(PURPLE, CYAN, t)
            else:  # dark navy diagonal
                t = (x + y) / (2 * (size - 1))
                col = lerp(NAVY_A, NAVY_B, t)
            row.append([col[0], col[1], col[2], corner_alpha(x, y, size, size * 0.24)])
        grid.append(row)
    return grid


def variant_slash(size):
    g = base_grid(size, "gradient")
    stroke = size * 0.085
    for y in range(size):
        for x in range(size):
            band = abs((x + 0.5) + (y + 0.5) - size)
            if band < stroke and size * 0.2 < x < size * 0.8:
                g[y][x][:3] = list(WHITE)
    return g


def variant_brackets(size):
    g = base_grid(size, "gradient")
    s = size
    w = s * 0.06
    # "<" left chevron
    left = [(0.34 * s, 0.30 * s), (0.20 * s, 0.5 * s), (0.34 * s, 0.70 * s)]
    # ">" right chevron
    right = [(0.66 * s, 0.30 * s), (0.80 * s, 0.5 * s), (0.66 * s, 0.70 * s)]
    # "/" slash
    slash = [(0.58 * s, 0.26 * s), (0.42 * s, 0.74 * s)]
    for y in range(size):
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            d = min(
                seg_dist(px, py, *left[0], *left[1]),
                seg_dist(px, py, *left[1], *left[2]),
                seg_dist(px, py, *right[0], *right[1]),
                seg_dist(px, py, *right[1], *right[2]),
                seg_dist(px, py, *slash[0], *slash[1]),
            )
            if d < w:
                g[y][x][:3] = list(WHITE)
    return g


def variant_check(size):
    g = base_grid(size, "gradient")
    s = size
    w = s * 0.08
    a = (0.28 * s, 0.52 * s)
    b = (0.44 * s, 0.68 * s)
    c = (0.74 * s, 0.34 * s)
    for y in range(size):
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            d = min(seg_dist(px, py, *a, *b), seg_dist(px, py, *b, *c))
            if d < w:
                g[y][x][:3] = list(WHITE)
    return g


def variant_bars(size):
    g = base_grid(size, "navy")
    s = size
    bars = [
        (0.22, 0.42, EASY),    # x-center fraction, height fraction, color
        (0.50, 0.62, MEDIUM),
        (0.78, 0.80, HARD),
    ]
    bw = s * 0.14
    base_y = 0.80 * s
    for y in range(size):
        for x in range(size):
            for cxf, hf, col in bars:
                cx = cxf * s
                top = base_y - hf * s
                if abs(x + 0.5 - cx) < bw / 2 and top < y + 0.5 < base_y:
                    g[y][x][:3] = list(col)
    return g


def variant_merge(size):
    g = base_grid(size, "navy")
    s = size
    w = s * 0.05
    nodes = [(0.32 * s, 0.30 * s, PURPLE), (0.32 * s, 0.70 * s, PURPLE), (0.68 * s, 0.50 * s, CYAN)]
    rad = s * 0.085
    for y in range(size):
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            # vertical line between top and bottom nodes
            d_line = seg_dist(px, py, 0.32 * s, 0.30 * s, 0.32 * s, 0.70 * s)
            # branch line from bottom node to right node
            d_branch = seg_dist(px, py, 0.32 * s, 0.70 * s, 0.68 * s, 0.50 * s)
            if min(d_line, d_branch) < w:
                g[y][x][:3] = list(CYAN)
            for nx, ny, col in nodes:
                if math.hypot(px - nx, py - ny) < rad:
                    g[y][x][:3] = list(col)
    return g


def main():
    out = Path(__file__).parent / "previews"
    out.mkdir(exist_ok=True)
    variants = {
        "1_slash": variant_slash,
        "2_brackets": variant_brackets,
        "3_bars": variant_bars,
        "4_check": variant_check,
        "5_merge": variant_merge,
    }
    for name, fn in variants.items():
        write_png(out / f"variant_{name}.png", fn(128))
        print(f"wrote variant_{name}.png")


if __name__ == "__main__":
    main()
