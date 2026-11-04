import { isBlockVisible } from '@oobleck/pages'

import type { BlockType, CampaignAnswers, CampaignBlock } from '@oobleck/pages'
import type { ComponentType, ReactNode } from 'react'

/**
 * 블록 장 — 블록(제목 · 본문 · 그림 · 문항 · 버튼 · 알약 · 사실 표)을 차례로 쌓는 장. 뷰 본체는 무엇을 보일지(조건 · 편집 중
 * 숨은 블록)와 차례만 정하고, 블록 하나하나와 차례 상자 · 고르기 테두리는 킷이 그린다 — 레이아웃 장의 [PagesKit] 과 같은 생각.
 */

export type BlockOf<T extends BlockType> = Extract<CampaignBlock, { type: T }>

export type BlockPartProps<T extends BlockType, C> = { block: BlockOf<T>; ctx: C }

/** 편집 미리보기 — 블록을 누르면 고르고, 고른 블록에 테두리를 두른다. 공개 화면에서는 없다. */
export type BlockEditing = {
  selected: string | null
  onSelect: (blockId: string) => void
}

/** 뷰 본체가 읽는 화면 상태 — 나머지는 킷의 것이다. */
export type BlockListContext = {
  answers: CampaignAnswers
  editing?: BlockEditing | undefined
}

export type BlockKit<C> = {
  /** 블록 종류 → 그리는 부품. 종류마다 하나씩 있어야 한다. */
  blocks: { readonly [T in BlockType]: ComponentType<BlockPartProps<T, C>> }
  /** 블록 차례 상자 — 장 정렬(가운데 · 위). */
  List: ComponentType<{ align: 'center' | 'top'; ctx: C; children: ReactNode }>
  /** 편집 중 블록 상자 — 고르기 · 테두리 · 조건으로 숨은 표시. 공개 화면에서는 쓰지 않는다. */
  Frame: ComponentType<{ block: CampaignBlock; ctx: C; hidden: boolean; children: ReactNode }>
  /** 편집 중 빈 장. 없으면 그리지 않는다. */
  Empty?: ComponentType<{ ctx: C }> | undefined
}

export function defineBlockKit<C>(kit: BlockKit<C>): BlockKit<C> {
  return kit
}

/** 블록 하나 — 종류에 맞는 킷 부품. */
export function BlockPart<C>({
  block,
  kit,
  ctx,
}: {
  block: CampaignBlock
  kit: BlockKit<C>
  ctx: C
}) {
  const Part = kit.blocks[block.type] as ComponentType<{ block: CampaignBlock; ctx: C }>
  return <Part block={block} ctx={ctx} />
}

/** 블록 차례 — 보이는 블록만(편집 중이면 숨은 것도 흐리게), 킷의 차례 상자에. */
export function BlockList<C extends BlockListContext>({
  blocks,
  kit,
  ctx,
  align,
}: {
  blocks: readonly CampaignBlock[]
  kit: BlockKit<C>
  ctx: C
  align: 'center' | 'top'
}) {
  const editing = ctx.editing
  const shown = blocks.filter((b) => editing || isBlockVisible(b, ctx.answers))
  const { List, Frame, Empty } = kit
  return (
    <List align={align} ctx={ctx}>
      {shown.map((b) =>
        editing ? (
          <Frame key={b.id} block={b} ctx={ctx} hidden={!isBlockVisible(b, ctx.answers)}>
            <BlockPart block={b} kit={kit} ctx={ctx} />
          </Frame>
        ) : (
          <BlockPart key={b.id} block={b} kit={kit} ctx={ctx} />
        ),
      )}
      {editing && !shown.length && Empty ? <Empty ctx={ctx} /> : null}
    </List>
  )
}
