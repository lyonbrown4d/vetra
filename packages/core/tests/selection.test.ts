import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createEditorState,
  createTextInlineContent,
  dispatchCommand,
  getSelectionReferencedBlockIds,
  isBlockSelection,
  isNoneSelection,
  isRangeBlockSelection,
  isTextSelection,
  normalizeSelection,
  selectionTouchesBlock,
  type DocumentSelection,
  type ParagraphBlock,
} from '../src'

function paragraph(id: string, text: string): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: createTextInlineContent(text),
  }
}

describe('selection helpers', () => {
  it('narrows each selection variant with predicates', () => {
    const selections: readonly DocumentSelection[] = [
      { type: 'none' },
      { type: 'block', blockId: 'block-a' },
      {
        type: 'text',
        blockId: 'block-a',
        anchor: { path: [], offset: 0 },
        focus: { path: [], offset: 1 },
      },
      { type: 'range-block', anchorBlockId: 'block-a', focusBlockId: 'block-b' },
    ]

    expect(selections.map(isNoneSelection)).toEqual([true, false, false, false])
    expect(selections.map(isBlockSelection)).toEqual([false, true, false, false])
    expect(selections.map(isTextSelection)).toEqual([false, false, true, false])
    expect(selections.map(isRangeBlockSelection)).toEqual([false, false, false, true])
  })

  it('returns referenced block ids without inventing browser selection state', () => {
    expect(getSelectionReferencedBlockIds({ type: 'none' })).toEqual([])
    expect(getSelectionReferencedBlockIds({ type: 'block', blockId: 'block-a' })).toEqual([
      'block-a',
    ])
    expect(
      getSelectionReferencedBlockIds({
        type: 'text',
        blockId: 'block-b',
        anchor: { path: [0], offset: 2 },
        focus: { path: [0], offset: 5 },
      }),
    ).toEqual(['block-b'])
    expect(
      getSelectionReferencedBlockIds({
        type: 'range-block',
        anchorBlockId: 'block-a',
        focusBlockId: 'block-b',
      }),
    ).toEqual(['block-a', 'block-b'])
    expect(
      getSelectionReferencedBlockIds({
        type: 'range-block',
        anchorBlockId: 'block-a',
        focusBlockId: 'block-a',
      }),
    ).toEqual(['block-a'])
  })

  it('detects whether a selection touches a block', () => {
    const selection: DocumentSelection = {
      type: 'range-block',
      anchorBlockId: 'block-a',
      focusBlockId: 'block-b',
    }

    expect(selectionTouchesBlock(selection, 'block-a')).toBe(true)
    expect(selectionTouchesBlock(selection, 'block-b')).toBe(true)
    expect(selectionTouchesBlock(selection, 'block-c')).toBe(false)
  })

  it('normalizes selections with missing block references to none', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B')],
    })
    const validSelection: DocumentSelection = { type: 'block', blockId: 'block-a' }

    expect(normalizeSelection(document, validSelection)).toBe(validSelection)
    expect(normalizeSelection(document, { type: 'block', blockId: 'missing' })).toEqual({
      type: 'none',
    })
    expect(
      normalizeSelection(document, {
        type: 'text',
        blockId: 'missing',
        anchor: { path: [], offset: 0 },
        focus: { path: [], offset: 0 },
      }),
    ).toEqual({ type: 'none' })
    expect(
      normalizeSelection(document, {
        type: 'range-block',
        anchorBlockId: 'block-a',
        focusBlockId: 'missing',
      }),
    ).toEqual({ type: 'none' })
  })
})

describe('selection command stability', () => {
  it('keeps text selection attached to the same block id after move', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B')],
    })
    const selection: DocumentSelection = {
      type: 'text',
      blockId: 'block-a',
      anchor: { path: [], offset: 0 },
      focus: { path: [], offset: 1 },
    }
    const selected = dispatchCommand(createEditorState(document), {
      type: 'setSelection',
      selection,
    })

    expect(selected.ok).toBe(true)
    if (!selected.ok) {
      return
    }

    const moved = dispatchCommand(selected.value.after, {
      type: 'moveBlock',
      blockId: 'block-a',
      toParentId: 'root',
      toIndex: 1,
    })

    expect(moved.ok).toBe(true)
    if (!moved.ok) {
      return
    }

    expect(moved.value.after.document.children.root).toEqual(['block-b', 'block-a'])
    expect(moved.value.after.selection).toEqual(selection)
  })

  it('clears a range-block selection when a referenced block is deleted', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B')],
    })
    const selected = dispatchCommand(createEditorState(document), {
      type: 'setSelection',
      selection: { type: 'range-block', anchorBlockId: 'block-a', focusBlockId: 'block-b' },
    })

    expect(selected.ok).toBe(true)
    if (!selected.ok) {
      return
    }

    const deleted = dispatchCommand(selected.value.after, {
      type: 'deleteBlock',
      blockId: 'block-b',
    })

    expect(deleted.ok).toBe(true)
    if (!deleted.ok) {
      return
    }

    expect(deleted.value.after.selection).toEqual({ type: 'none' })
  })
})
