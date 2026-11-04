import { collectVarPaths, evaluateCondition, ExprSchema } from './expr'
import { z } from 'zod'

import { kindsForPart, layoutQuestions, LayoutNodeSchema, walkLayout } from './campaign-layout'

import type { LayoutNode } from './campaign-layout'
import type {
  CampaignAnswers,
  CampaignForm,
  CampaignQuestion,
  CampaignSection,
  ChoiceOption,
} from './campaign-form'
import type { Expr } from './expr'

/**
 * 캠페인 랜딩 문서 — 운영자가 빌더에서 백지부터 짓는 장(page) · 블록(block)의 차례. 캠페인마다 하나이고, 서버는 안을 읽지 않는다
 * (초안 `ContentChanged` → 발행 `ContentPublished`). 공개 랜딩 · 편집 미리보기 · 운영 표 · 콜 칸이 모두 이 문서를 읽는다.
 *
 * 스키마는 플랫폼 형태로 분기를 표현한다 — 장마다 다음 장 규칙([CampaignTransition]: 차례대로 · 장 지정 · 조건 분기 · 보내기)과
 * 장 · 블록의 보이는 조건(Expr, flow-engine 과 같은 JSONLogic 서브셋). 지금 빌더 · MCP 는 차례대로만 짓는다(next 를 비운다).
 *
 * 조건식의 변수는 `answers.<문항 키>` 만 읽는다 — 갈래(variant)는 장의 `variant` 로 고른다.
 */

/** 장 · 블록 id — 서버 `CampaignKey`(자동 저장의 구역)와 같은 꼴. */
export const NODE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/
/** 문항 키 — 서버 답 키 꼴. */
export const QUESTION_KEY = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/
/** 선택지 값 — 답으로 쌓인다. */
export const OPTION_VALUE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/
/** 서버 `Campaigns.CONTENT_MAX`(정렬 표기 글자 수). 키 정렬 전 길이로 어림한다. */
export const DOCUMENT_MAX = 200_000

const ImageSchema = z.object({
  src: z.string(),
  alt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
export type CampaignImage = z.infer<typeof ImageSchema>

const OptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  summary: z.string().optional(),
  minor: z.boolean().optional(),
})

const QuestionBaseSchema = {
  key: z.string(),
  label: z.string(),
  short: z.string(),
  hint: z.string().optional(),
  required: z.boolean(),
  /** 물음을 그리지 않고 답 칸만(앞 문항에 붙는 「보험사 · 상품명」 같은 칸). */
  hideLabel: z.boolean().optional(),
}

const QuestionSchema = z.discriminatedUnion('kind', [
  z.object({
    ...QuestionBaseSchema,
    kind: z.literal('choice'),
    options: z.array(OptionSchema),
    layout: z.enum(['row', 'stack']),
  }),
  z.object({
    ...QuestionBaseSchema,
    kind: z.literal('multi'),
    options: z.array(OptionSchema),
    exclusive: z.string().optional(),
  }),
  z.object({
    ...QuestionBaseSchema,
    kind: z.literal('text'),
    placeholder: z.string(),
    multiline: z.boolean(),
  }),
  z.object({
    ...QuestionBaseSchema,
    kind: z.literal('number'),
    placeholder: z.string(),
    unit: z.string(),
    max: z.number().nonnegative(),
  }),
  z.object({ ...QuestionBaseSchema, kind: z.literal('premium') }),
])
export type DocumentQuestion = z.infer<typeof QuestionSchema>
export type QuestionKind = DocumentQuestion['kind']

const ButtonActionSchema = z.discriminatedUnion('kind', [
  /** 다음 장(장의 next 규칙을 따른다). */
  z.object({ kind: z.literal('next') }),
  /** 바깥 주소를 새 창으로. */
  z.object({ kind: z.literal('link'), href: z.string() }),
  /** 그 장으로 — 스키마만(지금 빌더는 짓지 않는다). */
  z.object({ kind: z.literal('goto'), page: z.string() }),
])
export type ButtonAction = z.infer<typeof ButtonActionSchema>

const blockBase = { id: z.string(), visibleWhen: ExprSchema.optional() }

