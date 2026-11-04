/**
 * 저장소 포트 — 빌더가 문서를 읽고 · 저장하고 · 발행하는 자리. 빌더는 이 계약만 알고, 어디에 두는지(MVOS 서버 액션 · 다른 백엔드 ·
 * 메모리)는 호스트가 어댑터로 채운다. 한 저장소는 문서 하나에 묶인다(어느 문서인지는 어댑터가 쥔다).
 *
 * 그림 파일은 호스트마다 형식이 달라(브라우저 File · Blob · 버퍼) 형식 인자 F 로 둔다.
 */

import type { DocumentIssue } from './campaign-document'

export type StoreFailure = { ok: false; error: string }

/** 읽은 문서 — 초안(없으면 null) · 발행본(없으면 null) · 발행 판(아직 없으면 0). */
export type StoreSnapshot<D> = {
  ok: true
  draft: D | null
  published: D | null
  version: number
}

/** 올린 그림 — 공개 주소와 원래 크기. */
export type UploadedImage = { ok: true; src: string; natural: { width: number; height: number } }

export type DocumentStore<D, F = unknown> = {
  load(): Promise<StoreSnapshot<D> | StoreFailure>
  /** 초안 저장 — 발행본은 바뀌지 않는다. */
  save(doc: D): Promise<{ ok: true } | StoreFailure>
  /** 저장된 초안을 발행 — 막는 문제가 있으면 issues 로 돌려준다. */
  publish(): Promise<{ ok: true; version: number } | (StoreFailure & { issues?: DocumentIssue[] })>
  /** 지금 초안을 보이는 미리보기 주소 — 만들 수 없으면 null. 없으면 빌더가 단추를 숨긴다. */
  previewLink?: (() => Promise<string | null>) | undefined
  /** 그림 올리기 — 없으면 빌더가 그림 올리기를 막는다. */
  uploadImage?: ((file: F) => Promise<UploadedImage | StoreFailure>) | undefined
}

/**
 * 메모리 저장소 — 테스트 · 스토리 · 저장 없이 써 보기. 발행하면 지금 초안이 발행본이 된다.
 */
export function memoryStore<D>(
  start: { draft?: D | null; published?: D | null } = {},
): DocumentStore<D, unknown> & {
  readonly state: { draft: D | null; published: D | null; version: number }
} {
  const state: { draft: D | null; published: D | null; version: number } = {
    draft: start.draft ?? null,
    published: start.published ?? null,
    version: 0,
  }
  if (state.published) state.version = 1
  return {
    state,
    load: () => Promise.resolve({ ok: true, ...state }),
    save: (doc) => {
      state.draft = doc
      return Promise.resolve({ ok: true })
    },
    publish: () => {
      if (!state.draft) return Promise.resolve({ ok: false, error: '발행할 초안이 없습니다.' })
      state.published = state.draft
      state.version += 1
      return Promise.resolve({ ok: true, version: state.version })
    },
  }
}
