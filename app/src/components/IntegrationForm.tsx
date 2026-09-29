'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function IntegrationForm({ connected, firstRunOn, note }: { connected: boolean; firstRunOn: string | null; note: string | null }) {
  const router = useRouter()
  const [date, setDate] = useState(firstRunOn ?? '')
  const [memo, setMemo] = useState(note ?? '')
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(asideConnected: boolean) {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/integration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ asideConnected, firstRunOn: asideConnected ? date : null, note: memo }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) setMsg({ tone: 'error', text: body.message ?? `저장 실패(HTTP ${res.status})` })
      else {
        setMsg({ tone: 'success', text: asideConnected ? '연결 등록을 저장했습니다.' : '연결 해제를 저장했습니다.' })
        setConfirm(false)
        router.refresh()
      }
    } catch {
      setMsg({ tone: 'error', text: '네트워크 오류' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {msg && (
        <div className={`alert ${msg.tone}`} role="status">
          {msg.text}
        </div>
      )}
      {!connected ? (
        <>
          <p className="note">Aside에서 실제 주간 루틴을 만든 뒤에만 등록하세요. 이 등록은 화면 표시용이며, 사이트가 수집을 실행하거나 예약하지 않습니다.</p>
          <div className="field">
            <label htmlFor="first-run">Aside에서 확정한 첫 실행일(한국시간 오전 9시 기준)</label>
            <input id="first-run" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="memo">메모(선택, 200자)</label>
            <input id="memo" maxLength={200} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            Aside 루틴을 실제로 만들었고, 중복 루틴이 없음을 확인했습니다.
          </label>
          <button type="button" className="button primary" style={{ marginTop: 12 }} disabled={!confirm || !date || busy} onClick={() => submit(true)}>
            연결 등록
          </button>
        </>
      ) : (
        <>
          <p className="note">Aside 루틴을 중지·삭제했다면 연결 해제로 표시를 되돌리세요.</p>
          <button type="button" className="button" disabled={busy} onClick={() => submit(false)}>
            연결 해제로 표시
          </button>
        </>
      )}
    </div>
  )
}