const BlockSchema = z.discriminatedUnion('type', [
  /** 큰 제목 — 줄마다. */
  z.object({
    ...blockBase,
    type: z.literal('heading'),
    lines: z.array(z.string()),
    size: z.enum(['lg', 'md']),
  }),
  /** 본문 — 줄마다, 빈 줄은 띄움, `**말**` 은 강조색. */
  z.object({
    ...blockBase,
    type: z.literal('text'),
    lines: z.array(z.string()),
    tone: z.enum(['default', 'subtle']),
  }),
  z.object({ ...blockBase, type: z.literal('image'), image: ImageSchema }),
  /** 안내 알약 — 「질문 n개 · {text}」와 파트너 이름 · 마감을 함께 띄운다. */
  z.object({ ...blockBase, type: z.literal('chip'), text: z.string() }),
  /** 사실 표 — 왼쪽 이름, 오른쪽 값(초대의 일시 · 장소 등). */
  z.object({
    ...blockBase,
    type: z.literal('facts'),
    rows: z.array(z.tuple([z.string(), z.string()])),
  }),
  z.object({ ...blockBase, type: z.literal('question'), question: QuestionSchema }),
  z.object({
    ...blockBase,
    type: z.literal('button'),
    label: z.string(),
    action: ButtonActionSchema,
  }),
])
export type CampaignBlock = z.infer<typeof BlockSchema>
export type BlockType = CampaignBlock['type']

export type CampaignTransition =
  | { kind: 'next' }
  | { kind: 'goto'; page: string }
  | { kind: 'submit' }
  | {
      kind: 'branch'
      when: Array<{ if: Expr; then: CampaignTransition }>
      else: CampaignTransition
    }

const TransitionSchema: z.ZodType<CampaignTransition> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('next') }),
    z.object({ kind: z.literal('goto'), page: z.string() }),
    z.object({ kind: z.literal('submit') }),
    z.object({
      kind: z.literal('branch'),
      when: z.array(z.object({ if: ExprSchema, then: TransitionSchema })),
      else: TransitionSchema,
    }),
  ]),
)

const PageSchema = z.object({
  id: z.string(),
  /** 빌더 · 운영 화면에서 부르는 이름. 파트너에게는 보이지 않는다. */
  name: z.string(),
  /** 이 갈래를 받은 파트너에게만. */
  variant: z.string().optional(),
  visibleWhen: ExprSchema.optional(),
  /** 「질문 n / 전체」로 센다. */
  numbered: z.boolean(),
  /** 블록을 가운데로 모을지(표지 · 이야기), 위에서부터 둘지. */
  align: z.enum(['center', 'top']),
  blocks: z.array(BlockSchema),
  /** 아래 고정 버튼 글. 비우면 「다음」(마지막 장은 보내기). */
  cta: z.string().optional(),
  /** 다음 장 규칙 — 비우면 차례대로. */
  next: TransitionSchema.optional(),
  /**
   * Seed 시안에서 옮긴 레이아웃 트리. 있으면 블록 대신 이 트리를 그리고, `blocks` 에는 트리의 질문 부품이 가리키는 문항 블록(질문
   * 목록)만 둔다 — 질문 부품은 질문 ID 로 이 블록을 찾는다.
   */
  layout: LayoutNodeSchema.optional(),
})
export type CampaignPage = z.infer<typeof PageSchema>

const SmsLineSchema = z.object({ text: z.string(), variant: z.string().optional() })

export const CampaignDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  pages: z.array(PageSchema),
  /** 보낸 뒤 화면 — 위에 블록, 아래에 받은 답 요약과 「답 고치기」. */
  done: z.object({ blocks: z.array(BlockSchema) }),
  submit: z.object({ label: z.string(), note: z.string() }),
  variants: z.array(z.object({ key: z.string(), label: z.string() })),
  /**
   * 보낼 문자 틀 — v1 호환 칸. 코어는 꼴만 지키고, 자리표시(`{링크}` 등)를 채워 보내는 일은 호스트가 한다(MVOS: campaign-sms).
   */
  sms: z.object({ title: z.string(), lines: z.array(SmsLineSchema) }),
  /**
   * 시안에서 빠진 질문 정의 — Seed 를 다시 옮길 때 지운 질문 부품의 정의를 버리지 않고 둔다(다시 놓으면 그대로 돌아온다). 파트너에게는
   * 보이지 않는다.
   */
  questionBank: z.array(BlockSchema).optional(),
})
export type CampaignDocument = z.infer<typeof CampaignDocumentSchema>

/** 서버 content(JSON 객체)를 문서로. 빈 객체 · 꼴이 다르면 null. */
export function parseDocument(raw: unknown): CampaignDocument | null {
  const r = CampaignDocumentSchema.safeParse(raw)
  return r.success ? r.data : null
}

/**
 * 백지 — 장 하나(제목 블록 하나)와 기본 보내기 · 보낸 뒤 화면. 문자(`sms`)는 v1 호환 칸이라 호스트가 채운다 — 주지 않으면 링크 한 줄.
 */
