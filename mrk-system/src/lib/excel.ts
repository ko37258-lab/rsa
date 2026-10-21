import { format } from "date-fns";

/**
 * 엑셀·CSV 읽고 쓰기. 은행 거래내역, 관리비 고지서 양식(빌딩케어 호환), 렌트롤에 쓴다.
 * 파일은 브라우저 안에서만 읽는다(서버로 안 보낸다).
 */
export type Table = string[][];

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return format(v, v.getHours() || v.getMinutes() ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd");
  return String(v).trim();
}

/** 한국 은행 CSV 는 EUC-KR 인 경우가 많다 — UTF-8 로 안 읽히면 EUC-KR 로 다시 읽는다 */
async function decodeText(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("euc-kr").decode(buf);
  }
}

export function parseCsv(text: string): Table {
  const rows: Table = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const delim = text.split("\n", 1)[0].includes("\t") && !text.split("\n", 1)[0].includes(",") ? "\t" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x !== ""));
}

/** 은행에서 받은 ".xls" 가 사실은 HTML 표인 경우가 많다 */
function parseHtmlTable(html: string): Table {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("tr")]
    .map((tr) => [...tr.querySelectorAll("th,td")].map((td) => (td.textContent ?? "").replace(/\s+/g, " ").trim()))
    .filter((r) => r.some((x) => x !== ""));
}

/** 파일 하나를 표(문자열 2차원 배열)로 읽는다. 첫 시트만 */
export async function readTable(file: File): Promise<Table> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") return parseCsv(await decodeText(file));
  if (name.endsWith(".xls") || name.endsWith(".htm") || name.endsWith(".html")) {
    const text = await decodeText(file);
    if (text.trimStart().startsWith("<")) return parseHtmlTable(text);
    throw new Error("옛 엑셀(.xls) 형식은 읽지 못한다. 엑셀에서 .xlsx 나 .csv 로 다시 저장해 올린다");
  }
  // 엑셀 라이브러리는 쓸 때만 내려받는다(첫 화면을 가볍게)
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  const first = sheets[0];
  if (!first) throw new Error("시트가 없는 파일이다");
  return first.data.map((r) => r.map(cellText)).filter((r) => r.some((x) => x !== ""));
}

export type XlsxCell = string | number | Date | null;

/** 표를 .xlsx 로 내려받기. 첫 줄은 굵게(머리글) */
export async function downloadXlsx(filename: string, rows: XlsxCell[][], opts: { sheet?: string; widths?: number[] } = {}): Promise<void> {
  const data = rows.map((r, i) => r.map((v) => (v === null ? null : i === 0 ? { value: v, fontWeight: "bold" as const } : { value: v })));
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile(data, { sheet: opts.sheet ?? "Sheet1", columns: opts.widths?.map((w) => ({ width: w })) }).toFile(filename);
}

/** "1,234,000" · "₩1,234,000" · "1234000원" → 1234000 */
export function toAmount(s: string): number {
  const n = Number(String(s).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** "2026.10.21 14:05" · "2026-10-21" · "20261021" → ISO 비슷한 "yyyy-MM-ddTHH:mm" 또는 날짜 */
export function toDateTime(s: string): string | null {
  const m = String(s).match(/(\d{4})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})(?:[일\s]*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const d = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return m[4] ? `${d}T${m[4].padStart(2, "0")}:${m[5]}:00+09:00` : d;
}
