import type { BlockId, DocBlock } from '@vetra/core'
import { useEditorSelector } from './useEditorSelector'

export function useBlock(blockId: BlockId): DocBlock | undefined {
  return useEditorSelector((state) => state.document.blocks[blockId])
}
