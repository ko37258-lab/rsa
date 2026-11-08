import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "K 블로그 꾸미기 — AI 홈페이지형 블로그 제작",
  description:
    "레퍼런스 사이트·스크린샷·영상을 넣으면 AI 가 네이버 홈페이지형 블로그 스킨, 버튼 위젯, 모바일 커버를 만들어 드립니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
