import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { Button, Dialog, useToast } from "@/components/ui";

/**
 * 문구 복사 버튼. 클립보드 쓰기는 누른 순간에 해야 하고, 막힌 환경에서는
 * 글을 골라 둔 상자를 띄워 직접 복사하게 한다.
 */
export function CopyTextButton({ text, label = "카톡 문구 복사", size = "sm", variant = "secondary", icon }: { text: () => string; label?: string; size?: "sm" | "md"; variant?: "secondary" | "ghost" | "primary"; icon?: ReactNode }) {
  const toast = useToast();
  const [fallback, setFallback] = useState<string | null>(null);
  return (
    <>
      <Button
        size={size}
        variant={variant}
        icon={icon ?? <Copy className="size-3.5" />}
        onClick={() => {
          const t = text();
          try {
            navigator.clipboard.writeText(t).then(
              () => toast.show("문구를 복사했다 · 카톡 대화창에 붙여 넣는다", "good"),
              () => setFallback(t),
            );
          } catch {
            setFallback(t);
          }
        }}
      >
        {label}
      </Button>
      {fallback !== null && <SelectableText text={fallback} onClose={() => setFallback(null)} />}
    </>
  );
}

function SelectableText({ text, onClose }: { text: string; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <Dialog open onClose={onClose} title="문구 복사" description="이 화면에서는 자동 복사가 막혀 있다. 글이 골라져 있으니 길게 누르거나 Ctrl+C 로 복사한다." footer={<Button onClick={onClose}>닫기</Button>}>
      <textarea id="copy-fallback" ref={ref} readOnly rows={Math.min(14, text.split("\n").length + 1)} className="field w-full font-mono text-[12.5px]" value={text} onFocus={(e) => e.currentTarget.select()} />
    </Dialog>
  );
}
