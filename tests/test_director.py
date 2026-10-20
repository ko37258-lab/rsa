"""AI 연출: 키가 없으면 규칙으로, 있으면 Claude 결과를 숫자 규칙에 맞게 다듬는지."""
import json

from reels_autopilot import director, scenes
from reels_autopilot.lexicon import load_terms
from reels_autopilot.settings import Settings, Targets
from tests.test_rules import words_from, SCRIPT


def _scenes():
    ws = words_from(SCRIPT)
    return scenes.build_scenes(ws, Targets(), load_terms("realestate"), total_duration=ws[-1].end, cta="자료")


def test_rules_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    d = director.direct(_scenes(), Settings())
    assert d["source"] == "rules"
    assert '"공법"' in d["caption"]  # 영상에서 실제로 말한 댓글 유도어
    assert "부동산" in d["hashtags"] and 10 <= len(d["hashtags"]) <= 15


def test_ai_result_is_cleaned(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    sc = _scenes()
    idx = next(s.index for s in sc if "용도지역" in s.text)
    fake = {
        "hook_title": "토지 사기 전에 반드시 확인해야 하는 세 가지 핵심 포인트",
        "thumbnail_title": "토지 투자 체크 3",
        "scenes": [{"index": idx, "card_title": "용도지역부터확인하기", "card_sub": "짧게",
                    "emphasis": ["용도지역", "말하지않은말"], "items": []}],
        "caption": "캡션", "hashtags": ["#부동산", "토지 투자"], "first_comment": "고정",
    }
    seen = {}

    def fake_call(settings, system, user, schema, max_tokens=16000):
        seen["schema"] = schema
        seen["user"] = user
        return json.dumps(fake, ensure_ascii=False)

    monkeypatch.setattr(director, "_call", fake_call)
    d = director.direct(sc, Settings())
    assert d["source"] == "ai" and seen["schema"] is director.DIRECTION_SCHEMA
    assert len(d["hook_title"].replace(" ", "")) <= 16
    s1 = d["scenes"][0]
    assert s1["emphasis"] == ["용도지역"]  # 말하지 않은 강조어는 버림
    assert len(s1["card_title"].replace(" ", "")) <= 8 or " " not in s1["card_title"]
    assert d["hashtags"] == ["부동산", "토지투자"]
    scenes.apply_direction(sc, d, Targets())
    assert sc[0].card["title"] == d["hook_title"]


def test_ai_failure_falls_back(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")

    def boom(*a, **k):
        raise director.AIUnavailable("네트워크")

    monkeypatch.setattr(director, "_call", boom)
    logs = []
    d = director.direct(_scenes(), Settings(), log=logs.append)
    assert d["source"] == "rules" and logs


def test_script_fallback(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    text, source = director.generate_script("용적률 계산법", Settings())
    assert source == "rules" and "용적률 계산법" in text and "다음 영상에서 만나요" in text
