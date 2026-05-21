import { err, ok, type Result } from '../result'
import type { Transaction } from '../transaction/types'
import { noneSelection } from '../selection/types'
import type { DocumentSelection } from '../selection/types'
import type { BlockId, DocBlock, DocumentState } from '../document/types'
import { collectSubtreeIds, findParentId, getBlockChildren, isDescendantOf } from '../document/tree'
import type { EditorState } from '../state/types'
import type { CommandError } from './errors'
import type {
  ConvertBlockTypeCommand,
  DeleteBlockCommand,
  DuplicateBlockCommand,
  EditorCommand,
  InsertBlockAfterCommand,
  InsertBlockBeforeCommand,
  InsertBlockCommand,
  MergeBlockCommand,
  MoveBlockCommand,
  SetSelectionCommand,
  SplitBlockCommand,
  UpdateBlockCommand,
} from './types'

interface CommandStateChange {
  readonly state: EditorState
  readonly changedBlockIds: readonly BlockId[]
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
    case 'deleteBlock':
      return deleteBlock(state, command)
    case 'updateBlock':
      return updateBlock(state, command)
    case 'moveBlock':
      return moveBlock(state, command)
    case 'duplicateBlock':
      return duplicateBlock(state, command)
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
  const document = state.document

  if (command.blockId === document.rootId) {
    return err({
      code: 'cannotDeleteRoot',
      message: 'The root block cannot be deleted.',
    })
  }

  if (document.blocks[command.blockId] === undefined) {
    return err({
      code: 'blockNotFound',
      message: `Block "${command.blockId}" does not exist.`,
    })
  }

  const parentId = findParentId(document, command.blockId)
  if (parentId === undefined) {
    return err({
      code: 'invalidParent',
      message: `Block "${command.blockId}" is not attached to the document tree.`,
    })
  }

  const removedIds = collectSubtreeIds(document, command.blockId)
  const removedIdSet = new Set(removedIds)
  const blocks = Object.fromEntries(
    Object.entries(document.blocks).filter(([blockId]) => !removedIdSet.has(blockId)),
  ) as Record<BlockId, DocBlock>
  const children = Object.fromEntries(
    Object.entries(document.children).filter(([blockId]) => !removedIdSet.has(blockId)),
  ) as Record<BlockId, readonly BlockId[]>

  children[parentId] = getBlockChildren(document, parentId).filter(
    (childId) => childId !== command.blockId,
  )

  return ok({
    state: {
      ...state,
      document: {
        ...document,
        blocks,
        children,
        version: document.version + 1,
      },
      selection: selectionTouchesAny(state.selection, removedIdSet)
        ? noneSelection
        : state.selection,
    },
    changedBlockIds: [parentId, ...removedIds],
  })
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

function insertPreparedSubtree(
  state: EditorState,
  parentId: BlockId,
  index: number,
  rootBlockId: BlockId,
  blocksToInsert: Readonly<Record<BlockId, DocBlock>>,
  childrenToInsert: Readonly<Record<BlockId, readonly BlockId[]>>,
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
  if (blocksToInsert[rootBlockId] === undefined) {
    return err({
      code: 'invalidDuplicateSubtree',
      message: `Duplicate root block "${rootBlockId}" is not included in the subtree.`,
    })
  }

  for (const blockId of insertedBlockIds) {
    const block = blocksToInsert[blockId]
    if (block?.id !== blockId) {
      return err({
        code: 'invalidDuplicateSubtree',
        message: `Duplicate block "${blockId}" does not match its map key.`,
      })
    }

    if (document.blocks[blockId] !== undefined) {
      return err({
        code: 'blockAlreadyExists',
        message: `Block "${blockId}" already exists.`,
      })
    }

    const childIds = childrenToInsert[blockId]
    if (childIds === undefined) {
      return err({
        code: 'invalidDuplicateSubtree',
        message: `Duplicate block "${blockId}" does not have a children entry.`,
      })
    }

    for (const childId of childIds) {
      if (blocksToInsert[childId] === undefined) {
        return err({
          code: 'invalidDuplicateSubtree',
          message: `Duplicate child "${childId}" is not included in the subtree.`,
        })
      }
    }
  }

  const nextParentChildren = [...parentChildren]
  nextParentChildren.splice(index, 0, rootBlockId)

  return ok({
    state: {
      ...state,
      document: {
        ...document,
        blocks: {
          ...document.blocks,
          ...blocksToInsert,
        },
        children: {
          ...document.children,
          ...childrenToInsert,
          [parentId]: nextParentChildren,
        },
        version: document.version + 1,
      },
    },
    changedBlockIds: [parentId, ...insertedBlockIds],
  })
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
      selection: selectionTouchesAny(state.selection, new Set([command.sourceBlockId]))
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
  selection: DocumentSelection,
  blockIds: ReadonlySet<BlockId>,
): boolean {
  switch (selection.type) {
    case 'none':
      return false
    case 'block':
    case 'text':
      return blockIds.has(selection.blockId)
    case 'range-block':
      return blockIds.has(selection.anchorBlockId) || blockIds.has(selection.focusBlockId)
  }
}
