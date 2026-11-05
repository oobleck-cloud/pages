import {
  CAMPAIGN_COLORS,
  CAMPAIGN_TEXT_STYLES,
  definePack,
  defineTheme,
  workstylePack,
  type AssetPack,
  type LayoutStack,
} from '@oobleck/pages'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { defineKit, LayoutScreen, screenFill, type PagesKit } from './index'

const tree: LayoutStack = {
  id: 'root',
  name: '장',
  kind: 'stack',
  dir: 'v',
  gap: 16,
  pad: [20, 20, 20, 20],
  justify: 'start',
  align: 'start',
  children: [
    { id: 't1', name: '제목', kind: 'text', text: '연락받을 곳', align: 'left' },
    { id: 'b1', name: '버튼', kind: 'part', part: 'button', label: '다음', variant: 'primary' },
    { id: 'u1', name: '모름', kind: 'part', part: 'chip', text: '없는 부품' },
  ],
}

type Ctx = { tag: string }

/** v1 토큰으로 지은 시험용 팩 — 캠페인 팩 자체는 MVOS 에 있다. */
const v1Pack = definePack({
  id: 'v1',
  name: 'v1 토큰',
  theme: defineTheme({
    id: 'v1',
    name: 'v1 토큰',
    colors: CAMPAIGN_COLORS,
    textStyles: CAMPAIGN_TEXT_STYLES,
    defaults: { ink: 'campaign/ink', textStyle: 'campaign/body' },
  }),
  surfaces: [{ kind: 'surface', id: 'screen', name: '화면', fill: 'campaign/bg' }],
  components: [],
})

function kitFor(pack: AssetPack, tag: string): PagesKit<Ctx> {
  return defineKit<Ctx>({
    pack,
    parts: {
      button: ({ node, ctx }) => (
        <button data-kit={ctx.tag}>{node.part === 'button' ? node.label : ''}</button>
      ),
    },
    Pick: ({ id, children }) => <div data-pick={id}>{children}</div>,
    Image: () => null,
  })
}

describe('LayoutScreen — 같은 트리, 다른 킷', () => {
  it('부품은 킷이 그리고, 글 · 바탕 색은 킷 팩의 테마에서 찾는다', () => {
    const campaign = renderToStaticMarkup(
      <LayoutScreen root={tree} kit={kitFor(v1Pack, 'mvos')} ctx={{ tag: 'mvos' }} fit={false} />,
    )
    const workstyle = renderToStaticMarkup(
      <LayoutScreen
        root={tree}
        kit={kitFor(workstylePack, 'ws')}
        ctx={{ tag: 'ws' }}
        fit={false}
      />,
    )
    expect(campaign).toContain('data-kit="mvos"')
    expect(workstyle).toContain('data-kit="ws"')
    // 바탕 에셋: 캠페인은 흰 화면, Workstyle 은 n1.
    expect(campaign).toContain('background:#ffffff')
    expect(workstyle).toContain('background:var(--n1, #1e1f22)')
    // 글 기본색도 테마에서.
    expect(campaign).toContain('color:#111111')
    expect(workstyle).toContain('color:var(--ink1, #e8e9ec)')
    // 킷에 없는 부품(chip)은 Missing 이 없으면 그리지 않는다.
    expect(campaign).not.toContain('없는 부품')
  })

  it('뿌리에 건 색이 바탕 에셋보다 앞선다', () => {
    const kit = kitFor(workstylePack, 'ws')
    expect(screenFill(kit, { ...tree, fill: 'n0' })).toBe('var(--n0, #0e0f12)')
    expect(screenFill(kit, tree)).toBe('var(--n1, #1e1f22)')
    expect(screenFill(kit, tree, { kind: 'surface', id: 'x', name: 'x', fill: 'acc' })).toBe(
      'var(--acc, #63a0f1)',
    )
  })
})
