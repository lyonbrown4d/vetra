import type { DocumentState } from '@vetra/core'
import { useEditorSelector } from './useEditorSelector'

const selectDocument = (state: { readonly document: DocumentState }): DocumentState =>
  state.document

export function useDocument(): DocumentState {
  return useEditorSelector(selectDocument)
}
