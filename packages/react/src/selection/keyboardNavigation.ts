import {
  findParentId,
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
  type DocBlock,
  type DuplicateBlocksCommand,
  type EditorRuntime,
  type InlineContent,
  type MoveBlocksCommand,
} from '@vetra/core'

export interface DeleteSelectedBlockResult {
  readonly deletedBlockIds: readonly BlockId[]
  readonly nextBlockId: BlockId | undefined
}

export interface DuplicateSelectedBlockIdFactoryContext {
  readonly sourceBlockId: BlockId
  readonly sourceRootBlockId: BlockId
  readonly index: number
  readonly block: DocBlock
  readonly text: string
  readonly isSelectedRoot: boolean
}

export type DuplicateSelectedBlockIdFactory = (
  context: DuplicateSelectedBlockIdFactoryContext,
) => BlockId

export interface DuplicateSelectedBlocksResult {
  readonly sourceBlockIds: readonly BlockId[]
  readonly duplicatedBlockIds: readonly BlockId[]
  readonly idMap: Readonly<Record<BlockId, BlockId>>
  readonly selection: DocumentSelection
  readonly focusBlockId: BlockId
}

export interface MoveSelectedBlocksResult {
  readonly movedBlockIds: readonly BlockId[]
  readonly direction: BlockSelectionNavigationDirection
  readonly toParentId: BlockId
  readonly toIndex: number
  readonly selection: DocumentSelection
  readonly focusBlockId: BlockId
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

export function duplicateSelectedBlocks(
  editor: EditorRuntime,
  idFactory: DuplicateSelectedBlockIdFactory,
): DuplicateSelectedBlocksResult | undefined {
  const state = editor.getState()
  const selection = normalizeSelection(state.document, state.selection)
  const selectedBlockIds = getSelectedBlockIds(state.document, selection)
  if (selectedBlockIds.length === 0) {
    return undefined
  }

  const idMap = createSelectedBlockIdMap(editor, selectedBlockIds, idFactory)
  if (Object.keys(idMap).length === 0) {
    return undefined
  }

  const duplicatedBlockIds = selectedBlockIds.flatMap((sourceBlockId) => {
    const duplicatedBlockId = idMap[sourceBlockId]

    return duplicatedBlockId === undefined ? [] : [duplicatedBlockId]
  })
  const nextSelection = createSelectionForBlockRange(duplicatedBlockIds)
  const focusBlockId = getSelectionFocusBlockId(nextSelection)
  if (focusBlockId === undefined) {
    return undefined
  }

  const duplicateResult = editor.dispatch({
    type: 'duplicateBlocks',
    blockIds: selectedBlockIds,
    placement: 'after',
    idMap,
    selection: nextSelection,
  } satisfies DuplicateBlocksCommand)
  if (!duplicateResult.ok) {
    return undefined
  }

  return {
    sourceBlockIds: selectedBlockIds,
    duplicatedBlockIds,
    idMap,
    selection: nextSelection,
    focusBlockId,
  }
}

export function moveSelectedBlocks(
  editor: EditorRuntime,
  direction: BlockSelectionNavigationDirection,
): MoveSelectedBlocksResult | undefined {
  const state = editor.getState()
  const selection = normalizeSelection(state.document, state.selection)
  const selectedBlockIds = getSelectedBlockIds(state.document, selection)
  if (selectedBlockIds.length === 0) {
    return undefined
  }

  const firstSelectedBlockId = selectedBlockIds[0]
  const lastSelectedBlockId = selectedBlockIds[selectedBlockIds.length - 1]
  if (firstSelectedBlockId === undefined || lastSelectedBlockId === undefined) {
    return undefined
  }

  const parentId = findParentId(state.document, firstSelectedBlockId)
  if (parentId === undefined) {
    return undefined
  }

  const parentChildren = getBlockChildren(state.document, parentId)
  const firstIndex = parentChildren.indexOf(firstSelectedBlockId)
  const lastIndex = parentChildren.indexOf(lastSelectedBlockId)
  if (firstIndex === -1 || lastIndex === -1) {
    return undefined
  }

  const toIndex = direction === 'previous' ? firstIndex - 1 : firstIndex + 1
  if (direction === 'previous' ? firstIndex === 0 : lastIndex === parentChildren.length - 1) {
    return undefined
  }

  const moveResult = editor.dispatch({
    type: 'moveBlocks',
    blockIds: selectedBlockIds,
    toParentId: parentId,
    toIndex,
    selection,
  } satisfies MoveBlocksCommand)
  if (!moveResult.ok) {
    return undefined
  }

  const focusBlockId = getSelectionFocusBlockId(selection)
  if (focusBlockId === undefined) {
    return undefined
  }

  return {
    movedBlockIds: selectedBlockIds,
    direction,
    toParentId: parentId,
    toIndex,
    selection,
    focusBlockId,
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

function createSelectedBlockIdMap(
  editor: EditorRuntime,
  selectedBlockIds: readonly BlockId[],
  idFactory: DuplicateSelectedBlockIdFactory,
): Readonly<Record<BlockId, BlockId>> {
  const document = editor.getState().document
  const idMap: Record<BlockId, BlockId> = {}
  let index = 0

  for (const selectedBlockId of selectedBlockIds) {
    for (const sourceBlockId of collectSubtreeIdsInDocumentOrder(editor, selectedBlockId)) {
      const block = document.blocks[sourceBlockId]
      if (block === undefined) {
        continue
      }

      idMap[sourceBlockId] = idFactory({
        sourceBlockId,
        sourceRootBlockId: selectedBlockId,
        index,
        block,
        text: readBlockText(block),
        isSelectedRoot: sourceBlockId === selectedBlockId,
      })
      index += 1
    }
  }

  return idMap
}

function collectSubtreeIdsInDocumentOrder(
  editor: EditorRuntime,
  blockId: BlockId,
): readonly BlockId[] {
  const document = editor.getState().document
  const blockIds: BlockId[] = [blockId]

  for (const childId of getBlockChildren(document, blockId)) {
    blockIds.push(...collectSubtreeIdsInDocumentOrder(editor, childId))
  }

  return blockIds
}

function readBlockText(block: DocBlock): string {
  return readContentText(block.content)
}

function readContentText(content: unknown): string {
  if (!isInlineContent(content)) {
    return ''
  }

  return content.children
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'inline-code':
          return node.text
        case 'link':
          return node.children.map(readContentNodeText).join('')
        case 'mention':
          return node.label
      }
    })
    .join('')
}

function readContentNodeText(node: InlineContent['children'][number]): string {
  switch (node.type) {
    case 'text':
    case 'inline-code':
      return node.text
    case 'link':
      return node.children.map(readContentNodeText).join('')
    case 'mention':
      return node.label
  }
}

function isInlineContent(value: unknown): value is InlineContent {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'type' in value &&
    value.type === 'inline-content' &&
    'children' in value &&
    Array.isArray(value.children)
  )
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

function createSelectionForBlockRange(blockIds: readonly BlockId[]): DocumentSelection {
  const firstBlockId = blockIds[0]
  const lastBlockId = blockIds[blockIds.length - 1]

  if (firstBlockId === undefined || lastBlockId === undefined) {
    return { type: 'none' }
  }

  return firstBlockId === lastBlockId
    ? { type: 'block', blockId: firstBlockId }
    : { type: 'range-block', anchorBlockId: firstBlockId, focusBlockId: lastBlockId }
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
