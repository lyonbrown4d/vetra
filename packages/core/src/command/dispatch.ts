import { err, ok, type Result } from '@vetra/core/result'
import type { Transaction } from '@vetra/core/transaction/types'
import { noneSelection } from '@vetra/core/selection/types'
import type { DocumentSelection } from '@vetra/core/selection/types'
import { getSelectedBlockIds, getSelectionReferencedBlockIds } from '@vetra/core/selection/helpers'
import type { BlockId, DocBlock, DocumentState } from '@vetra/core/document/types'
import {
  collectSubtreeIds,
  findParentId,
  getBlockChildren,
  isDescendantOf,
} from '@vetra/core/document/tree'
import type { EditorState } from '@vetra/core/state/types'
import type { CommandError } from '@vetra/core/command/errors'
import type {
  ConvertBlockTypeCommand,
  DeleteBlockCommand,
  DeleteBlocksCommand,
  DuplicateBlockCommand,
  DuplicateBlocksCommand,
  EditorCommand,
  InsertBlockAfterCommand,
  InsertBlockBeforeCommand,
  InsertBlockFragmentCommand,
  InsertBlockCommand,
  MergeBlockCommand,
  MoveBlockCommand,
  MoveBlocksCommand,
  SetSelectionCommand,
  SplitBlockCommand,
  UpdateBlockCommand,
} from '@vetra/core/command/types'

interface CommandStateChange {
  readonly state: EditorState
  readonly changedBlockIds: readonly BlockId[]
}

interface PreparedBlockDeletion {
  readonly affectedParentIds: readonly BlockId[]
  readonly removedIds: readonly BlockId[]
  readonly removedIdSet: ReadonlySet<BlockId>
}

interface PreparedFragmentReplacement {
  readonly removedIds: readonly BlockId[]
  readonly removedIdSet: ReadonlySet<BlockId>
  readonly parentChildrenWithoutReplacement: readonly BlockId[]
}

interface PreparedSiblingBlockRange {
  readonly parentId: BlockId
  readonly blockIds: readonly BlockId[]
  readonly parentChildren: readonly BlockId[]
  readonly firstIndex: number
  readonly lastIndex: number
}

export function createEditorState(document: DocumentState): EditorState {
  return {
    document,
    selection: noneSelection,
  }
}

export function dispatchCommand(
  state: EditorState,
  command: EditorCommand,
): Result<Transaction, CommandError> {
  const result = applyCommand(state, command)

  if (!result.ok) {
    return result
  }

  return ok({
    command,
    before: state,
    after: result.value.state,
    changedBlockIds: result.value.changedBlockIds,
  })
}

function applyCommand(
  state: EditorState,
  command: EditorCommand,
): Result<CommandStateChange, CommandError> {
  switch (command.type) {
    case 'insertBlock':
      return insertBlock(state, command)
    case 'insertBlockBefore':
      return insertBlockBefore(state, command)
    case 'insertBlockAfter':
      return insertBlockAfter(state, command)
    case 'insertBlockFragment':
      return insertBlockFragment(state, command)
    case 'deleteBlock':
      return deleteBlock(state, command)
    case 'deleteBlocks':
      return deleteBlocks(state, command)
    case 'updateBlock':
      return updateBlock(state, command)
    case 'moveBlock':
      return moveBlock(state, command)
    case 'moveBlocks':
      return moveBlocks(state, command)
    case 'duplicateBlock':
      return duplicateBlock(state, command)
    case 'duplicateBlocks':
      return duplicateBlocks(state, command)
    case 'convertBlockType':
      return convertBlockType(state, command)
    case 'splitBlock':
      return splitBlock(state, command)
    case 'mergeBlock':
      return mergeBlock(state, command)
    case 'setSelection':
      return setSelection(state, command)
  }
}

function insertBlock(
  state: EditorState,
  command: InsertBlockCommand,
): Result<CommandStateChange, CommandError> {
  const document = state.document

  const parentChildren = document.children[command.parentId]
  if (document.blocks[command.parentId] === undefined || parentChildren === undefined) {
    return err({
      code: 'invalidParent',
      message: `Parent block "${command.parentId}" does not exist.`,
    })
  }

  const insertIndexResult = resolveInsertIndex(parentChildren, command)
  if (!insertIndexResult.ok) {
    return insertIndexResult
  }

  return insertBlockAt(state, command.parentId, command.block, insertIndexResult.value)
}

function insertBlockBefore(
  state: EditorState,
  command: InsertBlockBeforeCommand,
): Result<CommandStateChange, CommandError> {
  return insertSiblingBlock(state, command.referenceBlockId, command.block, 'before')
}

function insertBlockAfter(
  state: EditorState,
  command: InsertBlockAfterCommand,
): Result<CommandStateChange, CommandError> {
  return insertSiblingBlock(state, command.referenceBlockId, command.block, 'after')
}

function insertBlockFragment(
  state: EditorState,
  command: InsertBlockFragmentCommand,
): Result<CommandStateChange, CommandError> {
  return insertPreparedFragment(
    state,
    command.parentId,
    command.index,
    command.rootBlockIds,
    command.blocks,
    command.children,
    'invalidBlockFragment',
    command.replaceBlockIds,
    command.selection,
  )
}

function insertSiblingBlock(
  state: EditorState,
  referenceBlockId: BlockId,
  block: DocBlock,
  placement: 'before' | 'after',
): Result<CommandStateChange, CommandError> {
  const siblingInsertion = resolveSiblingInsertion(state.document, referenceBlockId, placement)
  if (!siblingInsertion.ok) {
    return siblingInsertion
  }

  return insertBlockAt(state, siblingInsertion.value.parentId, block, siblingInsertion.value.index)
}

function insertBlockAt(
  state: EditorState,
  parentId: BlockId,
  block: DocBlock,
  index: number,
): Result<CommandStateChange, CommandError> {
  const document = state.document

  if (document.blocks[block.id] !== undefined) {
    return err({
      code: 'blockAlreadyExists',
      message: `Block "${block.id}" already exists.`,
    })
  }

  const parentChildren = document.children[parentId]
  if (document.blocks[parentId] === undefined || parentChildren === undefined) {
    return err({
      code: 'invalidParent',
      message: `Parent block "${parentId}" does not exist.`,
    })
  }

  if (index < 0 || index > parentChildren.length) {
    return err({
      code: 'invalidIndex',
      message: `Insert index ${String(index)} is outside the parent children range.`,
    })
  }

  const nextParentChildren = [...parentChildren]
  nextParentChildren.splice(index, 0, block.id)

  return ok({
    state: {
      ...state,
      document: {
        ...document,
        blocks: {
          ...document.blocks,
          [block.id]: block,
        },
        children: {
          ...document.children,
          [parentId]: nextParentChildren,
          [block.id]: [],
        },
        version: document.version + 1,
      },
    },
    changedBlockIds: [parentId, block.id],
  })
}

