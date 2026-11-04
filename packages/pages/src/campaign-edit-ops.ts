import { z } from 'zod'

import {
  changeQuestionKind,
  duplicatePage,
  findBlock,
  insertBlock,
  insertPage,
  moveBlock,
  movePage,
  newBlock,
  newPage,
  parseDocument,
  removeBlock,
  removePage,
  updateBlock,
  updatePage,
} from './campaign-document'
import { findLayoutNode, layoutQuestions, mapLayout } from './campaign-layout'
import { applySeed, defineQuestionFor } from './seed-import'

import type { CampaignBlock, CampaignDocument, QuestionKind } from './campaign-document'

/**
 * 문서 편집 연산 — MCP(`campaign_edit`)가 한 번에 여러 개를 차례로 적용한다. 빌더 화면과 같은 순수 연산(campaign-document)을
 * 부르고, 끝난 문서를 스키마로 다시 읽어 꼴이 깨지면 하나도 적용하지 않는다(부르는 쪽이 저장하지 않는다).
 *
 * 다음 장 규칙(next)은 지금 짓지 않는다 — 차례대로. 블록 · 장의 보이는 조건(visibleWhen)은 set 으로 줄 수 있다.
 */

const BLOCK_TYPES = ['heading', 'text', 'image', 'chip', 'facts', 'question', 'button'] as const
const QUESTION_KINDS = ['choice', 'multi', 'text', 'number', 'premium'] as const

const home = z.string().min(1).describe("장 id, 또는 보낸 뒤 화면이면 'done'")

export const EditOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_page'),
    at: z.number().int().min(0).optional(),
    name: z.string().max(40).optional(),
    withQuestion: z.boolean().default(false),
  }),
  z.object({
    op: z.literal('update_page'),
    page: z.string(),
    set: z
      .object({
        name: z.string().max(40),
        variant: z.string().nullable(),
        visibleWhen: z.unknown().nullable(),
        numbered: z.boolean(),
        align: z.enum(['center', 'top']),
        cta: z.string().max(30).nullable(),
      })
      .partial(),
  }),
  z.object({ op: z.literal('remove_page'), page: z.string() }),
  z.object({ op: z.literal('move_page'), page: z.string(), to: z.number().int().min(0) }),
  z.object({ op: z.literal('duplicate_page'), page: z.string() }),
  z.object({
    op: z.literal('add_block'),
    page: home,
    type: z.enum(BLOCK_TYPES),
    questionKind: z.enum(QUESTION_KINDS).optional(),
    at: z.number().int().min(0).optional(),
    /** 새 블록 위에 덮어쓸 칸(id 는 바꾸지 않는다) — 문항이면 question 안을 겹쳐 쓴다. */
    set: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    op: z.literal('update_block'),
    block: z.string(),
    set: z.record(z.string(), z.unknown()),
  }),
  z.object({ op: z.literal('remove_block'), block: z.string() }),
  z.object({
    op: z.literal('move_block'),
    block: z.string(),
    page: home,
    at: z.number().int().min(0),
  }),
  z.object({
    op: z.literal('set_meta'),
    submit: z.object({ label: z.string(), note: z.string() }).optional(),
    variants: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
    sms: z
      .object({
        title: z.string(),
        lines: z.array(z.object({ text: z.string(), variant: z.string().optional() })),
      })
      .optional(),
  }),
  /**
   * Seed(canvas) 시안 옮기기 — Seed 문서(seed-design/document JSON 통째로)의 페이지 프레임을 장으로 갈아 끼운다. 질문 부품의 질문
   * ID 로 지금 문서의 질문 정의를 이어 쓰고, 없는 ID 는 비워 둔다(발행이 막힌다 — define_question 으로 만든다).
   */
  z.object({ op: z.literal('apply_seed'), seed: z.unknown() }),
  /** 레이아웃 장의 질문 부품(질문 ID)에 질문 정의를 만든다 — 보관함에 있으면 되찾는다. set 은 question 안에 겹쳐 쓴다. */
  z.object({
    op: z.literal('define_question'),
    page: z.string(),
    qid: z.string(),
    set: z.record(z.string(), z.unknown()).optional(),
  }),
  /**
   * 시안의 그림 레이어(Seed 노드 id)에 MVOS 에 올린 그림을 단다. 보이는 크기는 시안 그대로. 시안을 다시 옮겨도 같은 노드 id 면
   * 이어 단다.
   */
  z.object({
    op: z.literal('set_layout_image'),
    node: z.string().min(1),
    src: z.string().regex(/^https:\/\//, 'https 주소여야 한다'),
    alt: z.string().max(200).optional(),
  }),
  /** 문서 통째로 — 받은 JSON 이 스키마에 맞아야 한다. */
  z.object({ op: z.literal('set_document'), document: z.unknown() }),
])
export type EditOp = z.infer<typeof EditOpSchema>

export class EditOpError extends Error {}

/** 블록 위에 칸을 겹쳐 쓴다 — id · type 은 그대로, 문항은 question 안을 겹쳐 쓰고 kind 를 바꾸면 종류 바꾸기 규칙을 따른다. */
function patched(block: CampaignBlock, set: Record<string, unknown>): CampaignBlock {
  const rest = Object.fromEntries(Object.entries(set).filter(([k]) => k !== 'id' && k !== 'type'))
  if ('visibleWhen' in rest && rest['visibleWhen'] === null) rest['visibleWhen'] = undefined
  if (block.type === 'question' && rest['question'] && typeof rest['question'] === 'object') {
    const q = rest['question'] as Record<string, unknown>
    const kind = q['kind'] as QuestionKind | undefined
    const base = kind ? changeQuestionKind(block.question, kind) : block.question
    return { ...block, ...rest, question: { ...base, ...q } } as CampaignBlock
  }
  return { ...block, ...rest } as CampaignBlock
}

