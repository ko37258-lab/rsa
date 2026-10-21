# REA — 홈즈 PMS 역공학 분석 보고서

> 대상: `https://pms-kr.stag.homes.global/dashboard` (스테이징, 화면 제목 「홈즈 PMS」)
> 목적: 같은 업무 흐름을 유지한 채 **MR.K 관리 시스템**으로 다시 만들기 위한 구조 파악
> 방법: 로그인 없이 공개로 내려오는 프런트엔드 번들(JS 47개 · CSS 1개)을 내려받아 라우트·API 호출·화면 문구·상태 값을 추출했다. 서버 코드와 실제 데이터는 보지 않았다(로그인 필요).

---

## 1. 한 줄 요약

홈즈 PMS는 **코리빙·단기임대 지점의 호실 판매부터 상담, 전자계약, 월 청구, 은행 입금 맞추기, 퇴실 정산까지**를 한 화면 흐름으로 묶은 임대관리(Property Management) 웹앱이다. 프런트엔드는 React SPA, 데이터는 전부 `/api/*` JSON으로 오가며, 로그인은 회사 Google 계정(OAuth)이다.

## 2. 기술 스택 (번들에서 확인)

| 영역 | 사용 기술 | 근거 |
| --- | --- | --- |
| UI | React **19.3.0** | 번들 안 `version:"19.3.0"` |
| 라우팅 | TanStack Router (파일 기반, `$leaseId` 형식 경로) | `path:"leases/$leaseId"`, `validateSearch` |
| 서버 상태 | TanStack Query | `queryKey:[...]`, `queryFn` |
| 컴포넌트 | Base UI(+ shadcn 스타일 토큰) | `base-ui.com/production-error`, `--sidebar-*` 변수 |
| 스타일 | Tailwind CSS v4 | `--color-*` 토큰, 유틸리티 클래스 |
| 폰트 | DM Sans + Pretendard | CSS `font-family` |
| 날짜 | date-fns | `constructNow`, `compareAsc` 청크 |
| 엑셀 | SheetJS(xlsx) — 렌트롤 내보내기, 관리비 엑셀 올리기, 은행 거래내역 올리기 | `xlsx-*.js` 청크 |
| PDF | pdf.js — 서명된 계약서 사본 미리보기 | `pdf.worker.min-*.js` |
| 빌드 | Vite (코드 분할, `__vite__mapDeps`) | 파일명 해시 패턴 |
| 인증 | 회사 Google 계정 OAuth (`/api/auth/login?next=/`) | 로그인 버튼 「회사 Google 계정으로 로그인」 |
| 외부 연동 | **모두싸인**(전자계약), 메일 수신함(대화 · 첨부), 데이터 레이크(분석 집계, 하루 1회 내보내기), 이전 시스템 **빌딩케어** 관리비 엑셀 호환 | 화면 문구 |

## 3. 정보 구조(IA) · 메뉴

원본 사이드바(`ready:true`)와 경로:

| 메뉴 | 경로 | 상세 경로 | 핵심 기능 |
| --- | --- | --- | --- |
| 대시보드 | `/dashboard` (`/` → 리다이렉트, `/analytics` → `#occupancy`) | — | 오늘 현황 타일 + 분석(점유율·RevPAR·전환) |
| 호실 | `/units` (`/calendar` → `?view=calendar`) | `/units/$unitId` | 목록 · 배치도 · 달력, 호실 등록, 홀드/운영중지 |
| 상담 | `/inquiries` | `/inquiries/$inquiryId` | 입주문의/생활문의, 메일 대화, 투어, 방 추천 |
| 계약 | `/leases` | `/leases/$leaseId` | 계약 작성, 모두싸인, 렌트롤 엑셀, 연장 시 인상 상한 |
| 고객 | `/customers` | `/customers/$customerId` | 개인/법인, 개인정보 보존 기한 |
| 정산 | `/settle` (보기: 청구서·퇴실·잔금) | — | 월 청구 확인·발송, 퇴실 정산, 입금 맞추기 |
| (숨은 화면) 청구 · 수납 · 장부 | `/billing`, `/collections`, `/ledger` | — | 청구서 발송, 납부자별 미납, 거래 장부·매출 |
| 운영 준비 | `/readiness` | — | 이관 전 호실별 미수·미납·질문 확정 |
| 정합성 | `/integrity` (권한 `integrity_read`) | — | 데이터 검사 위반 건수 추이 |
| Q&A | `/qa` | — | 계약별 운영 질문 → 답 → 확정 |
| 운영정책 | `/policies` | — | 정책 코드·근거·판(version) |
| 응대 자료 | `/materials` | — | 정형 답변, 준비된 파일, 메일 서명 |
| UI 갤러리 | `/ui` | — | 개발용 컴포넌트 모음 |

