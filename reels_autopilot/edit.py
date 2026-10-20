"""3~5단계 — 빈 곳 자르기, 군말 자르기, 말 빠르기.

- 0.16초 넘게 말이 없는 곳은 잘라서 0.1초만 남긴다.
- '음, 어, 자' 같은 군말이 혼자 떨어져 있으면 뺀다.
- 초당 8글자가 되도록 1.10~1.25배로 빠르게 한다.
결과는 '남길 구간 목록 + 배속'(편집 결정표)이며, 실제 자르기는 render 단계에서 ffmpeg 가 합니다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .settings import Targets
from .text import count_chars, is_filler
from .transcribe import Word

# 잘린 자리 앞뒤로 남기는 여유. 합쳐서 silence_keep(0.1초)이 되도록 앞 0.04 / 뒤 0.06
_PAD_BEFORE_RATIO = 0.4
_TAIL = 0.25  # 마지막 말 뒤에는 조금 더 남겨 뚝 끊기지 않게


@dataclass
class Segment:
    start: float  # 원본 영상 기준(초)
    end: float

    @property
    def dur(self) -> float:
        return self.end - self.start


@dataclass
class EditPlan:
    segments: list[Segment]
    speed: float
    words: list[Word]  # 완성 영상 시간축으로 옮긴 낱말
    fillers: list[Word] = field(default_factory=list)
    source_duration: float = 0.0
    kept_duration: float = 0.0
    output_duration: float = 0.0
    source_cps: float = 0.0
    output_cps: float = 0.0
    cut_count: int = 0

    def summary(self) -> dict:
        return {
            "원본 길이(초)": round(self.source_duration, 2),
            "자른 뒤 길이(초)": round(self.kept_duration, 2),
            "배속": round(self.speed, 3),
            "완성 길이(초)": round(self.output_duration, 2),
            "원본 말속도(글자/초)": round(self.source_cps, 2),
            "완성 말속도(글자/초)": round(self.output_cps, 2),
            "잘라낸 빈 곳": self.cut_count,
            "지운 군말": [w.text for w in self.fillers],
        }

    def to_dict(self) -> dict:
        return {
            "segments": [[round(s.start, 3), round(s.end, 3)] for s in self.segments],
            "speed": self.speed,
            "summary": self.summary(),
        }

    def map_time(self, t: float) -> float:
        """원본 시각 → 완성 영상 시각."""
        acc = 0.0
        for s in self.segments:
            if t < s.start:
                return acc / self.speed
            if t <= s.end:
                return (acc + t - s.start) / self.speed
            acc += s.dur
        return acc / self.speed


def find_fillers(words: list[Word], min_gap: float = 0.15) -> set[int]:
    """앞뒤로 쉬는 틈이 있는 '혼자 떨어진' 군말의 위치."""
    out: set[int] = set()
    for i, w in enumerate(words):
        if not is_filler(w.text):
            continue
        before = w.start - words[i - 1].end if i > 0 else 9.0
        after = words[i + 1].start - w.end if i + 1 < len(words) else 9.0
        if before >= min_gap and after >= min_gap:
            out.add(i)
    return out


def plan_edit(words: list[Word], media_duration: float, t: Targets, *, cut_silence: bool = True,
              remove_fillers: bool = True, speed_up: bool = True) -> EditPlan:
    if not words:
        seg = Segment(0.0, media_duration)
        return EditPlan([seg], 1.0, [], [], media_duration, media_duration, media_duration)

    filler_idx = find_fillers(words) if remove_fillers else set()
    kept = [w for i, w in enumerate(words) if i not in filler_idx]
    fillers = [w for i, w in enumerate(words) if i in filler_idx]
    if not kept:
        kept, fillers = list(words), []

    pad_before = t.silence_keep * _PAD_BEFORE_RATIO
    pad_after = t.silence_keep - pad_before
    segments: list[Segment] = []
    cuts = 0
    if cut_silence:
        cur = Segment(max(0.0, kept[0].start - pad_before), kept[0].end)
        for prev, w in zip(kept, kept[1:]):
            gap = w.start - prev.end
            if gap > t.silence_gap:
                cur.end = prev.end + pad_after
                segments.append(cur)
                cur = Segment(max(cur.end, w.start - pad_before), w.end)
                cuts += 1
            else:
                cur.end = w.end
        cur.end = min(media_duration, cur.end + _TAIL) if media_duration else cur.end + _TAIL
        segments.append(cur)
        segments = [s for s in segments if s.dur > 0.02]
    else:
        segments = [Segment(0.0, media_duration or kept[-1].end + _TAIL)]

    kept_dur = sum(s.dur for s in segments)
    chars = sum(count_chars(w.text) for w in kept)
    src_cps = chars / kept_dur if kept_dur > 0 else 0.0
    speed = 1.0
    if speed_up and src_cps > 0:
        speed = min(t.speed_max, max(t.speed_min, t.chars_per_sec / src_cps))

    plan = EditPlan(segments, speed, [], fillers, media_duration, kept_dur, kept_dur / speed,
                    src_cps, src_cps * speed, cuts)
    plan.words = [_retime(w, plan) for w in kept]
    return plan


def _retime(w: Word, plan: EditPlan) -> Word:
    s = plan.map_time(w.start)
    e = plan.map_time(w.end)
    return Word(w.text, round(s, 3), round(max(e, s + 0.02), 3), w.prob)
