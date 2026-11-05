import {
  componentOf,
  emphasisParts,
  evaluateCondition,
  propOf,
  resolveColor,
  resolveFont,
  scopeOf,
  splitRef,
} from '@oobleck/pages'

import { placementStyle, vspace } from './layout'

import type {
  ActionList,
  AssetPack,
  ComponentAsset,
  ExprScope,
  Field,
  ImageNode,
  InstanceNode,
  PropValue,
  Screen,
  ScreenDocument,
  ScreenNode,
  SurfaceAsset,
  UnknownNode,
} from '@oobleck/pages'
import type { PickProps } from './kit'
import type { ComponentType, CSSProperties, ReactNode } from 'react'

/**
 * 화면 뷰 v2 — 화면 문서(v2)의 한 화면을 그린다. 틀(stack)과 글은 뷰 본체가, 부품 인스턴스 · 그림 · 고르기 테두리는 킷이 그린다.
 *
 * 부품은 값 · 일만 안다: 묶인 필드의 값을 읽고 바꾸며(`setValue`), 일을 일으킨다(`fire`). 일에 걸린 동작 체인을 어떻게
 * 할지(검증 · 저장 · 넘기기)는 런타임([ScreenRuntime.onEvent])이 정한다.
 */

/** 킷이 받는 부품 하나. */
export type InstanceProps<C> = {
  node: InstanceNode
  component: ComponentAsset
  /** 정의 기본값을 채운 속성 — 값 연결을 싣는 속성(bindProp)은 뺐다. */
  props: Readonly<Record<string, PropValue>>
  /** 묶인 필드(값을 받는 부품만). */
  field?: Field | undefined
  value: unknown
  setValue: (value: unknown) => void
  /** 일을 일으킨다 — 걸린 동작이 없으면 아무 일도 없다. */
  fire: (event: string) => void
  readOnly: boolean
  ctx: C
  style: CSSProperties
}

export type ScreenKit<C> = {
  /** 이 킷이 그리는 팩 — 부품 참조의 팩 id 로 킷을 고른다. */
  pack: AssetPack
  /** 부품 키 → 그리는 부품. */
  components: Readonly<Record<string, ComponentType<InstanceProps<C>>>>
  Pick: ComponentType<PickProps<C>>
  Image: ComponentType<{ node: ImageNode; ctx: C; style: CSSProperties }>
  Unknown?: ComponentType<{ node: UnknownNode; ctx: C; style: CSSProperties }> | undefined
  /** 킷에 없는 부품. 없으면 그리지 않는다. */
  Missing?: ComponentType<{ node: InstanceNode; ctx: C; style: CSSProperties }> | undefined
}

export function defineScreenKit<C>(kit: ScreenKit<C>): ScreenKit<C> {
  return kit
}

/** 화면을 움직이는 쪽 — 답 · 호스트 변수 · 일 받기. */
export type ScreenRuntime = {
  doc: ScreenDocument
  answers: Readonly<Record<string, unknown>>
  onAnswer: (key: string, value: unknown) => void
  /** 부품이 일으킨 일과 걸린 체인 — 체인이 없으면 부르지 않는다. */
  onEvent: (node: InstanceNode, event: string, actions: ActionList) => void
  host?: Readonly<Record<string, unknown>> | undefined
  readOnly?: boolean | undefined
  /** 편집 중이면 숨은 노드도 흐리게 그린다. */
  editing?: boolean | undefined
}

/** 고르기 id 앞머리 — 그 뒤는 v2 노드 id. */
export const NODE_SELECTION = 'node:'

type Env<C> = {
  kits: readonly ScreenKit<C>[]
  /** 글 · 바탕을 그리는 테마의 킷(문서의 첫 팩). */
  base: ScreenKit<C>
  runtime: ScreenRuntime
  fields: ReadonlyMap<string, Field>
  scope: ExprScope
  ctx: C
  /** 세로 간격 — 낮은 화면에서 줄이나(fit) 그대로인가. */
  space: (n: number) => string
  /** 화면 바탕 — 붙어 있는 틀(pin)이 아래 글을 가린다. */
  surface: string | undefined
}

function shown(node: ScreenNode, scope: ExprScope): boolean {
  if (node.visibleWhen === undefined) return true
  try {
    return evaluateCondition(node.visibleWhen, scope)
  } catch {
    return false
  }
}

const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' }
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end' }

