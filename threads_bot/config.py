"""환경 설정 로딩.

.env 파일 또는 환경 변수에서 앱 정보를 읽어옵니다.
민감한 값(client secret, 토큰)은 절대 코드에 하드코딩하지 않습니다.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _load_dotenv() -> None:
    """의존성 없이 간단한 .env 파서. 이미 설정된 환경 변수는 덮어쓰지 않습니다."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
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

# 메타 Threads API의 기본 스코프(권한) 4종.
# - threads_basic          : 프로필/글 읽기 (필수)
# - threads_content_publish : 글 발행 쓰기
# - threads_manage_replies  : 답글 '쓰기'
# - threads_read_replies    : 답글 '읽기'  (쓰기와 별개 권한!)
DEFAULT_SCOPES = [
    "threads_basic",
    "threads_content_publish",
    "threads_manage_replies",
    "threads_read_replies",
]

GRAPH_BASE = "https://graph.threads.net"
API_VERSION = "v1.0"


@dataclass
class Config:
    app_id: str
    app_secret: str
    redirect_uri: str
    scopes: list[str]

    @classmethod
    def from_env(cls) -> "Config":
        app_id = os.environ.get("THREADS_APP_ID", "").strip()
        app_secret = os.environ.get("THREADS_APP_SECRET", "").strip()
        redirect_uri = os.environ.get(
            "THREADS_REDIRECT_URI", "https://localhost/callback"
        ).strip()
        scopes_env = os.environ.get("THREADS_SCOPES", "").strip()
        scopes = (
            [s.strip() for s in scopes_env.split(",") if s.strip()]
            if scopes_env
            else list(DEFAULT_SCOPES)
        )
        return cls(
            app_id=app_id,
            app_secret=app_secret,
            redirect_uri=redirect_uri,
            scopes=scopes,
        )

    def require_app(self) -> None:
        missing = [
            name
            for name, val in (
                ("THREADS_APP_ID", self.app_id),
                ("THREADS_APP_SECRET", self.app_secret),
            )
            if not val
        ]
        if missing:
            raise SystemExit(
                "환경 변수가 비어 있습니다: "
                + ", ".join(missing)
                + "\n.env 파일을 만들거나(.env.example 참고) 환경 변수를 설정하세요."
            )
