---
name: meponto-brand-materials
description: >-
  Create on-brand MePonto marketing materials (social posts, stories, banners,
  posters, flyers, business cards, WhatsApp images) for franchisees and
  partners. Use this skill whenever the user mentions MePonto, PontoMall,
  PontoSys, franquia/franqueado materials, the code MEPONTO99OL, or asks for
  any promotional/marketing image, post, cartaz, panfleto, arte, or divulgação
  related to the MePonto delivery network — even if they don't say "brand" or
  "design". Also use it when the user asks in Portuguese, Chinese (制作物料/海报/
  社媒图), or English.
---

# MePonto Brand Materials / MePonto 品牌物料生成

Generate marketing materials that look like they came from MePonto's own
marketing team. The brand assets and rules below are the standard — follow
them so every franchisee's material is consistent with headquarters.

MePonto is a delivery network brand in Brazil (operations system: PontoSys;
points mall: PontoMall). Materials are usually in **Portuguese** for the
Brazilian public; use Chinese or English only if the user asks.

## Workflow

1. Identify the material type and size (see `references/formats.md` for
   specs and layout recipes for each format).
2. Read the brand rules below; open `references/brand-standards.md` if you
   need detail on color pairings, typography scale, or copy tone.
3. Compose the image with Python/PIL (or HTML/SVG if the user wants an
   editable file), using the official logo files from `assets/` — never
   redraw the logo.
4. Render to PNG at the exact target size and show the result to the user.

`scripts/brand.py` contains ready helpers (palette, fonts, logo placement,
code panel, footer bar). Import it instead of rewriting these pieces:

```python
from brand import YEL, NAVY, load_logo, place_logo, code_panel, footer_bar
```

## Non-negotiable brand rules

These come from MePonto headquarters. Materials that break them will be
rejected, so treat them as hard constraints:

- **Logo**: use only the files in `assets/`. Never redraw, recolor, rotate,
  stretch, or add shadows/gradients to the logo.
  - Yellow or light background → `meponto-logo-transparent.png`
    (horizontal color logo).
  - Dark background or avatar/profile → `meponto-icon-rounded.png`
    (the icon carries its own yellow tile). The horizontal color logo
    disappears on dark backgrounds — don't put it there.
  - Clear space around the logo ≥ the height of its "M"; minimum width
    140 px for the horizontal logo, 24 px for the icon.
- **Colors**: Amarelo MePonto `#FFD400` (dominant), Tinta/Navy `#12172A`
  (text and contrast blocks), white for text on navy. Yellow-dominant
  layouts are the brand default. Don't introduce other hues except the
  functional green `#3FB984` / red `#E5484D` for status-like content.
- **Promo code**: always `MEPONTO99OL` — uppercase, no spaces, never
  altered. Present it inside a highlighted panel with the label
  "CÓDIGO DE VANTAGEM" above it. If a material has a call to action,
  the code and the website should both be visible.
- **Website & channels**: `meponto.com` (main), `mall.meponto.com`
  (points mall), `@meponto` (social), `contato@meponto.com`. Domains in
  lowercase, no "https://" on printed/visual materials.
- **Slogan**: `CONECTAR · APOIAR · ENTREGAR` — it is already part of the
  logo lockup; don't retype it next to the logo (that duplicates it).
- **Names**: MePonto, PontoSys, PontoMall — never renamed or respelled
  (not "Me Ponto", "meponto" in prose, "Ponto Mall").
- **Typography**: heavy grotesque bold (Arial Black / Liberation Sans
  Bold; italic bold for the brand name and code), uppercase for headlines.
  Body text in regular/bold sans. Chinese text: PingFang SC / Noto Sans CJK.
- **Language**: one language per label — never mix languages inside a
  single line of user-facing text. Default Portuguese for Brazil-facing
  materials.

## Layout DNA

What makes a piece look like MePonto (see formats.md for per-format
recipes): flat yellow `#FFD400` canvas, navy text, generous margins
(~7% of the short side), a small uppercase tracked eyebrow line above a
huge bold uppercase headline, round navy bullet dots for benefit lists,
a navy rounded-rectangle panel for the promo code, and a navy footer band
or CTA pill carrying `meponto.com` in yellow italic bold. Dark layouts
invert this (navy canvas, yellow accents, icon badge instead of the
horizontal logo). No gradients, no drop shadows, no decorative clutter,
radius ≤ 20 px on panels.

## Contact defaults

If the user doesn't supply contact info, use headquarters defaults:
`meponto.com`, `mall.meponto.com`, `@meponto`, `contato@meponto.com`.
If the franchisee gives their own phone/WhatsApp/city, add it in the
footer area but keep the official website visible.

## Output

- Deliver final materials as PNG at the exact target resolution
  (plus the source SVG/HTML if the user asked for something editable).
- Before delivering, verify: correct logo variant for the background,
  code spelled MEPONTO99OL, website lowercase, one language per label,
  margins respected. Render and LOOK at the image before handing it over.
