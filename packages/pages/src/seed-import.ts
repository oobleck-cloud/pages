import { NODE_ID, nextId } from './campaign-document'
import {
  CAMPAIGN_COLORS,
  CAMPAIGN_TEXT_STYLES,
  layoutImages,
  layoutQuestions,
  mapLayout,
} from './campaign-layout'

import type { CampaignBlock, CampaignDocument, CampaignPage } from './campaign-document'
import type { LayoutNode, LayoutQuestionPart, LayoutStack } from './campaign-layout'

/**
 * Seed(canvas) 문서 → 랜딩 문서. 시안의 페이지 프레임 하나가 장 하나가 되고, 프레임 안은 레이아웃 트리([campaign-layout])로 옮긴다.
 *
 * - 장 id · 이름은 프레임 이름 「id · 이름」에서 읽는다(id 꼴이 아니면 p1, p2… 를 주고 알린다).
 * - campaign-ds 부품(progress-header · button · question-* · chip · fact-row)은 부품 말로, 자동 레이아웃 프레임은 스택으로, 글은
 *   글자 스타일 · 색 토큰으로 옮긴다. 그 밖의 레이어는 `unknown` 으로 남겨 발행을 막는다(검증이 알린다).
 * - 질문 부품의 질문 ID 로 앞 문서의 질문 정의(문항 블록)를 찾아 그 장에 둔다. 없는 ID 는 비워 두고 검증이 막는다 — MVOS 질문
 *   목록에서 만들면 미리보기에 바로 붙는다. 시안에서 빠진 질문 정의는 `questionBank` 로 옮겨 버리지 않는다.
 *
 * 초안을 그대로 발행하므로(서버가 초안을 발행본으로 복사) 이 변환 결과가 곧 미리보기이자 발행본이다.
 */

type SeedNode = {
  id: string
  type?: string
  name?: string
  visible?: boolean
  internalOnly?: boolean
  children?: SeedNode[]
  x?: number
  y?: number
  width?: number
  height?: number
  text?: string
  textStyleId?: string
  textAlignHorizontal?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number | { value?: number }
  fills?: Array<{ type?: string; color?: Rgba; visible?: boolean; imageUrl?: string; src?: string }>
  boundVariables?: Record<string, string>
  layoutMode?: string
  itemSpacing?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  primaryAxisAlign?: string
  counterAxisAlign?: string
  layoutGrow?: number
  layoutAlignSelf?: string
  cornerRadius?: number
  componentId?: string
  componentPropertyAssignments?: Record<string, unknown>
  componentPropertyDefinitions?: Array<{ id: string; name?: string; defaultValue?: unknown }>
  pluginData?: Array<{ pluginId?: string; key?: string; value?: string }>
}
type Rgba = { r: number; g: number; b: number; a?: number }
type SeedDoc = {
  schema?: string
  pages?: SeedNode[]
  variables?: Array<{ id: string; name: string }>
}

export type SeedImportPage = { id: string; name: string; frameId: string; layout: LayoutStack }

export type SeedImport = { pages: SeedImportPage[]; problems: string[] }

const PARTS = new Set([
  'progress-header',
  'button',
  'question-choice',
  'question-multi',
  'question-premium',
  'question-input',
  'chip',
  'fact-row',
])

