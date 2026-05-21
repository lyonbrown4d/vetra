import type { EditorCommand } from '@vetra/core/command/types'
import type { EditorState } from '@vetra/core/state/types'

export interface Transaction {
  readonly command: EditorCommand
  readonly before: EditorState
  readonly after: EditorState
  readonly changedBlockIds: readonly string[]
}
