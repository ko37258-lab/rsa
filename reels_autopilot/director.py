"""AI 연출 — 훅 제목·카드 문구·강조어·캡션·해시태그·첫 댓글·대본.

ANTHROPIC_API_KEY 가 있으면 Claude 가 다듬고, 없으면 규칙으로 만듭니다(편집은 어느 쪽이든 끝까지 돕니다).
AI 에게는 '빠르게, 보기 좋게' 대신 숫자로 지시합니다: 카드 제목 8자, 보조 16자, 훅 16자 두 줄.
숫자·사실·타이밍은 AI 가 바꾸지 못하고, 강조어는 실제로 말한 낱말 안에서만 고릅니다.
"""
from __future__ import annotations

import json
from collections import Counter
from typing import Callable

from . import text as T
from .scenes import Scene, comment_word
from .settings import Settings

DIRECTION_SCHEMA = {
    "type": "object",
    "properties": {
        "hook_title": {"type": "string"},
        "thumbnail_title": {"type": "string"},
        "scenes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "card_title": {"type": "string"},
                    "card_sub": {"type": "string"},
                    "emphasis": {"type": "array", "items": {"type": "string"}},
                    "items": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["index", "card_title", "card_sub", "emphasis", "items"],
                "additionalProperties": False,
            },
        },
        "caption": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
        "first_comment": {"type": "string"},
    },
    "required": ["hook_title", "thumbnail_title", "scenes", "caption", "hashtags", "first_comment"],
    "additionalProperties": False,
}

_DIRECTION_RULES = """당신은 인스타 릴스·유튜브 쇼츠 자동 편집기의 '연출 담당'입니다.
화자 소개: {persona}

받은 장면 목록(이미 정해진 장면 종류와 실제로 말한 문장)에 맞춰 화면 문구만 다듬습니다.
반드시 지킬 숫자 규칙:
- hook_title: 첫 화면 큰 제목. 공백 제외 16자 이내, 두 줄로 나눌 수 있게. 인사말 금지. 숫자·궁금증으로 멈추게.
- thumbnail_title: 썸네일 제목. 공백 제외 18자 이내.
- 장면마다 card_title 은 공백 제외 8자 이내 핵심어, card_sub 는 16자 이내 보조 문장(필요 없으면 빈 문자열).
- emphasis: 그 장면에서 실제로 말한 낱말 중 노랗게 칠할 핵심어 1~2개. 장면 문장에 그대로 있는 말만.
- items: 체크리스트 장면이면 항목 문구(기존 항목 개수와 같게, 각 10자 이내). 아니면 빈 배열.
- 숫자 장면의 숫자, 법령·수치 같은 사실은 절대 바꾸거나 지어내지 말 것.
- caption: 업로드 본문 3~6줄. 첫 줄은 훅, 가운데는 핵심 요약, 마지막 줄은 '댓글에 "{cta}" 남겨주세요' 류의 행동 유도.
- hashtags: '#' 없이 10~15개. 넓은 주제 → 좁은 주제 순.
- first_comment: 내가 처음 달 고정 댓글 한 줄.
모든 장면(index)을 빠짐없이 돌려주세요."""

_SCRIPT_RULES = """당신은 {persona}
릴스·쇼츠 대본을 씁니다. 화면 편집기가 이 대본으로 자막과 장면을 자동으로 만듭니다.
숫자 규칙(잘 되는 릴스 68개 실측 기준):
- 말 속도 초당 8글자 기준 {seconds}초 → 공백 제외 약 {chars}자.
- 첫 문장은 숫자나 질문으로 3초 안에 멈추게 하는 훅. 인사말로 시작하지 않기.
- 본문은 숫자('세 가지', '300%')·나열('~하고 ~하고')·질문('~일까요?')을 섞어 장면이 자주 바뀌게.
- 끝에서 두 번째 문장: 댓글에 '{cta}' 남기라는 행동 유도. 마지막 문장: '다음 영상에서 만나요.'
- 문장은 짧게, 한 문장 30자 이내. 법령·수치는 정확한 것만, 모르면 일반론으로.
- 대본 본문만 출력. 제목·해설·따옴표·이모지 없이."""


class AIUnavailable(RuntimeError):
    pass


