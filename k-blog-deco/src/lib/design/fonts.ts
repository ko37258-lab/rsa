/** 디자인에 쓸 수 있는 한글 웹폰트 (모두 SIL OFL 무료 라이선스, npm 으로 자체 호스팅) */
export const FONT_KEYS = [
  "pretendard",
  "notoSans",
  "gowunDodum",
  "blackHanSans",
  "doHyeon",
  "jua",
  "nanumMyeongjo",
  "gowunBatang",
  "notoSerif",
  "nanumPen",
] as const;

export type FontKey = (typeof FONT_KEYS)[number];

export const FONTS: Record<
  FontKey,
  { family: string; label: string; weights: number[]; mood: string }
> = {
  pretendard: { family: "Pretendard Variable", label: "프리텐다드 (모던 고딕)", weights: [400, 500, 600, 700, 800, 900], mood: "깔끔·모던·전문적" },
  notoSans: { family: "Noto Sans KR", label: "본고딕", weights: [400, 700, 900], mood: "표준·신뢰감" },
  gowunDodum: { family: "Gowun Dodum", label: "고운돋움", weights: [400], mood: "부드러움·감성" },
  blackHanSans: { family: "Black Han Sans", label: "검은고딕", weights: [400], mood: "강렬한 제목용" },
  doHyeon: { family: "Do Hyeon", label: "도현", weights: [400], mood: "둥근·친근한 제목용" },
  jua: { family: "Jua", label: "주아", weights: [400], mood: "귀여움·발랄" },
  nanumMyeongjo: { family: "Nanum Myeongjo", label: "나눔명조", weights: [400, 700, 800], mood: "고전·격식" },
  gowunBatang: { family: "Gowun Batang", label: "고운바탕", weights: [400, 700], mood: "우아·감성 명조" },
  notoSerif: { family: "Noto Serif KR", label: "본명조", weights: [400, 700, 900], mood: "고급·에디토리얼" },
  nanumPen: { family: "Nanum Pen Script", label: "나눔손글씨 펜", weights: [400], mood: "손글씨·친근" },
};

export function nearestWeight(font: FontKey, weight: number): number {
  const ws = FONTS[font].weights;
  return ws.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), ws[0]);
}

export function cssFont(font: FontKey, weight: number, size: number): string {
  return `${nearestWeight(font, weight)} ${size}px "${FONTS[font].family}"`;
}
