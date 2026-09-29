# 사이트와 Aside 연결 계약 v1 (제안 규격)

이 문서는 앞으로 구현할 계약이다. 현재 실제 사이트/API/DB/예약 작업이 연결된 상태는 아니다.

## 데이터 흐름
1. 형님 사이트의 인증된 관리자가 `reports/*.json`을 업로드한다.
2. 서버가 스키마와 추가 규칙을 검증하고 PostgreSQL에 저장한다.
3. 인증된 독자는 DB의 보고서 목록에서 과거 주차와 최신 완료 주차를 조회한다.
4. 향후 사이트 연결을 완료하면 Aside가 사용자의 승인된 주기로 네이버 통계를 확인하고 동일 형식 JSON을 만든다.
5. 기본 연결은 관리자 JSON 업로드 UI다. API를 연결할 경우 별도 서버 토큰으로 전달한다.
6. Aside가 저장 ACK 또는 보고서 상세 화면을 확인한 뒤에만 완료 알림을 보낸다.

웹사이트 자체가 네이버 계정 비밀번호·쿠키를 보관하거나 수집 크론을 실행할 필요는 없다. Aside 사용 가능 환경과 네이버 로그인 상태는 별도 운영 의존성이다. 항상 실행된다고 보장하지 않는다.

## 라우트
| 메서드/경로 | 기능 | 인증 |
|---|---|---|
| GET /api/reports | 주간 목록 또는 baseline 목록 | 관리자 세션 |
| GET /api/reports/{reportId} | 저장된 payload·메타데이터와 ETag | 관리자 세션 또는 ko372 전용 수집 토큰 |
| PUT /api/reports/{reportId} | 새 보고서 저장 또는 확인된 수정 | 관리자 세션 또는 ko372 전용 수집 토큰 |
| POST /api/collection-runs | 수집 시작/실패/로그인 필요 이력 등록 | 수집 토큰 |
| PATCH /api/collection-runs/{runId} | 수집 종료 결과 기록 | 수집 토큰 |
| GET /api/collection-runs | 관리자 수집 이력 | 관리자 세션 |
| GET /api/sources/{sourceId} | 등록된 원자료 다운로드 | 관리자 세션 |

- machine 인증: `Authorization: Bearer <REPORT_INGEST_TOKEN>` 형식. 실제 토큰은 이 패키지에 없다.
- 세션 쓰기는 Origin/CSRF 검증. machine 쓰기는 쿠키에 의존하지 말고 토큰만 검증.
- 토큰은 충분히 긴 무작위 값으로 서버 환경/비밀 저장소에만 둔다. 서버는 해시 후 일정 시간 비교 방식을 사용하고 인증 실패 이유를 상세 노출하지 않는다.
- 수집 토큰으로 다른 blogId에 접근할 수 없다. 현재 허용 blogId는 ko372 하나.
- 모든 private 응답은 `Cache-Control: private, no-store`. 소스 파일을 public 디렉터리에 복사하지 않는다.
- GET 목록은 `report_type=weekly`, `period_end DESC`로 최신을 구한다. baseline은 별도 조회.

## 요청 본문
PUT 본문은 `contracts/report.schema.json`을 만족하는 **보고서 자체**다. reports 파일을 그대로 전송할 수 있어야 한다.

추가 검증:
- weekly: `reportId = blogId + '_' + period.start + '_' + period.end`.
- 기간은 시작일·종료일 포함 정확히 7일, 비교 구간도 7일이며 현재 직전 7일.
- traffic/content/audience.period가 주간 본문 period와 동일해야 한다.
- baseline: `reportId = blogId + '_baseline_' + observedOn`.
- schemaVersion 미지원은 거부하고 임의 변환하지 않는다.
- ISO 날짜는 실제 존재하는 날짜인지 검증한다. 모든 숫자는 유한값이어야 한다.
- metrics.id 중복 금지. 필수 취합 지표를 수집하지 못했으면 실패/한계로 표시하고 0으로 채워 성공 보고서를 만들지 않는다.
- current/previous, change, changePercent를 서버에서 대조한다. relative change는 이전 값이 0이면 null.
- percent 단위의 change는 퍼센트포인트다. 평균 시간은 seconds 단위.
- 키워드와 경로 비중의 분모가 다를 수 있으므로 게시물 조회수에 곱해 임의 유입 건수를 만들지 않는다.
- 네이버 반올림 오차를 허용하되 허용 기준을 명시하고 경고를 보여준다. 경로 20개의 합계 100.01%는 정상 사례다.
- daily.date 중복 금지. 주간 순방문자는 daily.uniqueVisitors를 더한 값으로 덮어쓰지 않는다.
- rankedViews는 posts.pageViews 합계와 일치. blogPageViews와 다르면 경고를 유지하고 강제로 합계를 맞추지 않는다.
- 실제 없는 기사 URL은 생성하지 않는다. postUrl=null은 정상이다.
- 업로드 출처 문자열은 신뢰할 수 없는 텍스트로 처리. http/https가 아닌 링크는 거부.
- JSON 문자열 전체를 저장·표시할 때 인증정보, URL authCode/token/cookie/authorization 등은 허용하지 않으며 안전한 사유만 기록한다.

