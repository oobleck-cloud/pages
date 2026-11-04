import { describe, expect, it } from 'vitest'

import FIXTURE from '../__fixtures__/insurance-2026-11.document.json'
import SEED_FULL from '../__fixtures__/seed-landing-full.seed.json'
import SEED from '../__fixtures__/seed-landing.seed.json'
import { indexOf, parseDocument, validateDocument } from '../campaign-document'
import { campaignPack } from '../packs/campaign'
import { workstylePack } from '../packs/workstyle'
import { applySeed } from '../seed-import'
import { planActions } from './actions'
import { fieldAnswered, fieldText, formOf } from './form'
import { fromV1 } from './from-v1'
import { issueMessage, MESSAGES_KO } from './messages'
import {
  addScreen,
  moveNode,
  placeInstance,
  placeNode,
  PlacementError,
  removeNode,
  setOn,
  setProps,
} from './ops'
import { findNode, parseScreenDocument } from './screen'
import { validateScreenDocument } from './validate'

import type { CampaignAnswers, CampaignForm, CampaignQuestion } from '../campaign-form'
import type { ScreenDocument } from './screen'

const PACKS = [campaignPack]
const v1 = parseDocument(FIXTURE)
if (!v1) throw new Error('fixture')

/** 함수(`when`)를 뺀 색인 — 꼴을 견준다. */
function shape(form: CampaignForm, presentation = true) {
  return form.sections.map((s) => ({
    ...s,
    questions: s.questions.map((q) => {
      const { when: _w, ...rest } = q
      if (presentation) return rest
      const {
        layout: _l,
        placeholder: _p,
        multiline: _m,
        ...meaning
      } = rest as Record<string, unknown>
      return meaning
    }),
  }))
}

/** 보이는 조건을 답 여럿으로 견준다 — 고르는 문항마다 선택지 하나씩 고른 답. */
function sampleAnswers(form: CampaignForm): CampaignAnswers[] {
  const out: CampaignAnswers[] = [{}]
  for (const s of form.sections)
    for (const q of s.questions)
      if (q.kind === 'choice' || q.kind === 'multi')
        for (const o of q.options) out.push({ [q.key]: q.kind === 'multi' ? [o.value] : o.value })
  return out
}

function visibility(form: CampaignForm, answers: CampaignAnswers) {
  return form.sections.flatMap((s) =>
    s.questions.map((q: CampaignQuestion) => [q.key, !q.when || q.when(answers)] as const),
  )
}

describe('v1 → v2 옮기기 — insurance-2026-11(나간 설문)', () => {
  const v2 = fromV1(v1)

  it('v2 스키마로 읽힌다', () => {
    expect(parseScreenDocument(JSON.parse(JSON.stringify(v2)))).toEqual(v2)
  })

  it('문항 색인이 v1 과 같다(키 · 종류 · 물음 · 필수 · 선택지 · 그리기 꼴)', () => {
    expect(shape(formOf(v2, PACKS))).toEqual(shape(indexOf(v1)))
  })

  it('보이는 조건이 v1 과 같다', () => {
    const a = indexOf(v1)
    const b = formOf(v2, PACKS)
    for (const answers of sampleAnswers(a))
      expect(visibility(b, answers)).toEqual(visibility(a, answers))
  })

  it('v1 이 막지 않으면 v2 도 막지 않는다', () => {
    const v1Errors = validateDocument(v1, null).filter((i) => i.level === 'error')
    const v2Errors = validateScreenDocument(v2, PACKS).filter((i) => i.level === 'error')
    expect(v1Errors).toEqual([])
    expect(v2Errors).toEqual([])
  })

  it('옮긴 결과가 같다', () => {
    expect(v2).toMatchSnapshot()
  })

  it('보험료는 캠페인 팩의 값 종류다 — 팩 없이 읽으면 모르는 종류', () => {
    const premium = v2.fields.find((f) => f.type === 'premium')
    expect(premium).toBeDefined()
    if (!premium) return
    const answer = { unit: 'month', amount: 30000, unknown: false }
    expect(fieldAnswered(PACKS, premium, answer)).toBe(true)
    expect(fieldText(PACKS, premium, answer)).toBe('월 30,000원')
    expect(fieldAnswered([], premium, answer)).toBe(false)
    const issues = validateScreenDocument({ ...v2, packs: ['campaign'] }, [])
    expect(issues.some((i) => i.code === 'field-type' && i.field === premium.key)).toBe(true)
  })
})

describe('v1 → v2 옮기기 — Seed 시안 장', () => {
  it.each([
    ['seed-landing', SEED],
    ['seed-landing-full', SEED_FULL],
  ])('%s: 묻는 필드 · 차례 · 뜻이 v1 과 같다', (_name, seed) => {
    const { doc } = applySeed(v1, seed)
    const v2 = fromV1(doc)
    expect(parseScreenDocument(JSON.parse(JSON.stringify(v2)))).not.toBeNull()
    expect(shape(formOf(v2, PACKS), false)).toEqual(shape(indexOf(doc), false))
  })
})

describe('동작 체인', () => {
  it('분기를 풀고 끝내는 동작 뒤는 버린다', () => {
    const steps = planActions(
      [
        { do: 'validate' },
        {
          do: 'branch',
          when: [
            {
              if: { '==': [{ var: 'fields.a' }, 'yes'] },
              then: [{ do: 'go', to: 'p2', mode: 'push' }],
            },
          ],
          else: [{ do: 'save' }],
        },
        { do: 'next' },
        { do: 'submit' },
      ],
      { fields: { a: 'yes' } },
    )
    expect(steps).toEqual([{ do: 'validate' }, { do: 'go', to: 'p2', mode: 'push' }])
    expect(
      planActions([{ do: 'branch', when: [], else: [{ do: 'save' }] }, { do: 'next' }], {}),
    ).toEqual([{ do: 'save' }, { do: 'next' }])
  })
})