/** Seed 문서의 페이지 프레임을 장마다 레이아웃 트리로. 문서 꼴이 아니면 던진다. */
export function seedToPages(raw: unknown): SeedImport {
  const doc = raw as SeedDoc
  if (!doc || typeof doc !== 'object' || doc.schema !== 'seed-design/document' || !doc.pages)
    throw new Error('Seed 문서(seed-design/document)가 아니에요')
  const ctx = indexSeed(doc)
  const problems: string[] = []
  const frames = doc.pages
    .filter((p) => !p.internalOnly)
    .flatMap((p) => p.children ?? [])
    .filter((n) => n.type === 'FRAME' && n.visible !== false && isPageFrame(n))
    .sort((a, b) => (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0))

  const taken = new Set<string>()
  const pages = frames.map((frame): SeedImportPage => {
    const title = frame.name ?? ''
    const sep = title.indexOf(' · ')
    let id = (sep === -1 ? title : title.slice(0, sep)).trim()
    const name = (sep === -1 ? title : title.slice(sep + 3)).trim() || id
    if (!NODE_ID.test(id) || taken.has(id)) {
      const given = nextId('p', taken)
      problems.push(
        `프레임 「${title}」 이름이 「장id · 이름」 꼴이 아니거나 id 가 겹쳐 ${given} 로 두었어요`,
      )
      id = given
    }
    taken.add(id)
    const layout = convertNode(frame, ctx)
    const root: LayoutStack =
      layout.kind === 'stack'
        ? layout
        : { ...stackBase(frame), kind: 'stack', dir: 'v', children: [layout] }
    return { id, name, frameId: frame.id, layout: { ...root, grow: true } }
  })
  if (!pages.length) problems.push('페이지 프레임(역할 page)이 하나도 없어요')
  return { pages, problems }
}

/**
 * 앞 문서([doc])에 Seed 시안을 옮긴다 — 장은 시안으로 갈아 끼우고, 같은 장 id 의 갈래 · 보이는 조건 · 다음 장 규칙과 질문 정의는
 * 이어 쓴다. 보낸 뒤 화면 · 보내기 · 갈래 · 문자는 그대로.
 */
export function applySeed(
  doc: CampaignDocument,
  raw: unknown,
): { doc: CampaignDocument; problems: string[]; missing: string[] } {
  const imported = seedToPages(raw)
  const oldPages = new Map(doc.pages.map((p) => [p.id, p]))
  const pool = new Map<string, Extract<CampaignBlock, { type: 'question' }>>()
  for (const b of [
    ...(doc.questionBank ?? []),
    ...doc.done.blocks,
    ...doc.pages.flatMap((p) => p.blocks),
  ])
    if (b.type === 'question') pool.set(b.question.key, b)

  // Seed 파일에는 MVOS 에 올린 그림 주소가 없다 — 앞서 단 그림을 같은 Seed 노드 id(없으면 같은 레이어 이름)로 이어 단다.
  const uploaded = new Map<string, Extract<LayoutNode, { kind: 'image' }>>()
  for (const p of doc.pages)
    if (p.layout)
      for (const img of layoutImages(p.layout))
        if (img.src) {
          uploaded.set(`id:${img.id}`, img)
          if (!uploaded.has(`name:${img.name}`)) uploaded.set(`name:${img.name}`, img)
        }
  const keepUploaded = (root: LayoutStack): LayoutStack =>
    mapLayout(root, (n) => {
      if (n.kind !== 'image' || n.src) return n
      const prev = uploaded.get(`id:${n.id}`) ?? uploaded.get(`name:${n.name}`)
      return prev ? { ...n, src: prev.src, alt: prev.alt || n.alt } : n
    }) as LayoutStack

  const used = new Set<string>()
  const missing: string[] = []
  const pages = imported.pages.map((ip): CampaignPage => {
    const old = oldPages.get(ip.id)
    const parts = layoutQuestions(ip.layout)
    const blocks: CampaignBlock[] = []
    for (const part of parts) {
      if (used.has(part.qid)) continue
      const b = pool.get(part.qid)
      if (b) {
        blocks.push(b)
        used.add(part.qid)
      } else if (!missing.includes(part.qid)) missing.push(part.qid)
    }
    return {
      id: ip.id,
      name: ip.name,
      ...(old?.variant ? { variant: old.variant } : {}),
      ...(old?.visibleWhen ? { visibleWhen: old.visibleWhen } : {}),
      numbered: numberedOf(ip.layout),
      align: 'top',
      blocks,
      ...(old?.next ? { next: old.next } : {}),
      layout: keepUploaded(ip.layout),
    }
  })
  const bank = [...pool.values()].filter(
    (b) => !used.has(b.question.key) && !doc.done.blocks.includes(b),
  )
  const { questionBank: _drop, ...rest } = doc
  return {
    doc: { ...rest, pages, ...(bank.length ? { questionBank: bank } : {}) },
    problems: imported.problems,
    missing,
  }
}

