"""사용 방법 창에 보여 줄 내용 (화면 없이도 시험할 수 있게 따로 둡니다)."""

from .config import polish_engine, stt_key


def pretty_hotkey(combo: str) -> str:
    """'ctrl+shift+space' → 'Ctrl + Shift + Space'"""
    names = {"windows": "Win", "esc": "Esc", "ctrl": "Ctrl", "alt": "Alt", "shift": "Shift", "space": "Space"}
    return " + ".join(names.get(k.strip(), k.strip().upper() if len(k.strip()) == 1 else k.strip().title()) for k in combo.split("+"))


def help_items(cfg: dict) -> list[tuple[str, str, str]]:
    """(키, 하는 일, 설명) 목록. 설정에 맞춰 Win+H 줄을 넣고 뺍니다."""
    items = []
    if cfg.get("win_h", True):
        items.append(
            ("Win + H", "말해서 입력", "글 쓸 곳을 클릭하고 Win+H → 말하기 → Win+H 한 번 더.\n받아쓰고 정리해서 그 자리에 바로 붙여넣습니다.")
        )
    items += [
        (pretty_hotkey(cfg["hotkey_dictate"]), "누른 채 말하기", "길게 누른 채 말하고 손을 떼면 끝. 짧게 누르면 다시 누를 때까지 듣습니다."),
        (pretty_hotkey(cfg["hotkey_polish"]), "선택한 글 정리", "이미 써 둔 글을 마우스로 선택하고 누르면 '음, 어'를 지우고 정리합니다."),
        (pretty_hotkey(cfg["hotkey_edit"]), "말로 고치기", "글을 선택하고 누른 채 \"더 공손하게\", \"세 줄로 요약해줘\"처럼 말합니다."),
        ("Esc", "녹음 버리기", "말하는 중에 누르면 입력하지 않고 버립니다."),
        ("Ctrl + Alt + 1~7", "글 형식 바꾸기", "1 자동 정리 · 2 메시지 · 3 이메일 · 4 보고서 · 5 강의 원고 · 6 상담 노트 · 7 번역"),
        (
            "한/영 · 한자",
            "평소처럼",
            "MR.K는 한/영·한자 키를 건드리지 않습니다. 혹시 안 되면 트레이 메뉴 → '한/영 키가 안 될 때'를 누르세요.",
        ),
    ]
    return items


def readiness(cfg: dict) -> tuple[bool, str]:
    """(바로 쓸 수 있는지, 한 줄 상태)"""
    if not stt_key(cfg):
        need = "Gemini API 키" if cfg.get("stt_provider") == "gemini" else "받아쓰기 API 키"
        return False, f"{need}를 넣어야 말로 입력할 수 있습니다. 아래 '설정 열기'를 누르세요."
    stt = {"gemini": "Gemini", "elevenlabs": "ElevenLabs", "openai": "OpenAI"}.get(cfg.get("stt_provider"), "")
    polish = {"gemini": "Gemini", "claude": "Claude", "local": "기본 정리(AI 없이)"}[polish_engine(cfg)]
    return True, f"준비 완료 · 받아쓰기 {stt} · 정리 {polish}"
