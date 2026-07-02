"""Higgsfield Autopilot icon: a lime 'H' with a sneaky peeking character
(side-glancing eyes + sly brows) looking over the top of the H."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(__file__)
SIZE = 1024
LIME = (198, 255, 41, 255)
DARK = (10, 10, 11, 255)
WHITE = (245, 245, 245, 255)


def rounded(size, radius, fill):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=fill)
    return img


def build(px):
    img = rounded(px, int(px * 0.22), DARK)
    d = ImageDraw.Draw(img)
    u = px / 1024.0  # scale unit

    # --- Sneaky character peeking over the top ---
    # A rounded "hood/head" hump rising from behind, in a slightly lighter lime.
    head_top = 150 * u
    head = [px * 0.20, head_top, px * 0.80, head_top + 360 * u]
    d.ellipse(head, fill=LIME)
    # Re-cut the bottom so the head reads as peeking (blend into H area).
    d.rectangle([0, head_top + 190 * u, px, px], fill=DARK)

    # Eyes — narrowed, glancing to the side (sneaky). White almond shapes.
    eye_y = head_top + 95 * u
    for cx in (px * 0.395, px * 0.605):
        ew, eh = 95 * u, 52 * u
        d.ellipse([cx - ew / 2, eye_y - eh / 2, cx + ew / 2, eye_y + eh / 2], fill=WHITE)
        # Pupils shifted right = side-eye glance.
        pr = 22 * u
        pcx = cx + 20 * u
        d.ellipse([pcx - pr, eye_y - pr, pcx + pr, eye_y + pr], fill=DARK)
        # Lower lid to narrow the eye (sneaky squint).
        d.rectangle([cx - ew / 2 - 2, eye_y + 6 * u, cx + ew / 2 + 2, eye_y + eh / 2 + 2], fill=LIME)

    # Sly angled eyebrows.
    bw = 8 * u
    d.line([px * 0.345, eye_y - 55 * u, px * 0.445, eye_y - 30 * u], fill=DARK, width=int(max(3, bw)))
    d.line([px * 0.555, eye_y - 30 * u, px * 0.655, eye_y - 55 * u], fill=DARK, width=int(max(3, bw)))

    # --- Big 'H' ---
    try:
        font = ImageFont.truetype("arialbd.ttf", int(px * 0.44))
    except Exception:
        font = ImageFont.load_default()
    text = "H"
    cx, cy = px * 0.5, px * 0.66
    tb = d.textbbox((0, 0), text, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    d.text((cx - tw / 2 - tb[0], cy - th / 2 - tb[1]), text, font=font, fill=LIME)
    return img


master = build(SIZE)
master.save(os.path.join(OUT, "icon.png"))
sizes = [16, 24, 32, 48, 64, 128, 256]
master.save(os.path.join(OUT, "icon.ico"), sizes=[(s, s) for s in sizes])
print("wrote icon.png + icon.ico")
