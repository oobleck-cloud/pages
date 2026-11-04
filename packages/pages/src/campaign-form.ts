/**
 * 캠페인 문항 색인 — 랜딩 문서(campaign-document)의 문항을 장(구역) 차례로 편 것과, 답(문항 키 → 값)을 읽는 규칙.
 *
 * 서버는 답의 꼴(키 · 크기)만 본다. 어느 키가 어느 질문인지, 무엇이 필수인지, 진행을 어떻게 세는지는 여기서 정한다 — 공개 랜딩과
 * 운영자 화면이 같은 색인을 읽는다. 키는 영문자로 시작하는 영숫자 40자(서버 규칙)다. 한 번 발행한 문서의 키 · 값은 바꾸지 않는다
 * (이미 쌓인 답이 그 키로 남아 있다 — 발행 전 검증이 막는다). 문구는 고쳐도 된다.
 */

export type ChoiceOption = {
  value: string
  label: string
  /** 운영자 화면 · 보낸 뒤 화면에 쓸 짧은 말. 없으면 label. */
  summary?: string
  /** 큰 칸 묶음 아래 따로 한 줄씩 두는 답(예: 「모르겠어요」). */
  minor?: boolean
}

type QuestionBase = {
  key: string
  label: string
  /** 운영자 표 · 보낸 뒤 화면의 짧은 이름. */
  short: string
  hint?: string
  required: boolean
  /** 물음을 그리지 않고 답 칸만(앞 문항에 붙는 칸). */
  hideLabel?: boolean
  /** 이 답이 있어야 보이는 문항(문서의 보이는 조건을 편 것). 숨으면 필수도 아니다. */
  when?: (answers: CampaignAnswers) => boolean
}

export type CampaignQuestion =
  | (QuestionBase & { kind: 'choice'; options: ChoiceOption[]; layout: 'row' | 'stack' })
  | (QuestionBase & {
      kind: 'multi'
      options: ChoiceOption[]
      /** 고르면 나머지를 비우는 값(예: 「없어요」). */
      exclusive?: string
    })
  | (QuestionBase & { kind: 'text'; placeholder: string; multiline: boolean })
  | (QuestionBase & { kind: 'number'; placeholder: string; unit: string; max: number })
  | (QuestionBase & { kind: 'premium' })

/** 구역 = 문항이 든 장 하나. */
export type CampaignSection = {
  key: string
  title: string
  /** 이 갈래(variant)를 받은 파트너에게만 보인다. */
  variant?: string
  questions: CampaignQuestion[]
}

/** 문항 색인 — 문서에서 편다(`campaign-document` 의 `indexOf`). */
export type CampaignForm = {
  sections: CampaignSection[]
  /** 문서가 아는 갈래 — 대상 넣기에서 고른다. */
  variants: Array<{ key: string; label: string }>
}

export type CampaignAnswers = Record<string, unknown>

/** 보험료 — 월 · 연 + 원, 또는 「잘 몰라요」. */
export type PremiumAnswer = { unit: 'month' | 'year'; amount: number | null; unknown: boolean }

export function isPremiumAnswer(v: unknown): v is PremiumAnswer {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
  const p = v as Record<string, unknown>
  return (
    (p['unit'] === 'month' || p['unit'] === 'year') &&
    (p['amount'] === null || typeof p['amount'] === 'number') &&
    typeof p['unknown'] === 'boolean'
  )
}

/** 이 파트너에게 보이는 구역 — 갈래가 없는 구역 + 받은 갈래의 구역. */
export function visibleSections(
  form: CampaignForm,
  variants: readonly string[],
): CampaignSection[] {
  return form.sections.filter((s) => !s.variant || variants.includes(s.variant))
}

export function visibleQuestions(
  section: CampaignSection,
  answers: CampaignAnswers,
): CampaignQuestion[] {
  return section.questions.filter((q) => !q.when || q.when(answers))
}

