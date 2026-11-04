/**
 * 에셋 — 화면을 짓는 재료의 헤드리스 계약. 화면 바탕 · 색 · 글자 스타일 · 부품이 모두 에셋이고, 편집기는 에셋을 끌어 놓고 고친다.
 *
 * 형식은 canvas(Seed) 컴포넌트 속성과 같다: 변형(VARIANT) · 글자(TEXT) · 참거짓(BOOLEAN) · 바꿔 끼우기(INSTANCE_SWAP).
 * 그래서 Seed 라이브러리의 부품을 그대로 부품 정의로 읽고, 속성 패널은 이 정의에서 만든다.
 *
 * 이 파일은 정의(데이터)만 갖는다. 어떻게 그릴지는 뷰 쪽 킷이 정한다 — 같은 팩을 Workstyle 킷으로도, MVOS 디자인 구현
 * (캠페인 킷)으로도 그릴 수 있다. React · 디자인 시스템을 모른다.
 */

import type { FrameNode } from './v2/screen'

/** 글자 스타일 — 크기 · 굵기 · 줄 높이(px). */
export type FontAsset = { size: number; weight: number; lineHeight: number }

/**
 * 테마 에셋 — 색 토큰과 글자 스타일. 문서의 색 · 글자 스타일은 이 이름으로 걸고, 그릴 때 테마에서 값을 찾는다.
 * 테마를 바꾸면 같은 문서가 다른 색으로 그려진다.
 */
export type ThemeAsset = {
  kind: 'theme'
  id: string
  name: string
  colors: Readonly<Record<string, string>>
  textStyles: Readonly<Record<string, FontAsset>>
  /** 아무것도 걸지 않았을 때 쓰는 이름 — 글자색 · 글자 스타일 · 강조색(본문의 `**말**`). */
  defaults: { ink: string; textStyle: string; accent?: string | undefined }
}

/**
 * 바탕 에셋 — 화면(장 · 시트 · 대화상자)의 바탕. 편집기에서 화면에 끌어 놓아 바꾼다.
 * 색은 테마 토큰 이름이나 `#rrggbb`.
 */
export type SurfaceAsset = {
  kind: 'surface'
  id: string
  name: string
  fill: string
}

/** 부품 속성 — Seed 컴포넌트 속성과 같은 네 종류. */
export type PropDef =
  | { type: 'VARIANT'; name: string; options: readonly string[]; default: string }
  | { type: 'TEXT'; name: string; default: string }
  | { type: 'BOOLEAN'; name: string; default: boolean }
  /** 다른 부품(주로 아이콘)을 끼우는 자리. 비면 끼우지 않는다. */
  | { type: 'INSTANCE_SWAP'; name: string; default: string | null }

/**
 * 부품이 받는 값 — Seed 속성에는 없고 빌더가 더한다. 답 필드에 묶이는 입력 부품만 갖는다.
 * 키는 답 키(= 콜 템플릿 필드 키)가 된다. 코어 종류 밖의 값(예: 캠페인 팩의 `premium`)은 팩의 [ValueType] 으로 더한다.
 */
export type ValueDef = 'text' | 'number' | 'choice' | 'choices' | 'boolean' | (string & {})

/**
 * 값 종류 — 필드의 `type`. 코어는 text · number · choice · multi · boolean 을 갖고([CORE_VALUE_TYPES]), 팩이 더할 수 있다.
 * 답이 있는지 · 사람이 읽는 말 · 저장할 수 있는 꼴은 여기서 정한다(운영 표 · CSV · 진행이 읽는다).
 */
export type ValueType = {
  id: string
  name: string
  /** 이 필드에 묶을 수 있는 부품의 값(ComponentAsset.value). */
  accepts: readonly ValueDef[]
  /** 선택지가 있어야 하나(choice · multi). */
  options?: boolean | undefined
  isAnswered(field: ValueField, value: unknown): boolean
  format(field: ValueField, value: unknown): string
  /** 답이 아니어도 저장해 둘 꼴인가(예: 고르다 만 보험료). 없으면 답일 때만. */
  keep?: ((value: unknown) => boolean) | undefined
}

/** 값 종류가 읽는 필드의 부분 — 코어 필드(v2 Field)와 같은 이름. */
export type ValueField = {
  key: string
  options?:
    | ReadonlyArray<{ value: string; label: string; summary?: string | undefined }>
    | undefined
  unit?: string | undefined
  max?: number | undefined
}

/** 화면 틀 — 새 화면을 만들 때 고르는 틀(머리 · 본문 · 아래 칸). 빌더는 틀을 고치지 않고 칸에 부품을 놓는다. */
export type ScreenTemplate = {
  id: string
  name: string
  /** 틀의 노드 id 는 화면마다 앞에 화면 id 를 붙여 쓴다([instantiateTemplate]). */
  frame: FrameNode
}

/** 부품 에셋 — 이름 · 속성 · 값 · 일으키는 일. */
export type ComponentAsset = {
  kind: 'component'
  /** 팩 안에서 겹치지 않는 키 — Seed 라이브러리의 에셋 키와 같게 둔다. */
  key: string
  name: string
  /** 에셋 패널의 묶음(예: 기본 · 문항 · 안내). */
  group?: string | undefined
  props: readonly PropDef[]
  value?: ValueDef | undefined
  /**
   * 값 연결을 싣는 Seed 속성 이름(예: 「질문 ID」) — Seed 라이브러리는 연결을 글 속성으로 들고 있다. 빌더는 이 속성을 속성 패널에
   * 그리지 않고 값 연결(`bind`)로 다룬다.
   */
  bindProp?: string | undefined
  /** 일으키는 일 — 동작을 걸 수 있는 자리(예: press). */
  events?: readonly string[] | undefined
}

