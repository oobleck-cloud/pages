import { describe, expect, it } from 'vitest'

import { definePack } from '../assets'
import { workstylePack } from '../packs/workstyle'
import { planActions } from './actions'
import { fieldAnswered, fieldText, formOf, scopeOf, screenFields } from './form'
import { issueMessage, MESSAGES_KO } from './messages'
import {
  addScreen,
  instantiateTemplate,
  moveNode,
  placeInstance,
  placeNode,
  PlacementError,
  removeNode,
  setBind,
  setOn,
  setProps,
} from './ops'
import { findNode, parseScreenDocument } from './screen'
import { validateScreenDocument } from './validate'

import type { AssetPack } from '../assets'
import type { FrameNode, ScreenDocument } from './screen'

/** 시험용 팩 — 코어는 캠페인을 모른다. Workstyle 부품 + 값 종류 하나(별점) + 화면 틀 하나. */
const testPack: AssetPack = definePack({
  ...workstylePack,
  id: 'test',
  components: [
    ...workstylePack.components,
    {
      kind: 'component',
      key: 'stars',
      name: '별점',
      props: [{ type: 'TEXT', name: 'field', default: '' }],
      value: 'stars',
      bindProp: 'field',
    },
  ],
  valueTypes: [
    {
      id: 'stars',
      name: '별점',
      accepts: ['stars'],
      isAnswered: (_f, v) => typeof v === 'number' && v >= 1 && v <= 5,
      format: (_f, v) => '★'.repeat(Number(v)),
    },
  ],
  templates: [
    {
      id: 'basic',
      name: '기본',
      frame: {
        id: 'frame',
        kind: 'stack',
        dir: 'v',
        gap: 0,
        pad: [0, 0, 0, 0],
        justify: 'start',
        align: 'start',
        slot: false,
        children: ['head', 'body', 'foot'].map(
          (id): FrameNode => ({
            id,
            kind: 'stack',
            dir: 'v',
            gap: 8,
            pad: [0, 0, 0, 0],
            justify: 'start',
            align: 'start',
            children: [],
          }),
        ),
      },
    },
  ],
})
const PACKS = [testPack]

function doc(): ScreenDocument {
  const template = testPack.templates![0]!
  const frame = (id: string, body: FrameNode['children'], foot: FrameNode['children'] = []) => {
    const f = instantiateTemplate(template, id)
    return {
      ...f,
      children: f.children.map((c) =>
        c.kind === 'stack' && c.id === `${id}-body`
          ? { ...c, children: body }
          : c.kind === 'stack' && c.id === `${id}-foot`
            ? { ...c, children: foot }
            : c,
      ),
    }
  }
  return {
    schemaVersion: 2,
    packs: ['test'],
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
      { key: 'note', type: 'text', label: '메모', short: '메모', required: false },
      { key: 'rate', type: 'stars', label: '별점', short: '별점', required: false },
    ],
    computed: [{ name: 'big', expr: { '==': [{ var: 'fields.size' }, 'l'] } }],
    screens: [
      {
        id: 'p1',
        name: '첫 장',
        role: 'page',
        numbered: true,
        template: 'basic',
        frame: frame(
          'p1',
          [
            { id: 'size', kind: 'instance', use: 'test:segment', props: {}, bind: 'size' },
            {
              id: 'note',
              kind: 'instance',
              use: 'test:field',
              props: { placeholder: '적어 주세요' },
              bind: 'note',
              visibleWhen: { '==': [{ var: 'answers.size' }, 'l'] },
            },
          ],
          [
            {
              id: 'go',
              kind: 'instance',
              use: 'test:button',
              props: { label: '다음' },
              on: { press: [{ do: 'validate' }, { do: 'next' }] },
            },
          ],
        ),
      },
      {
        id: 'p2',
        name: '둘째 장',
        role: 'page',
        numbered: true,
        frame: frame('p2', [
          { id: 'rate', kind: 'instance', use: 'test:stars', props: {}, bind: 'rate' },
        ]),
      },
      { id: 'done', name: '끝', role: 'done', numbered: false, frame: frame('done', []) },
    ],
    submit: { label: '보내기', note: '' },
    variants: [],
  }
}

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (e) {
    return e instanceof PlacementError ? e.code : 'other'
  }
  return 'none'
}