function apply(doc: CampaignDocument, op: EditOp): CampaignDocument {
  switch (op.op) {
    case 'add_page': {
      const page = newPage(doc, op.withQuestion)
      return insertPage(doc, op.name ? { ...page, name: op.name } : page, op.at ?? doc.pages.length)
    }
    case 'update_page': {
      requirePage(doc, op.page)
      const { variant, visibleWhen, cta, ...rest } = op.set
      return updatePage(doc, op.page, {
        ...rest,
        ...(variant !== undefined ? { variant: variant ?? undefined } : {}),
        ...(visibleWhen !== undefined ? { visibleWhen: (visibleWhen ?? undefined) as never } : {}),
        ...(cta !== undefined ? { cta: cta ?? undefined } : {}),
      })
    }
    case 'remove_page':
      requirePage(doc, op.page)
      return removePage(doc, op.page)
    case 'move_page': {
      const from = doc.pages.findIndex((p) => p.id === op.page)
      if (from === -1) throw new EditOpError(`장 '${op.page}' 이 없다`)
      return movePage(doc, from, op.to)
    }
    case 'duplicate_page':
      requirePage(doc, op.page)
      return duplicatePage(doc, op.page)
    case 'add_block': {
      if (op.page !== 'done') requirePage(doc, op.page)
      const fresh = newBlock(doc, op.type, op.questionKind)
      const block = op.set ? patched(fresh, op.set) : fresh
      const length =
        op.page === 'done'
          ? doc.done.blocks.length
          : (doc.pages.find((p) => p.id === op.page)?.blocks.length ?? 0)
      return insertBlock(doc, op.page, block, op.at ?? length)
    }
    case 'update_block':
      requireBlock(doc, op.block)
      return updateBlock(doc, op.block, (b) => patched(b, op.set))
    case 'remove_block':
      requireBlock(doc, op.block)
      return removeBlock(doc, op.block)
    case 'move_block':
      requireBlock(doc, op.block)
      if (op.page !== 'done') requirePage(doc, op.page)
      return moveBlock(doc, op.block, op.page, op.at)
    case 'set_meta':
      return {
        ...doc,
        ...(op.submit ? { submit: op.submit } : {}),
        ...(op.variants ? { variants: op.variants } : {}),
        ...(op.sms ? { sms: op.sms } : {}),
      }
    case 'apply_seed':
      try {
        return applySeed(doc, op.seed).doc
      } catch (e) {
        throw new EditOpError(e instanceof Error ? e.message : String(e))
      }
    case 'define_question': {
      const page = doc.pages.find((p) => p.id === op.page)
      if (!page) throw new EditOpError(`장 '${op.page}' 이 없다`)
      const part = page.layout
        ? layoutQuestions(page.layout).find((q) => q.qid === op.qid)
        : undefined
      if (!part) throw new EditOpError(`장 '${op.page}' 의 시안에 질문 ID '${op.qid}' 부품이 없다`)
      const r = defineQuestionFor(doc, op.page, part)
      return op.set ? updateBlock(r.doc, r.blockId, (b) => patched(b, { question: op.set })) : r.doc
    }
    case 'set_layout_image': {
      const page = doc.pages.find(
        (p) => p.layout && findLayoutNode(p.layout, op.node)?.kind === 'image',
      )
      if (!page?.layout) throw new EditOpError(`시안에 그림 레이어 '${op.node}' 이 없다`)
      const layout = mapLayout(page.layout, (n) =>
        n.kind === 'image' && n.id === op.node
          ? { ...n, src: op.src, ...(op.alt !== undefined ? { alt: op.alt } : {}) }
          : n,
      ) as typeof page.layout
      return { ...doc, pages: doc.pages.map((p) => (p === page ? { ...p, layout } : p)) }
    }
    case 'set_document': {
      const next = parseDocument(op.document)
      if (!next) throw new EditOpError('document 가 문서 스키마에 맞지 않는다')
      return next
    }
  }
}

function requirePage(doc: CampaignDocument, id: string) {
  if (!doc.pages.some((p) => p.id === id)) throw new EditOpError(`장 '${id}' 이 없다`)
}

function requireBlock(doc: CampaignDocument, id: string) {
  if (!findBlock(doc, id)) throw new EditOpError(`블록 '${id}' 이 없다`)
}

/** 차례로 적용하고 스키마로 다시 읽는다. 어느 하나라도 실패하면 몇 번째 연산인지와 함께 던진다. */
export function applyEditOps(doc: CampaignDocument, ops: readonly EditOp[]): CampaignDocument {
  let working = doc
  ops.forEach((op, i) => {
    try {
      working = apply(working, op)
    } catch (e) {
      throw new EditOpError(
        `${String(i + 1)}번째(${op.op}): ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  })
  const parsed = parseDocument(JSON.parse(JSON.stringify(working)))
  if (!parsed)
    throw new EditOpError('고친 결과가 문서 스키마에 맞지 않는다 — 칸 이름 · 값을 확인한다')
  return parsed
}
