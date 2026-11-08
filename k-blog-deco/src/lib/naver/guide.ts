import { NAVER_SPEC } from "./spec";
import type { BlogDesignT, MenuItemT } from "@/lib/design/schema";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 네이버 '위젯 직접등록'에 붙여넣을 HTML (이미지 + 링크) */
export function widgetHtml(item: Pick<MenuItemT, "label" | "link">, imageUrl: string, height: number): string {
  const href = item.link || "https://blog.naver.com/";
  return `<a href="${esc(href)}" target="_blank"><img src="${esc(imageUrl)}" width="${NAVER_SPEC.widget.width}" height="${height}" border="0" alt="${esc(item.label)}"></a>`;
}

export type GuideSection = { title: string; steps: string[] };

/** 내보낸 파일을 네이버 블로그에 적용하는 순서 (PC 스킨형) */
export function applyGuide(d: BlogDesignT): GuideSection[] {
  const n = d.menu.items.length;
  return [
    {
      title: "1. 준비 — 파일 받기",
      steps: [
        "이 페이지에서 '전체 ZIP 받기'로 이미지를 모두 내려받습니다.",
        `skin-background.png (${NAVER_SPEC.skinWidth}×${d.hero.height}), widget-1~${n}.png (각 ${NAVER_SPEC.widget.width}×${d.menu.itemHeight}), mobile-cover.png 가 들어 있습니다.`,
        "위젯 이미지는 '위젯 이미지 주소 만들기'를 누르면 인터넷 주소가 생기고 아래에 붙여넣을 코드가 완성됩니다.",
      ],
    },
    {
      title: "2. 레이아웃 정하기",
      steps: [
        "네이버 블로그 → 관리 → 꾸미기 설정 → 디자인 설정 → 레이아웃·위젯 설정으로 이동합니다.",
        "레이아웃은 '1단(가운데 본문)'을 고르면 홈페이지형 구성이 가장 깔끔합니다.",
        "기본 위젯(프로필, 카테고리 등) 중 필요 없는 것은 끕니다.",
      ],
    },
    {
      title: "3. 스킨 배경 적용",
      steps: [
        "디자인 설정 → 세부 디자인 설정(리모콘) → 스킨배경 → 직접등록을 엽니다.",
        "'상단 영역'에 skin-background.png 를 올리고, 정렬은 가운데·반복 없음으로 설정합니다.",
        `배경 색은 ${d.pageBackground} 로 지정하면 이미지 아래가 자연스럽게 이어집니다.`,
      ],
    },
    {
      title: "4. 타이틀 영역 맞추기",
      steps: [
        "리모콘 → 타이틀에서 블로그 제목 표시를 끄고, 디자인은 '사용 안 함(투명)'으로 둡니다.",
        `영역 높이는 ${d.layout.titleHeight}px 로 맞춥니다. (스킨 이미지의 문구가 이 영역 안에 보이도록 설계되어 있습니다)`,
        d.layout.showMenuBar
          ? "블로그 메뉴(상단 메뉴 바)는 켜 둡니다."
          : "리모콘 → 블로그 메뉴에서 상단 메뉴 바를 숨김으로 바꿉니다.",
      ],
    },
    {
      title: "5. 버튼(위젯) 등록",
      steps: [
        "레이아웃·위젯 설정 → 하단의 '위젯 직접등록'을 누릅니다.",
        `버튼마다 위젯 이름(예: 메뉴1)을 정하고, 아래 코드 박스의 코드를 한 개씩 붙여넣습니다. (총 ${n}개)`,
        "등록한 위젯을 본문 위쪽 영역으로 끌어다 놓고, 왼쪽부터 버튼 순서대로 배치한 뒤 '적용'을 누릅니다.",
      ],
    },
    {
      title: "6. 모바일 커버",
      steps: [
        "네이버 블로그 앱 → 내 블로그 → 홈편집 → 커버 이미지에서 mobile-cover.png 를 등록합니다.",
        "PC 스킨·위젯은 모바일 앱에는 보이지 않으므로, 모바일은 커버 이미지와 블로그 소개글로 꾸밉니다.",
      ],
    },
    {
      title: "참고",
      steps: [
        "네이버 블로그 관리 화면은 수시로 바뀔 수 있습니다. 메뉴 이름이 다르면 '리모콘', '위젯 직접등록'을 찾아 같은 순서로 진행하세요.",
        "위젯 이미지 주소는 이 서비스 서버에 저장됩니다. 서버를 옮기거나 오래 보관하려면 이미지를 내 블로그 비공개 글에 올리고, 그 이미지 주소로 코드의 src 를 바꿔도 됩니다.",
      ],
    },
  ];
}
