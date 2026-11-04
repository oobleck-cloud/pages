import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// 뷰 본체는 디자인 구현을 모른다 — 킷이 끼운다. 제공하는 Workstyle 킷(src/workstyle)만 @oobleck/workstyle 을 쓴다.
const FORBIDDEN = [/from '@app\//, /from '@mvos\//, /from '@oobleck\/systheme/, /from 'next/]
const BODY_ONLY = [/from '@oobleck\/workstyle/]
const isKit = (f: string) => /[\\/]workstyle[\\/]/.test(f)

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory()
      ? files(p)
      : /\.tsx?$/.test(f) && !/\.test\./.test(f)
        ? [p]
        : []
  })
}

describe('경계', () => {
  it('pages-views 는 앱 · 디자인 시스템을 import 하지 않는다(Workstyle 은 제공 킷에서만)', () => {
    const bad = files(join(__dirname)).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .filter((l) => [...FORBIDDEN, ...(isKit(f) ? [] : BODY_ONLY)].some((r) => r.test(l)))
        .map((l) => `${f}: ${l}`),
    )
    expect(bad).toEqual([])
  })
})
