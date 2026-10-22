# MR.K Typeless 데스크톱 (Windows)

**어느 창에서든 Win+H를 누르고 말하면, 받아쓰고 정리해서 그 자리에 바로 입력합니다.**
메일, 카카오톡 PC, Claude·ChatGPT 입력창, 한글·워드 어디서나 됩니다. 진짜 Typeless와 같은 사용법입니다.

웹 버전([mrk-typeless.vercel.app](https://mrk-typeless.vercel.app))과 같은 정리 규칙·글 형식·사전을 씁니다.
학생에게 나눠 줄 안내 페이지: **[mrk-typeless.vercel.app/download](https://mrk-typeless.vercel.app/download)**

## 설치 (5분)

1. **[MRK-Typeless-Setup.exe 내려받기](https://github.com/ko37258-lab/rsa/releases/latest/download/MRK-Typeless-Setup.exe)** → 실행합니다. 관리자 권한은 필요 없습니다.
2. "Windows의 PC 보호" 창이 뜨면 **추가 정보 → 실행**을 누릅니다. 서명하지 않은 프로그램이라 처음 한 번 뜹니다.
3. 설정 창의 **시작하기** 탭에 **Gemini API 키** 하나를 넣고 **저장**합니다. '키 발급 ↗'을 누르면 Google AI Studio가 열립니다.
   - 이 키 하나로 받아쓰기(말 → 글자)와 정리를 모두 합니다. Google AI Studio의 무료 사용량 안에서는 요금이 나오지 않습니다.
   - Claude 키를 함께 넣으면 정리는 Claude가 합니다. ElevenLabs·OpenAI 받아쓰기도 '받아쓰기 · 정리' 탭에서 고를 수 있습니다.
4. 저장하면 **사용 방법** 창이 열립니다. 작업 표시줄 오른쪽 아래(^ 안)의 파란 마이크 아이콘을 누르면 언제든 다시 볼 수 있습니다.

설치하지 않고 쓰려면 [MRK-Typeless.exe](https://github.com/ko37258-lab/rsa/releases/latest/download/MRK-Typeless.exe)(한 파일)를 받아 실행해도 됩니다.
지우려면 Windows 설정 → 앱 → **MR.K Typeless** → 제거.

## 쓰는 법

| 하고 싶은 일 | 키 | 방법 |
| --- | --- | --- |
| 말해서 입력 | `Win+H` | 글 쓸 곳을 클릭하고 Win+H → 말하기 → Win+H 한 번 더. Windows 음성 입력 대신 MR.K가 열립니다 (설정에서 끌 수 있음) |
| 누른 채 말하기 | `Ctrl+Shift+Space` | 단축키를 **누른 채** 말하고 떼기. 짧게 한 번 누르면 계속 듣다가 다시 누르면 끝 |
| 받아쓴 글 정리 | `Ctrl+Alt+Space` | 이미 써 둔 글을 마우스로 선택하고 누르기 → 정리된 글로 바뀜 |
| 말로 고치기 | `Ctrl+Alt+E` | 고칠 글을 선택하고 단축키를 누른 채 "더 공손하게", "세 줄로 요약해줘"처럼 말하기 |
| 녹음 버리기 | `Esc` | 녹음 중에 누르기 |

- 말하는 동안 화면 아래쪽에 **듣는 중 · 자동 정리 0:03** 같은 작은 표시가 뜹니다. 끝나면 "붙여넣었습니다"가 뜹니다.
- **글 형식**(자동 정리·메시지·이메일·보고서·강의 원고·상담 노트·번역)은 트레이 아이콘 **오른쪽 클릭 → 글 형식**에서 바꿉니다.
- **사전**(부동산공법 용어, 자주 틀리는 말 바꿔쓰기)은 트레이 메뉴 **사전 고치기**에서 메모장으로 고칩니다. Gemini 받아쓰기는 사전 용어를 미리 알려 줘서 더 잘 알아듣습니다.
- 붙여넣은 뒤에는 원래 클립보드 내용을 되돌려 둡니다.
- 단축키는 설정 창에서 바꿀 수 있습니다 (예: `f9`).

## 알아 두기

- 영상·음악을 틀어 두면 그 소리도 받아써집니다. 멈추고 말하세요.
- 관리자 권한으로 실행한 프로그램 안에서는 단축키가 듣지 않을 수 있습니다.
- Gemini 무료 등급에서는 보낸 내용이 Google 서비스 개선에 쓰일 수 있습니다. 민감한 내용은 유료 등급이나 Claude 키를 쓰세요.
- Claude·ElevenLabs·OpenAI는 쓴 만큼 요금이 나옵니다. 키와 기록은 이 컴퓨터의 `%APPDATA%\MRK-Typeless`에만 저장되고, 프로그램을 지워도 남아 있습니다.
- 문제가 생기면 트레이 메뉴 → **기록 폴더 열기** → `log.txt`를 보내 주세요.

## 개발

```bash
cd desktop
pip install -r requirements.txt pytest
python -m pytest -q tests      # 정리 규칙·프롬프트·단축키 흐름 테스트
python -m mrk_typeless         # 실행 (Windows)
```

`desktop/` 아래가 바뀌어 푸시되면 GitHub Actions(`.github/workflows/desktop-windows.yml`)가 Windows에서
테스트 → exe 빌드 → exe 자체 점검(`--self-test`) → Win+H 훅 점검 → 설치 프로그램 만들기(Inno Setup, `installer.iss`)
→ 조용히 설치·실행·제거 점검을 하고, `desktop/VERSION` 번호로 릴리스에 `MRK-Typeless-Setup.exe`와 `MRK-Typeless.exe`를 올립니다.

```
desktop/
  run.py                 exe 진입점
  make_icon.py           아이콘 만들기
  installer.iss          설치 프로그램 (Inno Setup)
  mrk_typeless/
    app.py               단축키 → 녹음 → 받아쓰기 → 정리 → 붙여넣기
    audio.py             마이크 녹음 (WAV)
    stt.py               받아쓰기 API (Gemini / ElevenLabs Scribe / OpenAI)
    llm.py               정리 (Claude: Anthropic Python SDK, Gemini: REST)
    gemini.py            Gemini API 공통 (요청 만들기, 오류 문구)
    guide.py             사용 방법 창에 보여 줄 내용
    prompts.py, modes.py, dictionary.py, cleanup.py   웹 버전과 같은 정리 규칙
    clipboard.py         선택한 글 가져오기, 붙여넣기, 클립보드 되돌리기
    ui.py                화면 아래 상태 표시, 설정 창(탭), 사용 방법 창
    tray.py              트레이 아이콘·메뉴
    autostart.py         Windows 시작 시 자동 실행
```
