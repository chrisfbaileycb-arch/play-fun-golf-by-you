"""Rasterise the Arcade Links icon to PNG (192/512, plus maskable) with the stdlib only."""
import math
import struct
import sys
import zlib
from pathlib import Path


def lerp(a, b, t):
    return a + (b - a) * t


def render(size, maskable=False):
    bg = (20, 17, 13)
    rings = [((255, 94, 87), 170, 22), ((255, 159, 67), 108, 22)]
    gold = (255, 215, 106)
    pole = (251, 245, 230)
    flag = (244, 182, 43)
    s = size / 512.0
    scale_inner = 0.78 if maskable else 1.0
    cx, cy = 256, 300
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            # supersample 2x2
            acc = [0, 0, 0, 0]
            for sy in (0.25, 0.75):
                for sx in (0.25, 0.75):
                    x = (px + sx) / s
                    y = (py + sy) / s
                    # maskable: shrink artwork toward centre
                    x = 256 + (x - 256) / scale_inner
                    y = 256 + (y - 256) / scale_inner
                    col, a = None, 0
                    r = 112
                    inside_rect = True
                    if not maskable:
                        qx = max(abs((px + sx) / s - 256) - (256 - r), 0)
                        qy = max(abs((py + sy) / s - 256) - (256 - r), 0)
                        inside_rect = math.hypot(qx, qy) <= r
                    if inside_rect:
                        col, a = bg, 255
                        d = math.hypot(x - cx, y - cy)
                        for c, rr, w in rings:
                            if abs(d - rr) <= w / 2:
                                col = c
                        if d <= 46:
                            col = gold
                        if abs(x - 256) <= 8 and 70 <= y <= 300:
                            col = pole
                        # flag triangle (264,74)-(382,114)-(264,158)
                        if x >= 264 and y >= 74 + (x - 264) * (40 / 118) and y <= 158 - (x - 264) * (44 / 118):
                            col = flag
                    if col:
                        acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]; acc[3] += a
            row += bytes([acc[0] // 4, acc[1] // 4, acc[2] // 4, acc[3] // 4])
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out.mkdir(parents=True, exist_ok=True)
    (out / "icon-192.png").write_bytes(render(192))
    (out / "icon-512.png").write_bytes(render(512))
    (out / "icon-maskable-512.png").write_bytes(render(512, maskable=True))
    print("ok")
