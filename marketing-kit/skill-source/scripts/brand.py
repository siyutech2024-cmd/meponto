"""MePonto brand helpers for PIL-based material generation.

Usage:
    import sys; sys.path.insert(0, "<skill>/scripts")
    from brand import *
    im = canvas(1080, 1080)                 # yellow canvas
    place_logo(im, load_logo(), 70, 64, 440)
    d = ImageDraw.Draw(im)
    code_panel(d, 70, 880, 640, 120)
    footer_bar(im, d)                       # navy band w/ meponto.com
"""
import os
from PIL import Image, ImageDraw, ImageFont

# ---- palette ----
YEL = (255, 212, 0)      # #FFD400 Amarelo MePonto
NAVY = (18, 23, 42)      # #12172A Tinta
WHITE = (255, 255, 255)
GRAY = (200, 204, 216)   # light body text on navy
GOLD_DARK = (91, 79, 19) # tertiary text on yellow
CODE = "MEPONTO99OL"
SITE = "meponto.com"
SITE2 = "mall.meponto.com"
HANDLE = "@meponto"
EMAIL = "contato@meponto.com"

_ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")

_FONT_DIRS = [
    "/usr/share/fonts/truetype/liberation",
    "/usr/share/fonts/truetype/liberation2",
    "/System/Library/Fonts/Supplemental",
]

def _font(names, size):
    for d in _FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def B(size):   # bold
    return _font(["LiberationSans-Bold.ttf", "Arial Bold.ttf"], size)

def BI(size):  # bold italic — brand name, code, website
    return _font(["LiberationSans-BoldItalic.ttf", "Arial Bold Italic.ttf"], size)

def R(size):   # regular
    return _font(["LiberationSans-Regular.ttf", "Arial.ttf"], size)

# ---- assets ----
def load_logo():
    """Horizontal color logo, transparent bg. Yellow/light canvases only."""
    return Image.open(os.path.join(_ASSETS, "meponto-logo-transparent.png")).convert("RGBA")

def load_icon():
    """Rounded yellow icon. For dark canvases and avatars."""
    return Image.open(os.path.join(_ASSETS, "meponto-icon-rounded.png")).convert("RGBA")

# ---- building blocks ----
def canvas(w, h, color=YEL):
    return Image.new("RGBA", (w, h), color + (255,))

def place_logo(im, logo, x, y, width):
    """Paste logo scaled to `width`; returns rendered height."""
    h = int(logo.height * width / logo.width)
    im.alpha_composite(logo.resize((width, h), Image.LANCZOS), (x, y))
    return h

def tracked(d, pos, text, font, fill, tracking):
    """Letter-spaced text (for eyebrows/labels). Returns end x."""
    x, y = pos
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + tracking
    return x

def code_panel(d, x, y, w, h, panel=NAVY, label_col=(180, 186, 205), code_col=YEL,
               label="CÓDIGO DE VANTAGEM", code=CODE):
    """Standard promo-code block: navy rounded rect, tracked label, italic code."""
    d.rounded_rectangle((x, y, x + w, y + h), radius=max(14, h // 8), fill=panel)
    tracked(d, (x + int(w * 0.045), y + int(h * 0.18)), label,
            B(max(16, int(h * 0.18))), label_col, 3)
    d.text((x + int(w * 0.042), y + int(h * 0.44)), code,
           font=BI(int(h * 0.42)), fill=code_col)

def cta_pill(d, x, y, w, h, text, bg=NAVY, fg=YEL):
    d.rounded_rectangle((x, y, x + w, y + h), radius=h // 2, fill=bg)
    d.text((x + w // 2, y + int(h * 0.24)), text, font=B(int(h * 0.4)),
           fill=fg, anchor="ma")

def footer_bar(im, d, height=None, site_size=None):
    """Navy full-width footer band with meponto.com + @meponto."""
    W, H = im.size
    fh = height or max(90, H // 12)
    site_size = site_size or int(fh * 0.42)
    d.rectangle((0, H - fh, W, H), fill=NAVY)
    m = int(W * 0.07)
    d.text((m, H - fh + int(fh * 0.24)), SITE, font=BI(site_size), fill=YEL)
    d.text((W - m, H - fh + int(fh * 0.32)), HANDLE,
           font=B(int(site_size * 0.6)), fill=GRAY, anchor="ra")

def bullets(d, x, y, items, size=34, gap=None, dot=NAVY, fill=NAVY):
    """Benefit list with round dots. Returns next y."""
    gap = gap or int(size * 1.9)
    r = int(size * 0.36)
    for t in items:
        d.ellipse((x, y + size // 3, x + 2 * r, y + size // 3 + 2 * r), fill=dot)
        d.text((x + 2 * r + int(size * 0.55), y), t, font=B(size), fill=fill)
        y += gap
    return y
