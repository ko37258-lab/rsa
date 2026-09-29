// 로컬 Supabase Postgres(`npm run db:start`)에 직접 연결해 마이그레이션의 RLS·권한·트리거를 검증한다.
// 각 테스트는 트랜잭션 안에서 실행 후 ROLLBACK 하므로 데이터가 남지 않는다(동시성 테스트는 끝에서 정리).
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import '../helpers'
import { contentHash } from '@/lib/report/hash'
import { syntheticWeekly } from '../fixtures'

const DB_URL = process.env.LOCAL_DB_URL ?? ''
const enabled = !!DB_URL

let pool: pg.Pool

async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    return await fn(c)
  } finally {
    await c.query('ROLLBACK').catch(() => {})
    c.release()
  }
}

async function asRole(c: pg.PoolClient, role: 'anon' | 'authenticated' | 'service_role', sub?: string) {
  await c.query(`SET LOCAL ROLE ${role}`)
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })])
}

async function makeUser(c: pg.PoolClient, email: string) {
  const id = randomUUID()
  await c.query(`INSERT INTO auth.users (id, instance_id, aud, role, email) VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`, [id, email])
  return id
}

function weeklyRow(start = '2020-01-06', end = '2020-01-12') {
  const p = syntheticWeekly(start, end, '2019-12-30', '2020-01-05')
  p.observedOn = '2020-01-14'
  return { p, hash: contentHash(p) }
}

async function insertReport(c: pg.PoolClient, start = '2020-01-06', end = '2020-01-12') {
  const { p, hash } = weeklyRow(start, end)
  await c.query(
    `INSERT INTO public.blog_reports (report_id, blog_id, report_type, observed_on, period_start, period_end, payload, content_hash)
     VALUES ($1,'ko372','weekly',$2,$3,$4,$5,$6)`,
    [p.reportId, p.observedOn, start, end, p, hash],
  )
  return { p, hash }
}

