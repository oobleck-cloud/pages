import {
  emphasisParts,
  isBlockVisible,
  isPremiumAnswer,
  questionBlockOf,
  workstylePack,
} from '@oobleck/pages'
import { Badge, Button, Checkbox, Chip, Input } from '@oobleck/workstyle/react'

import { defineBlockKit } from '../blocks'
import { ink, Pick, Picture } from './shared'
import { defineKit } from '../kit'
import { SEED_SELECTION } from '../layout'

import type { BlockEditing, BlockPartProps } from '../blocks'
import type { PartProps, PickProps } from '../kit'
import type {
  BlockType,
  CampaignAnswers,
  CampaignBlock,
  CampaignImage,
  CampaignPage,
  DocumentQuestion,
  LayoutImage,
  PremiumAnswer,
} from '@oobleck/pages'
import type { CSSProperties, ReactNode } from 'react'

/**
 * Workstyle 킷 — pages 가 기본으로 주는 디자인 구현. 부품은 `@oobleck/workstyle/react` 이고, 색 · 글자는 workstylePack 의
 * 테마(Workstyle 다크 토큰)다. 앱은 `@oobleck/workstyle/react.css` 를 한 번 불러오고, 화면 바깥에 `ws-scope` 를 둔다.
 *
 * 레이아웃 장(workstyleKit)과 블록 장(workstyleBlockKit)이 같은 부품을 쓴다. 다른 디자인(예: MVOS 캠페인)은 같은 자리를
 * 제 부품으로 채운 킷을 만든다 — 뷰 본체와 헤드리스 문서는 그대로.
 */
export type WorkstyleContext = {
  page: CampaignPage
  answers: CampaignAnswers
  onAnswer: (key: string, value: unknown) => void
  readOnly?: boolean | undefined
  showMissing?: boolean | undefined
  onNext?: (() => void) | undefined
  onBack?: (() => void) | undefined
  onGoto?: ((pageId: string) => void) | undefined
  /** 「질문 n / 전체」 — 없으면 진행 머리에 번호를 쓰지 않는다. */
  number?: { n: number; total: number } | null | undefined
  editing?: BlockEditing | undefined
}

function ImagePart({
  node,
  style,
}: {
  node: LayoutImage
  ctx: WorkstyleContext
  style: CSSProperties
}) {
  return (
    <div style={style}>
      <Picture
        image={{
          src: node.src,
          alt: node.alt,
          width: node.width,
          height: node.height,
        }}
      />
    </div>
  )
}

// ── 문항 ────────────────────────────────────────────────────────────────

function Question({ q, ctx }: { q: DocumentQuestion; ctx: WorkstyleContext }) {
  const value = ctx.answers[q.key]
  const set = (v: unknown) => ctx.onAnswer(q.key, v)
  const readOnly = ctx.readOnly ?? false
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {q.hideLabel ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong style={{ color: ink(1), fontSize: 18, whiteSpace: 'pre-line' }}>{q.label}</strong>
          {q.hint ? <span style={{ color: ink(3) }}>{q.hint}</span> : null}
        </div>
      )}
      <Answer q={q} value={value} set={set} readOnly={readOnly} />
    </div>
  )
}

function Answer({
  q,
  value,
  set,
  readOnly,
}: {
  q: DocumentQuestion
  value: unknown
  set: (v: unknown) => void
  readOnly: boolean
}) {
  switch (q.kind) {
    case 'choice':
      return (
        <div
          role="radiogroup"
          aria-label={q.label}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
        >
          {q.options.map((o) => (
            <Chip
              key={o.value}
              role="radio"
              aria-checked={value === o.value}
              selected={value === o.value}
              disabled={readOnly}
              onClick={() => set(value === o.value ? undefined : o.value)}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      )
    case 'multi': {
      const picked = Array.isArray(value) ? (value as string[]) : []
      return (
        <div
          role="group"
          aria-label={q.label}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {q.options.map((o) => {
            const on = picked.includes(o.value)
            return (
              <Checkbox
                key={o.value}
                label={o.label}
                checked={on}
                disabled={readOnly}
                onCheckedChange={() => {
                  const next = on
                    ? picked.filter((v) => v !== o.value)
                    : o.value === q.exclusive
                      ? [o.value]
                      : [...picked.filter((v) => v !== q.exclusive), o.value]
                  set(next.length ? next : undefined)
                }}
              />
            )
          })}
        </div>
      )
    }
    case 'text':
      return (
        <Input
          size="lg"
          aria-label={q.label}
          placeholder={q.placeholder}
          value={typeof value === 'string' ? value : ''}
          readOnly={readOnly}
          onChange={(e) => set(e.target.value || undefined)}
        />
      )
    case 'number':
      return (
        <Input
          size="lg"
          inputMode="numeric"
          aria-label={q.label}
          placeholder={q.unit ? `${q.placeholder} (${q.unit})` : q.placeholder}
          value={typeof value === 'number' ? String(value) : ''}
          readOnly={readOnly}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^0-9]/g, ''))
            set(e.target.value === '' ? undefined : Math.min(n, q.max || n))
          }}
        />
      )
    case 'premium':
      return <Premium value={isPremiumAnswer(value) ? value : null} set={set} readOnly={readOnly} />
  }
}

