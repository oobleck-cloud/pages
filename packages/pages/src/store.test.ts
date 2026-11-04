import { describe, expect, it } from 'vitest'

import { blankDocument } from './campaign-document'
import { memoryStore } from './store'

describe('memoryStore', () => {
  it('저장한 초안을 발행하면 발행본이 되고 판이 오른다', async () => {
    const store = memoryStore()
    expect(await store.publish()).toMatchObject({ ok: false })
    const doc = blankDocument()
    await store.save(doc)
    expect(await store.publish()).toEqual({ ok: true, version: 1 })
    expect(await store.load()).toEqual({ ok: true, draft: doc, published: doc, version: 1 })
  })
})
