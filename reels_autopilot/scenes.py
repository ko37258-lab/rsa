"""6단계 장면 나누기 — 말이 나오면 장면이 따라온다.

책 5장의 규칙:
- 말을 1.2초 이상 덩어리로 묶고 4.6초 넘는 덩어리는 반으로 나눠 화면을 정한다.
- 첫 덩어리는 얼굴 전체 + 큰 제목(훅). '댓글'이 나오면 그 말부터 새 장면 + 댓글 말풍선.
- 끝인사('다음 영상에서 만나요', '감사합니다', '구독')는 얼굴 클로즈업.
- 숫자 → 숫자 카드, '~하고 ~하고' 두 번 넘게 → 체크리스트, '~죠/~까/~나요/?/궁금' → 물음표 카드,
  나머지 → 핵심어 카드.
- 화면 배치는 반반·반반·클로즈업·반반·반반·전체샷 순서로 돌고, 특별한 장면 다음엔 반반으로 쉬어 간다.
장면 종류는 엔진이 정하고, 템플릿은 그 장면을 자기 모양으로 그리기만 한다.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

from . import text as T
from .lexicon import TOOL_BADGES
from .settings import Targets
from .transcribe import Word

DEFAULT_CYCLE = ["half", "half", "closeup", "half", "half", "full"]
SPECIAL_KINDS = {"hook", "comment", "closing", "material", "demo"}
CARD_KINDS = {"number", "checklist", "question"}
_NUM_WORD = re.compile(rf"^(?:\d[\d,.]*|{T._KNUM})$")
_COUNTER_START = re.compile(rf"^(?:{T._COUNTER})")


@dataclass
class SubLine:
    text: str
    start: float
    end: float
    tokens: list[tuple[str, str]]  # (낱말, 'normal' | 'key' | 'num')


@dataclass
class Scene:
    index: int
    start: float
    end: float
    text: str
    kind: str
    words: list[Word] = field(default_factory=list)
    layout: str = "half"
    lines: list[SubLine] = field(default_factory=list)
    card: dict = field(default_factory=dict)
    keywords: list[str] = field(default_factory=list)
    sfx: list[tuple[float, str]] = field(default_factory=list)

    @property
    def dur(self) -> float:
        return self.end - self.start

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("words", None)
        return d


# ---------------------------------------------------------------------------
# 덩어리 나누기
# ---------------------------------------------------------------------------
def _dur(ws: list[Word]) -> float:
    return ws[-1].end - ws[0].start if ws else 0.0


def _bad_cut(left: Word, right: Word) -> bool:
    """'세 | 가지'처럼 숫자와 단위 사이는 자르지 않음."""
    return bool(_NUM_WORD.match(T.strip_punct(left.text)) and _COUNTER_START.match(T.strip_punct(right.text)))


def _split_long(c: list[Word], max_d: float) -> list[list[Word]]:
    if _dur(c) <= max_d or len(c) < 2:
        return [c]
    mid = (c[0].start + c[-1].end) / 2
    # 가운데에서 가장 가깝되 쉼표·문장부호 뒤를 선호, 숫자+단위 사이는 피함
    best_k, best_score = 1, 1e9
    for k in range(1, len(c)):
        if _bad_cut(c[k - 1], c[k]):
            continue
        score = abs(c[k].start - mid)
        if T.is_sentence_end(c[k - 1].text) or c[k - 1].text.endswith(","):
            score -= 0.6
        if score < best_score:
            best_k, best_score = k, score
    return _split_long(c[:best_k], max_d) + _split_long(c[best_k:], max_d)


def _sentences(words: list[Word], t: Targets) -> list[list[Word]]:
    """문장 단위로 나눕니다. 문장부호가 없으면 0.25초 넘게 쉬는 곳에서."""
    has_punct = any(T.is_sentence_end(w.text) for w in words)
    out: list[list[Word]] = []
    cur: list[Word] = []
    for i, w in enumerate(words):
        if cur and "댓글" in w.text:
            out.append(cur)  # '댓글'이 나오면 그 말부터 새 장면
            cur = []
        cur.append(w)
        gap_next = words[i + 1].start - w.end if i + 1 < len(words) else 9.0
        end = T.is_sentence_end(w.text) if has_punct else (gap_next >= 0.25 or _dur(cur) >= t.cut_interval)
        if end and not (i + 1 < len(words) and _bad_cut(w, words[i + 1])):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def chunk_words(words: list[Word], t: Targets) -> list[list[Word]]:
    """말을 1.2초 이상 덩어리로 묶고, 4.6초 넘는 덩어리는 반으로 나눕니다."""
    chunks: list[list[Word]] = []
    cur: list[Word] = []
    for sent in _sentences(words, t):
        forced = any("댓글" in w.text for w in sent[:1])
        if cur and (_dur(cur) >= t.chunk_min or forced):
            chunks.append(cur)
            cur = []
        cur.extend(sent)
    if cur:
        if chunks and _dur(cur) < t.chunk_min and not any("댓글" in w.text for w in cur[:1]):
            chunks[-1].extend(cur)
        else:
            chunks.append(cur)
    out: list[list[Word]] = []
    for c in chunks:
        out.extend(_split_long(c, t.chunk_max))
    return out


# ---------------------------------------------------------------------------
# 장면 종류
# ---------------------------------------------------------------------------
def _match_material(text: str, materials: dict[str, Path], used: set[str]) -> str | None:
    compact = T.norm(text)
    for key in sorted(materials, key=len, reverse=True):
        if key in used:
            continue
        if T.norm(key) and T.norm(key) in compact:
            return key
    return None


def classify(i: int, n: int, text: str, words: list[Word], *, material: str | None, has_demo: bool) -> str:
    if i == 0:
        return "hook"
    if "댓글" in text:
        return "comment"
    if T.is_closing(text) and i >= n - 3:
        return "closing"
    if material:
        return "material"
    if has_demo and T.has_demo_trigger(text):
        return "demo"
    if T.find_number(text):
        return "number"
    if T.count_listing([w.text for w in words]) >= 2:
        return "checklist"
    if T.is_question(text):
        return "question"
    return "keyword"


def _comment_word(text: str, cta: str) -> str:
    m = re.search(r"[‘'\"“]([^’'\"”]{1,12})[’'\"”]", text)
    if m:
        return m.group(1)
    m = re.search(r"(\S{1,10}?)(?:이)?라고\s*(?:남겨|적어|써|달아)", text)
    if m:
        return T.strip_punct(m.group(1))
    return cta


def _card_for(kind: str, text: str, words: list[Word], keys: list[str], cta: str,
              material: str | None) -> dict:
    if kind == "hook":
        return {"title": T.tidy_title(T.short_line(T.drop_greeting(text), 16))}
    if kind == "number":
        return {"number": T.find_number(text) or "", "label": keys[0] if keys else T.short_line(text, 10)}
    if kind == "checklist":
        items = T.checklist_items([w.text for w in words])
        return {
            "title": keys[0] if keys else "",
            "items": [it for it, _ in items],
            "reveal": [round(words[idx].start, 3) for _, idx in items],
        }
    if kind == "question":
        return {"title": T.short_line(text, 18)}
    if kind == "comment":
        return {"comment": _comment_word(text, cta)}
    if kind == "material":
        return {"material": material, "title": keys[0] if keys else ""}
    if kind == "demo":
        return {"title": keys[0] if keys else ""}
    if kind == "closing":
        return {}
    badge = T.ordinal(text) or next((TOOL_BADGES[k] for k in TOOL_BADGES if k in text), None)
    card = {"title": keys[0] if keys else T.short_line(text, 8), "sub": T.short_line(text, 16)}
    if badge:
        card["badge"] = badge
    return card


# ---------------------------------------------------------------------------
# 자막 줄
# ---------------------------------------------------------------------------
def _display(word: str) -> str:
    w = T.strip_emoji(word).strip()
    return w.rstrip(".,…") if not w.endswith(("?", "!")) else w


def _styles(words: list[Word], emphasis: list[str], max_keys: int = 1) -> list[str]:
    """숫자는 둘째 강조색, 핵심어는 한 줄에 하나만 강조색(책: '핵심 단어만')."""
    styles = ["num" if T.NUM_RE.search(w.text) and re.search(r"\d|가지|째", w.text) else "normal" for w in words]
    keys = 0
    for e in emphasis:
        ne = T.norm(e)
        if len(ne) < 2 or keys >= max_keys:
            continue
        for i, w in enumerate(words):
            clean = T.norm(w.text)
            if styles[i] == "normal" and (ne in clean or (len(clean) >= 2 and clean in ne and len(clean) >= len(ne) - 1)):
                styles[i] = "key"
                keys += 1
                break
    return styles


def _units(words: list[Word]) -> list[list[Word]]:
    """'세 가지'처럼 숫자+단위는 줄바꿈으로 갈라지지 않게 한 묶음으로."""
    units: list[list[Word]] = []
    for w in words:
        if units and _NUM_WORD.match(T.strip_punct(units[-1][-1].text)) and _COUNTER_START.match(T.strip_punct(w.text)):
            units[-1].append(w)
        else:
            units.append([w])
    return units


def make_lines(words: list[Word], t: Targets, emphasis: list[str], scene_end: float) -> list[SubLine]:
    groups: list[list[Word]] = []
    cur: list[Word] = []
    for unit in _units(words):
        n_cur = T.count_chars(" ".join(x.text for x in cur))
        if cur and n_cur + T.count_chars(" ".join(x.text for x in unit)) > t.subtitle_max_chars:
            groups.append(cur)
            cur = []
        cur.extend(unit)
        if T.count_chars(" ".join(x.text for x in cur)) >= t.subtitle_min_chars and T.is_sentence_end(unit[-1].text):
            groups.append(cur)
            cur = []
    if cur:
        tail = T.count_chars(" ".join(x.text for x in cur))
        if groups and tail < t.subtitle_min_chars // 2 and \
                T.count_chars(" ".join(x.text for x in groups[-1] + cur)) <= t.subtitle_max_chars + 3:
            groups[-1].extend(cur)
        else:
            groups.append(cur)
    lines: list[SubLine] = []
    for gi, g in enumerate(groups):
        start = g[0].start
        end = groups[gi + 1][0].start if gi + 1 < len(groups) else scene_end
        toks = list(zip((_display(w.text) for w in g), _styles(g, emphasis)))
        toks = [(a, b) for a, b in toks if a]
        lines.append(SubLine(" ".join(a for a, _ in toks), round(start, 3), round(end, 3), toks))
    return lines


# ---------------------------------------------------------------------------
# 효과음 신호
# ---------------------------------------------------------------------------
def _sfx_for(scene: Scene, prev_layout: str | None) -> list[tuple[float, str]]:
    k = scene.kind
    s = scene.start
    if k == "hook":
        return [(max(0.0, s), "boom")]
    if k == "number":
        return [(s, "ding")]
    if k == "checklist":
        return [(r, "tick") for r in scene.card.get("reveal", [])] or [(s, "tick")]
    if k == "question":
        return [(s, "pop")]
    if k == "comment":
        return [(s, "bubble")]
    if k == "closing":
        return [(s, "swoosh_up")]
    if k in ("material", "demo"):
        return [(s, "shutter")]
    if prev_layout and prev_layout != scene.layout:
        return [(s, "whoosh")]
    return []


# ---------------------------------------------------------------------------
def build_scenes(
    words: list[Word],
    t: Targets,
    terms: list[str],
    *,
    total_duration: float,
    materials: dict[str, Path] | None = None,
    has_demo: bool = False,
    cta: str = "자료",
) -> list[Scene]:
    materials = materials or {}
    if not words:
        return [Scene(0, 0.0, total_duration, "", "closing", layout="full")]
    chunks = chunk_words(words, t)
    scenes: list[Scene] = []
    used: set[str] = set()
    for i, c in enumerate(chunks):
        text = " ".join(w.text for w in c)
        mat = _match_material(text, materials, used)
        kind = classify(i, len(chunks), text, c, material=mat, has_demo=has_demo)
        if kind == "material" and mat:
            used.add(mat)
        keys = [] if kind == "closing" else T.keywords(text, terms)
        start = 0.0 if i == 0 else c[0].start
        scenes.append(Scene(i, start, c[-1].end, text, kind, list(c), keywords=keys,
                            card=_card_for(kind, text, c, keys, cta, mat if kind == "material" else None)))
    for a, b in zip(scenes, scenes[1:]):
        a.end = b.start
    scenes[-1].end = max(scenes[-1].end, total_duration)
    for s in scenes:
        s.lines = make_lines(s.words, t, s.keywords, s.end)
    assign_layouts(scenes, DEFAULT_CYCLE)
    return scenes


def comment_word(scenes: list[Scene], default: str) -> str:
    """영상에서 실제로 말한 댓글 유도어('공법'이라고 남겨주세요 → 공법)."""
    return next((s.card["comment"] for s in scenes if s.kind == "comment" and s.card.get("comment")), default)


def assign_layouts(scenes: list[Scene], cycle: list[str]) -> None:
    """템플릿마다 배치 순서가 다를 수 있어 따로 둡니다. 효과음 신호도 배치에 따라 다시 정함."""
    pos = 0
    prev: str | None = None
    for s in scenes:
        if s.kind == "hook":
            s.layout = "full"
        elif s.kind == "closing":
            s.layout = "closeup"
        elif s.kind in ("comment", "material", "demo"):
            s.layout = "half"
        else:
            s.layout = cycle[pos % len(cycle)]
            pos += 1
            if s.kind in CARD_KINDS and s.layout != "half":
                s.layout = "half"
        if s.kind in SPECIAL_KINDS:
            pos = 0  # 특별한 장면 다음에는 반반으로 쉬어 간다
        s.sfx = _sfx_for(s, prev)
        prev = s.layout


def apply_direction(scenes: list[Scene], direction: dict, t: Targets) -> None:
    """AI 연출(카드 문구·강조어)을 장면에 덮어씁니다. 숫자·타이밍은 건드리지 않음."""
    by_idx = {int(d.get("index", -1)): d for d in direction.get("scenes", []) if isinstance(d, dict)}
    for s in scenes:
        d = by_idx.get(s.index)
        if not d:
            continue
        emph = [e for e in d.get("emphasis", []) if isinstance(e, str) and e.strip()]
        if emph:
            s.keywords = emph + [k for k in s.keywords if k not in emph]
            s.lines = make_lines(s.words, t, s.keywords, s.end)
        title = (d.get("card_title") or "").strip()
        sub = (d.get("card_sub") or "").strip()
        if s.kind == "keyword":
            if title:
                s.card["title"] = title
            if sub:
                s.card["sub"] = sub
        elif s.kind in ("number", "question", "material", "demo") and title:
            s.card["label" if s.kind == "number" else "title"] = title
        elif s.kind == "checklist" and d.get("items"):
            items = [str(x) for x in d["items"]][: len(s.card.get("items", [])) or 4]
            if items and len(items) == len(s.card.get("items", [])):
                s.card["items"] = items
    hook = (direction.get("hook_title") or "").strip()
    if hook and scenes and scenes[0].kind == "hook":
        scenes[0].card["title"] = hook