function resolveInsertIndex(
  parentChildren: readonly BlockId[],
  command: InsertBlockCommand,
): Result<number, CommandError> {
  if (command.index !== undefined) {
    if (command.index < 0 || command.index > parentChildren.length) {
      return err({
        code: 'invalidIndex',
        message: `Insert index ${String(command.index)} is outside the parent children range.`,
      })
    }

    return ok(command.index)
  }

  if (command.afterBlockId !== undefined) {
    const afterIndex = parentChildren.indexOf(command.afterBlockId)
    if (afterIndex === -1) {
      return err({
        code: 'blockNotFound',
        message: `Reference block "${command.afterBlockId}" is not a child of the parent block.`,
      })
    }

    return ok(afterIndex + 1)
  }

  if (command.beforeBlockId !== undefined) {
    const beforeIndex = parentChildren.indexOf(command.beforeBlockId)
    if (beforeIndex === -1) {
      return err({
        code: 'blockNotFound',
        message: `Reference block "${command.beforeBlockId}" is not a child of the parent block.`,
      })
    }

    return ok(beforeIndex)
  }

  return ok(parentChildren.length)
}

function resolveSiblingInsertion(
  document: DocumentState,
  referenceBlockId: BlockId,
  placement: 'before' | 'after',
): Result<{ readonly parentId: BlockId; readonly index: number }, CommandError> {
  if (document.blocks[referenceBlockId] === undefined) {
    return err({
      code: 'blockNotFound',
      message: `Reference block "${referenceBlockId}" does not exist.`,
    })
  }

  const parentId = findParentId(document, referenceBlockId)
  if (parentId === undefined) {
    return err({
      code: 'invalidParent',
      message: `Reference block "${referenceBlockId}" is not attached to a parent.`,
    })
  }

  const parentChildren = document.children[parentId]
  if (parentChildren === undefined) {
    return err({
      code: 'invalidParent',
      message: `Parent block "${parentId}" does not have a children entry.`,
    })
  }

  const referenceIndex = parentChildren.indexOf(referenceBlockId)
  if (referenceIndex === -1) {
    return err({
      code: 'invalidParent',
      message: `Reference block "${referenceBlockId}" is not a child of "${parentId}".`,
    })
  }

  return ok({
    parentId,
    index: placement === 'before' ? referenceIndex : referenceIndex + 1,
  })
}

function deleteBlock(
  state: EditorState,
  command: DeleteBlockCommand,
): Result<CommandStateChange, CommandError> {
  return deleteBlockIds(state, [command.blockId])
}

function deleteBlocks(
  state: EditorState,
  command: DeleteBlocksCommand,
): Result<CommandStateChange, CommandError> {
  return deleteBlockIds(state, command.blockIds)
}

function deleteBlockIds(
  state: EditorState,
  blockIds: readonly BlockId[],
): Result<CommandStateChange, CommandError> {
  const document = state.document
  const preparedDeletion = prepareBlockDeletion(document, blockIds)
  if (!preparedDeletion.ok) {
    return preparedDeletion
  }

  const { affectedParentIds, removedIds, removedIdSet } = preparedDeletion.value
  if (removedIds.length === 0) {
    return ok({
      state,
      changedBlockIds: [],
    })
  }

  const blocks = Object.fromEntries(
    Object.entries(document.blocks).filter(([blockId]) => !removedIdSet.has(blockId)),
  ) as Record<BlockId, DocBlock>
  const children = Object.fromEntries(
    Object.entries(document.children)
      .filter(([blockId]) => !removedIdSet.has(blockId))
      .map(([blockId, childIds]) => [
        blockId,
        childIds.filter((childId) => !removedIdSet.has(childId)),
      ]),
  ) as Record<BlockId, readonly BlockId[]>

  return ok({
    state: {
      ...state,
      document: {
        ...document,
        blocks,
        children,
        version: document.version + 1,
      },
      selection: selectionTouchesAny(document, state.selection, removedIdSet)
        ? noneSelection
        : state.selection,
    },
    changedBlockIds: [...affectedParentIds, ...removedIds],
  })
}

function prepareBlockDeletion(
  document: DocumentState,
  blockIds: readonly BlockId[],
): Result<PreparedBlockDeletion, CommandError> {
  const requestedBlockIds = dedupeBlockIds(blockIds)
  const requestedBlockIdSet = new Set(requestedBlockIds)

  for (const blockId of requestedBlockIds) {
    if (blockId === document.rootId) {
      return err({
        code: 'cannotDeleteRoot',
        message: 'The root block cannot be deleted.',
      })
    }

    if (document.blocks[blockId] === undefined) {
      return err({
        code: 'blockNotFound',
        message: `Block "${blockId}" does not exist.`,
      })
    }

    const parentId = findParentId(document, blockId)
    if (
      parentId === undefined ||
      document.blocks[parentId] === undefined ||
      document.children[parentId] === undefined
    ) {
      return err({
        code: 'invalidParent',
        message: `Block "${blockId}" is not attached to the document tree.`,
      })
    }
  }

  const deletionRootIds = requestedBlockIds.filter(
    (blockId) => !hasRequestedAncestor(document, blockId, requestedBlockIdSet),
  )
  const removedIds: BlockId[] = []
  const removedIdSet = new Set<BlockId>()

  for (const deletionRootId of deletionRootIds) {
    for (const removedId of collectSubtreeIds(document, deletionRootId)) {
      if (!removedIdSet.has(removedId)) {
        removedIdSet.add(removedId)
        removedIds.push(removedId)
      }
    }
  }

  const affectedParentIds: BlockId[] = []
  const affectedParentIdSet = new Set<BlockId>()
  for (const deletionRootId of deletionRootIds) {
    const parentId = findParentId(document, deletionRootId)
    if (
      parentId !== undefined &&
      !removedIdSet.has(parentId) &&
      !affectedParentIdSet.has(parentId)
    ) {
      affectedParentIdSet.add(parentId)
      affectedParentIds.push(parentId)
    }
  }

  return ok({
    affectedParentIds,
    removedIds,
    removedIdSet,
  })
}

function dedupeBlockIds(blockIds: readonly BlockId[]): readonly BlockId[] {
  const uniqueBlockIds: BlockId[] = []
  const seenBlockIds = new Set<BlockId>()

  for (const blockId of blockIds) {
    if (!seenBlockIds.has(blockId)) {
      seenBlockIds.add(blockId)
      uniqueBlockIds.push(blockId)
    }
  }

  return uniqueBlockIds
}

