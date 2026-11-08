import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { WizardClient } from "./wizard-client";

export default function NewProjectPage() {
  return (
    <>
      <AppHeader />
      <Suspense>
        <WizardClient />
      </Suspense>
    </>
  );
}
