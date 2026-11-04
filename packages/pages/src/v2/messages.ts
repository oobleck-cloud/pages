/**
 * 검증 메시지 — 코드 → 문장. 검증기는 코드 · 인자만 돌려주고, 문장은 여기서 고른다(언어를 더하려면 표 하나를 더한다).
 * 인자 이름은 검증기([validateScreenDocument])가 싣는 것과 같다.
 */

export type IssueCode =
  | 'no-pages'
  | 'screen-id'
  | 'screen-dup'
  | 'node-dup'
  | 'variant-unknown'
  | 'pack-unknown'
  | 'component-unknown'
  | 'prop-invalid'
  | 'bind-missing'
  | 'bind-unexpected'
  | 'bind-unknown'
  | 'bind-mismatch'
  | 'event-unknown'
  | 'go-unknown'
  | 'host-unknown'
  | 'image-empty'
  | 'layer-unknown'
  | 'color-raw'
  | 'field-key'
  | 'field-dup'
  | 'field-type'
  | 'field-label'
  | 'field-options'
  | 'option-value'
  | 'option-dup'
  | 'exclusive-unknown'
  | 'field-unplaced'
  | 'published-removed'
  | 'published-type'
  | 'published-option'

export type IssueParams = Readonly<Record<string, string | number>>

type Catalog = Readonly<Record<IssueCode, (p: IssueParams) => string>>

const s = (v: string | number | undefined) => String(v ?? '')

export const MESSAGES_KO: Catalog = {
  'no-pages': () => '장이 하나도 없어요',
  'screen-id': (p) => `화면 id 「${s(p['id'])}」는 소문자 · 숫자 · 하이픈 40자까지예요`,
  'screen-dup': (p) => `화면 id 「${s(p['id'])}」가 겹쳐요`,
  'node-dup': (p) => `노드 id 「${s(p['id'])}」가 겹쳐요`,
  'variant-unknown': (p) => `갈래 「${s(p['variant'])}」가 문서에 없어요`,
  'pack-unknown': (p) => `팩 「${s(p['pack'])}」을 쓰지 않는 문서예요`,
  'component-unknown': (p) => `부품 「${s(p['use'])}」을 팩에서 찾지 못했어요`,
  'prop-invalid': (p) => s(p['detail']),
  'bind-missing': (p) => `「${s(p['component'])}」은 답을 받는 부품이라 필드에 묶어야 해요`,
  'bind-unexpected': (p) => `「${s(p['component'])}」은 답을 받지 않는 부품이에요`,
  'bind-unknown': (p) => `필드 「${s(p['field'])}」가 없어요`,
  'bind-mismatch': (p) =>
    `「${s(p['component'])}」은 ${s(p['type'])} 필드 「${s(p['field'])}」에 묶을 수 없어요`,
  'event-unknown': (p) => `「${s(p['component'])}」에는 「${s(p['event'])}」 일이 없어요`,
  'go-unknown': (p) => `가려는 화면 「${s(p['to'])}」가 없어요`,
  'host-unknown': (p) => `호스트 동작 「${s(p['name'])}」을 이 호스트가 모릅니다`,
  'image-empty': () => '그림을 올려 주세요',
  'layer-unknown': (p) => `옮기지 못한 레이어예요 — ${s(p['reason'])}`,
  'color-raw': (p) => `색 ${s(p['color'])} 에 토큰을 걸어 주세요`,
  'field-key': (p) => `필드 키 「${s(p['field'])}」는 영문자로 시작하는 영숫자 40자까지예요`,
  'field-dup': (p) => `필드 키 「${s(p['field'])}」가 겹쳐요`,
  'field-type': (p) => `필드 「${s(p['field'])}」의 값 종류 「${s(p['type'])}」을 몰라요`,
  'field-label': (p) => `필드 「${s(p['field'])}」의 물음을 적어 주세요`,
  'field-options': (p) => `필드 「${s(p['field'])}」에 선택지가 없어요`,
  'option-value': (p) =>
    `필드 「${s(p['field'])}」의 선택지 값 「${s(p['value'])}」는 영숫자 · _ · - 40자까지예요`,
  'option-dup': (p) => `필드 「${s(p['field'])}」의 선택지 값 「${s(p['value'])}」가 겹쳐요`,
  'exclusive-unknown': (p) =>
    `필드 「${s(p['field'])}」의 「없어요」 값 「${s(p['value'])}」이 선택지에 없어요`,
  'field-unplaced': (p) => `꼭 답할 필드 「${s(p['field'])}」가 어느 화면에도 없어요`,
  'published-removed': (p) =>
    `발행한 필드 「${s(p['field'])}」를 지울 수 없어요 — 이미 받은 답이 이 키로 남아 있어요`,
  'published-type': (p) =>
    `발행한 필드 「${s(p['field'])}」의 값 종류를 바꿀 수 없어요(${s(p['from'])} → ${s(p['to'])})`,
  'published-option': (p) =>
    `발행한 필드 「${s(p['field'])}」의 선택지 값 「${s(p['value'])}」를 뺄 수 없어요`,
}

export const CATALOGS: Readonly<Record<string, Catalog>> = { ko: MESSAGES_KO }

/** 문장으로 — 모르는 언어면 한국어. */
export function issueMessage(
  issue: { code: IssueCode; params?: IssueParams | undefined },
  locale = 'ko',
): string {
  const catalog = CATALOGS[locale] ?? MESSAGES_KO
  return catalog[issue.code](issue.params ?? {})
}
