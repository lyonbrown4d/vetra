import {
  findParentId,
  getAdjacentBlockSelection,
  getAdjacentSiblingBlockId,
  getBlockChildren,
  getSelectionFocusBlockId,
  isBlockSelection,
  isRangeBlockSelection,
  normalizeSelection,
  type BlockId,
  type BlockSelectionNavigationDirection,
  type EditorRuntime,
} from '@vetra/core'

export interface DeleteSelectedBlockResult {
  readonly deletedBlockIds: readonly BlockId[]
  readonly nextBlockId: BlockId | undefined
}

export function moveBlockSelection(
  editor: EditorRuntime,
  direction: BlockSelectionNavigationDirection,
): BlockId | undefined {
  const state = editor.getState()
  const selection = normalizeSelection(state.document, state.selection)
  const nextSelection = getAdjacentBlockSelection(state.document, selection, direction)

  if (nextSelection === undefined) {
    return undefined
  }

  const result = editor.dispatch({
    type: 'setSelection',
    selection: nextSelection,
  })

  return result.ok ? nextSelection.blockId : undefined
}

export function collapseSelectionToBlock(editor: EditorRuntime): BlockId | undefined {
  const state = editor.getState()
  const selection = normalizeSelection(state.document, state.selection)
  const blockId = getSelectionFocusBlockId(selection)

  if (blockId === undefined) {
    return undefined
  }

  if (isBlockSelection(selection) && selection.blockId === blockId) {
    return blockId
  }

  const result = editor.dispatch({
    type: 'setSelection',
    selection: { type: 'block', blockId },
  })

  return result.ok ? blockId : undefined
}

export function selectAllTopLevelBlocks(editor: EditorRuntime): BlockId | undefined {
  const state = editor.getState()
  const topLevelBlockIds = getBlockChildren(state.document, state.document.rootId)
  const firstBlockId = topLevelBlockIds[0]

  if (firstBlockId === undefined) {
    return undefined
  }

  if (topLevelBlockIds.length === 1) {
    const result = editor.dispatch({
      type: 'setSelection',
      selection: { type: 'block', blockId: firstBlockId },
    })

    return result.ok ? firstBlockId : undefined
  }

  const lastBlockId = topLevelBlockIds[topLevelBlockIds.length - 1]
  if (lastBlockId === undefined) {
    return undefined
  }

  const result = editor.dispatch({
    type: 'setSelection',
    selection: {
      type: 'range-block',
      anchorBlockId: firstBlockId,
      focusBlockId: lastBlockId,
    },
  })

  return result.ok ? firstBlockId : undefined
}

export function deleteSelectedBlock(editor: EditorRuntime): DeleteSelectedBlockResult | undefined {
  return deleteSelectedBlocks(editor)
}

export function deleteSelectedBlocks(editor: EditorRuntime): DeleteSelectedBlockResult | undefined {
  const state = editor.getState()

  const selectedBlockIds = getSelectedSiblingBlockIds(editor)
  if (selectedBlockIds.length === 0) {
    return undefined
  }

  const firstSelectedBlockId = selectedBlockIds[0]
  const lastSelectedBlockId = selectedBlockIds[selectedBlockIds.length - 1]
  if (firstSelectedBlockId === undefined || lastSelectedBlockId === undefined) {
    return undefined
  }

  const nextBlockId =
    getAdjacentSiblingBlockId(state.document, lastSelectedBlockId, 'next') ??
    getAdjacentSiblingBlockId(state.document, firstSelectedBlockId, 'previous')

  for (const blockId of selectedBlockIds) {
    const deleteResult = editor.dispatch({
      type: 'deleteBlock',
      blockId,
    })

    if (!deleteResult.ok) {
      return undefined
    }
  }

  if (nextBlockId === undefined || editor.getState().document.blocks[nextBlockId] === undefined) {
    return {
      deletedBlockIds: selectedBlockIds,
      nextBlockId: undefined,
    }
  }

  const selectResult = editor.dispatch({
    type: 'setSelection',
    selection: { type: 'block', blockId: nextBlockId },
  })

  return {
    deletedBlockIds: selectedBlockIds,
    nextBlockId: selectResult.ok ? nextBlockId : undefined,
  }
}

export function undoEditorHistory(editor: EditorRuntime): boolean {
  if (!editor.canUndo()) {
    return false
  }

  const result = editor.undo()

  return result.ok
}

export function redoEditorHistory(editor: EditorRuntime): boolean {
  if (!editor.canRedo()) {
    return false
  }

  const result = editor.redo()

  return result.ok
}

function getSelectedSiblingBlockIds(editor: EditorRuntime): readonly BlockId[] {
  const state = editor.getState()
  const selection = normalizeSelection(state.document, state.selection)

  if (isBlockSelection(selection)) {
    return [selection.blockId]
  }

  if (!isRangeBlockSelection(selection)) {
    return []
  }

  const anchorParentId = findParentId(state.document, selection.anchorBlockId)
  const focusParentId = findParentId(state.document, selection.focusBlockId)
  if (anchorParentId === undefined || anchorParentId !== focusParentId) {
    return []
  }

  const siblings = getBlockChildren(state.document, anchorParentId)
  const anchorIndex = siblings.indexOf(selection.anchorBlockId)
  const focusIndex = siblings.indexOf(selection.focusBlockId)
  if (anchorIndex === -1 || focusIndex === -1) {
    return []
  }

  const fromIndex = Math.min(anchorIndex, focusIndex)
  const toIndex = Math.max(anchorIndex, focusIndex)

  return siblings.slice(fromIndex, toIndex + 1)
}
