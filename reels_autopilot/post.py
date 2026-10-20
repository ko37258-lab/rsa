"""업로드 꾸러미 — 캡션·해시태그·첫 댓글(텍스트)과 썸네일(이미지)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from . import draw, media
from .templates import Template


def write_post(direction: dict, out_dir: Path, handle: str = "") -> Path:
    tags = " ".join(f"#{h}" for h in direction.get("hashtags", []))
    body = [
        f"# {direction.get('thumbnail_title') or direction.get('hook_title', '')}",
        "",
        "## 캡션 (그대로 복사해서 붙여넣기)",
        "",
        direction.get("caption", "").strip(),
        "",
        tags,
        "",
        "## 첫 댓글 (올린 뒤 고정)",
        "",
        direction.get("first_comment", "").strip(),
        "",
        f"<!-- 문구 생성: {'Claude' if direction.get('source') == 'ai' else '규칙'}{' · ' + handle if handle else ''} -->",
    ]
    p = out_dir / "업로드문구.md"
    p.write_text("\n".join(body) + "\n", encoding="utf-8")
    return p


def write_thumbnail(base_video: Path, t: float, title: str, tpl: Template, out_dir: Path, work: Path) -> Path | None:
    try:
        jpg = media.grab_frame(base_video, t, work / "thumb_src.jpg")
        frame = Image.open(jpg).convert("RGB")
    except (media.MediaError, OSError):
        frame = draw.placeholder_frame()
    if frame.width > frame.height:  # 가로 영상이면 얼굴 쪽 세로로 잘라냄
        arr = np.asarray(frame)
        h = arr.shape[0]
        w = int(h * 9 / 16)
        x0 = (arr.shape[1] - w) // 2
        frame = Image.fromarray(arr[:, x0: x0 + w])
    img = draw.thumbnail(frame, title, tpl, draw.Fonts(tpl))
    out = out_dir / "썸네일.jpg"
    img.save(out, quality=92)
    return out
