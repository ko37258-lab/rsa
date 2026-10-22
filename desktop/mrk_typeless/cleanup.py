"""받아쓴 글 손질: Win+H 등이 끼워 넣는 깨진 문자 제거, AI 없이 하는 기본 정리."""

import re
import unicodedata

# Windows 음성 입력은 Chrome 계열 등에서 "클로─ ─드"처럼 글자 사이에 줄 모양 문자를 넣기도 합니다.
_DASHES = "─━—―⸺ㅡ"
_INVISIBLE = re.compile("[\u115f\u1160\u3164\uffa0\u200b\u200c\u2060\ufeff]")  # 이모지 결합자(U+200D)는 남깁니다
_BROKEN_JOIN = re.compile(rf"([^\s{_DASHES}])[{_DASHES}]\s{{0,2}}[{_DASHES}](?=[^\s{_DASHES}])")

_FILLER = re.compile(r"^(음+|으+음+|어+|으+|아+|에+|흠+|um+|uh+|erm+|hmm+)$", re.IGNORECASE)
_EDGE_PUNCT = re.compile(r"^[\s\"'“”‘’(]+|[\s,.…!?~\"'“”‘’)]+$")
_SENTENCE_END = re.compile(r"[.!?…]+$")
# 일부러 겹쳐 말하는 부사: "정말 정말", "하나 하나"는 더듬은 말이 아닙니다.
_REDUPLICATED = {"정말", "하나", "따로", "매일", "빨리", "자주", "가끔", "조금", "많이", "아주", "너무", "각각", "천천히", "차근차근", "꼭", "잘", "더", "또", "다시"}


def _is_stutter(core: str) -> bool:
    """바로 이어서 반복한 말 가운데 더듬은 말로 볼 것: 짧은 말(두 글자 이하)이면서 겹쳐 쓰는 부사가 아닌 것"""
    return len(core) <= 2 and core not in _REDUPLICATED


def sanitize_dictation(text: str) -> str:
    out = _INVISIBLE.sub("", unicodedata.normalize("NFC", text))
    while True:
        joined = _BROKEN_JOIN.sub(r"\1", out)
        if joined == out:
            return out
        out = joined


def _bare(token: str) -> str:
    return _EDGE_PUNCT.sub("", token)


def local_cleanup(raw: str) -> tuple[str, int]:
    """뜻 없는 감탄사와 바로 이어서 반복한 말만 지웁니다 (문장은 고쳐 쓰지 않음)."""
    removed = 0
    lines = []
    for line in raw.split("\n"):
        kept: list[str] = []
        for token in line.split():
            core = _bare(token)
            if core and _FILLER.match(core):
                removed += 1
                # "확인했습니다 음." → 마침표는 앞 말에 남깁니다.
                tail = _SENTENCE_END.search(token)
                if tail and kept and not _SENTENCE_END.search(kept[-1]):
                    kept[-1] += tail.group(0)
                continue
            if kept and core and _is_stutter(core) and _bare(kept[-1]).lower() == core.lower():
                removed += 1
                kept[-1] = token
                continue
            kept.append(token)
        lines.append(re.sub(r"\s+([,.!?…])", r"\1", " ".join(kept)))
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    return text, removed
