"""책의 편집 규칙(숫자)이 코드에 그대로 들어갔는지 확인합니다."""
from reels_autopilot import align, edit, scenes, text as T
from reels_autopilot.lexicon import load_terms
from reels_autopilot.settings import Targets
from reels_autopilot.transcribe import Word

TG = Targets()
TERMS = load_terms("realestate")


def words_from(text: str, start: float = 0.5, per_char: float = 0.12, gap: float = 0.05,
               sentence_gap: float = 0.5) -> list[Word]:
    out, t = [], start
    for w in text.split():
        d = per_char * T.count_chars(w) + 0.05
        out.append(Word(w, round(t, 3), round(t + d, 3)))
        t += d + (sentence_gap if T.is_sentence_end(w) else gap)
    return out


# ---------------------------------------------------------------- 글자 규칙
def test_numbers_and_ordinals():
    assert T.find_number("용적률은 300%까지") == "300%"
    assert T.find_number("세 가지만 기억하세요") == "세 가지"
    assert T.find_number("첫째, 용도지역") is None  # 서수는 숫자 카드가 아님
    assert T.ordinal("첫째, 용도지역을 확인하세요") == "첫째"


def test_checklist_items_become_nouns():
    items = T.checklist_items("둘째, 도로를 보고, 지목을 보고, 개발행위허가를 받고 진행하세요.".split())
    assert [i for i, _ in items] == ["도로 보기", "지목 보기", "개발행위허가 받기"]


def test_keywords_prefer_terms_and_skip_predicates():
    assert T.keywords("일반주거지역은 용적률이 최대 300%예요.", TERMS)[:2] == ["일반주거지역", "용적률"]
    ks = T.keywords("안녕하세요. 오늘은 꼭 확인할 것을 알려드릴게요.", TERMS)
    assert "안녕하세요" not in ks and "확인할" not in ks


def test_hook_title_drops_greeting_and_particle():
    t = T.tidy_title(T.short_line(T.drop_greeting("안녕하세요. 오늘은 토지 투자 전에 꼭 확인할 세 가지를 알려드릴게요."), 16))
    assert t == "토지 투자 전에 꼭 확인할 세 가지"


# ---------------------------------------------------------------- 대본 맞춤
def test_align_whole_script_fixes_typos_and_drops_offscript_filler():
    spoken = words_from("이후 UOTS로 바꿔요. 음 다음 장면입니다.")
    res = align.align(spoken, "이후 tts로 바꿔요. 다음 장면입니다.", TG)
    assert res.mode == "whole"
    assert " ".join(w.text for w in res.words) == "이후 tts로 바꿔요. 다음 장면입니다."
    assert [w.text for w in res.removed] == ["음"]


def test_align_partial_keeps_very_different_words():
    spoken = words_from("다음 영상은 완전히 다른 이야기를 해요")
    res = align.align(spoken, "전혀 관계없는 대본 문장이 여기 있습니다", TG)
    assert res.mode == "partial"
    assert [w.text for w in res.words] == [w.text for w in spoken]


def test_distribute_skips_pauses():
    spoken = [Word("알려", 0.0, 0.4), Word("드릴게요", 0.4, 1.0), Word("첫째", 3.0, 3.4)]
    out = align._distribute(spoken[:2], ["알려드릴게요."])
    assert out[0].start == 0.0 and out[0].end <= 1.0  # 침묵(1.0~3.0)을 끌어안지 않음


def test_script_tokenizer_splits_after_punctuation():
    assert align.tokenize_script("있습니다,혹시 아세요?") == ["있습니다,", "혹시", "아세요?"]


# ---------------------------------------------------------------- 자르기·배속
def test_silence_gaps_shrink_to_point_one_second():
    ws = [Word("가나다라", 0.0, 1.0), Word("마바사아", 2.0, 3.0)]
    plan = edit.plan_edit(ws, 4.0, TG, speed_up=False)
    assert len(plan.segments) == 2
    out_gap = plan.words[1].start - plan.words[0].end
    assert abs(out_gap - TG.silence_keep) < 1e-6


def test_short_gaps_are_kept():
    ws = [Word("가나", 0.0, 0.5), Word("다라", 0.6, 1.0)]  # 0.1초 < 0.16초
    assert len(edit.plan_edit(ws, 2.0, TG).segments) == 1


def test_isolated_filler_removed():
    ws = [Word("안녕하세요", 0.0, 0.8), Word("음", 1.2, 1.4), Word("반갑습니다", 1.8, 2.6)]
    plan = edit.plan_edit(ws, 3.0, TG)
    assert [w.text for w in plan.fillers] == ["음"]
    assert "음" not in [w.text for w in plan.words]


def test_speed_is_clamped_to_book_range():
    slow = [Word("가" * 4, i * 1.0, i * 1.0 + 0.9) for i in range(10)]  # 4.4글자/초
    fast = [Word("가" * 12, i * 1.0, i * 1.0 + 0.95) for i in range(10)]  # 12글자/초
    assert edit.plan_edit(slow, 11, TG).speed == TG.speed_max
    assert edit.plan_edit(fast, 11, TG).speed == TG.speed_min


# ---------------------------------------------------------------- 장면
SCRIPT = ("안녕하세요. 오늘은 토지 투자 전에 꼭 확인할 세 가지를 알려드릴게요. 첫째, 용도지역을 확인하세요. "
          "일반주거지역은 용적률이 최대 300%예요. 도로를 보고, 지목을 보고, 허가를 받고 진행하세요. "
          "맹지는 왜 싸게 나올까요? 정리 자료가 필요하면 댓글에 '공법'이라고 남겨주세요. 다음 영상에서 만나요.")


def build():
    ws = words_from(SCRIPT)
    return scenes.build_scenes(ws, TG, TERMS, total_duration=ws[-1].end + 0.3, cta="자료")


def test_scene_kinds_follow_book_rules():
    sc = build()
    kinds = [s.kind for s in sc]
    assert kinds[0] == "hook" and kinds[-1] == "closing"
    for k in ("number", "checklist", "question", "comment"):
        assert k in kinds
    comment = next(s for s in sc if s.kind == "comment")
    assert comment.card["comment"] == "공법" and comment.text.startswith("댓글")
    assert next(s for s in sc if s.kind == "keyword" and s.card.get("badge") == "첫째")


def test_number_and_counter_never_split():
    for s in build():
        for ln in s.lines:
            assert not ln.text.endswith(" 세") and not ln.text.startswith("가지")
        assert not s.text.endswith(" 세")


def test_chunk_lengths_and_contiguity():
    sc = build()
    for a, b in zip(sc, sc[1:]):
        assert a.end == b.start
    assert all(s.dur <= TG.chunk_max + 0.5 for s in sc)


def test_subtitle_lines_within_limits_and_single_highlight():
    for s in build():
        for ln in s.lines:
            assert T.count_chars(ln.text) <= TG.subtitle_max_chars + 3
            assert sum(1 for _, st in ln.tokens if st == "key") <= 1


def test_layout_cycle_and_rest_after_special():
    sc = build()
    assert sc[0].layout == "full"
    assert sc[-1].layout == "closeup"
    for s in sc:
        if s.kind in scenes.CARD_KINDS:
            assert s.layout == "half"
