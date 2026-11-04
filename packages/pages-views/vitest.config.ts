import { realpathSync } from 'node:fs'

import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'

// workstyle 은 형제 레포에 링크돼 있다 — 그 실제 경로를 읽게 허용하고, react 는 이 레포의 한 벌로 묶는다.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  server: {
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        realpathSync('../../node_modules/@oobleck/workstyle'),
      ],
    },
  },
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    server: { deps: { inline: [/@oobleck\/workstyle/] } },
  },
})
