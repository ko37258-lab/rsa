"""템플릿 100개 — 기본 디자인 10종 × (색 10가지·글꼴 느낌 10가지) 변형.

장면 종류(훅·핵심어·숫자·체크리스트·물음표·댓글·끝인사)는 엔진이 정하고,
템플릿은 그 장면을 자기 모양으로 그리기만 합니다. 그래서 템플릿을 바꿔도 대본 맞춤은 그대로 살아 있습니다.

위치 숫자는 책 7장 '눈대중 말고 원본을 재서 옮긴다'의 실측값을 따릅니다.
- 얼굴이 꽉 찬 화면에서 턱 끝은 약 1100px → 자막 가운데를 1210px 로 내림
- '얼굴 너무 위' → 영상을 280px 내리고 위는 어두운 바탕
- 화면 아래 5분의 1(1536px 아래)은 인스타 버튼에 가려지니 비움
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path

from .fonts import FEEL_FONTS, FEELS
from .scenes import DEFAULT_CYCLE


@dataclass
class Palette:
    name: str
    card_bg: str
    card_fg: str
    accent: str  # 핵심어 강조
    accent2: str  # 숫자 강조
    sub_fg: str = "#FFFFFF"
    sub_stroke: str = "#000000"
    muted: str = "#8A8A8A"


PALETTES = [
    Palette("노랑", "#FFFFFF", "#111111", "#FFD400", "#FF3B30"),
    Palette("빨강", "#111111", "#FFFFFF", "#FF3B4E", "#FFD400"),
    Palette("파랑", "#0B1F4B", "#FFFFFF", "#4FC3FF", "#FFD166"),
    Palette("초록", "#F1FFF4", "#0B3D2E", "#00E676", "#FF6D00"),
    Palette("분홍", "#FFE4EE", "#3A0B1F", "#FF4F8B", "#7C4DFF"),
    Palette("보라", "#1E1033", "#FFFFFF", "#B388FF", "#FFD54F"),
    Palette("주황", "#FFF3E0", "#2B1600", "#FF8F00", "#D50000"),
    Palette("민트", "#E0F7F4", "#00332E", "#1DE9B6", "#FF5252"),
    Palette("블랙골드", "#000000", "#FFFFFF", "#E6BE5A", "#FFFFFF"),
    Palette("네이비골드", "#0A1A3A", "#FFFFFF", "#F2C14E", "#FF6B6B"),
]


@dataclass
class Template:
    id: str
    base: str
    label: str
    desc: str
    style: str = "split"  # split: 위 카드 / 아래 얼굴, overlay: 얼굴 위에 글자
    card_style: str = "flat"  # flat / paper / glow / border / bold / overlay_text / diagram
    palette: Palette = field(default_factory=lambda: PALETTES[0])
    feel: str = "모던"
    split_h: int = 820  # 반반형 카드 높이(px)
    face_shift: int = 0  # overlay 형에서 영상을 내리는 px (책: 280)
    headline: bool = False  # 위 제목 두 줄 고정 (68개 중 12개가 쓰던 모양)
    progress: bool = False  # 진행막대
    sub_size: int = 76
    sub_y_full: int = 1210  # 얼굴 꽉 찬 화면의 자막 가운데
    sub_box: bool = False  # 자막 뒤 반투명 상자
    cycle: list[str] = field(default_factory=lambda: list(DEFAULT_CYCLE))
    sfx_level: float = 0.32
    zoom_punch: bool = True  # 클로즈업 들어갈 때 살짝 당기기

    @property
    def title_fonts(self) -> list[str]:
        return FEEL_FONTS[self.feel][0]

    @property
    def body_fonts(self) -> list[str]:
        return FEEL_FONTS[self.feel][1]

    @property
    def name(self) -> str:
        return f"{self.label} · {self.palette.name} · {self.feel}"

    def sub_y(self, layout: str) -> int:
        if layout == "half" and self.style == "split":
            return self.split_h + 92
        return self.sub_y_full

    def to_dict(self) -> dict:
        d = asdict(self)
        d["name"] = self.name
        return d


# 기본 디자인 10종: (id, 이름, 설명, 기본 색 번호, 기본 글꼴 느낌, 설정)
_BASES: list[tuple[str, str, str, int, str, dict]] = [
    ("studio", "스튜디오 반반", "위 카드·아래 얼굴. 가장 무난한 정보형", 0, "모던", {}),
    ("faceful", "얼굴꽉 오버레이", "얼굴을 280px 내리고 위 어두운 바탕에 큰 글씨", 1, "팝",
     {"style": "overlay", "card_style": "overlay_text", "face_shift": 280}),
    ("headline", "헤드라인 고정", "위 제목 두 줄을 끝까지 고정하는 뉴스형", 2, "모던",
     {"style": "overlay", "card_style": "overlay_text", "face_shift": 360, "headline": True}),
    ("note", "노트 필기", "공책 종이에 형광펜 밑줄. 강의·정리형", 6, "손글씨", {"card_style": "paper"}),
    ("neon", "네온 테크", "어두운 카드에 빛나는 글씨. AI·도구 소개형", 5, "테크", {"card_style": "glow"}),
    ("magazine", "매거진 명조", "얇은 테두리와 명조체. 고급·브랜딩형", 8, "명조", {"card_style": "border"}),
    ("pop", "팝 컬러", "강조색을 통째로 깐 카드. 발랄한 꿀팁형", 4, "팝", {"card_style": "bold"}),
    ("minimal", "미니멀 풀샷", "카드 없이 얼굴과 굵은 글씨만. 빠른 컷", 8, "모던",
     {"style": "overlay", "card_style": "overlay_text", "face_shift": 0, "sub_box": True,
      "cycle": ["full", "closeup", "full", "half", "closeup", "full"]}),
    ("progress", "진행막대", "위에 진행막대가 차오르는 단계 설명형", 7, "둥근", {"progress": True}),
    ("briefing", "부동산 브리핑", "네이비·골드 체계도 상자. 숫자·법규 설명형", 9, "모던",
     {"card_style": "diagram"}),
]


def _build() -> list[Template]:
    out: list[Template] = []
    for b, (bid, label, desc, pal_i, feel, opts) in enumerate(_BASES):
        base = Template(id="", base=bid, label=label, desc=desc, palette=PALETTES[pal_i], feel=feel, **opts)
        feel_i = FEELS.index(feel)
        for k in range(10):
            pal = PALETTES[(pal_i + k) % len(PALETTES)]
            fl = FEELS[(feel_i + k * 3) % len(FEELS)] if k else feel
            out.append(replace(base, id=f"T{b * 10 + k + 1:03d}", palette=pal, feel=fl))
    return out


TEMPLATES: list[Template] = _build()
BY_ID: dict[str, Template] = {t.id: t for t in TEMPLATES}
BASE_DEFAULT: dict[str, Template] = {t.base: t for t in reversed(TEMPLATES)}  # 각 기본 디자인의 첫 변형


def get(template_id: str) -> Template:
    key = template_id.strip()
    if key in BY_ID:
        return BY_ID[key]
    if key.upper() in BY_ID:
        return BY_ID[key.upper()]
    if key in BASE_DEFAULT:
        return BASE_DEFAULT[key]
    for t in TEMPLATES:  # 이름 일부로도 찾기 ('부동산', '네온')
        if key and (key in t.label or key in t.name):
            return t
    raise KeyError(f"템플릿을 찾을 수 없습니다: {template_id}")


def auto_pick(scene_kinds: list[str], domain: str, n: int = 1) -> list[Template]:
    """영상 내용으로 템플릿을 고릅니다 (책: 맨 위 '자동'으로 두면 영상마다 알아서).

    숫자 장면이 많으면 브리핑·헤드라인, 나열이 많으면 진행막대·노트, 질문이 많으면 팝,
    짧으면 미니멀. 부동산 분야면 브리핑을 우선합니다.
    """
    total = max(1, len(scene_kinds))
    share = {k: scene_kinds.count(k) / total for k in set(scene_kinds)}
    score = {b[0]: 0.0 for b in _BASES}
    score["studio"] += 0.30
    score["faceful"] += 0.25
    score["briefing"] += share.get("number", 0) * 2.0 + (0.35 if domain == "realestate" else 0)
    score["headline"] += share.get("number", 0) * 1.2 + share.get("question", 0) * 0.5
    score["progress"] += share.get("checklist", 0) * 2.5
    score["note"] += share.get("checklist", 0) * 1.5 + share.get("keyword", 0) * 0.3
    score["pop"] += share.get("question", 0) * 1.8
    score["neon"] += share.get("material", 0) * 1.5 + share.get("demo", 0) * 1.5
    score["minimal"] += 0.4 if total <= 6 else 0.0
    ranked = sorted(score, key=lambda k: -score[k])
    return [BASE_DEFAULT[k] for k in ranked[: max(1, n)]]


def catalog() -> list[dict]:
    return [{"id": t.id, "name": t.name, "base": t.base, "label": t.label, "desc": t.desc,
             "palette": t.palette.name, "feel": t.feel} for t in TEMPLATES]


def export_json(path: Path) -> None:
    path.write_text(json.dumps([t.to_dict() for t in TEMPLATES], ensure_ascii=False, indent=1), encoding="utf-8")
