"""토큰과 상태를 로컬 JSON 파일에 저장/로드.

- 장기 토큰(최대 60일)과 만료 시각을 보관합니다.
- 이미 답글을 단 댓글 ID를 기록해 중복 답글을 막습니다.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

STATE_PATH = Path(__file__).resolve().parent.parent / "state.json"


@dataclass
class State:
    access_token: str = ""
    token_expires_at: float = 0.0  # epoch seconds
    user_id: str = ""
    username: str = ""
    replied_ids: list[str] = field(default_factory=list)
    replied_users: list[str] = field(default_factory=list)
    path: Path = STATE_PATH

    @classmethod
    def load(cls, path: Path = STATE_PATH) -> "State":
        if not path.exists():
            return cls(path=path)
        data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            access_token=data.get("access_token", ""),
            token_expires_at=float(data.get("token_expires_at", 0.0)),
            user_id=data.get("user_id", ""),
            username=data.get("username", ""),
            replied_ids=list(data.get("replied_ids", [])),
            replied_users=list(data.get("replied_users", [])),
            path=path,
        )

    def save(self) -> None:
        data = {
            "access_token": self.access_token,
            "token_expires_at": self.token_expires_at,
            "user_id": self.user_id,
            "username": self.username,
            "replied_ids": self.replied_ids,
            "replied_users": self.replied_users,
        }
        self.path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # --- 토큰 상태 헬퍼 ---
    def has_token(self) -> bool:
        return bool(self.access_token)

    def seconds_until_expiry(self) -> float:
        return self.token_expires_at - time.time()

    def is_expired(self) -> bool:
        return self.has_token() and self.seconds_until_expiry() <= 0

    def needs_refresh(self, within_days: int = 10) -> bool:
        """만료 within_days 이내면 갱신 권장. (장기 토큰은 유효기간 중에만 갱신 가능)"""
        if not self.has_token():
            return False
        return self.seconds_until_expiry() <= within_days * 86400

    # --- 답글 중복 방지 ---
    def mark_replied(self, reply_id: str, user_id: str = "") -> None:
        if reply_id and reply_id not in self.replied_ids:
            self.replied_ids.append(reply_id)
        if user_id and user_id not in self.replied_users:
            self.replied_users.append(user_id)
