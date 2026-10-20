"""한국어 텍스트 도우미 — 형태소 분석기 없이 규칙으로 처리합니다."""
from __future__ import annotations

import re
import unicodedata

PUNCT_CHARS = ".,!?…·~\"'“”‘’()[]{}<>:;「」『』《》-–—/\\|"
_PUNCT_RE = re.compile(r"[\s" + re.escape(PUNCT_CHARS) + r"]+")
SENTENCE_END = re.compile(r"[.!?…]+[\"'”’)\]]*$")
_EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F900-\U0001F9FF️‍]+"
)

# 혼자 떨어져 있으면 지우는 군말 (책: '음, 어, 자')
FILLERS = {"음", "음음", "으음", "어", "어어", "아", "으", "에", "엄", "흠", "자", "그", "저", "뭐", "막"}

# 끝인사 → 얼굴 클로즈업
CLOSING_PHRASES = ("다음 영상에서", "다음에 만나", "감사합니다", "고맙습니다", "구독", "좋아요 눌러",
                   "안녕히", "또 만나요", "만나요")
# 시연 화면을 넣을 신호 (책: '이렇게·누르고·붙여넣고')
DEMO_TRIGGERS = ("이렇게", "화면", "누르", "눌러", "붙여넣", "클릭", "보시면", "들어가서", "입력", "선택")

_JOSA = sorted("""
은 는 이 가 을 를 에 에서 에게 께 한테 으로 로 의 도 만 과 와 랑 이랑 하고 까지 부터 보다 처럼 같이
이나 나 이든 든 이라도 라도 이란 란 이라는 라는 이에요 예요 이죠 죠 입니다 이고 고 에는 에서는 으로는 로는
에도 에서도 만큼 마다 밖에 조차 뿐 이야 야 들 들은 들이 들을 께서
""".split(), key=len, reverse=True)

STOPWORDS = set("""
그리고 그런데 그래서 그러면 그러니까 근데 이제 진짜 정말 너무 이렇게 저렇게 그렇게 여러분 오늘 우리 저희 저는 제가 나는 내가
이거 이게 그거 그게 저거 이것 그것 저것 여기 거기 저기 있는 있어요 있습니다 있죠 합니다 하는 해서 했어요 했습니다 됩니다 되는 돼요
같은 같아요 그냥 바로 좀 많이 다 또 더 잘 수 것 거 때 등 안 못 왜 뭐 어떤 어떻게 이런 그런 저런 하나 하면 해요 하죠 할 한
보면 보세요 봐요 보시면 아시죠 알죠 생각 말씀 경우 정도 부분 지금 다시 먼저 계속 바로 사실 일단 혹시 만약 처음 마지막
때문 가지 개 번 명 곳 분 점 중 적 뿐 최대 최소 정말로 완전 엄청 되게 전에 후에 위해 대해 통해 정리
""".split())

_KNUM = "한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|서른|마흔|쉰|백|천|만|첫|둘|셋|넷"
_COUNTER = ("가지|개|번|명|배|단계|군데|곳|줄|년|개월|달|주|일|시간|분|초|층|채|평|필지|억|만원|천만원|원|"
            "퍼센트|프로|%|살|위|등|회|권|장|편|㎡|제곱미터|미터|키로|킬로")
NUM_RE = re.compile(
    rf"(\d[\d,]*(?:\.\d+)?\s*(?:{_COUNTER})?(?:\s*(?:{_COUNTER}))?|(?:{_KNUM})\s?(?:{_COUNTER})|(?:{_KNUM})째)"
)
QUESTION_ENDINGS = ("죠", "까", "나요", "가요", "을까요", "ㄹ까요", "니까", "는지", "는데요?")


def strip_emoji(s: str) -> str:
    return _EMOJI_RE.sub("", s)


def norm(s: str) -> str:
    """비교용: 소문자 + 공백·문장부호 제거 + 유니코드 정규화."""
    s = unicodedata.normalize("NFC", s).lower()
    return _PUNCT_RE.sub("", s)


def count_chars(s: str) -> int:
    """말 속도 계산용 글자 수 (공백·문장부호 제외)."""
    return len(norm(s))


def strip_punct(s: str) -> str:
    return s.strip().strip(PUNCT_CHARS).strip()


def is_sentence_end(word: str) -> bool:
    return bool(SENTENCE_END.search(word.strip()))


def is_filler(word: str) -> bool:
    return norm(word) in FILLERS


def stem(word: str) -> str:
    """'용적률은' → '용적률'. 남는 글자가 2자 이상일 때만 조사를 뗍니다."""
    w = strip_punct(word)
    for j in _JOSA:
        if w.endswith(j) and len(w) - len(j) >= 2:
            return w[: -len(j)]
    return w


_ORDINAL = re.compile(r"(첫|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열)\s?(째|번째)")


def ordinal(text: str) -> str | None:
    """'첫째, 용도지역' → '첫째' (숫자 카드 대신 단계 배지로)."""
    m = _ORDINAL.search(text)
    return m.group(0).replace(" ", "") if m else None


def find_number(text: str) -> str | None:
    """'용적률 300%까지' → '300%', '세 가지' → '세 가지'. 서수('첫째')는 숫자 카드로 보지 않음."""
    best = None
    for m in NUM_RE.finditer(text):
        token = m.group(0).strip()
        if not token or token in {"첫", "한", "두", "세", "네"} or token.endswith("째"):
            continue
        if best is None or len(token) > len(best):
            best = token
    return best


