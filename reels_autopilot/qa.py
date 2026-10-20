"""품질 검수표 — 완성 영상을 다시 재서 설계도 숫자와 맞는지 확인합니다.

책: "숫자로 주면 그대로 만들고, 결과가 맞는지도 숫자로 확인할 수 있다."
"""
from __future__ import annotations

import json
import statistics
from pathlib import Path

from . import media
from .edit import EditPlan
from .scenes import Scene
from .settings import Targets
from .text import count_chars


def check(final: Path, plan: EditPlan, scenes: list[Scene], t: Targets) -> dict:
    info = media.probe(final)
    try:
        lufs = media.integrated_loudness(final)
    except media.MediaError:
        lufs = float("nan")
    words = plan.words
    chars = sum(count_chars(w.text) for w in words)
    dur = info.duration or plan.output_duration
    cps = chars / dur if dur else 0.0
    scene_durs = [s.dur for s in scenes if s.dur > 0]
    med_cut = statistics.median(scene_durs) if scene_durs else 0.0
    gaps = [b.start - a.end for a, b in zip(words, words[1:])]
    long_gaps = [g for g in gaps if g > 0.3]
    line_lens = [count_chars(ln.text) for s in scenes for ln in s.lines]
    in_range = [n for n in line_lens if t.subtitle_min_chars <= n <= t.subtitle_max_chars + 1]
    pct = 100.0 * len(in_range) / len(line_lens) if line_lens else 100.0

    rows = [
        _row("말 속도", f"{cps:.2f} 글자/초", f"{t.chars_per_sec:g} (레퍼런스 7.35~9.05)",
             not words or (t.chars_per_sec * 0.88 <= cps <= t.chars_per_sec * 1.15)),
        _row("소리 크기", f"{lufs:.1f} LUFS", f"{t.loudness_lufs:g} (레퍼런스 -14.0~-15.0)",
             lufs == lufs and abs(lufs - t.loudness_lufs) <= 1.0),
        _row("화면 전환 간격(가운데값)", f"{med_cut:.2f}초", f"{t.cut_interval:g}초 안팎", 1.2 <= med_cut <= t.chunk_max),
        _row("0.3초 넘는 말 없는 구간", f"{len(long_gaps)}곳", "0곳", len(long_gaps) == 0),
        _row("자막 한 줄 글자 수", f"{min(line_lens, default=0)}~{max(line_lens, default=0)}자 (범위 안 {pct:.0f}%)",
             f"{t.subtitle_min_chars}~{t.subtitle_max_chars}자", pct >= 70),
        _row("화면 크기·프레임", f"{info.width}×{info.height} {info.fps:.0f}fps", f"{t.width}×{t.height} {t.fps}fps",
             info.width == t.width and info.height == t.height and abs(info.fps - t.fps) < 0.5),
        _row("영상 길이", f"{dur:.1f}초", f"가운데값 {t.duration_median:g}초", 10 <= dur <= 90, warn_only=True),
    ]
    return {
        "file": final.name,
        "passed": all(r["ok"] or r["warn_only"] for r in rows),
        "rows": rows,
        "measured": {"cps": round(cps, 3), "lufs": round(lufs, 2) if lufs == lufs else None,
                     "cut_median": round(med_cut, 3), "long_gaps": len(long_gaps), "duration": round(dur, 2),
                     "scenes": len(scenes), "subtitle_in_range_pct": round(pct, 1)},
        "edit": plan.summary(),
    }


def _row(name: str, value: str, target: str, ok: bool, warn_only: bool = False) -> dict:
    return {"name": name, "value": value, "target": target, "ok": bool(ok), "warn_only": warn_only}


def to_markdown(report: dict) -> str:
    head = "✅ 기준 통과" if report["passed"] else "⚠️ 확인할 항목이 있어요"
    lines = [f"# 품질 검수표 — {report['file']}", "", f"**{head}**", "",
             "| 항목 | 측정값 | 기준 | 결과 |", "|---|---|---|---|"]
    for r in report["rows"]:
        mark = "✅" if r["ok"] else ("ℹ️" if r["warn_only"] else "⚠️")
        lines.append(f"| {r['name']} | {r['value']} | {r['target']} | {mark} |")
    lines += ["", "## 편집 기록", ""]
    for k, v in report["edit"].items():
        lines.append(f"- {k}: {', '.join(v) if isinstance(v, list) else v}")
    return "\n".join(lines) + "\n"


def save(report: dict, out_dir: Path, stem: str) -> Path:
    (out_dir / f"{stem}_검수.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    md = out_dir / f"{stem}_검수.md"
    md.write_text(to_markdown(report), encoding="utf-8")
    return md
