import type { EditorState } from '@vetra/core'
import { useEditorSelector } from '@vetra/react/hooks/useEditorSelector'

const selectEditorState = (state: EditorState): EditorState => state

export function useEditorState(): EditorState {
  return useEditorSelector(selectEditorState)
}
