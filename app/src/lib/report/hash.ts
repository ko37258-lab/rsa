import { createHash } from 'node:crypto'

/**
 * 객체 키를 재귀적으로 정렬한 canonical JSON. 배열 순서는 보존한다.
 * 유한하지 않은 숫자는 검증 단계에서 이미 거부되지만, 여기서도 방어한다.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) throw new Error('non-finite number')
      return JSON.stringify(value)
    case 'string':
    case 'boolean':
      return JSON.stringify(value)
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
      const obj = value as Record<string, unknown>
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort()
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`
    }
    default:
      throw new Error(`unsupported JSON value: ${typeof value}`)
  }
}

export function contentHash(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

export function etagFor(hash: string): string {
  return `"${hash}"`
}

/** If-Match 헤더에서 해시 값을 꺼낸다. 약한 ETag(W/)와 목록은 허용하지 않는다. */
export function parseIfMatch(header: string | null): string | null {
  if (!header) return null
  const m = /^\s*"([a-f0-9]{64})"\s*$/.exec(header)
  return m ? m[1] : null
}
