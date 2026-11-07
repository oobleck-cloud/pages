import { describe, expect, it } from 'vitest'

import FIXTURE from './__fixtures__/insurance-2026-11.document.json'
import SEED from './__fixtures__/seed-landing.seed.json'
import SEED_FULL from './__fixtures__/seed-landing-full.seed.json'
import {
  hasBlockingIssue,
  indexOf,
  pageQuestions,
  parseDocument,
  validateDocument,
} from './campaign-document'
import { findLayoutNode, layoutImages, layoutQuestions } from './campaign-layout'
import { applySeed, questionStubFor, seedToPages } from './seed-import'

import type { CampaignDocument } from './campaign-document'

const legacy = parseDocument(FIXTURE) as CampaignDocument

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

describe('seedToPages', () => {
  const { pages, problems } = seedToPages(SEED)

  it('변형 이름이 여러 속성이어도(「배치=목록, 물음 숨기기=false」) 값을 읽고, 입력 「수」를 숫자로 본다', () => {
    const set = (name: string, variants: Array<[string, string]>) => ({
      id: `set-${name}`,
      type: 'COMPONENT_SET',
      name,
      componentPropertyDefinitions: [{ id: 'qid#1', name: '질문 ID', defaultValue: 'k' }],
      children: variants.map(([id, n]) => ({ id, type: 'COMPONENT', name: n })),
    })
    const doc = {
      schema: 'seed-design/document',
      pages: [
        {
          id: 'lib',
          internalOnly: true,
          children: [
            set('question-choice', [['c-list', '배치=목록, 물음 숨기기=false']]),
            set('question-input', [['i-num', '종류=수, 물음 숨기기=true']]),
          ],
        },
        {
          id: 'pg',
          children: [
            {
              id: 'f1',
              type: 'FRAME',
              name: 'p1 · 장',
              layoutMode: 'VERTICAL',
              children: [
                {
                  id: 'a',
                  type: 'INSTANCE',
                  componentId: 'c-list',
                  componentPropertyAssignments: { 'qid#1': 'q1' },
                },
                {
                  id: 'b',
                  type: 'INSTANCE',
                  componentId: 'i-num',
                  componentPropertyAssignments: { 'qid#1': 'q2' },
                },
              ],
            },
          ],
        },
      ],
    }
    const [page] = seedToPages(doc).pages
    expect(layoutQuestions(page!.layout)).toEqual([
      expect.objectContaining({ qid: 'q1', component: 'question-choice', variant: 'list' }),
      expect.objectContaining({ qid: 'q2', component: 'question-input', variant: 'number' }),
    ])
  })

  it('페이지 프레임 하나가 장 하나 — 이름 「id · 이름」을 읽는다', () => {
    expect(problems).toEqual([])
    expect(pages.map((p) => [p.id, p.name])).toEqual([['liability', '질문1 영업배상']])
  })

  it('부품 · 글자 스타일 · 색 토큰 · 정렬을 옮긴다', () => {
    const root = pages[0]!.layout
    const q = layoutQuestions(root)
    expect(q).toEqual([
      expect.objectContaining({ qid: 'liability', component: 'question-choice', variant: 'tiles' }),
    ])
    const title = findLayoutNode(root, '0:1005786')
    expect(title).toMatchObject({
      kind: 'text',
      text: '영업배상책임보험에 들어 계세요?',
      style: 'campaign/title',
      color: 'campaign/ink',
      align: 'center',
    })
    expect(findLayoutNode(root, '0:1005777')).toMatchObject({
      kind: 'stack',
      dir: 'v',
      pad: [48, 24, 48, 24],
      fill: 'campaign/bg',
      grow: true,
      stretch: true,
    })
    expect(findLayoutNode(root, '0:1005784')).toMatchObject({ justify: 'center', gap: 32 })
    expect(findLayoutNode(root, '0:1005778')).toMatchObject({
      part: 'progress-header',
      step: true,
    })
    expect(findLayoutNode(root, '0:1005790') ?? null).toBeNull() // 부품 안은 옮기지 않는다
  })

  it('Seed 문서가 아니면 던진다', () => {
    expect(() => seedToPages({ pages: [] })).toThrow()
  })
})

