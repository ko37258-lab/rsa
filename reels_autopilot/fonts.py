"""글꼴 — 구글 무료 한글 글꼴(OFL, 무료 사용 허락) 30종과 글자 대체 그리기.

글꼴에 없는 글자는 네모(□)로 나오므로, 글자마다 그 글꼴에 있는지 먼저 검사하고
없으면 기본 글꼴로 바꿔 그립니다(책 7장).
"""
from __future__ import annotations

import re
import sys
import urllib.request
from functools import lru_cache
from pathlib import Path
from typing import Callable

from PIL import ImageDraw, ImageFont

from .settings import ROOT

# 이름: (구글 폰트 CSS 매개변수, 저장 파일 이름, 글꼴 느낌)
CATALOG: dict[str, tuple[str, str, str]] = {
    "Black Han Sans": ("Black+Han+Sans", "BlackHanSans-Regular.ttf", "팝"),
    "Do Hyeon": ("Do+Hyeon", "DoHyeon-Regular.ttf", "팝"),
    "Jua": ("Jua", "Jua-Regular.ttf", "둥근"),
    "Noto Sans KR Black": ("Noto+Sans+KR:wght@900", "NotoSansKR-Black.ttf", "모던"),
    "Noto Sans KR Bold": ("Noto+Sans+KR:wght@700", "NotoSansKR-Bold.ttf", "모던"),
    "Nanum Gothic ExtraBold": ("Nanum+Gothic:wght@800", "NanumGothic-ExtraBold.ttf", "모던"),
    "Nanum Myeongjo ExtraBold": ("Nanum+Myeongjo:wght@800", "NanumMyeongjo-ExtraBold.ttf", "명조"),
    "Noto Serif KR Black": ("Noto+Serif+KR:wght@900", "NotoSerifKR-Black.ttf", "명조"),
    "Song Myung": ("Song+Myung", "SongMyung-Regular.ttf", "명조"),
    "Nanum Brush Script": ("Nanum+Brush+Script", "NanumBrushScript-Regular.ttf", "붓"),
    "East Sea Dokdo": ("East+Sea+Dokdo", "EastSeaDokdo-Regular.ttf", "붓"),
    "Dokdo": ("Dokdo", "Dokdo-Regular.ttf", "붓"),
    "Nanum Pen Script": ("Nanum+Pen+Script", "NanumPenScript-Regular.ttf", "손글씨"),
    "Gaegu Bold": ("Gaegu:wght@700", "Gaegu-Bold.ttf", "손글씨"),
    "Gamja Flower": ("Gamja+Flower", "GamjaFlower-Regular.ttf", "손글씨"),
    "Hi Melody": ("Hi+Melody", "HiMelody-Regular.ttf", "손글씨"),
    "Black And White Picture": ("Black+And+White+Picture", "BlackAndWhitePicture-Regular.ttf", "레트로"),
    "Yeon Sung": ("Yeon+Sung", "YeonSung-Regular.ttf", "레트로"),
    "Stylish": ("Stylish", "Stylish-Regular.ttf", "레트로"),
    "Orbit": ("Orbit", "Orbit-Regular.ttf", "테크"),
    "Gothic A1 Black": ("Gothic+A1:wght@900", "GothicA1-Black.ttf", "테크"),
    "IBM Plex Sans KR Bold": ("IBM+Plex+Sans+KR:wght@700", "IBMPlexSansKR-Bold.ttf", "테크"),
    "Sunflower Bold": ("Sunflower:wght@700", "Sunflower-Bold.ttf", "둥근"),
    "Gowun Dodum": ("Gowun+Dodum", "GowunDodum-Regular.ttf", "둥근"),
    "Dongle Bold": ("Dongle:wght@700", "Dongle-Bold.ttf", "둥근"),
    "Cute Font": ("Cute+Font", "CuteFont-Regular.ttf", "키치"),
    "Single Day": ("Single+Day", "SingleDay-Regular.ttf", "키치"),
    "Poor Story": ("Poor+Story", "PoorStory-Regular.ttf", "키치"),
    "Kirang Haerang": ("Kirang+Haerang", "KirangHaerang-Regular.ttf", "키치"),
    "Gugi": ("Gugi", "Gugi-Regular.ttf", "구기"),
}

