import { useMemo } from 'react'
import {
  isBlockSelection,
  normalizeSelection,
  selectionTouchesBlock,
  type BlockId,
} from '@vetra/core'
import { useEditorSelector } from './useEditorSelector'
import { useSelectBlock, type SelectBlockHandler } from './useSelectBlock'

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
      active: selectionTouchesBlock(selection, blockId),
      selected: isBlockSelection(selection) && selection.blockId === blockId,
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
