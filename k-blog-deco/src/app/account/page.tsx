import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { AccountClient } from "./account-client";

export const metadata: Metadata = { title: "계정 — MR.K-홈형 블로그 만들기" };

export default function AccountPage() {
  return (
    <>
      <AppHeader />
      <Suspense>
        <AccountClient />
      </Suspense>
    </>
  );
}
