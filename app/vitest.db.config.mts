import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src'), 'server-only': path.resolve(import.meta.dirname, 'tests/server-only-stub.ts') } },
  test: { include: ['tests/db/**/*.test.ts'], environment: 'node', fileParallelism: false, testTimeout: 30000 },
})
