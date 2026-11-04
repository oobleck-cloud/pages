import { describe, expect, it } from 'vitest'

import FIXTURE from './__fixtures__/insurance-2026-11.document.json'
import SEED_FULL from './__fixtures__/seed-landing-full.seed.json'
import SEED from './__fixtures__/seed-landing.seed.json'
import {
  deckOf,
  indexOf,
  numberedCount,
  pageQuestions,
  parseDocument,
  validateDocument,
} from './campaign-document'
import { applySeed } from './seed-import'

/**
 * 회귀 가드 — 실제로 나간 보험 설문(2026-11) 발행본이 패키지로 옮긴 뒤에도 똑같이 읽히고 해석되는지 고정한다.
 * 이 스냅샷이 바뀌면 이미 파트너에게 나간 랜딩이 다르게 그려진다는 뜻이다. 의도한 변경일 때만 갱신한다.
 */
describe('발행본 회귀 — insurance-2026-11', () => {
  const doc = parseDocument(FIXTURE)

  it('문서로 읽힌다', () => {
    expect(doc).not.toBeNull()
    expect(doc?.schemaVersion).toBe(1)
  })

  it('검증 결과가 같다(발행본 자신과 견줘도)', () => {
    if (!doc) throw new Error('fixture')
    expect(validateDocument(doc, null)).toMatchSnapshot()
    expect(validateDocument(doc, doc)).toMatchSnapshot()
  })

  it('문항 색인이 같다', () => {
    if (!doc) throw new Error('fixture')
    expect(indexOf(doc)).toMatchSnapshot()
  })

  it('장마다 보이는 문항이 같다(답 없음)', () => {
    if (!doc) throw new Error('fixture')
    expect(
      Object.fromEntries(doc.pages.map((p) => [p.id, pageQuestions(p, {}).map((q) => q.key)])),
    ).toMatchSnapshot()
  })

  it('갈래별 장 차례와 번호 수가 같다', () => {
    if (!doc) throw new Error('fixture')
    const variants = [[], ...doc.variants.map((v) => [v.key])]
    expect(
      variants.map((vs) => {
        const deck = deckOf(doc, vs, {})
        return { variants: vs, pages: deck.map((p) => p.id), numbered: numberedCount(deck) }
      }),
    ).toMatchSnapshot()
  })
})

describe('Seed 시안 옮기기 회귀', () => {
  const base = parseDocument(FIXTURE)

  it.each([
    ['seed-landing', SEED],
    ['seed-landing-full', SEED_FULL],
  ])('%s 를 옮긴 결과가 같다', (_name, seed) => {
    if (!base) throw new Error('fixture')
    expect(applySeed(base, seed)).toMatchSnapshot()
  })
})
