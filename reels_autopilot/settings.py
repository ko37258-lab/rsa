"""설계도 숫자(기준값)와 사용자 설정.

기준값은 『하루 걸리던 릴스 편집, 버튼 하나로 5분 22초』(노리쌤) 2·3장에서
인스타 AI·부업 계정 8곳의 릴스 68개를 기계로 잰 가운데값입니다.
`python -m reels_autopilot bench <레퍼런스폴더> --apply` 로 내가 고른 릴스를 재면
이 숫자를 '내 레퍼런스의 숫자'로 바꿀 수 있습니다.
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    """의존성 없이 .env 를 읽습니다. 이미 설정된 환경 변수는 덮어쓰지 않습니다."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()


@dataclass
class Targets:
    """잘 되는 릴스의 설계도 숫자. AI·프로그램이 '알아서' 고르지 않도록 숫자로 못박습니다."""

    chars_per_sec: float = 8.0  # 레퍼런스 8계정 실측 말속도 중앙값 8.07글자/초 (7.35~9.05)
    cut_interval: float = 3.2  # 화면이 통째로 바뀌는 간격 가운데값(초). 반반형은 2초 이하
    loudness_lufs: float = -14.0  # 소리 있는 65개 전부 -14.0~-15.0, 가운데값 -14.1
    true_peak: float = -1.0
    duration_median: float = 35.9  # 영상 길이 가운데값(초)
    subtitle_min_chars: int = 8  # 자막 한 줄 8~14자
    subtitle_max_chars: int = 14
    silence_gap: float = 0.16  # 이보다 길게 말이 없으면 잘라서
    silence_keep: float = 0.10  # 이만큼만 남긴다
    speed_min: float = 1.10  # 초당 8글자가 되도록 1.10~1.25배
    speed_max: float = 1.25
    chunk_min: float = 1.2  # 말을 1.2초 이상 덩어리로 묶고
    chunk_max: float = 4.6  # 4.6초 넘는 덩어리는 반으로
    width: int = 1080
    height: int = 1920
    fps: int = 30
    safe_bottom_ratio: float = 0.2  # 화면 아래 5분의 1은 인스타 버튼에 가려지니 비운다
    script_match_whole: float = 0.45  # 대본과 45% 넘게 같으면 대본 글자로 통째로 앉힘
    script_match_word: float = 0.80  # 낱말이 80% 넘게 비슷하거나
    script_match_word_loose: float = 0.60  # 60% 넘고 글자 수 차이가 한 자 이하일 때만 고침


@dataclass
class Settings:
    workspace: str = ""  # 비우면 프로그램 폴더 안 '작업폴더'
    inbox: str = ""  # 자동 모드 감시 폴더. 비우면 작업폴더/넣는곳 (휴대폰·클라우드 동기화 폴더를 지정해도 됨)
    whisper_model: str = "large-v3-turbo"  # 처음 한 번 1.6GB 내려받기
    whisper_device: str = "auto"  # auto / cpu / cuda
    language: str = "ko"
    default_template: str = "auto"
    variants: int = 1  # 한 번 받아쓰기로 템플릿 몇 개를 같이 뽑을지 (A/B 테스트)
    sfx: bool = True
    domain: str = "realestate"  # 강조 사전: realestate / general
    persona: str = "부동산 전문가이자 강사. 어려운 내용을 쉽고 재미있게 설명한다."
    brand_handle: str = ""  # 예: @mrhomes — 마지막 장면·캡션에 표시
    cta_keyword: str = "자료"  # '댓글에 ○○ 남겨주세요'의 ○○
    ai_enabled: bool = True  # ANTHROPIC_API_KEY 가 있을 때만 실제로 사용
    ai_model: str = "claude-opus-5-5"
    open_when_done: bool = True
    watch_interval: float = 5.0
    targets: Targets = field(default_factory=Targets)

    # ------------------------------------------------------------------
    @property
    def workspace_path(self) -> Path:
        raw = os.environ.get("REELS_WORKSPACE") or self.workspace
        path = Path(raw).expanduser() if raw else ROOT / "작업폴더"
        return path.resolve()

    def dirs(self) -> dict[str, Path]:
        ws = self.workspace_path
        out = {
            "workspace": ws,
            "inbox": Path(self.inbox).expanduser() if self.inbox else ws / "넣는곳",  # 자동 모드 감시 폴더
            "output": ws / "출력",
            "materials": ws / "자료",  # 파일 이름이 대본에 나오면 그 장면에 자동 삽입
            "fonts": ws / "글꼴",
            "sfx": ws / "효과음",  # 같은 이름의 wav 를 넣으면 내장 효과음 대신 사용
            "cache": ws / ".cache",
            "uploads": ws / "올린영상",
        }
        for p in out.values():
            p.mkdir(parents=True, exist_ok=True)
        return out

    @property
    def settings_file(self) -> Path:
        return self.workspace_path / "settings.json"

    @property
    def ai_available(self) -> bool:
        return self.ai_enabled and bool(
            os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")
        )

    # ------------------------------------------------------------------
    @classmethod
    def load(cls, path: Path | None = None) -> "Settings":
        base = cls()
        target = path or base.settings_file
        if not target.exists():
            return base
        data = json.loads(target.read_text(encoding="utf-8"))
        return cls.from_dict(data)

    @classmethod
    def from_dict(cls, data: dict) -> "Settings":
        known = {f.name for f in fields(cls)}
        kwargs = {k: v for k, v in data.items() if k in known and k != "targets"}
        s = cls(**kwargs)
        t = data.get("targets") or {}
        tknown = {f.name for f in fields(Targets)}
        s.targets = Targets(**{k: v for k, v in t.items() if k in tknown})
        return s

    def to_dict(self) -> dict:
        return asdict(self)

    def save(self, path: Path | None = None) -> Path:
        target = path or self.settings_file
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(self.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
        return target