describe('v2 문서', () => {
  it('스키마로 읽히고, 막는 문제가 없다', () => {
    const d = doc()
    expect(parseScreenDocument(JSON.parse(JSON.stringify(d)))).toEqual(d)
    expect(validateScreenDocument(d, PACKS).filter((i) => i.level === 'error')).toEqual([])
  })

  it('문항 색인 — 장마다 놓인 차례, 조상 · 부품 조건은 when 으로', () => {
    const form = formOf(doc(), PACKS)
    expect(form.sections.map((s) => [s.key, s.questions.map((q) => q.key)])).toEqual([
      ['p1', ['size', 'note']],
      ['p2', ['rate']],
    ])
    const note = form.sections[0]!.questions[1]!
    expect(note).toMatchObject({ kind: 'text', placeholder: '', multiline: false })
    expect(note.when?.({ size: 'l' })).toBe(true)
    expect(note.when?.({ size: 's' })).toBe(false)
    expect(screenFields(doc(), doc().screens[0]!, {}).map((f) => f.key)).toEqual(['size'])
  })

  it('팩이 더한 값 종류로 답을 센다 — 팩이 없으면 모르는 종류', () => {
    const rate = doc().fields[2]!
    expect(fieldAnswered(PACKS, rate, 4)).toBe(true)
    expect(fieldText(PACKS, rate, 3)).toBe('★★★')
    expect(fieldAnswered([], rate, 4)).toBe(false)
    const codes = validateScreenDocument(doc(), []).map((i) => i.code)
    expect(codes).toContain('field-type')
  })

  it('계산값은 필드 · 호스트 변수를 읽는다', () => {
    expect(scopeOf(doc(), { size: 'l' }, { partner: 'p' })).toMatchObject({
      fields: { size: 'l' },
      answers: { size: 'l' },
      host: { partner: 'p' },
      computed: { big: true },
    })
  })
})

describe('동작 체인', () => {
  it('분기를 풀고 끝내는 동작 뒤는 버린다', () => {
    const chain = [
      { do: 'validate' as const },
      {
        do: 'branch' as const,
        when: [
          {
            if: { var: 'computed.big' },
            then: [{ do: 'go' as const, to: 'p2', mode: 'sheet' as const }],
          },
        ],
        else: [{ do: 'save' as const }],
      },
      { do: 'next' as const },
      { do: 'submit' as const },
    ]
    expect(planActions(chain, scopeOf(doc(), { size: 'l' }))).toEqual([
      { do: 'validate' },
      { do: 'go', to: 'p2', mode: 'sheet' },
    ])
    expect(planActions(chain, scopeOf(doc(), { size: 's' }))).toEqual([
      { do: 'validate' },
      { do: 'save' },
      { do: 'next' },
    ])
  })
})

