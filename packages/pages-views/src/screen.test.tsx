import { workstylePack } from '@oobleck/pages'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  defineScreenKit,
  ScreenFlowView,
  ScreenView,
  useScreenFlow,
  type InstanceProps,
  type ScreenRuntime,
} from './index'
import { workstyleScreenKit } from './workstyle'

import type { FrameNode, Screen, ScreenDocument } from '@oobleck/pages'

const frame = (children: FrameNode['children'], fill?: string): FrameNode => ({
  id: 'p1-frame',
  kind: 'stack',
  dir: 'v',
  gap: 8,
  pad: [0, 0, 0, 0],
  justify: 'start',
  align: 'start',
  ...(fill ? { fill } : {}),
  children,
})

const screen: Screen = {
  id: 'p1',
  name: '첫 장',
  role: 'page',
  numbered: false,
  frame: frame([
    { id: 't', kind: 'text', text: '꼭 **답해** 주세요', align: 'left', emphasis: true },
    {
      id: 'when',
      kind: 'text',
      text: '크게 고르셨네요',
      align: 'left',
      visibleWhen: { '==': [{ var: 'fields.size' }, 'l'] },
    },
    { id: 'seg', kind: 'instance', use: 'workstyle:segment', props: {}, bind: 'size' },
    { id: 'tab', kind: 'instance', use: 'workstyle:tab', props: { label: '보기' }, bind: 'size' },
    { id: 'step', kind: 'instance', use: 'workstyle:stepper', props: {}, bind: 'count' },
    {
      id: 'st',
      kind: 'instance',
      use: 'workstyle:status',
      props: { tone: 'warn', label: '마감 임박' },
    },
    {
      id: 'go',
      kind: 'instance',
      use: 'workstyle:button',
      props: { label: '다음' },
      on: { press: [{ do: 'validate' }, { do: 'next' }] },
    },
  ]),
}

const doc: ScreenDocument = {
  schemaVersion: 2,
  packs: ['workstyle'],
  screens: [screen],
  fields: [
    {
      key: 'size',
      type: 'choice',
      label: '크기',
      short: '크기',
      required: true,
      options: [
        { value: 's', label: '작게' },
        { value: 'l', label: '크게' },
      ],
    },
    { key: 'count', type: 'number', label: '개수', short: '개수', required: false, unit: '개' },
  ],
  submit: { label: '보내기', note: '' },
  variants: [],
}

function runtime(over: Partial<ScreenRuntime> = {}): ScreenRuntime {
  return { doc, answers: {}, onAnswer: () => {}, onEvent: () => {}, ...over }
}

describe('ScreenView — Workstyle 킷', () => {
  it('Segment · Tabs · Stepper · Status · Button 을 그린다 — 고르는 부품의 선택지는 필드에서', () => {
    const html = renderToStaticMarkup(
      <ScreenView screen={screen} kits={[workstyleScreenKit]} runtime={runtime()} ctx={{}} />,
    )
    expect(html).toContain('ws-seg')
    expect(html).toContain('role="tablist"')
    expect(html.match(/작게/g)).toHaveLength(2)
    expect(html).toContain('마감 임박')
    expect(html).toContain('>다음<')
    // 바탕은 팩의 화면 바탕(n1), 강조는 테마 강조색(acc) — Workstyle 변수로, 없으면 hex.
    expect(html).toContain('background:var(--n1, #1e1f22)')
    expect(html).toContain('color:var(--acc, #63a0f1)">답해</strong>')
  })

  it('보이는 조건 — 숨으면 그리지 않고, 편집 중이면 흐리게 그린다', () => {
    const hidden = renderToStaticMarkup(
      <ScreenView screen={screen} kits={[workstyleScreenKit]} runtime={runtime()} ctx={{}} />,
    )
    expect(hidden).not.toContain('크게 고르셨네요')
    const shown = renderToStaticMarkup(
      <ScreenView
        screen={screen}
        kits={[workstyleScreenKit]}
        runtime={runtime({ answers: { size: 'l' } })}
        ctx={{}}
      />,
    )
    expect(shown).toContain('크게 고르셨네요')
    const editing = renderToStaticMarkup(
      <ScreenView
        screen={screen}
        kits={[workstyleScreenKit]}
        runtime={runtime({ editing: true })}
        ctx={{ editing: { selected: null, onSelect: () => {} } }}
      />,
    )
    expect(editing).toContain('크게 고르셨네요')
    expect(editing).toContain('opacity:0.4')
  })

  it('뿌리 틀에 건 색이 바탕 에셋보다 앞선다', () => {
    const html = renderToStaticMarkup(
      <ScreenView
        screen={{ ...screen, frame: { ...screen.frame, fill: 'n0' } }}
        kits={[workstyleScreenKit]}
        runtime={runtime()}
        ctx={{}}
      />,
    )
    expect(html).toContain('background:var(--n0, #0e0f12)')
  })
})

