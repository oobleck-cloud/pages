import { evaluate, evaluateCondition } from '../expr'
import { findComponent } from '../assets'
import { screenInstances, splitRef } from './screen'
import { valueTypesOf } from './values'

import type { AssetPack, ComponentAsset } from '../assets'
import type {
  CampaignAnswers,
  CampaignForm,
  CampaignQuestion,
  CampaignSection,
} from '../campaign-form'
import type { Expr, ExprScope } from '../expr'
import type { Field, InstanceNode, PropValue, Screen, ScreenDocument } from './screen'

/**
 * v2 문서를 문항 색인(v1 `CampaignForm`)으로 — 운영 표 · CSV · 진행 · 콜 칸 · 답 저장이 v1 과 같은 꼴을 읽게 하는 다리.
 *
 * 구역 = 묶인 입력 부품이 있는 장(role page) 하나, 문항 = 그 장에 놓인 차례대로의 필드(같은 필드를 두 번 놓으면 처음 것만).
 * 보이는 조건은 화면 · 조상 틀 · 부품의 조건을 모두 만족해야 한다. 어디에도 놓이지 않은 필드는 묻지 않는다(보관).
 * 그리기 꼴(큰칸 · 목록 · 여러 줄 · 안내 글 · 물음 숨기기)은 묶인 부품의 속성에서 읽는다.
 */
export function formOf(doc: ScreenDocument, packs: readonly AssetPack[]): CampaignForm {
  const fields = new Map(doc.fields.map((f) => [f.key, f]))
  const sections: CampaignSection[] = doc.screens.flatMap((screen) => {
    if (screen.role !== 'page') return []
    const seen = new Set<string>()
    const questions = screenInstances(screen).flatMap(({ node, conditions }) => {
      const field = node.bind ? fields.get(node.bind) : undefined
      if (!field || seen.has(field.key)) return []
      seen.add(field.key)
      return [questionOf(field, node, componentOf(packs, node), conditions)]
    })
    if (!questions.length) return []
    return [
      {
        key: screen.id,
        title: screen.name,
        ...(screen.variant ? { variant: screen.variant } : {}),
        questions,
      },
    ]
  })
  return { sections, variants: doc.variants }
}

/** 조건식이 읽는 상태 — `fields` 와 v1 이름 `answers` 가 같은 답을 가리킨다. */
export function scopeOf(
  doc: ScreenDocument,
  answers: CampaignAnswers,
  host: Record<string, unknown> = {},
): ExprScope {
  const base: ExprScope = { fields: answers, answers, host }
  const computed: Record<string, unknown> = {}
  // 앞에 적은 계산값을 뒤 계산값이 읽을 수 있다(적은 차례대로).
  for (const c of doc.computed ?? []) {
    try {
      computed[c.name] = evaluate(c.expr, { ...base, computed })
    } catch {
      computed[c.name] = null
    }
  }
  return { ...base, computed }
}

export function componentOf(
  packs: readonly AssetPack[],
  node: InstanceNode,
): ComponentAsset | undefined {
  const { pack, key } = splitRef(node.use)
  const p = packs.find((x) => x.id === pack)
  return p ? findComponent(p, key) : undefined
}

/** 인스턴스의 속성 값 — 준 값, 없으면 정의의 기본값. */
export function propOf(
  component: ComponentAsset | undefined,
  node: InstanceNode,
  name: string,
): PropValue | undefined {
  if (name in node.props) return node.props[name]
  return component?.props.find((p) => p.name === name)?.default
}

function questionOf(
  field: Field,
  node: InstanceNode,
  component: ComponentAsset | undefined,
  conditions: readonly Expr[],
): CampaignQuestion {
  const prop = (name: string) => propOf(component, node, name)
  const base = {
    key: field.key,
    label: field.label,
    short: field.short,
    ...(field.hint !== undefined ? { hint: field.hint } : {}),
    required: field.required,
    ...(prop('물음 숨기기') === true ? { hideLabel: true } : {}),
  }
  const placeholder = typeof prop('안내') === 'string' ? (prop('안내') as string) : ''
  let q: CampaignQuestion
  switch (field.type) {
    case 'choice':
      q = {
        ...base,
        kind: 'choice',
        options: field.options ?? [],
        layout: prop('배치') === '목록' ? 'stack' : 'row',
      }
      break
    case 'multi':
      q = {
        ...base,
        kind: 'multi',
        options: field.options ?? [],
        ...(field.exclusive !== undefined ? { exclusive: field.exclusive } : {}),
      }
      break
    case 'text':
      q = { ...base, kind: 'text', placeholder, multiline: prop('종류') === '여러 줄' }
      break
    case 'number':
      q = { ...base, kind: 'number', placeholder, unit: field.unit ?? '', max: field.max ?? 0 }
      break
    default:
      // 팩이 더한 값 종류 — 색인은 종류 이름만 싣는다(답 규칙은 valueTypesOf 로).
      q = { ...base, kind: field.type } as CampaignQuestion
  }
  if (!conditions.length) return q
  return {
    ...q,
    when: (answers) =>
      conditions.every((e) => {
        try {
          return evaluateCondition(e, { answers, fields: answers })
        } catch {
          return false
        }
      }),
  }
}

/** 답이 있나 — 필드의 값 종류 규칙으로. 모르는 종류면 거짓. */
export function fieldAnswered(packs: readonly AssetPack[], field: Field, value: unknown): boolean {
  return valueTypesOf(packs).get(field.type)?.isAnswered(field, value) ?? false
}

/** 사람이 읽는 답 — 답이 아니면 빈 글. */
export function fieldText(packs: readonly AssetPack[], field: Field, value: unknown): string {
  const t = valueTypesOf(packs).get(field.type)
  return t && t.isAnswered(field, value) ? t.format(field, value) : ''
}

/** 이 장에서 묻는 필드(놓인 차례, 지금 보이는 것만). */
export function screenFields(
  doc: ScreenDocument,
  screen: Screen,
  answers: CampaignAnswers,
  /** 조건식이 읽는 상태 — 없으면 답만(계산값 · 호스트 변수 없이). */
  scope: ExprScope = { answers, fields: answers },
): Field[] {
  const fields = new Map(doc.fields.map((f) => [f.key, f]))
  const seen = new Set<string>()
  return screenInstances(screen).flatMap(({ node, conditions }) => {
    const f = node.bind ? fields.get(node.bind) : undefined
    if (!f || seen.has(f.key)) return []
    const shown = conditions.every((e) => {
      try {
        return evaluateCondition(e, scope)
      } catch {
        return false
      }
    })
    if (!shown) return []
    seen.add(f.key)
    return [f]
  })
}
