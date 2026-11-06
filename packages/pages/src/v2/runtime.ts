import { evaluateCondition } from '../expr'
import { planActions } from './actions'
import { fieldAnswered, scopeOf, screenFields } from './form'

import type { AssetPack } from '../assets'
import type { CampaignAnswers } from '../campaign-form'
import type { ExprScope } from '../expr'
import type { Action, Step } from './actions'
import type { Field, Screen, ScreenDocument } from './screen'

/**
 * SPA 런타임 — 부품이 일으킨 일에 걸린 동작 체인을 실제로 한다. React 를 모른다(뷰는 pages-views 의 useScreenFlow).
 *
 * 흐름 상태는 두 겹이다: 쌓인 화면(`stack`, 장 · 보낸 뒤 화면 — 마지막이 지금 장)과 그 위에 뜬 시트(`sheets`).
 * 체인은 [planActions] 로 편 뒤 차례대로 하고, 하나가 막으면(검증 실패 · 호스트 실패) 거기서 멈춘다 — 그때까지 바뀐 흐름은 남는다.
 * 저장 · 호스트 동작 · 보내기는 호스트([FlowHost])가 한다.
 */

export type FlowState = {
  /** 쌓인 화면 id(page · done) — 마지막이 지금 장. */
  stack: string[]
  /** 장 위에 뜬 시트 id — 마지막이 맨 위. */
  sheets: string[]
  /** 보내기를 마쳤나. */
  submitted: boolean
}

export type HostResult = { ok: true } | { ok: false; error: string }

/** 호스트가 채우는 자리 — 없는 자리의 동작은 save 면 건너뛰고, host 면 막는다. */
export type FlowHost = {
  save?: ((answers: CampaignAnswers) => Promise<HostResult>) | undefined
  action?:
    | ((
        name: string,
        args: Readonly<Record<string, string | number | boolean | null>>,
        at: { screen: string | null; answers: CampaignAnswers },
      ) => Promise<HostResult>)
    | undefined
  open?: ((href: string) => void) | undefined
  submit: (answers: CampaignAnswers) => Promise<HostResult>
}

/** 체인이 멈춘 까닭. */
export type FlowStop =
  /** 꼭 답할 필드가 비었다 — [screen] 은 그 필드가 있는 장. */
  | { reason: 'invalid'; screen: string; fields: string[] }
  /** 호스트가 실패했다 — [action] 은 save · submit 또는 호스트 동작 이름. */
  | { reason: 'host'; action: string; error: string }

export type FlowResult = {
  state: FlowState
  /** 끝까지 했으면 없다. */
  stop?: FlowStop | undefined
  /** 실제로 한 동작(막힌 동작 포함). */
  ran: Step[]
}

export type FlowInput = {
  doc: ScreenDocument
  packs: readonly AssetPack[]
  answers: CampaignAnswers
  hostVars?: Readonly<Record<string, unknown>> | undefined
  /** 켠 갈래 — 갈래(`variant`)가 붙은 화면은 그 갈래를 켰을 때만 보인다. */
  variants?: readonly string[] | undefined
}

function scopeFor(input: FlowInput): ExprScope {
  return scopeOf(input.doc, input.answers, { ...(input.hostVars ?? {}) })
}

/** 화면이 지금 보이나 — 갈래를 켰고, 조건이 참이다(조건을 읽다 오류가 나면 숨긴다). */
export function screenVisible(
  screen: Screen,
  scope: ExprScope,
  variants: readonly string[] = [],
): boolean {
  if (screen.variant !== undefined && !variants.includes(screen.variant)) return false
  if (screen.visibleWhen === undefined) return true
  try {
    return evaluateCondition(screen.visibleWhen, scope)
  } catch {
    return false
  }
}

/** 지금 보이는 장(role page) — 문서 차례대로. */
export function visiblePages(
  doc: ScreenDocument,
  scope: ExprScope,
  variants: readonly string[] = [],
): Screen[] {
  return doc.screens.filter((s) => s.role === 'page' && screenVisible(s, scope, variants))
}

/** 첫 상태 — 첫 보이는 장에서. 보이는 장이 없으면 쌓인 화면이 비었다. */
export function startFlow(input: FlowInput): FlowState {
  const first = visiblePages(input.doc, scopeFor(input), input.variants)[0]
  return { stack: first ? [first.id] : [], sheets: [], submitted: false }
}