describe('ScreenView — 부품 연결', () => {
  it('부품은 기본값을 채운 속성 · 묶인 값을 받고, 값을 바꾸고 일을 일으킨다', () => {
    const seen: Array<{ key: string; props: unknown; value: unknown }> = []
    const answers: Array<[string, unknown]> = []
    const events: Array<[string, string, unknown]> = []
    const probe = (p: InstanceProps<object>) => {
      seen.push({ key: p.node.id, props: p.props, value: p.value })
      p.setValue(`${p.node.id}!`)
      p.fire('press')
      return null
    }
    const kit = defineScreenKit<object>({
      pack: workstylePack,
      components: Object.fromEntries(workstylePack.components.map((c) => [c.key, probe])),
      Pick: ({ children }) => <>{children}</>,
      Image: () => null,
    })
    renderToStaticMarkup(
      <ScreenView
        screen={screen}
        kits={[kit]}
        runtime={runtime({
          answers: { size: 's' },
          onAnswer: (k, v) => answers.push([k, v]),
          onEvent: (n, e, a) => events.push([n.id, e, a]),
        })}
        ctx={{}}
      />,
    )
    expect(seen.find((s) => s.key === 'seg')).toEqual({
      key: 'seg',
      props: { size: 'md' },
      value: 's',
    })
    expect(seen.find((s) => s.key === 'go')?.props).toEqual({
      kind: 'primary',
      size: 'md',
      state: 'default',
      label: '다음',
      icon: null,
    })
    // 묶인 부품만 값을 바꾸고, 동작이 걸린 일만 런타임에 간다.
    expect(answers).toEqual([
      ['size', 'seg!'],
      ['size', 'tab!'],
      ['count', 'step!'],
    ])
    expect(events).toEqual([['go', 'press', [{ do: 'validate' }, { do: 'next' }]]])
  })

  it('읽기 전용이면 값을 바꾸지 않는다', () => {
    const answers: unknown[] = []
    const kit = defineScreenKit<object>({
      pack: workstylePack,
      components: {
        segment: (p) => {
          p.setValue('x')
          return null
        },
      },
      Pick: ({ children }) => <>{children}</>,
      Image: () => null,
    })
    renderToStaticMarkup(
      <ScreenView
        screen={screen}
        kits={[kit]}
        runtime={runtime({ readOnly: true, onAnswer: (...a) => answers.push(a) })}
        ctx={{}}
      />,
    )
    expect(answers).toEqual([])
  })
})

describe('흐름 뷰', () => {
  const host = { submit: () => Promise.resolve({ ok: true as const }) }
  const sheet: Screen = { ...screen, id: 's1', name: '시트', role: 'sheet', frame: frame([]) }
  const flowDoc: ScreenDocument = { ...doc, screens: [screen, sheet] }

  function Harness({ sheets }: { sheets?: string[] }) {
    const flow = useScreenFlow({ doc: flowDoc, packs: [workstylePack], host })
    const shown = sheets
      ? {
          ...flow,
          sheets: flowDoc.screens.filter((s) => sheets.includes(s.id)),
          state: { ...flow.state, sheets },
        }
      : flow
    return <ScreenFlowView flow={shown} kits={[workstyleScreenKit]} ctx={{}} />
  }

  it('첫 보이는 장에서 시작한다', () => {
    const html = renderToStaticMarkup(<Harness />)
    expect(html).toContain('data-flow-screen="p1"')
    expect(html).toContain('data-screen="p1"')
    expect(html).not.toContain('role="dialog"')
  })

  it('시트는 장 위에 대화 상자로 뜬다', () => {
    const html = renderToStaticMarkup(<Harness sheets={['s1']} />)
    expect(html).toContain('data-flow-screen="s1"')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('data-screen="s1"')
  })

  it('답이 바뀌어 지금 장이 숨으면 그 뒤 첫 보이는 장을 그린다', () => {
    const hidden: Screen = {
      ...screen,
      id: 'p2',
      name: '크게만',
      visibleWhen: { '==': [{ var: 'answers.size' }, 'l'] },
    }
    const after: Screen = { ...screen, id: 'p3', name: '셋째 장' }
    const d: ScreenDocument = { ...doc, screens: [screen, hidden, after] }
    function Hidden() {
      const flow = useScreenFlow({
        doc: d,
        packs: [workstylePack],
        host,
        answers: { size: 's' },
        start: { stack: ['p1', 'p2'], sheets: [], submitted: false },
      })
      return <ScreenFlowView flow={flow} kits={[workstyleScreenKit]} ctx={{}} />
    }
    const html = renderToStaticMarkup(<Hidden />)
    expect(html).toContain('data-flow-screen="p3"')
    expect(html).not.toContain('data-screen="p2"')
  })
})