export function blankDocument(init: { sms?: CampaignDocument['sms'] } = {}): CampaignDocument {
  return {
    schemaVersion: 1,
    pages: [
      {
        id: 'p1',
        name: '첫 장',
        numbered: false,
        align: 'center',
        blocks: [{ id: 'b1', type: 'heading', lines: ['제목을 적어 주세요'], size: 'lg' }],
      },
    ],
    done: {
      blocks: [
        { id: 'd1', type: 'heading', lines: ['보내 주셔서 고마워요'], size: 'lg' },
        { id: 'd2', type: 'text', lines: ['보내 주신 답은 꼭 참고할게요.'], tone: 'subtle' },
      ],
    },
    submit: { label: '보내기', note: '고를 때마다 저장돼요' },
    variants: [],
    sms: init.sms ?? { title: '', lines: [{ text: '{링크}' }] },
  }
}

// ── 읽기 ────────────────────────────────────────────────────────────────

function visible(expr: Expr | undefined, answers: CampaignAnswers): boolean {
  if (expr === undefined) return true
  try {
    return evaluateCondition(expr, { answers })
  } catch {
    return false
  }
}

export function isPageVisible(
  page: CampaignPage,
  variants: readonly string[],
  answers: CampaignAnswers,
): boolean {
  if (page.variant && !variants.includes(page.variant)) return false
  return visible(page.visibleWhen, answers)
}

export function isBlockVisible(block: CampaignBlock, answers: CampaignAnswers): boolean {
  return visible(block.visibleWhen, answers)
}

type QuestionBlock = Extract<CampaignBlock, { type: 'question' }>

/**
 * 장이 묻는 문항 블록 — 레이아웃 장이면 트리의 질문 부품 차례대로(부품이 없는 질문은 묻지 않는다), 아니면 블록 차례대로.
 */
export function pageQuestionBlocks(page: CampaignPage): QuestionBlock[] {
  const blocks = page.blocks.filter((b): b is QuestionBlock => b.type === 'question')
  if (!page.layout) return blocks
  const byKey = new Map(blocks.map((b) => [b.question.key, b]))
  const seen = new Set<string>()
  return layoutQuestions(page.layout).flatMap((part) => {
    const b = byKey.get(part.qid)
    if (!b || seen.has(part.qid)) return []
    seen.add(part.qid)
    return [b]
  })
}

/** 질문 ID 로 장의 문항 블록 — 레이아웃의 질문 부품이 찾는다. */
export function questionBlockOf(page: CampaignPage, qid: string): QuestionBlock | null {
  return (
    page.blocks.find((b): b is QuestionBlock => b.type === 'question' && b.question.key === qid) ??
    null
  )
}

/** 장 안의 보이는 문항. */
export function pageQuestions(page: CampaignPage, answers: CampaignAnswers): DocumentQuestion[] {
  return pageQuestionBlocks(page)
    .filter((b) => isBlockVisible(b, answers))
    .map((b) => b.question)
}

/**
 * 문항 색인 — 문항이 든 장마다 한 구역, 장 · 블록의 보이는 조건은 문항의 `when` 으로 편다. 진행 · 저장 · 운영 표 · CSV · 콜 칸이 읽는다.
 */
export function indexOf(doc: CampaignDocument): CampaignForm {
  const sections: CampaignSection[] = doc.pages.flatMap((page) => {
    const questions = pageQuestionBlocks(page).map((b) =>
      questionOf(b.question, [page.visibleWhen, b.visibleWhen]),
    )
    if (!questions.length) return []
    return [
      {
        key: page.id,
        title: page.name,
        ...(page.variant ? { variant: page.variant } : {}),
        questions,
      },
    ]
  })
  return { sections, variants: doc.variants }
}

function questionOf(q: DocumentQuestion, conditions: Array<Expr | undefined>): CampaignQuestion {
  const exprs = conditions.filter((c): c is Expr => c !== undefined)
  if (!exprs.length) return q
  return { ...q, when: (answers) => exprs.every((e) => visible(e, answers)) }
}

/** 이 파트너에게 보이는 장의 차례 — 답이 바뀌면 다시 편다. */
export function deckOf(
  doc: CampaignDocument,
  variants: readonly string[],
  answers: CampaignAnswers,
): CampaignPage[] {
  return doc.pages.filter((p) => isPageVisible(p, variants, answers))
}

/** 「질문 n / 전체」 — 세는 장이 아니면 null. */
export function pageNumber(
  deck: readonly CampaignPage[],
  pageId: string,
): { n: number; total: number } | null {
  const numbered = deck.filter((p) => p.numbered)
  const i = numbered.findIndex((p) => p.id === pageId)
  return i === -1 ? null : { n: i + 1, total: numbered.length }
}

/** 세는 장 수 — 안내 알약의 「질문 n개」. */
export function numberedCount(deck: readonly CampaignPage[]): number {
  return deck.filter((p) => p.numbered).length
}

export type NextStep = { kind: 'page'; page: string } | { kind: 'submit' }

