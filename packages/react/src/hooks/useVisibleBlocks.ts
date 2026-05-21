import type { BlockId, DocBlock } from '@vetra/core'
import { useEditorSelector } from '@vetra/react/hooks/useEditorSelector'

export interface UseVisibleBlocksOptions {
  readonly parentId?: BlockId
  readonly blockIds?: readonly BlockId[]
}

export function useVisibleBlocks(options: UseVisibleBlocksOptions = {}): readonly DocBlock[] {
  return useEditorSelector((state) => {
    const document = state.document
    const parentId = options.parentId ?? document.rootId
    const blockIds = options.blockIds ?? document.children[parentId] ?? []

    return blockIds.map((blockId) => document.blocks[blockId]).filter(isDocBlock)
  }, areDocBlockArraysEqual)
}

function isDocBlock(block: DocBlock | undefined): block is DocBlock {
  return block !== undefined
}

function areDocBlockArraysEqual(previous: readonly DocBlock[], next: readonly DocBlock[]): boolean {
  return (
    previous.length === next.length &&
    previous.every((previousBlock, index) => previousBlock === next[index])
  )
}