# 책의 '글꼴 느낌 10가지'
FEELS = ["팝", "모던", "명조", "붓", "손글씨", "레트로", "테크", "둥근", "키치", "구기"]

# 느낌별 (제목용, 본문·자막용). 자막은 가독성이 먼저라 굵은 고딕 위주.
FEEL_FONTS: dict[str, tuple[list[str], list[str]]] = {
    "팝": (["Black Han Sans", "Do Hyeon"], ["Black Han Sans", "Noto Sans KR Black"]),
    "모던": (["Noto Sans KR Black", "Gothic A1 Black"], ["Noto Sans KR Black", "Nanum Gothic ExtraBold"]),
    "명조": (["Noto Serif KR Black", "Nanum Myeongjo ExtraBold"], ["Noto Sans KR Black"]),
    "붓": (["East Sea Dokdo", "Nanum Brush Script"], ["Black Han Sans", "Noto Sans KR Black"]),
    "손글씨": (["Nanum Pen Script", "Gaegu Bold"], ["Jua", "Noto Sans KR Black"]),
    "레트로": (["Black And White Picture", "Yeon Sung"], ["Do Hyeon", "Noto Sans KR Black"]),
    "테크": (["Orbit", "Gothic A1 Black"], ["Gothic A1 Black", "Noto Sans KR Black"]),
    "둥근": (["Jua", "Sunflower Bold"], ["Jua", "Noto Sans KR Black"]),
    "키치": (["Cute Font", "Single Day"], ["Jua", "Noto Sans KR Black"]),
    "구기": (["Gugi", "Black Han Sans"], ["Do Hyeon", "Noto Sans KR Black"]),
}