/**
 * 답 · 갈래 · 호스트 값이 바뀌어 숨은 화면을 흐름에서 걷어 낸다 — 바뀐 것이 없으면 [state] 그대로(같은 객체).
 *
 * - 쌓인 장 가운데 숨은 장은 뺀다(뒤로 가기가 숨은 장에 닿지 않게).
 * - 맨 위 장이 숨었으면 문서 차례로 그 뒤 첫 보이는 장으로, 뒤에 없으면 앞쪽 가장 가까운 보이는 장으로 바꾼다.
 *   그 장이 이미 쌓였으면 거기까지 되돌린다. 보이는 장이 하나도 없으면 그대로 둔다.
 * - 숨은 시트는 닫는다. 장이 아닌 화면(보낸 뒤 화면)은 건드리지 않는다.
 */
export function settleFlow(input: FlowInput, state: FlowState): FlowState {
  const { doc } = input
  const scope = scopeFor(input)
  const byId = new Map(doc.screens.map((s) => [s.id, s]))
  const shown = (id: string) => {
    const s = byId.get(id)
    return !s || screenVisible(s, scope, input.variants)
  }
  const hiddenPage = (id: string) => byId.get(id)?.role === 'page' && !shown(id)

  const sheets = state.sheets.filter(shown)
  let stack = state.stack
  const top = stack.at(-1)
  if (top !== undefined && hiddenPage(top)) {
    const pages = visiblePages(doc, scope, input.variants)
    if (pages.length) {
      const at = doc.screens.findIndex((s) => s.id === top)
      const after = pages.find((p) => doc.screens.indexOf(p) > at)
      const before = pages.filter((p) => doc.screens.indexOf(p) < at).at(-1)
      const to = (after ?? before)!.id
      const rest = stack.slice(0, -1).filter((id) => !hiddenPage(id))
      const was = rest.indexOf(to)
      stack = was >= 0 ? rest.slice(0, was + 1) : [...rest, to]
    }
  } else if (stack.some(hiddenPage)) {
    stack = stack.filter((id) => !hiddenPage(id))
  }

  if (stack === state.stack && sheets.length === state.sheets.length) return state
  return { ...state, stack, sheets }
}

/** 지금 보이는 화면 — 시트가 떴으면 맨 위 시트. */
export function currentScreenId(state: FlowState): string | null {
  return state.sheets.at(-1) ?? state.stack.at(-1) ?? null
}

/** 화면에서 꼭 답할 필드 가운데 비었고 지금 보이는 것. */
export function missingFields(input: FlowInput, screen: Screen, scope = scopeFor(input)): Field[] {
  return screenFields(input.doc, screen, input.answers, scope).filter(
    (f) => f.required && !fieldAnswered(input.packs, f, input.answers[f.key]),
  )
}

/** 「질문 n / 전체」 — 지금 장이 번호 매긴 보이는 장 가운데 몇째인가(번호 없는 장이면 null). */
export function flowProgress(
  input: FlowInput,
  state: FlowState,
): { index: number; total: number } | null {
  const numbered = visiblePages(input.doc, scopeFor(input), input.variants).filter(
    (s) => s.numbered,
  )
  const at = numbered.findIndex((s) => s.id === state.stack.at(-1))
  return at < 0 ? null : { index: at + 1, total: numbered.length }
}

/**
 * 체인 하나를 한다. [actions] 는 부품의 `on[일]` 그대로(분기 포함).
 */
