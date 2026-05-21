import type { EditorCommand } from '../command/types'
import type { EditorState } from '../state/types'

export interface Transaction {
  readonly command: EditorCommand
  readonly before: EditorState
  readonly after: EditorState
  readonly changedBlockIds: readonly string[]
}
