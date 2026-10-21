import type { ReactNode } from "react";
import { Section, DataTable, Loading, ErrorBox, type Column } from "@/components/ui";
import { LineChart, BarChart, HBarList, Heatmap, Sparkline, Meter, Legend, SERIES } from "@/components/charts";
import { useApi } from "@/lib/hooks";
import { cx, fmt, man, minutes, num, pct, won } from "@/lib/format";
import type { AnalyticsRes, MonthStat, SourceRow, TypeLoss } from "./ops-api";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const monthLabel = (m: string) => `${Number(m.slice(5))}월`;

/** 비율 축 아래쪽 — 0.9 근처에 몰린 선이 바닥에 깔리지 않게 */
function rateFloor(values: Array<number | null>): number {
  const xs = values.filter((v): v is number => v !== null);
  if (!xs.length) return 0;
  return Math.max(0, Math.floor((Math.min(...xs) - 0.05) * 10) / 10);
}

function Delta({ now, prev, kind, inverse }: { now: number | null; prev: number | null; kind: "rate" | "money"; inverse?: boolean }) {
  if (now === null || prev === null) return <span className="text-ink3">전월 값 없음</span>;
  const diff = kind === "rate" ? (now - prev) * 100 : prev ? ((now - prev) / prev) * 100 : null;
  if (diff === null) return <span className="text-ink3">전월 값 없음</span>;
  const flat = Math.abs(diff) < 0.05;
  const good = inverse ? diff < 0 : diff > 0;
  return (
    <span className={cx("num font-medium", flat ? "text-ink3" : good ? "text-good" : "text-bad")}>
      {flat ? "변화 없음" : `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(1)}${kind === "rate" ? "%p" : "%"}`}
    </span>
  );
}

function Kpi({ label, value, now, prev, kind, inverse, spark, note }: { label: string; value: ReactNode; now: number | null; prev: number | null; kind: "rate" | "money"; inverse?: boolean; spark: number[]; note?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-line bg-surface px-4 py-3">
      <div className="text-xs font-medium text-ink3">{label}</div>
      <div className="flex items-end justify-between gap-2">
        <div className="num text-[24px] font-semibold leading-none tracking-tight">{value}</div>
        <Sparkline values={spark} color={inverse ? "brass" : "navy"} />
      </div>
      <div className="text-xs">
        <Delta now={now} prev={prev} kind={kind} inverse={inverse} /> <span className="text-ink3">전월 대비</span>
      </div>
      {note && <div className="truncate text-xs text-ink3">{note}</div>}
    </div>
  );
}

function KpiRow({ months }: { months: MonthStat[] }) {
  // 지난달(마감된 달)을 기준으로 보여주고, 진행 중인 이번 달은 아래에 따로 적는다
  const cur = months[months.length - 1];
  const last = months[months.length - 2];
  const prev = months[months.length - 3];
  const s = (f: (m: MonthStat) => number | null) => months.slice(0, -1).map(f).filter((v): v is number => v !== null);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Kpi label={`점유율 · ${monthLabel(last.month)}`} value={pct(last.occupancy)} now={last.occupancy} prev={prev.occupancy} kind="rate" spark={s((m) => m.occupancy)} note={`이번 달 지금까지 ${pct(cur.occupancy)}`} />
      <Kpi label={`계약율 · ${monthLabel(last.month)}`} value={pct(last.contract_rate)} now={last.contract_rate} prev={prev.contract_rate} kind="rate" spark={s((m) => m.contract_rate)} note={`이번 달 ${pct(cur.contract_rate)} (입주 예정 포함)`} />
      <Kpi label={`RevPAR · ${monthLabel(last.month)}`} value={man(last.revpar)} now={last.revpar} prev={prev.revpar} kind="money" spark={s((m) => m.revpar)} note="운영 호실당 월세 매출" />
      <Kpi label={`AMR · ${monthLabel(last.month)}`} value={man(last.amr)} now={last.amr} prev={prev.amr} kind="money" spark={s((m) => m.amr)} note="계약 호실 평균 정가 월세" />
      <Kpi label={`공실 손실 · ${monthLabel(last.month)}`} value={man(last.vacancy_loss)} now={last.vacancy_loss} prev={prev.vacancy_loss} kind="money" inverse spark={s((m) => m.vacancy_loss)} note={`이번 달 지금까지 ${man(cur.vacancy_loss)}`} />
    </div>
  );
}

