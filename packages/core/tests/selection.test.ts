import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createEditorState,
  createTextInlineContent,
  dispatchCommand,
  getAdjacentBlockSelection,
  getAdjacentSiblingBlockId,
  getSelectedBlockIds,
  getSelectionFocusBlockId,
  getSelectionReferencedBlockIds,
  getSiblingRangeBlockIds,
  isBlockSelected,
  isBlockSelection,
  isNoneSelection,
  isRangeBlockSelection,
  isTextSelection,
  normalizeSelection,
  selectionTouchesBlock,
  type DocumentSelection,
  type DocumentState,
  type ParagraphBlock,
} from '@vetra/core'

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

  it('returns selected block ids for a single block selection', () => {
    const document = nestedDocument()
    const selection: DocumentSelection = { type: 'block', blockId: 'block-b' }

    expect(getSelectedBlockIds(document, selection)).toEqual(['block-b'])
    expect(isBlockSelected(document, selection, 'block-b')).toBe(true)
    expect(isBlockSelected(document, selection, 'block-a')).toBe(false)
    expect(
      getSelectedBlockIds(document, {
        type: 'text',
        blockId: 'block-b',
        anchor: { path: [], offset: 0 },
        focus: { path: [], offset: 1 },
      }),
    ).toEqual([])
    expect(getSelectedBlockIds(document, { type: 'block', blockId: 'missing' })).toEqual([])
  })

  it('expands range block selections over sibling block ids in document order', () => {
    const document = nestedDocument()
    const selection: DocumentSelection = {
      type: 'range-block',
      anchorBlockId: 'block-c',
      focusBlockId: 'block-a',
    }

    expect(getSiblingRangeBlockIds(document, 'block-a', 'block-c')).toEqual([
      'block-a',
      'block-b',
      'block-c',
    ])
    expect(getSelectedBlockIds(document, selection)).toEqual(['block-a', 'block-b', 'block-c'])
    expect(isBlockSelected(document, selection, 'block-b')).toBe(true)
    expect(isBlockSelected(document, selection, 'child-a')).toBe(false)
  })

  it('returns an empty selection range for mixed-parent range block selections', () => {
    const document = nestedDocument()
    const selection: DocumentSelection = {
      type: 'range-block',
      anchorBlockId: 'block-a',
      focusBlockId: 'child-a',
    }

    expect(getSiblingRangeBlockIds(document, 'block-a', 'child-a')).toEqual([])
    expect(getSelectedBlockIds(document, selection)).toEqual([])
    expect(isBlockSelected(document, selection, 'block-a')).toBe(false)
    expect(getSiblingRangeBlockIds(document, 'block-a', 'missing')).toEqual([])
  })

  it('returns the focus block id without exposing browser selection state', () => {
    expect(getSelectionFocusBlockId({ type: 'none' })).toBeUndefined()
    expect(getSelectionFocusBlockId({ type: 'block', blockId: 'block-a' })).toBe('block-a')
    expect(
      getSelectionFocusBlockId({
        type: 'text',
        blockId: 'block-b',
        anchor: { path: [], offset: 0 },
        focus: { path: [], offset: 1 },
      }),
    ).toBe('block-b')
    expect(
      getSelectionFocusBlockId({
        type: 'range-block',
        anchorBlockId: 'block-a',
        focusBlockId: 'block-b',
      }),
    ).toBe('block-b')
  })

  it('finds adjacent sibling blocks by parent child order and stable ids', () => {
    const document = nestedDocument()

    expect(getAdjacentSiblingBlockId(document, 'block-b', 'previous')).toBe('block-a')
    expect(getAdjacentSiblingBlockId(document, 'block-b', 'next')).toBe('block-c')
    expect(getAdjacentSiblingBlockId(document, 'block-a', 'previous')).toBeUndefined()
    expect(getAdjacentSiblingBlockId(document, 'block-c', 'next')).toBeUndefined()
    expect(getAdjacentSiblingBlockId(document, 'child-a', 'next')).toBeUndefined()
    expect(getAdjacentSiblingBlockId(document, 'missing', 'next')).toBeUndefined()
  })

  it('creates adjacent block selections only from block selection', () => {
    const document = nestedDocument()

    expect(
      getAdjacentBlockSelection(document, { type: 'block', blockId: 'block-b' }, 'previous'),
    ).toEqual({ type: 'block', blockId: 'block-a' })
    expect(
      getAdjacentBlockSelection(
        document,
        {
          type: 'text',
          blockId: 'block-b',
          anchor: { path: [], offset: 0 },
          focus: { path: [], offset: 0 },
        },
        'next',
      ),
    ).toBeUndefined()
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

function nestedDocument(): DocumentState {
  return {
    id: 'doc',
    version: 1,
    rootId: 'root',
    blocks: {
      root: { id: 'root', type: 'root' },
      'block-a': paragraph('block-a', 'A'),
      'block-b': paragraph('block-b', 'B'),
      'block-c': paragraph('block-c', 'C'),
      'child-a': paragraph('child-a', 'Child'),
    },
    children: {
      root: ['block-a', 'block-b', 'block-c'],
      'block-a': ['child-a'],
      'block-b': [],
      'block-c': [],
      'child-a': [],
    },
  }
}

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
