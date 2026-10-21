import type { ReactNode } from "react";
import { cx } from "@/lib/format";
import type { Tone } from "@/lib/codes";

const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink2",
  navy: "bg-navy/10 text-navy",
  good: "bg-good/12 text-good",
  warn: "bg-warn/14 text-warn",
  bad: "bg-bad/12 text-bad",
  info: "bg-info/12 text-info",
  violet: "bg-violet/12 text-violet",
  brass: "bg-brass/14 text-brass",
};
const dots: Record<Tone, string> = {
  neutral: "bg-ink3",
  navy: "bg-navy",
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  info: "bg-info",
  violet: "bg-violet",
  brass: "bg-brass",
};

/** 상태 표시 알약. 색과 점 모양 둘 다로 상태를 알린다 */
export function Badge({ tone = "neutral", children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>
      {dot && <span className={cx("size-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}

/** 코드 맵(LEASE_STATUS 등)에서 바로 배지 만들기 */
export function CodeBadge({ code }: { code: { label: string; tone: Tone } | undefined }) {
  if (!code) return <Badge>—</Badge>;
  return <Badge tone={code.tone}>{code.label}</Badge>;
}
