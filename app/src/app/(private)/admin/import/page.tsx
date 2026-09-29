import { ImportClient } from '@/components/ImportClient'
import { SourceUploader } from '@/components/SourceUploader'
import { requireAdminPage } from '@/lib/auth'
import { kstDateTime } from '@/lib/dates'
import { bytes } from '@/lib/format'
import { listSourceFiles } from '@/lib/ops'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'JSON 업로드' }

export default async function ImportPage() {
  const { supabase } = await requireAdminPage()
  const sources = await listSourceFiles(supabase)
  return (
    <>
      <div className="topline">
        <div>
          <div className="eyebrow">Admin import</div>
          <h1>보고서 JSON 업로드</h1>
          <p className="muted">
            contracts/report.schema.json(v1.0.0) 형식의 주간 보고서 또는 최초 종합분석 JSON을 저장합니다. 같은 주차를 다시 올려도 보고서가 중복 생성되지 않습니다.
          </p>
        </div>
      </div>
      <div className="alert info">
        서버가 크기(2MB)·JSON 파싱·스키마(날짜·URI 포맷 포함)·기간·ID·수치 대조를 검증한 뒤 미리보기를 보여줍니다. 저장은 버튼을 눌러야만 진행되며, 데이터베이스 재조회로 저장이
        확인된 뒤에만 ‘저장 완료’로 표시합니다.
      </div>
      <ImportClient />

      <section id="sources" className="section" aria-labelledby="src-h">
        <div className="section-head">
          <div>
            <div className="eyebrow">Source files</div>
            <h2 id="src-h">원자료 파일 등록(선택)</h2>
            <p>출처 검증용 XLSX/CSV를 데이터베이스에 비공개로 보관하고 관리자만 내려받습니다. 파일 형식은 내용(매직 바이트)으로 확인합니다.</p>
          </div>
        </div>
        <div className="card">
          <SourceUploader />
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <caption className="sr-only">등록된 원자료</caption>
              <thead>
                <tr>
                  <th scope="col">파일</th>
                  <th scope="col" className="num">
                    크기
                  </th>
                  <th scope="col">등록 시각</th>
                  <th scope="col">다운로드</th>
                </tr>
              </thead>
              <tbody>
                {sources.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      등록된 원자료가 없습니다.
                    </td>
                  </tr>
                )}
                {sources.map((s) => (
                  <tr key={s.source_id}>
                    <td>{s.file_name}</td>
                    <td className="num">{bytes(s.byte_size)}</td>
                    <td>{kstDateTime(s.uploaded_at)}</td>
                    <td>
                      <a href={`/api/sources/${s.source_id}`} download>
                        내려받기
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}
