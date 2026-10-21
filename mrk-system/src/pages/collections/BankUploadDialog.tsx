import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { readTable, toAmount, toDateTime, type Table } from "@/lib/excel";
import { fmt, won } from "@/lib/format";
import { Button, Dialog, Field, Select } from "@/components/ui";
import { MONEY_KEYS, type BankAccountRow } from "@/pages/billing/api";

type Role = "date" | "name" | "amount" | "out" | "memo";
const ALIASES: Record<Role, string[]> = {
  date: ["거래일시", "거래일자", "거래일", "일자", "날짜", "거래 일시"],
  name: ["기재내용", "입금자", "보낸분", "의뢰인", "거래내용", "내용", "받는분/보낸분"],
  amount: ["입금액", "입금(원)", "맡기신금액", "입금금액", "받은금액", "입금"],
  out: ["출금액", "출금(원)", "찾으신금액", "출금금액", "출금"],
  memo: ["적요", "메모", "비고", "거래구분", "거래점"],
};
const ROLE_LABEL: Record<Role, string> = { date: "거래일시", name: "입금자(기재내용)", amount: "입금액", out: "출금액", memo: "적요" };

const clean = (s: string) => s.replace(/\s/g, "");

/** 표에서 머리글 줄과 칸 위치를 찾는다. 계좌에 저장된 형식이 있으면 그 이름부터 본다 */
function detect(table: Table, saved: BankAccountRow["format"]): { header: number; cols: Record<Role, number> } | null {
  for (let i = 0; i < Math.min(table.length, 25); i++) {
    const row = table[i].map(clean);
    const find = (role: Role) => {
      const savedName = saved && role !== "out" ? (saved as Record<string, string | null>)[role] ?? "" : "";
      const names = [savedName, ...ALIASES[role]].filter(Boolean).map(clean);
      for (const n of names) {
        const exact = row.findIndex((c) => c === n);
        if (exact >= 0) return exact;
      }
      for (const n of names) {
        const part = row.findIndex((c) => c.includes(n));
        if (part >= 0) return part;
      }
      return -1;
    };
    const cols = { date: find("date"), name: find("name"), amount: find("amount"), out: find("out"), memo: find("memo") };
    if (cols.date >= 0 && cols.amount >= 0) {
      if (cols.out === cols.amount) cols.out = -1;
      return { header: i, cols };
    }
  }
  return null;
}

/**
 * 은행 엑셀 올리기 — 인터넷뱅킹에서 받은 거래내역(.xlsx · .csv · HTML .xls)을 읽어
 * 입금만 「안 맞춘 입금」으로 넣는다. 이미 올린 줄(같은 계좌·시각·이름·금액)은 건너뛴다.
 */