function hasRequestedAncestor(
  document: DocumentState,
  blockId: BlockId,
  requestedBlockIds: ReadonlySet<BlockId>,
): boolean {
  let parentId = findParentId(document, blockId)

  while (parentId !== undefined) {
    if (requestedBlockIds.has(parentId)) {
      return true
    }

    parentId = findParentId(document, parentId)
  }

  return false
}

function updateBlock(
  state: EditorState,
  command: UpdateBlockCommand,
): Result<CommandStateChange, CommandError> {
  const currentBlock = state.document.blocks[command.blockId]
  if (currentBlock === undefined) {
    return err({
      code: 'blockNotFound',
      message: `Block "${command.blockId}" does not exist.`,
    })
  }

  return ok({
    state: {
      ...state,
      document: {
        ...state.document,
        blocks: {
          ...state.document.blocks,
          [command.blockId]: {
            ...currentBlock,
            ...command.patch,
            id: currentBlock.id,
          },
        },
        version: state.document.version + 1,
      },
    },
    changedBlockIds: [command.blockId],
  })
}

function moveBlock(
  state: EditorState,
  command: MoveBlockCommand,
): Result<CommandStateChange, CommandError> {
  const document = state.document

  if (command.blockId === document.rootId) {
    return err({
      code: 'cannotMoveRoot',
      message: 'The root block cannot be moved.',
    })
  }

  if (document.blocks[command.blockId] === undefined) {
    return err({
      code: 'blockNotFound',
      message: `Block "${command.blockId}" does not exist.`,
    })
  }

  const currentParentId = findParentId(document, command.blockId)
  if (currentParentId === undefined) {
    return err({
      code: 'invalidParent',
      message: `Block "${command.blockId}" is not attached to the document tree.`,
    })
  }

  if (
    document.blocks[command.toParentId] === undefined ||
    document.children[command.toParentId] === undefined ||
    isDescendantOf(document, command.toParentId, command.blockId)
  ) {
    return err({
      code: 'invalidParent',
      message: `Target parent "${command.toParentId}" is not valid for block "${command.blockId}".`,
    })
  }

  const currentChildren = getBlockChildren(document, currentParentId).filter(
    (childId) => childId !== command.blockId,
  )
  const targetChildren =
    currentParentId === command.toParentId
      ? currentChildren
      : [...getBlockChildren(document, command.toParentId)]

  if (command.toIndex < 0 || command.toIndex > targetChildren.length) {
    return err({
      code: 'invalidIndex',
      message: `Move index ${String(command.toIndex)} is outside the target parent children range.`,
    })
  }

  const nextTargetChildren = [...targetChildren]
  nextTargetChildren.splice(command.toIndex, 0, command.blockId)

  return ok({
    state: {
      ...state,
      document: {
        ...document,
        children: {
          ...document.children,
          [currentParentId]: currentChildren,
          [command.toParentId]: nextTargetChildren,
        },
        version: document.version + 1,
      },
    },
    changedBlockIds:
      currentParentId === command.toParentId
        ? [command.blockId, currentParentId]
        : [command.blockId, currentParentId, command.toParentId],
  })
}

function moveBlocks(
  state: EditorState,
  command: MoveBlocksCommand,
): Result<CommandStateChange, CommandError> {
  const document = state.document
  const rangeResult = prepareMoveBlockRange(document, command.blockIds)
  if (!rangeResult.ok) {
    return rangeResult
  }

  const movingRange = rangeResult.value
  const targetChildren = document.children[command.toParentId]
  if (document.blocks[command.toParentId] === undefined || targetChildren === undefined) {
    return err({
      code: 'invalidParent',
      message: `Target parent "${command.toParentId}" does not exist.`,
    })
  }

  for (const blockId of movingRange.blockIds) {
    if (command.toParentId === blockId || isDescendantOf(document, command.toParentId, blockId)) {
      return err({
        code: 'invalidParent',
        message: `Target parent "${command.toParentId}" is inside moving block "${blockId}".`,
      })
    }
  }

  const movingBlockIdSet = new Set(movingRange.blockIds)
  const sourceChildren = movingRange.parentChildren.filter(
    (childId) => !movingBlockIdSet.has(childId),
  )
  const targetChildrenWithoutMoving =
    movingRange.parentId === command.toParentId
      ? sourceChildren
      : targetChildren.filter((childId) => !movingBlockIdSet.has(childId))

  if (command.toIndex < 0 || command.toIndex > targetChildrenWithoutMoving.length) {
    return err({
      code: 'invalidIndex',
      message: `Move index ${String(command.toIndex)} is outside the target parent children range.`,
    })
  }

  const nextTargetChildren = [...targetChildrenWithoutMoving]
  nextTargetChildren.splice(command.toIndex, 0, ...movingRange.blockIds)

  const nextDocument: DocumentState = {
    ...document,
    children: {
      ...document.children,
      [movingRange.parentId]: sourceChildren,
      [command.toParentId]: nextTargetChildren,
    },
    version: document.version + 1,
  }

  if (command.selection !== undefined) {
    const invalidBlockId = findMissingSelectionBlockId(nextDocument, command.selection)
    if (invalidBlockId !== undefined) {
      return err({
        code: 'invalidSelection',
        message: `Selection references missing block "${invalidBlockId}".`,
      })
    }
  }

  return ok({
    state: {
      ...state,
      document: nextDocument,
      selection: command.selection ?? state.selection,
    },
    changedBlockIds:
      movingRange.parentId === command.toParentId
        ? [...movingRange.blockIds, movingRange.parentId]
        : [...movingRange.blockIds, movingRange.parentId, command.toParentId],
  })
}

function duplicateBlock(
  state: EditorState,
  command: DuplicateBlockCommand,
): Result<CommandStateChange, CommandError> {
  const document = state.document

  if (command.blockId === document.rootId) {
    return err({
      code: 'cannotDuplicateRoot',
      message: 'The root block cannot be duplicated.',
    })
  }

  if (document.blocks[command.blockId] === undefined) {
    return err({
      code: 'blockNotFound',
      message: `Block "${command.blockId}" does not exist.`,
    })
  }

  const siblingInsertion = resolveSiblingInsertion(
    document,
    command.blockId,
    command.placement ?? 'after',
  )
  if (!siblingInsertion.ok) {
    return siblingInsertion
  }

  const hasIdMap = command.idMap !== undefined
  const hasBlock = command.block !== undefined
  if (hasIdMap === hasBlock) {
    return err({
      code: 'invalidDuplicateSubtree',
      message: 'Duplicate block requires exactly one of "idMap" or "block".',
    })
  }

  if (command.idMap !== undefined) {
    return duplicateBlockWithIdMap(state, command, command.idMap, siblingInsertion.value)
  }

  if (command.block !== undefined) {
    return duplicateLeafBlock(state, command, command.block, siblingInsertion.value)
  }

  return err({
    code: 'invalidDuplicateSubtree',
    message: 'Duplicate block did not include duplicate block data.',
  })
}