빠른 작업(명령 팔레트): 「호실 등록」, 「계약 작성」, 「직접 청구」.

## 4. API 카탈로그 (프런트엔드가 부르는 경로)

### 4.1 공통 · 인증
`GET /api/me` · `GET /api/branches` · `GET /api/codes`(라벨 사전) · `GET /api/alerts?branch_id` · `GET /api/auth/outcomes` · `POST /api/auth/logout` · `GET /api/auth/login?next=/`

### 4.2 호실
`GET /api/units?branch_id[&period_start]` · `GET /api/units/{id}` · `GET /api/units/{id}/history` · `GET /api/units/{id}/asking-prices` · `GET|POST /api/units/{id}/blocks` · `GET /api/branches/{id}/buildings` · `GET /api/branches/{id}/unit-types` · `GET /api/branches/{id}/unit-views` · `GET /api/branches/{id}/calendar?from&to`

### 4.3 상담
`GET /api/inquiries?branch_id[&include_unplaced]` · `POST /api/inquiries` · `GET /api/inquiries/{id}?purpose` · `GET /api/inquiries/{id}/conversations` · `GET /api/inquiries/{id}/drafts` · `GET /api/inquiries/{id}/history` · `GET /api/inquiries/{id}/leases` · `GET /api/inquiries/{id}/parties` · `GET|POST /api/inquiries/{id}/tours` · `GET /api/inquiries/holds` · `POST /api/inquiries/matches` · `POST /api/parties/search` · `GET /api/conversations/unlinked` · `GET /api/conversation-inboxes` · `GET /api/conversations/mail-assets` · `POST /api/conversations/mail-html` · `GET /api/reply-templates` · `GET /api/reply-signatures` · `GET /api/prepared-files`

### 4.4 계약
`GET /api/leases?branch_id[&status][&open_only][&unit_id]` · `GET /api/leases/{id}` · `GET /api/leases/{id}/ledger` · `GET /api/leases/{id}/history` · `GET /api/leases/{id}/parties` · `GET /api/leases/{id}/conversations` · `GET /api/leases/{id}/rent-cap` · `GET|PUT /api/leases/{id}/settlement` · `GET /api/leases/{id}/settlement/refund-account` · `GET /api/leases/{id}/signed-copies` · `POST /api/leases/{id}/signed-copies/uploads` · `GET /api/leases/rent-roll?branch_id[&masked]` · `GET /api/leases/sales-board?branch_id&on[&until]` · `GET /api/leases/branch-terms` · `GET /api/leases/amount-methods` · `GET /api/leases/settlements?lease_id=…` · `GET /api/leases/modusign/status` · `GET /api/leases/modusign/documents[/{id}[/file]]`

### 4.5 청구 · 수납 · 장부
`GET /api/billing?branch_id&month` · `POST /api/billing/preview` · `GET /api/billing/bill-form` · `GET /api/billing/book` · `GET /api/billing/revenue` · `GET /api/billing/history` · `GET /api/billing/invoices/{id}` · `GET /api/billing/invoices/history` · `GET /api/billing/leases/{id}` · `GET /api/billing/leases/{id}/gaps` · `GET /api/billing/payers?branch_id` · `GET /api/billing/payers/{id}[/history]` · `GET /api/billing/receipts?branch_id` · `GET /api/billing/receipts/page` · `GET /api/billing/bank-deposits/suggestions` · `GET /api/billing/bank-deposits/{id}/original` · `GET /api/billing/bank-format` · `GET /api/billing/branch-accounts`

