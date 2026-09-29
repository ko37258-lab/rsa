'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Row {
  name: string
  state: 'uploading' | 'created' | 'unchanged' | 'error'
  message?: string
}

export function SourceUploader() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])

  async function upload(files: FileList) {
    for (const f of Array.from(files)) {
      setRows((r) => [{ name: f.name, state: 'uploading' }, ...r])
      const set = (patch: Partial<Row>) => setRows((r) => r.map((x) => (x.name === f.name ? { ...x, ...patch } : x)))
      if (f.size > 2 * 1024 * 1024) {
        set({ state: 'error', message: '2MB 초과' })
        continue
      }
      try {
        const res = await fetch('/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name) },
          body: await f.arrayBuffer(),
          credentials: 'same-origin',
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || !body.ok) set({ state: 'error', message: body.message ?? `HTTP ${res.status}` })
        else set({ state: body.result === 'created' ? 'created' : 'unchanged' })
      } catch {
        set({ state: 'error', message: '네트워크 오류' })
      }
    }
    router.refresh()
  }

  return (
    <div>
      <label className="button" htmlFor="source-files">
        원자료 XLSX/CSV 선택
      </label>
      <input id="source-files" className="sr-only" type="file" multiple accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => e.target.files && upload(e.target.files)} />
      <ul className="kv-list note" aria-live="polite">
        {rows.map((r) => (
          <li key={r.name}>
            {r.name}: {r.state === 'uploading' ? '업로드 중' : r.state === 'created' ? '등록 완료' : r.state === 'unchanged' ? '이미 등록됨(변경 없음)' : `실패 — ${r.message}`}
          </li>
        ))}
      </ul>
    </div>
  )
}