function duplicateBlocks(
  state: EditorState,
  command: DuplicateBlocksCommand,
): Result<CommandStateChange, CommandError> {
  const duplicateRange = prepareDuplicateBlockRange(state.document, command.blockIds)
  if (!duplicateRange.ok) {
    return duplicateRange
  }

  const fragmentResult = prepareDuplicateFragment(
    state.document,
    duplicateRange.value.blockIds,
    command.idMap,
  )
  if (!fragmentResult.ok) {
    return fragmentResult
  }

  return insertPreparedFragment(
    state,
    duplicateRange.value.parentId,
    command.placement === 'before'
      ? duplicateRange.value.firstIndex
      : duplicateRange.value.lastIndex + 1,
    fragmentResult.value.rootBlockIds,
    fragmentResult.value.blocks,
    fragmentResult.value.children,
    'invalidDuplicateSubtree',
    undefined,
    command.selection,
  )
}

function duplicateBlockWithIdMap(
  state: EditorState,
  command: DuplicateBlockCommand,
  idMap: Readonly<Record<BlockId, BlockId>>,
  siblingInsertion: { readonly parentId: BlockId; readonly index: number },
): Result<CommandStateChange, CommandError> {
  const document = state.document
  const sourceSubtreeIds = collectSubtreeIds(document, command.blockId)
  const duplicateIds = new Set<BlockId>()
  const duplicateBlocks: Record<BlockId, DocBlock> = {}
  const duplicateChildren: Record<BlockId, readonly BlockId[]> = {}

  for (const sourceBlockId of sourceSubtreeIds) {
    const duplicateBlockId = idMap[sourceBlockId]
    if (duplicateBlockId === undefined) {
      return err({
        code: 'invalidDuplicateSubtree',
        message: `Duplicate id mapping is missing source block "${sourceBlockId}".`,
      })
    }

    if (duplicateIds.has(duplicateBlockId)) {
      return err({
        code: 'invalidDuplicateSubtree',
        message: `Duplicate id "${duplicateBlockId}" is used more than once.`,
      })
    }

    if (document.blocks[duplicateBlockId] !== undefined) {
      return err({
        code: 'blockAlreadyExists',
        message: `Block "${duplicateBlockId}" already exists.`,
      })
    }

    const sourceBlock = document.blocks[sourceBlockId]
    if (sourceBlock === undefined) {
      return err({
        code: 'blockNotFound',
        message: `Source block "${sourceBlockId}" does not exist.`,
      })
    }

    duplicateIds.add(duplicateBlockId)
    duplicateBlocks[duplicateBlockId] = {
      ...sourceBlock,
      id: duplicateBlockId,
    }
  }

  for (const sourceBlockId of sourceSubtreeIds) {
    const duplicateBlockId = idMap[sourceBlockId]
    if (duplicateBlockId === undefined) {
      return err({
        code: 'invalidDuplicateSubtree',
        message: `Duplicate id mapping is missing source block "${sourceBlockId}".`,
      })
    }

    const nextChildIds: BlockId[] = []
    for (const sourceChildId of getBlockChildren(document, sourceBlockId)) {
      const duplicateChildId = idMap[sourceChildId]
      if (duplicateChildId === undefined || !duplicateIds.has(duplicateChildId)) {
        return err({
          code: 'invalidDuplicateSubtree',
          message: `Duplicate id mapping is missing child block "${sourceChildId}".`,
        })
      }

      nextChildIds.push(duplicateChildId)
    }

    duplicateChildren[duplicateBlockId] = nextChildIds
  }

  const duplicateRootId = idMap[command.blockId]
  if (duplicateRootId === undefined) {
    return err({
      code: 'invalidDuplicateSubtree',
      message: `Duplicate id mapping is missing root block "${command.blockId}".`,
    })
  }

  return insertPreparedSubtree(
    state,
    siblingInsertion.parentId,
    siblingInsertion.index,
    duplicateRootId,
    duplicateBlocks,
    duplicateChildren,
  )
}

function duplicateLeafBlock(
  state: EditorState,
  command: DuplicateBlockCommand,
  block: DocBlock,
  siblingInsertion: { readonly parentId: BlockId; readonly index: number },
): Result<CommandStateChange, CommandError> {
  if (getBlockChildren(state.document, command.blockId).length > 0) {
    return err({
      code: 'invalidDuplicateSubtree',
      message: `Block "${command.blockId}" has children and requires an id mapping.`,
    })
  }

  return insertBlockAt(state, siblingInsertion.parentId, block, siblingInsertion.index)
}

function prepareDuplicateBlockRange(
  document: DocumentState,
  blockIds: readonly BlockId[],
): Result<PreparedSiblingBlockRange, CommandError> {
  const requestedBlockIds = dedupeBlockIds(blockIds)
  if (requestedBlockIds.length === 0) {
    return err({
      code: 'invalidDuplicateSubtree',
      message: 'Duplicate blocks requires at least one source block id.',
    })
  }

  const requestedBlockIdSet = new Set(requestedBlockIds)
  for (const blockId of requestedBlockIds) {
    if (blockId === document.rootId) {
      return err({
        code: 'cannotDuplicateRoot',
        message: 'The root block cannot be duplicated.',
      })
    }

    if (document.blocks[blockId] === undefined) {
      return err({
        code: 'blockNotFound',
        message: `Block "${blockId}" does not exist.`,
      })
    }

    const parentId = findParentId(document, blockId)
    if (
      parentId === undefined ||
      document.blocks[parentId] === undefined ||
      document.children[parentId] === undefined
    ) {
      return err({
        code: 'invalidParent',
        message: `Block "${blockId}" is not attached to the document tree.`,
      })
    }
  }

  return prepareSiblingBlockRange(
    document,
    requestedBlockIds.filter(
      (blockId) => !hasRequestedAncestor(document, blockId, requestedBlockIdSet),
    ),
    true,
  )
}

function prepareMoveBlockRange(
  document: DocumentState,
  blockIds: readonly BlockId[],
): Result<PreparedSiblingBlockRange, CommandError> {
  const requestedBlockIds = dedupeBlockIds(blockIds)
  if (requestedBlockIds.length === 0) {
    return err({
      code: 'invalidIndex',
      message: 'Move blocks requires at least one source block id.',
    })
  }

  for (const blockId of requestedBlockIds) {
    if (blockId === document.rootId) {
      return err({
        code: 'cannotMoveRoot',
        message: 'The root block cannot be moved.',
      })
    }

    if (document.blocks[blockId] === undefined) {
      return err({
        code: 'blockNotFound',
        message: `Block "${blockId}" does not exist.`,
      })
    }

    const parentId = findParentId(document, blockId)
    if (
      parentId === undefined ||
      document.blocks[parentId] === undefined ||
      document.children[parentId] === undefined
    ) {
      return err({
        code: 'invalidParent',
        message: `Block "${blockId}" is not attached to the document tree.`,
      })
    }
  }

  return prepareSiblingBlockRange(document, requestedBlockIds, true)
}

