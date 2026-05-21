import {
  isBlockSelection,
  normalizeSelection,
  selectionTouchesBlock,
  type BlockId,
  type DocumentSelection,
} from '@vetra/core'
import { areDocumentSelectionsEqual } from './selectionEquality'
import { useEditorSelector } from './useEditorSelector'

export interface BlockSelectionState {
  readonly selection: DocumentSelection
  readonly active: boolean
  readonly selected: boolean
}

export function useBlockSelection(blockId: BlockId): BlockSelectionState {
  return useEditorSelector((state) => {
    const selection = normalizeSelection(state.document, state.selection)

    return {
      selection,
      active: selectionTouchesBlock(selection, blockId),
      selected: isBlockSelection(selection) && selection.blockId === blockId,
    }
  }, areBlockSelectionStatesEqual)
}

function areBlockSelectionStatesEqual(
  previous: BlockSelectionState,
  next: BlockSelectionState,
): boolean {
  return (
    previous.active === next.active &&
    previous.selected === next.selected &&
    areDocumentSelectionsEqual(previous.selection, next.selection)
  )
}
