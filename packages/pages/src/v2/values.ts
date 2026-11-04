import type { AssetPack, ValueField, ValueType } from '../assets'

/**
 * 코어 값 종류 — 어느 팩에도 있는 것. v1 문항 종류(choice · multi · text · number)와 같은 규칙으로 답을 센다.
 * v1 의 `premium` 은 코어에 없다 — 캠페인 팩이 값 종류로 더한다.
 */

const won = new Intl.NumberFormat('ko-KR')

function optionOf(field: ValueField, value: unknown) {
  return field.options?.find((o) => o.value === value)
}

export const CORE_VALUE_TYPES: readonly ValueType[] = [
  {
    id: 'text',
    name: '글',
    accepts: ['text'],
    isAnswered: (_f, v) => typeof v === 'string' && v.trim().length > 0,
    format: (_f, v) => (typeof v === 'string' ? v.trim() : ''),
  },
  {
    id: 'number',
    name: '수',
    accepts: ['number', 'text'],
    isAnswered: (_f, v) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
    format: (f, v) => (typeof v === 'number' ? `${won.format(v)}${f.unit ?? ''}` : ''),
  },
  {
    id: 'choice',
    name: '하나 고르기',
    accepts: ['choice'],
    options: true,
    isAnswered: (f, v) => typeof v === 'string' && optionOf(f, v) !== undefined,
    format: (f, v) => {
      const o = optionOf(f, v)
      return o ? (o.summary ?? o.label) : ''
    },
  },
  {
    id: 'multi',
    name: '여럿 고르기',
    accepts: ['choices'],
    options: true,
    isAnswered: (f, v) => Array.isArray(v) && v.some((x) => optionOf(f, x) !== undefined),
    format: (f, v) =>
      Array.isArray(v)
        ? (f.options ?? [])
            .filter((o) => v.includes(o.value))
            .map((o) => o.summary ?? o.label)
            .join(', ')
        : '',
  },
  {
    id: 'boolean',
    name: '예 · 아니오',
    accepts: ['boolean'],
    isAnswered: (_f, v) => typeof v === 'boolean',
    format: (_f, v) => (v === true ? '예' : v === false ? '아니오' : ''),
  },
]

/** 문서가 쓰는 팩들로 본 값 종류 — 코어 + 팩이 더한 것(뒤에 온 같은 id 는 무시). */
export function valueTypesOf(packs: readonly AssetPack[]): Map<string, ValueType> {
  const out = new Map<string, ValueType>()
  for (const t of [...CORE_VALUE_TYPES, ...packs.flatMap((p) => p.valueTypes ?? [])])
    if (!out.has(t.id)) out.set(t.id, t)
  return out
}