/** 질문 목록에 없는 질문 ID 에 새 정의를 — 부품에 맞는 종류의 빈 문항(물음 · 선택지는 운영자가 채운다). */
export function questionStubFor(
  part: LayoutQuestionPart,
  blockId: string,
): Extract<CampaignBlock, { type: 'question' }> {
  const base = { key: part.qid, label: '', short: '', required: true }
  switch (part.component) {
    case 'question-choice':
      return {
        id: blockId,
        type: 'question',
        question: {
          ...base,
          kind: 'choice',
          options: [],
          layout: part.variant === 'list' ? 'stack' : 'row',
        },
      }
    case 'question-multi':
      return { id: blockId, type: 'question', question: { ...base, kind: 'multi', options: [] } }
    case 'question-premium':
      return { id: blockId, type: 'question', question: { ...base, kind: 'premium' } }
    case 'question-input':
      return part.variant === 'number'
        ? {
            id: blockId,
            type: 'question',
            question: {
              ...base,
              kind: 'number',
              placeholder: part.placeholder ?? '',
              unit: '',
              max: 1_000_000_000,
            },
          }
        : {
            id: blockId,
            type: 'question',
            question: {
              ...base,
              required: false,
              kind: 'text',
              placeholder: part.placeholder ?? '',
              multiline: part.variant === 'multiline',
            },
          }
  }
}

// ── 안 ──────────────────────────────────────────────────────────────────

type SeedIndex = {
  /** 부품 정의 id → 부품 이름 · 변형 값(속성 이름 → 값) · 속성 기본값. */
  components: Map<
    string,
    { name: string; variants: Record<string, string>; defaults: Record<string, unknown> }
  >
  /** 글자 스타일 노드 id → 스타일 이름. */
  textStyles: Map<string, string>
  /** 변수 id → 이름. */
  variables: Map<string, string>
}

function indexSeed(doc: SeedDoc): SeedIndex {
  const components: SeedIndex['components'] = new Map()
  const textStyles = new Map<string, string>()
  const walk = (n: SeedNode, parent: SeedNode | null) => {
    if (n.type === 'COMPONENT') {
      const set = parent?.type === 'COMPONENT_SET' ? parent : null
      const defs = (set ?? n).componentPropertyDefinitions ?? []
      components.set(n.id, {
        name: set?.name ?? n.name ?? '',
        variants: set ? variantsOf(n.name ?? '') : {},
        defaults: Object.fromEntries(defs.map((d) => [d.id, d.defaultValue])),
      })
    }
    if (n.type === 'TEXT' && (n as { sharedStyleType?: string }).sharedStyleType === 'TEXT')
      textStyles.set(n.id, n.name ?? '')
    for (const c of n.children ?? []) walk(c, n)
  }
  for (const p of doc.pages ?? []) walk(p, null)
  const variables = new Map<string, string>()
  for (const v of doc.variables ?? []) {
    variables.set(v.id, v.name)
    const slash = v.id.indexOf('/')
    if (slash !== -1) variables.set(v.id.slice(slash + 1), v.name)
  }
  return { components, textStyles, variables }
}

/** 변형 이름 「종류=글, 물음 숨기기=false」 → { 종류: '글', '물음 숨기기': 'false' }. */
function variantsOf(name: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of name.split(',')) {
    const eq = part.indexOf('=')
    if (eq !== -1) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
  }
  return out
}

function isPageFrame(n: SeedNode): boolean {
  const role = n.pluginData?.find((d) => d.key === 'seed/frameRole')?.value
  return role === undefined || role === 'page'
}

function placementOf(n: SeedNode) {
  return {
    id: n.id,
    name: n.name ?? '',
    ...(n.layoutGrow === 1 ? { grow: true } : {}),
    ...(n.layoutAlignSelf === 'STRETCH' ? { stretch: true } : {}),
  }
}

