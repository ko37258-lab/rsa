"""효과음 — 장면이 바뀌는 순간에 자동 배치합니다.

저작권 걱정이 없도록 효과음은 프로그램이 직접 합성합니다.
작업폴더/효과음 에 같은 이름의 wav(예: whoosh.wav)를 넣으면 그 소리로 바뀝니다.
배경음은 넣지 않습니다(책: '배경음 없애줘').
"""
from __future__ import annotations

import zlib
from functools import lru_cache
from pathlib import Path

import numpy as np

from . import media

SR = 48000
NAMES = ["boom", "whoosh", "ding", "tick", "pop", "bubble", "swoosh_up", "shutter", "sparkle", "type"]
LABELS = {
    "boom": "쿵 (첫 장면)", "whoosh": "휙 (화면 전환)", "ding": "띵 (숫자)", "tick": "딸깍 (체크)",
    "pop": "뽁 (물음표)", "bubble": "뽀뽁 (댓글)", "swoosh_up": "슈웅 (끝인사)", "shutter": "찰칵 (자료)",
    "sparkle": "반짝 (강조)", "type": "타닥 (타이핑)",
}


def _t(sec: float) -> np.ndarray:
    return np.arange(int(sec * SR), dtype=np.float32) / SR


def _bandpass(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    spec[(freqs < lo) | (freqs > hi)] = 0
    return np.fft.irfft(spec, n=len(x)).astype(np.float32)


def _sweep(f0: float, f1: float, t: np.ndarray) -> np.ndarray:
    f = f0 + (f1 - f0) * (t / max(t[-1], 1e-6))
    return np.sin(2 * np.pi * np.cumsum(f) / SR).astype(np.float32)


def _norm(x: np.ndarray, peak: float = 0.9) -> np.ndarray:
    m = float(np.max(np.abs(x))) if len(x) else 0.0
    return (x / m * peak).astype(np.float32) if m > 0 else x


@lru_cache(maxsize=None)
def synth(name: str) -> np.ndarray:
    rng = np.random.default_rng(zlib.crc32(name.encode()))  # 실행할 때마다 같은 소리
    if name == "boom":
        t = _t(0.7)
        x = _sweep(95, 38, t) * np.exp(-t * 5.5)
        x += _bandpass(rng.standard_normal(len(t)).astype(np.float32), 30, 400) * np.exp(-t * 18) * 0.6
    elif name == "whoosh":
        t = _t(0.42)
        env = np.sin(np.pi * t / t[-1]) ** 2
        x = _bandpass(rng.standard_normal(len(t)).astype(np.float32), 400, 4000) * env
    elif name == "swoosh_up":
        t = _t(0.55)
        env = (t / t[-1]) ** 2 * np.exp(-np.maximum(0, t - 0.45) * 40)
        x = _bandpass(rng.standard_normal(len(t)).astype(np.float32), 800, 7000) * env
        x += _sweep(300, 1200, t) * env * 0.15
    elif name == "ding":
        t = _t(0.9)
        x = sum(a * np.sin(2 * np.pi * f * t) for f, a in ((1320, 1.0), (2640, 0.45), (3960, 0.2), (1985, 0.15)))
        x = x * np.exp(-t * 5.0)
    elif name == "tick":
        t = _t(0.06)
        x = rng.standard_normal(len(t)).astype(np.float32) * np.exp(-t * 260) + np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 90)
    elif name == "pop":
        t = _t(0.14)
        x = _sweep(950, 260, t) * np.exp(-t * 32)
    elif name == "bubble":
        a, b = synth("pop"), _norm(_sweep(1300, 420, _t(0.12)) * np.exp(-_t(0.12) * 34))
        x = np.zeros(int(0.26 * SR), dtype=np.float32)
        x[: len(a)] += a
        off = int(0.1 * SR)
        x[off: off + len(b)] += b
    elif name == "shutter":
        x = np.zeros(int(0.16 * SR), dtype=np.float32)
        for off in (0, int(0.07 * SR)):
            t = _t(0.035)
            burst = _bandpass(rng.standard_normal(len(t)).astype(np.float32), 1500, 9000) * np.exp(-t * 90)
            x[off: off + len(burst)] += burst
    elif name == "sparkle":
        x = np.zeros(int(0.6 * SR), dtype=np.float32)
        for i, f in enumerate((3200, 4200, 5100, 3800)):
            t = _t(0.25)
            s = np.sin(2 * np.pi * f * t) * np.exp(-t * 14)
            off = int(i * 0.08 * SR)
            x[off: off + len(s)] += s.astype(np.float32)
    elif name == "type":
        x = np.zeros(int(0.5 * SR), dtype=np.float32)
        tk = synth("tick")
        for off in (0.0, 0.08, 0.17, 0.24, 0.34):
            i = int(off * SR)
            x[i: i + len(tk)] += tk * 0.8
    else:
        raise KeyError(name)
    return _norm(np.asarray(x, dtype=np.float32))


def load(name: str, sfx_dir: Path | None) -> np.ndarray:
    if sfx_dir:
        for ext in (".wav", ".mp3", ".m4a"):
            p = sfx_dir / f"{name}{ext}"
            if p.exists():
                try:
                    return _norm(media.read_audio_f32(p, SR, 1)[:, 0])
                except media.MediaError:
                    break
    return synth(name)


def mix(speech: np.ndarray, cues: list[tuple[float, str]], level: float, sfx_dir: Path | None = None) -> np.ndarray:
    """speech: (샘플, 채널) float32. 효과음을 더한 새 배열을 돌려줍니다."""
    out = speech.copy()
    n = len(out)
    for t, name in cues:
        if name not in NAMES:
            continue
        s = load(name, sfx_dir) * level
        i = max(0, int(t * SR))
        if i >= n:
            continue
        j = min(n, i + len(s))
        out[i:j] += s[: j - i, None]
    return out