function prepareSiblingBlockRange(
  document: DocumentState,
  blockIds: readonly BlockId[],
  requireContiguous: boolean,
): Result<PreparedSiblingBlockRange, CommandError> {
  const firstBlockId = blockIds[0]
  if (firstBlockId === undefined) {
    return err({
      code: 'invalidBlockRange',
      message: 'Block range requires at least one block id.',
    })
  }

  const parentId = findParentId(document, firstBlockId)
  if (parentId === undefined) {
    return err({
      code: 'invalidParent',
      message: `Block "${firstBlockId}" is not attached to the document tree.`,
    })
  }

  const parentChildren = document.children[parentId]
  if (parentChildren === undefined) {
    return err({
      code: 'invalidParent',
      message: `Parent block "${parentId}" does not have a children entry.`,
    })
  }

  const blockIndexById = new Map<BlockId, number>()
  for (const blockId of blockIds) {
    const blockParentId = findParentId(document, blockId)
    if (blockParentId !== parentId) {
      return err({
        code: 'invalidParent',
        message: 'Block range must contain sibling blocks with the same parent.',
      })
    }

    const index = parentChildren.indexOf(blockId)
    if (index === -1) {
      return err({
        code: 'invalidParent',
        message: `Block "${blockId}" is not a child of parent "${parentId}".`,
      })
    }

    blockIndexById.set(blockId, index)
  }

  const orderedBlockIds = [...blockIds].sort(
    (leftBlockId, rightBlockId) =>
      (blockIndexById.get(leftBlockId) ?? 0) - (blockIndexById.get(rightBlockId) ?? 0),
  )
  const firstIndex = blockIndexById.get(orderedBlockIds[0] ?? '')
  const lastIndex = blockIndexById.get(orderedBlockIds[orderedBlockIds.length - 1] ?? '')
  if (firstIndex === undefined || lastIndex === undefined) {
    return err({
      code: 'invalidIndex',
      message: 'Block range indexes could not be resolved.',
    })
  }

  if (requireContiguous) {
    for (let offset = 0; offset < orderedBlockIds.length; offset += 1) {
      if (parentChildren[firstIndex + offset] !== orderedBlockIds[offset]) {
        return err({
          code: 'invalidBlockRange',
          message: 'Block range command requires a contiguous sibling range.',
        })
      }
    }
  }

  return ok({
    parentId,
    blockIds: orderedBlockIds,
    parentChildren,
    firstIndex,
    lastIndex,
  })
}

function prepareDuplicateFragment(
  document: DocumentState,
  rootBlockIds: readonly BlockId[],
  idMap: Readonly<Record<BlockId, BlockId>>,
): Result<
  {
    readonly rootBlockIds: readonly BlockId[]
    readonly blocks: Readonly<Record<BlockId, DocBlock>>
    readonly children: Readonly<Record<BlockId, readonly BlockId[]>>
  },
  CommandError
> {
  const sourceBlockIds: BlockId[] = []
  const sourceBlockIdSet = new Set<BlockId>()
  for (const rootBlockId of rootBlockIds) {
    for (const sourceBlockId of collectSubtreeIds(document, rootBlockId)) {
      if (!sourceBlockIdSet.has(sourceBlockId)) {
        sourceBlockIdSet.add(sourceBlockId)
        sourceBlockIds.push(sourceBlockId)
      }
    }
  }

  const duplicateIds = new Set<BlockId>()
  const duplicateBlocks: Record<BlockId, DocBlock> = {}
  const duplicateChildren: Record<BlockId, readonly BlockId[]> = {}

  for (const sourceBlockId of sourceBlockIds) {
    const duplicateBlockId = idMap[sourceBlockId]
    if (duplicateBlockId === undefined) {
      return err({
        code: 'invalidDuplicateSubtree',
        message: `Duplicate id mapping is missing source block "${sourceBlockId}".`,
      })
    }

    if (duplicateIds.has(duplicateBlockId)) {
      return err({
        code: 'invalidDuplicateSubtree',
        message: `Duplicate id "${duplicateBlockId}" is used more than once.`,
      })
    }

    if (document.blocks[duplicateBlockId] !== undefined) {
      return err({
        code: 'blockAlreadyExists',
        message: `Block "${duplicateBlockId}" already exists.`,
      })
    }

    const sourceBlock = document.blocks[sourceBlockId]
    if (sourceBlock === undefined) {
      return err({
        code: 'blockNotFound',
        message: `Source block "${sourceBlockId}" does not exist.`,
      })
    }

    duplicateIds.add(duplicateBlockId)
    duplicateBlocks[duplicateBlockId] = {
      ...sourceBlock,
      id: duplicateBlockId,
    }
  }

  for (const sourceBlockId of sourceBlockIds) {
    const duplicateBlockId = idMap[sourceBlockId]
    if (duplicateBlockId === undefined) {
      return err({
        code: 'invalidDuplicateSubtree',
        message: `Duplicate id mapping is missing source block "${sourceBlockId}".`,
      })
    }

    const nextChildIds: BlockId[] = []
    for (const sourceChildId of getBlockChildren(document, sourceBlockId)) {
      const duplicateChildId = idMap[sourceChildId]
      if (duplicateChildId === undefined || !duplicateIds.has(duplicateChildId)) {
        return err({
          code: 'invalidDuplicateSubtree',
          message: `Duplicate id mapping is missing child block "${sourceChildId}".`,
        })
      }

      nextChildIds.push(duplicateChildId)
    }

    duplicateChildren[duplicateBlockId] = nextChildIds
  }

  const duplicateRootIds: BlockId[] = []
  for (const rootBlockId of rootBlockIds) {
    const duplicateRootId = idMap[rootBlockId]
    if (duplicateRootId === undefined) {
      return err({
        code: 'invalidDuplicateSubtree',
        message: `Duplicate id mapping is missing root block "${rootBlockId}".`,
      })
    }

    duplicateRootIds.push(duplicateRootId)
  }

  return ok({
    rootBlockIds: duplicateRootIds,
    blocks: duplicateBlocks,
    children: duplicateChildren,
  })
}

