import { campaignFrame } from '../packs/campaign'

import type {
  CampaignBlock,
  CampaignDocument,
  CampaignPage,
  CampaignTransition,
  DocumentQuestion,
} from '../campaign-document'
import type { LayoutNode } from '../campaign-layout'
import type { Action } from './actions'
import type { Field, FrameNode, InstanceNode, Screen, ScreenDocument, ScreenNode } from './screen'

/**
 * v1 캠페인 문서 → v2 화면 문서. 나간 설문을 다시 쓰지 않고 읽어 옮긴다(원본 v1 은 그대로 둔다).
 *
 * 지키는 것(회귀 테스트가 지킨다): 필드 키 · 종류 · 물음 · 필수 · 선택지 값, 구역(장) 차례, 장 · 블록의 보이는 조건, 갈래, 다음 장 규칙.
 * - 블록 장 → 캠페인 화면 틀(머리 · 본문 · 아래). 머리에 진행 머리(번호 장이면 「질문 n / 전체」), 아래에 다음 버튼
 *   (검증 → 장의 next 규칙).
 * - 시안 장(layout) → 시안의 트리 그대로. 질문 부품은 필드에 묶인 인스턴스, 버튼은 검증 → next 규칙.
 * - 보낸 뒤 화면(done) → role done 화면. 받은 답 요약 · 「답 고치기」는 런타임이 붙인다(v1 과 같다).
 * - 문항(장의 문항 블록 · questionBank) → 문서의 필드. 장에 놓이지 않은 문항은 묶이지 않은 필드(보관)가 된다.
 *
 * 글 · 그림 크기는 v1 화면(MVOS campaign-blocks)의 값을 옮겼다 — 그리는 모습이 같은지는 캠페인 킷이 v2 를 그릴 때 따로 견준다.
 */
export function fromV1(doc: CampaignDocument): ScreenDocument {
  return {
    schemaVersion: 2,
    packs: ['campaign'],
    screens: [
      ...doc.pages.map(pageScreen),
      {
        id: 'done',
        name: '보낸 뒤',
        role: 'done',
        numbered: false,
        template: 'top',
        frame: templateFrame('done', 'start', {
          body: doc.done.blocks.flatMap((b) => blockNodes(b, [{ do: 'next' }])),
        }),
      },
    ],
    fields: fieldsOf(doc),
    submit: doc.submit,
    variants: doc.variants,
    sms: doc.sms,
  }
}

function fieldsOf(doc: CampaignDocument): Field[] {
  const blocks = [
    ...doc.pages.flatMap((p) => p.blocks),
    ...doc.done.blocks,
    ...(doc.questionBank ?? []),
  ]
  const seen = new Set<string>()
  return blocks.flatMap((b) => {
    if (b.type !== 'question' || seen.has(b.question.key)) return []
    seen.add(b.question.key)
    return [fieldOf(b.question)]
  })
}

function fieldOf(q: DocumentQuestion): Field {
  const base: Field = {
    key: q.key,
    type: q.kind,
    label: q.label,
    short: q.short,
    ...(q.hint !== undefined ? { hint: q.hint } : {}),
    required: q.required,
  }
  switch (q.kind) {
    case 'choice':
      return { ...base, options: q.options }
    case 'multi':
      return {
        ...base,
        options: q.options,
        ...(q.exclusive !== undefined ? { exclusive: q.exclusive } : {}),
      }
    case 'number':
      return { ...base, unit: q.unit, max: q.max }
    default:
      return base
  }
}

/** 장의 next 규칙 → 동작 체인(끝내는 동작으로 끝난다). */
export function transitionActions(t: CampaignTransition | undefined): Action[] {
  if (!t || t.kind === 'next') return [{ do: 'next' }]
  if (t.kind === 'submit') return [{ do: 'submit' }]
  if (t.kind === 'goto') return [{ do: 'go', to: t.page, mode: 'push' }]
  return [
    {
      do: 'branch',
      when: t.when.map((w) => ({ if: w.if, then: transitionActions(w.then) })),
      else: transitionActions(t.else),
    },
  ]
}