export function BankUploadDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { branchId } = useBranch();
  const accounts = useApi<BankAccountRow[]>(["billing", "accounts", branchId], `/api/billing/branch-accounts?branch_id=${branchId}`);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [header, setHeader] = useState(0);
  const [cols, setCols] = useState<Record<Role, number> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const account = (accounts.data ?? []).find((a) => a.id === accountId) ?? (accounts.data ?? [])[0];
  const up = useApiMutation<{ created: number; duplicates: number; skipped: number }>({
    invalidate: MONEY_KEYS,
    success: (r) => `입금 ${r.created}건을 올렸다${r.duplicates ? ` · 이미 올린 ${r.duplicates}건은 건너뜀` : ""}`,
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  const read = async (f: File) => {
    setErr(null);
    setFile(f.name);
    setTable(null);
    try {
      const t = await readTable(f);
      const d = detect(t, account?.format ?? null);
      setTable(t);
      if (!d) {
        setHeader(0);
        setCols({ date: -1, name: -1, amount: -1, out: -1, memo: -1 });
        setErr("거래일시·입금액 칸을 찾지 못했다. 아래에서 머리글 줄과 칸을 직접 고른다");
      } else {
        setHeader(d.header);
        setCols(d.cols);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "파일을 읽지 못했다");
    }
  };

  const parsed = useMemo(() => {
    if (!table || !cols || cols.date < 0 || cols.amount < 0) return null;
    const head = table[header] ?? [];
    const deposits: Array<{ date: string; name: string; amount: number; memo: string; raw: Record<string, string> }> = [];
    let skipped = 0;
    for (const r of table.slice(header + 1)) {
      const date = toDateTime(r[cols.date] ?? "");
      const amount = toAmount(r[cols.amount] ?? "");
      if (!date || amount <= 0) {
        skipped++;
        continue;
      }
      deposits.push({
        date,
        name: cols.name >= 0 ? r[cols.name] ?? "" : "",
        amount,
        memo: cols.memo >= 0 ? r[cols.memo] ?? "" : "",
        raw: Object.fromEntries(head.map((h, i) => [h || `칸${i + 1}`, r[i] ?? ""])),
      });
    }
    return { deposits, skipped };
  }, [table, header, cols]);

  const headOptions = (table?.[header] ?? []).map((h, i) => ({ value: String(i), label: h || `칸 ${i + 1}` }));

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title="은행 엑셀 올리기"
      description="인터넷뱅킹에서 받은 거래내역 파일을 올리면 입금만 «안 맞춘 입금»으로 들어간다. 이름·금액·적요로 납부자를 추천한다. 파일은 이 브라우저에서 읽는다."
      footer={
        <>
          {(err || up.error) && <p className="mr-auto max-w-md self-center text-xs text-bad">{err ?? up.error?.message}</p>}
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            disabled={!parsed?.deposits.length || !account}
            loading={up.isPending}
            onClick={() => up.mutate({ path: "/api/billing/bank-deposits/upload", body: { branch_id: account?.branch_id, account_id: account?.id, rows: parsed?.deposits } })}
          >
            {parsed?.deposits.length ? `입금 ${parsed.deposits.length}건 올리기` : "올릴 입금 없음"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="입금 계좌" htmlFor="bank-account" hint={account?.format ? `저장된 형식: ${account.format.date} · ${account.format.name} · ${account.format.amount}` : "처음 올리는 계좌면 머리글을 자동으로 찾는다"}>
          <Select
            id="bank-account"
            value={account?.id ?? ""}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder={accounts.isLoading ? "불러오는 중" : (accounts.data ?? []).length ? undefined : "등록된 계좌가 없다 · 설정에서 계좌를 넣는다"}
            options={(accounts.data ?? []).map((a) => ({ value: a.id, label: `${branchId === "all" ? `${a.branch_name} · ` : ""}${a.bank} ${a.number} (${a.holder})` }))}
          />
        </Field>
        <label htmlFor="bank-file" className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-line px-6 py-6 text-center hover:bg-sunken">
          <FileSpreadsheet className="size-6 text-ink3" />
          <span className="text-sm font-medium">{file ?? "거래내역 파일 고르기"}</span>
          <span className="text-xs text-ink3">.xlsx · .csv(EUC-KR 도 된다) · 은행에서 받은 HTML .xls</span>
          <input
            id="bank-file"
            type="file"
            accept=".xlsx,.xls,.csv,.txt,.htm,.html"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void read(f);
              e.target.value = "";
            }}
          />
        </label>

        {table && cols && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Field label="머리글 줄" htmlFor="bank-header">
                <Select
                  id="bank-header"
                  value={String(header)}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    setHeader(h);
                    const d = detect(table.slice(h), null);
                    if (d) setCols(d.cols);
                  }}
                  options={table.slice(0, 15).map((r, i) => ({ value: String(i), label: `${i + 1}줄 · ${r.filter(Boolean).slice(0, 3).join(" | ").slice(0, 30)}` }))}
                />
              </Field>
              {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
                <Field key={role} label={ROLE_LABEL[role]} htmlFor={`bank-col-${role}`}>
                  <Select id={`bank-col-${role}`} value={String(cols[role])} onChange={(e) => setCols({ ...cols, [role]: Number(e.target.value) })} options={[{ value: "-1", label: "없음" }, ...headOptions]} />
                </Field>
              ))}
            </div>
            {parsed && (
              <>
                <p className="text-sm">
                  입금 <b>{parsed.deposits.length}건</b> · {won(parsed.deposits.reduce((s, d) => s + d.amount, 0))}
                  <span className="text-ink3"> · 출금·빈 줄 {parsed.skipped}개는 건너뛴다</span>
                </p>
                <div className="scroll-x max-h-[32vh] overflow-y-auto rounded border border-line">
                  <table className="w-full min-w-[460px] text-[13px]">
                    <thead className="sticky top-0 bg-sunken text-left text-xs text-ink3">
                      <tr>
                        <th className="px-3 py-1.5">거래일시</th>
                        <th className="px-3 py-1.5">입금자</th>
                        <th className="px-3 py-1.5 text-right">입금액</th>
                        <th className="px-3 py-1.5">적요</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.deposits.slice(0, 50).map((d, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="num whitespace-nowrap px-3 py-1.5">{fmt(d.date, d.date.length > 10 ? "M.d HH:mm" : "M.d")}</td>
                          <td className="whitespace-nowrap px-3 py-1.5">{d.name || "—"}</td>
                          <td className="num px-3 py-1.5 text-right">{d.amount.toLocaleString("ko-KR")}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-ink3">{d.memo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