function insertPreparedSubtree(
  state: EditorState,
  parentId: BlockId,
  index: number,
  rootBlockId: BlockId,
  blocksToInsert: Readonly<Record<BlockId, DocBlock>>,
  childrenToInsert: Readonly<Record<BlockId, readonly BlockId[]>>,
): Result<CommandStateChange, CommandError> {
  return insertPreparedFragment(
    state,
    parentId,
    index,
    [rootBlockId],
    blocksToInsert,
    childrenToInsert,
    'invalidDuplicateSubtree',
    undefined,
    undefined,
  )
}

function insertPreparedFragment(
  state: EditorState,
  parentId: BlockId,
  index: number,
  rootBlockIds: readonly BlockId[],
  blocksToInsert: Readonly<Record<BlockId, DocBlock>>,
  childrenToInsert: Readonly<Record<BlockId, readonly BlockId[]>>,
  invalidFragmentCode: CommandError['code'],
  replaceBlockIds: readonly BlockId[] | undefined,
  selection: DocumentSelection | undefined,
): Result<CommandStateChange, CommandError> {
  const document = state.document
  const parentChildren = document.children[parentId]
  if (document.blocks[parentId] === undefined || parentChildren === undefined) {
    return err({
      code: 'invalidParent',
      message: `Parent block "${parentId}" does not exist.`,
    })
  }

  if (index < 0 || index > parentChildren.length) {
    return err({
      code: 'invalidIndex',
      message: `Insert index ${String(index)} is outside the parent children range.`,
    })
  }

  const insertedBlockIds = Object.keys(blocksToInsert)
  const hasReplacement = replaceBlockIds !== undefined && replaceBlockIds.length > 0
  if (rootBlockIds.length === 0) {
    if (
      insertedBlockIds.length === 0 &&
      Object.keys(childrenToInsert).length === 0 &&
      !hasReplacement
    ) {
      if (selection !== undefined) {
        const invalidBlockId = findMissingSelectionBlockId(document, selection)
        if (invalidBlockId !== undefined) {
          return err({
            code: 'invalidSelection',
            message: `Selection references missing block "${invalidBlockId}".`,
          })
        }

        return ok({
          state: {
            ...state,
            selection,
          },
          changedBlockIds: [],
        })
      }

      return ok({
        state,
        changedBlockIds: [],
      })
    }

    return err({
      code: invalidFragmentCode,
      message: 'Block fragment requires at least one root block id when blocks are provided.',
    })
  }

  const replacementResult = prepareFragmentReplacement(
    document,
    parentId,
    index,
    parentChildren,
    replaceBlockIds,
    invalidFragmentCode,
  )
  if (!replacementResult.ok) {
    return replacementResult
  }
  const { removedIds, removedIdSet, parentChildrenWithoutReplacement } = replacementResult.value

  for (const blockId of insertedBlockIds) {
    const block = blocksToInsert[blockId]
    if (block?.id !== blockId) {
      return err({
        code: invalidFragmentCode,
        message: `Fragment block "${blockId}" does not match its map key.`,
      })
    }

    if (document.blocks[blockId] !== undefined) {
      return err({
        code: 'blockAlreadyExists',
        message: `Block "${blockId}" already exists.`,
      })
    }

    if (document.children[blockId] !== undefined) {
      return err({
        code: invalidFragmentCode,
        message: `Fragment block "${blockId}" would overwrite an existing children entry.`,
      })
    }

    const childIds = childrenToInsert[blockId]
    if (childIds === undefined) {
      return err({
        code: invalidFragmentCode,
        message: `Fragment block "${blockId}" does not have a children entry.`,
      })
    }

    for (const childId of childIds) {
      if (blocksToInsert[childId] === undefined) {
        return err({
          code: invalidFragmentCode,
          message: `Fragment child "${childId}" is not included in the fragment blocks.`,
        })
      }
    }
  }

  const childrenEntryIds = Object.keys(childrenToInsert)
  for (const childrenEntryId of childrenEntryIds) {
    if (blocksToInsert[childrenEntryId] === undefined) {
      return err({
        code: invalidFragmentCode,
        message: `Fragment children entry "${childrenEntryId}" does not reference a fragment block.`,
      })
    }
  }

  const rootBlockIdSet = new Set<BlockId>()
  for (const rootBlockId of rootBlockIds) {
    if (blocksToInsert[rootBlockId] === undefined) {
      return err({
        code: invalidFragmentCode,
        message: `Fragment root block "${rootBlockId}" is not included in the fragment blocks.`,
      })
    }

    if (rootBlockIdSet.has(rootBlockId)) {
      return err({
        code: invalidFragmentCode,
        message: `Fragment root block "${rootBlockId}" is used more than once.`,
      })
    }

    rootBlockIdSet.add(rootBlockId)
  }

  const inboundParentByChildId = new Map<BlockId, BlockId>()
  for (const blockId of insertedBlockIds) {
    const childIds = childrenToInsert[blockId] ?? []
    for (const childId of childIds) {
      if (rootBlockIdSet.has(childId)) {
        return err({
          code: invalidFragmentCode,
          message: `Fragment root block "${childId}" cannot also be a child block.`,
        })
      }

      if (inboundParentByChildId.has(childId)) {
        return err({
          code: invalidFragmentCode,
          message: `Fragment child block "${childId}" is referenced more than once.`,
        })
      }

      inboundParentByChildId.set(childId, blockId)
    }
  }

  for (const blockId of insertedBlockIds) {
    if (!rootBlockIdSet.has(blockId) && !inboundParentByChildId.has(blockId)) {
      return err({
        code: invalidFragmentCode,
        message: `Fragment block "${blockId}" is not reachable from fragment roots.`,
      })
    }
  }

  const reachableBlockIds = collectReachableFragmentBlockIds(rootBlockIds, childrenToInsert)
  if (reachableBlockIds.length !== insertedBlockIds.length) {
    return err({
      code: invalidFragmentCode,
      message: 'Block fragment contains orphan blocks that are not reachable from fragment roots.',
    })
  }

  const nextParentChildren = [...parentChildrenWithoutReplacement]
  nextParentChildren.splice(index, 0, ...rootBlockIds)
  const documentBlocks =
    removedIds.length === 0
      ? document.blocks
      : (Object.fromEntries(
          Object.entries(document.blocks).filter(([blockId]) => !removedIdSet.has(blockId)),
        ) as Record<BlockId, DocBlock>)
  const documentChildren =
    removedIds.length === 0
      ? document.children
      : (Object.fromEntries(
          Object.entries(document.children)
            .filter(([blockId]) => !removedIdSet.has(blockId))
            .map(([blockId, childIds]) => [
              blockId,
              childIds.filter((childId) => !removedIdSet.has(childId)),
            ]),
        ) as Record<BlockId, readonly BlockId[]>)
  const nextDocument: DocumentState = {
    ...document,
    blocks: {
      ...documentBlocks,
      ...blocksToInsert,
    },
    children: {
      ...documentChildren,
      ...childrenToInsert,
      [parentId]: nextParentChildren,
    },
    version: document.version + 1,
  }

  if (selection !== undefined) {
    const invalidBlockId = findMissingSelectionBlockId(nextDocument, selection)
    if (invalidBlockId !== undefined) {
      return err({
        code: 'invalidSelection',
        message: `Selection references missing block "${invalidBlockId}".`,
      })
    }
  }

  return ok({
    state: {
      ...state,
      document: nextDocument,
      selection:
        selection ??
        (selectionTouchesAny(document, state.selection, removedIdSet)
          ? noneSelection
          : state.selection),
    },
    changedBlockIds: [parentId, ...removedIds, ...reachableBlockIds],
  })
}

