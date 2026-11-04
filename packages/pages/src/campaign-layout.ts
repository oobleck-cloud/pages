import { z } from 'zod'

import { resolveColor, resolveFont, type ThemeAsset } from './assets'

/**
 * 장의 레이아웃 트리 — Seed(canvas) 시안을 캠페인 디자인 시스템(`campaign-ds`) 말로 정규화한 것. 발행 변환기([seed-import])가
 * Seed 문서에서 짓고, 공개 랜딩 · 편집 미리보기가 같은 트리를 그린다(초안을 그대로 발행하므로 미리보기 = 발행본).
 *
 * 옮기는 것: 순서 · 방향 · 간격 · 안쪽 여백 · 정렬 · 늘이기(grow/stretch) · 모서리 · 색 토큰 · 글자 스타일 · 부품 변형.
 * 옮기지 않는 것: 자유 배치 좌표 · 겹침 · 고정 너비(폰 폭에 맞춰 흐른다).
 *
 * 질문 부품은 질문 ID(답 키)만 갖는다. 물음 · 선택지 · 필수 · 보이는 조건은 그 장의 문항 블록(MVOS 질문 목록)에서 ID 로 찾는다 —
 * 그리는 때에 찾으므로 질문 목록을 고치면 미리보기가 바로 바뀐다.
 */

/** campaign-ds 색 토큰 — 디자인 시스템 문서(`캠페인 디자인 시스템.seed.json`)의 값과 같다. */
export const CAMPAIGN_COLORS = {
  'campaign/bg': '#ffffff',
  'campaign/ink': '#111111',
  'campaign/ink-sub': '#6b7280',
  'campaign/ink-soft': '#4b5563',
  'campaign/primary': '#013bfb',
  'campaign/primary-soft': '#eaf0ff',
  'campaign/on-primary': '#ffffff',
  'campaign/surface': '#f3f5f8',
  'campaign/surface-soft': '#f7f8fa',
  'campaign/track': '#eef0f3',
  'campaign/border': '#d1d5db',
} as const
export type CampaignColorToken = keyof typeof CAMPAIGN_COLORS

/** campaign-ds 글자 스타일(Pretendard) — 크기 · 굵기 · 줄 높이(px). */
export const CAMPAIGN_TEXT_STYLES = {
  'campaign/title': { size: 24, weight: 700, lineHeight: 34 },
  'campaign/label': { size: 18, weight: 700, lineHeight: 26 },
  'campaign/lead': { size: 18, weight: 400, lineHeight: 26 },
  'campaign/choice-lg': { size: 24, weight: 700, lineHeight: 32 },
  'campaign/body': { size: 16, weight: 400, lineHeight: 24 },
  'campaign/body-strong': { size: 16, weight: 600, lineHeight: 24 },
  'campaign/caption': { size: 14, weight: 400, lineHeight: 20 },
  'campaign/step': { size: 14, weight: 600, lineHeight: 20 },
} as const
export type CampaignTextStyle = keyof typeof CAMPAIGN_TEXT_STYLES

/** 토큰 이름이거나 `#rrggbb`(토큰을 걸지 않은 색 — 검증이 경고한다). */
const ColorSchema = z.string()

const placement = {
  /** Seed 노드 id — 편집 미리보기에서 고르기 · 시안과 맞춰 보기. */
  id: z.string(),
  /** Seed 레이어 이름. */
  name: z.string(),
  /** 부모 방향으로 남는 자리를 채운다(layoutGrow 1). */
  grow: z.boolean().optional(),
  /** 부모의 가로(세로 스택)·세로(가로 스택)로 늘인다(layoutAlignSelf STRETCH). */
  stretch: z.boolean().optional(),
}

const FontSchema = z.object({
  size: z.number().positive(),
  weight: z.number().int().positive(),
  lineHeight: z.number().positive(),
})

const ImageNodeSchema = z.object({
  ...placement,
  kind: z.literal('image'),
  /** MVOS 에 올린 그림 주소. 비면 발행을 막는다. */
  src: z.string(),
  alt: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  radius: z.number().nonnegative().optional(),
})

const TextNodeSchema = z.object({
  ...placement,
  kind: z.literal('text'),
  /** 줄바꿈(\n)을 그대로 지킨다. */
  text: z.string(),
  style: z.string().optional(),
  /** 라이브러리 글자 스타일이 없을 때만. */
  font: FontSchema.optional(),
  color: ColorSchema.optional(),
  align: z.enum(['left', 'center', 'right']),
})

const PartSchema = z.discriminatedUnion('part', [
  /** ← · 「질문 n / 전체」 · 진행 막대. 번호는 장 차례로 센다. */
  z.object({
    ...placement,
    kind: z.literal('part'),
    part: z.literal('progress-header'),
    step: z.boolean(),
  }),
  z.object({
    ...placement,
    kind: z.literal('part'),
    part: z.literal('question'),
    /** 답 키 — 질문 목록에서 찾는다. */
    qid: z.string(),
    /** 어느 부품에서 왔나 — 질문 종류와 맞는지 검증한다. */
    component: z.enum(['question-choice', 'question-multi', 'question-premium', 'question-input']),
    /** choice: tiles(큰칸) · list(목록). input: text · multiline · number. */
    variant: z.string().optional(),
    placeholder: z.string().optional(),
  }),
  z.object({
    ...placement,
    kind: z.literal('part'),
    part: z.literal('button'),
    label: z.string(),
    variant: z.enum(['primary', 'secondary', 'text']),
  }),
  z.object({ ...placement, kind: z.literal('part'), part: z.literal('chip'), text: z.string() }),
  z.object({
    ...placement,
    kind: z.literal('part'),
    part: z.literal('fact-row'),
    label: z.string(),
    value: z.string(),
  }),
])