/**
 * 이 장에서 넘기면 어디로 — 장의 next(없으면 차례대로)를 지금 답으로 푼다. 숨은 장 · 없는 장을 가리키면 차례대로 다음 보이는 장.
 * 마지막 장이면 보내기.
 */
export function nextStepOf(
  deck: readonly CampaignPage[],
  pageId: string,
  answers: CampaignAnswers,
  override?: CampaignTransition,
): NextStep {
  const page = deck.find((p) => p.id === pageId)
  const t = resolveTransition(override ?? page?.next ?? { kind: 'next' }, answers)
  if (t.kind === 'submit') return { kind: 'submit' }
  if (t.kind === 'goto' && deck.some((p) => p.id === t.page)) return { kind: 'page', page: t.page }
  const at = deck.findIndex((p) => p.id === pageId)
  const following = deck[at + 1]
  return following ? { kind: 'page', page: following.id } : { kind: 'submit' }
}

function resolveTransition(
  t: CampaignTransition,
  answers: CampaignAnswers,
): Exclude<CampaignTransition, { kind: 'branch' }> {
  if (t.kind !== 'branch') return t
  for (const arm of t.when)
    if (visible(arm.if, answers)) return resolveTransition(arm.then, answers)
  return resolveTransition(t.else, answers)
}

/** 본문 한 줄을 강조(`**말**`)와 보통 말 조각으로. */
export function emphasisParts(line: string): Array<{ text: string; strong: boolean }> {
  return line
    .split(/(\*\*[^*]+\*\*)/)
    .filter((part) => part.length > 0)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**')
        ? { text: part.slice(2, -2), strong: true }
        : { text: part, strong: false },
    )
}

// ── 검증 ────────────────────────────────────────────────────────────────

export type DocumentIssue = {
  level: 'error' | 'warning'
  message: string
  page?: string
  block?: string
}

/**
 * 문서 진단 — error 가 하나라도 있으면 발행하지 않는다(저장은 된다). [published] 가 있으면 이미 받은 답의 뜻을 지킨다:
 * 그 판의 문항 키는 남아 있어야 하고 종류가 같아야 하며, 선택지 값은 빠지면 안 된다(이름 · 문구는 고쳐도 된다).
 */
