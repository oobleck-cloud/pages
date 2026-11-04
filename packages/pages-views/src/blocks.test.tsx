import { answerIsCondition } from '@oobleck/pages'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BlockList, defineBlockKit } from './blocks'

import type { BlockListContext } from './blocks'
import type { CampaignBlock } from '@oobleck/pages'

const label = (name: string) => (p: { block: CampaignBlock }) => <i>{`${name}:${p.block.id}`}</i>

const kit = defineBlockKit<BlockListContext>({
  blocks: {
    heading: label('h'),
    text: label('t'),
    image: label('img'),
    chip: label('chip'),
    facts: label('facts'),
    question: label('q'),
    button: label('btn'),
  },
  List: ({ align, children }) => <main data-align={align}>{children}</main>,
  Frame: ({ block, hidden, children }) => (
    <b data-id={block.id} data-hidden={String(hidden)}>
      {children}
    </b>
  ),
  Empty: () => <em>빈 장</em>,
})

const blocks: CampaignBlock[] = [
  { id: 'a', type: 'heading', lines: ['x'], size: 'lg' },
  {
    id: 'b',
    type: 'text',
    lines: ['y'],
    tone: 'subtle',
    visibleWhen: answerIsCondition({ kind: 'choice', key: 'go' } as never, 'yes'),
  } as CampaignBlock,
]

describe('BlockList', () => {
  it('조건에 맞지 않는 블록은 공개 화면에서 뺀다', () => {
    const html = renderToStaticMarkup(
      <BlockList blocks={blocks} kit={kit} ctx={{ answers: {} }} align="top" />,
    )
    expect(html).toBe('<main data-align="top"><i>h:a</i></main>')
  })

  it('편집 중이면 숨은 블록도 킷의 상자에 hidden 으로 넘긴다', () => {
    const editing = { selected: null, onSelect: () => {} }
    const html = renderToStaticMarkup(
      <BlockList blocks={blocks} kit={kit} ctx={{ answers: {}, editing }} align="center" />,
    )
    expect(html).toContain('<b data-id="a" data-hidden="false"><i>h:a</i></b>')
    expect(html).toContain('<b data-id="b" data-hidden="true"><i>t:b</i></b>')
    expect(
      renderToStaticMarkup(
        <BlockList blocks={[]} kit={kit} ctx={{ answers: {}, editing }} align="top" />,
      ),
    ).toContain('<em>빈 장</em>')
  })
})
