import {
  chainSubmits,
  currentScreenId,
  flowProgress,
  missingFields,
  runChain,
  startFlow,
} from '@oobleck/pages'
import { useCallback, useMemo, useRef, useState } from 'react'

import { ScreenView } from './screen'

import type { ScreenKit, ScreenRuntime } from './screen'
import type {
  ActionList,
  AssetPack,
  FlowHost,
  FlowState,
  FlowStop,
  InstanceNode,
  Screen,
  ScreenDocument,
} from '@oobleck/pages'
import type { ReactNode } from 'react'

/**
 * SPA 흐름 — 화면 문서(v2)를 답 · 흐름 상태와 함께 움직인다. 부품이 일으킨 일의 동작 체인은 코어 [runChain] 이 하고,
 * 이 훅은 그 결과(쌓인 화면 · 시트 · 멈춘 까닭)를 React 상태로 든다. 체인이 도는 동안 들어온 일은 버린다(두 번 누르기).
 */
export type ScreenFlow = {
  state: FlowState
  /** 쌓인 화면 맨 위(장 · 보낸 뒤 화면). */
  page: Screen | null
  /** 위에 뜬 시트(아래부터). */
  sheets: Screen[]
  answers: Readonly<Record<string, unknown>>
  /** 체인이 도는 중. */
  busy: boolean
  /** 마지막 체인이 멈춘 까닭 — 답을 바꾸거나 다음 체인을 하면 지운다. */
  stop: FlowStop | null
  progress: { index: number; total: number } | null
  /** 지금 장에서 꼭 답할 필드 가운데 빈 것. */
  missing: string[]
  /** 뒤로 갈 곳이 있나(시트 · 앞 장). */
  canBack: boolean
  /** 이 체인을 지금 하면 보내기에 닿나 — 아래 버튼 글 · 안내를 고를 때. */
  submitsOn: (actions: ActionList) => boolean
  /** ScreenView 에 넘길 런타임(장 · 시트 같은 것을 쓴다). */
  runtime: ScreenRuntime
  setAnswer: (key: string, value: unknown) => void
  run: (actions: ActionList) => Promise<void>
  reset: (state: FlowState) => void
}