export function validateDocument(
  doc: CampaignDocument,
  published: CampaignDocument | null,
): DocumentIssue[] {
  const issues: DocumentIssue[] = []
  const err = (message: string, at: { page?: string; block?: string } = {}) =>
    issues.push({ level: 'error', message, ...at })
  const warn = (message: string, at: { page?: string; block?: string } = {}) =>
    issues.push({ level: 'warning', message, ...at })

  if (!doc.pages.length) err('장이 하나도 없어요')
  const pageIds = new Set<string>()
  const blockIds = new Set<string>()
  const keys = new Map<string, DocumentQuestion>()
  const variantKeys = new Set(doc.variants.map((v) => v.key))

  for (const v of doc.variants)
    if (!NODE_ID.test(v.key)) err(`갈래 키 「${v.key}」는 소문자 · 숫자 · 하이픈 40자까지예요`)

  const checkBlocks = (blocks: readonly CampaignBlock[], page: string | undefined) => {
    for (const b of blocks) {
      const at = { page, block: b.id }
      if (!NODE_ID.test(b.id)) err(`블록 id 「${b.id}」 꼴이 아니에요`, at)
      if (blockIds.has(b.id)) err(`블록 id 「${b.id}」가 겹쳐요`, at)
      blockIds.add(b.id)
      checkBlock(b, at)
    }
  }

  const checkBlock = (b: CampaignBlock, at: { page?: string; block: string }) => {
    switch (b.type) {
      case 'heading':
      case 'text':
        if (!b.lines.some((l) => l.trim())) warn('글이 비었어요', at)
        return
      case 'image':
        if (!/^(https:\/\/|\/[^/])/.test(b.image.src)) err('그림을 올려 주세요', at)
        if (!b.image.alt.trim()) warn('그림 설명(대체 글)이 비었어요', at)
        return
      case 'chip':
        return
      case 'facts':
        if (!b.rows.length) warn('표에 줄이 없어요', at)
        return
      case 'button':
        if (!b.label.trim()) err('버튼 글이 비었어요', at)
        if (b.action.kind === 'link' && !/^https:\/\/[^\s/]+/.test(b.action.href))
          err('버튼 주소는 https:// 로 시작해야 해요', at)
        return
      case 'question':
        checkQuestion(b.question, at)
        return
    }
  }

  const checkQuestion = (q: DocumentQuestion, at: { page?: string; block: string }) => {
    if (!QUESTION_KEY.test(q.key))
      err(`문항 키 「${q.key}」는 영문자로 시작하는 영숫자 40자까지예요`, at)
    if (keys.has(q.key)) err(`문항 키 「${q.key}」가 겹쳐요`, at)
    keys.set(q.key, q)
    if (!q.label.trim()) err('물음이 비었어요', at)
    if (!q.short.trim()) warn('짧은 이름이 비었어요(운영 표 · 콜 칸 이름)', at)
    if (q.kind === 'choice' || q.kind === 'multi') {
      if (q.options.length < 2) err('선택지가 둘 이상 있어야 해요', at)
      const seen = new Set<string>()
      for (const o of q.options) {
        if (!OPTION_VALUE.test(o.value)) err(`선택지 값 「${o.value}」 꼴이 아니에요`, at)
        if (seen.has(o.value)) err(`선택지 값 「${o.value}」가 겹쳐요`, at)
        seen.add(o.value)
        if (!o.label.trim()) err('선택지 글이 비었어요', at)
      }
      if (q.kind === 'multi' && q.exclusive && !seen.has(q.exclusive))
        err(`홀로 고르는 값 「${q.exclusive}」이 선택지에 없어요`, at)
    }
  }

  // 레이아웃 장 — 모르는 레이어 · 질문 목록에 없는 질문 ID · 종류가 맞지 않는 부품은 발행을 막는다.
  const checkLayout = (page: CampaignPage, root: LayoutNode) => {
    const at = { page: page.id }
    const placed = new Set<string>()
    walkLayout(root, (n) => {
      if (n.kind === 'unknown') {
        err(`시안의 「${n.name}」는 랜딩에 옮길 수 없어요 — ${n.reason}`, at)
        return
      }
      if (n.kind === 'image' && !/^(https:\/\/|\/[^/])/.test(n.src))
        err(`시안의 그림 「${n.name}」을 MVOS 에 올려 주세요`, at)
      if (n.kind === 'stack' && n.fill?.startsWith('#'))
        warn(`「${n.name}」 색이 토큰이 아니에요(${n.fill})`, at)
      if (n.kind === 'text' && n.color?.startsWith('#'))
        warn(`「${n.name}」 글자 색이 토큰이 아니에요(${n.color})`, at)
      if (n.kind === 'text' && !n.style) warn(`「${n.name}」에 글자 스타일이 없어요`, at)
      if (n.kind !== 'part' || n.part !== 'question') return
      const b = questionBlockOf(page, n.qid)
      if (!b) {
        err(`질문 ID 「${n.qid}」가 질문 목록에 없어요`, { ...at, block: n.id })
        return
      }
      if (placed.has(n.qid)) err(`질문 ID 「${n.qid}」를 한 장에 두 번 놓았어요`, at)
      placed.add(n.qid)
      if (!kindsForPart(n).includes(b.question.kind))
        err(
          `질문 「${n.qid}」는 ${b.question.kind} 문항인데 시안 부품은 ${n.component}${n.variant ? `(${n.variant})` : ''}예요`,
          { ...at, block: b.id },
        )
    })
    for (const b of page.blocks) {
      if (b.type !== 'question') err('레이아웃 장에는 문항 블록만 둬요', { ...at, block: b.id })
      else if (!placed.has(b.question.key))
        err(`질문 「${b.question.key}」가 시안에 놓이지 않았어요`, { ...at, block: b.id })
    }
  }

  for (const page of doc.pages) {
    const at = { page: page.id }
    if (!NODE_ID.test(page.id)) err(`장 id 「${page.id}」 꼴이 아니에요`, at)
    if (pageIds.has(page.id)) err(`장 id 「${page.id}」가 겹쳐요`, at)
    pageIds.add(page.id)
    if (page.variant && !variantKeys.has(page.variant))
      err(`갈래 「${page.variant}」가 문서에 없어요`, at)
    if (!page.blocks.length && !page.layout) warn('빈 장이에요', at)
    checkBlocks(page.blocks, page.id)
    if (page.layout) checkLayout(page, page.layout)
  }
  checkBlocks(doc.done.blocks, undefined)
  if (!doc.submit.label.trim()) err('보내기 버튼 글이 비었어요')

  // 조건식 · 다음 장 규칙이 가리키는 것이 있는지.
  const checkExpr = (expr: Expr | undefined, at: { page?: string; block?: string }) => {
    if (expr === undefined) return
    for (const path of collectVarPaths(expr)) {
      const [root, key] = path.split('.')
      if (root !== 'answers' || !key) err(`조건은 문항 답(answers.키)만 읽어요: ${path}`, at)
      else if (!keys.has(key)) err(`조건이 가리키는 문항 「${key}」가 없어요`, at)
    }
  }
  const checkTransition = (t: CampaignTransition | undefined, at: { page: string }) => {
    if (!t) return
    if (t.kind === 'goto' && !pageIds.has(t.page)) err(`가는 장 「${t.page}」가 없어요`, at)
    if (t.kind === 'branch') {
      for (const arm of t.when) {
        checkExpr(arm.if, at)
        checkTransition(arm.then, at)
      }
      checkTransition(t.else, at)
    }
  }
  for (const page of doc.pages) {
    checkExpr(page.visibleWhen, { page: page.id })
    checkTransition(page.next, { page: page.id })
    for (const b of page.blocks) {
      checkExpr(b.visibleWhen, { page: page.id, block: b.id })
      if (b.type === 'button' && b.action.kind === 'goto' && !pageIds.has(b.action.page))
        err(`버튼이 가는 장 「${b.action.page}」가 없어요`, { page: page.id, block: b.id })
    }
  }

  if (published) {
    for (const old of questionsOfDocument(published)) {
      const now = keys.get(old.key)
      if (!now) {
        err(
          `발행한 문항 「${old.short || old.key}」(${old.key})를 지웠어요 — 이미 받은 답이 이 키로 남아 있어요`,
        )
        continue
      }
      if (now.kind !== old.kind) err(`발행한 문항 「${old.key}」의 종류는 바꿀 수 없어요`)
      if (
        (old.kind === 'choice' || old.kind === 'multi') &&
        (now.kind === 'choice' || now.kind === 'multi')
      ) {
        const values = new Set(now.options.map((o) => o.value))
        for (const o of old.options)
          if (!values.has(o.value))
            err(
              `발행한 문항 「${old.key}」의 선택지 값 「${o.value}」를 지웠어요 — 글은 고쳐도 돼요`,
            )
      }
    }
  }

  if (JSON.stringify(doc).length > DOCUMENT_MAX) err('문서가 너무 커요 — 장이나 블록을 줄여 주세요')
  return issues
}

