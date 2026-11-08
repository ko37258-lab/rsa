import { Suspense } from "react";
import { EditorClient } from "@/components/editor/editor-client";

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-ink-3">편집기를 여는 중…</div>}>
      <EditorClient />
    </Suspense>
  );
}