const typeCols = (showBranch: boolean): Column<TypeLoss>[] => [
  { id: "name", header: "룸타입", cell: (r) => (showBranch && r.branch_name ? <span>{r.name} <span className="text-xs text-ink3">{r.branch_name.replace("MR.K ", "")}</span></span> : r.name), sort: (r) => r.name },
  { id: "units", header: "호실", align: "right", cell: (r) => `${r.units}실`, sort: (r) => r.units },
  { id: "vacant", header: "지금 빈 방", align: "right", cell: (r) => <span className={r.vacant_now ? "font-semibold text-warn" : "text-ink3"}>{r.vacant_now}실</span>, sort: (r) => r.vacant_now },
  { id: "rent", header: "정가 중앙값", align: "right", cell: (r) => man(r.list_rent), sort: (r) => r.list_rent, hideOnMobile: true },
  { id: "past", header: "최근 90일 손실", align: "right", cell: (r) => man(r.loss_past_90), sort: (r) => r.loss_past_90 },
  { id: "next", header: "앞으로 30일", align: "right", cell: (r) => <span className={r.loss_next_30 ? "font-semibold" : "text-ink3"}>{man(r.loss_next_30)}</span>, sort: (r) => r.loss_next_30 },
];

const sourceCols: Column<SourceRow>[] = [
  { id: "group", header: "유입경로", cell: (r) => r.group },
  { id: "inq", header: "문의", align: "right", cell: (r) => num(r.inquiries), sort: (r) => r.inquiries },
  { id: "conc", header: "체결 계약", align: "right", cell: (r) => num(r.concluded), sort: (r) => r.concluded },
  { id: "value", header: "계약 금액", align: "right", cell: (r) => man(r.contract_value), sort: (r) => r.contract_value },
  { id: "term", header: "평균 계약 기간", align: "right", cell: (r) => (r.term_months_avg === null ? "—" : `${r.term_months_avg.toFixed(1)}개월`), sort: (r) => r.term_months_avg, hideOnMobile: true },
  { id: "days", header: "체결까지", align: "right", cell: (r) => (r.days_to_conclude === null ? "—" : `${Math.round(r.days_to_conclude)}일`), sort: (r) => r.days_to_conclude, hideOnMobile: true },
  { id: "per", header: "문의 1건의 값", align: "right", cell: (r) => <span className="font-semibold">{r.per_inquiry === null ? "—" : won(r.per_inquiry)}</span>, sort: (r) => r.per_inquiry },
];

const monthCols: Column<MonthStat>[] = [
  { id: "m", header: "달", cell: (r) => fmt(`${r.month}-01`, "yyyy.M") },
  { id: "occ", header: "점유율", align: "right", cell: (r) => pct(r.occupancy) },
  { id: "rent", header: "월세 매출", align: "right", cell: (r) => man(r.rent_revenue) },
  { id: "dep", header: "계약금·잔금", align: "right", cell: (r) => man(r.deposits_billed), hideOnMobile: true },
  { id: "rcv", header: "수납", align: "right", cell: (r) => man(r.received) },
  { id: "ref", header: "반환", align: "right", cell: (r) => man(r.refunded), hideOnMobile: true },
  { id: "od", header: "기한 지난 미납", align: "right", cell: (r) => <span className={r.overdue_now ? "text-bad" : "text-ink3"}>{man(r.overdue_now)}</span> },
  { id: "io", header: "입주·퇴실", align: "right", cell: (r) => `${r.move_ins} · ${r.move_outs}` },
  { id: "stay", header: "평균 거주", align: "right", cell: (r) => (r.stay_days_avg === null ? "—" : `${Math.round(r.stay_days_avg)}일`), hideOnMobile: true },
];

