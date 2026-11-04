import { blankDocument, type CampaignPage, type LayoutStack } from '@oobleck/pages'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BlockList, LayoutScreen } from '../index'

import { workstyleBlockKit, workstyleKit, type WorkstyleContext } from './index'

const page: CampaignPage = {
  ...blankDocument().pages[0]!,
  blocks: [
    { id: 'h', type: 'heading', lines: ['연락받을 곳'], size: 'lg' },
    {
      id: 'q',
      type: 'question',
      question: {
        key: 'go',
        kind: 'choice',
        label: '오시겠어요?',
        short: '참석',
        required: true,
        layout: 'row',
        options: [
          { value: 'yes', label: '네' },
          { value: 'no', label: '아니요' },
        ],
      },
    },
    { id: 'b', type: 'button', label: '다음', action: { kind: 'next' } },
  ],
}

const ctx: WorkstyleContext = {
  page,
  answers: { go: 'yes' },
  onAnswer: () => {},
}

const tree: LayoutStack = {
  id: 'root',
  name: '장',
  kind: 'stack',
  dir: 'v',
  gap: 16,
  pad: [20, 20, 20, 20],
  justify: 'start',
  align: 'start',
  children: [
    {
      id: 'pq',
      name: '문항',
      kind: 'part',
      part: 'question',
      qid: 'go',
      component: 'question-choice',
    },
    {
      id: 'pb',
      name: '버튼',
      kind: 'part',
      part: 'button',
      label: '다음',
      variant: 'primary',
    },
  ],
}

describe('Workstyle 킷 — pages 기본 디자인 구현', () => {
  it('블록 장을 Workstyle 부품으로 그린다', () => {
    const html = renderToStaticMarkup(
      <BlockList blocks={page.blocks} kit={workstyleBlockKit} ctx={ctx} align="top" />,
    )
    expect(html).toContain('연락받을 곳')
    expect(html).toMatch(/class="ws-btn ws-primary ws-lg"/)
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>네</)
  })

  it('레이아웃 장 — 바탕은 Workstyle screen(n1), 부품은 Workstyle', () => {
    const html = renderToStaticMarkup(
      <LayoutScreen root={tree} kit={workstyleKit} ctx={ctx} fit={false} />,
    )
    expect(html).toContain('background:#1e1f22')
    expect(html).toContain('오시겠어요?')
    expect(html).toMatch(/ws-btn ws-primary ws-lg/)
  })
})
