import { z } from 'zod'

import { ExprSchema } from '../expr'
import { ActionListSchema } from './actions'

import type { Expr } from '../expr'
import type { ActionList } from './actions'

/**
 * 화면 문서 v2 — SPA 화면(장 · 시트 · 보낸 뒤 화면)의 차례와, 화면마다 하나인 레이아웃 트리.
 *
 * 편집 범위(2026-11-04 결정): 빌더는 **부품 조합 · 배치까지만** 고친다.
 * - 트리의 틀(stack: 방향 · 간격 · 여백 · 정렬 · 바탕)은 화면 틀(팩의 템플릿)이나 Seed 시안이 정하고 빌더는 고치지 않는다.
 * - 빌더가 고치는 것은 틀 안에 놓인 부품 인스턴스(`instance`) · 글(`text`) · 그림(`image`)이다 — 넣기 · 빼기 · 옮기기(같은 틀 안 차례,
 *   다른 틀로) · 속성 · 값 연결(`bind`) · 동작(`on`) · 보이는 조건.
 *
 * 상태는 세 가지다: 입력 필드(`fields`, 답으로 쌓인다) · 계산값(`computed`, Expr) · 호스트 변수(`host`, 호스트가 넣는다).
 * 조건식은 `fields.<키>`(= v1 의 `answers.<키>`, 둘 다 읽힌다) · `computed.<이름>` · `host.<이름>` 을 읽는다.
 *
 * v1 문서(이미 나간 설문)는 [fromV1] 로 옮겨 읽는다. 필드 키는 v1 문항 키와 같다(응답 · 콜 템플릿 키가 그대로 남는다).
 */

/** 부품 참조 — `팩 id:부품 키`(예: `campaign:button`, `workstyle:segment`). */
export const COMPONENT_REF = /^[a-z0-9-]+:[a-z0-9-]+$/

/** 속성 값 — 정의(PropDef)에 맞는 글자 · 참거짓 · 끼울 부품 키(null 이면 비움). */
const PropValueSchema = z.union([z.string(), z.boolean(), z.null()])
export type PropValue = z.infer<typeof PropValueSchema>

const placement = {
  id: z.string(),
  /** 레이어 이름 — 편집기 목록에 보인다. */
  name: z.string().optional(),
  grow: z.boolean().optional(),
  stretch: z.boolean().optional(),
  visibleWhen: ExprSchema.optional(),
}

const FontSchema = z.object({
  size: z.number().positive(),
  weight: z.number().int().positive(),
  lineHeight: z.number().positive(),
})

const TextSchema = z.object({
  ...placement,
  kind: z.literal('text'),
  text: z.string(),
  style: z.string().optional(),
  font: FontSchema.optional(),
  color: z.string().optional(),
  align: z.enum(['left', 'center', 'right']),
  /** `**말**` 을 강조색으로(v1 본문 블록). */
  emphasis: z.boolean().optional(),
})

const ImageSchema = z.object({
  ...placement,
  kind: z.literal('image'),
  src: z.string(),
  alt: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  radius: z.number().nonnegative().optional(),
})

const InstanceSchema = z.object({
  ...placement,
  kind: z.literal('instance'),
  /** 부품 참조(`팩:키`). */
  use: z.string().regex(COMPONENT_REF),
  /** 정의와 다른 속성만 — 없는 속성은 정의의 기본값. */
  props: z.record(PropValueSchema),
  /** 값을 받는 부품(정의에 `value` 가 있는)이 묶이는 입력 필드 키. */
  bind: z.string().optional(),
  /** 일 → 동작 체인(정의의 `events` 에 있는 일만). */
  on: z.record(ActionListSchema).optional(),
})

const UnknownSchema = z.object({ ...placement, kind: z.literal('unknown'), reason: z.string() })

export type TextNode = z.infer<typeof TextSchema>
export type ImageNode = z.infer<typeof ImageSchema>
export type InstanceNode = z.infer<typeof InstanceSchema>
export type UnknownNode = z.infer<typeof UnknownSchema>

/** 틀 — 빌더가 만들거나 고치지 않는다(화면 틀 · 시안이 정한다). 안에 놓인 것만 바뀐다. */
export type FrameNode = {
  id: string
  name?: string | undefined
  grow?: boolean | undefined
  stretch?: boolean | undefined
  visibleWhen?: Expr | undefined
  kind: 'stack'
  dir: 'v' | 'h'
  gap: number
  pad: [number, number, number, number]
  justify: 'start' | 'center' | 'end' | 'between'
  align: 'start' | 'center' | 'end'
  fill?: string | undefined
  radius?: number | undefined
  /** 빌더가 부품을 놓을 수 있는 칸인가 — 아니면 안을 고칠 수 없다(시안의 장식 묶음 등). 기본 참. */
  slot?: boolean | undefined
  children: ScreenNode[]
}

/** 빌더가 놓고 빼고 옮기는 것 — 틀이 아닌 모든 노드. */
export type PlacedNode = TextNode | ImageNode | InstanceNode | UnknownNode
export type ScreenNode = FrameNode | PlacedNode

const FrameSchema: z.ZodType<FrameNode> = z.lazy(() =>
  z.object({
    ...placement,
    kind: z.literal('stack'),
    dir: z.enum(['v', 'h']),
    gap: z.number(),
    pad: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    justify: z.enum(['start', 'center', 'end', 'between']),
    align: z.enum(['start', 'center', 'end']),
    fill: z.string().optional(),
    radius: z.number().nonnegative().optional(),
    slot: z.boolean().optional(),
    children: z.array(ScreenNodeSchema),
  }),
)