export function hasBlockingIssue(issues: readonly DocumentIssue[]): boolean {
  return issues.some((i) => i.level === 'error')
}

export function questionsOfDocument(doc: CampaignDocument): DocumentQuestion[] {
  return [...doc.pages.flatMap((p) => p.blocks), ...doc.done.blocks].flatMap((b) =>
    b.type === 'question' ? [b.question] : [],
  )
}

// ── 짓기(빌더 · MCP 가 함께 쓰는 순수 연산) ─────────────────────────────────

function allBlocks(doc: CampaignDocument): CampaignBlock[] {
  return [...doc.pages.flatMap((p) => p.blocks), ...doc.done.blocks]
}

/** 겹치지 않는 다음 id(`p3`, `b12`). */
export function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  for (let n = 1; ; n += 1) if (!used.has(`${prefix}${String(n)}`)) return `${prefix}${String(n)}`
}

export function nextQuestionKey(doc: CampaignDocument): string {
  return nextId(
    'q',
    questionsOfDocument(doc).map((q) => q.key),
  )
}

/** 블록 종류마다 새로 넣을 때의 모습. 문항은 [questionKind] 로. */
export function newBlock(
  doc: CampaignDocument,
  type: BlockType,
  questionKind: QuestionKind = 'choice',
): CampaignBlock {
  const id = nextId(
    'b',
    allBlocks(doc).map((b) => b.id),
  )
  switch (type) {
    case 'heading':
      return { id, type, lines: ['제목'], size: 'lg' }
    case 'text':
      return { id, type, lines: ['본문을 적어 주세요'], tone: 'default' }
    case 'image':
      return { id, type, image: { src: '', alt: '', width: 240, height: 240 } }
    case 'chip':
      return { id, type, text: '2분이면 끝나요' }
    case 'facts':
      return { id, type, rows: [['일시', '11월 18일(수) 저녁 7시']] }
    case 'button':
      return { id, type, label: '자세히 보기', action: { kind: 'link', href: 'https://' } }
    case 'question':
      return { id, type, question: newQuestion(nextQuestionKey(doc), questionKind) }
  }
}

export function newQuestion(key: string, kind: QuestionKind): DocumentQuestion {
  const base = { key, label: '물음을 적어 주세요', short: '새 문항', required: true }
  const options: ChoiceOption[] = [
    { value: 'yes', label: '네' },
    { value: 'no', label: '아니요' },
  ]
  switch (kind) {
    case 'choice':
      return { ...base, kind, options, layout: 'row' }
    case 'multi':
      return { ...base, kind, options }
    case 'text':
      return { ...base, kind, placeholder: '편하게 적어 주세요', multiline: true }
    case 'number':
      return { ...base, kind, placeholder: '0', unit: '건', max: 100_000 }
    case 'premium':
      return { ...base, kind }
  }
}

