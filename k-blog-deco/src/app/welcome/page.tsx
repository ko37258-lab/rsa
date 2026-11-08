import type { Metadata } from "next";
import { Suspense } from "react";
import { WelcomeClient } from "./welcome-client";

export const metadata: Metadata = { title: "처음 오셨나요? — MR.K-홈형 블로그 만들기" };

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomeClient />
    </Suspense>
  );
}