### 4.6 운영 · 분석
`GET /api/dashboard` · `GET /api/analytics` · `GET /api/readiness` · `GET /api/qa?branch_id` · `GET /api/qa/contracts` · `GET /api/qa/policies` · `GET|POST /api/{kind}s/{id}/memos`

## 5. 도메인 모델

```
지점 Branch ─┬─ 건물 Building
             ├─ 룸타입 UnitType (정가 월세·관리비)
             └─ 호실 Unit ── 일정 블록 UnitBlock(홀드·운영중지)
고객 Party(개인/법인) ─┬─ 상담 Inquiry ── 메시지 · 투어
                      └─ 계약 Lease(계약자 · 납부자)
계약 Lease ── 청구 Charge ── 배분 Allocation ── 입금 Payment
          └─ 정산 Settlement(보증금 − 미납 − 차감 = 반환)
운영: Q&A · 운영정책 Policy · 응대 자료(정형 답변·파일·서명) · 메모 · 이력
```

### 5.1 상태 흐름

**계약** (`status`): `draft`(작성 중) → `awaiting_signature`(서명 대기, 모두싸인) → `concluded`(체결) → `move_in_confirmed`(입주 일정 확정) → `occupied`(거주 중) → `closing`(퇴실·정산 중) → `closed`(끝남). 어느 단계든 `cancelled`/`rejected`.
화면 보조 문구: 「서명 완료 · 계약금 대기」, 「잔금 대기」, 「입주 일정 미정」, 「서명 완료 · 방 겹침」, 「반환 대기」, 「퇴실함 · 정산 중」.

**상담 단계**: 문의 → 투어 → 계약 작성 → 서명 요청 → 체결, 또는 결렬(사유 기록). 생활문의는 입주자 문의로 따로 분류.

**청구**: 발송 대기 → (확인·청구서 번호 고정) → 메일 예약(청구일 9시) → 발송 완료 / 재발송 대기. 「고지서 금액 필요」(관리비 고지서 금액이 들어와야 확정).

**입금**: 은행 엑셀 → 추천 매칭 → 맞춤(배분) / 수납 아님 / 재배분 / 입금 잔액을 청구서에 넣기. 플랫폼 수수료·「홈즈 몫 아님」(pass-through) 줄 구분.

### 5.2 청구 규칙(화면 설명문에서 추출)
- 선불은 그 달치를 직전 청구일에, 후불은 지난 달치를 다음 청구일에 청구. 고지서 청구는 늘 후불.
- 청구일이 그 달에 없으면 말일. 첫 달·마지막 달은 실제 일수로 일할.
- 부가세: 별도 / 포함 / 비과세(없음). 법인은 공급가 + 부가세.
- 연장 시 임대료 인상: 연장 시작이 1년 지났으면 **5% 이내 인상 가능**(상한 표시), 아니면 인상 불가 — 주택임대차보호법 5% 상한 반영.

## 6. 대시보드 지표 정의(원문 그대로)

| 지표 | 정의 |
| --- | --- |
| 점유율 | 운영 호실-일 중 실제 거주한 호실-일 |
| 계약율 | 체결 이후 계약(입주 예정 포함)이 덮는 호실-일 비율 |
| RevPAR | 월세 매출 ÷ 운영 호실 |
| AMR | 계약 호실 평균 **정가** 월세 |
| 매출 | 사용 기간의 달에 인식, 계약금·잔금(보증금 등 돌려줄 돈) 제외 |
| 공실 손실 | 운영 중인데 계약 없는 호실-일 × 룸타입 정가 중앙값 ÷ 그 달 일수 |
| 앞으로 90일 | 지금 잡힌 계약(서명 대기 포함)이 앞으로의 운영 호실-일을 얼마나 채우는지 |
| 전환 깔때기 | 한 번이라도 그 단계에 간 문의 수, 오른쪽 %는 바로 앞 단계 대비 |
| 첫 답장 | 접수부터 처음 보낸 메시지까지(전화로만 답하면 「답장 기록 없음」) |
| 문의 1건의 값 | 체결 계약의 정가 월세 × 계약 기간 ÷ 문의 수 |
| 요일·시간별 접수 | 지점 시간대, 업무 시간 평일 9~18시 |

