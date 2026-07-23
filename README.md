# 스레드(Threads) 자동화 봇 🧵

메타 **공식 Threads API**로 글 발행과 댓글 자동답글을 돌립니다.
n8n·Make 같은 **월 구독 툴 없이**, 구독료 0원으로 동작합니다.

> 참고 영상: 방구석컴퍼니 —「스레드 자동화 프로그램 무료로 드립니다」

## 기능

- ✅ **글 발행** — 텍스트/이미지 글을 명령 한 줄로 발행 (컨테이너 생성 → 발행, 2단계 자동 처리)
- ✅ **댓글 자동답글** — 내 글에 달린 댓글을 읽고, 규칙(`rules.json`)에 따라 자동 답변
- ✅ **60일 장기 토큰** — 1시간마다 만료되는 토큰을 뚫을 필요 없이, 한 번 로그인하면 60일
- ✅ **중복 답글 방지** — 이미 답한 댓글은 다시 답하지 않음
- ✅ **상주 모드** — 일정 간격으로 계속 돌면서 새 댓글에 자동 응답

---

## 0. 준비물

- Python 3.10 이상
- **공개(Public) 스레드 계정** — 비공개 계정이면 API 키(토큰) 자체가 나오지 않습니다.
- 메타 개발자 계정 (https://developers.facebook.com)

## 1. 설치

```bash
pip install -r requirements.txt
```

## 2. 메타 개발자 콘솔에서 앱 만들기

영상 순서 그대로입니다.

1. https://developers.facebook.com/apps → **앱 만들기**
2. 유형 선택 화면에서 **Threads 사용**이 포함된 유형 선택
3. 앱 생성 (마지막에 비밀번호를 한 번 더 물어봅니다)
4. 앱 대시보드 → **Threads 사용 > 설정**으로 이동
5. **권한(스코프) 4개만** 켭니다:
   - `threads_basic` (필수)
   - `threads_content_publish` (글 발행)
   - `threads_manage_replies` (답글 **쓰기**)
   - `threads_read_replies` (답글 **읽기** — 쓰기와 별개 권한!)
6. **리디렉트 콜백 URI** 등록 (예: `https://localhost/callback`)
   → `.env`의 `THREADS_REDIRECT_URI`와 **정확히 일치**해야 합니다.

### ⚠️ 자주 틀리는 부분

- **App ID가 두 개로 보입니다.** 일반 "앱 ID"가 아니라 **"Threads 앱 ID"**를 사용하세요.
- **테스터 역할이 두 종류입니다.** 일반 "테스터"가 아니라 **"Threads 테스터"**로 초대해야 합니다.
- **초대 수락 위치.** 개발자 콘솔이 아니라 → **폰의 스레드 앱 → 설정 → 계정 → 웹사이트 권한**에서 초대를 수락합니다.

## 3. 환경 변수 설정

`.env.example`을 복사해 `.env`를 만들고 값을 채웁니다.

```bash
cp .env.example .env
```

```dotenv
THREADS_APP_ID=여기에_Threads_앱_ID
THREADS_APP_SECRET=여기에_앱_시크릿
THREADS_REDIRECT_URI=https://localhost/callback
```

## 4. 로그인 (60일 토큰 발급)

```bash
python -m threads_bot login
```

1. 출력된 인증 URL을 브라우저에서 엽니다.
2. 로그인/권한 허용을 합니다.
3. 이동한 주소창의 **전체 URL**(또는 `code=` 뒤 값)을 복사해 붙여넣습니다.
   - 콜백 URI가 `localhost`라 페이지는 안 열려도 됩니다. 주소창의 `code=...`만 있으면 됩니다.

성공하면 단기 토큰 → 60일 장기 토큰으로 자동 교환되어 `state.json`에 저장됩니다.

> 만료가 다가오면 `python -m threads_bot refresh`로 다시 60일 연장할 수 있습니다.

## 5. 사용법

```bash
# 내 프로필/토큰 상태 확인
python -m threads_bot me

# 글 발행
python -m threads_bot publish "안녕하세요, 첫 자동 발행 글입니다 🧵"

# 이미지 글 발행 (공개 접근 가능한 이미지 URL 필요)
python -m threads_bot publish "사진과 함께" --image https://example.com/photo.jpg

# 내 글에 달린 댓글 보기
python -m threads_bot replies

# 자동답글 — 먼저 모의(dry-run)로 확인!
python -m threads_bot autoreply --dry-run

# 실제 자동답글 1회 실행
python -m threads_bot autoreply

# 상주 모드: 5분(300초)마다 새 댓글에 자동 응답
python -m threads_bot run --interval 300
```

## 6. 자동답글 규칙 설정

`rules.example.json`을 복사해 `rules.json`을 만들고 원하는 대로 수정하세요.

```bash
cp rules.example.json rules.json
```

```json
{
  "default_reply": "댓글 감사합니다! 🙏",
  "reply_once_per_user": false,
  "skip_keywords": ["광고", "홍보"],
  "rules": [
    { "keywords": ["가격", "얼마"], "reply": "가격은 프로필 링크에서 확인해주세요 😊" },
    { "keywords": ["자료", "링크"], "reply": "자료는 프로필 링크에 있어요! 🔗" }
  ]
}
```

- `rules`는 **위에서부터** 검사해 첫 번째로 키워드가 맞는 답글을 사용합니다.
- 어떤 규칙에도 안 맞으면 `default_reply`를 보냅니다.
- `skip_keywords`가 포함된 댓글은 아예 답글하지 않습니다.
- `reply_once_per_user: true`면 같은 사용자에게는 한 번만 답합니다.

`rules.json`이 없으면 기본값(모든 댓글에 `default_reply`)으로 동작합니다.

---

## 파일 구조

```
threads_bot/
  config.py       환경 설정 로딩(.env)
  store.py        토큰·상태 저장(state.json)
  threads_api.py  Threads Graph API 저수준 클라이언트
  auth.py         로그인/토큰 교환·갱신
  autoreply.py    댓글 자동답글 엔진
  cli.py          명령줄 인터페이스
```

## 보안 주의

- `.env`, `state.json`, `rules.json`은 `.gitignore`에 포함되어 **커밋되지 않습니다**.
- 앱 시크릿과 토큰은 절대 공개 저장소나 채팅에 올리지 마세요.

## 참고

- 메타 Threads API 공식 문서: https://developers.facebook.com/docs/threads
- 글 발행이 2단계인 이유: 미디어 컨테이너를 먼저 만들고(`/me/threads`),
  잠깐 처리 시간을 준 뒤 발행(`/me/threads_publish`)하기 때문입니다.
