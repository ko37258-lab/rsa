"""1단계 받아쓰기 — faster-whisper 로 낱말마다 몇 초에 말했는지 기록합니다.

한 번 받아쓴 영상은 캐시에 남겨, 템플릿만 바꿔 다시 만들 때 이 단계를 건너뜁니다.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable

from . import media
from .settings import Settings


@dataclass
class Word:
    text: str
    start: float
    end: float
    prob: float = 1.0

    @property
    def dur(self) -> float:
        return max(0.0, self.end - self.start)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Word":
        return cls(clean_word(str(d["text"])), float(d["start"]), float(d["end"]), float(d.get("prob", 1.0)))


_ZERO_WIDTH = dict.fromkeys(map(ord, "​‌‍⁠﻿"), None)


def clean_word(text: str) -> str:
    return text.translate(_ZERO_WIDTH).strip()


def tighten(words: list[Word], audio, sr: int = 16000, frame: float = 0.02) -> list[Word]:
    """낱말 시작·끝을 실제 소리가 나는 곳으로 당깁니다.

    받아쓰기 모델은 쉬기 직전 낱말을 침묵까지 길게 늘이는 버릇이 있어(예: '음...' 1.6초),
    그대로 두면 0.16초 빈 곳 자르기가 그 침묵을 못 봅니다. 소리 에너지로 다시 잽니다.
    """
    import numpy as np

    if not words or audio is None or len(audio) < sr // 10:
        return words
    hop = int(sr * frame)
    n = len(audio) // hop
    rms = np.sqrt(np.mean(audio[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    floor = float(np.percentile(db, 10))
    peak = float(np.percentile(db, 98))
    thr = max(floor + 8.0, peak - 38.0)
    voiced = db > thr
    out: list[Word] = []
    for w in words:
        a = max(0, int(w.start / frame))
        b = min(n, max(a + 1, int(np.ceil(w.end / frame))))
        idx = np.nonzero(voiced[a:b])[0]
        if len(idx) == 0:
            out.append(w)
            continue
        s = (a + idx[0]) * frame
        e = (a + idx[-1] + 1) * frame
        if e - s < 0.06:
            out.append(w)
            continue
        out.append(Word(w.text, round(max(w.start, s), 3), round(min(w.end, e), 3), w.prob))
    return out


def save_words(words: list[Word], path: Path) -> None:
    path.write_text(json.dumps([w.to_dict() for w in words], ensure_ascii=False, indent=1), encoding="utf-8")


def load_words(path: Path) -> list[Word]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("words", [])
    return [Word.from_dict(d) for d in data]


def fingerprint(path: Path) -> str:
    """파일 이름이 바뀌어도 같은 영상이면 같은 값 (크기 + 앞뒤 1MB)."""
    h = hashlib.sha1()
    size = path.stat().st_size
    h.update(str(size).encode())
    with path.open("rb") as f:
        h.update(f.read(1 << 20))
        if size > (2 << 20):
            f.seek(-(1 << 20), os.SEEK_END)
            h.update(f.read(1 << 20))
    return h.hexdigest()[:16]


_models: dict[tuple, object] = {}
_model_lock = threading.Lock()


def _device(pref: str) -> tuple[str, str]:
    if pref == "cpu":
        return "cpu", "int8"
    try:
        import ctranslate2  # type: ignore

        if ctranslate2.get_cuda_device_count() > 0:
            return "cuda", "float16"
    except Exception:
        pass
    return "cpu", "int8"


def load_model(name: str, device_pref: str, cache_dir: Path, log: Callable[[str], None] = print):
    from faster_whisper import WhisperModel  # 무거운 import 는 필요할 때만

    device, compute = _device(device_pref)
    key = (name, device, compute)
    with _model_lock:
        if key not in _models:
            local = os.environ.get("WHISPER_MODEL_DIR")
            source = local if local and Path(local).exists() else name
            log(f"  받아쓰기 모델 준비: {name} ({device}) — 처음 한 번은 1.6GB 내려받느라 오래 걸려요. 고장이 아닙니다.")
            _models[key] = WhisperModel(
                source, device=device, compute_type=compute, download_root=str(cache_dir / "models")
            )
        return _models[key]


def transcribe(
    path: Path,
    settings: Settings,
    *,
    hint: str = "",
    log: Callable[[str], None] = print,
    progress: Callable[[float], None] | None = None,
) -> list[Word]:
    dirs = settings.dirs()
    cache_dir = dirs["cache"] / "transcripts"
    cache_dir.mkdir(parents=True, exist_ok=True)
    hint_key = hashlib.sha1(hint.encode("utf-8")).hexdigest()[:6] if hint else "nohint"
    cache_file = cache_dir / f"{fingerprint(path)}_{settings.whisper_model}_{hint_key}.json"
    if cache_file.exists():
        log("  전에 받아쓴 기록이 있어 받아쓰기를 건너뜁니다.")
        if progress:
            progress(1.0)
        return load_words(cache_file)

    # PyAV 버전 차이로 깨지는 일을 막기 위해 소리는 ffmpeg 로 직접 풀어 숫자 배열로 넘김
    audio = media.read_audio_f32(path, 16000, 1)[:, 0]
    model = load_model(settings.whisper_model, settings.whisper_device, dirs["cache"], log)
    segments, info = model.transcribe(
        audio,
        language=settings.language or None,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 700},
        beam_size=5,
        condition_on_previous_text=False,
        initial_prompt=hint[:220] if hint else None,
    )
    total = max(1e-6, float(getattr(info, "duration", 0.0) or 0.0))
    words: list[Word] = []
    for seg in segments:
        for w in seg.words or []:
            text = clean_word(w.word or "")
            if not text:
                continue
            if words and all(ch in ".,!?…" for ch in text):
                words[-1].text += text  # 문장부호만 따로 나오면 앞 낱말에 붙임
                continue
            words.append(Word(text, float(w.start), float(max(w.end, w.start + 0.02)), float(w.probability)))
        if progress:
            progress(min(1.0, float(seg.end) / total))
    save_words(words, cache_file)
    return words