function prepareFragmentReplacement(
  document: DocumentState,
  parentId: BlockId,
  index: number,
  parentChildren: readonly BlockId[],
  replaceBlockIds: readonly BlockId[] | undefined,
  invalidFragmentCode: CommandError['code'],
): Result<PreparedFragmentReplacement, CommandError> {
  if (replaceBlockIds === undefined || replaceBlockIds.length === 0) {
    return ok({
      removedIds: [],
      removedIdSet: new Set<BlockId>(),
      parentChildrenWithoutReplacement: parentChildren,
    })
  }

  const seenReplaceIds = new Set<BlockId>()
  const replaceIndices: number[] = []

  for (const blockId of replaceBlockIds) {
    if (seenReplaceIds.has(blockId)) {
      return err({
        code: invalidFragmentCode,
        message: `Replacement block "${blockId}" is listed more than once.`,
      })
    }

    seenReplaceIds.add(blockId)

    if (blockId === document.rootId) {
      return err({
        code: 'cannotDeleteRoot',
        message: 'The root block cannot be replaced.',
      })
    }

    if (document.blocks[blockId] === undefined) {
      return err({
        code: 'blockNotFound',
        message: `Replacement block "${blockId}" does not exist.`,
      })
    }

    const currentParentId = findParentId(document, blockId)
    if (currentParentId !== parentId) {
      return err({
        code: 'invalidParent',
        message: `Replacement block "${blockId}" is not a child of "${parentId}".`,
      })
    }

    const replaceIndex = parentChildren.indexOf(blockId)
    if (replaceIndex === -1) {
      return err({
        code: 'invalidParent',
        message: `Replacement block "${blockId}" is not attached to "${parentId}".`,
      })
    }

    replaceIndices.push(replaceIndex)
  }

  for (const [offset, replaceIndex] of replaceIndices.entries()) {
    if (replaceIndex !== index + offset) {
      return err({
        code: invalidFragmentCode,
        message: 'Replacement blocks must be contiguous and start at the insertion index.',
      })
    }
  }

  const removedIds: BlockId[] = []
  const removedIdSet = new Set<BlockId>()

  for (const replaceBlockId of replaceBlockIds) {
    for (const removedId of collectSubtreeIds(document, replaceBlockId)) {
      if (!removedIdSet.has(removedId)) {
        removedIdSet.add(removedId)
        removedIds.push(removedId)
      }
    }
  }

  const parentChildrenWithoutReplacement = [...parentChildren]
  parentChildrenWithoutReplacement.splice(index, replaceBlockIds.length)

  return ok({
    removedIds,
    removedIdSet,
    parentChildrenWithoutReplacement,
  })
}

function collectReachableFragmentBlockIds(
  rootBlockIds: readonly BlockId[],
  childrenToInsert: Readonly<Record<BlockId, readonly BlockId[]>>,
): readonly BlockId[] {
  const reachableBlockIds: BlockId[] = []
  const visitedBlockIds = new Set<BlockId>()
  const pendingBlockIds = [...rootBlockIds].reverse()

  while (pendingBlockIds.length > 0) {
    const blockId = pendingBlockIds.pop()
    if (blockId === undefined || visitedBlockIds.has(blockId)) {
      continue
    }

    visitedBlockIds.add(blockId)
    reachableBlockIds.push(blockId)

    const childIds = childrenToInsert[blockId] ?? []
    for (let index = childIds.length - 1; index >= 0; index -= 1) {
      const childId = childIds[index]
      if (childId !== undefined) {
        pendingBlockIds.push(childId)
      }
    }
  }

  return reachableBlockIds
}

function convertBlockType(
  state: EditorState,
  command: ConvertBlockTypeCommand,
): Result<CommandStateChange, CommandError> {
  const document = state.document
  const currentBlock = document.blocks[command.blockId]
  if (currentBlock === undefined) {
    return err({
      code: 'blockNotFound',
      message: `Block "${command.blockId}" does not exist.`,
    })
  }

  if (command.blockId === document.rootId) {
    return err({
      code: 'cannotConvertRoot',
      message: 'The root block cannot be converted.',
    })
  }

  if (command.blockType.length === 0) {
    return err({
      code: 'invalidBlockType',
      message: 'Converted block type cannot be empty.',
    })
  }

  const nextBlock = applyConvertedBlockFields(currentBlock, command)

  return ok({
    state: {
      ...state,
      document: {
        ...document,
        blocks: {
          ...document.blocks,
          [command.blockId]: nextBlock,
        },
        version: document.version + 1,
      },
    },
    changedBlockIds: [command.blockId],
  })
}

function applyConvertedBlockFields(block: DocBlock, command: ConvertBlockTypeCommand): DocBlock {
  const nextBlock: DocBlock = {
    ...block,
    type: command.blockType,
    id: block.id,
  }

  if (Object.hasOwn(command, 'props')) {
    return applyConvertedContentField(
      command,
      command.props === undefined
        ? omitBlockProps(nextBlock)
        : { ...nextBlock, props: command.props },
    )
  }

  return applyConvertedContentField(command, nextBlock)
}

function applyConvertedContentField(command: ConvertBlockTypeCommand, block: DocBlock): DocBlock {
  const blockWithUpdatedAt =
    Object.hasOwn(command, 'updatedAt') && command.updatedAt !== undefined
      ? { ...block, updatedAt: command.updatedAt }
      : block

  if (!Object.hasOwn(command, 'content')) {
    return blockWithUpdatedAt
  }

  if (command.content === undefined) {
    return omitBlockContent(blockWithUpdatedAt)
  }

  return {
    ...blockWithUpdatedAt,
    content: command.content,
  }
}

function omitBlockProps(block: DocBlock): DocBlock {
  const { props, ...blockWithoutProps } = block
  void props

  return blockWithoutProps
}

function omitBlockContent(block: DocBlock): DocBlock {
  const { content, ...blockWithoutContent } = block
  void content

  return blockWithoutContent
}