## 멱등성과 충돌 방지
- payload의 키 순서를 재귀적으로 정렬한 canonical JSON을 만든 뒤 SHA-256 해시를 계산한다. 배열 순서는 보존한다.
- reportId를 DB의 PRIMARY KEY로 사용한다.
- 신규 생성: `If-None-Match: *`. 이미 존재하면 412로 알린다.
- 동일 hash 재전송: 성공 상태 `unchanged`. 중복 report/revision을 만들지 않는다.
- 다른 내용으로 기존 ID 교체: 관리자 미리보기·확인을 거친 뒤 최신 ETag를 `If-Match`로 보낸다.
- machine 작업은 명시적인 정정 작업이 아니라면 기존의 다른 payload를 자동 덮어쓰지 않고 충돌을 보고한다.
- DB 수정은 이전 hash와 일치하는 행에 한정한 원자적 UPDATE. 경쟁 쓰기 중 한 건만 성공해야 한다.
- DB 트리거가 변경 payload를 report_revisions에 남긴다. 감사 이력이 남지 않는 교체 금지.
- 서비스 역할 키로 UPDATE할 때 updated_at을 실제 저장 시각으로 갱신. observed_on은 데이터에 기록된 관측일을 그대로 유지.

성공 응답 예시 형태(실제 호출 결과가 아님):
```json
{
  "ok": true,
  "result": "created",
  "reportId": "ko372_2026-09-21_2026-09-27",
  "savedAt": "<server ISO timestamp>",
  "contentHash": "<server SHA-256>",
  "reportPath": "/reports/ko372_2026-09-21_2026-09-27"
}
```

오류: 400 JSON 파싱 실패, 401 미인증, 403 권한 없음, 409/412 충돌, 413 크기 초과, 422 검증 실패, 429 제한, 500 저장 실패. 로그에 Authorization 헤더·비밀키·원시 네이버 페이지를 남기지 않는다.

## 수집 상태와 최신성
- 최초 연결 상태는 `unconfigured`. 예정일이나 현재 진행 중인 수집을 가짜로 채우지 않는다.
- 실제 사이트 연결 뒤 사용자가 정한 첫 실행일을 기준으로 7일마다 한국시간 오전 9시를 기본안으로 사용.
- 대상은 네이버 native 주간(월~일) 중 마지막 완료 주간과 그 직전 주간. 7일 주기 실행과 집계 구간 정의를 분리한다.
- 보고서의 `observedOn`, 기간 종료일, 사이트 `savedAt`, 수집 작업 `finishedAt`을 구분한다.
- 수집 시작 시 running. DB 보고서 저장 검증 후 succeeded. 네이버 로그인 해제는 needs_login, 기타 실패는 failed.
- 성공한 기존 보고서는 실패 때문에 삭제하거나 0으로 덮어쓰지 않는다.
- 실패 사유는 짧은 코드와 안전한 한국어 메시지로만 저장.
- 웹 UI는 수집된 이력만 표시한다. 자동 루틴 실행이 실제 연결되지 않았다면 '자동 수집 준비됨'을 '자동 수집 중'으로 표현하지 않는다.

## 연결 시 형님께 필요한 정보
1. 실제 사이트 주소와 관리자 로그인/업로드 경로.
2. 업로드 방식 선택: UI(기본) 또는 검증된 API.
3. API인 경우 비밀값은 안전한 환경변수/비밀 저장소로 전달. 채팅 본문에 붙여넣도록 요구하지 않는다.
4. 첫 주간 실행일. 루틴은 Aside에서 연결 완료 뒤 생성하고 중복 여부를 확인한다.
5. 게시/배포, 요금 발생, 반복 AI 실행은 각각 해당 승인을 지킨다. 이 문서는 이를 자동으로 수행하는 설정 파일이 아니다.
