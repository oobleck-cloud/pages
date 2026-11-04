import { z } from 'zod'

import { evaluateCondition, ExprSchema } from '../expr'

import type { Expr, ExprScope } from '../expr'

/**
 * 동작 — 부품의 일(press · back …)에 거는 체인. 차례대로 하고, 하나가 막으면(검증 실패 · 호스트 실패) 거기서 멈춘다.
 *
 * - validate: 이 화면의 보이는 꼭 답할 필드가 비었으면 멈춘다.
 * - save: 지금 답을 호스트에 저장한다.
 * - host: 호스트 동작(이름 · 인자) — 무엇을 하는지는 호스트가 정한다(MVOS: 문자 · 콜 등). 모르는 이름이면 멈춘다.
 * - open: 바깥 주소를 새 창으로.
 * - go: 그 화면으로 — push(쌓기) · replace(바꾸기) · sheet(위에 띄우기). 숨은 화면이면 next 와 같다.
 * - next: 차례대로 다음 보이는 장, 마지막이면 submit.
 * - back: 앞 화면(시트면 닫기).
 * - submit: 보내기 — 꼭 답할 필드가 비었으면 그 장으로 가고 멈춘다.
 * - branch: 조건마다 다른 체인.
 */
export type Action =
  | { do: 'validate' }
  | { do: 'save' }
  | {
      do: 'host'
      name: string
      args?: Record<string, string | number | boolean | null> | undefined
    }
  | { do: 'open'; href: string }
  | { do: 'go'; to: string; mode: 'push' | 'replace' | 'sheet' }
  | { do: 'next' }
  | { do: 'back' }
  | { do: 'submit' }
  | { do: 'branch'; when: Array<{ if: Expr; then: Action[] }>; else: Action[] }

export type ActionList = Action[]

/** 체인을 끝내는 동작 — 뒤에 오는 동작은 하지 않는다. */
export const TERMINAL: ReadonlySet<Action['do']> = new Set(['go', 'next', 'back', 'submit'])

const ActionSchema: z.ZodType<Action> = z.lazy(() =>
  z.discriminatedUnion('do', [
    z.object({ do: z.literal('validate') }),
    z.object({ do: z.literal('save') }),
    z.object({
      do: z.literal('host'),
      name: z.string().min(1),
      args: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    }),
    z.object({ do: z.literal('open'), href: z.string() }),
    z.object({
      do: z.literal('go'),
      to: z.string(),
      mode: z.enum(['push', 'replace', 'sheet']),
    }),
    z.object({ do: z.literal('next') }),
    z.object({ do: z.literal('back') }),
    z.object({ do: z.literal('submit') }),
    z.object({
      do: z.literal('branch'),
      when: z.array(z.object({ if: ExprSchema, then: ActionListSchema })),
      else: ActionListSchema,
    }),
  ]),
)

export const ActionListSchema: z.ZodType<ActionList> = z.lazy(() => z.array(ActionSchema))

/** 분기 없는 동작 — 런타임이 하나씩 한다. */
export type Step = Exclude<Action, { do: 'branch' }>

/**
 * 지금 상태로 체인을 편다 — 분기를 풀고, 끝내는 동작(go · next · back · submit) 뒤는 버린다.
 * 조건을 읽다 오류가 나면 그 갈래는 거짓이다.
 */
export function planActions(list: readonly Action[], scope: ExprScope): Step[] {
  const out: Step[] = []
  const walk = (actions: readonly Action[]): boolean => {
    for (const a of actions) {
      if (a.do === 'branch') {
        const arm = a.when.find((w) => safe(w.if, scope))
        if (walk(arm ? arm.then : a.else)) return true
        continue
      }
      out.push(a)
      if (TERMINAL.has(a.do)) return true
    }
    return false
  }
  walk(list)
  return out
}

function safe(expr: Expr, scope: ExprScope): boolean {
  try {
    return evaluateCondition(expr, scope)
  } catch {
    return false
  }
}

/** 체인이 가리키는 화면 id — 검증(없는 화면)이 읽는다. */
export function actionTargets(list: readonly Action[]): string[] {
  const out: string[] = []
  const walk = (actions: readonly Action[]) => {
    for (const a of actions) {
      if (a.do === 'go') out.push(a.to)
      if (a.do === 'branch') {
        for (const w of a.when) walk(w.then)
        walk(a.else)
      }
    }
  }
  walk(list)
  return out
}

/** 체인이 읽는 호스트 동작 이름. */
export function hostActionsOf(list: readonly Action[]): string[] {
  const out: string[] = []
  const walk = (actions: readonly Action[]) => {
    for (const a of actions) {
      if (a.do === 'host') out.push(a.name)
      if (a.do === 'branch') {
        for (const w of a.when) walk(w.then)
        walk(a.else)
      }
    }
  }
  walk(list)
  return out
}