# 내려받은 글꼴이 없을 때 쓰는 운영체제 기본 한글 글꼴
SYSTEM_FONTS = [
    "C:/Windows/Fonts/malgunbd.ttf",
    "C:/Windows/Fonts/malgun.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
    "/Library/Fonts/NanumGothicExtraBold.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/nanum/NanumGothicExtraBold.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]

_font_dirs: list[Path] = [ROOT / "assets" / "fonts"]


def add_font_dir(path: Path) -> None:
    if path not in _font_dirs:
        _font_dirs.insert(0, path)
        find_family.cache_clear()


@lru_cache(maxsize=None)
def find_family(family: str) -> Path | None:
    entry = CATALOG.get(family)
    names = [entry[1]] if entry else []
    names.append(family)  # 사용자가 파일 이름을 직접 적은 경우
    for d in _font_dirs:
        for n in names:
            p = d / n
            if p.exists():
                return p
    return None


@lru_cache(maxsize=None)
def system_font() -> Path | None:
    for p in SYSTEM_FONTS:
        if Path(p).exists():
            return Path(p)
    return None


def resolve(families: list[str]) -> Path:
    for fam in families:
        p = find_family(fam)
        if p:
            return p
    for fam in ("Noto Sans KR Black", "Black Han Sans"):
        p = find_family(fam)
        if p:
            return p
    p = system_font()
    if p:
        return p
    raise FileNotFoundError("한글 글꼴을 찾지 못했습니다. `python -m reels_autopilot fonts` 로 무료 글꼴을 받으세요.")


@lru_cache(maxsize=None)
def coverage(path: Path) -> frozenset[int] | None:
    """글꼴에 들어 있는 글자 목록. fontTools 가 없으면 None(=다 있다고 가정)."""
    try:
        from fontTools.ttLib import TTFont  # type: ignore

        f = TTFont(str(path), fontNumber=0, lazy=True)
        cmap = f.getBestCmap() or {}
        return frozenset(cmap.keys())
    except Exception:
        return None


@lru_cache(maxsize=512)
def _pil_font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


class FontPack:
    """주 글꼴 + 대체 글꼴. 글자마다 있는 쪽으로 그립니다."""

    def __init__(self, primary: Path, fallback: Path | None = None):
        self.primary = primary
        self.fallback = fallback or resolve(["Noto Sans KR Black"])
        self._cov = coverage(primary)

    @classmethod
    def of(cls, families: list[str]) -> "FontPack":
        return cls(resolve(families))

    def font(self, size: int, fallback: bool = False) -> ImageFont.FreeTypeFont:
        return _pil_font(self.fallback if fallback else self.primary, max(4, int(size)))

    def runs(self, text: str) -> list[tuple[str, bool]]:
        if self._cov is None:
            return [(text, False)]
        out: list[tuple[str, bool]] = []
        for ch in text:
            fb = not (ch.isspace() or ord(ch) in self._cov)
            if out and out[-1][1] == fb:
                out[-1] = (out[-1][0] + ch, fb)
            else:
                out.append((ch, fb))
        return out

    def width(self, text: str, size: int) -> float:
        return sum(self.font(size, fb).getlength(seg) for seg, fb in self.runs(text))

    def metrics(self, size: int) -> tuple[int, int]:
        asc, desc = self.font(size).getmetrics()
        return asc, desc

    def draw(self, draw: ImageDraw.ImageDraw, xy: tuple[float, float], text: str, size: int, fill,
             stroke_width: int = 0, stroke_fill=None) -> float:
        """xy = (왼쪽 x, 글자 기준선 y). 그린 너비를 돌려줍니다."""
        x, y = xy
        for seg, fb in self.runs(text):
            f = self.font(size, fb)
            draw.text((x, y), seg, font=f, fill=fill, anchor="ls",
                      stroke_width=stroke_width, stroke_fill=stroke_fill)
            x += f.getlength(seg)
        return x - xy[0]

    def fit_size(self, text: str, max_width: float, start: int, min_size: int = 24) -> int:
        size = start
        while size > min_size and self.width(text, size) > max_width:
            size -= 4
        return size


# ---------------------------------------------------------------------------
# 무료 글꼴 내려받기
# ---------------------------------------------------------------------------
_CSS_URL = "https://fonts.googleapis.com/css2?family={}&display=swap"
# 오래된 브라우저 이름을 대면 구글이 woff2 대신 통짜 TTF 주소를 줍니다.
_OLD_UA = "Mozilla/4.0"


def _get(url: str, timeout: float = 60.0) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": _OLD_UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def download(dest: Path, families: list[str] | None = None, log: Callable[[str], None] = print) -> list[Path]:
    dest.mkdir(parents=True, exist_ok=True)
    got: list[Path] = []
    for fam in families or list(CATALOG):
        if fam not in CATALOG:
            log(f"  모르는 글꼴: {fam}")
            continue
        css_param, fname, feel = CATALOG[fam]
        target = dest / fname
        if target.exists() and target.stat().st_size > 10_000:
            got.append(target)
            continue
        try:
            css = _get(_CSS_URL.format(css_param)).decode("utf-8", "replace")
            m = re.search(r"url\((https://[^)]+?\.ttf)\)", css)
            if not m:
                log(f"  ✗ {fam}: TTF 주소를 찾지 못함")
                continue
            target.write_bytes(_get(m.group(1), timeout=180.0))
            got.append(target)
            log(f"  ✓ {fam} ({feel}) {target.stat().st_size // 1024}KB")
        except Exception as e:  # 네트워크 문제는 다음 글꼴로 넘어감
            log(f"  ✗ {fam}: {e}")
    find_family.cache_clear()
    return got


def installed() -> dict[str, Path]:
    return {fam: p for fam in CATALOG if (p := find_family(fam))}


if sys.platform == "win32":  # 윈도우 사용자 글꼴 폴더도 찾아봄
    _font_dirs.append(Path.home() / "AppData/Local/Microsoft/Windows/Fonts")
