'use client'

export function PrintButton() {
  return (
    <button type="button" className="button" onClick={() => window.print()}>
      인쇄 / PDF 저장
    </button>
  )
}