function pageScreen(page: CampaignPage): Screen {
  const nav = transitionActions(page.next)
  const base = {
    id: page.id,
    name: page.name,
    role: 'page' as const,
    ...(page.variant !== undefined ? { variant: page.variant } : {}),
    ...(page.visibleWhen !== undefined ? { visibleWhen: page.visibleWhen } : {}),
    numbered: page.numbered,
  }
  if (page.layout) {
    const questions = new Map(
      page.blocks.flatMap((b) => (b.type === 'question' ? [[b.question.key, b] as const] : [])),
    )
    const root = layoutNode(page.layout, nav, questions)
    return { ...base, frame: root.kind === 'stack' ? root : wrap(page.id, root) }
  }
  return {
    ...base,
    template: page.align === 'center' ? 'center' : 'top',
    frame: templateFrame(page.id, page.align === 'center' ? 'center' : 'start', {
      head: [
        instance(`${page.id}-progress`, 'progress-header', { step: page.numbered }, undefined, {
          back: [{ do: 'back' }],
        }),
      ],
      body: page.blocks.flatMap((b) => blockNodes(b, nav)),
      foot: [
        instance(
          `${page.id}-cta`,
          'button',
          { 종류: '주요', 글: page.cta?.trim() || '다음' },
          undefined,
          { press: [{ do: 'validate' }, ...nav] },
        ),
      ],
    }),
  }
}

/** 캠페인 화면 틀에 칸마다 노드를 넣는다 — 틀의 id 는 화면 id 를 앞에 붙인다. */
function templateFrame(
  screenId: string,
  justify: 'center' | 'start',
  slots: Partial<Record<'head' | 'body' | 'foot', ScreenNode[]>>,
): FrameNode {
  const frame = campaignFrame(justify)
  return {
    ...frame,
    id: `${screenId}-${frame.id}`,
    children: frame.children.map((c) =>
      c.kind === 'stack'
        ? {
            ...c,
            id: `${screenId}-${c.id}`,
            children: slots[c.id as 'head' | 'body' | 'foot'] ?? [],
          }
        : c,
    ),
  }
}

function wrap(screenId: string, node: ScreenNode): FrameNode {
  return {
    id: `${screenId}-frame`,
    kind: 'stack',
    dir: 'v',
    gap: 0,
    pad: [0, 0, 0, 0],
    justify: 'start',
    align: 'center',
    children: [node],
  }
}

function instance(
  id: string,
  key: string,
  props: InstanceNode['props'],
  bind?: string,
  on?: InstanceNode['on'],
  extra: Partial<InstanceNode> = {},
): InstanceNode {
  return {
    id,
    kind: 'instance',
    use: `campaign:${key}`,
    props,
    ...(bind !== undefined ? { bind } : {}),
    ...(on !== undefined ? { on } : {}),
    ...extra,
  }
}

const when = (b: { visibleWhen?: CampaignBlock['visibleWhen'] }) =>
  b.visibleWhen !== undefined ? { visibleWhen: b.visibleWhen } : {}

function blockNodes(block: CampaignBlock, nav: Action[]): ScreenNode[] {
  switch (block.type) {
    case 'heading':
      return [
        {
          id: block.id,
          kind: 'text',
          text: block.lines.join('\n'),
          font:
            block.size === 'lg'
              ? { size: 26, weight: 700, lineHeight: 36 }
              : { size: 22, weight: 700, lineHeight: 32 },
          color: 'campaign/ink',
          align: 'center',
          ...when(block),
        },
      ]
    case 'text':
      return [
        {
          id: block.id,
          kind: 'text',
          text: block.lines.join('\n'),
          font: { size: 18, weight: 400, lineHeight: 32 },
          color: block.tone === 'subtle' ? 'campaign/ink-sub' : 'campaign/ink',
          align: 'center',
          emphasis: true,
          ...when(block),
        },
      ]
    case 'image':
      return [
        {
          id: block.id,
          kind: 'image',
          src: block.image.src,
          alt: block.image.alt,
          width: block.image.width,
          height: block.image.height,
          ...when(block),
        },
      ]
    case 'chip':
      return [instance(block.id, 'chip', { 글: block.text }, undefined, undefined, when(block))]
    case 'facts':
      return [
        {
          id: block.id,
          kind: 'stack',
          name: '사실 표',
          dir: 'v',
          gap: 12,
          pad: [20, 20, 20, 20],
          justify: 'start',
          align: 'start',
          fill: 'campaign/surface',
          radius: 16,
          stretch: true,
          ...when(block),
          children: block.rows.map(([k, v], i) =>
            instance(`${block.id}-${String(i + 1)}`, 'fact-row', { 이름: k, 값: v }),
          ),
        },
      ]
    case 'question':
      return [questionInstance(block.id, block.question, when(block))]
    case 'button': {
      const on: Action[] =
        block.action.kind === 'link'
          ? [{ do: 'open', href: block.action.href }]
          : block.action.kind === 'goto'
            ? [{ do: 'go', to: block.action.page, mode: 'push' }]
            : nav
      return [
        instance(
          block.id,
          'button',
          { 종류: '보조', 글: block.label },
          undefined,
          { press: on },
          when(block),
        ),
      ]
    }
  }
}

