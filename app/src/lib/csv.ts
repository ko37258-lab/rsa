// CSV 내보내기. 외부 문자열(제목·검색어·경로명)은 신뢰할 수 없는 입력으로 취급한다.

/** 스프레드시트 수식 실행 방지: =, +, -, @, 탭, CR 로 시작하면 작은따옴표를 붙인다. */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  const safe = neutralizeFormula(value)
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/** UTF-8 BOM 포함(엑셀 한글 호환), CRLF 줄바꿈. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','))
  return `﻿${lines.join('\r\n')}\r\n`
}

/** Content-Disposition 파일명(RFC 5987). */
export function attachmentHeader(fileName: string): string {
  const ascii = fileName.replace(/[^A-Za-z0-9._-]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
