"""템플릿 미리보기 — 템플릿마다 실제 장면 세 장(훅·핵심어·숫자)을 크게 보여 줍니다."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from . import draw
from .compose import Compositor
from .scenes import Scene, SubLine
from .templates import Template

PANEL = (360, 640)


def sample_scenes() -> list[Scene]:
    def line(tokens, s, e):
        return [SubLine(" ".join(t for t, _ in tokens), s, e, tokens)]

    return [
        Scene(0, 0.0, 3.0, "용적률 세 가지만 기억하세요", "hook", layout="full",
              card={"title": "용적률 세 가지만 기억하세요"},
              lines=line([("용적률", "key"), ("세 가지만", "num"), ("기억하세요", "normal")], 0.0, 3.0)),
        Scene(1, 3.0, 6.0, "개발행위허가 먼저 확인", "keyword", layout="half",
              card={"title": "개발행위허가", "sub": "땅 사기 전에 먼저 확인"},
              lines=line([("땅 사기 전", "normal"), ("허가부터", "key"), ("보세요", "normal")], 3.0, 6.0)),
        Scene(2, 6.0, 9.0, "준주거 용적률 500%", "number", layout="half",
              card={"number": "500%", "label": "준주거지역 용적률"},
              lines=line([("최대", "normal"), ("500%", "num"), ("까지 지어요", "normal")], 6.0, 9.0)),
    ]


def render(tpl: Template, frame: np.ndarray | None = None) -> Image.Image:
    src = frame if frame is not None else np.asarray(draw.placeholder_frame())
    scenes = sample_scenes()
    comp = Compositor(tpl, scenes, 9.0, headline_title="용적률 세 가지만 기억하세요")
    gap = 18
    sheet = Image.new("RGB", (PANEL[0] * 3 + gap * 4, PANEL[1] + gap * 2 + 56), (24, 24, 28))
    for i, t in enumerate((1.0, 4.0, 7.0)):
        img = Image.fromarray(comp.frame(src, t)).resize(PANEL, Image.LANCZOS)
        sheet.paste(img, (gap + i * (PANEL[0] + gap), gap))
    d = ImageDraw.Draw(sheet)
    comp.fonts.body.draw(d, (gap, PANEL[1] + gap + 44), f"{tpl.id}  {tpl.name}", 30, (235, 235, 235))
    return sheet


def cached(tpl: Template, cache_dir: Path, frame: np.ndarray | None = None, key: str = "base") -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    out = cache_dir / f"{tpl.id}_{key}.jpg"
    if not out.exists():
        render(tpl, frame).save(out, quality=86)
    return out
