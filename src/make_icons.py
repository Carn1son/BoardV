"""App icons from logo.png (the carnison chip logo): PWA, favicon, Android launcher, Windows."""
import os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BG = (27, 29, 28, 255)  # dark canvas behind the logo where an opaque square is required


def logo(size):
    return Image.open(os.path.join(HERE, 'logo.png')).convert('RGBA').resize((size, size), Image.LANCZOS)


def padded(size, scale, bg=None):
    """Logo shrunk to `scale` of the square; bg=None keeps it transparent."""
    canvas = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    inner = int(round(size * scale)); off = (size - inner) // 2
    lg = logo(inner); canvas.alpha_composite(lg, (off, off))
    return canvas


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for sz in (192, 512):
        padded(sz, 0.92).save(f'{out}/icon-{sz}.png')
    padded(512, 0.72, BG).convert('RGB').save(f'{out}/icon-maskable-512.png')   # maskable: logo inside the safe zone
    padded(180, 0.8, BG).convert('RGB').save(f'{out}/apple-touch-icon.png')
    padded(256, 0.94).save(f'{out}/favicon-256.png')
    for name, sz in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
        os.makedirs(f'{out}/android/mipmap-{name}', exist_ok=True)
        padded(sz, 0.9).save(f'{out}/android/mipmap-{name}/ic_launcher.png')
    padded(256, 0.94).save(f'{out}/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])  # Windows exe / taskbar
    print('icons written to', out)
