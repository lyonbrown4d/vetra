import type { BlockId, DocBlock, DocumentState } from '../document/types'

export type DocumentNormalizationChangeCode =
  | 'alignedBlockIdWithMapKey'
  | 'createdMissingRootBlock'
  | 'addedMissingChildrenArray'
  | 'removedUnknownChildrenParent'
  | 'removedMissingChildReference'
  | 'removedDuplicateChildReference'
  | 'removedRootChildReference'
  | 'removedCycleReference'
  | 'attachedOrphanBlock'

export interface DocumentNormalizationChange {
  readonly code: DocumentNormalizationChangeCode
  readonly message: string
  readonly blockId?: BlockId
  readonly parentId?: BlockId
  readonly childId?: BlockId
}

export interface NormalizeDocumentResult {
  readonly document: DocumentState
  readonly changes: readonly DocumentNormalizationChange[]
}

interface TraversalFrame {
  readonly blockId: BlockId
  nextChildIndex: number
}

export function normalizeDocument(document: DocumentState): NormalizeDocumentResult {
  const changes: DocumentNormalizationChange[] = []
  const blocks = normalizeBlocks(document, changes)
  const sourceChildren = createSourceChildren(document, blocks, changes)
  const children = createEmptyChildrenRecord(blocks)
  const visitedBlockIds = new Set<BlockId>()
  const visitingBlockIds = new Set<BlockId>()
  const assignedParentByChildId = new Map<BlockId, BlockId>()

  visitFromBlock(
    document.rootId,
    document.rootId,
    blocks,
    sourceChildren,
    children,
    visitedBlockIds,
    visitingBlockIds,
    assignedParentByChildId,
    changes,
  )

  for (const blockId of Object.keys(blocks)) {
    if (blockId === document.rootId || visitedBlockIds.has(blockId)) {
      continue
    }

    children[document.rootId]?.push(blockId)
    assignedParentByChildId.set(blockId, document.rootId)
    changes.push({
      code: 'attachedOrphanBlock',
      message: `Attached orphan block "${blockId}" to root "${document.rootId}".`,
      blockId,
      parentId: document.rootId,
    })

    visitFromBlock(
      blockId,
      document.rootId,
      blocks,
      sourceChildren,
      children,
      visitedBlockIds,
      visitingBlockIds,
      assignedParentByChildId,
      changes,
    )
  }

  return {
    document: {
      ...document,
      blocks,
      children,
    },
    changes,
  }
}

function normalizeBlocks(
  document: DocumentState,
  changes: DocumentNormalizationChange[],
): Record<BlockId, DocBlock> {
  const blocks: Record<BlockId, DocBlock> = {}

  for (const [blockId, block] of Object.entries(document.blocks)) {
    if (block.id === blockId) {
      blocks[blockId] = block
      continue
    }

    blocks[blockId] = {
      ...block,
      id: blockId,
    }
    changes.push({
      code: 'alignedBlockIdWithMapKey',
      message: `Aligned block "${blockId}" id with its map key.`,
      blockId,
    })
  }

  if (blocks[document.rootId] === undefined) {
    blocks[document.rootId] = {
      id: document.rootId,
      type: 'root',
    }
    changes.push({
      code: 'createdMissingRootBlock',
      message: `Created missing root block "${document.rootId}".`,
      blockId: document.rootId,
    })
  }

  return blocks
}

function createSourceChildren(
  document: DocumentState,
  blocks: Readonly<Record<BlockId, DocBlock>>,
  changes: DocumentNormalizationChange[],
): ReadonlyMap<BlockId, readonly BlockId[]> {
  const sourceChildren = new Map<BlockId, readonly BlockId[]>()

  for (const blockId of Object.keys(blocks)) {
    const childIds = document.children[blockId]
    if (childIds === undefined) {
      sourceChildren.set(blockId, [])
      changes.push({
        code: 'addedMissingChildrenArray',
        message: `Added missing children array for block "${blockId}".`,
        blockId,
      })
      continue
    }

    sourceChildren.set(blockId, childIds)
  }

  for (const parentId of Object.keys(document.children)) {
    if (blocks[parentId] === undefined) {
      changes.push({
        code: 'removedUnknownChildrenParent',
        message: `Removed children entry for missing parent "${parentId}".`,
        parentId,
      })
    }
  }

  return sourceChildren
}

function createEmptyChildrenRecord(
  blocks: Readonly<Record<BlockId, DocBlock>>,
): Record<BlockId, BlockId[]> {
  const children: Record<BlockId, BlockId[]> = {}

  for (const blockId of Object.keys(blocks)) {
    children[blockId] = []
  }

  return children
}

function visitFromBlock(
  startBlockId: BlockId,
  rootId: BlockId,
  blocks: Readonly<Record<BlockId, DocBlock>>,
  sourceChildren: ReadonlyMap<BlockId, readonly BlockId[]>,
  children: Record<BlockId, BlockId[]>,
  visitedBlockIds: Set<BlockId>,
  visitingBlockIds: Set<BlockId>,
  assignedParentByChildId: Map<BlockId, BlockId>,
  changes: DocumentNormalizationChange[],
): void {
  if (blocks[startBlockId] === undefined || visitedBlockIds.has(startBlockId)) {
    return
  }

  const stack: TraversalFrame[] = [{ blockId: startBlockId, nextChildIndex: 0 }]
  visitedBlockIds.add(startBlockId)
  visitingBlockIds.add(startBlockId)

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]
    if (frame === undefined) {
      break
    }

    const sourceChildIds = sourceChildren.get(frame.blockId) ?? []
    if (frame.nextChildIndex >= sourceChildIds.length) {
      visitingBlockIds.delete(frame.blockId)
      stack.pop()
      continue
    }

    const childId = sourceChildIds[frame.nextChildIndex]
    frame.nextChildIndex += 1

    if (childId === undefined) {
      continue
    }

    if (blocks[childId] === undefined) {
      changes.push({
        code: 'removedMissingChildReference',
        message: `Removed reference from "${frame.blockId}" to missing child "${childId}".`,
        parentId: frame.blockId,
        childId,
      })
      continue
    }

    if (childId === rootId) {
      changes.push({
        code: 'removedRootChildReference',
        message: `Removed reference from "${frame.blockId}" to root "${rootId}".`,
        parentId: frame.blockId,
        childId,
      })
      continue
    }

    if (visitingBlockIds.has(childId)) {
      changes.push({
        code: 'removedCycleReference',
        message: `Removed cycle reference from "${frame.blockId}" to "${childId}".`,
        parentId: frame.blockId,
        childId,
      })
      continue
    }

    if (assignedParentByChildId.has(childId) || visitedBlockIds.has(childId)) {
      changes.push({
        code: 'removedDuplicateChildReference',
        message: `Removed duplicate reference from "${frame.blockId}" to child "${childId}".`,
        parentId: frame.blockId,
        childId,
      })
      continue
    }

    children[frame.blockId]?.push(childId)
    assignedParentByChildId.set(childId, frame.blockId)
    visitedBlockIds.add(childId)
    visitingBlockIds.add(childId)
    stack.push({ blockId: childId, nextChildIndex: 0 })
  }
}
