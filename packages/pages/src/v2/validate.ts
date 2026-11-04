import { checkProps } from '../assets'
import { NODE_ID, OPTION_VALUE, QUESTION_KEY } from '../campaign-document'
import { actionTargets, hostActionsOf } from './actions'
import { componentOf } from './form'
import { splitRef, walkScreen } from './screen'
import { valueTypesOf } from './values'

import type { AssetPack } from '../assets'
import type { IssueCode, IssueParams } from './messages'
import type { ScreenDocument } from './screen'

export type ScreenIssue = {
  level: 'error' | 'warning'
  code: IssueCode
  params?: IssueParams | undefined
  screen?: string | undefined
  node?: string | undefined
  field?: string | undefined
}

export type ValidateOptions = {
  /** 이미 발행한 판 — 있으면 받은 답의 뜻(필드 키 · 값 종류 · 선택지 값)을 지킨다. */
  published?: ScreenDocument | null | undefined
  /** 호스트가 아는 동작 이름 — 주면 모르는 이름을 막는다. */
  hostActions?: readonly string[] | undefined
}

/**
 * v2 문서 진단 — error 가 있으면 발행하지 않는다. 문장은 [issueMessage] 로 고른다(코드 · 인자만 싣는다).
 * [packs] 는 이 문서를 그리는 팩(부품 정의 · 값 종류)이다.
 */
export function validateScreenDocument(
  doc: ScreenDocument,
  packs: readonly AssetPack[],
  options: ValidateOptions = {},
): ScreenIssue[] {
  const out: ScreenIssue[] = []
  const err = (code: IssueCode, at: Omit<ScreenIssue, 'level' | 'code'> = {}) =>
    out.push({ level: 'error', code, ...at })
  const warn = (code: IssueCode, at: Omit<ScreenIssue, 'level' | 'code'> = {}) =>
    out.push({ level: 'warning', code, ...at })

  const types = valueTypesOf(packs.filter((p) => doc.packs.includes(p.id)))
  const fields = new Map(doc.fields.map((f) => [f.key, f]))
  const screenIds = new Set(doc.screens.map((s) => s.id))
  const variants = new Set(doc.variants.map((v) => v.key))

  if (!doc.screens.some((s) => s.role === 'page')) err('no-pages')

  // ── 필드 ──
  const keys = new Set<string>()
  for (const f of doc.fields) {
    const at = { field: f.key, params: { field: f.key } }
    if (!QUESTION_KEY.test(f.key)) err('field-key', at)
    if (keys.has(f.key)) err('field-dup', at)
    keys.add(f.key)
    const type = types.get(f.type)
    if (!type) err('field-type', { ...at, params: { field: f.key, type: f.type } })
    if (!f.label.trim()) err('field-label', at)
    if (type?.options) {
      const opts = f.options ?? []
      if (!opts.length) err('field-options', at)
      const values = new Set<string>()
      for (const o of opts) {
        if (!OPTION_VALUE.test(o.value))
          err('option-value', { ...at, params: { field: f.key, value: o.value } })
        if (values.has(o.value))
          err('option-dup', { ...at, params: { field: f.key, value: o.value } })
        values.add(o.value)
      }
      if (f.exclusive !== undefined && !values.has(f.exclusive))
        err('exclusive-unknown', { ...at, params: { field: f.key, value: f.exclusive } })
    }
  }

  // ── 화면 · 노드 ──
  const seenScreens = new Set<string>()
  const nodeIds = new Set<string>()
  const bound = new Set<string>()
  for (const screen of doc.screens) {
    const sat = { screen: screen.id }
    if (!NODE_ID.test(screen.id)) err('screen-id', { ...sat, params: { id: screen.id } })
    if (seenScreens.has(screen.id)) err('screen-dup', { ...sat, params: { id: screen.id } })
    seenScreens.add(screen.id)
    if (screen.variant && !variants.has(screen.variant))
      err('variant-unknown', { ...sat, params: { variant: screen.variant } })

    walkScreen(screen.frame, (n) => {
      const at = { screen: screen.id, node: n.id }
      if (nodeIds.has(n.id)) err('node-dup', { ...at, params: { id: n.id } })
      nodeIds.add(n.id)
      switch (n.kind) {
        case 'stack':
          if (n.fill?.startsWith('#')) warn('color-raw', { ...at, params: { color: n.fill } })
          return
        case 'text':
          if (n.color?.startsWith('#')) warn('color-raw', { ...at, params: { color: n.color } })
          return
        case 'image':
          if (!n.src) err('image-empty', at)
          return
        case 'unknown':
          err('layer-unknown', { ...at, params: { reason: n.reason } })
          return
        case 'instance': {
          const { pack } = splitRef(n.use)
          if (!doc.packs.includes(pack)) {
            err('pack-unknown', { ...at, params: { pack } })
            return
          }
          const c = componentOf(packs, n)
          if (!c) {
            err('component-unknown', { ...at, params: { use: n.use } })
            return
          }
          for (const detail of checkProps(c, n.props))
            err('prop-invalid', { ...at, params: { detail } })
          if (c.value && n.bind === undefined)
            err('bind-missing', { ...at, params: { component: c.name } })
          if (!c.value && n.bind !== undefined)
            err('bind-unexpected', { ...at, params: { component: c.name } })
          if (c.value && n.bind !== undefined) {
            bound.add(n.bind)
            const f = fields.get(n.bind)
            if (!f) err('bind-unknown', { ...at, params: { field: n.bind } })
            else {
              const t = types.get(f.type)
              if (t && !t.accepts.includes(c.value))
                err('bind-mismatch', {
                  ...at,
                  params: { component: c.name, field: f.key, type: t.name },
                })
            }
          }
          for (const [event, actions] of Object.entries(n.on ?? {})) {
            if (!(c.events ?? []).includes(event))
              err('event-unknown', { ...at, params: { component: c.name, event } })
            for (const to of actionTargets(actions))
              if (!screenIds.has(to)) err('go-unknown', { ...at, params: { to } })
            if (options.hostActions)
              for (const name of hostActionsOf(actions))
                if (!options.hostActions.includes(name))
                  err('host-unknown', { ...at, params: { name } })
          }
          return
        }
      }
    })
  }

  for (const f of doc.fields)
    if (f.required && !bound.has(f.key))
      warn('field-unplaced', { field: f.key, params: { field: f.key } })

  // ── 발행한 판과 ──
  const published = options.published
  if (published)
    for (const old of published.fields) {
      const now = fields.get(old.key)
      const at = { field: old.key }
      if (!now) {
        err('published-removed', { ...at, params: { field: old.key } })
        continue
      }
      if (now.type !== old.type)
        err('published-type', { ...at, params: { field: old.key, from: old.type, to: now.type } })
      const values = new Set((now.options ?? []).map((o) => o.value))
      for (const o of old.options ?? [])
        if (!values.has(o.value))
          err('published-option', { ...at, params: { field: old.key, value: o.value } })
    }

  return out
}
