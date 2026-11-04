import { defineTheme, definePack } from '../assets'

/**
 * Workstyle 팩 — canvas(Seed Studio 라이브러리 `seed-studio`)의 부품을 같은 이름 · 같은 속성으로 옮긴 정의.
 * 그리는 것은 뷰 쪽 Workstyle 킷(@oobleck/workstyle/react)이고, 이 파일은 정의만 갖는다.
 * 속성 이름 · 선택지는 Seed 컴포넌트 속성과 Workstyle React props 가 같게 맞춘다(kind · size · state · tone …).
 */
export const workstyleTheme = defineTheme({
  id: 'workstyle',
  name: 'Workstyle',
  // 색 토큰 판 eb12e334(다크 하나) — @oobleck/workstyle colors.css 와 같은 값.
  colors: {
    n0: '#0e0f12',
    n1: '#1e1f22',
    n2: '#27292c',
    n3: '#323437',
    n4: '#3f4144',
    line: '#2f3033',
    ink1: '#e8e9ec',
    ink2: '#b4b6ba',
    ink3: '#96989d',
    acc: '#63a0f1',
    'acc-fill': '#3270cf',
    'acc-soft': '#28313f',
    'on-acc': '#ffffff',
    ok: '#62cd94',
    warn: '#ebb75b',
    bad: '#f27a6d',
  },
  // ds.css 글자 스타일.
  textStyles: {
    h1: { size: 30, weight: 700, lineHeight: 38 },
    heading: { size: 24, weight: 680, lineHeight: 32 },
    display: { size: 20, weight: 650, lineHeight: 28 },
    h4: { size: 16, weight: 620, lineHeight: 24 },
    title: { size: 14, weight: 600, lineHeight: 20 },
    doc: { size: 13, weight: 400, lineHeight: 20 },
    label: { size: 11, weight: 560, lineHeight: 16 },
    small: { size: 11, weight: 450, lineHeight: 16 },
  },
  defaults: { ink: 'ink1', textStyle: 'doc' },
})

const SIZE = ['sm', 'md', 'lg'] as const

export const workstylePack = definePack({
  id: 'workstyle',
  name: '기본 · Workstyle',
  seedLibrary: 'seed-studio',
  theme: workstyleTheme,
  surfaces: [
    { kind: 'surface', id: 'screen', name: '화면', fill: 'n1' },
    { kind: 'surface', id: 'sunken', name: '깊은 바탕', fill: 'n0' },
    { kind: 'surface', id: 'raised', name: '떠 있는 바탕', fill: 'n2' },
  ],
  components: [
    {
      kind: 'component',
      key: 'button',
      name: 'Button',
      group: '행동',
      props: [
        {
          type: 'VARIANT',
          name: 'kind',
          options: ['ghost', 'secondary', 'primary', 'danger'],
          default: 'primary',
        },
        { type: 'VARIANT', name: 'size', options: SIZE, default: 'md' },
        { type: 'VARIANT', name: 'state', options: ['default', 'disabled'], default: 'default' },
        { type: 'TEXT', name: 'label', default: '확인' },
        { type: 'INSTANCE_SWAP', name: 'icon', default: null },
      ],
      events: ['press'],
    },
    {
      kind: 'component',
      key: 'field',
      name: 'Field',
      group: '입력',
      props: [
        { type: 'VARIANT', name: 'size', options: ['md', 'lg'], default: 'md' },
        { type: 'TEXT', name: 'placeholder', default: '' },
        { type: 'INSTANCE_SWAP', name: 'icon', default: null },
      ],
      value: 'text',
    },
    {
      kind: 'component',
      key: 'segment',
      name: 'Segment',
      group: '입력',
      props: [{ type: 'VARIANT', name: 'size', options: ['sm', 'md'], default: 'md' }],
      value: 'choice',
    },
    {
      kind: 'component',
      key: 'checkbox',
      name: 'Checkbox',
      group: '입력',
      props: [{ type: 'TEXT', name: 'label', default: '' }],
      value: 'boolean',
    },
    {
      kind: 'component',
      key: 'switch',
      name: 'Switch',
      group: '입력',
      props: [{ type: 'TEXT', name: 'label', default: '' }],
      value: 'boolean',
    },
    {
      kind: 'component',
      key: 'stepper',
      name: 'Stepper',
      group: '입력',
      props: [{ type: 'TEXT', name: 'unit', default: '' }],
      value: 'number',
    },
    {
      kind: 'component',
      key: 'badge',
      name: 'Badge',
      group: '안내',
      props: [
        {
          type: 'VARIANT',
          name: 'tone',
          options: ['default', 'acc', 'prop', 'ok', 'warn', 'bad'],
          default: 'default',
        },
        { type: 'TEXT', name: 'label', default: '' },
      ],
    },
    {
      kind: 'component',
      key: 'status',
      name: 'Status',
      group: '안내',
      props: [
        { type: 'VARIANT', name: 'tone', options: ['ok', 'warn', 'bad', 'default'], default: 'ok' },
        { type: 'TEXT', name: 'label', default: '' },
      ],
    },
    {
      kind: 'component',
      key: 'tab',
      name: 'Tab',
      group: '이동',
      props: [
        { type: 'TEXT', name: 'label', default: '' },
        { type: 'INSTANCE_SWAP', name: 'icon', default: null },
      ],
      value: 'choice',
    },
  ],
})
