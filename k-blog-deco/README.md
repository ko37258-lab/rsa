# K 블로그 꾸미기

레퍼런스(홈페이지·블로그 주소, 화면 캡처, 참고 영상)를 넣고 원하는 스타일을 말하면,
AI 가 **네이버 홈페이지형 블로그**용 스킨 배경 이미지·버튼 위젯·모바일 커버를 만들어 주는 웹 서비스입니다.
만든 뒤에도 **말로(AI 수정)**, **직접(끌어서 편집)**, **버전 되돌리기**로 계속 고칠 수 있고, 모든 기능은 REST API 로도 쓸 수 있습니다.

- 서비스 기획서: [`docs/PLAN.md`](docs/PLAN.md)
- 기술: Next.js 16 · TypeScript · Tailwind 4 · Drizzle(SQLite/libSQL) · Claude API · 네이버 로그인

> 네이버는 블로그 스킨을 바꾸는 공개 API 가 없어서, 결과물은 **이미지 + 붙여넣기 코드 + 적용 가이드**로 드립니다.

---

## 1. 빠르게 실행해 보기 (키 없이)

```bash
cd k-blog-deco
npm install
cp .env.example .env.local
npm run dev
```

http://localhost:3000 → **개발용 로그인** → 새 디자인 만들기.
AI 키가 없으면 **템플릿 모드**(규칙 기반 생성)로 전체 흐름을 확인할 수 있습니다.

## 2. 네이버 로그인 연결

1. https://developers.naver.com/apps → **애플리케이션 등록**
2. 사용 API: **네이버 로그인** / 제공 정보: 별명, 프로필 사진(이메일은 선택)
3. 서비스 URL: `APP_URL` 값 (예: `https://kblog.example.com`)
4. Callback URL: `{APP_URL}/api/auth/naver/callback`
5. 발급된 Client ID / Secret 을 `.env.local` 의 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 에 입력

> 네이버 앱이 '개발 중' 상태면 등록한 테스터 아이디만 로그인됩니다. 공개하려면 네이버에 검수 요청을 하세요.

## 3. AI(Claude) 연결

`.env.local` 에 `ANTHROPIC_API_KEY` 를 넣으면 레퍼런스 분석·자유로운 말로 수정이 켜집니다.
기본 모델은 `claude-opus-5-5` 이며 `AI_MODEL` 로 바꿀 수 있습니다. 호출 기록(토큰·시간)은 DB 의 `ai_runs` 표에 남습니다.

## 4. 환경 변수

| 이름 | 설명 |
|---|---|
| `APP_URL` | 서비스 공개 주소. 네이버 콜백과 위젯 이미지 주소, 로그인 리다이렉트에 사용 |
| `SESSION_SECRET` | 세션 서명 키 (32자 이상, 운영 필수) |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 네이버 로그인 |
| `ANTHROPIC_API_KEY` / `AI_MODEL` | Claude API (비우면 템플릿 모드) |
| `DATA_DIR` | SQLite 파일과 업로드 이미지 저장 폴더 (기본 `./data`) |
| `DATABASE_URL` / `DATABASE_AUTH_TOKEN` | (선택) Turso 등 원격 libSQL |
| `ALLOW_DEV_LOGIN` | 개발용 로그인 (운영에서는 무조건 꺼짐) |
| `AI_RATE_LIMIT_PER_HOUR` | 사용자당 시간당 AI 호출 한도 (기본 30) |

## 5. 명령어

```bash
npm run dev         # 개발 서버
npm run typecheck   # 타입 검사
npm run lint        # 린트
npm run build       # 프로덕션 빌드 (.next/standalone 생성)
```

## 6. 배포 (단일 서버 + Docker)

DB 와 업로드 이미지가 디스크에 저장되므로 **영구 볼륨이 있는 서버**에 올립니다.

```bash
docker build -t k-blog-deco .
docker run -d -p 3000:3000 -v kblog-data:/data --env-file .env.production k-blog-deco
```

HTTPS 리버스 프록시(nginx, Caddy 등) 뒤에 두고 `APP_URL` 을 공개 주소로 맞추세요.
여러 대로 늘릴 때는 `DATABASE_URL`(Turso) 과 오브젝트 스토리지(S3/R2, `src/lib/storage.ts` 교체)로 옮깁니다.

## 7. API

화면도 같은 API 만 씁니다. **API 연동** 메뉴에서 개인 토큰을 발급해 `Authorization: Bearer kbd_...` 로 호출하세요.
전체 명세는 `GET /api/openapi.json` (OpenAPI 3.1).

```bash
curl -X POST $HOST/api/v1/projects -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"brief":{"blogName":"새봄 토지연구소","styleRequest":"신뢰감 있는 네이비"}}'
curl -X POST $HOST/api/v1/projects/{id}/generate -H "Authorization: Bearer $TOKEN"
curl -X POST $HOST/api/v1/projects/{id}/revise  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"instruction":"버튼을 둥글게"}'
```

## 8. 폴더 구조

```
src/
  app/                    화면(page) + API(route)
    api/auth/             네이버 로그인·로그아웃·개발용 로그인
    api/v1/               REST API (projects, generate, revise, design, versions, export, assets, references, tokens)
    files/[key]/          업로드 이미지 공개 주소 (위젯 코드가 참조)
    dashboard/ projects/ developers/
  components/editor/      편집기 (미리보기, 끌어서 편집, 패널들)
  lib/
    design/               디자인 스키마(zod)·보정·프리셋·템플릿 생성기·폰트
    render/               Canvas 렌더러 (미리보기 = PNG 내보내기)
    ai/                   Claude 호출·프롬프트·생성/수정
    naver/                네이버 규격 수치·위젯 코드·적용 가이드
    references/           레퍼런스 주소 분석 (SSRF 차단)
    auth/ db/ api/ services/ storage.ts
  proxy.ts                로그인 필요한 화면 1차 확인
```

네이버 규격 수치가 바뀌면 `src/lib/naver/spec.ts`, 적용 가이드 문구는 `src/lib/naver/guide.ts` 만 고치면 됩니다.
