import {
  getAdjacentSiblingBlockId,
  getBlockChildren,
  getSelectedBlockIds,
  getSelectionFocusBlockId,
  getSiblingRangeBlockIds,
  isBlockSelection,
  isRangeBlockSelection,
  normalizeSelection,
  type BlockId,
  type BlockSelectionNavigationDirection,
  type DocumentSelection,
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

  if (isRangeBlockSelection(selection)) {
    return setBlockSelection(editor, selection.focusBlockId)
  }

  if (!isBlockSelection(selection)) {
    return undefined
  }

  const blockId = getAdjacentSiblingBlockId(state.document, selection.blockId, direction)

  return blockId === undefined ? undefined : setBlockSelection(editor, blockId)
}

export function extendBlockSelection(
  editor: EditorRuntime,
  direction: BlockSelectionNavigationDirection,
): BlockId | undefined {
  const state = editor.getState()
  const selection = normalizeSelection(state.document, state.selection)
  const focusBlockId = getSelectionFocusBlockId(selection)

  if (focusBlockId === undefined) {
    return undefined
  }

  const nextFocusBlockId = getAdjacentSiblingBlockId(state.document, focusBlockId, direction)
  if (nextFocusBlockId === undefined) {
    return undefined
  }

  const anchorBlockId = getSelectionAnchorBlockId(selection) ?? focusBlockId
  if (
    anchorBlockId !== nextFocusBlockId &&
    getSiblingRangeBlockIds(state.document, anchorBlockId, nextFocusBlockId).length === 0
  ) {
    return undefined
  }

  return setRangeOrBlockSelection(editor, anchorBlockId, nextFocusBlockId)
}

export function extendBlockSelectionToBlock(
  editor: EditorRuntime,
  blockId: BlockId,
): BlockId | undefined {
  const state = editor.getState()
  const selection = normalizeSelection(state.document, state.selection)
  const anchorBlockId = getSelectionAnchorBlockId(selection)

  if (anchorBlockId === undefined) {
    return setBlockSelection(editor, blockId)
  }

  if (
    anchorBlockId !== blockId &&
    getSiblingRangeBlockIds(state.document, anchorBlockId, blockId).length === 0
  ) {
    return undefined
  }

  return setRangeOrBlockSelection(editor, anchorBlockId, blockId)
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

  return setBlockSelection(editor, blockId)
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

  const deleteResult = editor.dispatch({
    type: 'deleteBlocks',
    blockIds: selectedBlockIds,
  })
  if (!deleteResult.ok) {
    return undefined
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

  return getSelectedBlockIds(state.document, selection)
}

function getSelectionAnchorBlockId(selection: DocumentSelection): BlockId | undefined {
  switch (selection.type) {
    case 'none':
      return undefined
    case 'block':
    case 'text':
      return selection.blockId
    case 'range-block':
      return selection.anchorBlockId
  }
}

function setBlockSelection(editor: EditorRuntime, blockId: BlockId): BlockId | undefined {
  const result = editor.dispatch({
    type: 'setSelection',
    selection: { type: 'block', blockId },
  })

  return result.ok ? blockId : undefined
}

function setRangeOrBlockSelection(
  editor: EditorRuntime,
  anchorBlockId: BlockId,
  focusBlockId: BlockId,
): BlockId | undefined {
  const selection: DocumentSelection =
    anchorBlockId === focusBlockId
      ? { type: 'block', blockId: focusBlockId }
      : { type: 'range-block', anchorBlockId, focusBlockId }
  const result = editor.dispatch({
    type: 'setSelection',
    selection,
  })

  return result.ok ? focusBlockId : undefined
}
