/**
 * 네이버 블로그 PC '홈페이지형' 구성 수치.
 *
 * ⚠️ 네이버는 블로그 스킨·위젯을 바꾸는 공개 API 를 제공하지 않으며, 아래 수치도 공식 문서가 아닌
 *    블로그 관리 화면(리모콘·레이아웃 설정)과 실무 자료 기준입니다. 네이버 화면이 바뀌면 이 파일만 고치세요.
 */
export const NAVER_SPEC = {
  /** 블로그 본문(타이틀 포함) 가로 폭 */
  contentWidth: 966,
  /** 타이틀 영역 높이 범위 — 리모콘 > 타이틀 > 영역 높이 */
  titleHeight: { min: 50, max: 300, default: 300 },
  /** 위젯 직접등록 이미지 크기 — 가로 170 고정, 세로 최대 600 */
  widget: { width: 170, maxHeight: 600, minHeight: 30 },
  /** 스킨 배경(상단 이미지) 가로 폭 — 와이드 모니터에서도 좌우가 비지 않도록 */
  skinWidth: 2000,
  /** 히어로(스킨 상단 이미지) 세로 */
  heroHeight: { min: 200, max: 1200, default: 520 },
  /** 블로그 상단 메뉴 바(카테고리/프롤로그 메뉴) 대략 높이 — 미리보기용 */
  menuBarHeight: 42,
  /** 모바일 커버(정사각) */
  mobileCover: { width: 1080, height: 1080 },
  /** 한 줄에 놓을 수 있는 최대 위젯 수 (966 / 170) */
  maxWidgetsPerRow: 5,
} as const;

/** 스킨 이미지 안에서 966 본문 칼럼이 시작되는 x 좌표 (가운데 정렬) */
export const skinContentOffset = (skinWidth: number = NAVER_SPEC.skinWidth) =>
  Math.round((skinWidth - NAVER_SPEC.contentWidth) / 2);
