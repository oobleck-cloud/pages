import { definePack, defineTheme } from '../assets'
import { CAMPAIGN_COLORS, CAMPAIGN_TEXT_STYLES } from '../campaign-layout'

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

export const campaignPack = definePack({
  id: 'campaign',
  name: '캠페인 디자인 시스템',
  seedLibrary: 'campaign-ds',
  theme: campaignTheme,
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
      ],
      value: 'choice',
    },
    {
      kind: 'component',
      key: 'question-multi',
      name: '여럿 고르기',
      group: '문항',
      props: [{ type: 'TEXT', name: '질문 ID', default: '' }],
      value: 'choices',
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
      ],
      value: 'text',
    },
    {
      kind: 'component',
      key: 'question-premium',
      name: '보험료',
      group: '문항',
      props: [{ type: 'TEXT', name: '질문 ID', default: '' }],
      value: 'number',
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
