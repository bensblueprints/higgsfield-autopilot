"""Generate the Higgsfield Autopilot app icon (lime 'H' with a motion swoosh)."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(__file__)
SIZE = 1024
LIME = (198, 255, 41, 255)
BG = (10, 10, 11, 255)


def rounded(size, radius, fill):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=fill)
    return img


def build(px):
    img = rounded(px, int(px * 0.22), BG)
    d = ImageDraw.Draw(img)
    # Motion swoosh: three lime arcs of increasing thickness (speed lines).
    cx, cy = px * 0.5, px * 0.52
    for i, (r, w) in enumerate([(0.30, 0.04), (0.38, 0.055), (0.46, 0.07)]):
        bbox = [cx - px * r, cy - px * r, cx + px * r, cy + px * r]
        d.arc(bbox, start=200, end=340, fill=LIME, width=max(1, int(px * w)))
    # Big 'H'
    try:
        font = ImageFont.truetype("arialbd.ttf", int(px * 0.5))
    except Exception:
        font = ImageFont.load_default()
    text = "H"
    tb = d.textbbox((0, 0), text, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    d.text((cx - tw / 2 - tb[0], cy - th / 2 - tb[1] - px * 0.02), text, font=font, fill=LIME)
    return img


master = build(SIZE)
master.save(os.path.join(OUT, "icon.png"))

# Multi-resolution .ico for Windows (electron-builder + Start menu).
sizes = [16, 24, 32, 48, 64, 128, 256]
master.save(os.path.join(OUT, "icon.ico"), sizes=[(s, s) for s in sizes])
print("wrote icon.png + icon.ico")
