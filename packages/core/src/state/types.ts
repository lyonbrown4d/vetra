import type { DocumentState } from '../document/types'
import type { DocumentSelection } from '../selection/types'

export interface EditorState {
  readonly document: DocumentState
  readonly selection: DocumentSelection
}
