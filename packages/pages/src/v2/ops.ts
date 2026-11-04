import { checkProps } from '../assets'
import { componentOf } from './form'
import { nodeIds, splitRef, walkScreen } from './screen'

import type { AssetPack, ScreenTemplate } from '../assets'
import type { Expr } from '../expr'
import type { ActionList } from './actions'
import type {
  FrameNode,
  InstanceNode,
  PlacedNode,
  PropValue,
  Screen,
  ScreenDocument,
  ScreenNode,
} from './screen'

/**
 * 배치 연산 — 빌더 · MCP 가 함께 쓰는 순수 함수. 편집 범위는 「부품 조합 · 배치까지」다:
 * - 할 수 있는 것: 화면 넣기(틀 고르기) · 빼기 · 옮기기, 틀의 칸에 부품 · 글 · 그림 넣기 · 빼기 · 옮기기, 속성 · 값 연결 · 동작 ·
 *   보이는 조건 고치기.
 * - 할 수 없는 것: 틀(stack) 만들기 · 빼기 · 옮기기 · 방향 · 간격 · 여백 · 정렬 고치기. 칸이 아닌 틀(`slot: false`) 안을 고치기.
 * 어기면 [PlacementError] 를 던진다(문서는 그대로).
 */

export class PlacementError extends Error {
  constructor(
    readonly code:
      | 'screen-unknown'
      | 'node-unknown'
      | 'not-slot'
      | 'frame-locked'
      | 'component-unknown'
      | 'props-invalid'
      | 'not-instance'
      | 'id-taken'
      | 'template-unknown',
    message: string,
  ) {
    super(message)
    this.name = 'PlacementError'
  }
}

// ── 화면 ────────────────────────────────────────────────────────────────

/** 틀에서 새 화면 — 틀의 노드 id 앞에 화면 id 를 붙인다. */
export function instantiateTemplate(template: ScreenTemplate, screenId: string): FrameNode {
  const rename = (n: ScreenNode): ScreenNode =>
    n.kind === 'stack'
      ? { ...n, id: `${screenId}-${n.id}`, children: n.children.map(rename) }
      : { ...n, id: `${screenId}-${n.id}` }
  return rename(template.frame) as FrameNode
}

export function addScreen(
  doc: ScreenDocument,
  pack: AssetPack,
  init: { id: string; name: string; template: string; role?: Screen['role']; at?: number },
): ScreenDocument {
  if (doc.screens.some((s) => s.id === init.id))
    throw new PlacementError('id-taken', `화면 id ${init.id} 가 이미 있습니다`)
  const template = pack.templates?.find((t) => t.id === init.template)
  if (!template)
    throw new PlacementError('template-unknown', `틀 ${init.template} 이 팩 ${pack.id} 에 없습니다`)
  const screen: Screen = {
    id: init.id,
    name: init.name,
    role: init.role ?? 'page',
    numbered: false,
    template: template.id,
    frame: instantiateTemplate(template, init.id),
  }
  const screens = [...doc.screens]
  screens.splice(clamp(init.at ?? screens.length, screens.length), 0, screen)
  return { ...doc, screens }
}

export function removeScreen(doc: ScreenDocument, screenId: string): ScreenDocument {
  return { ...doc, screens: doc.screens.filter((s) => s.id !== screenId) }
}

export function moveScreen(doc: ScreenDocument, from: number, to: number): ScreenDocument {
  const screens = [...doc.screens]
  const [item] = screens.splice(from, 1)
  if (item) screens.splice(clamp(to, screens.length), 0, item)
  return { ...doc, screens }
}

/** 화면의 이름 · 갈래 · 보이는 조건 · 번호 · 바탕 — 틀은 바꾸지 않는다. */
export function updateScreen(
  doc: ScreenDocument,
  screenId: string,
  patch: Partial<
    Pick<Screen, 'name' | 'variant' | 'visibleWhen' | 'numbered' | 'surface' | 'role'>
  >,
): ScreenDocument {
  screenOf(doc, screenId)
  return {
    ...doc,
    screens: doc.screens.map((s) => (s.id === screenId ? stripUndefined({ ...s, ...patch }) : s)),
  }
}

// ── 놓기 · 빼기 · 옮기기 ─────────────────────────────────────────────────

