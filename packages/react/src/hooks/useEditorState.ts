import type { EditorState } from '@vetra/core'
import { useEditorSelector } from './useEditorSelector'

const selectEditorState = (state: EditorState): EditorState => state

export function useEditorState(): EditorState {
  return useEditorSelector(selectEditorState)
}
