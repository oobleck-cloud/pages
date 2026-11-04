import {
  resolveColor,
  resolveFont,
  type LayoutNode,
  type LayoutStack,
  type SurfaceAsset,
} from '@oobleck/pages'
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'

import type { PagesKit } from './kit'

/** 시안을 그린 화면 높이(iPhone 14) — 이보다 낮은 화면에서는 세로 간격 · 그림이 높이에 비례해 준다(반까지). */
export const DESIGN_HEIGHT = 844

/** 세로 간격 n px — 키 큰 화면에서는 그대로, 낮은 화면에서는 높이에 비례(n/2 까지). */
export function vspace(n: number): string {
  if (!n) return '0px'
  return `clamp(${String(n / 2)}px, ${((n * 100) / DESIGN_HEIGHT).toFixed(3)}dvh, ${String(n)}px)`
}

export function placementStyle(
  node: { grow?: boolean | undefined; stretch?: boolean | undefined },
  parentDir: 'v' | 'h',
): CSSProperties {
  return {
    ...(node.grow ? { flex: '1 1 auto' } : { flex: '0 0 auto' }),
    ...(node.stretch ? { alignSelf: 'stretch' } : {}),
    ...(parentDir === 'h' && node.grow ? { minWidth: 0 } : {}),
  }
}

const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' }
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end' }

/**
 * 레이아웃 트리 한 노드 — 스택은 flex, 글은 테마 글자 스타일 · 색, 그림 · 부품 · 고르기 테두리는 킷.
 */
export function LayoutNodeView<C>({
  node,
  kit,
  ctx,
  parentDir,
}: {
  node: LayoutNode
  kit: PagesKit<C>
  ctx: C
  parentDir: 'v' | 'h'
}): ReactNode {
  const theme = kit.pack.theme
  const place = placementStyle(node, parentDir)
  switch (node.kind) {
    case 'stack':
      return (
        <div
          data-seed={node.id}
          style={{
            ...place,
            display: 'flex',
            flexDirection: node.dir === 'v' ? 'column' : 'row',
            gap: node.dir === 'v' ? vspace(node.gap) : node.gap,
            // 위 · 아래 여백은 화면 높이를 따라 준다(좌우는 그대로).
            padding: node.pad.map((p, i) => (i % 2 === 0 ? vspace(p) : `${String(p)}px`)).join(' '),
            justifyContent: JUSTIFY[node.justify],
            alignItems: ALIGN[node.align],
            background: resolveColor(theme, node.fill),
            borderRadius: node.radius,
            minWidth: 0,
          }}
        >
          {node.children.map((c) => (
            <LayoutNodeView key={c.id} node={c} kit={kit} ctx={ctx} parentDir={node.dir} />
          ))}
        </div>
      )
    case 'text': {
      const f = resolveFont(theme, node.style, node.font)
      const { Pick } = kit
      return (
        <Pick ctx={ctx} id={`${SEED_SELECTION}${node.id}`} style={place}>
          <p
            style={{
              fontSize: f.size,
              fontWeight: f.weight,
              lineHeight: `${String(f.lineHeight)}px`,
              color: resolveColor(theme, node.color) ?? resolveColor(theme, theme.defaults.ink),
              textAlign: node.align,
              whiteSpace: 'pre-line',
              wordBreak: 'keep-all',
              overflowWrap: 'anywhere',
              margin: 0,
            }}
          >
            {node.text}
          </p>
        </Pick>
      )
    }
    case 'image': {
      const { Image } = kit
      return <Image node={node} ctx={ctx} style={place} />
    }
    case 'unknown': {
      const Unknown = kit.Unknown
      return Unknown ? <Unknown node={node} ctx={ctx} style={place} /> : null
    }
    case 'part': {
      const Part = kit.parts[node.part]
      if (Part) return <Part node={node} ctx={ctx} style={place} />
      const Missing = kit.Missing
      return Missing ? <Missing node={node} ctx={ctx} style={place} /> : null
    }
  }
}

/** 레이아웃 장이 고르기에 넘기는 id 앞머리 — 그 뒤는 Seed 노드 id. */
export const SEED_SELECTION = 'seed:'

/** 화면 바탕 색 — 뿌리 스택에 건 색, 없으면 팩의 화면 바탕 에셋. */
export function screenFill<C>(
  kit: PagesKit<C>,
  root: LayoutStack,
  surface?: SurfaceAsset,
): string | undefined {
  const theme = kit.pack.theme
  const fallback = surface ?? kit.pack.surfaces.find((s) => s.id === 'screen')
  return resolveColor(theme, root.fill) ?? resolveColor(theme, fallback?.fill)
}

/**
 * 한 화면 — 바탕(에셋) 위에 레이아웃 트리. [fit] 이면 짧은 화면에서 스크롤 없이 들어가게 줄인다.
 */
export function LayoutScreen<C>({
  root,
  kit,
  ctx,
  fit,
  className,
  surface,
  top,
}: {
  root: LayoutStack
  kit: PagesKit<C>
  ctx: C
  fit: boolean
  className?: string | undefined
  surface?: SurfaceAsset | undefined
  /** 트리 위에 얹는 것(안내 줄 등). */
  top?: ReactNode
}): ReactNode {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  useFitToScreen(outer, inner, fit)
  return (
    <div ref={outer} className={className} style={{ background: screenFill(kit, root, surface) }}>
      <div ref={inner} style={{ display: 'flex', flex: '1 1 0%', flexDirection: 'column' }}>
        {top}
        <LayoutNodeView node={{ ...root, grow: true }} kit={kit} ctx={ctx} parentDir="v" />
      </div>
    </div>
  )
}

/** 화면에 다 들지 않으면 이만큼까지 줄여 맞춘다 — 더 줄면 글이 너무 작아져 차라리 스크롤한다. */
const MIN_FIT = 0.82

/**
 * 짧은 화면(작은 폰 · 주소창이 큰 인앱 브라우저)에서 장이 스크롤 없이 들어가게 — 세로 간격 · 그림이 먼저 줄고([vspace]),
 * 그래도 넘치면 장을 통째로 줄인다(`zoom`, [MIN_FIT] 까지). 답에 따라 칸이 생기고 없어지면 다시 잰다.
 */
export function useFitToScreen(
  outer: RefObject<HTMLDivElement | null>,
  inner: RefObject<HTMLDivElement | null>,
  on: boolean,
) {
  useLayoutEffect(() => {
    const box = outer.current
    const el = inner.current
    if (!on || !box || !el) return
    const fit = () => {
      el.style.zoom = ''
      const need = box.scrollHeight
      const have = window.innerHeight
      const z = need > have + 1 ? Math.max(MIN_FIT, have / need) : 1
      if (z < 1) el.style.zoom = z.toFixed(3)
    }
    fit()
    let frame = 0
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    }
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later)
    for (const c of Array.from(el.children)) ro?.observe(c)
    window.addEventListener('resize', later)
    return () => {
      cancelAnimationFrame(frame)
      ro?.disconnect()
      window.removeEventListener('resize', later)
      el.style.zoom = ''
    }
  }, [outer, inner, on])
}
