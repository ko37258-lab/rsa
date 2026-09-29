# MR.K 블로그 인사이트 (비공개 운영 사이트)

네이버 블로그 `ko372`의 주간 보고서를 PostgreSQL(Supabase)에 누적 저장하고, 등록된 관리자만 열람하는 사이트입니다.

> 현재 연결: Supabase `mrk-realestate` 프로젝트(테이블·함수 적용, 관리자 1명 등록), Netlify 사이트 `mrk-blog-insights`(환경변수 설정 완료, 첫 배포 대기).

> ⚠️ 이 저장소는 **공개(public)** 저장소입니다. 실제 보고서 JSON·원자료 XLSX·기존 대시보드 HTML·수치가 담긴 지시문은
> 저장소에 넣지 않습니다. 실제 데이터는 로그인한 관리자가 업로드 화면으로 DB에 저장합니다.
> 테스트에서 실제 원자료가 필요하면 저장소 **밖** 폴더를 `MRK_DATA_DIR` 환경변수로 지정합니다.

## 구성

| 항목 | 내용 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript. 버전은 `package-lock.json`에 고정 |
| 데이터·인증 | Supabase PostgreSQL + Supabase Auth(이메일/비밀번호) + `@supabase/ssr` |
| 검증 | Ajv 2020-12 + ajv-formats(`date`, `uri`) + 계약서의 교차 필드 규칙(`src/lib/report/validate.ts`) |
| 차트 | 자체 SVG(텍스트 대체 표 포함), 외부 분석 SDK 없음 |
| 테스트 | Vitest(단위·DB), Playwright(종단) |

```
app/
  src/app/                화면·API 라우트
  src/lib/                검증·해시·저장·상태 판정·포맷
  src/proxy.ts            세션 갱신 + 비로그인 페이지 차단(1차 방어선)
  supabase/migrations/    검토·보완한 SQL(원본 001 + 운영 보조 002)
  supabase/config.toml    로컬 개발용 설정(공개 가입 차단)
  docs/integration-contract.md  사이트–Aside 연결 계약(원본 사본)
  tests/                  unit / db / e2e
  scripts/check-bundle-secrets.mjs  번들·로그 비밀값/데이터 유출 점검
```

## 화면과 경로

| 경로 | 기능 |
|---|---|
| `/login` | 관리자 로그인(공개 가입·기본 계정 없음). 세션 만료·권한 없음·설정 누락 안내 |
| `/dashboard` | 최신 **주간** 보고서(`period_end` 기준, baseline 제외), 6개 지표 카드, 누적 주간 추이(없는 주차는 빈 구간), 유입 전체 경로·검색어·콘텐츠·독자·개선 제안, 갱신 상태 |
| `/reports` | 주간 목록(기간·관측일·저장일·조회수·유입경로 수·상태), 연도 필터, 기간 선택 |
| `/reports/[reportId]` | 저장 당시 그대로 표시, 이전/다음 주, 경로 검색, CSV, 인쇄/PDF, 수정 이력·이전 리비전 보기 |
| `/baseline` | 최초 종합분석: 60일 일별 조회, 30일 비교, 주간 지표, 주간/월간 유입 분리, 공개 홈 진단, 기존 제안, 원자료 목록 |
| `/admin/import` | JSON 업로드 → 서버 검증 → 미리보기 → 저장 → DB 재조회 확인. 원자료 XLSX/CSV 등록 |
| `/admin/integration` | Aside 연결 상태(처음은 ‘자동화 미연결’), 수집 이력, 연결 등록, API 안내 |

## API

| 메서드/경로 | 인증 |
|---|---|
| `GET /api/reports?type=weekly\|baseline&year=` | 관리자 세션 |
| `GET /api/reports/{reportId}` (ETag) | 관리자 세션 또는 수집 토큰 |
| `PUT /api/reports/{reportId}` | 관리자 세션(Origin 검사) 또는 수집 토큰 |
| `GET /api/reports/{reportId}/export?kind=channels\|keywords\|posts\|daily` | 관리자 세션 |
| `POST /api/import/preview` | 관리자 세션 |
| `POST /api/collection-runs`, `PATCH /api/collection-runs/{runId}` | 수집 토큰 |
| `GET /api/collection-runs` | 관리자 세션 |
| `GET/POST /api/sources`, `GET /api/sources/{sourceId}` | 관리자 세션 |
| `GET/PUT /api/integration` | 관리자 세션 |

