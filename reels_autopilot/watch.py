"""자동 모드 — 작업폴더/넣는곳 에 영상을 넣기만 하면 버튼 없이 알아서 편집합니다.

- 같은 이름의 .txt 가 있으면 대본으로 씁니다 (예: 용적률.mp4 + 용적률.txt).
- 파일 복사가 끝났는지(크기가 더 안 변하는지) 확인한 뒤 시작합니다.
- 끝난 원본은 넣는곳/완료, 실패한 원본은 넣는곳/실패 로 옮기고 기록을 남깁니다.
"""
from __future__ import annotations

import shutil
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Callable

from . import media
from .pipeline import JobInput, JobResult, run_safely
from .settings import Settings


def _move(p: Path, dest_dir: Path) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    target = dest_dir / p.name
    if target.exists():
        target = dest_dir / f"{p.stem}_{datetime.now():%H%M%S}{p.suffix}"
    shutil.move(str(p), str(target))
    return target


def pending(inbox: Path) -> list[Path]:
    return sorted(p for p in inbox.iterdir()
                  if p.is_file() and p.suffix.lower() in media.VIDEO_EXTS and not p.name.startswith((".", "~")))


def process_one(video: Path, settings: Settings, log: Callable[[str], None],
                on_done: Callable[[JobResult], None] | None = None) -> JobResult | None:
    inbox = video.parent
    script_file = video.with_suffix(".txt")
    script = script_file.read_text(encoding="utf-8") if script_file.exists() else ""
    log(f"● 자동 편집 시작: {video.name}{' (+대본)' if script else ''}")
    res = run_safely(JobInput(video=video, script=script, templates=[settings.default_template or "auto"]),
                     settings, log=log)
    dest = inbox / ("완료" if res else "실패")
    _move(video, dest)
    if script_file.exists():
        _move(script_file, dest)
    if res and on_done:
        on_done(res)
    return res


class Watcher:
    def __init__(self, settings: Settings, log: Callable[[str], None] = print,
                 on_done: Callable[[JobResult], None] | None = None):
        self.settings = settings
        self.log = log
        self.on_done = on_done
        self.stop_event = threading.Event()
        self._sizes: dict[Path, int] = {}
        self.thread: threading.Thread | None = None

    @property
    def inbox(self) -> Path:
        return self.settings.dirs()["inbox"]

    def tick(self) -> int:
        """한 번 둘러보고 준비된 영상을 처리합니다. 처리한 개수를 돌려줍니다."""
        done = 0
        for p in pending(self.inbox):
            try:
                size = p.stat().st_size
            except OSError:
                continue
            if size > 0 and self._sizes.get(p) == size:  # 크기가 그대로 = 복사 끝
                self._sizes.pop(p, None)
                process_one(p, self.settings, self.log, self.on_done)
                done += 1
                if self.stop_event.is_set():
                    break
            else:
                self._sizes[p] = size
        return done

    def run(self, once: bool = False) -> None:
        self.log(f"자동 모드 켜짐 — '{self.inbox}' 에 영상을 넣으세요. (대본은 같은 이름의 .txt)")
        while not self.stop_event.is_set():
            self.tick()
            if once and not pending(self.inbox):
                break
            self.stop_event.wait(self.settings.watch_interval)
        self.log("자동 모드 꺼짐")

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return
        self.stop_event.clear()
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()

    @property
    def running(self) -> bool:
        return bool(self.thread and self.thread.is_alive())


def run_forever(settings: Settings, log: Callable[[str], None] = print, once: bool = False) -> None:
    w = Watcher(settings, log)
    try:
        w.run(once=once)
    except KeyboardInterrupt:
        w.stop()
        time.sleep(0.1)
