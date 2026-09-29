import { DailyBars, Donut, HBars, PALETTE } from './charts'
import { ChannelsTable, KeywordsTable, PostsTable } from './reportTables'
import { dotDate, kstDateTime, periodLabel } from '@/lib/dates'
import { changePercentText, changeText, count, duration, metricValue, percent, people } from '@/lib/format'
import { safeHttpUrl } from '@/lib/report/validate'
import { findChannelShare, GROUP_LABEL, groupShares } from '@/lib/report/traffic'
import type { Metric, MetricId, WeeklyReport } from '@/lib/report/types'

const ORDER: { id: MetricId; label: string; basis: string }[] = [
  { id: 'pageViews', label: '조회수', basis: '기간 내 조회수 합계' },
  { id: 'uniqueVisitors', label: '순방문자(주간 중복 제거)', basis: '네이버 주간 중복 제거 집계' },
  { id: 'visits', label: '방문 횟수', basis: '일별 방문 횟수 합계' },
  { id: 'retentionRate', label: '재방문율', basis: '증감은 퍼센트포인트(%p)' },
  { id: 'averageDuration', label: '평균 사용 시간', basis: '네이버 주간 지표' },
  { id: 'neighborAdditions', label: '이웃 추가수', basis: '추가 집계이며 순증 아님' },
]

const DEVICE_LABEL: Record<string, string> = { mobile: '모바일', pc: 'PC' }
const GENDER_LABEL: Record<string, string> = { male: '남성', female: '여성' }

function MetricCard({ m, def }: { m: Metric | undefined; def: (typeof ORDER)[number] }) {
  if (!m)
    return (
      <div className="card metric">
        <div className="label">
          <span>{def.label}</span>
          <span className="badge weekly">주간</span>
        </div>
        <div className="value missing">미수집</div>
        <div className="foot">이 보고서에는 해당 지표가 수집되지 않았습니다.</div>
      </div>
    )
  const dir = m.change === null ? 'na' : m.change > 0 ? 'up' : m.change < 0 ? 'down' : 'flat'
  return (
    <div className="card metric">
      <div className="label">
        <span>{def.label}</span>
        <span className="badge weekly">주간</span>
      </div>
      <div className="value">{metricValue(m)}</div>
      <div className={`delta ${dir}`}>
        직전 주 대비 {changeText(m.unit, m.change)}
        {m.unit !== 'percent' ? ` (${changePercentText(m.changePercent)})` : m.changePercent !== null ? ` · 상대 ${changePercentText(m.changePercent)}` : ''}
      </div>
      <div className="foot">
        직전 주 {m.previous === null ? '미수집' : metricValue({ unit: m.unit, current: m.previous })} · {def.basis}
      </div>
    </div>
  )
}

