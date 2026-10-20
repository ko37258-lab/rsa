"""7단계 그림 — 자막·장면 카드·큰 제목·썸네일을 Pillow 로 그립니다.

자막: 한 줄 8~14자, 아주 굵은 고딕에 흰 글씨, 핵심 단어만 노랑(강조색)·숫자는 빨강(둘째 강조색).
모든 위치는 1080×1920 기준 px 입니다.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

from . import text as T
from .fonts import FontPack
from .scenes import Scene, SubLine
from .templates import Template

W, H = 1080, 1920
HEADLINE_H = 360


# ---------------------------------------------------------------------------
# 색 도우미
# ---------------------------------------------------------------------------
@lru_cache(maxsize=256)
def rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgba(hex_color: str, a: int = 255) -> tuple[int, int, int, int]:
    return (*rgb(hex_color), a)


def luminance(hex_color: str) -> float:
    r, g, b = rgb(hex_color)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_on(hex_bg: str) -> str:
    return "#111111" if luminance(hex_bg) > 150 else "#FFFFFF"


class Fonts:
    """템플릿 하나에 쓰는 글꼴 묶음 (제목용 / 본문·자막용)."""

    def __init__(self, tpl: Template):
        self.title = FontPack.of(tpl.title_fonts)
        self.body = FontPack.of(tpl.body_fonts)


# ---------------------------------------------------------------------------
# 글자 그리기 공통
# ---------------------------------------------------------------------------
def _wrap(fp: FontPack, text: str, size: int, max_w: float, max_lines: int = 2) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        cand = f"{cur} {w}".strip()
        if cur and fp.width(cand, size) > max_w:
            lines.append(cur)
            cur = w
        else:
            cur = cand
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[: max_lines - 1] + [" ".join(lines[max_lines - 1:])]
    return lines


def _fit_lines(fp: FontPack, text: str, max_w: float, start: int, max_lines: int = 2,
               min_size: int = 36) -> tuple[list[str], int]:
    size = start
    while True:
        lines = _wrap(fp, text, size, max_w, max_lines)
        if all(fp.width(ln, size) <= max_w for ln in lines) or size <= min_size:
            return lines, size
        size -= 6


def _draw_centered(d: ImageDraw.ImageDraw, fp: FontPack, line: str, cx: float, baseline: float, size: int,
                   fill, stroke: int = 0, stroke_fill=None) -> tuple[float, float]:
    w = fp.width(line, size)
    x = cx - w / 2
    fp.draw(d, (x, baseline), line, size, fill, stroke, stroke_fill)
    return x, w


def _shadow(img: Image.Image, radius: int = 10, alpha: int = 160) -> Image.Image:
    """글자 이미지 아래에 부드러운 그림자를 깝니다(오버레이형 가독성)."""
    a = img.split()[3].filter(ImageFilter.GaussianBlur(radius))
    a = a.point(lambda v: min(alpha, v))
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    shadow.putalpha(a)
    return Image.alpha_composite(shadow, img)


def _glow(img: Image.Image, color: str, radius: int = 18) -> Image.Image:
    a = img.split()[3].filter(ImageFilter.GaussianBlur(radius))
    layer = Image.new("RGBA", img.size, rgba(color, 0))
    layer.putalpha(a)
    return Image.alpha_composite(Image.alpha_composite(layer, layer), img)


# ---------------------------------------------------------------------------
# 자막
# ---------------------------------------------------------------------------
def subtitle(line: SubLine, tpl: Template, fonts: Fonts, layout: str) -> tuple[Image.Image, int, int]:
    """자막 한 줄 이미지와 놓을 위치(x, y)."""
    fp = fonts.body
    pal = tpl.palette
    size = tpl.sub_size
    max_w = W - 90
    space = fp.width(" ", size)
    while size > 44 and sum(fp.width(t, size) for t, _ in line.tokens) + space * (len(line.tokens) - 1) > max_w:
        size -= 4
        space = fp.width(" ", size)
    stroke = max(5, size // 9)
    asc, desc = fp.metrics(size)
    total = sum(fp.width(t, size) for t, _ in line.tokens) + space * max(0, len(line.tokens) - 1)
    pad_x, pad_y = 30, 16
    w = int(total + 2 * (pad_x + stroke))
    h = int(asc + desc + 2 * (pad_y + stroke))
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if tpl.sub_box:
        d.rounded_rectangle((0, 0, w - 1, h - 1), radius=22, fill=(0, 0, 0, 150))
    x = pad_x + stroke
    base = pad_y + stroke + asc
    for i, (tok, style) in enumerate(line.tokens):
        color = pal.accent if style == "key" else pal.accent2 if style == "num" else pal.sub_fg
        fp.draw(d, (x, base), tok, size, rgb(color), stroke, rgb(pal.sub_stroke))
        x += fp.width(tok, size) + space
    y_center = tpl.sub_y(layout)
    y = int(y_center - h / 2)
    y = min(y, int(H * 0.8) - h)  # 아래 5분의 1은 비움
    return img, int((W - w) / 2), y


# ---------------------------------------------------------------------------
# 카드 영역과 바탕
# ---------------------------------------------------------------------------
def card_box(tpl: Template) -> tuple[int, int, int, int]:
    """(x, y, w, h) — 반반 장면에서 카드가 놓이는 자리."""
    if tpl.style == "split":
        return 0, 0, W, tpl.split_h
    top = HEADLINE_H + 30 if tpl.headline else 120
    return 0, top, W, 640


def _card_fg(tpl: Template) -> str:
    if tpl.card_style == "bold":
        return contrast_on(tpl.palette.accent)
    if tpl.card_style == "overlay_text":
        return "#FFFFFF"
    if tpl.card_style == "glow" and luminance(tpl.palette.card_bg) > 150:
        return "#FFFFFF"
    if tpl.card_style == "paper":
        return "#1D1D1F"
    return tpl.palette.card_fg


def _paint_bg(img: Image.Image, tpl: Template) -> None:
    d = ImageDraw.Draw(img)
    w, h = img.size
    pal = tpl.palette
    cs = tpl.card_style
    if cs == "overlay_text":
        return
    if cs == "paper":
        d.rectangle((0, 0, w, h), fill=rgb("#FFF8E7"))
        for y in range(120, h, 72):
            d.line((0, y, w, y), fill=rgb("#CFE0F0"), width=3)
        d.line((96, 0, 96, h), fill=rgb("#F2A3A3"), width=4)
        return
    if cs == "glow":
        base = pal.card_bg if luminance(pal.card_bg) < 150 else "#0D0D16"
        d.rectangle((0, 0, w, h), fill=rgb(base))
        halo = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        hd = ImageDraw.Draw(halo)
        hd.ellipse((w * 0.15, h * 0.1, w * 0.85, h * 0.9), fill=rgba(pal.accent, 70))
        img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(120)))
        return
    if cs == "bold":
        d.rectangle((0, 0, w, h), fill=rgb(pal.accent))
        return
    d.rectangle((0, 0, w, h), fill=rgb(pal.card_bg))
    if cs == "border":
        d.rectangle((40, 40, w - 40, h - 40), outline=rgb(pal.accent), width=4)
        d.rectangle((56, 56, w - 56, h - 56), outline=rgba(pal.accent, 120), width=1)
    elif cs == "diagram":
        grid = rgba(pal.card_fg, 18)
        for x in range(0, w, 60):
            d.line((x, 0, x, h), fill=grid, width=1)
        for y in range(0, h, 60):
            d.line((0, y, w, y), fill=grid, width=1)
    if tpl.style == "split":
        d.rectangle((0, h - 8, w, h), fill=rgb(pal.accent))  # 카드와 얼굴 경계선


def _pill(d: ImageDraw.ImageDraw, fp: FontPack, text: str, cx: float, top: float, size: int,
          bg: str, fg: str) -> float:
    tw = fp.width(text, size)
    asc, desc = fp.metrics(size)
    pw, ph = tw + 56, asc + desc + 24
    d.rounded_rectangle((cx - pw / 2, top, cx + pw / 2, top + ph), radius=ph / 2, fill=rgb(bg))
    fp.draw(d, (cx - tw / 2, top + 12 + asc), text, size, rgb(fg))
    return top + ph


def _title_block(img: Image.Image, tpl: Template, fonts: Fonts, title: str, cy: float, *, start: int = 150,
                 color: str | None = None, max_lines: int = 2) -> tuple[float, float]:
    """카드 제목. 카드 스타일별 꾸밈(형광펜·빛·체계도 상자)을 함께 그립니다. (위, 아래) y 반환."""
    w, _ = img.size
    fp = fonts.title
    color = color or _card_fg(tpl)
    lines, size = _fit_lines(fp, title, w - 140, start, max_lines)
    asc, desc = fp.metrics(size)
    lh = asc + desc
    top = cy - lh * len(lines) / 2
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i, ln in enumerate(lines):
        base = top + asc + i * lh
        tw = fp.width(ln, size)
        x0 = w / 2 - tw / 2
        if tpl.card_style == "paper":
            d.rectangle((x0 - 12, base - asc * 0.38, x0 + tw + 12, base + desc * 0.3), fill=rgba(tpl.palette.accent, 170))
        if tpl.card_style == "diagram":
            d.rounded_rectangle((x0 - 40, base - asc - 22, x0 + tw + 40, base + desc + 22), radius=18,
                                outline=rgb(tpl.palette.accent), width=6)
        stroke = max(4, size // 14) if tpl.card_style == "overlay_text" else 0
        fp.draw(d, (x0, base), ln, size, rgb(color), stroke, (0, 0, 0))
    if tpl.card_style == "glow":
        layer = _glow(layer, tpl.palette.accent)
    elif tpl.card_style == "overlay_text":
        layer = _shadow(layer)
    img.alpha_composite(layer)
    return top, top + lh * len(lines)


def _sub_text(img: Image.Image, tpl: Template, fonts: Fonts, text: str, top: float, size: int = 52) -> float:
    if not text:
        return top
    w, _ = img.size
    d = ImageDraw.Draw(img)
    fp = fonts.body
    fg = _card_fg(tpl)
    color = rgba(fg, 200)
    lines, size = _fit_lines(fp, text, w - 160, size, 2, 34)
    asc, desc = fp.metrics(size)
    for i, ln in enumerate(lines):
        stroke = 3 if tpl.card_style == "overlay_text" else 0
        _draw_centered(d, fp, ln, w / 2, top + asc + i * (asc + desc), size, color, stroke, (0, 0, 0))
    return top + (asc + desc) * len(lines)


# ---------------------------------------------------------------------------
# 장면 카드
# ---------------------------------------------------------------------------
def card(scene: Scene, tpl: Template, fonts: Fonts, *, reveal: int | None = None,
         material: Image.Image | None = None, handle: str = "") -> tuple[Image.Image | None, tuple[int, int],
                                                                       tuple[int, int, int, int] | None]:
    """장면 카드 이미지, 놓을 위치, (동영상 자료를 붙일 칸 x,y,w,h — 없으면 None)."""
    kind = scene.kind
    c = scene.card
    pal = tpl.palette
    if kind == "hook":
        return hook_title(c.get("title", ""), tpl, fonts), (0, 0), None
    if kind == "closing":
        if not handle:
            return None, (0, 0), None
        img = Image.new("RGBA", (W, 300), (0, 0, 0, 0))
        _pill(ImageDraw.Draw(img), fonts.body, f"{handle} 팔로우", W / 2, 150, 56, pal.accent, contrast_on(pal.accent))
        return img, (0, 120), None

    x, y, w, h = card_box(tpl)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    _paint_bg(img, tpl)
    d = ImageDraw.Draw(img)
    fg = _card_fg(tpl)
    slot = None

    if kind == "keyword":
        top_pad = 0
        if c.get("badge"):
            _pill(d, fonts.body, c["badge"], w / 2, h * 0.12, 54, pal.accent if tpl.card_style != "bold" else "#111111",
                  contrast_on(pal.accent) if tpl.card_style != "bold" else "#FFFFFF")
            top_pad = 40
        _, bottom = _title_block(img, tpl, fonts, c.get("title", ""), h * 0.44 + top_pad, start=170)
        sub = c.get("sub", "")
        if sub and T.norm(sub) != T.norm(c.get("title", "")):
            if tpl.card_style == "diagram":
                ImageDraw.Draw(img).line((w / 2, bottom + 24, w / 2, bottom + 70), fill=rgb(pal.accent), width=5)
                bottom += 50
            _sub_text(img, tpl, fonts, sub, bottom + 40)
    elif kind == "number":
        label = c.get("label", "")
        if label:
            _sub_text(img, tpl, fonts, label, h * 0.13, 64)
        num_color = pal.accent2 if tpl.card_style not in ("bold",) else contrast_on(pal.accent)
        if tpl.card_style in ("glow", "overlay_text"):
            num_color = pal.accent
        _title_block(img, tpl, fonts, c.get("number", ""), h * 0.56, start=260, color=num_color, max_lines=1)
    elif kind == "checklist":
        items = c.get("items") or []
        n_vis = len(items) if reveal is None else reveal
        top = h * 0.12
        if c.get("title"):
            _, top = _title_block(img, tpl, fonts, c["title"], h * 0.14, start=84, max_lines=1)
            top += 30
        n = max(1, len(items))
        row = min(130, (h - top - 50) / n)
        size = int(min(64, row * 0.55))
        fp = fonts.body
        asc, _ = fp.metrics(size)
        for i, it in enumerate(items):
            cy = top + row * i + row / 2
            visible = i < n_vis
            alpha = 255 if visible else 60
            bx = 110
            box = (bx, cy - size * 0.45, bx + size * 0.9, cy + size * 0.45)
            d.rounded_rectangle(box, radius=10, outline=rgba(pal.accent if tpl.card_style != "bold" else fg, alpha),
                                width=6, fill=rgba(pal.accent, 255) if visible and tpl.card_style != "bold" else None)
            if visible:
                ck = "#111111" if tpl.card_style != "bold" else fg
                d.line((box[0] + size * 0.18, cy, box[0] + size * 0.4, cy + size * 0.22,
                        box[0] + size * 0.75, cy - size * 0.25), fill=rgb(ck), width=8, joint="curve")
            stroke = 3 if tpl.card_style == "overlay_text" else 0
            fp.draw(d, (bx + size * 1.4, cy + asc * 0.36), it, size, rgba(fg, alpha), stroke, (0, 0, 0))
    elif kind == "question":
        r = min(w, h) * 0.17
        cy = h * 0.34
        d.ellipse((w / 2 - r, cy - r, w / 2 + r, cy + r), fill=rgb(pal.accent if tpl.card_style != "bold" else "#111111"))
        qfp = fonts.title
        qs = int(r * 1.45)
        asc, desc = qfp.metrics(qs)
        _draw_centered(d, qfp, "?", w / 2, cy + (asc - desc) / 2.2, qs,
                       rgb(contrast_on(pal.accent) if tpl.card_style != "bold" else "#FFFFFF"))
        _title_block(img, tpl, fonts, c.get("title", ""), h * 0.74, start=78)
    elif kind == "comment":
        word = c.get("comment", "")
        _sub_text(img, tpl, fonts, "댓글로 받아가세요", h * 0.12, 58)
        light = luminance(pal.card_bg) < 150 or tpl.card_style in ("overlay_text", "bold", "glow")
        panel_bg = "#FFFFFF" if light else "#F2F2F2"
        px0, py0, px1, py1 = 70, h * 0.36, w - 70, h * 0.36 + 300
        d.rounded_rectangle((px0, py0, px1, py1), radius=36, fill=rgb(panel_bg))
        d.ellipse((px0 + 40, py0 + 50, px0 + 150, py0 + 160), fill=rgb(pal.accent))
        fp = fonts.body
        fp.draw(d, (px0 + 185, py0 + 95), "my_follower", 40, rgb("#8A8A8A"))
        word_size = fp.fit_size(word, px1 - px0 - 300, 96, 48)
        fp.draw(d, (px0 + 185, py0 + 200), word, word_size, rgb("#111111"))
        hx, hy = px1 - 90, py0 + 150  # 하트
        d.ellipse((hx - 34, hy - 30, hx, hy + 2), fill=rgb("#FF3B5C"))
        d.ellipse((hx - 4, hy - 30, hx + 30, hy + 2), fill=rgb("#FF3B5C"))
        d.polygon([(hx - 33, hy - 6), (hx + 29, hy - 6), (hx - 2, hy + 32)], fill=rgb("#FF3B5C"))
        fp.draw(d, (px0 + 185, py1 - 34), "답글 달기 · 좋아요 128", 30, rgb("#9A9A9A"))
    elif kind in ("material", "demo"):
        title = c.get("title", "")
        top = 40
        if title:
            top = _pill(d, fonts.body, title, w / 2, 36, 46, pal.accent, contrast_on(pal.accent)) + 20
        sx, sy, sw, sh = 50, int(top), w - 100, int(h - top - 50)
        if material is not None:
            fitted = ImageOps.contain(material.convert("RGBA"), (sw, sh))
            mask = Image.new("L", fitted.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle((0, 0, fitted.size[0], fitted.size[1]), radius=28, fill=255)
            img.paste(fitted, (sx + (sw - fitted.size[0]) // 2, sy + (sh - fitted.size[1]) // 2), mask)
        else:
            slot = (x + sx, y + sy, sw, sh)
    return img, (x, y), slot


def hook_title(title: str, tpl: Template, fonts: Fonts) -> Image.Image:
    """첫 장면(얼굴 전체)의 큰 제목. 둘째 줄은 강조색."""
    img = Image.new("RGBA", (W, 760), (0, 0, 0, 0))
    grad = Image.linear_gradient("L").resize((W, 760)).point(lambda v: int(180 * (1 - v / 255)))
    shade = Image.new("RGBA", (W, 760), (0, 0, 0, 255))
    shade.putalpha(grad)
    img.alpha_composite(shade)
    lines = T.split_two_lines(title, 9)
    fp = fonts.title
    _, size = _fit_lines(fp, max(lines, key=len), W - 120, 132, 1, 60)
    asc, desc = fp.metrics(size)
    top = (HEADLINE_H + 40) if tpl.headline else 190
    d = ImageDraw.Draw(img)
    for i, ln in enumerate(lines):
        color = tpl.palette.accent if (i == len(lines) - 1 and len(lines) > 1) else "#FFFFFF"
        _draw_centered(d, fp, ln, W / 2, top + asc + i * (asc + desc), size, rgb(color), max(6, size // 11),
                       (0, 0, 0))
    return _shadow(img, 12, 120)


def headline(title: str, tpl: Template, fonts: Fonts) -> Image.Image:
    """끝까지 고정되는 위 제목 두 줄."""
    pal = tpl.palette
    img = Image.new("RGBA", (W, HEADLINE_H), rgba(pal.card_bg))
    d = ImageDraw.Draw(img)
    d.rectangle((0, HEADLINE_H - 10, W, HEADLINE_H), fill=rgb(pal.accent))
    lines = T.split_two_lines(title, 10)[:2]
    fp = fonts.title
    _, size = _fit_lines(fp, max(lines, key=len), W - 100, 104, 1, 50)
    asc, desc = fp.metrics(size)
    total = (asc + desc) * len(lines)
    top = (HEADLINE_H - 10 - total) / 2 + 10
    for i, ln in enumerate(lines):
        color = pal.accent if (i == 1) else pal.card_fg
        _draw_centered(d, fp, ln, W / 2, top + asc + i * (asc + desc), size, rgb(color))
    return img


def thumbnail(frame: Image.Image, title: str, tpl: Template, fonts: Fonts) -> Image.Image:
    """업로드용 썸네일(1080×1920): 얼굴 장면 + 큰 제목 세 줄 이내."""
    base = ImageOps.fit(frame.convert("RGB"), (W, H)).convert("RGBA")
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    grad = Image.linear_gradient("L").resize((W, 1100)).point(lambda v: int(200 * (1 - v / 255)))
    band = Image.new("RGBA", (W, 1100), (0, 0, 0, 255))
    band.putalpha(grad)
    shade.paste(band, (0, 0))
    base.alpha_composite(shade)
    fp = fonts.title
    lines, size = _fit_lines(fp, title, W - 120, 170, 3, 70)
    asc, desc = fp.metrics(size)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i, ln in enumerate(lines):
        color = tpl.palette.accent if i == len(lines) - 1 and len(lines) > 1 else "#FFFFFF"
        _draw_centered(d, fp, ln, W / 2, 260 + asc + i * (asc + desc), size, rgb(color), max(8, size // 10), (0, 0, 0))
    base.alpha_composite(_shadow(layer, 14, 140))
    return base.convert("RGB")


def placeholder_frame(w: int = 1080, h: int = 1920) -> Image.Image:
    """미리보기용 가짜 얼굴 화면(실제 영상이 없을 때)."""
    img = Image.linear_gradient("L").resize((w, h)).point(lambda v: 60 + v // 3)
    img = ImageOps.colorize(img, "#3a4a5a", "#c9b8a6").convert("RGB")
    d = ImageDraw.Draw(img)
    cx = w / 2
    d.ellipse((cx - w * 0.36, h * 0.62, cx + w * 0.36, h * 1.25), fill="#2b3440")  # 어깨
    d.rectangle((cx - w * 0.07, h * 0.5, cx + w * 0.07, h * 0.66), fill="#d9b49a")  # 목
    d.ellipse((cx - w * 0.19, h * 0.25, cx + w * 0.19, h * 0.45), fill="#2a1d18")  # 머리카락
    d.ellipse((cx - w * 0.17, h * 0.29, cx + w * 0.17, h * 0.56), fill="#e6c2a6")  # 얼굴
    return img


def load_image(path: Path) -> Image.Image | None:
    try:
        return ImageOps.exif_transpose(Image.open(path)).convert("RGBA")
    except Exception:
        return None
