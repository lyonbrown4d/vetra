import type { BlockId, DocBlock } from '@vetra/core'
import { useEditorSelector } from '@vetra/react/hooks/useEditorSelector'

export function useBlock(blockId: BlockId): DocBlock | undefined {
  return useEditorSelector((state) => state.document.blocks[blockId])
}
