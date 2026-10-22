"""개인 사전: 정확히 써야 할 용어와, 음성인식이 자주 틀리는 말의 바꿔쓰기 규칙."""

DEFAULT_DICTIONARY = {
    "terms": [
        "미스터홈즈",
        "공법의 신",
        "용도지역",
        "용도지구",
        "용도구역",
        "건폐율",
        "용적률",
        "지구단위계획",
        "개발행위허가",
        "도시·군기본계획",
        "도시·군관리계획",
        "개발제한구역",
        "토지거래허가구역",
        "성장관리계획구역",
        "기반시설부담구역",
        "농지전용",
        "산지전용",
        "공시지가",
        "가로주택정비사업",
    ],
    "replacements": [
        {"from": "건폐률", "to": "건폐율"},
        {"from": "용적율", "to": "용적률"},
        {"from": "지구 단위 계획", "to": "지구단위계획"},
        {"from": "개발 행위 허가", "to": "개발행위허가"},
        {"from": "미스터 홈즈", "to": "미스터홈즈"},
    ],
}


def apply_replacements(text: str, replacements: list[dict]) -> tuple[str, int]:
    """바꿔쓰기 규칙을 글자 그대로 적용하고, 바꾼 횟수를 함께 돌려줍니다."""
    count = 0
    for rule in replacements:
        if not isinstance(rule, dict):
            continue
        src, dst = rule.get("from"), rule.get("to")
        if not isinstance(src, str) or not isinstance(dst, str):
            continue
        # 아직 바른 표기를 안 적은 규칙은 적용하지 않습니다 (적용하면 그 말이 통째로 지워짐).
        if not src.strip() or not dst.strip() or src == dst:
            continue
        count += text.count(src)
        text = text.replace(src, dst)
    return text, count
