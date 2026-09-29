import Link from 'next/link'
import { DailyBars, HBars } from '@/components/charts'
import { PrintButton } from '@/components/PrintButton'
import { RankTable } from '@/components/reportTables'
import { TrafficSwitcher } from '@/components/TrafficSwitcher'
import { requireAdminPage } from '@/lib/auth'
import { dotDate, kstDateTime, periodLabel } from '@/lib/dates'
import { bytes, changePercentText, count, duration, num, percent } from '@/lib/format'
import { listSourceFiles } from '@/lib/ops'
import { parseDemo, sixtyDayViews, thirtyDayMetrics, trafficViews, weekDurations } from '@/lib/report/baseline'
import { getReport, latestBaseline, listBaselines, REPORT_ID_PATTERN } from '@/lib/report/store'
import { findChannelShare } from '@/lib/report/traffic'
import type { BaselineReport, StoredReport } from '@/lib/report/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: '최초 종합분석' }

export default async function BaselinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { supabase } = await requireAdminPage()
  const sp = await searchParams
  let stored: StoredReport<BaselineReport> | null = null
  if (sp.reportId && REPORT_ID_PATTERN.test(sp.reportId)) {
    const s = await getReport(supabase, sp.reportId)
    if (s?.reportType === 'baseline') stored = s as StoredReport<BaselineReport>
  } else stored = await latestBaseline(supabase)
  const [all, sources] = await Promise.all([listBaselines(supabase), listSourceFiles(supabase)])

  if (!stored)
    return (
      <>
        <div className="topline">
          <div>
            <div className="eyebrow">Baseline analysis</div>
            <h1>최초 종합분석</h1>
          </div>
        </div>
        <div className="card empty">
          <p>저장된 종합분석(baseline) 보고서가 없습니다.</p>
          <Link className="button primary" href="/admin/import">
            JSON 업로드로 이동
          </Link>
        </div>
      </>
    )

  const r = stored.payload
  const P = r.periods
  const thirty = thirtyDayMetrics(r)
  const pv30 = thirty.find((m) => m.key === 'pv')!
  const views = trafficViews(r)
  const weeklyView = views.find((v) => v.key === 'weekly')
  const week = r.analysisData.week ?? {}
  const snapshot = r.intradaySnapshot as { asOf?: string; pageViews?: number; threadsSharePercent?: number; complete?: boolean; note?: string }
  const profile = r.publicProfile as { blogNeighborDisplay?: number; widgetNeighborDisplay?: number; interpretation?: string }
  const weeklyThreads = weeklyView ? findChannelShare(weeklyView.channels, /threads/i) : null
  const ownSite = weeklyView ? weeklyView.channels.find((c) => /ko372\.com/i.test(c.name)) : undefined
  const topKeyword = weeklyView?.keywords[0]
  const demo = parseDemo(r.analysisData.demo ?? [])
  const devices = (r.analysisData.device ?? []).map((d) => ({ device: String(d[0]), views: Number(d[1]), share: Number(d[2]) }))
  const deviceTotal = devices.reduce((s, d) => s + d.views, 0)
  const topics = Object.entries(r.analysisData.topics ?? {}).map(([name, t]) => ({ name, views: t.views, posts: t.posts }))
  const topicTotal = topics.reduce((s, t) => s + t.views, 0)
  const rank = r.analysisData.rank ?? []
  const rankTotal = typeof r.analysisData.rankTotal === 'number' ? (r.analysisData.rankTotal as number) : null
  const durations = weekDurations(r)
  const sourceByName = new Map(sources.map((s) => [s.file_name, s]))
  const snapshotDate = typeof snapshot.asOf === 'string' ? snapshot.asOf.slice(0, 16).replace('T', ' ') : '확인 불가'
  const DEVICE: Record<string, string> = { mobile: '모바일', pc: 'PC' }
  const up = (v: number | null) => (v === null ? '비교 불가' : v >= 0 ? '증가' : '감소')

  return (
    <>
      <div className="topline">
        <div>
          <div className="eyebrow">Baseline analysis</div>
          <h1 id="report-title">최초 종합분석</h1>
          <p className="muted">
            {r.blogName} · 관측일 {dotDate(r.observedOn)} · 사이트 저장 {kstDateTime(stored.updatedAt)}
          </p>
        </div>
        <div className="actions no-print">
          <PrintButton />
          {all.length > 1 && (
            <form method="get" className="controls" style={{ margin: 0 }}>
              <label className="sr-only" htmlFor="bl">
                종합분석 선택
              </label>
              <select id="bl" name="reportId" defaultValue={stored.reportId}>
                {all.map((b) => (
                  <option key={b.reportId} value={b.reportId}>
                    {dotDate(b.observedOn)} 관측
                  </option>
                ))}
              </select>
              <button className="button" type="submit">
                보기
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="hero">
        <div>
          <span className="badge today" style={{ marginBottom: 8 }}>
            {dotDate(r.observedOn)} 확인 · 정적 이관본
          </span>
          <h2>
            최근 30일 조회수는 직전 30일보다 <strong>{changePercentText(pv30.changePercent)}</strong> {up(pv30.changePercent)}했습니다.
          </h2>
          <p>
            최근 완료 주간({periodLabel(P.weekly)})에는 네이버 블로그 경유가 {weeklyView ? percent(weeklyView.groups.naverBlog) : '미수집'}로 가장 큰 비중입니다. 이 화면은 {dotDate(r.observedOn)}{' '}
            당시 분석 자료이며 새로 조회한 최신 통계가 아닙니다.
          </p>
        </div>
        <div className="hero-status">
          <span>최근 30일 조회수</span>
          <b>{changePercentText(pv30.changePercent)}</b>
          <span>
            {count(pv30.previous)} → {count(pv30.current)}
          </span>
          <span>동일한 30일끼리 비교</span>
        </div>
      </div>

      <div className="scope">
        기간을 구분해서 읽어주세요. <span className="badge thirty">30일</span> 방문 추이 {periodLabel(P.current30Days)} 대 {periodLabel(P.previous30Days)} ·{' '}
        <span className="badge weekly">주간</span> 유입/콘텐츠/독자 {periodLabel(P.weekly)} (비교 {periodLabel(P.previousWeek)}) · <span className="badge monthly">월간</span> 유입 참고{' '}
        {periodLabel(P.monthlyTraffic)} · <span className="badge today">오늘</span> 미완료 수치는 본 집계에서 제외.
      </div>

      <section className="section" aria-labelledby="b-30">
        <div className="section-head">
          <div>
            <div className="eyebrow">30-day comparison</div>
            <h2 id="b-30">최근 30일 비교</h2>
            <p>
              {periodLabel(P.current30Days, 'dot')} 대 {periodLabel(P.previous30Days, 'dot')}, 각각 30일. 일별 다운로드 자료에서 합계·일평균을 계산했습니다.
            </p>
          </div>
          <span className="badge thirty">30일</span>
        </div>
        <div className="grid four">
          {thirty.map((m) => (
            <div className="card metric" key={m.key}>
              <div className="label">
                <span>{m.label}</span>
                <span className="badge thirty">30일</span>
              </div>
              <div className={`value${m.current === null ? ' missing' : ''}`}>{m.current === null ? '미수집' : `${num(m.current, 1)}${m.unit}`}</div>
              <div className={`delta ${m.changePercent === null ? 'na' : m.changePercent < 0 ? 'down' : ''}`}>
                직전 {m.previous === null ? '미수집' : `${num(m.previous, 1)}${m.unit}`} · {changePercentText(m.changePercent)}
              </div>
              <div className="foot">
                {m.note}
                {m.perDay && ` (일별 합계 ${count(m.perDay.current, '')} vs ${count(m.perDay.previous, '')})`}
              </div>
            </div>
          ))}
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h3>최근 60일 조회 흐름</h3>
            <div className="legend">
              <span>
                <i style={{ background: '#087f79' }} />
                최근 30일
              </span>
              <span>
                <i style={{ background: '#bbcbd2' }} />
                직전 30일
              </span>
            </div>
          </div>
          <DailyBars id="b-60" title={`일별 조회수 ${periodLabel(P.previous30Days)}~${periodLabel(P.current30Days)}`} rows={sixtyDayViews(r)} />
        </div>
      </section>

      <section className="section" aria-labelledby="b-week">
        <div className="section-head">
          <div>
            <div className="eyebrow">Completed week</div>
            <h2 id="b-week">최근 완료 주간의 변화</h2>
            <p>
              {periodLabel(P.weekly)} 대 {periodLabel(P.previousWeek)} · 순방문자는 네이버 주간 중복 제거 집계입니다.
            </p>
          </div>
          <span className="badge weekly">주간</span>
        </div>
        <div className="grid four">
          {[
            { label: '조회수', cur: week.pv, prev: week.previousPv, fmt: (v: number) => count(v) },
            { label: '순방문자(주간 중복 제거)', cur: week.uv, prev: week.previousUv, fmt: (v: number) => count(v, '명') },
            { label: '재방문율', cur: week.retention, prev: week.previousRetention, fmt: (v: number) => percent(v, 1), pp: true },
            { label: '평균 사용 시간', cur: week.seconds, prev: week.previousSeconds, fmt: (v: number) => duration(v), sec: true },
          ].map((m) => (
            <div className="card metric" key={m.label}>
              <div className="label">
                <span>{m.label}</span>
                <span className="badge weekly">주간</span>
              </div>
              <div className="value">{typeof m.cur === 'number' ? m.fmt(m.cur) : '미수집'}</div>
              <div className="delta">
                직전 주 {typeof m.prev === 'number' ? m.fmt(m.prev) : '미수집'}
                {typeof m.cur === 'number' && typeof m.prev === 'number' && m.pp && ` · ${m.cur - m.prev >= 0 ? '+' : '−'}${num(Math.abs(m.cur - m.prev), 1)}%p`}
                {typeof m.cur === 'number' && typeof m.prev === 'number' && m.sec && ` · ${m.cur - m.prev >= 0 ? '+' : '−'}${duration(Math.abs(m.cur - m.prev))}`}
              </div>
            </div>
          ))}
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <h3>
            오늘의 별도 신호 <span className="badge today">오늘 · 미완료</span>
          </h3>
          <p>
            {snapshotDate} 화면 기준 조회수 {count(snapshot.pageViews)}, Threads 유입 비중 {percent(snapshot.threadsSharePercent)}. 최근 완료 주간 Threads 비중은{' '}
            {percent(weeklyThreads)}입니다.
          </p>
          <p className="note">{snapshot.note ?? '집계 중인 하루의 변화이며 지속 성장으로 단정할 수 없습니다.'} 완료 주간·30일 지표에 합산하지 않았습니다.</p>
        </div>
      </section>

      <section className="section" aria-labelledby="b-acq">
        <div className="section-head">
          <div>
            <div className="eyebrow">Acquisition</div>
            <h2 id="b-acq">독자는 어디에서 들어오나요?</h2>
            <p>선택 기간에 네이버가 표시한 유입경로 전체를 수록했습니다.</p>
          </div>
        </div>
        <TrafficSwitcher views={views} reportId={r.reportId} />
        {weeklyView && (
          <div className="card" style={{ marginTop: 16 }}>
            <h3>유입경로별 운영 판단 ({periodLabel(P.weekly)} 기준)</h3>
            <div className="signal">
              <b>네이버 블로그 경유: 관계를 반복 방문으로</b>
              <p>최근 주간 {percent(weeklyView.groups.naverBlog)}. 이웃 활동 자체보다 글 끝의 관련 글 연결로 부동산 주제 안에서 다음 읽기를 유도하는 것을 권합니다.</p>
            </div>
            <div className="signal">
              <b>검색: 계절 키워드와 실무 키워드를 분리</b>
              <p>
                최근 주간 검색 경유 {percent(weeklyView.groups.search)}
                {topKeyword ? `, 상위 검색어 ‘${topKeyword.keyword}’ ${percent(topKeyword.sharePercent)}` : ''}. 꾸준히 필요한 실무 주제는 별도 묶음으로 관리하세요.
              </p>
            </div>
            <div className="signal">
              <b>Threads: 유입 실험은 유효, 전환 검증은 필요</b>
              <p>
                최근 주간 {percent(weeklyThreads)}, 오늘 화면 {percent(snapshot.threadsSharePercent)}. 연결한 글의 읽기와 문의까지 이어졌는지는 이 통계로 알 수 없습니다.
              </p>
            </div>
            {ownSite && (
              <div className="signal">
                <b>자체 사이트: 작은 연결고리 확인</b>
                <p>
                  최근 주간 {ownSite.name} {percent(ownSite.sharePercent)}. 어떤 버튼·페이지가 효과적인지는 별도 클릭/문의 계측이 필요합니다.
                </p>
              </div>
            )}
            <p className="note">이 운영 판단은 주간 기준이며, 위 기간 선택과 관계없이 유지됩니다.</p>
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="b-content">
        <div className="section-head">
          <div>
            <div className="eyebrow">Content & audience</div>
            <h2 id="b-content">어떤 글이 읽히고, 누가 읽나요?</h2>
            <p>서로 다른 집계 기준을 섞지 않고 표시했습니다. {periodLabel(P.weekly)}</p>
          </div>
          <span className="badge weekly">주간</span>
        </div>
        <div className="grid wide">
          <div className="card">
            <h3>조회된 게시물 {rank.length}개</h3>
            <RankTable rows={rank} />
            <p className="note">게시물 제목은 원자료 인용이며 법률·세제 설명의 정확성을 검증한 결과가 아닙니다.</p>
          </div>
          <div className="card">
            <h3>주제별 성과</h3>
            <HBars rows={topics.map((t) => ({ label: t.name, value: t.views, note: `· ${t.posts}개 글` }))} />
            <p className="note">
              다운로드 순위의 {rank.length}개 항목, 합계 {count(rankTotal ?? topicTotal)}만 제목 기준으로 분류했습니다(네이버 공식 카테고리 통계 아님). 블로그 전체 조회수{' '}
              {count(week.pv)}와의 차이 {typeof week.pv === 'number' && rankTotal !== null ? count(week.pv - rankTotal) : '확인 불가'}는 원인이 확인되지 않아 같은 분모로 비율을
              계산하지 않았습니다. 이후 올라온 글은 이 주간 범위 밖이므로 이 수치로 성과를 판단하지 않습니다.
            </p>
          </div>
        </div>
        <div className="grid three" style={{ marginTop: 16 }}>
          <div className="card">
            <h3>기기별</h3>
            <HBars rows={devices.map((d) => ({ label: `${DEVICE[d.device] ?? d.device} (${percent(d.share, 1)})`, value: d.views }))} />
            <p className="note">기기별 조회 합계 {count(deviceTotal)}.</p>
          </div>
          <div className="card">
            <h3>성별·연령</h3>
            <HBars unit="%" max={100} rows={demo.genders.map((g) => ({ label: `${g.gender === '남' ? '남성' : g.gender === '여' ? '여성' : g.gender} (${count(g.views)})`, value: g.share }))} />
            <p className="note">
              45세 이상 조회 비중 {percent(demo.over45Share, 1)}. 성·연령 정보가 집계된 조회 {count(demo.total)} 기준이며 전체 조회수나 순방문자의 성별 비율이 아닙니다.
            </p>
          </div>
          <div className="card">
            <h3>주간 평균 사용 시간 기록</h3>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">주간 평균 사용 시간</caption>
                <thead>
                  <tr>
                    <th scope="col">주간</th>
                    <th scope="col" className="num">
                      평균
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {durations.map((d) => (
                    <tr key={d.start}>
                      <td>{periodLabel({ start: d.start, end: d.end })}</td>
                      <td className="num">{duration(d.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">네이버 주간 지표이며 완독률이나 개별 글 체류시간이 아닙니다.</p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="b-home">
        <div className="section-head">
          <div>
            <div className="eyebrow">Public home</div>
            <h2 id="b-home">공개 홈 구조 진단</h2>
            <p>{dotDate(r.observedOn)} 공개 블로그 홈 확인 내용</p>
          </div>
        </div>
        <div className="grid two">
          <div className="card">
            <h3>이웃 표시 수</h3>
            <dl className="meta">
              <dt>공개 홈 ‘블로그 이웃’</dt>
              <dd>{count(profile.blogNeighborDisplay, '명')}</dd>
              <dt>이웃 위젯 ‘전체 이웃’</dt>
              <dd>{count(profile.widgetNeighborDisplay, '명')}</dd>
            </dl>
            <p className="note">{profile.interpretation ?? '표시 기준이 확인되지 않았습니다.'}</p>
          </div>
          <div className="card">
            <h3>확인한 구조</h3>
            <ul className="kv-list">
              <li>법률·공법 / AI 중개실무 / 투자 / 강의·자료 / 소개의 진입 메뉴가 있습니다.</li>
              <li>상단 최신 글에는 유튜브·AI와 부동산 실무 글이 함께 노출됩니다.</li>
              <li>‘실전 투자·정비사업’ 영역에 명언 글, ‘강의·후기’ 영역에 세제 글이 노출돼 주제 정렬을 점검할 여지가 있습니다.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="b-next">
        <div className="section-head">
          <div>
            <div className="eyebrow">Next 30 days</div>
            <h2 id="b-next">기존 개선 제안</h2>
            <p>종합분석 당시의 실행 제안입니다. 게시글·설정 변경이나 자동 작업은 하지 않았습니다. 효과는 가설이며 보장하지 않습니다.</p>
          </div>
        </div>
        <div className="card steps">
          {[
            ['실무 글 3개 묶음을 먼저 연결', '① 전세·보증금 ② 정비사업·조합원 ③ 건축물대장·허가를 각각 묶고, 글 끝에 관련 글 링크 2개와 다음 행동 1개를 배치하는 것을 권합니다.', `확인 지표: 해당 묶음 조회수, 주간 재방문율 · 현재 재방문율 ${percent(week.retention, 1)}`],
            ['홈의 주제와 대표 글을 일치시키기', '분류가 어긋난 노출을 점검하고, 전문 분야별로 ‘처음 읽을 글’을 정해 진입 경로를 단순화하세요.', '확인 지표: 대표 글 조회수와 후속 글 조회수 · 클릭 전환율은 별도 계측 필요'],
            ['계절 유입과 전문 검색 성과를 따로 기록', '계절성 여행 글은 별도 성과로 유지하고, 핵심 검색어는 보증보험·선순위·허가·건축물대장 중심으로 관리하세요. 주간 비중 하락만으로 검색 유입 건수 감소를 단정하지 마세요.', '확인 지표: 검색 유입의 실무 키워드 구성 · 같은 기간끼리 비교'],
            ['Threads는 글별 연결 실험으로', '한 게시물에서 한 블로그 글로 연결하고 연결 기록을 남기세요. 문의에 출처 선택 항목을 두면 이후 전환을 구분하는 데 도움이 됩니다.', '확인 지표: Threads 유입 비중·연결 글 조회·출처가 확인된 문의 수'],
            ['AI 글은 ‘부동산 업무 해결’로 이어주기', '일반 AI 주제에서 중개 설명, 매물 비교, 고객 응대처럼 블로그의 전문성과 연결되는 사례로 안내하세요. 새 글은 발행 후 같은 7일 구간끼리 비교하세요.', '확인 지표: AI 글별 발행 후 7일 조회수와 후속 실무 글 성과'],
          ].map(([title, body, metric], i) => (
            <div className="step" key={title}>
              <div className="step-no" aria-hidden="true">
                {i + 1}
              </div>
              <div>
                <b>{title}</b>
                <p className="note" style={{ color: 'var(--ink)' }}>
                  {body}
                </p>
                <p className="note">{metric}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="alert warn" style={{ marginTop: 16 }}>
          <b>확인되지 않은 것</b> — 상담·강의 신청·매출 전환, 검색 노출수와 클릭률, 검색 순위, 외부 링크 클릭률, 공개 홈 이웃 표시 두 값의 정의 차이, 게시물 제목의 법률·세제 내용
          정확성.
        </div>
      </section>

      <section className="section" aria-labelledby="b-src">
        <div className="section-head">
          <div>
            <div className="eyebrow">Sources & methodology</div>
            <h2 id="b-src">출처와 집계 기준</h2>
          </div>
        </div>
        <div className="grid two">
          <div className="card">
            <h3>집계 기준과 한계</h3>
            <ul className="kv-list">
              {r.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
              <li>유입 다운로드는 상위 10개+기타로 묶여 있어 화면 목록으로 ‘기타’를 분해했습니다. 플랫폼 미제공 항목은 복원하지 않았습니다.</li>
              <li>재방문율 다운로드 파일의 기본 선택은 재방문자수이므로 비율과 구분했습니다.</li>
            </ul>
          </div>
          <div className="card">
            <h3>근거 원자료 {r.sourceFiles.length}개</h3>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">원자료 파일</caption>
                <thead>
                  <tr>
                    <th scope="col">파일</th>
                    <th scope="col">사이트 등록</th>
                  </tr>
                </thead>
                <tbody>
                  {r.sourceFiles.map((f) => {
                    const name = f.split('/').pop() ?? f
                    const s = sourceByName.get(name)
                    return (
                      <tr key={f}>
                        <td>{name}</td>
                        <td>
                          {s ? (
                            <a href={`/api/sources/${s.source_id}`} download>
                              다운로드 ({bytes(s.byte_size)})
                            </a>
                          ) : (
                            <span className="note">미등록</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="note">
              원자료는 관리자 업로드 화면에서 등록한 경우에만 로그인한 관리자에게 제공됩니다. <Link href="/admin/import#sources">원자료 등록</Link>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
