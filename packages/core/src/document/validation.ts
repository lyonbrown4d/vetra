import { err, ok, type Result } from '../result'
import type { BlockId, DocumentState } from './types'

export type DocumentValidationErrorCode =
  | 'rootNotFound'
  | 'blockIdMismatch'
  | 'duplicateBlockId'
  | 'missingChildren'
  | 'unknownChildrenParent'
  | 'missingChildBlock'
  | 'duplicateChildReference'
  | 'rootHasParent'
  | 'cycleDetected'
  | 'orphanBlock'

export interface DocumentValidationError {
  readonly code: DocumentValidationErrorCode
  readonly message: string
  readonly blockId?: BlockId
  readonly parentId?: BlockId
  readonly childId?: BlockId
  readonly expectedBlockId?: BlockId
  readonly actualBlockId?: BlockId
  readonly path?: readonly BlockId[]
}

export interface DocumentValidationSummary {
  readonly reachableBlockIds: readonly BlockId[]
}

export type DocumentValidationResult = Result<
  DocumentValidationSummary,
  readonly DocumentValidationError[]
>

interface TraversalFrame {
  readonly blockId: BlockId
  readonly path: readonly BlockId[]
  nextChildIndex: number
}

export function validateDocument(document: DocumentState): DocumentValidationResult {
  const errors: DocumentValidationError[] = []
  const blockEntries = Object.entries(document.blocks)
  const blockIds = new Set<BlockId>()
  const mapKeyByBlockId = new Map<BlockId, BlockId>()

  for (const [blockId, block] of blockEntries) {
    blockIds.add(blockId)

    if (block.id !== blockId) {
      errors.push({
        code: 'blockIdMismatch',
        message: `Block map key "${blockId}" does not match block id "${block.id}".`,
        blockId,
        expectedBlockId: blockId,
        actualBlockId: block.id,
      })
    }

    const existingKey = mapKeyByBlockId.get(block.id)
    if (existingKey !== undefined && existingKey !== blockId) {
      errors.push({
        code: 'duplicateBlockId',
        message: `Block id "${block.id}" is used by both "${existingKey}" and "${blockId}".`,
        blockId,
        expectedBlockId: existingKey,
        actualBlockId: block.id,
      })
    } else {
      mapKeyByBlockId.set(block.id, blockId)
    }
  }

  if (!blockIds.has(document.rootId)) {
    errors.push({
      code: 'rootNotFound',
      message: `Root block "${document.rootId}" does not exist.`,
      blockId: document.rootId,
    })
  }

  for (const blockId of blockIds) {
    if (document.children[blockId] === undefined) {
      errors.push({
        code: 'missingChildren',
        message: `Block "${blockId}" does not have a children array.`,
        blockId,
      })
    }
  }

  const inboundParentByChildId = new Map<BlockId, BlockId>()
  const childReferenceKeys = new Set<string>()

  for (const [parentId, childIds] of Object.entries(document.children)) {
    if (!blockIds.has(parentId)) {
      errors.push({
        code: 'unknownChildrenParent',
        message: `Children entry "${parentId}" does not reference an existing block.`,
        parentId,
      })
      continue
    }

    for (const childId of childIds) {
      if (!blockIds.has(childId)) {
        errors.push({
          code: 'missingChildBlock',
          message: `Parent "${parentId}" references missing child block "${childId}".`,
          parentId,
          childId,
        })
        continue
      }

      const childReferenceKey = `${parentId}\u0000${childId}`
      const existingParentId = inboundParentByChildId.get(childId)
      if (existingParentId !== undefined || childReferenceKeys.has(childReferenceKey)) {
        errors.push({
          code: 'duplicateChildReference',
          message: `Child block "${childId}" is referenced more than once.`,
          parentId,
          childId,
        })
      } else {
        inboundParentByChildId.set(childId, parentId)
        childReferenceKeys.add(childReferenceKey)
      }

      if (childId === document.rootId) {
        errors.push({
          code: 'rootHasParent',
          message: `Root block "${document.rootId}" cannot be a child of "${parentId}".`,
          parentId,
          childId,
        })
      }
    }
  }

  errors.push(...findCycleErrors(document, blockIds))

  const reachableBlockIds = collectReachableBlockIds(document, blockIds)
  const reachableBlockIdSet = new Set(reachableBlockIds)

  for (const blockId of blockIds) {
    if (blockId !== document.rootId && !reachableBlockIdSet.has(blockId)) {
      errors.push({
        code: 'orphanBlock',
        message: `Block "${blockId}" is not reachable from root "${document.rootId}".`,
        blockId,
      })
    }
  }

  if (errors.length > 0) {
    return err(errors)
  }

  return ok({ reachableBlockIds })
}

function collectReachableBlockIds(
  document: DocumentState,
  blockIds: ReadonlySet<BlockId>,
): readonly BlockId[] {
  if (!blockIds.has(document.rootId)) {
    return []
  }

  const reachableBlockIds: BlockId[] = []
  const visited = new Set<BlockId>()
  const pending: BlockId[] = [document.rootId]

  while (pending.length > 0) {
    const blockId = pending.pop()
    if (blockId === undefined || visited.has(blockId) || !blockIds.has(blockId)) {
      continue
    }

    visited.add(blockId)
    reachableBlockIds.push(blockId)

    const children = document.children[blockId] ?? []
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childId = children[index]
      if (childId !== undefined && blockIds.has(childId)) {
        pending.push(childId)
      }
    }
  }

  return reachableBlockIds
}

function findCycleErrors(
  document: DocumentState,
  blockIds: ReadonlySet<BlockId>,
): readonly DocumentValidationError[] {
  const errors: DocumentValidationError[] = []
  const visitState = new Map<BlockId, 'visiting' | 'visited'>()
  const reportedEdges = new Set<string>()

  for (const blockId of blockIds) {
    if (visitState.has(blockId)) {
      continue
    }

    findCyclesFromBlock(document, blockIds, blockId, visitState, reportedEdges, errors)
  }

  return errors
}

function findCyclesFromBlock(
  document: DocumentState,
  blockIds: ReadonlySet<BlockId>,
  startBlockId: BlockId,
  visitState: Map<BlockId, 'visiting' | 'visited'>,
  reportedEdges: Set<string>,
  errors: DocumentValidationError[],
): void {
  const stack: TraversalFrame[] = [
    {
      blockId: startBlockId,
      nextChildIndex: 0,
      path: [startBlockId],
    },
  ]
  visitState.set(startBlockId, 'visiting')

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]
    if (frame === undefined) {
      break
    }

    const children = document.children[frame.blockId] ?? []
    if (frame.nextChildIndex >= children.length) {
      visitState.set(frame.blockId, 'visited')
      stack.pop()
      continue
    }

    const childId = children[frame.nextChildIndex]
    frame.nextChildIndex += 1

    if (childId === undefined || !blockIds.has(childId)) {
      continue
    }

    const childVisitState = visitState.get(childId)
    if (childVisitState === 'visiting') {
      const edgeKey = `${frame.blockId}\u0000${childId}`
      if (!reportedEdges.has(edgeKey)) {
        reportedEdges.add(edgeKey)
        errors.push({
          code: 'cycleDetected',
          message: `Child "${childId}" creates a cycle under parent "${frame.blockId}".`,
          parentId: frame.blockId,
          childId,
          path: [...frame.path, childId],
        })
      }
      continue
    }

    if (childVisitState === 'visited') {
      continue
    }

    visitState.set(childId, 'visiting')
    stack.push({
      blockId: childId,
      nextChildIndex: 0,
      path: [...frame.path, childId],
    })
  }
}
