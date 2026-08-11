from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SCALE = 4
CANVAS = 512


def point(value: float) -> int:
    return round(value * SCALE)


def cubic(start, control_a, control_b, end, steps=40):
    points = []
    for index in range(steps + 1):
        t = index / steps
        inverse = 1 - t
        x = inverse**3 * start[0] + 3 * inverse**2 * t * control_a[0] + 3 * inverse * t**2 * control_b[0] + t**3 * end[0]
        y = inverse**3 * start[1] + 3 * inverse**2 * t * control_a[1] + 3 * inverse * t**2 * control_b[1] + t**3 * end[1]
        points.append((point(x), point(y)))
    return points


def build_master() -> Image.Image:
    size = CANVAS * SCALE
    surface = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gradient = Image.new('RGBA', (size, size))
    gradient_draw = ImageDraw.Draw(gradient)
    first = (57, 35, 183)
    last = (129, 94, 255)
    for y in range(size):
        vertical = y / max(1, size - 1)
        for_x = vertical * 0.72
        color = tuple(round(first[channel] + (last[channel] - first[channel]) * for_x) for channel in range(3))
        gradient_draw.line((0, y, size, y), fill=(*color, 255))

    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (point(12), point(12), point(500), point(500)),
        radius=point(112),
        fill=255,
    )
    surface.alpha_composite(Image.composite(gradient, Image.new('RGBA', (size, size)), mask))

    overlay = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.polygon(
        [(point(92), point(12)), (point(395), point(12)), (point(255), point(500)), (point(112), point(500)), (point(12), point(400)), (point(12), point(112))],
        fill=(255, 255, 255, 18),
    )
    overlay.putalpha(Image.composite(overlay.getchannel('A'), Image.new('L', (size, size)), mask))
    surface.alpha_composite(overlay)

    draw = ImageDraw.Draw(surface)
    white = (255, 255, 255, 255)
    stroke_width = point(18)
    draw.line([(point(108), point(256)), (point(262), point(256))], fill=white, width=stroke_width)
    paths = [
        ((108, 256), (169, 256), (165, 152), (234, 152)),
        ((279, 152), (337, 152), (362, 101), (381, 101)),
        ((279, 152), (337, 152), (362, 199), (381, 199)),
        ((108, 256), (169, 256), (165, 360), (234, 360)),
        ((279, 360), (337, 360), (362, 411), (381, 411)),
        ((279, 360), (337, 360), (362, 313), (381, 313)),
    ]
    for values in paths:
        draw.line(cubic(*values), fill=white, width=stroke_width, joint='curve')

    for x, y, radius in [(108, 256, 34), (262, 256, 29), (262, 152, 27), (262, 360, 27), (412, 199, 31), (412, 313, 31), (398, 101, 35), (398, 411, 35)]:
        draw.ellipse((point(x - radius), point(y - radius), point(x + radius), point(y + radius)), fill=white)

    plus_color = (87, 52, 213, 255)
    plus_width = point(14)
    for y in (101, 411):
        draw.line((point(398), point(y - 18), point(398), point(y + 18)), fill=plus_color, width=plus_width)
        draw.line((point(380), point(y), point(416), point(y)), fill=plus_color, width=plus_width)

    return surface.resize((1024, 1024), Image.Resampling.LANCZOS)


def save_png(master: Image.Image, relative_path: str, size: int) -> None:
    destination = ROOT / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    master.resize((size, size), Image.Resampling.LANCZOS).save(destination, optimize=True)


def main() -> None:
    master = build_master()
    save_png(master, 'assets/brand/markmap-plus-plus-icon.png', 512)
    save_png(master, 'apps/desktop/resources/icon.png', 512)
    save_png(master, 'examples/react-example/public/brand/markmap-plus-plus-icon.png', 256)
    save_png(master, 'examples/react-example/public/icon-512.png', 512)
    save_png(master, 'examples/react-example/public/icon-192.png', 192)
    save_png(master, 'examples/react-example/public/apple-touch-icon.png', 180)
    master.save(ROOT / 'apps/desktop/resources/icon.ico', format='ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    master.save(ROOT / 'examples/react-example/public/favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
    master.save(ROOT / 'apps/desktop/resources/icon.icns', format='ICNS')


if __name__ == '__main__':
    main()
