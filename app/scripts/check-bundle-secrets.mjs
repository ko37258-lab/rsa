// 빌드 산출물(.next/static, 사전 렌더링 HTML)과 테스트 서버 로그에
// 서버 전용 비밀값·비공개 보고서 데이터가 들어가지 않았는지 확인한다. 값 자체는 출력하지 않는다.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const envFile = path.join(root, '.env.local')
const env = { ...process.env }
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m && env[m[1]] === undefined) env[m[1]] = m[2]
  }
}

const secrets = ['SUPABASE_SERVICE_ROLE_KEY', 'REPORT_INGEST_TOKEN'].map((k) => [k, env[k]]).filter(([, v]) => v && v.length >= 16)

// 비공개 보고서의 고유 문자열(게시물 제목·검색어)을 표본으로 사용
const markers = []
const dataDir = env.MRK_DATA_DIR
if (dataDir && fs.existsSync(path.join(dataDir, 'reports'))) {
  for (const f of fs.readdirSync(path.join(dataDir, 'reports'))) {
    const r = JSON.parse(fs.readFileSync(path.join(dataDir, 'reports', f), 'utf8'))
    for (const p of r.content?.posts?.slice(0, 5) ?? []) markers.push(['post title', p.title])
    for (const k of r.traffic?.keywords?.slice(0, 5) ?? []) markers.push(['keyword', k.keyword])
  }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const targets = [
  ...walk(path.join(root, '.next', 'static')).map((f) => ['client bundle', f]),
  ...walk(path.join(root, '.next', 'server', 'app')).filter((f) => /\.(html|rsc|body)$/.test(f)).map((f) => ['prerendered page', f]),
  ...walk(path.join(root, 'public')).map((f) => ['public dir', f]),
  ...['test-results/server.log'].map((f) => path.join(root, f)).filter((f) => fs.existsSync(f)).map((f) => ['server log', f]),
]

let problems = 0
for (const [kind, file] of targets) {
  const text = fs.readFileSync(file, 'utf8')
  for (const [name, value] of secrets) {
    if (text.includes(value)) {
      problems++
      console.error(`LEAK: ${name} found in ${kind} ${path.relative(root, file)}`)
    }
  }
  if (kind !== 'server log')
    for (const [label, value] of markers) {
      if (value && value.length >= 6 && text.includes(value)) {
        problems++
        console.error(`DATA: private ${label} found in ${kind} ${path.relative(root, file)}`)
      }
    }
}
console.log(`checked ${targets.length} files, ${secrets.length} secrets, ${markers.length} private data markers`)
if (!secrets.length) console.log('note: no secrets configured in env; secret scan was a no-op')
if (!markers.length) console.log('note: MRK_DATA_DIR not set; private data scan skipped')
process.exit(problems ? 1 : 0)
