import { describe, expect, it } from 'vitest'

import FIXTURE from './__fixtures__/insurance-2026-11.document.json'
import {
  answerIsCondition,
  blankDocument,
  changeQuestionKind,
  deckOf,
  duplicatePage,
  hasBlockingIssue,
  indexOf,
  insertBlock,
  insertPage,
  moveBlock,
  movePage,
  newBlock,
  newPage,
  nextStepOf,
  numberedCount,
  pageNumber,
  parseDocument,
  questionsOfDocument,
  readSimpleCondition,
  removeBlock,
  updateBlock,
  validateDocument,
} from './campaign-document'

import type { CampaignDocument, CampaignTransition } from './campaign-document'

const DOC = parseDocument(FIXTURE)!

function errors(doc: CampaignDocument, published: CampaignDocument | null = null): string[] {
  return validateDocument(doc, published)
    .filter((i) => i.level === 'error')
    .map((i) => i.message)
}

describe('캠페인 문서', () => {
  it('보험 설문 고정값은 스키마에 맞고 발행을 막는 것이 없다', () => {
    expect(DOC).not.toBeNull()
    expect(errors(DOC)).toEqual([])
  })

  it('빈 객체 · 꼴이 다른 것은 문서가 아니다', () => {
    expect(parseDocument({})).toBeNull()
    expect(parseDocument({ schemaVersion: 2, pages: [] })).toBeNull()
  })

  it('백지는 바로 발행할 수 있다', () => {
    expect(hasBlockingIssue(validateDocument(blankDocument(), null))).toBe(false)
  })

  it('장 차례 — 갈래 · 답에 따라 숨고, 세는 장만 「질문 n / 전체」', () => {
    const plain = deckOf(DOC, [], {})
    expect(plain.some((p) => p.id === 'night')).toBe(false)
    expect(deckOf(DOC, ['night'], {}).some((p) => p.id === 'night')).toBe(true)
    expect(numberedCount(plain)).toBe(8)
    expect(pageNumber(plain, 'liability')).toEqual({ n: 1, total: 8 })
    expect(pageNumber(plain, 'cover')).toBeNull()
    const declined = deckOf(DOC, [], { joinIntent: 'no' })
    expect(declined.some((p) => p.id === 'want-premium')).toBe(false)
    expect(numberedCount(declined)).toBe(7)
  })

  it('색인 — 문항이 든 장마다 한 구역, 조건은 문항의 when 으로', () => {
    const form = indexOf(DOC)
    const claimNote = form.sections.flatMap((s) => s.questions).find((q) => q.key === 'claimNote')!
    expect(claimNote.when?.({ claimed: 'no' })).toBe(false)
    expect(claimNote.when?.({ claimed: 'yes' })).toBe(true)
    expect(form.sections.find((s) => s.key === 'night')?.variant).toBe('night')
    expect(form.variants).toEqual([{ key: 'night', label: '미소의 밤 초대' }])
  })

  it('다음 장 — 비우면 차례대로, 장 지정 · 조건 분기 · 마지막은 보내기', () => {
    const deck = deckOf(DOC, [], {})
    expect(nextStepOf(deck, 'cover', {})).toEqual({ kind: 'page', page: 'prepare' })
    expect(nextStepOf(deck, 'comment', {})).toEqual({ kind: 'submit' })
    const branch: CampaignTransition = {
      kind: 'branch',
      when: [
        {
          if: { '==': [{ var: 'answers.joinIntent' }, 'no'] },
          then: { kind: 'goto', page: 'comment' },
        },
      ],
      else: { kind: 'next' },
    }
    expect(nextStepOf(deck, 'join-intent', { joinIntent: 'no' }, branch)).toEqual({
      kind: 'page',
      page: 'comment',
    })
    expect(nextStepOf(deck, 'join-intent', { joinIntent: 'join' }, branch)).toEqual({
      kind: 'page',
      page: 'want-premium',
    })
    // 숨은 장을 가리키면 차례대로.
    expect(nextStepOf(deck, 'cover', {}, { kind: 'goto', page: 'night' })).toEqual({
      kind: 'page',
      page: 'prepare',
    })
  })

  it('발행한 문항 — 지우거나 종류 · 선택지 값을 바꾸면 막고, 글은 고쳐도 된다', () => {
    const relabeled = updateBlock(DOC, findQuestionBlock(DOC, 'liability'), (b) =>
      b.type === 'question' ? { ...b, question: { ...b.question, label: '바뀐 물음' } } : b,
    )
    expect(errors(relabeled, DOC)).toEqual([])
    const removed = removeBlock(DOC, findQuestionBlock(DOC, 'liability'))
    expect(errors(removed, DOC).join()).toContain('liability')
    const retyped = updateBlock(DOC, findQuestionBlock(DOC, 'cargo'), (b) =>
      b.type === 'question' ? { ...b, question: changeQuestionKind(b.question, 'text') } : b,
    )
    expect(errors(retyped, DOC).join()).toContain('종류')
    const fewer = updateBlock(DOC, findQuestionBlock(DOC, 'claimed'), (b) =>
      b.type === 'question' && b.question.kind === 'choice'
        ? {
            ...b,
            question: {
              ...b.question,
              options: [...b.question.options.slice(0, 1), { value: 'maybe', label: '글쎄요' }],
            },
          }
        : b,
    )
    expect(errors(fewer, DOC).join()).toContain('no')
  })

  it('검증 — 겹치는 키 · 없는 문항을 읽는 조건 · https 아닌 버튼', () => {
    let doc = blankDocument()
    const page = newPage(doc, true)
    doc = insertPage(doc, page, 1)
    const q = doc.pages[1]!.blocks[0]!
    doc = insertBlock(
      doc,
      'p1',
      { ...newBlock(doc, 'question'), visibleWhen: { '==': [{ var: 'answers.nope' }, 'x'] } },
      1,
    )
    doc = updateBlock(doc, doc.pages[0]!.blocks[1]!.id, (b) =>
      b.type === 'question' && q.type === 'question'
        ? { ...b, question: { ...b.question, key: q.question.key } }
        : b,
    )
    doc = insertBlock(doc, 'p1', { ...newBlock(doc, 'button'), id: 'btn' }, 0)
    const messages = errors(doc).join('\n')
    expect(messages).toContain('겹쳐요')
    expect(messages).toContain('nope')
    expect(messages).toContain('https://')
  })

  it('짓기 — 장 넣기 · 옮기기 · 복제(새 키), 블록을 다른 장으로', () => {
    let doc = blankDocument()
    doc = insertPage(doc, newPage(doc, true), 1)
    doc = insertPage(doc, newPage(doc, false), 2)
    expect(doc.pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
    doc = movePage(doc, 2, 0)
    expect(doc.pages.map((p) => p.id)).toEqual(['p3', 'p1', 'p2'])
    doc = duplicatePage(doc, 'p2')
    const keys = questionsOfDocument(doc).map((q) => q.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(doc.pages[3]!.name).toContain('사본')
    const blockId = doc.pages[0]!.blocks[0]!.id
    doc = moveBlock(doc, blockId, 'p2', 0)
    expect(doc.pages[0]!.blocks).toHaveLength(0)
    expect(doc.pages.find((p) => p.id === 'p2')!.blocks[0]!.id).toBe(blockId)
    doc = moveBlock(doc, blockId, 'done', 99)
    expect(doc.done.blocks.at(-1)!.id).toBe(blockId)
  })

  it('종류 바꾸기 — 키 · 물음 · 선택지(고르는 종류끼리)는 둔다', () => {
    const q = changeQuestionKind(
      {
        key: 'a',
        kind: 'choice',
        label: 'L',
        short: 'S',
        required: false,
        layout: 'row',
        options: [
          { value: 'x', label: 'X' },
          { value: 'y', label: 'Y' },
        ],
      },
      'multi',
    )
    expect(q).toMatchObject({
      key: 'a',
      kind: 'multi',
      label: 'L',
      options: [{ value: 'x' }, { value: 'y' }],
    })
  })

  it('간단 조건 — 지은 대로 다시 읽는다', () => {
    const q = DOC.pages.flatMap((p) => p.blocks).find((b) => b.type === 'question')!
    if (q.type !== 'question') throw new Error()
    const expr = answerIsCondition(q.question, 'yes')
    expect(readSimpleCondition(expr)).toEqual({ key: 'liability', value: 'yes', negate: false })
    expect(readSimpleCondition({ not: expr })).toEqual({
      key: 'liability',
      value: 'yes',
      negate: true,
    })
    expect(readSimpleCondition({ and: [] })).toBeNull()
  })
})

function findQuestionBlock(doc: CampaignDocument, key: string): string {
  for (const p of doc.pages)
    for (const b of p.blocks) if (b.type === 'question' && b.question.key === key) return b.id
  throw new Error(key)
}