function Premium({
  value,
  set,
  readOnly,
}: {
  value: PremiumAnswer | null
  set: (v: unknown) => void
  readOnly: boolean
}) {
  const v: PremiumAnswer = value ?? {
    unit: 'month',
    amount: null,
    unknown: false,
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['month', 'year'] as const).map((unit) => (
          <Chip
            key={unit}
            selected={v.unit === unit}
            disabled={readOnly}
            onClick={() => set({ ...v, unit })}
          >
            {unit === 'month' ? '월' : '연'}
          </Chip>
        ))}
      </div>
      <Input
        size="lg"
        inputMode="numeric"
        aria-label="금액(원)"
        placeholder="금액(원)"
        disabled={v.unknown}
        readOnly={readOnly}
        value={v.amount === null ? '' : String(v.amount)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, '')
          set({ ...v, amount: raw ? Number(raw) : null })
        }}
      />
      <Checkbox
        label="잘 몰라요"
        checked={v.unknown}
        disabled={readOnly}
        onCheckedChange={(unknown) => set({ ...v, unknown })}
      />
    </div>
  )
}

// ── 레이아웃 장 부품 ─────────────────────────────────────────────────────────

function ProgressHeaderPart({ node, ctx, style }: PartProps<WorkstyleContext>) {
  if (node.part !== 'progress-header') return null
  const n = ctx.number
  return (
    <div style={{ ...style, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {ctx.onBack ? (
          <Button size="sm" onClick={ctx.onBack} aria-label="이전">
            ←
          </Button>
        ) : null}
        {node.step && n ? (
          <span style={{ color: ink(2) }}>
            질문 {n.n} / {n.total}
          </span>
        ) : null}
      </div>
      {n ? (
        <div style={{ height: 4, borderRadius: 2, background: 'var(--n3)' }}>
          <div
            style={{
              width: `${String(Math.round((n.n / Math.max(n.total, 1)) * 100))}%`,
              height: '100%',
              borderRadius: 2,
              background: 'var(--acc)',
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

function QuestionPart({ node, ctx, style }: PartProps<WorkstyleContext>) {
  if (node.part !== 'question') return null
  const block = questionBlockOf(ctx.page, node.qid)
  if (!block) return null
  const hidden = !isBlockVisible(block, ctx.answers)
  if (hidden && !ctx.editing) return null
  return (
    <Pick ctx={ctx} id={block.id} style={style} hidden={hidden}>
      <Question q={block.question} ctx={ctx} />
    </Pick>
  )
}

const BUTTON_KIND = {
  primary: 'primary',
  secondary: 'secondary',
  text: 'ghost',
} as const

function ButtonPart({ node, ctx, style }: PartProps<WorkstyleContext>) {
  if (node.part !== 'button') return null
  return (
    <Pick ctx={ctx} id={`${SEED_SELECTION}${node.id}`} style={style}>
      <Button
        kind={BUTTON_KIND[node.variant]}
        size="lg"
        style={{ width: '100%' }}
        onClick={ctx.onNext}
      >
        {node.label}
      </Button>
    </Pick>
  )
}

function ChipPart({ node, ctx, style }: PartProps<WorkstyleContext>) {
  if (node.part !== 'chip') return null
  return (
    <Pick ctx={ctx} id={`${SEED_SELECTION}${node.id}`} style={style}>
      <Badge tone="acc">{node.text}</Badge>
    </Pick>
  )
}

function FactRowPart({ node, ctx, style }: PartProps<WorkstyleContext>) {
  if (node.part !== 'fact-row') return null
  return (
    <Pick ctx={ctx} id={`${SEED_SELECTION}${node.id}`} style={style}>
      <FactRow label={node.label} value={node.value} />
    </Pick>
  )
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ color: ink(3), minWidth: 72 }}>{label}</span>
      <strong style={{ color: ink(1) }}>{value}</strong>
    </div>
  )
}

/** 레이아웃 장 Workstyle 킷 — Seed 시안에서 옮긴 장을 Workstyle 부품으로 그린다. */
export const workstyleKit = defineKit<WorkstyleContext>({
  pack: workstylePack,
  parts: {
    'progress-header': ProgressHeaderPart,
    question: QuestionPart,
    button: ButtonPart,
    chip: ChipPart,
    'fact-row': FactRowPart,
  },
  Pick,
  Image: ImagePart,
})

// ── 블록 장 부품 ─────────────────────────────────────────────────────────────

type Part<T extends BlockType> = BlockPartProps<T, WorkstyleContext>

function Lines({ lines, strong }: { lines: string[]; strong?: boolean }): ReactNode {
  return lines.map((line, i) => (
    <span key={i} style={{ display: 'block', minHeight: line ? undefined : '1em' }}>
      {emphasisParts(line).map((p, j) =>
        p.strong || strong ? (
          <strong key={j} style={{ color: strong ? undefined : 'var(--acc)' }}>
            {p.text}
          </strong>
        ) : (
          p.text
        ),
      )}
    </span>
  ))
}

export const workstyleBlockKit = defineBlockKit<WorkstyleContext>({
  blocks: {
    heading: ({ block }: Part<'heading'>) => (
      <h1
        style={{
          margin: 0,
          color: ink(1),
          fontSize: block.size === 'lg' ? 26 : 22,
          textAlign: 'center',
        }}
      >
        <Lines lines={block.lines} strong />
      </h1>
    ),
    text: ({ block }: Part<'text'>) => (
      <p
        style={{
          margin: 0,
          color: ink(block.tone === 'subtle' ? 3 : 1),
          textAlign: 'center',
        }}
      >
        <Lines lines={block.lines} />
      </p>
    ),
    image: ({ block }: Part<'image'>) => <Picture image={block.image} />,
    chip: ({ block }: Part<'chip'>) => (
      <div style={{ textAlign: 'center' }}>
        <Badge tone="acc">{block.text}</Badge>
      </div>
    ),
    facts: ({ block }: Part<'facts'>) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {block.rows.map(([k, v], i) => (
          <FactRow key={i} label={k} value={v} />
        ))}
      </div>
    ),
    question: ({ block, ctx }: Part<'question'>) => <Question q={block.question} ctx={ctx} />,
    button: ({ block, ctx }: Part<'button'>) => {
      const { action } = block
      if (action.kind === 'link' && !ctx.editing)
        return (
          <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className="ws-btn ws-secondary ws-lg"
          >
            {block.label}
          </a>
        )
      return (
        <Button
          kind="primary"
          size="lg"
          style={{ width: '100%' }}
          onClick={() =>
            action.kind === 'goto'
              ? ctx.onGoto?.(action.page)
              : action.kind === 'next'
                ? ctx.onNext?.()
                : undefined
          }
        >
          {block.label}
        </Button>
      )
    },
  },
  List: ({ align, children }) => (
    <div
      style={{
        display: 'flex',
        flex: '1 1 0%',
        flexDirection: 'column',
        gap: 20,
        padding: '24px 0',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
      }}
    >
      {children}
    </div>
  ),
  Frame: ({
    block,
    ctx,
    hidden,
    children,
  }: {
    block: CampaignBlock
    ctx: WorkstyleContext
    hidden: boolean
    children: ReactNode
  }) => (
    <Pick ctx={ctx} id={block.id} style={{}} hidden={hidden}>
      {children}
    </Pick>
  ),
  Empty: () => (
    <p style={{ color: ink(3), textAlign: 'center' }}>빈 장이에요 · 블록을 넣어 주세요</p>
  ),
})

export { workstyleScreenKit } from './screen-kit'
export type { WorkstyleScreenContext } from './screen-kit'
