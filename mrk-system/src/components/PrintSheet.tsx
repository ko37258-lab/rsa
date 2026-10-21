import type { ReactNode } from "react";
import { Printer, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * A4 인쇄용 문서 틀(계약서·청구서). 화면에서는 종이처럼 보이고,
 * 「인쇄 · PDF 저장」을 누르면 브라우저 인쇄 창에서 PDF 로 저장할 수 있다.
 * 앱 바깥 경로(/print/...)에서 쓴다 — 사이드바 없이 문서만 찍힌다.
 */
export function PrintSheet({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="min-h-full bg-sunken print:bg-white">
      <div
        className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface/95 py-2.5 backdrop-blur print:hidden"
        style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}
      >
        <button type="button" onClick={() => nav(-1)} className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-sm text-ink2 hover:bg-sunken">
          <ArrowLeft className="size-4" /> 돌아가기
        </button>
        <span className="order-first w-full truncate text-sm font-semibold sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">{title}</span>
        {actions}
        <button type="button" onClick={() => window.print()} className="inline-flex h-8 items-center gap-1.5 rounded bg-navy px-3 text-[13px] font-medium text-navy-fg hover:bg-navy/90">
          <Printer className="size-4" /> 인쇄 · PDF 저장
        </button>
      </div>
      <div className="mx-auto my-6 w-full max-w-[210mm] px-4 print:my-0 print:max-w-none print:px-0">
        <article className="print-sheet rounded-sm bg-white p-[14mm] text-[12.5px] leading-relaxed text-[#111] shadow-md print:rounded-none print:p-0 print:shadow-none">{children}</article>
      </div>
    </div>
  );
}

/** 문서 안 표(계약 조건·청구 항목) — 인쇄에서도 테두리가 남는다 */
export function DocTable({ rows, head }: { rows: Array<Array<ReactNode>>; head?: ReactNode[] }) {
  return (
    <table className="w-full border-collapse text-[12px]">
      {head && (
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="border border-[#999] bg-[#f2f2f2] px-2 py-1.5 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className="border border-[#999] px-2 py-1.5 align-top">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