/** 칸 [frameId] 의 [index] 자리에 [node] 를 넣는다 — 틀(stack)은 넣을 수 없다. */
export function placeNode(
  doc: ScreenDocument,
  target: { screen: string; frame: string; index?: number },
  node: PlacedNode,
): ScreenDocument {
  if ((node as ScreenNode).kind === 'stack')
    throw new PlacementError('frame-locked', '틀은 넣을 수 없습니다(화면 틀 · 시안이 정합니다)')
  if (nodeIds(doc).has(node.id))
    throw new PlacementError('id-taken', `노드 id ${node.id} 가 이미 있습니다`)
  return mapScreen(doc, target.screen, (frame) =>
    mapFrame(frame, target.frame, (slot) => {
      const children = [...slot.children]
      children.splice(clamp(target.index ?? children.length, children.length), 0, node)
      return { ...slot, children }
    }),
  )
}

/** 부품을 처음 놓는다 — 속성은 정의와 다른 것만 싣는다. */
export function placeInstance(
  doc: ScreenDocument,
  packs: readonly AssetPack[],
  target: { screen: string; frame: string; index?: number },
  init: {
    use: string
    props?: Record<string, PropValue>
    bind?: string
    on?: Record<string, ActionList>
  },
): { doc: ScreenDocument; id: string } {
  const id = freshId(doc, splitRef(init.use).key)
  const node: InstanceNode = {
    id,
    kind: 'instance',
    use: init.use,
    props: init.props ?? {},
    ...(init.bind !== undefined ? { bind: init.bind } : {}),
    ...(init.on !== undefined ? { on: init.on } : {}),
  }
  const c = componentOf(packs, node)
  if (!c) throw new PlacementError('component-unknown', `부품 ${init.use} 을 찾지 못했습니다`)
  const problems = checkProps(c, node.props)
  if (problems.length) throw new PlacementError('props-invalid', problems.join('\n'))
  return { doc: placeNode(doc, target, node), id }
}

export function removeNode(doc: ScreenDocument, nodeId: string): ScreenDocument {
  const { screen, parent, node } = locate(doc, nodeId)
  guardPlaced(node, parent)
  return mapScreen(doc, screen.id, (frame) =>
    mapFrame(frame, parent.id, (p) => ({
      ...p,
      children: p.children.filter((c) => c.id !== nodeId),
    })),
  )
}

/** 다른 칸(다른 화면이어도)이나 같은 칸의 다른 자리로. [index] 는 옮긴 뒤 자리. */
export function moveNode(
  doc: ScreenDocument,
  nodeId: string,
  target: { screen: string; frame: string; index?: number },
): ScreenDocument {
  const { node, parent } = locate(doc, nodeId)
  guardPlaced(node, parent)
  return placeNode(removeNode(doc, nodeId), target, node as PlacedNode)
}

// ── 고치기 ──────────────────────────────────────────────────────────────

/** 속성 — null 이 아닌 undefined 를 주면 그 속성을 지워 기본값으로. */
export function setProps(
  doc: ScreenDocument,
  packs: readonly AssetPack[],
  nodeId: string,
  patch: Record<string, PropValue | undefined>,
): ScreenDocument {
  const node = instanceOf(doc, nodeId)
  const props: Record<string, PropValue> = { ...node.props }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete props[k]
    else props[k] = v
  }
  const c = componentOf(packs, node)
  if (!c) throw new PlacementError('component-unknown', `부품 ${node.use} 을 찾지 못했습니다`)
  const problems = checkProps(c, props)
  if (problems.length) throw new PlacementError('props-invalid', problems.join('\n'))
  return replaceNode(doc, nodeId, { ...node, props })
}

export function setBind(
  doc: ScreenDocument,
  nodeId: string,
  field: string | undefined,
): ScreenDocument {
  const { bind: _drop, ...rest } = instanceOf(doc, nodeId)
  return replaceNode(doc, nodeId, field === undefined ? rest : { ...rest, bind: field })
}

/** 일에 거는 동작 체인 — undefined 면 뗀다. */
export function setOn(
  doc: ScreenDocument,
  nodeId: string,
  event: string,
  actions: ActionList | undefined,
): ScreenDocument {
  const node = instanceOf(doc, nodeId)
  const on = { ...(node.on ?? {}) }
  if (actions === undefined) delete on[event]
  else on[event] = actions
  const { on: _drop, ...rest } = node
  return replaceNode(doc, nodeId, Object.keys(on).length ? { ...rest, on } : rest)
}

