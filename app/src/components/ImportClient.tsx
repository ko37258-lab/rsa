'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

const MAX = 2 * 1024 * 1024

interface Issue {
  path: string
  message: string
}
interface Preview {
  ok: boolean
  stage?: string
  errors?: Issue[]
  warnings?: Issue[]
  reportId?: string
  reportType?: 'weekly' | 'baseline'
  contentHash?: string
  relation?: 'new' | 'unchanged' | 'changed'
  currentEtag?: string
  savedAt?: string
  changes?: { field: string; before: string; after: string }[]
  changedSections?: string[]
  summary?: Record<string, unknown>
  message?: string
}
type Phase = 'reading' | 'previewing' | 'preview' | 'invalid' | 'saving' | 'verifying' | 'saved' | 'unchanged' | 'error'
interface Item {
  id: string
  fileName: string
  size: number
  text?: string
  phase: Phase
  preview?: Preview
  confirm: boolean
  result?: { result: string; savedAt: string; contentHash: string; reportPath: string }
  error?: string
}

async function readJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return { ok: false, message: `서버 응답을 해석할 수 없습니다(HTTP ${res.status}).` }
  }
}

function kst(ts?: string) {
  if (!ts) return ''
  const d = new Date(Date.parse(ts) + 9 * 3600_000).toISOString()
  return `${d.slice(0, 10).replaceAll('-', '.')} ${d.slice(11, 16)} (KST)`
}

export function ImportClient() {
  const [items, setItems] = useState<Item[]>([])
  const [drag, setDrag] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const update = (id: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  async function runPreview(id: string, text: string) {
    update(id, { phase: 'previewing', error: undefined })
    try {
      const res = await fetch('/api/import/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text, credentials: 'same-origin' })
      const body = (await readJson(res)) as Preview
      if (res.status === 401) return update(id, { phase: 'error', error: '세션이 만료되었습니다. 다시 로그인해 주세요.' })
      if (!res.ok || !body.ok) return update(id, { phase: 'invalid', preview: body, error: body.message ?? (res.status === 413 ? '파일이 2MB를 넘습니다.' : '검증에 실패했습니다.') })
      update(id, { phase: body.relation === 'unchanged' ? 'unchanged' : 'preview', preview: body })
    } catch {
      update(id, { phase: 'error', error: '네트워크 오류로 미리보기를 받지 못했습니다.' })
    }
  }

  async function addFiles(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      const id = `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 7)}`
      const base: Item = { id, fileName: f.name, size: f.size, phase: 'reading', confirm: false }
      setItems((list) => [base, ...list])
      if (f.size > MAX) {
        update(id, { phase: 'invalid', error: '파일 크기가 2MB를 넘습니다. 서버도 413으로 거부합니다.' })
        continue
      }
      const text = await f.text()
      update(id, { text })
      await runPreview(id, text)
    }
  }

  async function save(item: Item) {
    const p = item.preview
    if (!p?.reportId || !item.text) return
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (p.relation === 'new') headers['If-None-Match'] = '*'
    else if (p.relation === 'changed' && p.currentEtag) headers['If-Match'] = p.currentEtag
    update(item.id, { phase: 'saving', error: undefined })
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(p.reportId)}`, { method: 'PUT', headers, body: item.text, credentials: 'same-origin' })
      const body = await readJson(res)
      if (!res.ok || !body.ok) {
        const conflict = res.status === 409 || res.status === 412
        return update(item.id, {
          phase: 'error',
          error: `${body.message ?? '저장에 실패했습니다.'}${conflict ? ' 다시 미리보기를 실행해 최신 상태를 확인하세요.' : ''} (HTTP ${res.status})`,
        })
      }
      // DB에 실제로 저장됐는지 다시 조회해 해시를 대조한 뒤에만 완료로 표시한다.
      update(item.id, { phase: 'verifying' })
      const check = await fetch(`/api/reports/${encodeURIComponent(p.reportId)}`, { credentials: 'same-origin', cache: 'no-store' })
      const stored = await readJson(check)
      if (!check.ok || stored?.report?.contentHash !== body.contentHash)
        return update(item.id, { phase: 'error', error: '저장 응답은 받았지만 데이터베이스 재조회로 확인하지 못했습니다. 목록에서 다시 확인하세요.' })
      update(item.id, { phase: 'saved', result: { result: body.result, savedAt: stored.report.updatedAt, contentHash: body.contentHash, reportPath: body.reportPath } })
    } catch {
      update(item.id, { phase: 'error', error: '네트워크 오류로 저장 여부를 확인하지 못했습니다. 목록에서 저장 여부를 확인하세요.' })
    }
  }

  return (
    <div data-ready={ready ? 'true' : 'false'}>
      <div
        className={`dropzone${drag ? ' drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files)
        }}
      >
        <p>
          <b>보고서 JSON 파일</b>을 끌어다 놓거나 선택하세요. 여러 파일을 한 번에 선택할 수 있습니다(파일당 최대 2MB).
        </p>
        <label className="button primary" htmlFor="json-files">
          JSON 파일 선택
        </label>
        <input
          ref={inputRef}
          id="json-files"
          type="file"
          accept="application/json,.json"
          multiple
          disabled={!ready}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files)
            if (inputRef.current) inputRef.current.value = ''
          }}
        />
        <p className="note">선택만으로는 저장되지 않습니다. 서버 검증 → 미리보기 → 저장 → 데이터베이스 재조회 확인 순서로 진행됩니다.</p>
      </div>

      <div aria-live="polite">
        {items.map((item) => (
          <ImportItem key={item.id} item={item} onConfirm={(v) => update(item.id, { confirm: v })} onSave={() => save(item)} onRetry={() => item.text && runPreview(item.id, item.text)} />
        ))}
      </div>
    </div>
  )
}