describe('applySeed', () => {
  it('질문 ID 로 앞 문서의 정의를 찾아 붙이고, 빠진 정의는 질문 보관함에 둔다', () => {
    const { doc, missing } = applySeed(legacy, SEED)
    expect(missing).toEqual([])
    expect(doc.pages).toHaveLength(1)
    const page = doc.pages[0]!
    expect(page.numbered).toBe(true)
    expect(page.blocks.map((b) => (b.type === 'question' ? b.question.key : b.type))).toEqual([
      'liability',
    ])
    expect(doc.questionBank?.map((b) => (b.type === 'question' ? b.question.key : ''))).toContain(
      'cargo',
    )
    expect(indexOf(doc).sections.map((s) => s.questions.map((q) => q.key))).toEqual([['liability']])
    expect(validateDocument(doc, null).filter((i) => i.level === 'error')).toEqual([])
    // 다시 옮겨도 같다(보관함의 정의를 되찾는다).
    expect(applySeed(doc, SEED).doc).toEqual(doc)
  })

  it('질문 목록에 없는 질문 ID 는 발행을 막고, 정의를 만들면 풀린다', () => {
    const { doc, missing } = applySeed(
      { ...legacy, pages: [], done: { blocks: [] }, questionBank: [] },
      SEED,
    )
    expect(missing).toEqual(['liability'])
    const issues = validateDocument(doc, null)
    expect(hasBlockingIssue(issues)).toBe(true)
    expect(issues.map((i) => i.message)).toContain('질문 ID 「liability」가 질문 목록에 없어요')

    const part = layoutQuestions(doc.pages[0]!.layout!)[0]!
    const stub = questionStubFor(part, 'b1')
    expect(stub.question).toMatchObject({ key: 'liability', kind: 'choice', layout: 'row' })
    const filled: CampaignDocument = {
      ...doc,
      pages: [
        {
          ...doc.pages[0]!,
          blocks: [
            {
              ...stub,
              question: {
                ...stub.question,
                label: '영업배상책임보험에 들어 계세요?',
                short: '영업배상',
                ...(stub.question.kind === 'choice'
                  ? {
                      options: [
                        { value: 'yes', label: '네' },
                        { value: 'no', label: '아니요' },
                      ],
                    }
                  : {}),
              } as typeof stub.question,
            },
          ],
        },
      ],
    }
    expect(validateDocument(filled, null).filter((i) => i.level === 'error')).toEqual([])
    expect(pageQuestions(filled.pages[0]!, {}).map((q) => q.key)).toEqual(['liability'])
  })

  it('모르는 레이어 · 종류가 맞지 않는 부품은 발행을 막는다', () => {
    const seed = clone(SEED) as { pages: Array<{ children: Array<Record<string, unknown>> }> }
    const frame = seed.pages[0]!.children[0] as { children: Array<{ children: unknown[] }> }
    frame.children[0]!.children.push({ id: '9:1', type: 'ELLIPSE', name: '동그라미' })
    const { doc } = applySeed(legacy, seed)
    const messages = validateDocument(doc, null).map((i) => i.message)
    expect(messages.some((m) => m.includes('「동그라미」는 랜딩에 옮길 수 없어요'))).toBe(true)

    const wrong: CampaignDocument = clone(doc)
    const b = wrong.pages[0]!.blocks[0]!
    if (b.type === 'question')
      b.question = { ...b.question, kind: 'text', placeholder: '', multiline: false } as never
    expect(
      validateDocument(wrong, null).some((i) => i.message.includes('시안 부품은 question-choice')),
    ).toBe(true)
  })

  it('발행한 문항을 시안에서 빼면 발행 잠금이 막는다', () => {
    const { doc } = applySeed(legacy, SEED)
    const issues = validateDocument(doc, legacy)
    expect(issues.some((i) => i.message.includes('(cargo)를 지웠어요'))).toBe(true)
  })

  it('옮긴 문서는 스키마를 지난다(초안으로 저장할 수 있다)', () => {
    const { doc } = applySeed(legacy, SEED)
    expect(parseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
  })
})

describe('campaign_edit 연산 — apply_seed · define_question', () => {
  it('Seed 를 옮기고, 없는 질문 ID 의 정의를 만들어 채운다(한 번의 편집으로)', async () => {
    const { applyEditOps } = await import('./campaign-edit-ops')
    const empty = { ...legacy, pages: [], done: { blocks: [] } }
    const doc = applyEditOps(empty, [
      { op: 'apply_seed', seed: SEED },
      {
        op: 'define_question',
        page: 'liability',
        qid: 'liability',
        set: {
          label: '영업배상책임보험에 들어 계세요?',
          short: '영업배상',
          options: [
            { value: 'yes', label: '들었어요' },
            { value: 'no', label: '안 들었어요' },
          ],
        },
      },
    ])
    expect(validateDocument(doc, null).filter((i) => i.level === 'error')).toEqual([])
    expect(indexOf(doc).sections[0]?.questions[0]).toMatchObject({
      key: 'liability',
      kind: 'choice',
    })
  })

  it('시안에 없는 질문 ID 는 거절한다', async () => {
    const { applyEditOps } = await import('./campaign-edit-ops')
    expect(() =>
      applyEditOps(legacy, [
        { op: 'apply_seed', seed: SEED },
        { op: 'define_question', page: 'liability', qid: 'nope' },
      ]),
    ).toThrow(/질문 ID 'nope'/)
  })
})

describe('campaign-ds 로 다시 지은 시안 14장(11월 보험 설문)', () => {
  const imageIds = (doc: CampaignDocument) =>
    doc.pages.flatMap((p) => (p.layout ? layoutImages(p.layout) : []))
  const errorsOf = (doc: CampaignDocument) =>
    validateDocument(doc, null)
      .filter((i) => i.level === 'error')
      .map((i) => i.message)

  it('14장이 보험 설문 장 id 와 맞고, 질문 ID 가 모두 이어지며 막는 것은 올리지 않은 그림뿐이다', () => {
    const { doc, problems, missing } = applySeed(legacy, SEED_FULL)
    expect(problems).toEqual([])
    expect(missing).toEqual([])
    expect(doc.pages.map((p) => p.id)).toEqual(legacy.pages.map((p) => p.id))
    expect(doc.questionBank).toBeUndefined()
    expect(doc.pages.find((p) => p.id === 'liability')?.layout).toBeDefined()
    // 제목 줄바꿈이 남는다(앞 시안은 한 줄로 잃었다).
    expect(JSON.stringify(doc.pages.find((p) => p.id === 'liability')?.layout)).toContain(
      '영업배상책임보험에\\n들어 계세요?',
    )
    expect(errorsOf(doc)).toHaveLength(4)
    expect(errorsOf(doc).every((m) => m.startsWith('시안의 그림'))).toBe(true)
    expect(imageIds(doc).map((i) => i.name)).toEqual([
      '그림 · 돈 날리는 경험',
      '그림 · 방패',
      '그림 · 미소 배송원',
      '그림 · 성장',
    ])
  })

  it('set_layout_image 로 시안 그림에 올린 그림을 달고, 시안을 다시 옮겨도 이어 단다', async () => {
    const { applyEditOps } = await import('./campaign-edit-ops')
    const base = applySeed(legacy, SEED_FULL).doc
    const ops = imageIds(base).map((img, i) => ({
      op: 'set_layout_image' as const,
      node: img.id,
      src: `https://cdn.example/campaign/${String(i)}.png`,
    }))
    const done = applyEditOps(base, ops)
    expect(errorsOf(done)).toEqual([])
    expect(imageIds(done).map((i) => [i.src, i.width, i.height])).toEqual(
      imageIds(base).map((img, i) => [
        `https://cdn.example/campaign/${String(i)}.png`,
        img.width,
        img.height,
      ]),
    )
    const again = applyEditOps(done, [{ op: 'apply_seed', seed: SEED_FULL }])
    expect(imageIds(again).map((i) => i.src)).toEqual(imageIds(done).map((i) => i.src))
    expect(errorsOf(again)).toEqual([])
  })

  it('없는 그림 레이어 · https 가 아닌 주소는 거절한다', async () => {
    const { applyEditOps, EditOpSchema } = await import('./campaign-edit-ops')
    const base = applySeed(legacy, SEED_FULL).doc
    expect(() =>
      applyEditOps(base, [{ op: 'set_layout_image', node: 'nope', src: 'https://x/y.png' }]),
    ).toThrow(/그림 레이어 'nope'/)
    expect(
      EditOpSchema.safeParse({ op: 'set_layout_image', node: 'a', src: 'http://x/y.png' }).success,
    ).toBe(false)
  })
})