describe('배치 연산 — 부품 조합 · 배치까지만', () => {
  const v2 = fromV1(v1)
  const first = v2.screens[0]
  if (!first) throw new Error('fixture')

  it('칸에 부품을 놓고 속성 · 동작을 고친다', () => {
    const { doc, id } = placeInstance(
      v2,
      PACKS,
      { screen: first.id, frame: `${first.id}-body`, index: 0 },
      {
        use: 'campaign:chip',
        props: { 글: '3분이면 끝나요' },
      },
    )
    expect(findNode(doc.screens[0]!.frame, id)).toMatchObject({ use: 'campaign:chip' })
    const styled = setProps(doc, PACKS, `${first.id}-cta`, { 종류: '보조' })
    expect(findNode(styled.screens[0]!.frame, `${first.id}-cta`)).toMatchObject({
      props: { 종류: '보조' },
    })
    const linked = setOn(styled, `${first.id}-cta`, 'press', [
      { do: 'open', href: 'https://miso.kr' },
    ])
    expect(findNode(linked.screens[0]!.frame, `${first.id}-cta`)).toMatchObject({
      on: { press: [{ do: 'open', href: 'https://miso.kr' }] },
    })
  })

  it('다른 화면의 칸으로 옮긴다', () => {
    const second = v2.screens[1]!
    const moved = moveNode(v2, 'b1', { screen: second.id, frame: `${second.id}-body`, index: 0 })
    expect(findNode(moved.screens[0]!.frame, 'b1')).toBeNull()
    expect(findNode(moved.screens[1]!.frame, 'b1')).not.toBeNull()
  })

  it('틀은 넣거나 빼거나 고칠 수 없다', () => {
    const code = (fn: () => unknown) => {
      try {
        fn()
      } catch (e) {
        return e instanceof PlacementError ? e.code : 'other'
      }
      return 'none'
    }
    expect(code(() => removeNode(v2, `${first.id}-body`))).toBe('frame-locked')
    expect(
      code(() =>
        placeNode(
          v2,
          { screen: first.id, frame: `${first.id}-frame` },
          {
            id: 'x1',
            kind: 'text',
            text: '',
            align: 'left',
          },
        ),
      ),
    ).toBe('not-slot')
    expect(code(() => setProps(v2, PACKS, `${first.id}-cta`, { 종류: '없는 종류' }))).toBe(
      'props-invalid',
    )
    expect(
      code(() =>
        placeInstance(
          v2,
          PACKS,
          { screen: first.id, frame: `${first.id}-body` },
          { use: 'campaign:nope' },
        ),
      ),
    ).toBe('component-unknown')
  })

  it('새 화면은 팩의 틀로 짓는다', () => {
    const doc = addScreen(v2, campaignPack, { id: 'extra', name: '덧', template: 'top' })
    const screen = doc.screens.at(-1)!
    expect(screen.frame.id).toBe('extra-frame')
    expect(screen.frame.children.map((c) => c.id)).toEqual([
      'extra-head',
      'extra-body',
      'extra-foot',
    ])
  })
})

describe('검증', () => {
  const v2 = fromV1(v1)

  it('발행한 판의 필드 키 · 선택지 값을 지킨다', () => {
    const choice = v2.fields.find((f) => f.type === 'choice')!
    const changed: ScreenDocument = {
      ...v2,
      fields: v2.fields.map((f) =>
        f.key === choice.key ? { ...f, options: (f.options ?? []).slice(1) } : f,
      ),
    }
    const codes = validateScreenDocument(changed, PACKS, { published: v2 }).map((i) => i.code)
    expect(codes).toContain('published-option')
  })

  it('값 연결 · 동작 · 호스트 동작을 본다', () => {
    const first = v2.screens[0]!
    let doc = placeInstance(
      v2,
      PACKS,
      { screen: first.id, frame: `${first.id}-body` },
      {
        use: 'campaign:question-choice',
        bind: 'nope',
      },
    ).doc
    doc = setOn(doc, `${first.id}-cta`, 'press', [
      { do: 'host', name: 'sendSms' },
      { do: 'go', to: 'ghost', mode: 'sheet' },
    ])
    const codes = validateScreenDocument(doc, PACKS, { hostActions: ['call'] }).map((i) => i.code)
    expect(codes).toEqual(expect.arrayContaining(['bind-unknown', 'host-unknown', 'go-unknown']))
  })

  it('다른 팩의 부품은 문서가 그 팩을 써야 놓인다', () => {
    const first = v2.screens[0]!
    const doc = placeInstance(
      v2,
      [...PACKS, workstylePack],
      { screen: first.id, frame: `${first.id}-body` },
      {
        use: 'workstyle:status',
      },
    ).doc
    expect(validateScreenDocument(doc, [...PACKS, workstylePack]).map((i) => i.code)).toContain(
      'pack-unknown',
    )
    const both = { ...doc, packs: ['campaign', 'workstyle'] }
    expect(
      validateScreenDocument(both, [...PACKS, workstylePack]).filter((i) => i.level === 'error'),
    ).toEqual([])
  })

  it('모든 코드에 한국어 문장이 있다', () => {
    for (const code of Object.keys(MESSAGES_KO))
      expect(
        issueMessage({
          code: code as keyof typeof MESSAGES_KO,
          params: { detail: '속성이 맞지 않아요' },
        }),
      ).toBeTruthy()
    expect(issueMessage({ code: 'bind-unknown', params: { field: 'q9' } }, 'en')).toBe(
      '필드 「q9」가 없어요',
    )
  })
})
