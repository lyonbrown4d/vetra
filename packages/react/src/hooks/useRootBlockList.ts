import type { BlockId, EditorState } from '@vetra/core'
import { useEditorSelector } from '@vetra/react/hooks/useEditorSelector'

export interface RootBlockListState {
  readonly rootId: BlockId
  readonly blockIds: readonly BlockId[]
}

const emptyBlockIds: readonly BlockId[] = []

export function useRootBlockList(): RootBlockListState {
  return useEditorSelector(selectRootBlockList, areRootBlockListStatesEqual)
}

function selectRootBlockList(state: EditorState): RootBlockListState {
  const rootId = state.document.rootId

  return {
    rootId,
    blockIds: state.document.children[rootId] ?? emptyBlockIds,
  }
}

function areRootBlockListStatesEqual(
  previous: RootBlockListState,
  next: RootBlockListState,
): boolean {
  return previous.rootId === next.rootId && areBlockIdListsEqual(previous.blockIds, next.blockIds)
}

function areBlockIdListsEqual(previous: readonly BlockId[], next: readonly BlockId[]): boolean {
  if (previous.length !== next.length) {
    return false
  }

  return previous.every((blockId, index) => blockId === next[index])
}
