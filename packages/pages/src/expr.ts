/**
 * Expr — 선언형 조건/계산식 (JSONLogic 서브셋 + 확장).
 *
 * 저자 작성 JS(`new Function`)를 받지 않는다는 결정(ADR D5)의 대가를 여기서 치른다.
 * 레거시는 연산자가 14개뿐이라 사람들이 `transform.code`(임의 JS)로 도망쳤고, 그 코드가
 * 미인증 저장소에 담겨 RCE 경로가 됐다. 그래서 이 평가기는 **산술·문자열·배열을 처음부터**
 * 갖는다. 선언형이라 클라이언트·서버·네이티브가 같은 문서를 같은 결과로 읽고,
 * 정적 검증기가 미해결 참조를 CI 에서 잡을 수 있다.
 *
 * 평가는 순수하다 — 전역·DOM·네트워크에 접근하지 않으며 입력 스코프만 읽는다.
 *
 * 출처: MVOS `@mvos/flow-engine` 의 expr.ts 를 그대로 옮겼다(oobleck 패키지는 MVOS 를 모른다). 장 · 블록 조건과 앞으로의
 * SPA 런타임이 같은 식을 쓴다. 고칠 때는 두 곳의 평가 결과가 갈리지 않게 한다.
 */

import { z } from 'zod'

export type Expr =
  /** 리터럴 배열 — 각 항목을 평가한 배열이 된다(JSONLogic 관례). `in` 의 대상 등 */
  | Expr[]
  | boolean
  | number
  | string
  | null
  /** 경로는 식일 수도 있다 — `{concat:[...]}` 로 키 맵(itemQty.<id>)을 조회한다 */
  | { var: string | Expr }
  /** 기본값 있는 조회(JSONLogic 표준) — 값이 없을 때 무엇으로 읽을지 문서가 정한다 */
  | { var: [string | Expr, Expr] }
  | { '==': [Expr, Expr] }
  | { '!=': [Expr, Expr] }
  | { '<': [Expr, Expr] }
  | { '<=': [Expr, Expr] }
  | { '>': [Expr, Expr] }
  | { '>=': [Expr, Expr] }
  | { '+': Expr[] }
  | { '-': [Expr, Expr] }
  | { '*': Expr[] }
  | { '/': [Expr, Expr] }
  | { '%': [Expr, Expr] }
  | { and: Expr[] }
  | { or: Expr[] }
  | { not: Expr }
  | { in: [Expr, Expr] }
  | { isEmpty: Expr }
  /** JSONLogic 3항 — [조건, 참일 때, 거짓일 때]. 상태 따라 라벨이 바뀌는 CTA 등 */
  | { if: [Expr, Expr, Expr] }
  | { toInt: Expr }
  | { concat: Expr[] }
  | { length: Expr }
  | { some: [Expr, Expr] }
  | { every: [Expr, Expr] }
  | { count: Expr }

export class ExprError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExprError'
  }
}

export type ExprScope = Record<string, unknown>

