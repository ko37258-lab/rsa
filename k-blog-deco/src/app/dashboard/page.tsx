import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { DashboardClient } from "./dashboard-client";

export default function DashboardPage() {
  return (
    <>
      <AppHeader />
      <Suspense>
        <DashboardClient />
      </Suspense>
    </>
  );
}
