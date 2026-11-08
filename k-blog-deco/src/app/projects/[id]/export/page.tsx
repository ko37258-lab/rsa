import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { ExportClient } from "./export-client";

export default function ExportPage() {
  return (
    <>
      <AppHeader />
      <Suspense>
        <ExportClient />
      </Suspense>
    </>
  );
}