const PHASE_LABEL: Record<Phase, string> = {
  reading: '파일 읽는 중',
  previewing: '서버 검증 중',
  preview: '미리보기 · 아직 저장되지 않음',
  invalid: '검증 실패 · 저장되지 않음',
  saving: '데이터베이스에 저장 중',
  verifying: '저장 확인 중(재조회)',
  saved: '저장 완료 · DB 재조회 확인됨',
  unchanged: '변경 없음 · 이미 동일한 내용이 저장됨',
  error: '오류',
}

function ImportItem({ item, onConfirm, onSave, onRetry }: { item: Item; onConfirm: (v: boolean) => void; onSave: () => void; onRetry: () => void }) {
  const p = item.preview
  const tone = item.phase === 'saved' ? 'success' : item.phase === 'invalid' || item.phase === 'error' ? 'error' : item.phase === 'unchanged' ? 'info' : 'warn'
  const summary = p?.summary as
    | { type?: string; period?: { start: string; end: string }; observedOn?: string; metrics?: { id: string; label?: string; current: number | null; previous: number | null }[]; counts?: Record<string, number | null>; channelShareSum?: number }
    | undefined
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h3 style={{ margin: 0 }}>{item.fileName}</h3>
        <span className={`badge ${tone === 'success' ? '' : tone === 'error' ? 'danger' : tone === 'info' ? 'neutral' : 'warn'}`}>{PHASE_LABEL[item.phase]}</span>
      </div>
      {item.error && (
        <div className="alert error" role="alert">
          {item.error}
        </div>
      )}
      {p?.errors && p.errors.length > 0 && (
        <div className="alert error">
          <b>검증 오류 {p.errors.length}건</b>
          <ul className="kv-list">
            {p.errors.slice(0, 50).map((e, i) => (
              <li key={i}>
                <span className="mono">{e.path}</span> {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {p?.ok && summary && (
        <dl className="meta">
          <dt>보고서 ID</dt>
          <dd className="mono">{p.reportId}</dd>
          <dt>유형</dt>
          <dd>{summary.type}</dd>
          {summary.period && (
            <>
              <dt>보고 기간</dt>
              <dd>
                {summary.period.start} ~ {summary.period.end}
              </dd>
            </>
          )}
          <dt>관측일</dt>
          <dd>{summary.observedOn}</dd>
          {summary.metrics && (
            <>
              <dt>핵심 수치</dt>
              <dd>{summary.metrics.map((m) => `${m.label ?? m.id} ${m.current ?? '미수집'} (직전 ${m.previous ?? '미수집'})`).join(' · ')}</dd>
            </>
          )}
          {summary.counts && (
            <>
              <dt>항목 수</dt>
              <dd>
                {Object.entries(summary.counts)
                  .map(([k, v]) => `${k} ${v ?? '미수집'}`)
                  .join(' · ')}
                {typeof summary.channelShareSum === 'number' ? ` · 유입 비중 합계 ${summary.channelShareSum}%` : ''}
              </dd>
            </>
          )}
          {p.savedAt && (
            <>
              <dt>기존 저장 시각</dt>
              <dd>{kst(p.savedAt)}</dd>
            </>
          )}
        </dl>
      )}
      {p?.warnings && p.warnings.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className="note">경고·참고 {p.warnings.length}건(저장 가능)</summary>
          <ul className="kv-list note">
            {p.warnings.map((w, i) => (
              <li key={i}>
                <span className="mono">{w.path}</span> {w.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {item.phase === 'preview' && p?.relation === 'changed' && (
        <div className="alert warn" style={{ marginTop: 12 }}>
          <b>같은 ID의 다른 보고서가 이미 저장되어 있습니다.</b> 교체하면 현재 저장본은 수정 이력(리비전)으로 보존됩니다.
          {p.changes && p.changes.length > 0 ? (
            <div className="table-wrap" style={{ marginTop: 8, background: '#fff' }}>
              <table>
                <caption className="sr-only">변경되는 핵심 필드</caption>
                <thead>
                  <tr>
                    <th scope="col">핵심 필드</th>
                    <th scope="col">현재 저장본</th>
                    <th scope="col">새 파일</th>
                  </tr>
                </thead>
                <tbody>
                  {p.changes.map((c) => (
                    <tr key={c.field}>
                      <td className="mono">{c.field}</td>
                      <td>{c.before}</td>
                      <td>{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>핵심 수치는 같고 설명 문구 등만 다릅니다.</p>
          )}
          {p.changedSections && <p className="note">변경된 최상위 항목: {p.changedSections.join(', ')}</p>}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <input type="checkbox" checked={item.confirm} onChange={(e) => onConfirm(e.target.checked)} />
            기존 보고서를 이 파일로 교체하고 이전 내용은 리비전으로 보존하는 데 동의합니다.
          </label>
        </div>
      )}
      <div className="actions" style={{ marginTop: 12 }}>
        {item.phase === 'preview' && p?.relation === 'new' && (
          <button type="button" className="button primary" onClick={onSave}>
            데이터베이스에 저장
          </button>
        )}
        {item.phase === 'preview' && p?.relation === 'changed' && (
          <button type="button" className="button danger" disabled={!item.confirm} onClick={onSave}>
            확인 후 교체 저장
          </button>
        )}
        {(item.phase === 'error' || item.phase === 'invalid') && item.text && (
          <button type="button" className="button" onClick={onRetry}>
            다시 검증
          </button>
        )}
        {item.phase === 'saved' && item.result && (
          <>
            <span className="note">
              {item.result.result === 'created' ? '신규 저장' : item.result.result === 'updated' ? '교체 저장(이전 리비전 보존)' : '변경 없음'} · 저장 시각 {kst(item.result.savedAt)} · 해시{' '}
              <span className="mono">{item.result.contentHash.slice(0, 12)}…</span>
            </span>
            <Link className="button primary" href={item.result.reportPath}>
              저장된 보고서 보기
            </Link>
          </>
        )}
        {item.phase === 'unchanged' && p?.reportId && (
          <Link className="button" href={p.reportType === 'baseline' ? '/baseline' : `/reports/${encodeURIComponent(p.reportId)}`}>
            저장된 보고서 보기
          </Link>
        )}
      </div>
    </div>
  )
}