function stackBase(n: SeedNode) {
  return {
    ...placementOf(n),
    gap: n.itemSpacing ?? 0,
    pad: [n.paddingTop ?? 0, n.paddingRight ?? 0, n.paddingBottom ?? 0, n.paddingLeft ?? 0] as [
      number,
      number,
      number,
      number,
    ],
    justify: justifyOf(n.primaryAxisAlign),
    align: alignOf(n.counterAxisAlign),
  }
}

function justifyOf(v: string | undefined): LayoutStack['justify'] {
  return v === 'CENTER'
    ? 'center'
    : v === 'MAX'
      ? 'end'
      : v === 'SPACE_BETWEEN'
        ? 'between'
        : 'start'
}
function alignOf(v: string | undefined): LayoutStack['align'] {
  return v === 'CENTER' ? 'center' : v === 'MAX' ? 'end' : 'start'
}

function hex({ r, g, b }: Rgba): string {
  const c = (x: number) =>
    Math.round(Math.max(0, Math.min(1, x)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** 첫 칠 — 토큰을 걸었으면 토큰 이름, 아니면 #hex. 칠이 없으면 undefined. */
function fillOf(n: SeedNode, ctx: SeedIndex): string | undefined {
  const fill = n.fills?.find((f) => f.visible !== false)
  if (!fill || fill.type !== 'SOLID' || !fill.color) return undefined
  const bound = n.boundVariables?.['fills/0/color']
  const token = bound ? ctx.variables.get(bound) : undefined
  if (token && token in CAMPAIGN_COLORS) return token
  return hex(fill.color)
}

function imageFillOf(n: SeedNode): { src: string } | null {
  const fill = n.fills?.find((f) => f.visible !== false && f.type === 'IMAGE')
  if (!fill) return null
  const src = fill.imageUrl ?? fill.src ?? ''
  return { src: /^https:\/\//.test(src) ? src : '' }
}

function convertNode(n: SeedNode, ctx: SeedIndex): LayoutNode {
  const at = placementOf(n)
  if (n.type === 'INSTANCE') return convertInstance(n, ctx)

  const image = imageFillOf(n)
  if (image && (n.type === 'RECTANGLE' || n.type === 'FRAME'))
    return {
      ...at,
      kind: 'image',
      src: image.src,
      alt: n.name ?? '',
      width: Math.max(1, Math.round(n.width ?? 1)),
      height: Math.max(1, Math.round(n.height ?? 1)),
      ...(n.cornerRadius ? { radius: n.cornerRadius } : {}),
    }

  if (n.type === 'TEXT') {
    const styleName = n.textStyleId ? ctx.textStyles.get(n.textStyleId) : undefined
    const style = styleName && styleName in CAMPAIGN_TEXT_STYLES ? styleName : undefined
    const lineHeight = typeof n.lineHeight === 'number' ? n.lineHeight : n.lineHeight?.value
    const color = fillOf(n, ctx)
    return {
      ...at,
      kind: 'text',
      text: n.text ?? '',
      ...(style
        ? { style }
        : {
            font: {
              size: n.fontSize ?? 16,
              weight: n.fontWeight ?? 400,
              lineHeight: lineHeight ?? Math.round((n.fontSize ?? 16) * 1.5),
            },
          }),
      ...(color ? { color } : {}),
      align:
        n.textAlignHorizontal === 'CENTER'
          ? 'center'
          : n.textAlignHorizontal === 'RIGHT'
            ? 'right'
            : 'left',
    }
  }

  if (n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'SECTION') {
    const fill = fillOf(n, ctx)
    const auto = n.layoutMode === 'VERTICAL' || n.layoutMode === 'HORIZONTAL'
    const kids = (n.children ?? []).filter((c) => c.visible !== false)
    // 자유 배치 프레임은 위에서 아래 차례로 쌓는다(좌표 · 겹침은 옮기지 않는다).
    const ordered = auto ? kids : [...kids].sort((a, b) => (a.y ?? 0) - (b.y ?? 0))
    return {
      ...stackBase(n),
      kind: 'stack',
      dir: n.layoutMode === 'HORIZONTAL' ? 'h' : 'v',
      ...(fill ? { fill } : {}),
      ...(n.cornerRadius ? { radius: n.cornerRadius } : {}),
      children: ordered.map((c) => convertNode(c, ctx)),
    }
  }

  return { ...at, kind: 'unknown', reason: `${n.type ?? '?'} 레이어는 campaign-ds 에 없어요` }
}

function convertInstance(n: SeedNode, ctx: SeedIndex): LayoutNode {
  const at = placementOf(n)
  const def = n.componentId ? ctx.components.get(n.componentId) : undefined
  if (!def || !PARTS.has(def.name))
    return {
      ...at,
      kind: 'unknown',
      reason: `campaign-ds 부품이 아니에요(${def?.name ?? '정의를 못 찾음'})`,
    }
  const prop = (id: string): unknown => n.componentPropertyAssignments?.[id] ?? def.defaults[id]
  const str = (id: string) => {
    const v = prop(id)
    return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v as number)
  }
  switch (def.name) {
    case 'progress-header': {
      const v = prop('step#1')
      return { ...at, kind: 'part', part: 'progress-header', step: v !== false && v !== 'false' }
    }
    case 'button':
      return {
        ...at,
        kind: 'part',
        part: 'button',
        label: str('label#1'),
        variant:
          def.variants['종류'] === '보조'
            ? 'secondary'
            : def.variants['종류'] === '글자'
              ? 'text'
              : 'primary',
      }
    case 'chip':
      return { ...at, kind: 'part', part: 'chip', text: str('t#1') }
    case 'fact-row':
      return { ...at, kind: 'part', part: 'fact-row', label: str('k#1'), value: str('v#1') }
    default: {
      const component = def.name as LayoutQuestionPart['component']
      const variant =
        component === 'question-choice'
          ? def.variants['배치'] === '목록'
            ? 'list'
            : 'tiles'
          : component === 'question-input'
            ? def.variants['종류'] === '수' || def.variants['종류'] === '숫자'
              ? 'number'
              : def.variants['종류'] === '여러 줄'
                ? 'multiline'
                : 'text'
            : undefined
      const placeholder = component === 'question-input' ? str('ph#1') : ''
      return {
        ...at,
        kind: 'part',
        part: 'question',
        qid: str('qid#1').trim(),
        component,
        ...(variant ? { variant } : {}),
        ...(placeholder ? { placeholder } : {}),
      }
    }
  }
}

function numberedOf(root: LayoutNode): boolean {
  let on = false
  const walk = (n: LayoutNode) => {
    if (n.kind === 'part' && n.part === 'progress-header' && n.step) on = true
    if (n.kind === 'stack') n.children.forEach(walk)
  }
  walk(root)
  return on
}

/**
 * 질문 목록에 없는 질문 ID 의 정의를 그 장에 만든다 — 보관함에 같은 ID 의 정의가 있으면 되찾고, 없으면 부품에 맞는 빈 문항.
 * 돌려주는 blockId 를 인스펙터가 고른다.
 */
export function defineQuestionFor(
  doc: CampaignDocument,
  pageId: string,
  part: LayoutQuestionPart,
): { doc: CampaignDocument; blockId: string } {
  const page = doc.pages.find((p) => p.id === pageId)
  if (!page) return { doc, blockId: '' }
  const existing = page.blocks.find((b) => b.type === 'question' && b.question.key === part.qid)
  if (existing) return { doc, blockId: existing.id }
  const banked = doc.questionBank?.find((b) => b.type === 'question' && b.question.key === part.qid)
  const taken = [
    ...doc.pages.flatMap((p) => p.blocks),
    ...doc.done.blocks,
    ...(doc.questionBank ?? []),
  ].map((b) => b.id)
  const block = banked ?? questionStubFor(part, nextId('b', taken))
  const bank = (doc.questionBank ?? []).filter((b) => b !== banked)
  const { questionBank: _drop, ...rest } = doc
  return {
    doc: {
      ...rest,
      pages: doc.pages.map((p) => (p.id === pageId ? { ...p, blocks: [...p.blocks, block] } : p)),
      ...(bank.length ? { questionBank: bank } : {}),
    },
    blockId: block.id,
  }
}
