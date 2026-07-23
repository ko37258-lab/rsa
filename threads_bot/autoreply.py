"""댓글 자동답글 엔진.

내 최근 글들의 답글을 훑어서, 아직 답하지 않은 남의 댓글에
규칙(rules.json)에 따라 자동으로 답글을 답니다.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from . import threads_api
from .store import State

DEFAULT_RULES_PATH = Path(__file__).resolve().parent.parent / "rules.json"


@dataclass
class Rule:
    keywords: list[str]
    reply: str


@dataclass
class ReplyPolicy:
    default_reply: str = "댓글 감사합니다! 🙏"
    rules: list[Rule] = field(default_factory=list)
    skip_keywords: list[str] = field(default_factory=list)
    reply_once_per_user: bool = False

    @classmethod
    def load(cls, path: Path = DEFAULT_RULES_PATH) -> "ReplyPolicy":
        if not path.exists():
            return cls()
        data = json.loads(path.read_text(encoding="utf-8"))
        rules = [
            Rule(keywords=[k.lower() for k in r.get("keywords", [])], reply=r["reply"])
            for r in data.get("rules", [])
        ]
        return cls(
            default_reply=data.get("default_reply", cls.default_reply),
            rules=rules,
            skip_keywords=[k.lower() for k in data.get("skip_keywords", [])],
            reply_once_per_user=bool(data.get("reply_once_per_user", False)),
        )

    def decide(self, text: str) -> Optional[str]:
        """댓글 내용에 맞는 답글 텍스트를 결정. None이면 답글 안 함."""
        low = (text or "").lower()
        if any(sk in low for sk in self.skip_keywords):
            return None
        for rule in self.rules:
            if any(kw in low for kw in rule.keywords):
                return rule.reply
        return self.default_reply


@dataclass
class ReplyResult:
    checked_posts: int = 0
    checked_replies: int = 0
    sent: int = 0
    skipped: int = 0
    errors: int = 0


def run_once(
    client: threads_api.ThreadsClient,
    state: State,
    policy: ReplyPolicy,
    post_limit: int = 25,
    dry_run: bool = False,
    log=print,
) -> ReplyResult:
    """자동답글 1회 실행."""
    result = ReplyResult()
    posts = client.my_threads(limit=post_limit)
    result.checked_posts = len(posts)

    my_id = str(state.user_id)
    my_username = (state.username or "").lower()

    for post in posts:
        post_id = post["id"]
        try:
            replies = client.replies(post_id)
        except threads_api.ThreadsAPIError as e:
            log(f"  [경고] 답글 조회 실패 ({post_id}): {e}")
            result.errors += 1
            continue

        for reply in replies:
            result.checked_replies += 1
            reply_id = reply["id"]

            # 내가 쓴 답글은 건너뜀.
            frm = reply.get("from") or {}
            author_id = str(frm.get("id", ""))
            author_name = (frm.get("username") or reply.get("username") or "").lower()
            if (my_id and author_id == my_id) or (
                my_username and author_name == my_username
            ):
                continue

            # 이미 답한 댓글은 건너뜀.
            if reply_id in state.replied_ids:
                continue
            if policy.reply_once_per_user and author_id and author_id in state.replied_users:
                result.skipped += 1
                continue

            reply_text = policy.decide(reply.get("text", ""))
            if reply_text is None:
                result.skipped += 1
                continue

            preview = (reply.get("text") or "").replace("\n", " ")[:40]
            if dry_run:
                log(f"  [모의] @{author_name or '?'} \"{preview}\" → \"{reply_text}\"")
                result.sent += 1
                continue

            try:
                client.reply_to(reply_id, reply_text)
                state.mark_replied(reply_id, author_id)
                state.save()
                result.sent += 1
                log(f"  [답글] @{author_name or '?'} \"{preview}\" → \"{reply_text}\"")
            except threads_api.ThreadsAPIError as e:
                log(f"  [오류] 답글 실패 ({reply_id}): {e}")
                result.errors += 1

    return result