/** 종류를 바꿔도 키 · 물음 · 짧은 이름 · 필수 · 도움말 · (고르는 종류끼리면) 선택지는 둔다. */
export function changeQuestionKind(q: DocumentQuestion, kind: QuestionKind): DocumentQuestion {
  if (q.kind === kind) return q
  const fresh = newQuestion(q.key, kind)
  const kept = {
    ...fresh,
    label: q.label,
    short: q.short,
    required: q.required,
    ...(q.hint ? { hint: q.hint } : {}),
  }
  if (
    (kept.kind === 'choice' || kept.kind === 'multi') &&
    (q.kind === 'choice' || q.kind === 'multi')
  )
    return { ...kept, options: q.options }
  return kept
}

export function newPage(doc: CampaignDocument, withQuestion: boolean): CampaignPage {
  const id = nextId(
    'p',
    doc.pages.map((p) => p.id),
  )
  const n = doc.pages.length + 1
  if (!withQuestion)
    return {
      id,
      name: `${String(n)}번째 장`,
      numbered: false,
      align: 'center',
      blocks: [newBlock(doc, 'heading')],
    }
  return {
    id,
    name: `${String(n)}번째 장`,
    numbered: true,
    align: 'center',
    blocks: [newBlock(doc, 'question')],
  }
}

function clamp(i: number, length: number): number {
  return Math.max(0, Math.min(i, length))
}

function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list]
  const [item] = out.splice(from, 1)
  if (item === undefined) return [...list]
  out.splice(clamp(to, out.length), 0, item)
  return out
}

export function insertPage(
  doc: CampaignDocument,
  page: CampaignPage,
  at: number,
): CampaignDocument {
  const pages = [...doc.pages]
  pages.splice(clamp(at, pages.length), 0, page)
  return { ...doc, pages }
}

export function updatePage(
  doc: CampaignDocument,
  pageId: string,
  patch: Partial<Omit<CampaignPage, 'id' | 'blocks'>>,
): CampaignDocument {
  return {
    ...doc,
    pages: doc.pages.map((p) => (p.id === pageId ? stripUndefined({ ...p, ...patch }) : p)),
  }
}

export function removePage(doc: CampaignDocument, pageId: string): CampaignDocument {
  return { ...doc, pages: doc.pages.filter((p) => p.id !== pageId) }
}

export function movePage(doc: CampaignDocument, from: number, to: number): CampaignDocument {
  return { ...doc, pages: moveItem(doc.pages, from, to) }
}

/** 장 복제 — 장 · 블록 id 와 문항 키를 새로 매긴다(같은 키가 둘이면 답이 섞인다). */
export function duplicatePage(doc: CampaignDocument, pageId: string): CampaignDocument {
  const at = doc.pages.findIndex((p) => p.id === pageId)
  const page = doc.pages[at]
  if (!page) return doc
  let working = doc
  const blocks: CampaignBlock[] = []
  for (const b of page.blocks) {
    const id = nextId('b', [...allBlocks(working).map((x) => x.id), ...blocks.map((x) => x.id)])
    const copy: CampaignBlock =
      b.type === 'question'
        ? {
            ...b,
            id,
            question: {
              ...b.question,
              key: nextId('q', [
                ...questionsOfDocument(working).map((q) => q.key),
                ...blocks.flatMap((x) => (x.type === 'question' ? [x.question.key] : [])),
              ]),
            },
          }
        : { ...b, id }
    blocks.push(copy)
  }
  const copy: CampaignPage = {
    ...page,
    id: nextId(
      'p',
      working.pages.map((p) => p.id),
    ),
    name: `${page.name} 사본`,
    blocks,
  }
  working = insertPage(working, copy, at + 1)
  return working
}

/** 블록이 든 곳 — 장 id, 보낸 뒤 화면이면 'done'. */
export type BlockHome = string | 'done'

function blocksAt(doc: CampaignDocument, home: BlockHome): CampaignBlock[] | null {
  if (home === 'done') return doc.done.blocks
  return doc.pages.find((p) => p.id === home)?.blocks ?? null
}

function withBlocks(
  doc: CampaignDocument,
  home: BlockHome,
  blocks: CampaignBlock[],
): CampaignDocument {
  if (home === 'done') return { ...doc, done: { blocks } }
  return { ...doc, pages: doc.pages.map((p) => (p.id === home ? { ...p, blocks } : p)) }
}

export function insertBlock(
  doc: CampaignDocument,
  home: BlockHome,
  block: CampaignBlock,
  at: number,
): CampaignDocument {
  const blocks = blocksAt(doc, home)
  if (!blocks) return doc
  const next = [...blocks]
  next.splice(clamp(at, next.length), 0, block)
  return withBlocks(doc, home, next)
}

