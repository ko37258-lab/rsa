import { defineConfig, devices } from '@playwright/test'

// 로컬 Supabase(npm run db:start) + 프로덕션 빌드(npm run build)가 준비된 상태에서 실행한다.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'sh -c "mkdir -p test-results && npx next start -H 127.0.0.1 -p 3000 > test-results/server.log 2>&1"',
    url: 'http://127.0.0.1:3000/login',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
