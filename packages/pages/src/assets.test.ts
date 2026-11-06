import { describe, expect, it } from 'vitest'

import {
  CAMPAIGN_COLORS,
  checkProps,
  colorOf,
  defaultProps,
  definePack,
  findComponent,
  fontOf,
  resolveColor,
  workstylePack,
  workstyleTheme,
  type LayoutText,
} from './index'

describe('에셋 팩', () => {
  it('테마를 주지 않은 colorOf 는 v1 캠페인 토큰을 읽는다 — 나간 설문의 색', () => {
    for (const [name, value] of Object.entries(CAMPAIGN_COLORS)) expect(colorOf(name)).toBe(value)
    const text: LayoutText = { id: 't', name: 't', kind: 'text', text: '가', align: 'left' }
    expect(fontOf(text)).toEqual({ size: 16, weight: 400, lineHeight: 24 })
  })

  it('같은 토큰 이름이라도 테마가 다르면 다른 값 — 테마는 에셋으로 갈아 끼운다', () => {
    expect(colorOf('acc', workstyleTheme)).toBe('var(--acc, #63a0f1)')
    expect(colorOf('campaign/primary', workstyleTheme)).toBeUndefined()
    expect(colorOf('#123456', workstyleTheme)).toBe('#123456')
  })

  it('바탕도 에셋 — 팩마다 화면 바탕이 있다', () => {
    for (const pack of [workstylePack]) {
      const screen = pack.surfaces.find((s) => s.id === 'screen')
      expect(screen && resolveColor(pack.theme, screen.fill)).toMatch(
        /^var\(--\w+, #[0-9a-f]{6}\)$/,
      )
    }
  })

  it('Workstyle 부품은 canvas(Seed Studio) 속성 형식 — Button 은 kind · size · state · label · icon', () => {
    const button = findComponent(workstylePack, 'button')
    expect(button?.props.map((p) => `${p.name}:${p.type}`)).toEqual([
      'kind:VARIANT',
      'size:VARIANT',
      'state:VARIANT',
      'label:TEXT',
      'icon:INSTANCE_SWAP',
    ])
    expect(button && defaultProps(button)).toEqual({
      kind: 'primary',
      size: 'md',
      state: 'default',
      label: '확인',
      icon: null,
    })
  })

  it('속성 값 검사', () => {
    const button = findComponent(workstylePack, 'button')!
    expect(checkProps(button, { kind: 'primary', label: '다음', icon: null })).toEqual([])
    expect(checkProps(button, { kind: 'huge', size: 3, nope: 1 })).toHaveLength(3)
  })

  it('정의가 틀리면 만들 때 막는다', () => {
    expect(() =>
      definePack({
        ...workstylePack,
        components: [
          {
            kind: 'component',
            key: 'x',
            name: 'X',
            props: [{ type: 'VARIANT', name: 'v', options: ['a'], default: 'b' }],
          },
        ],
      }),
    ).toThrow()
    expect(() =>
      definePack({
        ...workstylePack,
        components: [...workstylePack.components, workstylePack.components[0]!],
      }),
    ).toThrow()
    expect(() =>
      definePack({
        ...workstylePack,
        components: [
          {
            kind: 'component',
            key: 'y',
            name: 'Y',
            props: [{ type: 'BOOLEAN', name: 'id', default: false }],
            value: 'text',
            bindProp: 'id',
          },
        ],
      }),
    ).toThrow()
  })
})