export async function runChain(
  input: FlowInput,
  start: FlowState,
  actions: readonly Action[],
  host: FlowHost,
): Promise<FlowResult> {
  const { doc } = input
  const scope = scopeFor(input)
  const byId = new Map(doc.screens.map((s) => [s.id, s]))
  let state: FlowState = { ...start, stack: [...start.stack], sheets: [...start.sheets] }
  const ran: Step[] = []
  const stop = (s: FlowStop): FlowResult => ({ state, stop: s, ran })

  const goNext = (): Promise<FlowStop | undefined> => {
    const pages = visiblePages(doc, scope, input.variants)
    const base = state.stack.at(-1)
    // 지금 장이 숨었거나 차례 밖(보낸 뒤 화면)이면 문서 차례로 그 뒤 첫 보이는 장.
    const at = doc.screens.findIndex((s) => s.id === base)
    const following = pages.find((p) => doc.screens.indexOf(p) > at)
    if (!following) return submit()
    state = { ...state, stack: [...state.stack, following.id], sheets: [] }
    return Promise.resolve(undefined)
  }

  const submit = async (): Promise<FlowStop | undefined> => {
    for (const page of visiblePages(doc, scope, input.variants)) {
      const missing = missingFields(input, page, scope)
      if (!missing.length) continue
      // 빈 장으로 — 이미 쌓였으면 거기까지 되돌리고, 아니면 쌓는다.
      const at = state.stack.indexOf(page.id)
      const stack = at >= 0 ? state.stack.slice(0, at + 1) : [...state.stack, page.id]
      state = { ...state, stack, sheets: [] }
      return { reason: 'invalid', screen: page.id, fields: missing.map((f) => f.key) }
    }
    if (!state.submitted) {
      const r = await host.submit(input.answers)
      if (!r.ok) return { reason: 'host', action: 'submit', error: r.error }
    }
    const done = doc.screens.find(
      (s) => s.role === 'done' && screenVisible(s, scope, input.variants),
    )
    state = { stack: done ? [done.id] : state.stack, sheets: [], submitted: true }
    return undefined
  }

  for (const step of planActions(actions, scope)) {
    ran.push(step)
    switch (step.do) {
      case 'validate': {
        const id = currentScreenId(state)
        const screen = id ? byId.get(id) : undefined
        const missing = screen ? missingFields(input, screen, scope) : []
        if (screen && missing.length)
          return stop({ reason: 'invalid', screen: screen.id, fields: missing.map((f) => f.key) })
        break
      }
      case 'save': {
        if (!host.save) break
        const r = await host.save(input.answers)
        if (!r.ok) return stop({ reason: 'host', action: 'save', error: r.error })
        break
      }
      case 'host': {
        if (!host.action)
          return stop({
            reason: 'host',
            action: step.name,
            error: '호스트 동작을 받을 곳이 없습니다.',
          })
        const r = await host.action(step.name, step.args ?? {}, {
          screen: currentScreenId(state),
          answers: input.answers,
        })
        if (!r.ok) return stop({ reason: 'host', action: step.name, error: r.error })
        break
      }
      case 'open':
        host.open?.(step.href)
        break
      case 'go': {
        const target = byId.get(step.to)
        if (!target || !screenVisible(target, scope, input.variants)) {
          const s = await goNext()
          if (s) return stop(s)
          break
        }
        if (step.mode === 'sheet') state = { ...state, sheets: [...state.sheets, target.id] }
        else if (step.mode === 'replace' && state.sheets.length)
          state = { ...state, sheets: [...state.sheets.slice(0, -1), target.id] }
        else if (step.mode === 'replace')
          state = { ...state, stack: [...state.stack.slice(0, -1), target.id] }
        else state = { ...state, stack: [...state.stack, target.id], sheets: [] }
        break
      }
      case 'next': {
        const s = await goNext()
        if (s) return stop(s)
        break
      }
      case 'back':
        if (state.sheets.length) state = { ...state, sheets: state.sheets.slice(0, -1) }
        else if (state.stack.length > 1) state = { ...state, stack: state.stack.slice(0, -1) }
        break
      case 'submit': {
        const s = await submit()
        if (s) return stop(s)
        break
      }
    }
  }
  return { state, ran }
}

/**
 * 이 체인을 지금 하면 보내기에 닿나 — submit, 또는 뒤에 보이는 장이 없는 next(숨은 화면으로 가는 go 포함).
 * 아래 버튼이 「다음」 대신 보내기 글 · 안내를 보일지 고를 때 읽는다(하지는 않는다).
 */
export function chainSubmits(
  input: FlowInput,
  state: FlowState,
  actions: readonly Action[],
): boolean {
  const scope = scopeFor(input)
  const { doc } = input
  const last = planActions(actions, scope).at(-1)
  if (!last) return false
  if (last.do === 'submit') return true
  const nextIsSubmit = () => {
    const at = doc.screens.findIndex((s) => s.id === state.stack.at(-1))
    return !visiblePages(doc, scope, input.variants).some((p) => doc.screens.indexOf(p) > at)
  }
  if (last.do === 'next') return nextIsSubmit()
  if (last.do === 'go') {
    const target = doc.screens.find((s) => s.id === last.to)
    return !target || !screenVisible(target, scope, input.variants) ? nextIsSubmit() : false
  }
  return false
}
