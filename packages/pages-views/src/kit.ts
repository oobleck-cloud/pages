import type { AssetPack, LayoutImage, LayoutPart, LayoutUnknown } from '@oobleck/pages'
import type { ComponentType, CSSProperties, ReactNode } from 'react'

/**
 * 킷 — 뷰가 디자인 구현에 맡기는 자리. collection-views 의 kit 과 같은 생각이다: 뷰 본체는 레이아웃(스택 · 글 · 간격 · 바탕)만
 * 그리고, 부품 · 그림 · 고르기 테두리는 킷이 그린다.
 *
 * - Workstyle 킷: 제공하는 기본 구현(@oobleck/workstyle/react).
 * - 캠페인 킷: MVOS 디자인 구현 — 이미 나간 파트너 설문이 이것으로 그려진다.
 *
 * [C] 는 화면 상태(답 · 넘기기 · 편집 여부 …)이고 킷이 정한다. 뷰 본체는 건드리지 않고 넘기기만 한다.
 */
export type PartProps<C> = {
  node: LayoutPart
  ctx: C
  /** 부모 안 자리(늘이기 · 늘여 맞추기). 킷은 바깥 상자에 그대로 건다. */
  style: CSSProperties
}

export type PickProps<C> = {
  ctx: C
  /** 고르기 id — 편집기가 이 id 로 속성 패널을 연다. */
  id: string
  style: CSSProperties
  hidden?: boolean | undefined
  children: ReactNode
}

export type PagesKit<C> = {
  /** 이 킷이 그리는 팩 — 테마 · 바탕 · 부품 정의. */
  pack: AssetPack
  /** 부품 키 → 그리는 부품. 없는 키는 [Missing] 으로. */
  parts: Readonly<Record<string, ComponentType<PartProps<C>>>>
  /** 글 · 그림 · 부품을 감싸는 상자 — 편집 중이면 고르기 테두리, 아니면 감싸기만. */
  Pick: ComponentType<PickProps<C>>
  Image: ComponentType<{ node: LayoutImage; ctx: C; style: CSSProperties }>
  /** 옮기지 못한 레이어. 없으면 그리지 않는다. */
  Unknown?: ComponentType<{ node: LayoutUnknown; ctx: C; style: CSSProperties }> | undefined
  /** 킷에 없는 부품. 없으면 그리지 않는다. */
  Missing?: ComponentType<{ node: LayoutPart; ctx: C; style: CSSProperties }> | undefined
}

export function defineKit<C>(kit: PagesKit<C>): PagesKit<C> {
  return kit
}