export const ScreenNodeSchema: z.ZodType<ScreenNode> = z.lazy(() =>
  z.union([FrameSchema, TextSchema, ImageSchema, InstanceSchema, UnknownSchema]),
)

const OptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  summary: z.string().optional(),
  minor: z.boolean().optional(),
})
export type FieldOption = z.infer<typeof OptionSchema>

/**
 * 입력 필드 — 답 하나의 뜻. 어떻게 그릴지(큰칸 · 목록 · 여러 줄 · 안내 글)는 묶인 부품의 속성이 정한다.
 * `type` 은 값 종류: 코어(text · number · choice · multi) 또는 팩이 더한 종류(예: 캠페인 팩의 `premium`).
 */
export const FieldSchema = z.object({
  key: z.string(),
  type: z.string(),
  label: z.string(),
  /** 운영자 표 · 보낸 뒤 화면의 짧은 이름. */
  short: z.string(),
  hint: z.string().optional(),
  required: z.boolean(),
  options: z.array(OptionSchema).optional(),
  /** multi: 고르면 나머지를 비우는 값. */
  exclusive: z.string().optional(),
  /** number: 단위 · 상한. */
  unit: z.string().optional(),
  max: z.number().nonnegative().optional(),
})
export type Field = z.infer<typeof FieldSchema>

export const ScreenSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** page: 차례에 드는 장 · sheet: 위에 뜨는 시트(차례 밖) · done: 보낸 뒤 화면. */
  role: z.enum(['page', 'sheet', 'done']),
  variant: z.string().optional(),
  visibleWhen: ExprSchema.optional(),
  /** 「질문 n / 전체」로 센다. */
  numbered: z.boolean(),
  /** 바탕 에셋 id — 최외곽 틀에 직접 건 `fill` 이 이보다 앞선다. */
  surface: z.string().optional(),
  /** 화면 틀 id(팩 템플릿) — 시안에서 옮긴 화면이면 비운다. */
  template: z.string().optional(),
  frame: FrameSchema,
})
export type Screen = z.infer<typeof ScreenSchema>

const SmsLineSchema = z.object({ text: z.string(), variant: z.string().optional() })

export const ScreenDocumentSchema = z.object({
  schemaVersion: z.literal(2),
  /** 쓰는 팩 id — 부품 참조의 팩이 여기 있어야 한다. 앞의 팩 테마로 그린다. */
  packs: z.array(z.string()).min(1),
  screens: z.array(ScreenSchema),
  /** 입력 필드 — 어디에도 묶이지 않은 필드는 묻지 않고 보관만 한다(v1 의 questionBank). */
  fields: z.array(FieldSchema),
  computed: z.array(z.object({ name: z.string(), expr: ExprSchema })).optional(),
  /** 호스트가 넣는 변수(이름 · 설명) — 조건식 · 속성 바인딩이 읽는다. */
  host: z.array(z.object({ name: z.string(), label: z.string() })).optional(),
  submit: z.object({ label: z.string(), note: z.string() }),
  variants: z.array(z.object({ key: z.string(), label: z.string() })),
  /** 문자 틀 — v1 호환 칸(코어는 꼴만 지킨다, 보내는 일은 호스트). */
  sms: z.object({ title: z.string(), lines: z.array(SmsLineSchema) }).optional(),
})
export type ScreenDocument = z.infer<typeof ScreenDocumentSchema>

export function parseScreenDocument(raw: unknown): ScreenDocument | null {
  const r = ScreenDocumentSchema.safeParse(raw)
  return r.success ? r.data : null
}

// ── 트리 읽기 ────────────────────────────────────────────────────────────

/** 노드마다 [visit] — 조상(바깥부터)과 함께. */
export function walkScreen(
  node: ScreenNode,
  visit: (n: ScreenNode, ancestors: readonly FrameNode[]) => void,
  ancestors: readonly FrameNode[] = [],
): void {
  visit(node, ancestors)
  if (node.kind === 'stack')
    for (const c of node.children) walkScreen(c, visit, [...ancestors, node])
}

export function findNode(root: ScreenNode, id: string): ScreenNode | null {
  let hit: ScreenNode | null = null
  walkScreen(root, (n) => {
    if (!hit && n.id === id) hit = n
  })
  return hit
}

/** 화면의 인스턴스 — 놓인 차례대로, 조상의 보이는 조건과 함께. */
export function screenInstances(screen: Screen): Array<{ node: InstanceNode; conditions: Expr[] }> {
  const out: Array<{ node: InstanceNode; conditions: Expr[] }> = []
  walkScreen(screen.frame, (n, ancestors) => {
    if (n.kind !== 'instance') return
    const conditions = [screen.visibleWhen, ...ancestors.map((a) => a.visibleWhen), n.visibleWhen]
    out.push({ node: n, conditions: conditions.filter((c): c is Expr => c !== undefined) })
  })
  return out
}

/** 문서의 모든 노드 id — 새 id 를 지을 때. */
export function nodeIds(doc: ScreenDocument): Set<string> {
  const ids = new Set<string>()
  for (const s of doc.screens) walkScreen(s.frame, (n) => ids.add(n.id))
  return ids
}

/** 부품 참조를 팩 id · 부품 키로. */
export function splitRef(ref: string): { pack: string; key: string } {
  const at = ref.indexOf(':')
  return { pack: ref.slice(0, at), key: ref.slice(at + 1) }
}

export type { ActionList }
