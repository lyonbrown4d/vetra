import { useCallback, useMemo } from 'react'
import {
  findParentId,
  getBlockChildren,
  getSelectedBlockIds,
  normalizeSelection,
  type BlockId,
  type CommandError,
  type DocBlock,
  type EditorState,
  type Result,
  type Transaction,
} from '@vetra/core'
import { useEditor } from '@vetra/react/context/EditorContext'
import { useActiveBlock } from '@vetra/react/hooks/useActiveBlock'
import { useEditorSelector } from '@vetra/react/hooks/useEditorSelector'
import {
  deleteSelectedBlocks,
  duplicateSelectedBlocks,
  moveSelectedBlocks,
  type DeleteSelectedBlockResult,
  type DuplicateSelectedBlockIdFactory,
  type DuplicateSelectedBlocksResult,
  type MoveSelectedBlocksResult,
} from '@vetra/react/selection/keyboardNavigation'
import {
  createConvertBlockTypeCommand,
  DEFAULT_BLOCK_TOOLBAR_TARGETS,
  getBlockToolbarItems,
  isConvertibleToolbarBlock,
  resolveActiveBlockToolbarTarget,
  type BlockToolbarItem,
  type BlockToolbarTarget,
} from '@vetra/react/toolbar/conversion'

export type BlockToolbarConvertResult = Result<Transaction, CommandError> | undefined
export type BlockToolbarActionId =
  | 'delete-selection'
  | 'duplicate-selection'
  | 'move-selection-up'
  | 'move-selection-down'
export type BlockToolbarActionResult =
  | DeleteSelectedBlockResult
  | DuplicateSelectedBlocksResult
  | MoveSelectedBlocksResult
  | undefined

export interface BlockToolbarActionItem {
  readonly id: BlockToolbarActionId
  readonly label: string
  readonly disabled: boolean
}

export interface UseBlockToolbarOptions {
  readonly targets?: readonly BlockToolbarTarget[]
  readonly getUpdatedAt?: () => number
  readonly duplicateBlockIdFactory?: DuplicateSelectedBlockIdFactory
}

export interface BlockToolbarState {
  readonly activeBlockId: BlockId | undefined
  readonly activeBlock: DocBlock | undefined
  readonly activeTarget: BlockToolbarTarget | undefined
  readonly canConvert: boolean
  readonly visible: boolean
  readonly selectedBlockIds: readonly BlockId[]
  readonly actionItems: readonly BlockToolbarActionItem[]
  readonly items: readonly BlockToolbarItem[]
  readonly runAction: (actionId: BlockToolbarActionId) => BlockToolbarActionResult
  readonly convertBlock: (target: BlockToolbarTarget) => BlockToolbarConvertResult
}

export function useBlockToolbar(options: UseBlockToolbarOptions = {}): BlockToolbarState {
  const editor = useEditor()
  const activeBlockState = useActiveBlock()
  const targets = options.targets ?? DEFAULT_BLOCK_TOOLBAR_TARGETS
  const getUpdatedAt = options.getUpdatedAt
  const duplicateBlockIdFactory = options.duplicateBlockIdFactory
  const selectionState = useEditorSelector(
    selectBlockToolbarSelectionState,
    areSelectionStatesEqual,
  )

  const activeTarget = useMemo(
    () => resolveActiveBlockToolbarTarget(activeBlockState.block),
    [activeBlockState.block],
  )
  const canConvert =
    activeBlockState.block === undefined ? false : isConvertibleToolbarBlock(activeBlockState.block)
  const visible =
    activeBlockState.blockId !== undefined || selectionState.selectedBlockIds.length > 0
  const items = useMemo(
    () => getBlockToolbarItems(activeBlockState.block, targets),
    [activeBlockState.block, targets],
  )
  const actionItems = useMemo(
    () =>
      [
        {
          id: 'delete-selection',
          label: 'Delete',
          disabled: !selectionState.canDelete,
        },
        {
          id: 'duplicate-selection',
          label: 'Duplicate',
          disabled: !selectionState.canDuplicate,
        },
        {
          id: 'move-selection-up',
          label: 'Up',
          disabled: !selectionState.canMovePrevious,
        },
        {
          id: 'move-selection-down',
          label: 'Down',
          disabled: !selectionState.canMoveNext,
        },
      ] as const satisfies readonly BlockToolbarActionItem[],
    [selectionState],
  )

  const runAction = useCallback(
    (actionId: BlockToolbarActionId): BlockToolbarActionResult => {
      switch (actionId) {
        case 'delete-selection':
          return deleteSelectedBlocks(editor)
        case 'duplicate-selection':
          return duplicateSelectedBlocks(
            editor,
            duplicateBlockIdFactory ?? createAvailableDuplicateBlockIdFactory(editor.getState()),
          )
        case 'move-selection-up':
          return moveSelectedBlocks(editor, 'previous')
        case 'move-selection-down':
          return moveSelectedBlocks(editor, 'next')
      }
    },
    [duplicateBlockIdFactory, editor],
  )

  const convertBlock = useCallback(
    (target: BlockToolbarTarget): BlockToolbarConvertResult => {
      const updatedAt = getUpdatedAt?.()
      const command = createConvertBlockTypeCommand(
        activeBlockState.block,
        target,
        updatedAt === undefined ? {} : { updatedAt },
      )

      return command === undefined ? undefined : editor.dispatch(command)
    },
    [activeBlockState.block, editor, getUpdatedAt],
  )

  return {
    activeBlockId: activeBlockState.blockId,
    activeBlock: activeBlockState.block,
    activeTarget,
    canConvert,
    visible,
    selectedBlockIds: selectionState.selectedBlockIds,
    actionItems,
    items,
    runAction,
    convertBlock,
  }
}