def is_question(text: str) -> bool:
    t = strip_punct(text)
    if "?" in text or "궁금" in text:
        return True
    return t.endswith(QUESTION_ENDINGS)


# '고'로 끝나지만 나열이 아닌 말 (명사·접속사)
_NOT_LISTING = {"그리고", "라고", "다고", "이고", "하고", "이라고", "최고", "참고", "광고", "창고", "사고", "재고",
                "신고", "원고", "경고", "공고", "예고", "잔고", "금고", "보고서"}


def _is_listing(word: str) -> bool:
    c = strip_punct(word)
    return len(c) >= 2 and c.endswith("고") and c not in _NOT_LISTING


def count_listing(words: list[str]) -> int:
    return sum(1 for w in words if _is_listing(w))


def checklist_items(words: list[str]) -> list[tuple[str, int]]:
    """'영상 고르고, 대본 붙여넣고, 누르기' → [('영상 고르기', 1), ('대본 붙여넣기', 3), ('누르기', 4)].

    책: '~하고 ~하고'가 두 번 넘게 나오면 체크리스트. '…고'는 '…기'로 바꿔 항목답게 씁니다.
    두 번째 값은 그 항목이 끝나는 낱말 위치(체크 표시가 나타날 시점).
    """
    items: list[tuple[str, int]] = []
    prev: str | None = None
    rest: list[str] = []
    for i, w in enumerate(words):
        c = strip_punct(w)
        if _is_listing(c):
            base = c[:-1] + "기"
            if prev and len(base) <= 4 and prev not in STOPWORDS:
                base = f"{stem(prev)} {base}"
            items.append((base, i))
            prev, rest = None, []
        else:
            prev = c
            rest.append(c)
    tail = " ".join(rest)
    if len(items) >= 2 and 0 < len(rest) <= 2 and not tail.endswith(("다", "요", "죠", "니다", "네")):
        items.append((tail, len(words) - 1))
    return items[:5]


GREETINGS = ("안녕하세요", "안녕하십니까", "여러분", "반갑습니다", "오늘은", "자")


def drop_greeting(text: str) -> str:
    """훅 제목에서 인사말을 뺍니다. '안녕하세요 오늘은 용적률…' → '용적률…'."""
    words = text.split()
    while words and strip_punct(words[0]) in GREETINGS:
        words.pop(0)
    return " ".join(words) or text


def is_closing(text: str) -> bool:
    return any(p in text for p in CLOSING_PHRASES)


def has_demo_trigger(text: str) -> bool:
    return any(p in text for p in DEMO_TRIGGERS)


_PREDICATE_ENDINGS = ("다", "요", "죠", "까", "고", "서", "면", "게", "지", "네", "데", "할", "는", "던", "기", "며",
                      "도록", "려고", "니다", "세요", "해요", "어요", "아요")


def keywords(text: str, terms: list[str], limit: int = 3) -> list[str]:
    """한 덩어리 말에서 핵심어를 고릅니다. 사전 용어 > 숫자 > 긴 명사형 낱말 순."""
    found: list[str] = []
    compact = text.replace(" ", "")
    for t in terms:  # 이미 긴 말부터 정렬됨
        if len(t) >= 2 and (t in text or t.replace(" ", "") in compact):
            if not any(t in f for f in found):
                found.append(t)
        if len(found) >= limit:
            return found
    scored: list[tuple[float, str]] = []
    for raw in text.split():
        clean = strip_punct(raw)
        s = stem(raw)
        if len(s) < 2 or s in STOPWORDS or norm(s) in FILLERS:
            continue
        if any(s in f or f in s for f in found):
            continue
        score = len(s) + (2.0 if re.search(r"[A-Za-z0-9]", s) else 0.0)
        if s != clean:
            score += 1.0  # 조사가 붙어 있던 말 = 명사일 가능성이 큼
        elif clean.endswith(_PREDICATE_ENDINGS) or clean in GREETINGS:
            continue  # 서술어·인사말은 핵심어가 아님
        if s.endswith("하") or s in STOPWORDS:
            continue
        scored.append((score, s))
    for _, s in sorted(scored, key=lambda x: -x[0]):
        if s not in found:
            found.append(s)
        if len(found) >= limit:
            break
    return found


def short_line(text: str, max_chars: int = 16) -> str:
    """카드·제목용으로 문장을 짧게. 글자 수는 공백 제외 기준."""
    words = strip_punct(text).split()
    out: list[str] = []
    for w in words:
        if count_chars(" ".join(out + [w])) > max_chars and out:
            break
        out.append(w)
    return " ".join(out)


def tidy_title(title: str) -> str:
    """제목 끝 낱말의 조사를 뗍니다. '세 가지를' → '세 가지'."""
    words = title.split()
    if words:
        words[-1] = stem(words[-1])
    return " ".join(words)


def split_two_lines(text: str, max_chars: int = 9) -> list[str]:
    """제목을 두 줄로 균형 있게 나눕니다."""
    words = text.split()
    if count_chars(text) <= max_chars or len(words) < 2:
        return [text]
    best = (10**9, [text])
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        diff = abs(count_chars(a) - count_chars(b))
        if diff < best[0]:
            best = (diff, [a, b])
    return best[1]