describe.skipIf(!enabled)('Supabase 마이그레이션 RLS·권한', () => {
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DB_URL, max: 4 })
  })
  afterAll(async () => {
    await pool?.end()
  })

  it('anon은 보고서·리비전·수집 이력·관리자 테이블을 읽을 수 없다', async () => {
    for (const table of ['blog_reports', 'report_revisions', 'collection_runs', 'report_admins', 'source_files', 'integration_settings', 'rate_limit_hits']) {
      await tx(async (c) => {
        await insertReport(c)
        await asRole(c, 'anon')
        await expect(c.query(`SELECT * FROM public.${table}`)).rejects.toThrow(/permission denied/)
      })
    }
  })

  it('로그인했지만 관리자가 아닌 사용자는 0행', async () => {
    await tx(async (c) => {
      await insertReport(c)
      const viewer = await makeUser(c, `viewer-${randomUUID()}@example.test`)
      await asRole(c, 'authenticated', viewer)
      expect((await c.query('SELECT * FROM public.blog_reports')).rowCount).toBe(0)
      expect((await c.query('SELECT * FROM public.report_revisions')).rowCount).toBe(0)
      expect((await c.query('SELECT * FROM public.collection_runs')).rowCount).toBe(0)
      expect((await c.query('SELECT * FROM public.report_admins')).rowCount).toBe(0)
    })
  })

  it('관리자는 읽을 수 있고 본인 소속만 보인다', async () => {
    await tx(async (c) => {
      await insertReport(c)
      const admin = await makeUser(c, `admin-${randomUUID()}@example.test`)
      const other = await makeUser(c, `other-${randomUUID()}@example.test`)
      await c.query('INSERT INTO public.report_admins(user_id) VALUES ($1), ($2)', [admin, other])
      await asRole(c, 'authenticated', admin)
      expect((await c.query(`SELECT report_id FROM public.blog_reports WHERE report_id = 'ko372_2020-01-06_2020-01-12'`)).rowCount).toBe(1)
      expect((await c.query(`SELECT * FROM public.report_revisions WHERE report_id = 'ko372_2020-01-06_2020-01-12'`)).rowCount).toBe(1)
      const members = await c.query('SELECT user_id FROM public.report_admins')
      expect(members.rows.map((r) => r.user_id)).toEqual([admin])
    })
  })

  it('인증 클라이언트의 직접 쓰기(관리자 포함)와 자가 관리자 등록은 거부된다', async () => {
    const attempts = [
      `INSERT INTO public.blog_reports (report_id, blog_id, report_type, observed_on, period_start, period_end, payload, content_hash) VALUES ('x','ko372','weekly','2020-01-01',NULL,NULL,'{}','${'a'.repeat(64)}')`,
      `UPDATE public.blog_reports SET observed_on = observed_on`,
      `DELETE FROM public.blog_reports`,
      `INSERT INTO public.collection_runs (blog_id, expected_period_start, expected_period_end, status) VALUES ('ko372','2020-01-06','2020-01-12','running')`,
      `UPDATE public.integration_settings SET aside_connected = true`,
    ]
    for (const sql of attempts) {
      await tx(async (c) => {
        await insertReport(c)
        const admin = await makeUser(c, `admin-${randomUUID()}@example.test`)
        await c.query('INSERT INTO public.report_admins(user_id) VALUES ($1)', [admin])
        await asRole(c, 'authenticated', admin)
        await expect(c.query(sql), sql).rejects.toThrow(/permission denied/)
      })
    }
    await tx(async (c) => {
      const u = await makeUser(c, `self-${randomUUID()}@example.test`)
      await asRole(c, 'authenticated', u)
      await expect(c.query('INSERT INTO public.report_admins(user_id) VALUES ($1)', [u])).rejects.toThrow(/permission denied/)
    })
  })

  it('관리자는 원자료 메타데이터만 읽고 파일 본문 컬럼은 읽을 수 없다', async () => {
    await tx(async (c) => {
      const admin = await makeUser(c, `admin-${randomUUID()}@example.test`)
      await c.query('INSERT INTO public.report_admins(user_id) VALUES ($1)', [admin])
      await c.query(`INSERT INTO public.source_files(file_name, media_type, byte_size, sha256, content) VALUES ('a.csv','text/csv',3,$1,'\\x612c62')`, ['b'.repeat(64)])
      await asRole(c, 'authenticated', admin)
      expect((await c.query('SELECT file_name, byte_size FROM public.source_files')).rowCount).toBe(1)
      await expect(c.query('SELECT content FROM public.source_files')).rejects.toThrow(/permission denied/)
    })
  })

  it('리비전: 신규 1개, 같은 payload 갱신은 추가 없음, 변경 시 추가 + updated_at 갱신', async () => {
    await tx(async (c) => {
      const { p } = await insertReport(c)
      const count = async () => Number((await c.query(`SELECT count(*) FROM public.report_revisions WHERE report_id = $1`, [p.reportId])).rows[0].count)
      expect(await count()).toBe(1)
      const before = (await c.query('SELECT created_at, updated_at FROM public.blog_reports WHERE report_id = $1', [p.reportId])).rows[0]
      await c.query('UPDATE public.blog_reports SET payload = payload WHERE report_id = $1', [p.reportId])
      expect(await count()).toBe(1)
      await c.query(`SELECT pg_sleep(0.01)`)
      const p2 = { ...p, limitations: ['수정'] }
      await c.query(`UPDATE public.blog_reports SET payload = $2, content_hash = $3, created_at = now() - interval '1 day' WHERE report_id = $1`, [p.reportId, p2, contentHash(p2)])
      expect(await count()).toBe(2)
      const after = (await c.query('SELECT created_at, updated_at FROM public.blog_reports WHERE report_id = $1', [p.reportId])).rows[0]
      expect(after.created_at.getTime()).toBe(before.created_at.getTime())
      expect(after.updated_at.getTime()).toBeGreaterThanOrEqual(before.updated_at.getTime())
    })
  })

  it('리비전은 추가 전용(서비스 역할도 수정·삭제 불가)', async () => {
    await tx(async (c) => {
      await insertReport(c)
      await asRole(c, 'service_role')
      await expect(c.query(`UPDATE public.report_revisions SET content_hash = 'x'`)).rejects.toThrow(/append-only/)
    })
    await tx(async (c) => {
      await insertReport(c)
      await asRole(c, 'service_role')
      await expect(c.query(`DELETE FROM public.report_revisions`)).rejects.toThrow(/append-only/)
    })
  })

  it('DB 제약: 6일 기간·ID 불일치·다른 blog·payload 불일치 거부', async () => {
    const bad = [
      [`ko372_2020-01-06_2020-01-11`, '2020-01-06', '2020-01-11'],
      [`ko372_2020-01-06_2020-01-13`, '2020-01-06', '2020-01-12'],
    ]
    for (const [id, s, e] of bad) {
      await tx(async (c) => {
        const { p, hash } = weeklyRow()
        const payload = { ...p, reportId: id }
        await expect(
          c.query(`INSERT INTO public.blog_reports (report_id, blog_id, report_type, observed_on, period_start, period_end, payload, content_hash) VALUES ($1,'ko372','weekly',$2,$3,$4,$5,$6)`, [id, p.observedOn, s, e, payload, hash]),
        ).rejects.toThrow(/check constraint/)
      })
    }
  })

  it('collection_runs 제약: succeeded는 보고서 필요, 종료 시각 필요, 오류 코드 형식', async () => {
    const cases = [
      `INSERT INTO public.collection_runs (blog_id, expected_period_start, expected_period_end, status, finished_at) VALUES ('ko372','2020-01-06','2020-01-12','succeeded', now())`,
      `INSERT INTO public.collection_runs (blog_id, expected_period_start, expected_period_end, status) VALUES ('ko372','2020-01-06','2020-01-12','failed')`,
      `INSERT INTO public.collection_runs (blog_id, expected_period_start, expected_period_end, status, finished_at, error_code) VALUES ('ko372','2020-01-06','2020-01-12','failed', now(), 'Bad Code!')`,
    ]
    for (const sql of cases) await tx(async (c) => expect(c.query(sql)).rejects.toThrow(/check constraint/))
  })

  it('요청 제한 함수: 서비스 역할만 실행 가능, 한도 초과 시 false', async () => {
    await tx(async (c) => {
      await asRole(c, 'authenticated', randomUUID())
      await expect(c.query(`SELECT public.consume_rate_limit('login_ip:${'c'.repeat(64)}', 1, 60)`)).rejects.toThrow(/permission denied/)
    })
    await tx(async (c) => {
      await asRole(c, 'service_role')
      const b = `login_ip:${'d'.repeat(64)}`
      const r1 = await c.query('SELECT public.consume_rate_limit($1, 2, 60) AS ok', [b])
      const r2 = await c.query('SELECT public.consume_rate_limit($1, 2, 60) AS ok', [b])
      const r3 = await c.query('SELECT public.consume_rate_limit($1, 2, 60) AS ok', [b])
      expect([r1.rows[0].ok, r2.rows[0].ok, r3.rows[0].ok]).toEqual([true, true, false])
    })
  })

  it('동시 수정: 같은 이전 해시 조건의 UPDATE 중 한 건만 성공하고 리비전은 모두 보존', async () => {
    const start = '2020-02-03'
    const end = '2020-02-09'
    const setup = await pool.connect()
    const { p, hash } = weeklyRow(start, end)
    const id = p.reportId
    try {
      await setup.query(
        `INSERT INTO public.blog_reports (report_id, blog_id, report_type, observed_on, period_start, period_end, payload, content_hash) VALUES ($1,'ko372','weekly',$2,$3,$4,$5,$6)`,
        [id, '2020-01-14', start, end, { ...p, reportId: id, period: { start, end } }, hash],
      )
    } catch {
      // 이전 실행 잔여물 정리 후 재시도
      await cleanup(setup, id)
      await setup.query(
        `INSERT INTO public.blog_reports (report_id, blog_id, report_type, observed_on, period_start, period_end, payload, content_hash) VALUES ($1,'ko372','weekly',$2,$3,$4,$5,$6)`,
        [id, '2020-01-14', start, end, { ...p, reportId: id, period: { start, end } }, hash],
      )
    }
    const a = await pool.connect()
    const b = await pool.connect()
    try {
      const pa = { ...p, reportId: id, limitations: ['A'] }
      const pb = { ...p, reportId: id, limitations: ['B'] }
      await a.query('BEGIN')
      await b.query('BEGIN')
      const ra = await a.query('UPDATE public.blog_reports SET payload=$2, content_hash=$3 WHERE report_id=$1 AND content_hash=$4', [id, pa, contentHash(pa), hash])
      const pendingB = b.query('UPDATE public.blog_reports SET payload=$2, content_hash=$3 WHERE report_id=$1 AND content_hash=$4', [id, pb, contentHash(pb), hash])
      await new Promise((r) => setTimeout(r, 100))
      await a.query('COMMIT')
      const rb = await pendingB
      await b.query('COMMIT')
      expect(ra.rowCount).toBe(1)
      expect(rb.rowCount).toBe(0)
      const revs = await setup.query('SELECT content_hash FROM public.report_revisions WHERE report_id=$1 ORDER BY revision_id', [id])
      expect(revs.rows.map((r) => r.content_hash)).toEqual([hash, contentHash(pa)])
    } finally {
      a.release()
      b.release()
      await cleanup(setup, id)
      setup.release()
    }
  })
})

/** 테스트 전용 정리: 슈퍼유저로 트리거를 우회해 합성 행을 지운다(운영 경로에는 없음). */
async function cleanup(c: pg.PoolClient, id: string) {
  await c.query('BEGIN')
  await c.query(`SET LOCAL session_replication_role = replica`)
  await c.query('DELETE FROM public.report_revisions WHERE report_id = $1', [id])
  await c.query('DELETE FROM public.blog_reports WHERE report_id = $1', [id])
  await c.query('COMMIT')
}