- 수집 토큰: `Authorization: Bearer <REPORT_INGEST_TOKEN>` (SHA-256 후 일정 시간 비교, 실패 사유 비공개).
- 저장 규칙: canonical JSON(키 정렬, 배열 순서 보존) SHA-256. 동일 해시 → `unchanged`(리비전 추가 없음). 신규는 `If-None-Match: *`, 교체는 `If-Match: "<ETag>"` + 이전 해시 조건의 원자적 UPDATE. 수집 토큰은 `X-Report-Correction: true` 없이 다른 내용을 덮어쓰지 않음(409).
- 오류: 400 파싱, 401, 403, 409/412 충돌, 413(2MB 초과), 415, 422 검증, 428 전제조건 누락, 429 제한, 500.
- 모든 응답 `Cache-Control: private, no-store`. 페이지는 전부 요청 시 서버 렌더링(정적 export·ISR 없음).

## 명령어

```sh
cd app
npm install            # lockfile 기준 설치
npm run dev            # 개발 서버 http://127.0.0.1:3000 (127.0.0.1에만 바인딩)
npm run build          # 프로덕션 빌드
npm start              # 빌드 결과 실행(127.0.0.1:3000)
npm test               # 단위 테스트(Vitest)
npm run lint           # 타입 검사(tsc)
```

로컬 Supabase(Docker 필요)로 DB·종단 테스트까지 돌리는 순서:

```sh
npm run db:start                        # 로컬 Supabase 시작 + 마이그레이션 적용
npx supabase status -o env              # 로컬 URL/키 확인 → .env.local 작성(아래 표 참고)
npm run test:db                         # RLS·권한·트리거·동시성 테스트(LOCAL_DB_URL 필요)
npm run build && npm run test:e2e       # 종단 테스트: 로컬 DB를 초기화하고 테스트 계정을 만든다
npm run check:bundle                    # 번들·서버 로그에 비밀값/보고서 문자열이 없는지 점검
```

`.env.local`(앱 설정, 커밋 금지): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `REPORT_INGEST_TOKEN`,
`APP_ORIGIN=http://127.0.0.1:3000`, `ALLOWED_BLOG_ID=ko372`, `MRK_DATA_DIR`.
`.env.e2e`(테스트 준비 전용, 앱은 읽지 않음, 커밋 금지): 로컬 `SUPABASE_SERVICE_ROLE_KEY`(테스트 계정 생성용), `LOCAL_DB_URL`.
`MRK_DATA_DIR`이 없으면 실제 데이터 테스트는 건너뛰고 합성 픽스처 테스트만 실행됩니다.
종단 테스트는 **로컬 DB를 초기화**하므로 운영 DB 주소로는 실행되지 않게 막아 두었습니다.

## 환경 설정 체크리스트 (형님이 직접 하실 일)

비밀값은 채팅·저장소·스크린샷에 붙여넣지 말고 서버 환경변수/비밀 저장소에만 입력하세요.

1. **Supabase 프로젝트 준비**: 새 프로젝트를 만들거나 기존 프로젝트를 고릅니다(요금제 확인).
2. **마이그레이션 적용**: `supabase/migrations/`의 두 파일을 순서대로 적용합니다.
   `npx supabase link --project-ref <프로젝트 ref>` 후 `npx supabase db push`, 또는 SQL Editor에 파일 내용을 차례로 실행.
3. **Auth 설정**: Authentication → Sign In / Providers에서 *Allow new users to sign up* **끄기**, Email 제공자는 **켜 둠**
   (Email을 끄면 로그인 자체가 불가). 비밀번호 최소 길이 12자 이상 권장.
4. **관리자 계정 생성**: Authentication → Users → *Add user*로 형님 계정을 만들고(자동 확인), 사용자 UUID를 복사.
5. **관리자 등록**: SQL Editor에서 `INSERT INTO public.report_admins(user_id) VALUES ('<복사한 UUID>');`
6. **환경변수 입력**(배포 환경 또는 `.env.local`):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`(또는 publishable 키),
   `APP_ORIGIN`(실제 사이트 주소, 예: `https://report.example.com`), `ALLOWED_BLOG_ID=ko372`. 서비스 역할 키는 필요 없습니다.
   API 자동 저장을 쓸 때만 `REPORT_INGEST_TOKEN`(32자 이상 무작위)을 넣고, 같은 값의 SHA-256 해시를
   `INSERT INTO public.blog_ingest_tokens(blog_id, token_sha256) VALUES ('ko372', encode(sha256(convert_to('<토큰>','UTF8')),'hex'));`로 등록합니다.