오늘 현황 타일: **호실**(오늘 판매 가능 · 이번 주 입주 · 이번 주 만료) / **상담**(답장 대기 · 담당 없음 · 진행 중) / **계약**(서명 대기 · 입주 일정 미정 · 입주일 지남) / **청구**(보낼 청구서) / **수납**(연체 · 안 맞춘 입금) + 오늘 입주 목록.

## 7. 화면 설계 특징

- 목록 → 오른쪽 **엿보기 패널**(peek) → 전체 상세 페이지의 3단 구조. URL 쿼리에 보기·필터·정렬·선택 행을 모두 저장(`?view=&filters=&sort=&lease=`).
- 문구가 짧고 평이한 반말 서술형(「조건에 맞는 계약이 없다」, 「청구서를 만들었다」).
- 개인정보 보존 기한, 마스킹(`masked=true`) 고려.
- 지점 단위 권한·데이터 분리, 「이 지점 / 전 지점」 전환.

## 8. MR.K 관리 시스템 — 무엇을 그대로 두고, 무엇을 바꾸나

| 구분 | 원본 홈즈 PMS | MR.K 관리 시스템 |
| --- | --- | --- |
| 경로 · API | `/api/*` | **같은 경로 유지** → 나중에 실제 백엔드를 그대로 붙일 수 있다(`VITE_API_BASE`) |
| 데이터 | 서버 + 로그인 필수 | 기본은 **브라우저 안 Mock API**(시연 데이터 3개 지점 · 96호실) — 설치 없이 바로 시연 |
| 메뉴 | 정산 화면 하나에 청구·수납 겹침 | **청구 · 수납 · 정산 · 장부** 4개로 분리해 「돈」 그룹으로 정리 |
| 대시보드 | 현황 + 분석 | 현황 + 분석 + **MR.K 인사이트**(규칙 기반 자동 브리핑: 공실 손실 큰 룸타입, 답장 지연, 연체 위험, 만료 임박, 효율 좋은 유입경로) |
| 전 지점 | 지점 전환 | 전 지점일 때 **지점 비교표** 추가 |
| 화면 | 데스크톱 중심 | **휴대폰 폭(400px)까지 반응형**, 라이트·다크 테마 |
| 정합성 | 레이크 기반 일 단위 실행 | 화면에서 **즉시 검사 · 다시 검사** |
| 브랜드 | 홈즈 | MR.K (네이비 + 브라스) |

### 원본 기능 대조표 (2차: 원본 수준)

외부 서비스가 꼭 필요한 기능은 **같은 업무를 화면 안에서 끝낼 수 있는 대체 기능**으로 만들었다. API 경로는 원본과 같게 두었으므로, 나중에 실제 연동을 붙일 때 화면은 거의 그대로 쓴다.

