// 멱등성·동시성 결정 로직(순수 함수). DB 접근과 분리해 단위 테스트한다.

export type WriteDecision =
  | { action: 'insert' }
  | { action: 'unchanged' }
  | { action: 'update'; expectedHash: string }
  | { action: 'reject'; status: 409 | 412 | 428; code: string; message: string }

export interface WriteRequest {
  existingHash: string | null
  newHash: string
  ifMatch: string | null // 파싱된 해시
  ifMatchRaw: string | null // 원본 헤더(형식 오류 판별용)
  ifNoneMatchStar: boolean
  machine: boolean
  correction: boolean
}

export function decideWrite(r: WriteRequest): WriteDecision {
  if (r.ifMatchRaw && !r.ifMatch)
    return { action: 'reject', status: 412, code: 'invalid_if_match', message: 'If-Match 형식이 올바르지 않습니다.' }

  if (r.existingHash === null) {
    if (r.ifMatch) return { action: 'reject', status: 412, code: 'not_found_for_if_match', message: '수정하려는 보고서가 존재하지 않습니다.' }
    if (!r.ifNoneMatchStar)
      return { action: 'reject', status: 428, code: 'precondition_required', message: '신규 저장은 If-None-Match: * 헤더가 필요합니다.' }
    return { action: 'insert' }
  }

  // 동일 내용 재전송은 헤더와 무관하게 unchanged (중복 보고서·리비전 생성 없음)
  if (r.existingHash === r.newHash) return { action: 'unchanged' }

  if (r.ifNoneMatchStar)
    return { action: 'reject', status: 412, code: 'already_exists', message: '같은 ID의 다른 보고서가 이미 저장되어 있습니다. 미리보기에서 교체를 확인하세요.' }
  if (!r.ifMatch)
    return { action: 'reject', status: 428, code: 'precondition_required', message: '기존 보고서 교체는 최신 ETag를 If-Match로 보내야 합니다.' }
  if (r.machine && !r.correction)
    return { action: 'reject', status: 409, code: 'machine_overwrite_blocked', message: '자동 수집은 기존의 다른 보고서를 덮어쓰지 않습니다. 명시적인 정정 요청(X-Report-Correction: true)이 필요합니다.' }
  if (r.ifMatch !== r.existingHash)
    return { action: 'reject', status: 412, code: 'etag_mismatch', message: '그 사이 보고서가 변경되었습니다. 최신 내용을 다시 불러와 확인하세요.' }
  return { action: 'update', expectedHash: r.ifMatch }
}
