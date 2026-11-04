import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'

import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'

// workstyle 은 형제 레포에 링크돼 있다(npm 은 레포 뿌리 node_modules, pnpm 은 이 패키지 node_modules) — 그 실제 경로를
// 읽게 허용하고, react 는 한 벌로 묶는다.
const workstyle = ['node_modules/@oobleck/workstyle', '../../node_modules/@oobleck/workstyle']
  .map((p) => resolve(__dirname, p))
  .filter((p) => existsSync(p))
  .map((p) => realpathSync(p))

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), ...workstyle] } },
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    server: { deps: { inline: [/@oobleck\/workstyle/] } },
  },
})