/** 답이 있나 — 빈 글 · 빈 목록 · 금액 없는 보험료(「잘 몰라요」도 아닌)는 답이 아니다. */
export function isAnswered(q: CampaignQuestion, value: unknown): boolean {
  switch (q.kind) {
    case 'choice':
      return typeof value === 'string' && q.options.some((o) => o.value === value)
    case 'multi':
      return Array.isArray(value) && value.some((v) => q.options.some((o) => o.value === v))
    case 'text':
      return typeof value === 'string' && value.trim().length > 0
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0
    case 'premium':
      return (
        isPremiumAnswer(value) && (value.unknown || (value.amount !== null && value.amount > 0))
      )
  }
}

export type CampaignProgress = {
  /** 답한 필수 문항 수 / 보이는 필수 문항 수. */
  answered: number
  required: number
  /** 필수를 다 채웠나 — 보내기 버튼이 이걸 본다. */
  complete: boolean
  /** 답이 있는 가장 뒤 구역(예: 「미소가 함께 든다면」). 아무 답도 없으면 null. */
  reached: string | null
  /** 아직 답하지 않은 필수 문항 키(보이는 순서). */
  missing: string[]
}

export function progressOf(
  form: CampaignForm,
  variants: readonly string[],
  answers: CampaignAnswers,
): CampaignProgress {
  let answered = 0
  let required = 0
  let reached: string | null = null
  const missing: string[] = []
  for (const section of visibleSections(form, variants)) {
    for (const q of visibleQuestions(section, answers)) {
      const has = isAnswered(q, answers[q.key])
      if (has) reached = section.title
      if (!q.required) continue
      required += 1
      if (has) answered += 1
      else missing.push(q.key)
    }
  }
  return { answered, required, complete: missing.length === 0, reached, missing }
}

const won = new Intl.NumberFormat('ko-KR')

/** 답을 사람이 읽는 말로 — 운영자 표 · CSV · 보낸 뒤 화면. 답이 없으면 빈 글. */
export function answerText(q: CampaignQuestion, value: unknown): string {
  if (!isAnswered(q, value)) return ''
  switch (q.kind) {
    case 'choice': {
      const o = q.options.find((x) => x.value === value)
      return o ? (o.summary ?? o.label) : ''
    }
    case 'multi':
      return q.options
        .filter((o) => (value as unknown[]).includes(o.value))
        .map((o) => o.summary ?? o.label)
        .join(', ')
    case 'text':
      return (value as string).trim()
    case 'number':
      return `${won.format(value as number)}${q.unit}`
    case 'premium': {
      const p = value as PremiumAnswer
      if (p.unknown || p.amount === null) return '잘 몰라요'
      return `${p.unit === 'month' ? '월' : '연'} ${won.format(p.amount)}원`
    }
  }
}

/** 모든 문항(구역 순서) — CSV 열 · 운영자 답 펼침이 쓴다. */
export function allQuestions(
  form: CampaignForm,
): Array<{ section: CampaignSection; question: CampaignQuestion }> {
  return form.sections.flatMap((section) =>
    section.questions.map((question) => ({ section, question })),
  )
}

/** 이 문서가 아는 키만 남긴다 — 저장 전에 거른다(옛 키 · 엉뚱한 값을 원장에 쌓지 않게). */
export function cleanAnswers(form: CampaignForm, answers: CampaignAnswers): CampaignAnswers {
  const out: CampaignAnswers = {}
  for (const { question } of allQuestions(form)) {
    const v = answers[question.key]
    if (v !== undefined && isAnswered(question, v)) out[question.key] = v
    else if (question.kind === 'premium' && isPremiumAnswer(v)) out[question.key] = v
  }
  return out
}

/** 문항이 든 구역 키 — 자동 저장이 「어디까지 왔나」로 싣는다. */
export function sectionOf(form: CampaignForm, questionKey: string): string | null {
  return form.sections.find((s) => s.questions.some((q) => q.key === questionKey))?.key ?? null
}