describe('배치 연산 — 부품 조합 · 배치까지만', () => {
  it('칸에 부품을 놓고, 속성 · 연결 · 동작을 고친다', () => {
    const { doc: d, id } = placeInstance(
      doc(),
      PACKS,
      { screen: 'p2', frame: 'p2-body', index: 0 },
      { use: 'test:status', props: { tone: 'warn', label: '마감 임박' } },
    )
    expect(findNode(d.screens[1]!.frame, id)).toMatchObject({ use: 'test:status' })
    const styled = setProps(d, PACKS, 'go', { kind: 'secondary', label: undefined })
    expect(findNode(styled.screens[0]!.frame, 'go')).toMatchObject({ props: { kind: 'secondary' } })
    const unbound = setBind(styled, 'note', undefined)
    expect(findNode(unbound.screens[0]!.frame, 'note')).not.toHaveProperty('bind')
    const off = setOn(unbound, 'go', 'press', undefined)
    expect(findNode(off.screens[0]!.frame, 'go')).not.toHaveProperty('on')
  })

  it('다른 화면의 칸으로 옮긴다', () => {
    const moved = moveNode(doc(), 'note', { screen: 'p2', frame: 'p2-foot' })
    expect(findNode(moved.screens[0]!.frame, 'note')).toBeNull()
    expect(findNode(moved.screens[1]!.frame, 'note')).not.toBeNull()
  })

  it('틀은 넣거나 빼거나 고칠 수 없고, 칸이 아닌 틀에는 놓을 수 없다', () => {
    const d = doc()
    expect(code(() => removeNode(d, 'p1-body'))).toBe('frame-locked')
    expect(
      code(() =>
        placeNode(
          d,
          { screen: 'p1', frame: 'p1-frame' },
          {
            id: 'x1',
            kind: 'text',
            text: '',
            align: 'left',
          },
        ),
      ),
    ).toBe('not-slot')
    expect(
      code(() =>
        placeNode(d, { screen: 'p1', frame: 'p1-body' }, {
          id: 'x2',
          kind: 'stack',
          dir: 'h',
          gap: 0,
          pad: [0, 0, 0, 0],
          justify: 'start',
          align: 'start',
          children: [],
        } as never),
      ),
    ).toBe('frame-locked')
    expect(code(() => setProps(d, PACKS, 'go', { kind: 'huge' }))).toBe('props-invalid')
    expect(
      code(() => placeInstance(d, PACKS, { screen: 'p1', frame: 'p1-body' }, { use: 'test:nope' })),
    ).toBe('component-unknown')
    expect(
      code(() =>
        placeNode(
          d,
          { screen: 'p1', frame: 'p1-body' },
          {
            id: 'size',
            kind: 'text',
            text: '',
            align: 'left',
          },
        ),
      ),
    ).toBe('id-taken')
  })

  it('새 화면은 팩의 틀로 짓는다', () => {
    const d = addScreen(doc(), testPack, { id: 'extra', name: '덧', template: 'basic', at: 1 })
    expect(d.screens.map((s) => s.id)).toEqual(['p1', 'extra', 'p2', 'done'])
    expect(d.screens[1]!.frame.children.map((c) => c.id)).toEqual([
      'extra-head',
      'extra-body',
      'extra-foot',
    ])
    expect(code(() => addScreen(d, testPack, { id: 'x', name: 'x', template: 'nope' }))).toBe(
      'template-unknown',
    )
  })
})

describe('검증', () => {
  it('값 연결 · 동작 · 호스트 동작 · 팩', () => {
    let d = placeInstance(
      doc(),
      [...PACKS],
      { screen: 'p1', frame: 'p1-body' },
      {
        use: 'test:checkbox',
        bind: 'size',
      },
    ).doc
    d = setOn(d, 'go', 'press', [
      { do: 'host', name: 'sendSms' },
      { do: 'go', to: 'ghost', mode: 'push' },
    ])
    d = setOn(d, 'go', 'hover', [{ do: 'back' }])
    const codes = validateScreenDocument(d, PACKS, { hostActions: ['call'] }).map((i) => i.code)
    expect(codes).toEqual(
      expect.arrayContaining(['bind-mismatch', 'host-unknown', 'go-unknown', 'event-unknown']),
    )
    const other = { ...doc(), packs: ['workstyle'] }
    expect(validateScreenDocument(other, [workstylePack, testPack]).map((i) => i.code)).toContain(
      'pack-unknown',
    )
  })

  it('발행한 판의 필드 키 · 값 종류 · 선택지 값을 지킨다', () => {
    const published = doc()
    const next: ScreenDocument = {
      ...published,
      fields: published.fields
        .filter((f) => f.key !== 'rate')
        .map((f) =>
          f.key === 'size'
            ? { ...f, options: f.options!.slice(1) }
            : f.key === 'note'
              ? { ...f, type: 'number' }
              : f,
        ),
    }
    const codes = validateScreenDocument(next, PACKS, { published }).map((i) => i.code)
    expect(codes).toEqual(
      expect.arrayContaining(['published-removed', 'published-type', 'published-option']),
    )
  })

  it('모든 코드에 문장이 있고, 모르는 언어는 한국어', () => {
    for (const c of Object.keys(MESSAGES_KO))
      expect(
        issueMessage({ code: c as keyof typeof MESSAGES_KO, params: { detail: '맞지 않아요' } }),
      ).toBeTruthy()
    expect(issueMessage({ code: 'bind-unknown', params: { field: 'q9' } }, 'en')).toBe(
      '필드 「q9」가 없어요',
    )
  })
})
