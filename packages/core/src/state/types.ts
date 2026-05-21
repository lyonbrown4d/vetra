import type { DocumentState } from '@vetra/core/document/types'
import type { DocumentSelection } from '@vetra/core/selection/types'

export interface EditorState {
  readonly document: DocumentState
  readonly selection: DocumentSelection
}
