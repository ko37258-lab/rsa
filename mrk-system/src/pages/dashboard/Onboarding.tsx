import { CheckCircle2, Circle } from "lucide-react";
import { LinkButton, Section } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { cx } from "@/lib/format";
import type { SetupStatus } from "@/mock/handlers/platform";

/** 호실이 하나도 없을 때(빈 지점) — 차트 대신 첫걸음을 보여준다 */
export function NoUnits() {
  return (
    <Section title="호실을 등록하면 오늘 현황이 채워진다" hint="호실·계약이 생기면 판매 가능, 연체, 청구서 같은 숫자가 여기에 모인다.">
      <div className="flex flex-wrap gap-2">
        <LinkButton to="/units?new=1" variant="primary">
          호실 등록
        </LinkButton>
        <LinkButton to="/settings">설정 · 빈 상태로 시작</LinkButton>
      </div>
    </Section>
  );
}

/** 실사용을 막 시작했을 때 할 일 — 다 끝나면 사라진다 */
export function StartChecklist() {
  const q = useApi<SetupStatus>(["setup"], "/api/setup/status");
  const s = q.data;
  if (!s || s.mode !== "real") return null;
  const steps: Array<{ done: boolean; label: string; hint: string; to: string; cta: string }> = [
    { done: s.counts.units > 0, label: "호실 등록", hint: `지금 ${s.counts.units}실`, to: "/units", cta: "호실 보기" },
    { done: s.counts.leases > 0, label: "지금 사는 입주자의 계약 넣기", hint: "입주일·월세·보증금을 넣으면 청구 일정이 생긴다", to: "/leases?new=1", cta: "계약 작성" },
    { done: s.counts.charges > 0, label: "이번 달 청구서 만들기", hint: "청구서 만들기 → 확인 → 발송", to: "/billing", cta: "청구로" },
    { done: s.counts.payments > 0, label: "받은 월세 기록", hint: "입금 기록 또는 은행 거래내역 엑셀 올리기", to: "/collections?view=receipts", cta: "수납으로" },
  ];
  if (steps.every((x) => x.done)) return null;
  const done = steps.filter((x) => x.done).length;
  return (
    <Section title={`실사용 시작 · ${done}/${steps.length}`} hint="이 브라우저에만 저장된다. 일주일에 한 번 백업 파일을 내려받는다." actions={<LinkButton to="/settings?tab=backup" size="sm">백업</LinkButton>}>
      <ol className="flex flex-col divide-y divide-line">
        {steps.map((x) => (
          <li key={x.label} className="flex flex-wrap items-center gap-3 py-2.5">
            {x.done ? <CheckCircle2 className="size-5 text-good" /> : <Circle className="size-5 text-ink3" />}
            <div className="min-w-0 flex-1">
              <div className={cx("text-sm font-medium", x.done && "text-ink3 line-through")}>{x.label}</div>
              <div className="text-xs text-ink3">{x.hint}</div>
            </div>
            {!x.done && (
              <LinkButton to={x.to} size="sm" variant="primary">
                {x.cta}
              </LinkButton>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}