export function findBlock(
  doc: CampaignDocument,
  blockId: string,
): { home: BlockHome; index: number; block: CampaignBlock } | null {
  for (const p of doc.pages) {
    const index = p.blocks.findIndex((b) => b.id === blockId)
    const block = p.blocks[index]
    if (block) return { home: p.id, index, block }
  }
  const index = doc.done.blocks.findIndex((b) => b.id === blockId)
  const block = doc.done.blocks[index]
  return block ? { home: 'done', index, block } : null
}

export function updateBlock(
  doc: CampaignDocument,
  blockId: string,
  change: (block: CampaignBlock) => CampaignBlock,
): CampaignDocument {
  const found = findBlock(doc, blockId)
  if (!found) return doc
  const blocks = [...(blocksAt(doc, found.home) ?? [])]
  blocks[found.index] = stripUndefined(change(found.block))
  return withBlocks(doc, found.home, blocks)
}

export function removeBlock(doc: CampaignDocument, blockId: string): CampaignDocument {
  const found = findBlock(doc, blockId)
  if (!found) return doc
  return withBlocks(
    doc,
    found.home,
    (blocksAt(doc, found.home) ?? []).filter((b) => b.id !== blockId),
  )
}

/** 블록 옮기기 — 같은 장 안이든 다른 장으로든. [at] 은 옮긴 뒤의 자리. */
export function moveBlock(
  doc: CampaignDocument,
  blockId: string,
  home: BlockHome,
  at: number,
): CampaignDocument {
  const found = findBlock(doc, blockId)
  if (!found || !blocksAt(doc, home)) return doc
  if (found.home === home) {
    const blocks = blocksAt(doc, home) ?? []
    return withBlocks(doc, home, moveItem(blocks, found.index, at))
  }
  return insertBlock(removeBlock(doc, blockId), home, found.block, at)
}

/** 선택적 칸에 undefined 를 남기지 않는다(JSON 왕복 · 같음 비교가 흔들리지 않게). */
function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

/** 「이 문항이 이 답일 때만」 — 빌더의 간단 조건. 여럿 고르는 문항이면 그 값을 골랐을 때. */
export function answerIsCondition(q: DocumentQuestion, value: string): Expr {
  const v = { var: `answers.${q.key}` }
  return q.kind === 'multi' ? { in: [value, v] } : { '==': [v, value] }
}

/** 「이 문항이 이 답이 아닐 때만」. */
export function answerIsNotCondition(q: DocumentQuestion, value: string): Expr {
  return { not: answerIsCondition(q, value) }
}

/** 빌더가 지은 간단 조건을 다시 읽는다 — 다른 꼴이면 null(빌더는 「직접 쓴 조건」으로 보인다). */
export function readSimpleCondition(
  expr: Expr | undefined,
): { key: string; value: string; negate: boolean } | null {
  if (expr === undefined || expr === null || typeof expr !== 'object' || Array.isArray(expr))
    return null
  const e = expr as Record<string, unknown>
  if ('not' in e) {
    const inner = readSimpleCondition(e['not'] as Expr)
    return inner && !inner.negate ? { ...inner, negate: true } : null
  }
  const pair = (e['=='] ?? null) as unknown
  if (Array.isArray(pair) && pair.length === 2) {
    const [a, b] = pair as [unknown, unknown]
    const key = varKey(a)
    if (key && typeof b === 'string') return { key, value: b, negate: false }
  }
  const has = (e['in'] ?? null) as unknown
  if (Array.isArray(has) && has.length === 2) {
    const [a, b] = has as [unknown, unknown]
    const key = varKey(b)
    if (key && typeof a === 'string') return { key, value: a, negate: false }
  }
  return null
}

function varKey(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const v = (raw as Record<string, unknown>)['var']
  return typeof v === 'string' && v.startsWith('answers.') ? v.slice('answers.'.length) : null
}

/** 그림 블록의 가장 넓은 보이는 너비 — 폰 화면 375 에서 좌우 여백 20 을 뺀 것. */
export const IMAGE_MAX_WIDTH = 335

/**
 * 그림의 보이는 크기 — 원본 크기에서. 이미 그림이 있던 블록이면 그 너비를 따르고(바꿔도 장이 흔들리지 않게), 없던 블록이면
 * 원본의 1/3(3배 해상도로 올린다고 보고). 너비를 주면 그것. 높이는 비율대로.
 */
export function imageDisplaySize(
  natural: { width: number; height: number },
  current: CampaignImage | null,
  width?: number,
): { width: number; height: number } {
  const base = current?.src ? current.width : undefined
  const w = Math.round(Math.min(IMAGE_MAX_WIDTH, Math.max(24, width ?? base ?? natural.width / 3)))
  return { width: w, height: Math.max(1, Math.round((natural.height * w) / natural.width)) }
}
