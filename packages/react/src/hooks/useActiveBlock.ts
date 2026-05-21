import {
  getSelectionReferencedBlockIds,
  normalizeSelection,
  type BlockId,
  type DocBlock,
} from '@vetra/core'
import { useEditorSelector } from './useEditorSelector'

export interface ActiveBlockState {
  readonly blockId: BlockId | undefined
  readonly block: DocBlock | undefined
}

export function useActiveBlock(): ActiveBlockState {
  return useEditorSelector((state) => {
    const normalizedSelection = normalizeSelection(state.document, state.selection)
    const blockId = getSelectionReferencedBlockIds(normalizedSelection)[0]

    return {
      blockId,
      block: blockId === undefined ? undefined : state.document.blocks[blockId],
    }
  }, areActiveBlockStatesEqual)
}

function areActiveBlockStatesEqual(previous: ActiveBlockState, next: ActiveBlockState): boolean {
  return previous.blockId === next.blockId && previous.block === next.block
}
