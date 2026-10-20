"""레퍼런스 재기 — 잘 되는 릴스를 기계로 재서 '내 설계도 숫자'를 만듭니다 (책 2장).

내려받은 레퍼런스 릴스를 한 폴더에 넣고 돌리면 말 속도·컷 간격·소리 크기·영상 길이를
영상별로 재고 가운데값을 냅니다. --apply 를 주면 그 숫자가 편집 기준값이 됩니다.
"""
from __future__ import annotations

import csv
import statistics
from pathlib import Path
from typing import Callable

from . import media, transcribe
from .settings import Settings
from .text import count_chars


def measure(path: Path, settings: Settings, log: Callable[[str], None] = print) -> dict:
    info = media.probe(path)
    row: dict = {"파일": path.name, "길이(초)": round(info.duration, 2)}
    if info.has_audio:
        words = transcribe.transcribe(path, settings, log=lambda m: None)
        chars = sum(count_chars(w.text) for w in words)
        row["말속도(글자/초)"] = round(chars / info.duration, 2) if words and info.duration else None
        try:
            row["소리(LUFS)"] = round(media.integrated_loudness(path), 1)
        except media.MediaError:
            row["소리(LUFS)"] = None
    else:
        row["말속도(글자/초)"] = None
        row["소리(LUFS)"] = None
    cuts = media.scene_changes(path, 0.25) if info.has_video else []
    points = [0.0] + cuts + [info.duration]
    gaps = [b - a for a, b in zip(points, points[1:]) if b - a > 0.2]
    row["컷 간격 가운데값(초)"] = round(statistics.median(gaps), 2) if gaps else None
    row["컷 수"] = len(cuts)
    return row


def _median(rows: list[dict], key: str) -> float | None:
    vals = [r[key] for r in rows if isinstance(r.get(key), (int, float)) and r[key] == r[key]]
    return round(statistics.median(vals), 2) if vals else None


def run(ref_dir: Path, settings: Settings, *, apply: bool = False, log: Callable[[str], None] = print) -> dict:
    files = sorted(p for p in ref_dir.rglob("*") if p.suffix.lower() in media.VIDEO_EXTS)
    if not files:
        raise FileNotFoundError(f"레퍼런스 영상이 없습니다: {ref_dir}")
    rows = []
    for i, p in enumerate(files, 1):
        log(f"  [{i}/{len(files)}] {p.name} 재는 중…")
        try:
            rows.append(measure(p, settings, log))
        except Exception as e:
            log(f"    건너뜀: {e}")
    summary = {
        "영상 수": len(rows),
        "말속도(글자/초)": _median(rows, "말속도(글자/초)"),
        "컷 간격(초)": _median(rows, "컷 간격 가운데값(초)"),
        "소리(LUFS)": _median(rows, "소리(LUFS)"),
        "길이(초)": _median(rows, "길이(초)"),
    }
    out_csv = ref_dir / "레퍼런스_측정.csv"
    with out_csv.open("w", newline="", encoding="utf-8-sig") as f:  # 엑셀에서 한글이 안 깨지게
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["파일"])
        writer.writeheader()
        writer.writerows(rows)
    log(f"  요약: {summary}")
    log(f"  영상별 표: {out_csv}")
    if apply:
        t = settings.targets
        if summary["말속도(글자/초)"]:
            t.chars_per_sec = summary["말속도(글자/초)"]
        if summary["컷 간격(초)"]:
            t.cut_interval = summary["컷 간격(초)"]
        if summary["소리(LUFS)"]:
            t.loudness_lufs = min(-12.0, max(-16.0, summary["소리(LUFS)"]))
        if summary["길이(초)"]:
            t.duration_median = summary["길이(초)"]
        log(f"  기준값을 내 레퍼런스 숫자로 바꿨습니다 → {settings.save()}")
    summary["rows"] = rows
    return summary
