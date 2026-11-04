import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * 경계 가드 — 이 패키지는 oobleck 공용 코어로 나갈 것이라 호스트(MVOS 앱 · 계약)와 화면(React · Next)을 모른다.
 * 소스가 그쪽을 import 하면 실패한다.
 */
const FORBIDDEN = [/^@app\//, /^@mvos\//, /^react(\/|$)/, /^react-dom(\/|$)/, /^next(\/|$)/]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name === '__fixtures__' ? [] : sourceFiles(p)
    return /\.tsx?$/.test(e.name) ? [p] : []
  })
}

function specifiers(source: string): string[] {
  const out: string[] = []
  for (const m of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) out.push(m[1] ?? '')
  return out
}

describe('경계', () => {
  it('호스트 · 화면 모듈을 import 하지 않는다', () => {
    const offenders = sourceFiles(__dirname).flatMap((file) =>
      specifiers(readFileSync(file, 'utf8'))
        .filter((s) => FORBIDDEN.some((re) => re.test(s)))
        .map((s) => `${file.slice(__dirname.length + 1)} → ${s}`),
    )
    expect(offenders).toEqual([])
  })
})
