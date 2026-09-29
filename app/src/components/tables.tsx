'use client'

import { useId, useMemo, useState } from 'react'
import { num } from '@/lib/format'

export interface Column<T> {
  key: string
  header: string
  numeric?: boolean
  render: (row: T) => React.ReactNode
  text?: (row: T) => string
}

/**
 * 검색·전체 보기 토글이 있는 표. 필터로 숨긴 행과 접힌 영역도 인쇄 시에는 모두 출력된다(CSS).
 */
export function DataTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  searchLabel,
  collapsedRows = 10,
  downloadHref,
  downloadLabel = 'CSV 저장',
  emptyText = '표시할 항목이 없습니다.',
}: {
  caption: string
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T, index: number) => string
  searchLabel?: string
  collapsedRows?: number
  downloadHref?: string
  downloadLabel?: string
  emptyText?: string
}) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)
  const inputId = useId()
  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () =>
      rows.map((r) =>
        !q ? true : columns.some((c) => (c.text ? c.text(r) : String(c.render(r) ?? '')).toLowerCase().includes(q)),
      ),
    [rows, columns, q],
  )
  const visibleCount = matches.filter(Boolean).length
  const canCollapse = rows.length > collapsedRows && !q
  let shown = 0

  return (
    <div className={`collapsible${canCollapse && !expanded ? ' collapsed' : ''}`}>
      {(searchLabel || downloadHref || canCollapse) && (
        <div className="controls no-print">
          {searchLabel && (
            <>
              <label className="sr-only" htmlFor={inputId}>
                {searchLabel}
              </label>
              <input id={inputId} type="search" placeholder={searchLabel} value={query} onChange={(e) => setQuery(e.target.value)} />
            </>
          )}
          {canCollapse && (
            <button type="button" className="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
              {expanded ? '접기' : `전체 ${num(rows.length)}개 보기`}
            </button>
          )}
          {downloadHref && (
            <a className="button" href={downloadHref} download>
              {downloadLabel}
            </a>
          )}
          <span className="note" aria-live="polite">
            {q ? `검색 결과 ${visibleCount}개 / 전체 ${rows.length}개` : `전체 ${rows.length}개`}
          </span>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={c.numeric ? 'num' : undefined}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="empty">
                  {emptyText}
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const match = matches[i]
              if (match) shown++
              const hiddenByCollapse = canCollapse && !expanded && shown > collapsedRows
              return (
                <tr key={rowKey(r, i)} className={!match || hiddenByCollapse ? 'is-filtered-out' : undefined}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.numeric ? 'num' : undefined}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              )
            })}
            {rows.length > 0 && visibleCount === 0 && (
              <tr className="no-print">
                <td colSpan={columns.length} className="empty">
                  검색 결과가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
