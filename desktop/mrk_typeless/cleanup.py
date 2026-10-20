"""받아쓴 글 손질: Win+H 등이 끼워 넣는 깨진 문자 제거, AI 없이 하는 기본 정리."""

import re
import unicodedata

# Windows 음성 입력은 Chrome 계열 등에서 "클로─ ─드"처럼 글자 사이에 줄 모양 문자를 넣기도 합니다.
_DASHES = "─━—―⸺ㅡ"
_INVISIBLE = re.compile("[ᅟᅠㅤﾠ​-‍⁠﻿]")
_BROKEN_JOIN = re.compile(rf"([^\s{_DASHES}])[{_DASHES}]\s{{0,2}}[{_DASHES}](?=[^\s{_DASHES}])")

_FILLER = re.compile(r"^(음+|으+음+|어+|으+|아+|에+|흠+|um+|uh+|erm+|hmm+)$", re.IGNORECASE)
_EDGE_PUNCT = re.compile(r"^[\s\"'“”‘’(]+|[\s,.…!?~\"'“”‘’)]+$")


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
                continue
            if kept and core and _bare(kept[-1]).lower() == core.lower():
                removed += 1
                kept[-1] = token
                continue
            kept.append(token)
        lines.append(re.sub(r"\s+([,.!?…])", r"\1", " ".join(kept)))
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    return text, removed
