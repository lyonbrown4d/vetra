import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createEditorState,
  createTextInlineContent,
  dispatchCommand,
  type ParagraphBlock,
} from '../src'

function paragraph(id: string, text: string): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: createTextInlineContent(text),
  }
}

describe('core command dispatch', () => {
  it('inserts a block by stable block id', () => {
    const state = createEditorState(createDocument({ id: 'doc' }))
    const result = dispatchCommand(state, {
      type: 'insertBlock',
      parentId: 'root',
      block: paragraph('block-a', 'Hello'),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.after.document.children.root).toEqual(['block-a'])
    expect(result.value.after.document.blocks['block-a']?.id).toBe('block-a')
  })

  it('rejects duplicate block ids', () => {
    const document = createDocument({ id: 'doc', blocks: [paragraph('block-a', 'Hello')] })
    const result = dispatchCommand(createEditorState(document), {
      type: 'insertBlock',
      parentId: 'root',
      block: paragraph('block-a', 'Duplicate'),
    })

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'blockAlreadyExists' },
    })
  })

  it('deletes a subtree and clears selection that points into it', () => {
    const document = createDocument({ id: 'doc', blocks: [paragraph('block-a', 'Hello')] })
    const insertedChild = dispatchCommand(createEditorState(document), {
      type: 'insertBlock',
      parentId: 'block-a',
      block: paragraph('block-b', 'Child'),
    })
    expect(insertedChild.ok).toBe(true)
    if (!insertedChild.ok) {
      return
    }

    const selected = dispatchCommand(insertedChild.value.after, {
      type: 'setSelection',
      selection: { type: 'block', blockId: 'block-b' },
    })
    expect(selected.ok).toBe(true)
    if (!selected.ok) {
      return
    }

    const deleted = dispatchCommand(selected.value.after, {
      type: 'deleteBlock',
      blockId: 'block-a',
    })

    expect(deleted.ok).toBe(true)
    if (!deleted.ok) {
      return
    }

    expect(deleted.value.after.document.blocks['block-a']).toBeUndefined()
    expect(deleted.value.after.document.blocks['block-b']).toBeUndefined()
    expect(deleted.value.after.selection).toEqual({ type: 'none' })
  })

  it('moves a block without using array index as identity', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B'), paragraph('block-c', 'C')],
    })
    const result = dispatchCommand(createEditorState(document), {
      type: 'moveBlock',
      blockId: 'block-a',
      toParentId: 'root',
      toIndex: 2,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.after.document.children.root).toEqual(['block-b', 'block-c', 'block-a'])
  })

  it('rejects selection that references a missing block', () => {
    const state = createEditorState(createDocument({ id: 'doc' }))
    const result = dispatchCommand(state, {
      type: 'setSelection',
      selection: { type: 'block', blockId: 'missing' },
    })

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalidSelection' },
    })
  })
})