export function WeeklyReportView({
  report,
  savedAt,
  createdAt,
  exportBase,
  heading,
}: {
  report: WeeklyReport
  savedAt: string
  createdAt: string
  exportBase: string // 예: /api/reports/ko372_.../export?  (revision 포함 가능)
  heading?: React.ReactNode
}) {
  const r = report
  const metric = (id: MetricId) => r.metrics.find((m) => m.id === id)
  const groups = groupShares(r.traffic.channels)
  const threads = findChannelShare(r.traffic.channels, /threads/i)
  const topPosts = r.content.posts.slice(0, 10)
  const ageFemale = r.audience.ages.reduce((s, a) => s + a.femaleViews, 0)
  const ageMale = r.audience.ages.reduce((s, a) => s + a.maleViews, 0)
  const ageTotal = ageFemale + ageMale
  const age45 = r.audience.ages
    .filter((a) => Number.parseInt(a.ageBand, 10) >= 45)
    .reduce((s, a) => s + a.maleViews + a.femaleViews, 0)
  const pv = metric('pageViews')
  const dailyRows = [...r.daily]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, value: d.pageViews, series: (d.date >= r.period.start ? 'current' : 'previous') as 'current' | 'previous' }))
  const exp = (kind: string) => `${exportBase}${exportBase.includes('?') ? '&' : '?'}kind=${kind}`

  return (
    <article aria-labelledby="report-title">
      {heading}
      <div className="scope">
        <b>보고 기간</b> {periodLabel(r.period, 'dot')} <span className="badge weekly">주간 월~일</span> · <b>비교 기간</b> {periodLabel(r.comparisonPeriod, 'dot')} ·{' '}
        <b>데이터 관측일</b> {dotDate(r.observedOn)} · <b>사이트 저장</b> {kstDateTime(savedAt)}
        {createdAt !== savedAt && <> (최초 저장 {kstDateTime(createdAt)})</>}
      </div>

      <nav className="controls no-print" aria-label="보고서 목차">
        <a className="button" href="#overview">운영 현황</a>
        <a className="button" href="#traffic">유입 전체 경로</a>
        <a className="button" href="#keywords">검색어</a>
        <a className="button" href="#content">콘텐츠</a>
        <a className="button" href="#audience">독자</a>
        <a className="button" href="#insights">개선 제안</a>
        <a className="button" href="#limits">근거·한계</a>
      </nav>

      <section id="overview" className="section" aria-labelledby="overview-h">
        <div className="section-head">
          <div>
            <div className="eyebrow">Weekly performance</div>
            <h2 id="overview-h">최근 주간 비교</h2>
            <p>
              {periodLabel(r.period)} 대 {periodLabel(r.comparisonPeriod)} · 순방문자는 네이버 주간 중복 제거 집계이며 일별 순방문자를 더한 값이 아닙니다.
            </p>
          </div>
        </div>
        <div className="grid three">
          {ORDER.map((def) => (
            <MetricCard key={def.id} m={metric(def.id)} def={def} />
          ))}
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h3>일별 조회수</h3>
            <div className="legend">
              <span>
                <i style={{ background: '#087f79' }} />
                보고 주간
              </span>
              <span>
                <i style={{ background: '#bbcbd2' }} />
                비교 주간
              </span>
            </div>
          </div>
          {dailyRows.length ? <DailyBars id="daily-pv" title={`일별 조회수 ${periodLabel(r.comparisonPeriod)}~${periodLabel(r.period)}`} rows={dailyRows} /> : <p className="empty">일별 자료 미수집</p>}
        </div>
      </section>

      <section id="traffic" className="section" aria-labelledby="traffic-h">
        <div className="section-head">
          <div>
            <div className="eyebrow">Acquisition</div>
            <h2 id="traffic-h">독자는 어디에서 들어오나요?</h2>
            <p>
              {periodLabel(r.traffic.period)} · 네이버가 표시한 유입경로 {r.traffic.channels.length}개 전체 · {r.traffic.denominator}
            </p>
          </div>
          <span className="badge weekly">주간</span>
        </div>
        <div className="grid">
          <div className="card">
            <h3>유입 구조</h3>
            {r.traffic.channels.length ? (
              <Donut
                label="유입 구조"
                centerValue={percent(groups.naverBlog)}
                centerLabel="네이버 블로그 경유"
                parts={[
                  { label: GROUP_LABEL.naverBlog, value: groups.naverBlog, color: PALETTE[0] },
                  { label: GROUP_LABEL.search, value: groups.search, color: PALETTE[1] },
                  { label: GROUP_LABEL.other, value: groups.other, color: PALETTE[5] },
                ]}
              />
            ) : (
              <p className="empty">유입경로 미수집</p>
            )}
            <p className="note">
              원 비중 합계 {percent(groups.total)}(반올림 오차는 보정하지 않음). 도넛 도형만 합계 기준으로 그렸습니다. 네이버 블로그 경유에는 홈·이웃·위젯·내부 이동 등이 섞일 수
              있어 모두 신규 독자로 해석하지 않습니다. 검색 경유는 경로명에 ‘검색’이 들어간 경로와 Google을 합산했습니다.
            </p>
            {threads !== null && <p className="note">Threads 경유: {percent(threads)} (이 주간 기준).</p>}
            <p className="note">
              직전 주 유입경로:{' '}
              {r.traffic.comparisonChannels ? `${r.traffic.comparisonChannels.length}개 수집` : `없음 — ${r.traffic.comparisonUnavailableReason ?? '사유 미기재'}`}
            </p>
          </div>
          <div className="card">
            <h3>전체 유입경로</h3>
            <ChannelsTable channels={r.traffic.channels} downloadHref={exp('channels')} caption={`유입경로 ${periodLabel(r.traffic.period)}`} />
            <p className="note">유입분석의 비율이며 조회수 대비 비율이 아닙니다. 게시물 조회수에 곱해 유입 건수를 추정하지 않습니다.</p>
          </div>
        </div>
      </section>

      <section id="keywords" className="section" aria-labelledby="kw-h">
        <div className="section-head">
          <div>
            <div className="eyebrow">Search keywords</div>
            <h2 id="kw-h">실제 유입 검색어</h2>
            <p>{r.traffic.keywordCoverage}</p>
          </div>
          <span className="badge weekly">주간</span>
        </div>
        <div className="card">
          <KeywordsTable keywords={r.traffic.keywords} downloadHref={exp('keywords')} />
          <p className="note">검색량·노출수·클릭률이 아니며, 숨겨진 ‘기타’ 검색어는 포함되지 않습니다.</p>
        </div>
      </section>

      <section id="content" className="section" aria-labelledby="content-h">
        <div className="section-head">
          <div>
            <div className="eyebrow">Content</div>
            <h2 id="content-h">어떤 글이 읽혔나요?</h2>
            <p>{r.content.coverage}</p>
          </div>
          <span className="badge weekly">주간</span>
        </div>
        <div className="grid wide">
          <div className="card">
            <h3>인기 게시물</h3>
            <PostsTable posts={r.content.posts} downloadHref={exp('posts')} collapsedRows={10} />
            <p className="note">
              처음 10개(TOP {Math.min(10, topPosts.length)})를 먼저 표시합니다. 게시물 제목은 원자료를 인용한 것이며 법률·세제 내용의 정확성을 검증한 결과가 아닙니다.
            </p>
          </div>
          <div className="card">
            <h3>주제별 성과</h3>
            <HBars rows={r.content.topics.map((t) => ({ label: t.name, value: t.pageViews, note: `· ${t.rankedPostCount}개 글` }))} />
            <div className="mini-stats">
              <div className="mini-stat">
                <b>{count(r.content.rankedViews)}</b>
                <span>순위 항목 {r.content.posts.length}개 합계</span>
              </div>
              <div className="mini-stat">
                <b>{count(r.content.blogPageViews)}</b>
                <span>블로그 전체 조회수</span>
              </div>
              <div className="mini-stat">
                <b>{r.content.unreconciledViews === null ? '확인 불가' : count(r.content.unreconciledViews)}</b>
                <span>차이(원인 미확인)</span>
              </div>
            </div>
            <p className="note">
              {r.content.topicMethod} 순위 합계와 전체 조회수의 차이는 이 자료에서 원인을 확인할 수 없어, 홈 조회나 누락으로 단정하지 않고 같은 분모로 비율을 계산하지 않았습니다.
            </p>
          </div>
        </div>
      </section>

      <section id="audience" className="section" aria-labelledby="aud-h">
        <div className="section-head">
          <div>
            <div className="eyebrow">Audience</div>
            <h2 id="aud-h">누가, 어떤 기기로 읽나요?</h2>
            <p>기기·성연령은 서로 다른 집계 기준이므로 섞지 않았습니다.</p>
          </div>
          <span className="badge weekly">주간</span>
        </div>
        <div className="grid three">
          <div className="card">
            <h3>기기별</h3>
            <HBars rows={r.audience.devices.map((d) => ({ label: `${DEVICE_LABEL[d.device] ?? d.device} (${percent(d.sharePercent, 1)})`, value: d.pageViews }))} />
            <p className="note">
              기준: {r.audience.deviceBasis}. 합계 {count(r.audience.devices.reduce((s, d) => s + d.pageViews, 0))}.
            </p>
          </div>
          <div className="card">
            <h3>성별</h3>
            <HBars
              unit="%"
              max={100}
              rows={r.audience.genders.map((g) => ({ label: `${GENDER_LABEL[g.gender] ?? g.gender} (${count(g.pageViews)})`, value: g.sharePercent }))}
            />
            <p className="note">
              기준: {r.audience.demographicBasis} {count(r.audience.demographicSampleViews)}. 전체 조회수나 순방문자 {people(metric('uniqueVisitors')?.current)}의 분포가 아닙니다.
            </p>
          </div>
          <div className="card">
            <h3>연령대</h3>
            <HBars rows={r.audience.ages.filter((a) => a.maleViews + a.femaleViews > 0).map((a) => ({ label: a.ageBand, value: a.maleViews + a.femaleViews }))} />
            <p className="note">
              45세 이상 조회 비중 {ageTotal ? percent((age45 / ageTotal) * 100, 1) : '확인 불가'} (성·연령 집계 조회 {count(ageTotal)} 기준). 실제 직업·투자 의향·구매력은 확인되지
              않았습니다.
            </p>
          </div>
        </div>
        {metric('averageDuration') && (
          <p className="note">평균 사용 시간 {duration(metric('averageDuration')?.current)}은 네이버 주간 지표이며 완독률이나 개별 글 체류시간이 아닙니다.</p>
        )}
      </section>

      <section id="insights" className="section" aria-labelledby="ins-h">
        <div className="section-head">
          <div>
            <div className="eyebrow">Insights</div>
            <h2 id="ins-h">관찰과 개선 제안</h2>
            <p>제안은 가설이며 효과를 보장하지 않습니다. 게시글·설정 변경이나 자동 작업은 하지 않았습니다.</p>
          </div>
        </div>
        <div className="card">
          {r.insights.length === 0 && <p className="empty">기록된 관찰·제안이 없습니다.</p>}
          {r.insights.map((i, idx) => (
            <div className="signal" key={idx}>
              <b>
                <span className={`pill${i.kind === 'recommendation' ? ' warn' : ''}`}>{i.kind === 'recommendation' ? '제안' : '관찰'}</span>
                {i.text}
              </b>
              {i.evidence.length > 0 && <p>근거: {i.evidence.join(', ')}</p>}
            </div>
          ))}
        </div>
      </section>

      <section id="limits" className="section" aria-labelledby="lim-h">
        <div className="section-head">
          <div>
            <div className="eyebrow">Sources & limits</div>
            <h2 id="lim-h">근거와 한계</h2>
          </div>
        </div>
        <div className="grid two">
          <div className="card">
            <h3>한계</h3>
            <ul className="kv-list">
              {r.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
              <li>문의·강의 신청·매출 전환, 검색 노출/클릭률/순위, 외부 링크 클릭률은 이 통계로 확인되지 않습니다.</li>
            </ul>
          </div>
          <div className="card">
            <h3>출처</h3>
            {r.sources.length === 0 && <p className="note">기록된 출처 링크가 없습니다.</p>}
            <ul className="kv-list">
              {r.sources.map((s, i) => (
                <li key={i}>
                  {safeHttpUrl(s.url).ok ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                      {s.label}
                    </a>
                  ) : (
                    s.label
                  )}
                </li>
              ))}
            </ul>
            <p className="note">
              일별 원자료 CSV: <a href={exp('daily')}>내려받기</a> · 조회수 {pv ? metricValue(pv) : '미수집'} 기준 보고서
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}
