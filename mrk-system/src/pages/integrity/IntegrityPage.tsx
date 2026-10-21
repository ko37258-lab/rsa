import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader, Section, Badge, Button, Loading, ErrorBox, StatTile } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { useApi, useApiMutation } from "@/lib/hooks";
import { cx, fmt } from "@/lib/format";
import type { IntegrityCheck, IntegrityRes } from "@/pages/dashboard/ops-api";

function CheckRow({ c, prev }: { c: IntegrityCheck; prev: number | undefined }) {
  const [open, setOpen] = useState(false);
  const diff = prev === undefined ? null : c.violations - prev;
  const bad = c.violations > 0;
  return (
    <li className="border-b border-line last:border-0">
      <button type="button" onClick={() => bad && setOpen((o) => !o)} className={cx("flex w-full items-start gap-3 px-4 py-3 text-left", bad && "hover:bg-sunken/60")} aria-expanded={bad ? open : undefined} disabled={!bad}>
        <span className="mt-0.5 text-ink3">{bad ? open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" /> : <ShieldCheck className="size-4 text-good" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={c.severity === "critical" ? (bad ? "bad" : "neutral") : bad ? "warn" : "neutral"}>{c.severity === "critical" ? "심각" : "주의"}</Badge>
            <span className={cx("text-sm font-medium", !bad && "text-ink2")}>{c.label}</span>
          </div>
          <p className="mt-1 text-xs text-ink3">{c.description}</p>
          {c.error && <p className="mt-1 text-xs text-bad">검사 실패 · {c.error}</p>}
        </div>
        <div className="shrink-0 text-right">
          <div className={cx("num text-sm font-semibold", bad ? (c.severity === "critical" ? "text-bad" : "text-warn") : "text-ink3")}>{c.violations.toLocaleString("ko-KR")}건</div>
          <div className="text-[11px] text-ink3">{diff === null ? "첫 실행" : diff === 0 ? "직전과 같음" : `직전보다 ${diff > 0 ? "+" : ""}${diff}`}</div>
        </div>
      </button>
      {open && (
        <ul className="flex flex-col gap-1 bg-sunken/50 px-4 py-2 pl-11">
          {c.samples.map((s, i) => (
            <li key={i} className="text-xs">
              {s.to ? (
                <Link to={s.to} className="text-ink2 underline-offset-2 hover:text-ink hover:underline">
                  {s.text}
                </Link>
              ) : (
                <span className="text-ink2">{s.text}</span>
              )}
            </li>
          ))}
          {c.violations > c.samples.length && <li className="text-xs text-ink3">외 {c.violations - c.samples.length}건</li>}
        </ul>
      )}
    </li>
  );
}

export default function IntegrityPage() {
  const q = useApi<IntegrityRes>(["integrity"], "/api/integrity");
  const run = useApiMutation({ invalidate: [["integrity"]], success: "검사를 다시 돌렸다" });
  const d = q.data;
  const failing = d?.checks.filter((c) => c.violations > 0) ?? [];
  const total = d?.checks.reduce((s, c) => s + c.violations, 0) ?? 0;
  const prevRun = d?.runs[1];
  const chrono = d ? [...d.runs].reverse() : [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="정합성"
        subtitle={d ? `마지막 실행 ${fmt(d.ran_at, "M월 d일 HH:mm")} · 전 지점 데이터를 검사한다` : "검사 결과를 불러오는 중"}
        actions={
          <Button variant="primary" icon={<RefreshCw className="size-4" />} loading={run.isPending} onClick={() => run.mutate({ path: "/api/integrity/run" })}>
            다시 검사
          </Button>
        }
      />
      {q.isLoading ? (
        <Loading />
      ) : q.error || !d ? (
        <ErrorBox error={q.error} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label="위반이 있는 검사" value={`${failing.length} / ${d.checks.length}`} tone={failing.some((c) => c.severity === "critical") ? "bad" : failing.length ? "warn" : "good"} note={failing.length ? undefined : "모든 검사가 0건입니다"} />
            <StatTile label="위반 건수" value={total.toLocaleString("ko-KR")} unit="건" note={prevRun ? (total === prevRun.total ? "직전과 같음" : `직전보다 ${total - prevRun.total > 0 ? "+" : ""}${total - prevRun.total}`) : "이 세션 첫 실행"} />
            <StatTile label="0건인 검사" value={d.checks.length - failing.length} unit="개" tone="good" />
          </div>

          <Section title="검사 항목" hint="위반이 있는 검사가 위. 심각은 돈·계약 숫자가 틀어질 수 있는 것, 주의는 화면·분석이 덜 정확해지는 것. 항목을 누르면 예시가 열린다." bodyClassName="p-0">
            <ul>
              {d.checks.map((c) => (
                <CheckRow key={c.id} c={c} prev={prevRun?.by[c.id]} />
              ))}
            </ul>
          </Section>

          <Section title="위반 건수 추이" hint="이 세션에서 돌린 검사만 쌓인다(새로고침하면 처음부터).">
            {chrono.length < 2 ? (
              <p className="text-sm text-ink3">«다시 검사»를 누르면 실행마다 위반 건수가 여기 쌓인다.</p>
            ) : (
              <LineChart labels={chrono.map((r) => fmt(r.at, "HH:mm:ss"))} series={[{ name: "위반 건수", color: "bad", values: chrono.map((r) => r.total) }]} format={(v) => `${Math.round(v)}건`} height={160} />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
