import type { BlockId, DocumentState } from '@vetra/core/document/types'
import { findParentId, getBlockChildren } from '@vetra/core/document/tree'
import {
  noneSelection,
  type BlockSelection,
  type DocumentSelection,
  type NoneSelection,
  type RangeBlockSelection,
  type TextSelection,
} from '@vetra/core/selection/types'

export type BlockSelectionNavigationDirection = 'previous' | 'next'

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

export function getSiblingRangeBlockIds(
  document: DocumentState,
  anchorBlockId: BlockId,
  focusBlockId: BlockId,
): readonly BlockId[] {
  if (document.blocks[anchorBlockId] === undefined || document.blocks[focusBlockId] === undefined) {
    return []
  }

  const anchorParentId = findParentId(document, anchorBlockId)
  const focusParentId = findParentId(document, focusBlockId)
  if (anchorParentId === undefined || anchorParentId !== focusParentId) {
    return []
  }

  const siblings = getBlockChildren(document, anchorParentId)
  const anchorIndex = siblings.indexOf(anchorBlockId)
  const focusIndex = siblings.indexOf(focusBlockId)
  if (anchorIndex === -1 || focusIndex === -1) {
    return []
  }

  const startIndex = Math.min(anchorIndex, focusIndex)
  const endIndex = Math.max(anchorIndex, focusIndex)

  return siblings.slice(startIndex, endIndex + 1)
}

export function getSelectedBlockIds(
  document: DocumentState,
  selection: DocumentSelection,
): readonly BlockId[] {
  switch (selection.type) {
    case 'none':
    case 'text':
      return []
    case 'block':
      return document.blocks[selection.blockId] === undefined ? [] : [selection.blockId]
    case 'range-block':
      return getSiblingRangeBlockIds(document, selection.anchorBlockId, selection.focusBlockId)
  }
}

export function isBlockSelected(
  document: DocumentState,
  selection: DocumentSelection,
  blockId: BlockId,
): boolean {
  return getSelectedBlockIds(document, selection).includes(blockId)
}

export function selectionTouchesBlock(selection: DocumentSelection, blockId: BlockId): boolean {
  return getSelectionReferencedBlockIds(selection).includes(blockId)
}

export function getSelectionFocusBlockId(selection: DocumentSelection): BlockId | undefined {
  switch (selection.type) {
    case 'none':
      return undefined
    case 'block':
    case 'text':
      return selection.blockId
    case 'range-block':
      return selection.focusBlockId
  }
}

export function getAdjacentSiblingBlockId(
  document: DocumentState,
  blockId: BlockId,
  direction: BlockSelectionNavigationDirection,
): BlockId | undefined {
  if (document.blocks[blockId] === undefined) {
    return undefined
  }

  const parentId = findParentId(document, blockId)
  if (parentId === undefined) {
    return undefined
  }

  const siblings = getBlockChildren(document, parentId)
  const blockIndex = siblings.indexOf(blockId)
  if (blockIndex === -1) {
    return undefined
  }

  const nextIndex = direction === 'previous' ? blockIndex - 1 : blockIndex + 1

  return siblings[nextIndex]
}

export function getAdjacentBlockSelection(
  document: DocumentState,
  selection: DocumentSelection,
  direction: BlockSelectionNavigationDirection,
): BlockSelection | undefined {
  if (!isBlockSelection(selection)) {
    return undefined
  }

  const blockId = getAdjacentSiblingBlockId(document, selection.blockId, direction)

  return blockId === undefined ? undefined : { type: 'block', blockId }
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