| 원본 기능 | MR.K | 비고 |
| --- | --- | --- |
| 대시보드 현황·분석(점유율·RevPAR·AMR·공실 손실·전환·유입경로·요일×시간) | ✅ | + MR.K 인사이트, 지점 비교 |
| 호실 목록·배치도·달력, 등록, 홀드·운영중지 | ✅ | |
| 배치 편집(칸 옮기기·넓히기·열 비우기) `unit-views` | ✅ | |
| 판매 현황판(기간별 빈 방) `sales-board` | ✅ | |
| 모집가 이력 `asking-prices` | ✅ | |
| 룸타입·호실 일괄 등록 | ✅ | "101-110, B01" 범위 입력 |
| 상담 접수·같은 연락처 찾기·단계·결렬·투어·추천 방·홀드 | ✅ | |
| 메일 수신함 · 미연결 대화 `conversations/unlinked` | 🔁 대체 | **대화 붙여넣기 + 미연결 대화함**(상담·계약에 붙이기, 문의로 만들기) |
| 메일에서 조건 읽기 `inquiries/:id/drafts` | ✅ | 규칙 기반: 입주일·기간·예산·인원·연락처·첫 문장 |
| 답장(정형 답변·서명 한/영·첨부) | 🔁 대체 | 기록 + 메일 앱으로 보내기 + 본문 복사 |
| 계약 작성·상태 흐름·렌트롤(엑셀) | ✅ | |
| 지점 계약 조건 `branch-terms` · 청구 방식 `amount-methods` | ✅ | 입주일/달력 주기, 선불/후불, 일할, 납기, 관리비 고지서, 할인 |
| 연장 시 5% 인상 상한 `rent-cap` | ✅ | 넘으면 사유 필수 |
| 모두싸인 전자계약 | 🔁 대체 | **계약서 A4 인쇄·PDF 저장 + 서명본 올리기**(올리면 체결 처리) |
| 계약 당사자 여러 명 `leases/:id/parties` · 계약 대화 | ✅ | |
| 청구서 만들기(일할·선불/후불) · 확인(번호 고정)·확인 취소 · 메일 예약(청구일 9시)·재발송 | ✅ | 메일 발송은 시연용 처리(실서버에서 SMTP·알림톡 연결) |
| 고지서 금액 필요 · 관리비 엑셀(빌딩케어 양식) `bill-form` | ✅ | 양식 내려받기 → 올리기 → 미리 보기 → 반영 |
| 청구 빠진 기간 `billing/leases/:id/gaps` | ✅ | 빠진 청구 만들기 |
| 은행 거래내역 엑셀 · 입금 추천 `bank-deposits/suggestions` | ✅ | CSV(EUC-KR)·xlsx·HTML .xls, 머리글 자동 인식 |
| 재배분 · 입금 잔액을 청구에 넣기 · 플랫폼 수수료 · 홈즈 몫 아님 | ✅ | |
| 청구서 인쇄 | ✅ | A4, 일할 표시, 지난 미납 이월 |
| 퇴실 정산 · 환불 계좌 | ✅ | |
| 장부·매출·지점 수수료 | ✅ | 장부 엑셀 |
| 운영 준비 · 정합성 · Q&A(계약별) · 운영정책 · 응대 자료 | ✅ | |
| 명령 팔레트(빠른 작업) | ✅ | Ctrl/⌘+K 통합 검색 |
| 권한별 메뉴(`integrity_read`) | ✅ | |
| 회사 Google 로그인 | ⏳ 서버 필요 | 실서버 연결 때 `/api/auth/login` 그대로 사용 |
| 데이터 레이크 | ➖ 불필요 | 대시보드가 바로 계산 |

### 실사용(10세대 바로 운영)
- 설정 → **빈 상태로 시작**: 회사·지점·계좌 → 계약 조건 기본값 → 룸타입 → 호실 번호 범위 → 시작.
- 데이터는 그 브라우저의 IndexedDB 에 저장된다(용량 한도 사실상 없음). **설정 → 백업**으로 파일을 내려받아 보관하고, 다른 PC에서는 불러오기로 옮긴다.
- 여러 사람·여러 기기가 같은 데이터를 보려면 다음 단계(서버 연결)가 필요하다.

## 9. 다음 단계 제안
1. 공유 저장소: Supabase(Postgres + 로그인 + 파일 보관) 또는 기존 홈즈 서버(`VITE_API_BASE`)에 연결 → 여러 기기·직원이 같은 데이터.
2. 로그인: Google OAuth(원본과 동일) 또는 카카오 로그인.
3. 실제 발송: 청구서 메일(SMTP) · 카카오 알림톡, 모두싸인 API.
4. MR.K 인사이트에 LLM 요약(주간 지점 브리핑 메일)을 붙인다.
