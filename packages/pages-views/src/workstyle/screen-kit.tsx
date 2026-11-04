import { workstylePack } from '@oobleck/pages'
import {
  Badge,
  Button,
  Checkbox,
  ICONS,
  Input,
  Segment,
  Status,
  Stepper,
  Switch,
  Tabs,
} from '@oobleck/workstyle/react'

import { defineScreenKit } from '../screen'
import { ink, Pick, Picture } from './shared'

import type { BlockEditing } from '../blocks'
import type { InstanceProps } from '../screen'
import type { PropValue } from '@oobleck/pages'
import type {
  BadgeTone,
  ButtonKind,
  ChoiceOption,
  IconName,
  StatusTone,
} from '@oobleck/workstyle/react'
import type { ReactNode } from 'react'

/**
 * Workstyle 화면 킷(v2) — workstylePack 의 부품을 `@oobleck/workstyle/react` 로 그린다. 속성 이름 · 선택지는 Seed Studio 부품과
 * 같으므로 받은 그대로 넘긴다. 고르는 부품(Segment · Tab)의 선택지는 묶인 필드의 선택지다.
 */
export type WorkstyleScreenContext = { editing?: BlockEditing | undefined }

type P = InstanceProps<WorkstyleScreenContext>

const str = (v: PropValue | undefined): string => (typeof v === 'string' ? v : '')

function icon(v: PropValue | undefined): IconName | undefined {
  return typeof v === 'string' && v in ICONS ? (v as IconName) : undefined
}

function options(p: P): ChoiceOption[] {
  return (p.field?.options ?? []).map((o) => ({ value: o.value, label: o.label }))
}

/** 묶인 필드의 물음 — 부품 위에 한 줄. 필드가 없으면 부품만. */
function Labeled({ p, children }: { p: P; children: ReactNode }): ReactNode {
  if (!p.field?.label) return children
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ color: ink(2), fontSize: 12, fontWeight: 560 }}>{p.field.label}</span>
      {children}
    </label>
  )
}

function ButtonPart(p: P) {
  const label = str(p.props['label'])
  return (
    <Button
      kind={str(p.props['kind']) as ButtonKind}
      size={str(p.props['size']) as 'sm' | 'md' | 'lg'}
      icon={icon(p.props['icon'])}
      disabled={p.props['state'] === 'disabled' || p.readOnly}
      onClick={() => p.fire('press')}
    >
      {label}
    </Button>
  )
}

function FieldPart(p: P) {
  const numeric = p.field?.type === 'number'
  const v = p.value
  return (
    <Labeled p={p}>
      <Input
        size={str(p.props['size']) as 'md' | 'lg'}
        placeholder={str(p.props['placeholder'])}
        inputMode={numeric ? 'numeric' : undefined}
        readOnly={p.readOnly}
        value={typeof v === 'string' || typeof v === 'number' ? String(v) : ''}
        onChange={(e) => {
          const raw = e.target.value
          if (!numeric) return p.setValue(raw)
          const n = Number(raw.replace(/[^\d.]/g, ''))
          p.setValue(raw.trim() === '' || !Number.isFinite(n) ? undefined : n)
        }}
      />
    </Labeled>
  )
}

function SegmentPart(p: P) {
  return (
    <Labeled p={p}>
      <Segment
        options={options(p)}
        value={typeof p.value === 'string' ? p.value : null}
        size={str(p.props['size']) as 'sm' | 'md'}
        label={p.field?.label}
        onValueChange={(v) => p.setValue(v)}
      />
    </Labeled>
  )
}

function CheckboxPart(p: P) {
  return (
    <Checkbox
      checked={p.value === true}
      label={str(p.props['label']) || p.field?.label}
      disabled={p.readOnly}
      onCheckedChange={(v) => p.setValue(v)}
    />
  )
}

function SwitchPart(p: P) {
  const label = str(p.props['label']) || p.field?.label || ''
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: ink(1) }}>
      <Switch
        checked={p.value === true}
        label={label}
        disabled={p.readOnly}
        onCheckedChange={(v) => p.setValue(v)}
      />
      {label}
    </label>
  )
}

function StepperPart(p: P) {
  return (
    <Labeled p={p}>
      <Stepper
        value={typeof p.value === 'number' ? p.value : null}
        min={0}
        {...(p.field?.max ? { max: p.field.max } : {})}
        unit={str(p.props['unit']) || p.field?.unit}
        label={p.field?.label}
        disabled={p.readOnly}
        onValueChange={(v) => p.setValue(v)}
      />
    </Labeled>
  )
}

function BadgePart(p: P) {
  return <Badge tone={str(p.props['tone']) as BadgeTone}>{str(p.props['label'])}</Badge>
}

function StatusPart(p: P) {
  return <Status tone={str(p.props['tone']) as StatusTone}>{str(p.props['label'])}</Status>
}

/** Tab — 묶인 고르기 필드의 선택지를 탭 줄로. 속성 label 은 줄 이름(보조기술)이다. */
function TabPart(p: P) {
  return (
    <Tabs
      items={options(p)}
      value={typeof p.value === 'string' ? p.value : null}
      label={str(p.props['label']) || p.field?.label}
      onValueChange={(v) => p.setValue(v)}
    />
  )
}

export const workstyleScreenKit = defineScreenKit<WorkstyleScreenContext>({
  pack: workstylePack,
  components: {
    button: ButtonPart,
    field: FieldPart,
    segment: SegmentPart,
    checkbox: CheckboxPart,
    switch: SwitchPart,
    stepper: StepperPart,
    badge: BadgePart,
    status: StatusPart,
    tab: TabPart,
  },
  Pick,
  Image: ({ node, style }) => (
    <div style={style}>
      <Picture image={{ src: node.src, alt: node.alt, width: node.width, height: node.height }} />
    </div>
  ),
  Missing: ({ node }) => (
    <div
      style={{
        border: '1px dashed var(--line)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        color: ink(3),
      }}
    >
      킷에 없는 부품 · {node.use}
    </div>
  ),
})
