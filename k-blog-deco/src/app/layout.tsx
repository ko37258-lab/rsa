import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MR.K-홈형 블로그 만들기 — AI 네이버 홈페이지형 블로그",
  description:
    "참고할 사이트·캡처·영상을 넣으면 AI 가 네이버 홈페이지형 블로그 스킨, 버튼 위젯, 모바일 커버를 만들어 드립니다. MR.K 회원 전용.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
