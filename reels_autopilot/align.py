"""2단계 자막 오타 바로잡기 — 받아쓴 낱말을 대본 글자로 맞춥니다.

책 5장의 규칙 그대로:
- 받아쓴 글과 대본이 45% 넘게 같으면 '대본을 읽은 영상'으로 보고 대본 글자를 통째로 앉힌다.
- 아니면 낱말마다 80% 넘게 비슷하거나, 60% 넘고 글자 수 차이가 한 자 이하일 때만 고친다.
- 길이가 많이 다른 말로는 안 바꾼다 ('다음'이 '다'로 바뀌는 사고 방지).
- 앞뒤는 대본과 맞는데 가운데 못 알아들은 말이 끼어 있으면 그 자리를 대본 글자로 채운다.
- 대본에 '있습니다,혹시'처럼 쉼표 뒤를 안 띄워도 문장부호에서 낱말을 나눈다.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from .settings import Targets
from .text import is_filler, norm
from .transcribe import Word

_SPLIT_AFTER_PUNCT = re.compile(r"(?<=[.,!?…])(?=[^\s.,!?…\"'”’)\]])")


@dataclass
class AlignResult:
    words: list[Word]
    mode: str = "none"  # none / whole / partial
    similarity: float = 0.0
    replaced: int = 0
    notes: list[str] = field(default_factory=list)
    removed: list[Word] = field(default_factory=list)  # 대본에 없는 군말


def tokenize_script(script: str) -> list[str]:
    tokens: list[str] = []
    for raw in script.split():
        tokens.extend(p for p in _SPLIT_AFTER_PUNCT.split(raw) if p)
    return [t for t in tokens if norm(t)]


def ratio(a: str, b: str) -> float:
    a, b = norm(a), norm(b)
    if not a and not b:
        return 1.0
    return SequenceMatcher(None, a, b, autojunk=False).ratio()


def _distribute(spoken: list[Word], tokens: list[str]) -> list[Word]:
    """받아쓴 낱말들의 '말한 시간'에 대본 낱말을 글자 수 비율로 나눠 앉힙니다.

    낱말 사이의 쉬는 틈은 건너뛰므로, 대본 낱말이 침묵 위에 걸쳐 빈 곳 자르기를 막지 않습니다.
    """
    if len(spoken) == len(tokens):
        return [Word(t, w.start, w.end, w.prob) for w, t in zip(spoken, tokens)]
    spans = [(w.start, w.end) for w in spoken]
    talk = sum(e - s for s, e in spans) or 1e-6

    def at(pos: float) -> float:  # 말한 시간 위의 위치(초) → 실제 시각
        for s, e in spans:
            if pos <= e - s:
                return s + pos
            pos -= e - s
        return spans[-1][1]

    weights = [max(1, len(norm(t))) for t in tokens]
    total = float(sum(weights))
    out: list[Word] = []
    acc = 0.0
    for t, wt in zip(tokens, weights):
        s = at(talk * acc / total)
        acc += wt
        e = at(talk * acc / total - 1e-6)
        out.append(Word(t, round(s, 3), round(max(e, s + 0.02), 3), 0.9))
    return out


def _len_ok(a: str, b: str) -> bool:
    la, lb = len(norm(a)), len(norm(b))
    if not la or not lb:
        return False
    return min(la, lb) / max(la, lb) >= 0.5


def align(words: list[Word], script: str, targets: Targets) -> AlignResult:
    if not script or not script.strip() or not words:
        return AlignResult(list(words))
    tokens = tokenize_script(script)
    if not tokens:
        return AlignResult(list(words))
    # 대본에 없는 '음, 어' 는 맞추기 전에 빼 둠 — 섞여 있으면 앞뒤 낱말이 침묵까지 끌어안습니다
    script_fillers = {norm(t) for t in tokens if is_filler(t)}
    removed = [w for w in words if is_filler(w.text) and norm(w.text) not in script_fillers]
    if removed:
        words = [w for w in words if not (is_filler(w.text) and norm(w.text) not in script_fillers)]

    overall = ratio(" ".join(w.text for w in words), " ".join(tokens))
    whole = overall > targets.script_match_whole
    a = [norm(w.text) for w in words]
    b = [norm(t) for t in tokens]
    ops = SequenceMatcher(None, a, b, autojunk=False).get_opcodes()

    out: list[Word] = []
    replaced = 0
    for idx, (tag, i1, i2, j1, j2) in enumerate(ops):
        if tag == "equal":
            # 같은 낱말이어도 대본 쪽 글자를 써서 문장부호·띄어쓰기를 살림
            out.extend(Word(tokens[j1 + k], w.start, w.end, w.prob) for k, w in enumerate(words[i1:i2]))
        elif tag == "replace":
            spoken, toks = words[i1:i2], tokens[j1:j2]
            sp_text, tk_text = " ".join(w.text for w in spoken), " ".join(toks)
            r = ratio(sp_text, tk_text)
            small = len(spoken) <= 3 and len(toks) <= 3
            sandwiched = (0 < idx < len(ops) - 1 and ops[idx - 1][0] == "equal" and ops[idx + 1][0] == "equal")
            if whole:
                ok = (r >= 0.3 or small) and _len_ok(sp_text, tk_text)
            else:
                diff = abs(len(norm(sp_text)) - len(norm(tk_text)))
                ok = _len_ok(sp_text, tk_text) and (
                    r > targets.script_match_word
                    or (r > targets.script_match_word_loose and diff <= 1)
                    or (sandwiched and small)
                )
            if ok:
                out.extend(_distribute(spoken, toks))
                replaced += len(toks)
            else:
                out.extend(spoken)
        elif tag == "delete":
            out.extend(words[i1:i2])  # 대본에 없지만 실제로 말한 것 → 말한 대로 둠
        # insert: 대본에 있지만 들리지 않은 말 → 자막을 지어내지 않음

    res = AlignResult(out, "whole" if whole else "partial", overall, replaced, removed=removed)
    if not whole and overall < 0.2:
        res.notes.append("대본과 실제 말이 많이 달라요. 대본은 실제로 말한 대로 넣어야 자막이 정확해집니다.")
    return res