interface BlockToolbarSelectionState {
  readonly selectedBlockIds: readonly BlockId[]
  readonly canDelete: boolean
  readonly canDuplicate: boolean
  readonly canMovePrevious: boolean
  readonly canMoveNext: boolean
}

function selectBlockToolbarSelectionState(state: EditorState): BlockToolbarSelectionState {
  const selection = normalizeSelection(state.document, state.selection)
  const selectedBlockIds = getSelectedBlockIds(state.document, selection).filter(
    (blockId) => blockId !== state.document.rootId,
  )
  const selectedRange = resolveSelectedSiblingRange(state, selectedBlockIds)

  return {
    selectedBlockIds,
    canDelete: selectedBlockIds.length > 0,
    canDuplicate: selectedBlockIds.length > 0 && selectedRange !== undefined,
    canMovePrevious: selectedRange === undefined ? false : selectedRange.firstIndex > 0,
    canMoveNext:
      selectedRange === undefined
        ? false
        : selectedRange.lastIndex < selectedRange.parentChildren.length - 1,
  }
}

function resolveSelectedSiblingRange(
  state: EditorState,
  selectedBlockIds: readonly BlockId[],
):
  | {
      readonly parentChildren: readonly BlockId[]
      readonly firstIndex: number
      readonly lastIndex: number
    }
  | undefined {
  const firstBlockId = selectedBlockIds[0]
  const lastBlockId = selectedBlockIds[selectedBlockIds.length - 1]
  if (firstBlockId === undefined || lastBlockId === undefined) {
    return undefined
  }

  const parentId = findParentId(state.document, firstBlockId)
  if (parentId === undefined) {
    return undefined
  }

  const parentChildren = getBlockChildren(state.document, parentId)
  const firstIndex = parentChildren.indexOf(firstBlockId)
  const lastIndex = parentChildren.indexOf(lastBlockId)
  if (firstIndex === -1 || lastIndex === -1) {
    return undefined
  }

  for (let offset = 0; offset < selectedBlockIds.length; offset += 1) {
    if (parentChildren[firstIndex + offset] !== selectedBlockIds[offset]) {
      return undefined
    }
  }

  return {
    parentChildren,
    firstIndex,
    lastIndex,
  }
}

function areSelectionStatesEqual(
  previous: BlockToolbarSelectionState,
  next: BlockToolbarSelectionState,
): boolean {
  return (
    previous.canDelete === next.canDelete &&
    previous.canDuplicate === next.canDuplicate &&
    previous.canMovePrevious === next.canMovePrevious &&
    previous.canMoveNext === next.canMoveNext &&
    areBlockIdListsEqual(previous.selectedBlockIds, next.selectedBlockIds)
  )
}

function areBlockIdListsEqual(previous: readonly BlockId[], next: readonly BlockId[]): boolean {
  if (previous.length !== next.length) {
    return false
  }

  return previous.every((blockId, index) => blockId === next[index])
}

function createAvailableDuplicateBlockIdFactory(
  state: EditorState,
): DuplicateSelectedBlockIdFactory {
  const reservedBlockIds = new Set<BlockId>(Object.keys(state.document.blocks))

  return ({ sourceBlockId }) => {
    const baseBlockId = `${sourceBlockId}-copy`
    let candidateBlockId = baseBlockId
    let suffix = 2

    while (reservedBlockIds.has(candidateBlockId)) {
      candidateBlockId = `${baseBlockId}-${String(suffix)}`
      suffix += 1
    }

    reservedBlockIds.add(candidateBlockId)
    return candidateBlockId
  }
}