export function useScreenFlow({
  doc,
  packs,
  host,
  hostVars,
  variants,
  answers: controlled,
  initialAnswers,
  start,
  readOnly,
  onAnswer,
}: {
  doc: ScreenDocument
  packs: readonly AssetPack[]
  host: FlowHost
  hostVars?: Readonly<Record<string, unknown>> | undefined
  /** 켠 갈래 — 갈래가 붙은 화면은 켰을 때만 보인다. */
  variants?: readonly string[] | undefined
  /** 답을 호스트가 들고 있으면(저장 훅 등) — 주면 [onAnswer] 로만 바뀐다. */
  answers?: Readonly<Record<string, unknown>> | undefined
  /** 호스트가 답을 들지 않을 때의 첫 답. */
  initialAnswers?: Readonly<Record<string, unknown>> | undefined
  /** 첫 흐름 — 없으면 첫 보이는 장(이미 보낸 뒤 다시 열면 보낸 뒤 화면 등). */
  start?: FlowState | undefined
  /** 답을 바꾸지 못한다 — 장은 넘겨 볼 수 있다. */
  readOnly?: boolean | undefined
  /** 답이 바뀔 때마다(임시 저장 등). */
  onAnswer?: ((key: string, value: unknown, answers: Record<string, unknown>) => void) | undefined
}): ScreenFlow {
  const [own, setOwn] = useState<Record<string, unknown>>(() => ({
    ...(initialAnswers ?? {}),
  }))
  const answers = controlled ?? own
  const [state, setState] = useState<FlowState>(
    () => start ?? startFlow({ doc, packs, answers: { ...answers }, hostVars, variants }),
  )
  const [busy, setBusy] = useState(false)
  const [stop, setStop] = useState<FlowStop | null>(null)

  // 체인은 비동기라 마지막 답 · 상태를 ref 로 읽는다(누른 순간의 렌더 값이 아니라).
  const live = useRef({ answers: { ...answers }, state, busy: false })
  live.current.answers = { ...answers }
  live.current.state = state

  const setAnswer = useCallback(
    (key: string, value: unknown) => {
      if (readOnly) return
      const next = { ...live.current.answers, [key]: value }
      live.current.answers = next
      if (!controlled) setOwn(next)
      setStop((s) => (s?.reason === 'invalid' ? null : s))
      onAnswer?.(key, value, next)
    },
    [readOnly, onAnswer, controlled],
  )

  const run = useCallback(
    async (actions: ActionList) => {
      if (live.current.busy) return
      live.current.busy = true
      setBusy(true)
      setStop(null)
      try {
        const r = await runChain(
          { doc, packs, answers: live.current.answers, hostVars, variants },
          live.current.state,
          actions,
          host,
        )
        live.current.state = r.state
        setState(r.state)
        setStop(r.stop ?? null)
      } finally {
        live.current.busy = false
        setBusy(false)
      }
    },
    [doc, packs, hostVars, variants, host],
  )

  /** 흐름을 바꾼다 — 보낸 뒤 「답 고치기」 · 편집기에서 장 고르기처럼 체인 밖에서. */
  const reset = useCallback((next: FlowState) => {
    live.current.state = next
    setState(next)
    setStop(null)
  }, [])

  const byId = useMemo(() => new Map(doc.screens.map((s) => [s.id, s])), [doc])
  const input = { doc, packs, answers: { ...answers }, hostVars, variants }
  const runtime: ScreenRuntime = {
    doc,
    answers,
    host: hostVars,
    readOnly,
    onAnswer: setAnswer,
    onEvent: (_node: InstanceNode, _event: string, actions: ActionList) => {
      void run(actions)
    },
  }
  const top = state.stack.at(-1)
  const page = (top !== undefined ? byId.get(top) : undefined) ?? null
  return {
    state,
    page,
    sheets: state.sheets.flatMap((id) => byId.get(id) ?? []),
    answers,
    busy,
    stop,
    progress: flowProgress(input, state),
    missing: page ? missingFields(input, page).map((f) => f.key) : [],
    canBack: state.sheets.length > 0 || state.stack.length > 1,
    submitsOn: (actions) => chainSubmits(input, state, actions),
    runtime,
    setAnswer,
    run,
    reset,
  }
}

/**
 * 흐름 하나를 그린다 — 지금 장, 그 위에 시트(아래에서 올라오는 판). 시트 바깥을 누르면 뒤로(시트 닫기).
 * 그리는 꼴(헤더 · 진행 막대 · 멈춘 까닭 안내)이 더 필요하면 [useScreenFlow] 를 직접 쓴다.
 */
export function ScreenFlowView<C>({
  flow,
  kits,
  ctx,
  className,
  sheetClassName,
}: {
  flow: ScreenFlow
  kits: readonly ScreenKit<C>[]
  ctx: C
  className?: string | undefined
  sheetClassName?: string | undefined
}): ReactNode {
  const { page, sheets, runtime } = flow
  return (
    <div
      className={className}
      data-flow-screen={currentScreenId(flow.state) ?? undefined}
      aria-busy={flow.busy || undefined}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: '100%' }}
    >
      {page && <ScreenView key={page.id} screen={page} kits={kits} runtime={runtime} ctx={ctx} />}
      {sheets.map((sheet) => (
        <div
          key={sheet.id}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) void flow.run([{ do: 'back' }])
          }}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            background: 'rgba(0, 0, 0, 0.4)',
          }}
        >
          <div role="dialog" aria-modal="true" aria-label={sheet.name} className={sheetClassName}>
            <ScreenView screen={sheet} kits={kits} runtime={runtime} ctx={ctx} />
          </div>
        </div>
      ))}
    </div>
  )
}