7. **배포 위치 결정**: 서버 실행이 되는 곳(Vercel·자체 서버 등)이어야 합니다. 정적 호스팅·GitHub Pages 불가.
   리버스 프록시 뒤라면 `X-Forwarded-For`를 프록시가 덮어쓰도록 설정하세요(로그인 IP 제한에 사용).
8. **첫 데이터 저장**: 로그인 → `/admin/import`에서 실제 `reports/` JSON 2개 업로드 → ‘저장 완료 · DB 재조회 확인됨’ 확인.
   원자료 XLSX/CSV는 필요할 때만 같은 화면에서 등록.
9. **Aside 연결(선택, 나중에)**: 사이트 주소·업로드 방식(UI 기본 / API) 결정 → Aside에서 7일 주기(한국시간 오전 9시, 대상은 최근 완료 월~일 주간) 루틴 생성 →
   `/admin/integration`에서 첫 실행일을 등록. 사이트 코드만으로는 수집이 예약·실행되지 않습니다.

## Aside 수집 흐름(API를 쓸 경우)

1. `POST /api/collection-runs` `{ expectedPeriodStart, expectedPeriodEnd, status: "running" }` → `runId`
2. `PUT /api/reports/{reportId}` + `If-None-Match: *` (본문 = 보고서 JSON 그대로)
3. `GET /api/reports/{reportId}`로 `contentHash` 확인
4. `PATCH /api/collection-runs/{runId}` `{ status: "succeeded", reportId }` — 저장된 보고서가 없으면 422
5. 네이버 로그인 해제 → `{ status: "needs_login", errorCode, safeMessage }`, 기타 실패 → `failed`. 기존 보고서는 유지됩니다.

## 보안 설계 요약

- 관리자 판정: 모든 서버 페이지/API에서 `auth.getUser()` + `report_admins` 소속 확인(프록시만 믿지 않음). 비관리자 로그인은 즉시 로그아웃.
- 서비스 역할 키를 쓰지 않습니다. 읽기는 사용자 세션(RLS), 쓰기는 `blog_*` DB 함수(SECURITY DEFINER)가 관리자 소속 또는 수집 토큰 해시를 DB 안에서 다시 확인한 뒤 수행합니다.
- RLS: anon 권한 없음, 비관리자 0행, 관리자 읽기만. 인증 클라이언트의 직접 쓰기·자가 관리자 등록 불가. 리비전은 추가 전용.
- CSRF: 세션 쓰기 요청은 `Origin == APP_ORIGIN`(없으면 `Sec-Fetch-Site: same-origin`) 필수.
- 요청 제한: 로그인(IP 20회/10분, 이메일 8회/15분), 수집 API(60회/시간)를 **DB 카운터**로 처리해 여러 서버 인스턴스에서도 공유됩니다. 제한 저장소 장애 시 거부(fail-closed). Supabase Auth 자체 제한도 함께 적용됩니다.
- 입력: 2MB 제한(413), Content-Type 확인, 실제 날짜·유한 숫자·기간·ID·산술 대조, http/https 외 URL·자격증명 포함 URL·토큰 쿼리·인증정보 문자열 거부. 렌더링은 React 이스케이프 텍스트만 사용.
- CSV: `= + - @ 탭 CR`로 시작하는 값 앞에 `'` 추가(수식 실행 방지), UTF-8 BOM.
- 헤더: CSP(`frame-ancestors 'none'`), `X-Frame-Options: DENY`, `noindex`, `Referrer-Policy: same-origin`.
- `DEMO_MODE`는 지원하지 않으며 `true`로 두면 설정 오류 화면이 나옵니다(익명 데모 노출 방지).

## 검증 현황(2026-09-29, 개발 컨테이너)

- 실행 완료: 타입 검사, 프로덕션 빌드, 단위 45건, 로컬 Supabase(Postgres 17) RLS·트리거 11건, Playwright 종단 20건, 번들·로그 점검.
- 미실행: 실제 운영 Supabase 프로젝트 적용·RLS 확인, 배포 환경 테스트, Aside 루틴 연결(모두 형님 설정 이후).