function questionInstance(
  id: string,
  q: DocumentQuestion,
  extra: Partial<InstanceNode>,
): InstanceNode {
  const hide: Record<string, boolean> = q.hideLabel ? { '물음 숨기기': true } : {}
  switch (q.kind) {
    case 'choice':
      return instance(
        id,
        'question-choice',
        { 배치: q.layout === 'stack' ? '목록' : '큰칸', ...hide },
        q.key,
        undefined,
        extra,
      )
    case 'multi':
      return instance(id, 'question-multi', { ...hide }, q.key, undefined, extra)
    case 'text':
      return instance(
        id,
        'question-input',
        { 종류: q.multiline ? '여러 줄' : '글', 안내: q.placeholder, ...hide },
        q.key,
        undefined,
        extra,
      )
    case 'number':
      return instance(
        id,
        'question-input',
        { 종류: '수', 안내: q.placeholder, ...hide },
        q.key,
        undefined,
        extra,
      )
    case 'premium':
      return instance(id, 'question-premium', { ...hide }, q.key, undefined, extra)
  }
}

type QuestionBlock = Extract<CampaignBlock, { type: 'question' }>

function layoutNode(
  node: LayoutNode,
  nav: Action[],
  questions: ReadonlyMap<string, QuestionBlock>,
): ScreenNode {
  const place = {
    id: node.id,
    name: node.name,
    ...(node.grow !== undefined ? { grow: node.grow } : {}),
    ...(node.stretch !== undefined ? { stretch: node.stretch } : {}),
  }
  switch (node.kind) {
    case 'stack': {
      const { children, ...rest } = node
      return { ...rest, children: children.map((c) => layoutNode(c, nav, questions)) }
    }
    case 'text':
    case 'image':
    case 'unknown':
      return { ...node }
    case 'part':
      switch (node.part) {
        case 'progress-header':
          return instance(
            node.id,
            'progress-header',
            { step: node.step },
            undefined,
            { back: [{ do: 'back' }] },
            place,
          )
        case 'button':
          return instance(
            node.id,
            'button',
            {
              종류:
                node.variant === 'primary'
                  ? '주요'
                  : node.variant === 'secondary'
                    ? '보조'
                    : '글자',
              글: node.label,
            },
            undefined,
            { press: [{ do: 'validate' }, ...nav] },
            place,
          )
        case 'chip':
          return instance(node.id, 'chip', { 글: node.text }, undefined, undefined, place)
        case 'fact-row':
          return instance(
            node.id,
            'fact-row',
            { 이름: node.label, 값: node.value },
            undefined,
            undefined,
            place,
          )
        case 'question': {
          const block = questions.get(node.qid)
          const variant: Record<string, string> =
            node.component === 'question-choice'
              ? { 배치: node.variant === 'list' ? '목록' : '큰칸' }
              : node.component === 'question-input'
                ? {
                    종류:
                      node.variant === 'multiline'
                        ? '여러 줄'
                        : node.variant === 'number'
                          ? '수'
                          : '글',
                    ...(node.placeholder !== undefined ? { 안내: node.placeholder } : {}),
                  }
                : {}
          const hide: Record<string, boolean> = block?.question.hideLabel
            ? { '물음 숨기기': true }
            : {}
          return instance(node.id, node.component, { ...variant, ...hide }, node.qid, undefined, {
            ...place,
            ...(block?.visibleWhen !== undefined ? { visibleWhen: block.visibleWhen } : {}),
          })
        }
      }
  }
}
