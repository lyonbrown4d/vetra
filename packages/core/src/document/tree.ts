import type { BlockId, DocumentState } from '@vetra/core/document/types'

export function getBlockChildren(document: DocumentState, blockId: BlockId): readonly BlockId[] {
  return document.children[blockId] ?? []
}

export function findParentId(document: DocumentState, blockId: BlockId): BlockId | undefined {
  for (const [parentId, children] of Object.entries(document.children)) {
    if (children.includes(blockId)) {
      return parentId
    }
  }

  return undefined
}

export function collectSubtreeIds(document: DocumentState, blockId: BlockId): readonly BlockId[] {
  const collected: BlockId[] = []
  const pending: BlockId[] = [blockId]

  while (pending.length > 0) {
    const nextId = pending.pop()
    if (nextId === undefined) {
      continue
    }

    collected.push(nextId)
    pending.push(...getBlockChildren(document, nextId))
  }

  return collected
}

export function isDescendantOf(
  document: DocumentState,
  possibleDescendantId: BlockId,
  possibleAncestorId: BlockId,
): boolean {
  let currentParentId = findParentId(document, possibleDescendantId)

  while (currentParentId !== undefined) {
    if (currentParentId === possibleAncestorId) {
      return true
    }

    currentParentId = findParentId(document, currentParentId)
  }

  return false
}
