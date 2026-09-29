'use client'

import { useState } from 'react'
import { Donut, PALETTE } from './charts'
import { ChannelsTable, DetailsTable, KeywordsTable } from './reportTables'
import { periodLabel } from '@/lib/dates'
import { percent } from '@/lib/format'
import { GROUP_LABEL } from '@/lib/report/traffic'
import type { TrafficView } from '@/lib/report/baseline'

/** 주간(9/21~9/27 등)과 월간 참고 유입을 분리해 전환한다. 서로 증감률로 비교하지 않는다. */
export function TrafficSwitcher({ views, reportId }: { views: TrafficView[]; reportId: string }) {
  const [key, setKey] = useState(views[0]?.key)
  const v = views.find((x) => x.key === key) ?? views[0]
  if (!v) return <p className="empty">유입 자료 미수집</p>
  return (
    <div>
      <div className="controls">
        <span className="note">유입 기간 선택</span>
        <div className="segmented" role="group" aria-label="유입 기간 선택">
          {views.map((x) => (
            <button key={x.key} type="button" aria-pressed={x.key === v.key} onClick={() => setKey(x.key)}>
              {x.label} · {periodLabel(x.period)}
            </button>
          ))}
        </div>
      </div>
      <p className="alert info" style={{ marginTop: 8 }}>
        <span className={`badge ${v.key === 'weekly' ? 'weekly' : 'monthly'}`}>{v.badge}</span> {periodLabel(v.period, 'dot')} 기준입니다. 월간 참고 자료는 주간 자료와
        전월 대비 증감률로 비교하지 않습니다.
      </p>
      <div className="grid">
        <div className="card">
          <h3>유입 구조</h3>
          <Donut
            label={`유입 구조 ${v.label}`}
            centerValue={percent(v.groups.naverBlog)}
            centerLabel="네이버 블로그 경유"
            parts={[
              { label: GROUP_LABEL.naverBlog, value: v.groups.naverBlog, color: PALETTE[0] },
              { label: GROUP_LABEL.search, value: v.groups.search, color: PALETTE[1] },
              { label: GROUP_LABEL.other, value: v.groups.other, color: PALETTE[5] },
            ]}
          />
          <p className="note">
            표시 경로 {v.channels.length}개 · 원 비중 합계 {percent(v.groups.total)}(반올림 오차 보존). 검색 경유는 ‘검색’이 들어간 경로(검색 광고 표시 경로 포함)와 Google의 합계입니다.
          </p>
        </div>
        <div className="card">
          <h3>전체 유입경로</h3>
          <ChannelsTable channels={v.channels} caption={`유입경로 ${v.label}`} downloadHref={undefined} />
          <p className="note">유입분석의 비율이며 조회수 대비 비율이 아닙니다.</p>
        </div>
      </div>
      <div className="grid two" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>실제 유입 검색어</h3>
          <KeywordsTable keywords={v.keywords} />
          <p className="note">다운로드된 상세 항목에서 동일 검색어의 비중을 합산했습니다. 검색량·노출수·클릭률이 아닙니다.</p>
        </div>
        <div className="card">
          <h3>상세 유입 URL</h3>
          <DetailsTable rows={v.details} />
          <p className="note">원자료 URL의 쿼리 문자열은 제거된 사본이며, 링크로 열지 않고 텍스트로만 표시합니다. ({reportId})</p>
        </div>
      </div>
    </div>
  )
}