function NodeView<C>({
  node,
  env,
  parentDir,
}: {
  node: ScreenNode
  env: Env<C>
  parentDir: 'v' | 'h'
}): ReactNode {
  const visible = shown(node, env.scope)
  if (!visible && !env.runtime.editing) return null
  const theme = env.base.pack.theme
  const place = placementStyle(node, parentDir)
  const { Pick } = env.base
  const pick = (children: ReactNode, style: CSSProperties = place) => (
    <Pick ctx={env.ctx} id={`${NODE_SELECTION}${node.id}`} style={style} hidden={!visible}>
      {children}
    </Pick>
  )
  switch (node.kind) {
    case 'stack': {
      const pad = node.pad.map((p, i) => (i % 2 === 0 ? env.space(p) : `${String(p)}px`))
      // 아래에 붙은 틀은 홈 막대(safe area)만큼 더 띄운다.
      if (node.pin === 'bottom') pad[2] = `max(${pad[2] ?? '0px'}, env(safe-area-inset-bottom))`
      return (
        <div
          data-node={node.id}
          style={{
            ...place,
            ...(node.pin
              ? {
                  position: 'sticky',
                  [node.pin]: 0,
                  zIndex: 10,
                  background: resolveColor(theme, node.fill) ?? env.surface,
                }
              : {}),
            display: 'flex',
            flexDirection: node.dir === 'v' ? 'column' : 'row',
            gap: node.dir === 'v' ? env.space(node.gap) : node.gap,
            padding: pad.join(' '),
            justifyContent: JUSTIFY[node.justify],
            alignItems: ALIGN[node.align],
            ...(node.pin ? {} : { background: resolveColor(theme, node.fill) }),
            borderRadius: node.radius,
            minWidth: 0,
            opacity: visible ? undefined : 0.4,
          }}
        >
          {node.children.map((c) => (
            <NodeView key={c.id} node={c} env={env} parentDir={node.dir} />
          ))}
        </div>
      )
    }
    case 'text': {
      const f = resolveFont(theme, node.style, node.font)
      const accent = resolveColor(theme, theme.defaults.accent)
      return pick(
        <p
          style={{
            fontSize: f.size,
            fontWeight: f.weight,
            lineHeight: `${String(f.lineHeight)}px`,
            ...(f.tracking ? { letterSpacing: `${String(f.tracking)}em` } : {}),
            color: resolveColor(theme, node.color) ?? resolveColor(theme, theme.defaults.ink),
            textAlign: node.align,
            whiteSpace: 'pre-line',
            wordBreak: 'keep-all',
            overflowWrap: 'anywhere',
            margin: 0,
          }}
        >
          {node.emphasis
            ? emphasisParts(node.text).map((part, i) =>
                part.strong ? (
                  <strong key={i} style={{ fontWeight: 700, color: accent }}>
                    {part.text}
                  </strong>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )
            : node.text}
        </p>,
      )
    }
    case 'image': {
      const { Image } = env.base
      return pick(<Image node={node} ctx={env.ctx} style={{}} />)
    }
    case 'unknown': {
      const Unknown = env.base.Unknown
      return Unknown ? pick(<Unknown node={node} ctx={env.ctx} style={{}} />) : null
    }
    case 'instance':
      return pick(<InstanceView node={node} env={env} />)
  }
}

function InstanceView<C>({ node, env }: { node: InstanceNode; env: Env<C> }): ReactNode {
  const { pack, key } = splitRef(node.use)
  const kit = env.kits.find((k) => k.pack.id === pack)
  const component = kit ? componentOf([kit.pack], node) : undefined
  const Part = kit && component ? kit.components[key] : undefined
  if (!kit || !component || !Part) {
    const Missing = (kit ?? env.base).Missing
    return Missing ? <Missing node={node} ctx={env.ctx} style={{}} /> : null
  }
  const props = Object.fromEntries(
    component.props
      .filter((p) => p.name !== component.bindProp)
      .map((p) => [p.name, propOf(component, node, p.name) ?? p.default]),
  )
  const field = node.bind !== undefined ? env.fields.get(node.bind) : undefined
  const { runtime } = env
  return (
    <Part
      node={node}
      component={component}
      props={props}
      field={field}
      value={field ? runtime.answers[field.key] : undefined}
      setValue={(v) => {
        if (field && !runtime.readOnly) runtime.onAnswer(field.key, v)
      }}
      fire={(event) => {
        const actions = node.on?.[event]
        if (actions?.length) runtime.onEvent(node, event, actions)
      }}
      readOnly={runtime.readOnly ?? false}
      ctx={env.ctx}
      style={{}}
    />
  )
}

/** 화면 바탕 — 최외곽 틀에 건 색 > 화면의 바탕 에셋 > 팩의 화면 바탕. */
export function screenSurface<C>(kit: ScreenKit<C>, screen: Screen): string | undefined {
  const theme = kit.pack.theme
  const asset: SurfaceAsset | undefined =
    kit.pack.surfaces.find((s) => s.id === screen.surface) ??
    kit.pack.surfaces.find((s) => s.id === 'screen')
  return resolveColor(theme, screen.frame.fill) ?? resolveColor(theme, asset?.fill)
}

/**
 * 한 화면 — [kits] 가운데 문서 첫 팩의 킷이 글 · 바탕 테마를 정하고, 부품은 참조한 팩의 킷이 그린다.
 */
export function ScreenView<C>({
  screen,
  kits,
  runtime,
  ctx,
  className,
  fit = true,
}: {
  screen: Screen
  kits: readonly ScreenKit<C>[]
  runtime: ScreenRuntime
  ctx: C
  className?: string | undefined
  /** 낮은 화면에서 세로 간격을 높이에 비례해 줄인다(시안 장). 끄면 적은 px 그대로. 기본 참. */
  fit?: boolean | undefined
}): ReactNode {
  const base = kits.find((k) => k.pack.id === runtime.doc.packs[0]) ?? kits[0]
  if (!base) return null
  const env: Env<C> = {
    kits,
    base,
    runtime,
    fields: new Map(runtime.doc.fields.map((f) => [f.key, f])),
    scope: scopeOf(runtime.doc, { ...runtime.answers }, { ...(runtime.host ?? {}) }),
    ctx,
    space: fit ? vspace : (n) => `${String(n)}px`,
    surface: screenSurface(base, screen),
  }
  return (
    <div
      className={className}
      data-screen={screen.id}
      style={{ display: 'flex', flexDirection: 'column', background: env.surface }}
    >
      <NodeView node={{ ...screen.frame, grow: true }} env={env} parentDir="v" />
    </div>
  )
}
