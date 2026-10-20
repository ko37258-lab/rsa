# MR.K Typeless 데스크톱 (Windows)

**어느 창에서든 단축키를 누른 채 말하면, 받아쓰고 정리해서 그 자리에 바로 입력합니다.**
메일, 카카오톡 PC, Claude·ChatGPT 입력창, 한글·워드 어디서나 됩니다. 진짜 Typeless와 같은 사용법입니다.

웹 버전([mrk-typeless.vercel.app](https://mrk-typeless.vercel.app))과 같은 정리 규칙·글 형식·사전을 씁니다.

## 설치 (10분)

1. [릴리스 페이지](https://github.com/ko37258-lab/rsa/releases/latest)에서 **MRK-Typeless.exe**를 내려받아 실행합니다.
2. "Windows의 PC 보호" 창이 뜨면 **추가 정보 → 실행**을 누릅니다. 서명하지 않은 프로그램이라 처음 한 번 뜹니다.
3. 설정 창이 열리면 키 두 개를 넣고 **저장**합니다. 각 칸 옆 **키 발급 ↗** 버튼을 누르면 발급 페이지가 열립니다.
   - **받아쓰기 API 키** (ElevenLabs 권장): 말 → 글자
   - **Claude API 키**: 글자 → 정리된 글
4. 작업 표시줄 오른쪽 아래(^ 안)에 파란 마이크 아이콘이 생기면 준비 끝입니다.
   "Windows를 켤 때 자동으로 실행"을 켜 두면 다음부터 따로 켤 필요가 없습니다.

## 쓰는 법

| 하고 싶은 일 | 단축키 | 방법 |
| --- | --- | --- |
| 말해서 입력 | `Ctrl+Shift+Space` | 글을 쓸 곳을 클릭해 두고, 단축키를 **누른 채** 말하고 떼기. 짧게 한 번 누르면 계속 듣다가 다시 누르면 끝 |
| 받아쓴 글 정리 | `Ctrl+Alt+Space` | Win+H 등으로 받아쓴 글을 마우스로 선택하고 누르기 → 정리된 글로 바뀜 (받아쓰기 키 없이도 됨) |
| 말로 고치기 | `Ctrl+Alt+E` | 고칠 글을 선택하고 단축키를 누른 채 "더 공손하게", "세 줄로 요약해줘"처럼 말하기 |
| 녹음 버리기 | `Esc` | 녹음 중에 누르기 |

- 말하는 동안 화면 아래쪽에 **듣는 중 · 자동 정리 0:03** 같은 작은 표시가 뜹니다. 끝나면 "붙여넣었습니다"가 뜹니다.
- **글 형식**(자동 정리·메시지·이메일·보고서·강의 원고·상담 노트·번역)은 트레이 아이콘 **오른쪽 클릭 → 글 형식**에서 바꿉니다.
- **사전**(부동산공법 용어, 자주 틀리는 말 바꿔쓰기)은 트레이 메뉴 **사전 고치기**에서 메모장으로 고칩니다.
- 붙여넣은 뒤에는 원래 클립보드 내용을 되돌려 둡니다.
- 단축키는 설정 창에서 바꿀 수 있습니다 (예: `f9`).

## 알아 두기

- 영상·음악을 틀어 두면 그 소리도 받아써집니다. 멈추고 말하세요.
- 관리자 권한으로 실행한 프로그램 안에서는 단축키가 듣지 않을 수 있습니다.
- 받아쓰기·정리는 쓴 만큼 ElevenLabs·Anthropic 요금이 나옵니다. 키와 기록은 이 컴퓨터의 `%APPDATA%\MRK-Typeless`에만 저장됩니다.
- 문제가 생기면 트레이 메뉴 → **기록 폴더 열기** → `log.txt`를 보내 주세요.

## 개발

```bash
cd desktop
pip install -r requirements.txt pytest
python -m pytest -q tests      # 정리 규칙·프롬프트·단축키 흐름 테스트
python -m mrk_typeless         # 실행 (Windows)
```

`desktop/` 아래가 바뀌어 푸시되면 GitHub Actions(`.github/workflows/desktop-windows.yml`)가 Windows에서
테스트 → exe 빌드 → exe 자체 점검(`--self-test`)을 하고, `desktop/VERSION` 번호로 릴리스에 exe를 올립니다.

```
desktop/
  run.py                 exe 진입점
  make_icon.py           아이콘 만들기
  mrk_typeless/
    app.py               단축키 → 녹음 → 받아쓰기 → 정리 → 붙여넣기
    audio.py             마이크 녹음 (WAV)
    stt.py               받아쓰기 API (ElevenLabs Scribe / OpenAI)
    llm.py               Claude 정리 (Anthropic Python SDK)
    prompts.py, modes.py, dictionary.py, cleanup.py   웹 버전과 같은 정리 규칙
    clipboard.py         선택한 글 가져오기, 붙여넣기, 클립보드 되돌리기
    ui.py                화면 아래 상태 표시, 설정 창, 사용법
    tray.py              트레이 아이콘·메뉴
    autostart.py         Windows 시작 시 자동 실행
```
