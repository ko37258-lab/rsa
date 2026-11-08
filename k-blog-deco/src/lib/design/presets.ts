import type { FontKey } from "./fonts";
import type { PaletteT } from "./schema";

export type StylePreset = {
  id: string;
  name: string;
  description: string;
  palette: PaletteT;
  fonts: { heading: FontKey; body: FontKey };
  button: { radius: number; filled: boolean };
  keywords: string[];
};

/** 위저드의 '스타일 프리셋' — AI 에게는 힌트로, 템플릿 모드에서는 실제 색·폰트로 사용 */
export const PRESETS: StylePreset[] = [
  {
    id: "trust-navy",
    name: "신뢰 네이비",
    description: "부동산·법률·금융 전문가형. 깊은 네이비에 골드 포인트, 단단한 고딕.",
    palette: { primary: "#14284B", secondary: "#24467F", accent: "#C9A646", background: "#F4F6FA", surface: "#FFFFFF", text: "#111827", muted: "#6B7280" },
    fonts: { heading: "pretendard", body: "pretendard" },
    button: { radius: 8, filled: true },
    keywords: ["부동산", "중개", "법률", "세무", "금융", "컨설팅", "전문가", "신뢰", "강의", "교육", "블루", "네이비", "파랑"],
  },
  {
    id: "clean-white",
    name: "미니멀 화이트",
    description: "여백이 넉넉한 흰 바탕, 검은 타이포와 얇은 선. 어떤 업종에도 무난.",
    palette: { primary: "#111111", secondary: "#3F3F46", accent: "#E4572E", background: "#FFFFFF", surface: "#F5F5F4", text: "#111111", muted: "#71717A" },
    fonts: { heading: "pretendard", body: "pretendard" },
    button: { radius: 0, filled: false },
    keywords: ["미니멀", "깔끔", "심플", "모던", "화이트", "흰색"],
  },
  {
    id: "luxury-black",
    name: "럭셔리 블랙골드",
    description: "블랙 바탕에 샴페인 골드, 명조 제목으로 고급스러운 분위기.",
    palette: { primary: "#0E0E10", secondary: "#1E1E22", accent: "#D4B26A", background: "#121214", surface: "#1C1C20", text: "#F5F1E8", muted: "#A39E93" },
    fonts: { heading: "notoSerif", body: "pretendard" },
    button: { radius: 2, filled: false },
    keywords: ["고급", "럭셔리", "프리미엄", "명품", "블랙", "검정", "골드", "호텔", "분양"],
  },
  {
    id: "natural-beige",
    name: "내추럴 베이지",
    description: "따뜻한 베이지·우드톤, 부드러운 명조. 카페·인테리어·리빙.",
    palette: { primary: "#6B4F3A", secondary: "#A07E5F", accent: "#3F6B4F", background: "#F6F0E7", surface: "#FFFDF9", text: "#3B2F25", muted: "#8C7B6B" },
    fonts: { heading: "gowunBatang", body: "gowunDodum" },
    button: { radius: 999, filled: true },
    keywords: ["카페", "베이커리", "인테리어", "리빙", "내추럴", "감성", "베이지", "우드", "공방"],
  },
  {
    id: "soft-pastel",
    name: "소프트 파스텔",
    description: "연한 핑크·라벤더 파스텔에 둥근 버튼. 뷰티·육아·일상.",
    palette: { primary: "#E07A9A", secondary: "#B9A3E3", accent: "#7CC6B6", background: "#FFF6F8", surface: "#FFFFFF", text: "#4A3A44", muted: "#9C8A94" },
    fonts: { heading: "jua", body: "gowunDodum" },
    button: { radius: 999, filled: true },
    keywords: ["뷰티", "네일", "육아", "일상", "귀여운", "파스텔", "핑크", "분홍", "꽃"],
  },
  {
    id: "vivid-pop",
    name: "비비드 팝",
    description: "선명한 원색 대비와 굵은 제목. 이벤트·쇼핑·유튜버.",
    palette: { primary: "#1D4ED8", secondary: "#FACC15", accent: "#EF4444", background: "#FFFBEB", surface: "#FFFFFF", text: "#111827", muted: "#4B5563" },
    fonts: { heading: "blackHanSans", body: "pretendard" },
    button: { radius: 14, filled: true },
    keywords: ["팝", "선명", "쇼핑", "이벤트", "유튜브", "유튜버", "재미", "노랑", "빨강"],
  },
  {
    id: "editorial-serif",
    name: "에디토리얼 매거진",
    description: "잡지처럼 큰 명조 제목과 정돈된 그리드. 칼럼·여행·리뷰.",
    palette: { primary: "#1F2937", secondary: "#9A3412", accent: "#B45309", background: "#FAF7F2", surface: "#FFFFFF", text: "#1F2937", muted: "#6B7280" },
    fonts: { heading: "nanumMyeongjo", body: "notoSans" },
    button: { radius: 0, filled: false },
    keywords: ["매거진", "잡지", "칼럼", "여행", "리뷰", "에디토리얼", "책"],
  },
  {
    id: "fresh-green",
    name: "산뜻한 그린",
    description: "맑은 그린과 화이트, 건강하고 친근한 느낌. 병원·식품·교육.",
    palette: { primary: "#15803D", secondary: "#4ADE80", accent: "#F59E0B", background: "#F0FDF4", surface: "#FFFFFF", text: "#14532D", muted: "#4B6B57" },
    fonts: { heading: "doHyeon", body: "pretendard" },
    button: { radius: 12, filled: true },
    keywords: ["건강", "병원", "한의원", "식품", "농산물", "그린", "초록", "자연", "친환경"],
  },
];

export const findPreset = (id: string | null | undefined) => PRESETS.find((p) => p.id === id) ?? null;

export const MOOD_TAGS = ["미니멀", "고급스러운", "따뜻한", "신뢰감", "발랄한", "감성적인", "강렬한", "부드러운", "전문적인", "귀여운"];