export type Asset = ThemeAsset | SurfaceAsset | ComponentAsset

/**
 * 에셋 팩 — 한 디자인 시스템의 테마 · 바탕 · 부품. 편집기의 「팩」 하나이고, 뷰 쪽 킷 하나가 이 팩의 부품을 그린다.
 */
export type AssetPack = {
  id: string
  name: string
  /** 이 팩이 원본으로 삼는 Seed 라이브러리 id. */
  seedLibrary?: string | undefined
  theme: ThemeAsset
  surfaces: readonly SurfaceAsset[]
  components: readonly ComponentAsset[]
  /** 팩이 더하는 값 종류. */
  valueTypes?: readonly ValueType[] | undefined
  /** 새 화면의 틀. */
  templates?: readonly ScreenTemplate[] | undefined
}

// ── 만들기 ──────────────────────────────────────────────────────────────

export function defineTheme(theme: Omit<ThemeAsset, 'kind'>): ThemeAsset {
  if (!theme.textStyles[theme.defaults.textStyle])
    throw new Error(`테마 ${theme.id}: 기본 글자 스타일 ${theme.defaults.textStyle} 이 없습니다`)
  return { kind: 'theme', ...theme }
}

export function definePack(pack: AssetPack): AssetPack {
  const seen = new Set<string>()
  for (const c of pack.components) {
    if (seen.has(c.key)) throw new Error(`팩 ${pack.id}: 부품 키 ${c.key} 가 겹칩니다`)
    seen.add(c.key)
    const names = new Set<string>()
    for (const p of c.props) {
      if (names.has(p.name))
        throw new Error(`팩 ${pack.id}: ${c.key} 의 속성 ${p.name} 이 겹칩니다`)
      names.add(p.name)
      if (p.type === 'VARIANT' && !p.options.includes(p.default))
        throw new Error(
          `팩 ${pack.id}: ${c.key}.${p.name} 기본값 ${p.default} 이 선택지에 없습니다`,
        )
    }
    if (c.bindProp !== undefined) {
      if (!c.value)
        throw new Error(`팩 ${pack.id}: ${c.key} 는 값을 받지 않는데 bindProp 이 있습니다`)
      if (!c.props.some((p) => p.name === c.bindProp && p.type === 'TEXT'))
        throw new Error(`팩 ${pack.id}: ${c.key} 의 bindProp ${c.bindProp} 이 글 속성이 아닙니다`)
    }
  }
  return pack
}

// ── 읽기 ────────────────────────────────────────────────────────────────

/** 색 — 테마 토큰이면 그 값, `#hex` 면 그대로, 모르는 토큰이면 undefined. */
export function resolveColor(theme: ThemeAsset, color: string | undefined): string | undefined {
  if (!color) return undefined
  if (color.startsWith('#')) return color
  return theme.colors[color]
}

/** 글자 — 스타일 이름이 테마에 있으면 그것, 없으면 직접 준 글자, 그도 없으면 테마 기본. */
export function resolveFont(
  theme: ThemeAsset,
  style: string | undefined,
  font?: FontAsset | undefined,
): FontAsset {
  const named = style ? theme.textStyles[style] : undefined
  return named ?? font ?? (theme.textStyles[theme.defaults.textStyle] as FontAsset)
}

export function findComponent(pack: AssetPack, key: string): ComponentAsset | undefined {
  return pack.components.find((c) => c.key === key)
}

/** 속성 기본값 — 인스턴스를 처음 놓을 때의 값. */
export function defaultProps(component: ComponentAsset): Record<string, string | boolean | null> {
  return Object.fromEntries(component.props.map((p) => [p.name, p.default]))
}

/**
 * 인스턴스 값 검사 — 정의에 없는 속성 · 종류가 맞지 않는 값 · 선택지 밖 변형을 문장으로 돌려준다.
 * 빈 배열이면 맞다.
 */
export function checkProps(component: ComponentAsset, values: Record<string, unknown>): string[] {
  const out: string[] = []
  const defs = new Map(component.props.map((p) => [p.name, p]))
  for (const [name, v] of Object.entries(values)) {
    const def = defs.get(name)
    if (!def) {
      out.push(`${component.name}: 속성 ${name} 이 정의에 없습니다`)
      continue
    }
    switch (def.type) {
      case 'VARIANT':
        if (typeof v !== 'string' || !def.options.includes(v))
          out.push(
            `${component.name}.${name}: ${String(v)} 은 ${def.options.join(' · ')} 가운데 하나여야 합니다`,
          )
        break
      case 'TEXT':
        if (typeof v !== 'string') out.push(`${component.name}.${name}: 글자여야 합니다`)
        break
      case 'BOOLEAN':
        if (typeof v !== 'boolean') out.push(`${component.name}.${name}: 참거짓이어야 합니다`)
        break
      case 'INSTANCE_SWAP':
        if (v !== null && typeof v !== 'string')
          out.push(`${component.name}.${name}: 끼울 부품 키나 null 이어야 합니다`)
        break
    }
  }
  return out
}
