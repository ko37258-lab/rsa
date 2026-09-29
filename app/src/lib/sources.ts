const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** 내용(매직 바이트)으로 파일 형식을 판정한다. 확장자는 보조 조건일 뿐이다. */
export function sniffSourceType(name: string, bytes: Uint8Array): string | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.xlsx') && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return XLSX
  if (lower.endsWith('.csv')) {
    if (bytes.includes(0)) return null
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      return 'text/csv'
    } catch {
      return null
    }
  }
  return null
}
