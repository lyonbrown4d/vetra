import {
  isBlockSelected,
  isTextSelection,
  normalizeSelection,
  type BlockId,
  type DocumentSelection,
} from '@vetra/core'
import { areDocumentSelectionsEqual } from '@vetra/react/hooks/selectionEquality'
import { useEditorSelector } from '@vetra/react/hooks/useEditorSelector'

export interface BlockSelectionState {
  readonly selection: DocumentSelection
  readonly active: boolean
  readonly selected: boolean
}

export function useBlockSelection(blockId: BlockId): BlockSelectionState {
  return useEditorSelector((state) => {
    const selection = normalizeSelection(state.document, state.selection)
    const selected = isBlockSelected(state.document, selection, blockId)

    return {
      selection,
      active: selected || (isTextSelection(selection) && selection.blockId === blockId),
      selected,
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
