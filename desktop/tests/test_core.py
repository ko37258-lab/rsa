from mrk_typeless.cleanup import local_cleanup, sanitize_dictation
from mrk_typeless.config import DEFAULTS
from mrk_typeless.dictionary import DEFAULT_DICTIONARY, apply_replacements
from mrk_typeless.modes import MODES, get_mode
from mrk_typeless.prompts import build_edit_prompt, build_polish_prompt

CFG = {**DEFAULTS}


def test_sanitize_removes_win_h_artifacts():
    assert sanitize_dictation("캐슬─ ─앤칸─ ─타─ ─빌 아파트") == "캐슬앤칸타빌 아파트"
    assert sanitize_dictation("클로ㅡ ㅡ드를 열면") == "클로드를 열면"
    assert sanitize_dictation("건​폐율") == "건폐율"
    assert sanitize_dictation("가") == "가"
    assert sanitize_dictation("서울 — 부산 노선") == "서울 — 부산 노선"


def test_local_cleanup_removes_fillers_and_repeats():
    text, removed = local_cleanup("음 그러니까 어 그 그 상가 건물을 음음, 보러 가요")
    assert text == "그러니까 그 상가 건물을 보러 가요"
    assert removed == 4


def test_apply_replacements():
    text, count = apply_replacements("건폐률과 용적율", DEFAULT_DICTIONARY["replacements"])
    assert (text, count) == ("건폐율과 용적률", 2)


def test_polish_prompt_has_mode_dictionary_and_raw():
    system, user = build_polish_prompt("  원문  ", "consult", {**CFG, "style_note": "짧게"}, DEFAULT_DICTIONARY)
    assert "[이번 글의 형식: 상담 노트]" in system
    assert "건폐률 → 건폐율" in system
    assert "[나만의 문체]\n짧게" in system
    assert user == "<원문>\n원문\n</원문>"


def test_translate_and_email_extras():
    system, _ = build_polish_prompt("a", "translate", {**CFG, "target_language": "일본어"}, DEFAULT_DICTIONARY)
    assert "[번역할 언어] 일본어" in system
    system, _ = build_polish_prompt("a", "email", {**CFG, "signature": "고상철 드림"}, DEFAULT_DICTIONARY)
    assert '서명 "고상철 드림"' in system


def test_edit_prompt():
    _, user = build_edit_prompt("본문", "세 줄로 요약", CFG, DEFAULT_DICTIONARY)
    assert user == "<지시>\n세 줄로 요약\n</지시>\n\n<편집할 글>\n본문\n</편집할 글>"


def test_modes_match_web_app():
    assert [m["id"] for m in MODES] == ["clean", "message", "email", "report", "lecture", "consult", "translate"]
    assert get_mode("nope")["id"] == "clean"


def test_default_hotkeys_are_distinct():
    keys = {DEFAULTS["hotkey_dictate"], DEFAULTS["hotkey_polish"], DEFAULTS["hotkey_edit"]}
    assert len(keys) == 3
