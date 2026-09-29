import fs from 'node:fs'
import path from 'node:path'

/** 저장소 밖 비공개 원자료 폴더(MRK_DATA_DIR). 없으면 실제 데이터 테스트는 건너뛴다. */
export function loadEnvLocal() {
  // .env.local = 앱 설정, .env.e2e = 테스트 준비 전용(서비스 키·DB 주소; 앱은 읽지 않음)
  for (const f of ['../.env.local', '../.env.e2e']) {
    const p = path.resolve(__dirname, f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
    }
  }
}
loadEnvLocal()

export const DATA_DIR = process.env.MRK_DATA_DIR ?? ''
export const hasData = !!DATA_DIR && fs.existsSync(path.join(DATA_DIR, 'reports'))

export function readReport(name: 'weekly' | 'baseline'): any {
  const dir = path.join(DATA_DIR, 'reports')
  const file = fs.readdirSync(dir).find((f) => (name === 'baseline' ? f.includes('_baseline_') : !f.includes('_baseline_') && f.endsWith('.json')))
  if (!file) throw new Error(`no ${name} report in MRK_DATA_DIR`)
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
}

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