/** 랜딩이 모르는 레이어 — 그리지 않고 발행을 막는다. */
const UnknownNodeSchema = z.object({
  ...placement,
  kind: z.literal('unknown'),
  reason: z.string(),
})

export type LayoutStack = {
  id: string
  name: string
  grow?: boolean | undefined
  stretch?: boolean | undefined
  kind: 'stack'
  dir: 'v' | 'h'
  gap: number
  /** 위 · 오른쪽 · 아래 · 왼쪽. */
  pad: [number, number, number, number]
  /** 주축 정렬. */
  justify: 'start' | 'center' | 'end' | 'between'
  /** 교차축 정렬. */
  align: 'start' | 'center' | 'end'
  fill?: string | undefined
  radius?: number | undefined
  children: LayoutNode[]
}

export type LayoutImage = z.infer<typeof ImageNodeSchema>
export type LayoutText = z.infer<typeof TextNodeSchema>
export type LayoutPart = z.infer<typeof PartSchema>
export type LayoutQuestionPart = Extract<LayoutPart, { part: 'question' }>
export type LayoutUnknown = z.infer<typeof UnknownNodeSchema>
export type LayoutNode = LayoutStack | LayoutText | LayoutImage | LayoutPart | LayoutUnknown

const StackSchema: z.ZodType<LayoutStack> = z.lazy(() =>
  z.object({
    ...placement,
    kind: z.literal('stack'),
    dir: z.enum(['v', 'h']),
    gap: z.number(),
    pad: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    justify: z.enum(['start', 'center', 'end', 'between']),
    align: z.enum(['start', 'center', 'end']),
    fill: ColorSchema.optional(),
    radius: z.number().nonnegative().optional(),
    children: z.array(LayoutNodeSchema),
  }),
)

export const LayoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.union([StackSchema, TextNodeSchema, ImageNodeSchema, PartSchema, UnknownNodeSchema]),
)

// ── 읽기 ────────────────────────────────────────────────────────────────

export function walkLayout(node: LayoutNode, visit: (n: LayoutNode) => void): void {
  visit(node)
  if (node.kind === 'stack') for (const c of node.children) walkLayout(c, visit)
}

/** 트리의 질문 부품 — 놓인 차례대로. */
export function layoutQuestions(root: LayoutNode): LayoutQuestionPart[] {
  const out: LayoutQuestionPart[] = []
  walkLayout(root, (n) => {
    if (n.kind === 'part' && n.part === 'question') out.push(n)
  })
  return out
}

/** 트리를 그대로 두고 노드마다 [fn] 을 거친 새 트리 — 자식부터 바꾼다. */
export function mapLayout(node: LayoutNode, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  return node.kind === 'stack'
    ? fn({ ...node, children: node.children.map((c) => mapLayout(c, fn)) })
    : fn(node)
}

/** 트리의 그림 노드 — 놓인 차례대로. */
export function layoutImages(root: LayoutNode): Extract<LayoutNode, { kind: 'image' }>[] {
  const out: Extract<LayoutNode, { kind: 'image' }>[] = []
  walkLayout(root, (n) => {
    if (n.kind === 'image') out.push(n)
  })
  return out
}

export function findLayoutNode(root: LayoutNode, id: string): LayoutNode | null {
  let hit: LayoutNode | null = null
  walkLayout(root, (n) => {
    if (!hit && n.id === id) hit = n
  })
  return hit
}

/**
 * 색 — 토큰이면 그 값, `#hex` 면 그대로, 모르는 토큰이면 undefined. [theme] 을 주면 그 테마에서 찾고, 없으면 캠페인 토큰(v1).
 */
export function colorOf(color: string | undefined, theme?: ThemeAsset): string | undefined {
  if (theme) return resolveColor(theme, color)
  if (!color) return undefined
  if (color.startsWith('#')) return color
  return (CAMPAIGN_COLORS as Record<string, string>)[color]
}

export function fontOf(
  node: LayoutText,
  theme?: ThemeAsset,
): { size: number; weight: number; lineHeight: number } {
  if (theme) return resolveFont(theme, node.style, node.font)
  const style = node.style
    ? (
        CAMPAIGN_TEXT_STYLES as Record<string, { size: number; weight: number; lineHeight: number }>
      )[node.style]
    : undefined
  return style ?? node.font ?? CAMPAIGN_TEXT_STYLES['campaign/body']
}

/** 이 질문 부품에 맞는 문항 종류. */
export function kindsForPart(part: LayoutQuestionPart): readonly string[] {
  switch (part.component) {
    case 'question-choice':
      return ['choice']
    case 'question-multi':
      return ['multi']
    case 'question-premium':
      return ['premium']
    case 'question-input':
      return part.variant === 'number' ? ['number'] : ['text']
  }
}