def _client():
    try:
        import anthropic  # type: ignore
    except ImportError as e:  # pragma: no cover
        raise AIUnavailable("anthropic 패키지가 없습니다 (pip install anthropic).") from e
    return anthropic, anthropic.Anthropic()


def _call(settings: Settings, system: str, user: str, schema: dict | None, max_tokens: int = 16000) -> str:
    anthropic, client = _client()
    output_config: dict = {"effort": "medium"}
    if schema:
        output_config["format"] = {"type": "json_schema", "schema": schema}
    try:
        resp = client.beta.messages.create(
            model=settings.ai_model,
            max_tokens=max_tokens,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",  # 안전 분류기가 거절하면 서버가 다른 모델로 이어서 처리
            output_config=output_config,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
    except anthropic.AuthenticationError as e:
        raise AIUnavailable("API 키가 올바르지 않습니다.") from e
    except anthropic.RateLimitError as e:
        raise AIUnavailable("요청이 많아 잠시 막혔습니다. 잠시 뒤 다시 시도하세요.") from e
    except anthropic.APIStatusError as e:
        raise AIUnavailable(f"AI 서버 오류({e.status_code})") from e
    except anthropic.APIConnectionError as e:
        raise AIUnavailable("인터넷 연결을 확인하세요.") from e
    if resp.stop_reason == "refusal":
        raise AIUnavailable("AI 가 이 요청을 처리하지 않았습니다.")
    text = next((b.text for b in resp.content if b.type == "text"), "")
    if not text:
        raise AIUnavailable("AI 응답이 비어 있습니다.")
    return text


# ---------------------------------------------------------------------------
# 규칙으로 만드는 연출 (AI 없을 때)
# ---------------------------------------------------------------------------
def _hashtags(scenes: list[Scene], domain: str) -> list[str]:
    cnt: Counter[str] = Counter()
    for s in scenes:
        for rank, k in enumerate(s.keywords[:2]):
            k = T.strip_punct(k).replace(" ", "")
            if 2 <= len(k) <= 12 and not T.NUM_RE.fullmatch(k) and k not in T.STOPWORDS:
                cnt[k] += 2 - rank
    tags = [k for k, _ in cnt.most_common(8)]
    base = ["릴스", "쇼츠", "정보", "꿀팁"]
    if domain == "realestate":
        base = ["부동산", "부동산공부", "토지투자", "부동산공법", "부동산정보"] + base
    for b in base:
        if b not in tags:
            tags.append(b)
    return tags[:15]


def _points(scenes: list[Scene]) -> list[str]:
    """캡션 가운데 요약 줄 — 숫자 장면은 '이름 숫자', 핵심어 장면은 제목+보조."""
    out: list[str] = []
    for s in scenes:
        c = s.card
        if s.kind == "number" and c.get("number"):
            out.append(f"{c.get('label', '')} {c['number']}".strip())
        elif s.kind == "checklist" and c.get("items"):
            out.append(" → ".join(c["items"]))
        elif s.kind == "keyword" and c.get("title"):
            sub = c.get("sub", "")
            out.append(f"{c['title']}: {sub}" if sub and T.norm(c["title"]) not in T.norm(sub) else sub or c["title"])
        elif s.kind == "question" and c.get("title"):
            out.append(c["title"] + "?")
    return list(dict.fromkeys(p for p in out if p))[:4]


def rule_direction(scenes: list[Scene], settings: Settings) -> dict:
    hook = scenes[0].card.get("title", "") if scenes else ""
    cta = comment_word(scenes, settings.cta_keyword)
    lines = [hook, ""] + [f"✔ {p}" for p in _points(scenes)]
    lines += ["", f"댓글에 \"{cta}\" 남겨주시면 정리 자료 보내드려요."]
    if settings.brand_handle:
        lines.append(settings.brand_handle)
    return {
        "hook_title": hook,
        "thumbnail_title": hook,
        "scenes": [],
        "caption": "\n".join(lines).strip(),
        "hashtags": _hashtags(scenes, settings.domain),
        "first_comment": f"📌 {hook} — 정리 자료가 필요하면 댓글에 \"{cta}\"!",
        "source": "rules",
    }


def _clean(direction: dict, scenes: list[Scene]) -> dict:
    """AI 결과를 숫자 규칙에 맞게 다듬습니다(넘치면 자르고, 말하지 않은 강조어는 버림)."""
    by_index = {s.index: s for s in scenes}
    cleaned = []
    for d in direction.get("scenes", []):
        s = by_index.get(int(d.get("index", -1)))
        if not s:
            continue
        spoken = T.norm(s.text)
        d["emphasis"] = [e for e in d.get("emphasis", []) if T.norm(e) and T.norm(e) in spoken][:2]
        d["card_title"] = T.short_line(d.get("card_title", ""), 8) if T.count_chars(d.get("card_title", "")) > 8 \
            else d.get("card_title", "")
        d["card_sub"] = T.short_line(d.get("card_sub", ""), 16) if T.count_chars(d.get("card_sub", "")) > 16 \
            else d.get("card_sub", "")
        cleaned.append(d)
    direction["scenes"] = cleaned
    direction["hashtags"] = [h.lstrip("#").replace(" ", "") for h in direction.get("hashtags", []) if h.strip()][:15]
    for key, limit in (("hook_title", 16), ("thumbnail_title", 18)):
        if T.count_chars(direction.get(key, "")) > limit:
            direction[key] = T.short_line(direction[key], limit)
    return direction


def direct(scenes: list[Scene], settings: Settings, *, use_ai: bool = True,
           log: Callable[[str], None] = print) -> dict:
    fallback = rule_direction(scenes, settings)
    if not (use_ai and settings.ai_available):
        return fallback
    payload = [{"index": s.index, "kind": s.kind, "text": s.text, "card": s.card} for s in scenes]
    system = _DIRECTION_RULES.format(persona=settings.persona, cta=comment_word(scenes, settings.cta_keyword))
    user = ("장면 목록(JSON):\n" + json.dumps(payload, ensure_ascii=False)
            + f"\n\n분야: {settings.domain}. 계정: {settings.brand_handle or '(없음)'}")
    try:
        data = json.loads(_call(settings, system, user, DIRECTION_SCHEMA))
    except (AIUnavailable, json.JSONDecodeError, ValueError) as e:
        log(f"  AI 연출을 건너뛰고 규칙으로 만듭니다: {e}")
        return fallback
    data = _clean(data, scenes)
    data["source"] = "ai"
    for key in ("hook_title", "thumbnail_title", "caption", "first_comment"):
        if not data.get(key):
            data[key] = fallback[key]
    if not data.get("hashtags"):
        data["hashtags"] = fallback["hashtags"]
    return data


# ---------------------------------------------------------------------------
# 대본 만들기
# ---------------------------------------------------------------------------
def rule_script(topic: str, settings: Settings) -> str:
    """AI 키가 없을 때의 빈칸 대본 — 괄호만 내 말로 바꿔 읽으면 됩니다."""
    t = topic.strip() or "이 주제"
    return (f"{t}, 이것 모르면 손해 봅니다.\n"
            f"딱 세 가지만 기억하세요.\n"
            f"첫째, (핵심 하나)입니다.\n"
            f"둘째, (숫자가 들어간 근거)예요.\n"
            f"셋째, (확인하고 비교하고 결정하고) 순서로 보세요.\n"
            f"그럼 왜 다들 놓칠까요?\n"
            f"(한 문장 이유)이기 때문이에요.\n"
            f"정리 자료가 필요하면 댓글에 '{settings.cta_keyword}'라고 남겨주세요.\n"
            f"다음 영상에서 만나요.")


def generate_script(topic: str, settings: Settings, seconds: int = 36,
                    log: Callable[[str], None] = print) -> tuple[str, str]:
    """(대본, 'ai' | 'rules')"""
    if not settings.ai_available:
        return rule_script(topic, settings), "rules"
    chars = int(seconds * settings.targets.chars_per_sec)
    system = _SCRIPT_RULES.format(persona=settings.persona, seconds=seconds, chars=chars, cta=settings.cta_keyword)
    try:
        text = _call(settings, system, f"주제: {topic.strip()}", None, max_tokens=4000)
        return text.strip(), "ai"
    except AIUnavailable as e:
        log(f"  AI 대본을 만들지 못해 빈칸 대본을 드립니다: {e}")
        return rule_script(topic, settings), "rules"
