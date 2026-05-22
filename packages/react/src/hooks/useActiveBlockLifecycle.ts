import { useMemo } from 'react'
import {
  isBlockSelected,
  isBlockSelection,
  isTextSelection,
  normalizeSelection,
  type BlockId,
} from '@vetra/core'
import { useEditorSelector } from '@vetra/react/hooks/useEditorSelector'
import { useSelectBlock, type SelectBlockHandler } from '@vetra/react/hooks/useSelectBlock'

export interface ActiveBlockLifecycleState {
  readonly active: boolean
  readonly selected: boolean
  readonly selectBlock: SelectBlockHandler
}

interface ActiveBlockFlags {
  readonly active: boolean
  readonly selected: boolean
}

export function useActiveBlockLifecycle(blockId: BlockId): ActiveBlockLifecycleState {
  const flags = useEditorSelector((state) => {
    const selection = normalizeSelection(state.document, state.selection)

    return {
      active:
        (isBlockSelection(selection) && selection.blockId === blockId) ||
        (isTextSelection(selection) && selection.blockId === blockId),
      selected: isBlockSelected(state.document, selection, blockId),
    }
  }, areActiveBlockFlagsEqual)
  const selectBlock = useSelectBlock(blockId)

  return useMemo(
    () => ({
      ...flags,
      selectBlock,
    }),
    [flags, selectBlock],
  )
}

function areActiveBlockFlagsEqual(previous: ActiveBlockFlags, next: ActiveBlockFlags): boolean {
  return previous.active === next.active && previous.selected === next.selected
}
