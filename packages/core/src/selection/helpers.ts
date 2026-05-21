import type { BlockId, DocumentState } from '../document/types'
import {
  noneSelection,
  type BlockSelection,
  type DocumentSelection,
  type NoneSelection,
  type RangeBlockSelection,
  type TextSelection,
} from './types'

export function isNoneSelection(selection: DocumentSelection): selection is NoneSelection {
  return selection.type === 'none'
}

export function isBlockSelection(selection: DocumentSelection): selection is BlockSelection {
  return selection.type === 'block'
}

export function isTextSelection(selection: DocumentSelection): selection is TextSelection {
  return selection.type === 'text'
}

export function isRangeBlockSelection(
  selection: DocumentSelection,
): selection is RangeBlockSelection {
  return selection.type === 'range-block'
}

export function getSelectionReferencedBlockIds(selection: DocumentSelection): readonly BlockId[] {
  switch (selection.type) {
    case 'none':
      return []
    case 'block':
    case 'text':
      return [selection.blockId]
    case 'range-block':
      return selection.anchorBlockId === selection.focusBlockId
        ? [selection.anchorBlockId]
        : [selection.anchorBlockId, selection.focusBlockId]
  }
}

export function selectionTouchesBlock(selection: DocumentSelection, blockId: BlockId): boolean {
  return getSelectionReferencedBlockIds(selection).includes(blockId)
}

export function normalizeSelection(
  document: DocumentState,
  selection: DocumentSelection,
): DocumentSelection {
  const blockIds = getSelectionReferencedBlockIds(selection)

  for (const blockId of blockIds) {
    if (document.blocks[blockId] === undefined) {
      return noneSelection
    }
  }

  return selection
}