export function Analytics({ branchId }: { branchId: string }) {
  const q = useApi<AnalyticsRes>(["dashboard", "analytics", branchId], `/api/analytics?branch_id=${branchId}`);
  if (q.isLoading) return <Loading label="분석을 계산하는 중" />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const a = q.data;
  const labels = a.months.map((m) => monthLabel(m.month));
  const occFloor = rateFloor([...a.months.map((m) => m.occupancy), ...a.months.map((m) => m.contract_rate)]);
  const fwdFloor = rateFloor(a.forward.daily.map((d) => d.rate));
  const sinceLabel = fmt(a.since, "yyyy년 M월 d일");
  const funnel = a.funnel.map((f) => ({ label: f.label, value: f.count, note: f.rate_from_prev === null ? undefined : pct(f.rate_from_prev, 0) }));
  const lostSeries = a.lost.reasons.map((r, i) => ({ name: r, color: SERIES[i % SERIES.length], values: a.lost.months.map((m) => m.counts[i]) }));
  const heatTitle = (r: number, c: number) => {
    const cell = a.heat.cells[r][c];
    return `${WEEKDAYS[r]} ${c}시 · 문의 ${cell.inquiries}건${cell.inquiries ? ` · 체결 ${pct(cell.concluded / cell.inquiries, 0)} · 첫 답장 ${minutes(cell.median_minutes)}` : ""}`;
  };
  const hourCell = (label: string, c: AnalyticsRes["heat"]["in_hours"]) => (
    <div className="min-w-0 rounded bg-sunken/70 px-3 py-2">
      <div className="text-xs text-ink3">{label}</div>
      <div className="num mt-0.5 text-sm">
        문의 <b>{num(c.inquiries)}</b>건 · 체결 <b>{c.inquiries ? pct(c.concluded / c.inquiries) : "—"}</b> · 첫 답장 <b>{minutes(c.median_minutes)}</b>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <KpiRow months={a.months} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="점유율·계약율" hint="계약율은 체결 이후 계약(입주 예정 포함). 이번 달 점유율은 오늘까지 센 값이다.">
          <Legend series={[{ name: "점유율", color: "navy" }, { name: "계약율", color: "brass" }]} />
          <LineChart
            labels={labels}
            min={occFloor}
            max={1}
            format={(v) => pct(v, 0)}
            series={[
              { name: "점유율", color: "navy", values: a.months.map((m) => m.occupancy) },
              { name: "계약율", color: "brass", values: a.months.map((m) => m.contract_rate), dashed: true },
            ]}
          />
        </Section>
        <Section title="매출 · 월세와 기타 수입" hint="매출은 사용 기간의 달에 넣고 계약금·잔금(돌려줄 돈)은 뺀다. 이번 달은 아직 청구일이 안 된 월세가 빠져 낮게 보일 수 있다.">
          <Legend series={[{ name: "월세", color: "navy" }, { name: "기타 수입", color: "brass" }]} />
          <BarChart
            labels={labels}
            stacked
            format={man}
            series={[
              { name: "월세", color: "navy", values: a.months.map((m) => m.rent_revenue) },
              { name: "기타 수입", color: "brass", values: a.months.map((m) => m.other_revenue) },
            ]}
          />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="앞으로 90일" hint="지금 잡힌 계약(서명 대기 포함)이 앞으로의 운영 호실-일을 얼마나 채우는지. 앞날이라 시간이 지나면 오른다.">
          <div className="mb-3 grid grid-cols-3 gap-2">
            {a.forward.buckets.map((b, i) => (
              <div key={b.start} className="min-w-0 rounded bg-sunken/70 px-3 py-2">
                <div className="truncate text-xs text-ink3">{i === 0 ? "앞으로 30일" : `${i * 30 + 1}~${(i + 1) * 30}일`}</div>
                <div className="num text-lg font-semibold">{pct(b.rate)}</div>
                <Meter value={b.rate} className="mt-1" />
              </div>
            ))}
          </div>
          <LineChart labels={a.forward.daily.map((d) => fmt(d.date, "M.d"))} min={fwdFloor} max={1} format={(v) => pct(v, 0)} series={[{ name: "계약된 방 비율", color: "navy", values: a.forward.daily.map((d) => d.rate) }]} height={170} />
        </Section>
        <Section title="공실 손실 · 룸타입별" hint="빈 호실-일 × 룸타입 정가 중앙값 ÷ 30. «앞으로 30일»은 서명 대기 계약까지 찬 것으로 본다." bodyClassName="p-0">
          <div className="p-3">
            <DataTable rows={a.type_loss} columns={typeCols(branchId === "all")} rowKey={(r) => `${r.unit_type_id}`} dense empty="룸타입 없음" initialSort={{ id: "next", dir: "desc" }} />
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="전환 깔때기" hint={`${sinceLabel}부터 접수한 입주문의 기준(한 번이라도 그 단계에 간 문의). 오른쪽 %는 바로 앞 단계에서 넘어온 비율. 투어 없이 계약하기도 해서 계약 작성은 문의와 견준다.`}>
          <HBarList items={funnel} format={(v) => `${num(v)}건`} />
        </Section>
        <Section title="응답 속도와 체결" hint="첫 답장 = 접수부터 처음 보낸 메시지까지(전화로만 답한 문의는 «답장 기록 없음»). 첫 답장 속도별 체결률.">
          <div className="mb-3 text-sm text-ink2">
            첫 답장까지 걸린 시간 · 중앙값 <b className="num text-ink">{minutes(a.reply.median_minutes)}</b>
          </div>
          <ul className="flex flex-col gap-2.5">
            {a.reply.buckets.map((b) => (
              <li key={b.id} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-sm">
                <span className="text-ink2">{b.label}</span>
                <Meter value={b.rate} color={b.id === "lt1h" ? "good" : b.id === "none" ? "bad" : "navy"} />
                <span className="num min-w-[120px] text-right">
                  체결 <b>{pct(b.rate)}</b> <span className="text-xs text-ink3">/ {num(b.inquiries)}건</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="결렬 사유 · 결렬한 달" hint="최근 6개월. 같은 달에 결렬된 입주문의를 사유별로 쌓았다.">
          <Legend series={lostSeries} />
          <BarChart labels={a.lost.months.map((m) => monthLabel(m.month))} stacked series={lostSeries} format={(v) => `${Math.round(v)}건`} height={190} />
        </Section>
        <Section title="문의 들어오는 때" hint={`${sinceLabel}부터 접수한 문의, 한국 시간. 진할수록 문의가 많다. 칸에 대면 그 시간 문의의 체결률과 첫 답장 중앙값. 업무 시간은 평일 9~18시로 둔다(공휴일 구분 없음).`}>
          <Heatmap rows={WEEKDAYS} cols={Array.from({ length: 24 }, (_, i) => String(i))} values={a.heat.cells.map((r) => r.map((c) => c.inquiries))} title={heatTitle} />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {hourCell("업무 시간 안 접수", a.heat.in_hours)}
            {hourCell("업무 시간 밖 접수", a.heat.out_hours)}
          </div>
        </Section>
      </div>

      <Section title="유입경로" hint={`${sinceLabel}부터 접수한 문의에서 체결된 계약의 정가 월세 × 계약 기간 ÷ 문의 수 = 문의 1건의 값. 체결까지는 접수부터 첫 체결까지(중앙값).`} bodyClassName="p-3">
        <DataTable
          rows={a.sources}
          columns={sourceCols}
          rowKey={(r) => r.group}
          initialSort={{ id: "inq", dir: "desc" }}
          footer={
            <tr className="font-semibold">
              {sourceCols.map((c) => (
                <td key={c.id} className={cx("px-3 py-2.5 text-sm", c.align === "right" ? "text-right" : "text-left", c.hideOnMobile && "max-sm:hidden")}>
                  {c.cell(a.sources_total)}
                </td>
              ))}
            </tr>
          }
        />
      </Section>

      <Section title="지난 달들" hint="최근 달이 위. 기한 지난 미납은 그 달 납기 청구 중 지금도 못 받은 돈." bodyClassName="p-3">
        <DataTable rows={[...a.months].reverse()} columns={monthCols} rowKey={(r) => r.month} dense />
      </Section>
    </div>
  );
}
