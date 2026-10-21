/**
 * 호실 번호 다루기 — 화면(여러 호실 한 번에)과 Mock API 가 같이 쓴다.
 */

/** "101-110, 201~205, B01" → 호실 번호 목록. 범위는 머리글자가 같을 때만(B01-B05) */
export function expandCodes(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[,\s\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = raw.match(/^([A-Za-z]*)(\d+)\s*[~-]\s*([A-Za-z]*)(\d+)$/);
    if (m && m[1] === (m[3] || m[1]) && Number(m[4]) >= Number(m[2]) && Number(m[4]) - Number(m[2]) <= 200) {
      const width = m[2].length;
      for (let n = Number(m[2]); n <= Number(m[4]); n++) out.push(`${m[1]}${String(n).padStart(width, "0")}`);
    } else out.push(raw);
  }
  return [...new Set(out)];
}

/** 번호로 층 짐작: "301" → 3, "1201" → 12, "B01" → null */
export function floorFromCode(code: string): number | null {
  const m = code.match(/^[A-Za-z]*(\d{3,4})$/);
  return m ? Number(m[1].slice(0, -2)) : null;
}

export const CODE_RE = /^[A-Za-z0-9-]+$/;
