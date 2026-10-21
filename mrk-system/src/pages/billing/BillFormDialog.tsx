import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { api } from "@/api/client";
import { useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { downloadXlsx, readTable } from "@/lib/excel";
import { fmt, won } from "@/lib/format";
import { plusMonth } from "@/lib/dates";
import { Badge, Button, Dialog, Field, MonthNav, Select, useToast } from "@/components/ui";
import { MONEY_KEYS } from "./api";

interface FormData {
  branch_name: string;
  month: string;
  header: string[];
  rows: Array<Array<string | number | null>>;
}
interface Result {
  month: string;
  dry_run: boolean;
  changes: Array<{ unit_code: string; item: string; action: "fill" | "update" | "create"; before: number | null; after: number }>;
  skipped: Array<{ unit_code: string; item: string; reason: string }>;
  ignored: number;
}

const ACTION = { fill: { label: "고지서 금액", tone: "info" as const }, update: { label: "금액 고침", tone: "warn" as const }, create: { label: "새 청구", tone: "good" as const } };
const COLS = ["호실 정보", "항목", "공급가", "VAT", "사용기간(시작)", "사용기간(종료)", "비고"];

/**
 * 관리비 엑셀 올리기 — 빌딩케어에 올리던 관리비 청구서 엑셀 양식을 그대로 쓴다.
 * 계약 금액은 다를 때만 그 달 금액을 고치고, 전기·가스처럼 매달 금액이 정해지는 항목은 그 달 청구를 만든다.
 * 파일은 이 브라우저에서 읽는다.
 */
export function BillFormDialog({ month: initial, onClose }: { month: string; onClose: () => void }) {
  const { branchId, branches } = useBranch();
  const toast = useToast();
  const [branch, setBranch] = useState(branchId !== "all" ? branchId : branches[0]?.id ?? "");
  const [month, setMonth] = useState(initial);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const apply = useApiMutation<Result>({
    invalidate: MONEY_KEYS,
    success: (r) => `관리비 엑셀을 넣었다 · ${r.changes.length}건`,
    onSuccess: onClose,
  });
  const branchName = branches.find((b) => b.id === branch)?.name ?? "";

  const download = async () => {
    try {
      const d = await api<FormData>(`/api/billing/bill-form?branch_id=${branch}&month=${month}`);
      await downloadXlsx(`관리비 청구서 양식_${d.branch_name}_${d.month}.xlsx`, [d.header, ...d.rows], { sheet: `${fmt(`${month}-01`, "yyyy년 M월")} 사용분`, widths: [22, 12, 12, 10, 14, 14, 18] });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "양식을 만들지 못했다", "bad");
    }
  };

  const pick = async (file: File) => {
    setErr(null);
    setPreview(null);
    setRows(null);
    setFileName(file.name);
    try {
      const table = await readTable(file);
      const hi = table.findIndex((r) => r.some((c) => c.includes("호실 정보")) && r.some((c) => c.includes("공급가")));
      if (hi < 0) throw new Error("양식 아님");
      const head = table[hi];
      const col = (name: string) => head.findIndex((c) => c.replace(/\s/g, "").includes(name.replace(/\s/g, "")));
      const idx = COLS.map(col);
      const parsed = table
        .slice(hi + 1)
        .map((r) => ({ unit: r[idx[0]] ?? "", item: r[idx[1]] ?? "", supply: r[idx[2]] ?? "", vat: idx[3] >= 0 ? r[idx[3]] ?? "" : "", from: idx[4] >= 0 ? r[idx[4]] ?? "" : "", to: idx[5] >= 0 ? r[idx[5]] ?? "" : "", memo: idx[6] >= 0 ? r[idx[6]] ?? "" : "" }))
        .filter((r) => r.unit && r.item);
      setRows(parsed);
      setBusy(true);
      const res = await api<Result>("/api/billing/bill-form", { method: "POST", body: { branch_id: branch, month, rows: parsed, dry_run: true } });
      setPreview(res);
    } catch (e) {
      setErr(
        e instanceof Error && e.message !== "양식 아님"
          ? e.message
          : "관리비 청구서 양식을 찾지 못했다. «호실 정보» 칸과 항목별 «공급가» 칸이 있는 엑셀인지 확인한다",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title="관리비 엑셀 올리기"
      description="빌딩케어에 올리던 관리비 청구서 엑셀을 그대로 올린다. 계약 금액은 다를 때만 그 달 금액을 고치고, 전기·가스처럼 매달 금액이 정해지는 항목은 그 달 청구를 만든다. 파일은 이 브라우저에서 읽는다."
      footer={
        <>
          {(err || apply.error) && <p className="mr-auto max-w-md self-center text-xs text-bad">{err ?? apply.error?.message}</p>}
          <Button onClick={onClose}>돌아가기</Button>
          <Button
            variant="primary"
            disabled={!preview?.changes.length || !rows}
            loading={apply.isPending}
            onClick={() => apply.mutate({ path: "/api/billing/bill-form", body: { branch_id: branch, month, rows, dry_run: false } })}
          >
            {preview?.changes.length ? `${preview.changes.length}건 넣기` : "넣을 것 없음"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          {branchId === "all" && (
            <Field label="지점" htmlFor="bf-branch">
              <Select id="bf-branch" value={branch} onChange={(e) => { setBranch(e.target.value); setPreview(null); }} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
            </Field>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink2">청구 달</span>
            <MonthNav month={month} onChange={(m) => { setMonth(m); setPreview(null); }} />
          </div>
          <Button icon={<Download className="size-4" />} onClick={download} disabled={!branch}>
            양식 내려받기
          </Button>
        </div>
        <p className="-mt-2 text-xs text-ink3">
          {branchName} · {fmt(`${plusMonth(month, -1)}-01`, "M월")} 사용분을 {fmt(`${month}-01`, "M월")} 청구에 넣는다. 양식의 «호실 정보» 칸은 고치지 않는다.
        </p>

        <label htmlFor="bf-file" className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-line px-6 py-6 text-center hover:bg-sunken">
          <FileSpreadsheet className="size-6 text-ink3" />
          <span className="text-sm font-medium">{fileName ?? "관리비 엑셀 파일 고르기"}</span>
          <span className="text-xs text-ink3">.xlsx · .csv · 은행·관리사무소에서 받은 HTML .xls</span>
          <input
            id="bf-file"
            type="file"
            accept=".xlsx,.xls,.csv,.htm,.html"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pick(f);
              e.target.value = "";
            }}
          />
        </label>

        {busy && <p className="text-sm text-ink3">읽는 중…</p>}
        {preview && (
          <div className="flex flex-col gap-3">
            <div className="text-sm">
              <b>이렇게 바뀐다</b> <span className="text-ink3">· 보낸 청구서·입금 붙은 청구·이전 시스템이 청구하는 달은 건드리지 않는다</span>
            </div>
            {preview.changes.length === 0 ? (
              <p className="rounded border border-line px-3 py-4 text-center text-sm text-ink3">바뀌는 것이 없다 · 금액이 계약과 같거나 빈 칸이다</p>
            ) : (
              <div className="scroll-x max-h-[36vh] overflow-y-auto rounded border border-line">
                <table className="w-full min-w-[480px] text-[13px]">
                  <thead className="sticky top-0 bg-sunken text-left text-xs text-ink3">
                    <tr>
                      <th className="px-3 py-1.5">호실</th>
                      <th className="px-3 py-1.5">항목</th>
                      <th className="px-3 py-1.5">바뀌는 것</th>
                      <th className="px-3 py-1.5 text-right">전</th>
                      <th className="px-3 py-1.5 text-right">후</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.changes.map((c, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="px-3 py-1.5">{c.unit_code}호</td>
                        <td className="px-3 py-1.5">{c.item}</td>
                        <td className="px-3 py-1.5">
                          <Badge tone={ACTION[c.action].tone}>{ACTION[c.action].label}</Badge>
                        </td>
                        <td className="num px-3 py-1.5 text-right text-ink3">{c.before === null ? "—" : c.before.toLocaleString("ko-KR")}</td>
                        <td className="num px-3 py-1.5 text-right font-medium">{won(c.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.skipped.length > 0 && (
              <details className="rounded border border-warn/40 bg-warn/5 px-3 py-2 text-[13px]">
                <summary className="cursor-pointer font-medium text-warn">넣지 않은 것 {preview.skipped.length}건</summary>
                <ul className="mt-2 flex flex-col gap-1 text-ink2">
                  {preview.skipped.map((s, i) => (
                    <li key={i}>
                      {s.unit_code}호 · {s.item} — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {preview.ignored > 0 && <p className="text-xs text-ink3">공급가가 빈 줄 {preview.ignored}개는 건너뛴다</p>}
          </div>
        )}
      </div>
    </Dialog>
  );
}
