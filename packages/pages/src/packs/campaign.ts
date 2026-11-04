import { definePack, defineTheme } from '../assets'
import { isPremiumAnswer } from '../campaign-form'
import { CAMPAIGN_COLORS, CAMPAIGN_TEXT_STYLES } from '../campaign-layout'

import type { ScreenTemplate, ValueType } from '../assets'
import type { FrameNode } from '../v2/screen'

/**
 * 캠페인 팩 — 캠페인 디자인 시스템(Seed `campaign-ds`)의 정의. 그리는 것은 MVOS 쪽 캠페인 킷(MVOS 디자인 구현)이다.
 *
 * v1 문서(이미 나간 파트너 설문)는 이 테마의 토큰 이름(`campaign/…`)을 그대로 쓰므로, 값 · 이름을 바꾸지 않는다.
 * 부품 키는 v1 레이아웃 트리의 `part` 값과 같다.
 */
export const campaignTheme = defineTheme({
  id: 'campaign',
  name: '캠페인 디자인 시스템',
  colors: CAMPAIGN_COLORS,
  textStyles: CAMPAIGN_TEXT_STYLES,
  defaults: { ink: 'campaign/ink', textStyle: 'campaign/body' },
})

const won = new Intl.NumberFormat('ko-KR')

/** 보험료 — 월 · 연 + 원, 또는 「잘 몰라요」. v1 `premium` 문항과 같은 규칙(이미 쌓인 답이 그대로 읽힌다). */
export const premiumValue: ValueType = {
  id: 'premium',
  name: '보험료',
  accepts: ['premium'],
  isAnswered: (_f, v) => isPremiumAnswer(v) && (v.unknown || (v.amount !== null && v.amount > 0)),
  format: (_f, v) => {
    if (!isPremiumAnswer(v) || !(v.unknown || (v.amount !== null && v.amount > 0))) return ''
    if (v.unknown || v.amount === null) return '잘 몰라요'
    return `${v.unit === 'month' ? '월' : '연'} ${won.format(v.amount)}원`
  },
  keep: isPremiumAnswer,
}

/**
 * 캠페인 화면 틀 — v1 블록 장과 같은 꼴: 머리(← · 질문 n / 전체) · 본문(가운데 · 위) · 아래(다음 · 보내기).
 * 빌더는 칸(head · body · foot)에 부품을 놓기만 한다.
 */
export function campaignFrame(justify: 'center' | 'start'): FrameNode {
  const stack = (
    id: string,
    over: Partial<FrameNode> & Pick<FrameNode, 'children'>,
  ): FrameNode => ({
    id,
    kind: 'stack',
    dir: 'v',
    gap: 0,
    pad: [0, 0, 0, 0],
    justify: 'start',
    align: 'center',
    ...over,
  })
  return stack('frame', {
    name: '화면',
    slot: false,
    children: [
      stack('head', { name: '머리', gap: 12, pad: [12, 20, 8, 20], children: [] }),
      stack('body', {
        name: '본문',
        gap: 24,
        pad: [32, 20, 32, 20],
        justify,
        grow: true,
        children: [],
      }),
      stack('foot', { name: '아래', gap: 12, pad: [12, 20, 20, 20], children: [] }),
    ],
  })
}

export const campaignTemplates: readonly ScreenTemplate[] = [
  { id: 'center', name: '가운데 모으기', frame: campaignFrame('center') },
  { id: 'top', name: '위에서부터', frame: campaignFrame('start') },
]

export const campaignPack = definePack({
  id: 'campaign',
  name: '캠페인 디자인 시스템',
  seedLibrary: 'campaign-ds',
  theme: campaignTheme,
  valueTypes: [premiumValue],
  templates: campaignTemplates,
  surfaces: [
    { kind: 'surface', id: 'screen', name: '화면', fill: 'campaign/bg' },
    { kind: 'surface', id: 'soft', name: '옅은 바탕', fill: 'campaign/surface-soft' },
  ],
  components: [
    {
      kind: 'component',
      key: 'progress-header',
      name: '진행 머리',
      group: '기본',
      props: [{ type: 'BOOLEAN', name: 'step', default: true }],
      events: ['back'],
    },
    {
      kind: 'component',
      key: 'question-choice',
      name: '하나 고르기',
      group: '문항',
      props: [
        { type: 'VARIANT', name: '배치', options: ['큰칸', '목록'], default: '큰칸' },
        { type: 'TEXT', name: '질문 ID', default: '' },
        { type: 'BOOLEAN', name: '물음 숨기기', default: false },
      ],
      value: 'choice',
      bindProp: '질문 ID',
    },
    {
      kind: 'component',
      key: 'question-multi',
      name: '여럿 고르기',
      group: '문항',
      props: [
        { type: 'TEXT', name: '질문 ID', default: '' },
        { type: 'BOOLEAN', name: '물음 숨기기', default: false },
      ],
      value: 'choices',
      bindProp: '질문 ID',
    },
    {
      kind: 'component',
      key: 'question-input',
      name: '입력',
      group: '문항',
      props: [
        { type: 'VARIANT', name: '종류', options: ['글', '여러 줄', '수'], default: '글' },
        { type: 'TEXT', name: '질문 ID', default: '' },
        { type: 'TEXT', name: '안내', default: '' },
        { type: 'BOOLEAN', name: '물음 숨기기', default: false },
      ],
      value: 'text',
      bindProp: '질문 ID',
    },
    {
      kind: 'component',
      key: 'question-premium',
      name: '보험료',
      group: '문항',
      props: [
        { type: 'TEXT', name: '질문 ID', default: '' },
        { type: 'BOOLEAN', name: '물음 숨기기', default: false },
      ],
      value: 'premium',
      bindProp: '질문 ID',
    },
    {
      kind: 'component',
      key: 'button',
      name: '버튼',
      group: '안내 · 행동',
      props: [
        { type: 'VARIANT', name: '종류', options: ['주요', '보조', '글자'], default: '주요' },
        { type: 'TEXT', name: '글', default: '다음' },
      ],
      events: ['press'],
    },
    {
      kind: 'component',
      key: 'chip',
      name: '칩',
      group: '안내 · 행동',
      props: [{ type: 'TEXT', name: '글', default: '' }],
    },
    {
      kind: 'component',
      key: 'fact-row',
      name: '사실 줄',
      group: '안내 · 행동',
      props: [
        { type: 'TEXT', name: '이름', default: '' },
        { type: 'TEXT', name: '값', default: '' },
      ],
    },
  ],
})