function splitBlock(
  state: EditorState,
  command: SplitBlockCommand,
): Result<CommandStateChange, CommandError> {
  const document = state.document
  const currentBlock = document.blocks[command.blockId]
  if (currentBlock === undefined) {
    return err({
      code: 'blockNotFound',
      message: `Block "${command.blockId}" does not exist.`,
    })
  }

  if (command.blockId === document.rootId) {
    return err({
      code: 'invalidSplitTarget',
      message: 'The root block cannot be split.',
    })
  }

  if (document.blocks[command.afterBlock.id] !== undefined) {
    return err({
      code: 'blockAlreadyExists',
      message: `Block "${command.afterBlock.id}" already exists.`,
    })
  }

  const siblingInsertion = resolveSiblingInsertion(document, command.blockId, 'after')
  if (!siblingInsertion.ok) {
    return err({
      code: 'invalidSplitTarget',
      message: siblingInsertion.error.message,
    })
  }

  const parentChildren = document.children[siblingInsertion.value.parentId]
  if (parentChildren === undefined) {
    return err({
      code: 'invalidParent',
      message: `Parent block "${siblingInsertion.value.parentId}" does not have children.`,
    })
  }

  const nextParentChildren = [...parentChildren]
  nextParentChildren.splice(siblingInsertion.value.index, 0, command.afterBlock.id)

  let nextCurrentBlock = currentBlock
  if (Object.hasOwn(command, 'beforeContent')) {
    nextCurrentBlock =
      command.beforeContent === undefined
        ? omitBlockContent(currentBlock)
        : { ...currentBlock, content: command.beforeContent }
  }

  return ok({
    state: {
      ...state,
      document: {
        ...document,
        blocks: {
          ...document.blocks,
          [command.blockId]: nextCurrentBlock,
          [command.afterBlock.id]: command.afterBlock,
        },
        children: {
          ...document.children,
          [siblingInsertion.value.parentId]: nextParentChildren,
          [command.afterBlock.id]: [],
        },
        version: document.version + 1,
      },
    },
    changedBlockIds: [siblingInsertion.value.parentId, command.blockId, command.afterBlock.id],
  })
}

function mergeBlock(
  state: EditorState,
  command: MergeBlockCommand,
): Result<CommandStateChange, CommandError> {
  const document = state.document
  const targetBlock = document.blocks[command.targetBlockId]
  if (targetBlock === undefined) {
    return err({
      code: 'blockNotFound',
      message: `Target block "${command.targetBlockId}" does not exist.`,
    })
  }

  if (document.blocks[command.sourceBlockId] === undefined) {
    return err({
      code: 'blockNotFound',
      message: `Source block "${command.sourceBlockId}" does not exist.`,
    })
  }

  if (
    command.targetBlockId === document.rootId ||
    command.sourceBlockId === document.rootId ||
    command.targetBlockId === command.sourceBlockId
  ) {
    return err({
      code: 'invalidMergeTarget',
      message: 'Merge requires two non-root blocks.',
    })
  }

  if (getBlockChildren(document, command.sourceBlockId).length > 0) {
    return err({
      code: 'invalidMergeTarget',
      message: `Source block "${command.sourceBlockId}" has children and cannot be merged.`,
    })
  }

  const parentId = findParentId(document, command.sourceBlockId)
  if (parentId === undefined || findParentId(document, command.targetBlockId) !== parentId) {
    return err({
      code: 'invalidMergeTarget',
      message: 'Merge blocks must be siblings.',
    })
  }

  const parentChildren = document.children[parentId]
  if (parentChildren === undefined) {
    return err({
      code: 'invalidParent',
      message: `Parent block "${parentId}" does not have a children entry.`,
    })
  }

  const targetIndex = parentChildren.indexOf(command.targetBlockId)
  const sourceIndex = parentChildren.indexOf(command.sourceBlockId)
  if (targetIndex === -1 || sourceIndex === -1 || Math.abs(targetIndex - sourceIndex) !== 1) {
    return err({
      code: 'invalidMergeTarget',
      message: 'Merge blocks must be adjacent siblings.',
    })
  }

  const nextParentChildren = parentChildren.filter((childId) => childId !== command.sourceBlockId)
  let nextTargetBlock = targetBlock
  if (Object.hasOwn(command, 'mergedContent')) {
    nextTargetBlock =
      command.mergedContent === undefined
        ? omitBlockContent(targetBlock)
        : { ...targetBlock, content: command.mergedContent }
  }

  const blocks = Object.fromEntries(
    Object.entries(document.blocks).filter(([blockId]) => blockId !== command.sourceBlockId),
  ) as Record<BlockId, DocBlock>
  const children = Object.fromEntries(
    Object.entries(document.children).filter(([blockId]) => blockId !== command.sourceBlockId),
  ) as Record<BlockId, readonly BlockId[]>
  blocks[command.targetBlockId] = nextTargetBlock
  children[parentId] = nextParentChildren

  return ok({
    state: {
      ...state,
      document: {
        ...document,
        blocks,
        children,
        version: document.version + 1,
      },
      selection: selectionTouchesAny(document, state.selection, new Set([command.sourceBlockId]))
        ? noneSelection
        : state.selection,
    },
    changedBlockIds: [parentId, command.targetBlockId, command.sourceBlockId],
  })
}

function setSelection(
  state: EditorState,
  command: SetSelectionCommand,
): Result<CommandStateChange, CommandError> {
  const invalidBlockId = findMissingSelectionBlockId(state.document, command.selection)
  if (invalidBlockId !== undefined) {
    return err({
      code: 'invalidSelection',
      message: `Selection references missing block "${invalidBlockId}".`,
    })
  }

  return ok({
    state: {
      ...state,
      selection: command.selection,
    },
    changedBlockIds: [],
  })
}

function findMissingSelectionBlockId(
  document: DocumentState,
  selection: DocumentSelection,
): BlockId | undefined {
  switch (selection.type) {
    case 'none':
      return undefined
    case 'block':
    case 'text':
      return document.blocks[selection.blockId] === undefined ? selection.blockId : undefined
    case 'range-block':
      if (document.blocks[selection.anchorBlockId] === undefined) {
        return selection.anchorBlockId
      }

      return document.blocks[selection.focusBlockId] === undefined
        ? selection.focusBlockId
        : undefined
  }
}

function selectionTouchesAny(
  document: DocumentState,
  selection: DocumentSelection,
  blockIds: ReadonlySet<BlockId>,
): boolean {
  for (const blockId of getSelectionReferencedBlockIds(selection)) {
    if (blockIds.has(blockId)) {
      return true
    }
  }

  for (const blockId of getSelectedBlockIds(document, selection)) {
    if (blockIds.has(blockId)) {
      return true
    }
  }

  return false
}