export function setVisibleWhen(
  doc: ScreenDocument,
  nodeId: string,
  expr: Expr | undefined,
): ScreenDocument {
  const { node, parent } = locate(doc, nodeId)
  guardPlaced(node, parent)
  const { visibleWhen: _drop, ...rest } = node as PlacedNode
  return replaceNode(doc, nodeId, expr === undefined ? rest : { ...rest, visibleWhen: expr })
}

/** 글 · 그림의 내용 — 종류 · id 는 바꾸지 않는다. */
export function updatePlaced(
  doc: ScreenDocument,
  nodeId: string,
  patch: Record<string, unknown>,
): ScreenDocument {
  const { node, parent } = locate(doc, nodeId)
  guardPlaced(node, parent)
  const { id: _i, kind: _k, ...rest } = patch
  return replaceNode(doc, nodeId, stripUndefined({ ...node, ...rest }) as PlacedNode)
}

// ── 안쪽 ────────────────────────────────────────────────────────────────

function screenOf(doc: ScreenDocument, id: string): Screen {
  const s = doc.screens.find((x) => x.id === id)
  if (!s) throw new PlacementError('screen-unknown', `화면 ${id} 가 없습니다`)
  return s
}

function locate(
  doc: ScreenDocument,
  nodeId: string,
): { screen: Screen; parent: FrameNode; node: ScreenNode } {
  for (const screen of doc.screens) {
    let hit: { parent: FrameNode; node: ScreenNode } | null = null
    walkScreen(screen.frame, (n, ancestors) => {
      const parent = ancestors.at(-1)
      if (!hit && n.id === nodeId && parent) hit = { parent, node: n }
    })
    if (hit) return { screen, ...(hit as { parent: FrameNode; node: ScreenNode }) }
  }
  throw new PlacementError('node-unknown', `노드 ${nodeId} 가 없습니다`)
}

function guardPlaced(node: ScreenNode, parent: FrameNode): void {
  if (node.kind === 'stack')
    throw new PlacementError('frame-locked', `틀 ${node.id} 은 빌더에서 고칠 수 없습니다`)
  if (parent.slot === false)
    throw new PlacementError('not-slot', `${parent.id} 은 칸이 아니라 안을 고칠 수 없습니다`)
}

function instanceOf(doc: ScreenDocument, nodeId: string): InstanceNode {
  const { node, parent } = locate(doc, nodeId)
  guardPlaced(node, parent)
  if (node.kind !== 'instance')
    throw new PlacementError('not-instance', `${nodeId} 은 부품이 아닙니다`)
  return node
}

function mapScreen(
  doc: ScreenDocument,
  screenId: string,
  fn: (frame: FrameNode) => FrameNode,
): ScreenDocument {
  const screen = screenOf(doc, screenId)
  return {
    ...doc,
    screens: doc.screens.map((s) => (s === screen ? { ...s, frame: fn(s.frame) } : s)),
  }
}

/** [frameId] 칸을 찾아 [fn] — 칸이 아니면 던진다. */
function mapFrame(root: FrameNode, frameId: string, fn: (f: FrameNode) => FrameNode): FrameNode {
  let found = false
  const visit = (f: FrameNode): FrameNode => {
    if (f.id === frameId) {
      found = true
      if (f.slot === false)
        throw new PlacementError('not-slot', `${f.id} 은 부품을 놓는 칸이 아닙니다`)
      return fn(f)
    }
    return { ...f, children: f.children.map((c) => (c.kind === 'stack' ? visit(c) : c)) }
  }
  const out = visit(root)
  if (!found) throw new PlacementError('node-unknown', `칸 ${frameId} 가 이 화면에 없습니다`)
  return out
}

function replaceNode(doc: ScreenDocument, nodeId: string, next: ScreenNode): ScreenDocument {
  const visit = (n: ScreenNode): ScreenNode =>
    n.id === nodeId ? next : n.kind === 'stack' ? { ...n, children: n.children.map(visit) } : n
  return {
    ...doc,
    screens: doc.screens.map((s) => ({ ...s, frame: visit(s.frame) as FrameNode })),
  }
}

function freshId(doc: ScreenDocument, prefix: string): string {
  const used = nodeIds(doc)
  for (let n = 1; ; n += 1) if (!used.has(`${prefix}-${String(n)}`)) return `${prefix}-${String(n)}`
}

function clamp(i: number, length: number): number {
  return Math.max(0, Math.min(i, length))
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}