/** dot-path 조회 — `a.b.0.c`. 없으면 undefined(예외 아님: 조건식은 부재를 다룰 수 있어야 한다). */
export function readPath(scope: ExprScope, path: string): unknown {
  if (path === '') return scope
  let cur: unknown = scope
  for (const seg of path.split('.')) {
    if (cur == null) return undefined
    if (Array.isArray(cur)) {
      const idx = Number(seg)
      cur = Number.isInteger(idx) ? cur[idx] : undefined
      continue
    }
    if (typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

function isEmptyValue(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

function num(v: unknown, op: string): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) throw new ExprError(`${op}: 숫자가 아닙니다 — ${JSON.stringify(v)}`)
  return n
}

function truthy(v: unknown): boolean {
  return !isEmptyValue(v) && v !== false && v !== 0
}

/** 배열/문자열 길이. 그 외 타입은 예외 — 조용한 0 은 버그를 숨긴다. */
function lengthOf(v: unknown, op: string): number {
  if (Array.isArray(v) || typeof v === 'string') return v.length
  throw new ExprError(`${op}: 배열·문자열이 아닙니다 — ${JSON.stringify(v)}`)
}

/**
 * `some`/`every` 는 항목을 `item` 으로 스코프에 넣고 조건을 평가한다.
 * 콜백이 아니라 스코프 확장이므로 여전히 선언형이다.
 */
function iterate(
  list: unknown,
  condition: Expr,
  scope: ExprScope,
  mode: 'some' | 'every',
): boolean {
  if (!Array.isArray(list)) throw new ExprError(`${mode}: 배열이 아닙니다`)
  const test = (item: unknown) => truthy(evaluate(condition, { ...scope, item }))
  return mode === 'some' ? list.some(test) : list.every(test)
}

export function evaluate(expr: Expr, scope: ExprScope = {}): unknown {
  if (
    expr == null ||
    typeof expr === 'boolean' ||
    typeof expr === 'number' ||
    typeof expr === 'string'
  ) {
    return expr
  }
  // 배열은 리터럴 목록 — 항목을 평가해 돌려준다(연산자 객체가 아니다). `in` 의 대상 등
  if (Array.isArray(expr)) return expr.map((e) => evaluate(e, scope))

  const keys = Object.keys(expr)
  if (keys.length !== 1) {
    throw new ExprError(`연산자는 하나여야 합니다 — ${JSON.stringify(expr)}`)
  }
  const op = keys[0]
  const raw = (expr as Record<string, unknown>)[op]
  const args = (Array.isArray(raw) ? raw : [raw]) as Expr[]
  const val = (i: number) => evaluate(args[i], scope)

  switch (op) {
    case 'var': {
      // 경로도 식이다 — 문자열이 아니면 평가해 경로로 쓴다(키 맵 조회: itemQty.<id> 등)
      const pathOf = (p: unknown): string =>
        typeof p === 'string' ? p : String(evaluate(p as Expr, scope))
      // JSONLogic 표준의 기본값 형태 — `{var: ['answers.seq', 0]}`.
      // 값이 아직 없는 경로(카운터 첫 증가 등)를 문서 쪽에서 다룰 수 있게 한다.
      if (Array.isArray(raw)) {
        const found = readPath(scope, pathOf(raw[0]))
        return found === undefined || found === null ? evaluate(raw[1] as Expr, scope) : found
      }
      return readPath(scope, pathOf(raw))
    }
    case '==':
      return val(0) === val(1)
    case '!=':
      return val(0) !== val(1)
    case '<':
      return num(val(0), op) < num(val(1), op)
    case '<=':
      return num(val(0), op) <= num(val(1), op)
    case '>':
      return num(val(0), op) > num(val(1), op)
    case '>=':
      return num(val(0), op) >= num(val(1), op)
    case '+':
      return args.reduce<number>((acc, a) => acc + num(evaluate(a, scope), op), 0)
    case '-':
      return num(val(0), op) - num(val(1), op)
    case '*':
      return args.reduce<number>((acc, a) => acc * num(evaluate(a, scope), op), 1)
    case '/': {
      const d = num(val(1), op)
      if (d === 0) throw new ExprError('/: 0 으로 나눌 수 없습니다')
      return num(val(0), op) / d
    }
    case '%': {
      const d = num(val(1), op)
      if (d === 0) throw new ExprError('%: 0 으로 나눌 수 없습니다')
      return num(val(0), op) % d
    }
    case 'and':
      return args.every((a) => truthy(evaluate(a, scope)))
    case 'or':
      return args.some((a) => truthy(evaluate(a, scope)))
    case 'not':
      return !truthy(val(0))
    case 'in': {
      const needle = val(0)
      const hay = val(1)
      if (Array.isArray(hay)) return hay.includes(needle)
      if (typeof hay === 'string') return hay.includes(String(needle))
      throw new ExprError('in: 배열·문자열이 아닙니다')
    }
    case 'isEmpty':
      return isEmptyValue(val(0))
    case 'if':
      // 3항은 짧은 평가 — 고르지 않은 가지는 계산하지 않는다
      return truthy(evaluate(args[0], scope))
        ? evaluate(args[1], scope)
        : evaluate(args[2] ?? null, scope)
    case 'toInt': {
      const n = Number(val(0))
      return Number.isFinite(n) ? Math.trunc(n) : null
    }
    case 'concat':
      return args.map((a) => String(evaluate(a, scope) ?? '')).join('')
    case 'length':
    case 'count':
      return lengthOf(val(0), op)
    case 'some':
      return iterate(val(0), args[1], scope, 'some')
    case 'every':
      return iterate(val(0), args[1], scope, 'every')
    default:
      throw new ExprError(`알 수 없는 연산자: ${op}`)
  }
}

/** 조건 평가 — 결과를 boolean 으로 환원한다(`visibleWhen`·`branch` 용). */
export function evaluateCondition(expr: Expr | undefined, scope: ExprScope = {}): boolean {
  if (expr === undefined) return true
  return truthy(evaluate(expr, scope))
}

/** 식이 참조하는 모든 `var` 경로 — 정적 검증기가 미해결 참조를 잡는 데 쓴다. */
export function collectVarPaths(expr: Expr | undefined, out: Set<string> = new Set()): Set<string> {
  if (expr == null || typeof expr !== 'object') return out
  if (Array.isArray(expr)) {
    for (const e of expr) collectVarPaths(e, out)
    return out
  }
  for (const [op, raw] of Object.entries(expr)) {
    if (op === 'var') {
      const path = Array.isArray(raw) ? raw[0] : raw
      // 동적 경로(식)는 정적으로 알 수 없다 — 안쪽 참조만 모은다
      if (typeof path === 'string') out.add(path)
      else collectVarPaths(path as Expr, out)
      if (Array.isArray(raw)) collectVarPaths(raw[1] as Expr, out)
      continue
    }
    const args = Array.isArray(raw) ? raw : [raw]
    for (const a of args) collectVarPaths(a as Expr, out)
  }
  return out
}

// ── 직렬화 검증 ────────────────────────────────────────────────────────────
// (MVOS @mvos/flow-engine 의 schema.ts 와 같은 정의.)

/** Expr 는 재귀 구조라 런타임 검증은 "객체이거나 원시값" 수준으로 둔다. */
export const ExprSchema: z.ZodType<Expr> = z.lazy(() =>
  z.union([z.boolean(), z.number(), z.string(), z.null(), z.record(z.string(), z.unknown())]),
) as z.ZodType<Expr>
